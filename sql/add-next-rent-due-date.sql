-- Add cumulative rent due pointer (single source of truth for prepayment state)
ALTER TABLE leases
ADD COLUMN IF NOT EXISTS next_rent_due_date DATE DEFAULT CURRENT_DATE;

-- Seed next_rent_due_date for existing rows where possible
UPDATE leases
SET next_rent_due_date = COALESCE(
  next_rent_due_date,
  CASE
    WHEN rent_paid_until IS NOT NULL THEN (date_trunc('month', rent_paid_until) + INTERVAL '1 month')::date
    WHEN start_date IS NOT NULL THEN date_trunc('month', start_date)::date
    ELSE date_trunc('month', CURRENT_DATE)::date
  END
)
WHERE next_rent_due_date IS NULL;

-- Performance indexes for invoice lookups and nightly jobs
CREATE INDEX IF NOT EXISTS idx_leases_next_rent_due_date ON leases(next_rent_due_date);
CREATE INDEX IF NOT EXISTS idx_invoices_lease_status_type ON invoices(lease_id, status, invoice_type);
CREATE INDEX IF NOT EXISTS idx_invoices_lease_due_date ON invoices(lease_id, due_date, invoice_type);
