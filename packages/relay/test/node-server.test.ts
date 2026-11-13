import { test } from "node:test";
import assert from "node:assert/strict";
import { createRelay, memoryStore } from "../src/index.ts";
import { serveNode } from "../src/node.ts";
import { newSession } from "./harness.ts";
import { secret, sha256 } from "./helpers.ts";

test("serveNode serves the relay contract over HTTP, including CORS for a localhost console", async () => {
  const store = memoryStore();
  const creationKey = secret();
  const relay = createRelay({ store, creationKeyHashes: [await sha256(creationKey)] });
  const server = await serveNode(relay, { host: "127.0.0.1", port: 0, store });
  try {
    const base = `${server.url}/relay/v1`;
    assert.deepEqual(await (await fetch(`${base}/health`)).json(), { ok: true, version: "0.1.1" });
    const s = await newSession(2);
    s.body.sessionId = s.sessionId;
    const create = await fetch(`${base}/sessions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${creationKey}`, "Content-Type": "application/json", Origin: "http://localhost:5173" },
      body: JSON.stringify(s.body),
    });
    assert.equal(create.status, 201);
    assert.equal(create.headers.get("access-control-allow-origin"), "*");
    const status = await fetch(`${base}/sessions/${s.sessionId}`, { headers: { Authorization: `Bearer ${s.adminToken}` } });
    assert.equal((await status.json()).session.slotCount, 2);
    const preflight = await fetch(`${base}/sessions/${s.sessionId}`, {
      method: "OPTIONS",
      headers: { Origin: "http://localhost:5173", "Access-Control-Request-Method": "PATCH" },
    });
    assert.equal(preflight.status, 204);
  } finally {
    await server.close();
  }
});
