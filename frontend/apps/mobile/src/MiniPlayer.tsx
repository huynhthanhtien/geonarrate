import { Pressable, StyleSheet, View } from "react-native";
import { useI18n } from "./i18n";
import { usePlayback } from "./playback";
import { colors, radius, shadow, space } from "./theme";
import { Cover, IconButton, ProgressBar, Txt } from "./ui";

/** Thanh phát nhỏ nổi phía trên thanh tab; chạm vào để mở trình phát đầy đủ. */
export function MiniPlayer({ onOpen }: { onOpen: () => void }) {
  const { t } = useI18n();
  const { pack, now, playing, finished, toggle, stop, elapsed, duration } = usePlayback();
  if (!pack) return null;
  const total = duration > 0 ? duration : (now?.duration_ms ?? 0) / 1000;
  const progress = total > 0 ? elapsed / total : 0;
  return (
    <View style={styles.wrap}>
      <ProgressBar value={progress} height={2} track="transparent" style={styles.progress} />
      <Pressable
        onPress={onOpen}
        accessibilityRole="button"
        accessibilityLabel={pack.tourName}
        style={({ pressed }) => [styles.body, pressed && { opacity: 0.95 }]}
      >
        <Cover seed={pack.tourId + (now?.poi_id ?? "")} name={now?.name ?? pack.tourName} height={42} width={42} />
        <View style={{ flex: 1 }}>
          <Txt variant="bodyStrong" numberOfLines={1} style={{ fontSize: 15 }}>{now?.name ?? pack.tourName}</Txt>
          <Txt variant="caption" color={colors.textMuted} numberOfLines={1}>
            {pack.tourName}{finished ? ` · ${t("player.tourFinished")}` : ""}
          </Txt>
        </View>
      </Pressable>
      <IconButton
        name={playing ? "pause" : finished ? "refresh" : "play"}
        onPress={toggle}
        accessibilityLabel={playing ? t("player.pause") : t("player.resume")}
        variant="primary"
        size={38}
        iconSize={19}
      />
      <IconButton
        name="close"
        onPress={stop}
        accessibilityLabel={t("player.exit")}
        size={32}
        iconSize={18}
        color={colors.textMuted}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    height: 64,
    paddingHorizontal: space.sm,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    overflow: "hidden",
    ...shadow.float,
  },
  progress: { position: "absolute", left: 0, right: 0, top: 0 },
  body: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingLeft: 2,
  },
});
