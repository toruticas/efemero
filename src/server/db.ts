import "server-only";
import { assertPersistentRuntime, databaseDriver } from "@/lib/runtime-options";
import { required } from "./config";
import { connectDatabase } from "./database/connect";
import type { Database } from "./database/types";
export type { Row, QueryResult, QueryClient, Database } from "./database/types";

// Next.js can bundle routes separately. Share one connection and transaction
// mutex across them, especially for the single-process in-memory deployment.
const state = globalThis as typeof globalThis & {
  __efemeroDatabase?: Database;
};
export function getDatabase(): Database {
  if (state.__efemeroDatabase) return state.__efemeroDatabase;
  assertPersistentRuntime();
  const driver = databaseDriver();
  const url =
    driver === "sqlite" ? required("SQLITE_PATH") : required("DATABASE_URL");
  if (
    driver === "sqlite" &&
    url === ":memory:" &&
    process.env.ALLOW_EPHEMERAL_DATABASE !== "true"
  )
    throw new Error(
      "In-memory SQLite requires ALLOW_EPHEMERAL_DATABASE=true; all metadata is lost on restart.",
    );
  state.__efemeroDatabase = connectDatabase(driver, url);
  return state.__efemeroDatabase;
}
