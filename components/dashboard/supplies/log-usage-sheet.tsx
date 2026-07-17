"use client";

import { useState, useEffect } from "react";
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
}

export function LogUsageSheet({ open, onOpenChange }: LogUsageSheetProps) {
  const todayStr = format(new Date(), "yyyy-MM-dd");
  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [selectedJobId, setSelectedJobId] = useState("");
  const [quantities, setQuantities] = useState<Record<string, string>>({});

  const { data: supplies } = useSupplies();
  const { data: jobs } = useJobsByDate(selectedDate);
  const logUsage = useLogSupplyUsage();

  useEffect(() => {
    if (!open) {
      setSelectedDate(todayStr);
      setSelectedJobId("");
      setQuantities({});
    }
  }, [open, todayStr]);

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
      { onSuccess: () => onOpenChange(false) },
    );
  };

  const hasEntries = Object.values(quantities).some((q) => Number(q) > 0);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Log Supply Usage</SheetTitle>
        </SheetHeader>

        <div className="flex flex-col gap-5 px-4">
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

          {supplies && supplies.length > 0 && (
            <div className="space-y-3">
              <Label>Quantities Used</Label>
              <div className="space-y-2">
                {supplies.map((supply) => (
                  <div
                    key={supply.id}
                    className="flex items-center gap-3 bg-gray-50 rounded-xl px-3 py-2.5"
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
                        step="0.01"
                        min="0"
                        placeholder="0"
                        value={quantities[supply.id] ?? ""}
                        onChange={(e) =>
                          setQuantities((prev) => ({
                            ...prev,
                            [supply.id]: e.target.value,
                          }))
                        }
                        className="w-20 text-right"
                      />
                      <span className="text-xs text-gray-500 w-8">
                        {supply.unit}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {supplies?.length === 0 && (
            <p className="text-sm text-gray-500 text-center py-4">
              No supplies in your inventory yet. Add supplies first.
            </p>
          )}
        </div>

        <SheetFooter className="px-4">
          <Button
            onClick={handleSubmit}
            disabled={!selectedJobId || !hasEntries || logUsage.isPending}
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
