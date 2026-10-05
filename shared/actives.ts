import type { ConcernId } from "./concerns";

// What a trial expects from each kind of active ingredient: which tracked concerns it is
// meant to move, how many weeks a fair test takes, and what can happen on the way.
// Weeks come from the length of the published trials (cited where we checked the
// paper) or, where no single trial is cited, from the usual duration of studies of that
// ingredient class. They set when a verdict becomes fair, not a promise of results.

export interface Active {
  id: string;
  name: string;
  /** Lower-case INCI names and common label spellings that identify it. */
  match: string[];
  targets: ConcernId[];
  /** Earliest week a change can reasonably show. */
  onsetWeeks: number;
  /** Week by which a trial should have shown it; no change by then means it is not working for you. */
  fairWeeks: number;
  /** Effects in the first weeks that are expected and not a reason to stop. */
  earlyEffects?: { concern: ConcernId; untilWeek: number; note: string }[];
  evidence?: string;
}

export const ACTIVES: Active[] = [
  {
    id: "retinoid",
    name: "Retinoid (retinol, retinal, adapalene)",
    match: ["retinol", "retinal", "retinaldehyde", "retinyl palmitate", "retinyl retinoate",
      "hydroxypinacolone retinoate", "adapalene", "tretinoin"],
    targets: ["wrinkle", "texture", "age_spot", "acne"],
    onsetWeeks: 8,
    fairWeeks: 24,
    earlyEffects: [
      { concern: "redness", untilWeek: 6, note: "Retinoids often cause redness and flaking for the first few weeks while skin adjusts." },
      { concern: "moisture", untilWeek: 6, note: "Dryness in the first weeks is a known retinoid effect." },
    ],
    evidence: "Kafi et al., Arch Dermatol 2007: 0.4% retinol improved fine wrinkles over 24 weeks. Dhaliwal et al., Br J Dermatol 2019: 0.5% retinol reduced wrinkles and pigmentation over 12 weeks.",
  },
  {
    id: "vitamin_c",
    name: "Vitamin C (ascorbic acid and derivatives)",
    match: ["ascorbic acid", "l-ascorbic acid", "sodium ascorbyl phosphate", "magnesium ascorbyl phosphate",
      "ascorbyl glucoside", "tetrahexyldecyl ascorbate", "ethyl ascorbic acid", "3-o-ethyl ascorbic acid"],
    targets: ["age_spot", "radiance", "wrinkle"],
    onsetWeeks: 4,
    fairWeeks: 12,
    evidence: "Fitzpatrick & Rostan, Dermatol Surg 2002: a 10% ascorbic acid complex visibly improved wrinkling at 12 weeks.",
  },
  {
    id: "niacinamide",
    name: "Niacinamide",
    match: ["niacinamide", "nicotinamide"],
    targets: ["age_spot", "oiliness", "redness", "pore", "radiance"],
    onsetWeeks: 2,
    fairWeeks: 8,
    evidence: "Hakozaki et al., Br J Dermatol 2002: 5% niacinamide reduced hyperpigmentation within 4 weeks. Draelos et al., J Cosmet Laser Ther 2006: 2% niacinamide lowered sebum excretion at 2 and 4 weeks.",
  },
  {
    id: "azelaic_acid",
    name: "Azelaic acid",
    match: ["azelaic acid", "potassium azeloyl diglycinate"],
    targets: ["redness", "acne", "age_spot"],
    onsetWeeks: 4,
    fairWeeks: 12,
    evidence: "Thiboutot et al., J Am Acad Dermatol 2003: 15% azelaic acid gel improved rosacea redness and lesions over 12 weeks.",
  },
  {
    id: "aha",
    name: "Alpha hydroxy acids (glycolic, lactic, mandelic)",
    // Not citric, malic or tartaric acid: most labels use them in traces to set the pH.
    match: ["glycolic acid", "lactic acid", "mandelic acid"],
    targets: ["texture", "radiance", "age_spot"],
    onsetWeeks: 2,
    fairWeeks: 12,
    earlyEffects: [{ concern: "redness", untilWeek: 3, note: "Exfoliating acids can cause mild redness at first." }],
  },
  {
    id: "bha",
    name: "Salicylic acid (BHA)",
    match: ["salicylic acid", "betaine salicylate", "willow bark extract"],
    targets: ["acne", "pore", "oiliness", "texture"],
    onsetWeeks: 2,
    fairWeeks: 8,
  },
  {
    id: "benzoyl_peroxide",
    name: "Benzoyl peroxide",
    match: ["benzoyl peroxide"],
    targets: ["acne"],
    onsetWeeks: 2,
    fairWeeks: 12,
    earlyEffects: [
      { concern: "redness", untilWeek: 4, note: "Benzoyl peroxide often irritates and dries skin at first." },
      { concern: "moisture", untilWeek: 4, note: "Dryness is a common early benzoyl peroxide effect." },
    ],
  },
  {
    id: "brightener",
    name: "Brightening agents (tranexamic acid, arbutin, kojic acid, licorice)",
    match: ["tranexamic acid", "alpha-arbutin", "arbutin", "kojic acid", "glycyrrhiza glabra root extract",
      "licorice root extract", "hexylresorcinol", "4-butylresorcinol"],
    targets: ["age_spot", "radiance"],
    onsetWeeks: 4,
    fairWeeks: 12,
  },
  {
    id: "bakuchiol",
    name: "Bakuchiol",
    match: ["bakuchiol"],
    targets: ["wrinkle", "age_spot", "texture"],
    onsetWeeks: 4,
    fairWeeks: 12,
    evidence: "Dhaliwal et al., Br J Dermatol 2019: 0.5% bakuchiol reduced wrinkle area and pigmentation over 12 weeks, comparable to retinol.",
  },
  {
    id: "peptides",
    name: "Peptides",
    match: ["palmitoyl pentapeptide-4", "palmitoyl tripeptide-1", "palmitoyl tetrapeptide-7",
      "acetyl hexapeptide-8", "argireline", "copper tripeptide-1", "matrixyl"],
    targets: ["wrinkle", "firmness"],
    onsetWeeks: 4,
    fairWeeks: 12,
  },
  {
    id: "humectant",
    name: "Hydrators (hyaluronic acid, ceramides, urea)",
    // Not glycerin or panthenol: nearly every product contains them, so they say nothing
    // about what this one is for.
    match: ["sodium hyaluronate", "hyaluronic acid", "hydrolyzed hyaluronic acid", "ceramide np", "ceramide ap",
      "ceramide eop", "urea"],
    targets: ["moisture", "texture"],
    onsetWeeks: 1,
    fairWeeks: 4,
  },
  {
    id: "soothing",
    name: "Soothing agents (centella, allantoin, oat)",
    match: ["centella asiatica extract", "madecassoside", "asiaticoside", "allantoin", "avena sativa kernel extract",
      "colloidal oatmeal", "bisabolol"],
    targets: ["redness", "moisture"],
    onsetWeeks: 1,
    fairWeeks: 6,
  },
  {
    id: "caffeine",
    name: "Caffeine (eye products)",
    match: ["caffeine"],
    targets: ["eye_bag", "dark_circle"],
    onsetWeeks: 2,
    fairWeeks: 8,
  },
];

export const ACTIVE_BY_ID: Record<string, Active> = Object.fromEntries(ACTIVES.map((a) => [a.id, a]));

/** Actives named in an ingredient list (INCI or a plain list), in label order. */
export function findActives(ingredients: string): Active[] {
  const text = ` ${ingredients.toLowerCase().replace(/[\n;•·|]+/g, ",").replace(/\s+/g, " ")} `;
  const hits: { active: Active; at: number }[] = [];
  for (const active of ACTIVES) {
    let best = -1;
    for (const m of active.match) {
      const re = new RegExp(`(^|[^a-z0-9-])${m.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9-]|$)`);
      const found = re.exec(text);
      if (found && (best < 0 || found.index < best)) best = found.index;
    }
    if (best >= 0) hits.push({ active, at: best });
  }
  return hits.sort((a, b) => a.at - b.at).map((h) => h.active);
}
