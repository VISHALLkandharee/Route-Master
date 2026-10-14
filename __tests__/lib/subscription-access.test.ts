import { hasProductAccess } from '@/lib/subscription-access'

describe('hasProductAccess', () => {
  const now = Date.parse('2026-10-15T12:00:00.000Z')

  it.each(['active', 'past_due'])('allows %s accounts', (status) => {
    expect(hasProductAccess(status, null, now)).toBe(true)
  })

  it.each(['trial', 'trialing'])('allows %s accounts before the trial ends', (status) => {
    expect(hasProductAccess(status, '2026-10-16T12:00:00.000Z', now)).toBe(true)
  })

  it('blocks trials at or after their end time', () => {
    expect(hasProductAccess('trial', '2026-10-15T12:00:00.000Z', now)).toBe(false)
    expect(hasProductAccess('trial', '2026-10-15T11:59:59.000Z', now)).toBe(false)
  })

  it.each(['cancelled', 'unpaid', 'incomplete', 'unknown'])('blocks %s accounts', (status) => {
    expect(hasProductAccess(status, '2026-10-16T12:00:00.000Z', now)).toBe(false)
  })

  it('fails closed when a trial end date is missing or invalid', () => {
    expect(hasProductAccess('trial', null, now)).toBe(false)
    expect(hasProductAccess('trial', 'not-a-date', now)).toBe(false)
  })
})
