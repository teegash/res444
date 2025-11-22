-- Ensure rent invoices are unique per lease + month without preventing water invoices
drop index if exists idx_invoices_lease_due_type;

create unique index if not exists idx_invoices_rent_due_unique
  on public.invoices (lease_id, due_date)
  where invoice_type = 'rent';
