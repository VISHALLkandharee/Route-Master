"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { differenceInDays, format } from "date-fns";
import {
  Briefcase,
  Users,
  Package,
  DollarSign,
  MapPin,
  Plus,
  ChevronRight,
  CheckCircle2,
  Clock,
  Play,
  AlertTriangle,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useDashboardStats } from "@/lib/queries/dashboard";
import { PageTransition } from "@/components/dashboard/page-transition";

// ─── Count-up hook ─────────────────────────────────────────────

function useCountUp(target: number, duration = 1000, enabled = true) {
  const [count, setCount] = useState(0);
  const frameRef = useRef<number>(0);
  const startTimeRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled || target === 0) {
      setCount(target);
      return;
    }

    startTimeRef.current = null;

    const animate = (timestamp: number) => {
      if (!startTimeRef.current) startTimeRef.current = timestamp;
      const elapsed = timestamp - startTimeRef.current;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setCount(Math.round(eased * target));
      if (progress < 1) {
        frameRef.current = requestAnimationFrame(animate);
      }
    };

    frameRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frameRef.current);
  }, [target, duration, enabled]);

  return count;
}

// ─── Greeting ──────────────────────────────────────────────────

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

// ─── Animation variants ────────────────────────────────────────

const containerVariants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.08 },
  },
};

const cardVariants = {
  hidden: { opacity: 0, y: 24 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.45,
      ease: [0.22, 1, 0.36, 1] as [number, number, number, number],
    },
  },
};

// ─── Stat card ─────────────────────────────────────────────────

interface StatCardProps {
  label: string;
  value: number;
  icon: React.ReactNode;
  iconBg: string;
  iconColor: string;
  suffix?: string;
  prefix?: string;
  sublabel?: string;
  highlight?: boolean;
}

function StatCard({
  label,
  value,
  icon,
  iconBg,
  iconColor,
  suffix,
  prefix,
  sublabel,
  highlight,
}: StatCardProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const displayValue = useCountUp(value, 900, mounted);

  return (
    <motion.div variants={cardVariants} className="h-full">
      <Card
        className={`border transition-shadow hover:shadow-md h-full ${
          highlight ? "border-amber-200 bg-amber-50/40" : "border-gray-100"
        }`}
      >
        <CardContent className="p-5 h-full flex flex-col justify-between">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-gray-500 mb-1">{label}</p>
              <p className="text-3xl font-bold text-gray-900 tracking-tight">
                {prefix}
                {displayValue.toLocaleString()}
                {suffix}
              </p>
            </div>
            <div
              className={`w-11 h-11 rounded-xl flex items-center justify-center ${iconBg}`}
            >
              <div className={iconColor}>{icon}</div>
            </div>
          </div>
          {sublabel && <p className="text-xs text-gray-400 mt-2">{sublabel}</p>}
        </CardContent>
      </Card>
    </motion.div>
  );
}

// ─── Status styles ─────────────────────────────────────────────

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-blue-50 text-blue-700 border-blue-200",
  in_progress: "bg-amber-50 text-amber-700 border-amber-200",
  completed: "bg-green-50 text-green-700 border-green-200",
};

const STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  in_progress: "In Progress",
  completed: "Completed",
};

const STATUS_ICONS: Record<string, React.ReactNode> = {
  pending: <Clock className="w-3 h-3" />,
  in_progress: <Play className="w-3 h-3" />,
  completed: <CheckCircle2 className="w-3 h-3" />,
};

function formatTime(time: string) {
  const [h, m] = time.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const displayH = h % 12 === 0 ? 12 : h % 12;
  return `${displayH}:${m.toString().padStart(2, "0")} ${period}`;
}

// ─── Main component ────────────────────────────────────────────

