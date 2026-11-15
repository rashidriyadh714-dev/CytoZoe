/**
 * CytoZoe Backend Domain Services
 * Implements Health, Environment, MissionBriefV1, Reviews (optimistic concurrency + audit trail),
 * Export Packet (JSON + printable HTML), and Readiness Diagnostics.
 */
import crypto from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import * as quality from "../engines/quality";
import * as health from "../engines/health";
import * as environment from "../engines/environment";
import * as explainEngine from "../engines/explain";
import {
  APP_VERSION,
  DB_SCHEMA_VERSION,
  GIT_VERSION,
  acceptedHashes,
  getRawDatasetBuffer,
  loadManifest,
  utcNow,
} from "./db";

export class AppError extends Error {
  status: number;
  code: string;
  details: Record<string, unknown>;
  constructor(status: number, code: string, message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const MARKER_ORDER = ["glucose", "sodium", "potassium", "creatinine", "calcium"] as const;
export const MARKER_NAMES: Record<string, string> = {
  glucose: "Glucose",
  sodium: "Sodium",
  potassium: "Potassium",
  creatinine: "Creatinine",
  calcium: "Calcium",
};

export const HEALTH_LIMITATIONS = [
  "Historical research data from 4 anonymised Inspiration4 crew members (7 visits each); not live astronaut telemetry.",
  "Laboratory reference ranges come from the source CSV file and are not spaceflight-validated diagnostic thresholds.",
  "The retrospective preflight mean uses all three preflight samples (L-92, L-44, L-3), so preflight comparisons include the sample itself.",
  "Not linked to the ISS DosTel1 radiation record (different mission, year, spacecraft and people).",
];

export const ENV_LIMITATIONS = [
  "Area monitor reading from the DosTel1 instrument in the ISS Columbus module on 1 March 2022; not a personal, organ or effective astronaut dose.",
  "15 timestamps in the source export appear twice with different absorbed dose rates; all 30 conflicting rows are quarantined rather than averaged or cherry-picked.",
  "Accumulated sensor dose is estimated by trapezoidal integration over covered intervals (Δt ≤ 300 s) with no extrapolation across gaps.",
  "Separate case study: never linked to any Inspiration4 participant.",
];

export const CASE_SEPARATION =
  "The Inspiration4 blood chemistry dataset (OSD-575, September 2021) and the ISS Columbus DosTel1 radiation dataset (1 March 2022) come from different missions, spacecraft, dates and people. CytoZoe never merges or correlates them.";

export const BRIEF_QUESTIONS = [
  { id: "EXPLAIN_RESULT", label: "Explain this result" },
  { id: "HOW_CALCULATED", label: "How was this calculated?" },
  { id: "SOURCE_LOCATION", label: "Where did this number come from?" },
  { id: "LIMITATIONS", label: "What can this dataset not tell us?" },
  { id: "FOLLOW_UP_OPTIONS", label: "What follow-up can be recorded?" },
  { id: "DIAGNOSIS_REQUEST", label: "Does this mean something is wrong?" },
  { id: "CAUSATION_REQUEST", label: "Did radiation cause this?" },
];

export const REVIEW_STATUSES = ["OPEN", "FOLLOW_UP_REQUESTED", "REVIEWED"] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

/* ================= Runtime & Readiness ================= */

export function getReadiness(db: DatabaseSync) {
  const checks: Array<{ name: string; ok: boolean; code: string | null; detail: string }> = [];
  const check = (name: string, ok: boolean, code: string, detail: string) => ({
    name,
    ok,
    code: ok ? null : code,
    detail,
  });

  try {
    const vRow = db.prepare("PRAGMA user_version").get() as { user_version: number } | undefined;
    const version = vRow?.user_version ?? 0;
    checks.push(check("database", true, "", "SQLite reachable"));
    checks.push(
      check(
        "migrations",
        version === DB_SCHEMA_VERSION,
        "MIGRATION_PENDING",
        `schema version ${version} of ${DB_SCHEMA_VERSION}`
      )
    );

    const rows = db
      .prepare("SELECT id, kind, sha256, provenance FROM datasets")
      .all() as Array<{ id: string; kind: string; sha256: string; provenance: string }>;
    const byKind = new Map(rows.map((r) => [r.kind, r]));
    const manifest = loadManifest();

    for (const entry of manifest.datasets) {
      const row = byKind.get(entry.kind);
      if (!row) {
        checks.push(
          check(`dataset:${entry.id}`, false, "DATASET_NOT_IMPORTED", "Not imported.")
        );
      } else if (!acceptedHashes(entry).has(row.sha256) || row.provenance !== "NASA_PINNED_VERIFIED") {
        checks.push(
          check(
            `dataset:${entry.id}`,
            false,
            "SOURCE_HASH_MISMATCH",
            "Loaded bytes are not a registered verified NASA snapshot."
          )
        );
      } else {
        checks.push(check(`dataset:${entry.id}`, true, "", `verified ${row.sha256.slice(0, 12)}…`));
      }
    }
  } catch {
    checks.push(check("database", false, "DATABASE_UNAVAILABLE", "The local SQLite database cannot be opened or read."));
    return { ready: false, state: "DATABASE_UNAVAILABLE", checks };
  }

  const failed = checks.find((c) => !c.ok);
  return {
    ready: !failed,
    state: failed ? failed.code! : "READY",
    checks,
  };
}

export function getStatus(db: DatabaseSync) {
  const r = getReadiness(db);
  const dsRows = db
    .prepare("SELECT id, kind, sha256, imported_at, provenance FROM datasets ORDER BY id")
    .all() as Array<{ id: string; kind: string; sha256: string; imported_at: string; provenance: string }>;

  return {
    status: "ok",
    app_name: "CytoZoe",
    app_version: APP_VERSION,
    git_version: GIT_VERSION,
    db_schema_version: DB_SCHEMA_VERSION,
    ready: r.ready,
    state: r.state,
    checks: r.checks,
    datasets_imported: dsRows.length,
    datasets: dsRows,
  };
}

export function listDatasets(db: DatabaseSync) {
  const rows = db.prepare("SELECT * FROM datasets ORDER BY id").all() as Array<Record<string, any>>;
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    title: r.title,
    provider: r.provider,
    source_url: r.source_url,
    download_url: r.download_url,
    file_name: r.file_name,
    fetched_at: r.fetched_at,
    imported_at: r.imported_at,
    sha256: r.sha256,
    byte_count: r.byte_count,
    license_note: r.license_note,
    citation: r.citation,
    schema_version: r.schema_version,
    parser_version: r.parser_version,
    provenance: r.provenance,
    quality: JSON.parse(r.quality_json),
  }));
}

/* ================= Reviews Service ================= */

function formatPublicReview(row: Record<string, any>) {
  return {
    id: row.id as string,
    finding_id: row.finding_id as string,
    case: row.case_kind as "health" | "environment",
    participant_id: (row.participant_id as string | null) ?? null,
    instrument_id: (row.instrument_id as string | null) ?? null,
    title: row.title as string,
    status: row.status as ReviewStatus,
    note: row.note as string,
    follow_up_date: (row.follow_up_date as string | null) ?? null,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
    version: Number(row.version),
  };
}

export function getReviewState(db: DatabaseSync, findingId: string) {
  const row = db.prepare("SELECT * FROM reviews WHERE finding_id = ?").get(findingId) as
    | Record<string, any>
    | undefined;
  return row ? formatPublicReview(row) : null;
}

