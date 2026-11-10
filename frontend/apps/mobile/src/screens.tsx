import { color, radius, space } from "@geonarrate/tokens";
import { GeofenceTracker, GPS_THROTTLE_MS } from "@geonarrate/core";
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from "expo-audio";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as Location from "expo-location";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, BackHandler, Platform, TextInput, View } from "react-native";
import { activateTicket, ApiError, checkBackend, getBackend, parseBackend, getLanguages, getManifest, getTours, type Manifest, type PackFile, type PublicTour } from "./api";
import { audioFile, deletePack, downloadPack, limitProblem } from "./download";
import { withDevice, installedPacks, recordEvent, setPref, syncEvents, type InstalledPack } from "./store";
import { Btn, Card, Screen, T } from "./ui";
import { TourMap } from "./TourMap";
import { stopTourLocation, trackTourLocation } from "./tourLocation";

const mb = (n: number) => `${(n / 1024 / 1024).toFixed(1)} MB`;
const message = (e: unknown) =>
  e instanceof ApiError ? e.message : "Không kết nối được máy chủ, hãy kiểm tra mạng.";

const OFFLINE_LANGUAGES = [
  { code: "vi", native_name: "Tiếng Việt" },
  { code: "en", native_name: "English" },
  { code: "zh", native_name: "中文" },
  { code: "ja", native_name: "日本語" },
  { code: "ko", native_name: "한국어" },
];

export function ServerScreen({ onSave, onBack }: { onSave: (url: string) => void; onBack: () => void }) {
  const [address, setAddress] = useState(getBackend);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const connect = async () => {
    setError(null);
    let server: string;
    try {
      server = parseBackend(address);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Địa chỉ máy chủ không hợp lệ.");
      return;
    }
    setBusy(true);
    try {
      await checkBackend(server);
      onSave(server);
    } catch {
      setError("Không kết nối được GeoNarrate. Kiểm tra địa chỉ, backend và Wi-Fi.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Screen title="Máy chủ GeoNarrate" onBack={busy ? undefined : onBack}>
      <T.p>Nhập địa chỉ backend mà điện thoại truy cập được.</T.p>
      <TextInput
        accessibilityLabel="Địa chỉ máy chủ"
        value={address}
        onChangeText={setAddress}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        editable={!busy}
        style={{ borderWidth: 1, borderColor: color.surfaceMuted, borderRadius: radius.md, padding: space.md, color: color.text }}
      />
      {error && <T.error>{error}</T.error>}
      <Btn label={busy ? "Đang kiểm tra…" : "Kết nối và lưu"} disabled={busy} onPress={() => void connect()} />
    </Screen>
  );
}

/** UC-15: chọn ngôn ngữ */
export function LanguageScreen({ onDone, onBack, onServer }: { onDone: (lang: string) => void; onBack?: () => void; onServer: () => void }) {
  const [langs, setLangs] = useState<typeof OFFLINE_LANGUAGES | null>(null);
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    let active = true;
    getLanguages().then((languages) => {
      if (active) setLangs(languages);
    }).catch(() => {
      if (!active) return;
      setLangs(OFFLINE_LANGUAGES);
      setOffline(true);
    });
    return () => { active = false; };
  }, []);
  return (
    <Screen title="Chọn ngôn ngữ thuyết minh" onBack={onBack}>
      <Btn label="Máy chủ" kind="ghost" onPress={onServer} />
      {!langs && <T.muted>Đang tải danh sách ngôn ngữ…</T.muted>}
      {offline && <T.muted>Đang dùng danh sách ngôn ngữ có sẵn trên máy.</T.muted>}
      {langs?.map((l) => (
        <Btn key={l.code} label={l.native_name} kind="ghost" onPress={() => { setPref("lang", l.code); onDone(l.code); }} />
      ))}
    </Screen>
  );
}

