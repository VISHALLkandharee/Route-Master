'use client'

import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Scissors,
  Waves,
  Car,
  Briefcase,
  ArrowLeft,
  ArrowRight,
  Loader2,
  MapPin,
  Check,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useCompleteOnboarding } from '@/lib/queries/profile'

// ─── Schema ───────────────────────────────────────────────────

const onboardingSchema = z.object({
  business_type: z.enum(
    ['pet_grooming', 'pool_cleaning', 'auto_detailing', 'other'],
    { message: 'Please select a business type' }
  ),
  business_name: z.string().min(2, 'Business name must be at least 2 characters'),
  phone: z.string().min(7, 'Enter a valid phone number'),
  timezone: z.string().min(1, 'Please select a timezone'),
})

type OnboardingFormData = z.infer<typeof onboardingSchema>

const STEP_FIELDS: (keyof OnboardingFormData)[][] = [
  ['business_type'],
  ['business_name', 'phone'],
  ['timezone'],
]

const TOTAL_STEPS = 3

// ─── Business Type Options ───────────────────────────────────

const businessTypes = [
  {
    value: 'pet_grooming' as const,
    label: 'Pet Grooming',
    description: 'Mobile dog & cat grooming',
    icon: Scissors,
  },
  {
    value: 'pool_cleaning' as const,
    label: 'Pool Cleaning',
    description: 'Residential pool service',
    icon: Waves,
  },
  {
    value: 'auto_detailing' as const,
    label: 'Auto Detailing',
    description: 'Mobile car detailing',
    icon: Car,
  },
  {
    value: 'other' as const,
    label: 'Other',
    description: 'Another mobile service',
    icon: Briefcase,
  },
]

// ─── Common Timezones (Fallback) ─────────────────────────────

const FALLBACK_TIMEZONES = [
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Asia/Dubai',
  'Asia/Karachi',
  'Asia/Kolkata',
  'Asia/Dhaka',
  'Asia/Singapore',
  'Asia/Shanghai',
  'Asia/Tokyo',
  'Australia/Sydney',
]

function getTimezoneList(detected: string): string[] {
  if (detected && !FALLBACK_TIMEZONES.includes(detected)) {
    return [detected, ...FALLBACK_TIMEZONES]
  }
  return FALLBACK_TIMEZONES
}

// ─── Animation Variants ───────────────────────────────────────

const stepVariants = {
  enter: (direction: number) => ({
    x: direction > 0 ? 60 : -60,
    opacity: 0,
  }),
  center: {
    x: 0,
    opacity: 1,
  },
  exit: (direction: number) => ({
    x: direction > 0 ? -60 : 60,
    opacity: 0,
  }),
}

// ─── Component ────────────────────────────────────────────────

