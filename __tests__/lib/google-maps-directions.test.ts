import {
  buildGoogleMapsDirectionsUrl,
  getGoogleMapsWaypointLimit,
} from '@/lib/maps/google-maps-directions'

const start = { address: 'Depot, Main Street' }
const stops = [
  { address: 'First Stop, Sukkur', latitude: 27.7, longitude: 68.8 },
  { address: 'Second Stop, Sukkur', latitude: 27.8, longitude: 68.9 },
  { address: 'Third Stop, Sukkur' },
  { address: 'Fourth Stop, Sukkur' },
  { address: 'Fifth Stop, Sukkur' },
]

describe('Google Maps directions links', () => {
  it('includes the saved start, destination, and ordered stops before the selected destination', () => {
    const url = buildGoogleMapsDirectionsUrl({ start, stops, targetIndex: 2, maxWaypoints: 3 })
    const parsed = new URL(url!)

    expect(parsed.searchParams.get('origin')).toBe('Depot, Main Street')
    expect(parsed.searchParams.get('destination')).toBe('Third Stop, Sukkur')
    expect(parsed.searchParams.get('waypoints')).toBe('27.7,68.8|27.8,68.9')
    expect(parsed.searchParams.get('travelmode')).toBe('driving')
  })

  it('uses coordinates when available and segments routes within mobile waypoint limits', () => {
    const url = buildGoogleMapsDirectionsUrl({ start, stops, targetIndex: 4, maxWaypoints: 3 })
    const parsed = new URL(url!)

    expect(parsed.searchParams.get('origin')).toBe('27.7,68.8')
    expect(parsed.searchParams.get('waypoints')).toBe('27.8,68.9|Third Stop, Sukkur|Fourth Stop, Sukkur')
    expect(parsed.searchParams.get('destination')).toBe('Fifth Stop, Sukkur')
  })

  it('returns null when origin or destination is unavailable', () => {
    expect(buildGoogleMapsDirectionsUrl({ start: { address: '' }, stops, targetIndex: 0, maxWaypoints: 3 })).toBeNull()
    expect(buildGoogleMapsDirectionsUrl({ start, stops: [{ address: '' }], targetIndex: 0, maxWaypoints: 3 })).toBeNull()
  })

  it('uses Google Maps supported waypoint counts by device class', () => {
    expect(getGoogleMapsWaypointLimit('Mozilla/5.0 (Linux; Android 14) Mobile')).toBe(3)
    expect(getGoogleMapsWaypointLimit('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).toBe(9)
  })
})
