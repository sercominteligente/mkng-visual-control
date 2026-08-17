CREATE TABLE IF NOT EXISTS pricing_reference_catalogs (
  id TEXT PRIMARY KEY,
  filename TEXT NOT NULL,
  content TEXT NOT NULL,
  content_chars INTEGER NOT NULL DEFAULT 0,
  line_count INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_pricing_reference_catalogs_active
  ON pricing_reference_catalogs(active, created_at DESC);
