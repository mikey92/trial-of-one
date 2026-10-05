// The trial's voice: turns the numbers the statistics produced into a short weekly note.
// The model only words what the numbers already say. Every number in its note must come
// from the input, and the note may not contradict the verdict; otherwise the plain
// template is used instead.

/** The part of the Worker environment the note writer needs. */
export interface NoteEnv { LLM_RELAY_URL?: string; LLM_RELAY_KEY?: string }

export interface ConcernLine {
  label: string;
  verdict: string;        // improving | worse | expected_early_effect | irritation | too_early | no_change | waiting
  delta: number | null;   // score points, positive is better
  mdc: number | null;
  fairOn?: string;
  note?: string;
}

export type NoteRequest =
  | { kind: "plan"; product: string; actives: string[]; targets: string[]; onsetWeeks: number; fairWeeks: number; earlyEffects: string[] }
  | { kind: "checkin"; product: string; week: number; overall: string; lines: ConcernLine[]; retake?: string; changes?: string[]; nextCheckIn: string };

export interface Note { text: string; source: "model" | "template" }

const SYSTEM = `You write the weekly note for a personal skincare trial. The person is testing one product against their own baseline photos, scored by an AI skin analysis.
Rules:
- Use only the facts and numbers given. Never add a number, product claim, ingredient fact or date that is not in the input.
- Score changes are in points on a 0-100 scale where higher is better skin. "mdc" in the input is the smallest change the photos can reliably show: say it in those words (for example "more than the 4.6 points the photos can show"), never as "MDC".
- Do not diagnose, do not promise results, do not recommend prescription treatments. For irritation or a worsening trend, suggest pausing and, if it persists, seeing a dermatologist or pharmacist.
- Plain, warm, direct. 3 to 5 sentences, no headings, no lists, no emojis.`;

export async function writeNote(req: NoteRequest, env: NoteEnv, allowModel: boolean): Promise<Note> {
  const fallback = template(req);
  if (!allowModel || !env.LLM_RELAY_URL || !env.LLM_RELAY_KEY) return fallback;
  try {
    const text = await ask(env, JSON.stringify(req));
    if (text && faithful(text, req)) return { text, source: "model" };
  } catch (e) {
    console.warn("note model failed", e);
  }
  return fallback;
}

async function ask(env: NoteEnv, input: string): Promise<string> {
  const res = await fetch(`${env.LLM_RELAY_URL}/responses`, {
    method: "POST",
    signal: AbortSignal.timeout(20_000),
    headers: { "content-type": "application/json", "x-relay-key": env.LLM_RELAY_KEY!, "x-relay-collect": "1" },
    body: JSON.stringify({
      model: "gpt-5.5",
      reasoning: { effort: "low" },
      store: false,
      stream: true,
      instructions: SYSTEM,
      input: [{ role: "user", content: [{ type: "input_text", text: input }] }],
    }),
  });
  if (!res.ok) throw new Error(`relay ${res.status}`);
  const data: any = await res.json();
  return (data.output ?? [])
    .filter((o: any) => o.type === "message")
    .flatMap((o: any) => o.content ?? [])
    .filter((c: any) => c.type === "output_text")
    .map((c: any) => c.text)
    .join("")
    .trim();
}

/** Every number in the note appears in the request, and an improvement is never called a failure or vice versa. */
export function faithful(text: string, req: NoteRequest): boolean {
  const allowed = new Set<string>();
  const add = (v: unknown) => {
    if (typeof v === "number") {
      allowed.add(String(v));
      allowed.add(String(Math.abs(v)));
      allowed.add(Math.abs(v).toFixed(1).replace(/\.0$/, ""));
      allowed.add(String(Math.round(Math.abs(v))));
    } else if (typeof v === "string") {
      for (const n of v.match(/\d+(?:\.\d+)?/g) ?? []) allowed.add(n);
    } else if (Array.isArray(v)) v.forEach(add);
    else if (v && typeof v === "object") Object.values(v).forEach(add);
  };
  add(req);
  for (const n of text.match(/\d+(?:\.\d+)?/g) ?? []) {
    if (!allowed.has(n) && !allowed.has(String(Number(n)))) return false;
  }
  if (/\bMDC\b/i.test(text)) return false;
  if (req.kind === "checkin") {
    const lower = text.toLowerCase();
    if (req.overall === "working" && /not working|isn't working|no effect/.test(lower)) return false;
    if (req.overall === "not_working" && /\bis working\b|clearly working/.test(lower)) return false;
  }
  return text.length > 40 && text.length < 1200;
}

export function template(req: NoteRequest): Note {
  if (req.kind === "plan") {
    const actives = req.actives.length ? req.actives.join(", ") : "no ingredient we recognise";
    const targets = req.targets.length ? req.targets.join(", ").toLowerCase() : "the concerns you picked";
    const early = req.earlyEffects.length ? ` ${req.earlyEffects[0]}` : "";
    return {
      source: "template",
      text: `${req.product} contains ${actives}, so this trial watches ${targets}. Changes can start to show from week ${req.onsetWeeks}, and week ${req.fairWeeks} is the point where no change means it is not doing this for you.${early} Take your baseline photos before the first use, then one check-in a week in the same light.`,
    };
  }
  const parts: string[] = [];
  const by = (kind: string) => req.lines.filter((l) => l.verdict === kind);
  if (req.retake) parts.push(req.retake);
  const improving = by("improving");
  if (improving.length) parts.push(`${improving.map((l) => l.label).join(" and ")} improved by more than your photos' noise (${improving.map((l) => `${fmt(l.delta)} points vs. ${fmt(l.mdc)} needed`).join("; ")}).`);
  const worse = [...by("worse"), ...by("irritation")];
  if (worse.length) parts.push(`${worse.map((l) => l.label).join(" and ")} got worse beyond the noise. Consider pausing the product; if it continues, check with a dermatologist or pharmacist.`);
  const expected = by("expected_early_effect");
  if (expected.length) parts.push(expected[0].note ?? `${expected[0].label} dipped, which is common in the first weeks.`);
  const early = by("too_early");
  if (early.length) parts.push(`${early.map((l) => l.label).join(" and ")} have not moved beyond the noise yet, which is normal at week ${req.week}; a fair verdict is possible from ${early[0].fairOn}.`);
  const none = by("no_change");
  if (none.length) parts.push(`${none.map((l) => l.label).join(" and ")} show no change bigger than ${fmt(none[0].mdc)} points after the full trial window, so the product is not doing this for you.`);
  if (req.changes?.length) parts.push(`You noted ${req.changes.join(", ")} this week; that can move scores too.`);
  parts.push(`Next check-in: ${req.nextCheckIn}.`);
  return { source: "template", text: parts.join(" ") };
}

function fmt(v: number | null | undefined): string {
  return v == null ? "?" : Math.abs(v).toFixed(1).replace(/\.0$/, "");
}
