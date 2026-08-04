"use client";

import { useState, useEffect, Suspense } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
const [showUpgradePrompt, setShowUpgradePrompt] = useState(false);
import { motion } from "framer-motion";
import {
  Loader2,
  User,
  Briefcase,
  Bell,
  ShieldAlert,
  LogOut,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  useProfile,
  useUpdateProfile,
  useUpdateNotificationPreferences,
} from "@/lib/queries/profile";
import { PageTransition } from "@/components/dashboard/page-transition";

// ─── Schema ───────────────────────────────────────────────────

const profileSchema = z.object({
  full_name: z.string().min(2, "Full name must be at least 2 characters"),
  phone: z.string().min(7, "Enter a valid phone number"),
  business_name: z
    .string()
    .min(2, "Business name must be at least 2 characters"),
  business_type: z.enum([
    "pet_grooming",
    "pool_cleaning",
    "auto_detailing",
    "other",
  ]),
  timezone: z.string().min(1, "Please select a timezone"),
});

type ProfileFormData = z.infer<typeof profileSchema>;

// ─── Constants ────────────────────────────────────────────────

const BUSINESS_TYPE_LABELS: Record<string, string> = {
  pet_grooming: "Pet Grooming",
  pool_cleaning: "Pool Cleaning",
  auto_detailing: "Auto Detailing",
  other: "Other",
};

function getTimezoneList(currentTimezone: string): string[] {
  const FALLBACK = [
    "UTC",
    "America/New_York",
    "America/Chicago",
    "America/Denver",
    "America/Los_Angeles",
    "Europe/London",
    "Europe/Paris",
    "Europe/Berlin",
    "Asia/Dubai",
    "Asia/Karachi",
    "Asia/Kolkata",
    "Asia/Dhaka",
    "Asia/Singapore",
    "Asia/Shanghai",
    "Asia/Tokyo",
    "Australia/Sydney",
  ];
  if (currentTimezone && !FALLBACK.includes(currentTimezone)) {
    return [currentTimezone, ...FALLBACK];
  }
  return FALLBACK;
}

const sectionVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.4,
      delay: i * 0.08,
      ease: [0.22, 1, 0.36, 1] as [number, number, number, number],
    },
  }),
};

// ─── Toggle ───────────────────────────────────────────────────

