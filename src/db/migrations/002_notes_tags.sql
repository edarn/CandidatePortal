CREATE TABLE IF NOT EXISTS admin_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  candidate_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  note_text TEXT NOT NULL,
  met_at_location TEXT,
  met_at_date TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_admin_notes_candidate ON admin_notes(candidate_user_id);

CREATE TABLE IF NOT EXISTS tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE,
  color TEXT
);

CREATE TABLE IF NOT EXISTS candidate_tags (
  candidate_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (candidate_user_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_candidate_tags_tag ON candidate_tags(tag_id);