export default function OnboardingPage() {
  const [step, setStep] = useState(0)
  const [direction, setDirection] = useState(1)
  const [detectedTimezone, setDetectedTimezone] = useState('')

  const completeOnboarding = useCompleteOnboarding()

  const {
    register,
    handleSubmit,
    trigger,
    setValue,
    watch,
    formState: { errors },
  } = useForm<OnboardingFormData>({
    resolver: zodResolver(onboardingSchema),
    defaultValues: {
      business_type: undefined,
      business_name: '',
      phone: '',
      timezone: '',
    },
  })

  const selectedBusinessType = watch('business_type')
  const selectedTimezone = watch('timezone')

  // Detect timezone once on mount
  useEffect(() => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
    setDetectedTimezone(tz)
    setValue('timezone', tz)
  }, [setValue])

  // ─── Navigation ───────────────────────────────────────────

  const goNext = async () => {
    const valid = await trigger(STEP_FIELDS[step])
    if (!valid) return
    setDirection(1)
    setStep((s) => Math.min(s + 1, TOTAL_STEPS - 1))
  }

  const goBack = () => {
    setDirection(-1)
    setStep((s) => Math.max(s - 1, 0))
  }



  // On the final step, Enter is allowed to submit normally
  const handleKeyDown = (e: React.KeyboardEvent<HTMLFormElement>) => {
  if (e.key === 'Enter') {
    if (step < TOTAL_STEPS - 1) {
      e.preventDefault()
      goNext()
    }
  }
}

  // Auto-advance after selecting a business type card
  const selectBusinessType = (value: OnboardingFormData['business_type']) => {
    setValue('business_type', value, { shouldValidate: true })
    setTimeout(() => {
      setDirection(1)
      setStep(1)
    }, 280)
  }

  // ─── Submit ─────────────────────────────────────────────────

  const onSubmit = (data: OnboardingFormData) => {
    completeOnboarding.mutate(data)
  }

  const timezones = getTimezoneList(detectedTimezone)

  return (
    <div>

      {/* Progress Bar */}
      <div className="flex items-center gap-2 mb-8">
        {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
          <div key={i} className="flex-1 h-1.5 rounded-full bg-gray-200 overflow-hidden">
            <motion.div
              className="h-full bg-blue-600 rounded-full"
              initial={{ width: '0%' }}
              animate={{ width: i <= step ? '100%' : '0%' }}
              transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] }}
            />
          </div>
        ))}
      </div>

      {/* Logo + Heading */}
      <div className="text-center mb-6">
        <motion.div
          initial={{ scale: 0, rotate: -10 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 18 }}
          className="w-14 h-14 bg-blue-600 rounded-2xl flex items-center
                     justify-center mx-auto mb-3 shadow-lg shadow-blue-200"
        >
          <MapPin className="w-7 h-7 text-white" />
        </motion.div>
        <h1 className="text-xl font-bold text-gray-900 tracking-tight">
          {step === 0 && 'What kind of business do you run?'}
          {step === 1 && 'Tell us about your business'}
          {step === 2 && 'Confirm your timezone'}
        </h1>
        <p className="text-gray-500 mt-1 text-sm">
          Step {step + 1} of {TOTAL_STEPS}
        </p>
      </div>

      {/* Card */}
      <Card className="border-gray-100 shadow-sm overflow-hidden">
        <CardContent className="p-6">
          <form onSubmit={handleSubmit(onSubmit)} onKeyDown={handleKeyDown}>
            <AnimatePresence mode="wait" custom={direction}>

              {/* Step 1 — Business Type */}
              {step === 0 && (
                <motion.div
                  key="step-0"
                  custom={direction}
                  variants={stepVariants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] }}
                  className="grid grid-cols-2 gap-3"
                >
                  {businessTypes.map((type) => {
                    const Icon = type.icon
                    const isSelected = selectedBusinessType === type.value
                    return (
                      <motion.button
                        key={type.value}
                        type="button"
                        onClick={() => selectBusinessType(type.value)}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        className={`relative p-4 rounded-xl border-2 text-left
                                    transition-colors duration-150 ${
                          isSelected
                            ? 'border-blue-600 bg-blue-50'
                            : 'border-gray-200 hover:border-gray-300 bg-white'
                        }`}
                      >
                        {isSelected && (
                          <motion.div
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            className="absolute top-2 right-2 w-5 h-5 bg-blue-600
                                       rounded-full flex items-center justify-center"
                          >
                            <Check className="w-3 h-3 text-white" />
                          </motion.div>
                        )}
                        <Icon
                          className={`w-6 h-6 mb-2 ${
                            isSelected ? 'text-blue-600' : 'text-gray-400'
                          }`}
                        />
                        <p className="font-semibold text-sm text-gray-900">
                          {type.label}
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {type.description}
                        </p>
                      </motion.button>
                    )
                  })}
                  {errors.business_type && (
                    <p className="col-span-2 text-red-500 text-xs">
                      {errors.business_type.message}
                    </p>
                  )}
                </motion.div>
              )}

              {/* Step 2 — Business Details */}
              {step === 1 && (
                <motion.div
                  key="step-1"
                  custom={direction}
                  variants={stepVariants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] }}
                  className="space-y-4"
                >
                  <div className="space-y-1.5">
                    <Label htmlFor="business_name">Business Name</Label>
                    <Input
                      id="business_name"
                      placeholder="Jake's Mobile Grooming"
                      {...register('business_name')}
                      className={
                        errors.business_name
                          ? 'border-red-400 focus-visible:ring-red-400'
                          : ''
                      }
                    />
                    {errors.business_name && (
                      <p className="text-red-500 text-xs">
                        {errors.business_name.message}
                      </p>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="phone">Phone Number</Label>
                    <Input
                      id="phone"
                      type="tel"
                      placeholder="+1 (555) 123-4567"
                      {...register('phone')}
                      className={
                        errors.phone
                          ? 'border-red-400 focus-visible:ring-red-400'
                          : ''
                      }
                    />
                    {errors.phone && (
                      <p className="text-red-500 text-xs">
                        {errors.phone.message}
                      </p>
                    )}
                  </div>
                </motion.div>
              )}

              {/* Step 3 — Timezone */}
              {step === 2 && (
                <motion.div
                  key="step-2"
                  custom={direction}
                  variants={stepVariants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] }}
                  className="space-y-4"
                >
                  <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
                    <p className="text-sm text-gray-600">
                      We detected your timezone as
                    </p>
                    <p className="font-semibold text-blue-700 mt-0.5">
                      {detectedTimezone || 'Detecting...'}
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="timezone">
                      Not correct? Choose your timezone
                    </Label>
                    <Select
                      value={selectedTimezone}
                      onValueChange={(val) =>
                        setValue('timezone', val, { shouldValidate: true })
                      }
                    >
                      <SelectTrigger id="timezone" className="w-full">
                        <SelectValue placeholder="Select timezone" />
                      </SelectTrigger>
                      <SelectContent className="max-h-64">
                        {timezones.map((tz) => (
                          <SelectItem key={tz} value={tz}>
                            {tz}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {errors.timezone && (
                      <p className="text-red-500 text-xs">
                        {errors.timezone.message}
                      </p>
                    )}
                  </div>
                </motion.div>
              )}

            </AnimatePresence>

            {/* Navigation Buttons */}
            <div className="flex items-center gap-3 mt-6">
              {step > 0 && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={goBack}
                  disabled={completeOnboarding.isPending}
                >
                  <ArrowLeft className="w-4 h-4 mr-1" />
                  Back
                </Button>
              )}

              <div className="flex-1" />

              {step < TOTAL_STEPS - 1 ? (
                <Button type="button" onClick={goNext}>
                  Next
                  <ArrowRight className="w-4 h-4 ml-1" />
                </Button>
              ) : (
                <Button
                  type="submit"
                  disabled={completeOnboarding.isPending}
                >
                  {completeOnboarding.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Finishing up...
                    </>
                  ) : (
                    'Finish Setup →'
                  )}
                </Button>
              )}
            </div>

          </form>
        </CardContent>
      </Card>

    </div>
  )
}