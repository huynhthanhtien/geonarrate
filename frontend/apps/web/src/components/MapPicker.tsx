import { useEffect, useRef } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

interface Props {
  lat: number;
  lng: number;
  radius: number;
  onChange: (lat: number, lng: number) => void;
}

export function MapPicker({ lat, lng, radius, onChange }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: {
  version: 8,
  sources: {
    osm: {
      type: "raster",
      tiles: ["https://tiles.stadiamaps.com/tiles/alidade_smooth/{z}/{x}/{y}.png"],
      tileSize: 256,
      attribution: "© OpenStreetMap contributors",
    },
  },
  layers: [{ id: "osm", type: "raster", source: "osm" }],
},
      center: [lng, lat],
      zoom: 15,
    });

    mapRef.current = map;

    const marker = new maplibregl.Marker({ draggable: true })
      .setLngLat([lng, lat])
      .addTo(map);

    markerRef.current = marker;

    marker.on("dragend", () => {
      const { lat: newLat, lng: newLng } = marker.getLngLat();
      onChange(newLat, newLng);
    });

    map.on("click", (e) => {
      marker.setLngLat(e.lngLat);
      onChange(e.lngLat.lat, e.lngLat.lng);
    });

    return () => map.remove();
  }, []);

  // Cập nhật circle khi radius thay đổi
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    const updateCircle = () => {
      if (map.getLayer("radius-fill")) map.removeLayer("radius-fill");
      if (map.getLayer("radius-border")) map.removeLayer("radius-border");
      if (map.getSource("radius")) map.removeSource("radius");

      map.addSource("radius", {
        type: "geojson",
        data: createCircle([lng, lat], radius),
      });

      map.addLayer({
        id: "radius-fill",
        type: "fill",
        source: "radius",
        paint: { "fill-color": "#0F766E", "fill-opacity": 0.15 },
      });

      map.addLayer({
        id: "radius-border",
        type: "line",
        source: "radius",
        paint: { "line-color": "#0F766E", "line-width": 2 },
      });
    };

    if (map.isStyleLoaded()) updateCircle();
    else map.on("load", updateCircle);
  }, [radius, lat, lng]);

  return (
    <div
      ref={containerRef}
      style={{ width: "100%", height: 320, borderRadius: 10, overflow: "hidden" }}
    />
  );
}

function createCircle(center: [number, number], radiusMeters: number) {
  const points = 64;
  const coords = [];
  const km = radiusMeters / 1000;
  for (let i = 0; i < points; i++) {
    const angle = (i * 360) / points;
    const rad = (angle * Math.PI) / 180;
    const dx = (km / 111.32) * Math.cos(rad);
    const dy = (km / (111.32 * Math.cos((center[1] * Math.PI) / 180))) * Math.sin(rad);
    coords.push([center[0] + dy, center[1] + dx]);
  }
  coords.push(coords[0]);
  return { type: "Feature" as const, geometry: { type: "Polygon" as const, coordinates: [coords] }, properties: {} };
}