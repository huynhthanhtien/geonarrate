import { Ionicons } from "@expo/vector-icons";
import { Pressable, View } from "react-native";
import { UI_LANGS, UI_LANG_NAMES, useI18n, type UiLang } from "../i18n";
import { OFFLINE_LANGUAGES, useLanguages } from "../languages";
import { colors, space } from "../theme";
import { Header, Screen, Spinner, Txt } from "../ui";

function Option({ title, subtitle, selected, onPress }: {
  title: string;
  subtitle?: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: space.md,
        paddingVertical: space.md,
        paddingHorizontal: space.sm,
        borderRadius: 12,
        backgroundColor: pressed ? colors.surfaceMuted : colors.surface,
      })}
    >
      <View style={{ flex: 1 }}>
        <Txt variant="bodyStrong" color={selected ? colors.primaryDark : colors.text}>{title}</Txt>
        {subtitle ? <Txt variant="caption" color={colors.textMuted}>{subtitle}</Txt> : null}
      </View>
      <Ionicons
        name={selected ? "checkmark-circle" : "ellipse-outline"}
        size={22}
        color={selected ? colors.primary : colors.tabInactive}
      />
    </Pressable>
  );
}

export function LanguagePickerScreen({ mode, current, onPick, onBack }: {
  mode: "ui" | "narration";
  current: string;
  onPick: (code: string) => void;
  onBack: () => void;
}) {
  const { t } = useI18n();
  const { languages, offline } = useLanguages();
  const isUi = mode === "ui";

  return (
    <Screen>
      <Header
        title={isUi ? t("lang.uiTitle") : t("lang.title")}
        onBack={onBack}
        backLabel={t("common.back")}
      />
      {isUi ? (
        <View>
          {UI_LANGS.map((code: UiLang) => (
            <Option
              key={code}
              title={UI_LANG_NAMES[code]}
              subtitle={code.toUpperCase()}
              selected={current === code}
              onPress={() => onPick(code)}
            />
          ))}
        </View>
      ) : (
        <View>
          {languages === null ? <Spinner label={t("common.loading")} /> : null}
          {offline ? <Txt variant="caption" color={colors.warning} style={{ padding: space.sm }}>{t("common.offline")}</Txt> : null}
          {(languages ?? OFFLINE_LANGUAGES).map((language) => (
            <Option
              key={language.code}
              title={language.native_name}
              subtitle={language.code.toUpperCase()}
              selected={current === language.code}
              onPress={() => onPick(language.code)}
            />
          ))}
        </View>
      )}
    </Screen>
  );
}
