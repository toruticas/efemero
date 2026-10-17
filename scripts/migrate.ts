import { loadEnvConfig } from "@next/env";
import { Pool, neonConfig } from "@neondatabase/serverless";
import WebSocket from "ws";
import { readFile } from "node:fs/promises";
loadEnvConfig(process.cwd());
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
    const done = await client.query(
      "SELECT version FROM schema_migrations WHERE version='001_initial'",
    );
    if (!done.rowCount) {
      await client.query(
        await readFile(
          new URL("../migrations/001_initial.sql", import.meta.url),
          "utf8",
        ),
      );
      await client.query(
        "INSERT INTO schema_migrations(version) VALUES('001_initial')",
      );
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
