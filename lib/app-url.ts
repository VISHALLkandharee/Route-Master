const PRODUCTION_APP_URL = 'https://routemaster.vishallkumar.com'

export function getAppUrl() {
  if (process.env.NODE_ENV === 'production') return PRODUCTION_APP_URL
  return process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
}
