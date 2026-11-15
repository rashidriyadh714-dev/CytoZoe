/**
 * E2 — Deterministic Health Comparisons Engine
 * Descriptive only: a baseline deviation is never an abnormality threshold and no disease label is produced.
 * Values are never rounded here; rounding happens only at presentation.
 */

export const RULE_VERSION = "health-compare-v1";
export const MIN_BASELINE_N = 2;

export const BELOW = "BELOW_SUPPLIED_LOWER_BOUND";
export const ABOVE = "ABOVE_SUPPLIED_UPPER_BOUND";
export const WITHIN = "WITHIN_SUPPLIED_RANGE";
export const ONE_SIDED = "ONE_SIDED_COMPARISON";
export const UNKNOWN = "UNKNOWN";

export type RangeStatus =
  | typeof BELOW
  | typeof ABOVE
  | typeof WITHIN
  | typeof ONE_SIDED
  | typeof UNKNOWN;

export function rangeStatus(
  value: number | null | undefined,
  low: number | null | undefined,
  high: number | null | undefined
): RangeStatus {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return UNKNOWN;
  }
  const hasLow = low !== null && low !== undefined && Number.isFinite(low);
  const hasHigh = high !== null && high !== undefined && Number.isFinite(high);
  if (!hasLow && !hasHigh) {
    return UNKNOWN;
  }
  if (hasLow && value < low!) {
    return BELOW;
  }
  if (hasHigh && value > high!) {
    return ABOVE;
  }
  if (hasLow && hasHigh) {
    return WITHIN;
  }
  return ONE_SIDED;
}

export function needsReview(status: RangeStatus): boolean {
  return status === BELOW || status === ABOVE;
}

export function baseline(values: Iterable<number | null | undefined>): { value: number; n: number } | null {
  const finite: number[] = [];
  for (const v of values) {
    if (v !== null && v !== undefined && Number.isFinite(v)) {
      finite.push(v);
    }
  }
  if (finite.length < MIN_BASELINE_N) {
    return null;
  }
  const sum = finite.reduce((acc, x) => acc + x, 0);
  return { value: sum / finite.length, n: finite.length };
}

export function compare(
  value: number | null | undefined,
  base: number | null | undefined
): { delta: number | null; percent_delta: number | null } {
  if (
    value === null ||
    value === undefined ||
    !Number.isFinite(value) ||
    base === null ||
    base === undefined ||
    !Number.isFinite(base)
  ) {
    return { delta: null, percent_delta: null };
  }
  const delta = value - base;
  const percent_delta = base !== 0 ? (100.0 * delta) / base : null;
  return { delta, percent_delta };
}
