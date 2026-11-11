import { getManifest, type Manifest } from "./api";
import { installedPacks, withDevice, type InstalledPack } from "./store";

/** Bản phát hành mới nhất trên máy chủ cho một pack đã tải. */
export async function latestManifest(pack: InstalledPack): Promise<Manifest> {
  return withDevice((device, server) => getManifest(pack.tourId, pack.lang, device, server));
}

/** Trả về pack_id của các bản đã tải đã có bản khác trên máy chủ. */
export async function changedPacks(): Promise<Set<string>> {
  const packs = installedPacks();
  const checks = await Promise.allSettled(packs.map(async (pack) => {
    const published = await latestManifest(pack);
    // So cả số điểm để bản nghe thử cũ (nếu còn trên máy) được thay bằng bản đầy đủ.
    return published.pack_id !== pack.manifest.pack_id
      || published.files.length !== pack.manifest.files.length
      ? pack.manifest.pack_id
      : null;
  }));
  return new Set(checks.flatMap((check) =>
    check.status === "fulfilled" && check.value ? [check.value] : []));
}
