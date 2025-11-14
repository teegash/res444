-- Fix RLS policies for organizations table to allow creation during signup
-- This script ensures service_role (admin client) can create organizations

-- ============================================
-- ORGANIZATIONS TABLE POLICIES
-- ============================================

-- Drop all existing INSERT policies on organizations
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'organizations' AND cmd = 'INSERT') LOOP
        EXECUTE 'DROP POLICY IF EXISTS "' || r.policyname || '" ON organizations';
    END LOOP;
END $$;

-- Create policy to allow service_role to insert (admin client uses this)
CREATE POLICY "Service role can insert organizations"
ON organizations
FOR INSERT
TO service_role
WITH CHECK (true);

-- Create policy to allow authenticated users to insert (fallback)
CREATE POLICY "Authenticated users can create organizations"
ON organizations
FOR INSERT
TO authenticated
WITH CHECK (true);

-- Ensure SELECT policy exists (for viewing organizations)
DROP POLICY IF EXISTS "Users can view their organization" ON organizations;
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

-- ============================================
-- ORGANIZATION_MEMBERS TABLE POLICIES
-- ============================================

-- Drop all existing INSERT policies on organization_members
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'organization_members' AND cmd = 'INSERT') LOOP
        EXECUTE 'DROP POLICY IF EXISTS "' || r.policyname || '" ON organization_members';
    END LOOP;
END $$;

-- Create policy to allow service_role to insert members (admin client uses this)
CREATE POLICY "Service role can insert members"
ON organization_members
FOR INSERT
TO service_role
WITH CHECK (true);

-- Create policy to allow authenticated users to insert their own membership
CREATE POLICY "Users can create own membership"
ON organization_members
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

-- Ensure SELECT policy exists (for viewing memberships)
DROP POLICY IF EXISTS "Users can view own memberships" ON organization_members;
CREATE POLICY "Users can view own memberships"
ON organization_members
FOR SELECT
USING (user_id = auth.uid());

-- ============================================
-- VERIFICATION QUERIES
-- ============================================

-- Verify policies were created (run these separately to check)
-- SELECT * FROM pg_policies WHERE schemaname = 'public' AND tablename = 'organizations';
-- SELECT * FROM pg_policies WHERE schemaname = 'public' AND tablename = 'organization_members';

