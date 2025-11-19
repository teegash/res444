ALTER TABLE public.leases
  ADD COLUMN IF NOT EXISTS rent_paid_until date NULL;
