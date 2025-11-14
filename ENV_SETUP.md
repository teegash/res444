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

