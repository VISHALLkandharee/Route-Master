/** Return observed visit duration in whole minutes, or null for invalid timestamps. */
export function getVisitDurationMinutes(startedAt: string | null, completedAt: string | null) {
  if (!startedAt || !completedAt) return null

  const start = Date.parse(startedAt)
  const end = Date.parse(completedAt)
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null

  return Math.round((end - start) / 60_000)
}
