import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { purgeExpired } from "../src/index.ts";
import { DAY, START, STORES, created } from "./harness.ts";

for (const kind of STORES) {
  describe(`relay expiry (${kind} store)`, () => {
    test("an expired session answers 410 once, then 404, and its data is gone", async () => {
      const { call, path, adminToken, slots, clock, store, sessionId } = await created(kind);
      const me = slots[0]!;
      clock.advance(14 * DAY);
      const gone = await call("GET", `${path}/slots/${me.slotId}`, { token: me.writeToken });
      assert.equal(gone.status, 410);
      assert.equal(gone.body.error.code, "SESSION_EXPIRED");
      assert.equal((await call("GET", `${path}/slots/${me.slotId}`, { token: me.writeToken })).status, 404);
      assert.equal((await call("GET", path, { token: adminToken })).status, 404);
      assert.equal(await store.getSession(sessionId), null);
      assert.equal(await store.getSlot(sessionId, me.slotId), null);
    });

    test("extending expiry keeps a session past its original end", async () => {
      const { call, path, adminToken, clock } = await created(kind);
      const extended = new Date(START.getTime() + 21 * DAY).toISOString();
      await call("PATCH", path, { token: adminToken, body: { expiresAt: extended } });
      clock.advance(20 * DAY);
      assert.equal((await call("GET", path, { token: adminToken })).status, 200);
      clock.advance(DAY);
      assert.equal((await call("GET", path, { token: adminToken })).status, 410);
    });

    test("purgeExpired deletes expired sessions without anyone touching them", async () => {
      const a = await created(kind);
      const before = await purgeExpired(a.store, new Date(START.getTime() + 13 * DAY));
      assert.equal(before, 0);
      assert.equal(await purgeExpired(a.store, new Date(START.getTime() + 14 * DAY)), 1);
      assert.equal(await a.store.getSession(a.sessionId), null);
    });
  });
}
