// utils/trendCalc.ts is a byte for byte copy of the server's calc.ts, so the
// saving a technician sees while typing is the figure the server will store.
// Nothing ties the two repos together except these shared vectors (real Zoho
// days): the same file runs in the backend suite, and both must stay green.

import {
  CALC_VERSION,
  computeDay,
  type CategoryResult,
  type DayInput,
  type DayResult,
} from "../utils/trendCalc";

interface VectorCase {
  name: string;
  input: DayInput;
  expect: {
    categories: Record<string, Partial<CategoryResult> & { blocks?: { block_id: string; quantity: number }[] }>;
    rollup: Partial<DayResult["rollup"]>;
  };
}

const vectors = require("../utils/trendCalc.vectors.json") as { version: number; cases: VectorCase[] };

/** The computed day cut down to the fields a vector states, so one `toEqual` covers the case. */
function pickExpected(result: DayResult, expected: VectorCase["expect"]): VectorCase["expect"] {
  const categories: VectorCase["expect"]["categories"] = {};
  for (const [id, want] of Object.entries(expected.categories)) {
    const got = result.categories.find((c) => c.category === id) as CategoryResult;
    const picked: Record<string, unknown> = {};
    for (const key of Object.keys(want)) {
      picked[key] =
        key === "blocks"
          ? got.blocks.map((b) => ({ block_id: b.block_id, quantity: b.quantity }))
          : got[key as keyof CategoryResult];
    }
    categories[id] = picked;
  }
  const rollup: Record<string, unknown> = {};
  for (const key of Object.keys(expected.rollup)) rollup[key] = result.rollup[key as keyof DayResult["rollup"]];
  return { categories, rollup };
}

describe("trendCalc: shared Zoho vectors", () => {
  it("has cases to run", () => {
    expect(vectors.cases.length).toBeGreaterThan(50);
  });

  it.each(vectors.cases.map((c) => [c.name, c] as const))("%s matches Zoho", (_name, c) => {
    expect(pickExpected(computeDay(c.input), c.expect)).toEqual(c.expect);
  });

  it("carries the calculation version the vectors were built for", () => {
    expect(vectors.version).toBe(CALC_VERSION);
  });
});
