import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import type { PackFile } from "./api";
import { useI18n } from "./i18n";
import { colors, radius, space } from "./theme";
import { Txt } from "./ui";

type Coordinates = Pick<PackFile, "lat" | "lng">;

const PADDING = 38;
const MARKER_SIZE = 30;
const METERS_PER_DEGREE = 111_195;

/** Sơ đồ phẳng dùng được khi không có mạng hoặc không tải được nền bản đồ. */
export function TourDiagram({ files, position, playingId, onPlay, height = 220 }: {
  files: PackFile[];
  position?: Coordinates | null;
  playingId?: string;
  onPlay?: (file: PackFile) => void;
  height?: number;
}) {
  const { t } = useI18n();
  const [width, setWidth] = useState(0);
  const origin = files[0];
  if (!origin) return null;

  const metersPerLongitude = METERS_PER_DEGREE * Math.max(0.001, Math.cos(origin.lat * Math.PI / 180));
  const meters = ({ lat, lng }: Coordinates) => ({
    x: ((lng - origin.lng + 540) % 360 - 180) * metersPerLongitude,
    y: (origin.lat - lat) * METERS_PER_DEGREE,
  });
  const points = files.map((file) => ({ file, ...meters(file) }));
  let west = -30;
  let east = 30;
  let north = -30;
  let south = 30;
  for (const point of points) {
    west = Math.min(west, point.x - point.file.radius);
    east = Math.max(east, point.x + point.file.radius);
    north = Math.min(north, point.y - point.file.radius);
    south = Math.max(south, point.y + point.file.radius);
  }
  const scale = Math.min(
    Math.max(0, width - PADDING * 2) / (east - west),
    (height - PADDING * 2) / (south - north),
  );
  const project = ({ x, y }: { x: number; y: number }) => ({
    x: width / 2 + (x - (west + east) / 2) * scale,
    y: height / 2 + (y - (north + south) / 2) * scale,
  });
  const visitor = position ? project(meters(position)) : null;
  const visitorOnMap = visitor && visitor.x >= 10 && visitor.x <= width - 10
    && visitor.y >= 10 && visitor.y <= height - 10;

  return (
    <View
      style={[styles.map, { height }]}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
    >
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        {[0.25, 0.5, 0.75].map((ratio) => (
          <View key={`v${ratio}`} style={[styles.gridLine, { left: `${ratio * 100}%`, top: 0, bottom: 0, width: StyleSheet.hairlineWidth }]} />
        ))}
        {[0.33, 0.66].map((ratio) => (
          <View key={`h${ratio}`} style={[styles.gridLine, { top: `${ratio * 100}%`, left: 0, right: 0, height: StyleSheet.hairlineWidth }]} />
        ))}
      </View>

      <View pointerEvents="none" style={styles.compass}>
        <Txt variant="caption" color={colors.textMuted}>{`↑ ${t("map.north")}`}</Txt>
      </View>

      {scale > 0 && points.map((point) => {
        const { x, y } = project(point);
        const diameter = point.file.radius * scale * 2;
        return (
          <View
            key={`range-${point.file.poi_id}`}
            pointerEvents="none"
            style={[styles.range, {
              left: x - diameter / 2,
              top: y - diameter / 2,
              width: diameter,
              height: diameter,
              borderRadius: diameter / 2,
            }]}
          />
        );
      })}

      {scale > 0 && points.map((point, index) => {
        const { x, y } = project(point);
        return (
          <Pressable
            key={point.file.poi_id}
            accessibilityRole={onPlay ? "button" : undefined}
            accessibilityLabel={onPlay ? `${t("player.listen")} ${point.file.name}` : point.file.name}
            disabled={!onPlay}
            onPress={onPlay ? () => onPlay(point.file) : undefined}
            hitSlop={4}
            style={[
              styles.marker,
              { left: x - MARKER_SIZE / 2, top: y - MARKER_SIZE / 2 },
              point.file.poi_id === playingId && styles.playing,
            ]}
          >
            <Txt variant="caption" color={colors.primaryFg} style={{ fontSize: 12 }}>{index + 1}</Txt>
          </Pressable>
        );
      })}

      {scale > 0 && visitorOnMap ? (
        <View
          accessibilityLabel={t("map.myLocation")}
          pointerEvents="none"
          style={[styles.visitorRing, { left: visitor.x - 15, top: visitor.y - 15 }]}
        >
          <View style={styles.visitor} />
        </View>
      ) : null}
      {visitor && !visitorOnMap && width > 0 ? (
        <View style={styles.outside}>
          <Txt variant="caption" color={colors.textMuted}>{t("map.outside")}</Txt>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  map: {
    position: "relative",
    overflow: "hidden",
    backgroundColor: "#EDF3F0",
  },
  gridLine: { position: "absolute", backgroundColor: "rgba(15,118,110,0.08)" },
  compass: {
    position: "absolute",
    right: space.sm,
    top: space.sm,
    paddingHorizontal: space.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
    backgroundColor: "rgba(255,255,255,0.9)",
  },
  range: {
    position: "absolute",
    backgroundColor: "rgba(15,118,110,0.10)",
    borderWidth: 1,
    borderColor: "rgba(15,118,110,0.28)",
  },
  marker: {
    position: "absolute",
    width: MARKER_SIZE,
    height: MARKER_SIZE,
    borderRadius: MARKER_SIZE / 2,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primary,
    borderWidth: 2,
    borderColor: colors.white,
  },
  playing: { backgroundColor: colors.accent, transform: [{ scale: 1.12 }] },
  visitorRing: {
    position: "absolute",
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "rgba(37,99,235,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  visitor: {
    width: 14, height: 14, borderRadius: 7,
    borderWidth: 2, borderColor: colors.white, backgroundColor: "#2563EB",
  },
  outside: {
    position: "absolute",
    left: space.sm,
    bottom: space.sm,
    paddingHorizontal: space.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
    backgroundColor: "rgba(255,255,255,0.9)",
  },
});
