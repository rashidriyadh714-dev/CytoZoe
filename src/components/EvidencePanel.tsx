import type { ReactNode } from "react";
import type {
  EnvConflictMeasurement,
  EnvEvidence,
  EnvSummaryMeasurement,
  Evidence,
  HealthEvidence,
} from "../api/contracts";
import { duration, fmt, RANGE_TEXT, rangeText, REVIEW_LABEL, signed } from "../lib/format";
import { IconFlag, IconInfo } from "./icons";

function Step({ n, label, children }: { n: number; label: string; children: ReactNode }) {
  return (
    <section className="ev-step" aria-label={label}>
      <span className="ev-num" aria-hidden="true">
        {n}
      </span>
      <div style={{ minWidth: 0 }}>
        <h3 className="ev-label">{label}</h3>
        {children}
      </div>
    </section>
  );
}

export function RangeStatusLine({
  status,
}: {
  status: HealthEvidence["measurement"]["range_status"];
}) {
  const flagged =
    status === "ABOVE_SUPPLIED_UPPER_BOUND" || status === "BELOW_SUPPLIED_LOWER_BOUND";
  return (
    <span className={`metric-status ${flagged ? "status-review" : "status-neutral"}`}>
      {flagged ? <IconFlag /> : <IconInfo />}
      {RANGE_TEXT[status]}
    </span>
  );
}

function SourceStep({ ev, children }: { ev: Evidence; children?: ReactNode }) {
  const s = ev.source;
  return (
    <>
      <dl className="kv small">
        <dt>Dataset</dt>
        <dd>{s.title}</dd>
        <dt>File</dt>
        <dd>
          <code>{s.file_name}</code>
        </dd>
        <dt>Provenance</dt>
        <dd>
          {s.provenance === "NASA_PINNED_VERIFIED"
            ? "Verified NASA snapshot (SHA-256 matches the registered manifest)"
            : s.provenance ?? "Not reported"}
        </dd>
        {children}
      </dl>
      <details className="disclosure" style={{ marginTop: 8 }}>
        <summary>Full provenance &amp; cryptographic hash</summary>
        <dl className="kv small">
          <dt>Provider</dt>
          <dd>{s.provider}</dd>
          <dt>SHA-256</dt>
          <dd>
            <code title={s.sha256}>{s.sha256}</code>
          </dd>
          <dt>Imported</dt>
          <dd>{s.imported_at}</dd>
          <dt>Licence</dt>
          <dd>{s.license_note}</dd>
        </dl>
        <p className="small" style={{ marginTop: 8 }}>
          Study page:{" "}
          <a href={s.source_url} target="_blank" rel="noreferrer noopener">
            {s.source_url}
          </a>
          <span className="meta"> (external link; needs internet)</span>
        </p>
      </details>
    </>
  );
}

