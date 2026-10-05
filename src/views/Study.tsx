import { CONCERN_BY_ID, type ConcernId } from "../../shared/concerns";
import STUDY from "../study.json";

// The perturbation study behind the noise floor: the same synthetic faces re-photographed
// in software (exposure, white balance, small tilts, JPEG quality, framing) and re-scored.
// Whatever moves under those edits is not skin.

interface Row { concern: ConcernId; capture: number; unchecked?: number; day: number; byEdit?: Record<string, number> }
interface StudyData {
  faces?: number;
  scans?: number;
  noise?: Record<string, { capture: number; day: number }>;
  rows?: Row[];
  edits?: string[];
  rejected?: string[];
  facesPerEdit?: Record<string, number>;
  naive?: { concern: ConcernId; before: number; after: number; edit: string };
}

const label = (c: ConcernId) => CONCERN_BY_ID[c].label.toLowerCase();

/** How much smaller a second photo per sitting makes the detectable change, at most. */
function secondPhotoGain(rows: Row[]): number {
  const gains = rows.map((r) => 1 - Math.sqrt((r.day ** 2 + r.capture ** 2 / 2) / (r.day ** 2 + r.capture ** 2)));
  return Math.max(0, ...gains);
}

/** For each edit, the concern it moved most on average across the faces that got it. */
function biggestShifts(rows: Row[], edits: string[]) {
  return edits.map((edit) => {
    let best: { concern: ConcernId; shift: number } | null = null;
    for (const r of rows) {
      const v = r.byEdit?.[edit];
      if (typeof v === "number" && (!best || Math.abs(v) > Math.abs(best.shift))) best = { concern: r.concern, shift: v };
    }
    return { edit, best };
  });
}

export function Study() {
  const data = STUDY as StudyData;
  const rows = data.rows ?? [];
  const rejected = new Set(data.rejected ?? []);
  const fmt = (n: number) => (n > 0 ? `+${n.toFixed(1)}` : n.toFixed(1));
  return (
    <article className="study">
      <h1>Why one before-and-after photo lies</h1>
      <p className="lede">
        A skin score is a measurement of a photo, not of skin. Change the light or the focus and the score moves even
        though the skin did not. Trial of One measures how much, and only reports changes bigger than that.
      </p>
      {rows.length === 0 ? (
        <p className="muted">The study results will appear here.</p>
      ) : (
        <>
          <p>
            We scored {data.faces} synthetic faces {data.scans} times with YouCam AI Skin Analysis: each face as
            generated, and after three software edits a real phone photo could plausibly have, one to the light, one to
            the framing and one to the camera ({data.edits?.join(", ")}). The skin is identical in every version, so
            whatever moves is the photo.
          </p>
          {data.naive && (
            <p className="callout">
              One example: the same face, scored as generated and again after the edit "{data.naive.edit}", went from{" "}
              {data.naive.before} to {data.naive.after} on {label(data.naive.concern)}. A before-and-after comparison
              would have called that a result.
              {rejected.has(data.naive.edit) && " Trial of One's photo check sends that photo back for a retake."}
            </p>
          )}
          <div className="table-wrap">
            <table>
              <caption>Score spread caused by the photo alone (standard deviation, points on the 0–100 scale)</caption>
              <thead>
                <tr>
                  <th scope="col">Concern</th>
                  <th scope="col">All edits</th>
                  <th scope="col">Photos that pass the check</th>
                  <th scope="col">Smallest change one photo can show</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.concern}>
                    <th scope="row">{CONCERN_BY_ID[r.concern].label}</th>
                    <td>{(r.unchecked ?? r.capture).toFixed(1)}</td>
                    <td>{r.capture.toFixed(1)}</td>
                    <td>{(1.96 * Math.SQRT2 * r.capture).toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="muted small">
            "Smallest change one photo can show" is the 95% minimal detectable change between two single photos that
            pass the check (1.96 × √2 × SD). A trial also has day-to-day changes in the skin itself to see through; it
            measures those from your three baseline days.
          </p>

          <h2>What moved the scores</h2>
          <div className="table-wrap">
            <table>
              <caption>Each edit's largest average shift, against the same face as generated</caption>
              <thead>
                <tr>
                  <th scope="col">Edit</th>
                  <th scope="col">Largest shift</th>
                  <th scope="col">Faces</th>
                  <th scope="col">Photo check</th>
                </tr>
              </thead>
              <tbody>
                {biggestShifts(rows, data.edits ?? []).map(({ edit, best }) => (
                  <tr key={edit}>
                    <th scope="row">{edit}</th>
                    <td>{best ? `${fmt(best.shift)} ${label(best.concern)}` : "—"}</td>
                    <td>{data.facesPerEdit?.[edit] ?? "—"}</td>
                    <td>{rejected.has(edit) ? "sent back" : "passes"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p>
            Focus mattered most. A blur too slight to notice on a phone screen flattered texture, and a check on a small
            copy of the photo could not see it, so the app measures sharpness at full detail. Light, framing and JPEG
            edits that pass the check moved most scores by a point or less; pores and acne moved most, so a trial needs
            the largest change on those before it calls one.
          </p>
          <p>
            Why one photo per sitting: with the check in place, a second photo would make the smallest detectable change
            at most {Math.round(secondPhotoGain(rows) * 100)}% smaller, and it would double the analyses a trial pays for.
          </p>
        </>
      )}
    </article>
  );
}
