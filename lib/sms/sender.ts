export interface SMSResult {
  acceptedByProvider: boolean
  to: string
  message: string
}

export interface TwilioCredentials {
  accountSid?: string
  authToken?: string
  fromNumber?: string
}

export function isSmsDeliveryConfigured(
  environment: NodeJS.ProcessEnv = process.env,
) {
  return environment.NODE_ENV !== 'production' || Boolean(
    environment.TWILIO_ACCOUNT_SID &&
      environment.TWILIO_AUTH_TOKEN &&
      environment.TWILIO_PHONE_NUMBER,
  )
}

export async function sendSMSWithTwilio(
  to: string,
  message: string,
  credentials: TwilioCredentials,
): Promise<SMSResult> {
  const { accountSid, authToken, fromNumber } = credentials
  if (!accountSid || !authToken || !fromNumber) {
    throw new Error('SMS delivery is not configured. Add the Twilio production credentials.')
  }

  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ To: to, From: fromNumber, Body: message }),
      signal: AbortSignal.timeout(15_000),
      cache: 'no-store',
    },
  )

  const result = await response.json().catch(() => null) as
    | { message?: string; code?: number }
    | null
  if (!response.ok) {
    throw new Error(result?.message ?? `SMS provider rejected the message (${response.status}).`)
  }

  return { acceptedByProvider: true, to, message }
}

export async function sendSMS(to: string, message: string): Promise<SMSResult> {
  if (process.env.NODE_ENV !== 'production') {
    console.info('[SMS development mock] A message was prepared; no SMS was sent.')
    return { acceptedByProvider: false, to, message }
  }

  return sendSMSWithTwilio(to, message, {
    accountSid: process.env.TWILIO_ACCOUNT_SID,
    authToken: process.env.TWILIO_AUTH_TOKEN,
    fromNumber: process.env.TWILIO_PHONE_NUMBER,
  })
}