/* ================= Health Service ================= */

export function getHealthDatasetRow(db: DatabaseSync): Record<string, any> {
  const row = db.prepare("SELECT * FROM datasets WHERE kind = 'HEALTH_CMP'").get() as
    | Record<string, any>
    | undefined;
  if (!row) {
    throw new AppError(409, "NO_DATA", "The NASA OSD-575 health dataset is not imported.");
  }
  const manifest = loadManifest();
  const entry = manifest.datasets.find((e) => e.kind === "HEALTH_CMP");
  if (!entry || !acceptedHashes(entry).has(row.sha256) || row.provenance !== "NASA_PINNED_VERIFIED") {
    throw new AppError(
      409,
      "SOURCE_HASH_MISMATCH",
      "The loaded health dataset does not match a verified NASA snapshot."
    );
  }
  return row;
}

export function listParticipants(db: DatabaseSync) {
  getHealthDatasetRow(db);
  const rows = db
    .prepare(
      "SELECT DISTINCT participant_id, sample_id, visit, phase, relative_day, visit_order FROM health_observations ORDER BY participant_id, visit_order"
    )
    .all() as Array<{
    participant_id: string;
    sample_id: string;
    visit: string;
    phase: "PREFLIGHT" | "POSTFLIGHT";
    relative_day: number;
    visit_order: number;
  }>;

  const byParticipant = new Map<
    string,
    Array<{
      sample_id: string;
      visit: string;
      label: string;
      phase: "PREFLIGHT" | "POSTFLIGHT";
      relative_day: number;
      visit_order: number;
    }>
  >();

  for (const r of rows) {
    const list = byParticipant.get(r.participant_id) ?? [];
    list.push({
      sample_id: r.sample_id,
      visit: r.visit,
      label: quality.VISITS[r.visit]?.label ?? r.visit,
      phase: r.phase,
      relative_day: r.relative_day,
      visit_order: r.visit_order,
    });
    byParticipant.set(r.participant_id, list);
  }

  return Array.from(byParticipant.entries()).map(([participant_id, samples]) => ({
    participant_id,
    samples,
  }));
}

function validateHealthParams(
  db: DatabaseSync,
  participant: string,
  visit?: string,
  marker?: string
): void {
  const pRow = db
    .prepare("SELECT 1 FROM health_observations WHERE participant_id = ? LIMIT 1")
    .get(participant);
  if (!pRow) {
    throw new AppError(404, "NOT_FOUND", `Participant '${participant}' was not found in OSD-575.`);
  }
  if (visit !== undefined) {
    const vRow = db
      .prepare("SELECT 1 FROM health_observations WHERE participant_id = ? AND visit = ? LIMIT 1")
      .get(participant, visit);
    if (!vRow) {
      throw new AppError(404, "NOT_FOUND", `Visit '${visit}' was not found for participant '${participant}'.`);
    }
  }
  if (marker !== undefined && !(marker in MARKER_NAMES)) {
    throw new AppError(400, "UNSUPPORTED_MARKER", `Marker '${marker}' is not one of the 5 selected markers.`);
  }
}

export function buildHealthEvidence(
  db: DatabaseSync,
  participant: string,
  visit: string,
  marker: string,
  includeReview = true
) {
  const ds = getHealthDatasetRow(db);
  validateHealthParams(db, participant, visit, marker);

  const mrows = db
    .prepare(
      "SELECT * FROM health_observations WHERE participant_id = ? AND marker = ? ORDER BY visit_order"
    )
    .all(participant, marker) as Array<Record<string, any>>;

  const obs = mrows.find((r) => r.visit === visit);
  if (!obs) {
    throw new AppError(404, "NOT_FOUND", "Observation not found.");
  }

  const pre = mrows.filter((r) => (quality.PREFLIGHT_VISITS as readonly string[]).includes(r.visit));
  const base = health.baseline(pre.map((r) => r.value));
  const cmp = health.compare(obs.value, base ? base.value : null);
  const status = health.rangeStatus(obs.value, obs.range_low, obs.range_high);
  const isPre = (quality.PREFLIGHT_VISITS as readonly string[]).includes(visit);
  const evidenceId = obs.id as string;

  const [valCol, lowCol, highCol] = quality.cmpColumns(marker, obs.source_unit);

  const evidence: Record<string, any> = {
    schema_version: "1.0",
    evidence_id: evidenceId,
    case: "health",
    kind: "HEALTH_OBSERVATION",
    title: `${MARKER_NAMES[marker]} · ${participant} · ${quality.VISITS[visit]?.label ?? visit}`,
    source: {
      dataset_id: ds.id,
      title: ds.title,
      provider: ds.provider,
      file_name: ds.file_name,
      sha256: ds.sha256,
      provenance: ds.provenance,
      source_url: ds.source_url,
      download_url: ds.download_url,
      fetched_at: ds.fetched_at,
      imported_at: ds.imported_at,
      license_note: ds.license_note,
      citation: ds.citation,
      source_row: obs.source_row,
      file_line: Number(obs.source_row) + 1,
      sample_name: obs.sample_id,
      source_columns: { value: valCol, range_low: lowCol, range_high: highCol },
      raw_value: obs.value_raw,
      source_unit: obs.source_unit,
    },
    context: {
      participant_id: participant,
      sample_id: obs.sample_id,
      visit,
      visit_label: quality.VISITS[visit]?.label ?? visit,
      phase: obs.phase,
      relative_day: obs.relative_day,
      relative_day_reference: obs.phase === "PREFLIGHT" ? "days before launch" : "days after return",
      linked_radiation_record: null,
    },
    measurement: {
      marker,
      marker_name: MARKER_NAMES[marker],
      value: obs.value,
      unit: obs.unit,
      range_low: obs.range_low,
      range_high: obs.range_high,
      range_status: status,
      needs_review: health.needsReview(status),
    },
    comparison: {
      baseline: base ? base.value : null,
      n: base ? base.n : pre.filter((r) => r.value !== null).length,
      baseline_available: base !== null,
      baseline_method: "retrospective_preflight_arithmetic_mean",
      baseline_values: pre.map((r) => ({
        visit: r.visit,
        sample_id: r.sample_id,
        value: r.value,
        source_row: r.source_row,
      })),
      includes_selected_sample: isPre && obs.value !== null,
      delta: cmp.delta,
      percent_delta: cmp.percent_delta,
      rule_version: health.RULE_VERSION,
      formulas: {
        baseline:
          "B = mean of available preflight values (L-92, L-44, L-3) for this participant and marker; requires n ≥ 2",
        delta: "Δ = x − B",
        percent_delta: "%Δ = 100 × (x − B) / B, only when B ≠ 0",
        range_status:
          "outside only if x < supplied lower bound or x > supplied upper bound; equal to a bound is within",
      },
    },
    evidence_strength: "HISTORICAL_LABORATORY_MEASUREMENT",
    limitations: HEALTH_LIMITATIONS,
  };

  if (includeReview) {
    evidence.review = getReviewState(db, evidenceId);
  }
  return evidence;
}

