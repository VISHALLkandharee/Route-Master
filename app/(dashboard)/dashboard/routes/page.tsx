"use client";
import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { format, addDays, subDays, parseISO } from "date-fns";
import {
  ChevronLeft,
  ChevronRight,
  Navigation,
  Loader2,
  Clock,
  Route as RouteIcon,
  Briefcase,
  CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useUIStore } from "@/lib/store/ui-store";
import { useJobsByDate } from "@/lib/queries/jobs";
import {
  useRouteByDate,
  useOptimizeRoute,
  useLastStartLocation,
  useSendSMS,
} from "@/lib/queries/routes";
import { MessageSquare } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { StartLocationInput } from "@/components/dashboard/routes/start-location-input";

const STEP_ICONS: Record<string, string> = {
  geocoding: "📍",
  loading_jobs: "📋",
  backfill: "🗺️",
  optimizing: "⚡",
  directions: "🛣️",
  saving: "💾",
  complete: "✅",
};

const STEP_ORDER = [
  "geocoding",
  "loading_jobs",
  "backfill",
  "optimizing",
  "directions",
  "saving",
  "complete",
];

function ProgressIndicator({
  progress,
}: {
  progress: { step: string; message: string } | null;
}) {
  if (!progress) return null;

  const currentIndex = STEP_ORDER.indexOf(progress.step);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className="mt-4 bg-blue-50 border border-blue-100 rounded-xl p-4"
    >
      <div className="flex items-center gap-2 mb-3">
        {progress.step === "complete" ? (
          <CheckCircle2 className="w-4 h-4 text-green-600" />
        ) : (
          <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />
        )}
        <p className="text-sm font-medium text-blue-900">{progress.message}</p>
      </div>

      <div className="flex gap-1">
        {STEP_ORDER.filter((s) => s !== "complete").map((step, i) => (
          <div
            key={step}
            className={`h-1 flex-1 rounded-full transition-all duration-500 ${
              i < currentIndex
                ? "bg-blue-600"
                : i === currentIndex
                  ? "bg-blue-400"
                  : "bg-blue-100"
            }`}
          />
        ))}
      </div>
    </motion.div>
  );
}

const RouteMap = dynamic(
  () => import("@/components/dashboard/routes/route-map"),
  {
    ssr: false,
    loading: () => <Skeleton className="w-full h-[400px] rounded-xl" />,
  },
);

