describe('SMS message constraints', () => {
  it('messages must be 160 characters or fewer', () => {
    const message = 'Hi Sarah! Jake\'s Mobile Grooming is on the way and will arrive between 1:30 PM - 2:00 PM. Reply STOP to opt out.'
    expect(message.length).toBeLessThanOrEqual(160)
  })

  it('message contains required elements', () => {
    const message = 'Hi Sarah! Jake\'s Mobile Grooming is on the way and will arrive between 1:30 PM - 2:00 PM. Reply STOP to opt out.'
    expect(message).toContain('Reply STOP')
    expect(message.length).toBeGreaterThan(0)
  })
})