/** UC-15: danh sách tour; không có mạng thì chỉ hiện tour đã tải */
export function ToursScreen({ lang, onOpen, onPlay, onChangeLang, onServer, onScan }: {
  lang: string;
  onOpen: (t: PublicTour) => void;
  onPlay: (p: InstalledPack) => void;
  onChangeLang: () => void;
  onServer: () => void;
  onScan: () => void;
}) {
  const [tours, setTours] = useState<PublicTour[] | null>(null);
  const [offline, setOffline] = useState(false);
  const [packs, setPacks] = useState(installedPacks);
  const [updates, setUpdates] = useState<string[]>([]);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let active = true;
    setOffline(false);
    getTours().then((catalog) => {
      if (active) setTours(catalog);
    }).catch(() => {
      if (active) setOffline(true);
    });
    syncEvents().catch(() => undefined);
    async function checkUpdates() {
      const checks = await Promise.allSettled(installedPacks().map(async (pack) => {
        const published = await withDevice((device, server) =>
          getManifest(pack.tourId, pack.lang, device, pack.manifest.access === "preview", server));
        if (published.pack_id !== pack.manifest.pack_id || published.access !== pack.manifest.access) {
          return pack.manifest.pack_id;
        }
      }));
      if (active) {
        setUpdates(checks.flatMap((check) => check.status === "fulfilled" && check.value ? [check.value] : []));
      }
    }
    checkUpdates().catch(() => undefined);
    return () => { active = false; };
  }, [reload]);
  const remove = (p: InstalledPack) => { deletePack(p.tourId, p.lang); setPacks(installedPacks()); };
  return (
    <Screen title="GeoNarrate">
      <Btn label="Quét vé QR" onPress={onScan} />
      <Btn label="Máy chủ" kind="ghost" onPress={onServer} />
      {packs.length > 0 && <T.h>Đã tải về máy</T.h>}
      {packs.map((p) => (
        <Card key={`${p.tourId}-${p.lang}`}>
          <T.h>{p.tourName}</T.h>
          <T.muted>{p.lang} · {p.manifest.files.length} điểm · {mb(p.bytes)}{p.manifest.access === "preview" ? " · nghe thử" : ""}</T.muted>
          {updates.includes(p.manifest.pack_id) && <T.muted>Có bản khác đang phát hành.</T.muted>}
          <Btn label="Bắt đầu nghe" onPress={() => onPlay(p)} />
          <Btn label="Xoá khỏi máy" kind="danger" onPress={() => remove(p)} />
        </Card>
      ))}
      <T.h>Tour</T.h>
      {offline && (
        <>
          <T.muted>Không kết nối được máy chủ. Bạn vẫn có thể nghe các tour đã tải.</T.muted>
          <Btn label="Tải lại danh sách tour" kind="ghost" onPress={() => setReload((attempt) => attempt + 1)} />
        </>
      )}
      {tours?.length === 0 && <T.muted>Chưa có tour nào.</T.muted>}
      {tours?.map((t) => (
        <Card key={t.id} onPress={() => onOpen(t)}>
          <T.h>{t.name}</T.h>
          <T.muted>
            {t.poi_count} điểm · {t.access === "paid" ? "Cần vé" : "Miễn phí"}
            {t.langs.includes(lang) ? "" : ` · chưa có ngôn ngữ ${lang}`}
          </T.muted>
        </Card>
      ))}
      <Btn label={`Đổi ngôn ngữ (đang chọn ${lang})`} kind="ghost" onPress={onChangeLang} />
    </Screen>
  );
}

