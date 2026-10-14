import { sendSMS, sendSMSWithTwilio } from '@/lib/sms/sender'

describe('sendSMS', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('uses a development mock without claiming that an SMS was sent', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch')
    jest.spyOn(console, 'info').mockImplementation(() => undefined)

    const result = await sendSMS('+15550000000', 'Test arrival update')

    expect(result.acceptedByProvider).toBe(false)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('fails closed when Twilio is not configured', async () => {
    await expect(sendSMSWithTwilio('+15550000000', 'Test arrival update', {})).rejects.toThrow(
      'SMS delivery is not configured',
    )
  })

  it('reports provider acceptance only after Twilio accepts the request', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ status: 'queued' }), { status: 201 }),
    )

    const result = await sendSMSWithTwilio('+15550000000', 'Test arrival update', {
      accountSid: 'ACtest',
      authToken: 'test-token',
      fromNumber: '+15551111111',
    })

    expect(result.acceptedByProvider).toBe(true)
    expect(global.fetch).toHaveBeenCalledTimes(1)
  })

  it('does not report provider acceptance when Twilio rejects the request', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ message: 'Rejected' }), { status: 400 }),
    )

    await expect(
      sendSMSWithTwilio('+15550000000', 'Test arrival update', {
        accountSid: 'ACtest',
        authToken: 'test-token',
        fromNumber: '+15551111111',
      }),
    ).rejects.toThrow('Rejected')
  })
})
