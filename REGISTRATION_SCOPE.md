# Registration Scope - What Tables Are Created During Registration

## Overview
During registration, we **ONLY** create data in **TWO** tables:
1. `auth.users` - User account (created by Supabase `signUp`)
2. `user_profiles` - User profile (created by database trigger)

**All other tables are created AFTER login** in subsequent forms/pages.

## Tables Created During Registration

### 1. `auth.users` Table
- **Created by**: Supabase `signUp` API
- **Contains**:
  - `id` (UUID)
  - `email` (string)
  - `encrypted_password` (string)
  - `raw_user_meta_data` (JSONB) - Contains:
    - `full_name` (string)
    - `phone` (string)
    - `role` (string: 'admin', 'manager', 'caretaker', 'tenant')
    - `organization_id` (string, optional) - Stored for later use
    - `building_id` (string, optional) - Stored for later use
  - `email_confirmed_at` (timestamp, after email verification)
  - `created_at` (timestamp)
  - `updated_at` (timestamp)

### 2. `user_profiles` Table
- **Created by**: Database trigger `on_auth_user_created`
- **Trigger function**: `handle_new_user()`
- **Contains**:
  - `id` (UUID) - References `auth.users.id`
  - `full_name` (text) - From `user_metadata.full_name`
  - `phone_number` (text) - From `user_metadata.phone`
  - `role` (text) - From `user_metadata.role`
  - `national_id` (text, NULL) - Can be updated later
  - `profile_picture_url` (text, NULL) - Can be updated later
  - `address` (text, NULL) - Can be updated later
  - `date_of_birth` (date, NULL) - Can be updated later
  - `created_at` (timestamp)
  - `updated_at` (timestamp)

## Tables NOT Created During Registration

The following tables are **NOT** touched during registration and are created **AFTER login**:

### 1. `organizations` Table
- **Created by**: Owners after login via organization setup form (`/dashboard/setup/organization`)
- **Contains**: Organization details (name, email, phone, location, registration_number, logo_url)

### 2. `organization_members` Table
- **Created by**: Proxy or signin API on first login (for managers/caretakers)
- **Contains**: User-organization relationship (user_id, organization_id, role, joined_at)

### 3. `apartment_buildings` Table
- **Created by**: Owners/managers after login via building creation form
- **Contains**: Building details (name, location, total_units, description, image_url)

### 4. `apartment_units` Table
- **Created by**: Owners/managers after login via unit creation form
- **Contains**: Unit details (unit_number, floor, bedrooms, bathrooms, size_sqft, status)

### 5. All Other Tables
- Created in subsequent forms/pages after login
- Examples: `leases`, `invoices`, `payments`, `maintenance_requests`, etc.

## Registration Flow

### Step 1: User Registration
1. User fills registration form
2. API calls `supabase.auth.signUp()` with user metadata
3. Supabase creates user account in `auth.users`
4. Database trigger `on_auth_user_created` fires
5. Trigger creates profile in `user_profiles` with role from metadata
6. Registration completes and redirects to login

### Step 2: Email Verification
1. User clicks email verification link
2. Email confirmed → User can log in

### Step 3: First Login
1. User logs in
2. Signin API gets role from `user_profiles`
3. Proxy checks if organization member exists
4. If missing, creates organization member (for managers/caretakers)
5. Redirects to dashboard

### Step 4: Organization Setup (Owners)
1. Owner logs in → Redirected to `/dashboard/setup/organization`
2. Owner fills organization form
3. API creates organization in `organizations` table
4. API creates organization member in `organization_members` table
5. Redirects to dashboard

### Step 5: Additional Setup (All Roles)
1. Users fill additional forms after login
2. Create buildings, units, leases, etc.
3. All data created in subsequent forms/pages

## Code Structure

### Registration (`lib/auth/register.ts`)
```typescript
// Only creates user account and profile (via trigger)
export async function registerUser(input: RegisterInput): Promise<RegisterResult> {
  // 1. Create user account in auth.users
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email: input.email,
    password: input.password,
    options: {
      data: {
        full_name: input.full_name,
        phone: input.phone,
        role: input.role,
        organization_id: input.organization_id, // Stored for later use
        building_id: input.building_id, // Stored for later use
      },
    },
  })
  
  // 2. Profile is created by database trigger automatically
  // Trigger creates profile with: id, full_name, phone_number, role
  
  // 3. Return success - registration complete
  return {
    success: true,
    message: 'User created successfully. Please check your email to verify your account.',
    data: {
      user_id: authData.user.id,
      email: input.email,
      role: input.role,
      profile_created: true, // Created by trigger
      organization_created: false, // Created after login
      organization_member_created: false, // Created after login
    },
  }
}
```

### Database Trigger (`sql/create-profile-trigger.sql`)
```sql
-- Trigger automatically creates user_profiles when user is created
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_profiles (id, full_name, phone_number, role, created_at, updated_at)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'phone', ''),
    COALESCE(NEW.raw_user_meta_data->>'role', NULL),
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO UPDATE
  SET 
    full_name = COALESCE(EXCLUDED.full_name, user_profiles.full_name),
    phone_number = COALESCE(EXCLUDED.phone_number, user_profiles.phone_number),
    role = COALESCE(EXCLUDED.role, user_profiles.role),
    updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();
```

## Benefits

1. **Fast Registration**: Only creates user account and profile (2-6 seconds)
2. **No Timeouts**: No blocking database operations during registration
3. **Reliable**: Profile is created by trigger automatically
4. **Simple**: Clear separation between registration and setup
5. **Flexible**: Users can complete setup after login at their own pace

## Summary

**During Registration:**
- ✅ Creates `auth.users` (user account)
- ✅ Creates `user_profiles` (user profile with role)

**After Login:**
- ✅ Creates `organizations` (by owners)
- ✅ Creates `organization_members` (by proxy/signin API)
- ✅ Creates all other tables (in subsequent forms)

This ensures registration is fast, reliable, and doesn't time out!

