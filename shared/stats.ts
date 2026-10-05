import type { ConcernId } from "./concerns";
import type { Active } from "./actives";

// How much a skin score has to move before it means something.
//
// A score from one photo mixes the skin with the photo: light, angle, distance, focus and
// the camera's processing. Two kinds of noise matter for a trial:
//   capture noise - photos taken a minute apart in the same sitting still differ;
//   day noise     - the same skin on different days (sleep, salt, cycle, weather).
// A trial estimates both from the baseline scans, shrunk towards population values
// measured in our perturbation study, and only calls a change real when it is bigger
// than the minimal detectable change for the scans actually taken.

export interface Scan {
  id: string;
  takenAt: string;               // ISO time
  sessionId: string;             // photos taken in one sitting share a session
  phase: "baseline" | "trial";
  scores: Partial<Record<ConcernId, number>>; // 0-100, higher is better skin
}

export interface NoisePrior { capture: number; day: number } // standard deviations, score points

/** Population noise used until a person's own baseline says otherwise. */
export const DEFAULT_PRIOR: NoisePrior = { capture: 2.0, day: 3.0 };
/** How many observations the prior is worth. */
export const PRIOR_WEIGHT = 4;

export interface SessionMean { sessionId: string; at: number; mean: number; n: number; phase: Scan["phase"] }

export function sessionMeans(scans: Scan[], concern: ConcernId): SessionMean[] {
  const groups = new Map<string, Scan[]>();
  for (const s of scans) {
    if (typeof s.scores[concern] !== "number") continue;
    const g = groups.get(s.sessionId) ?? [];
    g.push(s);
    groups.set(s.sessionId, g);
  }
  return [...groups.entries()].map(([sessionId, g]) => ({
    sessionId,
    at: Math.min(...g.map((s) => Date.parse(s.takenAt))),
    mean: mean(g.map((s) => s.scores[concern] as number)),
    n: g.length,
    phase: g[0].phase,
  })).sort((a, b) => a.at - b.at);
}

export interface Noise { capture: number; day: number; captureDf: number; dayDf: number }

/** Capture and day noise for one concern from the baseline, shrunk towards the prior. */
export function estimateNoise(scans: Scan[], concern: ConcernId, prior: NoisePrior = DEFAULT_PRIOR): Noise {
  const base = scans.filter((s) => s.phase === "baseline" && typeof s.scores[concern] === "number");
  // Within-session spread: pooled over sessions with two or more photos.
  let ssWithin = 0, dfWithin = 0;
  const bySession = new Map<string, number[]>();
  for (const s of base) bySession.set(s.sessionId, [...(bySession.get(s.sessionId) ?? []), s.scores[concern] as number]);
  for (const v of bySession.values()) {
    if (v.length < 2) continue;
    const m = mean(v);
    ssWithin += v.reduce((a, x) => a + (x - m) ** 2, 0);
    dfWithin += v.length - 1;
  }
  const capture = Math.sqrt((PRIOR_WEIGHT * prior.capture ** 2 + ssWithin) / (PRIOR_WEIGHT + dfWithin));
  // Between-session spread of session means, minus the part capture noise explains.
  const means = [...bySession.values()].map((v) => ({ m: mean(v), n: v.length }));
  let day = prior.day, dfDay = 0;
  if (means.length >= 2) {
    const grand = mean(means.map((x) => x.m));
    const ssBetween = means.reduce((a, x) => a + (x.m - grand) ** 2, 0);
    dfDay = means.length - 1;
    const avgInvN = mean(means.map((x) => 1 / x.n));
    const raw = ssBetween / dfDay - capture ** 2 * avgInvN;
    day = Math.sqrt((PRIOR_WEIGHT * prior.day ** 2 + dfDay * Math.max(raw, 0)) / (PRIOR_WEIGHT + dfDay));
  }
  return { capture, day, captureDf: dfWithin, dayDf: dfDay };
}

/** Variance of a session mean of n photos. */
function sessionVar(noise: Noise, n: number): number {
  return noise.day ** 2 + noise.capture ** 2 / n;
}

export interface Change {
  concern: ConcernId;
  baseline: number;
  current: number;
  delta: number;           // current - baseline; positive is better
  mdc: number;             // minimal detectable change at 95%
  sessionsUsed: number;    // trial sessions averaged into `current`
  slopePerWeek: number | null;
}

