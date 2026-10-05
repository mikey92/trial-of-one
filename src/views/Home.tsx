import type { Trial } from "../types";
import { assess } from "../trialMath";
import { VerdictBadge } from "../Verdict";

export function Home({ trials }: { trials: Trial[] }) {
  return (
    <div className="home">
      <section className="hero">
        <h1>Is your skincare actually working?</h1>
        <p className="lede">
          The mirror can't tell you. Light, angle, sleep and last week's breakout move what you see more than most
          serums do in a month. Trial of One runs a small, fair experiment on one product at a time, with
          YouCam's AI Skin Analysis as the measuring tape, and tells you when the change is real.
        </p>
        <div className="actions">
          <a className="button primary" href="#/new">Start a trial</a>
          <a className="button" href="#/demo">See a finished trial</a>
          <a className="button ghost" href="#/routine">Starting several products?</a>
        </div>
      </section>

      {trials.length > 0 && (
        <section aria-labelledby="mine">
          <h2 id="mine">Your trials</h2>
          <ul className="cards">
            {trials.map((t) => {
              const a = assess(t);
              return (
                <li key={t.id} className="card">
                  <a href={`#/trial/${t.id}`} className="card-link">
                    <span className="card-title">{t.plan.product}</span>
                    <span className="muted">
                      {t.plan.startedAt ? `Week ${a.week} of ${t.plan.fairWeeks}` : "Baseline in progress"}
                    </span>
                    <VerdictBadge verdict={a.verdict} />
                  </a>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section aria-labelledby="how" className="how">
        <h2 id="how">How a trial works</h2>
        <ol className="steps">
          <li>
            <strong>Plan.</strong> Paste the ingredient list. Trial of One finds the actives, picks the skin scores
            they are meant to move, and works out how many weeks a fair test takes (a retinoid needs months; a
            hydrator, days).
          </li>
          <li>
            <strong>Baseline.</strong> Before the first use, take one photo on each of three days. That measures how
            much your scores wobble when nothing changes.
          </li>
          <li>
            <strong>Check in weekly.</strong> Same window, same time, one photo. It is checked for light and focus
            against your baseline before it is scored, and sent back if it would not compare.
          </li>
          <li>
            <strong>Verdict.</strong> A score only counts as changed when it moves further than your own noise. You get
            "working", "not working for you", "too early" or "stop and check", with the numbers behind it.
          </li>
        </ol>
      </section>
    </div>
  );
}
