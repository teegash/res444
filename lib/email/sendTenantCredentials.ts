import { sendEmail } from '@/lib/email/resendClient'

interface TenantCredentialEmailPayload {
  tenantName: string
  tenantEmail: string
  generatedPassword: string
  loginPath?: string
}

function getLoginUrl(pathOverride?: string) {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
  if (pathOverride?.startsWith('http')) {
    return pathOverride
  }
  const sanitizedPath = pathOverride?.startsWith('/') ? pathOverride : '/auth/login'
  return `${siteUrl.replace(/\/$/, '')}${sanitizedPath || '/auth/login'}`
}

export async function sendTenantCredentialsEmail({
  tenantName,
  tenantEmail,
  generatedPassword,
  loginPath = '/auth/login',
}: TenantCredentialEmailPayload) {
  const loginUrl = getLoginUrl(loginPath)
  const friendlyName = tenantName || 'Tenant'

  const textBody = [
    `Hello ${friendlyName},`,
    '',
    'Welcome to the RES tenant portal.',
    '',
    'Your credentials:',
    `  • Login URL: ${loginUrl}`,
    `  • Email: ${tenantEmail}`,
    `  • Password: ${generatedPassword}`,
    '',
    'Please sign in and change your password after your first login to keep your account secure.',
    '',
    'Warm regards,',
    'RES Support',
  ].join('\n')

  const htmlBody = `
    <div style="background-color:#f4f6fb;padding:32px 16px;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
      <table role="presentation" cellspacing="0" cellpadding="0" width="100%" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 12px 45px rgba(15,23,42,0.08);">
        <tr>
          <td style="background:#0f172a;padding:32px;text-align:center;">
            <div style="font-size:24px;font-weight:600;color:#ffffff;">RES Tenant Portal</div>
            <div style="margin-top:8px;font-size:14px;color:#cbd5f5;">Secure access to your home</div>
          </td>
        </tr>
        <tr>
          <td style="padding:32px;">
            <p style="font-size:16px;margin:0 0 16px 0;">Hello ${friendlyName},</p>
            <p style="font-size:15px;line-height:1.6;margin:0 0 24px 0;">
              Welcome to the RES tenant portal. We’ve created your account and you can sign in immediately using the credentials below.
            </p>
            <div style="border:1px solid #e2e8f0;border-radius:12px;padding:20px;background:#f8fafc;margin-bottom:24px;">
              <div style="font-size:13px;font-weight:600;color:#475569;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:12px;">Your Access Details</div>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td style="font-size:14px;color:#475569;padding:6px 0;width:120px;">Portal URL</td>
                  <td style="font-size:14px;color:#0f172a;padding:6px 0;"><a href="${loginUrl}" style="color:#2563eb;text-decoration:none;">${loginUrl}</a></td>
                </tr>
                <tr>
                  <td style="font-size:14px;color:#475569;padding:6px 0;">Email</td>
                  <td style="font-size:14px;color:#0f172a;padding:6px 0;">${tenantEmail}</td>
                </tr>
                <tr>
                  <td style="font-size:14px;color:#475569;padding:6px 0;">Password</td>
                  <td style="font-size:14px;color:#0f172a;padding:6px 0;font-weight:600;">${generatedPassword}</td>
                </tr>
              </table>
            </div>
            <p style="font-size:14px;line-height:1.6;margin:0 0 24px 0;">
              For your security, please log in and update your password after your first visit. If you have any questions, our support team is ready to assist.
            </p>
            <div style="text-align:center;margin-top:32px;">
              <a href="${loginUrl}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:999px;font-weight:600;font-size:15px;">Access Tenant Portal</a>
            </div>
          </td>
        </tr>
        <tr>
          <td style="background:#f1f5f9;padding:20px;text-align:center;font-size:13px;color:#64748b;">
            RES • Secure Tenant Experience
          </td>
        </tr>
      </table>
    </div>
  `

  console.log('[TENANT EMAIL] About to send tenant credentials', {
    to: tenantEmail,
  })

  try {
    const result = await sendEmail({
      to: tenantEmail,
      subject: 'Your tenant portal credentials',
      text: textBody,
      html: htmlBody,
    })
    console.log('[TENANT EMAIL] Resend message ID', result?.id)
  } catch (err) {
    console.error('[TENANT EMAIL] FAILED', err)
    throw err
  }
}
