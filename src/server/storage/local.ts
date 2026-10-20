import { constants } from "node:fs";
import {
  mkdir,
  open,
  readdir,
  rmdir,
  unlink,
  link,
  lstat,
} from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { Readable } from "node:stream";
import { AppError } from "../errors";
import type { Storage } from "../storage";

const pathPattern =
  /^artifacts\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/payload\.bin$/;
export class LocalStorage implements Storage {
  private root: string;
  constructor(root: string) {
    this.root = resolve(root);
  }
  private path(path: string) {
    if (!pathPattern.test(path)) throw new Error("Invalid local object path.");
    return join(this.root, path);
  }
  private async file(path: string) {
    const handle = await open(
      this.path(path),
      constants.O_RDONLY | constants.O_NOFOLLOW,
    );
    if (!(await handle.stat()).isFile()) {
      await handle.close();
      throw new Error("Invalid local object.");
    }
    return handle;
  }
  async inspect(path: string) {
    const handle = await this.file(path);
    try {
      return {
        pathname: path,
        url: `local:${path}`,
        size: (await handle.stat()).size,
        contentType: "application/octet-stream",
      };
    } finally {
      await handle.close();
    }
  }
  async read(path: string) {
    const handle = await this.file(path);
    return Readable.toWeb(
      handle.createReadStream(),
    ) as ReadableStream<Uint8Array>;
  }
  async write(
    path: string,
    body: ReadableStream<Uint8Array>,
    maximumBytes: number,
    signal?: AbortSignal,
  ) {
    const destination = this.path(path);
    await mkdir(dirname(destination), { recursive: true, mode: 0o700 });
    // Publish a complete file atomically. Commit cannot inspect a partial upload.
    const temporary = join(dirname(destination), `.upload-${randomUUID()}`);
    const handle = await open(temporary, "wx", 0o600);
    const reader = body.getReader();
    let bytes = 0,
      timedOut = false;
    const abort = () => {
      void reader.cancel().catch(() => {});
    };
    const timer = setTimeout(() => {
      timedOut = true;
      abort();
    }, 60_000);
    signal?.addEventListener("abort", abort, { once: true });
    try {
      for (;;) {
        const chunk = await reader.read();
        if (chunk.done) break;
        bytes += chunk.value.byteLength;
        if (bytes > maximumBytes)
          throw new AppError(
            413,
            "TOO_LARGE",
            "O arquivo excede o limite permitido.",
          );
        await handle.writeFile(chunk.value);
      }
      if (timedOut || signal?.aborted || bytes < 29)
        throw new AppError(
          400,
          "UPLOAD",
          "O upload foi interrompido ou é inválido.",
        );
      await handle.sync();
      await link(temporary, destination); // Atomic, and never replaces an object.
      const parent = await open(dirname(destination), "r");
      try {
        await parent.sync();
      } finally {
        await parent.close();
      }
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      await reader.cancel().catch(() => {});
      await handle.close();
      await unlink(temporary).catch(() => {});
    }
  }
  async remove(path: string) {
    const destination = this.path(path);
    await unlink(destination).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") throw error;
    });
    // Crashes may leave private temporary ciphertext. Uploads time out after
    // 60 seconds; the extra margin avoids touching a live writer.
    for (const name of await readdir(dirname(destination)).catch(
      (error: NodeJS.ErrnoException) => {
        if (error.code !== "ENOENT") throw error;
        return [] as string[];
      },
    )) {
      if (!/^\.upload-[0-9a-f-]{36}$/.test(name)) continue;
      const temporary = join(dirname(destination), name);
      const info = await lstat(temporary).catch(
        (error: NodeJS.ErrnoException) => {
          if (error.code !== "ENOENT") throw error;
          return null;
        },
      );
      if (info?.isFile() && info.mtimeMs < Date.now() - 90_000)
        await unlink(temporary).catch((error: NodeJS.ErrnoException) => {
          if (error.code !== "ENOENT") throw error;
        });
    }
    await rmdir(dirname(destination)).catch((error: NodeJS.ErrnoException) => {
      if (!["ENOENT", "ENOTEMPTY"].includes(error.code || "")) throw error;
    });
  }
  async inventory(cursor?: string) {
    const names = await readdir(join(this.root, "artifacts"), {
      withFileTypes: true,
    }).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") throw error;
      return [];
    });
    const candidates = names
      .filter(
        (entry) =>
          entry.isDirectory() &&
          pathPattern.test(`artifacts/${entry.name}/payload.bin`),
      )
      .map((entry) => `artifacts/${entry.name}/payload.bin`)
      .sort()
      .filter((path) => !cursor || path > cursor);
    const paths = candidates.slice(0, 50);
    return { paths, cursor: candidates.length > 50 ? paths.at(-1) : undefined };
  }
}
