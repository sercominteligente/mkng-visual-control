ALTER TABLE orders ADD COLUMN cancellation_reason TEXT;
ALTER TABLE orders ADD COLUMN cancelled_at TEXT;
ALTER TABLE orders ADD COLUMN cancelled_by TEXT;

CREATE TABLE IF NOT EXISTS order_events (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  label TEXT NOT NULL,
  status TEXT,
  notes TEXT,
  snapshot_json TEXT NOT NULL,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_order_events_order ON order_events(order_id, created_at);

INSERT OR IGNORE INTO settings (key, value) VALUES
  ('login_title', 'Setor de Comunicação Visual'),
  ('login_subtitle', 'MKNG Soluções'),
  ('login_description', 'Sistema interno para controlar demandas, pedidos, produção, chapas, tintas, compras, consumo de materiais e resultados.'),
  ('primary_color', '#ff6a00'),
  ('accent_color', '#8a4dff'),
  ('sidebar_logo_key', ''),
  ('login_logo_key', ''),
  ('favicon_key', '');

INSERT INTO order_events (id, order_id, event_type, label, status, notes, snapshot_json, created_by, created_at)
SELECT
  lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-a' || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6))),
  o.id,
  'legacy_snapshot',
  'Registro importado do histórico anterior',
  o.status,
  'Snapshot criado automaticamente na atualização v0.3.',
  json_object(
    'order', json_object(
      'id', o.id,
      'code', o.code,
      'customer_id', o.customer_id,
      'title', o.title,
      'description', o.description,
      'priority', o.priority,
      'status', o.status,
      'due_date', o.due_date,
      'total_price', o.total_price,
      'notes', o.notes,
      'created_at', o.created_at,
      'updated_at', o.updated_at
    ),
    'items', json('[]'),
    'materials', json('[]'),
    'steps', json('[]')
  ),
  o.created_by,
  o.created_at
FROM orders o
WHERE NOT EXISTS (SELECT 1 FROM order_events e WHERE e.order_id = o.id);
