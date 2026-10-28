export const MAX_SMS_CHARACTERS = 160
export const OPT_OUT_SUFFIX = ' Reply STOP to opt out.'

export interface MessageContext {
  clientName: string
  businessName: string
  jobTitle: string
  scheduledTime: string
  latestStartTime?: string | null
}

function formatTime(value: string) {
  const match = /^([01]\d|2[0-3]):([0-5]\d)/.exec(value)
  if (!match) return value

  const hour = Number(match[1])
  const minute = match[2]
  const period = hour >= 12 ? 'PM' : 'AM'
  const displayHour = hour % 12 || 12
  return minute === '00' ? `${displayHour} ${period}` : `${displayHour}:${minute} ${period}`
}

function truncateWithOptOut(message: string) {
  if (message.length <= MAX_SMS_CHARACTERS) return message

  const prefixLimit = MAX_SMS_CHARACTERS - OPT_OUT_SUFFIX.length
  const prefix = message.slice(0, -OPT_OUT_SUFFIX.length).trimEnd()
  let compactPrefix = ''
  for (const character of Array.from(prefix)) {
    if ((compactPrefix + character + '…').length > prefixLimit) break
    compactPrefix += character
  }
  compactPrefix = `${compactPrefix.trimEnd()}…`
  return `${compactPrefix}${OPT_OUT_SUFFIX}`
}

/** Build a deterministic SMS without relying on an AI provider or paid API key. */
export async function generateSMSMessage(context: MessageContext): Promise<string> {
  const clientName = context.clientName.trim().split(/\s+/)[0] || 'there'
  const businessName = context.businessName.trim() || 'Your service provider'
  const service = context.jobTitle.trim() || 'your service'
  const start = formatTime(context.scheduledTime)
  const arrival = context.latestStartTime
    ? `between ${start} and ${formatTime(context.latestStartTime)}`
    : `at ${start}`

  return truncateWithOptOut(
    `Hi ${clientName}, ${businessName} expects to arrive for ${service} ${arrival}.${OPT_OUT_SUFFIX}`,
  )
}