/** UC-15, UC-17: chi tiết tour, tải pack */
export function TourScreen({ tour, lang, onBack, onScan, onPlay }: {
  tour: PublicTour;
  lang: string;
  onBack: () => void;
  onScan: () => void;
  onPlay: (p: InstalledPack) => void;
}) {
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [needTicket, setNeedTicket] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const available = tour.langs.includes(lang);
  const installed = installedPacks().find((p) => p.tourId === tour.id && p.lang === lang);
  const updateAvailable = installed && manifest
    && (installed.manifest.pack_id !== manifest.pack_id || installed.manifest.access !== manifest.access);
  const hasFullPack = installed?.manifest.access === "full";

  useEffect(() => {
    if (!available) return;
    withDevice((device, server) => getManifest(tour.id, lang, device, false, server))
      .then(setManifest)
      .catch((e: unknown) => {
        if (e instanceof ApiError && e.code === "ticket_required") setNeedTicket(true);
        else setError(message(e));
      });
  }, [tour.id, lang, available]);

  const download = async (m: Manifest) => {
    if (m.files.length === 0) {
      setError("Tour chưa có điểm nghe thử.");
      return;
    }
    if (m.access === "preview" && hasFullPack) {
      onPlay(installed);
      return;
    }
    const problem = limitProblem(m);
    if (problem) { setError(problem); return; }
    setError(null);
    setProgress(0);
    try {
      await downloadPack(m, tour.name, setProgress);
      const p = installedPacks().find((x) => x.tourId === m.tour_id && x.lang === m.lang);
      if (p) onPlay(p);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Tải thất bại, hãy thử lại.");
    } finally {
      setProgress(null);
    }
  };
  const preview = async () => {
    try {
      await download(await withDevice((device, server) => getManifest(tour.id, lang, device, true, server)));
    } catch (e) {
      setError(message(e));
    }
  };
  const total = manifest?.files.reduce((sum, f) => sum + f.bytes, 0) ?? 0;
  return (
    <Screen title={tour.name} onBack={onBack}>
      {!available && <T.p>Tour chưa có thuyết minh bằng ngôn ngữ {lang}. Có: {tour.langs.join(", ")}.</T.p>}
      {error && <T.error>{error}</T.error>}
      {installed && <Btn label="Nghe bản đã tải" disabled={progress !== null} onPress={() => onPlay(installed)} />}
      {updateAvailable && <T.p>Có bản phát hành khác trên máy chủ (phiên bản {manifest.version}).</T.p>}
      {needTicket && (
        <>
          <T.p>Tour này cần vé. Quét mã QR trên vé để tải toàn bộ, hoặc nghe thử các điểm miễn phí.</T.p>
          <Btn label="Quét vé QR" onPress={onScan} />
          {!hasFullPack && <Btn label="Nghe thử" kind="ghost" disabled={progress !== null} onPress={preview} />}
        </>
      )}
      {manifest && (
        <>
          <T.muted>{manifest.files.length} điểm · {mb(total)} · phiên bản {manifest.version}</T.muted>
          <TourMap files={manifest.files} />
          {manifest.files.map((f, index) => (
            <Card key={f.poi_id}>
              <T.h>{index + 1}. {f.name}</T.h>
              {f.summary && <T.muted>{f.summary}</T.muted>}
            </Card>
          ))}
          <Btn
            label={progress === null
              ? (updateAvailable ? "Tải bản đang phát hành" : "Tải để nghe offline")
              : `Đang tải ${progress}/${manifest.files.length}`}
            disabled={progress !== null}
            onPress={() => download(manifest)}
          />
        </>
      )}
    </Screen>
  );
}

export function TicketToursScreen({ tours, onBack, onOpen }: {
  tours: PublicTour[];
  onBack: () => void;
  onOpen: (tour: PublicTour) => void;
}) {
  return (
    <Screen title="Tour trong vé" onBack={onBack}>
      {tours.map((tour) => (
        <Btn key={tour.id} label={tour.name} onPress={() => onOpen(tour)} />
      ))}
    </Screen>
  );
}

/** UC-16: kích hoạt vé */
export function ScanScreen({ onBack, onActivated }: { onBack: () => void; onActivated: (tours: PublicTour[]) => void }) {
  const [permission, requestPermission] = useCameraPermissions();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const lastScan = useRef("");
  const activated = useRef<{ code: string; tourIds: string[] } | null>(null);
  const submit = async (value: string, scanned = false) => {
    const ticket = value.trim();
    if (inFlight.current || !ticket || (scanned && ticket === lastScan.current)) return;
    if (scanned) {
      lastScan.current = ticket;
      setCode(ticket);
    }
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      if (activated.current?.code !== ticket) {
        const { tour_ids } = await withDevice((device, server) => activateTicket(ticket, device, server));
        activated.current = { code: ticket, tourIds: tour_ids };
      }
      const { tourIds } = activated.current;
      const tours = (await getTours()).filter((tour) => tourIds.includes(tour.id));
      if (tours.length === 0) {
        setError("Vé đã kích hoạt nhưng chưa có tour nào trong vé được phát hành.");
        return;
      }
      onActivated(tours);
    } catch (e) {
      setError(message(e));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };
  return (
    <Screen title="Quét vé QR" onBack={busy ? undefined : onBack}>
      {error && <T.error>{error}</T.error>}
      {permission?.granted ? (
        <View style={{ height: 300, borderRadius: radius.md, overflow: "hidden" }}>
          <CameraView
            style={{ flex: 1 }}
            barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
            onBarcodeScanned={busy ? undefined : ({ data }) => void submit(data, true)}
          />
        </View>
      ) : (
        <Btn label="Cho phép dùng camera" kind="ghost" onPress={() => void requestPermission()} />
      )}
      <T.muted>Hoặc nhập mã in trên vé:</T.muted>
      <TextInput
        value={code}
        onChangeText={setCode}
        autoCapitalize="characters"
        autoCorrect={false}
        placeholder="Mã vé"
        accessibilityLabel="Mã vé"
        style={{ borderWidth: 1, borderColor: color.surfaceMuted, borderRadius: radius.md, padding: space.md, color: color.text }}
      />
      <Btn label={busy ? "Đang kiểm tra..." : "Kích hoạt"} disabled={busy || !code.trim()} onPress={() => void submit(code)} />
    </Screen>
  );
}

