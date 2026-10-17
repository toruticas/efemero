import "server-only";
import { Pool, neonConfig } from "@neondatabase/serverless";
import WebSocket from "ws";
import { required } from "./config";
export type Row = Record<string, unknown>;
export type QueryResult<T> = { rows: T[]; rowCount: number };
export interface QueryClient {
  query<T extends Row = Row>(
    sql: string,
    values?: unknown[],
  ): Promise<QueryResult<T>>;
}
export interface Database extends QueryClient {
  transaction<T>(work: (tx: QueryClient) => Promise<T>): Promise<T>;
}
let database: Database | undefined;
export function getDatabase(): Database {
  if (database) return database;
  neonConfig.webSocketConstructor = WebSocket;
  const pool = new Pool({ connectionString: required("DATABASE_URL"), max: 4 });
  const adapt = (client: Pick<Pool, "query">): QueryClient => ({
    async query<T extends Row>(sql: string, values?: unknown[]) {
      const result = await client.query(sql, values);
      return { rows: result.rows as T[], rowCount: result.rowCount ?? 0 };
    },
  });
  database = {
    ...adapt(pool),
    async transaction<T>(work: (tx: QueryClient) => Promise<T>) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const result = await work(adapt(client as unknown as Pool));
        await client.query("COMMIT");
        return result;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
  };
  return database;
}
