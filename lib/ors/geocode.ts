const ORS_BASE_URL = 'https://api.openrouteservice.org'

export interface GeocodedAddress {
  latitude: number
  longitude: number
}

export async function geocodeAddress(address: string): Promise<GeocodedAddress | null> {
  const apiKey = process.env.OPENROUTESERVICE_API_KEY
  if (!apiKey) throw new Error('OPENROUTESERVICE_API_KEY is not set')

  const url = new URL(`${ORS_BASE_URL}/geocode/search`)
  url.searchParams.set('api_key', apiKey)
  url.searchParams.set('text', address)
  url.searchParams.set('size', '1')

  const response = await fetch(url.toString())
  if (!response.ok) {
    console.error('ORS geocoding failed:', await response.text())
    return null
  }

  const data = await response.json()
  const feature = data?.features?.[0]
  if (!feature) return null

  const [longitude, latitude] = feature.geometry.coordinates
  return { latitude, longitude }
}