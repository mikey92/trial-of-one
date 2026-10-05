import type { ConcernId } from "../shared/concerns";
import type { TrialPlan } from "../shared/plan";
import type { Scan } from "../shared/stats";
import type { Quality } from "./quality";

export interface StoredScan extends Scan {
  quality: Quality;
  /** Small JPEG kept on this device only, for the side-by-side view. */
  thumb?: string;
  raw?: Partial<Record<ConcernId, number>>;
  /** Kept despite failing the light or focus check; shown, but left out of the verdict. */
  flagged?: boolean;
}

export interface LoggedChange { at: string; what: string }

export interface Trial {
  id: string;
  createdAt: string;
  plan: TrialPlan;
  scans: StoredScan[];
  changes: LoggedChange[];
  notes: { at: string; text: string; source: "model" | "template" }[];
  /** Quality of the first good baseline photo; later photos are compared with it. */
  reference?: Quality;
  demo?: boolean;
}
