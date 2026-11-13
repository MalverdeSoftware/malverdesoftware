# Capability map: MalverdeSoftware round 1

October 25, 2026 · **Status: accepted by the author on October 25 through their answers to its open questions. No module boundary changes were requested.** This is Phase 0 of spec-driven-development. Source intent: `docs/intent/malverde-suite.md` and record mv-640211c0 in the author's private research-context-hub; the [README](../../README.md#what-this-is) summarizes it. Module specs: [sealed-envelope](SPEC-sealed-envelope.md), [relay](SPEC-relay.md), [session-client](SPEC-session-client.md), [mpile-app](SPEC-mpile-app.md). Implementation plan: [tasks/plan.md](../../tasks/plan.md).

## Goal of this round

The first youth CAB pile sort, with a target of sending links around **Sunday, November 8, 2026**. The date is a measurable target, not a fixed event: the session runs when the first build passes its readiness gate. Participants sort for about a week from personal links sent by email or text. The author starts the session and keeps the outputs on their own computer. The vendor's servers hold only sealed data.

## Modules

| Module id | Responsibility | Depends on | Home |
|---|---|---|---|
| `sealed-envelope` | Browser-only cryptography, using WebCrypto with no dependencies. Generates keys; seals content shared through links; seals responses so only the researcher can open them; derives each participant's credentials from one secret in their link. | — | `malverdesoftware/packages/sealed-envelope` |
| `relay` | A ciphertext-only store, packaged as a portable HTTP handler plus a storage interface. Each app's deployment mounts it at `/relay`. It knows nothing about mPile. | — | `malverdesoftware/packages/relay`; for round 1, deployed inside mPile's Cloudflare Worker |
| `session-client` | The session lifecycle apps call: prepare, publish, join, save draft, submit, check status, collect, close, delete. Writes and reads the researcher's session key file. This is the shared foundation mVote adopts later. | `sealed-envelope`, `relay` (HTTP contract only) | `malverdesoftware/packages/session-client` |
| `mpile-app` | mPile on `session-client`: a researcher console run on the author's computer, and a participant sorting page served at `mpile.app`. Validation moves to the browser. Exports land on the researcher's computer. | `session-client`, `relay` (mounted) | mPile, on a new branch |
| `researcher-guide` | Light-tier guidance and a runbook for the first session: preparing, sending personal links, monitoring, exporting, closing, deleting. | `mpile-app` | mPile `docs/` and suite docs |

Build order: `sealed-envelope`, `relay` (in parallel) → `session-client` → `mpile-app` → `researcher-guide`.

## Decisions recorded October 25

