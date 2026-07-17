"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

interface MapStop {
  id: string;
  latitude: number;
  longitude: number;
  label: string;
  order: number;
}

interface RouteMapProps {
  start: { latitude: number; longitude: number; label: string } | null;
  stops: MapStop[];
  geometry: [number, number][]; // [longitude, latitude] pairs, from ORS
}

export default function RouteMap({ start, stops, geometry }: RouteMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    if (!mapRef.current) {
      mapRef.current = L.map(containerRef.current).setView([0, 0], 2);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap contributors",
        maxZoom: 19,
      }).addTo(mapRef.current);
    }

    const map = mapRef.current;

    // Clear previous markers/lines, keep the base tile layer
    map.eachLayer((layer) => {
      if (!(layer instanceof L.TileLayer)) map.removeLayer(layer);
    });

    const bounds: L.LatLngTuple[] = [];

    if (start) {
      const startIcon = L.divIcon({
        className: "",
        html: `<div style="background:#dc2626;color:white;width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:600;font-size:14px;border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3);">S</div>`,
        iconSize: [32, 32],
        iconAnchor: [16, 16],
      });
      L.marker([start.latitude, start.longitude], { icon: startIcon })
        .addTo(map)
        .bindPopup(start.label);
      bounds.push([start.latitude, start.longitude]);
    }

    stops.forEach((stop) => {
      const stopIcon = L.divIcon({
        className: "",
        html: `<div style="background:#2563eb;color:white;width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:600;font-size:13px;border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3);">${stop.order}</div>`,
        iconSize: [30, 30],
        iconAnchor: [15, 15],
      });
      L.marker([stop.latitude, stop.longitude], { icon: stopIcon })
        .addTo(map)
        .bindPopup(stop.label);
      bounds.push([stop.latitude, stop.longitude]);
    });

    if (geometry.length > 1) {
      const latLngs: L.LatLngExpression[] = geometry.map(([lng, lat]) => [
        lat,
        lng,
      ]);
      L.polyline(latLngs, { color: "#2563eb", weight: 4, opacity: 0.7 }).addTo(
        map,
      );
    }

    if (bounds.length > 0) {
      map.fitBounds(bounds, { padding: [40, 40] });
    } else {
      map.setView([0, 0], 2);
    }
  }, [start, stops, geometry]);

  useEffect(() => {
    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  return <div ref={containerRef} className="w-full h-full rounded-xl" />;
}
