"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { MapPin, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface StartLocationInputProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

async function reverseGeocodeClient(
  lat: number,
  lng: number,
): Promise<string | null> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`,
      { headers: { "Accept-Language": "en" } },
    );
    const data = await res.json();
    return data?.display_name ?? null;
  } catch {
    return null;
  }
}

export function StartLocationInput({
  value,
  onChange,
  disabled,
}: StartLocationInputProps) {
  const [detecting, setDetecting] = useState(false);

  const detectLocation = () => {
    if (!navigator.geolocation) {
      toast.error("Your browser does not support location detection");
      return;
    }

    setDetecting(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        const address = await reverseGeocodeClient(latitude, longitude);
        if (address) {
          onChange(address);
          toast.success("Location detected successfully");
        } else {
          toast.error(
            "Could not determine your address. Please type it manually.",
          );
        }
        setDetecting(false);
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          toast.error(
            "Location permission denied. Please type your start address manually.",
          );
        } else {
          toast.error(
            "Could not detect location. Please type your start address.",
          );
        }
        setDetecting(false);
      },
      { timeout: 10000, maximumAge: 60000 },
    );
  };

  return (
    <div className="space-y-1.5">
      <Label htmlFor="start_location" className="flex items-center gap-1.5">
        <MapPin className="w-3.5 h-3.5" />
        Start Location
      </Label>
      <div className="flex gap-2">
        <Input
          id="start_location"
          placeholder="Your home or shop address"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled || detecting}
          className="flex-1"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={detectLocation}
          disabled={disabled || detecting}
          className="flex-shrink-0"
          title="Detect my current location"
        >
          {detecting ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <MapPin className="w-4 h-4" />
          )}
        </Button>
      </div>
      <p className="text-xs text-gray-400">
        Or tap the pin icon to use your current location
      </p>
    </div>
  );
}
