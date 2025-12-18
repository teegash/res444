-- Add role column to user_profiles table
-- This simplifies login and makes role management more reliable

-- =============================================================================
-- 1. ADD ROLE COLUMN TO USER_PROFILES
-- =============================================================================

-- Add role column (nullable for existing users)
ALTER TABLE public.user_profiles 
ADD COLUMN IF NOT EXISTS role text;

-- Add check constraint to ensure role is one of the valid values
ALTER TABLE public.user_profiles
DROP CONSTRAINT IF EXISTS user_profiles_role_check;

ALTER TABLE public.user_profiles
ADD CONSTRAINT user_profiles_role_check 
CHECK (
  role IS NULL OR role = ANY (
    ARRAY['admin'::text, 'manager'::text, 'caretaker'::text, 'tenant'::text]
  )
);

-- Create index on role for faster queries
CREATE INDEX IF NOT EXISTS idx_user_profiles_role 
ON public.user_profiles(role);

-- =============================================================================
-- 2. UPDATE TRIGGER TO SET ROLE
-- =============================================================================

-- Update the trigger function to also set the role from metadata
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  v_org_id uuid;
BEGIN
  v_org_id := NULLIF(NEW.raw_user_meta_data->>'organization_id', '')::uuid;

  -- organization_id is NOT NULL on user_profiles in this schema.
  -- If org id is not provided at signup, do not create the profile here (avoid failing auth user creation).
  -- The app layer must create the profile once it knows the org.
  IF v_org_id IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.user_profiles (id, full_name, phone_number, role, organization_id, created_at, updated_at)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'phone', NEW.raw_user_meta_data->>'phone_number', ''),
    COALESCE(NEW.raw_user_meta_data->>'role', NULL),
    v_org_id,
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO UPDATE
  SET 
    full_name = COALESCE(EXCLUDED.full_name, user_profiles.full_name),
    phone_number = COALESCE(EXCLUDED.phone_number, user_profiles.phone_number),
    role = COALESCE(EXCLUDED.role, user_profiles.role),
    organization_id = COALESCE(user_profiles.organization_id, EXCLUDED.organization_id),
    updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- 3. UPDATE EXISTING PROFILES (Optional - backfill role from metadata)
-- =============================================================================

-- Update existing profiles with role from user metadata (if available)
-- This is a one-time update for existing users
UPDATE public.user_profiles up
SET role = (
  SELECT au.raw_user_meta_data->>'role'
  FROM auth.users au
  WHERE au.id = up.id
  AND au.raw_user_meta_data->>'role' IS NOT NULL
)
WHERE up.role IS NULL
AND EXISTS (
  SELECT 1
  FROM auth.users au
  WHERE au.id = up.id
  AND au.raw_user_meta_data->>'role' IS NOT NULL
);

-- =============================================================================
-- 4. GRANT PERMISSIONS (if needed)
-- =============================================================================

-- Ensure service_role can update role
GRANT UPDATE (role) ON public.user_profiles TO service_role;
GRANT UPDATE (role) ON public.user_profiles TO authenticated;

-- =============================================================================
-- VERIFICATION
-- =============================================================================

-- Verify role column exists
SELECT 
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
AND table_name = 'user_profiles'
AND column_name = 'role';

-- Verify check constraint exists
SELECT 
  constraint_name,
  constraint_type
FROM information_schema.table_constraints
WHERE table_schema = 'public'
AND table_name = 'user_profiles'
AND constraint_name = 'user_profiles_role_check';

-- Verify index exists
SELECT 
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
AND tablename = 'user_profiles'
AND indexname = 'idx_user_profiles_role';
