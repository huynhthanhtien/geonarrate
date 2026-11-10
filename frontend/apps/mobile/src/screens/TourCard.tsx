import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, View } from "react-native";
import type { PublicTour } from "../api";
import { useI18n } from "../i18n";
import { colors, radius, shadow, space } from "../theme";
import { Chip, Cover, Txt } from "../ui";

export function TourCard({ tour, lang, installed, update, onPress }: {
  tour: PublicTour;
  lang: string;
  installed?: boolean;
  update?: boolean;
  onPress: () => void;
}) {
  const { t } = useI18n();
  const missingLang = !tour.langs.includes(lang);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={tour.name}
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.92, transform: [{ scale: 0.995 }] }]}
    >
      <Cover seed={tour.id} name={tour.name} height={66} width={66} rounded={radius.md} />
      <View style={{ flex: 1, gap: 5 }}>
        <Txt variant="bodyStrong" numberOfLines={2}>{tour.name}</Txt>
        <Txt variant="caption" color={colors.textMuted}>
          {t("common.points", { n: tour.poi_count })} · {tour.langs.map((code) => code.toUpperCase()).join(" · ")}
        </Txt>
        <View style={styles.chips}>
          <Chip
            label={tour.access === "paid" ? t("home.paid") : t("home.free")}
            tone={tour.access === "paid" ? "accent" : "success"}
            icon={tour.access === "paid" ? "ticket-outline" : "sparkles-outline"}
          />
          {installed ? <Chip label={t("tour.installed")} tone="primary" icon="checkmark-circle" /> : null}
          {update ? <Chip label={t("home.update")} tone="warning" icon="arrow-up-circle" /> : null}
          {missingLang ? <Chip label={lang.toUpperCase()} tone="danger" icon="language" /> : null}
        </View>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.tabInactive} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    padding: space.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    ...shadow.card,
  },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 2 },
});
