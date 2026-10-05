import { describe, expect, it } from "vitest";
import { faithful, template, type NoteRequest } from "../worker/agent";

const checkin: NoteRequest = {
  kind: "checkin",
  product: "Azelaic acid 15% serum",
  week: 6,
  overall: "working",
  lines: [{ label: "Redness", verdict: "improving", delta: 7.4, mdc: 4.1 }],
  nextCheckIn: "2026-08-24",
};

describe("note faithfulness", () => {
  it("accepts a note that only uses the given numbers", () => {
    const note = "Week 6 brings a clear result: redness improved by 7.4 points, more than the 4.1 points your photos can wobble on their own. Keep going and check in again on 2026-08-24.";
    expect(faithful(note, checkin)).toBe(true);
  });

  it("rejects a note that invents a number", () => {
    const note = "Redness improved by 7.4 points, which is about 30% better than your baseline. Check in again on 2026-08-24.";
    expect(faithful(note, checkin)).toBe(false);
  });

  it("rejects a note that contradicts the verdict", () => {
    const note = "After 6 weeks the serum is not working on redness yet; the 7.4 point move is within 4.1 points of noise. Check in on 2026-08-24.";
    expect(faithful(note, checkin)).toBe(false);
  });
});

describe("template notes", () => {
  it("names the improvement with its numbers and the next date", () => {
    const t = template(checkin).text;
    expect(t).toContain("Redness improved");
    expect(t).toContain("7.4 points vs. 4.1 needed");
    expect(t).toContain("2026-08-24");
  });

  it("says when a fair verdict becomes possible", () => {
    const t = template({ ...checkin, overall: "keep_going", week: 2, lines: [{ label: "Redness", verdict: "too_early", delta: 1.2, mdc: 4.1, fairOn: "2026-09-28" }] }).text;
    expect(t).toContain("normal at week 2");
    expect(t).toContain("2026-09-28");
  });

  it("is a valid note by its own rules", () => {
    expect(faithful(template(checkin).text, checkin)).toBe(true);
  });
});

describe("note wording", () => {
  it("sends a note that uses the MDC acronym back to the template", () => {
    const req = { kind: "checkin" as const, product: "Serum", week: 7, overall: "working", nextCheckIn: "2026-08-31",
      lines: [{ label: "Redness", verdict: "improving", delta: 8, mdc: 4.6 }] };
    expect(faithful("Redness improved by 8 points, more than the 4.6 points the photos can show. Next check-in is 2026-08-31.", req)).toBe(true);
    expect(faithful("Redness improved by 8 points, above the 4.6-point MDC. Next check-in is 2026-08-31.", req)).toBe(false);
  });
});
