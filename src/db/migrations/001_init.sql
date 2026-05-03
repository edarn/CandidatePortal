CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin','candidate')),
  email_verified_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

CREATE TABLE IF NOT EXISTS candidates (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  linkedin_url TEXT,
  current_role TEXT,
  current_company TEXT,
  location TEXT,
  summary TEXT,
  cv_filename TEXT,
  cv_original_name TEXT,
  cv_mime_type TEXT,
  cv_uploaded_at TEXT,
  preferred_locale TEXT NOT NULL DEFAULT 'sv',
  consent_given_at TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_candidates_full_name ON candidates(full_name);
