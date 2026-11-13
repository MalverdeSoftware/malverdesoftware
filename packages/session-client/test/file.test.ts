import { test } from "node:test";
import assert from "node:assert/strict";
import { importContentKey, importRecipientPrivateKey, importRecipientPublicKey, open } from "@malverdesoftware/sealed-envelope";
import { SessionError, parseParticipantLink, parseSessionFile, prepareSession, readDefinition, renderSessionFile } from "../src/index.ts";
import type { PrepareInput } from "../src/index.ts";

const input = (overrides: Partial<PrepareInput> = {}): PrepareInput => ({
  app: "mpile",
  title: "Youth CAB text message sort (synthetic)",
  relayUrl: "https://mpile.app/relay",
  participantUrl: "https://mpile.app/p",
  definition: { title: "Synthetic sort", cards: [{ id: "c1", text: "¿Vienes mañana? 🌵" }] },
  participantLabels: ["Y01", "Y02", "Y03"],
  ...overrides,
});
const rejectsWith = (code: string) => (error: unknown) => error instanceof SessionError && error.code === code;

test("prepareSession generates every secret locally and seals the definition with the researcher's public key", async () => {
  const file = await prepareSession(input());
  assert.equal(file.format, "malverdesoftware-session/v1");
  assert.equal(file.expiresInDays, 14);
  assert.match(file.sessionId, /^[A-Za-z0-9_-]{22}$/);
  assert.equal(new Set(file.participants.map((p) => p.slotId)).size, 3);
  for (const p of file.participants) {
    assert.match(p.passcode, /^[0-9]{6}$/);
    assert.deepEqual(parseParticipantLink(p.link), { sessionId: file.sessionId, definitionKey: file.definitionKey, slotSecret: p.slotSecret });
    assert.ok(p.link.length <= 160, `link is ${p.link.length} characters`);
  }
  const payload = (await open(await importContentKey(file.definitionKey), file.definitionEnvelope, {
    app: file.app,
    sessionId: file.sessionId,
    channel: "definition",
  })) as Record<string, unknown>;
  assert.deepEqual(payload, { v: 1, researcherPublicKey: file.researcherPublicKey, appDefinition: input().definition });
  await importRecipientPublicKey(file.researcherPublicKey);
  await importRecipientPrivateKey(file.researcherPrivateKey);
});

test("the session file renders to Markdown and parses back losslessly", async () => {
  const file = await prepareSession(input());
  file.participants[1]!.revokedAt = new Date().toISOString();
  const markdown = renderSessionFile(file);
  assert.deepEqual(parseSessionFile(markdown), file);
  assert.match(markdown, /Keep this file private/);
  assert.match(markdown, /cannot be recovered by anyone/);
  assert.ok(markdown.includes(`| Y01 | ${file.participants[0]!.link} | ${file.participants[0]!.passcode} |`));
  assert.ok(!markdown.includes(`| Y02 |`), "revoked participants are left out of the link table");
  assert.ok(markdown.includes(`| Y03 | ${file.participants[2]!.link} | ${file.participants[2]!.passcode} |`));
});

test("readDefinition opens the app definition from a reopened file, without the relay", async () => {
  const file = parseSessionFile(renderSessionFile(await prepareSession(input())));
  assert.deepEqual(await readDefinition(file), input().definition);
});

test("readDefinition refuses a file whose definition does not belong to it", async () => {
  const file = await prepareSession(input());
  const other = await prepareSession(input());
  const cases: [string, Partial<typeof file>][] = [
    ["another session's definition", { definitionEnvelope: other.definitionEnvelope }],
    ["another session's key", { definitionKey: other.definitionKey }],
    ["another researcher key", { researcherPublicKey: other.researcherPublicKey }],
    ["another app", { app: "mvote" }],
  ];
  for (const [name, overrides] of cases)
    await assert.rejects(readDefinition({ ...file, ...overrides }), rejectsWith("BAD_SESSION_FILE"), name);
});

test("only the data section counts: edits to the readable part are ignored", async () => {
  const file = await prepareSession(input());
  const edited = renderSessionFile(file).replace("# MalverdeSoftware session key:", "# My notes about").replace("| Y01 |", "| Someone |");
  assert.deepEqual(parseSessionFile(edited), file);
});

test("damaged or altered session files are rejected", async () => {
  const file = await prepareSession(input());
  const markdown = renderSessionFile(file);
  const variants = [
    "just some notes",
    markdown.replace("<!-- malverdesoftware-session-data: do not edit below this line -->", ""),
    markdown.replace('"format": "malverdesoftware-session/v1"', '"format": "something-else/v1"'),
    markdown.replace(`"slotSecret": "${file.participants[0]!.slotSecret}"`, `"slotSecret": "${file.participants[1]!.slotSecret}"`),
    markdown.replace(`"label": "Y02"`, `"label": "Y01"`),
    markdown.replace(`"adminToken": "${file.adminToken}"`, `"adminToken": "short"`),
    markdown.replace(/\n```\n$/, "\n"),
    markdown.replace(`"passcode": "${file.participants[0]!.passcode}"`, `"passcode": "12345"`),
  ];
  for (const variant of variants) assert.throws(() => parseSessionFile(variant), rejectsWith("BAD_SESSION_FILE"));
});

test("prepareSession validates its input", async () => {
  const cases: [string, Partial<PrepareInput>][] = [
    ["BAD_INPUT", { app: "My Pile" }],
    ["BAD_INPUT", { title: "  " }],
    ["BAD_INPUT", { title: "two\nlines" }],
    ["BAD_INPUT", { relayUrl: "http://mpile.app/relay" }],
    ["BAD_INPUT", { participantUrl: "https://mpile.app/p?x=1" }],
    ["BAD_INPUT", { participantLabels: [] }],
    ["BAD_INPUT", { participantLabels: ["Y01", "Y01"] }],
    ["BAD_INPUT", { participantLabels: ["Y01 | Y02"] }],
    ["LIMIT_EXCEEDED", { participantLabels: Array.from({ length: 201 }, (_, i) => `Y${i}`) }],
    ["BAD_INPUT", { expiresInDays: 31 }],
    ["BAD_INPUT", { definition: { n: 1n } }],
    ["TOO_LARGE", { definition: "x".repeat(200_000) }],
  ];
  for (const [code, overrides] of cases) await assert.rejects(prepareSession(input(overrides)), rejectsWith(code), JSON.stringify(Object.keys(overrides)));
  await prepareSession(input({ relayUrl: "http://127.0.0.1:8787/relay", participantUrl: "http://localhost:5173/p", expiresInDays: 30 }));
});

test("participant links must be complete", () => {
  const good = `https://mpile.app/p#v1.${"A".repeat(22)}.${"B".repeat(43)}.${"C".repeat(43)}`;
  assert.deepEqual(parseParticipantLink(`  ${good}\n`), { sessionId: "A".repeat(22), definitionKey: "B".repeat(43), slotSecret: "C".repeat(43) });
  for (const bad of [good.split("#")[0]!, good.slice(0, -5), `${good}.`, good.replace("#v1.", "#v2."), good.replace("#", "?")])
    assert.throws(() => parseParticipantLink(bad), rejectsWith("BAD_LINK"));
});