export function getHealthOverview(db: DatabaseSync, participant: string, visit: string) {
  const ds = getHealthDatasetRow(db);
  validateHealthParams(db, participant, visit);
  const cards = MARKER_ORDER.map((m) => buildHealthEvidence(db, participant, visit, m));
  const toReview = cards.filter((c) => c.measurement.needs_review).map((c) => c.evidence_id);

  const counts: Record<ReviewStatus, number> = {
    OPEN: 0,
    FOLLOW_UP_REQUESTED: 0,
    REVIEWED: 0,
  };
  const rRows = db
    .prepare(
      "SELECT status, COUNT(*) AS n FROM reviews WHERE case_kind = 'health' AND participant_id = ? GROUP BY status"
    )
    .all(participant) as Array<{ status: ReviewStatus; n: number }>;
  for (const r of rRows) {
    counts[r.status] = Number(r.n);
  }

  const q = JSON.parse(ds.quality_json);
  return {
    participant_id: participant,
    visit,
    visit_label: quality.VISITS[visit]?.label ?? visit,
    cards,
    to_review: toReview,
    participant_review_counts: counts,
    dataset: {
      id: ds.id,
      title: ds.title,
      sha256: ds.sha256,
      samples: q.samples,
      participants: (q.participants ?? []).length,
      visits: q.visits,
      nonmissing_values: q.nonmissing_values,
    },
  };
}

export function getHealthTrend(db: DatabaseSync, participant: string, marker: string) {
  getHealthDatasetRow(db);
  validateHealthParams(db, participant, undefined, marker);

  const rows = db
    .prepare(
      "SELECT * FROM health_observations WHERE participant_id = ? AND marker = ? ORDER BY visit_order"
    )
    .all(participant, marker) as Array<Record<string, any>>;

  const pre = rows.filter((r) => (quality.PREFLIGHT_VISITS as readonly string[]).includes(r.visit));
  const base = health.baseline(pre.map((r) => r.value));
  const boundsSet = new Set(rows.map((r) => `${r.range_low}:${r.range_high}`));
  const consistent = boundsSet.size === 1;

  const points = rows.map((r) => {
    const status = health.rangeStatus(r.value, r.range_low, r.range_high);
    return {
      evidence_id: r.id as string,
      sample_id: r.sample_id as string,
      visit: r.visit as string,
      visit_label: quality.VISITS[r.visit]?.label ?? r.visit,
      phase: r.phase as "PREFLIGHT" | "POSTFLIGHT",
      visit_order: Number(r.visit_order),
      relative_day: Number(r.relative_day),
      value: r.value as number | null,
      range_low: r.range_low as number | null,
      range_high: r.range_high as number | null,
      range_status: status,
      needs_review: health.needsReview(status),
      source_row: Number(r.source_row),
    };
  });

  // Also include all-participants cohort comparison for this marker across visits so researchers can compare crew trends!
  const allRows = db
    .prepare("SELECT * FROM health_observations WHERE marker = ? ORDER BY participant_id, visit_order")
    .all(marker) as Array<Record<string, any>>;

  const cohortByVisit = Object.keys(quality.VISITS)
    .sort((a, b) => quality.VISITS[a].order - quality.VISITS[b].order)
    .map((v) => {
      const entry: Record<string, any> = {
        visit: v,
        visit_label: quality.VISITS[v].label,
      };
      for (const pid of ["C001", "C002", "C003", "C004"]) {
        const match = allRows.find((r) => r.participant_id === pid && r.visit === v);
        entry[pid] = match ? match.value : null;
      }
      return entry;
    });

  return {
    participant_id: participant,
    marker,
    marker_name: MARKER_NAMES[marker],
    unit: rows[0]?.unit ?? null,
    points,
    cohort_by_visit: cohortByVisit,
    baseline: {
      value: base ? base.value : null,
      n: base ? base.n : 0,
      available: base !== null,
      method: "retrospective_preflight_arithmetic_mean",
      visits: [...quality.PREFLIGHT_VISITS],
    },
    bounds_consistent: consistent,
    range_low: consistent && rows[0] ? rows[0].range_low : null,
    range_high: consistent && rows[0] ? rows[0].range_high : null,
    x_axis_note:
      "Categorical visit order. Visits are not equally spaced in time; L = days before launch, R = days after return.",
    rule_version: health.RULE_VERSION,
  };
}

export function getHealthReplay(db: DatabaseSync, participant: string) {
  getHealthDatasetRow(db);
  validateHealthParams(db, participant);

  const rows = db
    .prepare("SELECT * FROM health_observations WHERE participant_id = ? ORDER BY visit_order")
    .all(participant) as Array<Record<string, any>>;

  const visits = Array.from(new Set(rows.map((r) => r.visit as string))).sort(
    (a, b) => quality.VISITS[a].order - quality.VISITS[b].order
  );

  const frames = [];
  let baselineAnnounced = false;

  for (let k = 0; k < visits.length; k++) {
    const visit = visits[k];
    const seenPre = visits
      .slice(0, k)
      .filter((v) => (quality.PREFLIGHT_VISITS as readonly string[]).includes(v));
    const cards = [];
    const events: Array<{ kind: string; text: string; marker?: string; evidence_id?: string }> = [];
    const meta = quality.VISITS[visit];
    events.push({
      kind: "sample",
      text: `New historical sample: ${meta.label} (${Math.abs(meta.relative_day)} ${
        meta.phase === "PREFLIGHT" ? "days before launch" : "days after return"
      }).`,
    });

    for (const marker of MARKER_ORDER) {
      const mrows = rows.filter((r) => r.marker === marker);
      const obs = mrows.find((r) => r.visit === visit)!;
      const base = health.baseline(
        mrows.filter((r) => seenPre.includes(r.visit)).map((r) => r.value)
      );
      const cmp = health.compare(obs.value, base ? base.value : null);
      const status = health.rangeStatus(obs.value, obs.range_low, obs.range_high);
      const nSoFar = base
        ? base.n
        : mrows.filter((r) => seenPre.includes(r.visit) && r.value !== null).length;

      cards.push({
        evidence_id: obs.id as string,
        marker,
        marker_name: MARKER_NAMES[marker],
        value: obs.value as number | null,
        unit: obs.unit as string,
        range_low: obs.range_low as number | null,
        range_high: obs.range_high as number | null,
        range_status: status,
        needs_review: health.needsReview(status),
        baseline_so_far: base ? base.value : null,
        n_so_far: nSoFar,
        delta: cmp.delta,
        percent_delta: cmp.percent_delta,
        source_row: Number(obs.source_row),
      });

      if (health.needsReview(status) && obs.value !== null) {
        const bound = status === health.ABOVE ? obs.range_high : obs.range_low;
        const side = status === health.ABOVE ? "above the supplied upper" : "below the supplied lower";
        events.push({
          kind: "flag",
          marker,
          evidence_id: obs.id as string,
          text: `${MARKER_NAMES[marker]} ${obs.value} ${obs.unit} is ${side} bound ${bound} ${obs.unit}. Needs review — not a diagnosis.`,
        });
      }
    }

    if (!baselineAnnounced && seenPre.length >= 2) {
      baselineAnnounced = true;
      events.push({
        kind: "baseline",
        text: `Personal baseline available from ${seenPre.length} earlier preflight samples (${seenPre.join(", ")}).`,
      });
    }

    frames.push({
      visit,
      visit_label: meta.label,
      phase: meta.phase,
      visit_order: meta.order,
      baseline_context: "PROSPECTIVE_PRIOR_PREFLIGHT",
      baseline_visits: seenPre,
      cards,
      events,
    });
  }

  return {
    participant_id: participant,
    mode: "HISTORICAL_REPLAY",
    label: "Historical replay · each step shows only what was known before that visit · not live",
    baseline_method:
      "prospective mean of preflight visits strictly before the replayed visit (requires n ≥ 2)",
    rule_version: health.RULE_VERSION,
    frames,
  };
}

