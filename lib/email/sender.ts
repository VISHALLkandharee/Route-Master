import { Resend } from 'resend'

export type SendEmailInput = {
  to: string
  subject: string
  html: string
  text: string
}

export type SendEmailResult =
  | { ok: true; mocked: boolean; messageId?: string }
  | { ok: false; error: string }

const DEFAULT_FROM = 'Routemaster <hello@contact.vishallkumar.com>'
const REPLY_TO = 'vk@vishallkumar.com'

let client: Resend | null = null

function getClient(): Resend | null {
  const key = process.env.RESEND_API_KEY
  if (!key) return null
  if (!client) client = new Resend(key)
  return client
}

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const resend = getClient()

  // No API key (local dev): log instead of sending, so nothing breaks.
  if (!resend) {
    console.log(
      `[email:mock] RESEND_API_KEY not set. Would send to ${input.to}: "${input.subject}"`
    )
    return { ok: true, mocked: true }
  }

  try {
    const { data, error } = await resend.emails.send({
      from: process.env.EMAIL_FROM ?? DEFAULT_FROM,
      to: input.to,
      replyTo: REPLY_TO,
      subject: input.subject,
      html: input.html,
      text: input.text,
    })

    if (error) {
      console.error('[email] Resend rejected the send:', error.message)
      return { ok: false, error: error.message }
    }

    return { ok: true, mocked: false, messageId: data?.id }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown email error'
    console.error('[email] send failed:', message)
    return { ok: false, error: message }
  }
}