// The key acceptance test for round 1: the vendor's relay never receives or stores anything readable.
import { test } from "node:test";
import assert from "node:assert/strict";
import { deriveSlot } from "@malverdesoftware/sealed-envelope";
import {
  joinSession,
  memoryStorage,
  openResearcherSession,
  parseParticipantLink,
  prepareSession,
  publishSession,
} from "../src/index.ts";
import { FAST, PARTICIPANT_URL, RELAY_URL, inProcessRelay } from "./support.ts";

const MARKERS = {
  title: "MARKER-TITLE-e1f29c",
  card: "MARKER-CARD-7f3a91 ¿Vienes mañana?",
  pile: "MARKER-PILE-c2d8e0",
  note: "MARKER-NOTE-55b1aa",
  description: "MARKER-DESCRIPTION-0d4e77",
};
// Spaces cannot appear in base64url, so these labels cannot occur by chance inside tokens or ciphertext.
const LABELS = ["Youth Alpha", "Youth Bravo", "Youth Charlie"];

test("no request to the relay, and nothing it stores, contains plaintext, labels or keys", async () => {
  const relay = await inProcessRelay();
  const options = { fetch: relay.fetch, ...FAST };
  const file = await prepareSession({
    app: "mpile",
    title: MARKERS.title,
    relayUrl: RELAY_URL,
    participantUrl: PARTICIPANT_URL,
    definition: { title: MARKERS.title, cards: [{ id: "c1", text: MARKERS.card }] },
    participantLabels: LABELS,
  });
  await publishSession(file, { creationKey: relay.creationKey, ...options });

  const sort = { piles: [{ id: "p1", name: MARKERS.pile, description: MARKERS.description }], assignments: { c1: "p1" }, notes: MARKERS.note };
  const join = (label: string) => {
    const p = file.participants.find((x) => x.label === label)!;
    return joinSession(parseParticipantLink(p.link), { app: file.app, relayUrl: RELAY_URL, passcode: p.passcode, storage: memoryStorage(), ...options });
  };
  const alpha = await join("Youth Alpha");
  await alpha.saveDraft(sort);
  const bravo = await join("Youth Bravo");
  await bravo.saveDraft(sort);
  await bravo.submit(sort);
  await join("Youth Charlie");

  const researcher = openResearcherSession(file, options);
  await researcher.status();
  const collected = await researcher.collect({ includeDrafts: true });
  assert.deepEqual(collected.map((r) => [r.label, r.kind]), [["Youth Alpha", "DRAFT"], ["Youth Bravo", "SUBMITTED"]]);

  // Everything the relay holds, captured before the session is deleted.
  const stored: unknown[] = [await relay.store.getSession(file.sessionId)];
  for (const p of file.participants) stored.push(await relay.store.getSlot(file.sessionId, p.slotId));
  await researcher.close();
  await researcher.destroy();

  const writeTokens = await Promise.all(file.participants.map(async (p) => (await deriveSlot(p.slotSecret, p.passcode)).writeToken));
  const forbidden = [
    ...Object.values(MARKERS),
    "Vienes mañana",
    ...LABELS,
    file.definitionKey,
    file.researcherPrivateKey,
    ...file.participants.flatMap((p) => [p.slotSecret, p.passcode]),
  ];
  const tokens = [file.adminToken, ...writeTokens];

  assert.ok(relay.requests.length > 10);
  for (const r of relay.requests) {
    const { Authorization, ...otherHeaders } = r.headers;
    const visible = [r.url, r.method, JSON.stringify(otherHeaders), r.body].join("\n");
    for (const secret of [...forbidden, ...tokens])
      assert.ok(!visible.includes(secret), `"${secret.slice(0, 24)}" reached the relay in ${r.method} ${r.url}`);
    if (Authorization) {
      for (const secret of forbidden) assert.ok(!Authorization.includes(secret));
      assert.ok(tokens.some((t) => Authorization === `Bearer ${t}`) || Authorization === `Bearer ${relay.creationKey}`);
    }
  }
  const storedText = JSON.stringify(stored);
  for (const secret of [...forbidden, ...tokens])
    assert.ok(!storedText.includes(secret), `"${secret.slice(0, 24)}" is stored on the relay`);
  assert.equal(await relay.store.getSession(file.sessionId), null, "deleted after the session ends");
});
