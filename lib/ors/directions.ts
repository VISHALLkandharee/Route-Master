const ORS_BASE_URL = 'https://api.openrouteservice.org'

export interface DirectionsResult {
  distanceMeters: number
  durationSeconds: number
  geometry: [number, number][] // [longitude, latitude] pairs, in path order
}

export async function getDirections(
  coordinates: [number, number][] // [longitude, latitude] pairs, in stop visiting order
): Promise<DirectionsResult | null> {
  const apiKey = process.env.OPENROUTESERVICE_API_KEY
  if (!apiKey) throw new Error('OPENROUTESERVICE_API_KEY is not set')

  if (coordinates.length < 2) return null

  const response = await fetch(`${ORS_BASE_URL}/v2/directions/driving-car/geojson`, {
    method: 'POST',
    headers: {
      Authorization: apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ coordinates }),
  })

  if (!response.ok) {
    console.error('ORS directions failed:', await response.text())
    return null
  }

  const data = await response.json()
  const feature = data?.features?.[0]
  if (!feature) return null

  return {
    distanceMeters: feature.properties.summary.distance,
    durationSeconds: feature.properties.summary.duration,
    geometry: feature.geometry.coordinates,
  }
}