import type { NewSlot, RelayStore, SessionRow, SlotRow } from "./store.ts";

export type SqlValue = string | number | null;
export type SqlStatement = { sql: string; params: SqlValue[] };

// The small surface the SQL store needs; adapters exist for Cloudflare D1 and node:sqlite.
export interface SqlDatabase {
  run(sql: string, params?: SqlValue[]): Promise<{ changes: number }>;
  first<T>(sql: string, params?: SqlValue[]): Promise<T | null>;
  all<T>(sql: string, params?: SqlValue[]): Promise<T[]>;
  batch(statements: SqlStatement[]): Promise<{ changes: number }[]>; // all-or-nothing
}

type SessionRecord = {
  session_id: string;
  app: string;
  admin_hash: string;
  request_hash: string;
  definition: string;
  created_at: string;
  expires_at: string;
  closed_at: string | null;
};
type SlotRecord = {
  session_id: string;
  slot_id: string;
  write_hash: string;
  draft: string | null;
  draft_version: number;
  submission: string | null;
  submission_hash: string | null;
  updated_at: string | null;
  submitted_at: string | null;
  failed_attempts: number;
  locked_until: string | null;
};

const isUniqueViolation = (error: unknown) =>
  /UNIQUE constraint failed|SQLITE_CONSTRAINT/i.test(String((error as Error)?.message ?? error));

const toSession = (r: SessionRecord): SessionRow => ({
  sessionId: r.session_id,
  app: r.app,
  adminHash: r.admin_hash,
  requestHash: r.request_hash,
  definition: r.definition,
  createdAt: r.created_at,
  expiresAt: r.expires_at,
  closedAt: r.closed_at,
});

const toSlot = (r: SlotRecord): SlotRow => ({
  sessionId: r.session_id,
  slotId: r.slot_id,
  writeHash: r.write_hash,
  draft: r.draft,
  draftVersion: Number(r.draft_version),
  submission: r.submission,
  submissionHash: r.submission_hash,
  updatedAt: r.updated_at,
  submittedAt: r.submitted_at,
  failedAttempts: Number(r.failed_attempts),
  lockedUntil: r.locked_until,
});

const insertSlot = (sessionId: string, s: NewSlot): SqlStatement => ({
  sql: "INSERT INTO relay_slots (session_id, slot_id, write_hash) VALUES (?, ?, ?)",
  params: [sessionId, s.slotId, s.writeHash],
});

const SESSION_OPEN =
  "EXISTS (SELECT 1 FROM relay_sessions WHERE session_id = ? AND closed_at IS NULL)";

async function insertAll(db: SqlDatabase, statements: SqlStatement[]) {
  try {
    await db.batch(statements);
    return "INSERTED" as const;
  } catch (error) {
    if (isUniqueViolation(error)) return "DUPLICATE" as const;
    throw error;
  }
}

