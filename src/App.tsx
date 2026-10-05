import { useCallback, useEffect, useState } from "react";
import { Home } from "./views/Home";
import { NewTrial } from "./views/NewTrial";
import { TrialView } from "./views/TrialView";
import { Study } from "./views/Study";
import { Routine } from "./views/Routine";
import { getTrial, listTrials, saveTrial } from "./store";
import { demoTrial } from "./demo";
import type { Trial } from "./types";

// Hash routes keep the app a single static page: #/, #/new, #/trial/<id>, #/demo, #/study.
function useRoute(): [string, (to: string) => void] {
  const [route, setRoute] = useState(() => location.hash.slice(1) || "/");
  useEffect(() => {
    const on = () => {
      setRoute(location.hash.slice(1) || "/");
      window.scrollTo(0, 0);
    };
    addEventListener("hashchange", on);
    return () => removeEventListener("hashchange", on);
  }, []);
  return [route, (to: string) => { location.hash = to; }];
}

export function App() {
  const [route, go] = useRoute();
  const [trials, setTrials] = useState<Trial[]>([]);
  const [current, setCurrent] = useState<Trial | null>(null);
  const refresh = useCallback(() => listTrials().then(setTrials).catch(() => setTrials([])), []);
  useEffect(() => { refresh(); }, [refresh, route]);

  const id = route.startsWith("/trial/") ? route.slice(7) : null;
  useEffect(() => {
    if (!id) return setCurrent(null);
    getTrial(id).then((t) => setCurrent(t ?? null));
  }, [id]);

  const update = useCallback(async (t: Trial) => {
    if (!t.demo) await saveTrial(t);
    setCurrent(t);
  }, []);

  let view;
  if (route === "/new") view = <NewTrial onCreated={(t) => go(`/trial/${t.id}`)} />;
  // Keyed by trial, so leaving a trial mid-capture never carries its camera or retake prompt into another.
  else if (route === "/demo") view = <TrialView key="demo" trial={demoTrial()} onChange={async () => {}} readOnly />;
  else if (route === "/study") view = <Study />;
  else if (route === "/routine") view = <Routine />;
  else if (id) view = current ? <TrialView key={current.id} trial={current} onChange={update} /> : <p className="muted" role="status">Loading the trial…</p>;
  else view = <Home trials={trials} />;

  return (
    <>
      <a className="skip" href="#main">Skip to content</a>
      <header className="top">
        <a href="#/" className="brand" aria-label="Trial of One, home">
          <span className="logo" aria-hidden="true">1</span> Trial of One
        </a>
        <nav aria-label="Main">
          <a href="#/routine">Several products?</a>
          <a href="#/demo">Example trial</a>
          <a href="#/study">Why photos lie</a>
        </nav>
      </header>
      <main id="main" tabIndex={-1}>{view}</main>
      <footer className="foot">
        <p>Scores come from YouCam AI Skin Analysis. Photos are sent for analysis and not stored by this app; your trial stays in this browser.</p>
        <p>Not medical advice. For a rash, pain or anything that worries you, see a dermatologist or pharmacist.</p>
      </footer>
    </>
  );
}
