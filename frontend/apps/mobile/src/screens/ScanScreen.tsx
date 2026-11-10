import { Ionicons } from "@expo/vector-icons";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useRef, useState } from "react";
import {
  ActivityIndicator, Linking, Pressable, StyleSheet, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { activateTicket, ApiError, getTours, type PublicTour } from "../api";
import { useI18n } from "../i18n";
import { withDevice } from "../store";
import { saveTicket } from "../tickets";
import { colors, layout, radius, space } from "../theme";
import { Button, IconButton, TextField, Txt } from "../ui";

export function ScanScreen({ onBack, onActivated }: {
  onBack: () => void;
  onActivated: (tours: PublicTour[]) => void;
}) {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [torch, setTorch] = useState(false);
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
        saveTicket(ticket, tour_ids);
      }
      const { tourIds } = activated.current;
      const tours = (await getTours()).filter((tour) => tourIds.includes(tour.id));
      if (tours.length === 0) {
        setError(t("tickets.noTours"));
        return;
      }
      onActivated(tours);
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : t("tickets.error"));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: "#0C0A09" }}>
      <View style={{
        paddingTop: insets.top + space.sm,
        paddingHorizontal: layout.gutter,
        paddingBottom: space.sm,
        flexDirection: "row",
        alignItems: "center",
        gap: space.sm,
      }}>
        <IconButton
          name="close"
          onPress={onBack}
          accessibilityLabel={t("tickets.closeCamera")}
          variant="dark"
          disabled={busy}
        />
        <View style={{ flex: 1, alignItems: "center" }}>
          <Txt variant="bodyStrong" color={colors.white}>{t("tickets.scanTitle")}</Txt>
          <Txt variant="caption" color="rgba(255,255,255,0.6)">{t("tickets.frameHint")}</Txt>
        </View>
        <IconButton
          name={torch ? "flash" : "flash-off"}
          onPress={() => setTorch((value) => !value)}
          accessibilityLabel={t("tickets.torch")}
          variant="dark"
          disabled={!permission?.granted}
          style={torch && permission?.granted ? { backgroundColor: "rgba(255,255,255,0.32)" } : undefined}
        />
      </View>

      <View style={styles.cameraBox}>
        {permission?.granted ? (
          <>
            <CameraView
              style={StyleSheet.absoluteFill}
              enableTorch={torch}
              barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
              onBarcodeScanned={busy ? undefined : ({ data }) => void submit(data, true)}
            />
            <View style={styles.frameOverlay} pointerEvents="none">
              <View style={styles.frameSquare}>
                <View style={[styles.corner, styles.tl]} />
                <View style={[styles.corner, styles.tr]} />
                <View style={[styles.corner, styles.bl]} />
                <View style={[styles.corner, styles.br]} />
                <View style={styles.frameHint}>
                  <Txt variant="caption" color={colors.white}>{t("tickets.frameHint")}</Txt>
                </View>
              </View>
            </View>
          </>
        ) : (
          <View style={styles.permission}>
            {permission === null ? (
              <ActivityIndicator color={colors.white} />
            ) : (
              <>
                <Ionicons name="camera-outline" size={44} color="rgba(255,255,255,0.55)" />
                <Txt variant="body" color={colors.white} center>{t("tickets.permission")}</Txt>
                <Button
                  kind="inverse"
                  icon="camera-outline"
                  label={t("tickets.grantCamera")}
                  onPress={() => void requestPermission()}
                />
                {!permission.canAskAgain ? (
                  <Pressable onPress={() => void Linking.openSettings().catch(() => undefined)} accessibilityRole="button">
                    <Txt variant="label" color={colors.primarySoft}>{t("settings.openSettings")}</Txt>
                  </Pressable>
                ) : null}
              </>
            )}
          </View>
        )}

        {busy ? (
          <View style={styles.busy}>
            <ActivityIndicator color={colors.white} />
            <Txt variant="caption" color={colors.white}>{t("tickets.activating")}</Txt>
          </View>
        ) : null}
      </View>

      <View style={{
        paddingHorizontal: layout.gutter,
        paddingTop: space.lg,
        paddingBottom: insets.bottom + space.lg,
        backgroundColor: "#161311",
        borderTopLeftRadius: radius.xl,
        borderTopRightRadius: radius.xl,
        gap: space.sm,
      }}>
        {error ? (
          <Txt variant="small" color="#FCA5A5" accessibilityRole="alert">{error}</Txt>
        ) : null}
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.xs }}>
          <Ionicons name="keypad-outline" size={16} color="rgba(255,255,255,0.65)" />
          <Txt variant="caption" color="rgba(255,255,255,0.65)">{t("tickets.manualHint")}</Txt>
        </View>
        <TextField
          label={t("tickets.enterCode")}
          value={code}
          onChangeText={setCode}
          autoCapitalize="characters"
          autoCorrect={false}
          placeholder={t("tickets.enterCode")}
          accessibilityLabel={t("tickets.enterCode")}
          placeholderTextColor="rgba(255,255,255,0.35)"
          style={{
            backgroundColor: "#221E1B",
            borderColor: "#3A342F",
            color: colors.white,
          }}
        />
        <Button
          icon="checkmark-circle-outline"
          label={busy ? t("tickets.activating") : t("tickets.activate")}
          onPress={() => void submit(code)}
          disabled={busy || !code.trim()}
          loading={busy}
        />
        <Txt variant="caption" color="rgba(255,255,255,0.42)" center>{t("tickets.deviceNote")}</Txt>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  cameraBox: {
    flex: 1,
    marginHorizontal: layout.gutter,
    borderRadius: radius.xl,
    overflow: "hidden",
    backgroundColor: "#18181B",
  },
  permission: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: space.xl,
    gap: space.md,
  },
  frameOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  frameSquare: {
    width: 232,
    height: 232,
  },
  corner: {
    position: "absolute",
    width: 30,
    height: 30,
    borderColor: "rgba(255,255,255,0.92)",
  },
  tl: { top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3, borderTopLeftRadius: 14 },
  tr: { top: 0, right: 0, borderTopWidth: 3, borderRightWidth: 3, borderTopRightRadius: 14 },
  bl: { bottom: 0, left: 0, borderBottomWidth: 3, borderLeftWidth: 3, borderBottomLeftRadius: 14 },
  br: { bottom: 0, right: 0, borderBottomWidth: 3, borderRightWidth: 3, borderBottomRightRadius: 14 },
  frameHint: {
    position: "absolute",
    bottom: -42,
    alignSelf: "center",
    paddingHorizontal: space.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  busy: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
    gap: space.sm,
  },
});
