import { describe, expect, it } from "vitest";
import DEMO from "../src/demo.json";
import { history } from "../src/trialMath";
import type { Trial } from "../src/types";

// The example trial holds real YouCam scores of a synthetic face whose cheek flush fades from
// week 4. Replaying it one check-in at a time shows what the app would have said each week.
function timeline() {
  return history({ ...(DEMO as unknown as Trial), demo: true }).map((h) => {
    const r = h.results[0];
    return { week: h.week, verdict: h.verdict, kind: r.verdict.kind, delta: r.change?.delta, mdc: r.change?.mdc };
  });
}

describe("example trial", () => {
  it("waits through the early weeks, then calls the redness change once it clears the noise", () => {
    const t = timeline();
    expect(t.map((x) => x.week)).toEqual([1, 2, 3, 4, 6, 7, 8, 10, 11, 12]);
    expect(t.slice(0, 5).every((x) => x.kind === "too_early")).toBe(true);
    expect(t.find((x) => x.week === 6)?.delta).toBe(4);
    expect(t.find((x) => x.verdict === "working")?.week).toBe(7);
    expect(t.at(-1)?.verdict).toBe("working");
    expect(t.some((x) => x.verdict === "stop_and_check")).toBe(false);
  });
});
