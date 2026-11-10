import { Camera, Map, Marker, type CameraRef, type LngLat } from "@maplibre/maplibre-react-native";
import { color, radius, space } from "@geonarrate/tokens";
import * as Location from "expo-location";
import { useEffect, useMemo, useRef, useState } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import type { PackFile } from "./api";
import { downloadOfflineMap, MAP_STYLE, offlineMapStatus, removeOfflineMap, tourMapBounds } from "./offlineMap";
import { TourDiagram } from "./TourDiagram";
import { Btn, T } from "./ui";

type Coordinates = Pick<PackFile, "lat" | "lng">;
const toLngLat = ({ lng, lat }: Coordinates): LngLat => [lng, lat];

export function TourMap({ files, position, playingId, onPlay }: {
  files: PackFile[];
  position?: Coordinates | null;
  playingId?: string;
  onPlay?: (file: PackFile) => void;
}) {
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
    return () => { mounted.current = false; };
  }, []);
  useEffect(() => {
    let active = true;
    setOfflineReady(false);
    if (offlineBounds && Platform.OS === "android") {
      void offlineMapStatus(offlineBounds).then((status) => {
        if (active) setOfflineReady(status?.state === "complete");
      }).catch(() => undefined);
    }
    return () => { active = false; };
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
        setMessage("Hãy cấp quyền vị trí cho GeoNarrate trong Cài đặt.");
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
      setMessage("Chưa nhận được GPS. Hãy bật vị trí rồi thử lại.");
    } finally {
      setLocating(false);
    }
  };

  const locationButton = (
    <>
      <Btn label={locating ? "Đang tìm vị trí…" : "Vị trí của tôi"} kind="ghost" disabled={locating} onPress={() => void locate()} />
      {message ? <T.muted>{message}</T.muted> : null}
    </>
  );
  const saveMap = async () => {
    if (!offlineBounds || offlineProgress !== null) return;
    setOfflineNotice("");
    setOfflineProgress(0);
    try {
      await downloadOfflineMap(offlineBounds, (status) => {
        if (mounted.current) setOfflineProgress(Number.isFinite(status.percentage) ? Math.min(99, Math.floor(status.percentage)) : 0);
      });
      if (mounted.current) {
        setOfflineReady(true);
        setMapFailed(false);
        setShowDiagram(false);
      }
    } catch (e) {
      if (mounted.current) setOfflineNotice(e instanceof Error ? e.message : "Không tải được bản đồ.");
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
    } catch (e) {
      if (mounted.current) setOfflineNotice(e instanceof Error ? e.message : "Không xóa được bản đồ.");
    } finally {
      if (mounted.current) setRemoving(false);
    }
  };
  const offlineControls = Platform.OS === "android" && (
    <>
      {offlineBounds ? (
        offlineReady ? (
          <>
            <T.muted>Đã tải bản đồ đường phố quanh các điểm dừng.</T.muted>
            <Btn label="Xóa bản đồ đã tải" kind="ghost" disabled={removing} onPress={() => void removeMap()} />
          </>
        ) : (
          <Btn label={offlineProgress === null ? "Tải bản đồ offline" : `Đang tải bản đồ… ${offlineProgress}%`}
            disabled={offlineProgress !== null} onPress={() => void saveMap()} />
        )
      ) : <T.muted>Vùng tour quá rộng để tải bản đồ offline.</T.muted>}
      {offlineNotice ? <T.error>{offlineNotice}</T.error> : null}
    </>
  );

  if (mapFailed || showDiagram) {
    return (
      <View style={styles.section}>
        {mapFailed && <T.muted>Không tải được nền đường phố. Bạn vẫn có thể xem các điểm đã tải.</T.muted>}
        <TourDiagram files={files} position={visitor} playingId={playingId} onPlay={onPlay} />
        {!visitor && locationButton}
        {offlineControls}
        <Btn label="Mở bản đồ đường phố" kind="ghost" onPress={() => {
          setMapFailed(false);
          setShowDiagram(false);
        }} />
      </View>
    );
  }

  const [west, south, east, north] = files.reduce(
    ([w, s, e, n], { lng, lat }) => [Math.min(w, lng), Math.min(s, lat), Math.max(e, lng), Math.max(n, lat)],
    [first.lng, first.lat, first.lng, first.lat],
  );
  const initialView = east - west > 0.001 || north - south > 0.001
    ? { bounds: [west, south, east, north] as [number, number, number, number], padding: { top: 32, right: 32, bottom: 32, left: 32 } }
    : { center: toLngLat(first), zoom: 16 };

  return (
    <View style={styles.section}>
      <T.h>Bản đồ tour</T.h>
      <Map
        style={styles.map}
        mapStyle={MAP_STYLE}
        androidView="texture"
        logo={false}
        onDidFailLoadingMap={() => setMapFailed(true)}
      >
        <Camera ref={camera} initialViewState={initialView} />
        {files.map((file, index) => (
          <Marker key={file.poi_id} lngLat={toLngLat(file)}
            accessibilityLabel={onPlay ? `Nghe ${file.name}` : file.name}
            onPress={onPlay ? () => onPlay(file) : undefined}>
            <View style={[styles.marker, file.poi_id === playingId && styles.playing]}>
              <Text style={styles.number}>{index + 1}</Text>
            </View>
          </Marker>
        ))}
        {visitor && (
          <Marker id="visitor" lngLat={toLngLat(visitor)} accessibilityLabel="Vị trí của bạn">
            <View style={styles.visitor} />
          </Marker>
        )}
      </Map>
      <T.muted>© OpenFreeMap · © OpenMapTiles · © OpenStreetMap</T.muted>
      {locationButton}
      {offlineControls}
      <Btn label="Xem sơ đồ offline" kind="ghost" onPress={() => setShowDiagram(true)} />
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: space.xs },
  map: { height: 300, borderRadius: radius.md, overflow: "hidden", backgroundColor: "#e8f2ee" },
  marker: {
    width: 32, height: 32, borderRadius: 16, borderWidth: 2, borderColor: "white",
    alignItems: "center", justifyContent: "center", backgroundColor: color.primary,
  },
  playing: { backgroundColor: color.text },
  number: { color: color.primaryFg, fontWeight: "700" },
  visitor: { width: 19, height: 19, borderRadius: 10, borderWidth: 3, borderColor: "white", backgroundColor: "#2563eb" },
});
