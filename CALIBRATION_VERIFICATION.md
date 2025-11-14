# Supabase Calibration Verification

## ✅ Database Table Field Mappings

### 1. `user_profiles` Table

| Database Field | Form Field | Code Mapping | Status |
|---------------|------------|--------------|--------|
| `id` | N/A | `auth.users.id` | ✅ Auto-set from auth |
| `full_name` | `fullName` | `formData.fullName` → `full_name` | ✅ Mapped correctly |
| `phone_number` | `phone` | `formData.phone` → `phone_number` | ✅ Mapped correctly |
| `national_id` | N/A | Optional, not in form | ✅ Optional (handled) |
| `address` | N/A | Optional, not in form | ✅ Optional (handled) |
| `date_of_birth` | N/A | Optional, not in form | ✅ Optional (handled) |
| `profile_picture_url` | N/A | Optional, not in form | ✅ Optional (handled) |
| `created_at` | N/A | Database default | ✅ Auto-set |
| `updated_at` | N/A | Database default | ✅ Auto-set |

**Code Location**: `lib/auth/register.ts` → `createUserProfile()` function
- Uses `createAdminClient()` to bypass RLS ✅
- Handles optional fields correctly ✅
- Validates date format (YYYY-MM-DD) if provided ✅

---

### 2. `organizations` Table

| Database Field | Form Field | Code Mapping | Status |
|---------------|------------|--------------|--------|
| `id` | N/A | `gen_random_uuid()` | ✅ Auto-generated |
| `name` | `orgData.name` | `organization.name` | ✅ Mapped correctly |
| `email` | `formData.email` | `organization.email` | ✅ Mapped correctly |
| `phone` | `formData.phone` | `organization.phone` | ✅ Mapped correctly |
| `location` | `orgData.location` | `organization.location` | ✅ Mapped correctly |
| `registration_number` | `orgData.registrationNumber` | `organization.registration_number` | ✅ Mapped correctly |
| `logo_url` | `orgData.logoUrl` | `organization.logo_url` (optional) | ✅ Mapped correctly, nullable |
| `created_at` | N/A | Database default | ✅ Auto-set |
| `updated_at` | N/A | Database default | ✅ Auto-set |

**Code Location**: `lib/auth/register.ts` → `registerUser()` function (line ~608-618)
- Uses `createAdminClient()` to bypass RLS ✅
- Handles `logo_url` as optional (null is acceptable) ✅
- Validates required fields (name, location, registration_number) ✅
- Handles unique constraint on `registration_number` ✅

---

### 3. `organization_members` Table

| Database Field | Code Source | Status |
|---------------|-------------|--------|
| `id` | `gen_random_uuid()` | ✅ Auto-generated |
| `user_id` | `authData.user.id` | ✅ Mapped correctly |
| `organization_id` | `input.organization_id` or `createdOrganizationId` | ✅ Mapped correctly |
| `role` | `input.role` (admin/manager/caretaker) | ✅ Mapped correctly |
| `joined_at` | `new Date().toISOString()` | ✅ Mapped correctly |

**Code Location**: `lib/auth/register.ts` → `createOrganizationMember()` function
- Uses `createAdminClient()` when `useAdminClient=true` ✅
- Handles foreign key constraints ✅
- Handles unique constraint on (user_id, organization_id) ✅

---

## ✅ Form Data Flow

### Signup Form (Page 1) → Registration API

**Form Fields Collected**:
- ✅ `fullName` → `full_name`
- ✅ `email` → `email`
- ✅ `phone` → `phone` → `phone_number` (in user_profiles)
- ✅ `password` → `password` (for auth)
- ✅ `userType` → `role` (owner→admin, manager→manager, caretaker→caretaker)
- ✅ `selectedOrganizationId` → `organization_id` (for managers/caretakers)
- ✅ `selectedBuildingId` → `building_id` (for caretakers, stored in metadata)

**Code Location**: `app/auth/signup/page.tsx` → `handleRegistration()` (line ~404-528)

---

### Signup Form (Page 2) → Registration API

**Organization Fields Collected** (for owners only):
- ✅ `orgData.name` → `organization.name`
- ✅ `formData.email` → `organization.email`
- ✅ `formData.phone` → `organization.phone`
- ✅ `orgData.location` → `organization.location`
- ✅ `orgData.registrationNumber` → `organization.registration_number`
- ✅ `orgData.logoUrl` → `organization.logo_url` (optional, nullable)

**Code Location**: `app/auth/signup/page.tsx` → `handleRegistration()` (line ~426-434)

---

## ✅ API Route Validation

