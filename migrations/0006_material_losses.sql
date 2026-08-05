ALTER TABLE order_materials ADD COLUMN loss_qty REAL NOT NULL DEFAULT 0;
ALTER TABLE order_materials ADD COLUMN reprint_qty REAL NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS material_losses (
  id TEXT PRIMARY KEY,
  order_id TEXT,
  material_id TEXT NOT NULL,
  quantity REAL NOT NULL,
  unit TEXT NOT NULL,
  loss_type TEXT NOT NULL,
  reason TEXT NOT NULL,
  stage TEXT,
  machine TEXT,
  requires_reprint INTEGER NOT NULL DEFAULT 0,
  reprint_qty REAL NOT NULL DEFAULT 0,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'confirmed',
  reversal_reason TEXT,
  reversed_at TEXT,
  reversed_by TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  FOREIGN KEY (material_id) REFERENCES materials(id) ON DELETE RESTRICT,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (reversed_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_material_losses_created ON material_losses(created_at);
CREATE INDEX IF NOT EXISTS idx_material_losses_order ON material_losses(order_id, created_at);
CREATE INDEX IF NOT EXISTS idx_material_losses_material ON material_losses(material_id, created_at);
CREATE INDEX IF NOT EXISTS idx_material_losses_type ON material_losses(loss_type, status);
