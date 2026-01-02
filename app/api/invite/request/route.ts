import crypto from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendEmail } from '@/lib/email/resendClient'

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'nategadgets@gmail.com'

function generateCode() {
  return crypto.randomBytes(4).toString('hex').toUpperCase()
}

async function sendCodeEmail(code: string, expiresAt: Date) {
  const expiresFriendly = expiresAt.toUTCString()
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
  const gateUrl = `${siteUrl.replace(/\/$/, '')}/get-started`

  const text = [
    'New signup access code request.',
    '',
    `Code: ${code}`,
    `Expires: ${expiresFriendly}`,
    `Gate page: ${gateUrl}`,
  ].join('\n')

  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;color:#0f172a;padding:16px;">
      <h2 style="margin:0 0 12px 0;">New signup access code</h2>
      <p style="margin:0 0 8px 0;">Code: <strong>${code}</strong></p>
      <p style="margin:0 0 8px 0;">Expires: ${expiresFriendly}</p>
      <p style="margin:0 0 8px 0;">Gate page: <a href="${gateUrl}" style="color:#2563eb;text-decoration:none;">${gateUrl}</a></p>
    </div>
  `

  await sendEmail({
    to: ADMIN_EMAIL,
    subject: 'New signup access code',
    text,
    html,
  })
}

export async function POST(_req: NextRequest) {
  try {
    const admin = createAdminClient()
    if (!admin) {
      return NextResponse.json(
        { success: false, error: 'Server misconfigured: Supabase admin client unavailable.' },
        { status: 500 }
      )
    }

    const code = generateCode()
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours

    const { error: insertError } = await admin
      .from('invite_codes')
      .insert({
        code,
        expires_at: expiresAt.toISOString(),
        max_uses: 1,
        used_count: 0,
        active: true,
      })

    if (insertError) {
      console.error('[InviteCode] Insert error', insertError)
      return NextResponse.json({ success: false, error: 'Failed to create access code.' }, { status: 500 })
    }

    await sendCodeEmail(code, expiresAt)

    return NextResponse.json({
      success: true,
      message: 'Access code generated and sent to the admin email.',
    })
  } catch (error) {
    console.error('[InviteCode] Request failed', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to send access code.' },
      { status: 500 }
    )
  }
}
