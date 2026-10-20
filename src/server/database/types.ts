export type Row = Record<string, unknown>;
export type QueryResult<T> = { rows: T[]; rowCount: number };
export interface QueryClient {
  readonly dialect?: "postgres" | "sqlite";
  query<T extends Row = Row>(
    sql: string,
    values?: unknown[],
  ): Promise<QueryResult<T>>;
}
export interface Database extends QueryClient {
  transaction<T>(work: (tx: QueryClient) => Promise<T>): Promise<T>;
}
