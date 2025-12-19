/*
  Rent prepayment allocator (DB source of truth)

  Goal:
  - Paying for N rent months => N separate rent invoices (period_start = 1st of each month, due_date = 5th)
  - One payment row per month (so statements + revenue are month-accurate)
  - payments.applied_to_prepayment = true for all rows in the batch
  - payments.batch_id groups the batch (we use the original/base payment id)

  Signature expected by app code:
    apply_rent_prepayment(p_payment_id uuid, p_lease_id uuid, p_months integer, p_payment_date date)

  Return shape expected by app code:
    {
      batch_id,
      invoice_ids,
      created_invoice_ids,
      rent_paid_until,
      next_rent_due_date
    }

  Run in Supabase SQL Editor.
*/

-- NOTE:
-- If you previously created apply_rent_prepayment with a different RETURNS type,
-- Postgres will reject CREATE OR REPLACE with:
--   "cannot change return type of existing function"
-- In that case, you must DROP the function first (and re-run any dependent triggers after).
drop function if exists public.apply_rent_prepayment(uuid, uuid, integer, date);

create or replace function public.apply_rent_prepayment(
  p_payment_id uuid,
  p_lease_id uuid,
  p_months integer,
  p_payment_date date
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment record;
  v_invoice record;
  v_lease record;

  v_org_id uuid;
  v_monthly_rent numeric;
  v_payment_total numeric;
  v_payment_date timestamptz;
  v_effective_payment_date date;
  v_method text;

  v_eligible_start date;
  v_start date;
  v_last_paid date;
  v_unpaid_start date;
  v_last_paid_until date;
  v_next_due date;

  v_batch_id uuid;
  v_first_invoice_id uuid;
  v_invoice_ids uuid[] := '{}';
  v_created_invoice_ids uuid[] := '{}';

  v_period date;
  v_due_date date;
  v_i int;
  v_last_period date;

  v_expected_total numeric;
begin
  if p_months is null or p_months < 1 then
    raise exception 'p_months must be >= 1';
  end if;
  if p_months > 12 then
    raise exception 'p_months too large (max 12)';
  end if;

  -- Lock the payment row (idempotency + avoid double allocation).
  select *
  into v_payment
  from public.payments
  where id = p_payment_id
  for update;

  if v_payment.id is null then
    raise exception 'Payment % not found', p_payment_id;
  end if;

  -- Only rent payments can be allocated here.
  select id, lease_id, invoice_type, organization_id
  into v_invoice
  from public.invoices
  where id = v_payment.invoice_id;

  if v_invoice.id is null then
    raise exception 'Payment % invoice % not found', p_payment_id, v_payment.invoice_id;
  end if;
  if v_invoice.invoice_type <> 'rent' then
    raise exception 'Payment % is not linked to a rent invoice', p_payment_id;
  end if;
  if v_invoice.lease_id <> p_lease_id then
    raise exception 'Payment % invoice does not belong to lease %', p_payment_id, p_lease_id;
  end if;

  -- If already applied, return a no-op response.
  if coalesce(v_payment.applied_to_prepayment, false) = true then
    return jsonb_build_object(
      'batch_id', v_payment.batch_id,
      'invoice_ids', '[]'::jsonb,
      'created_invoice_ids', '[]'::jsonb,
      'rent_paid_until', null,
      'next_rent_due_date', null
    );
  end if;

  select
    l.organization_id,
    l.monthly_rent,
    l.start_date,
    l.rent_paid_until,
    l.next_rent_due_date,
    l.status
  into v_lease
  from public.leases l
  where l.id = p_lease_id;

  if v_lease.organization_id is null then
    raise exception 'Lease % not found (or missing organization_id)', p_lease_id;
  end if;
  if v_lease.status not in ('active', 'pending') then
    raise exception 'Lease % is not active/pending', p_lease_id;
  end if;

  v_org_id := v_lease.organization_id;
  v_monthly_rent := v_lease.monthly_rent;
  v_payment_total := v_payment.amount_paid;
  v_method := v_payment.payment_method;
  v_payment_date := coalesce(v_payment.payment_date, now());
  v_effective_payment_date := coalesce(p_payment_date, (v_payment_date at time zone 'utc')::date);

  if v_payment.organization_id is not null and v_payment.organization_id <> v_org_id then
    raise exception 'Payment org % does not match lease org %', v_payment.organization_id, v_org_id;
  end if;

  v_expected_total := v_monthly_rent * p_months;
  if abs(v_payment_total - v_expected_total) > 0.05 then
    raise exception 'Payment amount % does not match expected % for % months', v_payment_total, v_expected_total, p_months;
  end if;

  -- Eligible start month: if lease starts mid-month, first billable month is next month.
  v_eligible_start := date_trunc('month', v_lease.start_date)::date;
  if extract(day from v_lease.start_date)::int > 1 then
    v_eligible_start := (v_eligible_start + interval '1 month')::date;
  end if;

  -- Determine allocation start month as the FIRST unpaid/missing month from eligible_start.
  -- This prevents "skip January" type gaps if invoices were created out-of-order.
  with months as (
    select (v_eligible_start + make_interval(months => gs::int))::date as period_start
    from generate_series(0, 240) as gs
  ),
  paid as (
    select distinct i.period_start
    from public.invoices i
    where
      i.lease_id = p_lease_id
      and i.invoice_type = 'rent'
      and i.period_start is not null
      and i.period_start >= v_eligible_start
      and coalesce(i.status_text, '') <> 'void'
      and (coalesce(i.status_text, '') = 'paid' or coalesce(i.status, false) = true)
  )
  select m.period_start
  into v_start
  from months m
  left join paid p on p.period_start = m.period_start
  where p.period_start is null
  order by m.period_start asc
  limit 1;

  if v_start is null then
    v_start := v_eligible_start;
  end if;

  v_start := greatest(v_eligible_start, date_trunc('month', v_start)::date);
  v_batch_id := coalesce(v_payment.batch_id, v_payment.id);

  -- Create/upsert invoices for each covered month (paid).
  for v_i in 0..(p_months - 1) loop
    v_period := (v_start + make_interval(months => v_i))::date;
    v_due_date := (v_period + 4)::date; -- 5th of the month

    insert into public.invoices (
      lease_id,
      invoice_type,
      amount,
      due_date,
      payment_date,
      months_covered,
      description,
      organization_id,
      period_start,
      status,
      status_text
    )
    values (
      p_lease_id,
      'rent',
      v_monthly_rent,
      v_due_date,
      v_effective_payment_date,
      1,
      'Rent for ' || to_char(v_period, 'FMMonth YYYY'),
      v_org_id,
      v_period,
      true,
      'paid'
    )
    on conflict (lease_id, invoice_type, period_start)
    do update set
      amount = excluded.amount,
      due_date = excluded.due_date,
      payment_date = excluded.payment_date,
      status = excluded.status,
      status_text = excluded.status_text,
      months_covered = 1
    returning id into v_first_invoice_id;

    v_invoice_ids := array_append(v_invoice_ids, v_first_invoice_id);
    v_created_invoice_ids := array_append(v_created_invoice_ids, v_first_invoice_id);
  end loop;

  v_last_period := (v_start + make_interval(months => (p_months - 1)))::date;
  v_first_invoice_id := v_invoice_ids[1];

  -- Update the base payment to represent month 1 only (so invoice totals remain correct).
  update public.payments
  set
    invoice_id = v_first_invoice_id,
    amount_paid = v_monthly_rent,
    months_paid = 1,
    organization_id = v_org_id,
    verified = true,
    verified_at = coalesce(verified_at, now()),
    batch_id = v_batch_id,
    applied_to_prepayment = true,
    notes = trim(both ' ' from coalesce(notes, '') || ' [prepayment_applied] original_amount_paid=' || v_payment_total::text || ' original_months=' || p_months::text)
  where id = p_payment_id;

  -- Insert allocation payments for months 2..N
  for v_i in 2..array_length(v_invoice_ids, 1) loop
    insert into public.payments (
      invoice_id,
      tenant_user_id,
      amount_paid,
      payment_method,
      payment_date,
      verified,
      verified_at,
      notes,
      months_paid,
      organization_id,
      batch_id,
      applied_to_prepayment
    )
    values (
      v_invoice_ids[v_i],
      v_payment.tenant_user_id,
      v_monthly_rent,
      v_method,
      v_payment_date,
      true,
      coalesce(v_payment.verified_at, now()),
      'Prepayment allocation from base payment ' || p_payment_id::text,
      1,
      v_org_id,
      v_batch_id,
      true
    );
  end loop;

  -- Update lease pointers:
  -- - rent_paid_until: end-of-month of the latest PAID rent invoice period_start
  -- - next_rent_due_date: earliest UNPAID rent invoice period_start, else month after latest paid
  select max(i.period_start)
  into v_last_paid
  from public.invoices i
  where
    i.lease_id = p_lease_id
    and i.invoice_type = 'rent'
    and i.period_start is not null
    and i.period_start >= v_eligible_start
    and coalesce(i.status_text, '') <> 'void'
    and (coalesce(i.status_text, '') = 'paid' or coalesce(i.status, false) = true);

  if v_last_paid is null then
    -- Should not happen (we created at least one paid invoice), but fail safe.
    v_last_paid := v_last_period;
  end if;

  v_last_paid_until := (date_trunc('month', v_last_paid)::date + interval '1 month' - interval '1 day')::date;

  select min(i.period_start)
  into v_next_due
  from public.invoices i
  where
    i.lease_id = p_lease_id
    and i.invoice_type = 'rent'
    and i.period_start is not null
    and i.period_start >= v_eligible_start
    and coalesce(i.status_text, '') <> 'void'
    and not (coalesce(i.status_text, '') = 'paid' or coalesce(i.status, false) = true);

  if v_next_due is null then
    v_next_due := (date_trunc('month', v_last_paid)::date + interval '1 month')::date;
  end if;

  update public.leases
  set
    rent_paid_until = v_last_paid_until,
    next_rent_due_date = v_next_due
  where id = p_lease_id;

  return jsonb_build_object(
    'batch_id', v_batch_id,
    'invoice_ids', to_jsonb(v_invoice_ids),
    'created_invoice_ids', to_jsonb(v_created_invoice_ids),
    'rent_paid_until', to_char(v_last_paid_until, 'YYYY-MM-DD'),
    'next_rent_due_date', to_char(v_next_due, 'YYYY-MM-DD')
  );
end;
$$;
