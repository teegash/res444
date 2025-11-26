
import { createAdminClient } from '@/lib/supabase/admin'

export interface InvitationEmailData {
  tenantName: string
  email: string
  unitNumber: string
  buildingName: string
  monthlyRent: number
  startDate: string
  endDate: string
  depositAmount: number
  firstPaymentDue: string
  loginUrl: string
}

/**
 * Send invitation email to tenant
 * Uses Supabase Auth's built-in email functionality
 * Can be extended with custom email service (SendGrid, Resend, etc.)
 */
export async function sendTenantInvitation(
  email: string,
  data: InvitationEmailData
): Promise<{ success: boolean; error?: string }> {
  try {
    // Supabase Auth automatically sends verification email when user is created
    // with email_confirm: false
    
    // For custom email content, you can:
    // 1. Use Supabase Edge Functions to send custom emails
    // 2. Integrate with SendGrid, Resend, or other email services
    // 3. Use Supabase's email templates (if configured)
    
    // For now, we'll rely on Supabase's automatic verification email
    // The user will receive an email to verify their account
    
    // If you want to send a custom welcome email, you can add it here:
    // Example with a hypothetical email service:
    /*
    const emailService = getEmailService()
    await emailService.send({
      to: email,
      subject: `Welcome to ${data.buildingName} - Your Lease Details`,
      template: 'tenant-welcome',
      data: {
        tenantName: data.tenantName,
        unitNumber: data.unitNumber,
        buildingName: data.buildingName,
        monthlyRent: data.monthlyRent,
        startDate: data.startDate,
        endDate: data.endDate,
        depositAmount: data.depositAmount,
        firstPaymentDue: data.firstPaymentDue,
        loginUrl: data.loginUrl,
      },
    })
    */

    return { success: true }
  } catch (error) {
    const err = error as Error
    console.error('Error sending invitation email:', err)
    return {
      success: false,
      error: err.message || 'Failed to send invitation email',
    }
  }
}

/**
 * Generate email template content
 */
export function generateInvitationEmailContent(data: InvitationEmailData): string {
  const formattedRent = new Intl.NumberFormat('en-KE', {
    style: 'currency',
    currency: 'KES',
    minimumFractionDigits: 0,
  }).format(data.monthlyRent)

  const formattedDeposit = new Intl.NumberFormat('en-KE', {
    style: 'currency',
    currency: 'KES',
    minimumFractionDigits: 0,
  }).format(data.depositAmount)

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleDateString('en-KE', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  }

  return `
Hello ${data.tenantName},

Your lease has been successfully created!

Unit: ${data.unitNumber}, ${data.buildingName}
Monthly Rent: ${formattedRent}
Lease Start: ${formatDate(data.startDate)}
Lease End: ${formatDate(data.endDate)}
Deposit: ${formattedDeposit}

Your account login: ${data.loginUrl}
Email: ${data.email}

First payment due: ${formatDate(data.firstPaymentDue)}

Please check your email to verify your account and set your password.

Best regards,
RES Team
  `.trim()
}

