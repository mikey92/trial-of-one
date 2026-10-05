import type { ConcernId, Tier } from "../shared/concerns";

export interface ConcernScore { ui: number; raw: number; mask?: string }
export interface AnalyzeResult { scores: Partial<Record<ConcernId, ConcernScore>>; taskId: string; cached?: boolean }

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export async function analyze(photo: Blob, concerns: ConcernId[], tier: Tier): Promise<AnalyzeResult> {
  const q = new URLSearchParams({ tier, concerns: concerns.join(",") });
  const res = await fetch(`/api/analyze?${q}`, { method: "POST", headers: { "content-type": photo.type || "image/jpeg" }, body: photo });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error ?? `Analysis failed (${res.status})`, res.status);
  return data as AnalyzeResult;
}

export async function note(body: unknown): Promise<{ text: string; source: "model" | "template" }> {
  const res = await fetch("/api/note", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || typeof data.text !== "string") throw new ApiError(data.error ?? "Could not write the note", res.status);
  return data;
}
