import { useMemo, useState } from "react";
import { CONCERN_BY_ID, type Tier } from "../../shared/concerns";
import { startPlan } from "../../shared/plan";
import { note } from "../api";
import { ConcernChart } from "../Chart";
import { deleteTrial } from "../store";
import { assess, noteRequest, priorFor, SIDE_EFFECT_BAR, sideEffects, usable } from "../trialMath";
import type { StoredScan, Trial } from "../types";
import { concernVerdictText, VerdictBadge } from "../Verdict";
import { Capture } from "./Capture";

const CHANGES = ["started another product", "stopped a product", "was ill", "got sunburnt", "travelled / climate change", "period this week", "slept badly / stressed"];

interface Props { trial: Trial; onChange: (t: Trial) => Promise<void>; readOnly?: boolean }

export function TrialView({ trial, onChange, readOnly }: Props) {
  const [capturing, setCapturing] = useState(false);
  const [writing, setWriting] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const a = useMemo(() => assess(trial), [trial]);
  const side = useMemo(() => sideEffects(trial), [trial]);
  const p = trial.plan;
  const baselineSessions = new Set(trial.scans.filter((s) => s.phase === "baseline" && !s.flagged).map((s) => s.sessionId)).size;
  const phase: StoredScan["phase"] = p.startedAt ? "trial" : "baseline";
  const lastNote = trial.notes[trial.notes.length - 1];
  const scans = usable(trial);

  async function finished(scansTaken: StoredScan[], reference?: StoredScan["quality"], tier?: Tier) {
    setCapturing(false);
    const plan = trial.scans.length === 0 && tier ? { ...trial.plan, tier } : trial.plan;
    let next: Trial = { ...trial, plan, scans: [...trial.scans, ...scansTaken], reference: trial.reference ?? reference };
    await onChange(next);
    if (phase === "trial") {
      setWriting(true);
      try {
        const n = await note(noteRequest(next, assess(next)));
        next = { ...next, notes: [...next.notes, { at: new Date().toISOString(), ...n }] };
        await onChange(next);
      } catch {
        // The charts and verdicts above already say what the note would.
      } finally {
        setWriting(false);
      }
    }
  }

  async function start() {
    await onChange({ ...trial, plan: startPlan(p, new Date()) });
  }

  async function logChange(what: string) {
    await onChange({ ...trial, changes: [...trial.changes, { at: new Date().toISOString(), what }] });
  }

  async function remove() {
    if (!confirm(`Delete the trial of ${p.product}? This cannot be undone.`)) return;
    await deleteTrial(trial.id);
    location.hash = "/";
  }

  function exportJson() {
    const blob = new Blob([JSON.stringify({ ...trial, scans: trial.scans.map(({ thumb: _t, ...s }) => s) }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `trial-${p.product.replace(/\W+/g, "-").toLowerCase()}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  const others = p.tracked.filter((c) => !p.targets.includes(c));

  return (
    <div className="trial">
      {trial.demo && (
        <p className="demo-banner" role="note">
          Example trial with a synthetic face: the photos were generated, and the weekly changes were simulated by
          editing them. The scores are real YouCam analyses of those images.
        </p>
      )}
      <header className="trial-head">
        <div>
          <h1>{p.product}</h1>
          <p className="muted">
            {!p.startedAt
              ? `Baseline: ${baselineSessions} of ${p.baseline.sessions} sittings done`
              : a.complete
                ? `Trial complete: ${p.fairWeeks} weeks, ${new Set(scans.filter((s) => s.phase === "trial").map((s) => s.sessionId)).size} check-ins`
                : `Week ${a.week} of ${p.fairWeeks} · verdict due ${p.verdictDue}${a.next ? ` · next check-in ${a.next.toISOString().slice(0, 10)}` : ""}`}
          </p>
        </div>
        <VerdictBadge verdict={a.verdict} />
      </header>

      {lastNote && (
        <section className="note" aria-labelledby="note-h">
          <h2 id="note-h" className="sr-only">Latest note</h2>
          <p>{lastNote.text}</p>
          <p className="muted small">{new Date(lastNote.at).toLocaleDateString()} · {lastNote.source === "model" ? "written by the trial agent from the numbers below" : "summary of the numbers below"}</p>
        </section>
      )}
      {writing && <p role="status" className="muted">Writing this week's note…</p>}

      {!readOnly && !capturing && (
        <div className="actions">
          {!p.startedAt && (
            <>
              <button className="button primary" onClick={() => setCapturing(true)}>
                Take baseline photos ({baselineSessions + 1} of {p.baseline.sessions})
              </button>
              {baselineSessions > 0 && (
                <button className={`button ${baselineSessions >= p.baseline.sessions ? "primary" : ""}`} onClick={start}>
                  I start using it today
                </button>
              )}
            </>
          )}
          {p.startedAt && <button className="button primary" onClick={() => setCapturing(true)}>Check in now</button>}
        </div>
      )}
      {!p.startedAt && baselineSessions > 0 && baselineSessions < p.baseline.sessions && !readOnly && (
        <p className="muted small">
          Starting now is fine, but with fewer baseline days the trial borrows typical day-to-day noise instead of
          measuring yours, so it needs a bigger change before it will call one real.
        </p>
      )}
      {capturing && (
        <Capture
          trial={trial}
          phase={phase}
          photos={phase === "baseline" ? p.baseline.photosPerSession : p.checkIn.photosPerSession}
          onDone={finished}
          onCancel={() => setCapturing(false)}
        />
      )}

      <section aria-labelledby="targets-h">
        <h2 id="targets-h">What the product should change</h2>
        {a.results.map((r) => {
          const v = concernVerdictText(r.verdict);
          return (
            <article key={r.concern} className="concern">
              <header>
                <h3>{CONCERN_BY_ID[r.concern].label}</h3>
                <span className={`badge ${v.tone}`}>{v.text}</span>
              </header>
              <ConcernChart scans={scans} concern={r.concern} label={CONCERN_BY_ID[r.concern].label} startedAt={p.startedAt} fairWeeks={p.fairWeeks} prior={priorFor(r.concern)} />
              {"note" in r.verdict && <p className="small">{r.verdict.note}</p>}
            </article>
          );
        })}
      </section>

      {others.length > 0 && scans.length > 0 && (
        <section aria-labelledby="others-h">
          <h2 id="others-h">Everything else (side effects)</h2>
          {side.length === 0 ? (
            <p className="muted small">
              {p.startedAt
                ? "Nothing else has got worse by more than the photos can explain."
                : "After the baseline, every other score is watched for side effects."}
            </p>
          ) : (
            <ul className="side-effects" role="status">
              {side.map(({ change: c, expected }) => (
                <li key={c.concern}>
                  <strong>{CONCERN_BY_ID[c.concern].label}</strong>: {c.delta.toFixed(1)} points since the baseline, more
                  than the {(SIDE_EFFECT_BAR * c.mdc).toFixed(1)} the photos can explain.{" "}
                  {expected ?? "If it keeps going, stop the product and check with a pharmacist or dermatologist."}
                </li>
              ))}
            </ul>
          )}
          <button className="button ghost" aria-expanded={showAll} onClick={() => setShowAll(!showAll)}>
            {showAll ? "Hide" : `Show ${others.length} more scores`}
          </button>
          {showAll && others.map((c) => (
            <ConcernChart key={c} scans={scans} concern={c} label={CONCERN_BY_ID[c].label} startedAt={p.startedAt} fairWeeks={p.fairWeeks} prior={priorFor(c)} />
          ))}
        </section>
      )}

      {!readOnly && p.startedAt && (
        <section aria-labelledby="log-h">
          <h2 id="log-h">Anything else change this week?</h2>
          <p className="muted small">Other changes move scores too. Logging them keeps the verdict honest.</p>
          <div className="chips">
            {CHANGES.map((c) => <button key={c} className="chip" onClick={() => logChange(c)}>{c}</button>)}
          </div>
          {trial.changes.length > 0 && (
            <ul className="log">{trial.changes.slice(-5).reverse().map((c) => <li key={c.at}>{new Date(c.at).toLocaleDateString()}: {c.what}</li>)}</ul>
          )}
        </section>
      )}

      <section aria-labelledby="plan-h" className="plan-card">
        <h2 id="plan-h">The plan</h2>
        <p><strong>Actives:</strong> {p.actives.length ? p.actives.map((x) => x.name).join(", ") : "none recognised"}</p>
        {p.actives.filter((x) => x.evidence).map((x) => <p key={x.id} className="small muted">{x.evidence}</p>)}
        <p><strong>Fair verdict after:</strong> {p.fairWeeks} weeks (changes can show from week {p.onsetWeeks})</p>
        <details>
          <summary>Photo rules</summary>
          <ul>{p.rules.map((r) => <li key={r}>{r}</li>)}</ul>
        </details>
      </section>

      {!readOnly && (
        <div className="actions">
          <button className="button ghost" onClick={exportJson}>Export data</button>
          <button className="button ghost danger" onClick={remove}>Delete trial</button>
        </div>
      )}
    </div>
  );
}
