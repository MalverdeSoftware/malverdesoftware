import { bearer, empty, errorResponse, fail, json, preflight, safeEqual, sha256 } from "./http.ts";
import {
  ID,
  appField,
  envelopeField,
  hashField,
  idField,
  instantField,
  intField,
  readBody,
  slotsField,
} from "./validate.ts";
import type { RelayStore, SessionRow, SlotFilter, SlotRow } from "./store.ts";

export const RELAY_VERSION = "0.1.1";
const DAY = 86_400_000;

export type RelayLimits = {
  maxSlots: number;
  maxEnvelopeBytes: number;
  defaultExpiryDays: number;
  maxExpiryDays: number;
  defaultPageSize: number;
  maxPageSize: number;
  maxSlotAuthFailures: number;
  slotLockMinutes: number;
};

export const DEFAULT_LIMITS: RelayLimits = {
  maxSlots: 200,
  maxEnvelopeBytes: 262_144,
  defaultExpiryDays: 14,
  maxExpiryDays: 30,
  defaultPageSize: 20,
  maxPageSize: 50,
  maxSlotAuthFailures: 5,
  slotLockMinutes: 60,
};

export type RelayOptions = {
  store: RelayStore;
  creationKeyHashes: string[];
  basePath?: string;
  limits?: Partial<RelayLimits>;
  now?: () => Date;
};

const notFound = (): never => fail(404, "NOT_FOUND", "Not found.");

