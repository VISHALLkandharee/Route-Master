import { rateLimit } from '@/lib/rate-limit'

describe('rateLimit', () => {
  it('allows requests within the limit', async () => {
    const result = await rateLimit('test-user-1', { windowMs: 60000, max: 5 })
    expect(result.success).toBe(true)
    expect(result.remaining).toBe(4)
  })

  it('blocks requests that exceed the limit', async () => {
    const id = 'test-user-2'
    for (let i = 0; i < 5; i++) {
      await rateLimit(id, { windowMs: 60000, max: 5 })
    }
    const result = await rateLimit(id, { windowMs: 60000, max: 5 })
    expect(result.success).toBe(false)
    expect(result.remaining).toBe(0)
  })

  it('resets after the window expires', async () => {
    const id = 'test-user-3'
    await rateLimit(id, { windowMs: 100, max: 1 })
    await rateLimit(id, { windowMs: 100, max: 1 })

    await new Promise(resolve => setTimeout(resolve, 150))

    const result = await rateLimit(id, { windowMs: 100, max: 1 })
    expect(result.success).toBe(true)
  })
})
