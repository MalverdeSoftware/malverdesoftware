import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { STORES, created, harness, newSession } from "./harness.ts";
import { envelope, secret } from "./helpers.ts";

const sorted = (statuses: number[]) => [...statuses].sort((a, b) => a - b);

for (const kind of STORES) {
  describe(`relay participant endpoints (${kind} store)`, () => {
    test("a participant's link loads the definition, their draft and session state", async () => {
      const { call, path, slots, body } = await created(kind);
      const [me, other] = slots;
      const reply = await call("GET", `${path}/slots/${me!.slotId}`, { token: me!.writeToken });
      assert.equal(reply.status, 200);
      assert.deepEqual(reply.body.definition, body.definition);
      assert.equal(reply.body.draft, null);
      assert.deepEqual(reply.body.slot, { slotId: me!.slotId, status: "NOT_STARTED", draftVersion: 0, updatedAt: null, submittedAt: null });
      assert.equal(reply.body.session.isClosed, false);
      assert.equal((await call("GET", `${path}/slots/${me!.slotId}`)).status, 401);
      assert.equal((await call("GET", `${path}/slots/${me!.slotId}`, { token: other!.writeToken })).status, 403);
      assert.equal((await call("GET", `${path}/slots/${me!.slotId}`, { token: secret() })).body.error.code, "FORBIDDEN");
    });

    test("drafts use optimistic versions", async () => {
      const { call, path, adminToken, slots } = await created(kind);
      const me = slots[0]!;
      const draftPath = `${path}/slots/${me.slotId}/draft`;
      const first = envelope();
      const saved = await call("PUT", draftPath, { token: me.writeToken, body: { envelope: first, baseVersion: 0 } });
      assert.equal(saved.status, 200);
      assert.equal(saved.body.draftVersion, 1);
      assert.equal(typeof saved.body.updatedAt, "string");
      const stale = await call("PUT", draftPath, { token: me.writeToken, body: { envelope: envelope(), baseVersion: 0 } });
      assert.equal(stale.status, 409);
      assert.equal(stale.body.error.code, "VERSION_CONFLICT");
      assert.deepEqual(stale.body.error.details, { draftVersion: 1 });
      const view = await call("GET", `${path}/slots/${me.slotId}`, { token: me.writeToken });
      assert.deepEqual(view.body.draft, first);
      assert.equal(view.body.slot.status, "IN_PROGRESS");
      const second = envelope();
      assert.equal((await call("PUT", draftPath, { token: me.writeToken, body: { envelope: second, baseVersion: 1 } })).body.draftVersion, 2);
      const drafts = await call("GET", `${path}/drafts`, { token: adminToken });
      assert.deepEqual(drafts.body.data.map((d: any) => [d.slotId, d.envelope, d.draftVersion]), [[me.slotId, second, 2]]);
      assert.deepEqual((await call("GET", path, { token: adminToken })).body.session.counts, { notStarted: 2, inProgress: 1, submitted: 0 });
    });

    test("a submission is written once, replays on identical retry and ends drafting", async () => {
      const { call, path, adminToken, slots } = await created(kind);
      const me = slots[0]!;
      await call("PUT", `${path}/slots/${me.slotId}/draft`, { token: me.writeToken, body: { envelope: envelope(), baseVersion: 0 } });
      const sealed = envelope("ECDH-ES+A256GCM");
      const first = await call("PUT", `${path}/slots/${me.slotId}/submission`, { token: me.writeToken, body: { envelope: sealed } });
      assert.equal(first.status, 201);
      const retry = await call("PUT", `${path}/slots/${me.slotId}/submission`, { token: me.writeToken, body: { envelope: sealed } });
      assert.equal(retry.status, 200);
      assert.equal(retry.body.submittedAt, first.body.submittedAt);
      const other = await call("PUT", `${path}/slots/${me.slotId}/submission`, { token: me.writeToken, body: { envelope: envelope("ECDH-ES+A256GCM") } });
      assert.equal(other.body.error.code, "ALREADY_SUBMITTED");
      const late = await call("PUT", `${path}/slots/${me.slotId}/draft`, { token: me.writeToken, body: { envelope: envelope(), baseVersion: 1 } });
      assert.equal(late.body.error.code, "ALREADY_SUBMITTED");
      const view = await call("GET", `${path}/slots/${me.slotId}`, { token: me.writeToken });
      assert.equal(view.body.slot.status, "SUBMITTED");
      assert.equal(view.body.draft, null);
      const subs = await call("GET", `${path}/submissions`, { token: adminToken });
      assert.deepEqual(subs.body.data, [{ slotId: me.slotId, envelope: sealed, submittedAt: first.body.submittedAt }]);
      assert.deepEqual((await call("GET", `${path}/drafts`, { token: adminToken })).body.data, []);
    });

    test("closing stops new writes but an earlier submission still replays", async () => {
      const { call, path, adminToken, slots } = await created(kind);
      const [early, late] = slots;
      const sealed = envelope("ECDH-ES+A256GCM");
      await call("PUT", `${path}/slots/${early!.slotId}/submission`, { token: early!.writeToken, body: { envelope: sealed } });
      await call("PATCH", path, { token: adminToken, body: { isClosed: true } });
      const replay = await call("PUT", `${path}/slots/${early!.slotId}/submission`, { token: early!.writeToken, body: { envelope: sealed } });
      assert.equal(replay.status, 200);
      const draft = await call("PUT", `${path}/slots/${late!.slotId}/draft`, { token: late!.writeToken, body: { envelope: envelope(), baseVersion: 0 } });
      assert.equal(draft.body.error.code, "SESSION_CLOSED");
      const submission = await call("PUT", `${path}/slots/${late!.slotId}/submission`, { token: late!.writeToken, body: { envelope: envelope() } });
      assert.equal(submission.body.error.code, "SESSION_CLOSED");
      assert.equal((await call("GET", `${path}/slots/${late!.slotId}`, { token: late!.writeToken })).body.session.isClosed, true);
    });

    test("participant bodies are validated", async () => {
      const { call, path, slots } = await created(kind);
      const me = slots[0]!;
      const draftPath = `${path}/slots/${me.slotId}/draft`;
      for (const body of [{ envelope: envelope() }, { envelope: envelope(), baseVersion: -1 }, { envelope: { v: 1 }, baseVersion: 0 }])
        assert.equal((await call("PUT", draftPath, { token: me.writeToken, body })).body.error.code, "VALIDATION_ERROR");
      const text = await call("PUT", draftPath, { token: me.writeToken, body: "{}", headers: { "Content-Type": "text/plain" } });
      assert.equal(text.status, 415);
    });

    test("five wrong passcodes lock a slot for an hour; success resets the count", async () => {
      const { call, path, slots, clock } = await created(kind);
      const [me, neighbour] = slots;
      const view = (token: string, slot = me!) => call("GET", `${path}/slots/${slot.slotId}`, { token });
      for (let i = 0; i < 4; i++) assert.equal((await view(secret())).status, 403);
      assert.equal((await view(me!.writeToken)).status, 200);
      for (let i = 0; i < 4; i++) assert.equal((await view(secret())).status, 403);
      assert.equal((await view(me!.writeToken)).status, 200, "a success resets the count");
      for (let i = 0; i < 5; i++) assert.equal((await view(secret())).status, 403);
      const locked = await view(me!.writeToken);
      assert.equal(locked.status, 429);
      assert.equal(locked.body.error.code, "RATE_LIMITED");
      assert.equal(locked.body.error.details.retryAfter, 3600);
      assert.equal(locked.headers.get("Retry-After"), "3600");
      assert.equal((await view(neighbour!.writeToken, neighbour)).status, 200, "other participants are unaffected");
      clock.advance(59 * 60_000);
      assert.equal((await view(me!.writeToken)).status, 429);
      clock.advance(60_000);
      assert.equal((await view(me!.writeToken)).status, 200);
    });

    test("simultaneous writes resolve to exactly one winner", async () => {
      const { call, path, slots } = await created(kind);
      const [a, b] = slots;
      const submissions = await Promise.all(
        [envelope("ECDH-ES+A256GCM"), envelope("ECDH-ES+A256GCM")].map((e) =>
          call("PUT", `${path}/slots/${a!.slotId}/submission`, { token: a!.writeToken, body: { envelope: e } }),
        ),
      );
      assert.deepEqual(sorted(submissions.map((r) => r.status)), [201, 409]);
      const drafts = await Promise.all(
        [envelope(), envelope()].map((e) =>
          call("PUT", `${path}/slots/${b!.slotId}/draft`, { token: b!.writeToken, body: { envelope: e, baseVersion: 0 } }),
        ),
      );
      assert.deepEqual(sorted(drafts.map((r) => r.status)), [200, 409]);
    });

    test("simultaneous identical creates give one 201 and one replay", async () => {
      const { call, creationKey } = await harness(kind);
      const s = await newSession(2);
      s.body.sessionId = s.sessionId;
      const replies = await Promise.all([1, 2].map(() => call("POST", "/v1/sessions", { token: creationKey, body: s.body })));
      assert.deepEqual(sorted(replies.map((r) => r.status)), [200, 201]);
    });

    test("a removed participant's link stops working and their data is gone", async () => {
      const { call, path, adminToken, slots } = await created(kind);
      const me = slots[0]!;
      await call("PUT", `${path}/slots/${me.slotId}/submission`, { token: me.writeToken, body: { envelope: envelope("ECDH-ES+A256GCM") } });
      await call("DELETE", `${path}/slots/${me.slotId}`, { token: adminToken });
      assert.equal((await call("GET", `${path}/slots/${me.slotId}`, { token: me.writeToken })).status, 404);
      assert.deepEqual((await call("GET", `${path}/submissions`, { token: adminToken })).body.data, []);
    });

    test("submissions page like participant status", async () => {
      const { call, path, adminToken, slots } = await created(kind, 5);
      for (const s of slots)
        await call("PUT", `${path}/slots/${s.slotId}/submission`, { token: s.writeToken, body: { envelope: envelope("ECDH-ES+A256GCM") } });
      const first = await call("GET", `${path}/submissions?limit=2`, { token: adminToken });
      const second = await call("GET", `${path}/submissions?limit=2&cursor=${first.body.nextCursor}`, { token: adminToken });
      const third = await call("GET", `${path}/submissions?limit=2&cursor=${second.body.nextCursor}`, { token: adminToken });
      assert.equal(third.body.nextCursor, null);
      assert.deepEqual(
        [...first.body.data, ...second.body.data, ...third.body.data].map((d: any) => d.slotId),
        slots.map((s) => s.slotId).sort(),
      );
    });
  });
}
