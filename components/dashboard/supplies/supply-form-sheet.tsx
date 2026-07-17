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
import {
  useCreateSupply,
  useUpdateSupply,
  type Supply,
} from "@/lib/queries/supplies";

const supplySchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  description: z.string().optional(),
  unit: z.enum(["ml", "l", "g", "kg", "pieces", "bottles", "boxes", "other"], {
    message: "Please select a unit",
  }),
  current_quantity: z.number().min(0, "Quantity cannot be negative"),
  minimum_quantity: z.number().min(0, "Minimum cannot be negative"),
  cost_per_unit: z.number().optional(),
});

type SupplyFormData = z.infer<typeof supplySchema>;

const UNIT_LABELS: Record<string, string> = {
  ml: "Millilitres (ml)",
  l: "Litres (l)",
  g: "Grams (g)",
  kg: "Kilograms (kg)",
  pieces: "Pieces",
  bottles: "Bottles",
  boxes: "Boxes",
  other: "Other",
};

const EMPTY_DEFAULTS: SupplyFormData = {
  name: "",
  description: "",
  unit: "" as SupplyFormData["unit"],
  current_quantity: 0,
  minimum_quantity: 0,
  cost_per_unit: undefined,
};

interface SupplyFormSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  supply?: Supply | null;
}

export function SupplyFormSheet({
  open,
  onOpenChange,
  supply,
}: SupplyFormSheetProps) {
  const isEdit = !!supply;
  const createSupply = useCreateSupply();
  const updateSupply = useUpdateSupply();

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors },
  } = useForm<SupplyFormData>({
    resolver: zodResolver(supplySchema),
    defaultValues: EMPTY_DEFAULTS,
  });

  useEffect(() => {
    if (!open) return;
    reset(
      supply
        ? {
            name: supply.name,
            description: supply.description ?? "",
            unit: supply.unit,
            current_quantity: supply.current_quantity,
            minimum_quantity: supply.minimum_quantity,
            cost_per_unit: supply.cost_per_unit ?? undefined,
          }
        : EMPTY_DEFAULTS,
    );
  }, [open, supply, reset]);

  const isPending = createSupply.isPending || updateSupply.isPending;

  const onSubmit = (data: SupplyFormData) => {
    const payload = {
      ...data,
      description: data.description || undefined,
      cost_per_unit: data.cost_per_unit || undefined,
    };

    if (isEdit && supply) {
      updateSupply.mutate(
        { id: supply.id, ...payload },
        { onSuccess: () => onOpenChange(false) },
      );
    } else {
      createSupply.mutate(payload, { onSuccess: () => onOpenChange(false) });
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{isEdit ? "Edit Supply" : "Add New Supply"}</SheetTitle>
        </SheetHeader>

        <form
          onSubmit={handleSubmit(onSubmit)}
          className="flex flex-col gap-4 px-4"
        >
          <div className="space-y-1.5">
            <Label htmlFor="name">Supply Name</Label>
            <Input
              id="name"
              placeholder="Dog shampoo, Chlorine tablets..."
              {...register("name")}
              className={errors.name ? "border-red-400" : ""}
            />
            {errors.name && (
              <p className="text-red-500 text-xs">{errors.name.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="description">Description (optional)</Label>
            <Textarea
              id="description"
              placeholder="Brand, scent, notes about this supply..."
              rows={2}
              {...register("description")}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="unit">Unit of Measurement</Label>
            <Controller
              name="unit"
              control={control}
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="unit" className="w-full">
                    <SelectValue placeholder="Select unit" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(UNIT_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {errors.unit && (
              <p className="text-red-500 text-xs">{errors.unit.message}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="current_quantity">Current Stock</Label>
              <Input
                id="current_quantity"
                type="number"
                step="0.01"
                {...register("current_quantity", { valueAsNumber: true })}
                className={errors.current_quantity ? "border-red-400" : ""}
              />
              {errors.current_quantity && (
                <p className="text-red-500 text-xs">
                  {errors.current_quantity.message}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="minimum_quantity">Low Stock Threshold</Label>
              <Input
                id="minimum_quantity"
                type="number"
                step="0.01"
                {...register("minimum_quantity", { valueAsNumber: true })}
                className={errors.minimum_quantity ? "border-red-400" : ""}
              />
              {errors.minimum_quantity && (
                <p className="text-red-500 text-xs">
                  {errors.minimum_quantity.message}
                </p>
              )}
            </div>
          </div>

          <p className="text-xs text-gray-500 -mt-2">
            You'll be alerted when stock drops to or below the threshold.
          </p>

          <div className="space-y-1.5">
            <Label htmlFor="cost_per_unit">Cost per Unit ($) — optional</Label>
            <Input
              id="cost_per_unit"
              type="number"
              step="0.01"
              placeholder="0.00"
              {...register("cost_per_unit", { valueAsNumber: true })}
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
                "Add Supply"
              )}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
