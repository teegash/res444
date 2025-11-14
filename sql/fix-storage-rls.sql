-- Fix RLS policies for storage.objects (profile-pictures bucket)
-- This allows anonymous users to upload images during signup

-- ============================================
-- STORAGE BUCKET POLICIES
-- ============================================

-- Drop existing policies on storage.objects for profile-pictures bucket
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT policyname 
        FROM pg_policies 
        WHERE schemaname = 'storage' 
        AND tablename = 'objects'
        AND policyname LIKE '%profile%'
    ) LOOP
        EXECUTE 'DROP POLICY IF EXISTS "' || r.policyname || '" ON storage.objects';
    END LOOP;
END $$;

-- Allow anonymous users to upload to organizations folder in profile-pictures bucket
CREATE POLICY "Allow anonymous uploads to organizations folder"
ON storage.objects
FOR INSERT
TO anon
WITH CHECK (
    bucket_id = 'profile-pictures' 
    AND (storage.foldername(name))[1] = 'organizations'
);

-- Allow authenticated users to upload to organizations folder
CREATE POLICY "Allow authenticated uploads to organizations folder"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'profile-pictures' 
    AND (storage.foldername(name))[1] = 'organizations'
);

-- Allow public read access to profile-pictures bucket
CREATE POLICY "Allow public read access to profile-pictures"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'profile-pictures');

-- Allow service_role full access (admin client)
CREATE POLICY "Service role full access to profile-pictures"
ON storage.objects
FOR ALL
TO service_role
USING (bucket_id = 'profile-pictures')
WITH CHECK (bucket_id = 'profile-pictures');

-- ============================================
-- VERIFICATION
-- ============================================

-- Check storage policies
SELECT 
    schemaname, 
    tablename, 
    policyname, 
    roles,
    cmd,
    qual,
    with_check
FROM pg_policies 
WHERE schemaname = 'storage' 
AND tablename = 'objects'
AND (qual::text LIKE '%profile-pictures%' OR with_check::text LIKE '%profile-pictures%')
ORDER BY policyname;

