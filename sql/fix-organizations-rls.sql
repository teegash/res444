-- Fix RLS policies for organizations table to allow creation during signup

-- First, check if there are existing INSERT policies and drop them
DROP POLICY IF EXISTS "Allow organization creation during signup" ON organizations;
DROP POLICY IF EXISTS "Service role can insert organizations" ON organizations;
DROP POLICY IF EXISTS "Authenticated users can create organizations" ON organizations;

-- Option 1: Allow service role (admin client) to insert organizations
-- This is the safest option since we're using admin client during registration
CREATE POLICY "Service role can insert organizations"
ON organizations
FOR INSERT
TO service_role
WITH CHECK (true);

-- Option 2: Allow authenticated users to create organizations
-- Use this if you want users to be able to create organizations after signup
CREATE POLICY "Authenticated users can create organizations"
ON organizations
FOR INSERT
TO authenticated
WITH CHECK (true);

-- Keep the existing SELECT policy (if it exists)
-- If it doesn't exist, create it
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'organizations' 
    AND policyname = 'Users can view their organization'
  ) THEN
    CREATE POLICY "Users can view their organization"
      ON organizations FOR SELECT
      USING (id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid()));
  END IF;
END $$;

-- Also ensure organization_members table allows INSERT during signup
DROP POLICY IF EXISTS "Service role can insert members" ON organization_members;
DROP POLICY IF EXISTS "Allow member creation during signup" ON organization_members;

CREATE POLICY "Service role can insert members"
ON organization_members
FOR INSERT
TO service_role
WITH CHECK (true);

-- Allow authenticated users to insert their own membership
CREATE POLICY "Users can create own membership"
ON organization_members
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

