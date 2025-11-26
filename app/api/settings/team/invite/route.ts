import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import nodemailer from 'nodemailer'

const ALLOWED_ROLES = ['manager', 'caretaker']

function buildEmailTransport() {
  const smtpHost = process.env.SMTP_HOST
  const smtpPort = process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : 587
  const smtpUser = process.env.SMTP_USER
  const smtpPass = process.env.SMTP_PASS
  const smtpFrom = process.env.SMTP_FROM || process.env.SMTP_USER

  if (!smtpHost || !smtpUser || !smtpPass || !smtpFrom) {
    throw new Error('SMTP configuration is missing. Please set SMTP_HOST, SMTP_USER, SMTP_PASS and SMTP_FROM.')
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

async function sendInviteEmail(to: string, name: string, password: string, role: string) {
  const { transport, from } = buildEmailTransport()
  const friendlyName = name || 'Team member'

  const html = `
    <div style="background:#0f172a;padding:32px 0;font-family:Inter,Arial,sans-serif;">
      <div style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:18px;overflow:hidden;box-shadow:0 20px 70px rgba(15,23,42,0.2);">
        <div style="background:linear-gradient(120deg,#0ea5e9,#1e3a8a);padding:28px 32px;color:#fff;">
          <div style="font-size:13px;letter-spacing:0.12em;text-transform:uppercase;opacity:0.8;">RES Team Invite</div>
          <div style="font-size:26px;font-weight:700;margin-top:8px;">You're invited as ${role}</div>
        </div>
        <div style="padding:28px 32px;color:#0f172a;">
          <p style="margin:0 0 14px 0;font-size:16px;">Hi ${friendlyName},</p>
          <p style="margin:0 0 14px 0;font-size:15px;line-height:1.6;">You have been added to RES as a <strong>${role}</strong>.</p>
          <p style="margin:0 0 14px 0;font-size:15px;line-height:1.6;">Use the credentials below to sign in:</p>
          <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:14px 16px;margin:16px 0;">
            <div style="font-size:14px;margin-bottom:6px;"><strong>Email:</strong> ${to}</div>
            <div style="font-size:14px;"><strong>Password:</strong> ${password}</div>
          </div>
          <p style="margin:0 0 12px 0;font-size:14px;color:#475569;">Sign in at <a href="${process.env.NEXT_PUBLIC_BASE_URL || ''}/auth/login" style="color:#0ea5e9;">Login</a>. We recommend changing your password after first login.</p>
        </div>
        <div style="background:#f8fafc;padding:18px 32px;font-size:13px;color:#475569;">
          RES • Property Management Suite
        </div>
      </div>
    </div>
  `

  await transport.sendMail({
    from,
    to,
    subject: `Your RES ${role} access`,
    html,
  })
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const { email, full_name, role, password, property_id } = body || {}

    if (!email || !full_name || !role || !password || !ALLOWED_ROLES.includes(role)) {
      return NextResponse.json(
        { success: false, error: 'Email, full name, password, and valid role are required.' },
        { status: 400 }
      )
    }

    if (typeof password !== 'string' || password.length < 8) {
      return NextResponse.json(
        { success: false, error: 'Password must be at least 8 characters long.' },
        { status: 400 }
      )
    }

    if (role === 'caretaker' && !property_id) {
      return NextResponse.json(
        { success: false, error: 'Caretaker invites require a property selection.' },
        { status: 400 }
      )
    }

    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const admin = createAdminClient()
    const { data: membership, error: membershipError } = await admin
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', user.id)
      .maybeSingle()
    if (membershipError) throw membershipError
    if (!membership?.organization_id) {
      return NextResponse.json({ success: false, error: 'Organization not found for user.' }, { status: 400 })
    }

    const orgId = membership.organization_id

    let validatedPropertyId: string | null = null
    if (role === 'caretaker' && property_id) {
      const { data: property, error: propertyError } = await admin
        .from('apartment_buildings')
        .select('id')
        .eq('id', property_id)
        .eq('organization_id', orgId)
        .maybeSingle()
      if (propertyError) throw propertyError
      if (!property?.id) {
        return NextResponse.json(
          { success: false, error: 'Selected property is not part of this organization.' },
          { status: 400 }
        )
      }
      validatedPropertyId = property.id
    }
    const { data: newUser, error: createError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { role, organization_id: orgId, property_id: validatedPropertyId || null },
    })
    if (createError) throw createError
    if (!newUser?.user?.id) {
      return NextResponse.json({ success: false, error: 'Failed to create user.' }, { status: 500 })
    }

    const userId = newUser.user.id

    // upsert profile
    const { error: profileError } = await admin
      .from('user_profiles')
      .upsert({ id: userId, full_name, role })
    if (profileError) throw profileError

    const memberPayload: Record<string, any> = {
      user_id: userId,
      organization_id: orgId,
      role,
      ...(validatedPropertyId ? { property_id: validatedPropertyId } : {}),
    }

    let memberError: any = null
    try {
      const { error } = await admin.from('organization_members').insert(memberPayload)
      memberError = error
    } catch (err: any) {
      memberError = err
    }

    if (memberError) {
      const message = (memberError?.message || '').toLowerCase()
      const isMissingColumn = message.includes('property_id') || message.includes('column')
      if (!isMissingColumn) {
        throw memberError
      }
      // Fallback if the column does not exist yet
      const { error: fallbackError } = await admin
        .from('organization_members')
        .insert({ user_id: userId, organization_id: orgId, role })
      if (fallbackError) throw fallbackError
    }

    try {
      await sendInviteEmail(email, full_name, password, role)
    } catch (err) {
      console.error('[Settings.Team.Invite.POST] failed to send invite email', err)
      return NextResponse.json(
        { success: false, error: 'Invite created but email could not be sent. Check SMTP settings.' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      data: { user_id: userId, property_id: validatedPropertyId },
      message: 'Team member invited successfully.',
    })
  } catch (error) {
    console.error('[Settings.Team.Invite.POST] failed', error)
    return NextResponse.json({ success: false, error: 'Failed to invite team member.' }, { status: 500 })
  }
}
