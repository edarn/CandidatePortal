CREATE TABLE IF NOT EXISTS deletion_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN ('self','admin','inactivity')),
  deleted_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_deletion_log_user ON deletion_log(user_id);
