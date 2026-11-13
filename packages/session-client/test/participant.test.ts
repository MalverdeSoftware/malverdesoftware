import { test } from "node:test";
import assert from "node:assert/strict";
import { deriveSlot, hashToken } from "@malverdesoftware/sealed-envelope";
import {
  SessionError,
  joinSession,
  memoryStorage,
  openResearcherSession,
  parseParticipantLink,
  prepareSession,
  publishSession,
} from "../src/index.ts";
import type { KeyValueStorage, SessionFile } from "../src/index.ts";
import { FAST, RELAY_URL, inProcessRelay, sessionInput } from "./support.ts";

const rejectsWith = (code: string) => (error: unknown) => error instanceof SessionError && error.code === code;
const DEFINITION = { title: "Synthetic sort", cards: [{ id: "c1", text: "¿Vienes mañana? 🌵" }, { id: "c2", text: "Te espero" }] };

async function setup(labels = ["Y01", "Y02"], now?: () => Date) {
  const relay = await inProcessRelay(now);
  const file = await prepareSession(sessionInput(labels, DEFINITION));
  await publishSession(file, { creationKey: relay.creationKey, fetch: relay.fetch, ...FAST });
  const join = (label: string, options: { passcode?: string | null; storage?: KeyValueStorage; rememberOnDevice?: boolean; fetch?: typeof fetch } = {}) => {
    const p = file.participants.find((x) => x.label === label)!;
    return joinSession(parseParticipantLink(p.link), {
      app: file.app,
      relayUrl: RELAY_URL,
      ...FAST,
      fetch: options.fetch ?? relay.fetch,
      storage: options.storage ?? memoryStorage(),
      ...(options.passcode === null ? {} : { passcode: options.passcode ?? p.passcode }),
      ...(options.rememberOnDevice === undefined ? {} : { rememberOnDevice: options.rememberOnDevice }),
    });
  };
  const researcher = openResearcherSession(file, { fetch: relay.fetch, ...FAST });
  return { relay, file, join, researcher };
}

const wrongPasscode = (file: SessionFile, label: string) =>
  String((Number(file.participants.find((p) => p.label === label)!.passcode) + 1) % 1_000_000).padStart(6, "0");

test("joining with link and passcode opens the activity", async () => {
  const { join } = await setup();
  const session = await join("Y01");
  assert.deepEqual(session.definition, DEFINITION);
  assert.equal(session.status, "NOT_STARTED");
  assert.equal(session.draft, null);
  assert.equal(session.submitted, null);
  assert.equal(session.isClosed, false);
});

test("passcodes: wrong, malformed, missing, remembered and forgotten", async () => {
  const { join, file } = await setup();
  await assert.rejects(join("Y01", { passcode: wrongPasscode(file, "Y01") }), rejectsWith("WRONG_PASSCODE"));
  await assert.rejects(join("Y01", { passcode: "12345" }), rejectsWith("WRONG_PASSCODE"));
  await assert.rejects(join("Y01", { passcode: null }), rejectsWith("PASSCODE_REQUIRED"));
  const phone = memoryStorage();
  await join("Y01", { storage: phone });
  assert.equal((await join("Y01", { storage: phone, passcode: null })).status, "NOT_STARTED", "remembered on this device");
  const shared = memoryStorage();
  await join("Y01", { storage: shared, rememberOnDevice: false });
  await assert.rejects(join("Y01", { storage: shared, passcode: null }), rejectsWith("PASSCODE_REQUIRED"));
  const y02 = file.participants.find((p) => p.label === "Y02")!;
  const stale = memoryStorage();
  const key = `malverdesoftware:${file.app}:${file.sessionId}:${await hashToken(y02.slotSecret)}:passcode`;
  stale.setItem(key, wrongPasscode(file, "Y02"));
  await assert.rejects(join("Y02", { storage: stale, passcode: null }), rejectsWith("WRONG_PASSCODE"));
  assert.equal(stale.getItem(key), null, "a wrong remembered passcode is forgotten");
});

