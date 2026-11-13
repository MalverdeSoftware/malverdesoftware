# Spec: Distribution

Module id `distribution` · November 12, 2026 · **Status: approved by the author on November 12, with the recommended answers to Q1–Q6 accepted. Phase 0 done on November 12; the repositories went public the same day as fresh repositories, with the development history kept private as `*-history`.** Covers how mVote, mPile and the shared packages reach people: package registries, release workflow, DOIs, and who can create sessions on the hosted sites.

"MUST" is a rule. "SHOULD" is the default, and departing from it needs a reason you can state.

## Objective

A researcher or community partner who isn't us should be able to run a session with mVote or mPile without cloning a repository, and ideally without opening a terminal. A developer should be able to install the shared packages by version from a public registry. Every release should be citable.

Packaging alone doesn't get there. Today the hosted sites are gated by keys: mVote by the Firebase admin key and mPile by creation keys. So this spec covers two layers:

1. **Installing the tools.** Registries, versions, and a release workflow.
2. **Creating sessions.** Who can create sessions on mvote.app and mpile.app, and how people run their own copy instead.

## Where things stand (2026-11-12)

| | How it's used today | Who can create sessions on the hosted site |
|---|---|---|
| **mVote** | Python command-line tool, installed with `pip install "git+https://github.com/MalverdeSoftware/mvote.git#subdirectory=cli"`. `mvote create --publish` and `mvote results` talk to Firestore through the Firebase Admin SDK. | Only whoever holds the `mvote-app` service-account key. Firestore rules let clients read boards and cast votes, never create boards. |
| **mPile** | Clone the repo, then `npm run console` serves the researcher console at localhost. Keys are made and kept in the browser. | Anyone with a creation key issued by the operator. The relay stores only hashes of keys (`RELAY_CREATION_KEY_HASHES`). A creation key opens no one's data. |
| **Shared packages** | Packed `.tgz` files copied into each app's `vendor/` folder ([CONSUMING.md](../CONSUMING.md)). | n/a |

- **License:** all three are Apache-2.0, copyright The Johns Hopkins University, since 2026-11-12 (MVS-4).
- **Visibility:** the repos are still private. Making them public waits on trademark clearance of the names (MVS-6, MVS-13).
- **Names:** `mvote` and `mpile` are unclaimed on PyPI and npm, and the `@malverdesoftware` npm org appears unclaimed, all as of 2026-11-12.

## Rules for every release

- A release MUST start from a tag on `main` and be published by GitHub Actions, never from a laptop.
- Registries MUST be reached through trusted publishing (OIDC), with no long-lived tokens stored in the repo. PyPI and npm both support this.
- Every published package MUST contain `LICENSE` and `NOTICE`. Apache-2.0 Section 4(d) requires NOTICE to travel with the code. The release job copies both from the repo root into the package folder before building, because packaging tools won't reach files outside the package folder.
- Versions MUST follow semantic versioning. Apps MUST pin exact versions of the shared packages, the same rule as today.
- Each GitHub release SHOULD mint a Zenodo DOI through the Zenodo GitHub integration. The repo's concept DOI, which stays the same across versions, then replaces the GitHub link in NOTICE, CITATION.cff and the README. `CITATION.cff` gets `version`, `date-released` and `doi` in the same release commit.
- Registry accounts MUST belong to the MalverdeSoftware organization (an npm org and a PyPI organization), not to one person, and MUST use two-factor sign-in. They SHOULD have a second maintainer.
- Release notes SHOULD say what changed for facilitators in plain words, not only for developers.

## Phases

### Phase 0: prepare while the repos are private

- Write the release workflows and run them in dry-run mode: `python -m build` plus `twine check`, and `npm pack --dry-run`. Nothing gets uploaded.
- Change `cli/pyproject.toml` to the SPDX form `license = "Apache-2.0"` with `license-files`, which needs setuptools 77 or newer.
- Confirm the names are clear (MVS-13) before anything is uploaded. A published name is hard to give up, and PyPI never reuses a deleted project's file names.

### Phase 1: at the public flip

