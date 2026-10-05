import { useEffect, useRef, useState } from "react";
import type { ConcernId } from "../shared/concerns";
import { changeFor, sessionMeans, type NoisePrior, type Scan, WEEK_MS } from "../shared/stats";

// One concern over the trial: baseline sessions on the left, the band the scores would
// wander in with no real change (baseline mean ± minimal detectable change), and the
// weekly check-ins. A dot outside the band is a change the photos can actually show.

interface Props { scans: Scan[]; concern: ConcernId; label: string; startedAt: string | null; fairWeeks: number; prior?: NoisePrior }

const H = 200, PAD = { l: 36, r: 12, t: 14, b: 28 };

/** Draw at the container's real width so labels keep their size on a phone. */
function useWidth(): [React.RefObject<HTMLElement | null>, number] {
  const ref = useRef<HTMLElement | null>(null);
  const [w, setW] = useState(560);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

export function ConcernChart({ scans, concern, label, startedAt, fairWeeks, prior }: Props) {
  const [ref, W] = useWidth();
  const sessions = sessionMeans(scans, concern);
  if (!sessions.length) return null;
  const change = changeFor(scans, concern, prior);
  const start = startedAt ? Date.parse(startedAt) : sessions[sessions.length - 1].at;
  const weeksOf = (t: number) => (t - start) / WEEK_MS;
  const xs = sessions.map((s) => weeksOf(s.at));
  const xMin = Math.min(-1, ...xs), xMax = Math.max(fairWeeks, ...xs);
  const ys = sessions.map((s) => s.mean);
  const base = change?.baseline ?? ys[0];
  const band = change?.mdc ?? 0;
  const yLo = Math.max(0, Math.floor(Math.min(...ys, base - band) - 4));
  const yHi = Math.min(100, Math.ceil(Math.max(...ys, base + band) + 4));
  const x = (v: number) => PAD.l + ((v - xMin) / (xMax - xMin)) * (W - PAD.l - PAD.r);
  const y = (v: number) => PAD.t + (1 - (v - yLo) / Math.max(yHi - yLo, 1)) * (H - PAD.t - PAD.b);
  const ticks = [yLo, Math.round((yLo + yHi) / 2), yHi];
  const weekTicks = [0, Math.round(fairWeeks / 2), fairWeeks];
  const trial = sessions.filter((s) => s.phase === "trial");
  const desc = change
    ? `${label}: baseline ${base.toFixed(1)}, now ${change.current.toFixed(1)}, change ${change.delta >= 0 ? "+" : ""}${change.delta.toFixed(1)} points; changes smaller than ${change.mdc.toFixed(1)} points are within photo noise.`
    : `${label}: baseline ${base.toFixed(1)} from ${sessions.length} session${sessions.length > 1 ? "s" : ""}.`;
  return (
    <figure className="chart" ref={ref as React.RefObject<HTMLElement>}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={desc}>
        {band > 0 && (
          <rect x={PAD.l} width={W - PAD.l - PAD.r} y={y(base + band)} height={Math.max(1, y(base - band) - y(base + band))} className="band" />
        )}
        <line x1={PAD.l} x2={W - PAD.r} y1={y(base)} y2={y(base)} className="baseline" />
        {startedAt && <line x1={x(0)} x2={x(0)} y1={PAD.t} y2={H - PAD.b} className="start" />}
        {ticks.map((t) => (
          <text key={t} x={PAD.l - 6} y={y(t) + 4} className="tick" textAnchor="end">{t}</text>
        ))}
        {startedAt && weekTicks.map((w) => (
          <text key={w} x={x(w)} y={H - 8} className="tick" textAnchor={x(w) > W - PAD.r - 24 ? "end" : "middle"}>
            {w === 0 ? "start" : `wk ${w}`}
          </text>
        ))}
        {trial.length > 1 && (
          <polyline className="line" points={trial.map((s) => `${x(weeksOf(s.at))},${y(s.mean)}`).join(" ")} />
        )}
        {sessions.map((s) => (
          <circle
            key={s.sessionId}
            cx={x(weeksOf(s.at))}
            cy={y(s.mean)}
            r={4}
            className={s.phase === "baseline" ? "dot base" : Math.abs(s.mean - base) > band ? "dot out" : "dot in"}
          />
        ))}
      </svg>
      <figcaption>{desc}</figcaption>
    </figure>
  );
}
