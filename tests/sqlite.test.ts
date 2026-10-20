import { describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SQLiteDatabase } from "@/server/database/sqlite";
describe("SQLite durability and transaction isolation", () => {
  it("persists schema and records across reopening and rolls back a failed transaction", async () => {
    const directory = await mkdtemp(join(tmpdir(), "efemero-sqlite-"));
    const file = join(directory, "state.sqlite");
    let db = new SQLiteDatabase(file);
    try {
      await db.query(
        "INSERT INTO accounts(id,clerk_id,username) VALUES($1,$2,$3)",
        ["owner", "clerk-owner", "alice"],
      );
      await expect(
        db.transaction(async (tx) => {
          await tx.query("DELETE FROM accounts WHERE id=$1", ["owner"]);
          throw new Error("abort");
        }),
      ).rejects.toThrow("abort");
      db.close();
      db = new SQLiteDatabase(file);
      expect((await db.query("SELECT username FROM accounts")).rows).toEqual([
        { username: "alice" },
      ]);
      await expect(
        db.query("UPDATE accounts SET username='other'"),
      ).rejects.toMatchObject({ code: "23514" });
    } finally {
      db.close();
      await rm(directory, { recursive: true, force: true });
    }
  });
  it("keeps standalone queries outside an in-flight async transaction", async () => {
    const db = new SQLiteDatabase(":memory:");
    let release!: () => void;
    const barrier = new Promise<void>((resolve) => {
      release = resolve;
    });
    try {
      const tx = db.transaction(async (client) => {
        await client.query(
          "INSERT INTO maintenance(key,value) VALUES('secret','uncommitted')",
        );
        await barrier;
        throw new Error("rollback");
      });
      const rejected = expect(tx).rejects.toThrow("rollback");
      const outside = db.query("SELECT * FROM maintenance");
      release();
      await rejected;
      expect((await outside).rows).toEqual([]);
    } finally {
      db.close();
    }
  });
});
