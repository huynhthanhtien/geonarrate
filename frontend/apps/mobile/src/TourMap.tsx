import { Ionicons } from "@expo/vector-icons";
import { Camera, Map, Marker, type CameraRef, type LngLat } from "@maplibre/maplibre-react-native";
import * as Location from "expo-location";
import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Platform, StyleSheet, View } from "react-native";
import type { PackFile } from "./api";
import { useI18n } from "./i18n";
import { downloadOfflineMap, MAP_STYLE, offlineMapStatus, removeOfflineMap, tourMapBounds } from "./offlineMap";
import { colors, radius, shadow, space } from "./theme";
import { TourDiagram } from "./TourDiagram";
import { Button, IconButton, ProgressBar, Txt } from "./ui";

type Coordinates = Pick<PackFile, "lat" | "lng">;
const toLngLat = ({ lng, lat }: Coordinates): LngLat => [lng, lat];

export function TourMap({ files, position, playingId, onPlay, height = 220 }: {
  files: PackFile[];
  position?: Coordinates | null;
  playingId?: string;
  onPlay?: (file: PackFile) => void;
  height?: number;
}) {
  const { t } = useI18n();
  const camera = useRef<CameraRef>(null);
  const [mapFailed, setMapFailed] = useState(false);
  const [showDiagram, setShowDiagram] = useState(false);
  const [located, setLocated] = useState<Coordinates | null>(null);
  const [locating, setLocating] = useState(false);
  const [message, setMessage] = useState("");
  const offlineBounds = useMemo(() => tourMapBounds(files), [files]);
  const [offlineReady, setOfflineReady] = useState(false);
  const [offlineProgress, setOfflineProgress] = useState<number | null>(null);
  const [offlineNotice, setOfflineNotice] = useState("");
  const [removing, setRemoving] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    setOfflineReady(false);
    if (offlineBounds && Platform.OS === "android") {
      void offlineMapStatus(offlineBounds)
        .then((status) => {
          if (active) setOfflineReady(status?.state === "complete");
        })
        .catch(() => undefined);
    }
    return () => {
      active = false;
    };
  }, [offlineBounds]);

  const visitor = position ?? located;
  const first = files[0];
  if (!first) return null;

  const showPosition = (coords: Coordinates) => camera.current?.easeTo({
    center: toLngLat(coords), zoom: 16, duration: 350,
  });

  const locate = async () => {
    if (visitor) {
      showPosition(visitor);
      return;
    }
    setLocating(true);
    setMessage("");
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
        setMessage(t("map.permission"));
        return;
      }
      const cached = await Location.getLastKnownPositionAsync({ maxAge: 60_000, requiredAccuracy: 100 });
      const fix = cached ?? await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
        mayShowUserSettingsDialog: false,
      });
      const coords = { lat: fix.coords.latitude, lng: fix.coords.longitude };
      setLocated(coords);
      showPosition(coords);
    } catch {
      setMessage(t("map.gpsError"));
    } finally {
      setLocating(false);
    }
  };

  const saveMap = async () => {
    if (!offlineBounds || offlineProgress !== null) return;
    setOfflineNotice("");
    setOfflineProgress(0);
    try {
      await downloadOfflineMap(offlineBounds, (status) => {
        if (mounted.current) {
          setOfflineProgress(Number.isFinite(status.percentage) ? Math.min(99, Math.floor(status.percentage)) : 0);
        }
      });
      if (mounted.current) {
        setOfflineReady(true);
        setMapFailed(false);
        setShowDiagram(false);
      }
    } catch (error) {
      if (mounted.current) setOfflineNotice(error instanceof Error ? error.message : t("map.offlineFailed"));
    } finally {
      if (mounted.current) setOfflineProgress(null);
    }
  };

  const removeMap = async () => {
    if (!offlineBounds || removing) return;
    setRemoving(true);
    setOfflineNotice("");
    try {
      await removeOfflineMap(offlineBounds);
      if (mounted.current) setOfflineReady(false);
    } catch (error) {
      if (mounted.current) setOfflineNotice(error instanceof Error ? error.message : t("map.offlineFailed"));
    } finally {
      if (mounted.current) setRemoving(false);
    }
  };

  const [west, south, east, north] = files.reduce(
    ([w, s, e, n], { lng, lat }) => [Math.min(w, lng), Math.min(s, lat), Math.max(e, lng), Math.max(n, lat)],
    [first.lng, first.lat, first.lng, first.lat],
  );
  const initialView = east - west > 0.001 || north - south > 0.001
    ? {
      bounds: [west, south, east, north] as [number, number, number, number],
      padding: { top: 36, right: 36, bottom: 36, left: 36 },
    }
    : { center: toLngLat(first), zoom: 16 };

  const diagram = showDiagram || mapFailed;

  return (
    <View style={styles.wrap}>
      <View style={{ height }}>
        {diagram ? (
          <TourDiagram
            files={files}
            position={visitor}
            playingId={playingId}
            onPlay={onPlay}
            height={height}
          />
        ) : (
          <View style={styles.mapFill}>
            <Map
              style={StyleSheet.absoluteFill}
              mapStyle={MAP_STYLE}
              androidView="texture"
              logo={false}
              onDidFailLoadingMap={() => setMapFailed(true)}
            >
              <Camera ref={camera} initialViewState={initialView} />
              {files.map((file, index) => (
                <Marker
                  key={file.poi_id}
                  lngLat={toLngLat(file)}
                  accessibilityLabel={onPlay ? `${t("player.listen")} ${file.name}` : file.name}
                  onPress={onPlay ? () => onPlay(file) : undefined}
                >
                  <View style={[styles.marker, file.poi_id === playingId && styles.markerPlaying]}>
                    <Txt variant="caption" color={colors.primaryFg} style={{ fontSize: 12 }}>{index + 1}</Txt>
                  </View>
                </Marker>
              ))}
              {visitor ? (
                <Marker id="visitor" lngLat={toLngLat(visitor)} accessibilityLabel={t("map.myLocation")}>
                  <View style={styles.visitorRing}>
                    <View style={styles.visitor} />
                  </View>
                </Marker>
              ) : null}
            </Map>

            <IconButton
              name={locating ? "navigate" : "locate"}
              onPress={() => void locate()}
              accessibilityLabel={t("map.myLocation")}
              variant="surface"
              size={38}
              iconSize={19}
              style={styles.locate}
            />
            <View style={styles.attribution}>
              <Txt variant="caption" color={colors.textMuted} style={{ fontSize: 9 }}>
                {t("map.attribution")}
              </Txt>
            </View>
            {locating ? (
              <View style={styles.locating}>
                <ActivityIndicator size="small" color={colors.primary} />
              </View>
            ) : null}
          </View>
        )}
      </View>

      <View style={styles.controls}>
        <View style={{ flexDirection: "row", gap: space.sm, flexWrap: "wrap" }}>
          <Button
            kind="ghost"
            size="sm"
            icon={diagram ? "map-outline" : "layers-outline"}
            label={diagram ? t("map.street") : t("map.diagram")}
            onPress={() => {
              if (mapFailed) setMapFailed(false);
              setShowDiagram((value) => !value);
            }}
          />
          {Platform.OS === "android" && offlineBounds ? (
            offlineReady ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: space.xs }}>
                <Ionicons name="checkmark-circle" size={16} color={colors.success} />
                <Txt variant="caption" color={colors.success}>{t("map.offline")}</Txt>
                <Button
                  kind="ghost"
                  size="sm"
                  icon="trash-outline"
                  label={t("common.delete")}
                  onPress={() => void removeMap()}
                  disabled={removing}
                />
              </View>
            ) : offlineProgress !== null ? (
              <View style={{ flex: 1, minWidth: 140, justifyContent: "center", gap: 4 }}>
                <ProgressBar value={offlineProgress / 100} height={4} />
                <Txt variant="caption" color={colors.textMuted}>
                  {t("map.offlineDownloading", { pct: offlineProgress })}
                </Txt>
              </View>
            ) : (
              <Button
                kind="ghost"
                size="sm"
                icon="cloud-download-outline"
                label={t("map.offlineDownload")}
                onPress={() => void saveMap()}
              />
            )
          ) : null}
          {Platform.OS === "android" && !offlineBounds ? (
            <Txt variant="caption" color={colors.textMuted} style={{ alignSelf: "center" }}>
              {t("map.offlineTooLarge")}
            </Txt>
          ) : null}
        </View>

        {message ? <Txt variant="caption" color={colors.danger}>{message}</Txt> : null}
        {offlineNotice ? <Txt variant="caption" color={colors.danger}>{offlineNotice}</Txt> : null}
        {diagram && !mapFailed ? (
          <Txt variant="caption" color={colors.textMuted}>{t("map.ranges")}</Txt>
        ) : null}
        {mapFailed ? (
          <Txt variant="caption" color={colors.textMuted}>{t("map.noMap")}</Txt>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: radius.lg,
    overflow: "hidden",
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    ...shadow.card,
  },
  mapFill: { flex: 1, backgroundColor: "#E8F1EE", overflow: "hidden" },
  marker: {
    width: 29,
    height: 29,
    borderRadius: 15,
    borderWidth: 2,
    borderColor: colors.white,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primary,
  },
  markerPlaying: { backgroundColor: colors.accent, transform: [{ scale: 1.1 }] },
  visitorRing: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(37,99,235,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  visitor: {
    width: 16, height: 16, borderRadius: 8,
    borderWidth: 3, borderColor: colors.white, backgroundColor: "#2563EB",
  },
  locate: { position: "absolute", right: space.sm, top: space.sm },
  attribution: {
    position: "absolute",
    left: space.sm,
    bottom: space.sm,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: "rgba(250,249,246,0.82)",
  },
  locating: {
    position: "absolute",
    right: space.sm + 8,
    top: space.sm + 44,
  },
  controls: {
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    gap: space.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
});
