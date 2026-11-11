import { randomUUID } from "expo-crypto";
import * as SQLite from "expo-sqlite";
import { ApiError, DEFAULT_BACKEND, getBackend, packBytes, registerDevice, sendEvents, type Manifest } from "./api";

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

const registrations = new Map<string, Promise<string>>();
const deviceKey = (server: string) => `signed_device_id:${server}`;

export async function getDeviceId(server = getBackend()): Promise<string> {
  const key = deviceKey(server);
  const saved = getPref(key);
  if (saved) return saved;
  if (server === DEFAULT_BACKEND) {
    const legacy = getPref("signed_device_id");
    if (legacy) {
      setPref(key, legacy);
      db.runSync("DELETE FROM prefs WHERE key = ?", "signed_device_id");
      return legacy;
    }
  }
  let pending = registrations.get(server);
  if (!pending) {
    pending = registerDevice(server).then(({ device_id }) => {
      setPref(key, device_id);
      return device_id;
    }).finally(() => { registrations.delete(server); });
    registrations.set(server, pending);
  }
  return pending;
}

export async function withDevice<T>(operation: (device: string, server: string) => Promise<T>): Promise<T> {
  const server = getBackend();
  const device = await getDeviceId(server);
  try {
    return await operation(device, server);
  } catch (error) {
    if (!(error instanceof ApiError && error.code === "invalid_device")) throw error;
    db.runSync("DELETE FROM prefs WHERE key = ? AND value = ?", deviceKey(server), device);
    return operation(await getDeviceId(server), server);
  }
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
  manifest: normalizeManifest(JSON.parse(r.manifest)),
});

function normalizeManifest(manifest: Manifest): Manifest {
  return { ...manifest, files: manifest.files.map((file) => {
    const old = file as typeof file & { attraction_id?: string };
    return { ...file, poi_id: file.poi_id ?? old.attraction_id ?? "" };
  }) };
}

export function installedPacks(): InstalledPack[] {
  return db.getAllSync<PackRow>("SELECT * FROM packs").map(toPack);
}
export function savePack(m: Manifest, tourName: string): void {
  const bytes = packBytes(m);
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
  poiId: string,
  lang: string,
  event: PlayEvent,
  trigger: "geofence" | "manual",
  positionMs: number,
): void {
  const eventId = randomUUID();
  const body = {
    event_id: eventId,
    poi_id: poiId,
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
  const server = getBackend();
  await sendEvents(await getDeviceId(server), rows.map((r) => {
    const event = JSON.parse(r.body);
    if (!event.poi_id && event.attraction_id) event.poi_id = event.attraction_id;
    delete event.attraction_id;
    return event;
  }), server);
  for (const r of rows) db.runSync("DELETE FROM events WHERE event_id = ?", r.event_id);
}
