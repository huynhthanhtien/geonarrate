import { GEOFENCE_COOLDOWN_MS, GEOFENCE_DEBOUNCE_MS } from "./constants";
import { pickGeofence, type GeofencePoint, type LatLng } from "./geo";

/**
 * Quyết định khi nào phát audio theo vị trí (UC-18): phải ở trong cùng một vùng đủ lâu (debounce)
 * và điểm đó đang ngoài thời gian chờ (cooldown). Không đụng GPS hay audio nên test được.
 */
export class GeofenceTracker {
  private currentId: string | null = null;
  private enteredAt = 0;
  private readonly lastPlayed = new Map<string, number>();

  constructor(
    private readonly points: GeofencePoint[],
    private readonly debounceMs = GEOFENCE_DEBOUNCE_MS,
    private readonly cooldownMs = GEOFENCE_COOLDOWN_MS,
  ) {}

  /** Trả về điểm cần phát ngay bây giờ, hoặc null. */
  update(pos: LatLng & { accuracyM: number }, nowMs: number): GeofencePoint | null {
    const point = pickGeofence(pos, this.points);
    if (!point) {
      this.currentId = null;
      return null;
    }
    if (point.id !== this.currentId) {
      this.currentId = point.id;
      this.enteredAt = nowMs;
    }
    if (nowMs - this.enteredAt < this.debounceMs) return null;
    const last = this.lastPlayed.get(point.id);
    if (last !== undefined && nowMs - last < this.cooldownMs) return null;
    this.lastPlayed.set(point.id, nowMs);
    return point;
  }

  /** Du khách tự chọn điểm: tính vào cooldown để không phát lại ngay khi đi vào vùng. */
  markPlayed(id: string, nowMs: number): void {
    this.lastPlayed.set(id, nowMs);
  }
}
