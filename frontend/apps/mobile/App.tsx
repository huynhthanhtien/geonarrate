import { BeVietnamPro_400Regular } from "@expo-google-fonts/be-vietnam-pro/400Regular";
import { BeVietnamPro_500Medium } from "@expo-google-fonts/be-vietnam-pro/500Medium";
import { BeVietnamPro_600SemiBold } from "@expo-google-fonts/be-vietnam-pro/600SemiBold";
import { BeVietnamPro_700Bold } from "@expo-google-fonts/be-vietnam-pro/700Bold";
import { Ionicons } from "@expo/vector-icons";
import { useFonts } from "expo-font";
import * as Haptics from "expo-haptics";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, BackHandler, Pressable, StyleSheet, View } from "react-native";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import { setBackend, type PublicTour } from "./src/api";
import { I18nProvider, UI_LANGS, useI18n, type MessageKey, type UiLang } from "./src/i18n";
import { MiniPlayer } from "./src/MiniPlayer";
import { PlaybackProvider, usePlayback } from "./src/playback";
import { DownloadsScreen } from "./src/screens/DownloadsScreen";
import { HomeScreen } from "./src/screens/HomeScreen";
import { LanguagePickerScreen } from "./src/screens/LanguagePickerScreen";
import { OnboardingScreen } from "./src/screens/OnboardingScreen";
import { PlayerScreen } from "./src/screens/PlayerScreen";
import { ScanScreen } from "./src/screens/ScanScreen";
import { ServerScreen } from "./src/screens/ServerScreen";
import { SettingsScreen } from "./src/screens/SettingsScreen";
import { TicketsScreen } from "./src/screens/TicketsScreen";
import { TourScreen } from "./src/screens/TourScreen";
import { getPref, setPref, type InstalledPack } from "./src/store";
import { colors, fonts, layout, radius, shadow, space } from "./src/theme";
import { Txt, type IconName } from "./src/ui";

type Tab = "explore" | "downloads" | "tickets" | "settings";

type Route =
  | { name: "tabs" }
  | { name: "tour"; tour: PublicTour; tab: Tab }
  | { name: "player" }
  | { name: "scan"; from: "tabs" | "tour"; tab: Tab; tour?: PublicTour }
  | { name: "server"; from: "settings" | "onboarding" }
  | { name: "language"; mode: "ui" | "narration"; tab: Tab; tour?: PublicTour };

const TABS: { key: Tab; icon: IconName; active: IconName; label: MessageKey }[] = [
  { key: "explore", icon: "compass-outline", active: "compass", label: "tabs.explore" },
  { key: "downloads", icon: "arrow-down-circle-outline", active: "arrow-down-circle", label: "tabs.downloads" },
  { key: "tickets", icon: "ticket-outline", active: "ticket", label: "tabs.tickets" },
  { key: "settings", icon: "person-outline", active: "person", label: "tabs.settings" },
];

function savedUiLang(): UiLang {
  const saved = getPref("ui_lang");
  return saved && (UI_LANGS as readonly string[]).includes(saved) ? saved as UiLang : "vi";
}

export default function App() {
  const [fontsLoaded, fontError] = useFonts({
    BeVietnamPro_400Regular,
    BeVietnamPro_500Medium,
    BeVietnamPro_600SemiBold,
    BeVietnamPro_700Bold,
  });
  const [uiLang, setUiLang] = useState<UiLang>(savedUiLang);

  if (!fontsLoaded && !fontError) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.canvas, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <I18nProvider lang={uiLang}>
        <PlaybackProvider>
          <Root uiLang={uiLang} onUiLang={setUiLang} />
        </PlaybackProvider>
      </I18nProvider>
    </SafeAreaProvider>
  );
}

