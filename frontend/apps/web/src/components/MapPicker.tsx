import { useEffect, useRef, useState } from "react";
import { createCircle, DEFAULT_CENTER, MAP_STYLE, maplibregl, observeMapSize, validCoordinates } from "./map";

interface Props {
  lat: number;
  lng: number;
  radius: number;
  onChange: (lat: number, lng: number) => void;
}

export function MapPicker({ lat, lng, radius, onChange }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const latest = useRef({ lat, lng, radius, onChange });
  latest.current = { lat, lng, radius, onChange };
  const [error, setError] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!container.current) return;
    let map: maplibregl.Map;
    try {
      map = new maplibregl.Map({ container: container.current, style: MAP_STYLE,
        center: validCoordinates(latest.current.lat, latest.current.lng) ? [latest.current.lng, latest.current.lat] : DEFAULT_CENTER, zoom: 15 });
    } catch { setError(true); return; }
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl(), "top-right");
    const marker = new maplibregl.Marker({ draggable: true, color: "#0f766e" }).setLngLat(map.getCenter()).addTo(map);
    markerRef.current = marker;
    marker.on("dragend", () => {
      const point = marker.getLngLat().wrap();
      latest.current.onChange(point.lat, point.lng);
    });
    map.on("click", (event) => {
      const point = event.lngLat.wrap();
      latest.current.onChange(point.lat, point.lng);
    });
    map.on("error", () => setError(true));
    map.on("load", () => setReady(true));
    const observer = observeMapSize(container.current, map);
    return () => { observer.disconnect(); marker.remove(); map.remove(); mapRef.current = null; markerRef.current = null; };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !validCoordinates(lat, lng)) return;
    markerRef.current?.setLngLat([lng, lat]);
    map.panTo([lng, lat], { duration: 250 });
    if (!ready) return;
    const data = createCircle([lng, lat], radius);
    const source = map.getSource<maplibregl.GeoJSONSource>("radius");
    if (source) source.setData(data);
    else {
      map.addSource("radius", { type: "geojson", data });
      map.addLayer({ id: "radius-fill", type: "fill", source: "radius", paint: { "fill-color": "#0f766e", "fill-opacity": 0.15 } });
      map.addLayer({ id: "radius-border", type: "line", source: "radius", paint: { "line-color": "#0f766e", "line-width": 2 } });
    }
  }, [lat, lng, radius, ready]);

  return <div>
    {error && <p role="status" className="bg-amber-50 px-3 py-2 text-sm text-amber-800">Không tải được đầy đủ bản đồ. Bạn vẫn có thể nhập tọa độ ở trên.</p>}
    <div ref={container} aria-label="Bản đồ chọn vị trí điểm tham quan" style={{ width: "100%", height: 360 }} />
  </div>;
}