/** UC-18: nghe tự động theo vị trí, hoặc chọn điểm thủ công */
export function PlayerScreen({ pack, onBack }: { pack: InstalledPack; onBack: () => void }) {
  const { manifest: m } = pack;
  const [gps, setGps] = useState<"checking" | "background" | "foreground" | "denied">("checking");
  const [now, setNow] = useState<PackFile | null>(null);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState<Pick<PackFile, "lat" | "lng"> | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [enablingBackground, setEnablingBackground] = useState(false);
  const enableBackground = useRef<(() => Promise<void>) | null>(null);
  const playerRef = useRef<AudioPlayer | null>(null);
  const current = useRef<{ file: PackFile; trigger: "geofence" | "manual"; finished: boolean } | null>(null);
  const [tracker] = useState(() => new GeofenceTracker(
    m.files.map((f) => ({ id: f.poi_id, lat: f.lat, lng: f.lng, radiusM: f.radius, priority: f.priority })),
  ));

  const play = useCallback((f: PackFile, trigger: "geofence" | "manual") => {
    const player = playerRef.current;
    if (!player) return;
    const file = audioFile(m.tour_id, m.lang, f);
    if (!file.exists) {
      setNotice(`Thiếu file của "${f.name}". Hãy xoá pack và tải lại.`);
      return;
    }
    if (trigger === "manual") tracker.markPlayed(f.poi_id, Date.now());
    setNotice(null);
    player.pause();
    current.current = { file: f, trigger, finished: false };
    setNow(f);
    player.replace({ uri: file.uri });
    if (Platform.OS === "android" || Platform.OS === "ios") {
      player.updateLockScreenMetadata({ title: f.name, artist: "GeoNarrate", albumTitle: pack.tourName });
    }
    player.play();
    recordEvent(f.poi_id, m.lang, "play", trigger, 0);
  }, [m.tour_id, m.lang, tracker, pack.tourName]);

  useEffect(() => {
    const back = BackHandler.addEventListener("hardwareBackPress", () => {
      onBack();
      return true;
    });
    return () => back.remove();
  }, [onBack]);

  useEffect(() => {
    let alive = true;
    let lastFix = 0;
    let sub: Location.LocationSubscription | undefined;
    const onLocation = (loc: Location.LocationObject) => {
      if (!alive || loc.timestamp <= lastFix || Date.now() - loc.timestamp > 30_000) return;
      lastFix = loc.timestamp;
      const coords = { lat: loc.coords.latitude, lng: loc.coords.longitude };
      setPosition(coords);
      const point = tracker.update({ ...coords, accuracyM: loc.coords.accuracy ?? Infinity }, loc.timestamp);
      const f = point && m.files.find((item) => item.poi_id === point.id);
      if (f) play(f, "geofence");
    };
    async function start() {
      await setAudioModeAsync({
        playsInSilentMode: true, shouldPlayInBackground: true, interruptionMode: "doNotMix",
      });
      if (!alive) return;
      const player = createAudioPlayer();
      playerRef.current = player;
      if (Platform.OS === "android" || Platform.OS === "ios") {
        player.setActiveForLockScreen(true, { title: pack.tourName, artist: "GeoNarrate" });
      }
      player.addListener("playbackStatusUpdate", (status) => {
        if (!alive) return;
        setPlaying(status.playing);
        const clip = current.current;
        if (!status.didJustFinish || !clip || clip.finished) return;
        clip.finished = true;
        recordEvent(clip.file.poi_id, m.lang, "complete", clip.trigger, status.currentTime * 1000);
        setNow(null);
        syncEvents().catch(() => undefined);
      });

      const { granted } = await Location.requestForegroundPermissionsAsync();
      if (!alive) return;
      if (!granted || !await Location.hasServicesEnabledAsync()) {
        if (alive) setGps("denied");
        return;
      }
      if (!alive) return;
      sub = await Location.watchPositionAsync({
        accuracy: Location.Accuracy.High, timeInterval: GPS_THROTTLE_MS,
        distanceInterval: 0, mayShowUserSettingsDialog: false,
      }, onLocation);
      if (!alive) {
        sub.remove();
        return;
      }
      if (Platform.OS === "android") {
        enableBackground.current = async () => {
          if (!alive || AppState.currentState !== "active") return;
          setNotice(null);
          setEnablingBackground(true);
          try {
            await trackTourLocation(onLocation);
            if (!alive) return;
            sub?.remove();
            sub = undefined;
            setGps("background");
          } catch {
            await stopTourLocation(onLocation).catch(() => undefined);
            if (alive) setNotice("Chưa bật được vị trí khi khóa màn hình. Bạn vẫn có thể nghe khi mở app.");
          } finally {
            if (alive) setEnablingBackground(false);
          }
        };
      }
      setGps("foreground");
    }
    void start().catch(() => {
      if (!alive) return;
      setGps("denied");
      if (!playerRef.current) setNotice("Không khởi tạo được trình phát. Hãy mở lại tour.");
    });
    return () => {
      alive = false;
      enableBackground.current = null;
      sub?.remove();
      void stopTourLocation(onLocation).catch(() => undefined);
      const player = playerRef.current;
      playerRef.current = null;
      current.current = null;
      if (player) {
        player.pause();
        if (Platform.OS === "android" || Platform.OS === "ios") player.setActiveForLockScreen(false);
        player.remove();
      }
      syncEvents().catch(() => undefined);
    };
  }, [m.files, m.lang, pack.tourName, play, tracker]);

  return (
    <Screen title={pack.tourName} onBack={onBack}>
      {gps === "background" && <T.muted>Tự phát theo vị trí kể cả khi khóa màn hình.</T.muted>}
      {gps === "foreground" && <T.muted>Đang theo dõi vị trí khi app mở.</T.muted>}
      {gps === "foreground" && Platform.OS === "android" && (
        <Btn
          label={enablingBackground ? "Đang bật vị trí…" : "Bật tự phát khi khóa màn hình"}
          kind="ghost"
          disabled={enablingBackground}
          onPress={() => { void enableBackground.current?.(); }}
        />
      )}
      {gps === "denied" && <T.muted>Vị trí chưa sẵn sàng. Bạn vẫn có thể chọn điểm để nghe.</T.muted>}
      {notice && <T.error>{notice}</T.error>}
      {now && (
        <Card>
          <T.muted>{playing ? "Đang phát" : "Thuyết minh"}</T.muted>
          <T.h>{now.name}</T.h>
          <Btn label={playing ? "Tạm dừng" : "Phát tiếp"} kind="ghost" onPress={() => {
            if (playing) playerRef.current?.pause();
            else playerRef.current?.play();
          }} />
        </Card>
      )}
      <TourMap files={m.files} position={position} playingId={playing ? now?.poi_id : undefined} onPlay={(f) => play(f, "manual")} />
      {m.files.map((f, index) => (
        <Card key={f.poi_id} onPress={() => play(f, "manual")}>
          <T.h>{index + 1}. {f.name}</T.h>
          <T.muted>Chạm để nghe · {Math.round(f.duration_ms / 1000)} giây</T.muted>
        </Card>
      ))}
      <Btn label="Kết thúc tour" kind="ghost" onPress={onBack} />
    </Screen>
  );
}