export function sqlStore(db: SqlDatabase): RelayStore {
  return {
    insertSession(session, slots) {
      return insertAll(db, [
        {
          sql: "INSERT INTO relay_sessions (session_id, app, admin_hash, request_hash, definition, created_at, expires_at, closed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
          params: [
            session.sessionId,
            session.app,
            session.adminHash,
            session.requestHash,
            session.definition,
            session.createdAt,
            session.expiresAt,
            session.closedAt,
          ],
        },
        ...slots.map((s) => insertSlot(session.sessionId, s)),
      ]);
    },
    async getSession(sessionId) {
      const r = await db.first<SessionRecord>("SELECT * FROM relay_sessions WHERE session_id = ?", [sessionId]);
      return r ? toSession(r) : null;
    },
    async updateSession(sessionId, patch) {
      const sets: string[] = [];
      const params: SqlValue[] = [];
      if (patch.closedAt !== undefined) {
        sets.push("closed_at = ?");
        params.push(patch.closedAt);
      }
      if (patch.expiresAt !== undefined) {
        sets.push("expires_at = ?");
        params.push(patch.expiresAt);
      }
      if (!sets.length) return;
      await db.run(`UPDATE relay_sessions SET ${sets.join(", ")} WHERE session_id = ?`, [...params, sessionId]);
    },
    async deleteSession(sessionId) {
      await db.batch([
        { sql: "DELETE FROM relay_slots WHERE session_id = ?", params: [sessionId] },
        { sql: "DELETE FROM relay_sessions WHERE session_id = ?", params: [sessionId] },
      ]);
    },
    insertSlots(sessionId, slots) {
      return insertAll(db, slots.map((s) => insertSlot(sessionId, s)));
    },
    async deleteSlot(sessionId, slotId) {
      await db.run("DELETE FROM relay_slots WHERE session_id = ? AND slot_id = ?", [sessionId, slotId]);
    },
    async getSlot(sessionId, slotId) {
      const r = await db.first<SlotRecord>(
        "SELECT * FROM relay_slots WHERE session_id = ? AND slot_id = ?",
        [sessionId, slotId],
      );
      return r ? toSlot(r) : null;
    },
    async listSlots(sessionId, { after = "", limit, filter }) {
      const where =
        filter === "DRAFT" ? " AND draft IS NOT NULL" : filter === "SUBMISSION" ? " AND submission IS NOT NULL" : "";
      const rows = await db.all<SlotRecord>(
        `SELECT * FROM relay_slots WHERE session_id = ? AND slot_id > ?${where} ORDER BY slot_id LIMIT ?`,
        [sessionId, after, limit],
      );
      return rows.map(toSlot);
    },
    async countSlots(sessionId) {
      const r = await db.first<{ total: number; in_progress: number; submitted: number }>(
        `SELECT COUNT(*) AS total,
                COALESCE(SUM(submission IS NULL AND draft_version > 0), 0) AS in_progress,
                COALESCE(SUM(submission IS NOT NULL), 0) AS submitted
           FROM relay_slots WHERE session_id = ?`,
        [sessionId],
      );
      return { total: Number(r?.total ?? 0), inProgress: Number(r?.in_progress ?? 0), submitted: Number(r?.submitted ?? 0) };
    },
    async writeDraft(sessionId, slotId, envelope, baseVersion, now) {
      const { changes } = await db.run(
        `UPDATE relay_slots SET draft = ?, draft_version = draft_version + 1, updated_at = ?
          WHERE session_id = ? AND slot_id = ? AND draft_version = ? AND submission IS NULL AND ${SESSION_OPEN}`,
        [envelope, now, sessionId, slotId, baseVersion, sessionId],
      );
      return changes === 1;
    },
    async writeSubmission(sessionId, slotId, envelope, envelopeHash, now) {
      const { changes } = await db.run(
        `UPDATE relay_slots SET submission = ?, submission_hash = ?, submitted_at = ?, updated_at = ?, draft = NULL
          WHERE session_id = ? AND slot_id = ? AND submission IS NULL AND ${SESSION_OPEN}`,
        [envelope, envelopeHash, now, now, sessionId, slotId, sessionId],
      );
      return changes === 1;
    },
    async recordSlotAuthFailure(sessionId, slotId, lockAfter, lockUntil) {
      // Both CASE expressions read the row's previous values, so this is one atomic step.
      await db.run(
        `UPDATE relay_slots
            SET failed_attempts = CASE WHEN failed_attempts + 1 >= ? THEN 0 ELSE failed_attempts + 1 END,
                locked_until = CASE WHEN failed_attempts + 1 >= ? THEN ? ELSE locked_until END
          WHERE session_id = ? AND slot_id = ?`,
        [lockAfter, lockAfter, lockUntil, sessionId, slotId],
      );
    },
    async resetSlotAuthFailures(sessionId, slotId) {
      await db.run(
        `UPDATE relay_slots SET failed_attempts = 0, locked_until = NULL
          WHERE session_id = ? AND slot_id = ? AND (failed_attempts <> 0 OR locked_until IS NOT NULL)`,
        [sessionId, slotId],
      );
    },
    async purgeExpired(now) {
      const [, sessions] = await db.batch([
        {
          sql: "DELETE FROM relay_slots WHERE session_id IN (SELECT session_id FROM relay_sessions WHERE expires_at <= ?)",
          params: [now],
        },
        { sql: "DELETE FROM relay_sessions WHERE expires_at <= ?", params: [now] },
      ]);
      return sessions?.changes ?? 0;
    },
  };
}
