// Writes the example trial's closing note: the same request the app sends after a check-in,
// answered by the deployed app's note writer (model, checked against the numbers).
//
//   node scripts/demo_note.mjs https://trial-of-one.mikey9220.workers.dev
import { readFileSync, writeFileSync } from "node:fs";
import { createServer } from "vite";

const app = process.argv[2];
if (!app) throw new Error("usage: node scripts/demo_note.mjs <app url>");
const vite = await createServer({ configFile: false, server: { middlewareMode: true }, appType: "custom", logLevel: "error" });
try {
  const { assess, judgedAt, noteRequest } = await vite.ssrLoadModule("/src/trialMath.ts");
  const demo = JSON.parse(readFileSync("src/demo.json", "utf8"));
  const trial = { ...demo, demo: true, notes: [] };
  const req = noteRequest(trial, assess(trial));
  const res = await fetch(`${app}/api/note`, {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": "Mozilla/5.0 (trial-of-one demo builder)" },
    body: JSON.stringify(req),
  });
  const note = await res.json();
  if (note.source !== "model") throw new Error(`the note writer fell back to the template: ${JSON.stringify(note)}`);
  demo.notes = [{ at: judgedAt(trial).toISOString(), text: note.text, source: "model" }];
  writeFileSync("src/demo.json", JSON.stringify(demo, null, 1));
  console.log(JSON.stringify(req), "\n\n", note.text);
} finally {
  await vite.close();
}
