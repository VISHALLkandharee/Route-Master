import { isDateOnly } from '@/lib/validation'

describe('isDateOnly', () => {
  it('accepts valid ISO calendar dates', () => {
    expect(isDateOnly('2026-10-15')).toBe(true)
  })

  it.each(['2026-02-30', '2026-2-5', '', null, 20261015])(
    'rejects invalid date input %s',
    (value) => {
      expect(isDateOnly(value)).toBe(false)
    },
  )
})
