import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { UI_LANGS, UI_LANG_NAMES, useI18n, type UiLang } from "../i18n";
import { OFFLINE_LANGUAGES, useLanguages } from "../languages";
import { colors, radius, space } from "../theme";
import { Button, Card, Chip, Screen, Txt } from "../ui";

export function OnboardingScreen({ initialUiLang, initialNarrationLang, onStart, onServer }: {
  initialUiLang: UiLang;
  initialNarrationLang: string;
  onStart: (uiLang: UiLang, narrationLang: string) => void;
  onServer: () => void;
}) {
  const { t } = useI18n();
  const { languages, offline } = useLanguages();
  const [uiLang, setUiLang] = useState<UiLang>(initialUiLang);
  const [narrationLang, setNarrationLang] = useState(initialNarrationLang || "vi");
  const options = languages ?? OFFLINE_LANGUAGES;

  return (
    <Screen contentStyle={{ gap: space.xl, paddingTop: space.xl }}>
      <View style={{ alignItems: "center", gap: space.md, paddingTop: space.lg }}>
        <View style={{
          width: 76, height: 76, borderRadius: 24, backgroundColor: colors.primary,
          alignItems: "center", justifyContent: "center",
        }}>
          <Ionicons name="headset" size={38} color={colors.primaryFg} />
        </View>
        <Chip label={t("app.tagline")} tone="primary" icon="navigate" />
        <Txt variant="hero" center>{t("onboarding.title")}</Txt>
        <Txt variant="body" color={colors.textMuted} center style={{ maxWidth: 330 }}>
          {t("onboarding.subtitle")}
        </Txt>
      </View>

      <Card style={{ gap: space.md }}>
        <Txt variant="label" color={colors.textMuted}>{t("onboarding.uiLang")}</Txt>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
          {UI_LANGS.map((code) => (
            <Chip
              key={code}
              label={UI_LANG_NAMES[code]}
              selected={uiLang === code}
              onPress={() => setUiLang(code)}
            />
          ))}
        </View>
      </Card>

      <Card style={{ gap: space.md }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
          <Txt variant="label" color={colors.textMuted} style={{ flex: 1 }}>{t("onboarding.narrationLang")}</Txt>
          {offline ? <Txt variant="caption" color={colors.warning}>{t("common.offline")}</Txt> : null}
        </View>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
          {options.map((language) => (
            <Chip
              key={language.code}
              label={language.native_name}
              selected={narrationLang === language.code}
              onPress={() => setNarrationLang(language.code)}
            />
          ))}
        </View>
      </Card>

      <View style={{
        flexDirection: "row",
        alignItems: "center",
        gap: space.sm,
        paddingHorizontal: space.sm,
        borderRadius: radius.md,
      }}>
        <Ionicons name="navigate-circle-outline" size={22} color={colors.primary} />
        <Txt variant="small" color={colors.textMuted} style={{ flex: 1 }}>{t("onboarding.hint")}</Txt>
      </View>

      <Button
        label={t("onboarding.start")}
        icon="arrow-forward"
        onPress={() => onStart(uiLang, narrationLang)}
      />

      <Pressable
        onPress={onServer}
        accessibilityRole="button"
        style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space.xs, paddingVertical: space.sm }}
      >
        <Ionicons name="server-outline" size={16} color={colors.textMuted} />
        <Txt variant="small" color={colors.textMuted}>{t("onboarding.server")}</Txt>
      </Pressable>
    </Screen>
  );
}
