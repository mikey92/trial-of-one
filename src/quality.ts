// Photo checks that run on the device before anything is uploaded. They compare each new
// photo with the first baseline photo, because a trial only works if the light and the
// framing stay the same; the thresholds are where our perturbation study saw scores move.

export interface Quality {
  width: number;
  height: number;
  /** Mean luminance of the face area, 0-255. */
  luma: number;
  /** ln(R/B) of the face area: higher is warmer light. */
  warmth: number;
  /** Share of face-area pixels that are blown out or crushed. */
  clipped: number;
  /** Variance of the Laplacian on a 256 px copy: higher is sharper. */
  sharpness: number;
}

export interface QualityIssue { code: "dark" | "bright" | "warm" | "cool" | "blur" | "clipped" | "small"; message: string }

export const LIMITS = { lumaRatio: 0.15, warmth: 0.12, sharpRatio: 0.5, minSharp: 12, clipped: 0.04, minShort: 480 };

export function measure(img: CanvasImageSource, width: number, height: number): Quality {
  // The face area: the central oval the capture screen asks people to fill.
  const scale = 256 / Math.max(width, height);
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);
  const cx = w / 2, cy = h * 0.47, rx = w * 0.3, ry = h * 0.36;
  let n = 0, sumY = 0, sumR = 0, sumB = 0, clipped = 0;
  const lum = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const Y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      lum[y * w + x] = Y;
      if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 > 1) continue;
      n++;
      sumY += Y;
      sumR += r;
      sumB += b;
      if (Y > 250 || Y < 5) clipped++;
    }
  }
  let lapSum = 0, lapSq = 0, m = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const k = y * w + x;
      const lap = lum[k - 1] + lum[k + 1] + lum[k - w] + lum[k + w] - 4 * lum[k];
      lapSum += lap;
      lapSq += lap * lap;
      m++;
    }
  }
  const lapMean = lapSum / Math.max(m, 1);
  return {
    width,
    height,
    luma: sumY / Math.max(n, 1),
    warmth: Math.log((sumR + 1) / (sumB + 1)),
    clipped: clipped / Math.max(n, 1),
    sharpness: lapSq / Math.max(m, 1) - lapMean * lapMean,
  };
}

export function compare(q: Quality, ref: Quality | undefined): QualityIssue[] {
  const issues: QualityIssue[] = [];
  if (Math.min(q.width, q.height) < LIMITS.minShort) {
    issues.push({ code: "small", message: "The photo is too small. Use the camera's full resolution." });
  }
  if (q.sharpness < LIMITS.minSharp || (ref && q.sharpness < ref.sharpness * LIMITS.sharpRatio)) {
    issues.push({ code: "blur", message: "The photo looks blurry. Hold still, or lean the phone against something." });
  }
  if (q.clipped > LIMITS.clipped) {
    issues.push({ code: "clipped", message: "Parts of your face are blown out. Step out of direct sun." });
  }
  if (ref) {
    const ratio = q.luma / Math.max(ref.luma, 1);
    if (ratio < 1 - LIMITS.lumaRatio) issues.push({ code: "dark", message: "This photo is darker than your baseline. Use the same spot and time of day." });
    if (ratio > 1 + LIMITS.lumaRatio) issues.push({ code: "bright", message: "This photo is brighter than your baseline. Use the same spot and time of day." });
    const dw = q.warmth - ref.warmth;
    if (dw > LIMITS.warmth) issues.push({ code: "warm", message: "The light is warmer (more yellow) than in your baseline. Turn off lamps and use daylight." });
    if (dw < -LIMITS.warmth) issues.push({ code: "cool", message: "The light is cooler (bluer) than in your baseline. Use the same window light as before." });
  }
  return issues;
}
