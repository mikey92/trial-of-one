import { describe, expect, it } from "vitest";
import { ACTIVE_BY_ID, findActives } from "../shared/actives";
import { buildPlan, nextCheckIn, startPlan } from "../shared/plan";
import {
  DEFAULT_PRIOR, changeFor, estimateNoise, judgeConcern, overall, theilSen, WEEK_MS, type Scan,
} from "../shared/stats";

const T0 = Date.parse("2026-09-01T08:00:00Z");
const day = 24 * 3600 * 1000;

function scan(session: string, at: number, phase: Scan["phase"], redness: number): Scan {
  return { id: `${session}-${at}-${redness}`, takenAt: new Date(at).toISOString(), sessionId: session, phase, scores: { redness } };
}

function baseline(values: number[][]): Scan[] {
  return values.flatMap((vs, i) => vs.map((v, j) => scan(`b${i}`, T0 + i * day + j * 1000, "baseline", v)));
}

function weekly(start: number, values: number[][]): Scan[] {
  return values.flatMap((vs, i) => vs.map((v, j) => scan(`t${i}`, start + (i + 1) * WEEK_MS + j * 1000, "trial", v)));
}

describe("noise", () => {
  it("falls back to the prior without a baseline", () => {
    const n = estimateNoise([], "redness");
    expect(n.capture).toBeCloseTo(DEFAULT_PRIOR.capture);
    expect(n.day).toBeCloseTo(DEFAULT_PRIOR.day);
  });

  it("moves towards the person's own spread", () => {
    const noisy = estimateNoise(baseline([[50, 60], [40, 70], [55, 45]]), "redness");
    const steady = estimateNoise(baseline([[60, 60], [60, 60], [60, 60]]), "redness");
    expect(noisy.capture).toBeGreaterThan(DEFAULT_PRIOR.capture);
    expect(steady.capture).toBeLessThan(DEFAULT_PRIOR.capture);
    expect(steady.capture).toBeGreaterThan(0); // the prior keeps it honest
  });
});

describe("change and verdicts", () => {
  const start = T0 + 3 * day;
  const startedAt = new Date(start).toISOString();
  const base = baseline([[60, 61], [59, 60], [61, 60]]);

  it("calls a large, consistent gain an improvement", () => {
    const scans = [...base, ...weekly(start, [[63, 64], [66, 67], [70, 71], [72, 71]])];
    const c = changeFor(scans, "redness")!;
    expect(c.delta).toBeGreaterThan(c.mdc);
    const r = judgeConcern(scans, "redness", ACTIVE_BY_ID.azelaic_acid, startedAt, new Date(start + 5 * WEEK_MS));
    expect(r.verdict.kind).toBe("improving");
  });

  it("waits when the change is inside the noise and the fair window is still open", () => {
    const scans = [...base, ...weekly(start, [[61, 60], [60, 62]])];
    const r = judgeConcern(scans, "redness", ACTIVE_BY_ID.azelaic_acid, startedAt, new Date(start + 2 * WEEK_MS));
    expect(r.verdict.kind).toBe("too_early");
    if (r.verdict.kind === "too_early") expect(r.verdict.fairOn).toBe("2026-11-27");
  });

  it("reports no change once the fair window has passed", () => {
    const flat = Array.from({ length: 12 }, () => [60, 61]);
    const scans = [...base, ...weekly(start, flat)];
    const r = judgeConcern(scans, "redness", ACTIVE_BY_ID.azelaic_acid, startedAt, new Date(start + 13 * WEEK_MS));
    expect(r.verdict.kind).toBe("no_change");
  });

  it("treats early retinoid redness as expected, and a big drop as irritation", () => {
    const mild = [...base, ...weekly(start, [[55, 54], [54, 55]])];
    const r1 = judgeConcern(mild, "redness", ACTIVE_BY_ID.retinoid, startedAt, new Date(start + 2 * WEEK_MS));
    expect(r1.verdict.kind).toBe("expected_early_effect");
    const harsh = [...base, ...weekly(start, [[30, 28], [25, 27]])];
    const r2 = judgeConcern(harsh, "redness", ACTIVE_BY_ID.retinoid, startedAt, new Date(start + 2 * WEEK_MS));
    expect(r2.verdict.kind).toBe("irritation");
  });

  it("flags a drop without an expected explanation as worse", () => {
    const scans = [...base, ...weekly(start, [[52, 53], [51, 50]])];
    const r = judgeConcern(scans, "redness", ACTIVE_BY_ID.vitamin_c, startedAt, new Date(start + 2 * WEEK_MS));
    expect(r.verdict.kind).toBe("worse");
    expect(overall([r])).toBe("stop_and_check");
  });
});

describe("trend", () => {
  it("ignores one wild photo", () => {
    const pts = [0, 1, 2, 3, 4, 5].map((x) => ({ x, y: 2 * x + 50 }));
    pts[3].y = 0;
    expect(theilSen(pts)).toBeCloseTo(2, 5);
  });
});

describe("plan", () => {
  it("finds actives in label order and skips pH adjusters", () => {
    const inci = "Aqua, Niacinamide, Glycerin, Citric Acid, Sodium Hyaluronate, Retinol, Tocopherol";
    expect(findActives(inci).map((a) => a.id)).toEqual(["niacinamide", "humectant", "retinoid"]);
    expect(findActives("Water, Citric Acid, Glycerin")).toEqual([]);
  });

  it("only judges goals the product actually claims", () => {
    const plan = buildPlan({ product: "10% Niacinamide serum", ingredients: "Aqua, Niacinamide, Zinc PCA", goals: ["age_spot", "wrinkle"] });
    expect(plan.targets).toEqual(["age_spot"]);
    expect(plan.tracked[0]).toBe("age_spot");
    expect(plan.tracked).toContain("wrinkle");
    expect(plan.fairWeeks).toBe(8);
  });

  it("schedules check-ins on the start weekday", () => {
    const plan = startPlan(buildPlan({ product: "x", activeIds: ["bha"] }), new Date(start0()));
    const next = nextCheckIn(plan, new Date(start0() + 9 * day), new Date(start0() + 9 * day));
    expect(next.getTime()).toBe(start0() + 14 * day);
  });
});

function start0() {
  return Date.parse("2026-10-05T07:00:00Z");
}
