import { describe, expect, it } from "vitest";
import { compare, sharpnessOf, type Quality } from "../src/quality";

// A face-sized patch of fine detail, and the same patch slightly blurred (3x3 box filter).
function patch(w: number, h: number, blur: boolean): Uint8ClampedArray {
  let seed = 7;
  const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const lum = Array.from({ length: w * h }, () => 110 + 40 * rand());
  const at = (x: number, y: number) => lum[Math.min(h - 1, Math.max(0, y)) * w + Math.min(w - 1, Math.max(0, x))];
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let v = at(x, y);
      if (blur) {
        v = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) v += at(x + dx, y + dy) / 9;
      }
      out.set([v, v, v, 255], (y * w + x) * 4);
    }
  }
  return out;
}

const base: Quality = { width: 1088, height: 1632, luma: 120, warmth: 0.3, clipped: 0, sharpness: 100 };

describe("sharpness", () => {
  it("drops well below half for a slightly blurred copy of the same detail", () => {
    const sharp = sharpnessOf(patch(120, 180, false), 120, 180);
    const soft = sharpnessOf(patch(120, 180, true), 120, 180);
    expect(sharp).toBeGreaterThan(0);
    expect(soft / sharp).toBeLessThan(0.3);
  });

  it("flags a photo under half the reference's sharpness and passes one near it", () => {
    expect(compare({ ...base, sharpness: 40 }, base).map((i) => i.code)).toContain("blur");
    expect(compare({ ...base, sharpness: 88 }, base)).toEqual([]);
  });
});
