import { useEffect, useMemo, useState } from "react";
import { ACTIVES } from "../../shared/actives";
import { CONCERNS, type ConcernId } from "../../shared/concerns";
import { buildPlan } from "../../shared/plan";
import { note } from "../api";
import { newId, saveTrial } from "../store";
import { label, planRequest } from "../trialMath";
import type { Trial } from "../types";
import { PREFILL_KEY } from "./Routine";

export function NewTrial({ onCreated }: { onCreated: (t: Trial) => void }) {
  const [product, setProduct] = useState("");
  const [ingredients, setIngredients] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [goals, setGoals] = useState<ConcernId[]>([]);
  const [busy, setBusy] = useState(false);
  const plan = useMemo(
    () => buildPlan({ product, ingredients, activeIds: picked, goals }),
    [product, ingredients, picked, goals],
  );
  const found = plan.actives.filter((a) => !picked.includes(a.id));

  // Arriving from the routine planner: start with its first product.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(PREFILL_KEY);
      if (!raw) return;
      sessionStorage.removeItem(PREFILL_KEY);
      const v = JSON.parse(raw) as { name?: string; ingredients?: string; goals?: ConcernId[] };
      setProduct(v.name ?? "");
      setIngredients(v.ingredients ?? "");
      setGoals(v.goals ?? []);
    } catch {
      // Nothing to prefill.
    }
  }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!product.trim() || busy) return;
    setBusy(true);
    const trial: Trial = { id: newId(), createdAt: new Date().toISOString(), plan, scans: [], changes: [], notes: [] };
    try {
      const n = await note(planRequest(trial));
      trial.notes.push({ at: new Date().toISOString(), ...n });
    } catch {
      // The plan stands on its own; the note is a nicety.
    }
    await saveTrial(trial);
    onCreated(trial);
  }

  const toggle = <T,>(xs: T[], x: T) => (xs.includes(x) ? xs.filter((y) => y !== x) : [...xs, x]);

  return (
    <form className="new" onSubmit={create}>
      <h1>Plan a trial</h1>
      <p className="lede">One product at a time. If you are starting several, test them one after another.</p>

      <label className="field">
        <span>Product</span>
        <input value={product} onChange={(e) => setProduct(e.target.value)} placeholder="e.g. 10% niacinamide serum" required />
      </label>

      <label className="field">
        <span>Ingredient list <span className="muted">(paste it from the box or the shop page)</span></span>
        <textarea
          value={ingredients}
          onChange={(e) => setIngredients(e.target.value)}
          rows={4}
          placeholder="Aqua, Niacinamide, Pentylene Glycol, Zinc PCA, ..."
        />
      </label>
      {found.length > 0 && (
        <p className="found" aria-live="polite">
          Found: {found.map((a) => a.name).join(", ")}
        </p>
      )}

      <fieldset className="chips">
        <legend>No list to hand? Pick what it contains</legend>
        {ACTIVES.map((a) => (
          <label key={a.id} className={`chip ${picked.includes(a.id) ? "on" : ""}`}>
            <input type="checkbox" checked={picked.includes(a.id)} onChange={() => setPicked(toggle(picked, a.id))} />
            {a.name}
          </label>
        ))}
      </fieldset>

      <fieldset className="chips">
        <legend>What do you want it to do? <span className="muted">(optional)</span></legend>
        {CONCERNS.map((c) => (
          <label key={c.id} className={`chip ${goals.includes(c.id) ? "on" : ""}`}>
            <input type="checkbox" checked={goals.includes(c.id)} onChange={() => setGoals(toggle(goals, c.id))} />
            {c.label}
          </label>
        ))}
      </fieldset>

      <section className="plan-preview" aria-live="polite" aria-labelledby="pp">
        <h2 id="pp">The plan</h2>
        {plan.targets.length ? (
          <>
            <p>
              <strong>Measures:</strong> {plan.targets.map(label).join(", ")}. Everything else is scanned too, to catch
              side effects.
            </p>
            <p>
              <strong>Length:</strong> changes can show from week {plan.onsetWeeks}; a fair verdict needs {plan.fairWeeks}{" "}
              weeks. Ending sooner can miss a product that works.
            </p>
            {plan.earlyEffects.length > 0 && (
              <p><strong>Expect:</strong> {[...new Set(plan.earlyEffects.map((e) => e.note))].join(" ")}</p>
            )}
            {goals.some((g) => !plan.targets.includes(g)) && plan.actives.length > 0 && (
              <p className="warn">
                Nothing in this product is known for {goals.filter((g) => !plan.targets.includes(g)).map(label).join(", ").toLowerCase()},
                so the trial will not judge it on that.
              </p>
            )}
          </>
        ) : (
          <p className="muted">Add the ingredient list, pick an active, or choose a goal to see the plan.</p>
        )}
      </section>

      <button className="button primary" disabled={!product.trim() || !plan.targets.length || busy}>
        {busy ? "Setting up…" : "Create the trial"}
      </button>
    </form>
  );
}
