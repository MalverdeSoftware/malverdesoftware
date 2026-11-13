import type { NewSlot, RelayStore, SessionRow, SlotRow } from "./store.ts";

// For tests and local demos. Same semantics as the SQL store; data lives only in this process.
export function memoryStore(): RelayStore {
  const sessions = new Map<string, SessionRow>();
  const slots = new Map<string, Map<string, SlotRow>>();
  const bucket = (sessionId: string) => {
    let found = slots.get(sessionId);
    if (!found) slots.set(sessionId, (found = new Map()));
    return found;
  };
  const slot = (sessionId: string, slotId: string) => slots.get(sessionId)?.get(slotId);
  const isOpen = (sessionId: string) => sessions.get(sessionId)?.closedAt === null;
  const blank = (sessionId: string, s: NewSlot): SlotRow => ({
    sessionId,
    slotId: s.slotId,
    writeHash: s.writeHash,
    draft: null,
    draftVersion: 0,
    submission: null,
    submissionHash: null,
    updatedAt: null,
    submittedAt: null,
    failedAttempts: 0,
    lockedUntil: null,
  });
  const hasDuplicates = (existing: Map<string, SlotRow> | undefined, incoming: NewSlot[]) =>
    new Set(incoming.map((s) => s.slotId)).size !== incoming.length ||
    incoming.some((s) => existing?.has(s.slotId));

  return {
    async insertSession(session, newSlots) {
      if (sessions.has(session.sessionId) || hasDuplicates(undefined, newSlots)) return "DUPLICATE";
      sessions.set(session.sessionId, { ...session });
      slots.set(session.sessionId, new Map(newSlots.map((s) => [s.slotId, blank(session.sessionId, s)])));
      return "INSERTED";
    },
    async getSession(sessionId) {
      const found = sessions.get(sessionId);
      return found ? { ...found } : null;
    },
    async updateSession(sessionId, patch) {
      const found = sessions.get(sessionId);
      if (!found) return;
      if (patch.closedAt !== undefined) found.closedAt = patch.closedAt;
      if (patch.expiresAt !== undefined) found.expiresAt = patch.expiresAt;
    },
    async deleteSession(sessionId) {
      sessions.delete(sessionId);
      slots.delete(sessionId);
    },
    async insertSlots(sessionId, newSlots) {
      if (hasDuplicates(slots.get(sessionId), newSlots)) return "DUPLICATE";
      const target = bucket(sessionId);
      for (const s of newSlots) target.set(s.slotId, blank(sessionId, s));
      return "INSERTED";
    },
    async deleteSlot(sessionId, slotId) {
      slots.get(sessionId)?.delete(slotId);
    },
    async getSlot(sessionId, slotId) {
      const found = slot(sessionId, slotId);
      return found ? { ...found } : null;
    },
    async listSlots(sessionId, { after = "", limit, filter }) {
      return [...(slots.get(sessionId)?.values() ?? [])]
        .filter(
          (r) =>
            r.slotId > after &&
            (filter === "DRAFT" ? r.draft !== null : filter === "SUBMISSION" ? r.submission !== null : true),
        )
        .sort((a, b) => (a.slotId < b.slotId ? -1 : 1))
        .slice(0, limit)
        .map((r) => ({ ...r }));
    },
    async countSlots(sessionId) {
      let total = 0;
      let inProgress = 0;
      let submitted = 0;
      for (const r of slots.get(sessionId)?.values() ?? []) {
        total++;
        if (r.submission !== null) submitted++;
        else if (r.draftVersion > 0) inProgress++;
      }
      return { total, inProgress, submitted };
    },
    async writeDraft(sessionId, slotId, envelope, baseVersion, now) {
      const r = slot(sessionId, slotId);
      if (!r || !isOpen(sessionId) || r.draftVersion !== baseVersion || r.submission !== null) return false;
      r.draft = envelope;
      r.draftVersion += 1;
      r.updatedAt = now;
      return true;
    },
    async writeSubmission(sessionId, slotId, envelope, envelopeHash, now) {
      const r = slot(sessionId, slotId);
      if (!r || !isOpen(sessionId) || r.submission !== null) return false;
      r.submission = envelope;
      r.submissionHash = envelopeHash;
      r.submittedAt = now;
      r.updatedAt = now;
      r.draft = null;
      return true;
    },
    async recordSlotAuthFailure(sessionId, slotId, lockAfter, lockUntil) {
      const r = slot(sessionId, slotId);
      if (!r) return;
      if (r.failedAttempts + 1 >= lockAfter) {
        r.failedAttempts = 0;
        r.lockedUntil = lockUntil;
      } else r.failedAttempts += 1;
    },
    async resetSlotAuthFailures(sessionId, slotId) {
      const r = slot(sessionId, slotId);
      if (!r) return;
      r.failedAttempts = 0;
      r.lockedUntil = null;
    },
    async purgeExpired(now) {
      let deleted = 0;
      for (const [sessionId, s] of sessions) {
        if (s.expiresAt > now) continue;
        sessions.delete(sessionId);
        slots.delete(sessionId);
        deleted++;
      }
      return deleted;
    },
  };
}
