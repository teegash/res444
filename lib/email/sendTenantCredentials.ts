import nodemailer from 'nodemailer'

interface TenantCredentialEmailPayload {
  tenantName: string
  tenantEmail: string
  generatedPassword: string
  loginPath?: string
}

const smtpHost = process.env.SMTP_HOST
const smtpPort = process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : 587
const smtpUser = process.env.SMTP_USER
const smtpPass = process.env.SMTP_PASS
const smtpFrom = process.env.SMTP_FROM || process.env.SMTP_USER

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
  if (!smtpHost || !smtpUser || !smtpPass || !smtpFrom) {
    throw new Error('SMTP configuration is incomplete. Please set SMTP_HOST, SMTP_USER, SMTP_PASS, and SMTP_FROM.')
  }

  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpPort === 465,
    auth: {
      user: smtpUser,
      pass: smtpPass,
    },
  })

  const loginUrl = getLoginUrl(loginPath)
  const friendlyName = tenantName || 'Tenant'

  const textBody = [
    `Hello ${friendlyName},`,
    '',
    'Your tenant portal account has been created.',
    `Login URL: ${loginUrl}`,
    `Email: ${tenantEmail}`,
    `Password: ${generatedPassword}`,
    '',
    'Please sign in and change your password after logging in to keep your account secure.',
    '',
    'Regards,',
    'RentalKenya Team',
  ].join('\n')

  const htmlBody = `
    <p>Hello ${friendlyName},</p>
    <p>Your tenant portal account has been created. Use the credentials below to sign in:</p>
    <ul>
      <li><strong>Login URL:</strong> <a href="${loginUrl}">${loginUrl}</a></li>
      <li><strong>Email:</strong> ${tenantEmail}</li>
      <li><strong>Password:</strong> ${generatedPassword}</li>
    </ul>
    <p>Please change your password after you log in to keep your account secure.</p>
    <p>Regards,<br/>RentalKenya Team</p>
  `

  await transporter.sendMail({
    from: smtpFrom,
    to: tenantEmail,
    subject: 'Your tenant portal credentials',
    text: textBody,
    html: htmlBody,
  })
}
