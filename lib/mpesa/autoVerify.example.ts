/**
 * Example usage and configuration for M-Pesa auto-verification
 */

// Example 1: Manual trigger (for testing)
export async function manualAutoVerify() {
  const response = await fetch('/api/cron/mpesa-auto-verify', {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${process.env.CRON_SECRET}`,
    },
  })

  const result = await response.json()

  if (result.success) {
    console.log('Auto-verification completed:', result.data)
    // {
    //   checked_count: 42,
    //   verified_count: 23,
    //   failed_count: 5,
    //   pending_count: 14,
    //   skipped_count: 0,
    //   error_count: 0,
    //   payments_auto_verified: [
    //     {
    //       payment_id: "uuid",
    //       amount: 10000,
    //       status: "verified",
    //       timestamp: "2024-02-01T14:35:22Z",
    //       receipt_number: "QGH123456789"
    //     }
    //   ]
    // }
  }
}

// Example 2: Vercel Cron Configuration
export const vercelCronConfig = `
// vercel.json
{
  "crons": [
    {
      "path": "/api/cron/mpesa-auto-verify",
      "schedule": "*/30 * * * * *"
    }
  ]
}
`

// Example 3: GitHub Actions Cron
export const githubActionsCron = `
# .github/workflows/mpesa-auto-verify.yml
name: M-Pesa Auto-Verify

on:
  schedule:
    - cron: '*/30 * * * *'  # Every 30 seconds (GitHub Actions minimum is 1 minute)
  workflow_dispatch:  # Allow manual trigger

jobs:
  auto-verify:
    runs-on: ubuntu-latest
    steps:
      - name: Run Auto-Verification
        run: |
          curl -X GET https://yourdomain.com/api/cron/mpesa-auto-verify \
            -H "Authorization: Bearer \${{ secrets.CRON_SECRET }}"
`

// Example 4: External Cron Service (cron-job.org, EasyCron, etc.)
export const externalCronExample = `
URL: https://yourdomain.com/api/cron/mpesa-auto-verify
Method: GET
Headers: Authorization: Bearer YOUR_CRON_SECRET
Schedule: Every 30 seconds
`

// Example 5: Environment Variables Required
export const requiredEnvVars = {
  MPESA_CONSUMER_KEY: 'Your Daraja consumer key',
  MPESA_CONSUMER_SECRET: 'Your Daraja consumer secret',
  MPESA_SHORTCODE: '174379', // Sandbox: 174379, Production: Your shortcode
  MPESA_PASSKEY: 'Your Daraja passkey',
  MPESA_CALLBACK_URL: 'https://yourdomain.com/api/payments/mpesa/callback',
  MPESA_ENVIRONMENT: 'sandbox', // or 'production'
  MPESA_INITIATOR_NAME: 'testapi', // Sandbox: testapi, Production: Your initiator name
  MPESA_SECURITY_CREDENTIAL: 'For production: encrypted security credential',
  MPESA_QUERY_INTERVAL: '30', // Seconds between queries
  MPESA_MAX_RETRIES: '3', // Max retry attempts
  MPESA_AUTO_VERIFY_ENABLED: 'true', // Enable/disable auto-verification
  CRON_SECRET: 'Secret key for cron endpoint protection',
}

// Example 6: Response Structure
export const successResponseExample = {
  success: true,
  message: 'Auto-verification completed: 23 verified, 5 failed, 14 pending',
  data: {
    checked_count: 42,
    verified_count: 23,
    failed_count: 5,
    pending_count: 14,
    skipped_count: 0,
    error_count: 0,
    payments_auto_verified: [
      {
        payment_id: 'uuid',
        amount: 10000,
        status: 'verified',
        timestamp: '2024-02-01T14:35:22Z',
        receipt_number: 'QGH123456789',
      },
    ],
    errors: undefined,
    executed_at: '2024-02-01T14:35:22Z',
  },
}

// Example 7: Error Response
export const errorResponseExample = {
  success: false,
  error: 'M-Pesa configuration is missing',
  data: {
    checked_count: 0,
    verified_count: 0,
    failed_count: 0,
    pending_count: 0,
    skipped_count: 0,
    error_count: 1,
    payments_auto_verified: [],
    errors: [
      {
        payment_id: 'config',
        error: 'M-Pesa configuration is missing',
      },
    ],
  },
}

// Example 8: Testing Auto-Verification
export const testingGuide = `
1. Create a test M-Pesa payment
2. Wait 24+ hours (or modify the query to check recent payments)
3. Call the auto-verify endpoint manually
4. Check the response for verified payments
5. Verify payment records are updated
6. Verify invoice status is updated
7. Check audit logs in mpesa_verification_audit table
`
