"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { format, addDays, subDays, parseISO } from "date-fns";
import dynamic from "next/dynamic";
import {
  ChevronLeft,
  ChevronRight,
  Navigation,
  Loader2,
  Clock,
  Route as RouteIcon,
  Briefcase,
  CheckCircle2,
  FileText,
  PackageCheck,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useUIStore } from "@/lib/store/ui-store";
import { useJobsByDate, useUpdateJobStatus } from "@/lib/queries/jobs";
import { useSupplies } from "@/lib/queries/supplies";
import {
  useRouteByDate,
  useOptimizeRoute,
  useLastStartLocation,
  usePrepareSMS,
  useSendSMS,
  useStartDay,
  type SMSPreviewResult,
} from "@/lib/queries/routes";
import { MessageSquare } from "lucide-react";
import { MAX_SMS_CHARACTERS, OPT_OUT_SUFFIX } from "@/lib/sms/generate-message";
import { AnimatePresence, motion } from "framer-motion";
import { StartLocationInput } from "@/components/dashboard/routes/start-location-input";
import { PageTransition } from "@/components/dashboard/page-transition";
import { getVisitDurationMinutes } from "@/lib/time/visit-duration";
import { LogUsageSheet } from "@/components/dashboard/supplies/log-usage-sheet";
import {
  buildGoogleMapsDirectionsUrl,
  getGoogleMapsWaypointLimit,
} from "@/lib/maps/google-maps-directions";

