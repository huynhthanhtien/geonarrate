import { Platform } from "react-native";

export const DEFAULT_BACKEND = (process.env.EXPO_PUBLIC_API_URL ??
  (Platform.OS === "android" ? "http://10.0.2.2:8000" : "http://localhost:8000")).replace(/\/+$/, "");
let backend = DEFAULT_BACKEND;

export const getBackend = () => backend;
export const setBackend = (value: string) => { backend = value; };

export function parseBackend(value: string): string {
  const match = /^(https?):\/\/([a-z0-9.-]+)(?::(\d{1,5}))?\/*$/i.exec(value.trim());
  if (!match || (match[3] && (+match[3] === 0 || +match[3] > 65535))) {
    throw new Error("Nhập địa chỉ máy chủ, ví dụ https://tour.example.com hoặc địa chỉ LAN đã cấu hình.");
  }
  const [, scheme, host, port] = match;
  if (Platform.OS === "android" && scheme?.toLowerCase() === "http") {
    const defaultHost = /^http:\/\/([^:/]+)/i.exec(DEFAULT_BACKEND)?.[1];
    const localHosts = ["localhost", "127.0.0.1", "10.0.2.2", defaultHost];
    if (!localHosts.includes(host?.toLowerCase())) {
      throw new Error("Bản Android này chỉ cho phép HTTP tới máy dev đã cấu hình. Hãy dùng HTTPS hoặc kết nối USB.");
    }
  }
  return `${scheme?.toLowerCase()}://${host?.toLowerCase()}${port ? `:${port}` : ""}`;
}

export interface PublicTour {
  id: string;
  name: string;
  access: "free" | "paid";
  poi_count: number;
  langs: string[];
}
export interface PackFile {
  poi_id: string;
  name: string;
  summary: string | null;
  lat: number;
  lng: number;
  radius: number;
  priority: number;
  sha256: string;
  bytes: number;
  duration_ms: number;
}
export interface Manifest {
  pack_id: string;
  tour_id: string;
  lang: string;
  version: number;
  files: PackFile[];
}
export class ApiError extends Error {
  constructor(public readonly code: string, message: string, public readonly status: number) {
    super(message);
  }
}

async function call<T>(path: string, init?: RequestInit, server = backend): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const res = await fetch(`${server}/api/v1${path}`, {
      ...init,
      signal: controller.signal,
      headers: { "Content-Type": "application/json", ...init?.headers },
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new ApiError(body?.title ?? "http_error", body?.detail ?? `Lỗi máy chủ (${res.status})`, res.status);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

export const getLanguages = () => call<{ code: string; native_name: string }[]>("/languages");
export const getTours = () => call<PublicTour[]>("/public/tours");
export async function checkBackend(server: string): Promise<void> {
  const tours = await call<PublicTour[]>("/public/tours", undefined, server);
  if (!Array.isArray(tours)) throw new Error("Địa chỉ này không trả về danh sách tour GeoNarrate.");
}

export const registerDevice = (server = backend) =>
  call<{ device_id: string }>("/public/devices", { method: "POST" }, server);
export const getManifest = (tourId: string, lang: string, device: string, server = backend) =>
  call<Manifest>(
    `/public/tours/${tourId}/packs/${lang}?device_id=${encodeURIComponent(device)}`,
    undefined, server,
  );
export const fileUrl = (manifest: Manifest, poiId: string, device: string, server = backend) =>
  `${server}/api/v1/public/tours/${manifest.tour_id}/packs/${manifest.lang}/files/${poiId}?device_id=${encodeURIComponent(device)}&pack_id=${encodeURIComponent(manifest.pack_id)}`;
export const activateTicket = (code: string, device: string, server = backend) =>
  call<{ result: string; tour_ids: string[] }>("/public/tickets/activate", {
    method: "POST",
    body: JSON.stringify({ code, device_id: device }),
  }, server);
export const sendEvents = (device: string, events: unknown[], server = backend) =>
  call<{ accepted: number }>("/public/playback-events", {
    method: "POST",
    body: JSON.stringify({ device_id: device, events }),
  }, server);
