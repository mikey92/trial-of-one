import { useEffect, useRef, useState } from "react";
import type { ConcernId, Tier } from "../../shared/concerns";
import { analyze, ApiError } from "../api";
import { hdCapable, prepare } from "../image";
import { compare, measure, type Quality, type QualityIssue } from "../quality";
import { newId } from "../store";
import type { StoredScan, Trial } from "../types";

// One sitting: a few photos in a row, each checked on the device for light and focus
// against the trial's reference photo, then scored. Photos are not kept, only a small
// thumbnail on this device.

interface Props {
  trial: Trial;
  phase: StoredScan["phase"];
  photos: number;
  onDone: (scans: StoredScan[], reference?: Quality, tier?: Tier) => void;
  onCancel: () => void;
}

type Step =
  | { kind: "ready" }
  | { kind: "checking" }
  | { kind: "issues"; issues: QualityIssue[]; blob: Blob; quality: Quality; thumb: string; width: number; height: number }
  | { kind: "scoring" }
  | { kind: "error"; message: string };

export function Capture({ trial, phase, photos, onDone, onCancel }: Props) {
  const [scans, setScans] = useState<StoredScan[]>([]);
  const [step, setStep] = useState<Step>({ kind: "ready" });
  const [camera, setCamera] = useState<"off" | "on" | "denied">("off");
  const [reference, setReference] = useState<Quality | undefined>(trial.reference);
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const session = useRef(newId());
  const live = useRef<HTMLParagraphElement>(null);
  const tierRef = useRef<Tier>(trial.plan.tier);

  useEffect(() => () => stream.current?.getTracks().forEach((t) => t.stop()), []);

  async function startCamera() {
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1920 }, height: { ideal: 2560 } },
        audio: false,
      });
      if (video.current) {
        video.current.srcObject = stream.current;
        await video.current.play();
      }
      setCamera("on");
    } catch {
      setCamera("denied");
    }
  }

  async function snap() {
    const v = video.current;
    if (!v || !v.videoWidth) return;
    const c = document.createElement("canvas");
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    c.getContext("2d")!.drawImage(v, 0, 0);
    const blob = await new Promise<Blob | null>((r) => c.toBlob(r, "image/jpeg", 0.95));
    if (blob) await handle(blob);
  }

  async function handle(file: Blob) {
    setStep({ kind: "checking" });
    try {
      const p = await prepare(file);
      const quality = measure(p.bitmap, p.width, p.height);
      const issues = compare(quality, reference);
      if (issues.length) {
        setStep({ kind: "issues", issues, blob: p.blob, quality, thumb: p.thumb, width: p.width, height: p.height });
        return;
      }
      await score(p.blob, quality, p.thumb, p.width, p.height, false);
    } catch (e) {
      setStep({ kind: "error", message: e instanceof Error ? e.message : "Could not read that photo." });
    }
  }

  async function score(blob: Blob, quality: Quality, thumb: string, width: number, height: number, flagged: boolean) {
    setStep({ kind: "scoring" });
    // A trial keeps one tier so its scores compare. The first photo decides: a webcam that
    // cannot reach HD's 1080 px puts the whole trial on the standard (SD) concerns.
    const fresh = trial.scans.length === 0 && scans.length === 0;
    const tier: Tier = fresh ? (hdCapable(width, height) ? "hd" : "sd") : tierRef.current;
    if (tier === "hd" && !hdCapable(width, height)) {
      setStep({ kind: "error", message: "This photo is smaller than the ones this trial started with. Use the camera's full resolution (the phone's own camera app works best): the short side needs at least 1080 pixels." });
      return;
    }
    if (fresh) tierRef.current = tier;
    try {
      const res = await analyze(blob, trial.plan.tracked as ConcernId[], tier);
      const scores: StoredScan["scores"] = {};
      const raw: StoredScan["raw"] = {};
      for (const [k, v] of Object.entries(res.scores)) {
        if (!v) continue;
        scores[k as ConcernId] = v.ui;
        raw[k as ConcernId] = v.raw;
      }
      const scan: StoredScan = {
        id: newId(), takenAt: new Date().toISOString(), sessionId: session.current, phase, scores, raw, quality, thumb,
        ...(flagged ? { flagged: true } : {}),
      };
      const next = [...scans, scan];
      setScans(next);
      const ref = reference ?? (!flagged ? quality : undefined);
      if (!reference && ref) setReference(ref);
      if (live.current) live.current.textContent = `Photo ${next.length} of ${photos} scored.`;
      if (next.length >= photos) {
        stream.current?.getTracks().forEach((t) => t.stop());
        onDone(next, ref, tierRef.current);
      } else {
        setStep({ kind: "ready" });
      }
    } catch (e) {
      setStep({ kind: "error", message: e instanceof ApiError ? e.message : "The analysis did not go through. Check your connection and try again." });
    }
  }

  return (
    <section className="capture" aria-labelledby="cap">
      <h2 id="cap">{phase === "baseline" ? "Baseline photos" : "This week's check-in"}</h2>
      <p className="muted">
        Photo {Math.min(scans.length + 1, photos)} of {photos}. Face the window, bare face, hair back, phone at eye level.
      </p>
      <p ref={live} className="sr-only" aria-live="polite" />

      <div className="viewfinder" hidden={camera !== "on"}>
        <video ref={video} playsInline muted aria-label="Camera preview" />
        <div className="oval" aria-hidden="true" />
      </div>

      {step.kind === "ready" && (
        <div className="actions">
          {camera === "on" ? (
            <button className="button primary" onClick={snap}>Take photo</button>
          ) : (
            <button className="button primary" onClick={startCamera}>Use camera</button>
          )}
          <label className="button">
            Upload a photo
            <input
              type="file"
              accept="image/jpeg,image/png"
              capture="user"
              className="sr-only"
              onChange={(e) => e.target.files?.[0] && handle(e.target.files[0])}
            />
          </label>
          <button className="button ghost" onClick={onCancel}>Cancel</button>
        </div>
      )}
      {camera === "denied" && <p className="warn">The camera is blocked. Allow it in the browser, or upload a photo instead.</p>}
      {step.kind === "checking" && <p role="status">Checking light and focus…</p>}
      {step.kind === "scoring" && <p role="status">Scoring the photo with YouCam Skin Analysis… this takes a few seconds.</p>}
      {step.kind === "issues" && (
        <div className="issues" role="alert">
          <p><strong>Retake this one?</strong></p>
          <ul>{step.issues.map((i) => <li key={i.code}>{i.message}</li>)}</ul>
          <div className="actions">
            <button className="button primary" onClick={() => setStep({ kind: "ready" })}>Retake</button>
            <button className="button ghost" onClick={() => score(step.blob, step.quality, step.thumb, step.width, step.height, true)}>
              Use it anyway (it will not count towards the verdict)
            </button>
          </div>
        </div>
      )}
      {step.kind === "error" && (
        <div className="issues" role="alert">
          <p>{step.message}</p>
          <button className="button" onClick={() => setStep({ kind: "ready" })}>Try again</button>
        </div>
      )}
      {scans.length > 0 && (
        <ul className="thumbs" aria-label="Photos in this sitting">
          {scans.map((s, i) => <li key={s.id}><img src={s.thumb} alt={`Photo ${i + 1} of this sitting`} /></li>)}
        </ul>
      )}
    </section>
  );
}