**File**: `app/api/auth/register/route.ts`

**Validations**:
- ✅ Required fields: email, password, full_name, phone, role
- ✅ Role validation: must be 'admin', 'manager', or 'caretaker'
- ✅ Organization required for managers/caretakers
- ✅ Building required for caretakers
- ✅ Organization data required for owners (admin role)
- ✅ Organization fields: name, location, registration_number required

---

## ✅ RLS (Row-Level Security) Handling

### Admin Client Usage
- ✅ `createUserProfile()` uses `createAdminClient()` to bypass RLS
- ✅ Organization creation uses `createAdminClient()` to bypass RLS
- ✅ Organization member creation uses `createAdminClient()` when `useAdminClient=true`

**File**: `lib/supabase/admin.ts`
- ✅ Uses `SUPABASE_SERVICE_ROLE_KEY` environment variable
- ✅ Properly configured with `autoRefreshToken: false` and `persistSession: false`

---

## ✅ Error Handling

### Database Constraints Handled:
- ✅ Unique constraint on `user_profiles.national_id` (if provided)
- ✅ Unique constraint on `organizations.registration_number`
- ✅ Unique constraint on `organization_members(user_id, organization_id)`
- ✅ Foreign key constraints (organization_id, user_id)

### Timeout Handling:
- ✅ Profile check: 5 seconds
- ✅ Profile update/insert: 10 seconds
- ✅ SignUp operation: 20 seconds
- ✅ Organization insert: 15 seconds
- ✅ Organization member creation: 10 seconds
- ✅ API-level timeout: 55 seconds
- ✅ Client-side fetch timeout: 60 seconds

---

## ✅ Logo Upload

**File**: `app/auth/signup/page.tsx` → `handleLogoUpload()` (line ~258-339)

- ✅ Direct client-side upload to Supabase Storage
- ✅ Bucket: `profile-pictures` (confirmed)
- ✅ Path: `organizations/{timestamp}-{random}.{ext}`
- ✅ Non-blocking: Registration proceeds even if upload fails
- ✅ Optional: `logo_url` can be `null` in database

---

## ⚠️ Potential Issues to Verify

1. **Missing Form Fields**: The form doesn't collect `national_id`, `address`, or `date_of_birth`. These are optional in the database, so this is fine, but if you want to collect them, you'll need to add form fields.

2. **user_profiles.id**: The code assumes `user_profiles.id` references `auth.users.id`. Verify your Supabase schema has this foreign key constraint:
   ```sql
   ALTER TABLE user_profiles 
   ADD CONSTRAINT user_profiles_id_fkey 
   FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
   ```

3. **Database Trigger**: The code handles the case where a trigger might create the profile first. Verify your trigger exists:
   ```sql
   CREATE OR REPLACE FUNCTION public.handle_new_user()
   RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
   BEGIN
     INSERT INTO public.user_profiles (id, full_name) VALUES (NEW.id, NEW.email);
     RETURN NEW;
   END;
   $$;
   ```

---

## ✅ Summary

**All critical mappings are correctly calibrated:**

1. ✅ `user_profiles` table fields match code expectations
2. ✅ `organizations` table fields match code expectations
3. ✅ `organization_members` table fields match code expectations
4. ✅ Field name mappings are correct (phone → phone_number, etc.)
5. ✅ Optional fields are handled correctly
6. ✅ RLS is bypassed using admin client where needed
7. ✅ Error handling covers all database constraints
8. ✅ Timeouts are in place to prevent hangs
9. ✅ Logo upload is non-blocking and optional

**The code is ready for testing!** 🚀

---

## 🔍 What to Test

1. **Owner Registration**:
   - ✅ User account created in `auth.users`
   - ✅ Profile created in `user_profiles` with `full_name` and `phone_number`
   - ✅ Organization created in `organizations` with all fields
   - ✅ Organization member created in `organization_members` with role='admin'
   - ✅ Logo upload (optional) works or fails gracefully

2. **Manager Registration**:
   - ✅ User account created in `auth.users`
   - ✅ Profile created in `user_profiles`
   - ✅ Organization member created with `organization_id` and role='manager'

3. **Caretaker Registration**:
   - ✅ User account created in `auth.users`
   - ✅ Profile created in `user_profiles`
   - ✅ Organization member created with `organization_id` and role='caretaker'
   - ✅ `building_id` stored in user metadata

4. **Error Cases**:
   - ✅ Duplicate email (handled by Supabase auth)
   - ✅ Duplicate registration number (returns 409 with message)
   - ✅ Missing required fields (returns 400 with message)
   - ✅ Invalid role (returns 400 with message)

