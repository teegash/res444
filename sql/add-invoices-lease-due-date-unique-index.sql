-- Ensures a lease can only have one invoice per due date and type
create unique index if not exists idx_invoices_lease_due_type
  on public.invoices (lease_id, due_date, invoice_type);
