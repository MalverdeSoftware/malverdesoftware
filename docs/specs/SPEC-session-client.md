# Spec: session-client

Module id `session-client` · October 25, 2026 · **Status: approved by the author on October 25; passcodes were added the same day at their suggestion.** Depends on `@malverdesoftware/sealed-envelope` (code) and the [relay HTTP contract v1](SPEC-relay.md#http-contract-v1) (network only). Commands, structure, code style and repository-wide boundaries are in the [capability map](../CONVENTIONS.md).

## Objective

The session lifecycle that apps call, so that no app handles keys, envelopes or relay paths directly. mPile uses it in round 1 and mVote adopts it later.

It owns:
- the researcher's **session key file**
- **personal participant links with passcodes**, which let a youth continue on another device
- sealing and opening each kind of data
- retries that are safe to repeat
- saving drafts on the participant's phone when the connection drops

It does not own app data. Definitions and responses pass through as `unknown`, and each app validates them with its own schemas (mPile: `model.ts`).

## Interface

```ts
// ---------- Researcher: session key file ----------
export function prepareSession(input: PrepareInput): Promise<SessionFile>;   // local only: generates every secret, seals the definition once
export function renderSessionFile(file: SessionFile): string;                // Markdown
export function parseSessionFile(markdown: string): SessionFile;             // throws BAD_SESSION_FILE
export function readDefinition(file: SessionFile): Promise<unknown>;         // local only: the app definition sealed in the file; throws BAD_SESSION_FILE (added in 0.1.1, approved October 26)
export function publishSession(file: SessionFile, options: { creationKey: string; fetch?: typeof fetch }): Promise<SessionStatus>; // safe to retry

export type PrepareInput = {
  app: string;                 // "mpile"
  title: string;               // the researcher's own label; never sent to the relay
  relayUrl: string;            // "https://mpile.app/relay"
  participantUrl: string;      // "https://mpile.app/p"
  definition: unknown;         // app JSON, e.g. mPile's title, config and cards
  participantLabels: string[]; // ["Y01", "Y02", …]; 1–200 unique, [A-Za-z0-9 _.-]{1,40}
  expiresInDays?: number;      // default 14, at most 30
};

// ---------- Researcher: running a session ----------
export function openResearcherSession(file: SessionFile, options?: TransportOptions): ResearcherSession;
export type TransportOptions = { fetch?: typeof fetch; retryDelaysMs?: number[] }; // delays default [500, 1000, 2000]
export type ResearcherSession = {
  readonly file: SessionFile;  // current, including participants added or revoked through this object
  status(): Promise<SessionStatus>;
  collect(options?: { includeDrafts?: boolean }): Promise<CollectedResponse[]>;
  addParticipants(labels: string[]): Promise<SessionFile>;  // returns the updated file, which must be saved again
  revokeParticipant(label: string): Promise<SessionFile>;   // deletes that slot's draft and submission on the relay
  close(): Promise<SessionStatus>;
  setExpiry(expiresAt: Date): Promise<SessionStatus>;
  destroy(): Promise<void>;                                 // deletes everything on the relay; the local file remains
};
export type ParticipantStatus = "NOT_STARTED" | "IN_PROGRESS" | "SUBMITTED";
export type SessionStatus = {
  expiresAt: string; isClosed: boolean;
  participants: { label: string | null; status: ParticipantStatus; updatedAt: string | null }[]; // null: not in this copy of the file
};
export type CollectedResponse =
  | { label: string | null; kind: "SUBMITTED" | "DRAFT"; body: unknown; updatedAt: string }
  | { label: string | null; kind: "UNREADABLE"; problem: "DECRYPT_FAILED" | "NO_KEY"; updatedAt: string };

// ---------- Participant ----------
export function parseParticipantLink(url: string): ParticipantCredentials;  // throws BAD_LINK
export function joinSession(credentials: ParticipantCredentials, options: {
  app: string; relayUrl: string;
  passcode?: string;          // omitted → use the one remembered on this device, else PASSCODE_REQUIRED
  rememberOnDevice?: boolean; // default true; false for shared computers
  fetch?: typeof fetch; retryDelaysMs?: number[]; storage?: KeyValueStorage;
}): Promise<ParticipantSession>;
export type ParticipantSession = {
  readonly definition: unknown;
  readonly status: ParticipantStatus | "SUBMITTING"; // SUBMITTING: a submission is stored on the device but unconfirmed
  readonly draft: unknown | null;
  readonly submitted: unknown | null;                // this device's own copy of what it submitted
  readonly expiresAt: string;
  readonly isClosed: boolean;
  saveDraft(body: unknown): Promise<SaveResult>;
  submit(body: unknown): Promise<void>;
  retryPending(): Promise<SaveResult>;
};
export type SaveResult = { state: "SAVED" } | { state: "SAVED_ON_DEVICE"; reason: "OFFLINE" | "SERVER_ERROR" };
export type KeyValueStorage = { getItem(key: string): string | null; setItem(key: string, value: string): void; removeItem(key: string): void };
export function memoryStorage(): KeyValueStorage; // for tests and shared computers

export class SessionError extends Error { readonly code: SessionErrorCode; readonly details?: object }
export type SessionErrorCode =
  | "BAD_INPUT" | "BAD_LINK" | "BAD_SESSION_FILE" | "NETWORK" | "INVALID_RELAY_RESPONSE" | "DECRYPT_FAILED"
  | "TOO_LARGE" | "RELAY_REJECTED" // RELAY_REJECTED details: { relayCode }; NETWORK details: { reason: "OFFLINE" | "SERVER_ERROR" }
  | "PASSCODE_REQUIRED" | "WRONG_PASSCODE" | "TOO_MANY_ATTEMPTS" // TOO_MANY_ATTEMPTS details: { retryAfter }
  | "VERSION_CONFLICT" | "ALREADY_SUBMITTED" | "SESSION_CLOSED" | "SESSION_EXPIRED"
  | "NOT_FOUND" | "FORBIDDEN" | "LIMIT_EXCEEDED" | "SESSION_EXISTS";
```

Reserved for mVote, as additive methods only: `ParticipantSession.publishShared(value)`, `ParticipantSession.readShared()` and `ResearcherSession.readShared()`, over the relay's reserved shared channel. No round 1 type changes when they arrive.

## Behavior

**Personal links and passcodes.**
- **The link.** Its format is `<participantUrl>#v1.<sessionId>.<definitionKey>.<slotSecret>`, about 155 characters at the production domain. Everything secret sits after `#`, which browsers never send to servers or in `Referer` headers.
- **The passcode.** Each participant also gets a six-digit passcode, like a Zoom meeting passcode. The link locates their slot (`slotId` comes from `slotSecret` alone). The write token and draft key need the passcode too.
- **Delivery.** Send the link and passcode through different channels when possible, for example the link by text and passcodes in person or by email. If both travel in the same message, one leak exposes both.
- **Continuing on another device.** Opening the same link on another device and entering the passcode loads the last saved draft from the relay. A youth can start on a phone, save, and finish on a laptop.
- **Remembering the passcode.** After a correct passcode, the device remembers it under the participant's storage key, so the youth is not asked again on that device. It is erased after submission. Pass `rememberOnDevice: false` for shared computers.
- **Errors.** On participant calls, a relay `403` becomes `WRONG_PASSCODE` (the remembered passcode is then forgotten). A `429` becomes `TOO_MANY_ATTEMPTS`, with `retryAfter`.

**What is sealed with which key:**

| Data | Key | Context `channel` |
|---|---|---|
| Definition: `{ v: 1, researcherPublicKey, appDefinition }` | `definitionKey` (`A256GCM`) | `definition` |
| Draft | That participant's `draftKey` (`A256GCM`) | `draft`, with `slotId` |
| Submission | The researcher's public key (`ECDH-ES+A256GCM`) | `submission`, with `slotId` |

**Safe retries.** Every relay call that changes state is idempotent by construction. Network errors and `502`/`503`/`504` responses are retried three times, after 0.5, 1 and 2 seconds; `4xx` responses are never retried. Each call has three possible outcomes: success, failure, or *unknown*. Unknown outcomes are resolved as follows:
- **Publishing:** the definition is sealed once in `prepareSession` and stored in the file, so a retry sends byte-identical bytes and the relay replays `200`.
- **Submitting:** the sealed envelope is written to device storage *before* sending and resent unchanged by `retryPending()`. If the page reloads mid-submit, `joinSession` reports `SUBMITTING` until the relay confirms.
- **Draft saving:** if a retry meets `VERSION_CONFLICT` at exactly `baseVersion + 1`, the client fetches the stored draft, opens it, and treats a deep-equal match as `SAVED`. Any other conflict (a second phone) surfaces as `VERSION_CONFLICT`, and mPile keeps its existing "changed in another tab, reload" behavior.

**Saving on the device.** `saveDraft` writes the plaintext draft to device storage first, under `malverdesoftware:<app>:<sessionId>:<SHA-256 of the slot secret>` (`deriveSlot` takes the passcode, which may not be known yet when the page loads), then syncs it to the relay. Saves and submissions run one at a time, so an autosave never races itself. Offline or server failures return `SAVED_ON_DEVICE`, and the app shows that state. `retryPending()` syncs later, and `joinSession` prefers an unsynced local draft over the relay copy. The default storage wraps `localStorage` and tolerates its absence, as mPile's `readKey`/`writeKey` do today.

**Untrusted relay responses.** Every relay response is validated for shape before use (`INVALID_RELAY_RESPONSE`). Decrypted app data is returned as `unknown` for the app to validate.

**Collecting.** `collect` walks submissions (and drafts when `includeDrafts` is set) page by page:
- It opens submissions with the researcher's private key and drafts with each participant's draft key.
- It maps `slotId` back to labels from the file and sorts the results by label.
- A single unreadable item becomes an `UNREADABLE` entry instead of failing the whole collection.
- If the file is an older copy that predates `addParticipants`, submissions from the newer slots still open (same researcher key) with `label: null`, and their drafts are `NO_KEY`.

## Session key file

The file is Markdown so it can be read in any text editor or Markdown viewer. The JSON block after the marker comment is the only source of truth; the human-readable parts are regenerated from it on every save. `parseSessionFile` rejects any file whose JSON is missing, invalid, of an unknown `format`, or has malformed fields.

````markdown
# MalverdeSoftware session key: Youth CAB text message sort

> **Keep this file private.** Anyone who has it can read every response in this session.
> Keep it only on your computer and in a secure place your study has approved for its files.
> Do not put it in a git repository, email it, or paste it into a chat or AI tool. If it is
> lost, the responses cannot be recovered by anyone.

| | |
|---|---|
| App | mpile |
| Created | November 5, 2026 |
| Deletes itself | November 19, 2026 (unless you delete it sooner) |

## Personal participant links

Send each person only their own link and passcode, ideally through different channels.

| Participant | Link | Passcode |
|---|---|---|
| Y01 | https://mpile.app/p#v1.… | 482913 |
| Y02 | https://mpile.app/p#v1.… | 075364 |

<!-- malverdesoftware-session-data: do not edit below this line -->
```json
{ "format": "malverdesoftware-session/v1", "app": "mpile", "…": "…" }
```
````

```ts
export type SessionFile = {
  format: "malverdesoftware-session/v1";
  app: string; title: string; relayUrl: string; participantUrl: string;
  sessionId: string; adminToken: string; definitionKey: string;
  researcherPublicKey: string; researcherPrivateKey: string;
  definitionEnvelope: Envelope;  // sealed once so publishing can be retried byte for byte
  createdAt: string;             // ISO 8601, UTC
  expiresInDays: number;
  participants: { label: string; slotSecret: string; slotId: string; passcode: string; link: string; addedAt: string; revokedAt?: string }[];
};
```

URLs must be `https://`, except `http://127.0.0.1` and `http://localhost` for local development. Apps offer the file for saving as `<title-slug>.malverdesoftware-session.md`. MalverdeSoftware repositories ignore that filename pattern in git, as a guard against committing a key file by accident.

## Testing

Module-specific, in addition to the [repository conventions](../CONVENTIONS.md). All tests run end to end in-process: `fetch` is a function that passes requests to `createRelay({ store: memoryStore() })`.

- **Custody test (the key acceptance test).** A recording `fetch` captures every URL, header and body sent to the relay during a full simulated session:
  - 3 participants labeled Y01–Y03, with synthetic cards and pile names containing unique marker strings
  - publish, join, drafts, one submission, status, collect, close, destroy

  Assert that no captured request and no stored row contains:
  - any marker string, label or the title
  - the definition key, any slot secret, passcode or draft key
  - the researcher's private key

  The admin token and write tokens may appear only in `Authorization` headers.
- **Passcodes:** a wrong passcode gives `WRONG_PASSCODE` and forgets any remembered one. Five wrong passcodes give `TOO_MANY_ATTEMPTS`. A remembered passcode lets `joinSession` work without one. `rememberOnDevice: false` stores nothing.
- **Phone to laptop:** two separate storages (two devices) using the same link and passcode. A draft saved on the first loads on the second, and the second can submit.
- **Isolation:** Y01's link cannot read Y02's draft. The relay refuses the token, and Y01's draft key cannot open Y02's envelope either.
- **Unknown outcomes:** simulated lost responses for publish, draft save and submit each resolve to exactly one stored effect and a success result.
- **Saving on the device:** with a failing `fetch`, `saveDraft` returns `SAVED_ON_DEVICE`. `retryPending` later returns `SAVED`. A fresh `joinSession` with the same storage restores the unsynced draft, and a stored submission reports `SUBMITTING` until confirmed.
- **Session file:** render → parse is lossless. Altered JSON gives `BAD_SESSION_FILE`. The Markdown lists every participant who has not been revoked and includes the warning text.
- **Adding and revoking:** an added participant's link works. A revoked link gets `FORBIDDEN` or `NOT_FOUND`. An older file still opens newer submissions, with `label: null`.
- **Lifecycle errors:** a closed session gives `SESSION_CLOSED` on save and submit; an expired one gives `SESSION_EXPIRED`.

## Boundaries

Module-specific additions to the [repository boundaries](../CONVENTIONS.md#boundaries):

- **Always:** keep participant labels and the title in the session file only; treat relay responses as untrusted input.
- **Ask first:** changing the link or session-file format; adding a way to recover a lost session file (any such mechanism would weaken the custody rule).
- **Never:** send a secret in a URL path or query string; write the session file anywhere itself (the app hands it to the researcher to save); retry a `4xx` response.

## Success criteria

- [ ] The custody test passes.
- [ ] All tests above pass on Node 24.19.0. The only runtime dependency is `@malverdesoftware/sealed-envelope`.
- [ ] Packed tarballs install into a fresh mPile checkout without a sibling repository, and the package bundles into mPile's browser build.
- [ ] A participant link is 160 characters or fewer at the production domain.
- [ ] Rehearsal checks (owned by `mpile-app`):
  - links open from iPhone Messages, Android Messages and a desktop email client
  - a sort survives airplane mode mid-session and syncs afterward

## Decisions

- **Unfinished sorts at close** (accepted October 25): `collect({ includeDrafts: true })` returns drafts as `kind: "DRAFT"`. `mpile-app` exports them in a separate file marked "not submitted," never mixed into submitted results.
- **Passcodes** (the author's proposal, October 25): every personal link has a six-digit passcode, which also makes continuing on another device safe.
- **Seeing a submitted sort again:** in round 1, only on the device that submitted it, from its local copy. Passcodes would make showing it on any device safe, so it can be added later as a new optional feature.
