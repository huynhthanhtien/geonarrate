/** Hằng số then chốt phía client (chương 12). */
export const SUPPORTED_LANGS = ["vi", "en", "zh", "ja", "ko"] as const;
export type LangCode = (typeof SUPPORTED_LANGS)[number];

export const GEOFENCE_RADIUS_DEFAULT_M = 40;
export const GEOFENCE_DEBOUNCE_MS = 4_000;
export const GEOFENCE_COOLDOWN_MS = 10 * 60_000;
export const GPS_THROTTLE_MS = 5_000;
export const LOCATION_ACCURACY_MAX_M = 50;
export const DOWNLOAD_CONCURRENCY = 4;
export const PACK_MAX_INSTALLED = 3;
export const DEVICE_STORAGE_BUDGET_BYTES = 1.5 * 1024 ** 3;
export const AUDIO_FADE_MS = 300;
