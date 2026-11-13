// Must stay identical to sql/schema.sql, which Wrangler migrations use (a test checks).
export const schemaSql = `CREATE TABLE IF NOT EXISTS relay_sessions (
  session_id   TEXT PRIMARY KEY,
  app          TEXT NOT NULL,
  admin_hash   TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  definition   TEXT NOT NULL,
  created_at   TEXT NOT NULL,
  expires_at   TEXT NOT NULL,
  closed_at    TEXT
);
CREATE TABLE IF NOT EXISTS relay_slots (
  session_id      TEXT NOT NULL,
  slot_id         TEXT NOT NULL,
  write_hash      TEXT NOT NULL,
  draft           TEXT,
  draft_version   INTEGER NOT NULL DEFAULT 0,
  submission      TEXT,
  submission_hash TEXT,
  updated_at      TEXT,
  submitted_at    TEXT,
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until    TEXT,
  PRIMARY KEY (session_id, slot_id)
);
CREATE INDEX IF NOT EXISTS idx_relay_sessions_expires_at ON relay_sessions (expires_at);
`;