export default function DashboardPage() {
  const { data, isLoading } = useDashboardStats();
  const [greeting, setGreeting] = useState("");

  useEffect(() => {
    setGreeting(getGreeting());
  }, []);

  const firstName = data?.profile.full_name.split(" ")[0] ?? "";
  const daysLeft = data?.profile.trial_ends_at
    ? differenceInDays(new Date(data.profile.trial_ends_at), new Date())
    : null;

  const completionPct =
    data && data.jobsToday > 0
      ? Math.round((data.completedToday / data.jobsToday) * 100)
      : 0;

  return (
    <PageTransition>
      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            duration: 0.5,
            ease: [0.22, 1, 0.36, 1] as [number, number, number, number],
          }}
          className="mb-8"
        >
          <div className="flex items-start justify-between flex-wrap gap-4">
            <div>
              {isLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-8 w-56" />
                  <Skeleton className="h-4 w-36" />
                </div>
              ) : (
                <>
                  <h1 className="text-2xl font-bold text-gray-900">
                    {greeting}
                    {firstName ? `, ${firstName}` : ""}!
                  </h1>
                  <p className="text-gray-500 mt-1">
                    {data?.profile.business_name ?? ""} ·{" "}
                    {format(new Date(), "EEEE, MMMM d")}
                  </p>
                </>
              )}
            </div>

            {/* Trial badge */}
            {data?.profile.subscription_status === "trial" &&
              daysLeft !== null && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.3 }}
                  className={`px-4 py-2 rounded-xl text-sm border ${
                    daysLeft <= 3
                      ? "bg-red-50 border-red-200 text-red-700"
                      : daysLeft <= 7
                        ? "bg-amber-50 border-amber-200 text-amber-700"
                        : "bg-blue-50 border-blue-100 text-blue-700"
                  }`}
                >
                  <span className="font-semibold">
                    {daysLeft <= 0
                      ? "Trial expired"
                      : `${daysLeft} days left in trial`}
                  </span>
                </motion.div>
              )}
          </div>
        </motion.div>

        {/* Low stock alert */}
        {data && data.lowStockCount > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            transition={{ duration: 0.3 }}
            className="mb-6"
          >
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0" />
                <p className="text-sm font-medium text-amber-800">
                  {data.lowStockCount} supply item
                  {data.lowStockCount > 1 ? "s" : ""} running low
                </p>
              </div>
              <Link href="/dashboard/supplies">
                <Button
                  variant="outline"
                  size="sm"
                  className="border-amber-300 text-amber-700 hover:bg-amber-100"
                >
                  View Supplies
                </Button>
              </Link>
            </div>
          </motion.div>
        )}

        {/* Stat cards */}
        {isLoading ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            {[...Array(4)].map((_, i) => (
              <Card key={i} className="border-gray-100">
                <CardContent className="p-5 space-y-3">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-8 w-16" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8"
          >
            <StatCard
              label="Jobs Today"
              value={data?.jobsToday ?? 0}
              icon={<Briefcase className="w-5 h-5" />}
              iconBg="bg-blue-50"
              iconColor="text-blue-600"
              sublabel={`${data?.completedToday ?? 0} completed`}
            />
            <StatCard
              label="Active Clients"
              value={data?.activeClients ?? 0}
              icon={<Users className="w-5 h-5" />}
              iconBg="bg-green-50"
              iconColor="text-green-600"
            />
            <StatCard
              label="Low Stock"
              value={data?.lowStockCount ?? 0}
              icon={<Package className="w-5 h-5" />}
              iconBg={data?.lowStockCount ? "bg-amber-50" : "bg-gray-50"}
              iconColor={
                data?.lowStockCount ? "text-amber-600" : "text-gray-400"
              }
              highlight={!!data?.lowStockCount}
              sublabel="items need restocking"
            />
            <StatCard
              label="Revenue Today"
              value={data?.revenueToday ?? 0}
              icon={<DollarSign className="w-5 h-5" />}
              iconBg="bg-purple-50"
              iconColor="text-purple-600"
              prefix="$"
              sublabel="from completed jobs"
            />
          </motion.div>
        )}

        {/* Today's progress */}
        {data && data.jobsToday > 0 && (
          <motion.div
            variants={cardVariants}
            initial="hidden"
            animate="visible"
            className="mb-6"
          >
            <Card className="border-gray-100">
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-medium text-gray-700">
                    Today&apos;s Progress
                  </p>
                  <p className="text-sm font-semibold text-gray-900">
                    {data.completedToday}/{data.jobsToday} jobs
                  </p>
                </div>
                <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-blue-600 rounded-full"
                    initial={{ width: 0 }}
                    animate={{ width: `${completionPct}%` }}
                    transition={{
                      duration: 1,
                      delay: 0.3,
                      ease: [0.22, 1, 0.36, 1] as [
                        number,
                        number,
                        number,
                        number,
                      ],
                    }}
                  />
                </div>
                <p className="text-xs text-gray-400 mt-2">
                  {completionPct}% complete
                </p>
              </CardContent>
            </Card>
          </motion.div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Upcoming jobs */}
          <motion.div
            variants={cardVariants}
            initial="hidden"
            animate="visible"
          >
            <Card className="border-gray-100 h-full">
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-semibold text-gray-900">
                    Upcoming Today
                  </h2>
                  <Link
                    href="/dashboard/jobs"
                    className="text-xs text-blue-600 hover:underline flex items-center gap-0.5"
                  >
                    View all <ChevronRight className="w-3 h-3" />
                  </Link>
                </div>

                {isLoading ? (
                  <div className="space-y-3">
                    {[...Array(2)].map((_, i) => (
                      <div key={i} className="flex gap-3">
                        <Skeleton className="w-10 h-10 rounded-xl flex-shrink-0" />
                        <div className="flex-1 space-y-1.5">
                          <Skeleton className="h-4 w-3/4" />
                          <Skeleton className="h-3 w-1/2" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : data?.activeClients === 0 ? (
                  /* Brand new user — no clients yet */
                  <div className="text-center py-6">
                    <div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center mx-auto mb-3">
                      <Users className="w-6 h-6 text-blue-600" />
                    </div>
                    <p className="text-sm font-semibold text-gray-900 mb-1">
                      Welcome to Routemaster!
                    </p>
                    <p className="text-xs text-gray-500 mb-4">
                      Start by adding your first client, then schedule a job and
                      optimize your route.
                    </p>
                    <div className="space-y-2">
                      <Link href="/dashboard/clients">
                        <Button size="sm" className="w-full">
                          <Plus className="w-3.5 h-3.5 mr-1" />
                          Add your first client
                        </Button>
                      </Link>
                    </div>
                  </div>
                ) : data?.upcomingJobs.length === 0 ? (
                  /* Has clients but no jobs today */
                  <div className="text-center py-6">
                    <Briefcase className="w-10 h-10 text-gray-200 mx-auto mb-3" />
                    <p className="text-sm text-gray-400 mb-3">
                      No upcoming jobs today
                    </p>
                    <Link href="/dashboard/jobs">
                      <Button size="sm" variant="outline">
                        <Plus className="w-3.5 h-3.5 mr-1" />
                        Add a Job
                      </Button>
                    </Link>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {data?.upcomingJobs.map((job, i) => (
                      <motion.div
                        key={job.id}
                        initial={{ opacity: 0, x: -12 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.4 + i * 0.08 }}
                        className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl"
                      >
                        <div className="w-10 h-10 bg-blue-50 rounded-xl flex flex-col items-center justify-center flex-shrink-0">
                          <Clock className="w-3.5 h-3.5 text-blue-600 mb-0.5" />
                          <span className="text-[9px] font-semibold text-blue-700 leading-none">
                            {formatTime(job.scheduled_time)}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-gray-900 truncate">
                            {job.title}
                          </p>
                          <p className="text-xs text-gray-500 truncate">
                            {job.client_name}
                          </p>
                        </div>
                        <Badge
                          variant="outline"
                          className={`text-xs flex items-center gap-1 ${STATUS_STYLES[job.status]}`}
                        >
                          {STATUS_ICONS[job.status]}
                          {STATUS_LABELS[job.status]}
                        </Badge>
                      </motion.div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>

          {/* Quick actions */}
          <motion.div
            variants={cardVariants}
            initial="hidden"
            animate="visible"
          >
            <Card className="border-gray-100 h-full">
              <CardContent className="p-5">
                <h2 className="font-semibold text-gray-900 mb-4">
                  Quick Actions
                </h2>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    {
                      label: "Add Job",
                      icon: <Briefcase className="w-5 h-5" />,
                      href: "/dashboard/jobs?new=true",
                      color:
                        "bg-blue-50 text-blue-700 hover:bg-blue-100 border-blue-100",
                    },
                    {
                      label: "Add Client",
                      icon: <Users className="w-5 h-5" />,
                      href: "/dashboard/clients",
                      color:
                        "bg-green-50 text-green-700 hover:bg-green-100 border-green-100",
                    },
                    {
                      label: "View Routes",
                      icon: <MapPin className="w-5 h-5" />,
                      href: "/dashboard/routes",
                      color:
                        "bg-purple-50 text-purple-700 hover:bg-purple-100 border-purple-100",
                    },
                    {
                      label: "Supplies",
                      icon: <Package className="w-5 h-5" />,
                      href: "/dashboard/supplies",
                      color:
                        "bg-amber-50 text-amber-700 hover:bg-amber-100 border-amber-100",
                    },
                  ].map((action, i) => (
                    <motion.div
                      key={action.label}
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: 0.5 + i * 0.07 }}
                      whileHover={{ scale: 1.02, y: -2 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      <Link href={action.href}>
                        <div
                          className={`flex flex-col items-center justify-center gap-2 p-4 rounded-xl border cursor-pointer transition-colors ${action.color}`}
                        >
                          {action.icon}
                          <span className="text-sm font-medium">
                            {action.label}
                          </span>
                        </div>
                      </Link>
                    </motion.div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </div>
    </PageTransition>
  );
}
