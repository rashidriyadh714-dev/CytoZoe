import { useEffect, useState } from "react";
import { api } from "../api/client";
import {
  CohortComparisonChart,
  HealthChartLegend,
  HealthVisitChart,
} from "../charts/HealthVisitChart";
import { useDrawer } from "../app/providers";
import { HealthEvidencePanel } from "../components/EvidencePanel";
import { PageHeader } from "../components/PageHeader";
import { ReviewForm } from "../components/ReviewForm";
import {
  MarkerTabs,
  ParticipantSelect,
  SampleSelect,
  VisitTimelineScrubber,
} from "../components/Selectors";
import { Alert, ErrorState, Skeleton } from "../components/StatusViews";
import { fmt, RANGE_TEXT, signed } from "../lib/format";
import { useAsync } from "../lib/useAsync";
import { MARKER_NAME, MARKERS, useHealthSelection } from "../lib/useHealthSelection";

export default function Health() {
  const { participants, resolved, notice, update } = useHealthSelection(true);
  const { open, dataVersion } = useDrawer();
  const [writing, setWriting] = useState(false);
  const [chartMode, setChartMode] = useState<"individual" | "cohort">("individual");

  const pid = resolved?.participant.participant_id;
  const visit = resolved?.sample.visit;
  const marker = resolved?.marker ?? "creatinine";

  const trend = useAsync(
    () => api.trend(pid!, marker),
    [pid, marker, dataVersion],
    Boolean(pid && marker)
  );
  const overview = useAsync(
    () => api.health(pid!, visit!),
    [pid, visit, dataVersion],
    Boolean(pid && visit)
  );
  const replay = useAsync(() => api.healthReplay(pid!), [pid], Boolean(pid));

  const ev = overview.data?.cards.find((c) => c.measurement.marker === marker) ?? null;
  const flagged = new Set(
    overview.data?.cards
      .filter((c) => c.measurement.needs_review)
      .map((c) => c.measurement.marker) ?? []
  );
  const frame = replay.data?.frames.find((f) => f.visit === visit) ?? null;
  const replayCard = frame?.cards.find((c) => c.marker === marker) ?? null;

  useEffect(() => setWriting(false), [ev?.evidence_id]);

  return (
    <>
      <PageHeader
        eyebrow="02 · Internal Health Trends & Multi-Study Context"
        title="Health Trends"
        study="health"
        purpose="How did this marker change across the seven real visits? Actual samples in visit order, compared with the supplied laboratory range and two clearly labelled baselines."
      />

      {participants.error ? (
        <ErrorState error={participants.error} onRetry={participants.reload} />
      ) : null}

      {resolved && participants.data ? (
        <div className="stack" style={{ gap: 14 }}>
          <div className="toolbar" role="group" aria-label="Sample selection">
            <ParticipantSelect
              participants={participants.data}
              value={resolved.participant.participant_id}
              onChange={(v) => update({ participant: v })}
            />
            <SampleSelect
              samples={resolved.participant.samples}
              value={resolved.sample.visit}
              onChange={(v) => update({ sample: v })}
            />
            <p className="toolbar-note">
              Tip: click a dot on the chart, a node on the timeline scrubber, or a row in the table
              to select that sample.
            </p>
          </div>
          <VisitTimelineScrubber
            samples={resolved.participant.samples}
            value={resolved.sample.visit}
            onChange={(v) => update({ sample: v })}
          />
        </div>
      ) : participants.loading ? (
        <Skeleton height={86} label="Loading participants…" />
      ) : null}

      {notice ? <Alert tone="info">{notice}</Alert> : null}

      {marker ? (
        <MarkerTabs
          markers={MARKERS.map((m) => ({ id: m, label: MARKER_NAME[m] }))}
          value={marker}
          flagged={flagged}
          onChange={(m) => update({ marker: m })}
          panelId="marker-panel"
        />
      ) : null}

      <div
        id="marker-panel"
        role="tabpanel"
        aria-labelledby={marker ? `tab-${marker}` : undefined}
        className="split"
      >
        <div className="stack" style={{ gap: 24, minWidth: 0 }}>
          <section className="card" aria-labelledby="chart-title" aria-busy={trend.loading}>
            <div className="card-head">
              <div>
                <h2 id="chart-title">
                  {trend.data
                    ? chartMode === "individual"
                      ? `${trend.data.marker_name} by visit · ${trend.data.participant_id}`
                      : `${trend.data.marker_name} across all 4 Inspiration4 crew (C001–C004)`
                    : "Marker by visit"}
                </h2>
                <p>
                  {chartMode === "individual"
                    ? "Chart 1 · actual samples in visit order (not equally spaced in time; no false interpolation)"
                    : "Cohort comparison · C001, C002, C003 and C004 across the 7 mission timepoints"}
                </p>
              </div>
              <div className="seg-group" role="group" aria-label="Chart comparison mode">
                <button
                  type="button"
                  className={`seg-btn ${chartMode === "individual" ? "active" : ""}`}
                  onClick={() => setChartMode("individual")}
                >
                  Single Participant ({pid ?? "C001"})
                </button>
                <button
                  type="button"
                  className={`seg-btn ${chartMode === "cohort" ? "active" : ""}`}
                  onClick={() => setChartMode("cohort")}
                >
                  All 4 Crew Cohort
                </button>
              </div>
            </div>

            {trend.error ? <ErrorState error={trend.error} onRetry={trend.reload} /> : null}
            {!trend.data && trend.loading ? (
              <Skeleton height={360} label="Loading chart…" />
            ) : null}

            {trend.data && visit ? (
              <>
                {chartMode === "individual" ? (
                  <>
                    <HealthVisitChart
                      trend={trend.data}
                      selectedVisit={visit}
                      onSelect={(v) => update({ sample: v })}
                    />
                    <HealthChartLegend trend={trend.data} />
                  </>
                ) : (
                  <CohortComparisonChart
                    trend={trend.data}
                    activeParticipant={trend.data.participant_id}
                  />
                )}
                <p className="chart-note">
                  {trend.data.x_axis_note} The preflight mean uses L-92, L-44 and L-3, so it is
                  retrospective for every visit.
                </p>
                <details className="disclosure">
                  <summary>Data table · {trend.data.points.length} source values</summary>
                  <div className="table-wrap">
                    <table className="data">
                      <caption>
                        {trend.data.marker_name} ({trend.data.unit}) for{" "}
                        {trend.data.participant_id}, from {trend.data.points.length} source rows
                      </caption>
                      <thead>
                        <tr>
                          <th scope="col">Visit</th>
                          <th scope="col" className="num">
                            Value
                          </th>
                          <th scope="col" className="num">
                            Supplied min
                          </th>
                          <th scope="col" className="num">
                            Supplied max
                          </th>
                          <th scope="col">Range status</th>
                          <th scope="col" className="num">
                            Data row
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {trend.data.points.map((p) => (
                          <tr
                            key={p.visit}
                            className={p.visit === visit ? "row-selected" : undefined}
                            aria-current={p.visit === visit ? "true" : undefined}
                          >
                            <td>
                              <button
                                type="button"
                                className="btn btn-ghost btn-sm"
                                onClick={() => update({ sample: p.visit })}
                                aria-label={`Select visit ${p.visit_label}`}
                              >
                                {p.visit_label}
                              </button>
                            </td>
                            <td className="num tabular">
                              {p.value === null ? "missing" : fmt(p.value)}
                            </td>
                            <td className="num tabular">{fmt(p.range_low)}</td>
                            <td className="num tabular">{fmt(p.range_high)}</td>
                            <td className={p.needs_review ? "status-review" : undefined}>
                              {RANGE_TEXT[p.range_status]}
                            </td>
                            <td className="num tabular">{p.source_row}</td>
                          </tr>
                        ))}
                        <tr>
                          <th scope="row">Preflight mean</th>
                          <td className="num tabular">
                            {trend.data.baseline.available
                              ? fmt(trend.data.baseline.value)
                              : "not computed"}
                          </td>
                          <td colSpan={4} className="muted">
                            n = {trend.data.baseline.n} · calculated, not a sample
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </details>
              </>
            ) : null}
          </section>

          {trend.data && visit ? (
            <section className="card" aria-labelledby="baselines-title" aria-busy={replay.loading}>
              <div className="card-head">
                <div>
                  <p className="card-kicker">Two baselines · labelled separately</p>
                  <h2 id="baselines-title">
                    Baseline comparison · {trend.data.marker_name} ·{" "}
                    {frame?.visit_label ?? visit}
                  </h2>
                  <p>
                    The retrospective mean uses every preflight sample. The replay baseline uses
                    only preflight visits recorded strictly before this visit, so it never sees the
                    current or a later value.
                  </p>
                </div>
              </div>
              {replay.error ? <ErrorState error={replay.error} onRetry={replay.reload} /> : null}
              <div className="baselines">
                <div className="baseline-tile">
                  <span className="k">Retrospective preflight mean</span>
                  <span className="v tabular">
                    {trend.data.baseline.available ? (
                      <>
                        {fmt(trend.data.baseline.value)} <small>{trend.data.unit}</small>
                      </>
                    ) : (
                      "Not computed"
                    )}
                  </span>
                  <span className="small muted">
                    n = {trend.data.baseline.n} ·{" "}
                    {trend.data.baseline.visits.join(", ") || "no preflight values"}
                  </span>
                  <span className="small muted tabular">
                    Difference at this visit:{" "}
                    {ev?.comparison.delta === null || ev?.comparison.delta === undefined
                      ? "—"
                      : `${signed(ev.comparison.delta)} ${trend.data.unit}`}
                  </span>
                </div>
                <div className="baseline-tile replay">
                  <span className="k">Known before this visit (prospective replay)</span>
                  {replayCard ? (
                    <>
                      <span className="v tabular">
                        {replayCard.baseline_so_far === null ? (
                          "Not available"
                        ) : (
                          <>
                            {fmt(replayCard.baseline_so_far)} <small>{replayCard.unit}</small>
                          </>
                        )}
                      </span>
                      <span className="small muted">
                        n = {replayCard.n_so_far} ·{" "}
                        {frame?.baseline_visits?.length
                          ? frame.baseline_visits.join(", ")
                          : "no earlier preflight visit"}
                        {replayCard.baseline_so_far === null
                          ? " · needs at least 2 earlier preflight values"
                          : ""}
                      </span>
                      <span className="small muted tabular">
                        Difference at this visit:{" "}
                        {replayCard.delta === null
                          ? "—"
                          : `${signed(replayCard.delta)} ${replayCard.unit}`}
                      </span>
                    </>
                  ) : replay.loading ? (
                    <span className="small muted">Loading replay baseline…</span>
                  ) : (
                    <span className="small muted">Not available for this visit.</span>
                  )}
                </div>
              </div>
              {ev?.comparison.includes_selected_sample ? (
                <p className="chart-note">
                  At this preflight visit, the retrospective mean includes the visit's own value.
                  The replay baseline never does.
                </p>
              ) : null}
            </section>
          ) : null}

          {/* Multi-Study Scope & Scientific Safeguards Card (NASA GLDS-174 & PhysioNet BIDMC from PDF brief) */}
          <section className="card stack" aria-labelledby="multi-study-title">
            <div>
              <p className="card-kicker">Project Brief Scope · Multi-Study Safeguards</p>
              <h2 id="multi-study-title">
                Molecular Context (NASA GLDS-174) &amp; Signal Validation Scope (PhysioNet BIDMC)
              </h2>
              <p className="small muted" style={{ marginTop: 4 }}>
                As specified in the CytoZoe One-Page Project Brief, biological context and
                signal-processing benchmarks are strictly bounded so they are never conflated with
                OSD-575 crew blood chemistry:
              </p>
            </div>
            <div className="baselines">
              <div className="baseline-tile">
                <span className="k">NASA GLDS-174 · Hair-Follicle Transcriptomics</span>
                <p className="small" style={{ marginTop: 4 }}>
                  <strong>Role in CytoZoe:</strong> Provides molecular research context for
                  spaceflight-associated gene-expression shifts (oxidative stress, metabolic and
                  cellular repair pathways) studied in ISS astronauts.
                </p>
                <p className="small muted" style={{ marginTop: 4 }}>
                  <strong>Data Boundary:</strong> Gene-expression fold changes are not direct vital
                  signs, serum electrolyte concentrations, or proof of radiation-caused effects.
                </p>
              </div>
              <div className="baseline-tile">
                <span className="k">PhysioNet BIDMC · Waveform Benchmark</span>
                <p className="small" style={{ marginTop: 4 }}>
                  <strong>Role in CytoZoe:</strong> Optional offline technical-validation benchmark
                  for HR, ECG, PPG, SpO₂ and respiration signal-processing pipelines.
                </p>
                <p className="small muted" style={{ marginTop: 4 }}>
                  <strong>Data Boundary:</strong> Terrestrial clinical human data — never presented
                  as astronaut-health evidence or astronaut baseline telemetry.
                </p>
              </div>
            </div>
          </section>
        </div>

        <section className="card" aria-labelledby="evidence-title">
          <div className="card-head">
            <div>
              <h2 id="evidence-title">Evidence</h2>
              <p>
                {ev
                  ? `${ev.measurement.marker_name} · ${ev.context.visit_label}`
                  : "Selected sample"}
              </p>
            </div>
            {ev ? (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() =>
                  open({ kind: "evidence", id: ev.evidence_id, section: "explain" })
                }
              >
                Explain
              </button>
            ) : null}
          </div>
          {overview.error ? (
            <ErrorState error={overview.error} onRetry={overview.reload} />
          ) : null}
          {!ev && overview.loading ? <Skeleton height={420} label="Loading evidence…" /> : null}
          {ev ? (
            <HealthEvidencePanel
              ev={ev}
              followUp={
                writing ? (
                  <ReviewForm
                    key={ev.evidence_id}
                    findingId={ev.evidence_id}
                    review={ev.review}
                    autoFocus
                  />
                ) : (
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => setWriting(true)}
                  >
                    {ev.review ? "Update follow-up" : "Record follow-up"}
                  </button>
                )
              }
            />
          ) : null}
        </section>
      </div>
    </>
  );
}
