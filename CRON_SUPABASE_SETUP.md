## Cron jobs via Supabase Edge Functions + GitHub Actions

This repo no longer uses Vercel Cron. Monthly jobs are triggered by GitHub Actions calling Supabase Edge Functions.

### 1) Deploy Supabase Edge Functions

Functions added:
- `supabase/functions/cron-invoices-monthly/index.ts`
- `supabase/functions/cron-expenses-recurring/index.ts`
- `supabase/functions/reminders-trigger/index.ts`
- `supabase/functions/reminders-dispatch/index.ts`

Deploy (from your machine):
```bash
supabase functions deploy cron-invoices-monthly
supabase functions deploy cron-expenses-recurring
supabase functions deploy reminders-trigger
supabase functions deploy reminders-dispatch
```

### 2) Set Supabase Function secrets

These functions require:
- `CRON_SECRET`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Set them in Supabase (Project Settings → Edge Functions → Secrets) or via CLI:
```bash
supabase secrets set CRON_SECRET="YOUR_LONG_RANDOM_SECRET"
supabase secrets set SUPABASE_URL="https://YOUR_PROJECT_REF.supabase.co"
supabase secrets set SUPABASE_SERVICE_ROLE_KEY="YOUR_SERVICE_ROLE_KEY"
```

### 3) Configure GitHub Actions secrets

Create the following secrets in your GitHub repo:
- `SUPABASE_FUNCTIONS_BASE_URL`
  - Example: `https://YOUR_PROJECT_REF.functions.supabase.co`
- `CRON_SECRET`
  - Must match the value you set in Supabase Edge Function secrets.

### 4) GitHub workflows (already added)

- `.github/workflows/cron-invoices-monthly.yml` → runs `cron-invoices-monthly` on `0 0 1 * *`
- `.github/workflows/cron-expenses-recurring.yml` → runs `cron-expenses-recurring` on `2 0 1 * *`
- `.github/workflows/cron-reminders-trigger.yml` → runs `reminders-trigger` daily on `20 0 * * *`
- `.github/workflows/cron-reminders-dispatch-0030.yml` → runs `reminders-dispatch` daily on `30 0 * * *`
- `.github/workflows/cron-reminders-dispatch-1400.yml` → runs `reminders-dispatch` daily on `0 14 * * *`

You can also run them manually from GitHub Actions via `workflow_dispatch`.

### 5) Manual curl test

```bash
curl -sS -X POST "https://YOUR_PROJECT_REF.functions.supabase.co/cron-expenses-recurring" \
  -H "x-cron-secret: YOUR_CRON_SECRET" \
  -H "Content-Type: application/json" \
  --data '{}'
```

### Notes

- The recurring expenses job is idempotent per schedule/month: it avoids duplicates by checking an existing `expenses` row for the same `incurred_at` + `notes` marker `[recurring:<scheduleId>]`.
- The invoices job uses `upsert(..., { onConflict: 'lease_id,invoice_type,period_start', ignoreDuplicates: true })` so re-runs are safe.
