import { color, radius, space } from "@geonarrate/tokens";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { PackFile } from "./api";
import { T } from "./ui";

type Coordinates = Pick<PackFile, "lat" | "lng">;

const MAP_HEIGHT = 240;
const PADDING = 36;
const MARKER_SIZE = 36;
const METERS_PER_DEGREE = 111_195;

export function TourDiagram({ files, position, playingId, onPlay }: {
  files: PackFile[];
  position?: Coordinates | null;
  playingId?: string;
  onPlay?: (file: PackFile) => void;
}) {
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
  const scale = Math.min(Math.max(0, width - PADDING * 2) / (east - west), (MAP_HEIGHT - PADDING * 2) / (south - north));
  const project = ({ x, y }: { x: number; y: number }) => ({
    x: width / 2 + (x - (west + east) / 2) * scale,
    y: MAP_HEIGHT / 2 + (y - (north + south) / 2) * scale,
  });
  const visitor = position ? project(meters(position)) : null;
  const visitorOnMap = visitor && visitor.x >= 10 && visitor.x <= width - 10
    && visitor.y >= 10 && visitor.y <= MAP_HEIGHT - 10;

  return (
    <View style={styles.section}>
      <T.h>Sơ đồ tour đã tải</T.h>
      <View style={styles.map} onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
        <View pointerEvents="none" style={styles.compass}><Text style={styles.north}>↑ B</Text></View>
        {scale > 0 && points.map((point) => {
          const { x, y } = project(point);
          const diameter = point.file.radius * scale * 2;
          return <View key={point.file.attraction_id} pointerEvents="none" style={[
            styles.range, { left: x - diameter / 2, top: y - diameter / 2, width: diameter, height: diameter, borderRadius: diameter / 2 },
          ]} />;
        })}
        {scale > 0 && points.map((point, index) => {
          const { x, y } = project(point);
          return (
            <Pressable
              key={point.file.attraction_id}
              accessibilityRole={onPlay ? "button" : undefined}
              accessibilityLabel={onPlay ? `Nghe ${point.file.name}` : point.file.name}
              disabled={!onPlay}
              onPress={onPlay ? () => onPlay(point.file) : undefined}
              hitSlop={4}
              style={[
                styles.marker,
                { left: x - MARKER_SIZE / 2, top: y - MARKER_SIZE / 2 },
                point.file.attraction_id === playingId && styles.playing,
              ]}
            >
              <Text style={styles.number}>{index + 1}</Text>
            </Pressable>
          );
        })}
        {scale > 0 && visitorOnMap && (
          <View accessibilityLabel="Vị trí của bạn" pointerEvents="none" style={[
            styles.visitor, { left: visitor.x - 8, top: visitor.y - 8 },
          ]} />
        )}
      </View>
      <T.muted>Vòng tròn là vùng tự phát audio. Sơ đồ này hiển thị các điểm của tour.</T.muted>
      {visitor && !visitorOnMap && <T.muted>Bạn đang ở ngoài khu vực hiển thị.</T.muted>}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: space.xs },
  map: { height: MAP_HEIGHT, position: "relative", overflow: "hidden", backgroundColor: "#e8f2ee", borderRadius: radius.md },
  compass: { position: "absolute", right: space.sm, top: space.sm },
  north: { color: color.text, fontWeight: "700" },
  range: { position: "absolute", backgroundColor: "#bce1d7", borderWidth: 1, borderColor: "#76b9a7" },
  marker: {
    position: "absolute", width: MARKER_SIZE, height: MARKER_SIZE, borderRadius: MARKER_SIZE / 2,
    alignItems: "center", justifyContent: "center", backgroundColor: color.primary,
    borderWidth: 2, borderColor: color.surface,
  },
  playing: { backgroundColor: color.text },
  number: { color: color.primaryFg, fontWeight: "700" },
  visitor: { position: "absolute", width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: "white", backgroundColor: "#2563eb" },
});
