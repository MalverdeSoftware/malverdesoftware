# Spec: relay

Module id `relay` · October 25, 2026 · **Status: approved by the author on October 25; passcode lockout was added the same day at their suggestion.** It has no code dependencies. It validates envelope *shape* against the [sealed-envelope wire format](SPEC-sealed-envelope.md#wire-format-v1) but never opens one. Commands, structure, code style and repository-wide boundaries are in the [capability map](round1-capability-map.md#repository-conventions-for-malverdesoftware).

## Objective

A store that holds sealed session data it cannot read, enforces who may write what, and forgets everything on deletion or expiry. Each app's deployment mounts it at `/relay`. For round 1 that is mPile's Cloudflare Worker at `mpile.app/relay`, backed by a **new** D1 database containing only relay tables, separate from mPile's existing plaintext tables. The same handler runs on Node with `node:sqlite`, which is the path to a VPS or JHU Azure.

## Package interface

```ts
// @malverdesoftware/relay — runs anywhere with the Fetch API and WebCrypto
export function createRelay(options: RelayOptions): (request: Request) => Promise<Response>;
export function purgeExpired(store: RelayStore, now?: Date): Promise<number>; // returns sessions deleted
export function memoryStore(): RelayStore;
export function sqlStore(db: SqlDatabase): RelayStore;
export function d1Database(d1: D1DatabaseLike): SqlDatabase; // structural subset; Cloudflare's D1Database fits
export const schemaSql: string;                                // identical to sql/schema.sql
export const DEFAULT_LIMITS: RelayLimits;
export const RELAY_VERSION: string;                            // reported by GET /v1/health

export type RelayOptions = {
  store: RelayStore;
  creationKeyHashes: string[]; // hashToken() of each operator-issued creation key
  basePath?: string;           // default "/relay"
  limits?: Partial<RelayLimits>;
  now?: () => Date;            // injected in tests
};
export type RelayLimits = {
  maxSlots: number;            // 200
  maxEnvelopeBytes: number;    // 262_144, serialized envelope JSON
  defaultExpiryDays: number;   // 14
  maxExpiryDays: number;       // 30, counted from creation
  defaultPageSize: number;     // 20
  maxPageSize: number;         // 50
  maxSlotAuthFailures: number; // 5 consecutive wrong tokens (wrong passcodes) lock a slot
  slotLockMinutes: number;     // 60
};

// @malverdesoftware/relay/node — kept out of Worker bundles
export function nodeSqliteDatabase(path: string): SqlDatabase;
export function serveNode(handler: (r: Request) => Promise<Response>, options: { host: string; port: number; store: RelayStore }): Promise<{ url: string; close(): Promise<void> }>;
// serveNode also runs purgeExpired at start and hourly; port 0 picks a free port
```

`RelayStore` is an adapter interface for storage backends, not something apps call. Every method that changes state is a single atomic operation, so concurrency and idempotency rest on primary keys and conditional updates, not on read-then-write.

```ts
export interface RelayStore {
  insertSession(session: SessionRow, slots: NewSlot[]): Promise<"INSERTED" | "DUPLICATE">; // NewSlot = { slotId, writeHash }
  getSession(sessionId: string): Promise<SessionRow | null>;
  updateSession(sessionId: string, patch: { closedAt?: string; expiresAt?: string }): Promise<void>;
  deleteSession(sessionId: string): Promise<void>;            // deletes slots explicitly; does not rely on cascades
  insertSlots(sessionId: string, slots: NewSlot[]): Promise<"INSERTED" | "DUPLICATE">;      // all or nothing
  deleteSlot(sessionId: string, slotId: string): Promise<void>;
  getSlot(sessionId: string, slotId: string): Promise<SlotRow | null>;
  listSlots(sessionId: string, page: { after?: string; limit: number; filter?: "DRAFT" | "SUBMISSION" }): Promise<SlotRow[]>; // ordered by slotId
  countSlots(sessionId: string): Promise<{ total: number; inProgress: number; submitted: number }>;
  // Draft and submission writes also require the session to be open, checked in the same statement.
  writeDraft(sessionId: string, slotId: string, envelope: string, baseVersion: number, now: string): Promise<boolean>;
  writeSubmission(sessionId: string, slotId: string, envelope: string, envelopeHash: string, now: string): Promise<boolean>;
  recordSlotAuthFailure(sessionId: string, slotId: string, lockAfter: number, lockUntil: string): Promise<void>; // atomic; locking restarts the count
  resetSlotAuthFailures(sessionId: string, slotId: string): Promise<void>;
  purgeExpired(now: string): Promise<number>;
}
```

## Storage schema

The schema holds no IP addresses, user agents, labels or plaintext.

```sql
CREATE TABLE IF NOT EXISTS relay_sessions (
  session_id   TEXT PRIMARY KEY,
  app          TEXT NOT NULL,
  admin_hash   TEXT NOT NULL,
  request_hash TEXT NOT NULL,   -- SHA-256 of the creation request body, for idempotent replay
  definition   TEXT NOT NULL,   -- envelope JSON
  created_at   TEXT NOT NULL,
  expires_at   TEXT NOT NULL,
  closed_at    TEXT
);
CREATE TABLE IF NOT EXISTS relay_slots (
  session_id      TEXT NOT NULL,
  slot_id         TEXT NOT NULL,
  write_hash      TEXT NOT NULL,
  draft           TEXT,
  draft_version   INTEGER NOT NULL DEFAULT 0,
  submission      TEXT,
  submission_hash TEXT,
  updated_at      TEXT,
  submitted_at    TEXT,
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until    TEXT,
  PRIMARY KEY (session_id, slot_id)
);
CREATE INDEX IF NOT EXISTS idx_relay_sessions_expires_at ON relay_sessions (expires_at);
```

## HTTP contract v1

All paths sit under `basePath`. Authentication uses `Authorization: Bearer <token>`, with three roles:
- **CREATOR:** an operator-issued creation key.
- **ADMIN:** the session's admin token, held only in the researcher's session file.
- **SLOT:** one participant's write token, derived from their link.

The relay stores only hashes of these tokens and compares them in constant time.

| Method and path | Role | Request body / query | Success |
|---|---|---|---|
| `POST /v1/sessions` | CREATOR | `{ sessionId, app, adminTokenHash, expiresInDays?, definition, slots: [{ slotId, writeTokenHash }] }` | `201 { session }`; `200 { session }` on an identical replay |
| `GET /v1/sessions/:sessionId` | ADMIN | — | `200 { session }` |
| `PATCH /v1/sessions/:sessionId` | ADMIN | `{ isClosed?: true, expiresAt? }` | `200 { session }` |
| `DELETE /v1/sessions/:sessionId` | ADMIN | — | `204`, also when already gone |
| `GET /v1/sessions/:sessionId/slots` | ADMIN | `?cursor&limit` | `200 { data: SlotSummary[], nextCursor }` |
| `POST /v1/sessions/:sessionId/slots` | ADMIN | `{ slots: [{ slotId, writeTokenHash }] }` | `201 { session }`; `200` on an identical replay |
| `DELETE /v1/sessions/:sessionId/slots/:slotId` | ADMIN | — | `204`; removes that slot's draft and submission |
| `GET /v1/sessions/:sessionId/drafts` | ADMIN | `?cursor&limit` | `200 { data: [{ slotId, envelope, draftVersion, updatedAt }], nextCursor }` |
| `GET /v1/sessions/:sessionId/submissions` | ADMIN | `?cursor&limit` | `200 { data: [{ slotId, envelope, submittedAt }], nextCursor }` |
| `GET /v1/sessions/:sessionId/slots/:slotId` | SLOT | — | `200 { slot: SlotSummary, definition, draft, session: { expiresAt, isClosed } }` |
| `PUT /v1/sessions/:sessionId/slots/:slotId/draft` | SLOT | `{ envelope, baseVersion }` | `200 { draftVersion, updatedAt }` |
| `PUT /v1/sessions/:sessionId/slots/:slotId/submission` | SLOT | `{ envelope }` | `201 { submittedAt }`; `200` on an identical replay |
| `GET /v1/health` | none | — | `200 { ok: true, version }` |

Reserved, not implemented: `/v1/sessions/:sessionId/shared` for mVote's shared channel.

```ts
type SessionSummary = {
  sessionId: string; app: string; createdAt: string; expiresAt: string;
  isClosed: boolean; closedAt: string | null; slotCount: number;
  counts: { notStarted: number; inProgress: number; submitted: number };
};
type SlotSummary = {
  slotId: string; status: "NOT_STARTED" | "IN_PROGRESS" | "SUBMITTED";
  draftVersion: number; updatedAt: string | null; submittedAt: string | null;
};
```

### Rules

- **Lifecycle.** A session is open → closed (`PATCH isClosed: true`, one way) → deleted (`DELETE`, or expiry). Closing stops all participant writes so the researcher can collect a stable set before deleting. `isClosed: false` returns `422`.
- **Expiry.** `expiresAt` must be later than now and no more than `maxExpiryDays` after `createdAt`. Any request that touches an expired session deletes it and returns `410 SESSION_EXPIRED`. Later requests get `404`. `purgeExpired` deletes all expired sessions; round 1 runs it hourly from a Cloudflare cron trigger, and `serveNode` runs it hourly on Node.
- **Creating a session is idempotent on `sessionId`.** The client generates the ID once per session, so it is derived from the intent, not the attempt. The insert is atomic. On a duplicate, an identical `request_hash` replays `200`; anything else returns `409 SESSION_EXISTS`. Adding slots follows the same rule per slot (`409 SLOT_EXISTS`).
- **Drafts** use optimistic concurrency: the write succeeds only if `baseVersion` equals the stored `draft_version` and no submission exists. On failure the relay returns `409 ALREADY_SUBMITTED` or `409 VERSION_CONFLICT` with `details: { draftVersion }`.
- **Submission is write-once.** The conditional write succeeds only while `submission IS NULL`, and it clears the draft. A retry with the same envelope (same SHA-256) replays `200`; a different envelope returns `409 ALREADY_SUBMITTED`. Clients must keep the exact envelope until they get a response.
- **Wrong passcodes.** A write token depends on the participant's passcode, so a wrong token on a SLOT request usually means a wrong passcode.
  - A request to a locked slot returns `429 RATE_LIMITED` with a `Retry-After` header and `details: { retryAfter }`, before any token check.
  - A wrong token increments the slot's failure count atomically. The fifth consecutive failure locks the slot for `slotLockMinutes`.
  - A correct token resets the count.
  - This limits someone holding a leaked link to 5 passcode guesses an hour, against a million possible passcodes.
- **Retention.** Idempotency records live as long as the session rows they belong to, which outlives any client retry.
- **Validation at the boundary.** Request bodies must be `application/json` (`415`). Bodies are read as a bounded stream (`413` past the limit, as mPile's `read()` does today). IDs are 22-character base64url, hashes 43-character base64url, `app` matches `[a-z0-9-]{1,40}`, and envelopes must match the v1 shape and size. Unknown fields are ignored and never stored. Envelopes are re-serialized from validated fields only.
- **Pagination.** Cursors are opaque strings. `limit` defaults to `defaultPageSize` and is capped at `maxPageSize`.

### Errors

Every error response has the same shape, `{ "error": { "code": string, "message": string, "details"?: object } }`. Codes are the contract; message text is not.

| Status | Codes |
|---|---|
| 401 | `UNAUTHORIZED` (missing or malformed bearer token) |
| 403 | `FORBIDDEN` (wrong token for this resource) |
| 404 | `NOT_FOUND` |
| 409 | `SESSION_EXISTS`, `SLOT_EXISTS`, `VERSION_CONFLICT`, `ALREADY_SUBMITTED`, `SESSION_CLOSED` |
| 410 | `SESSION_EXPIRED` |
| 413 | `PAYLOAD_TOO_LARGE` |
| 415 | `UNSUPPORTED_MEDIA_TYPE` |
| 422 | `VALIDATION_ERROR`, `LIMIT_EXCEEDED` |
| 429 | `RATE_LIMITED` (slot locked after repeated wrong passcodes; also platform rules) |
| 500 | `INTERNAL` (no internal details) |

### Response headers and logging

- Every response carries `Cache-Control: no-store`, `Referrer-Policy: no-referrer` and `X-Content-Type-Options: nosniff`.
- API paths answer CORS with `Access-Control-Allow-Origin: *` and no credentials, so the researcher console on `localhost` can reach the relay. Bearer tokens are not cookies, so this does not open cross-site request forgery.
- `OPTIONS` returns `204`.
- The relay logs nothing on success. On `500` it logs only the error code and the route template, never bodies, tokens, IDs or IP addresses. Platform observability stays off (`mpile-app` deploy config).

## Testing

Module-specific, in addition to the [repository conventions](round1-capability-map.md#repository-conventions-for-malverdesoftware).

- **One contract suite, run twice:** against `memoryStore()` and against `sqlStore(nodeSqliteDatabase(":memory:"))`. It covers every endpoint's success path and every error code it can return.
- **Idempotency:** identical create, add-slots and submission retries replay. Changed payloads conflict.
- **Concurrency:** two simultaneous creates with the same body give one `201` and one `200`. Two simultaneous submissions with different envelopes give exactly one `201` and one `409`. Two draft writes with the same `baseVersion` give exactly one success.
- **Passcode lockout** with an injected clock: after 5 wrong tokens, even the correct token gets `429` until the lock expires. A success resets the count. Failures on one slot do not affect others.
- **Expiry and deletion** with an injected clock. After `DELETE`, expiry or `purgeExpired`, SQL counts for the session in both tables are zero.
- **No logging leaks:** spy on `console` for the whole suite and assert nothing logged contains a token, envelope, ID or body.
- **Boundary cases:** streamed oversize bodies, wrong content type, malformed and unknown-version envelopes, unknown fields not stored, cursors that walk 200 slots in pages.
- **The D1 driver shim** is exercised by `mpile-app`'s integration test under Wrangler's local mode, not here.

## Boundaries

Module-specific additions to the [repository boundaries](round1-capability-map.md#repository-conventions-for-malverdesoftware):

- **Always:** keep the handler limited to the Fetch API and WebCrypto; keep `node:sqlite` in the `/node` entry only.
- **Ask first:** opening session creation to anyone without a creation key; adding endpoints beyond this table, other than the reserved shared channel; raising limits.
- **Never:** add a column or log line that records IP addresses, user agents or request bodies; serve participant pages or app code from this package.

## Success criteria

- [ ] The contract suite passes on both stores under Node 24.19.0, with zero runtime dependencies.
- [ ] Every row in the endpoint table and every error code has at least one test.
- [ ] After deletion or expiry, no row for the session remains in either table.
- [ ] `relay:dev` serves the contract locally for `session-client` and `mpile-app` development.
- [ ] mPile's Worker mounts the handler at `/relay` with a dedicated D1 database (verified in `mpile-app`).

## Decisions

- **Creation key** (accepted by the author, October 25): only holders of an operator-issued creation key can create sessions; for round 1 that is the author alone. Participants need only their link and passcode. Opening creation to anyone, with rate limits, is a later decision.
