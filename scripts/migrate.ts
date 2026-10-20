import nextEnv from "@next/env";
import { connectDatabase } from "../src/server/database/connect";
import {
  databaseDriver,
  assertPersistentRuntime,
} from "../src/lib/runtime-options";
import { readFile, readdir } from "node:fs/promises";
nextEnv.loadEnvConfig(process.cwd());
async function main() {
  assertPersistentRuntime();
  const driver = databaseDriver();
  const url =
    driver === "sqlite" ? process.env.SQLITE_PATH : process.env.DATABASE_URL;
  if (!url)
    throw new Error(
      "Configure the selected database before running migrations.",
    );
  if (
    driver === "sqlite" &&
    url === ":memory:" &&
    process.env.ALLOW_EPHEMERAL_DATABASE !== "true"
  )
    throw new Error(
      "In-memory SQLite requires explicit data-loss acknowledgment.",
    );
  const database = connectDatabase(driver, url);
  try {
    if (driver === "sqlite") {
      console.info(
        "SQLite migrations completed. In-memory migrations exist only for this process.",
      );
      return;
    }
    await database.transaction(async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(17420718)");
      await client.query(
        "CREATE TABLE IF NOT EXISTS schema_migrations(version text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT now())",
      );
      const directory = new URL("../migrations/", import.meta.url);
      const files = (await readdir(directory))
        .filter((name) => /^\d+_.*\.sql$/.test(name))
        .sort();
      for (const file of files) {
        const version = file.slice(0, -4);
        const done = await client.query(
          "SELECT version FROM schema_migrations WHERE version=$1",
          [version],
        );
        if (done.rowCount) continue;
        await client.query(await readFile(new URL(file, directory), "utf8"));
        await client.query(
          "INSERT INTO schema_migrations(version) VALUES($1)",
          [version],
        );
      }
    });
    console.info("Migration completed.");
  } finally {
    await database.close();
  }
}
main().catch(() => {
  console.error(
    "Migration failed. Check the database connection and permissions; sensitive details were omitted.",
  );
  process.exitCode = 1;
});
