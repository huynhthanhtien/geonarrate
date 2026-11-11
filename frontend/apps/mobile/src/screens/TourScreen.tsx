import { Ionicons } from "@expo/vector-icons";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { ApiError, getManifest, packBytes, packSteps, type Manifest, type PublicTour } from "../api";
import { deletePack, downloadPack, limitProblem } from "../download";
import { formatBytes, formatClock, minutesLabel } from "../format";
import { useI18n } from "../i18n";
import { languageName } from "../languages";
import { installedPacks, withDevice, type InstalledPack } from "../store";
import { colors, radius, space } from "../theme";
import {
  Button, Card, Chip, Cover, IconButton, ProgressBar, Screen, SectionHeader, Sheet, Spinner, Txt,
} from "../ui";
import { TourMap } from "../TourMap";

export function TourScreen({ tour, lang, onBack, onScan, onPlay, onChangeLang }: {
  tour: PublicTour;
  lang: string;
  onBack: () => void;
  onScan: () => void;
  onPlay: (pack: InstalledPack) => void;
  onChangeLang: () => void;
}) {
  const { t } = useI18n();
  const available = tour.langs.includes(lang);
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [needTicket, setNeedTicket] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [loading, setLoading] = useState(available);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [tick, setTick] = useState(0);

  const installed = useMemo(
    () => installedPacks().find((pack) => pack.tourId === tour.id && pack.lang === lang),
    [tour.id, lang, tick],
  );
  const content = manifest ?? installed?.manifest ?? null;
  const updateAvailable = Boolean(installed && manifest
    && (installed.manifest.pack_id !== manifest.pack_id
      || installed.manifest.files.length !== manifest.files.length));
  const totalBytes = content ? packBytes(content) : 0;
  const totalMs = content?.files.reduce((sum, file) => sum + file.duration_ms, 0) ?? 0;

  const describe = (reason: unknown) =>
    reason instanceof ApiError ? reason.message : t("common.network");

  useEffect(() => {
    let active = true;
    setManifest(null);
    setNeedTicket(false);
    setError(null);
    setLoading(available);
    if (!available) return () => { active = false; };
    withDevice((device, server) => getManifest(tour.id, lang, device, server))
      .then((value) => {
        if (active) setManifest(value);
      })
      .catch((reason: unknown) => {
        if (!active) return;
        if (reason instanceof ApiError && reason.code === "ticket_required") setNeedTicket(true);
        else setError(describe(reason));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
    // describe phụ thuộc ngôn ngữ giao diện; đổi ngôn ngữ không cần tải lại tour.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tour.id, lang, available]);

  const runDownload = async (value: Manifest) => {
    if (value.files.length === 0) {
      setError(t("tour.noLang"));
      return;
    }
    const problem = limitProblem(value);
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    setProgress(0);
    try {
      await downloadPack(value, tour.name, setProgress);
      const saved = installedPacks().find((pack) => pack.tourId === value.tour_id && pack.lang === value.lang);
      if (saved) {
        setTick((valueTick) => valueTick + 1);
        onPlay(saved);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("common.error"));
    } finally {
      setProgress(null);
    }
  };

  const remove = () => {
    deletePack(tour.id, lang);
    setConfirmDelete(false);
    setTick((value) => value + 1);
  };

  let footer: ReactNode = null;
  if (available && (installed || content)) {
    if (progress !== null) {
      footer = (
        <View style={{ gap: space.sm }}>
          <ProgressBar value={content ? progress / Math.max(1, packSteps(content)) : 0} />
          <Button
            label={t("tour.downloading", { done: progress, total: content ? packSteps(content) : 0 })}
            onPress={() => undefined}
            loading
            disabled
          />
        </View>
      );
    } else if (installed && !updateAvailable) {
      footer = <Button label={t("tour.start")} icon="play" onPress={() => onPlay(installed)} />;
    } else if (installed && updateAvailable) {
      footer = (
        <View style={{ flexDirection: "row", gap: space.sm }}>
          <Button kind="secondary" label={t("tour.start")} onPress={() => onPlay(installed)} style={{ flex: 1 }} />
          <Button
            label={t("tour.update")}
            icon="arrow-down-circle-outline"
            onPress={() => manifest && void runDownload(manifest)}
            style={{ flex: 1 }}
          />
        </View>
      );
    } else if (content) {
      footer = (
        <Button
          label={t("tour.download")}
          icon="download-outline"
          onPress={() => void runDownload(content)}
        />
      );
    }
  }

  return (
    <>
      <Screen footer={footer}>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <IconButton
            name="chevron-back"
            onPress={onBack}
            accessibilityLabel={t("common.back")}
            variant="surface"
          />
          <View style={{ flex: 1 }} />
          <IconButton
            name="qr-code-outline"
            onPress={onScan}
            accessibilityLabel={t("home.scan")}
            variant="surface"
          />
        </View>

        <Cover seed={tour.id} name={tour.name} height={208} rounded={radius.xl} style={{ width: "100%" }} showInitials={false}>
          <View style={{ position: "absolute", left: space.lg, right: space.lg, bottom: space.lg, gap: 4 }}>
            <Txt variant="title" color={colors.white} numberOfLines={2}>{tour.name}</Txt>
            <Txt variant="caption" color="rgba(255,255,255,0.85)">
              {t("common.points", { n: tour.poi_count })}
              {content ? ` · ${t("common.minutes", { n: minutesLabel(totalMs) })} · ${formatBytes(totalBytes)}` : ""}
            </Txt>
          </View>
        </Cover>

        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
          <Chip
            label={tour.access === "paid" ? t("home.paid") : t("home.free")}
            tone={tour.access === "paid" ? "accent" : "success"}
            icon={tour.access === "paid" ? "ticket-outline" : "sparkles-outline"}
          />
          <Chip label={languageName(lang)} tone="neutral" icon="language" />
          {installed ? <Chip label={t("tour.installed")} tone="primary" icon="checkmark-circle" /> : null}
          {updateAvailable ? <Chip label={t("home.update")} tone="warning" icon="arrow-up-circle" /> : null}
        </View>

        {!available ? (
          <Card tone="muted" style={{ gap: space.sm }}>
            <Txt variant="small">{t("tour.noLang")}</Txt>
            <Txt variant="caption" color={colors.textMuted}>
              {t("tour.availableIn", { langs: tour.langs.map((code) => languageName(code)).join(", ") })}
            </Txt>
            <Button kind="secondary" size="sm" label={t("tour.changeLang")} onPress={onChangeLang} />
          </Card>
        ) : null}

        {error ? (
          <View style={styles.errorBox}>
            <Ionicons name="alert-circle" size={18} color={colors.danger} />
            <Txt variant="small" color={colors.danger} style={{ flex: 1 }} accessibilityRole="alert">{error}</Txt>
          </View>
        ) : null}

        {loading && !content ? <Spinner label={t("tour.loading")} /> : null}

        {needTicket ? (
          <Card tone="accent" style={{ gap: space.sm }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
              <Ionicons name="ticket" size={20} color={colors.accent} />
              <Txt variant="section" color={colors.accent} style={{ flex: 1 }}>{t("tour.ticketRequired")}</Txt>
            </View>
            <Txt variant="small" color={colors.text}>{t("tour.ticketHint")}</Txt>
            <Button label={t("tour.scanTicket")} icon="qr-code-outline" onPress={onScan} />
          </Card>
        ) : null}

        {updateAvailable && manifest ? (
          <Card tone="primary" style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
            <Ionicons name="arrow-up-circle" size={20} color={colors.primary} />
            <Txt variant="small" color={colors.primaryDark} style={{ flex: 1 }}>
              {t("tour.updateAvailable", { version: manifest.version })}
            </Txt>
          </Card>
        ) : null}

        {content ? (
          <>
            <View style={{ gap: space.sm }}>
              <SectionHeader title={t("tour.map")} />
              <TourMap files={content.files} />
            </View>

            <View style={{ gap: space.sm }}>
              <SectionHeader title={`${t("tour.stops")} · ${content.files.length}`} />
              {content.files.map((file, index) => (
                <View key={file.poi_id} style={styles.stop}>
                  <View style={styles.stopNumber}>
                    <Txt variant="label" color={colors.primaryFg}>{index + 1}</Txt>
                  </View>
                  <View style={{ flex: 1, gap: 3 }}>
                    <Txt variant="bodyStrong">{file.name}</Txt>
                    {file.summary ? (
                      <Txt variant="small" color={colors.textMuted} numberOfLines={3}>{file.summary}</Txt>
                    ) : null}
                    <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
                      <Txt variant="caption" color={colors.textMuted}>{formatClock(file.duration_ms / 1000)}</Txt>
                    </View>
                  </View>
                </View>
              ))}
            </View>
          </>
        ) : null}

        {installed ? (
          <Button
            kind="danger"
            label={t("tour.deletePack")}
            icon="trash-outline"
            onPress={() => setConfirmDelete(true)}
          />
        ) : null}
      </Screen>

      <Sheet
        visible={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title={t("tour.deleteConfirm")}
        closeLabel={t("common.close")}
      >
        <Txt variant="small" color={colors.textMuted}>{t("tour.deleteConfirmBody")}</Txt>
        <View style={{ flexDirection: "row", gap: space.sm }}>
          <Button kind="ghost" label={t("common.cancel")} onPress={() => setConfirmDelete(false)} style={{ flex: 1 }} />
          <Button kind="danger" label={t("common.delete")} icon="trash-outline" onPress={remove} style={{ flex: 1 }} />
        </View>
      </Sheet>
    </>
  );
}

const styles = StyleSheet.create({
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
    gap: space.md,
    padding: space.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  stopNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
});
