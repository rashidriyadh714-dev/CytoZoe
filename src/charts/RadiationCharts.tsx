import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { EnvironmentView, RadiationPoint } from "../api/contracts";
import { clock, fmt, timeOnly } from "../lib/format";

const DATA = "#0B0B0C";
const ERROR = "#B91C1C";

const axisProps = () => ({
  type: "number" as const,
  dataKey: "t",
  domain: [0, 86400] as [number, number],
  ticks: [0, 21600, 43200, 64800, 86400],
  tickFormatter: (v: number) => clock(v),
  tick: { fill: "#475569", fontSize: 12 },
  tickLine: false,
  axisLine: { stroke: "#CBD5E1" },
  allowDuplicatedCategory: false,
});

function Tip({
  active,
  payload,
  kind,
}: {
  active?: boolean;
  payload?: { payload?: RadiationPoint }[];
  kind: "rate" | "dose";
}) {
  const p = active && payload?.length ? payload[0].payload : undefined;
  if (!p) return null;
  return (
    <div className="chart-tooltip">
      <strong>{timeOnly(p.ts)} (source clock)</strong>
      {kind === "rate"
        ? `${fmt(p.rate, 4)} µGy/hour`
        : `${fmt(p.cumulative, 4)} µGy accumulated so far`}
      <div className="meta">Data row {p.source_row}</div>
    </div>
  );
}

/**
 * Chart 2 — DosTel1 absorbed dose rate over 1 March 2022.
 * Each contiguous accepted segment is its own Line so exclusions visibly break the trace.
 */
export function RadiationRateChart({
  env,
  logScale,
}: {
  env: EnvironmentView;
  logScale: boolean;
}) {
  return (
    <div
      className="chart-box"
      role="img"
      aria-label={`DosTel1 absorbed dose rate in ${env.unit} across ${env.quality.accepted_rows} accepted readings on 1 March 2022 (${logScale ? "logarithmic" : "linear"} scale). Lines break at ${env.quality.conflict_groups.length} excluded conflict timestamps.`}
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart margin={{ top: 12, right: 16, bottom: 28, left: 8 }} accessibilityLayer={false}>
          <CartesianGrid stroke="#E2E8F0" vertical={false} />
          <XAxis
            {...axisProps()}
            label={{
              value: "Source timestamp, 1 March 2022 (no timezone conversion)",
              position: "insideBottom",
              offset: -18,
              fill: "#475569",
              fontSize: 12,
            }}
          />
          <YAxis
            scale={logScale ? "log" : "auto"}
            domain={logScale ? [1, 1000] : [0, "auto"]}
            allowDataOverflow={logScale}
            ticks={logScale ? [1, 10, 100, 1000] : undefined}
            tick={{ fill: "#475569", fontSize: 12 }}
            tickLine={false}
            axisLine={false}
            width={64}
            tickFormatter={(v: number) => fmt(v, 0)}
            label={{
              value: `Rate (${env.unit})`,
              angle: -90,
              position: "insideLeft",
              offset: 4,
              fill: "#475569",
              fontSize: 12,
              style: { textAnchor: "middle" },
            }}
          />
          {env.quality.conflict_groups.map((g) => (
            <ReferenceLine
              key={g.timestamp}
              x={g.t}
              stroke={ERROR}
              strokeDasharray="3 3"
              strokeWidth={1.4}
            />
          ))}
          {env.segments.map((s) => (
            <Line
              key={s.index}
              data={s.points}
              dataKey="rate"
              type="linear"
              stroke={DATA}
              strokeWidth={1.5}
              dot={false}
              isAnimationActive={false}
              name={`Segment ${s.index + 1}`}
              activeDot={{ r: 4 }}
            />
          ))}
          <Tooltip content={<Tip kind="rate" />} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/**
 * Chart 3 — Estimated accumulated sensor dose over covered intervals only.
 * The running total stays flat across excluded intervals and segments are never connected across them.
 */
export function SensorDoseChart({ env }: { env: EnvironmentView }) {
  return (
    <div
      className="chart-box"
      role="img"
      aria-label={`Estimated accumulated sensor dose in µGy over covered intervals, reaching ${fmt(
        env.integration.estimated_sensor_dose_uGy,
        2
      )} µGy. The line is interrupted wherever intervals were excluded.`}
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart margin={{ top: 12, right: 16, bottom: 28, left: 8 }} accessibilityLayer={false}>
          <CartesianGrid stroke="#E2E8F0" vertical={false} />
          <XAxis
            {...axisProps()}
            label={{
              value: "Source timestamp, 1 March 2022",
              position: "insideBottom",
              offset: -18,
              fill: "#475569",
              fontSize: 12,
            }}
          />
          <YAxis
            domain={[0, "auto"]}
            tick={{ fill: "#475569", fontSize: 12 }}
            tickLine={false}
            axisLine={false}
            width={64}
            tickFormatter={(v: number) => fmt(v, 0)}
            label={{
              value: "Estimated sensor dose (µGy)",
              angle: -90,
              position: "insideLeft",
              offset: 4,
              fill: "#475569",
              fontSize: 12,
              style: { textAnchor: "middle" },
            }}
          />
          {env.quality.conflict_groups.map((g) => (
            <ReferenceLine
              key={g.timestamp}
              x={g.t}
              stroke={ERROR}
              strokeDasharray="3 3"
              strokeWidth={1.4}
            />
          ))}
          {env.segments.map((s) => (
            <Line
              key={s.index}
              data={s.points}
              dataKey="cumulative"
              type="linear"
              stroke={DATA}
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
              name={`Segment ${s.index + 1}`}
              activeDot={{ r: 4 }}
            />
          ))}
          <Tooltip content={<Tip kind="dose" />} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function RadiationLegend() {
  return (
    <div className="chart-legend" aria-hidden="true">
      <span className="legend-item">
        <span className="legend-swatch" />
        Accepted readings (segments are never joined)
      </span>
      <span className="legend-item">
        <span className="legend-swatch gap" />
        Excluded conflict timestamp
      </span>
    </div>
  );
}
