import assert from "node:assert/strict";
import test from "node:test";

import { calculateImpact, comparePilot, INPUT_LIMITS } from "../frontend/src/businessMath.js";

const base = {
  monthly_revenue: 3_000_000,
  monthly_costs: 1_200_000,
  gross_margin_pct: 35,
  hours_per_week: 20,
  hourly_cost: 2_000,
  revenue_growth_pct: 5,
  cost_reduction_pct: 4,
  automation_pct: 50,
  setup_cost: 150_000,
  monthly_tool_cost: 15_000,
};

test("impact separates cash effect from released-time capacity", () => {
  const result = calculateImpact(base);
  assert.equal(result.additionalGrossProfit, 52_500);
  assert.equal(result.cashSavings, 48_000);
  assert.equal(result.cashMonthly, 85_500);
  assert.ok(Math.abs(result.hoursSaved - 43.3333333333) < 1e-6);
  assert.ok(Math.abs(result.timeValue - 86_666.6666667) < 1e-6);
  assert.equal(result.cashYearAfterSetup, 876_000);
});

test("payback is unavailable for non-positive monthly cash effect", () => {
  const result = calculateImpact({ ...base, revenue_growth_pct: 0, cost_reduction_pct: 0, monthly_tool_cost: 20_000 });
  assert.equal(result.cashMonthly, -20_000);
  assert.equal(result.paybackMonths, null);
});

test("zero setup cost has zero payback without implying positive cash", () => {
  const result = calculateImpact({ ...base, setup_cost: 0, revenue_growth_pct: 0, cost_reduction_pct: 0, monthly_tool_cost: 20_000 });
  assert.equal(result.paybackMonths, 0);
  assert.equal(result.cashMonthly, -20_000);
});

test("invalid and excessive inputs are clamped to the documented range", () => {
  const result = calculateImpact({ ...base, monthly_revenue: INPUT_LIMITS.monthly_revenue * 2, revenue_growth_pct: 500, monthly_costs: -1, hours_per_week: "bad" });
  assert.equal(result.additionalGrossProfit, INPUT_LIMITS.monthly_revenue * 0.35);
  assert.equal(result.cashSavings, 0);
  assert.equal(result.hoursSaved, 0);
});

test("higher-is-better pilot recognizes success and improvement", () => {
  const result = comparePilot({ baseline: "40", target: "55", actual: "62", direction: "higher" });
  assert.equal(result.ready, true);
  assert.equal(result.targetReached, true);
  assert.equal(result.improvement, 22);
});

test("lower-is-better pilot recognizes success", () => {
  const result = comparePilot({ baseline: 12, target: 8, actual: 7, direction: "lower" });
  assert.equal(result.ready, true);
  assert.equal(result.targetReached, true);
  assert.equal(result.improvement, 5);
});

test("pilot rejects target pointing in the wrong direction", () => {
  const result = comparePilot({ baseline: 40, target: 30, actual: 32, direction: "higher" });
  assert.equal(result.ready, false);
  assert.match(result.error, /выше исходного/);
});

test("pilot distinguishes incomplete from invalid values", () => {
  assert.equal(comparePilot({ baseline: "", target: "", actual: "", direction: "higher" }).error, "");
  assert.match(comparePilot({ baseline: "ten", target: 12, actual: 11, direction: "higher" }).error, /числа/);
});
