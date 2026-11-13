# Spec: mpile-app

Module id `mpile-app` · October 25, 2026 · **Status: approved by the author on October 25, with the decisions recorded at the end.** Depends on `session-client` and `relay` (merged in #4 and #3), installed as pinned tarballs ([CONSUMING.md](../CONSUMING.md)). Work happens in the mPile repository on a new branch, `round1/sealed-sessions`, from `phase0/jetbrains-pilot`. Repository-wide boundaries are in the [capability map](round1-capability-map.md#repository-conventions-for-malverdesoftware); mPile keeps its own code style.

## Objective

Run the first youth CAB pile sort on mPile without the vendor ever holding readable data:

1. The author opens the **researcher console on their own computer**. They load the notecard text messages (paste, or CSV), add participant codes (Y01…), and save the session key file to their computer and their Teams channel files. Then they publish.
2. They send each youth a **personal link** and a **six-digit passcode**, ideally through different channels.
3. Each youth opens the link on a phone or laptop at `mpile.app/p`, enters the passcode, and **sorts the cards into piles**. Progress saves as they go, keeps working through patchy signal, and continues on another device. They submit when done.
4. The author reopens the key file in the console to see who has finished, then **collects, exports, closes and deletes**. Exports land on their computer: submitted sorts, a separate "not submitted" file, and the archive. The analysis views (co-sorting matrix, connection map, clustering) work on the collected data.

## What changes in mPile

| Today | Round 1 |
|---|---|
| `/`: create an activity (stored on the server in plain text) | **`/`: researcher console.** Fully available only when run on the author's computer (`npm run console`). The deployed site shows a short public page explaining the app and where participants go. |
| `/study/[id]`: participant page | **`/p`: participant page.** The link fragment carries the session; asks for the passcode; same sorting interface |
| `/manage/[id]`: management page | Merged into the console: open a key file, status, collect, export, analysis, close, delete |
| `/api/[...path]`: plaintext API (`lib/server.ts`) over D1 tables `studies` and `responses` | **Removed.** The relay is mounted at `/relay/*` by a custom Worker entry, on a **new** D1 database used only for relay tables |
| `lib/client.ts` `request()` calls in three components | `@malverdesoftware/session-client` |
| Modes `sort`, `generate_sort`, `collect` | **Sort mode only.** The other modes' UI and model code stay in git history and are not ported |
| Unused `app/chatgpt-auth.ts` | Removed. The Sites plugin's sign-in is a dev-server mock and adds no sign-in to a Cloudflare deployment. |

Kept and reused: `pile-ui.tsx`, `board-tools.ts`, `model.ts` schemas and `validateBody` (now run in the browser), `analysis.ts`, `analysis-view.tsx`, `parseCards` (CSV import), and the CSV and archive export code. Exports gain a participant-label column.

The existing hosted review instance is **not touched** this round. Its retirement is a later, separate step.

## Behavior

### Researcher console (local only)

- **Create:** title; instructions, help and participant information text, each pre-filled with an editable baseline template the researcher adapts; randomize-order option, cards from paste or CSV (at most 100, unique), participant codes (at most 200), expiry (default 14 days). Then:
  - `prepareSession`, with a progress bar (passcode stretching takes about 15–25 ms per participant on a laptop).
  - **Save the key file** as `<title-slug>.malverdesoftware-session.md`. A required step reminds the author to keep a second copy in their Teams channel files.
  - Enter the creation key, then publish.
  - Show the link and passcode table, with copy buttons per row.
- **Open:** pick a saved key file. Session secrets are held in page memory only, never in browser storage. The creation key may be remembered in this computer's browser storage, if the author chooses.
- **Status:** each participant's state and last update. Add participants (prompting the author to save the updated file again) or revoke one (with confirmation, since it deletes their data).
- **Collect and export:**
  - `collect({ includeDrafts: true })`, then validate each body with `bodySchema` and `validateBody`.
  - Report anything unreadable or invalid by label, instead of silently dropping it.
  - Download `<slug>-submitted-memberships.csv`, `<slug>-pairwise-similarity.csv`, `<slug>-not-submitted.csv` (drafts, kept separate) and `<slug>-archive.json`, which holds the definition and every collected item with label, kind and time.
- **Close, then delete:** closing comes first, then collecting, then deleting, which asks for confirmation that the exports are saved. Deleting leaves the local key file in place.
- **Relay address:** defaults to `https://mpile.app/relay`. A settings field allows `http://127.0.0.1:…` for local development.

### Participant page (`/p`)

- Reads the link fragment with `parseParticipantLink`. A malformed link shows how to reopen the full link.
- **Passcode screen:** six-digit field (`inputmode="numeric"`, `autocomplete="one-time-code"`), plus a "This is a shared computer" checkbox (`rememberOnDevice: false`). Plain-language messages for each case:
  - wrong passcode
  - too many attempts (with the wait time)
  - activity closed
  - activity ended (expired)
  - not found
- **Sorting:** the existing interface, with the definition from `joinSession`. It autosaves one second after each change and when the page is hidden, through `saveDraft`. A visible status shows one of:
  - "Saved"
  - "Saved on this phone; will sync when you're back online"
  - "Changed on another device; reload to continue"
- **Submit:** confirmation, then `submit`. While a submission is pending, the page shows "Sending…" and retries with `retryPending` when the connection returns. After that it shows confirmation and this device's own copy.

### Relay mount and deployment

- **Worker entry.** A custom entry, `app/worker/index.ts`, sends `/relay/*` to `createRelay({ store: sqlStore(d1Database(env.RELAY_DB)), creationKeyHashes })` and everything else to Vinext's handler. Its `scheduled` handler runs `purgeExpired` hourly. `creationKeyHashes` comes from the Worker secret `RELAY_CREATION_KEY_HASHES`, comma-separated.
- **Deploy config** (written by `deploy:prepare`):
  - Worker `mpile`
  - custom domain `mpile.app`
  - D1 binding `RELAY_DB` to a new database, `mpile-relay`, migrated from `sql/schema.sql` in the relay package
  - cron `0 * * * *`
  - **observability off**
  - no other bindings
- **Response headers on every page:**
  - a content security policy with no third-party origins (`default-src 'self'`, `connect-src 'self'`, `frame-ancestors 'none'`, `base-uri 'none'`, `form-action 'none'`)
  - `Referrer-Policy: no-referrer`, as today
  - **Tightening `script-src`** to drop `'unsafe-inline'` depends on what Vinext's hydration needs. The build is checked, and anything left open is listed in the PR.
- **Creation key.** `npm run creation-key` prints a new key and its hash. The author keeps the key; only the hash goes to Cloudflare.

### Hosting notes (Cloudflare free plan, checked October 25, 2026)

- **Daily limits.** Workers allow 100,000 requests a day. D1 allows 100,000 rows written and 5 million read a day, with 5 GB of storage.
  - Since September 1, 2026, D1 queries on the free plan **fail** once a daily limit is exceeded, until it resets at 00:00 UTC.
  - A 20-person sort uses a few thousand writes in total, so it stays far below that.
  - For much larger studies, lengthen the autosave interval or move to the paid plan. If saves fail, participants' work stays on their device and syncs after the reset.
- **Recovery history.** D1's Time Travel is always on. A deleted session can be restored, still sealed and unreadable, for 7 days on the free plan (30 on paid). The researcher guide must say so plainly: "deleted from the live database when you delete the session; Cloudflare's recovery history keeps the sealed copy for up to 7 more days."

## Commands (in `mPile/app`)

```sh
npm run console                      # researcher console on http://localhost:5173 (local only)
npm run dev                          # app + relay + local D1 for development
npm test                             # unit tests (node --test)
npm run typecheck
npm run build
npm run test:integration             # session-client flow through /relay on the local dev server and local D1
npm run creation-key                 # prints a creation key and its SHA-256 hash
npm run deploy:prepare -- <RELAY_DB UUID>   # writes wrangler.selfhost.json for the round 1 deployment
```

## Testing

- **Unit:** definition and response validation in sort mode; export builders (labels, drafts kept separate, CSV quoting with emoji and accents); autosave scheduling.
- **Integration (Wrangler local):** replaces `tests/integration.mjs`'s plaintext-API checks. Using session-client against the local server, it covers:
  - publish, join, save, submit, status, collect, close and delete through `/relay`, proving the D1 driver at runtime
  - the purge through Wrangler's scheduled-event endpoint
- **Build checks:** the built client contains no third-party origins, and pages carry the security headers.
- **Rehearsal (Nov 2–3), with the author and at least one other person:**
  - iPhone Safari and Android Chrome
  - links sent by SMS and by email; passcodes entered
  - airplane mode during sorting, then recovery
  - phone to laptop
  - submit, then collect, export, close and delete
  - one wrong-passcode lockout
  - `deriveSlot` timing on the oldest phone available
  - findings recorded in the PR

## Boundaries

- **Always:** use synthetic cards until the readiness gate passes. Keep the console's session secrets in page memory only. Show sync state honestly.
- **Ask first:**
  - each production deploy
  - creating Cloudflare resources
  - changing the domain
  - turning on any logging
  - porting `generate_sort` or `collect`
- **Never:**
  - deploy the plaintext API or the old `studies`/`responses` tables with the relay
  - put session secrets, labels or card text in URLs other than the link fragment
  - add analytics or third-party scripts or fonts
  - load real notecard text before the gate

## Success criteria

- [ ] The integration test passes against Wrangler local, including the scheduled purge.
- [ ] The deployed site serves `/p` and `/relay/v1/health` at `mpile.app`, with observability off and the headers above. It has no plaintext API routes.
- [ ] Every rehearsal item above passes on real phones, or its failure is recorded and the date moves.
- [ ] The exports open in a spreadsheet with correct labels and characters. "Not submitted" drafts are never mixed into submitted data.
- [ ] After delete, `GET /relay/v1/sessions/<id>` returns 404, and the local key file still opens.

## Steps only the author can do

| By (2026) | Step |
|---|---|
| ~~Oct 27~~ | ~~Review and approve this spec~~ (done October 25) |
| Oct 30 | In the Cloudflare dashboard, turn on Workers and D1 if prompted (the free plan is enough; first use asks you to opt in). Then run `npx wrangler login` in `mPile/app`. It opens a browser, so it is yours to do. |
| Oct 30 | Approve creating the `mpile-relay` database, setting the creation-key secret, and the first deploy. With your login in place, I can run these. |
| Nov 2–3 | Rehearsal with real phones |
| Nov 4 | Readiness gate |

## Decisions (October 25)

1. **Old hosted instance.** It holds only synthetic placeholder data generated for testing, and may stay up as an example for other researchers. Retiring it later needs no data handling.
2. **Participant-facing text.** Researchers write it. The console pre-fills an editable baseline template for the instructions, help and participant information. **Consent and assent happen outside the apps.** In a real study, youth are recruited, screened and consented or assented in a system such as REDCap; only after enrollment does the researcher run a session. The app collects no consent and shows only the information the researcher provides.
3. **Cloudflare account.** `delasierra.io` is on the author's Cloudflare account. Workers and D1 may need a one-time opt-in there.
4. **Creation key.** The console remembers it in the browser storage of the author's own computer.