/**
 * Change from baseline for one concern: the mean of the last `recent` trial sessions
 * against the mean of all baseline sessions, with the 95% minimal detectable change for
 * exactly those sessions.
 */
export function changeFor(scans: Scan[], concern: ConcernId, prior: NoisePrior = DEFAULT_PRIOR, recent = 2): Change | null {
  const sessions = sessionMeans(scans, concern);
  const base = sessions.filter((s) => s.phase === "baseline");
  const trial = sessions.filter((s) => s.phase === "trial");
  if (!base.length || !trial.length) return null;
  const noise = estimateNoise(scans, concern, prior);
  const last = trial.slice(-recent);
  const baseline = mean(base.map((s) => s.mean));
  const current = mean(last.map((s) => s.mean));
  const varBase = mean(base.map((s) => sessionVar(noise, s.n))) / base.length;
  const varCur = mean(last.map((s) => sessionVar(noise, s.n))) / last.length;
  const mdc = 1.96 * Math.sqrt(varBase + varCur);
  const start = trial[0].at;
  const pts = trial.map((s) => ({ x: (s.at - start) / WEEK_MS, y: s.mean }));
  return {
    concern, baseline, current, delta: current - baseline, mdc, sessionsUsed: last.length,
    slopePerWeek: pts.length >= 3 ? theilSen(pts) : null,
  };
}

export type ConcernVerdict =
  | { kind: "improving"; early: boolean }
  | { kind: "worse" }
  | { kind: "expected_early_effect"; note: string; untilWeek: number }
  | { kind: "irritation"; note: string }
  | { kind: "too_early"; fairOn: string }
  | { kind: "no_change"; detectable: number }
  | { kind: "waiting" };

export interface ConcernResult { concern: ConcernId; change: Change | null; verdict: ConcernVerdict }

export function judgeConcern(
  scans: Scan[], concern: ConcernId, active: Pick<Active, "onsetWeeks" | "fairWeeks" | "earlyEffects">,
  startedAt: string, now: Date, prior: NoisePrior = DEFAULT_PRIOR,
): ConcernResult {
  const change = changeFor(scans, concern, prior);
  if (!change) return { concern, change, verdict: { kind: "waiting" } };
  const weeks = (now.getTime() - Date.parse(startedAt)) / WEEK_MS;
  const early = active.earlyEffects?.find((e) => e.concern === concern && weeks < e.untilWeek);
  if (change.delta <= -change.mdc) {
    if (early) {
      return change.delta <= -3 * change.mdc
        ? { concern, change, verdict: { kind: "irritation", note: early.note } }
        : { concern, change, verdict: { kind: "expected_early_effect", note: early.note, untilWeek: early.untilWeek } };
    }
    return { concern, change, verdict: { kind: "worse" } };
  }
  if (change.delta >= change.mdc) {
    return { concern, change, verdict: { kind: "improving", early: weeks < active.onsetWeeks } };
  }
  if (weeks < active.fairWeeks) {
    const fairOn = new Date(Date.parse(startedAt) + active.fairWeeks * WEEK_MS).toISOString().slice(0, 10);
    return { concern, change, verdict: { kind: "too_early", fairOn } };
  }
  return { concern, change, verdict: { kind: "no_change", detectable: change.mdc } };
}

export type TrialVerdict = "keep_going" | "working" | "not_working" | "stop_and_check" | "waiting";

/** One call for the whole product from its target concerns. */
export function overall(results: ConcernResult[]): TrialVerdict {
  const kinds = results.map((r) => r.verdict.kind);
  if (kinds.includes("irritation") || kinds.includes("worse")) return "stop_and_check";
  if (kinds.includes("improving")) return "working";
  if (kinds.length && kinds.every((k) => k === "no_change")) return "not_working";
  if (kinds.every((k) => k === "waiting")) return "waiting";
  return "keep_going";
}

// ── helpers ──────────────────────────────────────────────────────────────────

export const WEEK_MS = 7 * 24 * 3600 * 1000;

export function mean(xs: number[]): number {
  return xs.reduce((a, x) => a + x, 0) / xs.length;
}

export function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Median of pairwise slopes: a trend that one bad photo cannot drag around. */
export function theilSen(pts: { x: number; y: number }[]): number {
  const slopes: number[] = [];
  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 1; j < pts.length; j++) {
      const dx = pts[j].x - pts[i].x;
      if (dx !== 0) slopes.push((pts[j].y - pts[i].y) / dx);
    }
  }
  return slopes.length ? median(slopes) : 0;
}
