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
  upcomingJobs: UpcomingJob[]
}

interface RawUpcomingJob {
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
    staleTime: 60 * 1000,
    queryFn: async (): Promise<DashboardStats> => {
      const [
        profileResult,
        jobsTodayResult,
        completedTodayResult,
        clientsResult,
        lowStockResult,
        revenueResult,
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

      if (profileResult.error) {
        console.error('Error fetching dashboard profile:', profileResult.error)
      }

      const revenueToday = (revenueResult.data ?? []).reduce(
        (sum: number, job: { price: number | null }) => sum + (job.price ?? 0),
        0
      )

      const upcomingRaw = (upcomingResult.data ?? []) as unknown as RawUpcomingJob[]

      const upcomingJobs: UpcomingJob[] = upcomingRaw.map((job) => ({
        id: job.id,
        title: job.title,
        scheduled_time: job.scheduled_time,
        status: job.status,
        client_name: job.client?.full_name ?? 'Unknown',
        address: job.address,
      }))

      return {
        profile: profileResult.data ?? {
          full_name: 'User',
          business_name: null,
          subscription_status: 'trial',
          trial_ends_at: new Date().toISOString(),
        },
        jobsToday: jobsTodayResult.count ?? 0,
        completedToday: completedTodayResult.count ?? 0,
        activeClients: clientsResult.count ?? 0,
        lowStockCount: lowStockResult.count ?? 0,
        revenueToday,
        upcomingJobs,
      }
    },
    refetchInterval: 60 * 1000,
  })
}