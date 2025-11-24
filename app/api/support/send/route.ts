import { NextRequest, NextResponse } from 'next/server'
import nodemailer from 'nodemailer'
import { createClient } from '@/lib/supabase/server'

const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL || 'info@natibasolutions.com'
const SMTP_HOST = process.env.SMTP_HOST
const SMTP_PORT = process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : 587
const SMTP_USER = process.env.SMTP_USER
const SMTP_PASS = process.env.SMTP_PASS

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

    if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
      return NextResponse.json(
        { success: false, error: 'Email service is not configured.' },
        { status: 500 }
      )
    }

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    const fromAddress = process.env.SUPPORT_FROM || SUPPORT_EMAIL
    const requester = user?.email || 'Unknown user'

    const transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_PORT === 465,
      auth: {
        user: SMTP_USER,
        pass: SMTP_PASS,
      },
    })

    await transporter.sendMail({
      from: fromAddress,
      to: SUPPORT_EMAIL,
      subject: `[Support] ${subject}`,
      text: `${message}\n\nFrom: ${requester}`,
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[Support.Send] failed', error)
    return NextResponse.json({ success: false, error: 'Failed to send support email.' }, { status: 500 })
  }
}
