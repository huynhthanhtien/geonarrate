import { DEVICE_STORAGE_BUDGET_BYTES, DOWNLOAD_CONCURRENCY, PACK_MAX_INSTALLED } from "@geonarrate/core";
import * as Crypto from "expo-crypto";
import { Directory, File, Paths } from "expo-file-system";
import { fileUrl, type Manifest, type PackFile } from "./api";
import { getDeviceId, installedPacks, removePack, savePack } from "./store";

function packDir(tourId: string, lang: string): Directory {
  return new Directory(Paths.document, "packs", tourId, lang);
}

export function audioFile(tourId: string, lang: string, f: { attraction_id: string; sha256: string }): File {
  return new File(packDir(tourId, lang), `${f.attraction_id}-${f.sha256.slice(0, 12)}.mp3`);
}

async function matches(file: File, sha256: string): Promise<boolean> {
  const buf = await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, await file.bytes());
  const hex = Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
  return hex === sha256;
}

/** Trả về thông báo nếu vượt giới hạn trên máy (UC-17 E2), null nếu được tải. */
export function limitProblem(m: Manifest): string | null {
  const others = installedPacks().filter((p) => !(p.tourId === m.tour_id && p.lang === m.lang));
  if (others.length >= PACK_MAX_INSTALLED) return `Tối đa ${PACK_MAX_INSTALLED} pack. Hãy xoá bớt để tải thêm.`;
  const size = m.files.reduce((sum, f) => sum + f.bytes, 0);
  const used = others.reduce((sum, p) => sum + p.bytes, 0);
  if (used + size > DEVICE_STORAGE_BUDGET_BYTES) return "Vượt giới hạn 1,5 GB. Hãy xoá bớt pack để tải thêm.";
  return null;
}

async function fetchOne(m: Manifest, f: PackFile, device: string): Promise<void> {
  const dest = audioFile(m.tour_id, m.lang, f);
  // File đã tải đúng thì bỏ qua: mất mạng giữa chừng không phải tải lại từ đầu
  if (dest.exists && (await matches(dest, f.sha256))) return;
  for (let attempt = 0; attempt < 2; attempt++) {
    if (dest.exists) dest.delete();
    await File.downloadFileAsync(fileUrl(m.tour_id, m.lang, f.attraction_id, device), dest);
    if (await matches(dest, f.sha256)) return;
  }
  if (dest.exists) dest.delete();
  throw new Error(`File của "${f.name}" bị hỏng khi tải, hãy thử lại.`);
}

export async function downloadPack(m: Manifest, tourName: string, onProgress: (done: number) => void): Promise<void> {
  const device = await getDeviceId();
  packDir(m.tour_id, m.lang).create({ intermediates: true, idempotent: true });
  const queue = [...m.files];
  let done = 0;
  const worker = async () => {
    for (let f = queue.shift(); f; f = queue.shift()) {
      await fetchOne(m, f, device);
      onProgress(++done);
    }
  };
  await Promise.all(Array.from({ length: DOWNLOAD_CONCURRENCY }, worker));
  savePack(m, tourName);
}

export function deletePack(tourId: string, lang: string): void {
  const dir = packDir(tourId, lang);
  if (dir.exists) dir.delete();
  removePack(tourId, lang);
}
