"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MapPin } from "lucide-react";

interface StartLocationInputProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

export function StartLocationInput({
  value,
  onChange,
  disabled,
}: StartLocationInputProps) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor="start_location" className="flex items-center gap-1.5">
        <MapPin className="w-3.5 h-3.5" />
        Start Location
      </Label>
      <Input
        id="start_location"
        placeholder="Your home or shop address"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
      />
    </div>
  );
}