| Topic | Decision |
|---|---|
| Participant links | One personal link per youth, labeled with codes the author chooses (for example Y01). Labels stay in the session key file and are never sent to the relay. |
| Passcodes | Each personal link has a six-digit passcode, like a Zoom meeting (the author's proposal). The same link and passcode continue a saved draft on another device, such as phone to laptop. |
| Creation key | Only holders of an operator-issued key can create sessions on the relay; for round 1, the author. |
| Unfinished sorts | Drafts are collected at close and exported separately, marked "not submitted." |
| Session key file | A Markdown file the author keeps on their own computer and in their Hopkins Microsoft Teams channel files. Anyone with access to that channel's files can read every response. |
| Domain | `mpile.app`. No DNS record exists yet; the author adds it in Cloudflare before the rehearsal. |
| Expiry | 14 days by default, 30 days at most, counted from creation. |
| Portability | The relay runs on Cloudflare Workers for round 1. It is written so the same code can run on a VPS or in JHU Azure without a rewrite. |
| mPile modes | Sort mode only. `generate_sort` and `collect` remain in the code but are not ported. |
| Fallback | None. If the readiness gate fails, the date moves. |
| GitHub | The `MalverdeSoftware` organization exists (created October 25). `MalverdeSoftware/malverdesoftware` was created the same day as a private repository, and the author authorized pushing and documenting this work there. mPile and mVote transfer after round 1. |

## What mPile keeps and what it replaces

- **Keeps:** the sorting interface (`pile-ui.tsx`, `board-tools.ts`), the data schemas and `validateBody` (`model.ts`, which is pure and can run in the browser), the analysis code (`analysis.ts`, `analysis-view.tsx`) and the CSV/JSON export code.
- **Replaces:** `server.ts`, the `db/` folder and the plaintext D1 tables. The `request` calls in `create-study.tsx`, `participant.tsx` and `manage-study.tsx` move behind `session-client`.

## Fit for mVote later

mVote's store (`loadBoard`, `subscribeVotes`, `joinParticipant`, `castVote`, `requestMoreDots`) shares live board state among participants. The relay and `session-client` reserve a **shared channel**, readable by anyone holding a participant link, alongside the researcher-only channel. Round 1 does not implement it. Adding it later must not change the round 1 interfaces.

## Repository conventions for `malverdesoftware`

These apply to all three foundation module specs.

**Tech stack.** TypeScript 5.9, ES modules, Node **24** (`.node-version` records 24.22.1, the version tested here; mPile and mVote record 24.19.0; the environment check enforces major version 24; Node 26 breaks mVote's tests). There are no runtime dependencies. Development dependencies are `typescript` and `@types/node` only. Packages are named `@malverdesoftware/<module-id>`, are marked `"private": true` so they cannot be published, and are consumed by apps as packed tarballs at exact versions.

**Commands** (proposed; the repository does not exist yet):

```sh
node scripts/check-environment.mjs   # fails on any Node major other than 24
npm ci
npm test                             # every package's node --test suite (npm test -w <package> for one)
npm run typecheck                    # tsc -b
npm run build                        # tsc -b, emitting ESM and .d.ts into packages/*/dist
npm run pack                         # npm pack each package into artifacts/ (gitignored)
npm run relay:dev                    # local relay at http://127.0.0.1:8787/relay using a node:sqlite file
```

**Structure.**

```text
malverdesoftware/
  .node-version            24.22.1
  package.json             npm workspaces; private
  tsconfig.base.json       strict, erasableSyntaxOnly, verbatimModuleSyntax, rewriteRelativeImportExtensions
  NOTICE.md                licensing placeholder mirroring mPile's; no LICENSE file
  docs/specs/              this map and the module specs
  packages/<module-id>/    src/, test/, package.json (and fixtures/ or sql/ where a spec says so)
  scripts/                 environment check, fixture generation
```

**Code style.** Match mPile: 2-space indentation, double quotes, semicolons, trailing commas, short functions, a `fail()` helper that throws, and no classes except error types. Use only syntax Node can strip without compiling (no enums, namespaces or constructor parameter properties), so `node --test` runs the TypeScript sources directly. Use relative imports with `.ts` extensions. One error type per package carries a machine-readable `code`; message text is for people and is not part of the contract.

```ts
export class EnvelopeError extends Error {
  readonly code: EnvelopeErrorCode;
  constructor(code: EnvelopeErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}
const fail = (code: EnvelopeErrorCode, message: string): never => {
  throw new EnvelopeError(code, message);
};
export async function open(key: ContentKey, envelope: Envelope, context: EnvelopeContext) {
  if (envelope.v !== 1)
    fail("UNSUPPORTED_VERSION", "This link was made by a newer version of the app.");
  // ...
}
```

**Testing.** Use `node:test` and `node:assert` with no test dependencies. Tests live in `packages/<module-id>/test/`. Every exported function and every relay endpoint and error code has a test. Use synthetic data only. Browser and device checks belong to `mpile-app` and the rehearsal.

**Boundaries.**

- **Always:** use Node 24; run `npm test` and `npm run typecheck` before each commit; work on a branch; keep every key, label and plaintext value on the researcher's or participant's device.
- **Ask first:** adding any dependency; changing a wire or file format once real session data exists; creating or pushing GitHub repositories; deploying to `mpile.app`; DNS changes; turning on platform logging or observability.
- **Never:** send keys, participant labels or plaintext to the relay; log request bodies, tokens or IP addresses; add a LICENSE file or publish a package; use real participant data in tests or fixtures; implement cryptographic primitives instead of using WebCrypto; loosen limits or remove a test to make a test pass.

## Schedule and readiness gate

| Target date (2026) | Checkpoint |
|---|---|
| Oct 26 | Module specs for `sealed-envelope`, `relay` and `session-client` reviewed |
| Oct 26–28 | `sealed-envelope` and `relay` built and tested |
| Oct 29–Nov 1 | `session-client` and `mpile-app` |
| Nov 2–3 | End-to-end rehearsal with synthetic cards on a real iPhone and Android phone, using personal links sent by email and by SMS |
| **Wed Nov 4** | **Readiness gate:** the rehearsal passes, or the session date moves |
| Nov 5–7 | `researcher-guide`, load the real notecard texts, final check |
| ~Nov 8 | Send links |

If the gate fails, record what failed, set a new target date and keep the scope unchanged.

## Known limits to carry into the module specs

- Links sent by email or SMS are visible to the email or messaging provider. A leaked link alone opens nothing: the relay needs the passcode-derived token and locks a slot after 5 wrong guesses. Someone holding both link and passcode can read that participant's draft and card texts, and could submit in their place. They still cannot read submitted responses or other participants' drafts. Sending links and passcodes through different channels keeps a single leak from exposing both.
- Participant code is served from vendor hosting, so participants trust that code. This is inherent to browser encryption. Mitigations: no analytics or third-party scripts, a strict content security policy, and pinned, reviewable releases.
- The relay cannot reject malformed responses because it cannot read them. The researcher console validates when it imports responses and reports what failed.
- The relay sees metadata: session and slot identifiers, sizes, timing, the number of participants and who has submitted (by slot ID, not label). Padding hides small size differences.
- NOTICE and licensing constraints apply to the new repository too.
