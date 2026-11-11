import { DEVICE_STORAGE_BUDGET_BYTES } from "@geonarrate/core";
import * as Application from "expo-application";
import * as Location from "expo-location";
import { Children, useEffect, useState, type ReactNode } from "react";
import { Linking, StyleSheet, View } from "react-native";
import { formatBytes } from "../format";
import { UI_LANG_NAMES, useI18n, type UiLang } from "../i18n";
import { languageName } from "../languages";
import { installedPacks } from "../store";
import { colors, radius, space } from "../theme";
import {
  Card, Chip, Cover, Header, ProgressBar, Row, Screen, SectionHeader, Txt,
} from "../ui";

function Group({ children }: { children: ReactNode }) {
  return (
    <View style={styles.group}>
      {Children.toArray(children).map((child, index) => (
        <View
          key={index}
          style={index > 0 ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, marginLeft: 62 } : undefined}
        >
          {child}
        </View>
      ))}
    </View>
  );
}

export function SettingsScreen({ uiLang, lang, onPickUiLang, onPickNarrationLang, onServer, padBottom }: {
  uiLang: UiLang;
  lang: string;
  onPickUiLang: () => void;
  onPickNarrationLang: () => void;
  onServer: () => void;
  padBottom: number;
}) {
  const { t } = useI18n();
  const [granted, setGranted] = useState<boolean | null>(null);
  const version = Application.nativeApplicationVersion ?? "—";
  const packs = installedPacks();
  const used = packs.reduce((sum, pack) => sum + pack.bytes, 0);
  const ratio = used / DEVICE_STORAGE_BUDGET_BYTES;

  useEffect(() => {
    let active = true;
    Location.getForegroundPermissionsAsync()
      .then((permission) => {
        if (active) setGranted(permission.granted);
      })
      .catch(() => {
        if (active) setGranted(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const handleLocation = async () => {
    try {
      const permission = await Location.getForegroundPermissionsAsync();
      if (permission.granted) {
        await Linking.openSettings();
        return;
      }
      const request = permission.canAskAgain ? await Location.requestForegroundPermissionsAsync() : null;
      if (request?.granted) setGranted(true);
      else await Linking.openSettings();
    } catch {
      await Linking.openSettings().catch(() => undefined);
    }
  };

  return (
    <Screen padBottom={padBottom}>
      <Header title={t("settings.title")} subtitle={t("app.tagline")} />

      <Card style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
        <Cover seed="geonarrate" name="GeoNarrate" height={56} width={56} rounded={radius.md} />
        <View style={{ flex: 1, gap: 2 }}>
          <Txt variant="section">GeoNarrate</Txt>
          <Txt variant="caption" color={colors.textMuted}>{t("app.tagline")}</Txt>
        </View>
        <Chip label={t("settings.version", { v: version })} tone="neutral" />
      </Card>

      <SectionHeader title={t("settings.language")} />
      <Group>
        <Row
          icon="globe-outline"
          title={t("settings.uiLang")}
          value={UI_LANG_NAMES[uiLang]}
          onPress={onPickUiLang}
        />
        <Row
          icon="volume-high-outline"
          title={t("settings.narrationLang")}
          value={languageName(lang)}
          onPress={onPickNarrationLang}
        />
      </Group>

      <SectionHeader title={t("settings.savedOnDevice")} />
      <Card style={{ gap: space.sm }}>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <Txt variant="bodyStrong" style={{ flex: 1 }}>{t("settings.storage")}</Txt>
          <Txt variant="small" color={colors.textMuted}>{formatBytes(used)}</Txt>
        </View>
        <ProgressBar value={ratio} />
        <Txt variant="caption" color={colors.textMuted}>
          {t("downloads.storageValue", { used: formatBytes(used), budget: formatBytes(DEVICE_STORAGE_BUDGET_BYTES) })}
        </Txt>
      </Card>

      <SectionHeader title={t("settings.permissions")} />
      <Group>
        <Row
          icon="location-outline"
          title={t("settings.locationPermission")}
          subtitle={t("player.locationPermission")}
          onPress={() => void handleLocation()}
          right={(
            <Chip
              label={granted ? t("settings.granted") : t("settings.notGranted")}
              tone={granted ? "success" : "danger"}
            />
          )}
        />
      </Group>

      <SectionHeader title={t("settings.advanced")} />
      <Group>
        <Row
          icon="server-outline"
          title={t("settings.server")}
          subtitle={t("settings.serverHint")}
          onPress={onServer}
        />
        <Row
          icon="phone-portrait-outline"
          title={t("settings.backgroundLocation")}
          subtitle={t("settings.backgroundHint")}
        />
      </Group>

      <Txt variant="caption" color={colors.tabInactive} center style={{ marginTop: space.md }}>
        GeoNarrate · {t("settings.version", { v: version })}
      </Txt>
    </Screen>
  );
}

const styles = StyleSheet.create({
  group: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    overflow: "hidden",
  },
});
