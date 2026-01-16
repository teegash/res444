import type { SupabaseClient } from '@supabase/supabase-js'
import { sendEmail } from '@/lib/email/resendClient'

type PaymentEmailKind = 'success' | 'failed'

type SendPaymentStatusEmailArgs = {
  admin: SupabaseClient
  organizationId: string
  paymentId: string
  invoiceId?: string | null
  tenantUserId: string
  kind: PaymentEmailKind
  amountPaid?: number | string | null
  currency?: string
  receiptNumber?: string | null
  resultCode?: number | string | null
  resultDesc?: string | null
  occurredAtISO?: string | null
}

const safeText = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : String(v))

function formatKES(amount: number | string | null | undefined) {
  if (amount == null) return 'KES —'
  const n = typeof amount === 'string' ? Number(amount) : amount
  if (!Number.isFinite(n)) return `KES ${safeText(amount)}`
  return `KES ${n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`
}

function buildPaymentEmailHTML(opts: {
  kind: PaymentEmailKind
  orgName: string
  orgEmail?: string | null
  logoUrl?: string | null
  tenantName?: string | null
  amountLabel: string
  receiptNumber?: string | null
  resultDesc?: string | null
  occurredAtLabel?: string | null
  loginUrl: string
}) {
  const isSuccess = opts.kind === 'success'

  const accent = isSuccess ? '#16a34a' : '#dc2626'
  const accentSoftBg = isSuccess ? 'rgba(22,163,74,0.08)' : 'rgba(220,38,38,0.08)'
  const title = isSuccess ? 'Payment confirmed' : 'Payment failed'
  const subtitle = isSuccess
    ? 'We have received your payment successfully.'
    : 'Your payment was not completed. No charges may have been applied.'

  const logoBlock = opts.logoUrl
    ? `
      <div style="text-align:center; margin: 6px 0 14px;">
        <img src="${opts.logoUrl}" alt="${opts.orgName}" style="max-width: 140px; max-height: 50px; width:auto; height:auto; display:inline-block;" />
      </div>
    `
    : `
      <div style="text-align:center; margin: 6px 0 14px;">
        <div style="font-family: Arial, Helvetica, sans-serif; font-weight: 700; font-size: 16px; color:#0f172a;">
          ${opts.orgName}
        </div>
      </div>
    `

  const statusPill = `
    <div style="display:inline-block; padding: 6px 10px; border-radius: 999px; background:${accentSoftBg}; color:${accent}; font-family: Arial, Helvetica, sans-serif; font-size: 12px; font-weight: 700; letter-spacing: 0.2px;">
      ${isSuccess ? 'SUCCESS' : 'FAILED'}
    </div>
  `

  const failureReason = !isSuccess && opts.resultDesc
    ? `
      <div style="margin-top: 10px; padding: 12px; border-radius: 12px; background: ${accentSoftBg}; border: 1px solid rgba(15,23,42,0.08);">
        <div style="font-family: Arial, Helvetica, sans-serif; font-size: 12px; color:#0f172a; font-weight:700; margin-bottom: 6px;">
          Reason (from M-Pesa)
        </div>
        <div style="font-family: Arial, Helvetica, sans-serif; font-size: 13px; color:#334155; line-height: 1.5;">
          ${safeText(opts.resultDesc)}
        </div>
      </div>
    `
    : ''

  const receiptRow = isSuccess && opts.receiptNumber
    ? `
      <tr>
        <td style="padding:10px 0; font-family: Arial, Helvetica, sans-serif; font-size:13px; color:#475569;">Receipt</td>
        <td style="padding:10px 0; font-family: Arial, Helvetica, sans-serif; font-size:13px; color:#0f172a; font-weight:700; text-align:right;">
          ${safeText(opts.receiptNumber)}
        </td>
      </tr>
    `
    : ''

  const occurredRow = opts.occurredAtLabel
    ? `
      <tr>
        <td style="padding:10px 0; font-family: Arial, Helvetica, sans-serif; font-size:13px; color:#475569;">Date</td>
        <td style="padding:10px 0; font-family: Arial, Helvetica, sans-serif; font-size:13px; color:#0f172a; font-weight:700; text-align:right;">
          ${safeText(opts.occurredAtLabel)}
        </td>
      </tr>
    `
    : ''

  const greetingName = opts.tenantName ? opts.tenantName : 'there'

  return `
<!doctype html>
<html>
  <body style="margin:0; padding:0; background:#f4f6fb;">
    <div style="display:none; max-height:0; overflow:hidden; opacity:0;">
      ${title} • ${opts.amountLabel}
    </div>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6fb; padding: 26px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px; max-width: 92%; background:#ffffff; border-radius: 18px; overflow:hidden; box-shadow: 0 8px 30px rgba(15,23,42,0.08);">
            <tr>
              <td style="padding: 22px 26px; border-top: 3px solid ${accent};">
                ${logoBlock}

                <div style="text-align:center;">
                  ${statusPill}
                </div>

                <div style="text-align:center; margin-top: 12px; font-family: Arial, Helvetica, sans-serif; font-size: 22px; font-weight: 800; color:#0f172a;">
                  ${title}
                </div>

                <div style="text-align:center; margin-top: 8px; font-family: Arial, Helvetica, sans-serif; font-size: 14px; color:#475569; line-height: 1.6;">
                  Hi ${safeText(greetingName)}, ${subtitle}
                </div>

                <div style="margin-top: 18px; height:1px; background: linear-gradient(90deg, ${accent} 0%, rgba(15,23,42,0.06) 55%, rgba(15,23,42,0.0) 100%);"></div>

                <div style="margin-top: 16px; padding: 14px 16px; border-radius: 16px; border: 1px solid rgba(15,23,42,0.08); background:#ffffff;">
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td style="padding:10px 0; font-family: Arial, Helvetica, sans-serif; font-size:13px; color:#475569;">Amount</td>
                      <td style="padding:10px 0; font-family: Arial, Helvetica, sans-serif; font-size:13px; color:#0f172a; font-weight:800; text-align:right;">
                        ${opts.amountLabel}
                      </td>
                    </tr>
                    ${receiptRow}
                    ${occurredRow}
                  </table>
                </div>

                ${failureReason}

                <div style="text-align:center; margin-top: 18px;">
                  <a href="${opts.loginUrl}"
                    style="display:inline-block; background:#0f172a; color:#ffffff; text-decoration:none; font-family: Arial, Helvetica, sans-serif; font-size: 14px; font-weight:700; padding: 12px 18px; border-radius: 12px;">
                    Login to your account
                  </a>
                </div>

                <div style="text-align:center; margin-top: 16px; font-family: Arial, Helvetica, sans-serif; font-size: 12px; color:#64748b; line-height:1.6;">
                  If you did not attempt this payment, please contact support.
                </div>

                <div style="margin-top: 18px; height:1px; background: rgba(15,23,42,0.08);"></div>

                <div style="text-align:center; margin-top: 14px; font-family: Arial, Helvetica, sans-serif; font-size: 12px; color:#94a3b8;">
                  © ${new Date().getFullYear()} ${opts.orgName}${opts.orgEmail ? ` • ${safeText(opts.orgEmail)}` : ''}
                </div>
              </td>
            </tr>
          </table>

          <div style="width:600px; max-width: 92%; margin-top: 14px; text-align:center; font-family: Arial, Helvetica, sans-serif; font-size: 11px; color:#94a3b8;">
            This is an automated message. Please do not reply.
          </div>
        </td>
      </tr>
    </table>
  </body>
</html>
  `.trim()
}

