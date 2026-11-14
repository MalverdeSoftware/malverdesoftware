# What the relay and its host can see

This page lists, for apps built on `@malverdesoftware/relay`, `sealed-envelope` and `session-client`, exactly what leaves a participant's or researcher's device and who can see it. Apps link here in their own governance, consent and self-hosting documents instead of restating it.

## Never leaves the device in readable form

- Activity content (titles, cards, prompts), every draft and submission, and anything a participant types. These are sealed in the browser with AES-256-GCM before they are sent.
- Participant labels (such as `Y01` or `Elder 1`), passcodes, personal links and every key. These live only in the researcher's key file.

The relay cannot read any of these, and neither can its operator or host. The test `packages/session-client/test/custody.test.ts` checks that no request and nothing stored contains plaintext, labels or keys.

## Stored by the relay (the app's database)

Per session: a random session ID, the app name (such as `mpile`), hashes of the researcher's admin token and creation request, the sealed activity definition, and created, expiry and closed times.

Per participant slot: a random slot ID derived from the link, a hash of the write token, the latest sealed draft and its version number, the sealed submission and its hash, when it was last saved and submitted, and a failed-passcode count with any lockout time.

From this the operator can learn how many participants a session has, which slots have started, saved or submitted and when, and the rough size of each response. Sealed content is padded to 1 KiB blocks, so sizes are coarse.

Rows are deleted when the researcher deletes the session, or by the hourly purge after expiry (14 days by default, at most 30).

## Seen by the host but not stored by the relay

On Cloudflare (the hosted relay, and the default for self-hosting):

- **Network metadata.** Every request reaches Cloudflare with the device's IP address, user agent, time, path (which includes the session and slot IDs) and size. The relay code does not record these. Cloudflare processes them to deliver and protect traffic and may keep operational logs under its own policy.
- **Worker logs.** Apps should turn off Workers observability, as mPile does. The relay writes only one log line, on an internal error, containing the route name and no request data.
- **Database recovery history.** D1 "Time Travel" is always on. After deletion, Cloudflare keeps a recoverable copy of the database for up to 7 days on free plans, or 30 on paid plans. That copy holds only the sealed data listed above.

So a host can see that a device at a given IP address opened a given session at a given time. It cannot see who the participant is in the study, or what they answered.

## Reading data without the app

The key file and Node 24 are enough to collect and decrypt a session's responses while the relay still holds them, without the app's own console:

```bash
npx @malverdesoftware/session-client verify my-session.malverdesoftware-session.md
```

```bash
npx @malverdesoftware/session-client collect my-session.malverdesoftware-session.md --drafts --out responses.json
```

`collect` contacts the relay named in the key file and writes plain JSON (`malverdesoftware-collection/v1`): the activity definition and each response with its participant label, kind and time. The output is readable participant data, and it can't overwrite an existing file. Store it as carefully as the key file. After the relay deletes a session, only exports saved earlier remain.
