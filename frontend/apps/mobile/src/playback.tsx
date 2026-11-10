import { GeofenceTracker, GPS_THROTTLE_MS } from "@geonarrate/core";
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from "expo-audio";
import * as Location from "expo-location";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Platform } from "react-native";
import { audioFile } from "./download";
import type { PackFile } from "./api";
import { useI18n } from "./i18n";
import { recordEvent, syncEvents, type InstalledPack } from "./store";
import { stopTourLocation, trackTourLocation } from "./tourLocation";

export type GpsState = "checking" | "background" | "foreground" | "denied";
export type Trigger = "geofence" | "manual";

export const SPEEDS = [0.75, 1, 1.25, 1.5, 2] as const;

interface PlaybackValue {
  pack: InstalledPack | null;
  now: PackFile | null;
  playing: boolean;
  finished: boolean;
  gps: GpsState;
  position: { lat: number; lng: number } | null;
  notice: string | null;
  enablingBackground: boolean;
  elapsed: number;
  duration: number;
  rate: number;
  start: (pack: InstalledPack) => void;
  stop: () => void;
  play: (file: PackFile) => void;
  toggle: () => void;
  next: () => void;
  previous: () => void;
  seekBy: (seconds: number) => void;
  seekTo: (seconds: number) => void;
  setRate: (rate: number) => void;
  enableBackground: () => void;
}

const PlaybackContext = createContext<PlaybackValue | null>(null);

