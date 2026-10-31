import { useRef, useState } from 'react'
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
  started_at: string | null
  completed_at: string | null
  start_location: string | null
  start_latitude: number | null
  start_longitude: number | null
  optimization_result: {
    orderedJobIds?: string[]
    appointmentConflictJobIds?: string[]
    unassignedJobIds?: string[]
    geometry?: [number, number][]
    activeSegment?: {
      startLocation: string
      latitude: number
      longitude: number
      orderedJobIds: string[]
      currentStopJobId: string | null
      replannedAt: string
    }
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
  mode: 'day' | 'remaining'
  expectedOrderedJobIds?: string[]
  date: string
  timezone: string
  workdayStart: string
  workdayEnd: string
  startLocation: string
  startLatitude: number
  startLongitude: number
  orderedJobIds: string[]
  skippedJobIds: string[]
  unlocatedJobIds: string[]
  infeasibleJobIds: string[]
  appointmentConflictJobIds: string[]
  totalJobCount: number
  appointmentSnapshot: {
    jobId: string
    latitude: number | null
    longitude: number | null
    scheduledTime: string
    latestStartTime: string | null
    estimatedDurationMinutes: number
  }[]
  distanceMeters: number
  driveDurationSeconds: number
  currentDistanceMeters: number | null
  currentDriveDurationSeconds: number | null
  serviceDurationMinutes: number
  geometry: [number, number][]
  stops: { jobId: string; scheduledTime?: string; latestStartTime?: string | null; estimatedDurationMinutes?: number }[]
  currentStopJobId?: string | null
}

export interface OptimizeProgress {
  step: string
  message: string
}

export function useOptimizeRoute() {
  const queryClient = useQueryClient()
  const operationId = useRef(0)
  const [progress, setProgress] = useState<OptimizeProgress | null>(null)
  const [isPending, setIsPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [proposal, setProposal] = useState<RouteProposal | null>(null)
  const [appliedProposal, setAppliedProposal] = useState<RouteProposal | null>(null)
  const [isApplying, setIsApplying] = useState(false)

  const mutate = async (
    {
      date,
      startLocation,
      startCoordinates,
      mode = 'day',
    }: {
      date: string;
      startLocation: string;
      startCoordinates?: { latitude: number; longitude: number } | null;
      mode?: 'day' | 'remaining';
    }
  ) => {
    const thisOperation = ++operationId.current
    setIsPending(true)
    setError(null)
    setProgress(null)
    setProposal(null)
    setAppliedProposal(null)

    try {
      const response = await fetch('/api/routes/optimize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date,
          start_location: startLocation,
          start_coordinates: startCoordinates ?? undefined,
          mode,
        }),
      })

      if (!response.body) throw new Error('No response stream')

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (thisOperation !== operationId.current) {
          await reader.cancel().catch(() => undefined)
          return
        }
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const data = JSON.parse(line.slice(6))

            if (data.step === 'error') {
              if (thisOperation !== operationId.current) return
              setError(data.message)
              toast.error(data.message)
              setIsPending(false)
              setProgress(null)
              return
            }

            if (data.step === 'preview' && data.proposal) {
              if (thisOperation !== operationId.current) return
              setProposal(data.proposal as RouteProposal)
              setProgress({ step: 'preview', message: 'Route proposal ready to review.' })
              setIsPending(false)
              return
            }

            if (thisOperation === operationId.current) setProgress({ step: data.step, message: data.message })
          } catch {
            // ignore parse errors
          }
        }
      }
    } catch {
      if (thisOperation !== operationId.current) return
      const message = 'Failed to optimize route. Please try again.'
      setError(message)
      toast.error(message)
    } finally {
      if (thisOperation === operationId.current) setIsPending(false)
    }
  }

  const apply = async () => {
    if (!proposal) return
    setIsApplying(true)
    try {
      const response = await fetch(proposal.mode === 'remaining' ? '/api/routes/replan' : '/api/routes/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: proposal.date,
          timezone: proposal.timezone,
          workdayStart: proposal.workdayStart,
          workdayEnd: proposal.workdayEnd,
          appointmentSnapshot: proposal.appointmentSnapshot,
          startLocation: proposal.startLocation,
          startLatitude: proposal.startLatitude,
          startLongitude: proposal.startLongitude,
          orderedJobIds: proposal.orderedJobIds,
          skippedJobIds: proposal.skippedJobIds,
          appointmentConflictJobIds: proposal.appointmentConflictJobIds,
          currentStopJobId: proposal.currentStopJobId ?? null,
          expectedOrderedJobIds: proposal.expectedOrderedJobIds ?? [],
        }),
      })
      const data = await response.json()
      if (!response.ok) {
        if (response.status === 409) {
          setProposal(null)
          setProgress(null)
        }
        throw new Error(data.error || 'Failed to save the reviewed route.')
      }

      queryClient.invalidateQueries({ queryKey: routesQueryKey(proposal.date) })
      queryClient.invalidateQueries({ queryKey: jobsQueryKey(proposal.date) })
      setAppliedProposal(proposal)
      if (proposal.skippedJobIds.length > 0) {
        toast.warning(`Road route saved for ${proposal.orderedJobIds.length} stops. ${proposal.skippedJobIds.length} job(s) still need a usable location.`)
      } else if (proposal.appointmentConflictJobIds.length > 0) {
        toast.warning(`Road route saved for ${proposal.orderedJobIds.length} stops. Review ${proposal.appointmentConflictJobIds.length} appointment-time warning(s).`)
      } else {
        toast.success('Reviewed route saved.')
      }
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

  const discard = (reason?: string) => {
    operationId.current += 1
    if (proposal) toast.info(reason ?? 'Proposal discarded. Your saved route was not changed.')
    else if (isPending && reason) toast.info(reason)
    setProposal(null)
    setProgress(null)
    setError(null)
    setIsPending(false)
  }

  const dismissApplied = () => setAppliedProposal(null)

  return { mutate, isPending, isApplying, progress, error, proposal, appliedProposal, apply, discard, dismissApplied }
}


