import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { format } from 'date-fns'

export const dashboardQueryKey = ['dashboard'] as const

export interface UpcomingJob {
  id: string
  title: string
  scheduled_time: string
  status: string
  client_name: string
  address: string
}

export interface DashboardStats {
  profile: {
    full_name: string
    business_name: string | null
    subscription_status: string
    trial_ends_at: string
  }
  jobsToday: number
  completedToday: number
  activeClients: number
  lowStockCount: number
  revenueToday: number
  supplyCostToday: number
  profitToday: number
  upcomingJobs: UpcomingJob[]
}

interface SupplyLogRow {
  quantity: number
  supply: { cost_per_unit: number | null } | null
}

interface UpcomingJobRow {
  id: string
  title: string
  scheduled_time: string
  status: string
  address: string
  client: { full_name: string } | null
}

export function useDashboardStats() {
  const supabase = createClient()
  const today = format(new Date(), 'yyyy-MM-dd')

  return useQuery({
    queryKey: [...dashboardQueryKey, today],
    queryFn: async (): Promise<DashboardStats> => {
      const [
        profileResult,
        jobsTodayResult,
        completedTodayResult,
        clientsResult,
        lowStockResult,
        revenueResult,
        supplyCostResult,
        upcomingResult,
      ] = await Promise.all([
        supabase
          .from('users')
          .select('full_name, business_name, subscription_status, trial_ends_at')
          .single(),

        supabase
          .from('jobs')
          .select('id', { count: 'exact', head: true })
          .eq('scheduled_date', today)
          .is('deleted_at', null),

        supabase
          .from('jobs')
          .select('id', { count: 'exact', head: true })
          .eq('scheduled_date', today)
          .eq('status', 'completed')
          .is('deleted_at', null),

        supabase
          .from('clients')
          .select('id', { count: 'exact', head: true })
          .is('deleted_at', null),

        supabase
          .from('supplies')
          .select('id', { count: 'exact', head: true })
          .eq('is_low_stock', true)
          .is('deleted_at', null),

        supabase
          .from('jobs')
          .select('price')
          .eq('scheduled_date', today)
          .eq('status', 'completed')
          .is('deleted_at', null),

        // Supply cost for jobs completed today
        supabase
          .from('supply_logs')
          .select('quantity, supply:supplies(cost_per_unit), job:jobs!inner(scheduled_date, status)')
          .eq('job.scheduled_date', today)
          .eq('job.status', 'completed'),

        supabase
          .from('jobs')
          .select('id, title, scheduled_time, status, address, client:clients(full_name)')
          .eq('scheduled_date', today)
          .in('status', ['pending', 'in_progress'])
          .is('deleted_at', null)
          .order('order_index', { ascending: true })
          .order('scheduled_time', { ascending: true })
          .limit(3),
      ])

      const revenueToday = (revenueResult.data ?? []).reduce(
        (sum: number, job: { price: number | null }) => sum + (job.price ?? 0),
        0
      )

      const supplyCostToday = (
        (supplyCostResult.data ?? []) as unknown as SupplyLogRow[]
      ).reduce((sum, log) => {
        const cost = log.supply?.cost_per_unit ?? 0
        return sum + cost * log.quantity
      }, 0)

      const profitToday = revenueToday - supplyCostToday

      const upcomingJobs: UpcomingJob[] = (
        (upcomingResult.data ?? []) as unknown as UpcomingJobRow[]
      ).map((job) => ({
        id: job.id,
        title: job.title,
        scheduled_time: job.scheduled_time,
        status: job.status,
        client_name: job.client?.full_name ?? 'Unknown',
        address: job.address,
      }))

      if (!profileResult.data) {
        throw new Error('Failed to load profile')
      }

      return {
        profile: profileResult.data,
        jobsToday: jobsTodayResult.count ?? 0,
        completedToday: completedTodayResult.count ?? 0,
        activeClients: clientsResult.count ?? 0,
        lowStockCount: lowStockResult.count ?? 0,
        revenueToday,
        supplyCostToday,
        profitToday,
        upcomingJobs,
      }
    },
    staleTime: 5 * 60 * 1000,
    refetchInterval: 60 * 1000,
  })
}