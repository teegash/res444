-- Complete Supabase Setup for Registration
-- Run this in Supabase SQL Editor to ensure everything is configured correctly

-- =============================================================================
-- 1. CREATE PROFILE TRIGGER (REQUIRED)
-- =============================================================================
-- This automatically creates user_profiles when a new user signs up
-- This ensures profiles are always created, even if registration code fails

-- Add role column to user_profiles if it doesn't exist
ALTER TABLE public.user_profiles 
ADD COLUMN IF NOT EXISTS role text;

-- Add check constraint for role
ALTER TABLE public.user_profiles
DROP CONSTRAINT IF EXISTS user_profiles_role_check;

ALTER TABLE public.user_profiles
ADD CONSTRAINT user_profiles_role_check 
CHECK (
  role IS NULL OR role = ANY (
    ARRAY['admin'::text, 'manager'::text, 'caretaker'::text, 'tenant'::text]
  )
);

-- Create index on role
CREATE INDEX IF NOT EXISTS idx_user_profiles_role 
ON public.user_profiles(role);

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

-- Create the trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- =============================================================================
-- 2. ENABLE RLS ON USER_PROFILES (REQUIRED)
-- =============================================================================

ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

-- Policy: Users can read their own profile
DROP POLICY IF EXISTS "Users can read own profile" ON public.user_profiles;
CREATE POLICY "Users can read own profile"
  ON public.user_profiles
  FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

-- Policy: Service role can do everything (for admin client)
DROP POLICY IF EXISTS "Service role full access" ON public.user_profiles;
CREATE POLICY "Service role full access"
  ON public.user_profiles
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Policy: Users can update their own profile
DROP POLICY IF EXISTS "Users can update own profile" ON public.user_profiles;
CREATE POLICY "Users can update own profile"
  ON public.user_profiles
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- =============================================================================
-- 3. ENABLE RLS ON ORGANIZATIONS (REQUIRED)
-- =============================================================================

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

-- Policy: Service role can do everything (for admin client)
DROP POLICY IF EXISTS "Service role full access" ON public.organizations;
CREATE POLICY "Service role full access"
  ON public.organizations
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Policy: Authenticated users can read organizations they're members of
DROP POLICY IF EXISTS "Members can read organization" ON public.organizations;
CREATE POLICY "Members can read organization"
  ON public.organizations
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members
      WHERE organization_id = organizations.id
      AND user_id = auth.uid()
    )
  );

-- =============================================================================
-- 4. ENABLE RLS ON ORGANIZATION_MEMBERS (REQUIRED)
-- =============================================================================

ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;

-- Policy: Service role can do everything (for admin client)
DROP POLICY IF EXISTS "Service role full access" ON public.organization_members;
CREATE POLICY "Service role full access"
  ON public.organization_members
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Policy: Users can read their own membership
DROP POLICY IF EXISTS "Users can read own membership" ON public.organization_members;
CREATE POLICY "Users can read own membership"
  ON public.organization_members
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Policy: Users can read memberships in their organization
DROP POLICY IF EXISTS "Members can read organization members" ON public.organization_members;
CREATE POLICY "Members can read organization members"
  ON public.organization_members
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = organization_members.organization_id
      AND om.user_id = auth.uid()
    )
  );

-- =============================================================================
-- 5. VERIFY FOREIGN KEY CONSTRAINT (OPTIONAL - if not exists)
-- =============================================================================

-- Check if constraint exists
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE table_name = 'user_profiles' 
    AND constraint_name = 'user_profiles_id_fkey'
  ) THEN
    ALTER TABLE public.user_profiles 
    ADD CONSTRAINT user_profiles_id_fkey 
    FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
    
    RAISE NOTICE 'Constraint user_profiles_id_fkey created';
  ELSE
    RAISE NOTICE 'Constraint user_profiles_id_fkey already exists';
  END IF;
END $$;

-- =============================================================================
-- 6. GRANT PERMISSIONS (REQUIRED)
-- =============================================================================

-- Grant permissions to service_role (for admin client)
GRANT ALL ON public.user_profiles TO service_role;
GRANT ALL ON public.organizations TO service_role;
GRANT ALL ON public.organization_members TO service_role;

-- Grant permissions to authenticated users
GRANT SELECT, INSERT, UPDATE ON public.user_profiles TO authenticated;
GRANT SELECT ON public.organizations TO authenticated;
GRANT SELECT ON public.organization_members TO authenticated;

-- =============================================================================
-- VERIFICATION
-- =============================================================================

-- Verify trigger exists
SELECT 
  trigger_name,
  event_object_table,
  action_statement
FROM information_schema.triggers 
WHERE event_object_table = 'users' 
AND trigger_name = 'on_auth_user_created';

-- Verify RLS is enabled
SELECT 
  schemaname,
  tablename,
  rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
AND tablename IN ('user_profiles', 'organizations', 'organization_members');

-- Verify policies exist
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd
FROM pg_policies
WHERE schemaname = 'public'
AND tablename IN ('user_profiles', 'organizations', 'organization_members')
ORDER BY tablename, policyname;
