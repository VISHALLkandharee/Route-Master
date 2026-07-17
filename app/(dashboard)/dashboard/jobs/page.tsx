"use client";

import { useState, useEffect } from "react";
import { format, addDays, subDays, parseISO } from "date-fns";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  MoreVertical,
  Pencil,
  Trash2,
  CheckCircle2,
  XCircle,
  Briefcase,
  Phone,
  Clock,
  RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useClients } from "@/lib/queries/clients";
import {
  useJobsByDate,
  useDeleteJob,
  useUpdateJobStatus,
  type Job,
} from "@/lib/queries/jobs";
import { JobFormSheet } from "@/components/dashboard/jobs/job-form-sheet";
import { useUIStore } from "@/lib/store/ui-store";
import Link from "next/link";

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-blue-50 text-blue-700 border-blue-200",
  in_progress: "bg-amber-50 text-amber-700 border-amber-200",
  completed: "bg-green-50 text-green-700 border-green-200",
  cancelled: "bg-gray-100 text-gray-500 border-gray-200",
};

const STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  in_progress: "In Progress",
  completed: "Completed",
  cancelled: "Cancelled",
};

export default function JobsPage() {
  const { selectedDate, setSelectedDate } = useUIStore();
  const { data: jobs, isLoading } = useJobsByDate(selectedDate);
  const { data: clients } = useClients();
  const deleteJob = useDeleteJob();
  const updateStatus = useUpdateJobStatus();

  const [formOpen, setFormOpen] = useState(false);
  const [editingJob, setEditingJob] = useState<Job | null>(null);
  const [deletingJob, setDeletingJob] = useState<Job | null>(null);

  useEffect(() => {
    if (!selectedDate) {
      setSelectedDate(format(new Date(), "yyyy-MM-dd"));
    }
  }, [selectedDate, setSelectedDate]);

  if (!selectedDate) {
    return null;
  }

  const dateObj = parseISO(selectedDate);
  const todayStr = format(new Date(), "yyyy-MM-dd");
  const isToday = selectedDate === todayStr;

  const goToDay = (offset: number) => {
    const newDate = offset > 0 ? addDays(dateObj, 1) : subDays(dateObj, 1);
    setSelectedDate(format(newDate, "yyyy-MM-dd"));
  };

  const openAddSheet = () => {
    setEditingJob(null);
    setFormOpen(true);
  };

  const openEditSheet = (job: Job) => {
    setEditingJob(job);
    setFormOpen(true);
  };

  const confirmDelete = () => {
    if (deletingJob) {
      deleteJob.mutate({
        id: deletingJob.id,
        date: deletingJob.scheduled_date,
      });
      setDeletingJob(null);
    }
  };

  const formatTime = (time: string) => {
    const [h, m] = time.split(":");
    const hour = parseInt(h, 10);
    const period = hour >= 12 ? "PM" : "AM";
    const displayHour = hour % 12 === 0 ? 12 : hour % 12;
    return `${displayHour}:${m} ${period}`;
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
        <h1 className="text-2xl font-bold text-gray-900">Jobs</h1>
        <Button onClick={openAddSheet}>
          <Plus className="w-4 h-4 mr-1.5" />
          Add Job
        </Button>
      </div>

      {/* No clients warning */}
      {clients?.length === 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6 text-sm text-amber-800">
          You don&apos;t have any clients yet.{" "}
          <Link href="/dashboard/clients" className="font-semibold underline">
            Add a client first
          </Link>{" "}
          before scheduling jobs.
        </div>
      )}

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

      {/* Loading State */}
      {isLoading && (
        <div className="space-y-3">
          {[...Array(2)].map((_, i) => (
            <div
              key={i}
              className="bg-white border border-gray-100 rounded-xl p-4 flex items-center gap-4"
            >
              <Skeleton className="w-12 h-12 rounded-xl" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty State */}
      {!isLoading && jobs?.length === 0 && (
        <div className="bg-white border border-gray-100 rounded-xl p-10 text-center">
          <div className="w-14 h-14 bg-blue-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Briefcase className="w-7 h-7 text-blue-600" />
          </div>
          <h3 className="font-semibold text-gray-900 mb-1">
            No jobs scheduled for this day
          </h3>
          <p className="text-gray-500 text-sm mb-4">
            Add a job to start building this day&apos;s route
          </p>
          <Button onClick={openAddSheet} disabled={clients?.length === 0}>
            <Plus className="w-4 h-4 mr-1.5" />
            Add Job
          </Button>
        </div>
      )}

      {/* Jobs List */}
      {!isLoading && jobs && jobs.length > 0 && (
        <div className="space-y-3">
          {jobs.map((job) => (
            <div
              key={job.id}
              className="bg-white border border-gray-100 rounded-xl p-4 flex items-center gap-4 hover:border-gray-200 transition-colors"
            >
              <div className="w-12 h-12 rounded-xl bg-blue-50 flex flex-col items-center justify-center flex-shrink-0">
                <Clock className="w-3.5 h-3.5 text-blue-600 mb-0.5" />
                <span className="text-[10px] font-semibold text-blue-700">
                  {formatTime(job.scheduled_time)}
                </span>
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-semibold text-gray-900 truncate">
                    {job.title}
                  </p>
                  <Badge
                    variant="outline"
                    className={STATUS_STYLES[job.status]}
                  >
                    {STATUS_LABELS[job.status]}
                  </Badge>
                </div>
                <div className="flex items-center gap-4 mt-1 text-xs text-gray-500">
                  <span>{job.client?.full_name}</span>
                  <span className="flex items-center gap-1">
                    <Phone className="w-3 h-3" />
                    {job.client?.phone}
                  </span>
                  {job.price && <span>${job.price.toFixed(2)}</span>}
                </div>
              </div>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="flex-shrink-0">
                    <MoreVertical className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => openEditSheet(job)}>
                    <Pencil className="w-4 h-4 mr-2" />
                    Edit
                  </DropdownMenuItem>
                  {job.status === "pending" || job.status === "in_progress" ? (
                    <>
                      <DropdownMenuItem
                        onClick={() =>
                          updateStatus.mutate({
                            id: job.id,
                            status: "completed",
                            date: job.scheduled_date,
                          })
                        }
                      >
                        <CheckCircle2 className="w-4 h-4 mr-2 text-green-600" />
                        Mark as Completed
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() =>
                          updateStatus.mutate({
                            id: job.id,
                            status: "cancelled",
                            date: job.scheduled_date,
                          })
                        }
                      >
                        <XCircle className="w-4 h-4 mr-2 text-gray-500" />
                        Cancel Job
                      </DropdownMenuItem>
                    </>
                  ) : (
                    <DropdownMenuItem
                      onClick={() =>
                        updateStatus.mutate({
                          id: job.id,
                          status: "pending",
                          date: job.scheduled_date,
                        })
                      }
                    >
                      <RotateCcw className="w-4 h-4 mr-2 text-blue-600" />
                      Reopen Job
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => setDeletingJob(job)}
                    className="text-red-600 focus:text-red-600"
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ))}
        </div>
      )}

      <JobFormSheet
        open={formOpen}
        onOpenChange={setFormOpen}
        job={editingJob}
        defaultDate={selectedDate}
      />

      <AlertDialog
        open={!!deletingJob}
        onOpenChange={(open) => !open && setDeletingJob(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this job?</AlertDialogTitle>
            <AlertDialogDescription>
              This job for {deletingJob?.client?.full_name} will be removed from
              your schedule.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
