import { useCallback, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import type { HealthEvidence, ReviewStatus } from "../api/contracts";
import { useDrawer } from "../app/providers";
import { FullCmpPanel } from "../components/FullCmpPanel";
import { HealthReplayPanel } from "../components/HealthReplayPanel";
import {
  IconCheck,
  IconFlag,
  IconOverview,
  IconShield,
  IconTrend,
} from "../components/icons";
import { MetricCard } from "../components/MetricCard";
import { MissionBriefPanel } from "../components/MissionBrief";
import { PageHeader } from "../components/PageHeader";
import {
  ParticipantSelect,
  SampleSelect,
  VisitTimelineScrubber,
} from "../components/Selectors";
import { Alert, Empty, ErrorState, Skeleton } from "../components/StatusViews";
import { fmt, rangeText, REVIEW_LABEL, signed } from "../lib/format";
import { useAsync } from "../lib/useAsync";
import { useHealthSelection } from "../lib/useHealthSelection";

function findingSentence(ev: HealthEvidence): string {
  const m = ev.measurement;
  const above = m.range_status === "ABOVE_SUPPLIED_UPPER_BOUND";
  const bound = above ? m.range_high! : m.range_low!;
  const gap = Math.abs((m.value ?? 0) - bound);
  return `${fmt(m.value)} ${m.unit} is ${
    above ? "above the supplied upper" : "below the supplied lower"
  } bound of ${fmt(bound)} ${m.unit} by ${fmt(gap)} ${m.unit}.`;
}

/**
 * Monumental Terroni-style Hero Statistics Card with interactive marker tabs,
 * oversized numeric display, floating callout badge, and smooth SVG gradient wave.
 */
function HeroSpotlightBento({
  cards,
  participantId,
  visitLabel,
}: {
  cards: HealthEvidence[];
  participantId: string;
  visitLabel: string;
}) {
  const { open } = useDrawer();
  const defaultMarker =
    cards.find((c) => c.measurement.needs_review)?.measurement.marker ??
    cards[0]?.measurement.marker ??
    "creatinine";
  const [selectedMarker, setSelectedMarker] = useState<string>(defaultMarker);

  const activeCard =
    cards.find((c) => c.measurement.marker === selectedMarker) ?? cards[0];
  if (!activeCard) return null;

  const m = activeCard.measurement;
  const c = activeCard.comparison;
  const flagged = m.needs_review;

  return (
    <div className="bento-stats-grid">
      {/* Left Monumental Wave Card (like "Reach 1.05m" in Terroni reference) */}
      <section
        className="bento-hero-card anim-page-enter"
        aria-label="Primary biomarker spotlight"
      >
        <div className="bento-hero-tabs" role="tablist" aria-label="Spotlight biomarker">
          {cards.map((card) => {
            const isAct = card.measurement.marker === activeCard.measurement.marker;
            return (
              <button
                key={card.evidence_id}
                type="button"
                role="tab"
                aria-selected={isAct}
                className={`bento-tab${isAct ? " active" : ""}`}
                onClick={() => setSelectedMarker(card.measurement.marker)}
              >
                {card.measurement.marker_name}
                {card.measurement.needs_review ? (
                  <span className="bento-tab-flag" aria-hidden="true" />
                ) : null}
              </button>
            );
          })}
        </div>

        <div className="bento-hero-body">
          <div className="bento-hero-num-wrap">
            <div className="bento-hero-num tabular">
              {fmt(m.value)} <small>{m.unit}</small>
            </div>
            <div className="bento-hero-delta-row">
              {c.percent_delta !== null ? (
                <span className={`bento-delta-pill tabular ${flagged ? "amber" : "lime"}`}>
                  {signed(c.percent_delta, 1)}% {c.percent_delta >= 0 ? "↑" : "↓"} vs preflight mean
                </span>
              ) : null}
              <span className="bento-bound-caption">
                Supplied bounds: {rangeText(m.range_low, m.range_high, m.unit)} · Row{" "}
                {activeCard.source.source_row}
              </span>
            </div>
          </div>

          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => open({ kind: "evidence", id: activeCard.evidence_id })}
          >
            Inspect Provenance
          </button>
        </div>

        <div className="bento-hero-wave" aria-hidden="true">
          <div className="bento-callout-badge">
            <small>{visitLabel.split("·")[0]?.trim()}</small>
            <strong className="tabular">
              {fmt(m.value)} {m.unit}
            </strong>
          </div>
          <svg viewBox="0 0 540 165" preserveAspectRatio="none">
            <defs>
              <linearGradient id="bentoHeroWaveGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#C6F432" stopOpacity="0.58" />
                <stop offset="65%" stopColor="#C6F432" stopOpacity="0.16" />
                <stop offset="100%" stopColor="#C6F432" stopOpacity="0.0" />
              </linearGradient>
            </defs>
            <path
              d="M 0 132 C 65 114, 115 92, 175 94 C 235 96, 275 104, 330 88 C 395 68, 455 24, 540 16 L 540 165 L 0 165 Z"
              fill="url(#bentoHeroWaveGrad)"
            />
            <path
              d="M 0 132 C 65 114, 115 92, 175 94 C 235 96, 275 104, 330 88 C 395 68, 455 24, 540 16"
              fill="none"
              stroke="#65A30D"
              strokeWidth="3"
              strokeLinecap="round"
            />
            <line
              x1="330"
              y1="88"
              x2="330"
              y2="162"
              stroke="#65A30D"
              strokeDasharray="4 4"
              strokeWidth="1.5"
            />
            <circle cx="330" cy="88" r="5.5" fill="#0B0B0C" stroke="#C6F432" strokeWidth="3" />
          </svg>
        </div>
      </section>

      {/* Right Stack: Dual Mini Cards + 3-Row Signal Comparison (Terroni Reference Layout) */}
      <div className="bento-side-stack">
        <div className="bento-mini-pair">
          <div className="bento-mini-wave-card">
            <div className="bento-mini-top">
              <span>Preflight Mean</span>
              <span className="bento-mini-tag">n = {c.n}</span>
            </div>
            <div className="bento-mini-val tabular">
              {c.baseline !== null ? fmt(c.baseline, 2) : "—"}{" "}
              <small>{m.unit}</small>
            </div>
            <svg viewBox="0 0 180 54" preserveAspectRatio="none" aria-hidden="true">
              <defs>
                <linearGradient id="miniWaveA" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#C6F432" stopOpacity="0.45" />
                  <stop offset="100%" stopColor="#C6F432" stopOpacity="0" />
                </linearGradient>
              </defs>
              <path
                d="M 0 38 C 35 22, 70 40, 110 26 C 140 14, 160 12, 180 28 L 180 54 L 0 54 Z"
                fill="url(#miniWaveA)"
              />
              <path
                d="M 0 38 C 35 22, 70 40, 110 26 C 140 14, 160 12, 180 28"
                fill="none"
                stroke="#65A30D"
                strokeWidth="2"
              />
            </svg>
          </div>

          <div className="bento-mini-wave-card">
            <div className="bento-mini-top">
              <span>Upper Bound</span>
              <span className="bento-mini-tag">CSV Lab</span>
            </div>
            <div className="bento-mini-val tabular">
              {fmt(m.range_high)} <small>{m.unit}</small>
            </div>
            <svg viewBox="0 0 180 54" preserveAspectRatio="none" aria-hidden="true">
              <defs>
                <linearGradient id="miniWaveB" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#C6F432" stopOpacity="0.45" />
                  <stop offset="100%" stopColor="#C6F432" stopOpacity="0" />
                </linearGradient>
              </defs>
              <path
                d="M 0 44 C 45 36, 95 24, 138 16 C 158 12, 170 18, 180 22 L 180 54 L 0 54 Z"
                fill="url(#miniWaveB)"
              />
              <path
                d="M 0 44 C 45 36, 95 24, 138 16 C 158 12, 170 18, 180 22"
                fill="none"
                stroke="#65A30D"
                strokeWidth="2"
              />
            </svg>
          </div>
        </div>

        {/* 3-Row Micro Sparkline Summary Card */}
        <div className="bento-micro-rows-card">
          <div className="bento-micro-row">
            <span className="bento-micro-label">Sample Delta ({participantId})</span>
            <svg viewBox="0 0 110 26" className="bento-micro-svg" aria-hidden="true">
              <path
                d="M 2 18 Q 28 8, 54 14 T 108 8"
                fill="none"
                stroke="#65A30D"
                strokeWidth="2"
              />
            </svg>
            <strong className="bento-micro-val tabular">
              {c.delta !== null ? `${signed(c.delta, 2)} ${m.unit}` : "—"}
            </strong>
          </div>

          <div className="bento-micro-row">
            <span className="bento-micro-label">Out-of-Bounds Count</span>
            <svg viewBox="0 0 110 26" className="bento-micro-svg" aria-hidden="true">
              <path
                d="M 2 20 Q 32 6, 62 16 T 108 10"
                fill="none"
                stroke="#D97706"
                strokeWidth="2"
              />
            </svg>
            <strong className="bento-micro-val tabular">
              {cards.filter((x) => x.measurement.needs_review).length} / 5
            </strong>
          </div>

          <div className="bento-micro-row">
            <span className="bento-micro-label">ISS DosTel1 Case (Separate)</span>
            <svg viewBox="0 0 110 26" className="bento-micro-svg" aria-hidden="true">
              <path
                d="M 2 19 Q 36 12, 68 15 T 108 7"
                fill="none"
                stroke="#65A30D"
                strokeWidth="2"
              />
            </svg>
            <strong className="bento-micro-val tabular">296.04 µGy</strong>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Overview() {
  const { participants, resolved, notice, update } = useHealthSelection(false);
  const { open, dataVersion } = useDrawer();
  const [showExtendedCmp, setShowExtendedCmp] = useState(false);

  const pid = resolved?.participant.participant_id;
  const visit = resolved?.sample.visit;
  const overview = useAsync(
    () => api.health(pid!, visit!),
    [pid, visit, dataVersion],
    Boolean(pid && visit)
  );
  const data = overview.data;
  const onVisit = useCallback((v: string) => update({ sample: v }, { replace: true }), [update]);

  const flagged = data ? data.cards.filter((c) => c.measurement.needs_review) : [];

  return (
    <>
      <PageHeader
        eyebrow="01 · Internal Health Overview"
        title="Health Overview"
        study="health"
        purpose="What should I review? Five core blood markers from one real historical Inspiration4 sample, compared with the laboratory range supplied in the source file and with the participant's own preflight samples."
      />

      {participants.error ? (
        <ErrorState error={participants.error} onRetry={participants.reload} />
      ) : null}

      {resolved && participants.data ? (
        <div className="stack" style={{ gap: 16 }}>
          {/* Top 4 Bento Summary KPI Pills (Terroni-inspired) */}
          <div className="bento-kpi-strip" aria-label="Selected sample summary metrics">
            <div className="bento-kpi-pill">
              <div>
                <span className="bento-kpi-label">Crew Participant</span>
                <strong className="bento-kpi-val tabular">
                  {resolved.participant.participant_id}
                </strong>
              </div>
              <span className="bento-kpi-icon">
                <IconOverview />
              </span>
            </div>
            <div className="bento-kpi-pill">
              <div>
                <span className="bento-kpi-label">Mission Timepoint</span>
                <strong className="bento-kpi-val tabular">{resolved.sample.visit}</strong>
              </div>
              <span className="bento-kpi-icon">
                <IconTrend />
              </span>
            </div>
            <div className="bento-kpi-pill">
              <div>
                <span className="bento-kpi-label">Verified CMP Analytes</span>
                <strong className="bento-kpi-val tabular">17</strong>
              </div>
              <span className="bento-kpi-icon">
                <IconShield />
              </span>
            </div>
            <div className="bento-kpi-pill">
              <div>
                <span className="bento-kpi-label">Range Gate Status</span>
                <strong className="bento-kpi-val tabular">
                  {flagged.length ? `${flagged.length} Flagged` : "All Within"}
                </strong>
              </div>
              <span className={`bento-kpi-icon ${flagged.length ? "amber" : "lime"}`}>
                {flagged.length ? <IconFlag /> : <IconCheck />}
              </span>
            </div>
          </div>

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
              Historical research sample · not a live reading. L = days before launch, R = days
              after return.
            </p>
            <div className="context-chips">
              <span className="meta">
                {resolved.sample.phase === "PREFLIGHT"
                  ? "Preflight sample"
                  : "Postflight sample"}{" "}
                · Sample ID <code>{resolved.sample.sample_id}</code>
              </span>
            </div>
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
      {overview.error ? <ErrorState error={overview.error} onRetry={overview.reload} /> : null}
      {!data && overview.loading ? (
        <Skeleton height={190} label="Loading marker cards…" />
      ) : null}

      {data ? (
        <>
          {/* Terroni-Inspired Hero Statistics Spotlight Grid */}
          <HeroSpotlightBento
            cards={data.cards}
            participantId={data.participant_id}
            visitLabel={data.visit_label}
          />

          <section aria-labelledby="markers-title" aria-busy={overview.loading}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 14,
                flexWrap: "wrap",
                gap: 8,
              }}
            >
              <h2 id="markers-title" className="small muted" style={{ fontWeight: 700 }}>
                Primary 5 CMP Markers · {data.participant_id} · {data.visit_label}
              </h2>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                aria-expanded={showExtendedCmp}
                onClick={() => setShowExtendedCmp((s) => !s)}
              >
                {showExtendedCmp
                  ? "Hide Extended 17-Analyte CMP Matrix"
                  : "Inspect Full 17-Analyte CMP Source Matrix"}
              </button>
            </div>
            <div className="metric-grid">
              {data.cards.map((c) => (
                <MetricCard key={c.evidence_id} ev={c} />
              ))}
            </div>
          </section>

          {showExtendedCmp ? (
            <FullCmpPanel participant={data.participant_id} visit={data.visit} />
          ) : null}

          <div className="split-brief">
            <div className="stack" style={{ gap: 24, minWidth: 0 }}>
              <section className="card" aria-labelledby="review-title">
                <div className="card-head">
                  <div>
                    <p className="card-kicker">Action list</p>
                    <h2 id="review-title">Results to review</h2>
                    <p>
                      {data.participant_id} · {data.visit_label} · values outside the range
                      supplied in the source file
                    </p>
                  </div>
                  <span
                    className={`meta ${flagged.length ? "status-review" : ""}`}
                    style={{ fontWeight: 600 }}
                  >
                    {flagged.length ? <IconFlag width={15} height={15} /> : null}{" "}
                    {flagged.length} of {data.cards.length} outside supplied range
                  </span>
                </div>
                {flagged.length === 0 ? (
                  <Empty>
                    No selected measurements are outside the supplied ranges. This does not assess
                    overall health.
                  </Empty>
                ) : (
                  flagged.map((ev) => (
                    <div className="finding" key={ev.evidence_id}>
                      <div style={{ minWidth: 0 }}>
                        <div className="finding-title">
                          {ev.measurement.marker_name} ·{" "}
                          <span className="status-review">▲ Needs review</span>
                        </div>
                        <p className="finding-body tabular">{findingSentence(ev)}</p>
                        <p className="small muted" style={{ marginTop: 4 }}>
                          {ev.comparison.baseline_available
                            ? `Compared with ${ev.context.participant_id}'s retrospective preflight mean of ${fmt(
                                ev.comparison.baseline
                              )} ${ev.measurement.unit} (n = ${ev.comparison.n}).`
                            : "No personal baseline (fewer than two preflight values)."}
                          {ev.context.phase === "PREFLIGHT"
                            ? " Collected before launch — not a spaceflight effect."
                            : " Descriptive only; no cause is inferred."}{" "}
                          Not a diagnosis.
                        </p>
                        {ev.review ? (
                          <p style={{ marginTop: 6 }}>
                            <span className="status-text-saved">
                              ● {REVIEW_LABEL[ev.review.status]} · v{ev.review.version}
                            </span>
                          </p>
                        ) : null}
                      </div>
                      <div className="btn-row">
                        <button
                          type="button"
                          className="btn btn-primary"
                          onClick={() => open({ kind: "evidence", id: ev.evidence_id })}
                          aria-label={`Inspect result: ${ev.measurement.marker_name}`}
                        >
                          Inspect result
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary"
                          onClick={() =>
                            open({
                              kind: "evidence",
                              id: ev.evidence_id,
                              section: "review",
                            })
                          }
                          aria-label={`${
                            ev.review ? "Update follow-up" : "Record follow-up"
                          } for ${ev.measurement.marker_name}`}
                        >
                          {ev.review ? "Update follow-up" : "Record follow-up"}
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </section>

              {pid && visit ? (
                <HealthReplayPanel participant={pid} visit={visit} onVisit={onVisit} />
              ) : null}

              <section className="card" aria-labelledby="data-title">
                <div className="card-head" style={{ marginBottom: 12 }}>
                  <div>
                    <p className="card-kicker">Dataset · OSD-575</p>
                    <h2 id="data-title">Available data &amp; saved reviews</h2>
                  </div>
                  <Link to={`/reviews?case=health&participant=${data.participant_id}`}>
                    Open in Review Log
                  </Link>
                </div>
                <div className="mini-stats" style={{ marginBottom: 14 }}>
                  {(Object.keys(REVIEW_LABEL) as ReviewStatus[]).map((s) => (
                    <div className="mini-stat" key={s}>
                      <b className="tabular">{data.participant_review_counts[s] ?? 0}</b>
                      <span>
                        {REVIEW_LABEL[s]} · {data.participant_id}
                      </span>
                    </div>
                  ))}
                </div>
                <dl className="kv small">
                  <dt>Dataset</dt>
                  <dd>NASA OSD-575 · Comprehensive Metabolic Panel</dd>
                  <dt>Samples</dt>
                  <dd className="tabular">
                    {data.dataset.samples} ({data.dataset.participants} participants ×{" "}
                    {data.dataset.visits.length} visits)
                  </dd>
                  <dt>Selected values</dt>
                  <dd className="tabular">{data.dataset.nonmissing_values} across 5 markers</dd>
                  <dt>SHA-256</dt>
                  <dd>
                    <code title={data.dataset.sha256}>{data.dataset.sha256.slice(0, 16)}…</code>
                  </dd>
                </dl>
                <p className="small muted" style={{ marginTop: 12 }}>
                  Sparse blood draws, not continuous monitoring. The ISS radiation record is a
                  separate case and is not linked to any participant.
                </p>
              </section>
            </div>

            <MissionBriefPanel participant={data.participant_id} sample={data.visit} />
          </div>
        </>
      ) : null}
    </>
  );
}
