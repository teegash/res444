/*
  Repair: Shift a misallocated rent prepayment batch to the intended start month (one-time fix)

  When this is needed:
  - A tenant paid for (e.g.) Jan–Mar, but the system allocated invoices as Feb–Apr (or otherwise "skipped" a month).
  - As a result, statements show the wrong months and the dashboard "Paid until / Next due" becomes inaccurate.

  What this script does (for ONE lease + ONE batch_id):
  - Finds all rent invoices that belong to the payment batch (payments.batch_id = <BATCH_ID>, applied_to_prepayment = true)
  - Reassigns their `period_start` to a new contiguous sequence starting at <DESIRED_START_MONTH>
  - Updates `due_date` (5th of that month), and `description`
  - Voids any conflicting UNPAID invoice rows for the same lease+month (safe), but aborts if a conflicting PAID invoice exists
  - Recomputes lease pointers:
    - leases.rent_paid_until = month-end of last paid rent month
    - leases.next_rent_due_date = first unpaid/missing rent month from eligible_start

  IMPORTANT:
  - Replace the placeholders below before running.
  - Run in Supabase SQL Editor.
*/

do $$
declare
  v_lease_id uuid := 'REPLACE_WITH_LEASE_ID';
  v_batch_id uuid := 'REPLACE_WITH_BATCH_ID';
  v_desired_start date := 'REPLACE_WITH_DESIRED_START_MONTH'; -- must be YYYY-MM-01

  v_org_id uuid;
  v_start_date date;
  v_eligible_start date;

  v_invoice_ids uuid[] := '{}';
  v_count int := 0;
  v_i int := 0;

  v_tmp_base date := '2600-01-01';
  v_target date;
  v_conflict uuid;

  v_last_paid_month date;
  v_paid_until date;
  v_next_due date;
begin
  if v_lease_id is null then
    raise exception 'REPLACE_WITH_LEASE_ID is required';
  end if;
  if v_batch_id is null then
    raise exception 'REPLACE_WITH_BATCH_ID is required';
  end if;
  if v_desired_start is null then
    raise exception 'REPLACE_WITH_DESIRED_START_MONTH is required';
  end if;
  if extract(day from v_desired_start)::int <> 1 then
    raise exception 'DESIRED_START_MONTH must be the first day of a month (YYYY-MM-01). Got %', v_desired_start;
  end if;

  select l.organization_id, l.start_date
  into v_org_id, v_start_date
  from public.leases l
  where l.id = v_lease_id;

  if v_org_id is null then
    raise exception 'Lease % not found or missing organization_id', v_lease_id;
  end if;

  v_eligible_start := date_trunc('month', v_start_date)::date;
  if extract(day from v_start_date)::int > 1 then
    v_eligible_start := (v_eligible_start + interval '1 month')::date;
  end if;

  if v_desired_start < v_eligible_start then
    raise exception 'Desired start % is before eligible_start % for lease %', v_desired_start, v_eligible_start, v_lease_id;
  end if;

  -- Collect batch invoices, ordered by current period_start.
  select array_agg(i.id order by i.period_start asc)
  into v_invoice_ids
  from public.payments p
  join public.invoices i on i.id = p.invoice_id and i.organization_id = p.organization_id
  where
    p.batch_id = v_batch_id
    and p.applied_to_prepayment = true
    and i.lease_id = v_lease_id
    and i.invoice_type = 'rent'
    and i.period_start is not null
    and coalesce(i.status_text, '') <> 'void';

  v_count := coalesce(array_length(v_invoice_ids, 1), 0);
  if v_count = 0 then
    raise exception 'No rent invoices found for lease % with batch_id %', v_lease_id, v_batch_id;
  end if;

  -- Stage 1: move batch invoices to far-future temp months to avoid unique conflicts during shifting.
  for v_i in 1..v_count loop
    update public.invoices
    set
      period_start = (v_tmp_base + make_interval(months => v_i))::date,
      due_date = ((v_tmp_base + make_interval(months => v_i))::date + 4)::date,
      description = 'Rent (repair staging) ' || v_i::text,
      organization_id = v_org_id
    where id = v_invoice_ids[v_i];
  end loop;

  -- Stage 2: apply final period_start sequence and handle conflicts.
  for v_i in 1..v_count loop
    v_target := (v_desired_start + make_interval(months => (v_i - 1)))::date;

    -- If there is an existing invoice for that target month (same lease), it must be voided (if unpaid) or we abort (if paid).
    select i.id
    into v_conflict
    from public.invoices i
    where
      i.lease_id = v_lease_id
      and i.invoice_type = 'rent'
      and i.period_start = v_target
      and i.id <> v_invoice_ids[v_i]
      and coalesce(i.status_text, '') <> 'void'
    limit 1;

    if v_conflict is not null then
      -- Abort if the conflicting invoice is paid.
      if exists (
        select 1
        from public.invoices i
        where i.id = v_conflict
          and (coalesce(i.status_text, '') = 'paid' or coalesce(i.status, false) = true)
      ) then
        raise exception 'Conflict: found PAID rent invoice % for month % (lease %). Resolve manually.', v_conflict, v_target, v_lease_id;
      end if;

      -- Safe to void unpaid conflict.
      update public.invoices
      set
        status_text = 'void',
        status = false,
        total_paid = 0
      where id = v_conflict;
    end if;

    update public.invoices
    set
      period_start = v_target,
      due_date = (v_target + 4)::date,
      description = 'Rent for ' || to_char(v_target, 'FMMonth YYYY'),
      organization_id = v_org_id
    where id = v_invoice_ids[v_i];
  end loop;

  -- Recompute lease pointers using invoice truth (same semantics as apply_rent_prepayment).
  select max(i.period_start)
  into v_last_paid_month
  from public.invoices i
  where
    i.lease_id = v_lease_id
    and i.invoice_type = 'rent'
    and i.period_start is not null
    and i.period_start >= v_eligible_start
    and coalesce(i.status_text, '') <> 'void'
    and (coalesce(i.status_text, '') = 'paid' or coalesce(i.status, false) = true);

  if v_last_paid_month is null then
    v_paid_until := null;
  else
    v_paid_until := (date_trunc('month', v_last_paid_month)::date + interval '1 month' - interval '1 day')::date;
  end if;

  -- First unpaid/missing month from eligible_start
  with months as (
    select (v_eligible_start + make_interval(months => gs::int))::date as period_start
    from generate_series(0, 240) as gs
  ),
  paid as (
    select distinct i.period_start
    from public.invoices i
    where
      i.lease_id = v_lease_id
      and i.invoice_type = 'rent'
      and i.period_start is not null
      and i.period_start >= v_eligible_start
      and coalesce(i.status_text, '') <> 'void'
      and (coalesce(i.status_text, '') = 'paid' or coalesce(i.status, false) = true)
  )
  select m.period_start
  into v_next_due
  from months m
  left join paid p on p.period_start = m.period_start
  where p.period_start is null
  order by m.period_start asc
  limit 1;

  update public.leases
  set
    rent_paid_until = v_paid_until,
    next_rent_due_date = v_next_due
  where id = v_lease_id;

  raise notice 'Repaired batch %. Lease % now rent_paid_until=%, next_rent_due_date=%', v_batch_id, v_lease_id, v_paid_until, v_next_due;
end $$;

