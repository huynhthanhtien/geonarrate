import * as maplibregl from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import "maplibre-gl/dist/maplibre-gl.css";

maplibregl.setWorkerUrl(workerUrl);
export { maplibregl };
export const MAP_STYLE = "https://tiles.openfreemap.org/styles/liberty";
export const DEFAULT_CENTER: [number, number] = [106.6978, 10.7881];

export function validCoordinates(lat: number, lng: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 85 && Math.abs(lng) <= 180;
}

export function createCircle(center: [number, number], radius: number) {
  const lng = center[0] * Math.PI / 180;
  const lat = center[1] * Math.PI / 180;
  const distance = Math.max(0, radius) / 6371008.8;
  const coordinates: number[][] = [];
  for (let i = 0; i <= 64; i++) {
    const bearing = i / 64 * Math.PI * 2;
    const latitude = Math.asin(Math.sin(lat) * Math.cos(distance) + Math.cos(lat) * Math.sin(distance) * Math.cos(bearing));
    const longitude = lng + Math.atan2(Math.sin(bearing) * Math.sin(distance) * Math.cos(lat), Math.cos(distance) - Math.sin(lat) * Math.sin(latitude));
    coordinates.push([longitude * 180 / Math.PI, latitude * 180 / Math.PI]);
  }
  return { type: "Feature" as const, geometry: { type: "Polygon" as const, coordinates: [coordinates] }, properties: {} };
}

export function observeMapSize(container: HTMLElement, map: maplibregl.Map): ResizeObserver {
  const observer = new ResizeObserver(() => map.resize());
  observer.observe(container);
  return observer;
}
