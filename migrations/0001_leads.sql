CREATE TABLE IF NOT EXISTS leads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  name TEXT,
  phone TEXT,
  email TEXT,
  matter_type TEXT,
  summary TEXT,
  opposing_party TEXT,
  urgent INTEGER NOT NULL DEFAULT 0,
  existing_client INTEGER NOT NULL DEFAULT 0,
  routed_to TEXT,
  notified INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'new',
  source_page TEXT,
  session_id TEXT
);
CREATE INDEX IF NOT EXISTS idx_leads_created ON leads(created_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_session ON leads(session_id);