export async function sendPaymentStatusEmail(args: SendPaymentStatusEmailArgs) {
  const currency = args.currency ?? 'KES'
  const amountLabel =
    currency === 'KES' ? formatKES(args.amountPaid as any) : `${currency} ${safeText(args.amountPaid)}`

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '')
  if (!siteUrl) {
    throw new Error('Missing NEXT_PUBLIC_SITE_URL environment variable (needed for Login button).')
  }
  const loginUrl = `${siteUrl}/login`

  const { data: org, error: orgErr } = await args.admin
    .from('organizations')
    .select('id, name, email, export_logo_url, logo_url')
    .eq('id', args.organizationId)
    .single()

  if (orgErr || !org) {
    throw new Error(`Failed to load organization branding: ${orgErr?.message ?? 'no org row'}`)
  }

  const orgName = org.name ?? 'RES'
  const orgEmail = org.email ?? null
  const logoUrl = org.export_logo_url ?? org.logo_url ?? null

  const { data: userRes, error: userErr } = await args.admin.auth.admin.getUserById(args.tenantUserId)
  if (userErr || !userRes?.user?.email) {
    throw new Error(`Failed to fetch tenant email from auth: ${userErr?.message ?? 'no email found'}`)
  }
  const recipientEmail = userRes.user.email

  const { data: prof } = await args.admin
    .from('user_profiles')
    .select('full_name')
    .eq('id', args.tenantUserId)
    .maybeSingle()

  const tenantName = prof?.full_name ?? null

  const subject =
    args.kind === 'success' ? `Payment received • ${amountLabel}` : `Payment failed • ${amountLabel}`

  const meta = {
    paymentId: args.paymentId,
    invoiceId: args.invoiceId ?? null,
    resultCode: args.resultCode ?? null,
    resultDesc: args.resultDesc ?? null,
    receiptNumber: args.receiptNumber ?? null,
  }

  const insertRes = await args.admin
    .from('payment_email_sends')
    .insert({
      organization_id: args.organizationId,
      payment_id: args.paymentId,
      invoice_id: args.invoiceId ?? null,
      tenant_user_id: args.tenantUserId,
      kind: args.kind,
      recipient_email: recipientEmail,
      subject,
      meta,
    })
    .select('id')
    .single()

  if (insertRes.error) {
    const msg = insertRes.error.message ?? ''
    const code = (insertRes.error as any).code ?? ''
    if (code === '23505' || msg.toLowerCase().includes('duplicate')) {
      return { ok: true, skipped: true, reason: 'already_sent' as const }
    }
    throw new Error(`Failed to create payment_email_sends row: ${insertRes.error.message}`)
  }

  const sendRowId = insertRes.data.id as string
  const occurredAtLabel = args.occurredAtISO ? new Date(args.occurredAtISO).toLocaleString() : null

  const html = buildPaymentEmailHTML({
    kind: args.kind,
    orgName,
    orgEmail,
    logoUrl,
    tenantName,
    amountLabel,
    receiptNumber: args.receiptNumber ?? null,
    resultDesc: args.resultDesc ?? null,
    occurredAtLabel,
    loginUrl,
  })

  const text =
    args.kind === 'success'
      ? `Payment confirmed. Amount: ${amountLabel}. Receipt: ${safeText(args.receiptNumber ?? '')}. Login: ${loginUrl}`
      : `Payment failed. Amount: ${amountLabel}. Reason: ${safeText(args.resultDesc ?? '')}. Login: ${loginUrl}`

  const sent = await sendEmail({
    to: recipientEmail,
    subject,
    html,
    text,
  })

  const providerMessageId = (sent as any)?.id ?? (sent as any)?.messageId ?? null

  await args.admin.from('payment_email_sends').update({ provider_message_id: providerMessageId }).eq('id', sendRowId)

  return { ok: true, skipped: false, providerMessageId }
}
