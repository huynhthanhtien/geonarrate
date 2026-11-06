import { Platform } from "react-native";

/** Máy ảo Android gọi máy chủ dev qua 10.0.2.2; máy thật đặt EXPO_PUBLIC_API_URL. */
const BASE =
  process.env.EXPO_PUBLIC_API_URL ??
  (Platform.OS === "android" ? "http://10.0.2.2:8000" : "http://localhost:8000");

export interface PublicTour {
  id: string;
  name: string;
  access: "free" | "paid";
  attraction_count: number;
  langs: string[];
}
export interface PackFile {
  attraction_id: string;
  name: string;
  summary: string | null;
  lat: number;
  lng: number;
  radius: number;
  priority: number;
  is_preview: boolean;
  sha256: string;
  bytes: number;
  duration_ms: number;
}
export interface Manifest {
  pack_id: string;
  tour_id: string;
  lang: string;
  version: number;
  access: "full" | "preview";
  files: PackFile[];
}
export class ApiError extends Error {
  constructor(public readonly code: string, message: string, public readonly status: number) {
    super(message);
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}/api/v1${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new ApiError(body?.title ?? "http_error", body?.detail ?? `Lỗi máy chủ (${res.status})`, res.status);
  }
  return (await res.json()) as T;
}

export const getLanguages = () => call<{ code: string; native_name: string }[]>("/languages");
export const getTours = () => call<PublicTour[]>("/public/tours");
export const getManifest = (tourId: string, lang: string, device: string, preview: boolean) =>
  call<Manifest>(
    `/public/tours/${tourId}/packs/${lang}?device_id=${encodeURIComponent(device)}&preview=${preview}`,
  );
export const fileUrl = (tourId: string, lang: string, attractionId: string, device: string) =>
  `${BASE}/api/v1/public/tours/${tourId}/packs/${lang}/files/${attractionId}?device_id=${encodeURIComponent(device)}`;
export const activateTicket = (code: string, device: string) =>
  call<{ result: string; tour_ids: string[] }>("/public/tickets/activate", {
    method: "POST",
    body: JSON.stringify({ code, device_id: device }),
  });
export const sendEvents = (device: string, events: unknown[]) =>
  call<{ accepted: number }>("/public/playback-events", {
    method: "POST",
    body: JSON.stringify({ device_id: device, events }),
  });
