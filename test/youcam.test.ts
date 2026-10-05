import { describe, expect, it } from "vitest";
import { parseScores } from "../worker/youcam";

// The shape of a real HD skin-analysis result (scores from a synthetic test face, URLs removed).
const results = {
  output: [
    { type: "hd_redness", ui_score: 66, raw_score: 46.2, mask_urls: ["m"] },
    { type: "hd_acne", ui_score: 91, raw_score: 85.8, region: "whole" },
    { type: "hd_pore", ui_score: 99, raw_score: 100, region: "nose" },
    { type: "hd_pore", ui_score: 97, raw_score: 98.9, region: "whole" },
    { type: "hd_pore", ui_score: 96, raw_score: 98.0, region: "forehead" },
    { type: "hd_wrinkle", ui_score: 80, raw_score: 90.0, region: "whole" },
    { type: "hd_wrinkle", ui_score: 97, raw_score: 99.0, region: "glabellar" },
    { type: "all", score: 87.1 },
    { type: "skin_age", score: 31 },
    { type: "resize_image" },
  ],
};

describe("parseScores", () => {
  it("keeps one whole-face score per concern and skips the summary items", () => {
    const s = parseScores(results);
    expect(Object.keys(s).sort()).toEqual(["acne", "pore", "redness", "wrinkle"]);
    expect(s.pore).toMatchObject({ ui: 97, raw: 98.9 });
    expect(s.wrinkle).toMatchObject({ ui: 80, raw: 90.0 });
    expect(s.redness).toMatchObject({ ui: 66, raw: 46.2, mask: "m" });
  });
});
