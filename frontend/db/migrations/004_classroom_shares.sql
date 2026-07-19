CREATE TABLE IF NOT EXISTS classroom_shares (
  id TEXT PRIMARY KEY,
  classroom_id TEXT NOT NULL REFERENCES classrooms(id) ON DELETE CASCADE,
  created_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT classroom_shares_token_hash_check
    CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  CONSTRAINT classroom_shares_expiry_check
    CHECK (expires_at > created_at)
);

CREATE INDEX IF NOT EXISTS classroom_shares_classroom_id_idx
  ON classroom_shares(classroom_id);
CREATE INDEX IF NOT EXISTS classroom_shares_created_by_user_id_idx
  ON classroom_shares(created_by_user_id);
CREATE INDEX IF NOT EXISTS classroom_shares_expires_at_idx
  ON classroom_shares(expires_at);
