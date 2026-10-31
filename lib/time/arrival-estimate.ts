import { zonedTimeToUnixSeconds } from '@/lib/time/zoned-time'

export interface ArrivalEstimateStop {
  jobId: string
  scheduledTime: string
  latestStartTime: string | null
  estimatedDurationMinutes: number
}

export interface ArrivalEstimate {
  jobId: string
  arrivalSeconds: number
  displayTime: string
  isLate: boolean
}

/** Build conservative, appointment-aware arrival estimates from road-routing leg durations. */
export function estimateStopArrivals({
  date,
  timezone,
  departureSeconds,
  initialServiceSeconds = 0,
  stops,
  legDurationsSeconds,
}: {
  date: string
  timezone: string
  departureSeconds: number
  initialServiceSeconds?: number
  stops: ArrivalEstimateStop[]
  legDurationsSeconds: number[]
}): ArrivalEstimate[] | null {
  if (
    !Number.isFinite(departureSeconds) ||
    !Number.isFinite(initialServiceSeconds) ||
    initialServiceSeconds < 0 ||
    stops.length === 0 ||
    legDurationsSeconds.length !== stops.length ||
    legDurationsSeconds.some((duration) => !Number.isFinite(duration) || duration < 0)
  ) return null

  let availableAt = departureSeconds + initialServiceSeconds
  const estimates: ArrivalEstimate[] = []

  for (let index = 0; index < stops.length; index += 1) {
    const stop = stops[index]
    const scheduledAt = zonedTimeToUnixSeconds(date, stop.scheduledTime, timezone)
    const latestStartAt = stop.latestStartTime
      ? zonedTimeToUnixSeconds(date, stop.latestStartTime, timezone)
      : scheduledAt
    if (scheduledAt === null || latestStartAt === null || latestStartAt < scheduledAt) return null

    const roadArrival = availableAt + legDurationsSeconds[index]
    const arrivalSeconds = Math.max(roadArrival, scheduledAt)
    const roundedArrival = Math.ceil(arrivalSeconds / 300) * 300
    let displayTime: string
    try {
      displayTime = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        hour: 'numeric',
        minute: '2-digit',
      }).format(new Date(roundedArrival * 1000))
    } catch {
      return null
    }

    estimates.push({
      jobId: stop.jobId,
      arrivalSeconds,
      displayTime,
      isLate: arrivalSeconds > latestStartAt,
    })
    availableAt = arrivalSeconds + stop.estimatedDurationMinutes * 60
  }

  return estimates
}
