debuggers - always confirm relevant ID presense
consider table structure
research on perplexity, has the most information


to do ; 

Tenant search bar ///
Lease page and export feature /// need to change the pdf doc view
Tenant edit ///
Waterbill form to send text via africas talking/// Done
Tenant pay waterbill in the tenants dashboard ///
waterbiil page when clicked sends message as an invoice ; (DONE ///

maintenance page live data integration 
tenant maintenance request
make sure history of requests are seen at the bottom of maintenance request form
lease download in tenant check
lease autorenew toggle
lease download

payment intergration, mpesa intergration
daraja in nategadgets
payments page and tenants column update after payment
=also should update upon successful verification of bank slip - impliment this consider wiring the “Recheck” / “Review slip” actions in pending-verification-tab so managers can trigger verification without leaving the page.=
also should auto update upon successful payment through using peyment gateway for visacards
autoupdate several months payments
this should stop rent payment reminders and only send invoice for water


In tenant dashboard, the pay rent button, make sure it goes to payment page but shows the rent amount, not the latest invoice, this will then be updated in payments showing the tenant has done a prepayment if its early and update the payment status to add a month or 2 before sending an invoice or rent reminder

(Pending) Hook up manager notification clicks to open the maintenance page pre-focused on the relevant request; we can wire that next by checking the related_entity_type when handling clicks in components/dashboard/header.tsx.


Skip payments, will work on it later
Later will work on Africas talking short code/ sender ID
tenant delete should be implimented well and actually delete the tenant from the system



make sure there no Rls conflicts when trying to login, here are table definitions


the system should spin up a pending lease automatically after tenant signs up, this lease should be editable before forwarding to tenant for esign confirmation which then will be added to the documents in the tenant dashboard under lease documents,


impliment lease soon, which will be read and update the data of the tenant

use payments table to determine payment status

The message dialog in tenant action, send message, when clicked the dialog has a message box which can send message directly to tenant, we need to implimet this message feature which will be using communications table, it will act like live chat communication, be keen and thorough when implimenting this, the mesage should be sent to tenant dashboard in message as well, and this should show notification in the bell icon at the top right in header


++++Yes, it’s very doable, and Supabase gives you a few solid approaches:

1. Use a Supabase Edge Function or background script with CSV parsing

Upload the CSV (via a dashboard admin UI or CLI) and send it to an Edge Function.
The function can parse rows (e.g., with Papa Parse), do validation, and for each tenant:
Create the Supabase Auth user with email and the generated password (${firstName}Pass@123).
Insert/update the user_profiles row.
Optionally link to units/leases if the CSV includes unit IDs.
Trigger the existing credential email helper.
Advantages: All in one pipeline; you control validation, logging, retry logic.
2. Use Supabase’s table import + a trigger/cron job

Import the CSV directly into a staging table.
Run a scheduled job (Supabase cron) or trigger that processes any “pending” rows:
Generate passwords, call the Auth Admin API, populate user_profiles, mark rows processed.
Send the credential emails post-success.
Keeps bulk data operations inside the database, but you must carefully guard the trigger to avoid partial inserts.
3. External script (Next.js API route or server script)

Build a page where you upload the CSV; the server route reads it, loops rows, and uses supabase.auth.admin.createUser for each.
Reuse the password-generation logic and email helper you already have.
Key considerations

Rate limits: Supabase Auth admin calls can handle reasonable bulk (hundreds) but add exponential backoff or chunk batches.
Validation: Catch duplicates (existing emails, national IDs) before calling createUser.
Email sending: call your Gmail SMTP helper right after each user is created; if you want them “at a go,” queue them and send after the bulk insert completes.
Error handling: log failures per row so you can rerun only the failed ones.
So yes, importing from CSV/Excel and automatically provisioning tenants with emails/passwords is very feasible. I recommend either the Edge Function or external script approach so you have full control over validation and can use your existing password template + email flow. Let me know if you want me to scaffold the function or upload interface.+++++




///okay, i have set up the above, its well implimented - its working, great, now make sure that this isnt messed up, its working well

Set the lease to auto renew after the expiry. This should give automaticaaly send a reminder message exactly  3 months before expiry, then 2 months before expiry, then 1 month before expiry as well.

If the tenant clicks auto renew or does nothing it will auto renew upon expiry, if the client decides to give 1 month notice from the tenant dashboard, the lease should change from active to Notice which will then be inactive after 1 month of date the notice has been given and at that time the tenant will have moved out and the specific unit should read vacant.

also if there are any changes in lease agreement like rent increase, the lease has to be digitally signed again so as to confirm tenant consent.///


++++++The right foundation: invoices are first-class rows, the water-bill flow logs them, and tenants see those invoices + notifications. When you add Mpesa/Daraja, the remaining pieces are:

Payment initiation endpoint (already mostly scaffolded): trigger an STK push with the invoice id attached.
Mpesa callback/auto-verify (you already have lib/mpesa/autoVerify.ts and the mark-paid endpoint): when a receipt comes back, look up the invoice, flip status to true, and stamp payment_date.
Realtime UI update: subscribe tenants to invoice changes (similar to current communications channel) so the payment page and dashboard flip to “true” instantly.
That’s the standard pattern: invoice → payment attempt → callback → mark paid → UI sees status=true. You’re on the right track; focus next on wiring the STK push + callback into those existing invoice update helpers so everything stays in sync automatically.

{When you later hook up Mpesa/Daraja, just call updateInvoiceStatus(invoiceId) (it already recalculates and writes status: true once the payments table shows the invoice fully covered).+++++++

# Environment Variables Setup Guide

## Quick Start

1. **Copy the template:**
   ```bash
   cp .env.example .env.local
   ```

2. **Fill in your credentials:**
   - Replace all `[your-project]`, `your_*`, and placeholder values
   - Get credentials from respective service dashboards

3. **Verify setup:**
   - Check that all REQUIRED variables are set
   - Ensure no duplicate entries
   - Test the application

## Current vs Optimized Configuration

### Issues Found in Current `.env.local`:

1. ❌ **Duplicate M-Pesa configuration** - Appears twice
2. ❌ **Inconsistent variable naming** - Mix of NEXT_PUBLIC_SITE_URL and NEXT_PUBLIC_APP_URL
3. ❌ **Missing optional but useful variables** - MPESA_INITIATOR_NAME, etc.
4. ❌ **Unused variable** - MPESA_QUERY_INTERVAL (not used in code)
5. ❌ **Poor organization** - Variables not grouped logically
6. ❌ **Missing comments** - No explanation of what each variable does

### Optimized Configuration Benefits:

1. ✅ **No duplicates** - Each variable appears once
2. ✅ **Consistent naming** - Uses NEXT_PUBLIC_SITE_URL (as code expects)
3. ✅ **Complete variable set** - All required + useful optional variables
4. ✅ **Well organized** - Grouped by service/functionality
5. ✅ **Comprehensive comments** - Explains each variable
6. ✅ **Production checklist** - Deployment guide included
7. ✅ **Usage summary** - Clear indication of required vs optional

## Variable Comparison

### Required Variables (Must Have):

| Variable | Current | Optimized | Status |
|----------|---------|-----------|--------|
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | ✅ | Keep |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | ✅ | Keep |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | ✅ | Keep |
| `NEXT_PUBLIC_SITE_URL` | ✅ | ✅ | Keep (standardized) |
| `MPESA_CONSUMER_KEY` | ✅ | ✅ | Keep |
| `MPESA_CONSUMER_SECRET` | ✅ | ✅ | Keep |
| `MPESA_PASSKEY` | ✅ | ✅ | Keep |
| `AFRICAS_TALKING_API_KEY` | ✅ | ✅ | Keep |
| `AFRICAS_TALKING_USERNAME` | ✅ | ✅ | Keep |
| `CRON_SECRET` | ✅ | ✅ | Keep |

### Optional but Recommended:

| Variable | Current | Optimized | Action |
|----------|---------|-----------|--------|
| `MPESA_SHORTCODE` | ✅ | ✅ | Keep (has default) |
| `MPESA_CALLBACK_URL` | ✅ | ✅ | Keep (has default) |
| `MPESA_ENVIRONMENT` | ✅ | ✅ | Keep (has default) |
| `MPESA_INITIATOR_NAME` | ✅ | ✅ | Keep (has default) |
| `MPESA_SECURITY_CREDENTIAL` | ✅ | ✅ | Keep (production only) |
| `MPESA_MAX_RETRIES` | ✅ | ✅ | Keep (has default) |
| `MPESA_AUTO_VERIFY_ENABLED` | ✅ | ✅ | Keep (has default) |
| `AFRICAS_TALKING_SENDER_ID` | ✅ | ✅ | Keep |
| `AFRICAS_TALKING_ENVIRONMENT` | ✅ | ✅ | Keep (has default) |
| `NODE_ENV` | ❌ | ✅ | **Add** |
| `SYSTEM_USER_ID` | ❌ | ✅ | **Add** (optional) |

### Removed Variables:

| Variable | Reason |
|----------|--------|
| `MPESA_QUERY_INTERVAL` | Not used in codebase |
| `NEXT_PUBLIC_APP_URL` | Code uses NEXT_PUBLIC_SITE_URL instead |

## Migration Steps

1. **Backup current `.env.local`:**
   ```bash
   cp .env.local .env.local.backup
   ```

2. **Copy optimized template:**
   ```bash
   cp .env.example .env.local
   ```

3. **Copy your existing values:**
   - Copy all your actual credentials from `.env.local.backup`
   - Paste into new `.env.local` in the correct sections
   - Remove duplicates

4. **Add missing variables:**
   - Set `NODE_ENV=development` (or `production`)
   - Optionally set `SYSTEM_USER_ID` if needed

5. **Verify:**
   - Check all required variables are filled
   - Test application startup
   - Test M-Pesa integration
   - Test SMS integration

## Production Checklist

Before deploying to production:

- [ ] Update `NEXT_PUBLIC_SITE_URL` to production domain (HTTPS)
- [ ] Set `NODE_ENV=production`
- [ ] Update `MPESA_ENVIRONMENT=production`
- [ ] Update `MPESA_SHORTCODE` to production shortcode
- [ ] Set `MPESA_SECURITY_CREDENTIAL` (RSA encrypted)
- [ ] Update `MPESA_CALLBACK_URL` to production URL (HTTPS)
- [ ] Update `MPESA_INITIATOR_NAME` to production initiator
- [ ] Set `AFRICAS_TALKING_ENVIRONMENT=production`
- [ ] Set `AFRICAS_TALKING_SENDER_ID` (required for production)
- [ ] Use strong `CRON_SECRET` (32+ characters)
- [ ] Verify all URLs use HTTPS
- [ ] Ensure `.env.local` is in `.gitignore`

## Security Notes

1. **Never commit `.env.local`** - It contains sensitive credentials
2. **Use different secrets for dev/prod** - Never reuse production secrets
3. **Rotate secrets regularly** - Especially CRON_SECRET
4. **Limit access** - Only developers who need it should have access
5. **Use environment-specific files** - `.env.development`, `.env.production`

## Troubleshooting

### "Variable not found" errors:
- Check variable name spelling (case-sensitive)
- Ensure variable is in `.env.local` (not `.env.example`)
- Restart development server after changes

### M-Pesa not working:
- Verify `MPESA_ENVIRONMENT` matches your credentials
- Check `MPESA_CALLBACK_URL` is accessible
- Ensure `MPESA_SHORTCODE` matches environment

### SMS not sending:
- Verify `AFRICAS_TALKING_API_KEY` and `USERNAME` are correct
- Check `AFRICAS_TALKING_ENVIRONMENT` matches credentials
- Ensure account has sufficient balance

### Cron jobs failing:
- Verify `CRON_SECRET` is set and matches in cron service
- Check cron service can reach your endpoints
- Verify endpoints are accessible (not behind auth)

