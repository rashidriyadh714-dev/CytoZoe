import { useRef, useState } from "react";
import { api } from "../api/client";
import { useDrawer } from "../app/providers";
import { LiveRadiation } from "../charts/LiveRadiation";
import {
  RadiationLegend,
  RadiationRateChart,
  SensorDoseChart,
} from "../charts/RadiationCharts";
import { IconFlag, IconSatellite } from "../components/icons";
import { PageHeader } from "../components/PageHeader";
import { ErrorState, Skeleton } from "../components/StatusViews";
import { duration, fmt, REVIEW_LABEL, timeOnly } from "../lib/format";
import { useAsync } from "../lib/useAsync";

const STATUS_TEXT: Record<string, string> = {
  ACCEPTED: "Accepted",
  DUPLICATE_CONFLICT: "Quarantined · conflicting duplicate timestamp",
  DUPLICATE_IDENTICAL: "Retained · identical duplicate (not double-counted)",
  INVALID_TIMESTAMP: "Quarantined · invalid timestamp",
  INVALID_RATE: "Quarantined · invalid rate",
  MISSING_VALUE: "Quarantined · missing value",
};

export default function Environment() {
  const { open, dataVersion } = useDrawer();
  const { data: env, error, loading, reload } = useAsync(
    () => api.environment(),
    [dataVersion]
  );
  const [logScale, setLogScale] = useState(true);
  const [onlyExcluded, setOnlyExcluded] = useState(false);
  const inspector = useRef<HTMLElement>(null);

  return (
    <>
      <PageHeader
        eyebrow="03 · External Environment & Radiation Telemetry"
        title="Radiation Review"
        study="environment"
        purpose="What did the ISS DosTel1 area sensor record on 1 March 2022 — and which records could not be trusted? A separate case study, never linked to any health participant."
      />

      <div className="case-banner" role="note">
        <IconSatellite />
        <div>
          <strong>Separate case study:</strong> ISS Columbus module · DosTel1 · 1 March 2022. This
          is an environmental instrument record, not a personal astronaut dose, and it is never
          linked to the Inspiration4 blood samples.
        </div>
      </div>

      {error ? <ErrorState error={error} onRetry={reload} /> : null}
      {!env && loading ? (
        <Skeleton height={360} label="Loading radiation dataset…" />
      ) : null}

      {env ? (
        <>
          <div className="quality-strip">
            <div>
              <strong>Data quality in this export:</strong>{" "}
              <span className="tabular">{env.quality.raw_rows.toLocaleString()}</span> raw rows ·{" "}
              <span className="tabular">{env.quality.accepted_rows.toLocaleString()}</span>{" "}
              accepted ·{" "}
              <span className="tabular">{env.quality.quarantined_conflict_rows}</span> quarantined
              across{" "}
              <span className="tabular">{env.quality.conflict_groups.length}</span> duplicate
              timestamps with different rates.
            </div>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => {
                inspector.current?.scrollIntoView({ behavior: "smooth" });
                inspector.current?.focus();
              }}
            >
              <IconFlag />
              Inspect {env.quality.excluded_rows} excluded records
            </button>
          </div>

          <LiveRadiation
            spanSeconds={env.integration.span_seconds}
            conflictCount={env.quality.conflict_groups.length}
          />

          <section className="card" aria-labelledby="rate-title">
            <div className="card-head">
              <div>
                <h2 id="rate-title">Absorbed dose rate at the sensor</h2>
                <p>
                  Chart 2 · {env.quality.accepted_rows.toLocaleString()} accepted readings in
                  µGy/hour · lines break at excluded timestamps
                </p>
              </div>
              <div className="seg-group" role="group" aria-label="Rate axis scale">
                <button
                  type="button"
                  className={`seg-btn ${logScale ? "active" : ""}`}
                  aria-pressed={logScale}
                  onClick={() => setLogScale(true)}
                >
                  Log scale
                </button>
                <button
                  type="button"
                  className={`seg-btn ${!logScale ? "active" : ""}`}
                  aria-pressed={!logScale}
                  onClick={() => setLogScale(false)}
                >
                  Linear scale
                </button>
              </div>
            </div>
            <RadiationRateChart env={env} logScale={logScale} />
            <RadiationLegend />
            <p className="chart-note">
              Times are the source clock as exported, without a timezone. The instrument's
              documented nominal cadence is {env.quality.documented_nominal_cadence_seconds} s;
              this export has irregular intervals (median{" "}
              {env.quality.observed_median_interval_seconds} s, maximum{" "}
              {env.quality.observed_max_interval_seconds} s).{" "}
              {logScale
                ? "Log scale shows both quiet periods and short high-rate South Atlantic Anomaly / high-latitude passages."
                : ""}
            </p>
          </section>

          <div className="split">
            <section className="card" aria-labelledby="dose-title">
              <div className="card-head">
                <div>
                  <h2 id="dose-title">Estimated accumulated sensor dose</h2>
                  <p>
                    Chart 3 · running sum over accepted intervals only · flat and interrupted
                    across exclusions
                  </p>
                </div>
              </div>
              <SensorDoseChart env={env} />
              <RadiationLegend />
              <details className="disclosure">
                <summary>
                  Data table ·{" "}
                  {env.segments
                    .reduce((n, s) => n + s.points.length, 0)
                    .toLocaleString()}{" "}
                  plotted values
                </summary>
                <div className="table-wrap">
                  <table className="data">
                    <caption>
                      Accepted readings by segment, with the running dose estimate
                    </caption>
                    <thead>
                      <tr>
                        <th scope="col">Segment</th>
                        <th scope="col">Time (source)</th>
                        <th scope="col" className="num">
                          Rate µGy/hour
                        </th>
                        <th scope="col" className="num">
                          Cumulative µGy
                        </th>
                        <th scope="col" className="num">
                          Data row
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {env.segments.flatMap((s) =>
                        s.points.map((p) => (
                          <tr key={p.source_row}>
                            <td className="tabular">{s.index + 1}</td>
                            <td className="tabular">{timeOnly(p.ts)}</td>
                            <td className="num tabular">{fmt(p.rate, 4)}</td>
                            <td className="num tabular">{fmt(p.cumulative, 4)}</td>
                            <td className="num tabular">{p.source_row}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </details>
            </section>

            <section className="card stack" aria-labelledby="estimate-title">
              <h2 id="estimate-title">{env.integration.label}</h2>
              <div className="dose-figure">
                <span className="dose-value tabular">
                  {fmt(env.integration.estimated_sensor_dose_uGy, 2)} <small>µGy</small>
                </span>
                <span className="small muted">
                  At the DosTel1 sensor — not a personal, organ or effective dose.
                </span>
              </div>
              <dl className="kv small">
                <dt>Coverage</dt>
                <dd className="tabular">
                  {duration(env.integration.covered_seconds)} of{" "}
                  {duration(env.integration.span_seconds)} (
                  {fmt((env.integration.coverage_ratio ?? 0) * 100, 2)}%)
                </dd>
                <dt>Intervals</dt>
                <dd className="tabular">
                  {env.integration.included_intervals.toLocaleString()} included ·{" "}
                  {env.integration.excluded_intervals.length} excluded
                </dd>
                <dt>Gap rule</dt>
                <dd className="tabular">
                  ≤ {env.integration.max_gap_seconds} s (engineering coverage rule, not a NASA
                  threshold)
                </dd>
                <dt>Rule</dt>
                <dd>{env.integration.rule_version}</dd>
              </dl>
              <div className="formula">{env.integration.method}</div>
              <p className="small muted">
                No extrapolation before the first or after the last record. No Gy→Sv conversion,
                no limit comparison, no safe/unsafe signal.
              </p>
              <div className="btn-row">
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => open({ kind: "evidence", id: env.summary_evidence_id })}
                >
                  Inspect estimate
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() =>
                    open({
                      kind: "evidence",
                      id: env.summary_evidence_id,
                      section: "review",
                    })
                  }
                >
                  {env.summary_review ? "Update review" : "Record review"}
                </button>
              </div>
              {env.summary_review ? (
                <p className="small">
                  Review:{" "}
                  <span className="status-text-saved">
                    ● {REVIEW_LABEL[env.summary_review.status]}
                  </span>
                </p>
              ) : null}
            </section>
          </div>

          <section
            className="card"
            aria-labelledby="conflict-title"
            ref={inspector}
            tabIndex={-1}
          >
            <div className="card-head">
              <div>
                <h2 id="conflict-title">
                  Why were {env.quality.excluded_rows} records excluded?
                </h2>
                <p>
                  The export reports {env.quality.conflict_groups.length} timestamps twice with
                  different rates. With no basis to prefer one, every row in those groups is kept
                  for audit but quarantined from analysis — never averaged, summed or first-picked.
                </p>
              </div>
            </div>
            {env.quality.conflict_groups.map((g) => (
              <div className="conflict" key={g.timestamp}>
                <div className="card-head" style={{ marginBottom: 8 }}>
                  <div>
                    <h3 className="tabular">
                      {timeOnly(g.timestamp)} <span className="meta">source clock</span>
                    </h3>
                    <p className="small muted tabular">
                      {g.rows
                        .map((r) => `data row ${r.source_row}: ${fmt(r.rate, 6)} µGy/hour`)
                        .join(" · ")}
                    </p>
                  </div>
                  <div className="btn-row">
                    {g.review ? (
                      <span className="status-text-saved">
                        ● {REVIEW_LABEL[g.review.status]}
                      </span>
                    ) : null}
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => open({ kind: "evidence", id: g.evidence_id })}
                      aria-label={`Inspect & review conflicting readings at ${timeOnly(
                        g.timestamp
                      )}`}
                    >
                      Inspect &amp; review
                    </button>
                  </div>
                </div>
              </div>
            ))}
            <details className="disclosure">
              <summary>
                Source-row explorer · all {env.rows.length.toLocaleString()} raw rows
              </summary>
              <label
                className="small"
                style={{
                  display: "inline-flex",
                  gap: 8,
                  alignItems: "center",
                  minHeight: 44,
                }}
              >
                <input
                  type="checkbox"
                  checked={onlyExcluded}
                  onChange={(e) => setOnlyExcluded(e.target.checked)}
                  style={{ width: 18, height: 18 }}
                />
                Show only excluded rows
              </label>
              <div className="table-wrap">
                <table className="data">
                  <caption>
                    Original RadLab rows with their quality status (
                    {onlyExcluded ? "excluded only" : "all rows"})
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col" className="num">
                        Data row
                      </th>
                      <th scope="col">Timestamp (source)</th>
                      <th scope="col" className="num">
                        Rate as exported
                      </th>
                      <th scope="col">Quality status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {env.rows
                      .filter((r) => !onlyExcluded || r.status !== "ACCEPTED")
                      .map((r) => (
                        <tr
                          key={r.source_row}
                          className={r.status !== "ACCEPTED" ? "row-excluded" : undefined}
                        >
                          <td className="num tabular">{r.source_row}</td>
                          <td className="tabular">{r.ts}</td>
                          <td className="num tabular">{r.rate_raw}</td>
                          <td>{STATUS_TEXT[r.status] ?? r.status}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </details>
          </section>

          <section className="card" aria-labelledby="limits-title">
            <h2 id="limits-title" style={{ marginBottom: 8 }}>
              What this record cannot tell us
            </h2>
            <ul className="ev-list">
              {env.limitations.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          </section>
        </>
      ) : null}
    </>
  );
}
