import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'

export const jobsQueryKey = (date: string) => ['jobs', date] as const

export interface Job {
  id: string
  client_id: string
  title: string
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled'
  scheduled_date: string
  scheduled_time: string
  estimated_duration: number
  order_index: number
  address: string
  latitude: number | null
  longitude: number | null
  notes: string | null
  sms_sent: boolean
  sms_sent_at: string | null
  ai_message: string | null
  price: number | null
  completed_at: string | null
  created_at: string
  updated_at: string
  client: {
    id: string
    full_name: string
    phone: string
  }
}
export interface JobInput {
  client_id: string
  title: string
  scheduled_date: string
  scheduled_time: string
  estimated_duration: number
  price?: number
  notes?: string
}

// ─── Read ─────────────────────────────────────────────────────

export function useJobsByDate(date: string | null) {
  const supabase = createClient()

  return useQuery({
    queryKey: jobsQueryKey(date ?? ''),
    enabled: !!date,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<Job[]> => {
      const { data, error } = await supabase
        .from('jobs')
        .select('*, client:clients(id, full_name, phone)')
        .eq('scheduled_date', date)
        .is('deleted_at', null)
        .order('order_index', { ascending: true })
        .order('scheduled_time', { ascending: true })

      if (error) {
        console.error('Error fetching jobs by date:', error)
        throw error
      }
      return data as unknown as Job[]
    },
  })
}

// ─── Create ───────────────────────────────────────────────────

export function useCreateJob() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: JobInput) => {
      const { data: userData, error: userError } = await supabase.auth.getUser()
      if (userError || !userData.user) {
        throw new Error('Your session expired. Please log in again.')
      }

      const { data: client, error: clientError } = await supabase
        .from('clients')
        .select('address, latitude, longitude')
        .eq('id', input.client_id)
        .single()

      if (clientError || !client) throw new Error('Client not found')

      const { data, error } = await supabase
        .from('jobs')
        .insert({
          user_id: userData.user.id,
          client_id: input.client_id,
          title: input.title,
          scheduled_date: input.scheduled_date,
          scheduled_time: input.scheduled_time,
          estimated_duration: input.estimated_duration,
          price: input.price ?? null,
          notes: input.notes || null,
          address: client.address,
          latitude: client.latitude,
          longitude: client.longitude,
        })
        .select('*, client:clients(id, full_name, phone)')
        .single()

      if (error) {
        console.error('Error creating job:', error)
        throw error
      }
      return data
    },
    onSuccess: (data: Job) => {
      queryClient.invalidateQueries({ queryKey: jobsQueryKey(data.scheduled_date) })
      toast.success('Job added successfully')
    },
    onError: (err: Error) => {
      console.error('Create job error:', err)
      toast.error(err.message || 'Failed to add job')
    },
  })
}

// ─── Update ───────────────────────────────────────────────────

export function useUpdateJob() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, ...input }: JobInput & { id: string }) => {
      const { error: userError } = await supabase.auth.getUser()
      if (userError) throw new Error('Your session expired. Please log in again.')

      const { data, error } = await supabase
        .from('jobs')
        .update({
          client_id: input.client_id,
          title: input.title,
          scheduled_date: input.scheduled_date,
          scheduled_time: input.scheduled_time,
          estimated_duration: input.estimated_duration,
          price: input.price ?? null,
          notes: input.notes || null,
        })
        .eq('id', id)
        .select('*, client:clients(id, full_name, phone)')
        .single()

      if (error) {
        console.error('Error updating job:', error)
        throw error
      }
      return data
    },
    onSuccess: (data: Job) => {
      queryClient.invalidateQueries({ queryKey: jobsQueryKey(data.scheduled_date) })
      toast.success('Job updated successfully')
    },
    onError: (err: Error) => {
      console.error('Update job error:', err)
      toast.error(err.message || 'Failed to update job')
    },
  })
}

// ─── Quick Status Update ──────────────────────────────────────

export function useUpdateJobStatus() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      id,
      status,
    }: { id: string; status: Job['status']; date: string }) => {
      const { error: userError } = await supabase.auth.getUser()
      if (userError) throw new Error('Your session expired. Please log in again.')

      const updates: Record<string, unknown> = { status }
      updates.completed_at = status === 'completed' ? new Date().toISOString() : null

      const { error } = await supabase.from('jobs').update(updates).eq('id', id)
      if (error) {
        console.error('Error updating job status:', error)
        throw error
      }
    },
    onMutate: async ({ id, status, date }) => {
      const key = jobsQueryKey(date)
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData<Job[]>(key)

      queryClient.setQueryData<Job[]>(key, (old) =>
        old?.map((j) =>
          j.id === id
            ? {
                ...j,
                status,
                completed_at: status === 'completed' ? new Date().toISOString() : null,
              }
            : j
        )
      )

      return { previous, key }
    },
    onError: (err: Error, _vars, context) => {
      console.error('Update job status error:', err)
      if (context?.previous && context?.key) {
        queryClient.setQueryData(context.key, context.previous)
      }
      toast.error(err.message || 'Failed to update job')
    },
    onSuccess: () => {
      toast.success('Job updated')
    },
    onSettled: (_data, _err, vars) => {
      queryClient.invalidateQueries({ queryKey: jobsQueryKey(vars.date) })
    },
  })
}

// ─── Delete (Soft, Optimistic) ────────────────────────────────

export function useDeleteJob() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id }: { id: string; date: string }) => {
      const { error: userError } = await supabase.auth.getUser()
      if (userError) throw new Error('Your session expired. Please log in again.')

      const { error } = await supabase
        .from('jobs')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id)

      if (error) {
        console.error('Error deleting job:', error)
        throw error
      }
    },
    onMutate: async ({ id, date }) => {
      const key = jobsQueryKey(date)
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData<Job[]>(key)

      queryClient.setQueryData<Job[]>(key, (old) => old?.filter((j) => j.id !== id))

      return { previous, key }
    },
    onError: (err: Error, _vars, context) => {
      console.error('Delete job error:', err)
      if (context?.previous && context?.key) {
        queryClient.setQueryData(context.key, context.previous)
      }
      toast.error(err.message || 'Failed to delete job')
    },
    onSuccess: () => {
      toast.success('Job deleted')
    },
    onSettled: (_data, _err, vars) => {
      queryClient.invalidateQueries({ queryKey: jobsQueryKey(vars.date) })
    },
  })
}