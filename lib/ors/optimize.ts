const ORS_BASE_URL = 'https://api.openrouteservice.org'

export interface OptimizeJob {
  id: string
  latitude: number
  longitude: number
  estimatedDurationMinutes: number
  timeWindow: [number, number]
}

export interface OptimizeResult {
  orderedJobIds: string[]
  unassignedJobIds: string[]
  distanceMeters: number
  durationSeconds: number
  stops: { jobId: string; arrivalSeconds: number; serviceSeconds: number }[]
}

export async function optimizeRoute(
  start: { latitude: number; longitude: number },
  jobs: OptimizeJob[],
  vehicleTimeWindow: [number, number]
): Promise<OptimizeResult | null> {
  const apiKey = process.env.OPENROUTESERVICE_API_KEY
  if (!apiKey) throw new Error('OPENROUTESERVICE_API_KEY is not set')

  if (jobs.length === 0) {
    return { orderedJobIds: [], unassignedJobIds: [], distanceMeters: 0, durationSeconds: 0, stops: [] }
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
    service: Math.round(job.estimatedDurationMinutes * 60),
    time_windows: [job.timeWindow],
  })),
  vehicles: [
    {
      id: 1,
      profile: 'driving-car',
      start: [start.longitude, start.latitude],
      time_window: vehicleTimeWindow,
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
  const unassignedJobIds: string[] = (data?.unassigned ?? [])
    .map((job: { id: number }) => idMap.get(job.id))
    .filter((id: string | undefined): id is string => !!id)
  if (!route) {
    if (unassignedJobIds.length === jobs.length) {
      return { orderedJobIds: [], unassignedJobIds, distanceMeters: 0, durationSeconds: 0, stops: [] }
    }
    return null
  }

  const jobSteps = route.steps.filter((step: { type: string }) => step.type === 'job')
  const orderedJobIds: string[] = jobSteps
    .map((step: { id: number }) => idMap.get(step.id))
    .filter((id: string | undefined): id is string => !!id)

  const stops = jobSteps.flatMap((step: { id: number; arrival: number; service: number }) => {
    const jobId = idMap.get(step.id)
    return jobId
      ? [{ jobId, arrivalSeconds: step.arrival, serviceSeconds: step.service }]
      : []
  })
  return {
    orderedJobIds,
    unassignedJobIds,
    distanceMeters: route.distance,
    durationSeconds: route.duration,
    stops,
  }
}