export default function RoutesPage() {
  const { selectedDate, setSelectedDate } = useUIStore();
  const { data: jobs, isLoading: jobsLoading } = useJobsByDate(selectedDate);
  const { data: route, isLoading: routeLoading } = useRouteByDate(selectedDate);
  const { data: lastStartLocation } = useLastStartLocation();
  const optimizeRoute = useOptimizeRoute();
  const sendSMS = useSendSMS();

  const [startLocation, setStartLocation] = useState("");

  useEffect(() => {
    if (!selectedDate) {
      setSelectedDate(format(new Date(), "yyyy-MM-dd"));
    }
  }, [selectedDate, setSelectedDate]);

  useEffect(() => {
    if (route?.start_location) {
      setStartLocation(route.start_location);
    } else if (lastStartLocation) {
      setStartLocation((prev) => prev || lastStartLocation);
    }
  }, [route, lastStartLocation]);

  if (!selectedDate) return null;

  const dateObj = parseISO(selectedDate);
  const todayStr = format(new Date(), "yyyy-MM-dd");
  const isToday = selectedDate === todayStr;

  const goToDay = (offset: number) => {
    const newDate = offset > 0 ? addDays(dateObj, 1) : subDays(dateObj, 1);
    setSelectedDate(format(newDate, "yyyy-MM-dd"));
  };

  const routableJobs =
    jobs?.filter((j) => j.status === "pending" || j.status === "in_progress") ??
    [];

  const handleOptimize = () => {
    if (!startLocation.trim()) return;
    optimizeRoute.mutate({ date: selectedDate, startLocation });
  };

  const orderedJobIds = route?.optimization_result?.orderedJobIds ?? [];
  const sortedJobs =
    orderedJobIds.length > 0
      ? orderedJobIds
          .map((id) => jobs?.find((j) => j.id === id))
          .filter((j): j is NonNullable<typeof j> => !!j)
      : routableJobs;

  const mapStops = sortedJobs
    .filter((j) => j.latitude && j.longitude)
    .map((j, index) => ({
      id: j.id,
      latitude: j.latitude!,
      longitude: j.longitude!,
      label: `${j.title} — ${j.client?.full_name}`,
      order: index + 1,
    }));

  const mapStart =
    route?.start_latitude && route?.start_longitude
      ? {
          latitude: route.start_latitude,
          longitude: route.start_longitude,
          label: route.start_location ?? "Start",
        }
      : null;

  const geometry = route?.optimization_result?.geometry ?? [];

  const formatDuration = (mins: number) => {
    const h = Math.floor(mins / 60);
    const m = Math.round(mins % 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
        <h1 className="text-2xl font-bold text-gray-900">Routes</h1>
      </div>

      {/* Date Navigator */}
      <div className="flex items-center justify-between bg-white border border-gray-100 rounded-xl p-3 mb-6">
        <Button variant="ghost" size="icon" onClick={() => goToDay(-1)}>
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <div className="text-center">
          <p className="font-semibold text-gray-900">
            {format(dateObj, "EEEE, MMMM d")}
          </p>
          {!isToday && (
            <button
              onClick={() => setSelectedDate(todayStr)}
              className="text-xs text-blue-600 hover:underline"
            >
              Jump to today
            </button>
          )}
          {isToday && <p className="text-xs text-gray-400">Today</p>}
        </div>
        <Button variant="ghost" size="icon" onClick={() => goToDay(1)}>
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>

      {/* No jobs */}
      {!jobsLoading && routableJobs.length === 0 && (
        <Card>
          <CardContent className="p-10 text-center">
            <div className="w-14 h-14 bg-blue-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Briefcase className="w-7 h-7 text-blue-600" />
            </div>
            <h3 className="font-semibold text-gray-900 mb-1">
              No jobs to route today
            </h3>
            <p className="text-gray-500 text-sm">
              Add jobs for this day first, then come back to optimize your route
            </p>
          </CardContent>
        </Card>
      )}

      {/* Optimize controls */}
      {routableJobs.length > 0 && (
        <Card className="mb-6">
          <CardContent className="p-5">
            <div className="flex flex-col gap-3">
              <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
                <div className="flex-1">
                  <StartLocationInput
                    value={startLocation}
                    onChange={setStartLocation}
                    disabled={optimizeRoute.isPending || sendSMS.isPending}
                  />
                </div>
                <Button
                  onClick={handleOptimize}
                  disabled={
                    !startLocation.trim() ||
                    optimizeRoute.isPending ||
                    sendSMS.isPending
                  }
                >
                  {optimizeRoute.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Optimizing...
                    </>
                  ) : (
                    <>
                      <Navigation className="w-4 h-4 mr-1.5" />
                      {route ? "Re-optimize Route" : "Optimize Route"}
                    </>
                  )}
                </Button>
              </div>

              <AnimatePresence>
                <ProgressIndicator progress={optimizeRoute.progress} />
              </AnimatePresence>

              {route && !optimizeRoute.isPending && (
                <Button
                  variant="outline"
                  onClick={() => sendSMS.mutate(selectedDate)}
                  disabled={sendSMS.isPending || optimizeRoute.isPending}
                  className="w-full sm:w-auto"
                >
                  {sendSMS.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Sending SMS...
                    </>
                  ) : (
                    <>
                      <MessageSquare className="w-4 h-4 mr-1.5" />
                      Send SMS to All Clients
                    </>
                  )}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stats */}
      {route && (
        <div className="grid grid-cols-2 gap-4 mb-6">
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-9 h-9 bg-blue-50 rounded-lg flex items-center justify-center">
                <RouteIcon className="w-4 h-4 text-blue-600" />
              </div>
              <div>
                <p className="text-lg font-bold text-gray-900">
                  {route.total_distance_km?.toFixed(1) ?? "—"} km
                </p>
                <p className="text-xs text-gray-500">Total distance</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-9 h-9 bg-amber-50 rounded-lg flex items-center justify-center">
                <Clock className="w-4 h-4 text-amber-600" />
              </div>
              <div>
                <p className="text-lg font-bold text-gray-900">
                  {route.total_duration_mins
                    ? formatDuration(route.total_duration_mins)
                    : "—"}
                </p>
                <p className="text-xs text-gray-500">Drive time</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Map */}
      {route && (mapStart || mapStops.length > 0) && (
        <div className="h-[400px] mb-6 border border-gray-100 rounded-xl overflow-hidden">
          <RouteMap start={mapStart} stops={mapStops} geometry={geometry} />
        </div>
      )}

      {/* Job order list */}
      {sortedJobs.length > 0 && (
        <div className="space-y-3">
          {sortedJobs.map((job, index) => (
            <div
              key={job.id}
              className="bg-white border border-gray-100 rounded-xl p-4 flex items-center gap-4"
            >
              <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center font-semibold text-sm flex-shrink-0">
                {orderedJobIds.length > 0 ? index + 1 : "–"}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-900 truncate">
                  {job.title}
                </p>
                <p className="text-xs text-gray-500">
                  {job.client?.full_name} · {job.address}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {job.sms_sent && (
                  <Badge
                    variant="outline"
                    className="bg-green-50 text-green-700 border-green-200"
                  >
                    SMS ✓
                  </Badge>
                )}
                <Badge variant="outline">
                  {job.scheduled_time.slice(0, 5)}
                </Badge>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
