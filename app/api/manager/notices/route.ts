import { NextRequest, NextResponse } from 'next/server'
import nodemailer from 'nodemailer'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendSMSWithLogging } from '@/lib/sms/smsService'

const MANAGER_ROLES = new Set(['admin', 'manager', 'caretaker'])

type Channels = {
  in_app?: boolean
  sms?: boolean
  email?: boolean
}

async function assertManager() {
  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    throw new Error('UNAUTHORIZED')
  }

  const role = (user.user_metadata?.role as string | undefined)?.toLowerCase()
  if (!role || !MANAGER_ROLES.has(role)) {
    throw new Error('FORBIDDEN')
  }

  return user
}

async function fetchTenantProfiles(admin: ReturnType<typeof createAdminClient>, ids: string[]) {
  if (ids.length === 0) return []
  const { data, error } = await admin
    .from('user_profiles')
    .select('id, full_name, phone_number')
    .in('id', ids)

  if (error) {
    throw error
  }
  return data || []
}

async function fetchTenantEmails(
  admin: ReturnType<typeof createAdminClient>,
  ids: string[]
): Promise<Record<string, string | null>> {
  const emailMap: Record<string, string | null> = {}

  const results = await Promise.all(
    ids.map(async (id) => {
      try {
        const { data } = await admin.auth.admin.getUserById(id)
        emailMap[id] = data?.user?.email || null
      } catch (error) {
        console.error('[ManagerNotices] Failed to fetch email for', id, error)
        emailMap[id] = null
      }
    })
  )

  return emailMap
}

function buildEmailTransport() {
  const smtpHost = process.env.SMTP_HOST
  const smtpPort = process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : 587
  const smtpUser = process.env.SMTP_USER
  const smtpPass = process.env.SMTP_PASS
  const smtpFrom = process.env.SMTP_FROM || process.env.SMTP_USER

  if (!smtpHost || !smtpUser || !smtpPass || !smtpFrom) {
    throw new Error(
      'SMTP configuration is missing. Please set SMTP_HOST, SMTP_USER, SMTP_PASS and SMTP_FROM.'
    )
  }

  const transport = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpPort === 465,
    auth: {
      user: smtpUser,
      pass: smtpPass,
    },
  })

  return { transport, from: smtpFrom }
}

async function sendNoticeEmail(
  to: string,
  subject: string,
  message: string,
  recipientName?: string | null
) {
  const { transport, from } = buildEmailTransport()
  const friendlyName = recipientName || 'Tenant'

  const html = `
    <div style="background:#0f172a;padding:32px 0;font-family:Inter,Arial,sans-serif;">
      <div style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:18px;overflow:hidden;box-shadow:0 20px 70px rgba(15,23,42,0.2);">
        <div style="background:linear-gradient(120deg,#1e3a8a,#0ea5e9);padding:28px 32px;color:#fff;">
          <div style="font-size:13px;letter-spacing:0.12em;text-transform:uppercase;opacity:0.8;">RentalKenya Notice</div>
          <div style="font-size:26px;font-weight:700;margin-top:8px;">${subject}</div>
        </div>
        <div style="padding:28px 32px;color:#0f172a;">
          <p style="margin:0 0 16px 0;font-size:16px;">Hello ${friendlyName},</p>
          <p style="margin:0 0 18px 0;font-size:15px;line-height:1.6;white-space:pre-line;">${message}</p>
          <div style="margin-top:28px;font-size:13px;color:#64748b;">If you have any questions, reply to this email.</div>
        </div>
        <div style="background:#f8fafc;padding:18px 32px;font-size:13px;color:#475569;display:flex;justify-content:space-between;align-items:center;">
          <span>RentalKenya • Tenant Experience</span>
          <span style="color:#0ea5e9;">${new Date().toLocaleDateString()}</span>
        </div>
      </div>
    </div>
  `

  await transport.sendMail({
    from,
    to,
    subject,
    html,
  })
}

