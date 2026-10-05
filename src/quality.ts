// Photo checks that run on the device before anything is uploaded. They compare each new
// photo with the first baseline photo, because a trial only works if the light and the
// framing stay the same; the thresholds are where our perturbation study saw scores move.
//
// Sharpness is measured on a copy up to 1024 px, not the 256 px copy used for light: the
// slight blur that raised texture scores by 9 points on average in the study keeps 85% of
// its sharpness at 256 px, so a small copy cannot see it. At 1024 px it keeps 9-20%, while
// the study's light, framing and JPEG edits stay at 87-112%.

export interface Quality {
  width: number;
  height: number;
  /** Mean luminance of the face area, 0-255. */
  luma: number;
  /** ln(R/B) of the face area: higher is warmer light. */
  warmth: number;
  /** Share of face-area pixels that are blown out or crushed. */
  clipped: number;
  /** Variance of the Laplacian in the face oval of a copy up to 1024 px: higher is sharper. */
  sharpness: number;
}

export interface QualityIssue { code: "dark" | "bright" | "warm" | "cool" | "blur" | "clipped" | "small"; message: string }

export const LIMITS = { lumaRatio: 0.15, warmth: 0.12, sharpRatio: 0.5, minSharp: 5, clipped: 0.04, minShort: 480 };

/** The face area: the central oval the capture screen asks people to fill. */
function inFace(x: number, y: number, w: number, h: number): boolean {
  return ((x - w / 2) / (w * 0.3)) ** 2 + ((y - h * 0.47) / (h * 0.36)) ** 2 <= 1;
}

function pixels(img: CanvasImageSource, width: number, height: number, side: number) {
  const scale = Math.min(1, side / Math.max(width, height));
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));
  const ctx = new OffscreenCanvas(w, h).getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, w, h);
  return { data: ctx.getImageData(0, 0, w, h).data, w, h };
}

/** Variance of the Laplacian of luminance inside the face oval of an RGBA image. */
export function sharpnessOf(data: ArrayLike<number>, w: number, h: number): number {
  const lum = new Float32Array(w * h);
  for (let k = 0; k < w * h; k++) lum[k] = 0.2126 * data[k * 4] + 0.7152 * data[k * 4 + 1] + 0.0722 * data[k * 4 + 2];
  let sum = 0, sq = 0, m = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      if (!inFace(x, y, w, h)) continue;
      const k = y * w + x;
      const lap = lum[k - 1] + lum[k + 1] + lum[k - w] + lum[k + w] - 4 * lum[k];
      sum += lap;
      sq += lap * lap;
      m++;
    }
  }
  const avg = sum / Math.max(m, 1);
  return sq / Math.max(m, 1) - avg * avg;
}

export function measure(img: CanvasImageSource, width: number, height: number): Quality {
  const { data, w, h } = pixels(img, width, height, 256);
  let n = 0, sumY = 0, sumR = 0, sumB = 0, clipped = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!inFace(x, y, w, h)) continue;
      const i = (y * w + x) * 4;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const Y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      n++;
      sumY += Y;
      sumR += r;
      sumB += b;
      if (Y > 250 || Y < 5) clipped++;
    }
  }
  const big = pixels(img, width, height, 1024);
  return {
    width,
    height,
    luma: sumY / Math.max(n, 1),
    warmth: Math.log((sumR + 1) / (sumB + 1)),
    clipped: clipped / Math.max(n, 1),
    sharpness: sharpnessOf(big.data, big.w, big.h),
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
