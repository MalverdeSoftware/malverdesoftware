import { test } from "node:test";
import assert from "node:assert/strict";
import type { RelayStore } from "../src/store.ts";
import { id, sessionRow } from "./helpers.ts";

const NOW = "2026-11-06T12:00:00.000Z";
const LATER = "2026-11-06T13:00:00.000Z";
const slotsFor = (n: number) => Array.from({ length: n }, () => ({ slotId: id(), writeHash: "w".repeat(43) }));

// Every RelayStore implementation must pass this suite.
export function storeContract(label: string, makeStore: () => RelayStore) {
  test(`${label}: sessions insert once, atomically with their slots`, async () => {
    const store = makeStore();
    const session = sessionRow();
    const slots = slotsFor(3);
    assert.equal(await store.insertSession(session, slots), "INSERTED");
    assert.equal(await store.insertSession({ ...session, app: "other" }, slotsFor(2)), "DUPLICATE");
    assert.deepEqual(await store.getSession(session.sessionId), session);
    assert.equal((await store.countSlots(session.sessionId)).total, 3);
    const slot = await store.getSlot(session.sessionId, slots[0]!.slotId);
    assert.deepEqual(slot, {
      sessionId: session.sessionId,
      slotId: slots[0]!.slotId,
      writeHash: "w".repeat(43),
      draft: null,
      draftVersion: 0,
      submission: null,
      submissionHash: null,
      updatedAt: null,
      submittedAt: null,
      failedAttempts: 0,
      lockedUntil: null,
    });
    assert.equal(await store.getSession(id()), null);
    assert.equal(await store.getSlot(session.sessionId, id()), null);
  });

  test(`${label}: a session whose slot list repeats an ID is not inserted at all`, async () => {
    const store = makeStore();
    const session = sessionRow();
    const repeated = slotsFor(1);
    assert.equal(await store.insertSession(session, [...repeated, ...repeated]), "DUPLICATE");
    assert.equal(await store.getSession(session.sessionId), null);
  });

  test(`${label}: updateSession patches only the given fields`, async () => {
    const store = makeStore();
    const session = sessionRow();
    await store.insertSession(session, slotsFor(1));
    await store.updateSession(session.sessionId, { closedAt: NOW });
    await store.updateSession(session.sessionId, { expiresAt: LATER });
    assert.deepEqual(await store.getSession(session.sessionId), { ...session, closedAt: NOW, expiresAt: LATER });
  });

  test(`${label}: insertSlots is all-or-nothing`, async () => {
    const store = makeStore();
    const session = sessionRow();
    const first = slotsFor(2);
    await store.insertSession(session, first);
    const fresh = slotsFor(1);
    assert.equal(await store.insertSlots(session.sessionId, [...fresh, first[0]!]), "DUPLICATE");
    assert.equal(await store.getSlot(session.sessionId, fresh[0]!.slotId), null);
    assert.equal(await store.insertSlots(session.sessionId, fresh), "INSERTED");
    assert.equal((await store.countSlots(session.sessionId)).total, 3);
  });

  test(`${label}: listSlots pages in slot-ID order and filters`, async () => {
    const store = makeStore();
    const session = sessionRow();
    const slots = slotsFor(7);
    await store.insertSession(session, slots);
    const sorted = slots.map((s) => s.slotId).sort();
    const page1 = await store.listSlots(session.sessionId, { limit: 3 });
    const page2 = await store.listSlots(session.sessionId, { after: page1.at(-1)!.slotId, limit: 3 });
    const page3 = await store.listSlots(session.sessionId, { after: page2.at(-1)!.slotId, limit: 3 });
    assert.deepEqual([...page1, ...page2, ...page3].map((r) => r.slotId), sorted);
    await store.writeDraft(session.sessionId, sorted[1]!, "d", 0, NOW);
    await store.writeDraft(session.sessionId, sorted[4]!, "d", 0, NOW);
    await store.writeSubmission(session.sessionId, sorted[4]!, "s", "h", NOW);
    await store.writeDraft(session.sessionId, sorted[5]!, "d", 0, NOW);
    const drafts = await store.listSlots(session.sessionId, { limit: 10, filter: "DRAFT" });
    const submissions = await store.listSlots(session.sessionId, { limit: 10, filter: "SUBMISSION" });
    assert.deepEqual(drafts.map((r) => r.slotId), [sorted[1], sorted[5]]);
    assert.deepEqual(submissions.map((r) => r.slotId), [sorted[4]]);
    assert.deepEqual(await store.countSlots(session.sessionId), { total: 7, inProgress: 2, submitted: 1 });
  });

  test(`${label}: drafts need the current version, no submission and an open session`, async () => {
    const store = makeStore();
    const session = sessionRow();
    const [slot] = slotsFor(1);
    await store.insertSession(session, [slot!]);
    const s = slot!.slotId;
    assert.equal(await store.writeDraft(session.sessionId, s, "d1", 0, NOW), true);
    assert.equal(await store.writeDraft(session.sessionId, s, "stale", 0, NOW), false);
    assert.equal(await store.writeDraft(session.sessionId, s, "d2", 1, LATER), true);
    const row = await store.getSlot(session.sessionId, s);
    assert.equal(row!.draft, "d2");
    assert.equal(row!.draftVersion, 2);
    assert.equal(row!.updatedAt, LATER);
    assert.equal(await store.writeDraft(session.sessionId, id(), "x", 0, NOW), false);
    await store.updateSession(session.sessionId, { closedAt: NOW });
    assert.equal(await store.writeDraft(session.sessionId, s, "d3", 2, NOW), false);
  });

  test(`${label}: a submission is written once, clears the draft and needs an open session`, async () => {
    const store = makeStore();
    const session = sessionRow();
    const [a, b] = slotsFor(2);
    await store.insertSession(session, [a!, b!]);
    await store.writeDraft(session.sessionId, a!.slotId, "draft", 0, NOW);
    assert.equal(await store.writeSubmission(session.sessionId, a!.slotId, "sub", "hash", LATER), true);
    assert.equal(await store.writeSubmission(session.sessionId, a!.slotId, "other", "hash2", LATER), false);
    assert.equal(await store.writeDraft(session.sessionId, a!.slotId, "late", 1, LATER), false);
    const row = await store.getSlot(session.sessionId, a!.slotId);
    assert.equal(row!.draft, null);
    assert.equal(row!.submission, "sub");
    assert.equal(row!.submissionHash, "hash");
    assert.equal(row!.submittedAt, LATER);
    await store.updateSession(session.sessionId, { closedAt: LATER });
    assert.equal(await store.writeSubmission(session.sessionId, b!.slotId, "sub", "hash", LATER), false);
  });

  test(`${label}: repeated auth failures lock a slot and restart the count`, async () => {
    const store = makeStore();
    const session = sessionRow();
    const [slot] = slotsFor(1);
    await store.insertSession(session, [slot!]);
    const s = slot!.slotId;
    for (let i = 0; i < 4; i++) await store.recordSlotAuthFailure(session.sessionId, s, 5, LATER);
    let row = await store.getSlot(session.sessionId, s);
    assert.equal(row!.failedAttempts, 4);
    assert.equal(row!.lockedUntil, null);
    await store.recordSlotAuthFailure(session.sessionId, s, 5, LATER);
    row = await store.getSlot(session.sessionId, s);
    assert.equal(row!.failedAttempts, 0);
    assert.equal(row!.lockedUntil, LATER);
    await store.recordSlotAuthFailure(session.sessionId, s, 5, LATER);
    await store.resetSlotAuthFailures(session.sessionId, s);
    row = await store.getSlot(session.sessionId, s);
    assert.equal(row!.failedAttempts, 0);
    assert.equal(row!.lockedUntil, null);
  });

  test(`${label}: deleting a slot or a session removes its data`, async () => {
    const store = makeStore();
    const session = sessionRow();
    const slots = slotsFor(2);
    await store.insertSession(session, slots);
    await store.deleteSlot(session.sessionId, slots[0]!.slotId);
    assert.equal(await store.getSlot(session.sessionId, slots[0]!.slotId), null);
    assert.equal((await store.countSlots(session.sessionId)).total, 1);
    await store.deleteSession(session.sessionId);
    assert.equal(await store.getSession(session.sessionId), null);
    assert.equal(await store.getSlot(session.sessionId, slots[1]!.slotId), null);
    assert.equal((await store.countSlots(session.sessionId)).total, 0);
    await store.deleteSession(session.sessionId);
  });

  test(`${label}: purgeExpired removes only expired sessions and their slots`, async () => {
    const store = makeStore();
    const expired = sessionRow({ expiresAt: NOW });
    const live = sessionRow({ expiresAt: LATER });
    const expiredSlots = slotsFor(2);
    await store.insertSession(expired, expiredSlots);
    await store.insertSession(live, slotsFor(1));
    assert.equal(await store.purgeExpired(NOW), 1);
    assert.equal(await store.getSession(expired.sessionId), null);
    assert.equal(await store.getSlot(expired.sessionId, expiredSlots[0]!.slotId), null);
    assert.ok(await store.getSession(live.sessionId));
    assert.equal(await store.purgeExpired(NOW), 0);
  });
}
