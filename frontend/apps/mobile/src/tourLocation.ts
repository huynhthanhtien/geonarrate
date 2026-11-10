import { GPS_THROTTLE_MS } from "@geonarrate/core";
import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import { AppState } from "react-native";

const TASK = "geonarrate-active-tour-location";
let active: ((location: Location.LocationObject) => void) | undefined;
let pending: Promise<unknown> = Promise.resolve();

TaskManager.defineTask<{ locations: Location.LocationObject[] }>(TASK, async ({ data, error }) => {
  if (error) return;
  const fix = data?.locations.at(-1);
  if (fix) active?.(fix);
});

function enqueue<T>(run: () => Promise<T>): Promise<T> {
  const next = pending.then(run);
  pending = next.catch(() => undefined);
  return next;
}

export function trackTourLocation(onLocation: (location: Location.LocationObject) => void) {
  active = onLocation;
  return enqueue(async () => {
    if (active !== onLocation) return;
    if (AppState.currentState !== "active") throw new Error("App không còn ở phía trước.");
    await Location.startLocationUpdatesAsync(TASK, {
      accuracy: Location.Accuracy.High,
      timeInterval: GPS_THROTTLE_MS,
      distanceInterval: 0,
      foregroundService: {
        notificationTitle: "GeoNarrate · Đang theo dõi tour",
        notificationBody: "Tự phát thuyết minh khi bạn đến gần điểm dừng.",
        killServiceOnDestroy: true,
      },
    });
  });
}

export function stopTourLocation(onLocation: (location: Location.LocationObject) => void) {
  if (active !== onLocation) return Promise.resolve();
  active = undefined;
  return enqueue(async () => {
    if (await Location.hasStartedLocationUpdatesAsync(TASK)) {
      await Location.stopLocationUpdatesAsync(TASK);
    }
  });
}
