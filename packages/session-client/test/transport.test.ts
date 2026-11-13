import { test } from "node:test";
import assert from "node:assert/strict";
import { SessionError } from "../src/index.ts";
import { shapes, transport } from "../src/transport.ts";

type Step = Response | Error;
const reply = (status: number, body?: unknown) =>
  new Response(body === undefined ? null : typeof body === "string" ? body : JSON.stringify(body), { status });

function scripted(steps: Step[]) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetch = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const step = steps[Math.min(calls.length - 1, steps.length - 1)]!;
    if (step instanceof Error) throw step;
    return step.clone();
  }) as unknown as typeof globalThis.fetch;
  return { calls, call: transport("https://relay.example/relay/", { fetch, retryDelaysMs: [0, 0, 0] }) };
}

const rejectsWith = (code: string, details?: Record<string, unknown>) => (error: unknown) => {
  assert.ok(error instanceof SessionError, String(error));
  assert.equal(error.code, code);
  if (details) for (const [k, v] of Object.entries(details)) assert.deepEqual(error.details?.[k], v, k);
  return true;
};

const health = (v: unknown): v is { ok: true } => typeof v === "object" && v !== null && (v as { ok?: unknown }).ok === true;

test("requests join the relay URL, carry the bearer token, and send the body unchanged", async () => {
  const { calls, call } = scripted([reply(200, { ok: true })]);
  const body = '{"b":2,"a":1}';
  assert.deepEqual(await call("POST", "/v1/sessions", { token: "abc", body, check: health }), { ok: true });
  assert.equal(calls[0]!.url, "https://relay.example/relay/v1/sessions");
  assert.deepEqual(calls[0]!.init.headers, { Authorization: "Bearer abc", "Content-Type": "application/json" });
  assert.equal(calls[0]!.init.body, body);
  await call("GET", "/v1/health", { check: health });
  assert.deepEqual(calls[1]!.init.headers, {});
});

test("network failures and 502/503/504 are retried, then succeed", async () => {
  const offline = scripted([new TypeError("fetch failed"), new TypeError("fetch failed"), reply(200, { ok: true })]);
  await offline.call("GET", "/v1/health", { check: health });
  assert.equal(offline.calls.length, 3);
  const busy = scripted([reply(503), reply(502), reply(504), reply(200, { ok: true })]);
  await busy.call("GET", "/v1/health", { check: health });
  assert.equal(busy.calls.length, 4);
});

test("giving up reports NETWORK with the reason", async () => {
  const offline = scripted([new TypeError("fetch failed")]);
  await assert.rejects(offline.call("GET", "/v1/health", { check: health }), rejectsWith("NETWORK", { reason: "OFFLINE" }));
  assert.equal(offline.calls.length, 4);
  const busy = scripted([reply(503)]);
  await assert.rejects(busy.call("GET", "/v1/health", { check: health }), rejectsWith("NETWORK", { reason: "SERVER_ERROR", status: 503 }));
  const broken = scripted([reply(500, { error: { code: "INTERNAL", message: "x" } })]);
  await assert.rejects(broken.call("GET", "/v1/health", { check: health }), rejectsWith("NETWORK", { reason: "SERVER_ERROR", status: 500 }));
  assert.equal(broken.calls.length, 1, "500 is not retried");
});

test("relay errors map to session errors and are never retried", async () => {
  const cases: [string, number, Record<string, unknown> | undefined, string, Record<string, unknown>][] = [
    ["VERSION_CONFLICT", 409, { draftVersion: 3 }, "VERSION_CONFLICT", { draftVersion: 3 }],
    ["RATE_LIMITED", 429, { retryAfter: 120 }, "TOO_MANY_ATTEMPTS", { retryAfter: 120 }],
    ["PAYLOAD_TOO_LARGE", 413, undefined, "TOO_LARGE", {}],
    ["SESSION_EXPIRED", 410, undefined, "SESSION_EXPIRED", {}],
    ["FORBIDDEN", 403, undefined, "FORBIDDEN", {}],
    ["VALIDATION_ERROR", 422, undefined, "RELAY_REJECTED", { relayCode: "VALIDATION_ERROR" }],
    ["UNAUTHORIZED", 401, undefined, "RELAY_REJECTED", { relayCode: "UNAUTHORIZED" }],
  ];
  for (const [relayCode, status, details, code, expected] of cases) {
    const s = scripted([reply(status, { error: { code: relayCode, message: "m", ...(details ? { details } : {}) } })]);
    await assert.rejects(s.call("GET", "/v1/x", { check: health }), rejectsWith(code, expected));
    assert.equal(s.calls.length, 1);
  }
});

test("unreadable or unexpected replies are INVALID_RELAY_RESPONSE", async () => {
  for (const step of [reply(200, "<html>"), reply(200, { ok: "yes" }), reply(404, "Not here"), reply(409, { problem: 1 })]) {
    await assert.rejects(scripted([step]).call("GET", "/v1/x", { check: health }), rejectsWith("INVALID_RELAY_RESPONSE"));
  }
});

test("204 replies satisfy the nothing shape", async () => {
  assert.equal(await scripted([reply(204)]).call("DELETE", "/v1/sessions/x", { token: "t", check: shapes.nothing }), undefined);
});
