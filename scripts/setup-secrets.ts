import * as opaque from "@serenity-kit/opaque";
import { randomBytes } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
async function main() {
  await opaque.ready;
  const path = new URL("../.env.local", import.meta.url);
  let current = await readFile(path, "utf8").catch(() => "");
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
  await writeFile(path, current.trim() + "\n", { mode: 0o600 });
  console.info(
    "Missing secrets generated in .env.local (Git-ignored). No values were printed; existing values were preserved.",
  );
}
main().catch(() => {
  console.error("Could not generate secrets.");
  process.exitCode = 1;
});
