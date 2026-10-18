export interface OrderedMapStop {
  address: string
  latitude?: number | null
  longitude?: number | null
}

function locationValue(location: OrderedMapStop): string {
  if (location.latitude != null && location.longitude != null) {
    return `${location.latitude},${location.longitude}`
  }
  return location.address.trim()
}

/**
 * Builds a Google Maps route for the selected stop, preserving the saved stop
 * order. Mobile Google Maps URLs support fewer waypoints, so later stops are
 * opened as the next route segment from the last stop in the previous segment.
 */
export function buildGoogleMapsDirectionsUrl(options: {
  start: OrderedMapStop
  stops: OrderedMapStop[]
  targetIndex: number
  maxWaypoints: number
}): string | null {
  const { start, stops, targetIndex, maxWaypoints } = options
  if (
    !Number.isInteger(targetIndex) ||
    targetIndex < 0 ||
    targetIndex >= stops.length ||
    !Number.isInteger(maxWaypoints) ||
    maxWaypoints < 0
  ) {
    return null
  }

  const target = locationValue(stops[targetIndex])
  if (!target) return null

  const firstStopIndexInSegment = Math.max(0, targetIndex - maxWaypoints)
  const origin = firstStopIndexInSegment === 0
    ? locationValue(start)
    : locationValue(stops[firstStopIndexInSegment - 1])
  if (!origin) return null

  const waypoints = stops
    .slice(firstStopIndexInSegment, targetIndex)
    .map(locationValue)
  if (waypoints.some((waypoint) => !waypoint)) return null

  const params = new URLSearchParams({
    api: "1",
    origin,
    destination: target,
    travelmode: "driving",
  })
  if (waypoints.length) params.set("waypoints", waypoints.join("|"))

  return `https://www.google.com/maps/dir/?${params.toString()}`
}

export function getGoogleMapsWaypointLimit(userAgent: string): number {
  return /Android|iPhone|iPad|iPod|Mobile/i.test(userAgent) ? 3 : 9
}
