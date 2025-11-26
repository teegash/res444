/**
 * Example usage of Africa's Talking SMS integration
 */

// Example 1: Send SMS via API endpoint
export async function sendSMSExample() {
  const response = await fetch('/api/sms/send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      phone_number: '+254712345678',
      message: 'Hello from RES!',
      recipient_user_id: 'user-uuid', // Optional
      related_entity_type: 'payment', // Optional
      related_entity_id: 'invoice-uuid', // Optional
      retry: true, // Optional: enable retry logic
      max_retries: 3, // Optional: max retry attempts
    }),
  })

  const result = await response.json()

  if (result.success) {
    console.log('SMS sent:', result.data)
    // {
    //   message_id: "ATXid_xxx",
    //   phone_number: "+254712345678",
    //   communication_id: "uuid"
    // }
  } else {
    console.error('Error:', result.error)
  }

  return result
}

// Example 2: Use SMS templates
import {
  generateRentReminderMessage,
  generatePaymentConfirmationMessage,
  generateMaintenanceUpdateMessage,
  generateLeaseRenewalMessage,
} from '@/lib/sms/templates'

// Rent reminder
const rentReminder = generateRentReminderMessage({
  tenantName: 'John Doe',
  amount: 10000,
  dueDate: '2024-02-05',
  invoiceId: 'invoice-uuid',
  isOverdue: false,
})
// Output: "RES: Reminder - Your rent payment of KES 10,000 is due on Feb 5, 2024. Invoice #INVOICEU. Please make payment to avoid late fees."

// Payment confirmation
const paymentConfirmation = generatePaymentConfirmationMessage({
  tenantName: 'John Doe',
  amount: 10000,
  invoiceId: 'invoice-uuid',
  receiptNumber: 'ABC123456789',
  paymentMethod: 'M-Pesa',
})
// Output: "RES: Your payment of KES 10,000 via M-Pesa has been confirmed. Invoice #INVOICEU is now paid. Receipt: ABC123456789. Thank you!"

// Example 3: Send SMS with retry
import { sendSMSWithRetry } from '@/lib/sms/smsService'

const result = await sendSMSWithRetry(
  {
    phoneNumber: '+254712345678',
    message: 'Important message',
    recipientUserId: 'user-uuid',
  },
  3 // max retries
)

// Example 4: Use SMS service directly
import { sendSMSWithLogging } from '@/lib/sms/smsService'

const smsResult = await sendSMSWithLogging({
  phoneNumber: '+254712345678',
  message: 'Your payment has been processed.',
  recipientUserId: 'user-uuid',
  relatedEntityType: 'payment',
  relatedEntityId: 'invoice-uuid',
  reminderId: 'reminder-uuid', // Optional: link to reminder
})

// Example 5: React component for sending SMS
export const SendSMSComponent = `
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'

export function SendSMSForm() {
  const [phone, setPhone] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)

    try {
      const response = await fetch('/api/sms/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone_number: phone,
          message: message,
        }),
      })

      const data = await response.json()
      setResult(data)
    } catch (error) {
      setResult({ success: false, error: 'Network error' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <Input
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        placeholder="+254712345678"
        required
      />
      <Textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="Enter message..."
        required
      />
      <Button type="submit" disabled={loading}>
        {loading ? 'Sending...' : 'Send SMS'}
      </Button>
      {result && (
        <div>
          {result.success ? (
            <p className="text-green-600">SMS sent successfully!</p>
          ) : (
            <p className="text-red-600">Error: {result.error}</p>
          )}
        </div>
      )}
    </form>
  )
}
`

// Example 6: Environment variables required
export const requiredEnvVars = `
# Africa's Talking Configuration
AFRICAS_TALKING_API_KEY=your_api_key_here
AFRICAS_TALKING_USERNAME=your_username_here
AFRICAS_TALKING_SENDER_ID=RES  # Optional, for production
AFRICAS_TALKING_ENVIRONMENT=sandbox  # or 'production'
`

// Example 7: Callback URL configuration
export const callbackUrl = `
# In Africa's Talking dashboard, set callback URL to:
https://yourdomain.com/api/sms/callback

# The callback will receive delivery status updates
`

// Example 8: Phone number formatting
import { formatPhoneNumber, validatePhoneNumber } from '@/lib/sms/africasTalking'

// Format various phone number formats
formatPhoneNumber('0712345678') // +254712345678
formatPhoneNumber('254712345678') // +254712345678
formatPhoneNumber('+254712345678') // +254712345678

// Validate phone number
const validation = validatePhoneNumber('0712345678')
if (validation.valid) {
  console.log('Valid phone number')
} else {
  console.error(validation.error)
}

