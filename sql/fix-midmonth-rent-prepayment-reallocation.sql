/*
  Fix "mid-month lease start" prepayment misallocation (one-time repair)

  Scenario:
  - Lease starts on a day > 1 (e.g., 2025-11-30), so the first billable rent month should be the NEXT month (2025-12-01).
  - Older code may have allocated a multi-month prepayment starting at the start of the lease month (2025-11-01), creating a paid invoice before the eligible start month.

  What this script does (for ONE lease):
  - Finds ONE paid rent invoice with period_start < eligible_start (pre-start month).
  - Creates a replacement paid rent invoice at the next missing month AFTER the latest eligible paid month.
  - Moves any payments from the pre-start invoice to the replacement invoice (keeps audit trail in payments).
    - If there are no payment rows to move (legacy data), inserts a compensating verified "cash" payment for the replacement invoice.
  - Voids the pre-start invoice.
  - Recomputes lease pointers: rent_paid_until, next_rent_due_date.

  IMPORTANT:
  - Replace the lease id below before running.
  - If you have more than one pre-start paid invoice, run this script again until it prints "No pre-start paid rent invoice found".
*/

do $$
declare
  v_lease_id uuid := 'REPLACE_WITH_LEASE_ID';

  v_org_id uuid;
  v_monthly_rent numeric;
  v_start_date date;
  v_tenant_user_id uuid;

  v_eligible_start date;

  v_bad_invoice_id uuid;
  v_bad_period_start date;

  v_last_paid_eligible date;
  v_new_period_start date;
  v_new_invoice_id uuid;

  v_moved_count integer := 0;
begin
  select
    l.organization_id,
    l.monthly_rent,
    l.start_date,
    l.tenant_user_id
  into
    v_org_id,
    v_monthly_rent,
    v_start_date,
    v_tenant_user_id
  from public.leases l
  where l.id = v_lease_id;

  if v_org_id is null then
    raise exception 'Lease % has NULL organization_id. Fix lease org first.', v_lease_id;
  end if;

  if v_start_date is null then
    raise exception 'Lease % has NULL start_date.', v_lease_id;
  end if;

  v_eligible_start := date_trunc('month', v_start_date)::date;
  if extract(day from v_start_date)::int > 1 then
    v_eligible_start := (v_eligible_start + interval '1 month')::date;
  end if;

  select i.id, i.period_start
  into v_bad_invoice_id, v_bad_period_start
  from public.invoices i
  where
    i.lease_id = v_lease_id
    and i.invoice_type = 'rent'
    and i.status_text = 'paid'
    and i.period_start is not null
    and i.period_start < v_eligible_start
  order by i.period_start asc
  limit 1;

  if v_bad_invoice_id is null then
    raise notice 'No pre-start paid rent invoice found for lease %, eligible_start=%', v_lease_id, v_eligible_start;
    return;
  end if;

  select max(i.period_start)
  into v_last_paid_eligible
  from public.invoices i
  where
    i.lease_id = v_lease_id
    and i.invoice_type = 'rent'
    and i.status_text = 'paid'
    and i.period_start is not null
    and i.period_start >= v_eligible_start;

  if v_last_paid_eligible is null then
    -- No eligible paid months, so replacement starts at eligible_start.
    v_new_period_start := v_eligible_start;
  else
    v_new_period_start := (v_last_paid_eligible + interval '1 month')::date;
  end if;

  -- Create or re-use replacement invoice for the missing month.
  insert into public.invoices (
    lease_id,
    organization_id,
    invoice_type,
    amount,
    period_start,
    due_date,
    status,
    status_text,
    months_covered,
    description,
    total_paid
  )
  values (
    v_lease_id,
    v_org_id,
    'rent',
    v_monthly_rent,
    v_new_period_start,
    (v_new_period_start + interval '4 days')::date, -- 5th of the rent month
    true,
    'paid',
    1,
    'Rent (reallocated) for ' || to_char(v_new_period_start, 'FMMonth YYYY'),
    0
  )
  on conflict (lease_id, invoice_type, period_start)
  do update set
    amount = excluded.amount,
    due_date = excluded.due_date
  returning id into v_new_invoice_id;

  -- Move any existing payment rows from the pre-start invoice to the replacement invoice.
  with moved as (
    update public.payments p
    set
      invoice_id = v_new_invoice_id,
      organization_id = v_org_id
    where p.invoice_id = v_bad_invoice_id
    returning p.id
  )
  select count(*) into v_moved_count from moved;

  -- If there were no payment rows (legacy direct invoice updates), add a compensating payment row.
  if v_moved_count = 0 then
    insert into public.payments (
      invoice_id,
      tenant_user_id,
      amount_paid,
      payment_method,
      verified,
      verified_at,
      months_paid,
      organization_id,
      notes
    )
    values (
      v_new_invoice_id,
      v_tenant_user_id,
      v_monthly_rent,
      'cash',
      true,
      now(),
      1,
      v_org_id,
      'System adjustment: reallocated prepaid rent from pre-start invoice ' || v_bad_invoice_id::text
    );
  end if;

  -- Void the pre-start invoice so it no longer affects arrears/reports.
  update public.invoices
  set
    status_text = 'void',
    status = false,
    total_paid = 0,
    months_covered = 1
  where id = v_bad_invoice_id;

  -- Recompute lease pointers based on eligible paid invoices.
  select max(i.period_start)
  into v_last_paid_eligible
  from public.invoices i
  where
    i.lease_id = v_lease_id
    and i.invoice_type = 'rent'
    and i.status_text = 'paid'
    and i.period_start is not null
    and i.period_start >= v_eligible_start;

  if v_last_paid_eligible is null then
    -- No eligible paid invoices remain; reset pointers to eligible start.
    update public.leases
    set
      rent_paid_until = null,
      next_rent_due_date = v_eligible_start
    where id = v_lease_id;
  else
    update public.leases
    set
      rent_paid_until = v_last_paid_eligible,
      next_rent_due_date = (v_last_paid_eligible + interval '1 month')::date
    where id = v_lease_id;
  end if;

  raise notice
    'Reallocated pre-start rent invoice % (period_start=%) -> invoice % (period_start=%); moved_payments=%; eligible_start=%',
    v_bad_invoice_id, v_bad_period_start, v_new_invoice_id, v_new_period_start, v_moved_count, v_eligible_start;
end $$;

