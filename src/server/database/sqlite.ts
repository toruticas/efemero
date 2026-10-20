import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { chmodSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Database, QueryClient, QueryResult, Row } from "./types";

// The application owns these SQL strings; values always remain bound parameters.
// SQLite uses a database write lock in place of PostgreSQL row/advisory locks.
function sqliteSQL(sql: string) {
  if (/^SELECT pg_advisory_xact_lock\(\d+\)$/.test(sql)) return "SELECT 1";
  return sql
    .replace(/::(?:timestamptz|uuid|jsonb|text)\b/g, "")
    .replace(/\bFOR UPDATE(?: SKIP LOCKED)?\b/g, "");
}
function value(input: unknown): SQLInputValue {
  if (input === null || input === undefined) return null;
  if (input instanceof Date) return input.toISOString();
  if (typeof input === "boolean") return Number(input);
  if (
    typeof input === "string" ||
    typeof input === "number" ||
    typeof input === "bigint" ||
    input instanceof Uint8Array
  )
    return input;
  throw new Error("Unsupported SQLite parameter.");
}
export class SQLiteDatabase implements Database {
  readonly dialect = "sqlite" as const;
  private connection: DatabaseSync;
  private tail: Promise<unknown> = Promise.resolve();
  constructor(
    path: string,
    migrations = join(process.cwd(), "migrations/sqlite"),
  ) {
    if (path !== ":memory:")
      mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    this.connection = new DatabaseSync(path);
    if (path !== ":memory:") chmodSync(path, 0o600);
    this.connection.exec(
      "PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;",
    );
    this.connection.function(
      "greatest",
      { varargs: true, deterministic: true },
      (...args) => {
        const present = args.filter((arg) => arg !== null);
        return present.length
          ? present.reduce((a, b) => (a! > b! ? a : b))!
          : null;
      },
    );
    try {
      this.connection.exec(
        "BEGIN IMMEDIATE; CREATE TABLE IF NOT EXISTS schema_migrations(version TEXT PRIMARY KEY,applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')));",
      );
      for (const file of readdirSync(migrations)
        .filter((name) => /^\d+_.*\.sql$/.test(name))
        .sort()) {
        const version = file.slice(0, -4);
        if (
          this.connection
            .prepare("SELECT version FROM schema_migrations WHERE version=?")
            .get(version)
        )
          continue;
        this.connection.exec(readFileSync(join(migrations, file), "utf8"));
        this.connection
          .prepare("INSERT INTO schema_migrations(version) VALUES(?)")
          .run(version);
      }
      this.connection.exec("COMMIT");
    } catch (error) {
      if (this.connection.isTransaction) this.connection.exec("ROLLBACK");
      this.connection.close();
      throw error;
    }
  }
  private async exclusive<T>(work: () => Promise<T>): Promise<T> {
    const before = this.tail;
    let release!: () => void;
    this.tail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await before;
    try {
      return await work();
    } finally {
      release();
    }
  }
  private async execute<T extends Row>(
    sql: string,
    values: unknown[] = [],
  ): Promise<QueryResult<T>> {
    try {
      const query = this.connection.prepare(sqliteSQL(sql));
      const bindings: Record<string, SQLInputValue> = {};
      values.forEach((input, index) => {
        bindings[`$${index + 1}`] = value(input);
      });
      if (query.columns().length) {
        const rows = query.all(bindings).map((entry) => {
          const row = { ...entry };
          if (typeof row.wrapped_key === "string")
            row.wrapped_key = JSON.parse(row.wrapped_key);
          return row as T;
        });
        return { rows, rowCount: rows.length };
      }
      const result = query.run(bindings);
      return { rows: [], rowCount: Number(result.changes) };
    } catch (error) {
      const code = (error as { errcode?: number }).errcode;
      // Preserve the service's database-independent constraint error contract.
      if (code === 2067 || code === 1555)
        Object.assign(error as object, { code: "23505" });
      else if (code === 275 || code === 1811)
        Object.assign(error as object, { code: "23514" });
      throw error;
    }
  }
  query<T extends Row = Row>(sql: string, values?: unknown[]) {
    return this.exclusive(() => this.execute<T>(sql, values));
  }
  transaction<T>(work: (tx: QueryClient) => Promise<T>): Promise<T> {
    return this.exclusive(async () => {
      this.connection.exec("BEGIN IMMEDIATE");
      try {
        const result = await work({
          dialect: "sqlite",
          query: this.execute.bind(this),
        });
        this.connection.exec("COMMIT");
        return result;
      } catch (error) {
        this.connection.exec("ROLLBACK");
        throw error;
      }
    });
  }
  close() {
    this.connection.close();
  }
}
