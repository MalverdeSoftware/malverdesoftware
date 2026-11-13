# Task list: round 1 foundations

October 25, 2026 · **Status: approved with the [plan](plan.md) on October 25.** Each task is one focused session and touches about five files or fewer. Paths are relative to the repository root. `pkg/` stands for `packages/<module-id>/`.

## Tooling

- [x] **T1. Repository tooling**
  - Acceptance: npm workspaces root (private) with `test`, `typecheck`, `build` and `pack` scripts (`relay:dev` arrives with T8). A strict `tsconfig.base.json` (`erasableSyntaxOnly`, `verbatimModuleSyntax`, `rewriteRelativeImportExtensions`). Dev dependencies `typescript@5.9.3` and `@types/node@24` only. The environment check passes on Node 24 and fails on Node 26.
  - Verify: `node scripts/check-environment.mjs && npm ci && npm test && npm run typecheck`
  - Files: `package.json`, `package-lock.json`, `tsconfig.base.json`, `tsconfig.json`

## sealed-envelope

- [x] **T2. Encoding, randomness and keys**
  - Acceptance: `randomSecret`, `randomId`, `randomPasscode`, `importContentKey`, `generateRecipientKeys`, `importRecipientPublicKey`, `importRecipientPrivateKey`, `hashToken` and `EnvelopeError` behave as the spec says. A test enumerates the public exports.
  - Verify: `npm test -w @malverdesoftware/sealed-envelope`
  - Files: `pkg/package.json`, `pkg/tsconfig.json`, `pkg/src/index.ts`, `pkg/src/keys.ts`, `pkg/test/keys.test.ts`
- [x] **T3. Seal and open (both algorithms), framing, padding, context binding**
  - Acceptance: all round-trip, tampering, context, padding and format-error tests in the spec pass.
  - Verify: `npm test -w @malverdesoftware/sealed-envelope`
  - Files: `pkg/src/envelope.ts`, `pkg/src/index.ts`, `pkg/test/envelope.test.ts`
- [x] **T4. Slot derivation with passcodes, and fixtures**
  - Acceptance: `deriveSlot` follows the wire format. `fixtures/envelope-v1.json` is committed, and `scripts/make-fixtures.mjs` reproduces its derivation and hash vectors.
  - Verify: `npm test -w @malverdesoftware/sealed-envelope && node packages/sealed-envelope/scripts/make-fixtures.mjs --check`
  - Files: `pkg/src/slot.ts`, `pkg/scripts/make-fixtures.mjs`, `pkg/fixtures/envelope-v1.json`, `pkg/test/fixtures.test.ts`

## relay

- [x] **T5. Schema, store interface, memory store**
  - Acceptance: `RelayStore` as specified, including atomic insert-or-duplicate, conditional writes and lockout counters. `memoryStore()` implements it.
  - Verify: `npm test -w @malverdesoftware/relay`
  - Files: `pkg/package.json`, `pkg/tsconfig.json`, `pkg/src/store.ts`, `pkg/src/memory.ts`, `pkg/sql/schema.sql`
- [x] **T6. SQL store with `node:sqlite` and D1 drivers**
  - Acceptance: `sqlStore` passes the same store tests as the memory store on `nodeSqliteDatabase(":memory:")`. The `d1Database` shim type-checks against `D1Database`. `node:sqlite` is imported only from the `/node` entry.
  - Verify: `npm test -w @malverdesoftware/relay && npm run typecheck`
  - Files: `pkg/src/sql.ts`, `pkg/src/d1.ts`, `pkg/src/node.ts`, `pkg/test/store.test.ts`
- [x] **T7. HTTP handler: creation, admin endpoints, errors, headers, CORS**
  - Acceptance: every ADMIN and CREATOR row of the endpoint table, the error format, bounded body reading, validation, pagination, idempotent replays and the "no logging leaks" spy, each tested on both stores.
  - Verify: `npm test -w @malverdesoftware/relay`
  - Files: `pkg/src/handler.ts`, `pkg/src/validate.ts`, `pkg/src/errors.ts`, `pkg/test/contract-admin.test.ts`
- [x] **T8. Participant endpoints, passcode lockout, expiry and purge, local server**
  - Acceptance: the SLOT rows, lockout, the concurrency cases, expiry with `410` then `404`, and `purgeExpired`, all tested. `npm run relay:dev` serves the contract at `http://127.0.0.1:8787/relay`.
  - Verify: `npm test -w @malverdesoftware/relay && npm run relay:dev` (then `curl http://127.0.0.1:8787/relay/v1/health`)
  - Files: `pkg/src/handler.ts`, `pkg/src/purge.ts`, `pkg/test/contract-slot.test.ts`, `pkg/test/expiry.test.ts`

## session-client

