# Rent Prepayment Allocator (N months => N invoices + N payments)

This repo expects rent prepayments to be allocated by the DB RPC `public.apply_rent_prepayment(...)` so that:

- Paying `N` months upfront creates `N` separate rent invoices (`period_start` = 1st, `due_date` = 5th)
- A matching `payments` row exists for each month (statements stay month-accurate)
- The base payment and all allocation rows have `applied_to_prepayment = true` and share the same `batch_id`

## 1) Install / update the allocator RPC

Run in Supabase SQL Editor:

- `sql/apply-rent-prepayment.sql`

If you see:

`ERROR: 42P13: cannot change return type of existing function`

run this first:

```sql
drop function if exists public.apply_rent_prepayment(uuid, uuid, integer, date);
```

## 2) Make allocation automatic on verify (recommended)

Run in Supabase SQL Editor:

- `sql/apply-rent-prepayment-on-payment-verify-trigger.sql`

This trigger calls `apply_rent_prepayment` whenever a payment becomes:

- `verified = true`
- `months_paid > 1`
- `applied_to_prepayment = false`
- and the linked invoice is a rent invoice

## 3) Repair older verified multi-month payments (one-time)

Run in Supabase SQL Editor:

- `sql/repair-unapplied-rent-prepayments.sql`

Optional: set `v_org_id` inside the script to scope to one organization.

## 4) Quick verification queries

### A) Confirm batches exist

```sql
select
  count(*) filter (where applied_to_prepayment = true) as applied_true,
  count(*) filter (where batch_id is not null) as has_batch_id,
  count(*) as total_payments
from public.payments;
```

### B) Confirm a specific prepayment was split (replace `<PAYMENT_ID>`)

```sql
select id, batch_id, invoice_id, amount_paid, months_paid, verified, applied_to_prepayment, payment_date
from public.payments
where id = '<PAYMENT_ID>'::uuid
   or batch_id = '<PAYMENT_ID>'::uuid
order by payment_date asc;
```

### C) Confirm invoices exist per month for a lease (replace `<LEASE_ID>`)

```sql
select id, period_start, due_date, amount, status_text, total_paid
from public.invoices
where lease_id = '<LEASE_ID>'::uuid
  and invoice_type = 'rent'
order by period_start asc;
```
