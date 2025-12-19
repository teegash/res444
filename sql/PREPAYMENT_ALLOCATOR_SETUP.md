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





when i register as a new admin with new organization, i am getting this error - 2025-12-19 19:35:12.815 [info] Registration API called at: 2025-12-19T19:35:12.813Z
2025-12-19 19:35:12.815 [info] Parsing request body...
2025-12-19 19:35:12.822 [info] Request body parsed. Email: wangechibetty551@gmail.com Role: admin
2025-12-19 19:35:12.822 [info] Registration API - Registering user with role: admin
2025-12-19 19:35:12.823 [info] Calling registerUser with input: {
  email: 'wangechibetty551@gmail.com',
  role: 'admin',
  hasOrganization: true
}
2025-12-19 19:35:12.824 [info] Skipping email check - Supabase will validate during signUp
2025-12-19 19:35:12.824 [info] Creating Supabase admin client for auth...
2025-12-19 19:35:12.827 [info] Supabase admin client created
2025-12-19 19:35:12.827 [info] Creating user with role: admin for email: wangechibetty551@gmail.com
2025-12-19 19:35:12.827 [info] Calling supabase.auth.signUp...
2025-12-19 19:35:12.827 [info] Environment check - SITE_URL: https://res1212-xd8e.vercel.app
2025-12-19 19:35:12.827 [info] Starting signUp operation...
2025-12-19 19:35:12.837 [info] Waiting for signUp to complete (timeout: 8s - Supabase limit)...
2025-12-19 19:35:14.492 [info] SignUp completed in 1662ms
2025-12-19 19:35:14.492 [info] Sign up result:
2025-12-19 19:35:14.492 [info] - User created: true
2025-12-19 19:35:14.492 [info] - Has error: false
2025-12-19 19:35:14.492 [info] - User ID: d9d6aad1-a3c3-4465-9ded-d03907a070e2
2025-12-19 19:35:14.492 [info] - Error message: undefined
2025-12-19 19:35:14.492 [info] User created. Role in metadata: admin
2025-12-19 19:35:14.866 [warning] Failed to create organization member: user_profiles.organization_id must be set before organization_members row is created for user d9d6aad1-a3c3-4465-9ded-d03907a070e2
2025-12-19 19:35:14.866 [info] registerUser result: {
  success: false,
  error: 'user_profiles.organization_id must be set before organization_members row is created for user d9d6aad1-a3c3-4465-9ded-d03907a070e2',
  data: undefined
}
2025-12-19 19:35:14.866 [error] Registration failed: user_profiles.organization_id must be set before organization_members row is created for user d9d6aad1-a3c3-4465-9ded-d03907a070e2 Status: 400
2025-12-19 19:35:14.868 [info] Registration API request completed at: 2025-12-19T19:35:14.868Z

fix it for me, remember this is sign up for admin, it creates a new organization and organization member of the new organization upon creation, be keen doing this.