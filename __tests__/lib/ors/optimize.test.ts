import { optimizeRoute } from '@/lib/ors/optimize'

describe('optimizeRoute', () => {
  const originalApiKey = process.env.OPENROUTESERVICE_API_KEY
  const originalFetch = global.fetch

  beforeEach(() => {
    process.env.OPENROUTESERVICE_API_KEY = 'test-key'
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        routes: [{
          distance: 1200,
          duration: 300,
          steps: [
            { type: 'start' },
            { type: 'job', id: 1, arrival: 100, service: 60 },
          ],
        }],
        unassigned: [],
      }),
    }) as jest.MockedFunction<typeof fetch>
  })

  afterEach(() => {
    global.fetch = originalFetch
    if (originalApiKey === undefined) delete process.env.OPENROUTESERVICE_API_KEY
    else process.env.OPENROUTESERVICE_API_KEY = originalApiKey
  })

  const job = {
    id: 'job-1',
    latitude: 24.86,
    longitude: 67.01,
    estimatedDurationMinutes: 1,
  }

  it('sends time windows for schedule-constrained optimization', async () => {
    await optimizeRoute(
      { latitude: 24.8, longitude: 67.0 },
      [{ ...job, timeWindow: [1000, 2000] }],
      [500, 3000],
    )

    const request = JSON.parse(String(jest.mocked(fetch).mock.calls[0][1]?.body))
    expect(request.jobs[0].time_windows).toEqual([[1000, 2000]])
    expect(request.vehicles[0].time_window).toEqual([500, 3000])
  })

  it('omits time windows for road-first fallback so overdue or conflicting stops remain routable', async () => {
    await optimizeRoute(
      { latitude: 24.8, longitude: 67.0 },
      [job],
    )

    const request = JSON.parse(String(jest.mocked(fetch).mock.calls[0][1]?.body))
    expect(request.jobs[0]).not.toHaveProperty('time_windows')
    expect(request.vehicles[0]).not.toHaveProperty('time_window')
  })
})