export async function GET() {
  try {
    const user = await assertManager()
    const admin = createAdminClient()

    const { data, error } = await admin
      .from('communications')
      .select('id, recipient_user_id, message_text, message_type, created_at')
      .eq('sender_user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(15)

    if (error) {
      throw error
    }

    const recipientIds = Array.from(
      new Set((data || []).map((row) => row.recipient_user_id).filter(Boolean) as string[])
    )
    const profiles = await fetchTenantProfiles(admin, recipientIds)
    const profileMap = new Map(profiles.map((profile) => [profile.id, profile.full_name || 'Tenant']))

    const payload = (data || [])
      .filter((row) => (row.message_text || '').startsWith('[NOTICE]'))
      .map((row) => ({
        id: row.id,
        recipientId: row.recipient_user_id,
        recipientName: profileMap.get(row.recipient_user_id || '') || 'Tenant',
        message: (row.message_text || '').replace(/^\[NOTICE\]\s*/, ''),
        channel: row.message_type,
        created_at: row.created_at,
      }))

    return NextResponse.json({ success: true, data: payload })
  } catch (error) {
    if (error instanceof Error && (error.message === 'UNAUTHORIZED' || error.message === 'FORBIDDEN')) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    console.error('[ManagerNotices.GET] Failed to load notices', error)
    return NextResponse.json(
      { success: false, error: 'Failed to load notices.' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await assertManager()
    const admin = createAdminClient()

    const body = await request.json().catch(() => ({}))
    const {
      tenant_ids,
      send_all,
      title,
      message,
      notice_type,
      channels = {},
      property_id,
    }: {
      tenant_ids?: string[]
      send_all?: boolean
      title?: string
      message?: string
      notice_type?: string
      channels?: Channels
      property_id?: string | null
    } = body || {}

    if (!message || !message.toString().trim()) {
      return NextResponse.json(
        { success: false, error: 'Message is required.' },
        { status: 400 }
      )
    }

    const tenantIdsInput = Array.isArray(tenant_ids) ? tenant_ids.filter(Boolean) : []
    let recipientIds: string[] = tenantIdsInput

    if (send_all || tenantIdsInput.length === 0) {
      const leaseQuery = admin
        .from('leases')
        .select('tenant_user_id, unit:apartment_units ( building_id )')
        .in('status', ['active', 'pending'])

      const { data: leaseTenants, error: leaseError } = await leaseQuery
      if (leaseError) {
        throw leaseError
      }

      const filteredLeases =
        property_id && property_id !== 'all'
          ? (leaseTenants || []).filter((lease) => lease.unit?.building_id === property_id)
          : leaseTenants || []

      recipientIds = Array.from(
        new Set(
          (filteredLeases || [])
            .map((lease) => lease.tenant_user_id)
            .filter((id): id is string => Boolean(id))
        )
      )
    }

    recipientIds = Array.from(new Set(recipientIds))
    if (recipientIds.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No recipients found for this notice.' },
        { status: 400 }
      )
    }

    const subject = title?.toString().trim() || 'Tenant Notice'
    const textBody = `[NOTICE] ${subject}\n\n${message.toString().trim()}`
    const relatedEntityType = ['maintenance_request', 'payment', 'lease'].includes(
      (notice_type || '').toLowerCase()
    )
      ? (notice_type as string)
      : null
    const inApp = channels.in_app !== false // default true
    const sendSms = channels.sms === true
    const sendEmail = channels.email === true

    const profiles = await fetchTenantProfiles(admin, recipientIds)
    const emails = sendEmail ? await fetchTenantEmails(admin, recipientIds) : {}

    const profileMap = new Map(profiles.map((profile) => [profile.id, profile]))

    // In-app notifications
    if (inApp) {
      const rows = recipientIds.map((id) => ({
        sender_user_id: user.id,
        recipient_user_id: id,
        message_text: textBody,
        related_entity_type: relatedEntityType,
        related_entity_id: null,
        message_type: 'in_app',
        read: false,
      }))
      const { error } = await admin.from('communications').insert(rows)
      if (error) throw error
    }

    let smsSent = 0
    let smsFailed = 0
    if (sendSms) {
      const smsResults = await Promise.allSettled(
        recipientIds.map(async (id) => {
          const phone = profileMap.get(id)?.phone_number
          if (!phone) {
            return { success: false, error: 'Missing phone' }
          }
          return sendSMSWithLogging({
            phoneNumber: phone,
            message: textBody,
            senderUserId: user.id,
            recipientUserId: id,
            relatedEntityType: relatedEntityType || undefined,
          })
        })
      )

      smsResults.forEach((result) => {
        if (result.status === 'fulfilled' && result.value?.success) {
          smsSent += 1
        } else {
          smsFailed += 1
        }
      })
    }

    let emailSent = 0
    let emailFailed = 0
    if (sendEmail) {
      const emailResults = await Promise.allSettled(
        recipientIds.map(async (id) => {
          const to = emails[id]
          if (!to) return { success: false, error: 'Missing email' }
          await sendNoticeEmail(to, subject, message.toString().trim(), profileMap.get(id)?.full_name)
          await admin
            .from('communications')
            .insert({
              sender_user_id: user.id,
              recipient_user_id: id,
              message_text: textBody,
              related_entity_type: relatedEntityType,
              related_entity_id: null,
              message_type: 'email',
              read: false,
            })
          return { success: true }
        })
      )

      emailResults.forEach((result) => {
        if (result.status === 'fulfilled' && result.value?.success) {
          emailSent += 1
        } else {
          emailFailed += 1
        }
      })
    }

    return NextResponse.json({
      success: true,
      data: {
        recipients: recipientIds.length,
        sms_sent: smsSent,
        sms_failed: smsFailed,
        email_sent: emailSent,
        email_failed: emailFailed,
      },
    })
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'UNAUTHORIZED') {
        return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
      }
      if (error.message === 'FORBIDDEN') {
        return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 })
      }
    }

    console.error('[ManagerNotices.POST] Failed to send notice', error)
    return NextResponse.json(
      { success: false, error: 'Failed to send notice.' },
      { status: 500 }
    )
  }
}
