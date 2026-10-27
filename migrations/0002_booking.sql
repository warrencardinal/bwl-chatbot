CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS bookings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  lead_id INTEGER NOT NULL,
  session_id TEXT NOT NULL,
  start_utc TEXT NOT NULL,
  end_utc TEXT NOT NULL,
  local_date TEXT NOT NULL,
  event_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_bookings_start ON bookings(start_utc) WHERE status != 'cancelled';
CREATE UNIQUE INDEX IF NOT EXISTS idx_bookings_session ON bookings(session_id) WHERE status != 'cancelled';
CREATE INDEX IF NOT EXISTS idx_bookings_date ON bookings(local_date);