const STEP_ORDER = [
  "geocoding",
  "loading_jobs",
  "backfill",
  "optimizing",
  "directions",
  "preview",
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
        {progress.step === "preview" ? (
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

function formatAppointmentWindow(start: string, latestStart?: string | null) {
  const earliest = start.slice(0, 5)
  return latestStart ? `Start between ${earliest} and ${latestStart.slice(0, 5)}` : `Starts at ${earliest}`
}

export default function RoutesPage() {
  const { selectedDate, setSelectedDate } = useUIStore();
  const { data: jobs, isLoading: jobsLoading } = useJobsByDate(selectedDate);
  const { data: supplies } = useSupplies();
  const { data: route } = useRouteByDate(selectedDate);
  const { data: lastStartLocation } = useLastStartLocation();
  const optimizeRoute = useOptimizeRoute();
  const prepareSMS = usePrepareSMS();
  const sendSMS = useSendSMS();
  const startDay = useStartDay();
  const updateStatus = useUpdateJobStatus();
  const lowStockSupplies = (supplies ?? []).filter((supply) => supply.is_low_stock);

  const [editedLocations, setEditedLocations] = useState<Record<string, string>>({});
  const [smsReviewOpen, setSMSReviewOpen] = useState(false);
  const [smsReview, setSMSReview] = useState<SMSPreviewResult | null>(null);
  const [smsDrafts, setSMSDrafts] = useState<Record<string, string>>({});
  const [supplyUsageOpen, setSupplyUsageOpen] = useState(false);
  const [supplyUsageJob, setSupplyUsageJob] = useState<{
    id: string;
    scheduled_date: string;
    title: string;
    clientName: string;
  } | null>(null);
  const [replanningDate, setReplanningDate] = useState<string | null>(null);
  const [detectedStartPoint, setDetectedStartPoint] = useState<{
    date: string;
    label: string;
    latitude: number;
    longitude: number;
  } | null>(null);
  const savedStartLocation =
    (selectedDate ? editedLocations[selectedDate] : undefined) ??
    (route?.start_location || lastStartLocation || "");
  const replanningRemaining = replanningDate === selectedDate;
  const startLocation = replanningRemaining
    ? (selectedDate ? editedLocations[`remaining:${selectedDate}`] : undefined) ?? ""
    : savedStartLocation;

  const handleStartLocationChange = (
    val: string,
    coordinates?: { latitude: number; longitude: number } | null,
  ) => {
    if (!selectedDate) return;
    const key = replanningRemaining ? `remaining:${selectedDate}` : selectedDate;
    setEditedLocations((prev) => ({ ...prev, [key]: val }));
    setDetectedStartPoint(
      coordinates
        ? { date: selectedDate, label: val, ...coordinates }
        : null,
    );
  };

  const handleReviewArrivalTexts = async () => {
    if (!selectedDate) return;
    try {
      const preview = await prepareSMS.mutateAsync(selectedDate);
      setSMSReview(preview);
      setSMSDrafts(Object.fromEntries(preview.messages.map((item) => [item.jobId, item.message])));
      setSMSReviewOpen(true);
    } catch {
      // The mutation surfaces its server error as a toast.
    }
  };

  const reviewedMessagesAreValid = Boolean(
    smsReview?.messages.length &&
    smsReview.messages.every((item) => {
      const message = (smsDrafts[item.jobId] ?? "").trim();
      return message.length <= MAX_SMS_CHARACTERS && message.endsWith(OPT_OUT_SUFFIX.trim());
    }),
  );

  const handleSendReviewedTexts = async () => {
    if (!selectedDate || !smsReview || !reviewedMessagesAreValid) return;
    try {
      await sendSMS.mutateAsync({
        date: selectedDate,
        previewToken: smsReview.previewToken,
        orderedJobIds: smsReview.orderedJobIds,
        messages: smsReview.messages.map((item) => ({
          jobId: item.jobId,
          message: (smsDrafts[item.jobId] ?? "").trim(),
        })),
      });
      setSMSReviewOpen(false);
      setSMSReview(null);
      setSMSDrafts({});
    } catch {
      // The mutation surfaces its server error as a toast; keep drafts for correction.
    }
  };

  useEffect(() => {
    if (!selectedDate) {
      setSelectedDate(format(new Date(), "yyyy-MM-dd"));
    }
  }, [selectedDate, setSelectedDate]);

  if (!selectedDate) return null;

  const dateObj = parseISO(selectedDate);
  const todayStr = format(new Date(), "yyyy-MM-dd");
  const isToday = selectedDate === todayStr;

  const goToDay = (offset: number) => {
    const newDate = offset > 0 ? addDays(dateObj, 1) : subDays(dateObj, 1);
    setReplanningDate(null);
    setSelectedDate(format(newDate, "yyyy-MM-dd"));
  };

  const routableJobs =
    jobs?.filter((j) => j.status === "pending" || j.status === "in_progress") ??
    [];
  const pendingJobs = routableJobs.filter((job) => job.status === "pending");
  const orderedJobIds = route?.optimization_result?.orderedJobIds ?? [];
  const canPlanRemainingJobs = route?.status === "completed" &&
    routableJobs.length > 0 &&
    routableJobs.every((job) => !orderedJobIds.includes(job.id));
  const routeIsLocked = route?.status === "in_progress" ||
    (route?.status === "completed" && !canPlanRemainingJobs);

  const handleOptimize = () => {
    if (!startLocation.trim()) return;
    const detectedCoordinates =
      detectedStartPoint?.date === selectedDate &&
      detectedStartPoint.label === startLocation
        ? {
            latitude: detectedStartPoint.latitude,
            longitude: detectedStartPoint.longitude,
          }
        : null;
    const savedCoordinates =
      !replanningRemaining &&
      route?.start_location === startLocation &&
      route.start_latitude !== null &&
      route.start_longitude !== null
        ? {
            latitude: route.start_latitude,
            longitude: route.start_longitude,
          }
        : null;

    optimizeRoute.mutate({
      date: selectedDate,
      startLocation,
      startCoordinates: detectedCoordinates ?? savedCoordinates,
      mode: replanningRemaining ? "remaining" : "day",
    });
  };

  const hasSavedRouteStops = !!route && orderedJobIds.length > 0;
  const sortedJobs =
    hasSavedRouteStops
      ? orderedJobIds
          .map((id) => jobs?.find((j) => j.id === id))
          .filter((j): j is NonNullable<typeof j> => !!j)
      : routableJobs;
  const unresolvedRouteJobs = sortedJobs.filter(
    (job) => job.status === "pending" || job.status === "in_progress",
  );
  const savedTimingConflictIds = new Set(
    route?.optimization_result?.appointmentConflictJobIds ?? [],
  );
  const actionableSavedTimingConflicts = unresolvedRouteJobs.filter((job) =>
    savedTimingConflictIds.has(job.id),
  );
  const unscheduledJobs = hasSavedRouteStops
    ? routableJobs.filter((job) => !orderedJobIds.includes(job.id))
    : [];

  const routePreviewJobIds = optimizeRoute.proposal?.date === selectedDate
    ? optimizeRoute.proposal.orderedJobIds
    : route?.optimization_result?.activeSegment
      ? route.optimization_result.activeSegment.orderedJobIds
      : sortedJobs.map((job) => job.id);
  const routePreviewJobs = routePreviewJobIds
    .map((jobId) => jobs?.find((job) => job.id === jobId))
    .filter((job): job is NonNullable<typeof job> => !!job);
  const mapStops = routePreviewJobs
    .filter((j) => j.latitude && j.longitude)
    .map((j, index) => ({
      id: j.id,
      latitude: j.latitude!,
      longitude: j.longitude!,
      label: `${j.title} — ${j.client?.full_name}`,
      order: index + 1,
    }));

  const mapStart = optimizeRoute.proposal?.date === selectedDate
    ? {
        latitude: optimizeRoute.proposal.startLatitude,
        longitude: optimizeRoute.proposal.startLongitude,
        label: optimizeRoute.proposal.startLocation,
      }
    : route?.optimization_result?.activeSegment
      ? {
          latitude: route.optimization_result.activeSegment.latitude,
          longitude: route.optimization_result.activeSegment.longitude,
          label: route.optimization_result.activeSegment.startLocation,
        }
      : route?.start_latitude && route?.start_longitude
      ? {
          latitude: route.start_latitude,
          longitude: route.start_longitude,
          label: route.start_location ?? "Start",
        }
      : null;

  const navigationJobs = sortedJobs.filter((job) => job.status !== "cancelled");
  const mapLocationForJob = (job: (typeof sortedJobs)[number]) => ({
    address: job.address,
    latitude: job.latitude,
    longitude: job.longitude,
  });
  const navigateToStop = (jobId: string) => {
    const activeSegment = route?.status === "in_progress"
      ? route.optimization_result?.activeSegment
      : undefined;
    if (activeSegment?.orderedJobIds.includes(jobId)) {
      const activeJobs = activeSegment.orderedJobIds
        .map((id) => jobs?.find((job) => job.id === id))
        .filter((job): job is NonNullable<typeof job> => !!job);
      const targetIndex = activeJobs.findIndex((job) => job.id === jobId);
      const url = buildGoogleMapsDirectionsUrl({
        start: {
          address: activeSegment.startLocation,
          latitude: activeSegment.latitude,
          longitude: activeSegment.longitude,
        },
        stops: activeJobs.slice(0, targetIndex + 1).map(mapLocationForJob),
        targetIndex,
        maxWaypoints: getGoogleMapsWaypointLimit(navigator.userAgent),
      });
      if (url) window.location.assign(url);
      return;
    }
    const targetIndex = navigationJobs.findIndex((job) => job.id === jobId);
    if (targetIndex < 0) return;

    const previousJobs = navigationJobs.slice(0, targetIndex);
    let lastCompletedIndex = -1;
    previousJobs.forEach((job, index) => {
      if (job.status === "completed" || job.status === "in_progress") lastCompletedIndex = index;
    });
    const routeSegmentJobs = navigationJobs
      .slice(lastCompletedIndex + 1, targetIndex + 1)
      .filter((job) => job.status !== "completed");
    const segmentStart = lastCompletedIndex >= 0
      ? mapLocationForJob(previousJobs[lastCompletedIndex])
      : {
          address: route?.start_location ?? startLocation,
          latitude: route?.start_latitude,
          longitude: route?.start_longitude,
        };
    const url = buildGoogleMapsDirectionsUrl({
      start: segmentStart,
      stops: routeSegmentJobs.map(mapLocationForJob),
      targetIndex: routeSegmentJobs.length - 1,
      maxWaypoints: getGoogleMapsWaypointLimit(navigator.userAgent),
    });

    // Keep the route in this tab's history so Back returns to Routemaster.
    if (url) window.location.assign(url);
  };

  const geometry = optimizeRoute.proposal?.date === selectedDate
    ? optimizeRoute.proposal.geometry
    : route?.optimization_result?.geometry ?? [];

  const proposalStops = optimizeRoute.proposal?.stops ?? [];
  const completedVisits = (jobs ?? []).filter((job) => job.status === "completed");
  const measuredVisits = completedVisits.flatMap((job) => {
    const actualMinutes = getVisitDurationMinutes(job.visit_started_at, job.completed_at);
    return actualMinutes === null ? [] : [{ actualMinutes, plannedMinutes: job.estimated_duration }];
  });
  const measuredActualMinutes = measuredVisits.reduce((total, visit) => total + visit.actualMinutes, 0);
  const measuredPlannedMinutes = measuredVisits.reduce((total, visit) => total + visit.plannedMinutes, 0);
  const serviceTimeDifference = measuredPlannedMinutes - measuredActualMinutes;
  const routeStartedAt = route?.started_at ? Date.parse(route.started_at) : Number.NaN;
  const routeCompletedAt = route?.completed_at ? Date.parse(route.completed_at) : Number.NaN;
  const actualElapsedMinutes = route?.status === "completed"
    && Number.isFinite(routeStartedAt)
    && Number.isFinite(routeCompletedAt)
    && routeCompletedAt >= routeStartedAt
    ? Math.round((routeCompletedAt - routeStartedAt) / 60_000)
    : null;
  const plannedRouteJobs = sortedJobs.filter((job) => job.status !== "cancelled");
  const plannedWorkdayMinutes = route?.total_duration_mins == null || route.is_recalculated
    ? null
    : route.total_duration_mins + plannedRouteJobs.reduce((total, job) => total + job.estimated_duration, 0);
  const elapsedDifferenceMinutes = actualElapsedMinutes !== null && plannedWorkdayMinutes !== null
    ? actualElapsedMinutes - plannedWorkdayMinutes
    : null;
  const proposalCanApply = !!optimizeRoute.proposal && optimizeRoute.proposal.orderedJobIds.length > 0;
  const proposalDistanceChangeKm = optimizeRoute.proposal?.currentDistanceMeters !== null && optimizeRoute.proposal?.currentDistanceMeters !== undefined
    ? (optimizeRoute.proposal.currentDistanceMeters - optimizeRoute.proposal.distanceMeters) / 1000
    : null;
  const proposalDriveTimeChangeMinutes = optimizeRoute.proposal?.currentDriveDurationSeconds !== null && optimizeRoute.proposal?.currentDriveDurationSeconds !== undefined
    ? (optimizeRoute.proposal.currentDriveDurationSeconds - optimizeRoute.proposal.driveDurationSeconds) / 60
    : null;
  const formatDuration = (mins: number) => {
    const h = Math.floor(mins / 60);
    const m = Math.round(mins % 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };
  const getExcludedJobReason = (jobId: string) => {
    const proposal = optimizeRoute.proposal;
    const job = jobs?.find((item) => item.id === jobId);
    if (!proposal || !job) return "Review this job's address and appointment details.";
    if (proposal.unlocatedJobIds.includes(jobId)) {
      return "Its address could not be located. Update the address, then optimize again.";
    }

    return "The road-routing service could not build a driving path to this stop. Check its address and location, then try again.";
  };

  return (
    <PageTransition>
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
                onClick={() => { setReplanningDate(null); setSelectedDate(todayStr); }}
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

        {lowStockSupplies.length > 0 && route?.status !== "in_progress" && route?.status !== "completed" && (
          <div className="mb-6 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4" role="status">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-amber-950">
                {lowStockSupplies.length} supply item{lowStockSupplies.length === 1 ? " is" : "s are"} at or below minimum stock
              </p>
              <p className="mt-0.5 text-sm text-amber-900">
                {lowStockSupplies.slice(0, 3).map((supply) => `${supply.name} (${supply.current_quantity} ${supply.unit})`).join(" · ")}
                {lowStockSupplies.length > 3 ? ` · +${lowStockSupplies.length - 3} more` : ""}
              </p>
              <Link href="/dashboard/supplies" className="mt-1 inline-block text-sm font-medium text-amber-950 underline underline-offset-2">
                Review supplies before heading out
              </Link>
            </div>
          </div>
        )}

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
                Add jobs for this day first, then come back to optimize your
                route
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
                      onChange={handleStartLocationChange}
                      disabled={(routeIsLocked && (!replanningRemaining || pendingJobs.length === 0)) || optimizeRoute.isPending || sendSMS.isPending}
                      label={replanningRemaining ? "Current Location" : undefined}
                      placeholder={replanningRemaining ? "Where are you now?" : undefined}
                      hint={replanningRemaining ? "Detect your position or enter your current address before replanning" : undefined}
                    />
                  </div>
                  {route?.status === "in_progress" && pendingJobs.length > 0 && !replanningRemaining && (
                    <Button variant="outline" onClick={() => {
                      setReplanningDate(selectedDate);
                      setEditedLocations((previous) => ({ ...previous, [`remaining:${selectedDate}`]: "" }));
                      setDetectedStartPoint(null);
                      optimizeRoute.discard();
                    }} disabled={optimizeRoute.isPending || optimizeRoute.isApplying}>
                      Replan remaining stops
                    </Button>
                  )}
                  {(!routeIsLocked || (replanningRemaining && pendingJobs.length > 0)) && (
                    <Button
                      onClick={handleOptimize}
                      disabled={!startLocation.trim() || optimizeRoute.isPending || sendSMS.isPending}
                    >
                      {optimizeRoute.isPending ? (
                        <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Optimizing...</>
                      ) : (
                        <><Navigation className="w-4 h-4 mr-1.5" />{replanningRemaining ? "Plan remaining route" : route ? "Re-optimize Route" : "Optimize Route"}</>
                      )}
                    </Button>
                  )}
                </div>

                {routeIsLocked && !replanningRemaining && (
                  <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900" role="status">
                    {route?.status === "completed"
                      ? "This workday is complete. Its saved route is locked."
                      : "This workday has started. Its saved route is locked while you work."}
                  </p>
                )}
                {replanningRemaining && route?.status === "in_progress" && (
                  <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900" role="status">
                    Choose your current location. Routemaster will reorder only pending stops; completed and active visits stay untouched. The new route is a preview until you apply it.
                    <Button variant="link" size="sm" className="ml-1 h-auto p-0" onClick={() => {
                      setReplanningDate(null);
                      optimizeRoute.discard();
                    }}>Cancel</Button>
                  </div>
                )}
                {canPlanRemainingJobs && (
                  <p className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900" role="status">
                    The earlier route is complete. Plan the {routableJobs.length} remaining active {routableJobs.length === 1 ? "stop" : "stops"} as a follow-up route.
                  </p>
                )}
                {unresolvedRouteJobs.length > 1 && actionableSavedTimingConflicts.length > 0 && (
                  <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950" role="status">
                    This saved road route includes {actionableSavedTimingConflicts.length} stop(s) whose appointment windows may have passed or conflict with configured work hours. Confirm timing with those clients.
                  </p>
                )}

                <AnimatePresence>
                  <ProgressIndicator progress={optimizeRoute.progress} />
                </AnimatePresence>

                {optimizeRoute.proposal && (
                  <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-4" aria-live="polite">
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <h3 className="font-semibold text-gray-900">{optimizeRoute.proposal.mode === "remaining" ? "Review the remaining route" : "Review your proposed day"}</h3>
                        <p className="text-sm text-gray-600">
                          {optimizeRoute.proposal.orderedJobIds.length} of {optimizeRoute.proposal.totalJobCount} stops included in the road route · {(
                            optimizeRoute.proposal.distanceMeters / 1000
                          ).toFixed(1)} km · {formatDuration(optimizeRoute.proposal.driveDurationSeconds / 60)} driving · {formatDuration(optimizeRoute.proposal.serviceDurationMinutes)} on-site
                        </p>
                        {proposalDistanceChangeKm !== null && proposalDriveTimeChangeMinutes !== null && (
                          <p className="mt-1 text-sm font-medium text-blue-800">
                            Compared with the current stop order: {Math.abs(proposalDistanceChangeKm).toFixed(1)} km {proposalDistanceChangeKm >= 0 ? "shorter" : "longer"} and {formatDuration(Math.abs(proposalDriveTimeChangeMinutes))} {proposalDriveTimeChangeMinutes >= 0 ? "less" : "more"} estimated driving.
                          </p>
                        )}
                      </div>
                    </div>

                    {optimizeRoute.proposal.orderedJobIds.length > 1 && optimizeRoute.proposal.appointmentConflictJobIds.length > 0 && (
                      <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950" role="status">
                        <p className="font-semibold">The road route includes these stops, but {optimizeRoute.proposal.appointmentConflictJobIds.length} appointment time(s) may have passed or conflict with your work hours.</p>
                        <p className="mt-1">Review the order, then confirm timing with the affected clients. Routemaster keeps the stops in the route instead of dropping them.</p>
                        <ul className="mt-2 list-disc space-y-1 pl-5">
                          {optimizeRoute.proposal.appointmentConflictJobIds.map((jobId) => {
                            const job = jobs?.find((item) => item.id === jobId);
                            return <li key={jobId}>{job?.title ?? "Scheduled job"} — {job?.client?.full_name ?? "Client"}</li>;
                          })}
                        </ul>
                      </div>
                    )}

                    <ol className="mt-3 max-h-64 space-y-2 overflow-y-auto" aria-label="Proposed stop order">
                      {proposalStops.map((stop, index) => {
                        const job = jobs?.find((item) => item.id === stop.jobId);
                        return (
                          <li key={stop.jobId} className="flex items-center gap-3 rounded-lg bg-white px-3 py-2 text-sm">
                            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-100 font-semibold text-blue-700">{index + 1}</span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate font-medium text-gray-900">{job?.title ?? "Scheduled job"} — {job?.client?.full_name ?? "Client"}</span>
                              <span className="text-gray-500">{stop.scheduledTime ? formatAppointmentWindow(stop.scheduledTime, stop.latestStartTime) : "Time not set"} · {stop.estimatedDurationMinutes ?? 0} min service</span>
                            </span>
                          </li>
                        );
                      })}
                    </ol>

                    {optimizeRoute.proposal.skippedJobIds.length > 0 && (
                      <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950" role="status">
                        <p className="font-semibold">{optimizeRoute.proposal.skippedJobIds.length} job(s) will remain unscheduled</p>
                        <ul className="mt-2 space-y-2">
                          {optimizeRoute.proposal.skippedJobIds.map((jobId) => {
                            const job = jobs?.find((item) => item.id === jobId);
                            return (
                              <li key={jobId}>
                                <span className="font-medium">{job?.title ?? "Scheduled job"} — {job?.client?.full_name ?? "Client"}:</span>{" "}
                                {getExcludedJobReason(jobId)}
                              </li>
                            );
                          })}
                        </ul>
                        <p className="mt-2">These jobs remain in Routemaster. Resolve their locations before adding them to a driving route.</p>
                        <Link href="/dashboard/jobs" className="mt-2 inline-block font-medium text-amber-900 underline underline-offset-2">Review jobs</Link>
                      </div>
                    )}

                    <div className="mt-4 flex flex-wrap justify-end gap-2">
                      <Button variant="outline" onClick={() => optimizeRoute.discard()} disabled={optimizeRoute.isApplying}>Discard proposal</Button>
                      <Button onClick={optimizeRoute.apply} disabled={!proposalCanApply || (routeIsLocked && optimizeRoute.proposal.mode !== "remaining") || optimizeRoute.isApplying}>
                        {optimizeRoute.isApplying ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving route...</> : optimizeRoute.proposal.mode === "remaining" ? `Apply remaining route (${optimizeRoute.proposal.orderedJobIds.length} ${optimizeRoute.proposal.orderedJobIds.length === 1 ? "stop" : "stops"})` : routeIsLocked ? "Workday route is locked" : optimizeRoute.proposal.skippedJobIds.length > 0 ? `Apply route for ${optimizeRoute.proposal.orderedJobIds.length} ${optimizeRoute.proposal.orderedJobIds.length === 1 ? "stop" : "stops"}` : "Apply this route"}
                      </Button>
                    </div>
                  </div>
                )}

                {optimizeRoute.appliedProposal?.date === selectedDate && (
                  <div className="flex flex-col gap-3 rounded-xl border border-green-200 bg-green-50 p-4 sm:flex-row sm:items-center sm:justify-between" role="status" aria-live="polite">
                    <div className="flex items-start gap-3">
                      <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-green-700" />
                      <div>
                        <h3 className="font-semibold text-green-900">Route applied and saved</h3>
                        <p className="text-sm text-green-800">
                          {optimizeRoute.appliedProposal.mode === "remaining" ? "Remaining route updated from your current location. Completed and active visits were kept as-is. " : ""}{optimizeRoute.appliedProposal.orderedJobIds.length} {optimizeRoute.appliedProposal.orderedJobIds.length === 1 ? "stop" : "stops"} · {(optimizeRoute.appliedProposal.distanceMeters / 1000).toFixed(1)} km · {formatDuration(optimizeRoute.appliedProposal.driveDurationSeconds / 60)} driving. The map and stop list below show the saved route.
                          {optimizeRoute.appliedProposal.skippedJobIds.length > 0 ? ` ${optimizeRoute.appliedProposal.skippedJobIds.length} other job(s) remain unscheduled and visible below.` : ""}
                          {optimizeRoute.appliedProposal.orderedJobIds.length > 1 && optimizeRoute.appliedProposal.appointmentConflictJobIds.length > 0 ? " Appointment-time conflicts were flagged; confirm timing with affected clients before sending messages." : ""}
                        </p>
                      </div>
                    </div>
                    <Button variant="outline" size="sm" onClick={optimizeRoute.dismissApplied}>Dismiss</Button>
                  </div>
                )}

                {route && !optimizeRoute.isPending && (
                  <Button
                    variant="outline"
                    onClick={handleReviewArrivalTexts}
                    disabled={prepareSMS.isPending || sendSMS.isPending || optimizeRoute.isPending || optimizeRoute.isApplying || !!optimizeRoute.proposal}
                    className="w-full sm:w-auto"
                  >
                    {prepareSMS.isPending ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Preparing messages...
                      </>
                    ) : (
                      <>
                        <MessageSquare className="w-4 h-4 mr-1.5" />
                        Review Arrival Texts
                      </>
                    )}
                  </Button>
                )}
                {route && !optimizeRoute.isPending && (
                  <p className="text-xs text-gray-500">
                    Review each message before sending. Only clients who prefer SMS are included; call and no-contact preferences are respected.
                  </p>
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

        {/* Active Job + Job List */}
        {sortedJobs.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-gray-900">
                Today&apos;s Stops
              </h2>
              {route?.status === "optimized" && (
                <Button
                  size="sm"
                  onClick={() => startDay.mutate(selectedDate)}
                  disabled={startDay.isPending || !!optimizeRoute.proposal}
                  title={optimizeRoute.proposal ? "Apply or discard the route proposal before starting the day." : undefined}
                >
                  {startDay.isPending ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                      Starting...
                    </>
                  ) : (
                    unscheduledJobs.length > 0 ? "Start partial day" : "Start Day"
                  )}
                </Button>
              )}
            </div>

            {sortedJobs.map((job, index) => {
              const isCompleted = job.status === "completed";
              const isCancelled = job.status === "cancelled";
              const isCurrent =
                route?.status === "in_progress" &&
                !isCompleted &&
                !isCancelled &&
                sortedJobs
                  .slice(0, index)
                  .every(
                    (j) => j.status === "completed" || j.status === "cancelled",
                  );

              return (
                <motion.div
                  key={job.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className={`bg-white border rounded-xl p-4 transition-all ${
                    isCurrent
                      ? "border-blue-400 shadow-md shadow-blue-100 ring-2 ring-blue-100"
                      : isCompleted
                        ? "border-green-100 bg-green-50/30 opacity-70"
                        : isCancelled
                          ? "border-gray-100 opacity-50"
                          : "border-gray-100"
                  }`}
                >
                  <div className="flex flex-wrap items-center gap-3 sm:flex-nowrap sm:gap-4">
                    {/* Stop number */}
                    <div
                      className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0 ${
                        isCompleted
                          ? "bg-green-600 text-white"
                          : isCurrent
                            ? "bg-blue-600 text-white"
                            : "bg-gray-100 text-gray-500"
                      }`}
                    >
                      {isCompleted ? (
                        <CheckCircle2 className="w-5 h-5" />
                      ) : orderedJobIds.length > 0 ? (
                        index + 1
                      ) : (
                        "–"
                      )}
                    </div>

                    {/* Job info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p
                          className={`font-semibold truncate ${isCompleted ? "text-gray-400 line-through" : "text-gray-900"}`}
                        >
                          {job.title}
                        </p>
                        {isCurrent && (
                          <span className="text-xs bg-blue-100 text-blue-700 font-semibold px-2 py-0.5 rounded-full">
                            Current Stop
                          </span>
                        )}
                        {job.sms_sent && (
                          <span className="text-xs bg-green-50 text-green-700 border border-green-200 px-2 py-0.5 rounded-full">
                            SMS ✓
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {job.client?.full_name} · {job.address}
                      </p>
                      {(job.client?.notes?.trim() || job.notes?.trim()) && (
                        <details
                          className="mt-2 max-w-2xl rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-2 text-xs text-amber-950"
                          open={isCurrent}
                        >
                          <summary className="flex cursor-pointer list-none items-center gap-1.5 font-semibold marker:hidden">
                            <FileText className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                            Stop notes
                          </summary>
                          <div className="mt-2 space-y-1.5 whitespace-pre-wrap break-words leading-relaxed">
                            {job.client?.notes?.trim() && (
                              <p><span className="font-semibold">Client:</span> {job.client.notes.trim()}</p>
                            )}
                            {job.notes?.trim() && (
                              <p><span className="font-semibold">This job:</span> {job.notes.trim()}</p>
                            )}
                          </div>
                        </details>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex flex-wrap items-center justify-end gap-2 flex-shrink-0">
                      <Badge variant="outline" className="text-xs">
                        {job.latest_start_time
                          ? `${job.scheduled_time.slice(0, 5)}–${job.latest_start_time.slice(0, 5)}`
                          : job.scheduled_time.slice(0, 5)}
                      </Badge>

                      {(job.status === "in_progress" || isCompleted) && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-amber-200 text-amber-800 hover:bg-amber-50"
                          onClick={() => {
                            setSupplyUsageJob({
                              id: job.id,
                              scheduled_date: job.scheduled_date,
                              title: job.title,
                              clientName: job.client?.full_name ?? "Client",
                            });
                            setSupplyUsageOpen(true);
                          }}
                          title="Record supplies used for this visit"
                        >
                          <PackageCheck className="w-3.5 h-3.5 mr-1" />
                          <span className="hidden sm:inline">Supplies</span>
                        </Button>
                      )}

                      {!isCompleted && !isCancelled && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-blue-200 text-blue-700 hover:bg-blue-50"
                          onClick={() => navigateToStop(job.id)}
                          title="Open directions from the route start or last completed stop, following the saved order"
                        >
                          <Navigation className="w-3.5 h-3.5 mr-1" />
                          Navigate
                        </Button>
                      )}

                      {isCurrent && job.status === "pending" && (
                        <Button
                          size="sm"
                          className="bg-blue-600 hover:bg-blue-700"
                          disabled={updateStatus.isPending || optimizeRoute.isApplying}
                          onClick={() => {
                            optimizeRoute.discard("Visit status changed, so the route preview was cleared. Replan to review the latest stops.");
                            updateStatus.mutate({
                              id: job.id,
                              status: "in_progress",
                              date: job.scheduled_date,
                            });
                          }}
                        >
                          <Clock className="w-3.5 h-3.5 mr-1" />
                          Start visit
                        </Button>
                      )}

                      {isCurrent && job.status === "in_progress" && (
                        <Button
                          size="sm"
                          className="bg-green-600 hover:bg-green-700"
                          disabled={updateStatus.isPending || optimizeRoute.isApplying}
                          onClick={() => {
                            optimizeRoute.discard("Visit status changed, so the route preview was cleared. Replan to review the latest stops.");
                            updateStatus.mutate({
                              id: job.id,
                              status: "completed",
                              date: job.scheduled_date,
                            });
                          }}
                        >
                          <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                          Complete visit
                        </Button>
                      )}
                    </div>
                  </div>
                </motion.div>
              );
            })}

            {unscheduledJobs.length > 0 && (
              <section className="rounded-xl border border-amber-200 bg-amber-50/70 p-4" aria-labelledby="unscheduled-heading">
                <h3 id="unscheduled-heading" className="font-semibold text-amber-950">
                  Needs scheduling ({unscheduledJobs.length})
                </h3>
                <p className="mt-1 text-sm text-amber-900">
                  These jobs are still on this date, but are not part of the saved route. They remain in Routemaster and will not be included in navigation.
                </p>
                <ul className="mt-3 space-y-2">
                  {unscheduledJobs.map((job) => (
                    <li key={job.id} className="rounded-lg bg-white/80 px-3 py-2">
                      <p className="font-medium text-gray-900">{job.title} — {job.client?.full_name ?? "Client"}</p>
                      <p className="text-sm text-gray-600">{job.scheduled_time.slice(0, 5)} · {job.estimated_duration} min · {job.address}</p>
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-sm text-amber-950">
                  These stops stay active and are not lost. Check their address or coordinates, then optimize again. Appointment-time conflicts are shown as warnings and do not remove a stop from a road route.
                </p>
                <Link href="/dashboard/jobs" className="mt-2 inline-block text-sm font-medium text-amber-950 underline underline-offset-2">Review jobs</Link>
              </section>
            )}

            {measuredVisits.length > 0 && (
              <div className="rounded-xl border border-blue-100 bg-blue-50/70 p-4" role="status" aria-live="polite">
                <p className="font-semibold text-blue-950">Measured on-site time</p>
                <p className="mt-1 text-sm text-blue-900">
                  {formatDuration(measuredActualMinutes)} actual across {measuredVisits.length} visit{measuredVisits.length === 1 ? "" : "s"}, compared with {formatDuration(measuredPlannedMinutes)} planned
                  {serviceTimeDifference === 0
                    ? "."
                    : ` (${formatDuration(Math.abs(serviceTimeDifference))} ${serviceTimeDifference > 0 ? "under" : "over"} estimate).`}
                </p>
                <p className="mt-1 text-xs text-blue-800">
                  Tracked for {measuredVisits.length} of {completedVisits.length} completed visits. This measures on-site time only; it excludes driving and waiting.
                </p>
              </div>
            )}

            {actualElapsedMinutes !== null && (
              <div className="rounded-xl border border-indigo-100 bg-indigo-50/70 p-4" role="status" aria-live="polite">
                <p className="font-semibold text-indigo-950">Completed route: elapsed workday</p>
                <p className="mt-1 text-sm text-indigo-900">
                  {formatDuration(actualElapsedMinutes)} from Start Day to the final stop.
                  {plannedWorkdayMinutes !== null && elapsedDifferenceMinutes !== null ? (
                    <> The route estimate was {formatDuration(route?.total_duration_mins ?? 0)} driving plus {formatDuration(plannedRouteJobs.reduce((total, job) => total + job.estimated_duration, 0))} planned on-site time. {elapsedDifferenceMinutes === 0
                      ? "Elapsed time matched the combined estimate."
                      : `Elapsed time was ${formatDuration(Math.abs(elapsedDifferenceMinutes))} ${elapsedDifferenceMinutes > 0 ? "longer" : "shorter"} than that estimate.`}</>
                  ) : route?.is_recalculated ? (
                    " The route was replanned during the day, so its remaining-route estimate is not comparable with the full-day elapsed time."
                  ) : null}
                </p>
                <p className="mt-1 text-xs text-indigo-800">
                  Elapsed time includes travel, waiting, and breaks; it is not a measured driving-time comparison. It starts when you tap Start Day, so starting early can increase the elapsed total.
                </p>
              </div>
            )}

            {/* Route workday completion */}
            {sortedJobs.every(
              (j) => j.status === "completed" || j.status === "cancelled",
            ) &&
              sortedJobs.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className={`${unscheduledJobs.length > 0 ? "bg-amber-50 border-amber-200" : "bg-green-50 border-green-200"} border rounded-xl p-6 text-center`}
                >
                  {unscheduledJobs.length > 0 ? (
                    <>
                      <p className="font-semibold text-amber-900">All routed stops are complete; this workday still has unscheduled jobs.</p>
                      <p className="text-sm text-amber-800 mt-1">The saved route is complete. These jobs still need to be rescheduled or completed in Jobs.</p>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-10 h-10 text-green-600 mx-auto mb-2" />
                      <p className="font-semibold text-green-800">All jobs complete!</p>
                      <p className="text-sm text-green-600 mt-1">Great work today. See you tomorrow.</p>
                    </>
                  )}
                </motion.div>
              )}
          </div>
        )}
      </div>
      <LogUsageSheet
        open={supplyUsageOpen}
        onOpenChange={(open) => {
          setSupplyUsageOpen(open);
          if (!open) setSupplyUsageJob(null);
        }}
        jobContext={supplyUsageJob}
      />
      <Dialog open={smsReviewOpen} onOpenChange={setSMSReviewOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Review arrival messages</DialogTitle>
            <DialogDescription>
              Routemaster estimates arrival from the saved route, road travel durations, and planned visit lengths. Estimates do not include live traffic. Check the original appointment and estimate, edit each message as needed, then choose whether to send. Nothing is sent during review.
            </DialogDescription>
          </DialogHeader>

          {smsReview?.deliveryMode === "mock" && (
            <p className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900" role="status">
              Preview mode only: this environment will not send real texts. Production delivery requires configured Twilio credentials.
            </p>
          )}
          {smsReview?.deliveryMode === "unavailable" && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900" role="status">
              Messages can be reviewed, but sending is unavailable until Twilio delivery is configured.
            </p>
          )}
          {smsReview?.messages.length && !smsReview.etaAvailable && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950" role="status">
              A route-based arrival estimate is unavailable. Drafts use the saved appointment time; check the timing and edit each message before sending.
            </p>
          )}
          {smsReview?.etaAvailable && smsReview.etaStartBasis && (
            <p className="text-sm text-muted-foreground" role="status">
              Estimates start from {smsReview.etaStartBasis}. Update your current location and replan first if you have moved since then.
            </p>
          )}

          <div className="space-y-4">
            {smsReview?.messages.map((item) => {
              const message = smsDrafts[item.jobId] ?? "";
              const hasOptOutText = message.trim().endsWith(OPT_OUT_SUFFIX.trim());
              return (
                <section key={item.jobId} className="rounded-xl border p-4">
                  <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                    <div>
                      <h3 className="font-semibold">{item.clientName}</h3>
                      <p className="text-sm text-muted-foreground">{item.jobTitle} · {formatAppointmentWindow(item.scheduledTime, item.latestStartTime)} · phone ending {item.phoneLast4 || "unknown"}</p>
                      {item.appointmentConflict && (
                        <p className="mt-1 text-sm font-medium text-amber-800">Appointment timing needs confirmation with this client.</p>
                      )}
                      {item.estimatedArrivalTime && (
                        <p className={`mt-1 text-sm font-medium ${item.estimatedArrivalIsLate ? "text-amber-800" : "text-blue-800"}`}>
                          {item.estimatedArrivalIsLate ? "Running late · " : ""}Estimated arrival around {item.estimatedArrivalTime}
                        </p>
                      )}
                    </div>
                  </div>
                  <label htmlFor={`sms-message-${item.jobId}`} className="mb-1.5 block text-sm font-medium">Message</label>
                  <Textarea
                    id={`sms-message-${item.jobId}`}
                    value={message}
                    maxLength={MAX_SMS_CHARACTERS}
                    rows={3}
                    onChange={(event) => setSMSDrafts((current) => ({ ...current, [item.jobId]: event.target.value }))}
                    aria-describedby={`sms-help-${item.jobId}`}
                  />
                  <p id={`sms-help-${item.jobId}`} className={`mt-1 text-xs ${hasOptOutText ? "text-muted-foreground" : "text-red-700"}`}>
                    {message.length}/{MAX_SMS_CHARACTERS} characters. Keep “{OPT_OUT_SUFFIX.trim()}” at the end.
                  </p>
                </section>
              );
            })}
            {smsReview?.messages.length === 0 && (
              <p className="rounded-lg border bg-muted/40 p-4 text-sm">No stops are eligible for an arrival text. Check the skipped reasons below.</p>
            )}
          </div>

          {!!smsReview?.skipped.length && (
            <section className="rounded-lg border border-amber-200 bg-amber-50/70 p-3" aria-labelledby="sms-skipped-heading">
              <h3 id="sms-skipped-heading" className="text-sm font-semibold text-amber-950">Not included ({smsReview.skipped.length})</h3>
              <ul className="mt-2 space-y-1 text-sm text-amber-900">
                {smsReview.skipped.map((item) => (
                  <li key={item.jobId}>{item.clientName} — {item.jobTitle}: {item.reason}</li>
                ))}
              </ul>
            </section>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setSMSReviewOpen(false)} disabled={sendSMS.isPending}>Cancel</Button>
            <Button
              onClick={handleSendReviewedTexts}
              disabled={!reviewedMessagesAreValid || smsReview?.deliveryMode !== "twilio" || sendSMS.isPending}
            >
              {sendSMS.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Sending reviewed texts...</> : `Send ${smsReview?.messages.length ?? 0} reviewed text${smsReview?.messages.length === 1 ? "" : "s"}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageTransition>
  );
}
