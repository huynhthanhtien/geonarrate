import { http, passthrough } from "msw";
export { poiHandlers } from "./pois";
export { authHandlers } from "./auth";

export const passthroughHandlers = [
  http.get("https://photon.komoot.io/*", () => passthrough()),
  http.get("https://tiles.stadiamaps.com/*", () => passthrough()),
  http.get("https://*.openstreetmap.org/*", () => passthrough()),
  http.get("https://nominatim.openstreetmap.org/*", () => passthrough()),
  http.get("https://api.mapbox.com/*", () => passthrough()),
];