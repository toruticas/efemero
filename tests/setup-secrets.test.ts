import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import {
  chmod,
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

describe("secret setup CLI", () => {
  let directory: string, envPath: string;
  const keys = [
    "OPAQUE_SERVER_SETUP",
    "OPAQUE_SETUP_VERSION",
    "HANDSHAKE_SEAL_KEY",
    "RATE_LIMIT_HMAC_KEY",
    "CRON_SECRET",
  ];
  const runSetup = () =>
    new Promise<string>((resolve, reject) => {
      execFile(
        process.execPath,
        ["--import", "tsx", join(directory, "scripts/setup-secrets.ts")],
        { cwd: directory },
        (error, stdout, stderr) => {
          // Keep CLI output out of test errors in case secret logging regresses.
          if (error) reject(new Error("Secret setup CLI failed."));
          else resolve(stdout + stderr);
        },
      );
    });
  const expectPrivate = async () => {
    expect((await stat(envPath)).mode & 0o777).toBe(0o600);
  };
  const expectCompleteAndUnlogged = (contents: string, output: string) => {
    for (const key of keys) {
      const value = contents.match(new RegExp(`^${key}=(.+)$`, "m"))?.[1];
      expect(Boolean(value)).toBe(true);
      // The setup version is public and may appear incidentally in output.
      if (key !== "OPAQUE_SETUP_VERSION")
        expect(output.includes(value!)).toBe(false);
    }
  };
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "efemero-secrets-"));
    envPath = join(directory, ".env.local");
    await mkdir(join(directory, "scripts"));
    await copyFile(
      new URL("../scripts/setup-secrets.ts", import.meta.url),
      join(directory, "scripts/setup-secrets.ts"),
    );
    await symlink(
      fileURLToPath(new URL("../node_modules", import.meta.url)),
      join(directory, "node_modules"),
      "dir",
    );
  });
  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });
  it("tightens an existing public env file before adding missing secrets", async () => {
    await writeFile(envPath, "APP_ORIGIN=http://example.test\nCRON_SECRET=\n");
    await chmod(envPath, 0o644);
    const output = await runSetup();
    await expectPrivate();
    const contents = await readFile(envPath, "utf8");
    expect(contents.includes("APP_ORIGIN=http://example.test\n")).toBe(true);
    expectCompleteAndUnlogged(contents, output);
  });
  it("creates a private env file when none exists", async () => {
    const output = await runSetup();
    await expectPrivate();
    expectCompleteAndUnlogged(await readFile(envPath, "utf8"), output);
  });
  it("preserves populated values and is idempotent on rerun", async () => {
    const existing = keys
      .map((key) => `${key}=synthetic-existing-${key.toLowerCase()}`)
      .join("\n");
    await writeFile(envPath, existing + "\n");
    await chmod(envPath, 0o644);
    const firstOutput = await runSetup();
    const firstContents = await readFile(envPath, "utf8");
    expect(firstContents === existing + "\n").toBe(true);
    await expectPrivate();
    const secondOutput = await runSetup();
    expect((await readFile(envPath, "utf8")) === firstContents).toBe(true);
    await expectPrivate();
    expectCompleteAndUnlogged(firstContents, firstOutput + secondOutput);
  });
});
