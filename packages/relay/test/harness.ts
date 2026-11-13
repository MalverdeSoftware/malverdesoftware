import { createRelay, memoryStore, sqlStore } from "../src/index.ts";
import type { RelayLimits, RelayStore } from "../src/index.ts";
import { nodeSqliteDatabase } from "../src/node.ts";
import { envelope, id, secret, sha256 } from "./helpers.ts";

export const STORES = ["memory", "node:sqlite"] as const;
export type StoreKind = (typeof STORES)[number];
export const START = new Date("2026-11-05T15:00:00.000Z");
export const DAY = 86_400_000;

export type Reply = { status: number; headers: Headers; body: any };
type CallOptions = { token?: string; body?: unknown; headers?: Record<string, string> };

export async function harness(kind: StoreKind, limits: Partial<RelayLimits> = {}, wrap?: (s: RelayStore) => RelayStore) {
  const base = kind === "memory" ? memoryStore() : sqlStore(nodeSqliteDatabase(":memory:"));
  const store = wrap ? wrap(base) : base;
  const creationKey = secret();
  let now = START;
  const clock = {
    now: () => now,
    advance: (ms: number) => {
      now = new Date(now.getTime() + ms);
    },
  };
  const relay = createRelay({ store, creationKeyHashes: [await sha256(creationKey)], limits, now: clock.now });

  async function call(method: string, path: string, options: CallOptions = {}): Promise<Reply> {
    const headers: Record<string, string> = { ...options.headers };
    if (options.token) headers.Authorization = `Bearer ${options.token}`;
    let body: string | undefined;
    if (options.body !== undefined) {
      headers["Content-Type"] ??= "application/json";
      body = typeof options.body === "string" ? options.body : JSON.stringify(options.body);
    }
    const response = await relay(new Request(`https://mpile.example/relay${path}`, { method, headers, body }));
    const text = await response.text();
    return { status: response.status, headers: response.headers, body: text ? JSON.parse(text) : null };
  }

  return { store, relay, call, clock, creationKey };
}

// Everything a researcher's client would send to create a session, plus the secrets it keeps.
export async function newSession(slotCount = 3) {
  const adminToken = secret();
  const slots = await Promise.all(
    Array.from({ length: slotCount }, async () => {
      const writeToken = secret();
      return { slotId: id(), writeToken, writeTokenHash: await sha256(writeToken) };
    }),
  );
  return {
    sessionId: id(),
    adminToken,
    slots,
    body: {
      sessionId: "",
      app: "mpile",
      adminTokenHash: await sha256(adminToken),
      definition: envelope(),
      slots: slots.map(({ slotId, writeTokenHash }) => ({ slotId, writeTokenHash })),
    },
  };
}

export async function created(kind: StoreKind, slotCount = 3, limits: Partial<RelayLimits> = {}) {
  const h = await harness(kind, limits);
  const s = await newSession(slotCount);
  s.body.sessionId = s.sessionId;
  const reply = await h.call("POST", "/v1/sessions", { token: h.creationKey, body: s.body });
  if (reply.status !== 201) throw new Error(`setup failed: ${JSON.stringify(reply.body)}`);
  return { ...h, ...s, path: `/v1/sessions/${s.sessionId}` };
}
