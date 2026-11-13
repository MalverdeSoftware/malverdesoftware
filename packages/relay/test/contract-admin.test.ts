import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { RELAY_VERSION } from "../src/index.ts";
import type { RelayStore } from "../src/index.ts";
import { DAY, START, STORES, created, harness, newSession } from "./harness.ts";
import { envelope, id, secret, sha256 } from "./helpers.ts";

for (const kind of STORES) {
  describe(`relay creation and admin endpoints (${kind} store)`, () => {
    test("health reports the package version without authentication", async () => {
      const { call } = await harness(kind);
      const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
      const reply = await call("GET", "/v1/health");
      assert.equal(reply.status, 200);
      assert.deepEqual(reply.body, { ok: true, version: RELAY_VERSION });
      assert.equal(RELAY_VERSION, pkg.version);
    });

    test("creating a session returns its summary; an identical retry replays it", async () => {
      const { call, creationKey } = await harness(kind);
      const s = await newSession(3);
      s.body.sessionId = s.sessionId;
      const first = await call("POST", "/v1/sessions", { token: creationKey, body: s.body });
      assert.equal(first.status, 201);
      assert.deepEqual(first.body.session, {
        sessionId: s.sessionId,
        app: "mpile",
        createdAt: START.toISOString(),
        expiresAt: new Date(START.getTime() + 14 * DAY).toISOString(),
        isClosed: false,
        closedAt: null,
        slotCount: 3,
        counts: { notStarted: 3, inProgress: 0, submitted: 0 },
      });
      const retry = await call("POST", "/v1/sessions", { token: creationKey, body: s.body });
      assert.equal(retry.status, 200);
      assert.deepEqual(retry.body, first.body);
      const changed = await call("POST", "/v1/sessions", {
        token: creationKey,
        body: { ...s.body, definition: envelope() },
      });
      assert.equal(changed.status, 409);
      assert.equal(changed.body.error.code, "SESSION_EXISTS");
    });

    test("expiry defaults to 14 days and is capped at 30", async () => {
      const { call, creationKey } = await harness(kind);
      const make = async (expiresInDays: unknown) => {
        const s = await newSession(1);
        return call("POST", "/v1/sessions", { token: creationKey, body: { ...s.body, sessionId: s.sessionId, expiresInDays } });
      };
      assert.equal((await make(30)).body.session.expiresAt, new Date(START.getTime() + 30 * DAY).toISOString());
      for (const bad of [31, 0, 1.5, "7"]) assert.equal((await make(bad)).body.error.code, "VALIDATION_ERROR");
    });

    test("creation needs a valid creation key", async () => {
      const { call } = await harness(kind);
      const s = await newSession(1);
      s.body.sessionId = s.sessionId;
      assert.equal((await call("POST", "/v1/sessions", { body: s.body })).status, 401);
      assert.equal((await call("POST", "/v1/sessions", { body: s.body, headers: { Authorization: "Bearer bad key!" } })).status, 401);
      const wrong = await call("POST", "/v1/sessions", { token: secret(), body: s.body });
      assert.equal(wrong.status, 403);
      assert.equal(wrong.body.error.code, "FORBIDDEN");
    });

    test("creation validates every field and reports the first problem", async () => {
      const { call, creationKey } = await harness(kind);
      const s = await newSession(2);
      const good = { ...s.body, sessionId: s.sessionId };
      const cases: [string, unknown][] = [
        ["VALIDATION_ERROR", { ...good, sessionId: "short" }],
        ["VALIDATION_ERROR", { ...good, app: "My Pile" }],
        ["VALIDATION_ERROR", { ...good, adminTokenHash: "x" }],
        ["VALIDATION_ERROR", { ...good, definition: { ...envelope(), v: 2 } }],
        ["VALIDATION_ERROR", { ...good, definition: { v: 1, alg: "A256GCM", iv: envelope().iv } }],
        ["VALIDATION_ERROR", { ...good, definition: { ...envelope(), alg: "A128GCM" } }],
        ["VALIDATION_ERROR", { ...good, slots: [] }],
        ["VALIDATION_ERROR", { ...good, slots: [good.slots[0], good.slots[0]] }],
        ["VALIDATION_ERROR", { ...good, slots: [{ slotId: id(), writeTokenHash: "short" }] }],
        ["VALIDATION_ERROR", [good]],
      ];
      for (const [code, body] of cases) {
        const reply = await call("POST", "/v1/sessions", { token: creationKey, body });
        assert.equal(reply.status, 422, JSON.stringify(body).slice(0, 80));
        assert.equal(reply.body.error.code, code);
        assert.equal(typeof reply.body.error.message, "string");
      }
    });

    test("more than maxSlots participants is LIMIT_EXCEEDED", async () => {
      const { call, creationKey } = await harness(kind, { maxSlots: 3 });
      const s = await newSession(4);
      const reply = await call("POST", "/v1/sessions", { token: creationKey, body: { ...s.body, sessionId: s.sessionId } });
      assert.equal(reply.status, 422);
      assert.equal(reply.body.error.code, "LIMIT_EXCEEDED");
    });

    test("unknown fields are ignored and never stored", async () => {
      const { call, creationKey, store } = await harness(kind);
      const s = await newSession(1);
      const definition = { ...envelope(), note: "plaintext should not be stored" };
      const body = { ...s.body, sessionId: s.sessionId, definition, participantName: "Youth Alpha" };
      assert.equal((await call("POST", "/v1/sessions", { token: creationKey, body })).status, 201);
      const row = await store.getSession(s.sessionId);
      assert.deepEqual(Object.keys(JSON.parse(row!.definition)).sort(), ["alg", "ct", "iv", "v"]);
      // Markers contain spaces, which base64url never does, so they cannot occur by chance in ciphertext.
      assert.doesNotMatch(JSON.stringify(row), /plaintext should not be stored|Youth Alpha|participantName/);
    });

    test("bodies must be JSON and within size limits", async () => {
      const { call, creationKey } = await harness(kind, { maxEnvelopeBytes: 4096 });
      const s = await newSession(1);
      const good = { ...s.body, sessionId: s.sessionId };
      const text = await call("POST", "/v1/sessions", { token: creationKey, body: JSON.stringify(good), headers: { "Content-Type": "text/plain" } });
      assert.equal(text.status, 415);
      assert.equal(text.body.error.code, "UNSUPPORTED_MEDIA_TYPE");
      const broken = await call("POST", "/v1/sessions", { token: creationKey, body: "{not json" });
      assert.equal(broken.body.error.code, "VALIDATION_ERROR");
      const bigEnvelope = await call("POST", "/v1/sessions", { token: creationKey, body: { ...good, definition: envelope("A256GCM", 4) } });
      assert.equal(bigEnvelope.status, 413);
      assert.equal(bigEnvelope.body.error.code, "PAYLOAD_TOO_LARGE");
      const huge = await call("POST", "/v1/sessions", { token: creationKey, body: JSON.stringify({ ...good, padding: "x".repeat(80_000) }) });
      assert.equal(huge.status, 413);
    });

    test("admin endpoints need the session's management key", async () => {
      const { call, path, adminToken, slots } = await created(kind);
      assert.equal((await call("GET", path)).status, 401);
      const wrong = await call("GET", path, { token: secret() });
      assert.equal(wrong.status, 403);
      assert.equal(wrong.body.error.code, "FORBIDDEN");
      assert.equal((await call("GET", path, { token: slots[0]!.writeToken })).status, 403);
      assert.equal((await call("GET", `/v1/sessions/${id()}`, { token: adminToken })).status, 404);
      assert.equal((await call("GET", "/v1/sessions/not-an-id", { token: adminToken })).status, 404);
      const ok = await call("GET", path, { token: adminToken });
      assert.equal(ok.status, 200);
      assert.equal(ok.body.session.slotCount, 3);
    });

    test("closing is one-way and keeps the first closing time", async () => {
      const { call, path, adminToken, clock } = await created(kind);
      assert.equal((await call("PATCH", path, { token: adminToken, body: { isClosed: false } })).body.error.code, "VALIDATION_ERROR");
      assert.equal((await call("PATCH", path, { token: adminToken, body: {} })).body.error.code, "VALIDATION_ERROR");
      const closed = await call("PATCH", path, { token: adminToken, body: { isClosed: true } });
      assert.equal(closed.status, 200);
      assert.equal(closed.body.session.isClosed, true);
      assert.equal(closed.body.session.closedAt, START.toISOString());
      clock.advance(60_000);
      const again = await call("PATCH", path, { token: adminToken, body: { isClosed: true } });
      assert.equal(again.body.session.closedAt, START.toISOString());
    });

    test("expiry can move within 30 days of creation, never into the past", async () => {
      const { call, path, adminToken } = await created(kind);
      const at = (days: number) => new Date(START.getTime() + days * DAY).toISOString();
      const moved = await call("PATCH", path, { token: adminToken, body: { expiresAt: at(21) } });
      assert.equal(moved.body.session.expiresAt, at(21));
      for (const bad of [at(31), at(-1), "2026-11-20", "soon"]) {
        const reply = await call("PATCH", path, { token: adminToken, body: { expiresAt: bad } });
        assert.equal(reply.body.error.code, "VALIDATION_ERROR", bad);
      }
    });

    test("deleting a session is idempotent and needs its key", async () => {
      const { call, path, adminToken } = await created(kind);
      assert.equal((await call("DELETE", path)).status, 401);
      assert.equal((await call("DELETE", path, { token: secret() })).status, 403);
      assert.equal((await call("DELETE", path, { token: adminToken })).status, 204);
      assert.equal((await call("DELETE", path, { token: adminToken })).status, 204);
      assert.equal((await call("GET", path, { token: adminToken })).status, 404);
    });

    test("participant status pages in a stable order", async () => {
      const { call, path, adminToken, slots } = await created(kind, 7);
      const seen: string[] = [];
      let cursor: string | null = null;
      do {
        const query: string = cursor ? `?limit=3&cursor=${cursor}` : "?limit=3";
        const reply = await call("GET", `${path}/slots${query}`, { token: adminToken });
        assert.equal(reply.status, 200);
        assert.ok(reply.body.data.length <= 3);
        for (const slot of reply.body.data) {
          assert.deepEqual(Object.keys(slot).sort(), ["draftVersion", "slotId", "status", "submittedAt", "updatedAt"]);
          assert.equal(slot.status, "NOT_STARTED");
          seen.push(slot.slotId);
        }
        cursor = reply.body.nextCursor;
      } while (cursor);
      assert.deepEqual(seen, slots.map((s) => s.slotId).sort());
      for (const query of ["?limit=0", "?limit=51", "?limit=x", "?cursor=bad"])
        assert.equal((await call("GET", `${path}/slots${query}`, { token: adminToken })).body.error.code, "VALIDATION_ERROR");
    });

    test("participants can be added (idempotently) and removed", async () => {
      const { call, path, adminToken, slots } = await created(kind, 2, { maxSlots: 4 });
      const writeToken = secret();
      const extra = { slotId: id(), writeTokenHash: await sha256(writeToken) };
      const added = await call("POST", `${path}/slots`, { token: adminToken, body: { slots: [extra] } });
      assert.equal(added.status, 201);
      assert.equal(added.body.session.slotCount, 3);
      assert.equal((await call("POST", `${path}/slots`, { token: adminToken, body: { slots: [extra] } })).status, 200);
      const clash = await call("POST", `${path}/slots`, {
        token: adminToken,
        body: { slots: [{ slotId: extra.slotId, writeTokenHash: await sha256(secret()) }] },
      });
      assert.equal(clash.body.error.code, "SLOT_EXISTS");
      const tooMany = await call("POST", `${path}/slots`, {
        token: adminToken,
        body: { slots: [{ slotId: id(), writeTokenHash: await sha256(secret()) }, { slotId: id(), writeTokenHash: await sha256(secret()) }] },
      });
      assert.equal(tooMany.body.error.code, "LIMIT_EXCEEDED");
      assert.equal((await call("DELETE", `${path}/slots/${slots[0]!.slotId}`, { token: adminToken })).status, 204);
      assert.equal((await call("DELETE", `${path}/slots/${slots[0]!.slotId}`, { token: adminToken })).status, 204);
      const remaining = await call("GET", `${path}/slots`, { token: adminToken });
      assert.equal(remaining.body.data.length, 2);
      await call("PATCH", path, { token: adminToken, body: { isClosed: true } });
      const late = await call("POST", `${path}/slots`, {
        token: adminToken,
        body: { slots: [{ slotId: id(), writeTokenHash: await sha256(secret()) }] },
      });
      assert.equal(late.body.error.code, "SESSION_CLOSED");
    });

    test("draft and submission lists start empty", async () => {
      const { call, path, adminToken } = await created(kind);
      for (const list of ["drafts", "submissions"])
        assert.deepEqual((await call("GET", `${path}/${list}`, { token: adminToken })).body, { data: [], nextCursor: null });
    });

    test("every response carries no-store, no-referrer, nosniff and open CORS headers", async () => {
      const { call, path, adminToken } = await created(kind);
      for (const reply of [await call("GET", path, { token: adminToken }), await call("GET", path), await call("DELETE", path, { token: adminToken })]) {
        assert.equal(reply.headers.get("Cache-Control"), "no-store");
        assert.equal(reply.headers.get("Referrer-Policy"), "no-referrer");
        assert.equal(reply.headers.get("X-Content-Type-Options"), "nosniff");
        assert.equal(reply.headers.get("Access-Control-Allow-Origin"), "*");
      }
      const preflight = await call("OPTIONS", path, { headers: { Origin: "http://localhost:5173", "Access-Control-Request-Method": "PATCH" } });
      assert.equal(preflight.status, 204);
      assert.match(preflight.headers.get("Access-Control-Allow-Methods")!, /PATCH/);
      assert.match(preflight.headers.get("Access-Control-Allow-Headers")!, /Authorization/);
    });

    test("unknown paths and methods are NOT_FOUND", async () => {
      const { relay, call, path, adminToken } = await created(kind);
      for (const [method, p] of [["GET", "/v2/health"], ["GET", "/v1/other"], ["PUT", path], ["GET", `${path}/unknown`], ["POST", "/v1/health"]] as const) {
        const reply = await call(method, p, { token: adminToken });
        assert.equal(reply.status, 404, `${method} ${p}`);
        assert.equal(reply.body.error.code, "NOT_FOUND");
      }
      assert.equal((await relay(new Request("https://mpile.example/api/v1/health"))).status, 404);
    });

    test("internal failures return a generic 500 and log only the route template", async () => {
      const failing = (s: RelayStore): RelayStore => ({
        ...s,
        getSession: async () => {
          throw new Error("disk exploded while reading secret-session-data");
        },
      });
      const { call } = await harness(kind, {}, failing);
      const logged: unknown[][] = [];
      const original = console.error;
      console.error = (...args: unknown[]) => void logged.push(args);
      try {
        const sessionId = id();
        const token = secret();
        const reply = await call("GET", `/v1/sessions/${sessionId}`, { token });
        assert.equal(reply.status, 500);
        assert.deepEqual(reply.body, { error: { code: "INTERNAL", message: "The relay could not complete this request. Please retry." } });
        assert.deepEqual(logged, [["relay", "INTERNAL", "GET /v1/sessions/:sessionId"]]);
        assert.doesNotMatch(JSON.stringify(logged), new RegExp(`${sessionId}|${token}|secret-session-data`));
      } finally {
        console.error = original;
      }
    });
  });
}
