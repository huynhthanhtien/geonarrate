import { describe, expect, it } from "vitest";
import { distanceM, pickGeofence } from "./geo";

const chua = { id: "chua-ngoc-hoang", lat: 10.7881, lng: 106.6978, radiusM: 40, priority: 80 };
const quan = { id: "quan-an", lat: 10.7882, lng: 106.6978, radiusM: 40, priority: 20 };

describe("geo", () => {
  it("tính khoảng cách ~11m cho 0.0001° vĩ độ", () => {
    expect(distanceM(chua, quan)).toBeGreaterThan(10);
    expect(distanceM(chua, quan)).toBeLessThan(12);
  });
  it("priority cao thắng khi trùng vùng", () => {
    expect(pickGeofence({ lat: 10.78815, lng: 106.6978, accuracyM: 10 }, [quan, chua])?.id).toBe("chua-ngoc-hoang");
  });
  it("bỏ qua fix có accuracy > 50m", () => {
    expect(pickGeofence({ lat: 10.7881, lng: 106.6978, accuracyM: 80 }, [chua])).toBeNull();
  });
});
