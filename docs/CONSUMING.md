# Using these packages in an app

The packages are published on npm under the `@malverdesoftware` scope (Apache-2.0, see [LICENSE](../LICENSE)). Apps pin exact versions and never point at a sibling checkout or a moving branch, so either app can build from a fresh clone and can upgrade or roll back on its own schedule.

## Install from npm

```sh
npm install --save-exact @malverdesoftware/sealed-envelope @malverdesoftware/relay @malverdesoftware/session-client @malverdesoftware/ui
```

Install only the ones the app needs. `session-client` brings in the matching `sealed-envelope`. Releases from 2026-11-13 on are published by GitHub Actions with npm provenance; the first versions (sealed-envelope 0.1.2, relay 0.1.1, session-client 0.1.3, ui 0.1.1) were published by hand, because npm can't use trusted publishing before a package exists.

## Install a packed tarball

Use this for a change that isn't released yet. mPile and mVote still vendor tarballs from before the npm release and will move to the registry versions.

1. In this repository, on the commit you want, run `npm run pack`. It writes four tarballs to `artifacts/`:
   - `malverdesoftware-sealed-envelope-<version>.tgz`
   - `malverdesoftware-relay-<version>.tgz`
   - `malverdesoftware-session-client-<version>.tgz`
   - `malverdesoftware-ui-<version>.tgz`
2. Copy the ones the app needs into the app repository, under `vendor/malverdesoftware/`, and commit them. `session-client` needs `sealed-envelope` alongside it.
3. Install them together, pinned exactly:

   ```sh
   npm install --save-exact ./vendor/malverdesoftware/malverdesoftware-sealed-envelope-0.1.0.tgz \
     ./vendor/malverdesoftware/malverdesoftware-relay-0.1.0.tgz \
     ./vendor/malverdesoftware/malverdesoftware-session-client-0.1.0.tgz
   ```

   `package.json` records `file:` paths, and `package-lock.json` records each tarball's integrity hash, so a fresh clone installs exactly these bytes.

`npm run pack && node scripts/check-consumer.mjs` rehearses the session packages against a fresh temporary clone of mPile: install, type-check, a full synthetic session, and the app build.

## Upgrade or roll back

- Every change to a package gets a new version in its `package.json` before packing. A version number is never reused for different contents.
- To upgrade, replace the tarballs in `vendor/malverdesoftware/`, reinstall, and run the app's tests. To roll back, restore the previous tarballs from the app's git history and reinstall.
- A change to a wire or file format (envelopes, the relay contract, session key files or links) needs its own version bump. It also needs a plan for sessions created under the old format, which can last up to 30 days.

## Which entry points to import

| Package | Browser or Worker | Node only |
|---|---|---|
| `@malverdesoftware/sealed-envelope` | `.` | — |
| `@malverdesoftware/relay` | `.` (handler, stores, D1 adapter) | `./node` (`node:sqlite`, `serveNode`) |
| `@malverdesoftware/session-client` | `.` | — |
| `@malverdesoftware/ui` | `.` (safe on a server), `./controls` (browser only), `./base.css`, `./accent-green.css` | `malverdesoftware-ui-check` |

`@malverdesoftware/ui` needs Ring UI, its icons and Mona Sans installed in the app at the exact versions in [the UI spec](specs/SPEC-ui.md). It has no bearing on sessions or data, so an app can adopt it separately from the others.

The `malverdesoftware-source` export condition points at TypeScript sources for this repository's own tests. Apps should not set it.

## Releases

Releases follow [SPEC-distribution](specs/SPEC-distribution.md). The release workflow (`.github/workflows/release.yml`) builds and tests the packages, runs `scripts/check-release.mjs`, and keeps the packed tarballs as a workflow artifact. A tag `<package>-v<version>` also publishes that package to npm with provenance, through the `npm` environment. Publish `sealed-envelope` before `session-client`, which depends on it. Each package keeps a copy of the root `LICENSE` and `NOTICE`, because Apache-2.0 requires NOTICE to travel with the code. After you edit either root file, run `node scripts/check-release.mjs --fix`; CI fails while the copies differ. Tags take the form `<package>-v<version>`, for example `ui-v0.1.1`, and must match that package's version.
