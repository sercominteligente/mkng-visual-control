INSERT OR IGNORE INTO material_categories (id, name, sort_order, active) VALUES
  ('cat-chapas', 'Chapas e placas', 10, 1),
  ('cat-tintas', 'Tintas', 20, 1),
  ('cat-adesivos', 'Adesivos e vinis', 30, 1),
  ('cat-acabamento', 'Acabamento', 40, 1),
  ('cat-insumos', 'Insumos gerais', 50, 1);

INSERT OR IGNORE INTO settings (key, value) VALUES
  ('company_name', 'MKNG Soluções'),
  ('department_name', 'Setor de Comunicação Visual'),
  ('powered_by', 'SER Comunicação Inteligente & Hakham IA'),
  ('currency', 'BRL'),
  ('timezone', 'America/Fortaleza'),
  ('order_prefix', 'OS'),
  ('purchase_prefix', 'CMP');
