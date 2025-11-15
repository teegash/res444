# Organizations Table RLS Fix Guide

## Problem
The organizations table needs proper RLS policies to allow:
1. Reading organization data (name, logo_url, etc.) for display in dashboard
2. Displaying logo images from the `logo_url` field
3. No RLS conflicts preventing data access

## Solution

### Step 1: Run the SQL Script
Execute the SQL script `sql/fix-organizations-read-access.sql` in your Supabase SQL Editor.

This script will:
- ✅ Enable RLS on organizations table
- ✅ Create SELECT policies that allow:
  - Users to view organizations they belong to (via `organization_members`)
  - Users to view organizations by email match (for admins who created org)
  - Service role to read all organizations
- ✅ Ensure INSERT policies exist (for creating organizations)
- ✅ Ensure UPDATE policies exist (for updating organization data)
- ✅ Fix storage bucket policies for public read access to logo images

### Step 2: Verify Storage Bucket Configuration

The `profile-pictures` bucket must allow public read access for logo images to display.

**In Supabase Dashboard:**
1. Go to Storage → Buckets
2. Select `profile-pictures` bucket
3. Ensure "Public bucket" is enabled (or policies allow public read)
4. Verify the policies created by the SQL script are active

### Step 3: Verify Policies

After running the script, verify the policies exist:

```sql
-- Check organizations table policies
SELECT 
    schemaname, 
    tablename, 
    policyname, 
    roles,
    cmd
FROM pg_policies 
WHERE schemaname = 'public' 
AND tablename = 'organizations'
ORDER BY cmd, policyname;

-- Check storage policies
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
);
```

### Expected Policies

**Organizations Table:**
1. ✅ "Users can view their organization via membership" (SELECT, authenticated)
2. ✅ "Users can view organization by email match" (SELECT, authenticated)
3. ✅ "Service role can read all organizations" (SELECT, service_role)
4. ✅ "Service role can insert organizations" (INSERT, service_role)
5. ✅ "Authenticated users can create organizations" (INSERT, authenticated)
6. ✅ "Users can update their organization" (UPDATE, authenticated)
7. ✅ "Service role can update all organizations" (UPDATE, service_role)

**Storage Objects (profile-pictures bucket):**
1. ✅ "Allow public read access to profile-pictures" (SELECT, public)
2. ✅ "Allow authenticated read access to profile-pictures" (SELECT, authenticated)
3. ✅ "Service role can read profile-pictures" (SELECT, service_role)

## How It Works

### Reading Organization Data

The API endpoint `/api/organizations/current` uses multiple strategies:

1. **Primary**: Fetches `organization_id` from `organization_members` (bypasses RLS via direct HTTP)
2. **Fallback**: If no membership, finds organization by email match
3. **Final Fetch**: Uses `createClient()` to fetch organization data from `organizations` table

The RLS policies ensure:
- If user has membership → Can read via "Users can view their organization via membership"
- If user created org (email match) → Can read via "Users can view organization by email match"
- Service role operations → Can always read via "Service role can read all organizations"

### Displaying Logo Images

The `logo_url` field contains a public URL from Supabase Storage. The storage policies ensure:
- Public read access → Anyone can view the image (for dashboard display)
- Authenticated read access → Logged-in users can view
- Service role → Full access for admin operations

## Testing

After applying the SQL script:

1. **Test Organization Read:**
   ```sql
   -- As authenticated user, try to read your organization
   SELECT id, name, logo_url FROM organizations 
   WHERE id IN (
     SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
   );
   ```

2. **Test Logo URL Access:**
   - Check if `logo_url` is a valid public URL
   - Try accessing the URL directly in browser
   - Should display the image without authentication

3. **Test Dashboard Display:**
   - Login to dashboard
   - Check browser console for `[Dashboard]` logs
   - Verify organization name and logo appear

## Troubleshooting

### If organization data still doesn't load:

1. **Check RLS is enabled:**
   ```sql
   SELECT rowsecurity FROM pg_tables 
   WHERE schemaname = 'public' AND tablename = 'organizations';
   ```
   Should return `true`

2. **Check policies exist:**
   ```sql
   SELECT policyname, cmd FROM pg_policies 
   WHERE schemaname = 'public' AND tablename = 'organizations';
   ```
   Should show multiple policies

3. **Check user has membership:**
   ```sql
   SELECT * FROM organization_members WHERE user_id = auth.uid();
   ```
   Should return at least one row

4. **Check organization exists:**
   ```sql
   SELECT * FROM organizations WHERE email = (SELECT email FROM auth.users WHERE id = auth.uid());
   ```
   Should return your organization

### If logo images don't display:

1. **Check storage bucket is public:**
   - Go to Supabase Dashboard → Storage → Buckets
   - Verify `profile-pictures` bucket has public access enabled

2. **Check logo_url format:**
   - Should be a full URL like: `https://[project].supabase.co/storage/v1/object/public/profile-pictures/organizations/...`
   - If it's a relative path, it won't work

3. **Test URL directly:**
   - Copy `logo_url` from database
   - Paste in browser address bar
   - Should display image

## Summary

✅ **Organizations table**: Multiple SELECT policies ensure data can be read
✅ **Storage bucket**: Public read access ensures logo images can be displayed
✅ **API endpoint**: Uses fallback strategies to find organization even if membership is missing
✅ **Dashboard**: Will display organization name and logo when data is available

Run the SQL script and verify the policies are active!