export function PlaybackProvider({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const tRef = useRef(t);
  tRef.current = t;

  const [pack, setPack] = useState<InstalledPack | null>(null);
  const [now, setNow] = useState<PackFile | null>(null);
  const [playing, setPlaying] = useState(false);
  const [finished, setFinished] = useState(false);
  const [gps, setGps] = useState<GpsState>("checking");
  const [position, setPosition] = useState<{ lat: number; lng: number } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [enablingBackground, setEnablingBackground] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [duration, setDuration] = useState(0);
  const [rate, setRateState] = useState(1);

  const playerRef = useRef<AudioPlayer | null>(null);
  const current = useRef<{ file: PackFile; trigger: Trigger; finished: boolean } | null>(null);
  const enableBackgroundRef = useRef<(() => Promise<void>) | null>(null);
  const playRef = useRef<(file: PackFile, trigger: Trigger) => void>(() => undefined);
  const elapsedRef = useRef(0);
  const rateRef = useRef(1);

  const start = useCallback((next: InstalledPack) => {
    setPack((prev) => (
      prev && prev.tourId === next.tourId && prev.lang === next.lang
        && prev.manifest.pack_id === next.manifest.pack_id
        ? prev
        : next
    ));
  }, []);

  const stop = useCallback(() => {
    setPack(null);
  }, []);

  const play = useCallback((file: PackFile) => {
    playRef.current(file, "manual");
  }, []);

  const toggle = useCallback(() => {
    const player = playerRef.current;
    if (!player || !pack) return;
    if (!now) {
      const first = pack.manifest.files[0];
      if (first) playRef.current(first, "manual");
      return;
    }
    if (finished) {
      setFinished(false);
      void player.seekTo(0).then(() => player.play()).catch(() => undefined);
      return;
    }
    if (playing) player.pause();
    else player.play();
  }, [pack, now, finished, playing]);

  const next = useCallback(() => {
    if (!pack) return;
    const files = pack.manifest.files;
    const index = now ? files.findIndex((file) => file.poi_id === now.poi_id) : -1;
    const file = index >= 0 ? files[index + 1] : files[0];
    if (file) playRef.current(file, "manual");
  }, [pack, now]);

  const previous = useCallback(() => {
    if (!pack) return;
    const player = playerRef.current;
    if (elapsedRef.current > 3) {
      setFinished(false);
      void player?.seekTo(0).catch(() => undefined);
      setElapsed(0);
      elapsedRef.current = 0;
      return;
    }
    const files = pack.manifest.files;
    const index = now ? files.findIndex((file) => file.poi_id === now.poi_id) : -1;
    const file = index > 0 ? files[index - 1] : undefined;
    if (file) playRef.current(file, "manual");
  }, [pack, now]);

  const seekTo = useCallback((seconds: number) => {
    const player = playerRef.current;
    const target = Math.max(0, Math.min(seconds, duration > 0 ? duration - 0.2 : seconds));
    void player?.seekTo(target).catch(() => undefined);
    setElapsed(target);
    elapsedRef.current = target;
    setFinished(false);
  }, [duration]);

  const seekBy = useCallback((seconds: number) => {
    seekTo(elapsedRef.current + seconds);
  }, [seekTo]);

  const setRate = useCallback((value: number) => {
    setRateState(value);
    rateRef.current = value;
    playerRef.current?.setPlaybackRate(value);
  }, []);

  const enableBackground = useCallback(() => {
    void enableBackgroundRef.current?.();
  }, []);

  useEffect(() => {
    if (!pack) {
      setNow(null);
      setPlaying(false);
      setFinished(false);
      setGps("checking");
      setPosition(null);
      setNotice(null);
      setElapsed(0);
      setDuration(0);
      elapsedRef.current = 0;
      return;
    }

    const manifest = pack.manifest;
    const tourName = pack.tourName;
    let alive = true;
    let lastFix = 0;
    let sub: Location.LocationSubscription | undefined;

    setGps("checking");
    setNotice(null);
    setNow(null);
    setPlaying(false);
    setFinished(false);
    setPosition(null);
    setElapsed(0);
    setDuration(0);
    elapsedRef.current = 0;

    const tracker = new GeofenceTracker(
      manifest.files.map((file) => ({
        id: file.poi_id, lat: file.lat, lng: file.lng, radiusM: file.radius, priority: file.priority,
      })),
    );

    const playLocal = (file: PackFile, trigger: Trigger) => {
      const player = playerRef.current;
      if (!player) return;
      const audio = audioFile(manifest.tour_id, manifest.lang, file);
      if (!audio.exists) {
        setNotice(tRef.current("player.missingFile", { name: file.name }));
        return;
      }
      if (trigger === "manual") tracker.markPlayed(file.poi_id, Date.now());
      setNotice(null);
      player.pause();
      current.current = { file, trigger, finished: false };
      setNow(file);
      setFinished(false);
      setElapsed(0);
      elapsedRef.current = 0;
      player.replace({ uri: audio.uri });
      player.setPlaybackRate(rateRef.current);
      if (Platform.OS === "android" || Platform.OS === "ios") {
        player.updateLockScreenMetadata({
          title: file.name, artist: "GeoNarrate", albumTitle: tourName,
        });
      }
      player.play();
      recordEvent(file.poi_id, manifest.lang, "play", trigger, 0);
    };
    playRef.current = playLocal;

    const onLocation = (location: Location.LocationObject) => {
      if (!alive || location.timestamp <= lastFix || Date.now() - location.timestamp > 30_000) return;
      lastFix = location.timestamp;
      const coords = { lat: location.coords.latitude, lng: location.coords.longitude };
      setPosition(coords);
      const point = tracker.update(
        { ...coords, accuracyM: location.coords.accuracy ?? Infinity },
        location.timestamp,
      );
      const file = point && manifest.files.find((item) => item.poi_id === point.id);
      if (file) playLocal(file, "geofence");
    };

    async function startEngine() {
      await setAudioModeAsync({
        playsInSilentMode: true,
        shouldPlayInBackground: true,
        interruptionMode: "doNotMix",
      });
      if (!alive) return;
      const player = createAudioPlayer();
      playerRef.current = player;
      player.setPlaybackRate(rateRef.current);
      if (Platform.OS === "android" || Platform.OS === "ios") {
        player.setActiveForLockScreen(true, { title: tourName, artist: "GeoNarrate" });
      }
      player.addListener("playbackStatusUpdate", (status) => {
        if (!alive) return;
        setPlaying(status.playing);
        const seconds = Number.isFinite(status.currentTime) ? status.currentTime : 0;
        elapsedRef.current = seconds;
        setElapsed(seconds);
        if (Number.isFinite(status.duration) && status.duration > 0) setDuration(status.duration);
        const clip = current.current;
        if (!status.didJustFinish || !clip || clip.finished) return;
        clip.finished = true;
        recordEvent(clip.file.poi_id, manifest.lang, "complete", clip.trigger, seconds * 1000);
        setFinished(true);
        setPlaying(false);
        syncEvents().catch(() => undefined);
      });

      const { granted } = await Location.requestForegroundPermissionsAsync();
      if (!alive) return;
      if (!granted || !await Location.hasServicesEnabledAsync()) {
        if (alive) setGps("denied");
        return;
      }
      sub = await Location.watchPositionAsync({
        accuracy: Location.Accuracy.High,
        timeInterval: GPS_THROTTLE_MS,
        distanceInterval: 0,
        mayShowUserSettingsDialog: false,
      }, onLocation);
      if (!alive) {
        sub.remove();
        return;
      }
      if (Platform.OS === "android") {
        enableBackgroundRef.current = async () => {
          if (!alive) return;
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
            if (alive) setNotice(tRef.current("player.locationDenied"));
          } finally {
            if (alive) setEnablingBackground(false);
          }
        };
      }
      setGps("foreground");
    }

    void startEngine().catch(() => {
      if (!alive) return;
      setGps("denied");
      if (!playerRef.current) setNotice(tRef.current("player.trackerFailed"));
    });

    return () => {
      alive = false;
      enableBackgroundRef.current = null;
      playRef.current = () => undefined;
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
  }, [pack]);

  const activeNow = useMemo(() => {
    if (!now || !pack) return null;
    return pack.manifest.files.some((file) => file.poi_id === now.poi_id) ? now : null;
  }, [now, pack]);

  const value = useMemo<PlaybackValue>(() => ({
    pack,
    now: activeNow,
    playing,
    finished,
    gps,
    position,
    notice,
    enablingBackground,
    elapsed,
    duration,
    rate,
    start,
    stop,
    play,
    toggle,
    next,
    previous,
    seekBy,
    seekTo,
    setRate,
    enableBackground,
  }), [
    pack, activeNow, playing, finished, gps, position, notice, enablingBackground,
    elapsed, duration, rate, start, stop, play, toggle, next, previous, seekBy, seekTo,
    setRate, enableBackground,
  ]);

  return <PlaybackContext.Provider value={value}>{children}</PlaybackContext.Provider>;
}

export function usePlayback(): PlaybackValue {
  const value = useContext(PlaybackContext);
  if (!value) throw new Error("usePlayback must be used inside PlaybackProvider");
  return value;
}
