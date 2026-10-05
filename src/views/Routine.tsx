import { useMemo, useState } from "react";
import { CONCERNS, type ConcernId } from "../../shared/concerns";
import { planRoutine, type ProductInput } from "../../shared/routine";

export const PREFILL_KEY = "trial-of-one:prefill";

export function Routine() {
  const [products, setProducts] = useState<ProductInput[]>([{ name: "", ingredients: "" }, { name: "", ingredients: "" }]);
  const [goals, setGoals] = useState<ConcernId[]>([]);
  const plan = useMemo(() => planRoutine(products, goals), [products, goals]);
  const set = (i: number, patch: Partial<ProductInput>) => setProducts(products.map((p, j) => (j === i ? { ...p, ...patch } : p)));

  function startFirst() {
    const first = plan.order[0];
    const p = products.find((x) => (x.name.trim() || "Unnamed product") === first?.name);
    if (!p) return;
    try {
      sessionStorage.setItem(PREFILL_KEY, JSON.stringify({ ...p, goals }));
    } catch {
      // Private mode: the form simply starts empty.
    }
    location.hash = "/new";
  }

  return (
    <div className="routine">
      <h1>Starting several products?</h1>
      <p className="lede">
        Start them together and you will never know which one did what. List them here and get an order to test them
        in, one fair trial after another, plus any combinations to keep apart.
      </p>

      <fieldset className="chips">
        <legend>What matters most to you? (pick in order)</legend>
        {CONCERNS.map((c) => {
          const i = goals.indexOf(c.id);
          return (
            <label key={c.id} className={`chip ${i >= 0 ? "on" : ""}`}>
              <input type="checkbox" checked={i >= 0} onChange={() => setGoals(i >= 0 ? goals.filter((g) => g !== c.id) : [...goals, c.id])} />
              {i >= 0 ? `${i + 1}. ` : ""}{c.label}
            </label>
          );
        })}
      </fieldset>

      {products.map((p, i) => (
        <fieldset key={i} className="product">
          <legend>Product {i + 1}</legend>
          <label className="field">
            <span>Name</span>
            <input value={p.name} onChange={(e) => set(i, { name: e.target.value })} />
          </label>
          <label className="field">
            <span>Ingredient list</span>
            <textarea rows={3} value={p.ingredients} onChange={(e) => set(i, { ingredients: e.target.value })} />
          </label>
          {plan.products.find((x) => x.name === (p.name.trim() || "Unnamed product")) && p.ingredients.trim() && (
            <p className="small muted">
              Actives: {plan.products.find((x) => x.name === (p.name.trim() || "Unnamed product"))!.actives.map((a) => a.name).join(", ") || "none recognised"}
            </p>
          )}
        </fieldset>
      ))}
      <button className="button ghost" onClick={() => setProducts([...products, { name: "", ingredients: "" }])}>Add another product</button>

      {plan.products.length > 1 && (
        <section aria-labelledby="order-h" className="plan-card">
          <h2 id="order-h">Test them in this order</h2>
          <ol className="timeline">
            {plan.order.map((o) => (
              <li key={o.name}>
                <strong>{o.name}</strong>: weeks {o.startWeek + 1}–{o.endWeek}. <span className="muted">{o.why}</span>
              </li>
            ))}
          </ol>
          <p className="small muted">
            {plan.totalWeeks} weeks in all. Keep a product that passes its trial in your routine while the next one is
            tested, so each new trial starts from a steady background.
          </p>
          {plan.clashes.length > 0 && (
            <>
              <h3>Keep apart</h3>
              <ul>{plan.clashes.map((c) => <li key={c.products.join("+")}><strong>{c.products.join(" + ")}</strong>: {c.message}</li>)}</ul>
            </>
          )}
          {plan.duplicates.length > 0 && (
            <>
              <h3>Doubled up</h3>
              <ul>{plan.duplicates.map((d) => <li key={d.active}>{d.active} is in {d.products.join(" and ")}. One is probably enough.</li>)}</ul>
            </>
          )}
          <button className="button primary" onClick={startFirst}>Start the first trial</button>
        </section>
      )}
    </div>
  );
}
