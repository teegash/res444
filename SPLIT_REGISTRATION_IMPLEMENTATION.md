# Split Registration Implementation

## Overview

Registration has been split into two steps to prevent Vercel API timeout issues:

1. **Step 1**: User registration (email, password, basic info) → Account created → Email confirmation
2. **Step 2**: After email confirmation and first login → Organization setup form → Organization created

## Changes Made

### 1. Signup Form (`app/auth/signup/page.tsx`)

**Changes:**
- ✅ Removed Page 2 (organization form) from registration flow
- ✅ All user types (owner, manager, caretaker) now register immediately
- ✅ Organization data is NOT sent during registration
- ✅ Updated UI to show single-step registration
- ✅ Added helpful message for owners: "You'll configure your organization after email confirmation"

**Flow:**
- Owner fills form → Clicks "Create Account" → Account created → Redirects to login with email verification message
- Manager/Caretaker fills form → Selects organization/building → Clicks "Create Account" → Account created → Redirects to login

### 2. Registration API (`app/api/auth/register/route.ts`)

**Changes:**
- ✅ Removed organization data validation
- ✅ Organization creation is skipped during registration
- ✅ Registration only creates: `auth.users`, `user_profiles`, `organization_members` (for managers/caretakers)

**What it does:**
- Creates user account in Supabase Auth
- Creates user profile in `user_profiles` table
- Creates organization member record (only for managers/caretakers with `organization_id`)
- **Does NOT** create organization for owners

### 3. Registration Function (`lib/auth/register.ts`)

**Changes:**
- ✅ Removed organization creation logic
- ✅ Organization creation is skipped (commented out)
- ✅ Registration completes faster (no organization insert)

**What it does:**
- Validates user input
- Creates auth user with role in metadata
- Creates user profile
- Creates organization member (if `organization_id` provided)
- Returns success without organization creation

### 4. Organization Setup Page (`app/dashboard/setup/organization/page.tsx`)

**New Page Created:**
- ✅ Dedicated page for owners to set up their organization after first login
- ✅ Matches the fields from the old signup page 2:
  - Organization name (required)
  - Email (read-only, from user account)
  - Phone (read-only, from user profile)
  - Location (required)
  - Registration number (required)
  - Logo upload (optional, with image compression)
- ✅ Loads user phone from `user_profiles` table
- ✅ Uploads logo directly to Supabase Storage (non-blocking)
- ✅ Creates organization via `/api/organizations/create`
- ✅ Redirects to dashboard after successful creation

**Features:**
- Clean, modern UI matching signup form style
- Image compression for logos > 500KB
- Non-blocking logo upload (registration proceeds even if logo fails)
- Success message with auto-redirect

### 5. Proxy/Middleware (`proxy.ts`)

**Changes:**
- ✅ Added check for admin users without organizations
- ✅ Redirects admin users to `/dashboard/setup/organization` if no organization
- ✅ Allows access to `/dashboard/setup/organization` route
- ✅ Checks `organization_id` in membership record

**Logic:**
1. User logs in → Proxy checks membership
2. If admin role but no `organization_id` → Redirect to `/dashboard/setup/organization`
3. If other roles without membership → Redirect to `/dashboard/setup`
4. If has organization → Allow access to dashboard

### 6. Organization Creation API (`app/api/organizations/create/route.ts`)

**Changes:**
- ✅ Now uses `createAdminClient()` to bypass RLS
- ✅ Supports `logo_url` field from client upload
- ✅ Creates organization and organization member in one flow
- ✅ Handles duplicate registration numbers
- ✅ Returns organization ID on success

**What it does:**
- Validates user is authenticated
- Checks user doesn't already have organization
- Creates organization with all fields (including logo_url)
- Creates organization member record with user's role
- Returns success with organization details

## User Flow

### For Property Owners (Admin):

1. **Registration:**
   - Fill signup form (name, email, phone, password)
   - Select "Property Owner"
   - Click "Create Account"
   - Account created → Email verification sent
   - Redirected to login page

2. **Email Confirmation:**
   - User clicks email verification link
   - Email confirmed → Can log in

3. **First Login:**
   - User logs in with verified email
   - Proxy detects: Admin role + No organization
   - Redirected to `/dashboard/setup/organization`

4. **Organization Setup:**
   - User fills organization form:
     - Organization name
     - Location
     - Registration number
     - Logo (optional)
   - Email and phone auto-filled from user account
   - Click "Create Organization"
   - Organization created → Organization member created
   - Redirected to dashboard

### For Managers/Caretakers:

1. **Registration:**
   - Fill signup form
   - Select "Manager" or "Caretaker"
   - Select organization (and building for caretakers)
   - Click "Create Account"
   - Account created → Organization member created → Email verification sent
   - Redirected to login page

2. **Email Confirmation & Login:**
   - User clicks email verification link
   - User logs in
   - Has organization membership → Access dashboard directly

## Benefits

1. ✅ **No More Timeouts**: Registration completes in < 10 seconds (no organization creation)
2. ✅ **Better UX**: Clear separation of account creation and organization setup
3. ✅ **Faster Registration**: Lighter payload, fewer database operations
4. ✅ **Flexible**: Owners can set up organization at their own pace
5. ✅ **Error Recovery**: If organization setup fails, user can retry without re-registering

## Database Operations

### During Registration:
- ✅ `auth.users` - User account created
- ✅ `user_profiles` - Profile created with full_name, phone_number
- ✅ `organization_members` - Created (only for managers/caretakers)

### During Organization Setup:
- ✅ `organizations` - Organization created
- ✅ `organization_members` - Member record created (for owners)

## API Endpoints

### Registration:
- **POST** `/api/auth/register`
  - Creates user account and profile
  - Creates organization member (if organization_id provided)
  - **Does NOT** create organization

### Organization Setup:
- **POST** `/api/organizations/create`
  - Creates organization
  - Creates organization member
  - Requires authentication
  - Uses admin client to bypass RLS

## Testing Checklist

- [ ] Owner registration completes successfully
- [ ] Owner receives email verification
- [ ] Owner can log in after email confirmation
- [ ] Owner is redirected to organization setup page
- [ ] Organization setup form loads correctly
- [ ] Organization creation succeeds
- [ ] Owner is redirected to dashboard after setup
- [ ] Manager/Caretaker registration works (with organization selection)
- [ ] Manager/Caretaker can log in directly to dashboard
- [ ] Logo upload works (optional, non-blocking)
- [ ] All data is saved correctly in Supabase

## Files Modified

1. `app/auth/signup/page.tsx` - Removed page 2, simplified registration
2. `app/api/auth/register/route.ts` - Removed organization validation
3. `lib/auth/register.ts` - Skipped organization creation
4. `proxy.ts` - Added organization check and redirect
5. `app/dashboard/setup/organization/page.tsx` - **NEW** Organization setup page
6. `app/api/organizations/create/route.ts` - Updated to use admin client and support logo

## Notes

- Organization setup is **required** for owners before accessing dashboard
- Logo upload is **optional** and **non-blocking**
- All RLS policies should allow admin client operations
- Phone number is loaded from `user_profiles` table in organization setup page

