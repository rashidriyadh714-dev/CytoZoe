import type { HealthEvidence } from "../api/contracts";
import { useDrawer } from "../app/providers";
import { fmt, rangeText, REVIEW_LABEL, signed } from "../lib/format";
import { RangeStatusLine } from "./EvidencePanel";

/**
 * Presentation-only position of the reported value against the two supplied bounds.
 * Nothing is classified here: the range status text above it comes from the backend.
 */
function RangeTrack({
  value,
  low,
  high,
  flagged,
}: {
  value: number;
  low: number;
  high: number;
  flagged: boolean;
}) {
  const span = high - low || Math.abs(high) || 1;
  const d0 = Math.min(low, value) - span * 0.3;
  const d1 = Math.max(high, value) + span * 0.3;
  const pct = (x: number) => Math.max(4, Math.min(96, ((x - d0) / (d1 - d0)) * 100));
  return (
    <div className="range-track" aria-hidden="true">
      <span className="rail" />
      <span
        className="band"
        style={{ left: `${pct(low)}%`, width: `${Math.max(4, pct(high) - pct(low))}%` }}
      />
      <span className={`pin${flagged ? " flag" : ""}`} style={{ left: `${pct(value)}%` }} />
    </div>
  );
}

/**
 * Decorative smooth SVG wave sparkline (Terroni-inspired) visualizing the preflight baseline vs
 * current observation and reference bounds.
 */
function MetricWaveSpark({
  ev,
}: {
  ev: HealthEvidence;
}) {
  const m = ev.measurement;
  const c = ev.comparison;
  const flagged = m.needs_review;
  const gradId = `wave-${m.marker}-${ev.context.sample_id}`;

  // Construct a smooth 4-point bezier curve anchored by range_low, baseline, value, range_high
  const low = m.range_low ?? 0;
  const high = m.range_high ?? 100;
  const span = high - low || 1;
  const norm = (v: number) => {
    const ratio = (v - low) / span;
    const clamped = Math.max(-0.15, Math.min(1.2, ratio));
    return 48 - clamped * 34;
  };

  const yBase = norm(c.baseline ?? m.value ?? (low + high) / 2);
  const yVal = norm(m.value ?? (low + high) / 2);
  const yMid = (yBase + yVal) / 2 + (flagged ? -6 : 4);

  const dLine = `M 4 ${yBase.toFixed(1)} C 45 ${(yBase + 5).toFixed(1)}, 80 ${yMid.toFixed(
    1
  )}, 125 ${(yVal + 3).toFixed(1)} S 185 ${(yVal - 4).toFixed(1)}, 216 ${yVal.toFixed(1)}`;
  const dArea = `${dLine} L 216 56 L 4 56 Z`;

  const strokeColor = flagged ? "#D97706" : "#65A30D";
  const stopColor = flagged ? "#F59E0B" : "#C6F432";

  return (
    <div className="metric-wave-box" aria-hidden="true">
      <svg viewBox="0 0 220 56" preserveAspectRatio="none">
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={stopColor} stopOpacity={flagged ? "0.35" : "0.45"} />
            <stop offset="100%" stopColor={stopColor} stopOpacity="0.0" />
          </linearGradient>
        </defs>
        <path d={dArea} fill={`url(#${gradId})`} />
        <path
          d={dLine}
          fill="none"
          stroke={strokeColor}
          strokeWidth="2.2"
          strokeLinecap="round"
        />
        <circle
          cx="214"
          cy={yVal}
          r="3.8"
          fill="#FFFFFF"
          stroke={strokeColor}
          strokeWidth="2.2"
        />
      </svg>
    </div>
  );
}

export function MetricCard({ ev }: { ev: HealthEvidence }) {
  const { open } = useDrawer();
  const m = ev.measurement;
  const c = ev.comparison;
  return (
    <article
      className={`metric is-changed${m.needs_review ? " is-flagged" : ""}`}
      aria-labelledby={`mc-${m.marker}`}
    >
      <div className="metric-top">
        <h3 className="metric-name" id={`mc-${m.marker}`}>
          {m.marker_name}
        </h3>
        <span className="metric-row-ref">Row {ev.source.source_row}</span>
      </div>
      <div className="metric-value-row">
        {m.value === null ? (
          <span className="metric-value" style={{ fontSize: 20 }}>
            No value
          </span>
        ) : (
          <>
            <span className="metric-value tabular">{fmt(m.value)}</span>
            <span className="metric-unit">{m.unit}</span>
            {c.percent_delta !== null ? (
              <span
                className={`metric-pct-badge tabular ${
                  m.needs_review ? "amber" : "lime"
                }`}
              >
                {signed(c.percent_delta, 1)}%
              </span>
            ) : null}
          </>
        )}
      </div>

      <MetricWaveSpark ev={ev} />

      {m.value !== null && m.range_low !== null && m.range_high !== null ? (
        <RangeTrack value={m.value} low={m.range_low} high={m.range_high} flagged={m.needs_review} />
      ) : null}
      <span className="meta">Supplied range {rangeText(m.range_low, m.range_high, m.unit)}</span>
      <RangeStatusLine status={m.range_status} />
      <p className="metric-delta">
        {c.delta === null ? (
          c.baseline_available ? (
            "No comparison available"
          ) : (
            "Personal mean not computed (n < 2)"
          )
        ) : (
          <>
            vs preflight mean {fmt(c.baseline, 2)}:{" "}
            <span className="tabular">
              {signed(c.delta, 2)} {m.unit}
            </span>
          </>
        )}
      </p>
      <div className="metric-foot">
        {ev.review ? (
          <span className="meta status-text-saved">
            ● {REVIEW_LABEL[ev.review.status]} · v{ev.review.version}
          </span>
        ) : (
          <span className="meta">Not reviewed</span>
        )}
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          aria-label={`Inspect ${m.marker_name} evidence`}
          onClick={() => open({ kind: "evidence", id: ev.evidence_id })}
        >
          Inspect
        </button>
      </div>
    </article>
  );
}
