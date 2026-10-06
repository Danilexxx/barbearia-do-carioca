CREATE TABLE IF NOT EXISTS app_state (
  state_key TEXT PRIMARY KEY,
  json_value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS bookings (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  time TEXT NOT NULL,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  service_name TEXT NOT NULL,
  service_price REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(date, time)
);

CREATE INDEX IF NOT EXISTS idx_bookings_date ON bookings(date);

CREATE TABLE IF NOT EXISTS booking_blocks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  block_type TEXT NOT NULL CHECK (block_type IN ('date', 'slot', 'weekday')),
  date TEXT,
  time TEXT,
  weekday INTEGER CHECK (weekday BETWEEN 0 AND 6),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_block_date
  ON booking_blocks(block_type, date) WHERE block_type = 'date';
CREATE UNIQUE INDEX IF NOT EXISTS uniq_block_slot
  ON booking_blocks(block_type, date, time) WHERE block_type = 'slot';
CREATE UNIQUE INDEX IF NOT EXISTS uniq_block_weekday
  ON booking_blocks(block_type, weekday) WHERE block_type = 'weekday';

CREATE TABLE IF NOT EXISTS auth_attempts (
  client_key TEXT PRIMARY KEY,
  failures INTEGER NOT NULL DEFAULT 0,
  locked_until INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
