# Supabase Integration Test Guide

## Overview

This guide covers comprehensive testing of all Supabase integrations in the RentalKenya system.

## Test Methods

### Method 1: Web UI (Recommended)

1. **Start your development server:**
   ```bash
   npm run dev
   ```

2. **Navigate to test page:**
   ```
   http://localhost:3000/test/supabase
   ```

3. **Click "Run All Tests"** button

4. **Review results:**
   - Green = Passed
   - Red = Failed
   - Yellow = Warning

### Method 2: API Endpoint

**Direct API call:**
```bash
curl http://localhost:3000/api/test/supabase
```

**With formatting:**
```bash
curl http://localhost:3000/api/test/supabase | jq
```

### Method 3: Command Line Script

**Run the test script:**
```bash
npm run test:supabase
```

**Or directly:**
```bash
node scripts/test-supabase.js
```

## Tests Performed

### 1. Environment Variables ✅
- Checks for `NEXT_PUBLIC_SUPABASE_URL`
- Checks for `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- Checks for `SUPABASE_SERVICE_ROLE_KEY`
- Validates URL format

### 2. Server Client Initialization ✅
- Tests server-side Supabase client creation
- Verifies cookie handling
- Tests basic database query

### 3. Admin Client Initialization ✅
- Tests admin client with service role key
- Verifies RLS bypass capability
- Tests admin database access

### 4. Database Connection ✅
- Tests connection to Supabase database
- Verifies network connectivity
- Checks database availability

### 5. Authentication ✅
- Tests auth methods availability:
  - `signUp`
  - `signInWithPassword`
  - `signOut`
  - `getSession`
  - `getUser`
- Verifies session management

### 6. Table Access (RLS) ✅
- Tests access to all 15 database tables:
  - `organizations`
  - `organization_members`
  - `user_profiles`
  - `apartment_buildings`
  - `apartment_units`
  - `leases`
  - `invoices`
  - `payments`
  - `maintenance_requests`
  - `communications`
  - `reminders`
  - `water_bills`
  - `reports`
  - `bulk_unit_creation_logs`
  - `mpesa_verification_audit`
- Verifies RLS policies are working

### 7. Storage Buckets ✅
- Tests access to storage API
- Verifies expected buckets exist:
  - `profile-pictures`
  - `deposit-slips`
  - `lease-documents`
  - `maintenance-attachments`
  - `organization-logos`

### 8. Database Tables Existence ✅
- Verifies all 15 tables exist in database
- Uses admin client to bypass RLS
- Reports missing tables

## Expected Results

### ✅ All Tests Pass
```
✅ Environment Variables - All required variables set
✅ Server Client Initialization - Client created successfully
✅ Admin Client Initialization - Admin client working
✅ Database Connection - Connected successfully
✅ Authentication - Auth methods available
✅ Table Access (RLS) - All tables accessible
✅ Storage Buckets - All buckets exist
✅ Database Tables - All tables exist
```

### ⚠️ Warnings (Common)
- **Storage Buckets**: May show warning if buckets not created yet
- **Table Access**: May show warning if RLS is blocking (expected for unauthenticated)
- **RLS Policies**: May show warning if accessing without auth (expected)

### ❌ Failures (Action Required)
- **Environment Variables**: Missing required variables
- **Client Initialization**: Configuration error
- **Database Connection**: Network or configuration issue
- **Table Access**: Tables don't exist or RLS misconfigured

## Troubleshooting

### Issue: "Missing environment variables"
**Solution:**
1. Check `.env.local` file exists
2. Verify all required variables are set
3. Restart development server after changes

### Issue: "Cannot connect to database"
**Solution:**
1. Verify `NEXT_PUBLIC_SUPABASE_URL` is correct
2. Check Supabase project is active
3. Verify network connectivity
4. Check Supabase dashboard for project status

### Issue: "Tables don't exist"
**Solution:**
1. Run SQL schema from `COMPLETE-RENTALKENYA-FULL-GUIDE.md`
2. Verify tables created in Supabase dashboard
3. Check table names match exactly

### Issue: "Storage buckets missing"
**Solution:**
1. Create buckets in Supabase dashboard:
   - Go to Storage section
   - Create each bucket manually
   - Set appropriate permissions (public/private)

### Issue: "RLS blocking access"
**Solution:**
1. This is **expected** for unauthenticated requests
2. RLS policies should block unauthorized access
3. Test with authenticated user for full access

## Manual Testing Checklist

After automated tests pass, manually test:

- [ ] Sign up new user
- [ ] Sign in existing user
- [ ] Sign out user
- [ ] Create organization
- [ ] Create building
- [ ] Create units
- [ ] Create tenant
- [ ] Create lease
- [ ] Generate invoice
- [ ] Process payment
- [ ] Upload file to storage
- [ ] Query reports

## Integration Points to Test

### 1. Authentication Flow
- User registration
- Email verification
- Password reset
- Session persistence
- Token refresh

### 2. Database Operations
- CRUD operations on all tables
- RLS policy enforcement
- Foreign key constraints
- Unique constraints
- Check constraints

### 3. Storage Operations
- File upload
- File download
- File deletion
- Signed URL generation
- Bucket permissions

### 4. Real-time (if implemented)
- Subscription to table changes
- Channel subscriptions
- Event handling

## Next Steps

After Supabase tests pass:

1. ✅ Test M-Pesa integration
2. ✅ Test Africa's Talking SMS
3. ✅ Test payment flows
4. ✅ Test invoice generation
5. ✅ Test reporting system

## API Response Format

```json
{
  "success": true,
  "status": "pass",
  "summary": {
    "total": 8,
    "passed": 7,
    "failed": 0,
    "warnings": 1
  },
  "results": [
    {
      "name": "Environment Variables",
      "status": "pass",
      "message": "All required environment variables are set",
      "details": {
        "url": "https://...",
        "hasAnonKey": true,
        "hasServiceRoleKey": true
      }
    }
  ],
  "timestamp": "2024-02-01T12:00:00.000Z"
}
```

## Support

If tests fail:
1. Check error messages in test results
2. Review Supabase dashboard
3. Verify environment variables
4. Check network connectivity
5. Review RLS policies in Supabase

