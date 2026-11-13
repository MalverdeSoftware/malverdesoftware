// The storage adapter interface. Apps never call it; the relay handler does.
// Every state-changing method is one atomic operation, so concurrency and
// idempotency rest on primary keys and conditional writes, not read-then-write.

export type SessionRow = {
  sessionId: string;
  app: string;
  adminHash: string;
  requestHash: string;
  definition: string;
  createdAt: string;
  expiresAt: string;
  closedAt: string | null;
};

export type SlotRow = {
  sessionId: string;
  slotId: string;
  writeHash: string;
  draft: string | null;
  draftVersion: number;
  submission: string | null;
  submissionHash: string | null;
  updatedAt: string | null;
  submittedAt: string | null;
  failedAttempts: number;
  lockedUntil: string | null;
};

export type NewSlot = { slotId: string; writeHash: string };
export type SlotFilter = "DRAFT" | "SUBMISSION";
export type SlotCounts = { total: number; inProgress: number; submitted: number };

export interface RelayStore {
  insertSession(session: SessionRow, slots: NewSlot[]): Promise<"INSERTED" | "DUPLICATE">;
  getSession(sessionId: string): Promise<SessionRow | null>;
  updateSession(sessionId: string, patch: { closedAt?: string; expiresAt?: string }): Promise<void>;
  deleteSession(sessionId: string): Promise<void>;
  insertSlots(sessionId: string, slots: NewSlot[]): Promise<"INSERTED" | "DUPLICATE">;
  deleteSlot(sessionId: string, slotId: string): Promise<void>;
  getSlot(sessionId: string, slotId: string): Promise<SlotRow | null>;
  listSlots(
    sessionId: string,
    page: { after?: string; limit: number; filter?: SlotFilter },
  ): Promise<SlotRow[]>;
  countSlots(sessionId: string): Promise<SlotCounts>;
  // Succeeds only if baseVersion matches, nothing is submitted and the session is open.
  writeDraft(
    sessionId: string,
    slotId: string,
    envelope: string,
    baseVersion: number,
    now: string,
  ): Promise<boolean>;
  // Succeeds only once per slot, while the session is open; clears the draft.
  writeSubmission(
    sessionId: string,
    slotId: string,
    envelope: string,
    envelopeHash: string,
    now: string,
  ): Promise<boolean>;
  // The lockAfter-th consecutive failure sets lockedUntil and restarts the count.
  recordSlotAuthFailure(
    sessionId: string,
    slotId: string,
    lockAfter: number,
    lockUntil: string,
  ): Promise<void>;
  resetSlotAuthFailures(sessionId: string, slotId: string): Promise<void>;
  // Deletes every session whose expiresAt is at or before now, with its slots.
  purgeExpired(now: string): Promise<number>;
}
