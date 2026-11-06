import * as Application from "expo-application";
import { randomUUID } from "expo-crypto";
import * as SQLite from "expo-sqlite";
import { Platform } from "react-native";
import { sendEvents, type Manifest } from "./api";

const db = SQLite.openDatabaseSync("geonarrate.db");
db.execSync(`
  CREATE TABLE IF NOT EXISTS prefs (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS packs (
    tour_id TEXT NOT NULL, lang TEXT NOT NULL, manifest TEXT NOT NULL, bytes INTEGER NOT NULL,
    tour_name TEXT NOT NULL, PRIMARY KEY (tour_id, lang)
  );
  CREATE TABLE IF NOT EXISTS events (event_id TEXT PRIMARY KEY, body TEXT NOT NULL);
`);

export function getPref(key: string): string | null {
  return db.getFirstSync<{ value: string }>("SELECT value FROM prefs WHERE key = ?", key)?.value ?? null;
}
export function setPref(key: string, value: string): void {
  db.runSync("INSERT OR REPLACE INTO prefs (key, value) VALUES (?, ?)", key, value);
}

/** Android dùng ANDROID_ID; iOS dùng id theo nhà phát triển. Không lấy được thì sinh UUID và lưu lại. */
export async function getDeviceId(): Promise<string> {
  const saved = getPref("device_id");
  if (saved) return saved;
  let id: string | null = null;
  if (Platform.OS === "android") id = Application.getAndroidId();
  if (Platform.OS === "ios") id = await Application.getIosIdForVendorAsync();
  const value = id && id.length >= 8 ? id : randomUUID();
  setPref("device_id", value);
  return value;
}

export interface InstalledPack {
  tourId: string;
  lang: string;
  tourName: string;
  bytes: number;
  manifest: Manifest;
}
interface PackRow {
  tour_id: string;
  lang: string;
  manifest: string;
  bytes: number;
  tour_name: string;
}
const toPack = (r: PackRow): InstalledPack => ({
  tourId: r.tour_id,
  lang: r.lang,
  tourName: r.tour_name,
  bytes: r.bytes,
  manifest: JSON.parse(r.manifest) as Manifest,
});

export function installedPacks(): InstalledPack[] {
  return db.getAllSync<PackRow>("SELECT * FROM packs").map(toPack);
}
export function savePack(m: Manifest, tourName: string): void {
  const bytes = m.files.reduce((sum, f) => sum + f.bytes, 0);
  db.runSync(
    "INSERT OR REPLACE INTO packs (tour_id, lang, manifest, bytes, tour_name) VALUES (?, ?, ?, ?, ?)",
    m.tour_id,
    m.lang,
    JSON.stringify(m),
    bytes,
    tourName,
  );
}
export function removePack(tourId: string, lang: string): void {
  db.runSync("DELETE FROM packs WHERE tour_id = ? AND lang = ?", tourId, lang);
}

export type PlayEvent = "play" | "complete" | "skip";
export function recordEvent(
  attractionId: string,
  lang: string,
  event: PlayEvent,
  trigger: "geofence" | "manual",
  positionMs: number,
): void {
  const eventId = randomUUID();
  const body = {
    event_id: eventId,
    attraction_id: attractionId,
    lang,
    event,
    trigger,
    position_ms: Math.round(positionMs),
    ts: new Date().toISOString(),
  };
  db.runSync("INSERT INTO events (event_id, body) VALUES (?, ?)", eventId, JSON.stringify(body));
}

/** Gửi tối đa 200 sự kiện một lần; lỗi mạng thì giữ lại, event_id trùng không tạo bản ghi mới. */
export async function syncEvents(): Promise<void> {
  const rows = db.getAllSync<{ event_id: string; body: string }>("SELECT * FROM events LIMIT 200");
  if (!rows.length) return;
  await sendEvents(await getDeviceId(), rows.map((r) => JSON.parse(r.body)));
  for (const r of rows) db.runSync("DELETE FROM events WHERE event_id = ?", r.event_id);
}
