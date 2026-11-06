import { describe, expect, it } from "vitest";
import { GeofenceTracker } from "./tracker";

const A = { id: "a", lat: 10.78, lng: 106.7, radiusM: 40, priority: 1 };
const B = { id: "b", lat: 10.7805, lng: 106.7, radiusM: 40, priority: 5 };
const FAR = { lat: 11, lng: 107, accuracyM: 5 };
const atA = { lat: 10.78, lng: 106.7, accuracyM: 5 };
const between = { lat: 10.78025, lng: 106.7, accuracyM: 5 };
const MIN = 60_000;

describe("GeofenceTracker", () => {
  it("chỉ phát sau khi ở trong vùng đủ 4 giây", () => {
    const t = new GeofenceTracker([A]);
    expect(t.update(atA, 0)).toBeNull();
    expect(t.update(atA, 3_999)).toBeNull();
    expect(t.update(atA, 4_000)?.id).toBe("a");
  });

  it("rời vùng thì tính lại debounce", () => {
    const t = new GeofenceTracker([A]);
    t.update(atA, 0);
    t.update(FAR, 2_000);
    expect(t.update(atA, 4_000)).toBeNull();
    expect(t.update(atA, 8_000)?.id).toBe("a");
  });

  it("không phát lại trong 10 phút, hết cooldown thì phát lại", () => {
    const t = new GeofenceTracker([A]);
    t.update(atA, 0);
    expect(t.update(atA, 4_000)?.id).toBe("a");
    expect(t.update(atA, 5 * MIN)).toBeNull();
    expect(t.update(atA, 4_000 + 10 * MIN)?.id).toBe("a");
  });

  it("cooldown tính theo từng điểm và priority cao thắng", () => {
    const t = new GeofenceTracker([A, B]);
    t.update(between, 0);
    expect(t.update(between, 4_000)?.id).toBe("b");
    expect(t.update(atA, 5_000)).toBeNull();
    expect(t.update(atA, 9_000)?.id).toBe("a");
  });

  it("bỏ qua lần đo sai số trên 50 m", () => {
    const t = new GeofenceTracker([A]);
    t.update(atA, 0);
    expect(t.update({ ...atA, accuracyM: 80 }, 5_000)).toBeNull();
  });

  it("nghe thủ công thì tính vào cooldown", () => {
    const t = new GeofenceTracker([A]);
    t.markPlayed("a", 0);
    t.update(atA, 1_000);
    expect(t.update(atA, 6_000)).toBeNull();
  });
});
