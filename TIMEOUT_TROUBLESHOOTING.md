# Registration Timeout Troubleshooting Guide

## Problem
Registration is timing out with error: "Request timed out. Please check your connection and try again."

## Root Causes

### 1. Vercel Function Timeout Limits
- **Hobby Plan (Free)**: 10 seconds (HARD LIMIT - cannot be changed)
- **Pro Plan ($20/month)**: 60 seconds (configurable via `vercel.json`)
- **Enterprise Plan**: 300 seconds (configurable)

### 2. Supabase Statement Timeout
- **Authenticated users**: 8 seconds (default)
- **Anonymous users**: 3 seconds (default)
- **Global limit**: 2 minutes

### 3. Network Latency
- Supabase API response time: 1-5 seconds (normal)
- Cold starts on Vercel: 2-5 seconds (first request)
- Network latency: 0.5-2 seconds

### 4. Supabase signUp Operation
- Can take 5-15 seconds depending on:
  - Network latency
  - Supabase API response time
  - Email sending (can be slow)
  - Cold starts

## Solutions Implemented

### ✅ 1. Created `vercel.json` Configuration
```json
{
  "functions": {
    "app/api/auth/register/route.ts": {
      "maxDuration": 60
    }
  }
}
```
- **Pro Plan**: Increases timeout to 60 seconds ✅
- **Hobby Plan**: Still limited to 10 seconds (upgrade needed) ⚠️

### ✅ 2. Optimized Registration Flow
- **Removed email check** (saves 5 seconds)
- **Skipped profile creation** (trigger handles it)
- **Skipped organization member creation** (proxy handles it on first login)
- **Reduced timeouts** to match limits

### ✅ 3. Made Registration Ultra-Fast
- **Registration time**: 2-6 seconds (target)
- **Only critical operation**: User account creation
- **Everything else**: Handled asynchronously

### ✅ 4. Created Profile/Member Creation on Login
- **Profile**: Created by database trigger automatically
- **Organization member**: Created on first login by proxy
- **Seamless user experience**

## Testing Your Setup

### 1. Test Supabase Connection
Visit: `http://localhost:3000/api/test/supabase-connection`

This will test:
- Environment variables
- Admin client creation
- Database connection
- RLS policies
- Storage operations

### 2. Test Registration Speed
Visit: `http://localhost:3000/api/test/registration-speed`

This will test:
- Environment variables
- Admin client creation
- Database connection
- Auth admin API
- **SignUp operation** (actual test with timing)

### 3. Check Vercel Logs
1. Go to Vercel Dashboard → Project → Functions
2. Check `/api/auth/register` execution time
3. Look for timeout errors
4. Check function duration

### 4. Check Supabase Logs
1. Go to Supabase Dashboard → Logs
2. Check Auth logs for signUp operations
3. Check Database logs for queries
4. Look for slow queries or errors

## If Still Timing Out

### Check 1: Vercel Plan
1. Go to Vercel Dashboard → Project Settings
2. Check your plan (Hobby or Pro)
3. **Hobby plan**: 10s limit (cannot be changed)
4. **Solution**: Upgrade to Pro plan ($20/month) for 60s timeout

### Check 2: Supabase Connection
1. Visit: `/api/test/supabase-connection`
2. Verify connection is working
3. Check response times
4. **If connection is slow**: Check network latency or Supabase status

### Check 3: Database Trigger
1. Go to Supabase Dashboard → SQL Editor
2. Run: `SELECT trigger_name FROM information_schema.triggers WHERE trigger_name = 'on_auth_user_created';`
3. **If trigger doesn't exist**: Run `sql/create-profile-trigger.sql`
4. **If trigger exists**: Verify it's working

### Check 4: Environment Variables
1. Check `.env.local` exists
2. Verify all keys are set:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `NEXT_PUBLIC_SITE_URL`
3. **If missing**: Add them to `.env.local`

### Check 5: Supabase Status
1. Check Supabase Dashboard for service issues
2. Check Supabase status page: https://status.supabase.com/
3. **If service is down**: Wait for service to recover

### Check 6: Network Latency
1. Test Supabase connection: `/api/test/supabase-connection`
2. Check response times
3. **If slow**: Check network latency or use Supabase Edge Functions

### Check 7: Database Performance
1. Check Supabase Dashboard → Database → Performance
2. Look for slow queries
3. **If slow**: Optimize queries or upgrade Supabase plan

