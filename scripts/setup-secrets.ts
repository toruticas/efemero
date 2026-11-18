import * as opaque from "@serenity-kit/opaque";
import { randomBytes } from "node:crypto";
import { open } from "node:fs/promises";
async function main() {
  await opaque.ready;
  const path = new URL("../.env.local", import.meta.url);
  const file = await open(path, "a+", 0o600);
  try {
    // The creation mode does not tighten permissions on an existing file.
    await file.chmod(0o600);
    let current = await file.readFile("utf8");
    const has = (key: string) => new RegExp(`^${key}=.+`, "m").test(current);
    const values: Record<string, () => string> = {
      OPAQUE_SERVER_SETUP: () => opaque.server.createSetup(),
      OPAQUE_SETUP_VERSION: () => "1",
      HANDSHAKE_SEAL_KEY: () => randomBytes(32).toString("base64url"),
      RATE_LIMIT_HMAC_KEY: () => randomBytes(32).toString("base64url"),
      CRON_SECRET: () => randomBytes(32).toString("base64url"),
    };
    for (const [key, generate] of Object.entries(values))
      if (!has(key)) {
        current = current.replace(new RegExp(`^${key}=.*$`, "m"), "");
        current += `\n${key}=${generate()}`;
      }
    await file.truncate(0);
    await file.writeFile(current.trim() + "\n");
  } finally {
    await file.close();
  }
  console.info(
    "Missing secrets generated in .env.local (Git-ignored). No values were printed; existing values were preserved.",
  );
}
main().catch(() => {
  console.error("Could not generate secrets.");
  process.exitCode = 1;
});
