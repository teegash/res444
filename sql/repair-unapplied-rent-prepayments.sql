/*
  Repair script: apply rent prepayments that were verified but never allocated.

  Use-case:
  - payments.months_paid > 1
  - payments.verified = true
  - payments.applied_to_prepayment = false
  - and the linked invoice is rent

  This will call public.apply_rent_prepayment(...) for each such payment.

  IMPORTANT:
  - Run in Supabase SQL Editor.
  - If you want to scope to one org, set v_org_id below; otherwise leave NULL to process all orgs.
*/

do $$
declare
  v_org_id uuid := null; -- set to your org id to scope, else NULL
  r record;
  v_payment_date date;
begin
  for r in
    select
      p.id as payment_id,
      p.payment_date,
      p.months_paid,
      i.lease_id,
      p.organization_id
    from public.payments p
    join public.invoices i on i.id = p.invoice_id and i.organization_id = p.organization_id
    where
      p.verified = true
      and coalesce(p.months_paid, 1) > 1
      and p.applied_to_prepayment = false
      and i.invoice_type = 'rent'
      and (v_org_id is null or p.organization_id = v_org_id)
    order by p.payment_date asc
  loop
    v_payment_date := (coalesce(r.payment_date, now()) at time zone 'utc')::date;
    perform public.apply_rent_prepayment(r.payment_id, r.lease_id, r.months_paid, v_payment_date);
    raise notice 'Applied prepayment payment_id=% lease_id=% months=%', r.payment_id, r.lease_id, r.months_paid;
  end loop;
end $$;

