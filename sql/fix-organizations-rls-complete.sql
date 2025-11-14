-- Complete fix for RLS policies on organizations table
-- This ensures service_role can create organizations during signup

-- ============================================
-- STEP 1: Drop ALL existing policies
-- ============================================

-- Drop all policies on organizations table
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT policyname 
        FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'organizations'
    ) LOOP
        EXECUTE 'DROP POLICY IF EXISTS "' || r.policyname || '" ON organizations';
    END LOOP;
END $$;

-- Drop all policies on organization_members table
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT policyname 
        FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'organization_members'
    ) LOOP
        EXECUTE 'DROP POLICY IF EXISTS "' || r.policyname || '" ON organization_members';
    END LOOP;
END $$;

-- ============================================
-- STEP 2: Create SECURITY DEFINER function for inserting organizations
-- This bypasses RLS completely
-- ============================================

CREATE OR REPLACE FUNCTION public.create_organization(
    p_name TEXT,
    p_email TEXT,
    p_phone TEXT,
    p_location TEXT,
    p_registration_number TEXT,
    p_logo_url TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_org_id UUID;
BEGIN
    INSERT INTO organizations (
        name,
        email,
        phone,
        location,
        registration_number,
        logo_url
    ) VALUES (
        p_name,
        p_email,
        p_phone,
        p_location,
        p_registration_number,
        p_logo_url
    )
    RETURNING id INTO v_org_id;
    
    RETURN v_org_id;
END;
$$;

-- Grant execute permission to service_role and authenticated users
GRANT EXECUTE ON FUNCTION public.create_organization TO service_role;
GRANT EXECUTE ON FUNCTION public.create_organization TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_organization TO anon;

-- ============================================
-- STEP 3: Create RLS policies (backup method)
-- ============================================

-- Organizations table policies
CREATE POLICY "Service role can insert organizations"
ON organizations
FOR INSERT
TO service_role
WITH CHECK (true);

CREATE POLICY "Authenticated users can create organizations"
ON organizations
FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Users can view their organization"
ON organizations
FOR SELECT
USING (
    id IN (
        SELECT organization_id 
        FROM organization_members 
        WHERE user_id = auth.uid()
    )
);

-- Organization members table policies
CREATE POLICY "Service role can insert members"
ON organization_members
FOR INSERT
TO service_role
WITH CHECK (true);

CREATE POLICY "Users can create own membership"
ON organization_members
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can view own memberships"
ON organization_members
FOR SELECT
USING (user_id = auth.uid());

-- ============================================
-- VERIFICATION
-- ============================================

-- Check policies
SELECT 
    schemaname, 
    tablename, 
    policyname, 
    roles,
    cmd,
    qual,
    with_check
FROM pg_policies 
WHERE schemaname = 'public' 
AND tablename IN ('organizations', 'organization_members')
ORDER BY tablename, cmd;

-- Check function exists
SELECT 
    routine_name, 
    routine_type,
    security_type
FROM information_schema.routines
WHERE routine_schema = 'public'
AND routine_name = 'create_organization';