1. **Shared packages on npm**, as `@malverdesoftware/relay`, `@malverdesoftware/sealed-envelope`, `@malverdesoftware/session-client` and `@malverdesoftware/ui`.
   - Remove `"private": true` and publish with `npm publish --provenance --access public`.
   - Tags are per package, for example `ui-v0.1.1`.
   - mVote and mPile switch from the vendored `.tgz` files to exact registry versions. This also brings the new license footer in `@malverdesoftware/ui` to both apps.
2. **mVote's tool on PyPI** as `mvote`, installed with `pipx install mvote` or `pip install mvote`. Tag `v0.1.0` releases the tool and the web app together.
3. **DOIs**: turn on Zenodo for the three repos and mint the first DOIs with these releases.
4. **OSPO catalog**: submit mVote, mPile and the shared packages once their repo URLs are public.

### Phase 2: let other facilitators create sessions

5. **mVote creation keys.** Add `POST /api/boards` to the mVote Worker. It works like mPile's relay:
   - It accepts a creation key, checks it against hashes in a Worker secret, and writes the board through the Firestore REST API.
   - The service-account credential stays a Worker secret and never leaves Cloudflare.
   - Firestore rules don't change.
   - The tool gains `mvote create --creation-key`, so a facilitator who installed it from PyPI can publish to mvote.app without the admin key.
   - `mvote results` already works without a key for reading, because boards and votes are publicly readable.
6. **`npx mpile`.** Publish the built researcher console as an npm command that serves it on localhost, so `npx mpile` replaces cloning the repo (Q5).
   - The console code stays pinned to a published, checkable version and runs on the researcher's own computer.
   - That keeps today's trust model: the site operator can't swap the console's code under a researcher.

### Phase 3: no terminal at all

7. **mPile console hosted on mpile.app.** The console already runs entirely in the browser, and keys stay there, so serving it from the site fits the rule that the provider never reads participant data.
   - **The trade-off:** researchers then trust whatever code the site serves when they open it. A tampered deploy could take keys.
   - **Mitigations:** publish each deploy's build manifest (file hashes, which `scripts/build-manifest.mjs` already records). Keep `npx mpile` as the path for anyone who wants pinned code. Say both plainly on the console page.
8. **mVote "create a board" page.** A researcher screen on mvote.app that uploads an item list, takes a creation key and calls `POST /api/boards`. Results export as CSV in the browser, since votes are publicly readable. It follows SPEC-ui for researcher screens.
9. **Self-hosting.** Add a "Deploy to Cloudflare" button and a short guide for each app.
   - mPile already has `docs/SELF_HOSTING.md`.
   - mVote's guide must cover creating your own Firebase project.
10. **Optional: readers for analysts.** Small Python and R packages that read mPile's `mpile-sort/v1` and `mpile-session-archive/v1` files and mVote's results CSV into data frames. Only if users ask.

## Decisions (author, 2026-11-12)

The author accepted each recommendation.

| # | Question | Decision |
|---|---|---|
| Q1 | Who gets creation keys on the hosted sites? (a) only you; (b) collaborators on request; (c) anyone who signs up | (b), collaborators on request. Free-tier costs and abuse stay manageable, and each key can be retired. Anyone else self-hosts. |
| Q2 | Host the mPile console on mpile.app (Phase 3, item 7), or offer only `npx mpile`? | Both, `npx` first. Hosting is the bigger usability gain; `npx` keeps a pinned-code path. |
| Q3 | For mVote, build the creation-key endpoint and tool option first, or go straight to the web page? | Endpoint and tool option first. The web page reuses the same endpoint. |
| Q4 | Release at the public flip, or publish to the registries earlier? | At the public flip. A published package is public source anyway. |
| Q5 | npm name for the console command: unscoped `mpile`, so people type `npx mpile`, or scoped `@malverdesoftware/mpile`? | Scoped `@malverdesoftware/*` for the libraries. The console command is also published as unscoped `mpile`, once the name is cleared. |
| Q6 | Who maintains the registry accounts? | A MalverdeSoftware org account, with the author plus a second maintainer. Ask the OSPO whether JHU wants to be listed, since it owns the copyright. |

## Not in this spec

- App store builds (iOS or Android), Homebrew and conda-forge: revisit if users ask.
- Research data: never part of any package, and governed by the communities and partners responsible for each activity.
- mKnockabout and the IndigiText engine have their own ownership and release questions.

## Changing this spec

The author approves changes. Record each change at the top with its date.
