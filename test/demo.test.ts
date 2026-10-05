import { describe, expect, it } from "vitest";
import DEMO from "../src/demo.json";
import { assess } from "../src/trialMath";
import type { Trial } from "../src/types";

// The example trial holds real YouCam scores of a synthetic face whose cheek flush fades from
// week 4. Replaying it one check-in at a time shows what the app would have said each week.
function timeline() {
  const trial = { ...(DEMO as unknown as Trial), demo: true };
  const checkIns = trial.scans.filter((s) => s.phase === "trial");
  return checkIns.map((s) => {
    const at = Date.parse(s.takenAt);
    const sofar = { ...trial, scans: trial.scans.filter((x) => Date.parse(x.takenAt) <= at) };
    const a = assess(sofar, new Date(at + 3600 * 1000));
    const r = a.results[0];
    return { week: a.week, verdict: a.verdict, kind: r.verdict.kind, delta: r.change?.delta, mdc: r.change?.mdc };
  });
}

describe("example trial", () => {
  it("waits through the early weeks, then calls the redness change once it clears the noise", () => {
    const t = timeline();
    console.table(t.map((x) => ({ ...x, delta: x.delta?.toFixed(1), mdc: x.mdc?.toFixed(1) })));
    expect(t.slice(0, 3).every((x) => x.kind === "too_early")).toBe(true);
    expect(t.at(-1)?.verdict).toBe("working");
    expect(t.some((x) => x.verdict === "stop_and_check")).toBe(false);
  });
});
