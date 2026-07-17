import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

// ─── Types ────────────────────────────────────────────────────

export const profileQueryKey = ['profile'] as const

export interface UserProfile {
  id: string
  full_name: string
  email: string
  phone: string | null
  business_name: string | null
  business_type: 'pet_grooming' | 'pool_cleaning' | 'auto_detailing' | 'other' | null
  avatar_url: string | null
  timezone: string
  subscription_status: 'trial' | 'active' | 'past_due' | 'cancelled'
  trial_ends_at: string
  onboarding_completed: boolean
  notification_preferences: {
    email_summary: boolean
    sms_alerts: boolean
    job_reminders: boolean
  }
  created_at: string
  updated_at: string
}
interface OnboardingData {
  business_type: 'pet_grooming' | 'pool_cleaning' | 'auto_detailing' | 'other'
  business_name: string
  phone: string
  timezone: string
}

// ─── Read Profile ─────────────────────────────────────────────

export function useProfile() {
  const supabase = createClient()

  return useQuery({
    queryKey: profileQueryKey,
    queryFn: async (): Promise<UserProfile> => {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .single()

      if (error) throw error
      return data
    },
  })
}

// ─── Complete Onboarding (Optimistic) ────────────────────────

export function useCompleteOnboarding() {
  const supabase = createClient()
  const queryClient = useQueryClient()
  const router = useRouter()

  return useMutation({
    mutationFn: async (data: OnboardingData) => {
      const { data: userData, error: userError } = await supabase.auth.getUser()
      if (userError || !userData.user) throw new Error('Not authenticated')

      const { error } = await supabase
        .from('users')
        .update({
          business_type: data.business_type,
          business_name: data.business_name,
          phone: data.phone,
          timezone: data.timezone,
          onboarding_completed: true,
        })
        .eq('id', userData.user.id)

      if (error) throw error
    },

    // Fires INSTANTLY on submit — before the server responds
    onMutate: async (data) => {
      await queryClient.cancelQueries({ queryKey: profileQueryKey })

      const previousProfile = queryClient.getQueryData<UserProfile>(profileQueryKey)

      queryClient.setQueryData<UserProfile>(profileQueryKey, (old) => {
        if (!old) return old
        return {
          ...old,
          business_type: data.business_type,
          business_name: data.business_name,
          phone: data.phone,
          timezone: data.timezone,
          onboarding_completed: true,
        }
      })

      // Navigate immediately — don't wait for the server
      router.push('/dashboard')

      return { previousProfile }
    },

    // Only runs if the server request actually fails
    onError: (_err, _data, context) => {
      if (context?.previousProfile) {
        queryClient.setQueryData(profileQueryKey, context.previousProfile)
      }
      toast.error('Something went wrong. Please try again.')
      router.push('/onboarding')
    },

    // Always runs — re-syncs cache with real server data
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: profileQueryKey })
    },
  })
}


// ─── Update Profile ───────────────────────────────────────────

interface UpdateProfileInput {
  full_name: string
  phone: string
  business_name: string
  business_type: 'pet_grooming' | 'pool_cleaning' | 'auto_detailing' | 'other'
  timezone: string
}

export function useUpdateProfile() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: UpdateProfileInput) => {
      const { error: userError } = await supabase.auth.getUser()
      if (userError) throw new Error('Your session expired. Please log in again.')

      const { error } = await supabase
        .from('users')
        .update(input)
        .eq('id', (await supabase.auth.getUser()).data.user!.id)

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: profileQueryKey })
      toast.success('Profile updated successfully')
    },
    onError: () => toast.error('Failed to update profile'),
  })
}

// ─── Update Notification Preferences (optimistic) ─────────────

interface NotificationPreferences {
  email_summary: boolean
  sms_alerts: boolean
  job_reminders: boolean
}

export function useUpdateNotificationPreferences() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (preferences: NotificationPreferences) => {
      const { error: userError } = await supabase.auth.getUser()
      if (userError) throw new Error('Your session expired. Please log in again.')

      const { error } = await supabase
        .from('users')
        .update({ notification_preferences: preferences })
        .eq('id', (await supabase.auth.getUser()).data.user!.id)

      if (error) throw error
    },
onMutate: async (preferences) => {
  await queryClient.cancelQueries({ queryKey: profileQueryKey })
  const previous = queryClient.getQueryData<UserProfile>(profileQueryKey)

  queryClient.setQueryData<UserProfile>(profileQueryKey, (old) => {
    if (!old) return old
    return { ...old, notification_preferences: preferences }
  })

  return { previous }
},
    onError: (_err, _vars, context) => {
      if (context?.previous)
        queryClient.setQueryData(profileQueryKey, context.previous)
      toast.error('Failed to update preferences')
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: profileQueryKey })
    },
  })
}