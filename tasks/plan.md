# Implementation plan: round 1 foundations

October 25, 2026 · **Status: approved by the author on October 25, after review; their one change was full app names.** This covers the three approved module specs: [sealed-envelope](../docs/specs/SPEC-sealed-envelope.md), [relay](../docs/specs/SPEC-relay.md) and [session-client](../docs/specs/SPEC-session-client.md). `mpile-app` and `researcher-guide` need their own specs first. Writing the `mpile-app` spec is task T14 and runs alongside the foundation work. Tasks with acceptance criteria are in [todo.md](todo.md).

## Build order

```text
T1 repository tooling
 ├─ sealed-envelope: T2 → T3 → T4 ──┐
 ├─ relay:           T5 → T6 → T7 → T8 ┤
 │                                   └─ session-client: T9 → T10 → T11 → T12 → T13 (pack + fresh mPile install)
 └─ T14 mpile-app spec (reads mPile's code; needs the author's review) ──→ mpile-app plan and build
```

- `sealed-envelope` and `relay` are independent and can be built in parallel. `relay` validates envelope shape from the written wire format, not from the package.
- `session-client` needs both: the envelope package for code, and the relay handler in-process for tests.
- The `mpile-app` spec can be drafted now, but its approval gates the mPile changes.

## Checkpoints

| Checkpoint | After | Must be true | Target |
|---|---|---|---|
| CP1 | T4, T8 | Both packages' tests pass on Node 24. Envelope fixtures are committed. The relay contract suite passes on the memory store and on `node:sqlite`. | Oct 28 |
| CP2 | T13 | The custody test passes. Packed tarballs install and build in a fresh mPile checkout with no sibling repository. | Oct 30 |
| CP3 | T14 | The `mpile-app` spec is approved, and the author has finished the Cloudflare setup steps it lists. | Oct 30 |
| Gate | Rehearsal | Real iPhone and Android phones, personal links and passcodes sent by email and SMS, phone-to-laptop continuation, airplane-mode recovery, export and deletion all work. | **Nov 4** |

## Risks

| Risk | Mitigation |
|---|---|
| PBKDF2 at 200,000 iterations is slow on older phones | The iteration count can change freely until real session data exists. Measure `deriveSlot` at rehearsal and lower it if it takes over a second. |
| D1 behaves differently from `node:sqlite` (batches, change counts) | Keep SQL to a portable subset. Use D1 batches for multi-statement writes. `mpile-app`'s integration test runs the D1 shim under Wrangler's local mode. |
| `node:sqlite` prints experimental warnings on Node 24 | It is used only in tests and `relay:dev`, never in a Worker bundle. |
| mPile's Vinext structure makes mounting the relay and a local-only console awkward | T14 investigates before any mPile change. Fallback: a small separate Worker for `/relay` on the same domain using a route. |
| Cloudflare steps only the author can do (DNS, D1 database, creation-key secret, Wrangler login) | T14 lists them with dates so they are done by Nov 1. |
| Two weeks is tight | The scope is fixed and the date moves if the gate fails. Tasks are small enough to show daily progress. |

## Delivery

- Each task lands as a commit on a feature branch; each module merges to `main` through a pull request linked to its spec.
- Pull requests include test output and state what was not verified.
- The repository stays private. Nothing is published to a package registry.
