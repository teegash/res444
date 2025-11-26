# Quick Start: Testing Supabase Integration

## 🚀 Fastest Way to Test

### Step 1: Start Development Server
```bash
npm run dev
```

### Step 2: Open Test Page
Navigate to: **http://localhost:3000/test/supabase**

### Step 3: Click "Run All Tests"
The page will automatically test all Supabase integrations.

## 📊 What Gets Tested

✅ **Environment Variables** - All required vars present  
✅ **Server Client** - Server-side Supabase client  
✅ **Admin Client** - Admin operations client  
✅ **Database Connection** - Can connect to database  
✅ **Authentication** - Auth methods available  
✅ **Table Access** - All 15 tables accessible  
✅ **Storage Buckets** - All 5 buckets exist  
✅ **Database Tables** - All tables exist  

## 🎯 Expected Results

### ✅ Success
All tests show green ✅ - System is ready!

### ⚠️ Warnings
Some tests show yellow ⚠️ - Review but may be OK:
- Storage buckets (if not created yet)
- RLS blocking (expected for unauthenticated)

### ❌ Failures
Some tests show red ❌ - Action required:
- Missing environment variables
- Database connection issues
- Missing tables

## 🔧 Quick Fixes

### Missing Environment Variables
```bash
# Check .env.local exists
cat .env.local

# Verify these are set:
# - NEXT_PUBLIC_SUPABASE_URL
# - NEXT_PUBLIC_SUPABASE_ANON_KEY
# - SUPABASE_SERVICE_ROLE_KEY
```

### Missing Tables
Run SQL schema from `COMPLETE-RES-FULL-GUIDE.md` in Supabase SQL editor.

### Missing Storage Buckets
1. Go to Supabase Dashboard → Storage
2. Create these buckets:
   - `profile-pictures` (Public)
   - `deposit-slips` (Private)
   - `lease-documents` (Private)
   - `maintenance-attachments` (Private)
   - `organization-logos` (Public)

## 📝 Alternative Test Methods

### Command Line
```bash
npm run test:supabase
```

### API Direct
```bash
curl http://localhost:3000/api/test/supabase | jq
```

## ✅ After Tests Pass

Once all tests pass, you can:
1. ✅ Test user registration
2. ✅ Test authentication
3. ✅ Test database operations
4. ✅ Test file uploads
5. ✅ Move to M-Pesa testing

## 📚 Full Documentation

See `SUPABASE_TEST_GUIDE.md` for detailed documentation.
