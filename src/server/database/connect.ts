import { Pool as NeonPool, neonConfig } from "@neondatabase/serverless";
import { Pool as PostgresPool } from "pg";
import WebSocket from "ws";
import { SQLiteDatabase } from "./sqlite";
import type { Database, QueryClient, Row } from "./types";

type Connection = {
  query(
    sql: string,
    values?: unknown[],
  ): Promise<{ rows: Row[]; rowCount: number | null }>;
};
export function connectDatabase(
  driver: "neon" | "postgres" | "sqlite",
  url: string,
): Database & { close(): Promise<void> } {
  if (driver === "sqlite") {
    const db = new SQLiteDatabase(url);
    return {
      dialect: db.dialect,
      query: db.query.bind(db),
      transaction: db.transaction.bind(db),
      close: async () => db.close(),
    };
  }
  neonConfig.webSocketConstructor = WebSocket;
  const pool =
    driver === "postgres"
      ? new PostgresPool({ connectionString: url, max: 4 })
      : new NeonPool({ connectionString: url, max: 4 });
  const adapt = (client: Connection): QueryClient => ({
    dialect: "postgres",
    async query<T extends Row>(sql: string, values?: unknown[]) {
      const result = await client.query(sql, values);
      return { rows: result.rows as T[], rowCount: result.rowCount ?? 0 };
    },
  });
  return {
    ...adapt(pool),
    async transaction<T>(work: (tx: QueryClient) => Promise<T>) {
      const client = await pool.connect();
      const connection: Connection = client;
      try {
        await connection.query("BEGIN");
        const result = await work(adapt(client));
        await connection.query("COMMIT");
        return result;
      } catch (error) {
        await connection.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
    close: () => pool.end(),
  };
}
