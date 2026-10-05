import type { ConcernVerdict, TrialVerdict } from "../shared/stats";

const OVERALL: Record<TrialVerdict, { text: string; tone: string }> = {
  waiting: { text: "Baseline first", tone: "neutral" },
  keep_going: { text: "Keep going", tone: "neutral" },
  working: { text: "Working", tone: "good" },
  not_working: { text: "Not working for you", tone: "bad" },
  stop_and_check: { text: "Stop and check", tone: "warn" },
};

export function VerdictBadge({ verdict }: { verdict: TrialVerdict }) {
  const v = OVERALL[verdict];
  return <span className={`badge ${v.tone}`}>{v.text}</span>;
}

export function concernVerdictText(v: ConcernVerdict): { text: string; tone: string } {
  switch (v.kind) {
    case "improving": return { text: v.early ? "Improving (earlier than usual)" : "Improving", tone: "good" };
    case "worse": return { text: "Worse", tone: "warn" };
    case "irritation": return { text: "Irritated", tone: "warn" };
    case "expected_early_effect": return { text: `Expected dip until week ${v.untilWeek}`, tone: "neutral" };
    case "too_early": return { text: `Too early, fair from ${v.fairOn}`, tone: "neutral" };
    case "no_change": return { text: "No real change", tone: "bad" };
    case "waiting": return { text: "Waiting for check-ins", tone: "neutral" };
  }
}
