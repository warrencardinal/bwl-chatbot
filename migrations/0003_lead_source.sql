ALTER TABLE leads ADD COLUMN landing_page TEXT;
ALTER TABLE leads ADD COLUMN referrer TEXT;
ALTER TABLE leads ADD COLUMN utm_source TEXT;
ALTER TABLE leads ADD COLUMN utm_medium TEXT;
ALTER TABLE leads ADD COLUMN utm_campaign TEXT;
ALTER TABLE leads ADD COLUMN utm_term TEXT;
ALTER TABLE leads ADD COLUMN utm_content TEXT;
ALTER TABLE leads ADD COLUMN click_id TEXT;
ALTER TABLE leads ADD COLUMN channel TEXT;
CREATE INDEX IF NOT EXISTS idx_leads_channel ON leads(channel);
CREATE TABLE IF NOT EXISTS test_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  passed INTEGER NOT NULL,
  total INTEGER NOT NULL,
  duration_ms INTEGER NOT NULL,
  model TEXT,
  results TEXT NOT NULL
);
