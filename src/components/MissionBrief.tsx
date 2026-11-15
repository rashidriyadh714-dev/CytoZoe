import { Link } from "react-router-dom";
import { api } from "../api/client";
import type { BriefItem, MissionBrief } from "../api/contracts";
import { useDrawer } from "../app/providers";
import { fmt, localDateTime, RANGE_TEXT, rangeText, REVIEW_LABEL } from "../lib/format";
import { useAsync } from "../lib/useAsync";
import { IconFlag, IconShield } from "./icons";
import { ErrorState, Skeleton } from "./StatusViews";

const PROVENANCE_TEXT: Record<string, string> = {
  NASA_PINNED_VERIFIED: "Verified NASA snapshot",
  UNVERIFIED_LEGACY: "Unverified legacy data",
  RESEARCH_IMPORTED_UNVERIFIED: "Unverified research import",
  MISSION_ADAPTER_TEST: "Adapter test data",
};

/**
 * Mission Health Intelligence Brief — a read-only rendering of GET /api/mission/brief (MissionBriefV1).
 * Every sentence and number comes from the backend payload; this component only lays it out.
 */
export function MissionBriefPanel({
  participant,
  sample,
}: {
  participant: string;
  sample: string;
}) {
  const { dataVersion } = useDrawer();
  const brief = useAsync(
    () => api.missionBrief(participant, sample),
    [participant, sample, dataVersion]
  );
  return (
    <section className="brief" aria-labelledby="brief-title" aria-busy={brief.loading}>
      <div>
        <p className="brief-kicker">03 · Offline Health Intelligence Brief</p>
        <h2 id="brief-title" style={{ marginTop: 8 }}>
          {brief.data
            ? `${brief.data.context.participant_id} · ${brief.data.context.visit_label}`
            : `${participant} · ${sample}`}
        </h2>
        {brief.data ? (
          <p className="small muted" style={{ marginTop: 2 }}>
            {Math.abs(brief.data.context.relative_day)}{" "}
            {brief.data.context.relative_day_reference} · historical research sample, not a live
            reading
          </p>
        ) : null}
      </div>
      {brief.error ? (
        <ErrorState
          error={brief.error}
          onRetry={brief.reload}
          title="The brief could not be assembled"
        />
      ) : null}
      {!brief.data && brief.loading ? (
        <Skeleton height={360} label="Assembling the brief from verified evidence…" />
      ) : null}
      {brief.data ? <BriefBody b={brief.data} /> : null}
    </section>
  );
}

