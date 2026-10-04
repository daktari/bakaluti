import { describe, expect, it } from "vitest";
import { arrangementPlan, planSeconds } from "./arrange";

describe("arrangement plan", () => {
  it("lays intro, middle states, the full picture and an outro in 4-bar phrases", () => {
    const plan = arrangementPlan(["a", "b", "c", "d"], 240, 134);
    expect(plan.map((s) => s.code)).toEqual(["a", "b", "c", "d", "c"]);
    for (const s of plan) expect(s.bars % 4).toBe(0);
    // ~240 s at 134 bpm ≈ 134 bars → 132 or 136 after phrasing
    expect(Math.abs(planSeconds(plan, 134) - 240)).toBeLessThan(10);
    const full = plan[3].bars;
    expect(full).toBeGreaterThan(plan[0].bars);
    expect(full).toBeGreaterThan(plan[4].bars);
  });

  it("handles one and two states", () => {
    expect(arrangementPlan(["x"], 60, 120)).toEqual([{ code: "x", bars: 32 }]);
    const two = arrangementPlan(["in", "full"], 180, 120);
    expect(two.map((s) => s.code)).toEqual(["in", "full", "in"]);
  });
});
