/**
 * E3 — Environmental (Sensor Radiation) Integration Engine
 * Trapezoidal estimate over accepted adjacent readings only. An interval is excluded when its duration is
 * not positive, exceeds the configured gap (engineering coverage rule, not a NASA health threshold), or
 * when an excluded/quarantined source event lies strictly inside it. No extrapolation, no Gy->Sv conversion.
 */

export const RULE_VERSION = "env-integration-v1";

export interface RadiationPointInput {
  epoch: number;
  rate: number;
  source_timestamp?: string;
  source_row?: number;
  [key: string]: unknown;
}

export interface IntegratedRadiationPoint extends RadiationPointInput {
  cumulative: number;
}

export interface ExcludedInterval {
  start_epoch: number;
  end_epoch: number;
  seconds: number;
  reason: "NON_POSITIVE_INTERVAL" | "GAP_EXCEEDS_MAX" | "EXCLUDED_EVENT_INSIDE";
  start?: string;
  end?: string;
}

export interface IntegrationResult {
  rule_version: string;
  method: string;
  max_gap_seconds: number;
  segments: IntegratedRadiationPoint[][];
  excluded_intervals: ExcludedInterval[];
  included_intervals: number;
  covered_seconds: number;
  span_seconds: number;
  estimated_sensor_dose_uGy: number;
}

export function integrate(
  points: ReadonlyArray<RadiationPointInput>,
  breakEpochs: ReadonlyArray<number>,
  maxGapSeconds = 300
): IntegrationResult {
  const ordered = [...points].sort((a, b) => a.epoch - b.epoch);
  const breaks = [...breakEpochs].sort((a, b) => a - b);

  function breakInside(a: number, b: number): number | null {
    // Find first break strictly > a
    let lo = 0;
    let hi = breaks.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (breaks[mid] <= a) lo = mid + 1;
      else hi = mid;
    }
    if (lo < breaks.length && breaks[lo] < b) {
      return breaks[lo];
    }
    return null;
  }

  const segments: IntegratedRadiationPoint[][] = [];
  const excluded: ExcludedInterval[] = [];
  let total = 0.0;
  let covered = 0.0;
  let included = 0;
  let current: IntegratedRadiationPoint[] = [];

  for (let idx = 0; idx < ordered.length; idx++) {
    const point = ordered[idx];
    if (idx === 0) {
      current = [{ ...point, cumulative: 0.0 }];
      continue;
    }
    const prev = ordered[idx - 1];
    const dt = point.epoch - prev.epoch;
    let reason: ExcludedInterval["reason"] | null = null;

    if (dt <= 0) {
      reason = "NON_POSITIVE_INTERVAL";
    } else if (dt > maxGapSeconds) {
      reason = "GAP_EXCEEDS_MAX";
    } else if (breakInside(prev.epoch, point.epoch) !== null) {
      reason = "EXCLUDED_EVENT_INSIDE";
    }

    if (reason !== null) {
      excluded.push({
        start_epoch: prev.epoch,
        end_epoch: point.epoch,
        seconds: dt,
        reason,
        start: prev.source_timestamp,
        end: point.source_timestamp,
      });
      segments.push(current);
      current = [{ ...point, cumulative: total }];
      continue;
    }

    const dose = (((prev.rate + point.rate) / 2.0) * dt) / 3600.0;
    total += dose;
    covered += dt;
    included += 1;
    current.push({ ...point, cumulative: total });
  }

  if (current.length > 0) {
    segments.push(current);
  }

  const span = ordered.length > 1 ? ordered[ordered.length - 1].epoch - ordered[0].epoch : 0.0;

  return {
    rule_version: RULE_VERSION,
    method: "trapezoidal: ((r_i + r_j) / 2) × (t_j − t_i) seconds / 3600",
    max_gap_seconds: maxGapSeconds,
    segments,
    excluded_intervals: excluded,
    included_intervals: included,
    covered_seconds: covered,
    span_seconds: span,
    estimated_sensor_dose_uGy: total,
  };
}
