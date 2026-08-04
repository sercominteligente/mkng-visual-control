ALTER TABLE material_categories ADD COLUMN description TEXT;
ALTER TABLE material_categories ADD COLUMN code TEXT;

ALTER TABLE materials ADD COLUMN material_type TEXT NOT NULL DEFAULT 'general';
ALTER TABLE materials ADD COLUMN grammage_gsm REAL;
ALTER TABLE materials ADD COLUMN length_m REAL;
ALTER TABLE materials ADD COLUMN volume_l REAL;
ALTER TABLE materials ADD COLUMN color TEXT;
ALTER TABLE materials ADD COLUMN finish TEXT;
ALTER TABLE materials ADD COLUMN package_size TEXT;

UPDATE materials
SET material_type = CASE
  WHEN category_id = 'cat-chapas' THEN 'sheet'
  WHEN category_id = 'cat-tintas' THEN 'paint'
  WHEN category_id = 'cat-adesivos' THEN 'roll'
  ELSE 'general'
END
WHERE material_type IS NULL OR material_type = 'general';

UPDATE material_categories
SET code = CASE id
  WHEN 'cat-chapas' THEN 'CHAPAS'
  WHEN 'cat-tintas' THEN 'TINTAS'
  WHEN 'cat-adesivos' THEN 'ADESIVOS'
  WHEN 'cat-acabamento' THEN 'ACABAMENTO'
  WHEN 'cat-insumos' THEN 'INSUMOS'
  ELSE code
END
WHERE code IS NULL;

CREATE INDEX IF NOT EXISTS idx_materials_type ON materials(material_type);
