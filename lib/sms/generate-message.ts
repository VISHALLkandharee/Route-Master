import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

export interface MessageContext {
  clientName: string
  businessName: string
  jobTitle: string
  scheduledTime: string
  stopNumber: number
  totalStops: number
}

function formatTimeWindow(scheduledTime: string): string {
  const [h, m] = scheduledTime.split(':').map(Number)
  const start = new Date()
  start.setHours(h, m, 0, 0)
  const end = new Date(start.getTime() + 30 * 60 * 1000)

  const fmt = (d: Date) => {
    const hour = d.getHours()
    const min = d.getMinutes().toString().padStart(2, '0')
    const period = hour >= 12 ? 'PM' : 'AM'
    const displayHour = hour % 12 === 0 ? 12 : hour % 12
    return `${displayHour}:${min} ${period}`
  }

  return `${fmt(start)} - ${fmt(end)}`
}

function fallbackMessage(
  clientName: string,
  businessName: string,
  arrivalWindow: string
): string {
  const message = `Hi ${clientName}! ${businessName} is on the way and will arrive between ${arrivalWindow}. Reply STOP to opt out.`
  return message.length > 160 ? message.substring(0, 157) + '...' : message
}

export async function generateSMSMessage(context: MessageContext): Promise<string> {
  const { clientName, businessName, jobTitle, scheduledTime, stopNumber, totalStops } = context
  const arrivalWindow = formatTimeWindow(scheduledTime)

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 200,
      messages: [
        {
          role: 'user',
          content: `Write a friendly professional SMS for a mobile service client.

Details:
- Client: ${clientName}
- Business: ${businessName}
- Service: ${jobTitle}
- Arrival window: ${arrivalWindow}
- Stop ${stopNumber} of ${totalStops} today

Rules:
- Maximum 160 characters total
- Warm, professional tone
- Include business name and arrival window
- End with "Reply STOP to opt out"
- Return ONLY the message text, no quotes, no explanation`,
        },
      ],
    })

    const text =
      response.content[0].type === 'text' ? response.content[0].text.trim() : null

    if (!text) return fallbackMessage(clientName, businessName, arrivalWindow)
    return text.length > 160 ? text.substring(0, 157) + '...' : text
  } catch (error) {
    console.error('AI message generation failed, using fallback:', error)
    return fallbackMessage(clientName, businessName, arrivalWindow)
  }
}