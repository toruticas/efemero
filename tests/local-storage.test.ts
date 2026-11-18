import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  mkdtemp,
  readdir,
  rm,
  symlink,
  writeFile,
  utimes,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { LocalStorage } from "@/server/storage/local";

describe("private local ciphertext storage", () => {
  let directory: string, storage: LocalStorage;
  const path = () => `artifacts/${randomUUID()}/payload.bin`;
  const body = (bytes: number) =>
    new Blob([new Uint8Array(bytes).fill(42)]).stream();
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "efemero-storage-"));
    storage = new LocalStorage(directory);
  });
  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });
  it("stores and streams exactly the ciphertext, never overwrites, and deletes idempotently", async () => {
    const name = path();
    await storage.write(name, body(64), 64);
    expect((await storage.inspect(name)).size).toBe(64);
    await expect(storage.write(name, body(32), 64)).rejects.toThrow();
    expect(
      new Uint8Array(
        await new Response(await storage.read(name)).arrayBuffer(),
      ),
    ).toEqual(new Uint8Array(64).fill(42));
    await storage.remove(name);
    await storage.remove(name);
    await expect(storage.read(name)).rejects.toThrow();
  });
  it("rejects traversal and symlink reads", async () => {
    await expect(storage.inspect("../secrets.json")).rejects.toThrow();
    const name = path();
    await storage.write(name, body(32), 32);
    await rm(join(directory, name));
    await symlink(join(directory, "outside"), join(directory, name));
    await expect(storage.inspect(name)).rejects.toThrow();
    await expect(storage.read(name)).rejects.toThrow();
  });
  it("aborts local delivery reads when their signal is cancelled", async () => {
    const name = path();
    await storage.write(name, body(1024 * 1024), 1024 * 1024);
    const controller = new AbortController();
    const stream = await storage.read(name, controller.signal);
    controller.abort();
    await expect(new Response(stream).arrayBuffer()).rejects.toMatchObject({
      name: "AbortError",
    });
    await expect(storage.read(name, controller.signal)).rejects.toMatchObject({
      name: "AbortError",
    });
  });
  it("enforces actual streamed bytes and removes incomplete uploads", async () => {
    const name = path();
    await expect(storage.write(name, body(65), 64)).rejects.toMatchObject({
      status: 413,
    });
    await expect(storage.inspect(name)).rejects.toThrow();
    expect(await readdir(join(directory, name, ".."))).toEqual([]);
  });
  it("does not expose an upload to commit until the stream is complete", async () => {
    const name = path();
    let controller!: ReadableStreamDefaultController<Uint8Array>;
    const pending = storage.write(
      name,
      new ReadableStream({
        start(c) {
          controller = c;
          c.enqueue(new Uint8Array(32));
        },
      }),
      64,
    );
    await expect(storage.inspect(name)).rejects.toThrow();
    controller.enqueue(new Uint8Array(32));
    controller.close();
    await pending;
    expect((await storage.inspect(name)).size).toBe(64);
  });
  it("pages the complete inventory without returning arbitrary host files", async () => {
    const paths = Array.from({ length: 51 }, path).sort();
    for (const name of paths) await storage.write(name, body(32), 32);
    const first = await storage.inventory();
    const second = await storage.inventory(first.cursor);
    expect(first.paths).toHaveLength(50);
    expect([...first.paths, ...second.paths]).toEqual(paths);
    expect(second.cursor).toBeUndefined();
  });
  it("removes stale private upload fragments after a simulated crash", async () => {
    const name = path();
    await storage.write(name, body(32), 32);
    const fragment = join(directory, name, "..", `.upload-${randomUUID()}`);
    await writeFile(fragment, new Uint8Array(32), { mode: 0o600 });
    const old = new Date(Date.now() - 120_000);
    await utimes(fragment, old, old);
    await storage.remove(name);
    expect((await storage.inventory()).paths).toEqual([]);
  });
});
