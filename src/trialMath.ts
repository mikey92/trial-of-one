// Glue between a stored trial and the statistics: per-concern verdicts for the dashboard
// and the facts the weekly note is written from.

import { ACTIVE_BY_ID, type Active } from "../shared/actives";
import { CONCERN_BY_ID, type ConcernId } from "../shared/concerns";
import { nextCheckIn } from "../shared/plan";
import { changeFor, judgeConcern, overall, WEEK_MS, type Change, type ConcernResult, type NoisePrior, type TrialVerdict } from "../shared/stats";
import type { Trial } from "./types";
import STUDY from "./study.json";

/** Noise measured in our perturbation study, per concern (falls back to the default prior). */
export function priorFor(concern: ConcernId): NoisePrior | undefined {
  const row = (STUDY as { noise?: Record<string, NoisePrior> }).noise?.[concern];
  return row && row.capture > 0 ? row : undefined;
}

/** The timing rules for a trial: the slowest relevant active decides when a verdict is fair. */
export function timing(trial: Trial): Pick<Active, "onsetWeeks" | "fairWeeks" | "earlyEffects"> {
  return { onsetWeeks: trial.plan.onsetWeeks, fairWeeks: trial.plan.fairWeeks, earlyEffects: trial.plan.earlyEffects };
}

/** Scans that count: photos that failed the light or focus check are shown but not judged. */
export function usable(trial: Trial) {
  return trial.scans.filter((s) => !s.flagged);
}

export interface Assessment { results: ConcernResult[]; verdict: TrialVerdict; week: number; next: Date | null; complete: boolean }

/** The example trial is judged as of the day after its last check-in, not today. */
export function judgedAt(trial: Trial): Date {
  if (!trial.demo || !trial.scans.length) return new Date();
  return new Date(Math.max(...trial.scans.map((s) => Date.parse(s.takenAt))) + 24 * 3600 * 1000);
}

export function assess(trial: Trial, now = judgedAt(trial)): Assessment {
  const started = trial.plan.startedAt;
  const scans = usable(trial);
  const results = trial.plan.targets.map((c) =>
    started ? judgeConcern(scans, c, timing(trial), started, now, priorFor(c)) : { concern: c, change: null, verdict: { kind: "waiting" as const } },
  );
  const week = started ? Math.max(0, Math.floor((now.getTime() - Date.parse(started)) / WEEK_MS)) : 0;
  const trialScans = trial.scans.filter((s) => s.phase === "trial");
  const last = trialScans.length ? new Date(trialScans[trialScans.length - 1].takenAt) : null;
  const lastWeek = started && last ? (last.getTime() - Date.parse(started)) / WEEK_MS : 0;
  const complete = Boolean(started) && lastWeek >= trial.plan.fairWeeks - 0.5;
  return {
    results, verdict: overall(results), week, complete,
    next: started && !complete ? nextCheckIn(trial.plan, last, now) : null,
  };
}

export interface HistoryRow { week: number; at: string; verdict: TrialVerdict; results: ConcernResult[] }

/** What the trial would have said after each check-in, replayed from the scans taken by then. */
export function history(trial: Trial): HistoryRow[] {
  if (!trial.plan.startedAt) return [];
  const sessions = new Map<string, number>();
  for (const s of usable(trial)) {
    if (s.phase !== "trial") continue;
    sessions.set(s.sessionId, Math.max(sessions.get(s.sessionId) ?? 0, Date.parse(s.takenAt)));
  }
  return [...sessions.values()].sort((a, b) => a - b).map((at) => {
    const sofar = { ...trial, scans: trial.scans.filter((s) => Date.parse(s.takenAt) <= at) };
    const a = assess(sofar, new Date(at + 3600 * 1000));
    return { week: a.week, at: new Date(at).toISOString(), verdict: a.verdict, results: a.results };
  });
}

/**
 * Side effects need a stricter bar than targets: eleven other concerns checked every week
 * would cross the plain 95% line by chance about one week in four. 1.5 times the minimal
 * detectable change is roughly that line corrected for eleven comparisons.
 */
export const SIDE_EFFECT_BAR = 1.5;

export interface SideEffect { change: Change; expected?: string }

/** Concerns the product does not target that got worse by more than the photos can explain. */
export function sideEffects(trial: Trial, now = judgedAt(trial)): SideEffect[] {
  const p = trial.plan;
  if (!p.startedAt) return [];
  const weeks = (now.getTime() - Date.parse(p.startedAt)) / WEEK_MS;
  const scans = usable(trial);
  return p.tracked
    .filter((c) => !p.targets.includes(c))
    .flatMap((c) => {
      const change = changeFor(scans, c, priorFor(c));
      if (!change || change.delta > -SIDE_EFFECT_BAR * change.mdc) return [];
      const early = p.earlyEffects.find((e) => e.concern === c && weeks < e.untilWeek);
      return [{ change, expected: early?.note }];
    });
}

export function label(c: ConcernId): string {
  return CONCERN_BY_ID[c].label;
}

export function noteRequest(trial: Trial, a: Assessment, retake?: string) {
  const recentChanges = trial.changes.filter((c) => a.next && Date.parse(c.at) > a.next.getTime() - 14 * 24 * 3600 * 1000).map((c) => c.what);
  return {
    kind: "checkin" as const,
    product: trial.plan.product,
    week: a.week,
    overall: a.verdict,
    lines: a.results.map((r) => ({
      label: label(r.concern),
      verdict: r.verdict.kind,
      delta: r.change ? round1(r.change.delta) : null,
      mdc: r.change ? round1(r.change.mdc) : null,
      fairOn: r.verdict.kind === "too_early" ? r.verdict.fairOn : undefined,
      note: "note" in r.verdict ? r.verdict.note : undefined,
    })),
    retake,
    changes: recentChanges.length ? recentChanges : undefined,
    nextCheckIn: a.next ? a.next.toISOString().slice(0, 10) : a.complete ? "none, the trial is complete" : "after your baseline",
  };
}

export function planRequest(trial: Trial) {
  const p = trial.plan;
  return {
    kind: "plan" as const,
    product: p.product,
    actives: p.actives.map((a) => a.name),
    targets: p.targets.map(label),
    onsetWeeks: p.onsetWeeks,
    fairWeeks: p.fairWeeks,
    earlyEffects: [...new Set(p.earlyEffects.map((e) => e.note))],
  };
}

export function activeName(id: string): string {
  return ACTIVE_BY_ID[id]?.name ?? id;
}

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}