function Root({ uiLang, onUiLang }: { uiLang: UiLang; onUiLang: (lang: UiLang) => void }) {
  const { t } = useI18n();
  const playback = usePlayback();
  const insets = useSafeAreaInsets();
  const [lang, setLang] = useState(() => getPref("lang") ?? "vi");
  const [ready, setReady] = useState(() => Boolean(getPref("ui_lang") && getPref("lang")));
  const [tab, setTab] = useState<Tab>("explore");
  const [route, setRoute] = useState<Route>({ name: "tabs" });

  useEffect(() => {
    const saved = getPref("backend_url");
    if (saved) setBackend(saved);
  }, []);

  const changeLang = (code: string) => {
    setPref("lang", code);
    setLang(code);
  };

  const changeUiLang = (next: UiLang) => {
    setPref("ui_lang", next);
    onUiLang(next);
  };

  const goBack = useCallback(() => {
    switch (route.name) {
      case "tour":
        setTab(route.tab);
        setRoute({ name: "tabs" });
        break;
      case "scan":
        if (route.from === "tour" && route.tour) {
          setRoute({ name: "tour", tour: route.tour, tab: route.tab });
        } else {
          setTab(route.tab);
          setRoute({ name: "tabs" });
        }
        break;
      case "server":
        setTab("settings");
        setRoute({ name: "tabs" });
        break;
      case "language":
        if (route.tour) {
          setRoute({ name: "tour", tour: route.tour, tab: route.tab });
        } else {
          setTab(route.tab);
          setRoute({ name: "tabs" });
        }
        break;
      case "player":
        setRoute({ name: "tabs" });
        break;
      default:
        break;
    }
  }, [route]);

  useEffect(() => {
    if (route.name === "tabs") return undefined;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      goBack();
      return true;
    });
    return () => subscription.remove();
  }, [route.name, goBack]);

  const openPlayer = (pack: InstalledPack) => {
    playback.start(pack);
    setRoute({ name: "player" });
  };

  if (!ready) {
    if (route.name === "server") {
      return (
        <>
          <ServerScreen
            onBack={() => setRoute({ name: "tabs" })}
            onSave={() => setRoute({ name: "tabs" })}
          />
          <StatusBar style="dark" />
        </>
      );
    }
    return (
      <>
        <OnboardingScreen
          initialUiLang={uiLang}
          initialNarrationLang={lang}
          onStart={(nextUi, nextNarration) => {
            changeUiLang(nextUi);
            changeLang(nextNarration);
            setReady(true);
            setRoute({ name: "tabs" });
          }}
          onServer={() => setRoute({ name: "server", from: "onboarding" })}
        />
        <StatusBar style="dark" />
      </>
    );
  }

  if (route.name === "player") {
    return (
      <>
        <PlayerScreen onBack={() => setRoute({ name: "tabs" })} />
        <StatusBar style="dark" />
      </>
    );
  }

  if (route.name === "tour") {
    return (
      <>
        <TourScreen
          key={`${route.tour.id}-${lang}`}
          tour={route.tour}
          lang={lang}
          onBack={() => {
            setTab(route.tab);
            setRoute({ name: "tabs" });
          }}
          onScan={() => setRoute({
            name: "scan", from: "tour", tab: route.tab, tour: route.tour,
          })}
          onPlay={openPlayer}
          onChangeLang={() => setRoute({
            name: "language", mode: "narration", tab: route.tab, tour: route.tour,
          })}
        />
        <StatusBar style="dark" />
      </>
    );
  }

  if (route.name === "scan") {
    return (
      <>
        <ScanScreen
          onBack={goBack}
          onActivated={(tours) => {
            if (route.from === "tour" && route.tour) {
              const match = tours.find((tour) => tour.id === route.tour?.id)
                ?? (tours.length === 1 ? tours[0] : undefined);
              if (match) {
                setRoute({ name: "tour", tour: match, tab: route.tab });
                return;
              }
            }
            setTab("tickets");
            setRoute({ name: "tabs" });
          }}
        />
        <StatusBar style="light" />
      </>
    );
  }

  if (route.name === "server") {
    return (
      <>
        <ServerScreen
          onBack={() => {
            if (route.from === "settings") setTab("settings");
            setRoute({ name: "tabs" });
          }}
          onSave={() => {
            if (route.from === "settings") setTab("settings");
            setRoute({ name: "tabs" });
          }}
        />
        <StatusBar style="dark" />
      </>
    );
  }

  if (route.name === "language") {
    const finish = (code: string) => {
      if (route.mode === "ui") {
        if ((UI_LANGS as readonly string[]).includes(code)) changeUiLang(code as UiLang);
      } else {
        changeLang(code);
      }
      if (route.tour) setRoute({ name: "tour", tour: route.tour, tab: route.tab });
      else {
        setTab(route.tab);
        setRoute({ name: "tabs" });
      }
    };
    return (
      <>
        <LanguagePickerScreen
          mode={route.mode}
          current={route.mode === "ui" ? uiLang : lang}
          onPick={finish}
          onBack={goBack}
        />
        <StatusBar style="dark" />
      </>
    );
  }

  const padBottom = layout.tabBarHeight + insets.bottom
    + (playback.pack ? layout.miniPlayerHeight + space.sm : 0) + space.xl;

  let content;
  if (tab === "explore") {
    content = (
      <HomeScreen
        lang={lang}
        padBottom={padBottom}
        onOpen={(tour) => setRoute({ name: "tour", tour, tab: "explore" })}
        onPlay={openPlayer}
        onChangeLang={() => setRoute({ name: "language", mode: "narration", tab: "explore" })}
        onScan={() => setRoute({ name: "scan", from: "tabs", tab: "explore" })}
      />
    );
  } else if (tab === "downloads") {
    content = (
      <DownloadsScreen
        padBottom={padBottom}
        onPlay={openPlayer}
        onExplore={() => setTab("explore")}
      />
    );
  } else if (tab === "tickets") {
    content = (
      <TicketsScreen
        lang={lang}
        padBottom={padBottom}
        onScan={() => setRoute({ name: "scan", from: "tabs", tab: "tickets" })}
        onOpen={(tour) => setRoute({ name: "tour", tour, tab: "tickets" })}
      />
    );
  } else {
    content = (
      <SettingsScreen
        uiLang={uiLang}
        lang={lang}
        padBottom={padBottom}
        onPickUiLang={() => setRoute({ name: "language", mode: "ui", tab: "settings" })}
        onPickNarrationLang={() => setRoute({ name: "language", mode: "narration", tab: "settings" })}
        onServer={() => setRoute({ name: "server", from: "settings" })}
      />
    );
  }

  return (
    <>
      <View style={{ flex: 1, backgroundColor: colors.canvas }}>
        {content}
        {playback.pack ? (
          <View style={[styles.mini, { bottom: layout.tabBarHeight + insets.bottom + space.sm }]}>
            <MiniPlayer onOpen={() => setRoute({ name: "player" })} />
          </View>
        ) : null}
        <View style={[
          styles.tabBar,
          { height: layout.tabBarHeight + insets.bottom, paddingBottom: insets.bottom },
        ]}>
          {TABS.map((item) => {
            const selected = tab === item.key;
            return (
              <Pressable
                key={item.key}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                accessibilityLabel={t(item.label)}
                onPress={() => {
                  if (tab !== item.key) void Haptics.selectionAsync().catch(() => undefined);
                  setTab(item.key);
                  setRoute({ name: "tabs" });
                }}
                style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 2 }}
              >
                <Ionicons
                  name={selected ? item.active : item.icon}
                  size={23}
                  color={selected ? colors.primary : colors.tabInactive}
                />
                <Txt
                  variant="caption"
                  color={selected ? colors.primary : colors.tabInactive}
                  style={{ fontSize: 11, fontFamily: selected ? fonts.semibold : fonts.medium }}
                >
                  {t(item.label)}
                </Txt>
                <View style={{
                  width: 4,
                  height: 4,
                  borderRadius: 2,
                  backgroundColor: selected ? colors.primary : "transparent",
                }} />
              </Pressable>
            );
          })}
        </View>
      </View>
      <StatusBar style="dark" />
    </>
  );
}

const styles = StyleSheet.create({
  mini: {
    position: "absolute",
    left: space.md,
    right: space.md,
  },
  tabBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: space.xs,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    ...shadow.float,
  },
});
