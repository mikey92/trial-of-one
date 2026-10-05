import { ACTIVE_BY_ID, findActives, type Active } from "./actives";
import { CONCERNS, type ConcernId, type Tier } from "./concerns";
import { WEEK_MS } from "./stats";

// A trial plan: what to measure, for how long, and how to take the photos so that the
// scores compare. Built deterministically from the product's actives; the agent explains
// it and adapts the schedule, but never changes what counts as evidence.

export interface TrialPlan {
  product: string;
  actives: { id: string; name: string; evidence?: string }[];
  targets: ConcernId[];
  /** Every concern scanned, targets first; the rest are watched for side effects. */
  tracked: ConcernId[];
  onsetWeeks: number;
  fairWeeks: number;
  earlyEffects: NonNullable<Active["earlyEffects"]>;
  tier: Tier;
  baseline: { sessions: number; photosPerSession: number };
  checkIn: { everyDays: number; photosPerSession: number };
  startedAt: string | null;
  verdictDue: string | null;
  rules: string[];
}

export const PHOTO_RULES = [
  "Same place and the same light every time: face a window in daylight, no overhead lamp, no flash.",
  "Same time of day, before applying any product: wash, wait 15 minutes, then take the photos.",
  "Bare face, hair pulled back, neutral expression, looking straight into the camera.",
  "Hold the phone at eye level, at the same distance (your face fills the oval).",
  "Change one product at a time. A second new product during the trial makes the result unreadable.",
];

export interface PlanInput {
  product: string;
  ingredients?: string;
  /** Actives chosen by hand when there is no ingredient list. */
  activeIds?: string[];
  /** What the person wants this product to do; empty means everything the actives target. */
  goals?: ConcernId[];
  tier?: Tier;
}

export function buildPlan(input: PlanInput): TrialPlan {
  const found = input.ingredients ? findActives(input.ingredients) : [];
  const chosen = (input.activeIds ?? []).map((id) => ACTIVE_BY_ID[id]).filter(Boolean);
  const actives = dedupe([...found, ...chosen]);
  const claimed = dedupe(actives.flatMap((a) => a.targets));
  const goals = input.goals?.length ? input.goals : claimed;
  // Goals the product's actives do not address are still tracked but cannot be judged as
  // the product's effect; without any recognised active, the person's goals are the targets.
  const targets = actives.length ? goals.filter((g) => claimed.includes(g)) : goals;
  const relevant = actives.filter((a) => a.targets.some((t) => targets.includes(t)));
  const timing = relevant.length ? relevant : actives;
  const onsetWeeks = timing.length ? Math.min(...timing.map((a) => a.onsetWeeks)) : 4;
  const fairWeeks = timing.length ? Math.max(...timing.map((a) => a.fairWeeks)) : 12;
  const tracked = [...targets, ...CONCERNS.map((c) => c.id).filter((id) => !targets.includes(id))];
  return {
    product: input.product.trim() || "Your product",
    actives: actives.map((a) => ({ id: a.id, name: a.name, evidence: a.evidence })),
    targets,
    tracked,
    onsetWeeks,
    fairWeeks,
    earlyEffects: actives.flatMap((a) => a.earlyEffects ?? []),
    tier: input.tier ?? "hd",
    // One photo per sitting: with the photo check in place, the study's capture noise is at
    // most 1.8 points, so a second photo would shrink the smallest detectable change by under
    // 7% and double the units every trial spends.
    baseline: { sessions: 3, photosPerSession: 1 },
    checkIn: { everyDays: 7, photosPerSession: 1 },
    startedAt: null,
    verdictDue: null,
    rules: PHOTO_RULES,
  };
}

export function startPlan(plan: TrialPlan, at: Date): TrialPlan {
  return {
    ...plan,
    startedAt: at.toISOString(),
    verdictDue: new Date(at.getTime() + plan.fairWeeks * WEEK_MS).toISOString().slice(0, 10),
  };
}

/** The next check-in date after the last session, kept on the same weekday. */
export function nextCheckIn(plan: TrialPlan, lastSessionAt: Date | null, now: Date): Date {
  if (!plan.startedAt) return now;
  const start = Date.parse(plan.startedAt);
  const step = plan.checkIn.everyDays * 24 * 3600 * 1000;
  const after = Math.max(lastSessionAt?.getTime() ?? start, start);
  const k = Math.floor((after - start) / step) + 1;
  return new Date(start + k * step);
}

function dedupe<T>(xs: T[]): T[] {
  return [...new Set(xs)];
}
