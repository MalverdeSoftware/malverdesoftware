import { test } from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { memoryStore, schemaSql, sqlStore } from "../src/index.ts";
import { nodeSqliteDatabase } from "../src/node.ts";
import { storeContract } from "./store-contract.ts";
import { id, sessionRow } from "./helpers.ts";

storeContract("memory store", memoryStore);
storeContract("node:sqlite store", () => sqlStore(nodeSqliteDatabase(":memory:")));

test("schemaSql matches sql/schema.sql, which Wrangler migrations use", async () => {
  assert.equal(await readFile(new URL("../sql/schema.sql", import.meta.url), "utf8"), schemaSql);
});

test("only src/node.ts imports Node built-ins", async () => {
  const dir = new URL("../src/", import.meta.url);
  for (const file of await readdir(dir)) {
    if (file === "node.ts") continue;
    const source = await readFile(new URL(file, dir), "utf8");
    assert.doesNotMatch(source, /from\s+["']node:/, `${file} imports a Node built-in`);
  }
});

test("deleting and purging leave no rows in either table", async () => {
  const db = nodeSqliteDatabase(":memory:");
  const store = sqlStore(db);
  const count = async (table: string, sessionId: string) =>
    (await db.first<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table} WHERE session_id = ?`, [sessionId]))!.n;
  const deleted = sessionRow();
  const expired = sessionRow({ expiresAt: "2026-11-01T00:00:00.000Z" });
  for (const s of [deleted, expired])
    await store.insertSession(s, [{ slotId: id(), writeHash: "w".repeat(43) }, { slotId: id(), writeHash: "w".repeat(43) }]);
  await store.deleteSession(deleted.sessionId);
  await store.purgeExpired("2026-11-02T00:00:00.000Z");
  for (const s of [deleted, expired]) {
    assert.equal(await count("relay_sessions", s.sessionId), 0);
    assert.equal(await count("relay_slots", s.sessionId), 0);
  }
});

test("a failed batch rolls back every statement in it", async () => {
  const db = nodeSqliteDatabase(":memory:");
  const session = sessionRow();
  const slotId = id();
  await sqlStore(db).insertSession(session, [{ slotId, writeHash: "w".repeat(43) }]);
  await assert.rejects(
    db.batch([
      { sql: "UPDATE relay_sessions SET app = 'changed' WHERE session_id = ?", params: [session.sessionId] },
      { sql: "INSERT INTO relay_slots (session_id, slot_id, write_hash) VALUES (?, ?, ?)", params: [session.sessionId, slotId, "x"] },
    ]),
  );
  assert.equal((await sqlStore(db).getSession(session.sessionId))!.app, "mpile");
});
