import { useEffect, useRef, useState } from "react";
import { createCircle, DEFAULT_CENTER, MAP_STYLE, maplibregl, observeMapSize, validCoordinates } from "./map";

export interface MapPoint {
  id: string;
  name: string;
  lat: number;
  lng: number;
  radius: number;
  script_status?: string;
  status?: string;
}
const COLORS: Record<string, string> = { approved: "#15803d", in_review: "#d97706", draft: "#64748b", locked: "#9ca3af" };
const colorOf = (point: MapPoint) => point.status === "locked" ? COLORS.locked : COLORS[point.script_status ?? "draft"] ?? COLORS.draft;

function fitPoints(map: maplibregl.Map, points: MapPoint[]) {
  const bounds = new maplibregl.LngLatBounds();
  points.filter((point) => validCoordinates(point.lat, point.lng)).forEach((point) => bounds.extend([point.lng, point.lat]));
  if (!bounds.isEmpty()) map.fitBounds(bounds, { padding: 65, maxZoom: 16, duration: 300 });
}

export function PoisMap({ points, selectedId, onSelect, connectPoints = false }: {
  points: MapPoint[];
  selectedId?: string;
  onSelect?: (id: string) => void;
  connectPoints?: boolean;
}) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markers = useRef<{ id: string; marker: maplibregl.Marker }[]>([]);
  const latest = useRef(onSelect);
  latest.current = onSelect;
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!container.current) return;
    let map: maplibregl.Map;
    try {
      map = new maplibregl.Map({ container: container.current, style: MAP_STYLE, center: DEFAULT_CENTER, zoom: 12 });
    } catch { setError(true); return; }
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl(), "top-right");
    map.addControl(new maplibregl.ScaleControl(), "bottom-left");
    map.on("error", () => setError(true));
    map.on("load", () => setReady(true));
    const observer = observeMapSize(container.current, map);
    return () => {
      observer.disconnect(); markers.current.forEach(({ marker }) => marker.remove());
      markers.current = []; map.remove(); mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const valid = points.filter((point) => validCoordinates(point.lat, point.lng));
    markers.current.forEach(({ marker }) => marker.remove());
    markers.current = valid.map((point, index) => {
      const button = document.createElement("button");
      button.type = "button"; button.textContent = String(index + 1); button.title = point.status === "locked" ? `${point.name} (đã khoá)` : point.name;
      button.setAttribute("aria-label", `Chọn điểm ${point.name}`);
      button.style.cssText = `width:32px;height:32px;border:3px solid white;border-radius:50%;color:white;font-weight:700;box-shadow:0 2px 8px #0004;background:${colorOf(point)};${point.status === "locked" ? "opacity:.75;" : ""}`;
      button.addEventListener("click", () => latest.current?.(point.id));
      const marker = new maplibregl.Marker({ element: button }).setLngLat([point.lng, point.lat]).addTo(map);
      if (!latest.current) marker.setPopup(new maplibregl.Popup({ offset: 20 }).setText(`${index + 1}. ${point.name} · Vùng ${point.radius}m`));
      return { id: point.id, marker };
    });
    fitPoints(map, valid);
    if (!ready) return;
    const regions = { type: "FeatureCollection" as const, features: valid.map((point) => ({ ...createCircle([point.lng, point.lat], point.radius), properties: { color: colorOf(point) } })) };
    const source = map.getSource<maplibregl.GeoJSONSource>("regions");
    if (source) source.setData(regions);
    else {
      map.addSource("regions", { type: "geojson", data: regions });
      map.addLayer({ id: "regions-fill", type: "fill", source: "regions", paint: { "fill-color": ["get", "color"], "fill-opacity": 0.12 } });
      map.addLayer({ id: "regions-border", type: "line", source: "regions", paint: { "line-color": ["get", "color"], "line-width": 1.5 } });
    }
    const route = { type: "FeatureCollection" as const, features: connectPoints && valid.length > 1 ? [{ type: "Feature" as const, geometry: { type: "LineString" as const, coordinates: valid.map((point) => [point.lng, point.lat]) }, properties: {} }] : [] };
    const routeSource = map.getSource<maplibregl.GeoJSONSource>("route");
    if (routeSource) routeSource.setData(route);
    else {
      map.addSource("route", { type: "geojson", data: route });
      map.addLayer({ id: "route-line", type: "line", source: "route", paint: { "line-color": "#0f766e", "line-width": 3, "line-dasharray": [2, 2] } });
    }
  }, [points, ready, connectPoints]);

  useEffect(() => {
    markers.current.forEach(({ id, marker }) => {
      marker.getElement().style.outline = id === selectedId ? "3px solid #0f766e" : "none";
    });
    const point = points.find((p) => p.id === selectedId);
    if (point && validCoordinates(point.lat, point.lng)) mapRef.current?.easeTo({ center: [point.lng, point.lat], zoom: 16, duration: 350 });
  }, [selectedId, points, ready]);

  return <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
    <div className="flex items-center justify-between bg-white px-3 py-2 text-sm">
      <span className="font-medium text-slate-700">{points.length} điểm trên bản đồ</span>
      <button type="button" className="rounded px-2 py-1 font-medium text-teal-700 hover:bg-teal-50" onClick={() => { if (mapRef.current) fitPoints(mapRef.current, points); }}>Xem tất cả</button>
    </div>
    {error && <p role="status" className="bg-amber-50 px-3 py-2 text-sm text-amber-800">Không tải được đầy đủ bản đồ. Danh sách điểm vẫn sử dụng được.</p>}
    <div ref={container} aria-label="Bản đồ các điểm tham quan và vùng kích hoạt" className="h-[440px] w-full" />
    <div className="flex flex-wrap gap-4 bg-white px-3 py-2 text-xs text-slate-500">
      <span><span className="text-green-700">●</span> Đã duyệt</span><span><span className="text-amber-600">●</span> Chờ duyệt</span><span>● Nháp</span><span><span className="text-gray-400">●</span> Đã khoá</span>
      <span>Vòng tròn: vùng tự phát thuyết minh</span>
      {connectPoints && <span>Nét đứt nối các điểm, không phải đường chỉ dẫn</span>}
    </div>
  </div>;
}
