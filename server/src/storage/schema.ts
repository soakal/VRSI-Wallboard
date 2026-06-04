export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS jobs (
  job_number TEXT PRIMARY KEY,
  pm TEXT NOT NULL DEFAULT '',
  customer TEXT NOT NULL DEFAULT '',
  materials_manager TEXT NOT NULL DEFAULT '',
  pabs_complete TEXT,
  ship_to_pm TEXT,
  ship_to_customer TEXT,
  imported_at TEXT
);

CREATE TABLE IF NOT EXISTS jobs_import_meta (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  imported_at TEXT NOT NULL,
  source_file TEXT NOT NULL DEFAULT '',
  new_job_numbers TEXT NOT NULL DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS board_state (
  job_number TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'none',
  ship_date_override TEXT,
  ship_date_override_note TEXT,
  binder_printed INTEGER NOT NULL DEFAULT 0,
  version INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL,
  updated_by TEXT
);

CREATE TABLE IF NOT EXISTS notes (
  id TEXT PRIMARY KEY,
  job_number TEXT NOT NULL,
  text TEXT NOT NULL,
  author_id TEXT NOT NULL,
  author_name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT,
  is_ops_schedule INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp TEXT NOT NULL,
  type TEXT NOT NULL,
  detail TEXT NOT NULL,
  path TEXT,
  success INTEGER NOT NULL DEFAULT 1,
  size_bytes INTEGER
);

CREATE INDEX IF NOT EXISTS idx_notes_job ON notes(job_number);
`;
