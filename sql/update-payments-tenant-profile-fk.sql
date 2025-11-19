-- Align payments.tenant_user_id with user_profiles so Supabase can resolve relationships
-- and the dashboard can fetch tenant metadata without schema-cache errors.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name = 'payments'
      AND constraint_name = 'payments_tenant_user_id_fkey'
  ) THEN
    ALTER TABLE public.payments
      DROP CONSTRAINT payments_tenant_user_id_fkey;
  END IF;
END
$$;

ALTER TABLE public.payments
  ADD CONSTRAINT payments_tenant_user_id_fkey
  FOREIGN KEY (tenant_user_id)
  REFERENCES public.user_profiles(id)
  ON DELETE CASCADE;
