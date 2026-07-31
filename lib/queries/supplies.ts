import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'

export const suppliesQueryKey = ['supplies'] as const

export interface Supply {
  id: string
  name: string
  description: string | null
  unit: 'ml' | 'l' | 'g' | 'kg' | 'pieces' | 'bottles' | 'boxes' | 'other'
  current_quantity: number
  minimum_quantity: number
  cost_per_unit: number | null
  is_low_stock: boolean
  created_at: string
  updated_at: string
}


export interface SupplyLog {
  id: string
  supply_id: string
  job_id: string
  quantity: number
  notes: string | null
  created_at: string
  supply: { name: string; unit: string }
  job: { title: string; scheduled_date: string }
}

export interface SupplyInput {
  name: string
  description?: string
  unit: Supply['unit']
  current_quantity: number
  minimum_quantity: number
  cost_per_unit?: number
}

export interface SupplyLogEntry {
  supply_id: string
  quantity: number
}

// ─── Read ─────────────────────────────────────────────────────

export function useSupplies() {
  const supabase = createClient()

  return useQuery({
    queryKey: suppliesQueryKey,
    queryFn: async (): Promise<Supply[]> => {
      const { data, error } = await supabase
        .from('supplies')
        .select('*')
        .is('deleted_at', null)
        .order('name', { ascending: true })
      if (error) throw error
      return data
    },
  })
}

// ─── Create ───────────────────────────────────────────────────

export function useCreateSupply() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: SupplyInput) => {
      const { data: userData, error: userError } = await supabase.auth.getUser()
      if (userError || !userData.user)
        throw new Error('Your session expired. Please log in again.')

      const { data, error } = await supabase
        .from('supplies')
        .insert({ ...input, user_id: userData.user.id })
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: suppliesQueryKey })
      toast.success('Supply added successfully')
    },
    onError: () => toast.error('Failed to add supply'),
  })
}

// ─── Update ───────────────────────────────────────────────────

export function useUpdateSupply() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, ...input }: SupplyInput & { id: string }) => {
      const { error: userError } = await supabase.auth.getUser()
      if (userError) throw new Error('Your session expired. Please log in again.')

      const { data, error } = await supabase
        .from('supplies')
        .update(input)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: suppliesQueryKey })
      toast.success('Supply updated successfully')
    },
    onError: () => toast.error('Failed to update supply'),
  })
}

// ─── Restock (add to current quantity) ───────────────────────

export function useRestockSupply() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      id,
      addQuantity,
      currentQuantity,
    }: {
      id: string
      addQuantity: number
      currentQuantity: number
    }) => {
      const { error: userError } = await supabase.auth.getUser()
      if (userError) throw new Error('Your session expired. Please log in again.')

      const { data, error } = await supabase
        .from('supplies')
        .update({ current_quantity: currentQuantity + addQuantity })
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: suppliesQueryKey })
      toast.success('Supply restocked successfully')
    },
    onError: () => toast.error('Failed to restock supply'),
  })
}

// ─── Delete (soft, optimistic) ────────────────────────────────

export function useDeleteSupply() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const { error: userError } = await supabase.auth.getUser()
      if (userError) throw new Error('Your session expired. Please log in again.')

      const { error } = await supabase
        .from('supplies')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: suppliesQueryKey })
      const previous = queryClient.getQueryData<Supply[]>(suppliesQueryKey)
      queryClient.setQueryData<Supply[]>(suppliesQueryKey, (old) =>
        old?.filter((s) => s.id !== id)
      )
      return { previous }
    },
    onError: (_err, _id, context) => {
      if (context?.previous)
        queryClient.setQueryData(suppliesQueryKey, context.previous)
      toast.error('Failed to delete supply')
    },
    onSuccess: () => toast.success('Supply deleted'),
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: suppliesQueryKey }),
  })
}

// ─── Log usage against a job ──────────────────────────────────

export function useLogSupplyUsage() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      jobId,
      entries,
    }: {
      jobId: string
      entries: SupplyLogEntry[]
    }) => {
      const { data: userData, error: userError } = await supabase.auth.getUser()
      if (userError || !userData.user)
        throw new Error('Your session expired. Please log in again.')

      const validEntries = entries.filter((e) => e.quantity > 0)
      if (validEntries.length === 0)
        throw new Error('Enter a quantity for at least one supply')

      const logs = validEntries.map((e) => ({
        user_id: userData.user!.id,
        job_id: jobId,
        supply_id: e.supply_id,
        quantity: e.quantity,
      }))

      const { error } = await supabase.from('supply_logs').insert(logs)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: suppliesQueryKey })
      toast.success('Supply usage logged successfully')
    },
    onError: (error: Error) =>
      toast.error(error.message || 'Failed to log supply usage'),
  })
}



export function useSupplyLogs(supplyId?: string) {
  const supabase = createClient()

  return useQuery({
    queryKey: ['supply_logs', supplyId ?? 'all'],
    queryFn: async (): Promise<SupplyLog[]> => {
      let query = supabase
        .from('supply_logs')
        .select(`
          id, supply_id, job_id, quantity, notes, created_at,
          supply:supplies(name, unit),
          job:jobs(title, scheduled_date)
        `)
        .order('created_at', { ascending: false })
        .limit(50)

      if (supplyId) {
        query = query.eq('supply_id', supplyId)
      }

      const { data, error } = await query
      if (error) throw error
      return data as unknown as SupplyLog[]
    },
    staleTime: 2 * 60 * 1000,
  })
}