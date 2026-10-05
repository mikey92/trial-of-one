import { CONCERNS, type ConcernId, type Tier } from "../shared/concerns";
import { writeNote, type NoteRequest } from "./agent";
import { pollAnalysis, startAnalysis, uploadImage, YouCamError, type Analysis } from "./youcam";

export interface Env {
  ASSETS: Fetcher;
  CACHE: KVNamespace;
  ANALYZE_LIMIT: RateLimit;
  NOTE_LIMIT: RateLimit;
  YOUCAM_API_KEY: string;
  LLM_RELAY_URL?: string;
  LLM_RELAY_KEY?: string;
  /** Analyses allowed per UTC day across all visitors; protects the hackathon's API units. */
  DAILY_ANALYSES?: string;
}

const MAX_BYTES = 8 * 1024 * 1024;
const ALL: ConcernId[] = CONCERNS.map((c) => c.id);

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    try {
      if (url.pathname === "/api/analyze" && req.method === "POST") return await analyze(req, env, url);
      if (url.pathname === "/api/note" && req.method === "POST") return await note(req, env);
      if (url.pathname === "/api/health") return json({ ok: true });
      if (url.pathname.startsWith("/api/")) return json({ error: "Not found" }, 404);
      return env.ASSETS.fetch(req);
    } catch (e) {
      if (e instanceof YouCamError) return json({ error: e.message, code: e.code }, e.status >= 400 && e.status < 600 ? e.status : 502);
      console.error(e);
      return json({ error: "Something went wrong on our side." }, 500);
    }
  },
};

async function analyze(req: Request, env: Env, url: URL): Promise<Response> {
  const ip = req.headers.get("cf-connecting-ip") ?? "anon";
  if (!(await env.ANALYZE_LIMIT.limit({ key: ip })).success) {
    return json({ error: "Too many photos in a minute. Wait a moment and try again." }, 429);
  }
  const type = req.headers.get("content-type") ?? "";
  if (!/^image\/(jpeg|png)$/.test(type)) return json({ error: "Send a JPEG or PNG photo." }, 415);
  const bytes = await req.arrayBuffer();
  if (!bytes.byteLength || bytes.byteLength > MAX_BYTES) return json({ error: "The photo must be under 8 MB." }, 413);
  const tier: Tier = url.searchParams.get("tier") === "sd" ? "sd" : "hd";
  const asked = (url.searchParams.get("concerns") ?? "").split(",").filter((c): c is ConcernId => ALL.includes(c as ConcernId));
  const concerns = asked.length ? asked : ALL;

  // The same photo always gets the same answer, without spending another unit.
  const digest = await sha256(bytes);
  const cacheKey = `scan:${tier}:${[...concerns].sort().join(",")}:${digest}`;
  const cached = await env.CACHE.get<Analysis>(cacheKey, "json");
  if (cached) return json({ ...cached, cached: true });

  const today = new Date().toISOString().slice(0, 10);
  const budgetKey = `budget:${today}`;
  const used = Number((await env.CACHE.get(budgetKey)) ?? 0);
  if (used >= Number(env.DAILY_ANALYSES ?? 150)) {
    return json({ error: "Today's free analyses are used up. The demo trial still works, and new scans open again tomorrow (UTC)." }, 503);
  }

  const key = env.YOUCAM_API_KEY;
  const fileId = await uploadImage(key, bytes, type);
  const taskId = await startAnalysis(key, fileId, concerns, tier);
  const result = await pollAnalysis(key, taskId, Date.now() + 60_000);
  await env.CACHE.put(budgetKey, String(used + 1), { expirationTtl: 3 * 86400 });
  // Mask URLs expire within a day on YouCam's side; scores are what the trial keeps.
  await env.CACHE.put(cacheKey, JSON.stringify(result), { expirationTtl: 20 * 3600 });
  return json(result);
}

async function note(req: Request, env: Env): Promise<Response> {
  const ip = req.headers.get("cf-connecting-ip") ?? "anon";
  const body = (await req.json().catch(() => null)) as NoteRequest | null;
  if (!body || typeof body !== "object" || !body.kind) return json({ error: "Bad request" }, 400);
  const allowed = (await env.NOTE_LIMIT.limit({ key: ip })).success;
  return json(await writeNote(body, env, allowed));
}

async function sha256(bytes: ArrayBuffer): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}