function BriefBody({ b }: { b: MissionBrief }) {
  const verified = b.dataset.provenance === "NASA_PINNED_VERIFIED";
  return (
    <>
      <p className="brief-summary">{b.summary.text}</p>
      <div className="brief-meta-line">
        <span className={verified ? "brief-verified-tag" : ""}>
          <IconShield width={14} height={14} />
          {PROVENANCE_TEXT[b.dataset.provenance] ?? b.dataset.provenance}
        </span>
        <span aria-hidden="true">·</span>
        <span className="tabular">
          {b.coverage.measured_count} of {b.coverage.considered_count} markers measured
        </span>
        <span aria-hidden="true">·</span>
        <span className="tabular">
          {b.summary.outside_supplied_range_count} outside supplied range
        </span>
      </div>

      {b.findings.length ? (
        <div className="stack" style={{ gap: 12 }}>
          {b.findings.map((f) => (
            <BriefFinding key={f.evidence_id} item={f} />
          ))}
        </div>
      ) : null}

      {b.other_measurements.length ? (
        <div style={{ overflowX: "auto" }}>
          <table className="brief-table">
            <caption>
              Other measured markers at this visit (inside their supplied range or one-sided)
            </caption>
            <thead>
              <tr>
                <th scope="col">Marker</th>
                <th scope="col" className="num">
                  Value
                </th>
                <th scope="col">Supplied range</th>
                <th scope="col" className="num">
                  Row
                </th>
                <th scope="col">
                  <span className="sr-only">Action</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {b.other_measurements.map((m) => (
                <OtherRow key={m.evidence_id} item={m} />
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {b.missing_measurements.length ? (
        <p className="small muted">
          No value recorded in the source for:{" "}
          {b.missing_measurements.map((m) => m.marker_name).join(", ")}. Nothing is filled in.
        </p>
      ) : null}

      <details>
        <summary>Dataset limitations &amp; case separation</summary>
        <ul className="brief-list">
          {b.dataset_limitations.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
        <p className="small" style={{ marginTop: 10, color: "#FDE68A" }}>
          {b.case_separation}
        </p>
        <p className="small muted" style={{ marginTop: 8 }}>
          {b.coverage.note}
        </p>
      </details>

      <div className="brief-foot">
        <span>
          Source: {b.dataset.title} · {b.dataset.provider}
        </span>
        <span>
          File <code>{b.dataset.file_name}</code>
        </span>
        <span>
          SHA-256 <code title={b.dataset.sha256}>{b.dataset.sha256}</code>
        </span>
        <span>
          {b.quality.validation_status === "SHA256_MATCHES_REGISTERED_SNAPSHOT"
            ? "Hash matches the registered snapshot"
            : b.quality.validation_status}{" "}
          · parser {b.quality.parser_version} · {b.quality.parse_issues} parse issues
        </span>
        <span>
          Assembled {localDateTime(b.generated_at)} · {b.schema_version} · rule{" "}
          {b.rule_versions.health}
        </span>
        <span>
          <Link to="/reviews">Review Log &amp; export</Link>
        </span>
      </div>
    </>
  );
}

function BriefFinding({ item: f }: { item: BriefItem }) {
  const { open } = useDrawer();
  const reviewed = Boolean(f.review.status);
  return (
    <div className="brief-item flag">
      <div className="brief-item-head">
        <h3>{f.marker_name}</h3>
        <span className="brief-flag">
          <IconFlag />
          {RANGE_TEXT[f.status]}
        </span>
      </div>
      <div className="brief-value tabular">
        {f.value === null ? "No value" : fmt(f.value)}
        <small>{f.unit}</small>
      </div>
      <ol className="brief-flow" aria-label={`Evidence chain for ${f.marker_name}`}>
        <li>
          <span className="k">Observed</span>
          <span className="v">{f.explanation.observed}</span>
        </li>
        <li>
          <span className="k">Compared with</span>
          <span className="v">{f.explanation.compared_with}</span>
        </li>
        <li>
          <span className="k">Source</span>
          <span className="v">
            Data row {f.source.source_row} (file line {f.source.file_line}) · column{" "}
            <code>{f.source.source_column}</code> · raw value “{f.source.raw_value}”
          </span>
        </li>
        {f.explanation.why_flagged ? (
          <li>
            <span className="k">Why flagged</span>
            <span className="v">{f.explanation.why_flagged}</span>
          </li>
        ) : null}
        <li>
          <span className="k">Limitations</span>
          <span className="v">
            <ul className="brief-list" style={{ paddingLeft: 16 }}>
              {f.explanation.limitations.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          </span>
        </li>
        <li>
          <span className="k">Next step</span>
          <span className="v">{f.explanation.next_review_action}</span>
        </li>
      </ol>
      {reviewed ? (
        <p className="small" style={{ color: "#6EE7B7" }}>
          ● Saved review: {REVIEW_LABEL[f.review.status!]} · version {f.review.version}
        </p>
      ) : null}
      <div className="btn-row">
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={() => open({ kind: "evidence", id: f.evidence_id, section: "review" })}
          aria-label={`${reviewed ? "Update follow-up" : "Record follow-up"}: ${
            f.marker_name
          } (Mission Brief)`}
        >
          {reviewed ? "Update follow-up" : "Record follow-up"}
        </button>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => open({ kind: "evidence", id: f.evidence_id })}
          aria-label={`Inspect evidence: ${f.marker_name} (Mission Brief)`}
        >
          Inspect evidence
        </button>
      </div>
    </div>
  );
}

function OtherRow({ item: m }: { item: BriefItem }) {
  const { open } = useDrawer();
  return (
    <tr>
      <th scope="row" style={{ fontWeight: 550 }}>
        {m.marker_name}
      </th>
      <td className="num tabular">{m.value === null ? "—" : `${fmt(m.value)} ${m.unit}`}</td>
      <td className="tabular" title={RANGE_TEXT[m.status]}>
        {rangeText(m.range_low, m.range_high, m.unit)}
      </td>
      <td className="num tabular">{m.source.source_row}</td>
      <td style={{ textAlign: "right" }}>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          style={{ minHeight: 32 }}
          onClick={() => open({ kind: "evidence", id: m.evidence_id })}
          aria-label={`Inspect evidence: ${m.marker_name} (Mission Brief)`}
        >
          Inspect evidence
        </button>
      </td>
    </tr>
  );
}
