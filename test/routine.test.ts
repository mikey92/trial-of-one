import { describe, expect, it } from "vitest";
import { planRoutine } from "../shared/routine";

const serum = { name: "Night serum", ingredients: "Aqua, Squalane, Retinol, Tocopherol" };
const toner = { name: "Glow toner", ingredients: "Aqua, Glycolic Acid, Glycerin" };
const niacin = { name: "Niacinamide 10%", ingredients: "Aqua, Niacinamide, Zinc PCA" };
const niacin2 = { name: "Barrier cream", ingredients: "Aqua, Niacinamide, Ceramide NP" };

describe("routine planner", () => {
  it("flags a retinoid with an exfoliating acid", () => {
    const plan = planRoutine([serum, toner], ["wrinkle"]);
    expect(plan.clashes).toHaveLength(1);
    expect(plan.clashes[0].products).toEqual(["Night serum", "Glow toner"]);
  });

  it("finds the same active in two products", () => {
    const plan = planRoutine([niacin, niacin2], ["redness"]);
    expect(plan.duplicates).toEqual([{ active: "Niacinamide", products: ["Niacinamide 10%", "Barrier cream"] }]);
  });

  it("orders trials by the person's goals, then by how quickly a test is fair", () => {
    const plan = planRoutine([serum, toner, niacin], ["age_spot"]);
    // All three aim at dark spots; niacinamide (8 weeks) before the acid (12) before the retinoid (24).
    expect(plan.order.map((o) => o.name)).toEqual(["Niacinamide 10%", "Glow toner", "Night serum"]);
    expect(plan.order[1].startWeek).toBe(8);
    expect(plan.totalWeeks).toBe(8 + 12 + 24);
  });

  it("puts products with no recognised active last", () => {
    const plan = planRoutine([{ name: "Plain lotion", ingredients: "Aqua, Glycerin" }, niacin], ["oiliness"]);
    expect(plan.order[plan.order.length - 1].name).toBe("Plain lotion");
  });
});
