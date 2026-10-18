import { generateSMSMessage } from '@/lib/sms/generate-message'

describe('generateSMSMessage', () => {
  it('uses a single scheduled time when no flexible start window is set', async () => {
    await expect(generateSMSMessage({
      clientName: 'Sarah Jones',
      businessName: 'Jake’s Mobile Grooming',
      jobTitle: 'Dog grooming',
      scheduledTime: '13:30:00',
    })).resolves.toBe('Hi Sarah, Jake’s Mobile Grooming expects to arrive for Dog grooming at 1:30 PM. Reply STOP to opt out.')
  })

  it('uses the saved appointment window when a latest start time is present', async () => {
    await expect(generateSMSMessage({
      clientName: 'Sarah Jones',
      businessName: 'Jake’s Mobile Grooming',
      jobTitle: 'Dog grooming',
      scheduledTime: '13:30:00',
      latestStartTime: '15:00:00',
    })).resolves.toContain('between 1:30 PM and 3 PM')
  })

  it('keeps the opt-out text intact when shortening a long message', async () => {
    const message = await generateSMSMessage({
      clientName: 'Sarah'.repeat(50),
      businessName: 'Mobile service'.repeat(50),
      jobTitle: 'A very long appointment name '.repeat(20),
      scheduledTime: '09:00:00',
      latestStartTime: '10:00:00',
    })

    expect(message.length).toBeLessThanOrEqual(160)
    expect(message).toMatch(/… Reply STOP to opt out\.$/)
  })
})
