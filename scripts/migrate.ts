import nextEnv from "@next/env";
import { Pool, neonConfig } from "@neondatabase/serverless";
import WebSocket from "ws";
import { readFile, readdir } from "node:fs/promises";
nextEnv.loadEnvConfig(process.cwd());
neonConfig.webSocketConstructor = WebSocket;
async function main() {
  if (!process.env.DATABASE_URL)
    throw new Error("Configure DATABASE_URL antes de executar a migração.");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
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
      await client.query("INSERT INTO schema_migrations(version) VALUES($1)", [
        version,
      ]);
    }
    await client.query("COMMIT");
    console.info("Migração concluída.");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}
main().catch(() => {
  console.error(
    "Falha na migração. Verifique conexão e permissões do banco; detalhes sensíveis foram omitidos.",
  );
  process.exitCode = 1;
});
