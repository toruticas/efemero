import { mkdir, readFile, open, link, unlink, stat } from "node:fs/promises";
import { join } from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import * as opaque from "@serenity-kit/opaque";
class ConfigurationError extends Error {}

async function start() {
  process.umask(0o077);
  process.env.AUTH_PROVIDER ||= "none";
  const origin = new URL(process.env.APP_ORIGIN);
  if (
    origin.protocol !== "https:" &&
    !(
      origin.protocol === "http:" &&
      ["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname)
    )
  )
    throw new ConfigurationError(
      "Use HTTPS for a public APP_ORIGIN; HTTP is allowed only on loopback.",
    );
  const directory = process.env.DATA_DIR || "/data";
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const path = join(directory, "secrets.json");
  let saved;
  try {
    saved = JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const keys = [
    "OPAQUE_SERVER_SETUP",
    "HANDSHAKE_SEAL_KEY",
    "RATE_LIMIT_HMAC_KEY",
    "CRON_SECRET",
  ];
  if (!saved) {
    const existingDatabase =
      process.env.DATABASE_DRIVER === "sqlite" &&
      process.env.SQLITE_PATH !== ":memory:" &&
      (await stat(process.env.SQLITE_PATH).then(
        () => true,
        (error) => {
          if (error.code !== "ENOENT") throw error;
          return false;
        },
      ));
    if (existingDatabase && keys.some((key) => !process.env[key]))
      throw new ConfigurationError(
        "Existing SQLite database has no saved secrets. Restore secrets.json or supply all original service secrets; do not generate replacements.",
      );
    await opaque.ready;
    saved = Object.fromEntries(
      keys.map((key) => [
        key,
        process.env[key] ||
          (key === "OPAQUE_SERVER_SETUP"
            ? opaque.server.createSetup()
            : randomBytes(32).toString("base64url")),
      ]),
    );
    saved.OPAQUE_SETUP_VERSION = process.env.OPAQUE_SETUP_VERSION || "1";
    const temporary = `${path}.${randomUUID()}.tmp`;
    const secretFile = await open(temporary, "wx", 0o600);
    try {
      await secretFile.writeFile(JSON.stringify(saved) + "\n");
      await secretFile.sync();
    } finally {
      await secretFile.close();
    }
    try {
      await link(temporary, path);
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      saved = JSON.parse(await readFile(path, "utf8"));
    } finally {
      await unlink(temporary);
    }
    const parent = await open(directory, "r");
    try {
      await parent.sync();
    } finally {
      await parent.close();
    }
  }
  for (const key of keys) {
    if (typeof saved[key] !== "string" || !saved[key])
      throw new ConfigurationError("Invalid persisted service secrets.");
    if (process.env[key] && process.env[key] !== saved[key])
      throw new ConfigurationError(
        "Persisted secrets and environment overrides differ. Restore a matching set; secrets are not rotated implicitly.",
      );
    process.env[key] ||= saved[key];
  }
  const setupVersion = saved.OPAQUE_SETUP_VERSION || "1";
  if (
    process.env.OPAQUE_SETUP_VERSION &&
    process.env.OPAQUE_SETUP_VERSION !== setupVersion
  )
    throw new ConfigurationError(
      "Persisted OPAQUE setup version differs from the environment. Restore a matching configuration.",
    );
  process.env.OPAQUE_SETUP_VERSION = setupVersion;
  if (
    process.env.DATABASE_DRIVER === "sqlite" &&
    process.env.SQLITE_PATH === ":memory:"
  ) {
    if (process.env.ALLOW_EPHEMERAL_DATABASE !== "true")
      throw new ConfigurationError(
        "Set ALLOW_EPHEMERAL_DATABASE=true to explicitly accept in-memory data loss.",
      );
    console.warn(
      "WARNING: in-memory SQLite loses artifacts, policies, route reservations, and rate limits on every restart. Disk ciphertext may remain orphaned. Do not use this mode for durable sharing.",
    );
  }
  console.info(
    "Starting Efemero. Service secrets are persisted; no secret values are logged.",
  );
  await import("../server.js");
}
start().catch((error) => {
  if (error instanceof ConfigurationError) console.error(error.message);
  console.error(
    "Efemero startup failed. Check configuration, volume permissions, and persisted secrets. Sensitive details omitted.",
  );
  process.exitCode = 1;
});
