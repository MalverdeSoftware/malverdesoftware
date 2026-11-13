# Status and handoff

> Historical handoff notes from round 1 (October 2026), kept as written. Commit hashes and repository links refer to the private development history (`MalverdeSoftware/malverdesoftware-history` and the archived app repositories), which only maintainers can open. The public repository starts at its first public release (2026-11-12).

Updated October 26, 2026 (evening). Read this first when picking up round 1. Plan: [plan.md](plan.md). Tasks: [todo.md](todo.md). Specs: [docs/specs/](../docs/specs/).

## Where things stand

| Area | State |
|---|---|
| Foundation packages (`sealed-envelope`, `relay`, `session-client`) | **Done.** 142 tests on `main`, including the custody test. `session-client` 0.1.1 adds `readDefinition` (approved October 26, 144 tests); see item 5 below. CI runs on every PR and push to `main` and passes, including the fresh-mPile consumer check. Checkpoints CP1 and CP2 are met. |
| Specs | All four approved (the map plus three module specs, and `SPEC-mpile-app.md`, approved Oct 25 with the author's decisions) |
| mPile app | **In progress** on branch `round1/sealed-sessions` (from `phase0/jetbrains-pilot`): T15–T20 done, at `b6b0128`, pushed to the **private** repository [MalverdeSoftware/choachoaktepile-round1](https://github.com/MalverdeSoftware/choachoaktepile-round1) (see the decision below) |
| Hub | Intent, decision and handoff records are on `main` in the private research-context-hub |

### mPile branch `round1/sealed-sessions`

1. `d5ee8af`: **relay mounted at `/relay`**. The three packages are vendored at `app/vendor/malverdesoftware/` (0.1.0, packed from `25c86fc`). `app/worker/index.ts` is a custom Worker entry: `/relay/*` goes to the relay on D1 binding `RELAY_DB` (schema applied once per isolate), and the hourly `scheduled` handler runs the purge. **Verified** on the dev server (workerd plus local D1): a full session-client flow (publish, join, draft, submit, status, collect, close, delete) works.
2. `5288858`: **`app/lib/session.ts`**: the sort definition (`mpile-sort/v1`), baseline text, browser-side response checks, adapters for the existing analysis and CSV exports, the participant-code parser (`Y01-Y12`) and file slugs. 6 new unit tests; 14 pass in total.
3. `c5a083a`: **WIP participant page `/p`**, in `app/components/participant/`:
   - the passcode form, the sort-only board, autosave with honest status, submit, the sending screen and the submitted screen
   - `tests/browser-smoke.mjs` (`npm run test:browser`) drives headless Chrome over the DevTools protocol at phone size, with no new dependencies

   Its first browser run found a real bug: opening a second personal link in the same tab kept the first link. That is fixed with a reload on `hashchange`.
4. `177c5ce`: **participant page finished (T17)**, October 26. `npm run test:browser` passes at phone size (repeated runs, no console errors), and the screenshots were reviewed. The rerun found:
   - **A race in the check itself.** After a navigation or reload, waits could pass on the old page's text, and the next DevTools call (a screenshot) then hung across the reload. The check now marks the old page and waits for a fresh one. Every DevTools call times out after 20 seconds with its method name instead of hanging. The second-link step now fails if the `hashchange` reload is removed (confirmed).
   - **The reload step asserted the opposite of the spec.** `SPEC-session-client` erases the remembered passcode after submission, so reopening a submitted link asks for the passcode, then shows the device's own copy. The check now tests exactly that. (Design note for the author: a youth who reopens their link after submitting sees the passcode screen first.)
   - **Participant counts read "1 piles".** The toolbar and the submit dialog now use singular and plural correctly, and the check asserts both.

   Not yet fixed: `npx eslint components/participant` reports 4 errors carried over from the WIP commit (`react-hooks` rules in `participant-page.tsx` and `use-autosave.ts`, and two unescaped apostrophes in `sort-workspace.tsx`). CI does not run lint.
5. **Researcher console at `/` (T18)**, October 26. `npm run console` serves it at `http://localhost:5173` (Vinext ignores `--host`, so it is `localhost`, not `127.0.0.1`). The deployed build shows a public landing page instead and leaves the console code out entirely (checked in `dist/`). In `app/components/console/` and `app/lib/console.ts`:
   - **create:** title, cards (paste or CSV), participant codes, days until deletion, randomized order, the editable baseline text, and the relay address (defaults to production; any other address shows a development warning)
   - **save and publish:** downloading the key file and confirming the Teams copy are required before publishing; the creation key is remembered on this computer if the author keeps that box ticked
   - **open a key file:** status per participant with copy buttons for each link and passcode; add participants (prompting to save the updated file) or remove one (with confirmation)
   - **collect and export:** `collect({ includeDrafts: true })`, with every problem reported by participant code; four exports (`<slug>-submitted-memberships.csv` with a `participant_code` column, `-pairwise-similarity.csv`, `-not-submitted.csv` for drafts only, `-archive.json`); and the existing analysis on submitted sorts only
   - **finish:** close, then delete, which requires confirming the exports were saved and warns if there has been no collection since closing. A deleted or expired session's key file still opens and says the session is gone.

   **Foundation change (approved October 26):** reopening a key file needs the activity definition, which only existed sealed inside the file. `session-client` 0.1.1 adds `readDefinition(file)` (two tests), so the app never opens envelopes itself. Pile vendors 0.1.1; `relay` and `sealed-envelope` stay at 0.1.0 (their repacked tarballs are byte-identical).

   **Checks:** 17 unit tests (`tests/console.test.ts` covers the exports: labels, drafts kept apart, accents, emoji, quotes and formula escaping). `npm run test:console` drives the whole console in headless Chrome against `npm run console`: create, save, publish, participants acting through `session-client`, reopen the saved file, add, remove, collect, all four exports, close, collect again, delete, reopen. It passed repeatedly, including under parallel load. One early run failed without a captured error; waits for dialogs and for collecting to finish were tightened afterwards. Both browser checks now share `tests/chrome.mjs`. Cards must also be unique now (`buildDefinition`).

   **Differences from the spec:** `prepareSession` reports no per-participant progress, so the console shows a "Preparing N personal links…" status instead of a progress bar (about 20 ms per participant). A session whose page closed before publishing cannot be published from its saved file; create a new one.

6. `30b2e8b`, `06a63f7`, `14681a5`: **plaintext path removed; integration test through `/relay`; security headers (T19)**, October 26.
   - **Removed:** `app/api`, `lib/server.ts`, `db/`, the Drizzle config, migrations and packages (83 lockfile entries; no other version changed), the `/study/[id]` and `/manage/[id]` pages, the three old components, `app/chatgpt-auth.ts`, `scripts/migrate-local.mjs` (`db:local`), and the Sites template's `examples/d1`, which needed Drizzle. `lib/client.ts` keeps only the browser helpers.
   - **Old `DB` binding dropped:** dev config (`vite.config.ts`) and `deploy:prepare`, which now writes `RELAY_DB` only (domain, cron and observability come with T20). In dev, both bindings had shared one placeholder database ID, so the local database file still holds the old synthetic tables, unused.
   - **`npm run test:integration`** now runs a whole synthetic session through `/relay` on the dev server: security headers on `/`, `/p` and RSC requests; the old `/api` gone; publishing (a wrong creation key refused, a repeat replayed); a wrong passcode; submit, draft and continuing on another device; status; collect, with every body checked; add and remove (a removed participant's link answers `NOT_FOUND`); close; delete (then `404`). **Purge:** a second synthetic session is backdated in the local D1 (`wrangler d1 execute --local`, since the relay accepts only future expiry dates), answers `410`, the scheduled-event endpoint runs the hourly handler, and it answers `404`; a live session survives.
   - **Headers are set in `worker/index.ts`**, not `next.config.ts`: Vinext applied `next.config` headers to some responses only (not `/`, not RSC requests). Every page gets `Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'`, plus `Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY` and a `Permissions-Policy` turning off camera, microphone and location. Only the local console's build also lets pages connect to the production relay and to relays on this computer; the deployed build compiles that out.
   - **Left open, as the spec anticipated:** `script-src` and `style-src` keep `'unsafe-inline'`. Vinext delivers each page's React Server Components payload in inline `<script>` tags and renders an inline `<style>` (seen in the production build), and React style attributes need inline styles. Dropping them needs nonce support in Vinext. Static files served by Cloudflare's asset layer do not get these headers; the CSP matters for pages, which all pass through the Worker.
   - **`npm run check:build`**, now part of `npm run verify` (so CI runs it): the built client may mention only 8 known origins that are never loaded (XML namespaces, documentation links in library messages, the repository link, Vinext's placeholder hosts); the deployed CSP's `connect-src` is `'self'`; the console is left out. It fails on a console build (checked).
   - **Browser checks** now fail on any browser-reported error, CSP violations included (checked with a deliberately blocked request); expected HTTP error statuses are ignored. Taps wait until nothing covers the element: a dialog's overlay sits over its buttons for about 300 ms while it animates open, which made taps miss intermittently (the likely cause of the unexplained T18 failure).
   - **Production build, run locally** (`wrangler dev` on `dist/`): the participant check passes under the deployed CSP, and the integration test passes everything up to the purge. The purge step cannot run there: Wrangler's dev proxy fails to forward scheduled events to a prebuilt bundle (`DataCloneError` on `ScheduledController`), before the app's handler. The Vite dev server runs the same handler, and the purge passes there.
   - **Not yet updated:** `docs/SELF_HOSTING.md`, `docs/FACILITATOR_GUIDE.md` and `docs/PHASE0.md` still describe release 0.1 (T20). The README's "Start locally" and "Development" sections are updated.

7. `5b1c45f`, `b6b0128`: **deploy configuration and guides (T20)**, October 26.
   - **`npm run creation-key`** prints a new creation key and its SHA-256 hash (checked: the hash matches the relay's own hashing). Only the hash goes to Cloudflare, as the secret `RELAY_CREATION_KEY_HASHES`.
   - **`npm run deploy:prepare -- <RELAY_DB UUID>`** writes `wrangler.selfhost.json`: Worker `mpile`, custom domain `mpile.app`, `RELAY_DB` to `mpile-relay`, cron `0 * * * *`, observability off, no other bindings. `--domain` and `--name` override the defaults for other deployments. It also sets `workers_dev: false` and `preview_urls: false`, so the site exists only at the custom domain (a choice the author can reverse). `wrangler deploy --dry-run` with a test UUID accepted it: `RELAY_DB` is the only binding, and the built modules and 22 static files attach. The author's existing (ignored) `wrangler.selfhost.json`, the 0.1 config, was left as it was.
   - **`docs/SELF_HOSTING.md`** is rewritten for round 1: running locally, the deploy runbook with checks, creation keys, updates, data and deletion (with the 7-day recovery-history sentence), free-plan limits, headers and what is not included. Deploying before setting the creation-key secret is safe, because until then the relay refuses to create sessions.
   - **`docs/FACILITATOR_GUIDE.md`** is now the researcher guide: create, save the key file and publish, send links and passcodes (with what participants see and a table of their messages), follow progress, collect and export, close, collect again, delete (with the recovery-history sentence), and the rehearsal list. Every button label and message was checked against the code.
   - **Still describing release 0.1, for the author to decide:** the README's status line and "What it does" (three workflows, a management link), and `docs/ROADMAP.md`. `docs/METHODS.md` still mentions participant-generated cards, which round 1 does not use; its analysis description holds.

## Next steps, in order

1. ~~**Finish the participant page**~~: done October 26 (item 4 above).
2. ~~**Researcher console at `/`**~~: done October 26 (item 5 above).
3. ~~**Remove the plaintext path**~~: done October 26 (item 6 above).
4. ~~**Deploy configuration**~~: done October 26 (item 7 above).
5. **Cloudflare, target Oct 30.** The author: in the Cloudflare dashboard, turn on Workers and D1 if prompted, then run `npx wrangler login` in `mPile/app` (it opens a browser). Then, each with the author's approval, following `docs/SELF_HOSTING.md`:
   - `npx wrangler d1 create mpile-relay`, then `npm run deploy:prepare -- <UUID>`
   - `npm run verify`, then `npx wrangler deploy --config wrangler.selfhost.json`
   - the author runs `npm run creation-key` and keeps the key; the hash is set with `npx wrangler secret put RELAY_CREATION_KEY_HASHES --config wrangler.selfhost.json`
   - checks: `/relay/v1/health`, the page headers, and one synthetic session from the console against the production relay
6. **Rehearsal** Nov 2–3 with real phones; **readiness gate** Wed Nov 4. Target send date ~Nov 8.

## How to resume

```sh
export PATH="/opt/homebrew/opt/node@24/bin:$PATH"   # Node 24.22.1 (Homebrew node@24); default node is 26
cd ~/Desktop/malverde/Projects/mPile/app
npm ci
npm test && npm run typecheck
npm run dev                  # http://localhost:5173 with /relay and a local D1 database
npm run test:browser         # in another terminal; needs Google Chrome
```

- **`app/.dev.vars`** (git-ignored) holds the SHA-256 hash of the development creation key `dev-creation-key-synthetic-data-only`. That key is for local synthetic data only and is never used in production. If the file is missing, recreate it with `RELAY_CREATION_KEY_HASHES=<hashToken of that key>`.
- **Foundation repository:** `npm test`, `npm run typecheck`, `npm run build`, `npm run relay:dev`. To ship a package change: `npm run pack`, then copy the tarballs into mPile's `app/vendor/malverdesoftware/` and reinstall ([CONSUMING.md](../docs/CONSUMING.md)).

## Decision: where the mPile round 1 work lives

The earlier app repository was public, and `round1/sealed-sessions` vendors the private foundation packages. On October 25 the author chose to keep it private for now. The branch lives in **[MalverdeSoftware/choachoaktepile-round1](https://github.com/MalverdeSoftware/choachoaktepile-round1)** (private; that branch is the default).
- In the local checkout, the branch tracks the remote `round1`. Nothing goes to `origin` (public) unless someone pushes there on purpose.
- Whether and when this work becomes public is decided later: when round 1 ships. Licensing is settled: Apache-2.0, copyright JHU (2026-11-12, MVS-4). The deployed participant page will serve the browser-side package code publicly anyway.
- To pick up elsewhere: `git clone -b round1/sealed-sessions https://github.com/MalverdeSoftware/choachoaktepile-round1.git`.

## Notes for whoever continues

- **npm 11's install-scripts warning** in mPile covers esbuild, workerd and unrs-resolver, which were already installed. Builds work; nothing was approved or denied.
- **Merging:** PRs are squash-merged. Rebase stacked branches onto `main` after their base merges.
- **Tests:** never search ciphertext or tokens for short strings. Use markers containing spaces.
- **Process:** the author approves specs and design decisions. Merges, pushes and CI are routine and need no approval. Deploys, cloud resources, DNS and anything that publishes still need the author's go-ahead.