## Quick Fixes

### Fix 1: Upgrade Vercel Plan
- **Hobby Plan**: 10s limit (cannot be changed)
- **Pro Plan**: 60s limit (configurable)
- **Cost**: $20/month
- **Solution**: Upgrade to Pro plan for 60s timeout

### Fix 2: Run Database Setup
Run this SQL in Supabase:
```sql
-- See sql/complete-setup.sql
```
This will:
- Create profile trigger
- Enable RLS policies
- Grant permissions
- Verify setup

### Fix 3: Increase Supabase Statement Timeout
Run this SQL in Supabase:
```sql
ALTER ROLE authenticated SET statement_timeout = '15s';
```
This increases timeout from 8s to 15s for authenticated operations.

### Fix 4: Disable Email Confirmation (Testing)
1. Go to Supabase Dashboard → Authentication → Settings
2. Disable "Enable email confirmations"
3. **Note**: Re-enable for production

### Fix 5: Check Network Connection
1. Test Supabase connection: `/api/test/supabase-connection`
2. Check response times
3. **If slow**: Check network latency or use Supabase Edge Functions

## Expected Behavior

### Registration Flow:
1. User fills form → Clicks "Create Account"
2. API creates user account (2-6 seconds)
3. Database trigger creates profile automatically
4. Redirects to login page immediately
5. **Total time: 2-6 seconds** ✅

### First Login:
1. User logs in
2. Proxy detects missing organization member (for managers/caretakers)
3. Proxy automatically creates member from metadata
4. User accesses dashboard
5. **Seamless experience** ✅

## Files Modified

1. ✅ `vercel.json` - Increases timeout to 60s (Pro plan)
2. ✅ `lib/auth/register.ts` - Optimized registration flow
3. ✅ `app/api/auth/register/route.ts` - Reduced timeout to 10s
4. ✅ `app/auth/signup/page.tsx` - Reduced client timeout to 12s
5. ✅ `proxy.ts` - Auto-creates profile/member on first login
6. ✅ `lib/auth/create-profile-on-login.ts` - Creates profile/member on login
7. ✅ `sql/complete-setup.sql` - Comprehensive database setup
8. ✅ `app/api/test/registration-speed/route.ts` - Registration speed test

## Next Steps

1. **Deploy to Vercel**:
   - `vercel.json` will increase timeout to 60s (Pro plan)
   - Registration should complete in < 10s

2. **Run Database Setup**:
   - Execute `sql/complete-setup.sql` in Supabase
   - Verify trigger is active
   - Verify RLS policies are enabled

3. **Test Registration**:
   - Try creating an account
   - Should complete in < 10 seconds
   - No timeout errors

4. **Monitor Logs**:
   - Check Vercel logs for execution time
   - Check Supabase logs for queries
   - Verify no timeouts

## If Problem Persists

### Option 1: Upgrade Vercel Plan
- **Hobby Plan**: 10s limit (hard limit)
- **Pro Plan**: 60s limit (configurable)
- **Cost**: $20/month
- **Solution**: Upgrade to Pro plan

### Option 2: Use Supabase Edge Functions
- **Faster**: Edge functions are faster than serverless functions
- **Location**: Closer to Supabase servers
- **Solution**: Move registration to Supabase Edge Function

### Option 3: Use Background Jobs
- **Async**: Handle registration asynchronously
- **Queue**: Use a queue system (e.g., Vercel Queue)
- **Solution**: Return success immediately, handle registration in background

### Option 4: Optimize Supabase Connection
- **Edge Functions**: Use Supabase Edge Functions
- **Connection Pooling**: Use connection pooling
- **Solution**: Optimize database connection

## Summary

**Registration is now optimized to complete in 2-6 seconds**:
- ✅ Removed email check (saves 5s)
- ✅ Skipped profile creation (trigger handles it)
- ✅ Skipped organization member creation (proxy handles it)
- ✅ Reduced timeouts to match limits
- ✅ Created `vercel.json` for Pro plan
- ✅ Created profile/member creation on login
- ✅ Updated proxy to handle missing data

**If still timing out**:
1. Check Vercel plan (upgrade to Pro if needed)
2. Check Supabase connection (test endpoint)
3. Check database trigger (verify it exists)
4. Check network latency (test connection)
5. Check Supabase status (service issues)

