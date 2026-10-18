export const INPUT_LIMITS = Object.freeze({
  monthly_revenue: 1e12,
  monthly_costs: 1e12,
  gross_margin_pct: 100,
  hours_per_week: 168,
  hourly_cost: 1e8,
  revenue_growth_pct: 100,
  cost_reduction_pct: 100,
  automation_pct: 100,
  setup_cost: 1e12,
  monthly_tool_cost: 1e12,
});

/** Scenario model, not a prediction. Recovered staff time is never added to cash. */
export function calculateImpact(input = {}) {
  const n = (key) => {
    const value = Number(input?.[key]);
    return Number.isFinite(value) ? Math.max(0, Math.min(INPUT_LIMITS[key], value)) : 0;
  };
  const additionalGrossProfit = n("monthly_revenue") * n("revenue_growth_pct") / 100 * n("gross_margin_pct") / 100;
  const cashSavings = n("monthly_costs") * n("cost_reduction_pct") / 100;
  const monthlyToolCost = n("monthly_tool_cost");
  const cashMonthly = additionalGrossProfit + cashSavings - monthlyToolCost;
  const hoursSaved = n("hours_per_week") * 52 / 12 * n("automation_pct") / 100;
  const timeValue = hoursSaved * n("hourly_cost");
  const setupCost = n("setup_cost");
  // Zero here means no initial investment, not profitable operation.
  const paybackMonths = setupCost === 0 ? 0 : cashMonthly > 0 ? setupCost / cashMonthly : null;
  return { additionalGrossProfit, cashSavings, monthlyToolCost, cashMonthly, hoursSaved, timeValue, setupCost, paybackMonths, cashYearAfterSetup: cashMonthly * 12 - setupCost };
}

/** Compare like-for-like pilot observations without claiming causality. */
export function comparePilot(pilot) {
  const values = [pilot.baseline, pilot.target, pilot.actual];
  const hasValue = (value) => value !== "" && value !== null && value !== undefined;
  const valid = (value) => hasValue(value) && Number.isFinite(Number(value)) && Number(value) >= 0 && Number(value) <= 1e12;
  const [baseline, target, actual] = values.map(Number);
  const direction = pilot.direction;
  const invalidNumber = values.some((value) => hasValue(value) && !valid(value));
  const invalidDirection = !["higher", "lower"].includes(direction);
  const targetWrongDirection = valid(pilot.baseline) && valid(pilot.target) && !invalidDirection && (direction === "higher" ? target <= baseline : target >= baseline);
  const ready = values.every(valid) && !invalidDirection && !targetWrongDirection;
  return {
    ready,
    baseline,
    target,
    actual,
    improvement: ready ? (direction === "lower" ? baseline - actual : actual - baseline) : null,
    targetReached: ready && (direction === "lower" ? actual <= target : actual >= target),
    error: invalidNumber ? "Для сравнения нужны числа от 0 до 1 000 000 000 000." : invalidDirection ? "Выберите направление изменения показателя." : targetWrongDirection ? (direction === "higher" ? "Для цели «Больше — лучше» целевое значение должно быть выше исходного." : "Для цели «Меньше — лучше» целевое значение должно быть ниже исходного.") : "",
  };
}
