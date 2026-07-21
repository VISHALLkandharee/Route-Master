import { useState } from 'react'
import { jobsQueryKey } from './jobs'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'

export const routesQueryKey = (date: string) => ['routes', date] as const

export interface RouteRecord {
  id: string
  scheduled_date: string
  status: 'pending' | 'optimized' | 'in_progress' | 'completed'
  total_distance_km: number | null
  total_duration_mins: number | null
  start_location: string | null
  start_latitude: number | null
  start_longitude: number | null
  optimization_result: {
    orderedJobIds?: string[]
    geometry?: [number, number][]
  }
  is_recalculated: boolean
}

// ─── Read ─────────────────────────────────────────────────────

export function useRouteByDate(date: string | null) {
  const supabase = createClient()

  return useQuery({
    queryKey: routesQueryKey(date ?? ''),
    enabled: !!date,
    queryFn: async (): Promise<RouteRecord | null> => {
      const { data, error } = await supabase
        .from('routes')
        .select('*')
        .eq('scheduled_date', date)
        .maybeSingle()

      if (error) throw error
      return data
    },
  })
}


export function useLastStartLocation() {
  const supabase = createClient()

  return useQuery({
    queryKey: ['routes', 'last-start-location'],
    queryFn: async (): Promise<string | null> => {
      const { data, error } = await supabase
        .from('routes')
        .select('start_location')
        .not('start_location', 'is', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (error) throw error
      return data?.start_location ?? null
    },
  })
}

// ─── Optimize ─────────────────────────────────────────────────

interface OptimizeInput {
  date: string
  startLocation: string
}

interface OptimizeResponse {
  route: RouteRecord
  skippedJobIds: string[]
}

export interface OptimizeProgress {
  step: string
  message: string
}

export function useOptimizeRoute() {
  const queryClient = useQueryClient()
  const [progress, setProgress] = useState<OptimizeProgress | null>(null)
  const [isPending, setIsPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const mutate = async (
    { date, startLocation }: { date: string; startLocation: string },
    options?: { onSuccess?: () => void }
  ) => {
    setIsPending(true)
    setError(null)
    setProgress(null)

    try {
      const response = await fetch('/api/routes/optimize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date,
          start_location: startLocation,
        }),
      })

      if (!response.body) throw new Error('No response stream')

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const data = JSON.parse(line.slice(6))

            if (data.step === 'error') {
              setError(data.message)
              toast.error(data.message)
              setIsPending(false)
              setProgress(null)
              return
            }

            if (data.step === 'complete') {
              queryClient.invalidateQueries({
                queryKey: routesQueryKey(date),
              })
              queryClient.invalidateQueries({
                queryKey: jobsQueryKey(date),
              })

              if (data.skippedJobIds?.length > 0) {
                toast.warning(
                  `Route optimized — ${data.skippedJobIds.length} job(s) skipped (address not found)`
                )
              } else {
                toast.success('Route optimized successfully')
              }

              setProgress({ step: 'complete', message: 'Route optimized!' })
              setTimeout(() => setProgress(null), 2000)
              options?.onSuccess?.()
              setIsPending(false)
              return
            }

            setProgress({ step: data.step, message: data.message })
          } catch {
            // ignore parse errors
          }
        }
      }
    } catch (err) {
      const message = 'Failed to optimize route. Please try again.'
      setError(message)
      toast.error(message)
    } finally {
      setIsPending(false)
    }
  }

  return { mutate, isPending, progress, error }
}


interface SendSMSResult {
  sent: number
  skipped: number
  failed: number
}

export function useSendSMS() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (date: string): Promise<SendSMSResult> => {
      const response = await fetch('/api/sms/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Failed to send SMS')
      return data
    },
    onSuccess: (data, date) => {
      queryClient.invalidateQueries({ queryKey: jobsQueryKey(date) })

      const parts = []
      if (data.sent > 0) parts.push(`${data.sent} sent`)
      if (data.skipped > 0) parts.push(`${data.skipped} skipped`)
      if (data.failed > 0) parts.push(`${data.failed} failed`)

      if (data.failed > 0) {
        toast.error(`SMS complete: ${parts.join(', ')}`)
      } else {
        toast.success(`SMS complete: ${parts.join(', ')}`)
      }
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })
}



export function useStartDay() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (date: string) => {
      const { error: userError } = await supabase.auth.getUser()
      if (userError) throw new Error('Your session expired. Please log in again.')

      const { error } = await supabase
        .from('routes')
        .update({
          status: 'in_progress',
          started_at: new Date().toISOString(),
        })
        .eq('scheduled_date', date)

      if (error) throw error
    },
    onSuccess: (_, date) => {
      queryClient.invalidateQueries({ queryKey: routesQueryKey(date) })
      toast.success('Day started! Navigate to your first stop.')
    },
    onError: () => toast.error('Failed to start day'),
  })
}