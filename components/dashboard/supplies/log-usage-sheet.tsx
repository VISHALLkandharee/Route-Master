"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSupplies, useLogSupplyUsage } from "@/lib/queries/supplies";
import { useJobsByDate } from "@/lib/queries/jobs";

interface LogUsageSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  jobContext?: {
    id: string;
    scheduled_date: string;
    title: string;
    clientName: string;
  } | null;
}

export function LogUsageSheet({ open, onOpenChange, jobContext = null }: LogUsageSheetProps) {
  const todayStr = format(new Date(), "yyyy-MM-dd");
  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [selectedJobId, setSelectedJobId] = useState("");
  const [quantities, setQuantities] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    setSelectedDate(jobContext?.scheduled_date ?? todayStr);
    setSelectedJobId(jobContext?.id ?? "");
    setQuantities({});
  }, [open, jobContext?.id, jobContext?.scheduled_date, todayStr]);

  const { data: supplies } = useSupplies();
  const { data: jobs } = useJobsByDate(selectedDate);
  const logUsage = useLogSupplyUsage();
  const stockShortages = (supplies ?? []).filter(
    (supply) => Number(quantities[supply.id] ?? 0) > supply.current_quantity,
  );
  const fractionalCountEntries = (supplies ?? []).filter(
    (supply) => ["pieces", "bottles", "boxes"].includes(supply.unit)
      && Number(quantities[supply.id] ?? 0) % 1 !== 0,
  );
  const excessPrecisionEntries = (supplies ?? []).filter((supply) => {
    const quantity = Number(quantities[supply.id] ?? 0);
    return quantity > 0
      && !["pieces", "bottles", "boxes"].includes(supply.unit)
      && Math.abs(quantity * 100 - Math.round(quantity * 100)) > 0.000001;
  });

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      setSelectedDate(todayStr);
      setSelectedJobId("");
      setQuantities({});
    }
    onOpenChange(newOpen);
  };

  const handleSubmit = () => {
    if (!selectedJobId) return;

    const entries = Object.entries(quantities)
      .map(([supply_id, qty]) => ({
        supply_id,
        quantity: Number(qty) || 0,
      }))
      .filter((e) => e.quantity > 0);

    if (entries.length === 0) return;

    logUsage.mutate(
      { jobId: selectedJobId, entries },
      { onSuccess: () => handleOpenChange(false) },
    );
  };

  const hasEntries = Object.values(quantities).some((q) => Number(q) > 0);

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Log Supply Usage</SheetTitle>
          <p className="text-sm text-muted-foreground">
            Enter only quantities not already recorded for this visit. Saving deducts them from inventory.
          </p>
        </SheetHeader>

        <div className="flex flex-col gap-5 px-4">
          {jobContext ? (
            <div className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2.5">
              <p className="text-xs font-medium text-blue-700">Recording usage for</p>
              <p className="mt-0.5 text-sm font-semibold text-blue-950">{jobContext.title}</p>
              <p className="text-xs text-blue-800">{jobContext.clientName} · {format(new Date(`${jobContext.scheduled_date}T12:00:00`), "MMM d, yyyy")}</p>
            </div>
          ) : (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="log_date">Date</Label>
                <Input
                  id="log_date"
                  type="date"
                  value={selectedDate}
                  onChange={(e) => {
                    setSelectedDate(e.target.value);
                    setSelectedJobId("");
                  }}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="log_job">Job</Label>
                <Select value={selectedJobId} onValueChange={setSelectedJobId}>
                  <SelectTrigger id="log_job" className="w-full">
                    <SelectValue
                      placeholder={
                        jobs?.length
                          ? "Select a job"
                          : "No jobs found for this date"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {jobs?.map((job) => (
                      <SelectItem key={job.id} value={job.id}>
                        {job.title} — {job.client?.full_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </>
          )}

          {supplies && supplies.length > 0 && (
            <div className="space-y-3">
              <Label>Quantities Used</Label>
              <div className="space-y-2">
                {supplies.map((supply) => (
                  <div
                    key={supply.id}
                    className="flex flex-wrap items-center gap-3 bg-gray-50 rounded-xl px-3 py-2.5"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {supply.name}
                      </p>
                      <p className="text-xs text-gray-500">
                        Stock: {supply.current_quantity} {supply.unit}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <Input
                        type="number"
                        step={["pieces", "bottles", "boxes"].includes(supply.unit) ? "1" : "0.01"}
                        min="0"
                        max={supply.current_quantity}
                        placeholder="0"
                        value={quantities[supply.id] ?? ""}
                        onChange={(e) =>
                          setQuantities((prev) => ({
                            ...prev,
                            [supply.id]: e.target.value,
                          }))
                        }
                        className="w-20 text-right"
                        aria-label={`${supply.name} quantity used`}
                      />
                      <span className="text-xs text-gray-500 w-8">
                        {supply.unit}
                      </span>
                    </div>
                    {Number(quantities[supply.id] ?? 0) > supply.current_quantity && (
                      <p className="basis-full text-right text-xs text-red-700" role="alert">
                        Only {supply.current_quantity} {supply.unit} available.
                      </p>
                    )}
                    {Number(quantities[supply.id] ?? 0) > 0
                      && !["pieces", "bottles", "boxes"].includes(supply.unit)
                      && Math.abs(Number(quantities[supply.id]) * 100 - Math.round(Number(quantities[supply.id]) * 100)) > 0.000001 && (
                        <p className="basis-full text-right text-xs text-red-700" role="alert">
                          Enter no more than two decimal places.
                        </p>
                      )}
                    {["pieces", "bottles", "boxes"].includes(supply.unit)
                      && Number(quantities[supply.id] ?? 0) % 1 !== 0 && (
                        <p className="basis-full text-right text-xs text-red-700" role="alert">
                          Enter a whole number of {supply.unit}.
                        </p>
                      )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {supplies?.length === 0 && (
            <div className="py-4 text-center text-sm text-gray-600">
              <p>No supplies in your inventory yet.</p>
              <Link href="/dashboard/supplies" className="mt-1 inline-block font-medium text-blue-700 underline underline-offset-2">
                Add a supply first
              </Link>
            </div>
          )}
        </div>

        <SheetFooter className="px-4">
          <Button
            onClick={handleSubmit}
            disabled={!selectedJobId || !hasEntries || stockShortages.length > 0 || fractionalCountEntries.length > 0 || excessPrecisionEntries.length > 0 || logUsage.isPending}
            className="w-full"
          >
            {logUsage.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Logging...
              </>
            ) : (
              "Log Supply Usage"
            )}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
