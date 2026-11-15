import {
  CartesianGrid,
  ComposedChart,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { HealthTrend, TrendPoint } from "../api/contracts";
import { fmt, RANGE_TEXT, rangeText } from "../lib/format";

const DATA = "#0B0B0C";
const REVIEW = "#B45309";
const BASELINE = "#475467";

interface DotProps {
  cx?: number;
  cy?: number;
  payload?: TrendPoint;
}

/** Round axis bounds to a 1/2/5 × 10^k step so tick labels are readable values. */
export function niceScale(
  lo: number,
  hi: number,
  target = 5
): { domain: [number, number]; ticks: number[] } {
  const span = hi - lo || Math.abs(hi) || 1;
  const raw = (span * 1.2) / target;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag;
  const start = Math.floor((lo - span * 0.08) / step) * step;
  const end = Math.ceil((hi + span * 0.08) / step) * step;
  const ticks: number[] = [];
  for (let v = start; v <= end + step / 2; v += step) ticks.push(Number(v.toFixed(6)));
  return { domain: [ticks[0], ticks[ticks.length - 1]], ticks };
}

/**
 * Chart 1 — actual sample visits (categorical, not equally spaced in time) × marker value.
 * Dots only: no interpolation or smoothed curve between sparse blood draws.
 */
export function HealthVisitChart({
  trend,
  selectedVisit,
  onSelect,
}: {
  trend: HealthTrend;
  selectedVisit: string;
  onSelect: (visit: string) => void;
}) {
  const pts = trend.points;
  const nums = pts
    .flatMap((p) => [p.value, p.range_low, p.range_high])
    .concat(trend.baseline.value)
    .filter((v): v is number => v !== null);
  const lo = Math.min(...nums);
  const hi = Math.max(...nums);
  const { domain, ticks } = niceScale(lo, hi);
  const data = pts.map((p) => ({ ...p, x: p.visit }));

  const Dot = ({ cx, cy, payload }: DotProps) => {
    if (cx === undefined || cy === undefined || !payload || payload.value === null) return <g />;
    const selected = payload.visit === selectedVisit;
    const flagged = payload.needs_review;
    return (
      <g style={{ cursor: "pointer" }} onClick={() => onSelect(payload.visit)}>
        {selected ? (
          <circle cx={cx} cy={cy} r={13} fill="#C6F432" stroke="#0B0B0C" strokeWidth={2} />
        ) : null}
        <circle
          cx={cx}
          cy={cy}
          r={flagged ? 7 : 6}
          fill={flagged ? "#FFFFFF" : DATA}
          stroke={flagged ? REVIEW : DATA}
          strokeWidth={flagged ? 3 : 1}
        />
      </g>
    );
  };

  const BoundTick = ({ cx, cy }: DotProps) =>
    cx === undefined || cy === undefined ? (
      <g />
    ) : (
      <line x1={cx - 14} x2={cx + 14} y1={cy} y2={cy} stroke="#64748B" strokeWidth={2} />
    );

  return (
    <div
      className="chart-box"
      role="img"
      aria-label={`${trend.marker_name} for ${trend.participant_id} across ${pts.length} historical visits in ${trend.unit}. Full values are in the data table below the chart.`}
    >
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart
          data={data}
          margin={{ top: 16, right: 16, bottom: 28, left: 8 }}
          accessibilityLayer={false}
        >
          <CartesianGrid stroke="#E2E8F0" vertical={false} />
          {trend.bounds_consistent && trend.range_low !== null && trend.range_high !== null ? (
            <ReferenceArea
              y1={trend.range_low}
              y2={trend.range_high}
              fill="#F7FEE7"
              fillOpacity={0.9}
              stroke="#BEF264"
              ifOverflow="extendDomain"
            />
          ) : null}
          <XAxis
            dataKey="x"
            type="category"
            tick={{ fill: "#475569", fontSize: 13 }}
            tickLine={false}
            axisLine={{ stroke: "#CBD5E1" }}
            label={{
              value: "Visit (L = days before launch · R = days after return)",
              position: "insideBottom",
              offset: -18,
              fill: "#475569",
              fontSize: 12,
            }}
          />
          <YAxis
            domain={domain}
            ticks={ticks}
            interval={0}
            tick={{ fill: "#475569", fontSize: 13 }}
            tickLine={false}
            axisLine={false}
            width={64}
            tickFormatter={(v: number) => fmt(v, 2)}
            label={{
              value: `${trend.marker_name} (${trend.unit})`,
              angle: -90,
              position: "insideLeft",
              offset: 4,
              fill: "#475569",
              fontSize: 12,
              style: { textAnchor: "middle" },
            }}
          />
          {trend.baseline.value !== null ? (
            <ReferenceLine
              y={trend.baseline.value}
              stroke={BASELINE}
              strokeDasharray="6 5"
              strokeWidth={1.8}
              label={{
                value: `Preflight mean (n = ${trend.baseline.n})`,
                position: "insideTopRight",
                fill: "#475569",
                fontSize: 12,
              }}
            />
          ) : null}
          <ReferenceLine x="R+1" stroke="#94A3B8" strokeDasharray="2 4" />
          {!trend.bounds_consistent ? (
            <>
              <Scatter
                dataKey="range_low"
                shape={BoundTick}
                isAnimationActive={false}
                legendType="none"
                name="Supplied lower bound"
              />
              <Scatter
                dataKey="range_high"
                shape={BoundTick}
                isAnimationActive={false}
                legendType="none"
                name="Supplied upper bound"
              />
            </>
          ) : null}
          <Scatter
            dataKey="value"
            shape={Dot}
            isAnimationActive={false}
            name={trend.marker_name}
          />
          <Tooltip
            cursor={{ fill: "rgba(30,64,175,0.06)" }}
            content={({ active, payload }) => {
              const p =
                active && payload?.length ? (payload[0].payload as TrendPoint) : null;
              if (!p) return null;
              return (
                <div className="chart-tooltip">
                  <strong>{p.visit_label}</strong>
                  {p.value === null ? "No value" : `${fmt(p.value)} ${trend.unit}`}
                  <div className="meta">
                    {RANGE_TEXT[p.range_status]} ·{" "}
                    {rangeText(p.range_low, p.range_high, trend.unit)}
                  </div>
                </div>
              );
            }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

/**
 * Multi-Crew Cohort Comparison Chart (C001, C002, C003, C004 across the 7 Inspiration4 visits).
 */
export function CohortComparisonChart({
  trend,
  activeParticipant,
}: {
  trend: HealthTrend;
  activeParticipant: string;
}) {
  const cohort = trend.cohort_by_visit ?? [];
  const COLORS: Record<string, string> = {
    C001: "#0B0B0C",
    C002: "#65A30D",
    C003: "#D97706",
    C004: "#0284C7",
  };
  return (
    <div
      className="chart-box"
      role="img"
      aria-label={`All 4 Inspiration4 crew members (${trend.marker_name} in ${trend.unit}) across the 7 historical visits.`}
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={cohort} margin={{ top: 16, right: 20, bottom: 28, left: 8 }}>
          <CartesianGrid stroke="#E2E8F0" vertical={false} />
          {trend.bounds_consistent && trend.range_low !== null && trend.range_high !== null ? (
            <ReferenceArea
              y1={trend.range_low}
              y2={trend.range_high}
              fill="#F7FEE7"
              fillOpacity={0.85}
              stroke="#BEF264"
            />
          ) : null}
          <XAxis
            dataKey="visit"
            tick={{ fill: "#475569", fontSize: 13 }}
            tickLine={false}
            axisLine={{ stroke: "#CBD5E1" }}
          />
          <YAxis
            domain={["auto", "auto"]}
            tick={{ fill: "#475569", fontSize: 13 }}
            tickLine={false}
            axisLine={false}
            width={64}
            tickFormatter={(v: number) => fmt(v, 2)}
          />
          {(["C001", "C002", "C003", "C004"] as const).map((pid) => (
            <Line
              key={pid}
              type="linear"
              dataKey={pid}
              stroke={COLORS[pid]}
              strokeWidth={pid === activeParticipant ? 3 : 1.5}
              strokeDasharray={pid === activeParticipant ? undefined : "4 3"}
              dot={{ r: pid === activeParticipant ? 5 : 3.5 }}
              isAnimationActive={false}
              name={pid}
            />
          ))}
          <Tooltip
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              return (
                <div className="chart-tooltip">
                  <strong>Visit {label}</strong>
                  {payload.map((entry) => (
                    <div key={String(entry.name)} className="tabular">
                      {entry.name}: {fmt(entry.value as number)} {trend.unit}
                    </div>
                  ))}
                </div>
              );
            }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function HealthChartLegend({ trend }: { trend: HealthTrend }) {
  return (
    <div className="chart-legend" aria-hidden="true">
      <span className="legend-item">
        <span className="legend-swatch dot" />
        Measured sample
      </span>
      <span className="legend-item">
        <span className="legend-swatch flag" />
        Outside supplied range
      </span>
      <span className="legend-item">
        <span className="legend-swatch dashed" />
        Retrospective preflight mean
      </span>
      {trend.bounds_consistent ? (
        <span className="legend-item">
          <span className="legend-swatch band" />
          Supplied range (same for every visit)
        </span>
      ) : (
        <span className="legend-item">
          <span className="legend-swatch" style={{ borderTop: "2px solid #64748B" }} />
          Supplied bounds per visit (they differ between visits)
        </span>
      )}
    </div>
  );
}
