import type { RangeStatus, ReviewStatus } from "../api/contracts";

/** Presentation-only rounding. Rules are evaluated on the backend with unrounded values. */
export function fmt(value: number | null | undefined, digits = 4): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  const fixed = value.toFixed(digits);
  const s = fixed.includes(".") ? fixed.replace(/\.?0+$/, "") : fixed;
  return s === "-0" ? "0" : s;
}

export function signed(value: number | null | undefined, digits = 4): string {
  if (value === null || value === undefined) return "—";
  return (value > 0 ? "+" : value < 0 ? "−" : "") + fmt(Math.abs(value), digits);
}

export const RANGE_TEXT: Record<RangeStatus, string> = {
  ABOVE_SUPPLIED_UPPER_BOUND: "Outside supplied range · above upper bound",
  BELOW_SUPPLIED_LOWER_BOUND: "Outside supplied range · below lower bound",
  WITHIN_SUPPLIED_RANGE: "Within supplied range",
  ONE_SIDED_COMPARISON: "One-sided comparison only",
  UNKNOWN: "Not assessable",
};

export const REVIEW_LABEL: Record<ReviewStatus, string> = {
  OPEN: "Open",
  FOLLOW_UP_REQUESTED: "Follow-up requested",
  REVIEWED: "Reviewed",
};

export function rangeText(low: number | null, high: number | null, unit: string): string {
  if (low === null && high === null) return "No supplied range";
  if (low === null) return `≤ ${fmt(high)} ${unit} (upper bound only)`;
  if (high === null) return `≥ ${fmt(low)} ${unit} (lower bound only)`;
  return `${fmt(low)}–${fmt(high)} ${unit}`;
}

export function duration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) return "—";
  const s = Math.round(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${h} h ${String(m).padStart(2, "0")} min${sec ? ` ${String(sec).padStart(2, "0")} s` : ""}`;
}

export function durationShort(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) return "—";
  const s = Math.round(seconds);
  return `${Math.floor(s / 3600)}h ${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}m ${String(s % 60).padStart(2, "0")}s`;
}

/** Seconds since 00:00:00 of the source day → HH:MM (source clock, no timezone conversion). */
export function clock(t: number, withSeconds = false): string {
  const s = Math.round(t);
  const h = String(Math.floor(s / 3600)).padStart(2, "0");
  const m = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const sec = String(s % 60).padStart(2, "0");
  return withSeconds ? `${h}:${m}:${sec}` : `${h}:${m}`;
}

export function timeOnly(ts: string): string {
  return ts.includes("T") ? ts.split("T")[1] : ts;
}

export function localDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
