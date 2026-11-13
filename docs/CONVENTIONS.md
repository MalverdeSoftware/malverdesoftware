# Repository conventions

These apply to every package in this repository and to its module specs ([relay](specs/SPEC-relay.md), [sealed-envelope](specs/SPEC-sealed-envelope.md), [session-client](specs/SPEC-session-client.md)). They were set for round 1 in October 2026 and are kept current here.

## Tech stack

TypeScript 5.9, ES modules, Node **24**. `.node-version` records the version tested here, and the environment check enforces major version 24. The session packages have no runtime dependencies beyond each other; development dependencies are `typescript` and `@types/node`. Packages are named `@malverdesoftware/<module-id>` and published on npm at exact versions (see [CONSUMING](CONSUMING.md) and the [release workflow](../.github/workflows/release.yml)).

## Commands

```sh
node scripts/check-environment.mjs   # fails on any Node major other than 24
npm ci
npm test                             # every package's test suite (npm test -w packages/<module-id> for one)
npm run typecheck
npm run build                        # emits ESM and .d.ts into packages/*/dist
npm run pack                         # npm pack each package into artifacts/ (git-ignored)
node scripts/check-release.mjs       # LICENSE, NOTICE and tarball contents (after build)
npm run relay:dev                    # local relay at http://127.0.0.1:8787/relay using a node:sqlite file
```

## Structure

```text
malverdesoftware/
  .node-version            Node version tested
  package.json             npm workspaces root (private)
  tsconfig.base.json       strict, erasableSyntaxOnly, verbatimModuleSyntax, rewriteRelativeImportExtensions
  LICENSE, NOTICE          Apache-2.0; each package keeps copies of both
  docs/                    these conventions, CONSUMING, and docs/specs/
  packages/<module-id>/    src/, test/, package.json (and fixtures/ or sql/ where a spec says so)
  scripts/                 environment, release and consumer checks
  brand/                   the logo, its build scripts and DESIGN-ETHOS
```

## Code style

2-space indentation, double quotes, semicolons, trailing commas, short functions, a `fail()` helper that throws, and no classes except error types. Use only syntax Node can strip without compiling (no enums, namespaces or constructor parameter properties), so `node --test` runs the TypeScript sources directly. Use relative imports with `.ts` extensions. One error type per package carries a machine-readable `code`; message text is for people and is not part of the contract.

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
```

## Testing

Use `node:test` and `node:assert`, with no test dependencies (the `ui` package uses Vitest for its browser components). Tests live in `packages/<module-id>/test/`. Every exported function and every relay endpoint and error code has a test. Use synthetic data only.

## Boundaries

- **Always:** use Node 24; run `npm test` and `npm run typecheck` before each commit; work on a branch; keep every key, label and plaintext value on the researcher's or participant's device.
- **Ask first:** adding any dependency; changing a wire or file format once real session data exists; deploying a relay; DNS changes; turning on platform logging or observability.
- **Never:** send keys, participant labels or plaintext to the relay; log request bodies, tokens or IP addresses; publish a package outside the release workflow; use real participant data in tests or fixtures; implement cryptographic primitives instead of using WebCrypto; loosen limits or remove a test to make a test pass.

## Known limits

- Links sent by email or SMS are visible to the email or messaging provider. A leaked link alone opens nothing: the relay needs the passcode-derived token and locks a slot after 5 wrong guesses. Someone holding both link and passcode can read that participant's draft and card texts, and could submit in their place. They still cannot read submitted responses or other participants' drafts. Sending links and passcodes through different channels keeps a single leak from exposing both.
- Participant code is served from the site's hosting, so participants trust that code. This is inherent to browser encryption. Mitigations: no analytics or third-party scripts, a strict content security policy, and pinned, reviewable releases.
- The relay cannot reject malformed responses because it cannot read them. The researcher console validates responses when it imports them and reports what failed.
- The relay sees metadata: session and slot identifiers, sizes, timing, the number of participants and who has submitted (by slot ID, not label). Padding hides small size differences.
