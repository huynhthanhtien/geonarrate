import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { Image, Linking, Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { poiImageUris } from "../download";
import { formatClock } from "../format";
import { useI18n } from "../i18n";
import { SPEEDS, usePlayback } from "../playback";
import { colors, radius, shadow, space } from "../theme";
import { TourMap } from "../TourMap";
import {
  Button, Card, Chip, Cover, EmptyState, Header, IconButton, ProgressBar, Screen, SectionHeader, Sheet, Txt,
} from "../ui";

export function PlayerScreen({ onBack }: { onBack: () => void }) {
  const { t } = useI18n();
  const playback = usePlayback();
  const [confirmFinish, setConfirmFinish] = useState(false);
  const [photo, setPhoto] = useState(0);
  const pack = playback.pack;
  const nowId = playback.now?.poi_id;
  useEffect(() => setPhoto(0), [nowId]);

  if (!pack) {
    return (
      <Screen>
        <Header title={t("player.nowPlaying")} onBack={onBack} backLabel={t("common.back")} />
        <EmptyState
          icon="musical-notes-outline"
          title={t("player.noPack")}
          actionLabel={t("common.back")}
          onAction={onBack}
        />
      </Screen>
    );
  }

  const files = pack.manifest.files;
  const index = playback.now ? files.findIndex((file) => file.poi_id === playback.now?.poi_id) : -1;
  const photos = pack && index >= 0 ? poiImageUris(pack.tourId, pack.lang, files[index]!) : [];
  const nextFile = index >= 0 ? files[index + 1] : files[0];
  const total = playback.duration > 0 ? playback.duration : (playback.now?.duration_ms ?? 0) / 1000;
  const progress = total > 0 ? playback.elapsed / total : 0;
  const gpsText = playback.gps === "background" ? t("player.backgroundOn")
    : playback.gps === "foreground" ? t("player.foregroundOnly")
      : playback.gps === "denied" ? t("player.locationDenied")
        : t("player.autoPlayChecking");

  return (
    <>
      <Screen>
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
          <IconButton
            name="chevron-down"
            onPress={onBack}
            variant="surface"
            accessibilityLabel={t("player.minimize")}
          />
          <View style={{ flex: 1, alignItems: "center" }}>
            <Txt variant="caption" color={colors.textMuted}>{t("player.nowPlaying")}</Txt>
            <Txt variant="bodyStrong" numberOfLines={1} style={{ fontSize: 14 }}>{pack.tourName}</Txt>
          </View>
          <IconButton
            name="ellipsis-horizontal"
            onPress={() => setConfirmFinish(true)}
            variant="surface"
            accessibilityLabel={t("player.more")}
          />
        </View>

        <View style={styles.hero}>
          <Cover
            seed={pack.tourId + (playback.now?.poi_id ?? "")}
            name={playback.now?.name ?? pack.tourName}
            height={252}
            rounded={0}
            showInitials={!playback.now}
            style={{ width: "100%" }}
          >
            {photos.length ? (
              <>
                <Image
                  source={{ uri: photos[Math.min(photo, photos.length - 1)] }}
                  accessibilityIgnoresInvertColors
                  style={StyleSheet.absoluteFill}
                  resizeMode="cover"
                />
                <View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0,0,0,0.25)" }]} />
              </>
            ) : null}
            {playback.now ? (
              <View style={styles.heroCenter} pointerEvents="none">
                <Txt variant="hero" style={styles.heroNumber}>{index + 1}</Txt>
                <View style={styles.heroState}>
                  <Ionicons
                    name={playback.finished ? "refresh" : playback.playing ? "volume-high" : "pause"}
                    size={20}
                    color="rgba(255,255,255,0.92)"
                  />
                </View>
              </View>
            ) : null}
            <View style={{ position: "absolute", top: space.md, left: space.md }}>
              <Chip
                tone="light"
                label={playback.now
                  ? t("player.pointOf", { index: index + 1, total: files.length })
                  : t("player.stops")}
              />
            </View>
          </Cover>
        </View>

        {photos.length > 1 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
            {photos.map((uri, i) => (
              <Pressable
                key={uri}
                onPress={() => setPhoto(i)}
                accessibilityRole="button"
                accessibilityLabel={`${playback.now?.name ?? ""} ${i + 1}/${photos.length}`}
              >
                <Image
                  source={{ uri }}
                  style={[styles.thumb, i === photo && { borderColor: colors.primary }]}
                  resizeMode="cover"
                />
              </Pressable>
            ))}
          </ScrollView>
        ) : null}

        <View style={{ gap: space.xs }}>
          {playback.now ? (
            <Txt variant="caption" color={colors.primary}>
              {t("player.pointOf", { index: index + 1, total: files.length })}
            </Txt>
          ) : null}
          <Txt variant="display">{playback.now?.name ?? pack.tourName}</Txt>
          {playback.now?.summary ? (
            <Txt variant="body" color={colors.textMuted}>{playback.now.summary}</Txt>
          ) : !playback.now ? (
            <Txt variant="small" color={colors.textMuted}>{t("player.stops")}</Txt>
          ) : null}
        </View>

        <View style={{ gap: space.xs }}>
          <ProgressBar value={progress} height={6} />
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Txt variant="caption" color={colors.textMuted}>{formatClock(playback.elapsed)}</Txt>
            <Txt variant="caption" color={colors.textMuted}>{formatClock(total)}</Txt>
          </View>
        </View>

        <View style={styles.controls}>
          <IconButton
            name="play-skip-back"
            onPress={playback.previous}
            accessibilityLabel={t("player.prev")}
            disabled={!playback.now}
            size={46}
            iconSize={22}
          />
          <IconButton
            name="play-back"
            onPress={() => playback.seekBy(-15)}
            accessibilityLabel={t("player.rewind")}
            disabled={!playback.now}
            size={46}
            iconSize={22}
            color={colors.textMuted}
          />
          <Pressable
            onPress={playback.toggle}
            accessibilityRole="button"
            accessibilityLabel={playback.playing ? t("player.pause") : t("player.resume")}
            style={({ pressed }) => [styles.playButton, pressed && { transform: [{ scale: 0.96 }], opacity: 0.92 }]}
          >
            <Ionicons
              name={playback.playing ? "pause" : playback.finished ? "refresh" : "play"}
              size={34}
              color={colors.primaryFg}
            />
          </Pressable>
          <IconButton
            name="play-forward"
            onPress={() => playback.seekBy(15)}
            accessibilityLabel={t("player.forward")}
            disabled={!playback.now}
            size={46}
            iconSize={22}
            color={colors.textMuted}
          />
          <IconButton
            name="play-skip-forward"
            onPress={playback.next}
            accessibilityLabel={t("player.next")}
            disabled={!nextFile}
            size={46}
            iconSize={22}
          />
        </View>

        <View style={{ gap: space.sm }}>
          <View style={{ gap: space.xs }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Txt variant="label" color={colors.textMuted}>{t("player.speed")}</Txt>
              <Txt variant="caption" color={colors.textMuted}>
                {t("player.speedValue", { rate: playback.rate })}
              </Txt>
            </View>
            <View style={styles.speedRow}>
              {SPEEDS.map((speed) => (
                <Chip
                  key={speed}
                  label={t("player.speedValue", { rate: speed })}
                  selected={playback.rate === speed}
                  onPress={() => playback.setRate(speed)}
                  style={styles.speedChip}
                />
              ))}
            </View>
          </View>
          <View style={{ flexDirection: "row", justifyContent: "center" }}>
            <Chip
              label={t("player.autoPlay")}
              icon="navigate-outline"
              tone={playback.gps === "denied" ? "danger" : playback.gps === "background" ? "success" : "primary"}
            />
          </View>
        </View>

        <View style={{ gap: space.sm }}>
          <SectionHeader title={t("tour.map")} />
          <TourMap
            files={files}
            position={playback.position}
            playingId={playback.now?.poi_id}
            onPlay={playback.play}
          />
        </View>

        <Card style={{ gap: space.md }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
            <View style={styles.autoIcon}>
              <Ionicons
                name={playback.gps === "denied" ? "location-outline" : "navigate"}
                size={20}
                color={playback.gps === "denied" ? colors.danger : colors.primary}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Txt variant="bodyStrong">{t("player.autoPlay")}</Txt>
              <Txt variant="caption" color={playback.gps === "denied" ? colors.danger : colors.textMuted}>
                {gpsText}
              </Txt>
            </View>
            {playback.gps === "background" ? (
              <Ionicons name="checkmark-circle" size={20} color={colors.success} />
            ) : null}
          </View>
          {playback.gps === "foreground" && Platform.OS === "android" ? (
            <Button
              kind="secondary"
              size="sm"
              icon="phone-portrait-outline"
              label={playback.enablingBackground ? t("player.enablingBackground") : t("player.enableBackground")}
              onPress={playback.enableBackground}
              loading={playback.enablingBackground}
              disabled={playback.enablingBackground}
            />
          ) : null}
          {playback.gps === "denied" ? (
            <Button
              kind="ghost"
              size="sm"
              icon="settings-outline"
              label={t("settings.openSettings")}
              onPress={() => void Linking.openSettings().catch(() => undefined)}
            />
          ) : null}
        </Card>

        {playback.notice ? (
          <View style={styles.errorBox}>
            <Ionicons name="alert-circle" size={18} color={colors.danger} />
            <Txt variant="small" color={colors.danger} style={{ flex: 1 }} accessibilityRole="alert">
              {playback.notice}
            </Txt>
          </View>
        ) : null}

        {nextFile ? (
          <Card onPress={() => playback.play(nextFile)} style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
            <View style={styles.nextIcon}>
              <Ionicons name="play" size={16} color={colors.primaryFg} />
            </View>
            <View style={{ flex: 1 }}>
              <Txt variant="caption" color={colors.textMuted}>{t("player.nextStop")}</Txt>
              <Txt variant="bodyStrong" numberOfLines={1}>{nextFile.name}</Txt>
            </View>
            <Txt variant="caption" color={colors.textMuted}>{formatClock(nextFile.duration_ms / 1000)}</Txt>
          </Card>
        ) : null}

        <View style={{ gap: space.sm }}>
          <SectionHeader title={`${t("player.stops")} · ${files.length}`} />
          {files.map((file, stopIndex) => {
            const active = file.poi_id === playback.now?.poi_id;
            const thumb = poiImageUris(pack.tourId, pack.lang, file)[0];
            return (
              <Pressable
                key={file.poi_id}
                onPress={() => playback.play(file)}
                accessibilityRole="button"
                accessibilityLabel={file.name}
                style={({ pressed }) => [styles.stop, active && styles.stopActive, pressed && { opacity: 0.9 }]}
              >
                {thumb ? (
                  <Image source={{ uri: thumb }} style={styles.stopThumb} resizeMode="cover" />
                ) : (
                  <View style={[styles.stopNumber, active && { backgroundColor: colors.accent }]}>
                    <Txt variant="caption" color={colors.primaryFg}>{stopIndex + 1}</Txt>
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Txt variant="bodyStrong" color={active ? colors.primaryDark : colors.text} numberOfLines={1}>
                    {file.name}
                  </Txt>
                  <Txt variant="caption" color={colors.textMuted}>{formatClock(file.duration_ms / 1000)}</Txt>
                </View>
                <Ionicons
                  name={active && playback.playing ? "volume-high" : active ? "pause-circle" : "play-circle-outline"}
                  size={24}
                  color={active ? colors.primary : colors.tabInactive}
                />
              </Pressable>
            );
          })}
        </View>

        <Button
          kind="ghost"
          icon="flag-outline"
          label={t("player.finish")}
          onPress={() => setConfirmFinish(true)}
        />
      </Screen>

      <Sheet
        visible={confirmFinish}
        onClose={() => setConfirmFinish(false)}
        title={t("player.finishConfirm")}
        closeLabel={t("common.close")}
      >
        <Txt variant="small" color={colors.textMuted}>{t("player.finishConfirmBody")}</Txt>
        <View style={{ flexDirection: "row", gap: space.sm }}>
          <Button kind="ghost" label={t("common.cancel")} onPress={() => setConfirmFinish(false)} style={{ flex: 1 }} />
          <Button
            kind="danger"
            icon="flag-outline"
            label={t("player.finish")}
            onPress={() => {
              setConfirmFinish(false);
              playback.stop();
              onBack();
            }}
            style={{ flex: 1 }}
          />
        </View>
      </Sheet>
    </>
  );
}

const styles = StyleSheet.create({
  hero: {
    borderRadius: radius.xl,
    overflow: "hidden",
    ...shadow.float,
  },
  heroCenter: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    gap: space.xs,
  },
  heroNumber: {
    fontSize: 96,
    lineHeight: 104,
    color: "rgba(255,255,255,0.26)",
  },
  heroState: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  controls: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: space.xs,
  },
  playButton: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    ...shadow.float,
  },
  speedRow: {
    flexDirection: "row",
    gap: space.xs,
  },
  speedChip: {
    flex: 1,
    alignSelf: "stretch",
    justifyContent: "center",
    paddingVertical: space.sm,
  },
  autoIcon: {    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  nextIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: colors.dangerSoft,
  },
  stop: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  stopActive: {
    backgroundColor: colors.primarySoft,
    borderColor: "#B7DED6",
  },
  thumb: {
    width: 72,
    height: 54,
    borderRadius: radius.sm,
    borderWidth: 2,
    borderColor: "transparent",
  },
  stopThumb: {
    width: 44,
    height: 44,
    borderRadius: radius.sm,
  },
  stopNumber: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
});
