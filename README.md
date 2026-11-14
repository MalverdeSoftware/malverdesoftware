# MalverdeSoftware

[![DOI](https://zenodo.org/badge/DOI/10.5281/zenodo.24184643.svg)](https://doi.org/10.5281/zenodo.24184643) [![License: Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE) [![CI](https://github.com/MalverdeSoftware/malverdesoftware/actions/workflows/ci.yml/badge.svg)](https://github.com/MalverdeSoftware/malverdesoftware/actions/workflows/ci.yml)

Shared foundations for MalverdeSoftware: separate, lightweight research tools for community-based participatory research. They are meant to be free, need no logins, work on phones and in the field, and leave data with the people who collect it.

**Status: early release.** The packages are used by [mPile](https://github.com/MalverdeSoftware/mpile) and [mVote](https://github.com/MalverdeSoftware/mvote). Open source under the [Apache License 2.0](LICENSE); see [License and citation](#license-and-citation).

## What this is

The apps stay in their own repositories: [mPile](https://github.com/MalverdeSoftware/mpile) (pile sorting) and [mVote](https://github.com/MalverdeSoftware/mvote) (dot voting). Each can be used alone or one after another. This repository holds what they share, so they do not drift apart and new apps start from the same base. Apps install exact, packed versions of these packages and remain independently runnable and deployable.

The rule the shared code enforces: **the software provider never accesses, owns or keeps a readable copy of what researchers upload or participants submit.**
- A researcher starts a session and sends each participant a personal link and passcode.
- Participants sort or vote on their phones.
- The researcher saves the outputs on their own computer and closes the session.
- In between, the only server involved stores data sealed in the browser, which it cannot open, and deletes it on close or expiry.

Round 1 builds this for a youth community advisory board pile sort run remotely over about a week. The target date is around November 8, 2026, subject to a readiness gate on November 4.

## Install

```sh
npm install @malverdesoftware/sealed-envelope @malverdesoftware/relay @malverdesoftware/session-client @malverdesoftware/ui
```

See [docs/CONSUMING.md](docs/CONSUMING.md) for pinning, entry points and upgrades.

## Documents

| Document | Purpose |
|---|---|
| [Conventions](docs/CONVENTIONS.md) | Tech stack, commands, code style, testing, boundaries and known limits |
| [Using the packages](docs/CONSUMING.md) | Installing from npm, entry points, upgrades and releases |
| [sealed-envelope spec](docs/specs/SPEC-sealed-envelope.md) | Browser encryption and the envelope wire format |
| [relay spec](docs/specs/SPEC-relay.md) | Ciphertext-only store and its HTTP contract |
| [session-client spec](docs/specs/SPEC-session-client.md) | Session lifecycle, personal links, passcodes and the session key file |
| [What the relay can see](docs/DATA-VISIBILITY.md) | What leaves a device, what the relay and Cloudflare can see, and reading data without the app |
| [mUI spec](docs/specs/SPEC-ui.md) | How every app looks and behaves: Ring UI, type, color, phones, confirmation |
| [mGameUI spec](docs/specs/SPEC-game-ui.md) | Everything in a game, including what it takes from Ring and mUI, the apps' spec |
| [Distribution spec](docs/specs/SPEC-distribution.md) | Registries, releases, DOIs and who can create sessions |
| [Design ethos](brand/DESIGN-ETHOS.md) | The logo, its rules and the name |

The mPile app spec is in the [mpile repository](https://github.com/MalverdeSoftware/mpile/blob/main/docs/specs/SPEC-mpile-app.md).

## Development

Requires Node.js **24** (`.node-version` records 24.22.1, the version tested here). Node 26 is not supported. On macOS: `brew install node@24`, then put `$(brew --prefix node@24)/bin` first on your `PATH` when working in this repository.

```sh
npm ci
npm test                              # environment check, then every package's tests
npm test -w @malverdesoftware/relay   # one package
npm run typecheck
npm run build                         # dist/ for each package
npm run relay:dev                     # local relay at http://127.0.0.1:8787/relay (synthetic data only)
npm run pack                          # tarballs in artifacts/ for apps to vendor
node scripts/check-consumer.mjs       # after pack: fresh mPile clone installs, runs and builds with them
```

| Package | What it does |
|---|---|
| [`sealed-envelope`](packages/sealed-envelope) | Browser encryption: keys, passcodes, sealing and opening, per-participant credentials |
| [`relay`](packages/relay) | Ciphertext-only session store: a portable Fetch API handler with D1, `node:sqlite` and memory stores |
| [`session-client`](packages/session-client) | What apps call: session key files, personal links, publishing, drafts, submissions, collecting |
| [`ui`](packages/ui) | The shared look: stylesheets, the page frame, safe confirmation dialogs, and a check apps can run against the [UI spec](docs/specs/SPEC-ui.md) |

See [docs/CONSUMING.md](docs/CONSUMING.md) for how apps pin and upgrade these packages.

GitHub Actions ([`ci.yml`](.github/workflows/ci.yml)) runs on every pull request and push to `main`: tests, typecheck, build, the envelope fixture check and the Python cross-check. On `main` it also runs the fresh-mPile consumer check.

Session key files (`*.malverdesoftware-session.md`) can open every response in a session. This repository's `.gitignore` excludes them. Never commit or attach one.

## License and citation

The MalverdeSoftware shared packages is free, open-source software under the [Apache License 2.0](LICENSE). Copyright 2026 The Johns Hopkins University. Developed by Valentín Quiroz de la Sierra and Marissa Ledesma for MalverdeSoftware, with support from the National Institute on Drug Abuse of the National Institutes of Health under Award Number K99DA066943. The content is solely the responsibility of the authors and does not necessarily represent the official views of the National Institutes of Health. See [NOTICE](NOTICE).

To cite the MalverdeSoftware shared packages, use the "Cite this repository" button on GitHub or [CITATION.cff](CITATION.cff):

> de la Sierra, V. Q., & Ledesma, M. (2026). *MalverdeSoftware shared packages* [Computer software]. MalverdeSoftware. https://doi.org/10.5281/zenodo.24184643

The DOI [10.5281/zenodo.24184643](https://doi.org/10.5281/zenodo.24184643) always resolves to the latest release; each release also has its own DOI on Zenodo.

The license covers the code only. The MalverdeSoftware, mVote and mPile names and the MalverdeSoftware logo are not licensed (Apache-2.0, Section 6). Research data collected with this software is not covered either. The communities and partners responsible for each activity govern it.
