import { PGlite } from "@electric-sql/pglite";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { Database, QueryClient, Row } from "@/server/db";

export async function testDatabase(): Promise<{
  db: Database;
  reset(): Promise<void>;
  close(): Promise<void>;
}> {
  const migration = await readFile(
    new URL("../migrations/001_initial.sql", import.meta.url),
    "utf8",
  );
  if (process.env.TEST_DATABASE_URL) {
    const schema = `test_${randomUUID().replaceAll("-", "")}`;
    const admin = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
    await admin.query(`CREATE SCHEMA ${schema}`);
    const pool = new Pool({
      connectionString: process.env.TEST_DATABASE_URL,
      max: 12,
      options: `-c search_path=${schema}`,
    });
    const adapt = (client: Pick<Pool, "query">): QueryClient => ({
      async query<T extends Row>(sql: string, values?: unknown[]) {
        const r = await client.query(sql, values);
        return { rows: r.rows as T[], rowCount: r.rowCount || 0 };
      },
    });
    const db: Database = {
      ...adapt(pool),
      async transaction<T>(work: (tx: QueryClient) => Promise<T>) {
        const client = await pool.connect();
        try {
          await client.query("BEGIN");
          const result = await work(adapt(client as unknown as Pool));
          await client.query("COMMIT");
          return result;
        } catch (e) {
          await client.query("ROLLBACK");
          throw e;
        } finally {
          client.release();
        }
      },
    };
    await pool.query(migration);
    return {
      db,
      reset: async () => {
        await pool.query(
          "TRUNCATE artifacts,accounts,handshakes,rate_limits,cleanup_jobs,maintenance CASCADE",
        );
      },
      close: async () => {
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