export function getFullCmpPanel(db: DatabaseSync, participant: string, visit: string) {
  const ds = getHealthDatasetRow(db);
  validateHealthParams(db, participant, visit);
  const raw = getRawDatasetBuffer("HEALTH_CMP");
  if (!raw) {
    throw new AppError(409, "NO_DATA", "Raw OSD-575 CSV file not found.");
  }
  const analytes = quality.parseFullOsd575Sample(raw, participant, visit).map((a) => {
    const status = health.rangeStatus(a.value, a.range_low, a.range_high);
    return {
      ...a,
      range_status: status,
      needs_review: health.needsReview(status),
      evidence_id: a.core ? `osd575-cmp:${participant}_serum_${visit}:${a.stem}` : null,
    };
  });

  return {
    participant_id: participant,
    visit,
    visit_label: quality.VISITS[visit]?.label ?? visit,
    dataset_id: ds.id,
    file_name: ds.file_name,
    sha256: ds.sha256,
    analytes,
    excluded_note:
      "Race-based eGFR columns (egfr_african_american_*, egfr_non_african_american_*) are deliberately excluded from CytoZoe in alignment with modern clinical laboratory equity standards.",
  };
}

/* ================= Mission Health Intelligence Brief (MissionBriefV1) ================= */

export function buildMissionBrief(
  db: DatabaseSync,
  participant: string,
  sample: string,
  mode = "historical"
) {
  if (mode !== "historical") {
    throw new AppError(400, "INVALID_MODE", "Only mode=historical is supported. Replays use /api/replay/*.", {
      allowed: ["historical"],
    });
  }
  const ds = getHealthDatasetRow(db);
  const ov = getHealthOverview(db, participant, sample);
  const cards = ov.cards;

  function boundsText(m: any): string {
    const lo = m.range_low;
    const hi = m.range_high;
    const u = m.unit;
    if (lo !== null && hi !== null) {
      return `Supplied laboratory range ${explainEngine.fmt(lo)}–${explainEngine.fmt(hi)} ${u}.`;
    }
    if (hi !== null) {
      return `Only a supplied upper bound (${explainEngine.fmt(hi)} ${u}) is recorded.`;
    }
    if (lo !== null) {
      return `Only a supplied lower bound (${explainEngine.fmt(lo)} ${u}) is recorded.`;
    }
    return "No supplied laboratory range is recorded for this sample.";
  }

  function makeBriefItem(ev: any) {
    const { measurement: m, comparison: c, context: ctx, source: s } = ev;
    const u = m.unit;
    const observed =
      m.value === null
        ? `No ${m.marker_name.toLowerCase()} value is recorded for ${ctx.participant_id} at ${ctx.visit_label} (data row ${s.source_row}). Nothing is inferred for the missing value.`
        : `${m.marker_name} ${explainEngine.fmt(m.value)} ${u} at ${ctx.visit_label} (${Math.abs(
            ctx.relative_day
          )} ${ctx.relative_day_reference}); historical research sample, data row ${s.source_row}.`;

    const parts = [boundsText(m)];
    if (c.baseline_available) {
      const used = c.baseline_values
        .filter((b: any) => b.value !== null)
        .map((b: any) => `${b.visit} ${explainEngine.fmt(b.value)}`)
        .join(", ");
      parts.push(
        `Retrospective preflight mean ${explainEngine.fmt(c.baseline)} ${u} (n = ${c.n}: ${used}).`
      );
      if (c.delta !== null) {
        const pct = c.percent_delta !== null ? ` (${explainEngine.signed(c.percent_delta, 2)}%)` : "";
        parts.push(
          `Different from that mean by ${explainEngine.signed(c.delta)} ${u}${pct}; descriptive, not an abnormality threshold.`
        );
      }
    } else {
      parts.push(`No personal baseline: fewer than two preflight values (n = ${c.n}).`);
    }

    let why: string | null = null;
    if (m.range_status === health.ABOVE) {
      why = `The measured value is above the supplied upper bound (${explainEngine.fmt(m.range_high)} ${u}).`;
    } else if (m.range_status === health.BELOW) {
      why = `The measured value is below the supplied lower bound (${explainEngine.fmt(m.range_low)} ${u}).`;
    }

    const limits = ["This individual measurement does not establish a diagnosis."];
    limits.push(
      ctx.phase === "PREFLIGHT"
        ? "Collected before launch, so it cannot reflect a spaceflight effect."
        : "Descriptive comparison only; no cause is inferred."
    );
    if (c.includes_selected_sample) {
      limits.push("The preflight mean includes this sample, so the comparison is retrospective.");
    }

    const action = m.needs_review
      ? "Record a reviewer follow-up note and status. CytoZoe does not recommend clinical action."
      : "Not flagged by the supplied range. A reviewer may still record a note.";

    const review = ev.review;
    return {
      evidence_id: ev.evidence_id,
      marker: m.marker,
      marker_name: m.marker_name,
      value: m.value,
      unit: u,
      range_low: m.range_low,
      range_high: m.range_high,
      status: m.range_status,
      needs_review: m.needs_review,
      baseline: {
        context: "RETROSPECTIVE_PREFLIGHT",
        value: c.baseline,
        n: c.n,
        available: c.baseline_available,
        includes_selected_sample: c.includes_selected_sample,
        samples_used: c.baseline_values.filter((b: any) => b.value !== null),
      },
      delta: c.delta,
      percent_delta: c.percent_delta,
      source: {
        dataset_id: s.dataset_id,
        file_name: s.file_name,
        sha256: s.sha256,
        provenance: s.provenance,
        source_row: s.source_row,
        file_line: s.file_line,
        source_column: s.source_columns.value,
        raw_value: s.raw_value,
      },
      explanation: {
        observed,
        compared_with: parts.join(" "),
        why_flagged: why,
        limitations: limits,
        next_review_action: action,
      },
      review: {
        id: review ? review.id : null,
        status: review ? review.status : null,
        version: review ? review.version : null,
        note_present: Boolean(review && review.note.trim()),
        updated_at: review ? review.updated_at : null,
      },
      actions: {
        inspect_evidence: `/api/evidence/${ev.evidence_id}`,
        create_or_open_review: {
          finding_id: ev.evidence_id,
          review_id: review ? review.id : null,
          method: review ? "PATCH" : "POST",
          endpoint: review ? `/api/reviews/${review.id}` : "/api/reviews",
        },
        export_packet: {
          html: "/api/export?format=html",
          json: "/api/export?format=json",
        },
      },
    };
  }

  const items = cards.map(makeBriefItem);
  const missing = items.filter((i) => i.value === null);
  const measured = items.filter((i) => i.value !== null);
  const findings = measured.filter((i) => i.needs_review);
  const others = measured.filter((i) => !i.needs_review);
  const nOut = findings.length;

  let text =
    nOut === 0
      ? "All displayed measurements are within their supplied laboratory ranges. This does not assess overall health."
      : nOut === 1
      ? "One displayed measurement is outside its supplied laboratory range."
      : `${nOut} displayed measurements are outside their supplied laboratory ranges.`;

  if (missing.length > 0) {
    text += ` ${missing.length} selected marker${missing.length > 1 ? "s have" : " has"} no recorded value.`;
  }

  const report = JSON.parse(ds.quality_json);
  const ctx = cards[0].context;
  const warnings: string[] = [];
  if (items.some((i) => !(i.range_low !== null && i.range_high !== null))) {
    warnings.push("At least one marker lacks a two-sided supplied range; its status is one-sided or unknown.");
  }

  return {
    schema_version: "mission-brief-v1",
    brief_id: `mission-brief-v1:${ds.sha256.slice(0, 12)}:${ctx.sample_id}`,
    mode: "HISTORICAL_RESEARCH" as const,
    title: `Health brief · ${ctx.participant_id} · ${ctx.visit_label}`,
    generated_at: utcNow(),
    rule_versions: {
      quality: quality.PARSER_VERSION,
      health: health.RULE_VERSION,
      environment: environment.RULE_VERSION,
      brief: "mission-brief-v1",
    },
    dataset: {
      dataset_id: ds.id,
      title: ds.title,
      provider: ds.provider,
      file_name: ds.file_name,
      sha256: ds.sha256,
      provenance: ds.provenance,
      source_url: ds.source_url,
      imported_at: ds.imported_at,
      research_case: "HEALTH_OSD575",
    },
    context: {
      participant_id: ctx.participant_id,
      sample_id: ctx.sample_id,
      visit: ctx.visit,
      visit_label: ctx.visit_label,
      phase: ctx.phase,
      relative_day: ctx.relative_day,
      relative_day_reference: ctx.relative_day_reference,
    },
    coverage: {
      markers_considered: items.map((i) => i.marker),
      considered_count: items.length,
      measured_count: measured.length,
      missing_markers: missing.map((i) => i.marker),
      with_both_bounds: items.filter((i) => i.range_low !== null && i.range_high !== null).length,
      one_sided_bounds: items.filter((i) => (i.range_low === null) !== (i.range_high === null)).length,
      without_bounds: items.filter((i) => i.range_low === null && i.range_high === null).length,
      note: "5 selected markers of the comprehensive metabolic panel; the other CMP analytes are available in the Extended 18-Analyte Matrix. More markers would not add participants: 4 people are not a validation cohort.",
    },
    summary: {
      measured_marker_count: measured.length,
      outside_supplied_range_count: nOut,
      text,
    },
    findings,
    other_measurements: others,
    missing_measurements: missing,
    quality: {
      provenance: ds.provenance,
      validation_status: "SHA256_MATCHES_REGISTERED_SNAPSHOT",
      parser_version: ds.parser_version,
      parse_issues: (report.issues ?? []).length,
      warnings,
    },
    dataset_limitations: HEALTH_LIMITATIONS,
    case_separation: CASE_SEPARATION,
    available_questions: BRIEF_QUESTIONS,
  };
}

