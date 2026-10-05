import { describe, expect, it } from "vitest";
import { buildPlan, startPlan } from "../shared/plan";
import { sideEffects } from "../src/trialMath";
import type { StoredScan, Trial } from "../src/types";

const DAY = 24 * 3600 * 1000;
const START = Date.parse("2026-07-06T08:00:00Z");
const quality = { width: 1088, height: 1632, luma: 120, warmth: 0.3, clipped: 0, sharpness: 100 };

function scan(day: number, phase: StoredScan["phase"], acne: number, redness = 70): StoredScan {
  return {
    id: `s${day}`, sessionId: `d${day}`, takenAt: new Date(START + day * DAY).toISOString(), phase, quality,
    scores: { acne, redness, wrinkle: 80, texture: 90, pore: 85, oiliness: 80, moisture: 80, radiance: 90, age_spot: 95, dark_circle: 80, eye_bag: 75, firmness: 90 },
  };
}

function trial(ingredients: string, acne: number[], redness: number[] = acne.map(() => 70)): Trial {
  const plan = startPlan(buildPlan({ product: "Test", ingredients }), new Date(START));
  const scans = [scan(-6, "baseline", 90), scan(-4, "baseline", 91), scan(-2, "baseline", 90),
    ...acne.map((a, i) => scan(7 * (i + 1), "trial", a, redness[i]))];
  return { id: "t", createdAt: plan.startedAt!, plan, scans, changes: [], notes: [] };
}

describe("side effects", () => {
  it("stay quiet for wobbles the photos can explain", () => {
    const t = trial("Aqua, Niacinamide, Glycerin", [89, 91, 88, 90]);
    expect(sideEffects(t, new Date(START + 29 * DAY))).toEqual([]);
  });

  it("flag a concern the product does not target once it drops past the stricter bar", () => {
    const t = trial("Aqua, Niacinamide, Glycerin", [88, 84, 78, 76]);
    const side = sideEffects(t, new Date(START + 29 * DAY));
    expect(side.map((s) => s.change.concern)).toEqual(["acne"]);
    expect(side[0].expected).toBeUndefined();
  });

  it("name a known early effect instead of raising the alarm", () => {
    const t = trial("Aqua, Retinol, Squalane", [90, 90], [62, 58]);
    expect(t.plan.targets).not.toContain("redness");
    const side = sideEffects(t, new Date(START + 15 * DAY));
    expect(side.map((s) => s.change.concern)).toEqual(["redness"]);
    expect(side[0].expected).toMatch(/retinoid/i);
  });
});