- [x] **T9. Session key file**
  - Acceptance: `prepareSession`, `renderSessionFile` and `parseSessionFile`, with lossless round trips, rejection of altered files, the passcode column, the warning text and URL rules.
  - Verify: `npm test -w @malverdesoftware/session-client`
  - Files: `pkg/package.json`, `pkg/tsconfig.json`, `pkg/src/file.ts`, `pkg/src/errors.ts`, `pkg/test/file.test.ts`
- [x] **T10. Relay transport**
  - Acceptance: a fetch wrapper with retries only for network errors and `502`/`503`/`504`, response-shape validation (`INVALID_RELAY_RESPONSE`), and relay-code to `SessionErrorCode` mapping, including `WRONG_PASSCODE` and `TOO_MANY_ATTEMPTS`.
  - Verify: `npm test -w @malverdesoftware/session-client`
  - Files: `pkg/src/transport.ts`, `pkg/test/transport.test.ts`
- [x] **T11. Researcher session**
  - Acceptance: `publishSession` (with retry replay), `status`, `collect` (with drafts and older files), `addParticipants`, `revokeParticipant`, `close`, `setExpiry` and `destroy`, tested in-process against the relay.
  - Verify: `npm test -w @malverdesoftware/session-client`
  - Files: `pkg/src/researcher.ts`, `pkg/test/researcher.test.ts`
- [x] **T12. Participant session and the custody test**
  - Acceptance:
    - link parsing; passcode entry, remembering and forgetting
    - `saveDraft` saving on the device when offline, and `retryPending`
    - submit, with the envelope kept until confirmed
    - phone-to-laptop continuation
    - **the custody test**
  - Verify: `npm test -w @malverdesoftware/session-client`
  - Files: `pkg/src/participant.ts`, `pkg/src/storage.ts`, `pkg/test/participant.test.ts`, `pkg/test/custody.test.ts`
- [x] **T13. Pack and fresh-mPile install check**
  - Acceptance: `npm run pack` writes three tarballs to `artifacts/`. A script clones mPile into a temporary folder, installs the tarballs at exact versions, imports each package from TypeScript and builds. A short consumer guide explains pinning and upgrading.
  - Verify: `npm run pack && node scripts/check-consumer.mjs`
  - Files: `scripts/check-consumer.mjs`, `docs/CONSUMING.md`, `package.json`

## Next specs

- [x] **T14. Write `SPEC-mpile-app.md`**
  - Acceptance: the spec covers:
    - the local researcher console (creating a session from CSV, the session key file, status, collect, separate "not submitted" export, close, delete)
    - the participant page at `/p` (passcode entry, sync states, submitted confirmation)
    - mounting the relay at `/relay` with a new D1 database
    - the Worker deploy config with observability off, the content security policy and the hourly purge cron
    - mPile's integration test changes
    - a dated checklist of Cloudflare steps only the author can do (DNS for `mpile.app`, D1 creation, the creation-key secret, Wrangler login)
  - Verify: the author's review and approval
  - Files: `docs/specs/SPEC-mpile-app.md`, `docs/specs/round1-capability-map.md`

## mpile-app (mPile repository, branch `round1/sealed-sessions`)

Status as of October 26 evening is in [STATUS.md](STATUS.md).

- [x] **T15. Vendor the packages and mount the relay at `/relay`**
  - Acceptance: the tarballs are vendored and pinned; a custom Worker entry routes `/relay/*` to the relay on `RELAY_DB`, with an hourly purge; a session-client flow works on the dev server against local D1.
  - Files: `app/vendor/malverdesoftware/`, `app/worker/index.ts`, `app/vite.config.ts`, `app/.gitignore`
- [x] **T16. Sort definition, browser-side validation and export adapters**
  - Files: `app/lib/session.ts`, `app/tests/session.test.ts`
- [x] **T17. Participant page `/p`** (browser check passes at phone size, October 26; see [STATUS.md](STATUS.md))
  - Verify: `npm run dev`, then `npm run test:browser`
  - Files: `app/app/p/page.tsx`, `app/components/participant/*`, `app/tests/browser-smoke.mjs`
- [x] **T18. Researcher console at `/`** (local only), with a public landing page when deployed (October 26; see [STATUS.md](STATUS.md))
  - Verify: `npm run console`, then `npm run test:console`
- [x] **T19. Remove the plaintext API and old pages; integration test through `/relay`; security headers and CSP** (October 26; see [STATUS.md](STATUS.md))
  - Verify: `npm run verify`; with `npm run dev` running, `npm run test:integration` and `npm run test:browser`
- [x] **T20. Deploy configuration, `creation-key` script and researcher-guide docs** (October 26; see [STATUS.md](STATUS.md))
  - Verify: `npm run creation-key`; `npm run deploy:prepare -- <UUID>`, then `npx wrangler deploy --dry-run --config wrangler.selfhost.json`
- [ ] **T21. Cloudflare setup with the author, first deploy, rehearsal (Nov 2–3), readiness gate (Nov 4)**