/* ================= Environment Service ================= */

const SUMMARY_EVIDENCE_ID = "radlab-dostel1:summary";
const BREAK_STATUSES = new Set([
  "DUPLICATE_CONFLICT",
  "INVALID_TIMESTAMP",
  "INVALID_RATE",
  "MISSING_VALUE",
]);

export function getEnvDatasetRow(db: DatabaseSync): Record<string, any> {
  const row = db.prepare("SELECT * FROM datasets WHERE kind = 'ENV_RADIATION'").get() as
    | Record<string, any>
    | undefined;
  if (!row) {
    throw new AppError(409, "NO_DATA", "The NASA RadLab DosTel1 dataset is not imported.");
  }
  const manifest = loadManifest();
  const entry = manifest.datasets.find((e) => e.kind === "ENV_RADIATION");
  if (!entry || !acceptedHashes(entry).has(row.sha256) || row.provenance !== "NASA_PINNED_VERIFIED") {
    throw new AppError(
      409,
      "SOURCE_HASH_MISMATCH",
      "The loaded radiation dataset does not match a verified NASA snapshot."
    );
  }
  return row;
}

function computeEnvironment(db: DatabaseSync) {
  const ds = getEnvDatasetRow(db);
  const rows = db
    .prepare("SELECT * FROM radiation_observations WHERE dataset_id = ? ORDER BY source_row")
    .all(ds.id) as Array<Record<string, any>>;

  for (const r of rows) {
    r.epoch =
      r.quality_status !== "INVALID_TIMESTAMP" ? quality.epochFromTimestamp(r.source_timestamp) : null;
  }

  const accepted = rows
    .filter((r) => r.quality_status === "ACCEPTED" && r.epoch !== null && r.rate !== null)
    .map((r) => ({
      epoch: r.epoch as number,
      rate: Number(r.rate),
      source_timestamp: r.source_timestamp as string,
      source_row: Number(r.source_row),
    }));

  const breaks = rows
    .filter((r) => BREAK_STATUSES.has(r.quality_status) && r.epoch !== null)
    .map((r) => r.epoch as number);

  const integration = environment.integrate(accepted, breaks, 300);
  const q = JSON.parse(ds.quality_json);
  let day0 = 0;
  if (q.first_timestamp) {
    const datePrefix = (q.first_timestamp as string).split("T")[0];
    day0 = quality.epochFromTimestamp(`${datePrefix}T00:00:00`);
  }

  return { ds, rows, integration, quality: q, day0 };
}

function envSourceInfo(ds: Record<string, any>) {
  return {
    dataset_id: ds.id,
    title: ds.title,
    provider: ds.provider,
    file_name: ds.file_name,
    sha256: ds.sha256,
    provenance: ds.provenance,
    source_url: ds.source_url,
    download_url: ds.download_url,
    fetched_at: ds.fetched_at,
    imported_at: ds.imported_at,
    license_note: ds.license_note,
    citation: ds.citation,
    instrument_id: "DosTel1",
    location: "ISS Columbus module",
  };
}

