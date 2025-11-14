# Role in user_profiles Implementation

## Overview
Added `role` column to `user_profiles` table to simplify login and make role management more reliable.

## Changes Made

### 1. Database Migration (`sql/add-role-to-user-profiles.sql`)
- ✅ Added `role` column to `user_profiles` table
- ✅ Added check constraint to ensure role is one of: `admin`, `manager`, `caretaker`, `tenant`
- ✅ Created index on `role` column for faster queries
- ✅ Updated trigger to set role from user metadata
- ✅ Backfilled existing profiles with role from user metadata

### 2. Updated Trigger (`sql/create-profile-trigger.sql`)
- ✅ Trigger now sets `role` from `user_metadata.role` when creating profile
- ✅ Trigger updates role if it's missing in existing profile

### 3. Updated Complete Setup (`sql/complete-setup.sql`)
- ✅ Includes role column addition
- ✅ Includes updated trigger function

### 4. Updated Registration (`lib/auth/register.ts`)
- ✅ `createUserProfile` now accepts `role` parameter
- ✅ Profile creation sets role if provided
- ✅ Profile is created by trigger (with role), so we don't need to manually create it

### 5. Updated Signin API (`app/api/auth/signin/route.ts`)
- ✅ **Simplified**: Gets role directly from `user_profiles` instead of `organization_members`
- ✅ Updates role in profile if missing (from metadata)
- ✅ Creates profile with role if it doesn't exist
- ✅ Much simpler and more reliable!

### 6. Updated Proxy (`proxy.ts`)
- ✅ **Simplified**: Gets role directly from `user_profiles` instead of `organization_members`
- ✅ Updates role in profile if missing
- ✅ Creates profile with role if it doesn't exist
- ✅ Still checks `organization_members` for organization_id (for admins)

### 7. Updated Create Profile on Login (`lib/auth/create-profile-on-login.ts`)
- ✅ Creates/updates profile with role
- ✅ Updates role if missing in existing profile
- ✅ Handles role in all profile operations

## Benefits

1. **Simpler Login Flow**:
   - Role is in `user_profiles` (always exists)
   - No need to check `organization_members` for role
   - No need to create organization member just to get role

2. **More Reliable**:
   - Role is set by database trigger automatically
   - Role is always available in profile
   - No dependency on organization_members for role

3. **Better Performance**:
   - Single query to get role from `user_profiles`
   - No need to join with `organization_members`
   - Faster login checks

4. **Easier Management**:
   - Role is in one place (`user_profiles`)
   - Easier to query and update
   - Clear separation: role in profile, organization membership in `organization_members`

## Database Schema

```sql
ALTER TABLE public.user_profiles 
ADD COLUMN role text;

ALTER TABLE public.user_profiles
ADD CONSTRAINT user_profiles_role_check 
CHECK (
  role IS NULL OR role = ANY (
    ARRAY['admin'::text, 'manager'::text, 'caretaker'::text, 'tenant'::text]
  )
);

CREATE INDEX idx_user_profiles_role 
ON public.user_profiles(role);
```

## Migration Steps

1. **Run Migration**:
   ```sql
   -- See sql/add-role-to-user-profiles.sql
   ```

2. **Verify**:
   ```sql
   SELECT column_name, data_type 
   FROM information_schema.columns
   WHERE table_name = 'user_profiles' 
   AND column_name = 'role';
   ```

3. **Test**:
   - Register a new user
   - Check that profile has role set
   - Login and verify role is retrieved from profile

## Expected Results

- ✅ Role is set in `user_profiles` by database trigger
- ✅ Login gets role from `user_profiles` (single query)
- ✅ No need to check `organization_members` for role
- ✅ Faster and more reliable login
- ✅ Admins can login without organization (role in profile)
- ✅ Managers/Caretakers can login (role in profile)

## Notes

- **Role vs Organization Membership**:
  - Role is in `user_profiles` (user's role: admin, manager, caretaker, tenant)
  - Organization membership is in `organization_members` (which organization user belongs to)
  - Admins might not have organization membership until they set up their organization
  - Managers/Caretakers must have organization membership

- **Backward Compatibility**:
  - Existing profiles will have role set from user metadata (one-time backfill)
  - New profiles will have role set by trigger automatically
  - Code falls back to user metadata if role is missing in profile

## Files Modified

1. ✅ `sql/add-role-to-user-profiles.sql` - **NEW** - Migration to add role column
2. ✅ `sql/create-profile-trigger.sql` - Updated trigger to set role
3. ✅ `sql/complete-setup.sql` - Updated complete setup with role
4. ✅ `lib/auth/register.ts` - Updated to accept role parameter
5. ✅ `app/api/auth/signin/route.ts` - Simplified to get role from profile
6. ✅ `proxy.ts` - Simplified to get role from profile
7. ✅ `lib/auth/create-profile-on-login.ts` - Updated to set role in profile

