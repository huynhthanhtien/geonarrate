import { DEVICE_STORAGE_BUDGET_BYTES } from "@geonarrate/core";
import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { Pressable, RefreshControl, StyleSheet, View } from "react-native";
import { deletePack, downloadPack, limitProblem } from "../download";
import { formatBytes } from "../format";
import { useI18n } from "../i18n";
import { languageName } from "../languages";
import { installedPacks, syncEvents, type InstalledPack } from "../store";
import { colors, radius, space } from "../theme";
import { changedPacks, latestManifest } from "../updates";
import {
  Button, Card, Chip, Cover, EmptyState, IconButton, ProgressBar, Screen, Sheet, Txt,
} from "../ui";

export function DownloadsScreen({ onPlay, onExplore, padBottom }: {
  onPlay: (pack: InstalledPack) => void;
  onExplore: () => void;
  padBottom: number;
}) {
  const { t } = useI18n();
  const [packs, setPacks] = useState<InstalledPack[]>(installedPacks);
  const [updates, setUpdates] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<InstalledPack | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [updatingTotal, setUpdatingTotal] = useState(0);
  const [updateProgress, setUpdateProgress] = useState(0);

  const checkUpdates = async () => {
    try {
      setUpdates(await changedPacks());
    } catch {
      // Ngoại tuyến: giữ trạng thái cập nhật đã biết.
    }
  };

  useEffect(() => {
    setPacks(installedPacks());
    syncEvents().catch(() => undefined);
    void checkUpdates();
  }, []);

  const refresh = async () => {
    setRefreshing(true);
    setPacks(installedPacks());
    await checkUpdates();
    setRefreshing(false);
  };

  const runUpdate = async (pack: InstalledPack) => {
    if (updatingId) return;
    setError(null);
    setUpdatingId(pack.manifest.pack_id);
    setUpdateProgress(0);
    try {
      const published = await latestManifest(pack);
      if (published.files.length === 0) {
        setError(t("tour.noLang"));
        return;
      }
      const problem = limitProblem(published);
      if (problem) {
        setError(problem);
        return;
      }
      setUpdatingTotal(published.files.length);
      await downloadPack(published, pack.tourName, setUpdateProgress);
      setPacks(installedPacks());
      setUpdates((previous) => {
        const next = new Set(previous);
        next.delete(pack.manifest.pack_id);
        return next;
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("common.error"));
    } finally {
      setUpdatingId(null);
      setUpdateProgress(0);
      setUpdatingTotal(0);
    }
  };

  const remove = (pack: InstalledPack) => {
    deletePack(pack.tourId, pack.lang);
    setPacks(installedPacks());
    setConfirmDelete(null);
  };

  const used = packs.reduce((sum, pack) => sum + pack.bytes, 0);

  return (
    <>
      <Screen
        padBottom={padBottom}
        refreshControl={(
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void refresh()}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        )}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
          <View style={{ flex: 1 }}>
            <Txt variant="display">{t("downloads.title")}</Txt>
            <Txt variant="small" color={colors.textMuted}>
              {t("downloads.subtitle", { size: formatBytes(used) })}
            </Txt>
          </View>
          <IconButton
            name="refresh"
            onPress={() => void refresh()}
            accessibilityLabel={t("downloads.checking")}
            variant="surface"
          />
        </View>

        <Card style={{ gap: space.sm }}>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <Txt variant="bodyStrong" style={{ flex: 1 }}>{t("downloads.storage")}</Txt>
            <Txt variant="small" color={colors.textMuted}>
              {t("downloads.storageValue", {
                used: formatBytes(used),
                budget: formatBytes(DEVICE_STORAGE_BUDGET_BYTES),
              })}
            </Txt>
          </View>
          <ProgressBar value={used / DEVICE_STORAGE_BUDGET_BYTES} />
        </Card>

        {error ? (
          <View style={styles.errorBox}>
            <Ionicons name="alert-circle" size={18} color={colors.danger} />
            <Txt variant="small" color={colors.danger} style={{ flex: 1 }} accessibilityRole="alert">{error}</Txt>
          </View>
        ) : null}

        {packs.length === 0 ? (
          <EmptyState
            icon="cloud-download-outline"
            title={t("downloads.empty")}
            body={t("downloads.emptyHint")}
            actionLabel={t("tabs.explore")}
            onAction={onExplore}
          />
        ) : (
          <View style={{ gap: space.md }}>
            {packs.map((pack) => {
              const updating = updatingId === pack.manifest.pack_id;
              const hasUpdate = updates.has(pack.manifest.pack_id);
              return (
                <Card key={`${pack.tourId}-${pack.lang}`} style={{ gap: space.sm }}>
                  <Pressable
                    onPress={() => onPlay(pack)}
                    accessibilityRole="button"
                    accessibilityLabel={pack.tourName}
                    style={({ pressed }) => [styles.header, pressed && { opacity: 0.9 }]}
                  >
                    <Cover
                      seed={pack.tourId}
                      name={pack.tourName}
                      height={58}
                      width={58}
                      rounded={radius.md}
                    />
                    <View style={{ flex: 1, gap: 3 }}>
                      <Txt variant="bodyStrong" numberOfLines={1}>{pack.tourName}</Txt>
                      <Txt variant="caption" color={colors.textMuted}>
                        {t("downloads.package", {
                          lang: languageName(pack.lang),
                          points: t("downloads.points", { n: pack.manifest.files.length }),
                          size: formatBytes(pack.bytes),
                        })}
                      </Txt>
                      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                        {hasUpdate ? (
                          <Chip label={t("downloads.newVersion")} tone="warning" icon="arrow-up-circle" />
                        ) : null}
                      </View>
                    </View>
                    <IconButton
                      name="play"
                      onPress={() => onPlay(pack)}
                      accessibilityLabel={t("downloads.play")}
                      variant="primary"
                      size={40}
                      iconSize={19}
                    />
                  </Pressable>

                  {updating ? (
                    <View style={{ gap: 4 }}>
                      <ProgressBar value={updatingTotal > 0 ? updateProgress / updatingTotal : 0} height={4} />
                      <Txt variant="caption" color={colors.textMuted}>
                        {t("downloads.updating", { done: updateProgress, total: updatingTotal })}
                      </Txt>
                    </View>
                  ) : (
                    <View style={{ flexDirection: "row", gap: space.sm }}>
                      {hasUpdate ? (
                        <Button
                          kind="secondary"
                          size="sm"
                          icon="cloud-download-outline"
                          label={t("downloads.update")}
                          onPress={() => void runUpdate(pack)}
                          disabled={Boolean(updatingId)}
                          style={{ flex: 1 }}
                        />
                      ) : null}
                      <Button
                        kind="ghost"
                        size="sm"
                        icon="trash-outline"
                        label={t("downloads.delete")}
                        onPress={() => setConfirmDelete(pack)}
                        disabled={Boolean(updatingId)}
                        style={{ flex: 1 }}
                      />
                    </View>
                  )}
                </Card>
              );
            })}
          </View>
        )}
      </Screen>

      <Sheet
        visible={Boolean(confirmDelete)}
        onClose={() => setConfirmDelete(null)}
        title={t("downloads.deleteTitle")}
        closeLabel={t("common.close")}
      >
        <Txt variant="small" color={colors.textMuted}>
          {t("downloads.deleteBody", { name: confirmDelete?.tourName ?? "" })}
        </Txt>
        <View style={{ flexDirection: "row", gap: space.sm }}>
          <Button kind="ghost" label={t("common.cancel")} onPress={() => setConfirmDelete(null)} style={{ flex: 1 }} />
          <Button
            kind="danger"
            icon="trash-outline"
            label={t("common.delete")}
            onPress={() => confirmDelete && remove(confirmDelete)}
            style={{ flex: 1 }}
          />
        </View>
      </Sheet>
    </>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
  },
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: colors.dangerSoft,
  },
});