export function getEnvironmentView(db: DatabaseSync) {
  const c = computeEnvironment(db);
  const { ds, integration: integ, quality: q, day0 } = c;

  const segments = integ.segments.map((seg, i) => ({
    index: i,
    start: seg[0]?.source_timestamp ?? "",
    end: seg[seg.length - 1]?.source_timestamp ?? "",
    points: seg.map((p) => ({
      t: p.epoch - day0,
      ts: p.source_timestamp!,
      rate: p.rate,
      cumulative: p.cumulative,
      source_row: p.source_row!,
    })),
  }));

  const excludedEvents = c.rows
    .filter((r) => BREAK_STATUSES.has(r.quality_status) && r.epoch !== null)
    .map((r) => ({
      t: (r.epoch as number) - day0,
      ts: r.source_timestamp as string,
      status: r.quality_status as string,
      source_row: Number(r.source_row),
    }));

  const conflicts = (q.conflict_groups ?? []).map((g: any) => {
    const eid = `radlab-dostel1:conflict:${g.timestamp}`;
    return {
      ...g,
      evidence_id: eid,
      t: quality.epochFromTimestamp(g.timestamp) - day0,
      review: getReviewState(db, eid),
    };
  });

  const span = integ.span_seconds;
  return {
    dataset: envSourceInfo(ds),
    case_banner:
      "Separate case study · ISS Columbus · DosTel1 · 1 March 2022 · Not linked to the selected health participant.",
    unit: "µGy/hour",
    quality: {
      raw_rows: q.raw_rows,
      accepted_rows: q.accepted_rows,
      excluded_rows: q.raw_rows - q.accepted_rows,
      quarantined_conflict_rows: q.quarantined_rows,
      status_counts: q.status_counts,
      unique_timestamps: q.unique_timestamps,
      first_timestamp: q.first_timestamp,
      last_timestamp: q.last_timestamp,
      observed_max_interval_seconds: q.observed_max_interval_seconds,
      observed_median_interval_seconds: q.observed_median_interval_seconds,
      documented_nominal_cadence_seconds: q.documented_nominal_cadence_seconds,
      timestamp_semantics: q.timestamp_semantics,
      conflict_groups: conflicts,
    },
    integration: {
      method: integ.method,
      rule_version: integ.rule_version,
      max_gap_seconds: integ.max_gap_seconds,
      covered_seconds: integ.covered_seconds,
      span_seconds: span,
      coverage_ratio: span ? integ.covered_seconds / span : null,
      estimated_sensor_dose_uGy: integ.estimated_sensor_dose_uGy,
      label: "Estimated dose over covered intervals at sensor",
      included_intervals: integ.included_intervals,
      excluded_intervals: integ.excluded_intervals.map((e) => ({
        ...e,
        start_t: e.start_epoch - day0,
        end_t: e.end_epoch - day0,
      })),
    },
    segments,
    excluded_events: excludedEvents,
    rows: c.rows.map((r) => ({
      source_row: Number(r.source_row),
      ts: r.source_timestamp as string,
      rate_raw: r.rate_raw as string,
      rate: r.rate as number | null,
      status: r.quality_status as string,
      detail: (r.quality_detail as string | null) ?? null,
    })),
    summary_evidence_id: SUMMARY_EVIDENCE_ID,
    summary_review: getReviewState(db, SUMMARY_EVIDENCE_ID),
    limitations: ENV_LIMITATIONS,
  };
}

export function buildEnvEvidence(db: DatabaseSync, evidenceId: string, includeReview = true) {
  const c = computeEnvironment(db);
  const { ds, integration: integ, quality: q } = c;

  const base = {
    schema_version: "1.0",
    evidence_id: evidenceId,
    case: "environment" as const,
    source: envSourceInfo(ds),
    limitations: ENV_LIMITATIONS,
    context: {
      instrument_id: "DosTel1",
      location: "ISS Columbus module",
      date: "2022-03-01",
      participant_id: null,
      linked_health_participant: null,
    },
  };

  let evidence: Record<string, any>;
  if (evidenceId === SUMMARY_EVIDENCE_ID) {
    const span = integ.span_seconds;
    evidence = {
      ...base,
      kind: "ENV_OBSERVATION",
      title: "DosTel1 sensor-dose estimate · 1 March 2022",
      measurement: {
        label: "Estimated dose over covered intervals at sensor",
        estimated_sensor_dose_uGy: integ.estimated_sensor_dose_uGy,
        unit: "µGy",
        covered_seconds: integ.covered_seconds,
        span_seconds: span,
        coverage_ratio: span ? integ.covered_seconds / span : null,
        included_intervals: integ.included_intervals,
        excluded_intervals: integ.excluded_intervals.length,
        raw_rows: q.raw_rows,
        accepted_rows: q.accepted_rows,
        quarantined_conflict_rows: q.quarantined_rows,
      },
      comparison: {
        method: integ.method,
        rule_version: integ.rule_version,
        max_gap_seconds: integ.max_gap_seconds,
        formulas: {
          interval: "dose_i = ((r_i + r_j) / 2) × (t_j − t_i) / 3600   [µGy/hour × s → µGy]",
          inclusion: "0 < Δt ≤ 300 s and no excluded/quarantined source event strictly inside the interval",
          total: "Sum of included intervals only; no extrapolation before the first or after the last record",
        },
      },
      evidence_strength: "DIRECT_SENSOR_MEASUREMENT_WITH_APPROXIMATE_INTEGRATION",
    };
  } else if (evidenceId.startsWith("radlab-dostel1:conflict:")) {
    const ts = evidenceId.slice("radlab-dostel1:conflict:".length);
    const group = (q.conflict_groups ?? []).find((g: any) => g.timestamp === ts);
    if (!group) {
      throw new AppError(404, "NOT_FOUND", `Conflict evidence '${evidenceId}' not found.`);
    }
    evidence = {
      ...base,
      kind: "DATA_QUALITY",
      title: `Conflicting DosTel1 readings at ${ts}`,
      measurement: {
        timestamp: ts,
        rows: group.rows,
        unit: "µGy/hour",
        quality_status: "DUPLICATE_CONFLICT",
      },
      comparison: {
        method: "exact-timestamp duplicate check",
        rule_version: "e1-quality-v1",
        formulas: {
          rule: "Rows sharing an exact timestamp with different rates are all quarantined.",
          not_done: "No first-row choice, no averaging, no summing.",
          effect: "Intervals crossing this timestamp are excluded from the dose estimate and the plotted line breaks.",
        },
      },
      evidence_strength: "SOURCE_DATA_QUALITY_FINDING",
    };
  } else {
    throw new AppError(404, "NOT_FOUND", `Evidence '${evidenceId}' not found.`);
  }

  if (includeReview) {
    evidence.review = getReviewState(db, evidenceId);
  }
  return evidence;
}

export function resolveEvidence(db: DatabaseSync, evidenceId: string, includeReview = true) {
  if (evidenceId.startsWith("osd575-cmp:")) {
    const parts = evidenceId.split(":");
    if (parts.length !== 3) {
      throw new AppError(404, "NOT_FOUND", `Invalid evidence ID '${evidenceId}'.`);
    }
    const [, sampleId, marker] = parts;
    const match = quality.SAMPLE_RE.exec(sampleId);
    if (!match || !(marker in MARKER_NAMES)) {
      throw new AppError(404, "NOT_FOUND", `Evidence '${evidenceId}' not found.`);
    }
    return buildHealthEvidence(db, match[1], match[2], marker, includeReview);
  }
  if (evidenceId.startsWith("radlab-dostel1:")) {
    return buildEnvEvidence(db, evidenceId, includeReview);
  }
  throw new AppError(404, "NOT_FOUND", `Evidence '${evidenceId}' not found.`);
}

/* ================= Reviews CRUD & Export ================= */

function reviewSnapshot(r: ReturnType<typeof formatPublicReview>) {
  return {
    status: r.status,
    note: r.note,
    follow_up_date: r.follow_up_date,
    version: r.version,
  };
}

