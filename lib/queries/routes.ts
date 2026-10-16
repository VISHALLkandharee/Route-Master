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

export interface RouteProposal {
  date: string
  startLocation: string
  startLatitude: number
  startLongitude: number
  orderedJobIds: string[]
  skippedJobIds: string[]
  distanceMeters: number
  driveDurationSeconds: number
  currentDistanceMeters: number | null
  currentDriveDurationSeconds: number | null
  serviceDurationMinutes: number
  geometry: [number, number][]
  stops: { jobId: string; scheduledTime?: string; estimatedDurationMinutes?: number }[]
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
  const [proposal, setProposal] = useState<RouteProposal | null>(null)
  const [isApplying, setIsApplying] = useState(false)

  const mutate = async (
    {
      date,
      startLocation,
      startCoordinates,
    }: {
      date: string;
      startLocation: string;
      startCoordinates?: { latitude: number; longitude: number } | null;
    }
  ) => {
    setIsPending(true)
    setError(null)
    setProgress(null)
    setProposal(null)

    try {
      const response = await fetch('/api/routes/optimize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date,
          start_location: startLocation,
          start_coordinates: startCoordinates ?? undefined,
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

            if (data.step === 'preview' && data.proposal) {
              setProposal(data.proposal as RouteProposal)
              setProgress({ step: 'preview', message: 'Route proposal ready to review.' })
              setIsPending(false)
              return
            }

            setProgress({ step: data.step, message: data.message })
          } catch {
            // ignore parse errors
          }
        }
      }
    } catch {
      const message = 'Failed to optimize route. Please try again.'
      setError(message)
      toast.error(message)
    } finally {
      setIsPending(false)
    }
  }

  const apply = async () => {
    if (!proposal) return
    setIsApplying(true)
    try {
      const response = await fetch('/api/routes/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: proposal.date,
          startLocation: proposal.startLocation,
          startLatitude: proposal.startLatitude,
          startLongitude: proposal.startLongitude,
          orderedJobIds: proposal.orderedJobIds,
          skippedJobIds: proposal.skippedJobIds,
        }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Failed to save the reviewed route.')

      queryClient.invalidateQueries({ queryKey: routesQueryKey(proposal.date) })
      queryClient.invalidateQueries({ queryKey: jobsQueryKey(proposal.date) })
      toast.success('Reviewed route saved.')
      setProposal(null)
      setProgress(null)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save the reviewed route.'
      setError(message)
      toast.error(message)
    } finally {
      setIsApplying(false)
    }
  }

  const discard = () => {
    setProposal(null)
    setProgress(null)
    setError(null)
  }

  return { mutate, isPending, isApplying, progress, error, proposal, apply, discard }
}


interface SendSMSResult {
  submitted: number
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
      if (data.submitted > 0) parts.push(`${data.submitted} submitted to the SMS provider`)
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
