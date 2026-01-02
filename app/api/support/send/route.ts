import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sendEmail } from '@/lib/email/resendClient'

const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL || 'info@natibasolutions.com'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const { subject, message } = body || {}

    if (!subject || !message) {
      return NextResponse.json(
        { success: false, error: 'Subject and message are required.' },
        { status: 400 }
      )
    }

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    const requester = user?.email || 'Unknown user'

    await sendEmail({
      to: SUPPORT_EMAIL,
      subject: `[Support] ${subject}`,
      text: `${message}\n\nFrom: ${requester}`,
      ...(user?.email ? { replyTo: user.email } : {}),
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[Support.Send] failed', error)
    return NextResponse.json({ success: false, error: 'Failed to send support email.' }, { status: 500 })
  }
}
