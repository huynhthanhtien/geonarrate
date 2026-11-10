import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import { getTours, type PublicTour } from "../api";
import { useI18n } from "../i18n";
import { savedTickets } from "../tickets";
import { colors, radius, space } from "../theme";
import { Button, Card, EmptyState, Screen, SectionHeader, Spinner, Txt } from "../ui";
import { TourCard } from "./TourCard";

export function TicketsScreen({ lang, onScan, onOpen, padBottom }: {
  lang: string;
  onScan: () => void;
  onOpen: (tour: PublicTour) => void;
  padBottom: number;
}) {
  const { t } = useI18n();
  const [tickets] = useState(savedTickets);
  const [tours, setTours] = useState<PublicTour[] | null>(null);
  const [offline, setOffline] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let active = true;
    setOffline(false);
    getTours()
      .then((catalog) => {
        if (active) setTours(catalog);
      })
      .catch(() => {
        if (active) setOffline(true);
      });
    return () => {
      active = false;
    };
  }, [reload]);

  const ticketIds = useMemo(
    () => new Set(tickets.flatMap((ticket) => ticket.tourIds)),
    [tickets],
  );
  const ticketTours = useMemo(
    () => (tours ?? []).filter((tour) => ticketIds.has(tour.id)),
    [tours, ticketIds],
  );

  return (
    <Screen padBottom={padBottom}>
      <View style={{ flexDirection: "row", alignItems: "flex-end" }}>
        <Txt variant="display" style={{ flex: 1 }}>{t("tickets.title")}</Txt>
        <Txt variant="caption" color={colors.textMuted}>{t("tickets.deviceNote")}</Txt>
      </View>

      <LinearGradient
        colors={[colors.primary, colors.primaryDark]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ borderRadius: radius.xl, padding: space.lg, gap: space.sm }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
          <View style={{
            width: 44, height: 44, borderRadius: 14,
            backgroundColor: "rgba(255,255,255,0.16)",
            alignItems: "center", justifyContent: "center",
          }}>
            <Ionicons name="qr-code-outline" size={24} color={colors.primaryFg} />
          </View>
          <View style={{ flex: 1 }}>
            <Txt variant="section" color={colors.primaryFg}>{t("tickets.scanTitle")}</Txt>
            <Txt variant="caption" color="rgba(255,255,255,0.82)">{t("tickets.scanHint")}</Txt>
          </View>
        </View>
        <Button
          kind="inverse"
          icon="camera-outline"
          label={t("tickets.scanCta")}
          onPress={onScan}
          style={{ marginTop: space.xs }}
        />
      </LinearGradient>

      {offline ? (
        <Card tone="accent" style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
          <Ionicons name="cloud-offline-outline" size={20} color={colors.accent} />
          <Txt variant="small" color={colors.accent} style={{ flex: 1 }}>{t("common.network")}</Txt>
          <Pressable onPress={() => setReload((value) => value + 1)} accessibilityRole="button" hitSlop={8}>
            <Txt variant="label" color={colors.accent}>{t("home.retry")}</Txt>
          </Pressable>
        </Card>
      ) : null}

      <View style={{ gap: space.sm }}>
        <SectionHeader title={t("tickets.myTours")} />
        {tickets.length === 0 ? (
          <EmptyState
            icon="ticket-outline"
            title={t("tickets.none")}
            body={t("tickets.noneHint")}
            actionLabel={t("tickets.scanCta")}
            onAction={onScan}
          />
        ) : tours === null && !offline ? (
          <Spinner label={t("common.loading")} />
        ) : ticketTours.length === 0 ? (
          <EmptyState
            icon="ticket-outline"
            title={t("tickets.noTours")}
            body={offline ? t("common.network") : undefined}
            actionLabel={offline ? t("home.retry") : undefined}
            onAction={offline ? () => setReload((value) => value + 1) : undefined}
          />
        ) : (
          <View style={{ gap: space.md }}>
            {ticketTours.map((tour) => (
              <TourCard key={tour.id} tour={tour} lang={lang} onPress={() => onOpen(tour)} />
            ))}
          </View>
        )}
      </View>

      <Txt variant="caption" color={colors.tabInactive} center style={{ marginTop: space.sm }}>
        {t("tickets.deviceNote")}
      </Txt>
    </Screen>
  );
}