export function HealthEvidencePanel({
  ev,
  followUp,
}: {
  ev: HealthEvidence;
  followUp?: ReactNode;
}) {
  const m = ev.measurement;
  const c = ev.comparison;
  const ctx = ev.context;
  return (
    <div className="evidence">
      <Step n={1} label="Observation">
        <div className="ev-big tabular">
          {m.value === null ? (
            "No value recorded"
          ) : (
            <>
              {fmt(m.value)} <span className="metric-unit">{m.unit}</span>
            </>
          )}
        </div>
        <p className="small muted">
          {m.marker_name} · {ctx.participant_id} · {ctx.visit_label} (
          {Math.abs(ctx.relative_day)} {ctx.relative_day_reference}) · actual sample
        </p>
        <div style={{ marginTop: 6 }}>
          <RangeStatusLine status={m.range_status} />
        </div>
      </Step>

      <Step n={2} label="Calculation">
        <dl className="kv small">
          <dt>Supplied laboratory range</dt>
          <dd className="tabular">{rangeText(m.range_low, m.range_high, m.unit)}</dd>
          <dt>Retrospective preflight mean</dt>
          <dd className="tabular">
            {c.baseline_available
              ? `${fmt(c.baseline)} ${m.unit} (n = ${c.n})`
              : `Not computed — needs ≥ 2 preflight values (n = ${c.n})`}
          </dd>
          <dt>Preflight values used</dt>
          <dd className="tabular">
            {c.baseline_values
              .map((b) => `${b.visit}: ${b.value === null ? "missing" : fmt(b.value)}`)
              .join(" · ")}
          </dd>
          <dt>Difference from mean</dt>
          <dd className="tabular">
            {c.delta === null
              ? "—"
              : `${signed(c.delta)} ${m.unit}${
                  c.percent_delta === null ? "" : ` (${signed(c.percent_delta, 2)}%)`
                }`}
          </dd>
        </dl>
        {c.includes_selected_sample ? (
          <p className="small muted" style={{ marginTop: 6 }}>
            This preflight sample is one of the values in the mean, so the comparison is
            retrospective — not a real-time prediction.
          </p>
        ) : null}
        <p className="small muted" style={{ marginTop: 6 }}>
          A difference from the personal mean is descriptive; it is not an abnormality threshold.
        </p>
      </Step>

      <Step n={3} label="Source & quality">
        <SourceStep ev={ev}>
          <dt>Row</dt>
          <dd>
            Data row {ev.source.source_row} (file line {ev.source.file_line}) · “
            {ev.source.sample_name}”
          </dd>
          <dt>Column</dt>
          <dd>
            <code>{ev.source.source_columns?.value}</code>
          </dd>
          <dt>Raw value</dt>
          <dd>
            {ev.source.raw_value} ({ev.source.source_unit})
          </dd>
          <dt>Rule</dt>
          <dd>{c.rule_version}</dd>
        </SourceStep>
      </Step>

      <Step n={4} label="Limitations">
        <ul className="ev-list">
          {ev.limitations.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      </Step>

      <Step n={5} label="Follow-up">
        {ev.review ? (
          <p className="small" style={{ marginBottom: 8 }}>
            Current review:{" "}
            <span className="status-text-saved">● {REVIEW_LABEL[ev.review.status]}</span> · version{" "}
            {ev.review.version}
          </p>
        ) : (
          <p className="small muted" style={{ marginBottom: 8 }}>
            No review saved for this result yet.
          </p>
        )}
        {followUp}
      </Step>
    </div>
  );
}

export function EnvEvidencePanel({
  ev,
  followUp,
}: {
  ev: EnvEvidence;
  followUp?: ReactNode;
}) {
  const isConflict = ev.kind === "DATA_QUALITY";
  const sm = ev.measurement as EnvSummaryMeasurement;
  const cm = ev.measurement as EnvConflictMeasurement;
  return (
    <div className="evidence">
      <Step n={1} label="Observation">
        {isConflict ? (
          <>
            <p className="small muted">
              Source timestamp {cm.timestamp} (source clock, no timezone)
            </p>
            <div className="table-wrap" style={{ marginTop: 8 }}>
              <table className="data">
                <caption>Conflicting source rows (all retained, all quarantined)</caption>
                <thead>
                  <tr>
                    <th scope="col">Data row</th>
                    <th scope="col" className="num">
                      Rate (µGy/hour)
                    </th>
                    <th scope="col">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {cm.rows.map((r) => (
                    <tr key={r.source_row} className="row-excluded">
                      <td className="tabular">{r.source_row}</td>
                      <td className="num tabular">{r.rate_raw}</td>
                      <td>Quarantined</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <>
            <div className="ev-big tabular">
              {fmt(sm.estimated_sensor_dose_uGy, 2)} <span className="metric-unit">µGy</span>
            </div>
            <p className="small muted">
              {sm.label} · DosTel1 · ISS Columbus · 1 March 2022
            </p>
          </>
        )}
      </Step>

      <Step
        n={2}
        label={
          isConflict ? "Calculation · quality decision" : "Calculation · coverage and method"
        }
      >
        {isConflict ? (
          <ul className="ev-list">
            {Object.values(ev.comparison.formulas).map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        ) : (
          <>
            <dl className="kv small">
              <dt>Covered duration</dt>
              <dd className="tabular">
                {duration(sm.covered_seconds)} of {duration(sm.span_seconds)} (
                {fmt((sm.coverage_ratio ?? 0) * 100, 2)}%)
              </dd>
              <dt>Rows</dt>
              <dd className="tabular">
                {sm.raw_rows} raw · {sm.accepted_rows} accepted · {sm.quarantined_conflict_rows}{" "}
                quarantined
              </dd>
              <dt>Intervals</dt>
              <dd className="tabular">
                {sm.included_intervals} included · {sm.excluded_intervals} excluded
              </dd>
            </dl>
            {Object.values(ev.comparison.formulas).map((f) => (
              <div key={f} className="formula">
                {f}
              </div>
            ))}
          </>
        )}
      </Step>

      <Step n={3} label="Source & quality">
        <SourceStep ev={ev}>
          <dt>Instrument</dt>
          <dd>DosTel1 · ISS Columbus module</dd>
          <dt>Rule</dt>
          <dd>{ev.comparison.rule_version}</dd>
        </SourceStep>
      </Step>

      <Step n={4} label="Limitations">
        <ul className="ev-list">
          {ev.limitations.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      </Step>

      <Step n={5} label="Follow-up">
        {ev.review ? (
          <p className="small" style={{ marginBottom: 8 }}>
            Current review:{" "}
            <span className="status-text-saved">● {REVIEW_LABEL[ev.review.status]}</span> · version{" "}
            {ev.review.version}
          </p>
        ) : (
          <p className="small muted" style={{ marginBottom: 8 }}>
            No review saved for this finding yet. Environment reviews never carry a participant.
          </p>
        )}
        {followUp}
      </Step>
    </div>
  );
}
