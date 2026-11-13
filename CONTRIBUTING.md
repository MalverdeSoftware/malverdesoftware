# Contributing

Issues and pull requests are welcome. For a security problem, follow [SECURITY.md](SECURITY.md) instead of opening an issue.

- **Before you start:** read [docs/CONVENTIONS.md](docs/CONVENTIONS.md). It covers Node 24, the commands, code style, testing and the boundaries, including what needs discussion first: a new dependency, or a change to a wire or file format.
- **Pull requests:** branch from `main`, keep the change focused, and run `npm test`, `npm run typecheck` and `npm run build`. Say what changed, why, and how you checked it. CI must pass before merging.
- **Specs:** a change to a package's behavior or contract updates its spec in `docs/specs/` in the same pull request.
- **Data:** tests and examples use synthetic data only. Never include real responses, session key files, keys or passcodes.
- **License:** the packages are Apache-2.0. Under Section 5 of the license, contributions you submit are licensed under the same terms.
