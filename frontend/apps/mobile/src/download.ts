import { DEVICE_STORAGE_BUDGET_BYTES, DOWNLOAD_CONCURRENCY } from "@geonarrate/core";
import * as Crypto from "expo-crypto";
import { Directory, File, Paths } from "expo-file-system";
import { fileUrl, getBackend, imageUrl, packBytes, type Manifest, type PackFile, type PackImage } from "./api";
import { getDeviceId, installedPacks, removePack, savePack } from "./store";

function packDir(tourId: string, lang: string): Directory {
  return new Directory(Paths.document, "packs", tourId, lang);
}

export function audioFile(tourId: string, lang: string, f: { poi_id: string; sha256: string }): File {
  return new File(packDir(tourId, lang), `${f.poi_id}-${f.sha256.slice(0, 12)}.mp3`);
}

export function imageFile(tourId: string, lang: string, poiId: string, index: number, img: PackImage): File {
  return new File(packDir(tourId, lang), `${poiId}-img${index}-${img.sha256.slice(0, 12)}.${img.ext}`);
}

/** Đường dẫn file ảnh đã tải của một điểm (chỉ các ảnh đã có trên máy), theo thứ tự trong pack. */
export function poiImageUris(tourId: string, lang: string, f: PackFile): string[] {
  return (f.images ?? []).flatMap((img, i) => {
    const file = imageFile(tourId, lang, f.poi_id, i, img);
    return file.exists ? [file.uri] : [];
  });
}

async function matches(file: File, sha256: string): Promise<boolean> {
  const buf = await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, await file.bytes());
  const hex = Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
  return hex === sha256;
}

/** Trả về thông báo nếu vượt giới hạn dung lượng trên máy (UC-17 E2), null nếu được tải. */
export function limitProblem(m: Manifest): string | null {
  const others = installedPacks().filter((p) => !(p.tourId === m.tour_id && p.lang === m.lang));
  const size = packBytes(m);
  const used = others.reduce((sum, p) => sum + p.bytes, 0);
  if (used + size > DEVICE_STORAGE_BUDGET_BYTES) return "Vượt giới hạn 1,5 GB. Hãy xoá bớt pack để tải thêm.";
  return null;
}

async function fetchVerified(url: string, dest: File, sha256: string, label: string): Promise<void> {
  // File đã tải đúng thì bỏ qua: mất mạng giữa chừng không phải tải lại từ đầu
  if (dest.exists && (await matches(dest, sha256))) return;
  for (let attempt = 0; attempt < 2; attempt++) {
    if (dest.exists) dest.delete();
    await File.downloadFileAsync(url, dest);
    if (await matches(dest, sha256)) return;
  }
  if (dest.exists) dest.delete();
  throw new Error(`File của "${label}" bị hỏng khi tải, hãy thử lại.`);
}

export async function downloadPack(m: Manifest, tourName: string, onProgress: (done: number) => void): Promise<void> {
  const server = getBackend();
  const device = await getDeviceId(server);
  packDir(m.tour_id, m.lang).create({ intermediates: true, idempotent: true });
  // Audio và ảnh cùng một hàng đợi; tiến độ đếm theo số file (xem packSteps)
  const queue: (() => Promise<void>)[] = m.files.flatMap((f) => [
    () => fetchVerified(fileUrl(m, f.poi_id, device, server), audioFile(m.tour_id, m.lang, f), f.sha256, f.name),
    ...(f.images ?? []).map((img, i) => () =>
      fetchVerified(imageUrl(m, f.poi_id, i, device, server), imageFile(m.tour_id, m.lang, f.poi_id, i, img), img.sha256, f.name)),
  ]);
  let done = 0;
  const worker = async () => {
    for (let task = queue.shift(); task; task = queue.shift()) {
      await task();
      onProgress(++done);
    }
  };
  const results = await Promise.allSettled(Array.from({ length: DOWNLOAD_CONCURRENCY }, worker));
  const failure = results.find((result) => result.status === "rejected");
  if (failure) throw failure.reason;
  savePack(m, tourName);
}

export function deletePack(tourId: string, lang: string): void {
  const dir = packDir(tourId, lang);
  if (dir.exists) dir.delete();
  removePack(tourId, lang);
}