test("five wrong passcodes lock the link for an hour", async () => {
  const { join, file } = await setup();
  for (let i = 0; i < 5; i++) await assert.rejects(join("Y01", { passcode: wrongPasscode(file, "Y01") }), rejectsWith("WRONG_PASSCODE"));
  await assert.rejects(join("Y01"), (error: unknown) => {
    assert.ok(error instanceof SessionError);
    assert.equal(error.code, "TOO_MANY_ATTEMPTS");
    assert.equal(error.details?.retryAfter, 3600);
    return true;
  });
  assert.equal((await join("Y02")).status, "NOT_STARTED", "other participants are unaffected");
});

test("drafts save to the relay and the researcher can read them", async () => {
  const { join, researcher } = await setup();
  const session = await join("Y01");
  assert.deepEqual(await session.saveDraft({ piles: ["Ánimo"] }), { state: "SAVED" });
  assert.deepEqual(await session.saveDraft({ piles: ["Ánimo", "Familia"] }), { state: "SAVED" });
  assert.equal(session.status, "IN_PROGRESS");
  const drafts = await researcher.collect({ includeDrafts: true });
  assert.deepEqual(drafts.map((r) => [r.label, r.kind, "body" in r ? r.body : null]), [["Y01", "DRAFT", { piles: ["Ánimo", "Familia"] }]]);
});

test("autosaves fired together are applied in order without conflicts", async () => {
  const { join, researcher } = await setup();
  const session = await join("Y01");
  const results = await Promise.all([1, 2, 3, 4, 5].map((n) => session.saveDraft({ step: n })));
  assert.ok(results.every((r) => r.state === "SAVED"));
  const [draft] = await researcher.collect({ includeDrafts: true });
  assert.deepEqual((draft as { body: unknown }).body, { step: 5 });
});

test("offline saves stay on the device, survive a reload and sync later", async () => {
  const { join, relay, researcher } = await setup();
  const phone = memoryStorage();
  const session = await join("Y01", { storage: phone });
  relay.setOffline(true);
  assert.deepEqual(await session.saveDraft({ piles: ["airplane mode"] }), { state: "SAVED_ON_DEVICE", reason: "OFFLINE" });
  relay.setOffline(false);
  const reloaded = await join("Y01", { storage: phone, passcode: null });
  assert.deepEqual(reloaded.draft, { piles: ["airplane mode"] });
  assert.equal(reloaded.status, "IN_PROGRESS");
  assert.deepEqual(await reloaded.retryPending(), { state: "SAVED" });
  const [draft] = await researcher.collect({ includeDrafts: true });
  assert.deepEqual((draft as { body: unknown }).body, { piles: ["airplane mode"] });
});

test("phone to laptop: the same link and passcode continue the draft, then submit", async () => {
  const { join, researcher } = await setup();
  const phone = await join("Y01", { storage: memoryStorage() });
  await phone.saveDraft({ piles: ["started on phone"] });
  const laptop = await join("Y01", { storage: memoryStorage() });
  assert.deepEqual(laptop.draft, { piles: ["started on phone"] });
  assert.deepEqual(await laptop.saveDraft({ piles: ["started on phone", "finished on laptop"] }), { state: "SAVED" });
  await laptop.submit({ piles: ["started on phone", "finished on laptop"] });
  assert.equal(laptop.status, "SUBMITTED");
  assert.deepEqual(laptop.submitted, { piles: ["started on phone", "finished on laptop"] });
  await assert.rejects(phone.saveDraft({ piles: ["stale phone"] }), rejectsWith("ALREADY_SUBMITTED"));
  const phoneAgain = await join("Y01", { storage: memoryStorage() });
  assert.equal(phoneAgain.status, "SUBMITTED");
  assert.equal(phoneAgain.submitted, null, "a submitted sort is only shown on the device that sent it");
  const results = await researcher.collect({ includeDrafts: true });
  assert.deepEqual(results.map((r) => [r.label, r.kind]), [["Y01", "SUBMITTED"]]);
});

