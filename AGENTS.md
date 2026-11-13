# MalverdeSoftware working instructions

This repository holds the shared packages behind MalverdeSoftware's research tools. Read [docs/CONVENTIONS.md](docs/CONVENTIONS.md) first: Node 24, the commands, code style, testing and the boundaries (what to always do, ask about first, and never do). Package contracts are in `docs/specs/`.

- For any app screen, in this repository or an app's, follow `docs/specs/SPEC-ui.md`, and read `brand/DESIGN-ETHOS.md` for the logo and the name. For what a game shows during play, follow `docs/specs/SPEC-game-ui.md`.
- Releases follow `docs/specs/SPEC-distribution.md` and `docs/CONSUMING.md`. Publishing happens only through the release workflow on a `<package>-v<version>` tag.
- After editing the root `LICENSE` or `NOTICE`, run `node scripts/check-release.mjs --fix` so each package's copies match.
- Never commit participant data, session key files or secrets.

Maintainers may keep local, unshared instructions in `AGENTS.local.md`, which Git ignores.
