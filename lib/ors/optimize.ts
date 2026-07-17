const ORS_BASE_URL = 'https://api.openrouteservice.org'

export interface OptimizeJob {
  id: string
  latitude: number
  longitude: number
}

export interface OptimizeResult {
  orderedJobIds: string[]
  distanceMeters: number
  durationSeconds: number
}

export async function optimizeRoute(
  start: { latitude: number; longitude: number },
  jobs: OptimizeJob[]
): Promise<OptimizeResult | null> {
  const apiKey = process.env.OPENROUTESERVICE_API_KEY
  if (!apiKey) throw new Error('OPENROUTESERVICE_API_KEY is not set')

  if (jobs.length === 0) {
    return { orderedJobIds: [], distanceMeters: 0, durationSeconds: 0 }
  }

  // VROOM (the engine behind ORS optimization) requires integer job IDs.
  // We map our real UUIDs to simple numbers, then translate the result back.
  const idMap = new Map<number, string>()
  jobs.forEach((job, index) => {
    idMap.set(index + 1, job.id)
  })

const body = {
  jobs: jobs.map((job, index) => ({
    id: index + 1,
    location: [job.longitude, job.latitude],
    service: 1800,
  })),
  vehicles: [
    {
      id: 1,
      profile: 'driving-car',
      start: [start.longitude, start.latitude],
    },
  ],
}

const response = await fetch(`${ORS_BASE_URL}/optimization`, {
  method: 'POST',
  headers: {
    Authorization: apiKey,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(body),
})

  if (!response.ok) {
    console.error('ORS optimization failed:', await response.text())
    return null
  }

  const data = await response.json()
  const route = data?.routes?.[0]
  if (!route) return null

  const orderedJobIds: string[] = route.steps
    .filter((step: { type: string }) => step.type === 'job')
    .map((step: { id: number }) => idMap.get(step.id))
    .filter((id: string | undefined): id is string => !!id)

  return {
    orderedJobIds,
    distanceMeters: route.distance,
    durationSeconds: route.duration,
  }
}