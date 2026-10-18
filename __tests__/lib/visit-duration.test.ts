import { getVisitDurationMinutes } from '@/lib/time/visit-duration'

describe('getVisitDurationMinutes', () => {
  it('returns the rounded elapsed visit duration', () => {
    expect(getVisitDurationMinutes('2026-10-18T08:00:00.000Z', '2026-10-18T09:12:00.000Z')).toBe(72)
  })

  it('returns zero for a valid zero-length measurement', () => {
    expect(getVisitDurationMinutes('2026-10-18T08:00:00.000Z', '2026-10-18T08:00:00.000Z')).toBe(0)
  })

  it('returns null for missing, invalid, or reversed timestamps', () => {
    expect(getVisitDurationMinutes(null, '2026-10-18T09:00:00.000Z')).toBeNull()
    expect(getVisitDurationMinutes('not-a-date', '2026-10-18T09:00:00.000Z')).toBeNull()
    expect(getVisitDurationMinutes('2026-10-18T09:00:00.000Z', '2026-10-18T08:00:00.000Z')).toBeNull()
  })
})
