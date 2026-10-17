import { zonedTimeToUnixSeconds } from '@/lib/time/zoned-time'

describe('zonedTimeToUnixSeconds', () => {
  it('converts a UTC wall-clock time to Unix seconds', () => {
    expect(zonedTimeToUnixSeconds('2026-01-15', '09:30', 'UTC')).toBe(
      Math.floor(Date.parse('2026-01-15T09:30:00Z') / 1000),
    )
  })

  it('uses the account timezone rather than the server timezone', () => {
    expect(zonedTimeToUnixSeconds('2026-01-15', '09:30', 'Asia/Karachi')).toBe(
      Math.floor(Date.parse('2026-01-15T04:30:00Z') / 1000),
    )
  })

  it('rejects invalid calendar dates and clock values', () => {
    expect(zonedTimeToUnixSeconds('2026-02-30', '09:30', 'UTC')).toBeNull()
    expect(zonedTimeToUnixSeconds('2026-01-15', '24:00', 'UTC')).toBeNull()
  })

  it('rejects a local appointment time that does not exist during a DST change', () => {
    expect(zonedTimeToUnixSeconds('2026-03-08', '02:30', 'America/New_York')).toBeNull()
  })

  it('rejects unknown IANA timezones', () => {
    expect(zonedTimeToUnixSeconds('2026-01-15', '09:30', 'Not/A-Timezone')).toBeNull()
  })
})