export function createRelay(options: RelayOptions): (request: Request) => Promise<Response> {
  const { store } = options;
  const limits: RelayLimits = { ...DEFAULT_LIMITS, ...options.limits };
  const basePath = (options.basePath ?? "/relay").replace(/\/+$/, "");
  const clock = options.now ?? (() => new Date());
  const creationKeyHashes = [...options.creationKeyHashes];
  const bodyLimit = limits.maxEnvelopeBytes + 65_536;

  async function summary(s: SessionRow) {
    const c = await store.countSlots(s.sessionId);
    return {
      sessionId: s.sessionId,
      app: s.app,
      createdAt: s.createdAt,
      expiresAt: s.expiresAt,
      isClosed: s.closedAt !== null,
      closedAt: s.closedAt,
      slotCount: c.total,
      counts: { notStarted: c.total - c.inProgress - c.submitted, inProgress: c.inProgress, submitted: c.submitted },
    };
  }

  const slotSummary = (r: SlotRow) => ({
    slotId: r.slotId,
    status: r.submission !== null ? "SUBMITTED" : r.draftVersion > 0 ? "IN_PROGRESS" : "NOT_STARTED",
    draftVersion: r.draftVersion,
    updatedAt: r.updatedAt,
    submittedAt: r.submittedAt,
  });

  // Missing sessions are 404; an expired session is deleted on first touch and reported once as 410.
  async function loadSession(sessionId: string): Promise<SessionRow> {
    const s = await store.getSession(sessionId);
    if (!s) return notFound();
    if (s.expiresAt <= clock().toISOString()) {
      await store.deleteSession(sessionId);
      fail(410, "SESSION_EXPIRED", "This activity has ended and its data has been deleted.");
    }
    return s;
  }

  async function asCreator(request: Request) {
    const hash = await sha256(bearer(request));
    if (!creationKeyHashes.some((h) => safeEqual(h, hash)))
      fail(403, "FORBIDDEN", "This creation key is not valid.");
  }

  async function asAdmin(request: Request, sessionId: string): Promise<SessionRow> {
    const token = bearer(request);
    const s = await loadSession(sessionId);
    if (!safeEqual(await sha256(token), s.adminHash)) fail(403, "FORBIDDEN", "This management key is not valid.");
    return s;
  }

  // A write token depends on the participant's passcode, so a wrong token is usually a wrong passcode.
  async function asSlot(request: Request, sessionId: string, slotId: string) {
    const token = bearer(request);
    const session = await loadSession(sessionId);
    const slot = await store.getSlot(sessionId, slotId);
    if (!slot) return notFound();
    const now = clock();
    if (slot.lockedUntil !== null && slot.lockedUntil > now.toISOString()) {
      const retryAfter = Math.ceil((Date.parse(slot.lockedUntil) - now.getTime()) / 1000);
      fail(429, "RATE_LIMITED", "Too many wrong passcodes. Try again later.", { retryAfter }, {
        "Retry-After": String(retryAfter),
      });
    }
    if (!safeEqual(await sha256(token), slot.writeHash)) {
      const lockUntil = new Date(now.getTime() + limits.slotLockMinutes * 60_000).toISOString();
      await store.recordSlotAuthFailure(sessionId, slotId, limits.maxSlotAuthFailures, lockUntil);
      fail(403, "FORBIDDEN", "This link or passcode is not valid.");
    }
    if (slot.failedAttempts !== 0 || slot.lockedUntil !== null) await store.resetSlotAuthFailures(sessionId, slotId);
    return { session, slot };
  }

  function page(url: URL) {
    const cursor = url.searchParams.get("cursor");
    const limit = url.searchParams.get("limit");
    if (cursor !== null && !ID.test(cursor)) fail(422, "VALIDATION_ERROR", "cursor is not valid.");
    const size =
      limit === null
        ? limits.defaultPageSize
        : intField(/^\d+$/.test(limit) ? Number(limit) : NaN, 1, limits.maxPageSize, "limit");
    return { after: cursor ?? undefined, limit: size };
  }

  async function paged<T>(sessionId: string, url: URL, filter: SlotFilter | undefined, map: (r: SlotRow) => T) {
    const { after, limit } = page(url);
    const rows = await store.listSlots(sessionId, { after, limit: limit + 1, filter });
    const data = rows.slice(0, limit).map(map);
    return json({ data, nextCursor: rows.length > limit ? rows[limit - 1]!.slotId : null });
  }

  async function createSession(request: Request) {
    await asCreator(request);
    const { raw, data } = await readBody(request, bodyLimit);
    const sessionId = idField(data.sessionId, "sessionId");
    const days =
      data.expiresInDays === undefined
        ? limits.defaultExpiryDays
        : intField(data.expiresInDays, 1, limits.maxExpiryDays, "expiresInDays");
    const created = clock();
    const row: SessionRow = {
      sessionId,
      app: appField(data.app),
      adminHash: hashField(data.adminTokenHash, "adminTokenHash"),
      requestHash: await sha256(raw),
      definition: envelopeField(data.definition, limits.maxEnvelopeBytes, "definition"),
      createdAt: created.toISOString(),
      expiresAt: new Date(created.getTime() + days * DAY).toISOString(),
      closedAt: null,
    };
    const slots = slotsField(data.slots, limits.maxSlots);
    if ((await store.insertSession(row, slots)) === "INSERTED") return json({ session: await summary(row) }, 201);
    const existing = await store.getSession(sessionId);
    if (existing && safeEqual(existing.requestHash, row.requestHash))
      return json({ session: await summary(existing) });
    return fail(409, "SESSION_EXISTS", "A session with this ID already exists.");
  }

  async function updateSession(request: Request, sessionId: string) {
    const s = await asAdmin(request, sessionId);
    const { data } = await readBody(request, bodyLimit);
    if (!("isClosed" in data) && !("expiresAt" in data))
      fail(422, "VALIDATION_ERROR", "Send isClosed, expiresAt or both.");
    if ("isClosed" in data && data.isClosed !== true)
      fail(422, "VALIDATION_ERROR", "isClosed can only be set to true; closing cannot be undone.");
    const patch: { closedAt?: string; expiresAt?: string } = {};
    if (data.isClosed === true && s.closedAt === null) patch.closedAt = clock().toISOString();
    if ("expiresAt" in data) {
      const expiresAt = instantField(data.expiresAt, "expiresAt");
      if (expiresAt <= clock() || expiresAt.getTime() > Date.parse(s.createdAt) + limits.maxExpiryDays * DAY)
        fail(422, "VALIDATION_ERROR", `expiresAt must be in the future and within ${limits.maxExpiryDays} days of creation.`);
      patch.expiresAt = expiresAt.toISOString();
    }
    await store.updateSession(sessionId, patch);
    return json({ session: await summary((await store.getSession(sessionId))!) });
  }

  async function deleteSession(request: Request, sessionId: string) {
    const token = bearer(request);
    const s = await store.getSession(sessionId);
    if (!s) return empty();
    if (!safeEqual(await sha256(token), s.adminHash)) fail(403, "FORBIDDEN", "This management key is not valid.");
    await store.deleteSession(sessionId);
    return empty();
  }

  async function addSlots(request: Request, sessionId: string) {
    const s = await asAdmin(request, sessionId);
    const { data } = await readBody(request, bodyLimit);
    const slots = slotsField(data.slots, limits.maxSlots);
    const existing = await Promise.all(slots.map((n) => store.getSlot(sessionId, n.slotId)));
    if (existing.every((r, i) => r && safeEqual(r.writeHash, slots[i]!.writeHash))) return json({ session: await summary(s) });
    if (existing.some((r) => r)) fail(409, "SLOT_EXISTS", "One of these participants already exists.");
    if (s.closedAt !== null) fail(409, "SESSION_CLOSED", "This session is closed.");
    if ((await store.countSlots(sessionId)).total + slots.length > limits.maxSlots)
      fail(422, "LIMIT_EXCEEDED", `A session can have at most ${limits.maxSlots} participants.`);
    if ((await store.insertSlots(sessionId, slots)) === "DUPLICATE")
      fail(409, "SLOT_EXISTS", "One of these participants already exists.");
    return json({ session: await summary(s) }, 201);
  }

  async function participantView(request: Request, sessionId: string, slotId: string) {
    const { session, slot } = await asSlot(request, sessionId, slotId);
    return json({
      slot: slotSummary(slot),
      definition: JSON.parse(session.definition),
      draft: slot.draft === null ? null : JSON.parse(slot.draft),
      session: { expiresAt: session.expiresAt, isClosed: session.closedAt !== null },
    });
  }

  const refuseDraft = (s: SessionRow, r: SlotRow) => {
    if (r.submission !== null) fail(409, "ALREADY_SUBMITTED", "This response has already been submitted.");
    if (s.closedAt !== null) fail(409, "SESSION_CLOSED", "This activity is closed.");
  };

  async function saveDraft(request: Request, sessionId: string, slotId: string) {
    const { session, slot } = await asSlot(request, sessionId, slotId);
    const { data } = await readBody(request, bodyLimit);
    const envelope = envelopeField(data.envelope, limits.maxEnvelopeBytes);
    const baseVersion = intField(data.baseVersion, 0, Number.MAX_SAFE_INTEGER, "baseVersion");
    refuseDraft(session, slot);
    const updatedAt = clock().toISOString();
    if (await store.writeDraft(sessionId, slotId, envelope, baseVersion, updatedAt))
      return json({ draftVersion: baseVersion + 1, updatedAt });
    const [s, r] = await Promise.all([store.getSession(sessionId), store.getSlot(sessionId, slotId)]);
    if (!s || !r) return notFound();
    refuseDraft(s, r);
    return fail(409, "VERSION_CONFLICT", "This response changed on another device.", { draftVersion: r.draftVersion });
  }

  async function submit(request: Request, sessionId: string, slotId: string) {
    const { session, slot } = await asSlot(request, sessionId, slotId);
    const { data } = await readBody(request, bodyLimit);
    const envelope = envelopeField(data.envelope, limits.maxEnvelopeBytes);
    const hash = await sha256(envelope);
    // An identical retry replays the first result, even after the session closes.
    const settled = (s: SessionRow, r: SlotRow) => {
      if (r.submissionHash !== null && safeEqual(r.submissionHash, hash)) return json({ submittedAt: r.submittedAt });
      if (r.submission !== null) fail(409, "ALREADY_SUBMITTED", "This response has already been submitted.");
      if (s.closedAt !== null) fail(409, "SESSION_CLOSED", "This activity is closed.");
      return null;
    };
    const early = settled(session, slot);
    if (early) return early;
    const submittedAt = clock().toISOString();
    if (await store.writeSubmission(sessionId, slotId, envelope, hash, submittedAt)) return json({ submittedAt }, 201);
    const [s, r] = await Promise.all([store.getSession(sessionId), store.getSlot(sessionId, slotId)]);
    if (!s || !r) return notFound();
    return settled(s, r) ?? notFound();
  }

  type Route = { template: string; run: () => Promise<Response> };

  // Resolves the route before running it, so a failure can be logged by its template alone.
  function match(request: Request, url: URL, parts: string[]): Route | null {
    const method = request.method;
    const [version, resource, sessionId, sub, slotId, leaf] = parts;
    if (version !== "v1") return null;
    if (resource === "health" && parts.length === 2 && method === "GET")
      return { template: "GET /v1/health", run: async () => json({ ok: true, version: RELAY_VERSION }) };
    if (resource !== "sessions") return null;
    if (parts.length === 2 && method === "POST")
      return { template: "POST /v1/sessions", run: () => createSession(request) };
    if (!sessionId || !ID.test(sessionId)) return null;
    const s = "/v1/sessions/:sessionId";
    const admin = (template: string, run: () => Promise<Response>): Route => ({
      template,
      run: async () => {
        await asAdmin(request, sessionId);
        return run();
      },
    });
    if (parts.length === 3) {
      if (method === "GET")
        return { template: `GET ${s}`, run: async () => json({ session: await summary(await asAdmin(request, sessionId)) }) };
      if (method === "PATCH") return { template: `PATCH ${s}`, run: () => updateSession(request, sessionId) };
      if (method === "DELETE") return { template: `DELETE ${s}`, run: () => deleteSession(request, sessionId) };
      return null;
    }
    if (parts.length === 4 && method === "GET" && sub === "slots")
      return admin(`GET ${s}/slots`, () => paged(sessionId, url, undefined, slotSummary));
    if (parts.length === 4 && method === "POST" && sub === "slots")
      return { template: `POST ${s}/slots`, run: () => addSlots(request, sessionId) };
    if (parts.length === 4 && method === "GET" && sub === "drafts")
      return admin(`GET ${s}/drafts`, () =>
        paged(sessionId, url, "DRAFT", (r) => ({
          slotId: r.slotId,
          envelope: JSON.parse(r.draft!),
          draftVersion: r.draftVersion,
          updatedAt: r.updatedAt,
        })),
      );
    if (parts.length === 4 && method === "GET" && sub === "submissions")
      return admin(`GET ${s}/submissions`, () =>
        paged(sessionId, url, "SUBMISSION", (r) => ({
          slotId: r.slotId,
          envelope: JSON.parse(r.submission!),
          submittedAt: r.submittedAt,
        })),
      );
    if (sub !== "slots" || !slotId || !ID.test(slotId)) return null;
    if (parts.length === 5 && method === "DELETE")
      return admin(`DELETE ${s}/slots/:slotId`, async () => {
        await store.deleteSlot(sessionId, slotId);
        return empty();
      });
    if (parts.length === 5 && method === "GET")
      return { template: `GET ${s}/slots/:slotId`, run: () => participantView(request, sessionId, slotId) };
    if (parts.length === 6 && method === "PUT" && leaf === "draft")
      return { template: `PUT ${s}/slots/:slotId/draft`, run: () => saveDraft(request, sessionId, slotId) };
    if (parts.length === 6 && method === "PUT" && leaf === "submission")
      return { template: `PUT ${s}/slots/:slotId/submission`, run: () => submit(request, sessionId, slotId) };
    return null;
  }

  return async function relay(request: Request): Promise<Response> {
    let template = "unmatched";
    try {
      const url = new URL(request.url);
      if (!url.pathname.startsWith(basePath + "/")) return notFound();
      if (request.method === "OPTIONS") return preflight();
      const route = match(request, url, url.pathname.slice(basePath.length + 1).split("/"));
      if (!route) return notFound();
      template = route.template;
      return await route.run();
    } catch (error) {
      return errorResponse(error, template);
    }
  };
}
