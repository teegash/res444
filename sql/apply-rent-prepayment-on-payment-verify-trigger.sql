/*
  Auto-apply rent prepayment when a multi-month payment becomes verified.

  Why:
  - Fixes cases where app-layer allocation is skipped (network retries, missed callbacks, manual DB verify).
  - Ensures payments.applied_to_prepayment is set to true for verified multi-month rent payments.
  - Ensures N-month payment => N invoices + N payments (via public.apply_rent_prepayment).

  Safe guards:
  - Only runs when NEW.verified = true AND NEW.months_paid > 1 AND NEW.applied_to_prepayment = false.
  - Only runs for payments linked to a RENT invoice.
  - public.apply_rent_prepayment is idempotent (no-op if already applied).

  Run in Supabase SQL Editor.
*/

create or replace function public.apply_rent_prepayment_on_payment_verify()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice record;
  v_payment_date date;
begin
  -- Only act on verified, multi-month payments that are not yet applied.
  if new.verified is distinct from true then
    return new;
  end if;

  if coalesce(new.applied_to_prepayment, false) = true then
    return new;
  end if;

  if coalesce(new.months_paid, 1) <= 1 then
    return new;
  end if;

  -- Resolve lease_id + invoice_type from the linked invoice (schema uses composite FK by org).
  select i.lease_id, i.invoice_type
  into v_invoice
  from public.invoices i
  where i.id = new.invoice_id
    and i.organization_id = new.organization_id;

  if v_invoice.lease_id is null or v_invoice.invoice_type <> 'rent' then
    return new;
  end if;

  v_payment_date := (coalesce(new.payment_date, now()) at time zone 'utc')::date;

  perform public.apply_rent_prepayment(
    new.id,
    v_invoice.lease_id,
    new.months_paid,
    v_payment_date
  );

  return new;
end $$;

drop trigger if exists trg_apply_rent_prepayment_on_payment_verify on public.payments;

create trigger trg_apply_rent_prepayment_on_payment_verify
after insert or update of verified, months_paid on public.payments
for each row
when (
  new.verified = true
  and coalesce(new.months_paid, 1) > 1
  and coalesce(new.applied_to_prepayment, false) = false
)
execute function public.apply_rent_prepayment_on_payment_verify();

