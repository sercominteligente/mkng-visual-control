PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS pricing_quotes (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  customer_id TEXT,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  region TEXT NOT NULL DEFAULT 'Fortaleza/CE',
  default_cost_per_m2 REAL NOT NULL DEFAULT 0,
  default_markup_pct REAL NOT NULL DEFAULT 100,
  total_area_m2 REAL NOT NULL DEFAULT 0,
  production_cost REAL NOT NULL DEFAULT 0,
  sale_total REAL NOT NULL DEFAULT 0,
  gross_profit REAL NOT NULL DEFAULT 0,
  market_low REAL,
  market_median REAL,
  market_high REAL,
  market_recommended REAL,
  market_confidence TEXT,
  notes TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_pricing_quotes_created ON pricing_quotes(created_at);
CREATE INDEX IF NOT EXISTS idx_pricing_quotes_customer ON pricing_quotes(customer_id, created_at);
CREATE INDEX IF NOT EXISTS idx_pricing_quotes_status ON pricing_quotes(status, created_at);

CREATE TABLE IF NOT EXISTS pricing_quote_items (
  id TEXT PRIMARY KEY,
  quote_id TEXT NOT NULL,
  description TEXT NOT NULL,
  pricing_mode TEXT NOT NULL DEFAULT 'area',
  quantity REAL NOT NULL DEFAULT 1,
  width_cm REAL NOT NULL DEFAULT 0,
  height_cm REAL NOT NULL DEFAULT 0,
  unit_area_m2 REAL NOT NULL DEFAULT 0,
  total_area_m2 REAL NOT NULL DEFAULT 0,
  cost_per_m2 REAL NOT NULL DEFAULT 0,
  cost_per_unit REAL NOT NULL DEFAULT 0,
  markup_pct REAL NOT NULL DEFAULT 0,
  unit_cost REAL NOT NULL DEFAULT 0,
  line_cost REAL NOT NULL DEFAULT 0,
  unit_price REAL NOT NULL DEFAULT 0,
  line_total REAL NOT NULL DEFAULT 0,
  notes TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (quote_id) REFERENCES pricing_quotes(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_pricing_quote_items_quote ON pricing_quote_items(quote_id, sort_order);

CREATE TABLE IF NOT EXISTS pricing_scenarios (
  id TEXT PRIMARY KEY,
  quote_id TEXT NOT NULL,
  label TEXT NOT NULL,
  markup_pct REAL NOT NULL,
  sale_total REAL NOT NULL DEFAULT 0,
  gross_profit REAL NOT NULL DEFAULT 0,
  margin_pct REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (quote_id) REFERENCES pricing_quotes(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_pricing_scenarios_quote ON pricing_scenarios(quote_id, markup_pct);

CREATE TABLE IF NOT EXISTS pricing_market_research (
  id TEXT PRIMARY KEY,
  quote_id TEXT,
  query TEXT NOT NULL,
  region TEXT,
  low_price REAL,
  median_price REAL,
  high_price REAL,
  recommended_price REAL,
  confidence TEXT,
  summary TEXT,
  sources_json TEXT,
  raw_response_json TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (quote_id) REFERENCES pricing_quotes(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_pricing_market_quote ON pricing_market_research(quote_id, created_at);

CREATE TABLE IF NOT EXISTS pricing_ai_runs (
  id TEXT PRIMARY KEY,
  quote_id TEXT,
  agent TEXT NOT NULL,
  model TEXT,
  prompt_summary TEXT,
  response_text TEXT,
  sources_json TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (quote_id) REFERENCES pricing_quotes(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_pricing_ai_runs_quote ON pricing_ai_runs(quote_id, agent, created_at);
