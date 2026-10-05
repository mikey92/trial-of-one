import type { Trial } from "./types";
import DEMO from "./demo.json";

// The finished example trial shown at #/demo: a synthetic face, its baseline and twelve
// weekly check-ins, all scored by the real API (see scripts/demo_trial.py).

export function demoTrial(): Trial {
  return { ...(DEMO as unknown as Trial), demo: true };
}
