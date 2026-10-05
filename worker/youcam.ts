// YouCam AI Skin Analysis over the server-to-server API: register the file, upload it to
// the pre-signed URL, start the task, poll until it finishes. Units are only charged for
// tasks that succeed.

import { actionName, concernFromAction, type ConcernId, type Tier } from "../shared/concerns";

const BASE = "https://yce-api-01.makeupar.com/s2s/v2.0";

export interface ConcernScore { ui: number; raw: number; mask?: string }
export interface Analysis { scores: Partial<Record<ConcernId, ConcernScore>>; taskId: string }

export class YouCamError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string) {
    super(message);
  }
}

async function call(key: string, path: string, init: RequestInit = {}): Promise<any> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  const text = await res.text();
  let body: any = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    throw new YouCamError(`YouCam returned ${res.status}: ${text.slice(0, 200)}`, res.status);
  }
  if (!res.ok || (typeof body.status === "number" && body.status >= 400)) {
    throw new YouCamError(body.error ?? `YouCam returned ${res.status}`, body.status ?? res.status, body.error_code);
  }
  return body.data ?? body;
}

export async function uploadImage(key: string, bytes: ArrayBuffer, contentType: string): Promise<string> {
  const ext = contentType === "image/png" ? "png" : "jpg";
  const data = await call(key, "/file", {
    method: "POST",
    body: JSON.stringify({ files: [{ content_type: contentType, file_name: `scan.${ext}`, file_size: bytes.byteLength }] }),
  });
  const file = data.files?.[0];
  const put = file?.requests?.[0];
  if (!file?.file_id || !put?.url) throw new YouCamError("YouCam did not return an upload URL", 502);
  const res = await fetch(put.url, { method: put.method ?? "PUT", headers: put.headers ?? { "Content-Type": contentType }, body: bytes });
  if (!res.ok) throw new YouCamError(`Upload to YouCam storage failed (${res.status})`, 502);
  return file.file_id as string;
}

export async function startAnalysis(key: string, fileId: string, concerns: ConcernId[], tier: Tier): Promise<string> {
  const data = await call(key, "/task/skin-analysis", {
    method: "POST",
    body: JSON.stringify({
      src_file_id: fileId,
      dst_actions: concerns.map((c) => actionName(c, tier)),
      miniserver_args: { enable_mask_overlay: false },
      format: "json",
    }),
  });
  if (!data.task_id) throw new YouCamError("YouCam did not return a task id", 502);
  return data.task_id as string;
}

export async function pollAnalysis(key: string, taskId: string, deadlineMs: number): Promise<Analysis> {
  let wait = 800;
  while (Date.now() < deadlineMs) {
    const data = await call(key, `/task/skin-analysis/${encodeURIComponent(taskId)}`);
    const status = data.task_status ?? data.status;
    if (status === "success") return { scores: parseScores(data.results), taskId };
    if (status === "error") {
      throw new YouCamError(data.error ?? data.error_message ?? "YouCam could not analyse this photo", 422, data.error_code);
    }
    await new Promise((r) => setTimeout(r, wait));
    wait = Math.min(wait * 1.5, 3000);
  }
  throw new YouCamError("The analysis is taking longer than expected; try again in a minute", 504);
}

/** Units one analysis costs: YouCam prices it by tier and by how many concerns it scores. */
export function analysisCost(tier: Tier, concerns: number): number {
  const steps = tier === "hd" ? [12, 16, 20, 22] : [9, 12, 14, 16];
  return steps[Math.min(Math.max(Math.ceil(concerns / 4), 1), steps.length) - 1];
}

/** Units left on the account, counting only credit that has not expired. */
export async function unitsLeft(key: string, now = Date.now()): Promise<number> {
  const res = await fetch("https://yce-api-01.makeupar.com/s2s/v1.0/client/credit", { headers: { Authorization: `Bearer ${key}` } });
  const body: any = await res.json().catch(() => ({}));
  if (!res.ok || !Array.isArray(body.results)) throw new YouCamError(`YouCam returned ${res.status} for the unit balance`, 502);
  return body.results
    .filter((c: any) => !c.expiry || c.expiry > now)
    .reduce((sum: number, c: any) => sum + Number(c.amount_dec ?? c.amount ?? 0), 0);
}

export function parseScores(results: any): Analysis["scores"] {
  const out: Analysis["scores"] = {};
  const list: any[] = Array.isArray(results?.output) ? results.output : Array.isArray(results) ? results : [];
  for (const item of list) {
    const id = concernFromAction(String(item.type ?? ""));
    // Pores and wrinkles also come per face region (forehead, cheek, ...); the trial tracks the whole face.
    if (!id || typeof item.ui_score !== "number" || (item.region && item.region !== "whole")) continue;
    out[id] = { ui: item.ui_score, raw: typeof item.raw_score === "number" ? item.raw_score : item.ui_score, mask: item.mask_urls?.[0] };
  }
  return out;
}
