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
  useCreateClient,
  useUpdateClient,
  type Client,
} from "@/lib/queries/clients";

const clientSchema = z.object({
  full_name: z.string().min(2, "Name must be at least 2 characters"),
  phone: z.string().min(7, "Enter a valid phone number"),
  email: z
    .union([z.string().email("Enter a valid email"), z.literal("")])
    .optional(),
  address: z.string().min(5, "Enter a valid address"),
  service_type: z.enum(
    ["pet_grooming", "pool_cleaning", "auto_detailing", "other"],
    { message: "Please select a service type" },
  ),
  preferred_contact: z.enum(["sms", "call", "none"], {
    message: "Please select a contact preference",
  }),
  notes: z.string().optional(),
});

type ClientFormData = z.infer<typeof clientSchema>;

interface ClientFormSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  client?: Client | null;
}

const SERVICE_TYPE_LABELS: Record<string, string> = {
  pet_grooming: "Pet Grooming",
  pool_cleaning: "Pool Cleaning",
  auto_detailing: "Auto Detailing",
  other: "Other",
};

const EMPTY_DEFAULTS: ClientFormData = {
  full_name: "",
  phone: "",
  email: "",
  address: "",
  service_type: "" as ClientFormData["service_type"],
  preferred_contact: "sms",
  notes: "",
};

export function ClientFormSheet({
  open,
  onOpenChange,
  client,
}: ClientFormSheetProps) {
  const isEdit = !!client;
  const createClient = useCreateClient();
  const updateClient = useUpdateClient();

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors },
  } = useForm<ClientFormData>({
    resolver: zodResolver(clientSchema),
    defaultValues: EMPTY_DEFAULTS,
  });

  useEffect(() => {
    if (!open) return;
    reset(
      client
        ? {
            full_name: client.full_name,
            phone: client.phone,
            email: client.email ?? "",
            address: client.address,
            service_type: client.service_type,
            preferred_contact: client.preferred_contact,
            notes: client.notes ?? "",
          }
        : EMPTY_DEFAULTS,
    );
  }, [open, client, reset]);

  const isPending = createClient.isPending || updateClient.isPending;

  const onSubmit = (data: ClientFormData) => {
    const payload = { ...data, email: data.email || undefined };

    if (isEdit && client) {
      updateClient.mutate(
        { id: client.id, ...payload },
        { onSuccess: () => onOpenChange(false) },
      );
    } else {
      createClient.mutate(payload, { onSuccess: () => onOpenChange(false) });
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{isEdit ? "Edit Client" : "Add New Client"}</SheetTitle>
        </SheetHeader>

        <form
          onSubmit={handleSubmit(onSubmit)}
          className="flex flex-col gap-4 px-4"
        >
          <div className="space-y-1.5">
            <Label htmlFor="full_name">Full Name</Label>
            <Input
              id="full_name"
              placeholder="Sarah Johnson"
              {...register("full_name")}
            />
            {errors.full_name && (
              <p className="text-red-500 text-xs">{errors.full_name.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="phone">Phone Number</Label>
            <Input
              id="phone"
              type="tel"
              placeholder="+1 (555) 123-4567"
              {...register("phone")}
            />
            {errors.phone && (
              <p className="text-red-500 text-xs">{errors.phone.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="email">Email (optional)</Label>
            <Input
              id="email"
              type="email"
              placeholder="sarah@email.com"
              {...register("email")}
            />
            {errors.email && (
              <p className="text-red-500 text-xs">{errors.email.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="address">Address</Label>
            <Input
              id="address"
              placeholder="123 Main St, Austin, TX"
              {...register("address")}
            />
            {errors.address && (
              <p className="text-red-500 text-xs">{errors.address.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="service_type">Service Type</Label>
            <Controller
              name="service_type"
              control={control}
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="service_type" className="w-full">
                    <SelectValue placeholder="Select service type" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(SERVICE_TYPE_LABELS).map(
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
            {errors.service_type && (
              <p className="text-red-500 text-xs">
                {errors.service_type.message}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="preferred_contact">Preferred Contact Method</Label>
            <Controller
              name="preferred_contact"
              control={control}
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="preferred_contact" className="w-full">
                    <SelectValue placeholder="Select contact method" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sms">Text Message (SMS)</SelectItem>
                    <SelectItem value="call">Phone Call</SelectItem>
                    <SelectItem value="none">No Contact</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="notes">Notes (optional)</Label>
            <Textarea
              id="notes"
              placeholder="Gate code, pet temperament, parking instructions..."
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
                "Add Client"
              )}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
