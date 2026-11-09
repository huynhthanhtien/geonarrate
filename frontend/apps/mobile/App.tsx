import { StatusBar } from "expo-status-bar";
import { useState } from "react";
import { setBackend, type PublicTour } from "./src/api";
import { LanguageScreen, PlayerScreen, ScanScreen, ServerScreen, TicketToursScreen, ToursScreen, TourScreen } from "./src/screens";
import { getPref, setPref, type InstalledPack } from "./src/store";

type Route =
  | { name: "language" }
  | { name: "server" }
  | { name: "tours" }
  | { name: "tour"; tour: PublicTour }
  | { name: "scan"; tour?: PublicTour }
  | { name: "ticketTours"; tours: PublicTour[] }
  | { name: "player"; pack: InstalledPack };

export default function App() {
  const [lang, setLang] = useState(() => {
    const saved = getPref("backend_url");
    if (saved) setBackend(saved);
    return getPref("lang");
  });
  const [route, setRoute] = useState<Route>(lang ? { name: "tours" } : { name: "language" });
  const toTours = () => setRoute({ name: "tours" });
  const play = (pack: InstalledPack) => setRoute({ name: "player", pack });

  const showServer = () => setRoute({ name: "server" });
  const exitServer = () => setRoute(lang ? { name: "tours" } : { name: "language" });

  let screen = null;
  if (route.name === "server") {
    screen = <ServerScreen onBack={exitServer} onSave={(url) => {
      setPref("backend_url", url);
      setBackend(url);
      exitServer();
    }} />;
  } else if (route.name === "language" || !lang) {
    screen = (
      <LanguageScreen
        onBack={lang ? toTours : undefined}
        onServer={showServer}
        onDone={(code) => { setLang(code); toTours(); }}
      />
    );
  } else if (route.name === "tours") {
    screen = (
      <ToursScreen
        lang={lang}
        onOpen={(tour) => setRoute({ name: "tour", tour })}
        onPlay={play}
        onChangeLang={() => setRoute({ name: "language" })}
        onServer={showServer}
        onScan={() => setRoute({ name: "scan" })}
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
    screen = <ScanScreen
      onBack={() => tour ? setRoute({ name: "tour", tour }) : toTours()}
      onActivated={(tours) => {
        const match = tours.find((item) => item.id === tour?.id) ?? (tours.length === 1 ? tours[0] : undefined);
        if (match) setRoute({ name: "tour", tour: match });
        else setRoute({ name: "ticketTours", tours });
      }}
    />;
  } else if (route.name === "ticketTours") {
    screen = <TicketToursScreen
      tours={route.tours}
      onBack={toTours}
      onOpen={(tour) => setRoute({ name: "tour", tour })}
    />;
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
