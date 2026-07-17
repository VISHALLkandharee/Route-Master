// ─────────────────────────────────────────────────────────────
// SMS SENDER
//
// CURRENT MODE: Development (mock — logs to terminal)
//
// TODO: TWILIO SWAP — when ready for production:
// 1. npm install twilio
// 2. Add to .env.local:
//    TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
//    TWILIO_AUTH_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
//    TWILIO_PHONE_NUMBER=+1xxxxxxxxxx
// 3. Replace the mock block below with the Twilio block
// ─────────────────────────────────────────────────────────────

export interface SMSResult {
  success: boolean
  to: string
  message: string
}

export async function sendSMS(to: string, message: string): Promise<SMSResult> {

  // ── DEVELOPMENT MOCK ─────────────────────────────────────────
  console.log('\n📱 [SMS — Development Mode]')
  console.log(`   To:      ${to}`)
  console.log(`   Message: ${message}`)
  console.log('─'.repeat(60))
  return { success: true, to, message }

  // ── PRODUCTION (Twilio) — uncomment to activate ──────────────
  // import twilio from 'twilio'
  // const client = twilio(
  //   process.env.TWILIO_ACCOUNT_SID!,
  //   process.env.TWILIO_AUTH_TOKEN!
  // )
  // await client.messages.create({
  //   to,
  //   from: process.env.TWILIO_PHONE_NUMBER!,
  //   body: message,
  // })
  // return { success: true, to, message }
}