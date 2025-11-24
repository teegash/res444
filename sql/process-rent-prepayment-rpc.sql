-- Transactional rent prepayment handler (single source of truth: leases.next_rent_due_date)
-- Call via Supabase RPC: process_rent_prepayment
--
-- Inputs:
--   _lease_id          UUID
--   _payment_id        UUID
--   _tenant_user_id    UUID
--   _months_paid       INTEGER
--   _amount_paid       NUMERIC
--   _payment_date      TIMESTAMPTZ
--   _payment_method    TEXT
--
-- Outputs:
--   applied_invoices           UUID[]
--   created_invoices           UUID[]
--   paid_up_to_month           DATE
--   next_rent_due_date         DATE
--   cumulative_prepaid_months  INTEGER
--   next_due_date              DATE
--   next_due_amount            NUMERIC
--
-- Notes:
-- - Uses existing tables only (leases, invoices, payments)
-- - Respects leases.next_rent_due_date pointer for cumulative prepayments
-- - Marks only unpaid invoices as paid; creates missing invoices for coverage months
-- - Atomic by design (single function transaction)

create or replace function process_rent_prepayment(
  _lease_id uuid,
  _payment_id uuid,
  _tenant_user_id uuid,
  _months_paid integer,
  _amount_paid numeric,
  _payment_date timestamptz,
  _payment_method text
)
returns table (
  applied_invoices uuid[],
  created_invoices uuid[],
  paid_up_to_month date,
  next_rent_due_date date,
  cumulative_prepaid_months integer,
  next_due_date date,
  next_due_amount numeric
)
language plpgsql
as $$
declare
  v_lease leases%rowtype;
  v_start_month date;
  v_last_covered date;
  v_next_due date;
  v_monthly_rent numeric;
  v_created uuid[];
  v_applied uuid[];
  v_first_invoice uuid;
begin
  if _months_paid is null or _months_paid <= 0 then
    _months_paid := 1;
  elsif _months_paid > 1 then
    -- enforce single-month prepayment
    _months_paid := 1;
  end if;

  if _amount_paid is null or _amount_paid <= 0 then
    raise exception 'Amount paid must be greater than zero';
  end if;

  if _payment_date::date > current_date then
    raise exception 'Payment date cannot be in the future';
  end if;

  select * into v_lease
  from leases
  where id = _lease_id
  for update;

  if not found then
    raise exception 'Lease not found';
  end if;

  if coalesce(v_lease.status::text, 'inactive') <> 'active' then
    raise exception 'Lease is not active';
  end if;

  -- Determine coverage start (pointer-driven)
  v_start_month := coalesce(
    date_trunc('month', v_lease.next_rent_due_date)::date,
    case when v_lease.rent_paid_until is not null
         then (date_trunc('month', v_lease.rent_paid_until) + interval '1 month')::date
    end,
    date_trunc('month', v_lease.start_date)::date,
    date_trunc('month', current_date)
  );

  v_monthly_rent := coalesce(v_lease.monthly_rent::numeric, 0);

  if v_monthly_rent <= 0 then
    raise exception 'Monthly rent is not configured for this lease';
  end if;

  -- Create missing invoices for coverage months
  with months as (
    select (v_start_month + (gs * interval '1 month'))::date as due_date
    from generate_series(0, _months_paid - 1) gs
  ),
  inserted as (
    insert into invoices (lease_id, invoice_type, amount, due_date, status, months_covered)
    select _lease_id, 'rent', v_monthly_rent, m.due_date, false, 1
    from months m
    on conflict (lease_id, invoice_type, due_date) do nothing
    returning id
  ),
  collected as (
    select i.id, i.due_date, i.amount, i.status
    from invoices i
    join months m on i.due_date = m.due_date
    where i.lease_id = _lease_id and i.invoice_type = 'rent'
  ),
  paid as (
    update invoices i
    set status = true,
        payment_date = coalesce(_payment_date::date, current_date),
        updated_at = now()
    where i.id in (select id from collected where status is distinct from true)
    returning i.id
  )
  select
    array_agg(collected.id order by collected.due_date),
    (select array_agg(id) from inserted),
    max(collected.due_date)
  into v_applied, v_created, v_last_covered
  from collected;

  -- Update lease pointer + paid_until
  v_next_due := (date_trunc('month', v_last_covered) + interval '1 month')::date;
  update leases
  set next_rent_due_date = v_next_due,
      rent_paid_until = (date_trunc('month', v_last_covered) + interval '1 month - 1 day')::date,
      updated_at = now()
  where id = _lease_id;

  -- Update payment record linkage
  v_first_invoice := coalesce(v_applied[1], (select id from inserted limit 1));
  if v_first_invoice is not null then
    update payments
    set invoice_id = v_first_invoice,
        months_paid = _months_paid
    where id = _payment_id;
  end if;

  -- Compute cumulative prepaid months and next due
  select count(*) into cumulative_prepaid_months
  from invoices
  where lease_id = _lease_id and invoice_type = 'rent' and status = true;

  select id, due_date, amount
  into next_due_date, next_due_amount
  from invoices
  where lease_id = _lease_id and invoice_type = 'rent' and status = false
  order by due_date asc
  limit 1;

  applied_invoices := coalesce(v_applied, array[]::uuid[]);
  created_invoices := coalesce(v_created, array[]::uuid[]);
  paid_up_to_month := v_last_covered;
  next_rent_due_date := v_next_due;
  return;
end;
$$;
