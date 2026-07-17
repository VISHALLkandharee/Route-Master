import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'

export const clientsQueryKey = ['clients'] as const

export interface Client {
  id: string
  full_name: string
  email: string | null
  phone: string
  address: string
  latitude: number | null
  longitude: number | null
  preferred_contact: 'sms' | 'call' | 'none'
  service_type: 'pet_grooming' | 'pool_cleaning' | 'auto_detailing' | 'other'
  metadata: Record<string, unknown>
  notes: string | null
  created_at: string
  updated_at: string
}

export interface ClientInput {
  full_name: string
  email?: string
  phone: string
  address: string
  preferred_contact: 'sms' | 'call' | 'none'
  service_type: 'pet_grooming' | 'pool_cleaning' | 'auto_detailing' | 'other'
  notes?: string
}



async function geocodeClientAddress(address: string): Promise<{ latitude: number | null; longitude: number | null }> {
  try {
    const response = await fetch('/api/geocode', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address }),
    })
    const data = await response.json()
    return { latitude: data.latitude ?? null, longitude: data.longitude ?? null }
  } catch {
    return { latitude: null, longitude: null }
  }
}

// ─── Read ─────────────────────────────────────────────────────

export function useClients() {
  const supabase = createClient()

  return useQuery({
    queryKey: clientsQueryKey,
    queryFn: async (): Promise<Client[]> => {
      const { data, error } = await supabase
        .from('clients')
        .select('*')
        .is('deleted_at', null)
        .order('full_name', { ascending: true })

      if (error) throw error
      return data
    },
  })
}

// ─── Create ───────────────────────────────────────────────────

export function useCreateClient() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: ClientInput) => {
      const { data: userData, error: userError } = await supabase.auth.getUser()
      if (userError || !userData.user) throw new Error('Not authenticated')

      // Save immediately — no geocoding wait
      const { data, error } = await supabase
        .from('clients')
        .insert({ ...input, user_id: userData.user.id })
        .select()
        .single()

      if (error) throw error

      // Geocode in background — fire and forget
      geocodeClientAddress(input.address).then(({ latitude, longitude }) => {
        if (latitude && longitude) {
          supabase
            .from('clients')
            .update({ latitude, longitude })
            .eq('id', data.id)
            .then(() => {
              queryClient.invalidateQueries({ queryKey: clientsQueryKey })
            })
        }
      })

      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: clientsQueryKey })
      toast.success('Client added successfully')
    },
    onError: () => {
      toast.error('Failed to add client')
    },
  })
}

// ─── Update ───────────────────────────────────────────────────

export function useUpdateClient() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, ...input }: ClientInput & { id: string }) => {
      const { data: existing } = await supabase
        .from('clients')
        .select('address')
        .eq('id', id)
        .single()

      const addressChanged = existing?.address !== input.address

      // Save immediately
      const { data, error } = await supabase
        .from('clients')
        .update(input)
        .eq('id', id)
        .select()
        .single()

      if (error) throw error

      // Geocode in background only if address changed
      if (addressChanged) {
        geocodeClientAddress(input.address).then(({ latitude, longitude }) => {
          if (latitude && longitude) {
            supabase
              .from('clients')
              .update({ latitude, longitude })
              .eq('id', id)
              .then(() => {
                queryClient.invalidateQueries({ queryKey: clientsQueryKey })
              })
          }
        })
      }

      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: clientsQueryKey })
      toast.success('Client updated successfully')
    },
    onError: () => toast.error('Failed to update client'),
  })
}

// ─── Delete (Soft, Optimistic) ────────────────────────────────

export function useDeleteClient() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('clients')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id)

      if (error) throw error
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: clientsQueryKey })
      const previous = queryClient.getQueryData<Client[]>(clientsQueryKey)

      queryClient.setQueryData<Client[]>(clientsQueryKey, (old) =>
        old?.filter((c) => c.id !== id)
      )

      return { previous }
    },
    onError: (_err, _id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(clientsQueryKey, context.previous)
      }
      toast.error('Failed to delete client')
    },
    onSuccess: () => {
      toast.success('Client deleted')
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: clientsQueryKey })
    },
  })
}