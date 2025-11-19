ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS months_paid integer NULL DEFAULT 1;

ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS payments_payment_method_check;
ALTER TABLE public.payments
  ADD CONSTRAINT payments_payment_method_check CHECK (
    payment_method IS NULL OR payment_method = ANY (ARRAY['mpesa','bank_transfer','cash','cheque','card'])
  );
