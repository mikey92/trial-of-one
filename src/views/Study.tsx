import { CONCERN_BY_ID, type ConcernId } from "../../shared/concerns";
import STUDY from "../study.json";

// The perturbation study behind the noise floor: the same synthetic faces re-photographed
// in software (exposure, white balance, small tilts, JPEG quality, framing) and re-scored.
// Whatever moves under those edits is not skin.

interface Row { concern: ConcernId; capture: number; day: number; byEdit?: Record<string, number> }
interface StudyData { faces?: number; scans?: number; noise?: Record<string, { capture: number; day: number }>; rows?: Row[]; edits?: string[]; naive?: { concern: ConcernId; before: number; after: number; edit: string } }

export function Study() {
  const data = STUDY as StudyData;
  const rows = data.rows ?? [];
  return (
    <article className="study">
      <h1>Why one before-and-after photo lies</h1>
      <p className="lede">
        A skin score is a measurement of a photo, not of skin. Change the light and the score moves even though the
        skin did not. Trial of One measures how much, and only reports changes bigger than that.
      </p>
      {rows.length === 0 ? (
        <p className="muted">The study results will appear here.</p>
      ) : (
        <>
          <p>
            We scored {data.faces} synthetic faces {data.scans} times with YouCam AI Skin Analysis, each time after a
            software edit a real phone photo could plausibly have: {data.edits?.join(", ")}. The table shows how far a
            score wandered with no change in the skin at all (standard deviation, in points on the 0–100 scale).
          </p>
          {data.naive && (
            <p className="callout">
              One example: the same face, scored once as taken and once with {data.naive.edit}, went from{" "}
              {data.naive.before} to {data.naive.after} on {CONCERN_BY_ID[data.naive.concern].label.toLowerCase()}. A
              before-and-after comparison would have called that a result.
            </p>
          )}
          <div className="table-wrap">
            <table>
              <caption>Score spread caused by the photo alone</caption>
              <thead>
                <tr>
                  <th scope="col">Concern</th>
                  <th scope="col">Spread across edits (SD)</th>
                  <th scope="col">Smallest change one photo can show</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.concern}>
                    <th scope="row">{CONCERN_BY_ID[r.concern].label}</th>
                    <td>{r.capture.toFixed(1)}</td>
                    <td>{(1.96 * Math.SQRT2 * r.capture).toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="muted small">
            "Smallest change one photo can show" is the 95% minimal detectable change between two single photos
            (1.96 × √2 × SD). Averaging two photos per sitting and three baseline days shrinks it, which is why a trial
            asks for them.
          </p>
        </>
      )}
    </article>
  );
}