function Toggle({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full
        transition-colors duration-200 focus:outline-none
        ${checked ? "bg-blue-600" : "bg-gray-200"}
        ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm
          transition-transform duration-200
          ${checked ? "translate-x-6" : "translate-x-1"}`}
      />
    </button>
  );
}

// ─── Section heading ──────────────────────────────────────────

function SectionHeading({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-3 mb-6">
      <div className="w-9 h-9 bg-blue-50 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5">
        <div className="text-blue-600">{icon}</div>
      </div>
      <div>
        <h2 className="font-semibold text-gray-900">{title}</h2>
        <p className="text-sm text-gray-500 mt-0.5">{description}</p>
      </div>
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────

function SettingsPageContent() {
  const router = useRouter();
  const supabase = createClient();
  const { data: profile, isLoading } = useProfile();
  const updateProfile = useUpdateProfile();
  const updateNotifications = useUpdateNotificationPreferences();

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isDirty },
  } = useForm<ProfileFormData>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      full_name: "",
      phone: "",
      business_name: "",
      business_type: "other",
      timezone: "UTC",
    },
  });

  useEffect(() => {
    if (profile) {
      reset({
        full_name: profile.full_name,
        phone: profile.phone ?? "",
        business_name: profile.business_name ?? "",
        business_type: profile.business_type ?? "other",
        timezone: profile.timezone ?? "UTC",
      });
    }
  }, [profile, reset]);

  const onSaveProfile = (data: ProfileFormData) => {
    updateProfile.mutate(data);
  };

  const handleNotificationToggle = (key: string, value: boolean) => {
    const current = profile?.notification_preferences ?? {
      email_summary: true,
      sms_alerts: false,
      job_reminders: true,
    };
    updateNotifications.mutate({ ...current, [key]: value });
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirmText !== profile?.business_name) return;
    setIsDeleting(true);
    try {
      const res = await fetch("/api/account/delete", { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to delete account");
      }
      await supabase.auth.signOut();
      toast.success("Account deleted successfully.");
      router.push("/");
    } catch (err: any) {
      toast.error(
        err.message || "Failed to delete account. Please contact support.",
      );
      setIsDeleting(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    toast.success("Signed out successfully");
    router.push("/login");
  };

  const notifPrefs = profile?.notification_preferences ?? {
    email_summary: true,
    sms_alerts: false,
    job_reminders: true,
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    setShowUpgradePrompt(params.get("upgrade") === "true");
  }, []);

  return (
    <PageTransition>
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        {showUpgradePrompt && (
          <motion.div
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3"
          >
            <div className="w-8 h-8 bg-red-100 rounded-lg flex items-center justify-center flex-shrink-0">
              <ShieldAlert className="w-4 h-4 text-red-600" />
            </div>
            <div>
              <p className="text-sm font-semibold text-red-800">
                Your trial has expired
              </p>
              <p className="text-xs text-red-600 mt-0.5">
                Upgrade below to continue using Routemaster
              </p>
            </div>
          </motion.div>
        )}

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
          <p className="text-gray-500 mt-1">
            Manage your profile and account preferences
          </p>
        </motion.div>

        {/* ── Section 1: Profile ── */}
        <motion.div
          custom={0}
          variants={sectionVariants}
          initial="hidden"
          animate="visible"
        >
          <Card className="border-gray-100">
            <CardContent className="p-6">
              <SectionHeading
                icon={<User className="w-4 h-4" />}
                title="Personal Information"
                description="Your name and contact details"
              />

              {isLoading ? (
                <div className="space-y-4">
                  {[...Array(2)].map((_, i) => (
                    <div key={i} className="space-y-1.5">
                      <div className="h-4 w-24 bg-gray-100 rounded animate-pulse" />
                      <div className="h-10 bg-gray-100 rounded-xl animate-pulse" />
                    </div>
                  ))}
                </div>
              ) : (
                <form
                  onSubmit={handleSubmit(onSaveProfile)}
                  className="space-y-4"
                >
                  <div className="space-y-1.5">
                    <Label htmlFor="full_name">Full Name</Label>
                    <Input
                      id="full_name"
                      {...register("full_name")}
                      className={errors.full_name ? "border-red-400" : ""}
                    />
                    {errors.full_name && (
                      <p className="text-red-500 text-xs">
                        {errors.full_name.message}
                      </p>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="phone">Phone Number</Label>
                    <Input
                      id="phone"
                      type="tel"
                      {...register("phone")}
                      className={errors.phone ? "border-red-400" : ""}
                    />
                    {errors.phone && (
                      <p className="text-red-500 text-xs">
                        {errors.phone.message}
                      </p>
                    )}
                  </div>

                  <Button
                    type="submit"
                    disabled={!isDirty || updateProfile.isPending}
                    className="w-full"
                  >
                    {updateProfile.isPending ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      "Save Personal Info"
                    )}
                  </Button>
                </form>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* ── Section 2: Business ── */}
        <motion.div
          custom={1}
          variants={sectionVariants}
          initial="hidden"
          animate="visible"
        >
          <Card className="border-gray-100">
            <CardContent className="p-6">
              <SectionHeading
                icon={<Briefcase className="w-4 h-4" />}
                title="Business Information"
                description="Your business name, type, and timezone"
              />

              {isLoading ? (
                <div className="space-y-4">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="space-y-1.5">
                      <div className="h-4 w-24 bg-gray-100 rounded animate-pulse" />
                      <div className="h-10 bg-gray-100 rounded-xl animate-pulse" />
                    </div>
                  ))}
                </div>
              ) : (
                <form
                  onSubmit={handleSubmit(onSaveProfile)}
                  className="space-y-4"
                >
                  <div className="space-y-1.5">
                    <Label htmlFor="business_name">Business Name</Label>
                    <Input
                      id="business_name"
                      {...register("business_name")}
                      className={errors.business_name ? "border-red-400" : ""}
                    />
                    {errors.business_name && (
                      <p className="text-red-500 text-xs">
                        {errors.business_name.message}
                      </p>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="business_type">Business Type</Label>
                    <Controller
                      name="business_type"
                      control={control}
                      render={({ field }) => (
                        <Select
                          value={field.value}
                          onValueChange={field.onChange}
                        >
                          <SelectTrigger id="business_type" className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {Object.entries(BUSINESS_TYPE_LABELS).map(
                              ([value, label]) => (
                                <SelectItem key={value} value={value}>
                                  {label}
                                </SelectItem>
                              ),
                            )}
                          </SelectContent>
                        </Select>
                      )}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="timezone">Timezone</Label>
                    <Controller
                      name="timezone"
                      control={control}
                      render={({ field }) => (
                        <Select
                          value={field.value}
                          onValueChange={field.onChange}
                        >
                          <SelectTrigger id="timezone" className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="max-h-64">
                            {getTimezoneList(profile?.timezone ?? "UTC").map(
                              (tz) => (
                                <SelectItem key={tz} value={tz}>
                                  {tz}
                                </SelectItem>
                              ),
                            )}
                          </SelectContent>
                        </Select>
                      )}
                    />
                  </div>

                  <Button
                    type="submit"
                    disabled={!isDirty || updateProfile.isPending}
                    className="w-full"
                  >
                    {updateProfile.isPending ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      "Save Business Info"
                    )}
                  </Button>
                </form>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* ── Section 3: Notifications ── */}
        <motion.div
          custom={2}
          variants={sectionVariants}
          initial="hidden"
          animate="visible"
        >
          <Card className="border-gray-100">
            <CardContent className="p-6">
              <SectionHeading
                icon={<Bell className="w-4 h-4" />}
                title="Notification Preferences"
                description="Choose what you want to be notified about"
              />

              <div className="space-y-5">
                {[
                  {
                    key: "job_reminders",
                    label: "Job Reminders",
                    description:
                      "Get reminded about upcoming jobs scheduled for today",
                  },
                  {
                    key: "email_summary",
                    label: "Daily Email Summary",
                    description:
                      "Receive a summary of the day's completed jobs by email",
                  },
                  {
                    key: "sms_alerts",
                    label: "SMS Alerts",
                    description:
                      "Receive SMS notifications about job cancellations or changes",
                  },
                ].map((item, i) => (
                  <div key={item.key}>
                    {i > 0 && <Separator className="mb-5" />}
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900">
                          {item.label}
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {item.description}
                        </p>
                      </div>
                      <Toggle
                        checked={
                          notifPrefs[item.key as keyof typeof notifPrefs] ??
                          false
                        }
                        onChange={(val) =>
                          handleNotificationToggle(item.key, val)
                        }
                        disabled={updateNotifications.isPending}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* ── Section 4: Account ── */}
        <motion.div
          custom={3}
          variants={sectionVariants}
          initial="hidden"
          animate="visible"
          className="space-y-4"
        >
          {/* Sign out */}
          <Card className="border-gray-100">
            <CardContent className="p-6">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-gray-900">Sign Out</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Sign out of your account on this device
                  </p>
                </div>
                <Button variant="outline" onClick={handleLogout}>
                  <LogOut className="w-4 h-4 mr-2" />
                  Sign Out
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Subscription */}
          {/* Subscription */}
          <Card className="border-gray-100">
            <CardContent className="p-6">
              <SectionHeading
                icon={<ShieldAlert className="w-4 h-4" />}
                title="Subscription"
                description="Manage your billing and plan"
              />

              {profile?.subscription_status === "active" ? (
                <div className="space-y-4">
                  <div className="bg-green-50 border border-green-100 rounded-xl px-4 py-3">
                    <p className="text-sm font-semibold text-green-800">
                      Active Subscription
                    </p>
                    <p className="text-xs text-green-600 mt-0.5">
                      Your plan renews automatically
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={async () => {
                      const res = await fetch("/api/stripe/portal", {
                        method: "POST",
                      });
                      const data = await res.json();
                      if (data.url) window.location.href = data.url;
                      else toast.error("Could not open billing portal");
                    }}
                  >
                    Manage Subscription
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="bg-amber-50 border border-amber-100 rounded-xl px-4 py-3">
                    <p className="text-sm font-semibold text-amber-800">
                      {profile?.subscription_status === "cancelled"
                        ? "Subscription Cancelled"
                        : "Free Trial"}
                    </p>
                    <p className="text-xs text-amber-600 mt-0.5">
                      Upgrade to keep access to all features
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="border border-gray-200 rounded-xl p-4 text-center">
                      <p className="text-xs text-gray-500 mb-1">Monthly</p>
                      <p className="text-2xl font-bold text-gray-900">$19</p>
                      <p className="text-xs text-gray-400 mb-3">per month</p>
                      <Button
                        className="w-full"
                        size="sm"
                        onClick={async () => {
                          const res = await fetch(
                            "/api/stripe/create-checkout",
                            {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({
                                priceId:
                                  process.env
                                    .NEXT_PUBLIC_STRIPE_MONTHLY_PRICE_ID,
                                billingCycle: "monthly",
                              }),
                            },
                          );
                          const data = await res.json();
                          if (data.url) window.location.href = data.url;
                          else toast.error("Could not start checkout");
                        }}
                      >
                        Upgrade
                      </Button>
                    </div>

                    <div className="border-2 border-blue-600 rounded-xl p-4 text-center relative">
                      <div className="absolute -top-2.5 left-1/2 -translate-x-1/2">
                        <span className="bg-blue-600 text-white text-[10px] font-semibold px-2 py-0.5 rounded-full">
                          SAVE 17%
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 mb-1">Yearly</p>
                      <p className="text-2xl font-bold text-gray-900">$190</p>
                      <p className="text-xs text-gray-400 mb-3">per year</p>
                      <Button
                        className="w-full"
                        size="sm"
                        onClick={async () => {
                          const res = await fetch(
                            "/api/stripe/create-checkout",
                            {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({
                                priceId:
                                  process.env
                                    .NEXT_PUBLIC_STRIPE_YEARLY_PRICE_ID,
                                billingCycle: "yearly",
                              }),
                            },
                          );
                          const data = await res.json();
                          if (data.url) window.location.href = data.url;
                          else toast.error("Could not start checkout");
                        }}
                      >
                        Upgrade
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Danger zone */}
          <Card className="border-red-100 bg-red-50/30">
            <CardContent className="p-6">
              <div className="flex items-start gap-3 mb-4">
                <div className="w-9 h-9 bg-red-100 rounded-xl flex items-center justify-center flex-shrink-0">
                  <ShieldAlert className="w-4 h-4 text-red-600" />
                </div>
                <div>
                  <h2 className="font-semibold text-gray-900">Danger Zone</h2>
                  <p className="text-sm text-gray-500 mt-0.5">
                    Irreversible actions for your account
                  </p>
                </div>
              </div>
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    Delete Account
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Permanently delete all your data. Cannot be undone.
                  </p>
                </div>
                <Button
                  variant="outline"
                  onClick={() => setDeleteDialogOpen(true)}
                  className="border-red-200 text-red-600 hover:bg-red-50 flex-shrink-0"
                >
                  Delete Account
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Delete confirmation */}
        <AlertDialog
          open={deleteDialogOpen}
          onOpenChange={(o) => {
            if (!o) setDeleteConfirmText("");
            setDeleteDialogOpen(o);
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete your account?</AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-3 text-sm text-gray-600">
                  <p>
                    This will permanently delete your account, all clients,
                    jobs, routes, and supply data. This cannot be undone.
                  </p>
                  <p>
                    Type your business name{" "}
                    <span className="font-semibold text-gray-900">
                      {profile?.business_name}
                    </span>{" "}
                    to confirm:
                  </p>
                  <Input
                    value={deleteConfirmText}
                    onChange={(e) => setDeleteConfirmText(e.target.value)}
                    placeholder={profile?.business_name ?? ""}
                  />
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isDeleting}>
                Cancel
              </AlertDialogCancel>
              <Button
                onClick={handleDeleteAccount}
                disabled={
                  deleteConfirmText !== profile?.business_name || isDeleting
                }
                className="bg-red-600 hover:bg-red-700 text-white"
              >
                {isDeleting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Deleting...
                  </>
                ) : (
                  "Delete Account"
                )}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </PageTransition>
  );
}

function SettingsPageFallback() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-4">
      <Skeleton className="h-8 w-32" />
      <Skeleton className="h-64 w-full rounded-2xl" />
      <Skeleton className="h-48 w-full rounded-2xl" />
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense fallback={<SettingsPageFallback />}>
      <SettingsPageContent />
    </Suspense>
  );
}
