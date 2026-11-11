import { Ionicons } from "@expo/vector-icons";
import { useEffect, useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { getTours, type PublicTour } from "../api";
import { formatBytes } from "../format";
import { useI18n } from "../i18n";
import { languageName } from "../languages";
import { installedPacks, syncEvents, type InstalledPack } from "../store";
import { colors, radius, shadow, space } from "../theme";
import { changedPacks } from "../updates";
import {
  Card, Chip, Cover, EmptyState, IconButton, Screen, SectionHeader, Spinner, TextField, Txt,
} from "../ui";
import { TourCard } from "./TourCard";

export function HomeScreen({ lang, onOpen, onPlay, onChangeLang, onScan, padBottom }: {
  lang: string;
  onOpen: (tour: PublicTour) => void;
  onPlay: (pack: InstalledPack) => void;
  onChangeLang: () => void;
  onScan: () => void;
  padBottom: number;
}) {
  const { t } = useI18n();
  const [tours, setTours] = useState<PublicTour[] | null>(null);
  const [packs, setPacks] = useState<InstalledPack[]>(installedPacks);
  const [updates, setUpdates] = useState<Set<string>>(new Set());
  const [offline, setOffline] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState("");
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let active = true;
    setOffline(false);
    (async () => {
      try {
        const catalog = await getTours();
        if (active) setTours(catalog);
      } catch {
        if (active) setOffline(true);
      } finally {
        if (active) setRefreshing(false);
      }
      if (active) setPacks(installedPacks());
      syncEvents().catch(() => undefined);
      try {
        const changed = await changedPacks();
        if (active) setUpdates(changed);
      } catch {
        // Không kiểm tra được bản mới khi ngoại tuyến.
      }
    })();
    return () => {
      active = false;
    };
  }, [reload]);

  const refresh = () => {
    setRefreshing(true);
    setReload((value) => value + 1);
  };

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const list = tours ?? [];
    return needle ? list.filter((tour) => tour.name.toLowerCase().includes(needle)) : list;
  }, [tours, query]);

  const hasUpdate = (tour: PublicTour) =>
    packs.some((pack) => pack.tourId === tour.id && updates.has(pack.manifest.pack_id));

  return (
    <Screen
      padBottom={padBottom}
      refreshControl={(
        <RefreshControl
          refreshing={refreshing}
          onRefresh={refresh}
          tintColor={colors.primary}
          colors={[colors.primary]}
        />
      )}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
        <Cover seed="geonarrate" name="GeoNarrate" height={38} width={38} rounded={12} />
        <View style={{ flex: 1 }}>
          <Txt variant="bodyStrong">GeoNarrate</Txt>
          <Txt variant="caption" color={colors.textMuted} numberOfLines={1}>{t("app.tagline")}</Txt>
        </View>
        <Chip label={lang.toUpperCase()} tone="primary" icon="language" onPress={onChangeLang} />
        <IconButton
          name="scan-outline"
          onPress={onScan}
          accessibilityLabel={t("home.scan")}
          variant="surface"
          size={38}
          iconSize={20}
        />
      </View>

      <View style={{ gap: space.xs }}>
        <Txt variant="display">{t("home.title")}</Txt>
        <Txt variant="small" color={colors.textMuted}>{t("app.tagline")}</Txt>
      </View>

      <View style={{ justifyContent: "center" }}>
        <Ionicons
          name="search"
          size={18}
          color={colors.tabInactive}
          style={{ position: "absolute", left: 14, zIndex: 1 }}
        />
        <TextField
          value={query}
          onChangeText={setQuery}
          placeholder={t("home.search")}
          accessibilityLabel={t("home.search")}
          style={{ paddingLeft: 42 }}
        />
      </View>

      {offline ? (
        <Card tone="accent" style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
          <Ionicons name="cloud-offline-outline" size={20} color={colors.accent} />
          <Txt variant="small" color={colors.accent} style={{ flex: 1 }}>{t("home.offline")}</Txt>
          <Pressable onPress={refresh} accessibilityRole="button" hitSlop={8}>
            <Txt variant="label" color={colors.accent}>{t("home.retry")}</Txt>
          </Pressable>
        </Card>
      ) : null}

      {packs.length > 0 ? (
        <View style={{ gap: space.sm }}>
          <SectionHeader title={t("home.downloaded")} />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: space.md, paddingVertical: 2, paddingRight: space.md }}
          >
            {packs.map((pack) => (
              <Pressable
                key={`${pack.tourId}-${pack.lang}`}
                onPress={() => onPlay(pack)}
                accessibilityRole="button"
                accessibilityLabel={pack.tourName}
                style={({ pressed }) => [styles.mini, pressed && { opacity: 0.9 }]}
              >
                <Cover
                  seed={pack.tourId}
                  name={pack.tourName}
                  height={46}
                  width={46}
                  rounded={radius.md}
                />
                <View style={{ flex: 1 }}>
                  <Txt variant="bodyStrong" numberOfLines={1} style={{ fontSize: 14 }}>{pack.tourName}</Txt>
                  <Txt variant="caption" color={colors.textMuted} numberOfLines={1}>
                    {languageName(pack.lang)} · {formatBytes(pack.bytes)}
                  </Txt>
                </View>
                <View style={styles.playDot}>
                  <Ionicons name="play" size={13} color={colors.primaryFg} />
                </View>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      ) : null}

      <View style={{ gap: space.sm }}>
        <SectionHeader title={t("home.tours")} />
        {tours === null && !offline ? (
          <Spinner label={t("common.loading")} />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={query ? "search-outline" : "compass-outline"}
            title={t("home.empty")}
            body={t("home.emptyHint")}
            actionLabel={t("home.retry")}
            onAction={refresh}
          />
        ) : (
          <View style={{ gap: space.md }}>
            {filtered.map((tour) => (
              <TourCard
                key={tour.id}
                tour={tour}
                lang={lang}
                installed={packs.some((pack) => pack.tourId === tour.id)}
                update={hasUpdate(tour)}
                onPress={() => onOpen(tour)}
              />
            ))}
          </View>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  mini: {
    width: 232,
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    padding: space.sm,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    ...shadow.card,
  },
  playDot: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
});