export interface SMSPreviewMessage {
  jobId: string
  jobTitle: string
  clientName: string
  phoneLast4: string
  scheduledTime: string
  latestStartTime: string | null
  estimatedArrivalTime: string | null
  estimatedArrivalIsLate: boolean
  appointmentConflict: boolean
  message: string
}

export interface SMSPreviewResult {
  previewToken: string
  orderedJobIds: string[]
  deliveryMode: 'twilio' | 'mock' | 'unavailable'
  etaAvailable: boolean
  etaStartBasis: string | null
  messages: SMSPreviewMessage[]
  skipped: { jobId: string; clientName: string; jobTitle: string; reason: string }[]
}

interface SendSMSResult {
  submitted: number
  skipped: number
  failed: number
}

export function usePrepareSMS() {
  return useMutation({
    mutationFn: async (date: string): Promise<SMSPreviewResult> => {
      const response = await fetch('/api/sms/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, mode: 'preview' }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Failed to prepare arrival messages')
      return data as SMSPreviewResult
    },
    onError: (error: Error) => toast.error(error.message),
  })
}

export function useSendSMS() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: {
      date: string
      previewToken: string
      orderedJobIds: string[]
      messages: { jobId: string; message: string }[]
    }): Promise<SendSMSResult> => {
      const response = await fetch('/api/sms/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...input, mode: 'send' }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Failed to send SMS')
      return data
    },
    onSuccess: (data, input) => {
      queryClient.invalidateQueries({ queryKey: jobsQueryKey(input.date) })

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
      const { data: userData, error: userError } = await supabase.auth.getUser()
      if (userError || !userData.user) throw new Error('Your session expired. Please log in again.')

      const { data: startedRoute, error } = await supabase
        .from('routes')
        .update({
          status: 'in_progress',
          started_at: new Date().toISOString(),
        })
        .eq('scheduled_date', date)
        .eq('status', 'optimized')
        .select('id')
        .maybeSingle()

      if (error) throw error
      if (!startedRoute) throw new Error('This route is no longer ready to start. Refresh and check the workday status.')
    },
    onSuccess: (_, date) => {
      queryClient.invalidateQueries({ queryKey: routesQueryKey(date) })
      toast.success('Day started! Navigate to your first stop.')
    },
    onError: (error: Error) => toast.error(error.message || 'Failed to start day'),
  })
}
