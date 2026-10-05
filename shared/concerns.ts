// The skin concerns a trial can track, as YouCam's AI Skin Analysis names them.
// HD concerns need a photo at least 1080 px on the short side; a trial uses one tier
// throughout so its scores stay comparable.

export type ConcernId =
  | "wrinkle" | "texture" | "pore" | "acne" | "redness" | "oiliness" | "moisture"
  | "radiance" | "age_spot" | "dark_circle" | "eye_bag" | "firmness";

export interface Concern {
  id: ConcernId;
  label: string;
  /** What a better score means, in plain words. */
  better: string;
  /** Has an HD variant (hd_<id>). */
  hd: boolean;
  /** Has an SD variant (<id>). */
  sd: boolean;
}

export const CONCERNS: Concern[] = [
  { id: "wrinkle", label: "Fine lines & wrinkles", better: "fewer, shallower lines", hd: true, sd: true },
  { id: "texture", label: "Texture", better: "smoother surface", hd: true, sd: true },
  { id: "pore", label: "Pores", better: "less visible pores", hd: true, sd: true },
  { id: "acne", label: "Breakouts", better: "fewer active blemishes", hd: true, sd: true },
  { id: "redness", label: "Redness", better: "calmer, more even tone", hd: true, sd: true },
  { id: "oiliness", label: "Oiliness", better: "less shine", hd: true, sd: true },
  { id: "moisture", label: "Hydration", better: "better-hydrated skin", hd: true, sd: true },
  { id: "radiance", label: "Radiance", better: "brighter, less dull skin", hd: true, sd: true },
  { id: "age_spot", label: "Dark spots", better: "fewer, lighter spots", hd: true, sd: true },
  { id: "dark_circle", label: "Dark circles", better: "lighter under-eyes", hd: true, sd: true },
  { id: "eye_bag", label: "Under-eye puffiness", better: "less puffiness", hd: true, sd: true },
  { id: "firmness", label: "Firmness", better: "firmer contours", hd: true, sd: true },
];

export const CONCERN_BY_ID: Record<ConcernId, Concern> = Object.fromEntries(
  CONCERNS.map((c) => [c.id, c]),
) as Record<ConcernId, Concern>;

export type Tier = "sd" | "hd";

export function actionName(id: ConcernId, tier: Tier): string {
  return tier === "hd" ? `hd_${id}` : id;
}

/** Inverse of actionName, for parsing results ("hd_redness" -> "redness"). */
export function concernFromAction(action: string): ConcernId | null {
  const id = action.replace(/^hd_/, "") as ConcernId;
  return id in CONCERN_BY_ID ? id : null;
}