export function createReview(
  db: DatabaseSync,
  findingId: string,
  status: ReviewStatus,
  note: string,
  followUpDate: string | null
) {
  const existing = getReviewState(db, findingId);
  if (existing) {
    return { review: existing, created: false };
  }
  const evidence = resolveEvidence(db, findingId, false);
  const isHealth = evidence.case === "health";
  const now = utcNow();
  const reviewId = crypto.randomUUID();

  db.exec("BEGIN IMMEDIATE");
  try {
    const raceCheck = getReviewState(db, findingId);
    if (raceCheck) {
      db.exec("COMMIT");
      return { review: raceCheck, created: false };
    }

    db.prepare(
      `INSERT OR IGNORE INTO findings (
        id, kind, observation_id, dataset_id, dataset_sha256, rule_version, evidence_json, created_at
      ) VALUES (?,?,?,?,?,?,?,?)`
    ).run(
      findingId,
      evidence.kind,
      isHealth ? findingId : null,
      evidence.source.dataset_id,
      evidence.source.sha256,
      evidence.comparison.rule_version,
      JSON.stringify(evidence),
      now
    );

    db.prepare(
      `INSERT INTO reviews (
        id, finding_id, case_kind, participant_id, instrument_id, title,
        status, note, follow_up_date, created_at, updated_at, version
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,1)`
    ).run(
      reviewId,
      findingId,
      evidence.case,
      isHealth ? evidence.context.participant_id : null,
      isHealth ? null : evidence.context.instrument_id,
      evidence.title,
      status,
      note,
      followUpDate,
      now,
      now
    );

    const created = getReviewState(db, findingId)!;
    db.prepare(
      "INSERT INTO review_events (review_id, action, before_json, after_json, timestamp) VALUES (?,?,?,?,?)"
    ).run(reviewId, "CREATED", null, JSON.stringify(reviewSnapshot(created)), now);

    db.exec("COMMIT");
    return { review: created, created: true };
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

export function patchReview(
  db: DatabaseSync,
  reviewId: string,
  expectedVersion: number,
  changes: { status?: ReviewStatus; note?: string; follow_up_date?: string | null; clear_follow_up_date?: boolean }
) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const row = db.prepare("SELECT * FROM reviews WHERE id = ?").get(reviewId) as
      | Record<string, any>
      | undefined;
    if (!row) {
      throw new AppError(404, "NOT_FOUND", `Review '${reviewId}' not found.`);
    }
    const current = formatPublicReview(row);
    if (current.version !== expectedVersion) {
      throw new AppError(
        409,
        "VERSION_CONFLICT",
        "This review was changed elsewhere since you opened it. Your draft was kept.",
        { current, expected_version: expectedVersion }
      );
    }

    const nextStatus = changes.status ?? current.status;
    const nextNote = changes.note ?? current.note;
    const nextDate = changes.clear_follow_up_date
      ? null
      : changes.follow_up_date !== undefined
      ? changes.follow_up_date
      : current.follow_up_date;

    if (
      nextStatus === current.status &&
      nextNote === current.note &&
      nextDate === current.follow_up_date
    ) {
      db.exec("COMMIT");
      return current;
    }

    const now = utcNow();
    db.prepare(
      "UPDATE reviews SET status = ?, note = ?, follow_up_date = ?, updated_at = ?, version = version + 1 WHERE id = ? AND version = ?"
    ).run(nextStatus, nextNote, nextDate, now, reviewId, expectedVersion);

    const afterRow = db.prepare("SELECT * FROM reviews WHERE id = ?").get(reviewId) as Record<string, any>;
    const after = formatPublicReview(afterRow);
    const action = after.status !== current.status ? "STATUS_CHANGED" : "UPDATED";

    db.prepare(
      "INSERT INTO review_events (review_id, action, before_json, after_json, timestamp) VALUES (?,?,?,?,?)"
    ).run(
      reviewId,
      action,
      JSON.stringify(reviewSnapshot(current)),
      JSON.stringify(reviewSnapshot(after)),
      now
    );

    db.exec("COMMIT");
    return after;
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

export function getReviewDetail(db: DatabaseSync, reviewId: string) {
  const row = db
    .prepare(
      "SELECT r.*, f.evidence_json, f.dataset_sha256, f.rule_version FROM reviews r JOIN findings f ON f.id = r.finding_id WHERE r.id = ?"
    )
    .get(reviewId) as Record<string, any> | undefined;
  if (!row) {
    throw new AppError(404, "NOT_FOUND", `Review '${reviewId}' not found.`);
  }
  const evRows = db
    .prepare("SELECT * FROM review_events WHERE review_id = ? ORDER BY id")
    .all(reviewId) as Array<Record<string, any>>;

  return {
    ...formatPublicReview(row),
    evidence_snapshot: JSON.parse(row.evidence_json),
    dataset_sha256: row.dataset_sha256 as string,
    rule_version: row.rule_version as string,
    events: evRows.map((e) => ({
      id: Number(e.id),
      action: e.action as string,
      before: e.before_json ? JSON.parse(e.before_json) : null,
      after: JSON.parse(e.after_json),
      timestamp: e.timestamp as string,
    })),
  };
}

export function listReviews(
  db: DatabaseSync,
  filters: { case?: string; status?: string; participant?: string; page?: number; page_size?: number }
) {
  const where: string[] = [];
  const args: any[] = [];
  if (filters.case) {
    where.push("case_kind = ?");
    args.push(filters.case);
  }
  if (filters.status) {
    where.push("status = ?");
    args.push(filters.status);
  }
  if (filters.participant) {
    where.push("participant_id = ?");
    args.push(filters.participant);
  }
  const clause = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(500, Math.max(1, filters.page_size ?? 200));

  const countRow = db.prepare(`SELECT COUNT(*) AS c FROM reviews ${clause}`).get(...args) as { c: number };
  const rows = db
    .prepare(
      `SELECT * FROM reviews ${clause} ORDER BY updated_at DESC, id LIMIT ? OFFSET ?`
    )
    .all(...args, pageSize, (page - 1) * pageSize) as Array<Record<string, any>>;

  return {
    items: rows.map(formatPublicReview),
    total: Number(countRow.c),
    page,
    page_size: pageSize,
  };
}

const DISCLAIMER =
  "CytoZoe research demonstration. Historical public NASA research data; not live astronaut monitoring, not a diagnosis and not a clinical device. The health and environment case studies are separate and are never linked at person level. Review status is an administrative workflow state.";

export function buildExportPacket(db: DatabaseSync) {
  const datasets = listDatasets(db).map((d) => ({
    id: d.id,
    kind: d.kind,
    title: d.title,
    provider: d.provider,
    file_name: d.file_name,
    sha256: d.sha256,
    byte_count: d.byte_count,
    source_url: d.source_url,
    download_url: d.download_url,
    license_note: d.license_note,
    citation: d.citation,
    fetched_at: d.fetched_at,
    imported_at: d.imported_at,
    parser_version: d.parser_version,
    provenance: d.provenance,
  }));

  const ids = db
    .prepare("SELECT id FROM reviews ORDER BY case_kind, created_at, id")
    .all() as Array<{ id: string }>;
  const items = ids.map((x) => getReviewDetail(db, x.id));

  return {
    export_schema_version: "1.0",
    generated_at: utcNow(),
    app: {
      name: "CytoZoe",
      version: APP_VERSION,
      git_version: GIT_VERSION,
      db_schema_version: DB_SCHEMA_VERSION,
    },
    disclaimer: DISCLAIMER,
    rule_versions: {
      quality: quality.PARSER_VERSION,
      health: health.RULE_VERSION,
      environment: environment.RULE_VERSION,
    },
    datasets,
    health: {
      case_note: "OSD-575 Inspiration4 comprehensive metabolic panel — historical research samples.",
      limitations: HEALTH_LIMITATIONS,
      reviews: items.filter((r) => r.case === "health"),
    },
    environment: {
      case_note: "RadLab DosTel1, ISS Columbus, 1 March 2022 — separate case study, not linked to any participant.",
      limitations: ENV_LIMITATIONS,
      reviews: items.filter((r) => r.case === "environment"),
    },
  };
}

function escapeHtml(val: unknown): string {
  const s = val === null || val === undefined ? "" : String(val);
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function renderExportHtml(packet: ReturnType<typeof buildExportPacket>): string {
  const dsRows = packet.datasets
    .map(
      (d) =>
        `<tr><td>${escapeHtml(d.title)}<br><small>${escapeHtml(d.provider)}</small></td><td>${escapeHtml(
          d.file_name
        )}</td><td><code>${escapeHtml(d.sha256)}</code><br><small>${
          d.provenance === "NASA_PINNED_VERIFIED"
            ? "Verified NASA snapshot (SHA-256 registered in the reviewed manifest)"
            : "NOT a verified NASA snapshot"
        }</small></td><td><a href="${escapeHtml(d.source_url)}">${escapeHtml(
          d.source_url
        )}</a><br><small>${escapeHtml(d.license_note)}</small></td></tr>`
    )
    .join("");

  function renderReviewCard(r: any): string {
    const ev = r.evidence_snapshot;
    const { measurement: m, comparison: c, source: s } = ev;
    let facts: Array<[string, string]> = [];
    if (ev.case === "health") {
      facts = [
        ["Participant / visit", `${ev.context.participant_id} · ${ev.context.visit_label}`],
        ["Observed", `${explainEngine.fmt(m.value)} ${m.unit}`],
        ["Supplied range", `${explainEngine.fmt(m.range_low)} – ${explainEngine.fmt(m.range_high)} ${m.unit}`],
        ["Range status", String(m.range_status)],
        ["Retrospective preflight mean", `${explainEngine.fmt(c.baseline, 6)} ${m.unit} (n = ${c.n})`],
        ["Δ / %Δ", `${explainEngine.fmt(c.delta, 6)} / ${explainEngine.fmt(c.percent_delta, 4)}%`],
        ["Source", `${s.file_name}, data row ${s.source_row}, column ${s.source_columns?.value}`],
      ];
    } else if (ev.kind === "DATA_QUALITY") {
      facts = [
        ["Instrument", "DosTel1 · ISS Columbus"],
        ["Timestamp (source clock)", String(m.timestamp)],
        ["Conflicting rows", m.rows.map((x: any) => `row ${x.source_row}: ${x.rate_raw} µGy/hour`).join("; ")],
        ["Decision", "All rows quarantined from derived analysis"],
      ];
    } else {
      facts = [
        ["Instrument", "DosTel1 · ISS Columbus"],
        ["Estimated dose over covered intervals at sensor", `${explainEngine.fmt(m.estimated_sensor_dose_uGy, 3)} µGy`],
        ["Covered / span (s)", `${explainEngine.fmt(m.covered_seconds, 0)} / ${explainEngine.fmt(m.span_seconds, 0)}`],
        ["Rows", `${m.raw_rows} raw · ${m.accepted_rows} accepted · ${m.quarantined_conflict_rows} quarantined`],
      ];
    }

    const factRows = facts
      .map(([k, v]) => `<tr><th scope="row">${escapeHtml(k)}</th><td>${escapeHtml(v)}</td></tr>`)
      .join("");
    const eventsHtml = r.events
      .map(
        (e: any) =>
          `<li><time>${escapeHtml(e.timestamp)}</time> — ${escapeHtml(e.action)}: status ${escapeHtml(
            e.before?.status ?? "—"
          )} → ${escapeHtml(e.after.status)}, version ${escapeHtml(e.after.version)}</li>`
      )
      .join("");

    return `<article class="review">
      <h3>${escapeHtml(r.title)}</h3>
      <p class="meta">Status <strong>${escapeHtml(r.status)}</strong> · follow-up date ${escapeHtml(
      r.follow_up_date || "—"
    )} · updated ${escapeHtml(r.updated_at)} · version ${escapeHtml(r.version)}</p>
      <h4>Reviewer note</h4>
      <p class="note">${escapeHtml(r.note)}</p>
      <h4>Evidence (frozen when first reviewed)</h4>
      <table>${factRows}
        <tr><th scope="row">Evidence ID</th><td><code>${escapeHtml(ev.evidence_id)}</code></td></tr>
        <tr><th scope="row">Rule version</th><td>${escapeHtml(r.rule_version)}</td></tr>
        <tr><th scope="row">Dataset SHA-256</th><td><code>${escapeHtml(r.dataset_sha256)}</code></td></tr>
      </table>
      <h4>Audit history</h4><ul>${eventsHtml}</ul>
    </article>`;
  }

  function renderSection(key: "health" | "environment", heading: string): string {
    const sec = packet[key];
    const body = sec.reviews.length
      ? sec.reviews.map(renderReviewCard).join("")
      : "<p>No saved reviews in this case.</p>";
    const lims = sec.limitations.map((l) => `<li>${escapeHtml(l)}</li>`).join("");
    return `<section><h2>${escapeHtml(heading)}</h2><p>${escapeHtml(
      sec.case_note
    )}</p>${body}<h4>Limitations</h4><ul>${lims}</ul></section>`;
  }

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>CytoZoe review packet</title>
<style>
body{font-family:'Plus Jakarta Sans',ui-sans-serif,system-ui,sans-serif;color:#0F172A;background:#fff;max-width:960px;margin:32px auto;padding:0 16px;line-height:1.5;font-size:15px}
h1{font-size:26px;margin:0 0 4px}
h2{font-size:20px;border-bottom:2px solid #E2E8F0;padding-bottom:6px;margin-top:40px}
h3{font-size:17px;margin:0 0 4px}
h4{font-size:13px;text-transform:uppercase;letter-spacing:.04em;color:#475569;margin:16px 0 4px}
.banner{background:#FFFBEB;color:#92400E;border:1px solid #FDE68A;border-radius:10px;padding:12px 14px}
.meta{color:#475569;font-size:13px}
.note{white-space:pre-wrap;background:#F8FAFC;border-radius:8px;padding:10px 12px}
table{border-collapse:collapse;width:100%;font-size:13px}
th,td{border:1px solid #E2E8F0;padding:6px 8px;text-align:left;vertical-align:top}
th{background:#F8FAFC;font-weight:600;width:34%}
code{font-size:12px;word-break:break-all;font-family:'IBM Plex Mono',monospace}
.review{border:1px solid #E2E8F0;border-radius:14px;padding:16px 18px;margin:16px 0;break-inside:avoid}
@media print{body{margin:0} a{color:inherit}}
</style>
</head>
<body>
<h1>CytoZoe — Mission Evidence &amp; Review Packet</h1>
<p class="meta">Generated ${escapeHtml(packet.generated_at)} (UTC) · CytoZoe ${escapeHtml(
    packet.app.version
  )} · build ${escapeHtml(packet.app.git_version)} · DB schema ${escapeHtml(
    packet.app.db_schema_version
  )}</p>
<p class="banner">${escapeHtml(
    packet.disclaimer
  )} This file was generated locally; it has not been sent anywhere.</p>
<h2>Verified NASA Sources</h2>
<table><tr><th>Dataset</th><th>File</th><th>SHA-256</th><th>Source</th></tr>${dsRows}</table>
${renderSection("health", "Health case · OSD-575 Inspiration4")}
${renderSection("environment", "Environment case · ISS DosTel1 (separate)")}
</body>
</html>`;
}
