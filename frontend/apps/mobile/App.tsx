import { StatusBar } from "expo-status-bar";
import { useState } from "react";
import type { PublicTour } from "./src/api";
import { LanguageScreen, PlayerScreen, ScanScreen, ToursScreen, TourScreen } from "./src/screens";
import { getPref, type InstalledPack } from "./src/store";

type Route =
  | { name: "language" }
  | { name: "tours" }
  | { name: "tour"; tour: PublicTour }
  | { name: "scan"; tour: PublicTour }
  | { name: "player"; pack: InstalledPack };

export default function App() {
  const [lang, setLang] = useState(getPref("lang"));
  const [route, setRoute] = useState<Route>(lang ? { name: "tours" } : { name: "language" });
  const toTours = () => setRoute({ name: "tours" });
  const play = (pack: InstalledPack) => setRoute({ name: "player", pack });

  let screen = null;
  if (route.name === "language" || !lang) {
    screen = <LanguageScreen onDone={(code) => { setLang(code); toTours(); }} />;
  } else if (route.name === "tours") {
    screen = (
      <ToursScreen
        lang={lang}
        onOpen={(tour) => setRoute({ name: "tour", tour })}
        onPlay={play}
        onChangeLang={() => setRoute({ name: "language" })}
      />
    );
  } else if (route.name === "tour") {
    const { tour } = route;
    screen = (
      <TourScreen
        key={`${tour.id}-${lang}`}
        tour={tour}
        lang={lang}
        onBack={toTours}
        onScan={() => setRoute({ name: "scan", tour })}
        onPlay={play}
      />
    );
  } else if (route.name === "scan") {
    const { tour } = route;
    const back = () => setRoute({ name: "tour", tour });
    screen = <ScanScreen onBack={back} onActivated={back} />;
  } else {
    screen = <PlayerScreen pack={route.pack} onBack={toTours} />;
  }
  return (
    <>
      {screen}
      <StatusBar style="auto" />
    </>
  );
}