test("a submission stays on the device until confirmed, and is sent exactly once", async () => {
  const { join, relay, researcher } = await setup();
  const phone = memoryStorage();
  const session = await join("Y01", { storage: phone });
  relay.setOffline(true);
  await assert.rejects(session.submit({ piles: ["final"] }), rejectsWith("NETWORK"));
  assert.equal(session.status, "SUBMITTING");
  await assert.rejects(session.saveDraft({ piles: ["changed mind"] }), rejectsWith("ALREADY_SUBMITTED"));
  relay.setOffline(false);
  const reloaded = await join("Y01", { storage: phone, passcode: null });
  assert.equal(reloaded.status, "SUBMITTING");
  assert.deepEqual(await reloaded.retryPending(), { state: "SAVED" });
  assert.equal(reloaded.status, "SUBMITTED");
  assert.deepEqual(reloaded.submitted, { piles: ["final"] });
  await assert.rejects(join("Y01", { storage: phone, passcode: null }), rejectsWith("PASSCODE_REQUIRED"), "forgotten after submitting");
  assert.equal((await researcher.collect()).length, 1);
});

test("lost responses resolve to exactly one stored effect", async () => {
  const { join, relay, researcher } = await setup();
  const lose = new Set(["PUT draft", "PUT submission"]);
  const lossy = (async (input: string | URL, init: RequestInit = {}) => {
    const response = await relay.fetch(input, init);
    const kind = `${init.method} ${String(input).split("/").pop()}`;
    if (lose.has(kind)) {
      lose.delete(kind);
      throw new TypeError("connection reset after the server answered");
    }
    return response;
  }) as typeof fetch;
  const session = await join("Y01", { fetch: lossy });
  assert.deepEqual(await session.saveDraft({ piles: ["once"] }), { state: "SAVED" });
  assert.deepEqual(await session.saveDraft({ piles: ["twice"] }), { state: "SAVED" });
  await session.submit({ piles: ["final"] });
  assert.equal(session.status, "SUBMITTED");
  const results = await researcher.collect({ includeDrafts: true });
  assert.deepEqual(results.map((r) => [r.label, r.kind, "body" in r ? r.body : null]), [["Y01", "SUBMITTED", { piles: ["final"] }]]);
  assert.equal(lose.size, 0, "both responses were lost once");
});

test("a closed or expired session stops participants", async () => {
  let now = new Date();
  const { join, researcher } = await setup(["Y01", "Y02"], () => now);
  const before = await join("Y01");
  await researcher.close();
  await assert.rejects(before.saveDraft({ piles: [] }), rejectsWith("SESSION_CLOSED"));
  assert.equal(before.isClosed, true);
  await assert.rejects(before.submit({ piles: [] }), rejectsWith("SESSION_CLOSED"));
  assert.equal((await join("Y02")).isClosed, true);
  now = new Date(now.getTime() + 15 * 86_400_000);
  await assert.rejects(join("Y02"), rejectsWith("SESSION_EXPIRED"));
});

test("one participant cannot reach another's draft", async () => {
  const { join, relay, file } = await setup();
  const y02 = await join("Y02");
  await y02.saveDraft({ piles: ["private to Y02"] });
  const y01 = file.participants.find((p) => p.label === "Y01")!;
  const y02Entry = file.participants.find((p) => p.label === "Y02")!;
  const mine = await deriveSlot(y01.slotSecret, y01.passcode);
  const response = await relay.fetch(`${RELAY_URL}/v1/sessions/${file.sessionId}/slots/${y02Entry.slotId}`, {
    headers: { Authorization: `Bearer ${mine.writeToken}` },
  });
  assert.equal(response.status, 403);
});
