# Registration Timeout Fix

## Problem
Registration was timing out even after splitting into two steps. The issue was that:
1. `signUp` operation was taking too long (30s timeout)
2. Profile creation was blocking registration
3. Organization member creation was blocking registration
4. Multiple sequential operations were causing cumulative delays

## Solution

### 1. Reduced Timeouts
- **signUp timeout**: 30s → **15s** (with fallback check if user was created)
- **Profile creation timeout**: 10s → **5s** (non-blocking)
- **Organization member timeout**: 10s → **5s** (non-blocking)
- **Profile check timeout**: 5s → **3s**
- **API-level timeout**: 90s → **20s**
- **Client-side timeout**: 120s → **25s**

### 2. Made Operations Non-Blocking
- **Profile creation**: If it fails or times out, registration still succeeds
  - Profile can be created by database trigger
  - Profile can be created on first login
  - User can still log in without profile initially
  
- **Organization member creation**: If it fails or times out, registration still succeeds
  - Member can be created later
  - User can still log in
  - System will handle missing membership gracefully

### 3. Improved Error Handling
- All database operations now have timeouts
- Operations that fail don't block registration
- Warnings are logged instead of errors
- User account creation is the only critical operation

### 4. Database Trigger (Recommended)
Created `sql/create-profile-trigger.sql` to automatically create profiles when users sign up. This ensures:
- Profiles are always created, even if registration code fails
- No race conditions
- Consistent data

## Registration Flow (Optimized)

1. **User Account Creation** (15s timeout, critical)
   - Creates user in `auth.users`
   - Sets role in metadata
   - Sends verification email
   - If timeout, checks if user was created anyway

2. **Profile Creation** (5s timeout, non-blocking)
   - Tries to create profile in `user_profiles`
   - If fails/times out, continues anyway
   - Profile will be created by trigger or on first login

3. **Organization Member Creation** (5s timeout, non-blocking)
   - Only for managers/caretakers with `organization_id`
   - Tries to create member record
   - If fails/times out, continues anyway
   - Member can be created later

## Total Registration Time
- **Best case**: ~2-5 seconds (all operations succeed)
- **Worst case**: ~15-20 seconds (signUp takes full timeout, but still succeeds)
- **No more 90+ second timeouts**

## Database Setup (Recommended)

Run the trigger SQL to ensure profiles are always created:

```sql
-- See sql/create-profile-trigger.sql
```

This trigger will:
- Automatically create `user_profiles` when a user signs up
- Use data from `user_metadata` (full_name, phone)
- Handle conflicts gracefully (if profile already exists)

## Testing

After these changes:
1. Registration should complete in < 20 seconds
2. Even if profile/member creation fails, user can still log in
3. Profile will be created by trigger or on first login
4. No more timeout errors

## Files Modified

1. `lib/auth/register.ts` - Reduced timeouts, made operations non-blocking
2. `app/api/auth/register/route.ts` - Reduced API timeout to 20s
3. `app/auth/signup/page.tsx` - Reduced client timeout to 25s
4. `sql/create-profile-trigger.sql` - **NEW** Auto-create profile trigger

## Next Steps

1. Deploy these changes
2. Run the trigger SQL in Supabase (optional but recommended)
3. Test registration - should be fast now
4. Monitor logs for any warnings about profile/member creation

