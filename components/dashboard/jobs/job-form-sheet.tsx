"use client";

import { useEffect } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useClients } from "@/lib/queries/clients";
import { useCreateJob, useUpdateJob, type Job } from "@/lib/queries/jobs";

const SERVICE_TYPE_LABELS: Record<string, string> = {
  pet_grooming: "Pet Grooming",
  pool_cleaning: "Pool Cleaning",
  auto_detailing: "Auto Detailing",
  other: "Service",
};

const jobSchema = z.object({
  client_id: z.string().min(1, "Please select a client"),
  title: z.string().min(2, "Title is required"),
  scheduled_date: z.string().min(1, "Date is required"),
  scheduled_time: z.string().min(1, "Time is required"),
  estimated_duration: z.number().min(15, "Minimum 15 minutes"),
  price: z.number().optional(),
  notes: z.string().optional(),
});

type JobFormData = z.infer<typeof jobSchema>;

interface JobFormSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  job?: Job | null;
  defaultDate: string;
}

export function JobFormSheet({
  open,
  onOpenChange,
  job,
  defaultDate,
}: JobFormSheetProps) {
  const isEdit = !!job;
  const isLocked =
    isEdit && (job?.status === "completed" || job?.status === "cancelled");
  const { data: clients } = useClients();
  const createJob = useCreateJob();
  const updateJob = useUpdateJob();

  const {
    register,
    handleSubmit,
    control,
    reset,
    getValues,
    setValue,
    formState: { errors },
  } = useForm<JobFormData>({
    resolver: zodResolver(jobSchema),
    defaultValues: {
      client_id: "",
      title: "",
      scheduled_date: defaultDate,
      scheduled_time: "09:00",
      estimated_duration: 60,
      price: undefined,
      notes: "",
    },
  });

  useEffect(() => {
    if (!open) return;
    reset(
      job
        ? {
            client_id: job.client_id,
            title: job.title,
            scheduled_date: job.scheduled_date,
            scheduled_time: job.scheduled_time,
            estimated_duration: job.estimated_duration,
            price: job.price ?? undefined,
            notes: job.notes ?? "",
          }
        : {
            client_id: "",
            title: "",
            scheduled_date: defaultDate,
            scheduled_time: "09:00",
            estimated_duration: 60,
            price: undefined,
            notes: "",
          },
    );
  }, [open, job, defaultDate, reset]);

  const isPending = createJob.isPending || updateJob.isPending;

  const onSubmit = (data: JobFormData) => {
    if (isEdit && job) {
      updateJob.mutate(
        { id: job.id, ...data },
        { onSuccess: () => onOpenChange(false) },
      );
    } else {
      createJob.mutate(data, { onSuccess: () => onOpenChange(false) });
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{isEdit ? "Edit Job" : "Add New Job"}</SheetTitle>
        </SheetHeader>

        <form
          onSubmit={handleSubmit(onSubmit)}
          className="flex flex-col gap-4 px-4"
        >
          <div className="space-y-1.5">
            <Label htmlFor="client_id">Client</Label>
            <Controller
              name="client_id"
              control={control}
              render={({ field }) => (
                <Select
                  value={field.value}
                  onValueChange={(value) => {
                    field.onChange(value);
                    if (!isEdit && !getValues("title")) {
                      const client = clients?.find((c) => c.id === value);
                      if (client) {
                        const label =
                          SERVICE_TYPE_LABELS[client.service_type] ?? "Service";
                        setValue("title", `${label} — ${client.full_name}`);
                      }
                    }
                  }}
                >
                  <SelectTrigger
                    id="client_id"
                    className="w-full"
                    disabled={isLocked}
                  >
                    <SelectValue
                      placeholder={
                        clients?.length
                          ? "Select a client"
                          : "No clients yet — add one first"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {clients?.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.full_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {errors.client_id && (
              <p className="text-red-500 text-xs">{errors.client_id.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="title">Job Title</Label>
            <Input
              id="title"
              placeholder="Dog grooming — full service"
              {...register("title")}
            />
            {errors.title && (
              <p className="text-red-500 text-xs">{errors.title.message}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="scheduled_date">Date</Label>
              <Input
                id="scheduled_date"
                type="date"
                disabled={isLocked}
                {...register("scheduled_date")}
              />
              {errors.scheduled_date && (
                <p className="text-red-500 text-xs">
                  {errors.scheduled_date.message}
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="scheduled_time">Time</Label>
              <Input
                id="scheduled_time"
                type="time"
                disabled={isLocked}
                {...register("scheduled_time")}
              />
              {errors.scheduled_time && (
                <p className="text-red-500 text-xs">
                  {errors.scheduled_time.message}
                </p>
              )}
            </div>
          </div>

          {isLocked && (
            <p className="text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
              This job is{" "}
              {job?.status === "completed" ? "completed" : "cancelled"}. Client,
              date, and time are locked to keep your history accurate. Title,
              duration, price, and notes can still be updated.
            </p>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="estimated_duration">Duration (mins)</Label>
              <Input
                id="estimated_duration"
                type="number"
                step={15}
                {...register("estimated_duration", { valueAsNumber: true })}
              />
              {errors.estimated_duration && (
                <p className="text-red-500 text-xs">
                  {errors.estimated_duration.message}
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="price">Price ($)</Label>
              <Input
                id="price"
                type="number"
                step="0.01"
                placeholder="0.00"
                {...register("price", { valueAsNumber: true })}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="notes">Notes (optional)</Label>
            <Textarea
              id="notes"
              placeholder="Gate code, special instructions..."
              rows={3}
              {...register("notes")}
            />
          </div>

          <SheetFooter>
            <Button type="submit" disabled={isPending} className="w-full">
              {isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : isEdit ? (
                "Save Changes"
              ) : (
                "Add Job"
              )}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
