import { LOCATION_ACCURACY_MAX_M } from "./constants";

export interface LatLng { lat: number; lng: number }
export interface GeofencePoint extends LatLng { id: string; radiusM: number; priority: number }

const EARTH_R = 6_371_000;
const rad = (d: number) => (d * Math.PI) / 180;

/** Khoảng cách haversine (mét). */
export function distanceM(a: LatLng, b: LatLng): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_R * Math.asin(Math.sqrt(h));
}

/**
 * Chọn điểm cần phát khi vị trí rơi vào nhiều vùng:
 * priority cao thắng, sau đó gần hơn thắng. Bỏ qua fix có accuracy kém.
 */
export function pickGeofence(pos: LatLng & { accuracyM: number }, points: GeofencePoint[]): GeofencePoint | null {
  if (pos.accuracyM > LOCATION_ACCURACY_MAX_M) return null;
  const inside = points
    .map((p) => ({ p, d: distanceM(pos, p) }))
    .filter(({ p, d }) => d <= p.radiusM)
    .sort((x, y) => y.p.priority - x.p.priority || x.d - y.d);
  return inside[0]?.p ?? null;
}
