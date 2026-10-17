function parseLocalParts(date: string, time: string) {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  const timeMatch = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(time)
  if (!dateMatch || !timeMatch) return null

  const [, yearText, monthText, dayText] = dateMatch
  const [, hourText, minuteText, secondText = '0'] = timeMatch
  const parts = {
    year: Number(yearText),
    month: Number(monthText),
    day: Number(dayText),
    hour: Number(hourText),
    minute: Number(minuteText),
    second: Number(secondText),
  }
  const check = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second))
  if (
    check.getUTCFullYear() !== parts.year ||
    check.getUTCMonth() + 1 !== parts.month ||
    check.getUTCDate() !== parts.day ||
    parts.hour > 23 || parts.minute > 59 || parts.second > 59
  ) return null
  return parts
}

/** Convert a local wall-clock date/time to a Unix timestamp using its IANA timezone. */
export function zonedTimeToUnixSeconds(date: string, time: string, timeZone: string): number | null {
  const target = parseLocalParts(date, time)
  if (!target) return null

  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    })
    const targetAsUtc = Date.UTC(
      target.year,
      target.month - 1,
      target.day,
      target.hour,
      target.minute,
      target.second
    )
    let guess = targetAsUtc

    // Correct the UTC guess by comparing its rendered wall-clock time in the
    // requested zone. This avoids relying on the server's local timezone.
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const values = Object.fromEntries(
        formatter.formatToParts(new Date(guess)).map(({ type, value }) => [type, value])
      )
      const renderedAsUtc = Date.UTC(
        Number(values.year),
        Number(values.month) - 1,
        Number(values.day),
        Number(values.hour),
        Number(values.minute),
        Number(values.second)
      )
      const correction = targetAsUtc - renderedAsUtc
      if (correction === 0) return Math.floor(guess / 1000)
      guess += correction
    }
  } catch {
    return null
  }

  // Non-existent wall-clock times during a daylight-saving transition do not
  // round-trip. Reject them rather than silently moving an appointment.
  return null
}
