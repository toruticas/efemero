import { connectDatabase } from "@/server/database/connect";
import { SQLiteDatabase } from "@/server/database/sqlite";
import { PGlite } from "@electric-sql/pglite";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import type { Database, QueryClient, Row } from "@/server/db";

export async function testDatabase(): Promise<{
  db: Database;
  reset(): Promise<void>;
  close(): Promise<void>;
}> {
  if (process.env.TEST_DATABASE_DRIVER === "sqlite") {
    const db = new SQLiteDatabase(":memory:");
    return {
      db,
      reset: () =>
        db.transaction(async (tx) => {
          for (const table of [
            "handshakes",
            "cleanup_jobs",
            "artifacts",
            "accounts",
            "rate_limits",
            "maintenance",
          ])
            await tx.query(`DELETE FROM ${table}`);
        }),
      close: async () => db.close(),
    };
  }
  const directory = new URL("../migrations/", import.meta.url);
  const files = (await readdir(directory))
    .filter((name) => /^\d+_.*\.sql$/.test(name))
    .sort();
  const migration = (
    await Promise.all(
      files.map((file) => readFile(new URL(file, directory), "utf8")),
    )
  ).join("\n");
  if (process.env.TEST_DATABASE_URL) {
    const schema = `test_${randomUUID().replaceAll("-", "")}`;
    const admin = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
    await admin.query(`CREATE SCHEMA ${schema}`);
    const pool = new Pool({
      connectionString: process.env.TEST_DATABASE_URL,
      max: 12,
      options: `-c search_path=${schema}`,
    });
    const connection = new URL(process.env.TEST_DATABASE_URL);
    connection.searchParams.set("options", `-c search_path=${schema}`);
    const db = connectDatabase("postgres", connection.toString());
    await pool.query(migration);
    return {
      db,
      reset: async () => {
        await pool.query(
          "TRUNCATE artifacts,accounts,handshakes,rate_limits,cleanup_jobs,maintenance CASCADE",
        );
      },
      close: async () => {
        await db.close();
        await pool.end();
        await admin.query(`DROP SCHEMA ${schema} CASCADE`);
        await admin.end();
      },
    };
  }
  const pg = new PGlite();
  await pg.exec(migration);
  const adapt = (client: Pick<PGlite, "query">): QueryClient => ({
    async query<T extends Row>(sql: string, values?: unknown[]) {
      const r = await client.query<T>(sql, values);
      return { rows: r.rows, rowCount: r.rows.length || r.affectedRows || 0 };
    },
  });
  const db: Database = {
    ...adapt(pg),
    transaction: async (work) =>
      pg.transaction(async (tx) => work(adapt(tx as unknown as PGlite))),
  };
  return {
    db,
    reset: async () => {
      await pg.exec(
        "TRUNCATE artifacts,accounts,handshakes,rate_limits,cleanup_jobs,maintenance CASCADE",
      );
    },
    close: () => pg.close(),
  };
}
