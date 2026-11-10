import { OfflineManager, type LngLatBounds, type OfflinePack, type OfflinePackStatus } from "@maplibre/maplibre-react-native";
import type { PackFile } from "./api";

export const MAP_STYLE = "https://tiles.openfreemap.org/styles/liberty";
const MIN_ZOOM = 11;
const MAX_ZOOM = 16;
const MAX_BYTES = 40_000_000;
let downloading = false;

export function tourMapBounds(files: Pick<PackFile, "lat" | "lng">[]): LngLatBounds | null {
  if (!files.length || files.some(({ lng, lat }) => !Number.isFinite(lng) || !Number.isFinite(lat))) return null;
  const west = Math.min(...files.map(({ lng }) => lng));
  const east = Math.max(...files.map(({ lng }) => lng));
  const south = Math.min(...files.map(({ lat }) => lat));
  const north = Math.max(...files.map(({ lat }) => lat));
  // Keep a margin around the route, and keep each request small on the public tile server.
  const margin = 0.006;
  if (east - west > 0.05 || north - south > 0.05 ||
      west - margin < -180 || east + margin > 180 || south - margin < -80 || north + margin > 80) return null;
  return [
    Math.floor((west - margin) * 1000) / 1000,
    Math.floor((south - margin) * 1000) / 1000,
    Math.ceil((east + margin) * 1000) / 1000,
    Math.ceil((north + margin) * 1000) / 1000,
  ];
}

const regionKey = (bounds: LngLatBounds) => JSON.stringify([MAP_STYLE, MIN_ZOOM, MAX_ZOOM, bounds]);
const findPack = async (bounds: LngLatBounds) =>
  (await OfflineManager.getPacks()).find((pack) => pack.metadata.geoNarrateRegion === regionKey(bounds));

export async function offlineMapStatus(bounds: LngLatBounds) {
  return (await findPack(bounds))?.status();
}

export async function removeOfflineMap(bounds: LngLatBounds) {
  if (downloading) throw new Error("Hãy đợi bản đồ tải xong rồi thử lại.");
  const pack = await findPack(bounds);
  if (pack) await OfflineManager.deletePack(pack.id);
}

export async function downloadOfflineMap(bounds: LngLatBounds, onProgress: (status: OfflinePackStatus) => void) {
  if (downloading) throw new Error("Một bản đồ khác đang được tải. Hãy thử lại sau.");
  downloading = true;
  let pack: OfflinePack | undefined;
  let failure = false;
  let tooLarge = false;
  const onError = () => { failure = true; };
  try {
    pack = await findPack(bounds);
    if (pack) {
      await OfflineManager.addListener(pack.id, () => {}, onError);
      await pack.resume();
    } else {
      pack = await OfflineManager.createPack(
        { mapStyle: MAP_STYLE, bounds, minZoom: MIN_ZOOM, maxZoom: MAX_ZOOM, metadata: { geoNarrateRegion: regionKey(bounds) } },
        () => {}, onError,
      );
    }
    let previousCount = -1;
    let lastProgress = Date.now();
    while (true) {
      const status = await pack.status();
      if (status.completedResourceSize >= MAX_BYTES || status.completedTileCount >= 2500) {
        tooLarge = true;
        throw new Error("Vùng bản đồ vượt giới hạn tải.");
      }
      onProgress(status);
      if (status.state === "complete") return;
      if (status.completedResourceCount !== previousCount) {
        previousCount = status.completedResourceCount;
        lastProgress = Date.now();
      }
      if (failure || Date.now() - lastProgress > 45_000) {
        throw new Error("Tải bản đồ bị gián đoạn. Kiểm tra Internet rồi thử lại.");
      }
      await new Promise<void>((resolve) => setTimeout(resolve, 650));
    }
  } finally {
    if (pack) {
      OfflineManager.removeListener(pack.id);
      await pack.pause().catch(() => undefined);
      if (tooLarge) await OfflineManager.deletePack(pack.id).catch(() => undefined);
    }
    downloading = false;
  }
}
