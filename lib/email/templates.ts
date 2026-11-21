export type AgendaJob = {
  title: string
  time: string // "09:30 AM"
  clientName: string
  address: string
  price: number | null
}

type MorningAgendaInput = {
  name: string
  businessName: string | null
  dateLabel: string // "Monday, 16 November"
  jobs: AgendaJob[]
  dashboardUrl: string
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function morningAgendaEmail(input: MorningAgendaInput) {
  const { name, businessName, dateLabel, jobs, dashboardUrl } = input
  const firstName = name.split(' ')[0] || 'there'
  const count = jobs.length
  const total = jobs.reduce((sum, j) => sum + (j.price ?? 0), 0)

  const subject = `Your ${count} job${count === 1 ? '' : 's'} today, ${dateLabel}`

  const rowsHtml = jobs
    .map(
      (j) => `
      <tr>
        <td style="padding:12px 0;border-bottom:1px solid #e5e7eb;vertical-align:top;width:90px;color:#2563eb;font-weight:600;">
          ${escapeHtml(j.time)}
        </td>
        <td style="padding:12px 0;border-bottom:1px solid #e5e7eb;">
          <div style="font-weight:600;color:#111827;">${escapeHtml(j.title)}</div>
          <div style="color:#4b5563;font-size:14px;">${escapeHtml(j.clientName)}</div>
          <div style="color:#6b7280;font-size:13px;">${escapeHtml(j.address)}</div>
        </td>
      </tr>`
    )
    .join('')

  const html = `<!doctype html>
<html>
  <body style="margin:0;padding:24px;background:#f9fafb;font-family:Arial,Helvetica,sans-serif;">
    <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;padding:28px;border:1px solid #e5e7eb;">
      <h2 style="margin:0 0 4px;color:#111827;">Good morning, ${escapeHtml(firstName)}</h2>
      <p style="margin:0 0 20px;color:#6b7280;">
        ${escapeHtml(dateLabel)}${businessName ? ` · ${escapeHtml(businessName)}` : ''}
      </p>
      <p style="margin:0 0 12px;color:#111827;">
        You have <strong>${count}</strong> job${count === 1 ? '' : 's'} scheduled today${
          total > 0 ? ` (expected revenue: <strong>${total.toFixed(2)}</strong>)` : ''
        }.
      </p>
      <table style="width:100%;border-collapse:collapse;">${rowsHtml}</table>
      <p style="margin:24px 0 0;">
        <a href="${escapeHtml(dashboardUrl)}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600;">
          Open your route
        </a>
      </p>
      <p style="margin:24px 0 0;color:#9ca3af;font-size:12px;">
        You receive this email because Morning Job Agenda is turned on. You can turn it off anytime in Settings, then Notifications.
      </p>
    </div>
  </body>
</html>`

  const text = [
    `Good morning, ${firstName}`,
    `${dateLabel}${businessName ? ` - ${businessName}` : ''}`,
    '',
    `You have ${count} job${count === 1 ? '' : 's'} scheduled today${
      total > 0 ? ` (expected revenue: ${total.toFixed(2)})` : ''
    }:`,
    '',
    ...jobs.map((j) => `${j.time}  ${j.title} - ${j.clientName} (${j.address})`),
    '',
    `Open your route: ${dashboardUrl}`,
    '',
    'You receive this email because Morning Job Agenda is turned on. Turn it off anytime in Settings > Notifications.',
  ].join('\n')

  return { subject, html, text }
}