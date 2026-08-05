ALTER TABLE receivables ADD COLUMN received_amount REAL NOT NULL DEFAULT 0;
ALTER TABLE receivables ADD COLUMN payment_method TEXT;
ALTER TABLE receivables ADD COLUMN payment_date TEXT;
ALTER TABLE receivables ADD COLUMN balance_due_date TEXT;
ALTER TABLE receivables ADD COLUMN payment_reference TEXT;

UPDATE receivables
   SET received_amount = amount,
       payment_date = COALESCE(paid_at, updated_at),
       balance_due_date = COALESCE(balance_due_date, due_date)
 WHERE status = 'paid';

UPDATE receivables
   SET balance_due_date = COALESCE(balance_due_date, due_date)
 WHERE balance_due_date IS NULL;

CREATE INDEX IF NOT EXISTS idx_receivables_status_due ON receivables(status, balance_due_date);
CREATE INDEX IF NOT EXISTS idx_receivables_payment_date ON receivables(payment_date);

CREATE TABLE IF NOT EXISTS receivable_payments (
  id TEXT PRIMARY KEY,
  receivable_id TEXT NOT NULL,
  amount REAL NOT NULL,
  payment_method TEXT NOT NULL,
  payment_date TEXT NOT NULL,
  reference TEXT,
  notes TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (receivable_id) REFERENCES receivables(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_receivable_payments_receivable ON receivable_payments(receivable_id, payment_date);
