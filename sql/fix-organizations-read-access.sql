-- Fix RLS policies for organizations table to ensure data can be read and displayed
-- This ensures organization name and logo_url can be displayed in the dashboard

-- ============================================
-- STEP 1: Enable RLS (if not already enabled)
-- ============================================
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

-- ============================================
-- STEP 2: Drop existing SELECT policies (to recreate them properly)
-- ============================================
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT policyname 
        FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'organizations'
        AND cmd = 'SELECT'
    ) LOOP
        EXECUTE 'DROP POLICY IF EXISTS "' || r.policyname || '" ON organizations';
    END LOOP;
END $$;

-- ============================================
-- STEP 3: Create comprehensive SELECT policies
-- ============================================

-- Policy 1: Users can view organizations they belong to (via organization_members)
CREATE POLICY "Users can view their organization via membership"
ON organizations
FOR SELECT
TO authenticated
USING (
    id IN (
        SELECT organization_id 
        FROM organization_members 
        WHERE user_id = auth.uid()
    )
);

-- Policy 2: Users can view organizations they created (by email match)
-- This handles cases where organization exists but membership record is missing
CREATE POLICY "Users can view organization by email match"
ON organizations
FOR SELECT
TO authenticated
USING (
    email = (SELECT email FROM auth.users WHERE id = auth.uid())
);

-- Policy 3: Service role can read all organizations (for admin operations)
CREATE POLICY "Service role can read all organizations"
ON organizations
FOR SELECT
TO service_role
USING (true);

-- ============================================
-- STEP 4: Ensure INSERT policies exist (for creating organizations)
-- ============================================

-- Drop existing INSERT policies
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT policyname 
        FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'organizations'
        AND cmd = 'INSERT'
    ) LOOP
        EXECUTE 'DROP POLICY IF EXISTS "' || r.policyname || '" ON organizations';
    END LOOP;
END $$;

-- Create INSERT policies
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

-- ============================================
-- STEP 5: Ensure UPDATE policies exist (for updating organization data)
-- ============================================

-- Drop existing UPDATE policies
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT policyname 
        FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'organizations'
        AND cmd = 'UPDATE'
    ) LOOP
        EXECUTE 'DROP POLICY IF EXISTS "' || r.policyname || '" ON organizations';
    END LOOP;
END $$;

-- Create UPDATE policies
CREATE POLICY "Users can update their organization"
ON organizations
FOR UPDATE
TO authenticated
USING (
    id IN (
        SELECT organization_id 
        FROM organization_members 
        WHERE user_id = auth.uid()
        AND role IN ('admin', 'manager')
    )
    OR email = (SELECT email FROM auth.users WHERE id = auth.uid())
)
WITH CHECK (
    id IN (
        SELECT organization_id 
        FROM organization_members 
        WHERE user_id = auth.uid()
        AND role IN ('admin', 'manager')
    )
    OR email = (SELECT email FROM auth.users WHERE id = auth.uid())
);

CREATE POLICY "Service role can update all organizations"
ON organizations
FOR UPDATE
TO service_role
USING (true)
WITH CHECK (true);

-- ============================================
-- STEP 6: Verify storage bucket policies for logo images
-- ============================================

-- Ensure profile-pictures bucket allows public read access
-- This is critical for displaying logo_url images in the dashboard

-- Drop existing SELECT policies on storage.objects for profile-pictures
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT policyname 
        FROM pg_policies 
        WHERE schemaname = 'storage' 
        AND tablename = 'objects'
        AND (
            policyname LIKE '%profile%' 
            OR policyname LIKE '%logo%'
            OR policyname LIKE '%organization%'
        )
        AND cmd = 'SELECT'
    ) LOOP
        EXECUTE 'DROP POLICY IF EXISTS "' || r.policyname || '" ON storage.objects';
    END LOOP;
END $$;

-- Allow public read access to profile-pictures bucket (for logo_url images)
CREATE POLICY "Allow public read access to profile-pictures"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'profile-pictures');

-- Allow authenticated users to read from profile-pictures
CREATE POLICY "Allow authenticated read access to profile-pictures"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'profile-pictures');

-- Allow service_role full read access
CREATE POLICY "Service role can read profile-pictures"
ON storage.objects
FOR SELECT
TO service_role
USING (bucket_id = 'profile-pictures');

-- ============================================
-- STEP 7: Verification queries
-- ============================================

-- Verify organizations table policies
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
AND tablename = 'organizations'
ORDER BY cmd, policyname;

-- Verify storage policies for profile-pictures
SELECT 
    schemaname, 
    tablename, 
    policyname, 
    roles,
    cmd
FROM pg_policies 
WHERE schemaname = 'storage' 
AND tablename = 'objects'
AND (
    qual::text LIKE '%profile-pictures%' 
    OR with_check::text LIKE '%profile-pictures%'
)
ORDER BY policyname;

-- Verify RLS is enabled
SELECT 
    schemaname,
    tablename,
    rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
AND tablename = 'organizations';

