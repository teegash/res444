import { Resend } from 'resend'

const apiKey = process.env.RESEND_API_KEY
const emailFrom = process.env.EMAIL_FROM

if (!apiKey) throw new Error('RESEND_API_KEY is missing')
if (!emailFrom) throw new Error('EMAIL_FROM is missing')

export const resend = new Resend(apiKey)

export async function sendEmail(params: {
  to: string | string[]
  subject: string
  html?: string
  text?: string
  replyTo?: string
}) {
  const { to, subject, html, text, replyTo } = params

  const { data, error } = await resend.emails.send({
    from: emailFrom,
    to: Array.isArray(to) ? to : [to],
    subject,
    html,
    text,
    ...(replyTo ? { replyTo } : {}),
  })

  if (error) {
    throw new Error(`Resend failed: ${error.message}`)
  }

  return data
}
