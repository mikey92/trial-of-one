import { findActives, type Active } from "./actives";
import { CONCERN_BY_ID, type ConcernId } from "./concerns";

// Several new products at once is the most common reason nobody can tell what worked.
// The routine planner looks at everything someone wants to start, flags clashes and
// duplicates, and orders the products into back-to-back trials.

export interface ProductInput { name: string; ingredients: string }

export interface ProductInfo { name: string; actives: Active[]; targets: ConcernId[]; fairWeeks: number }

export interface Clash { products: [string, string]; message: string }

export interface RoutinePlan {
  products: ProductInfo[];
  clashes: Clash[];
  duplicates: { active: string; products: string[] }[];
  order: { name: string; startWeek: number; endWeek: number; why: string }[];
  totalWeeks: number;
}

const PAIRS: { a: string[]; b: string[]; message: string }[] = [
  { a: ["retinoid"], b: ["aha", "bha"], message: "A retinoid and an exfoliating acid together often irritate. Use them on different nights, and only once the retinoid trial is over." },
  { a: ["retinoid"], b: ["benzoyl_peroxide"], message: "Benzoyl peroxide can break down some retinoids and both dry the skin; dermatologists usually separate them (morning and evening)." },
  { a: ["vitamin_c"], b: ["benzoyl_peroxide"], message: "Benzoyl peroxide oxidises vitamin C; apply them at different times of day." },
  { a: ["aha"], b: ["bha"], message: "Two exfoliating acids at once raise the chance of irritation; start one, then the other." },
];

export function describe(p: ProductInput): ProductInfo {
  const actives = findActives(p.ingredients);
  return {
    name: p.name.trim() || "Unnamed product",
    actives,
    targets: [...new Set(actives.flatMap((a) => a.targets))],
    fairWeeks: actives.length ? Math.max(...actives.map((a) => a.fairWeeks)) : 8,
  };
}

export function planRoutine(inputs: ProductInput[], goals: ConcernId[]): RoutinePlan {
  const products = inputs.filter((p) => p.name.trim() || p.ingredients.trim()).map(describe);
  const clashes: Clash[] = [];
  for (let i = 0; i < products.length; i++) {
    for (let j = i + 1; j < products.length; j++) {
      const ids = (p: ProductInfo) => p.actives.map((a) => a.id);
      for (const pair of PAIRS) {
        const hit = (x: ProductInfo, y: ProductInfo) =>
          ids(x).some((id) => pair.a.includes(id)) && ids(y).some((id) => pair.b.includes(id));
        if (hit(products[i], products[j]) || hit(products[j], products[i])) {
          clashes.push({ products: [products[i].name, products[j].name], message: pair.message });
        }
      }
    }
  }
  const byActive = new Map<string, string[]>();
  for (const p of products) for (const a of p.actives) byActive.set(a.name, [...(byActive.get(a.name) ?? []), p.name]);
  const duplicates = [...byActive.entries()].filter(([, ps]) => ps.length > 1).map(([active, ps]) => ({ active, products: ps }));

  // First: the product aimed at the most important goal; among equals, the quickest fair test.
  const rank = (p: ProductInfo) => {
    const idx = goals.findIndex((g) => p.targets.includes(g));
    return [idx < 0 ? goals.length : idx, p.actives.length ? 0 : 1, p.fairWeeks] as const;
  };
  const sorted = [...products].sort((x, y) => {
    const a = rank(x), b = rank(y);
    return a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
  });
  let week = 0;
  const order = sorted.map((p) => {
    const goal = goals.find((g) => p.targets.includes(g));
    const why = !p.actives.length
      ? "No active we recognise, so it goes last."
      : goal
        ? `Aims at ${CONCERN_BY_ID[goal].label.toLowerCase()}, one of your goals; a fair test takes ${p.fairWeeks} weeks.`
        : `Not aimed at your goals; a fair test takes ${p.fairWeeks} weeks.`;
    const item = { name: p.name, startWeek: week, endWeek: week + p.fairWeeks, why };
    week += p.fairWeeks;
    return item;
  });
  return { products, clashes, duplicates, order, totalWeeks: week };
}
