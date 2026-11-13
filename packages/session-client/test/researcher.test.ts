import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SessionError,
  openResearcherSession,
  parseSessionFile,
  prepareSession,
  publishSession,
  renderSessionFile,
} from "../src/index.ts";
import { FAST, actAs, inProcessRelay, sessionInput } from "./support.ts";

const rejectsWith = (code: string) => (error: unknown) => error instanceof SessionError && error.code === code;

async function published(labels = ["Y01", "Y02", "Y03"]) {
  const relay = await inProcessRelay();
  const file = await prepareSession(sessionInput(labels));
  const options = { fetch: relay.fetch, ...FAST };
  const status = await publishSession(file, { creationKey: relay.creationKey, ...options });
  return { relay, file, options, status, researcher: openResearcherSession(file, options) };
}

test("publishing creates the session; every participant starts NOT_STARTED, listed by label", async () => {
  const { status } = await published(["Y10", "Y02", "Y01"]);
  assert.equal(status.isClosed, false);
  assert.deepEqual(status.participants.map((p) => [p.label, p.status]), [["Y01", "NOT_STARTED"], ["Y02", "NOT_STARTED"], ["Y10", "NOT_STARTED"]]);
});

test("publishing again, even from the reopened saved file, replays instead of failing", async () => {
  const { relay, file, options } = await published();
  const reopened = parseSessionFile(renderSessionFile(file));
  const again = await publishSession(reopened, { creationKey: relay.creationKey, ...options });
  assert.equal(again.participants.length, 3);
  const creates = relay.requests.filter((r) => r.method === "POST" && r.url.endsWith("/v1/sessions"));
  assert.equal(creates.length, 2);
  assert.equal(creates[0]!.body, creates[1]!.body, "byte-identical request bodies");
});

test("a wrong creation key is refused", async () => {
  const relay = await inProcessRelay();
  const file = await prepareSession(sessionInput(["Y01"]));
  await assert.rejects(publishSession(file, { creationKey: "not-the-key", fetch: relay.fetch, ...FAST }), rejectsWith("FORBIDDEN"));
});

test("status and collect follow participants' progress and open every response", async () => {
  const { relay, file, researcher } = await published();
  const y01 = await actAs(file, "Y01", relay.fetch);
  const y02 = await actAs(file, "Y02", relay.fetch);
  await y01.saveDraft({ piles: ["half done"] }, 0);
  await y02.saveDraft({ piles: ["first try"] }, 0);
  await y02.submit({ piles: ["Ánimo 💪", "Familia"] });
  const status = await researcher.status();
  assert.deepEqual(status.participants.map((p) => [p.label, p.status]), [["Y01", "IN_PROGRESS"], ["Y02", "SUBMITTED"], ["Y03", "NOT_STARTED"]]);
  const submitted = await researcher.collect();
  assert.deepEqual(submitted.map((r) => [r.label, r.kind, "body" in r ? r.body : null]), [["Y02", "SUBMITTED", { piles: ["Ánimo 💪", "Familia"] }]]);
  const everything = await researcher.collect({ includeDrafts: true });
  assert.deepEqual(everything.map((r) => [r.label, r.kind]), [["Y01", "DRAFT"], ["Y02", "SUBMITTED"]]);
  assert.deepEqual((everything[0] as { body: unknown }).body, { piles: ["half done"] });
});

test("a response sealed for a different participant is reported UNREADABLE, not mixed in", async () => {
  const { relay, file, researcher } = await published();
  const y01 = await actAs(file, "Y01", relay.fetch);
  const y02 = await actAs(file, "Y02", relay.fetch);
  await y01.submit({ piles: ["mine"] }, y02.slotId);
  await y02.submit({ piles: ["theirs"] });
  const results = await researcher.collect();
  assert.deepEqual(results.map((r) => [r.label, r.kind]), [["Y01", "UNREADABLE"], ["Y02", "SUBMITTED"]]);
  assert.equal((results[0] as { problem: string }).problem, "DECRYPT_FAILED");
});

test("collect walks every page", async () => {
  const labels = Array.from({ length: 53 }, (_, i) => `Y${String(i + 1).padStart(2, "0")}`);
  const { relay, file, researcher } = await published(labels);
  for (const label of labels) await (await actAs(file, label, relay.fetch)).submit({ label });
  const results = await researcher.collect();
  assert.equal(results.length, 53);
  assert.deepEqual(results.map((r) => (r as { body: { label: string } }).body.label), labels);
  assert.equal((await researcher.status()).participants.length, 53);
});

test("adding participants returns an updated file whose new links work", async () => {
  const { relay, file, options, researcher } = await published(["Y01"]);
  await assert.rejects(researcher.addParticipants(["Y01"]), rejectsWith("BAD_INPUT"));
  const updated = await researcher.addParticipants(["Y02", "Y03"]);
  assert.deepEqual(updated.participants.map((p) => p.label), ["Y01", "Y02", "Y03"]);
  assert.equal(researcher.file, updated);
  assert.deepEqual(parseSessionFile(renderSessionFile(updated)), updated);
  const y03 = await actAs(updated, "Y03", relay.fetch);
  assert.equal((await y03.saveDraft({ piles: [] }, 0)).status, 200);
  await y03.submit({ piles: ["late joiner"] });
  const stale = openResearcherSession(file, options);
  const fromStale = await stale.collect({ includeDrafts: true });
  assert.deepEqual(fromStale.map((r) => [r.label, r.kind]), [[null, "SUBMITTED"]], "an older file still opens newer submissions");
  assert.deepEqual((fromStale[0] as { body: unknown }).body, { piles: ["late joiner"] });
  await (await actAs(updated, "Y02", relay.fetch)).saveDraft({ piles: ["draft"] }, 0);
  const staleDrafts = await stale.collect({ includeDrafts: true });
  assert.ok(staleDrafts.some((r) => r.kind === "UNREADABLE" && r.problem === "NO_KEY" && r.label === null));
});

test("revoking removes a participant's slot and data, and can be repeated", async () => {
  const { relay, file, researcher } = await published();
  const y02 = await actAs(file, "Y02", relay.fetch);
  await y02.submit({ piles: ["wrong number"] });
  const updated = await researcher.revokeParticipant("Y02");
  assert.ok(updated.participants.find((p) => p.label === "Y02")!.revokedAt);
  await researcher.revokeParticipant("Y02");
  await assert.rejects(researcher.revokeParticipant("Y99"), rejectsWith("BAD_INPUT"));
  assert.deepEqual((await researcher.status()).participants.map((p) => p.label), ["Y01", "Y03"]);
  assert.deepEqual(await researcher.collect(), []);
  assert.equal((await y02.saveDraft({}, 0)).status, 404);
});

test("close, extend and destroy", async () => {
  const { researcher, file } = await published();
  const closed = await researcher.close();
  assert.equal(closed.isClosed, true);
  const until = new Date(Date.parse(file.createdAt) + 20 * 86_400_000);
  until.setMilliseconds(0);
  assert.equal((await researcher.setExpiry(until)).expiresAt, until.toISOString());
  await researcher.destroy();
  await researcher.destroy();
  await assert.rejects(researcher.status(), rejectsWith("NOT_FOUND"));
});
