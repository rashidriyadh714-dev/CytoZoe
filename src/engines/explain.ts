/**
 * Deterministic Verified Explanation Engine
 * Mirrors CytoZoe backend/app/services/explain.py with 100% fidelity.
 * Uses fixed, source-bound templates — no language model, no diagnosis, no unproven causal claims.
 */
import * as health from "./health";

export const QUESTIONS: Record<string, string> = {
  EXPLAIN_RESULT: "Explain this result",
  HOW_CALCULATED: "How was this calculated?",
  LIMITATIONS: "What can this dataset not tell us?",
  DIAGNOSIS_REQUEST: "Does this mean something is wrong?",
  CAUSATION_REQUEST: "Did radiation cause this?",
  SOURCE_LOCATION: "Where did this number come from?",
  FOLLOW_UP_OPTIONS: "What follow-up can be recorded?",
};

const FOLLOW_UP_TEXT = [
  "A reviewer can record an administrative workflow status (Open, Follow-up requested or Reviewed), a required note and an optional follow-up date.",
  "Saving a review freezes a snapshot of this evidence object with the dataset SHA-256 and rule version, and appends an entry to the local audit trail.",
  "CytoZoe does not recommend clinical action or treatment; follow-up notes stay in the local SQLite database until exported.",
];

export function fmt(val: number | null | undefined, digits = 4): string {
  if (val === null || val === undefined || !Number.isFinite(val)) return "—";
  const fixed = val.toFixed(digits);
  const stripped = fixed.includes(".") ? fixed.replace(/\.?0+$/, "") : fixed;
  return stripped === "-0" ? "0" : stripped;
}

export function signed(val: number | null | undefined, digits = 4): string {
  if (val === null || val === undefined || !Number.isFinite(val)) return "—";
  const sign = val > 0 ? "+" : val < 0 ? "−" : "";
  return `${sign}${fmt(Math.abs(val), digits)}`;
}

export function hms(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) return "—";
  const s = Math.round(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${h}h ${String(m).padStart(2, "0")}m ${String(sec).padStart(2, "0")}s`;
}

// Deterministic keyword routing for typed questions. Order matters: boundary questions are checked first.
const ROUTES: ReadonlyArray<[string, RegExp]> = [
  ["CAUSATION_REQUEST", /\b(cause[ds]?|causing|because|radiation|exposure|due to|effect of)\b/i],
  ["DIAGNOSIS_REQUEST", /\b(diagnos\w*|sick|ill|illness|disease|wrong|danger\w*|serious|healthy|safe|normal|worry|worried|treat\w*|medic\w*)\b/i],
  ["SOURCE_LOCATION", /\b(where|source|come[s]? from|provenance|origin|file|row|hash)\b/i],
  ["FOLLOW_UP_OPTIONS", /\b(follow[- ]?up|next step|what (can|should) (i|we) (do|record)|record|save)\b/i],
  ["HOW_CALCULATED", /\b(calculat\w*|comput\w*|formula|baseline|mean|average|how)\b/i],
  ["LIMITATIONS", /\b(limit\w*|cannot|can't|trust|reliab\w*|uncertain\w*|accura\w*|missing|not tell)\b/i],
  ["EXPLAIN_RESULT", /\b(explain|what|mean[s]?|why|tell|summar\w*|result|value|flag\w*)\b/i],
];

export function classifyQuestion(message: string): string | null {
  for (const [qid, pattern] of ROUTES) {
    if (pattern.test(message)) {
      return qid;
    }
  }
  return null;
}

export function unsupportedExplanation(evidenceId: string) {
  return {
    mode: "VERIFIED_EXPLANATION" as const,
    label: "Verified explanation",
    question_id: null,
    question: "Unsupported question",
    evidence_id: evidenceId,
    paragraphs: [
      "I can only answer from the evidence on this page, using fixed verified templates. Try asking what the result means, how it was calculated, what the data cannot tell us, whether it means something is wrong, or whether radiation caused it.",
    ],
    facts: [],
    source_ids: [evidenceId],
    generated_by: "deterministic template (no language model)",
  };
}

function sourceParagraphs(ev: any): string[] {
  const s = ev.source;
  const prov =
    s.provenance === "NASA_PINNED_VERIFIED"
      ? "a verified NASA snapshot whose SHA-256 is registered in data/manifests/sources.json"
      : `provenance class ${s.provenance ?? "unreported"}`;
  if (ev.case === "health") {
    return [
      `This value comes from ${s.title} (${s.provider}), file ${s.file_name}, data row ${s.source_row} (file line ${s.file_line}), column ${s.source_columns?.value}, raw text "${s.raw_value}".`,
      `The file is ${prov} (SHA-256 ${s.sha256}).`,
    ];
  }
  return [
    `This finding comes from ${s.title} (${s.provider}), file ${s.file_name}, instrument ${s.instrument_id} (${s.location}).`,
    `The file is ${prov} (SHA-256 ${s.sha256}).`,
  ];
}

function explainHealth(ev: any, q: string): [string[], Array<{ label: string; value: string }>] {
  const m = ev.measurement;
  const c = ev.comparison;
  const ctx = ev.context;
  const s = ev.source;
  const u = m.unit;

  const facts: Array<{ label: string; value: string }> = [
    { label: "Participant · visit", value: `${ctx.participant_id} · ${ctx.visit_label}` },
    { label: "Observed value", value: m.value === null ? "No value recorded" : `${fmt(m.value)} ${u}` },
    {
      label: "Supplied laboratory range",
      value:
        m.range_low !== null && m.range_high !== null
          ? `${fmt(m.range_low)}–${fmt(m.range_high)} ${u}`
          : "Incomplete or not supplied",
    },
    {
      label: "Retrospective preflight mean",
      value: c.baseline_available ? `${fmt(c.baseline)} ${u} (n = ${c.n})` : `Not available (n = ${c.n})`,
    },
    {
      label: "Source row",
      value: `${s.file_name}, data row ${s.source_row} (line ${s.file_line})`,
    },
  ];

  if (q === "EXPLAIN_RESULT") {
    const p1 =
      m.value === null
        ? `No ${m.marker_name.toLowerCase()} value is recorded in the source file for ${ctx.participant_id} at ${ctx.visit_label}. Nothing is filled in.`
        : `For participant ${ctx.participant_id} at ${ctx.visit_label} (${Math.abs(ctx.relative_day)} ${ctx.relative_day_reference}), the recorded ${m.marker_name.toLowerCase()} value is ${fmt(m.value)} ${u}.`;

    let p2 = "The supplied laboratory range is incomplete, so range status is not fully assessed.";
    if (m.range_status === health.WITHIN) {
      p2 = `This is within the laboratory range supplied in the source file (${fmt(m.range_low)}–${fmt(m.range_high)} ${u}).`;
    } else if (m.range_status === health.ABOVE) {
      p2 = `This is above the supplied upper bound of ${fmt(m.range_high)} ${u} (supplied range ${fmt(m.range_low)}–${fmt(m.range_high)} ${u}), so it is flagged for human review — not as a diagnosis.`;
    } else if (m.range_status === health.BELOW) {
      p2 = `This is below the supplied lower bound of ${fmt(m.range_low)} ${u} (supplied range ${fmt(m.range_low)}–${fmt(m.range_high)} ${u}), so it is flagged for human review — not as a diagnosis.`;
    }

    const p3 = c.baseline_available
      ? `Compared with ${ctx.participant_id}'s retrospective preflight mean of ${fmt(c.baseline)} ${u} (n = ${c.n}), the difference is ${signed(c.delta)} ${u}${c.percent_delta !== null ? ` (${signed(c.percent_delta, 2)}%)` : ""}. This comparison is descriptive only.`
      : "Fewer than two preflight values are available, so no personal baseline mean is computed.";
    return [[p1, p2, p3], facts];
  }

  if (q === "HOW_CALCULATED") {
    const used = c.baseline_values.map((b: any) => `${b.visit}: ${b.value === null ? "missing" : fmt(b.value)}`).join(", ");
    const paras = [
      `Personal baseline: arithmetic mean of ${ctx.participant_id}'s available preflight values (${used}) → ${c.baseline_available ? `${fmt(c.baseline)} ${u} (n = ${c.n})` : "not computed (requires n ≥ 2)"}.`,
      c.includes_selected_sample
        ? "Because this visit is itself a preflight sample, its value is part of that mean — this is a retrospective summary of the three preflight draws, not a real-time prediction."
        : "This postflight value is compared against the mean of the three preflight samples.",
      `Range rule: strict inequality against the unrounded source numbers (${c.formulas.range_status}). Rounded displays never drive this rule.`,
      `Rule version ${c.rule_version}. Source: ${s.file_name} (SHA-256 ${s.sha256.slice(0, 12)}…), data row ${s.source_row}.`,
    ];
    return [paras, facts];
  }

  if (q === "LIMITATIONS") {
    return [
      [
        ...ev.limitations,
        "A difference from the personal mean is descriptive; CytoZoe has no validated abnormality threshold for it.",
      ],
      facts,
    ];
  }

  if (q === "DIAGNOSIS_REQUEST") {
    return [
      [
        "Insufficient evidence. CytoZoe does not diagnose, predict illness or recommend treatment.",
        "What the data shows is limited to: the recorded value, the supplied laboratory bounds and a comparison with this participant's own preflight samples. Interpreting it requires a qualified medical professional with the full clinical context, which this public anonymised dataset does not contain.",
      ],
      facts,
    ];
  }

  return [
    [
      "No — the available data cannot support that claim.",
      "The Inspiration4 blood samples (OSD-575) and the ISS DosTel1 radiation record (1 March 2022, ISS Columbus module) come from different missions, times and people. There is no personal dose for this participant, so CytoZoe deliberately never links the two case studies.",
      "Answering a causal question would require matched, time-aligned personal dosimetry and physiological measurements for the same person, plus a validated study design.",
    ],
    facts,
  ];
}

function explainEnvironment(ev: any, q: string): [string[], Array<{ label: string; value: string }>] {
  const m = ev.measurement;
  if (ev.kind === "DATA_QUALITY") {
    const rows = m.rows.map((r: any) => `data row ${r.source_row}: ${r.rate_raw} µGy/hour`).join("; ");
    const facts = [
      { label: "Timestamp (source clock)", value: m.timestamp },
      { label: "Conflicting rows", value: rows },
      { label: "Decision", value: "All rows quarantined from derived analysis" },
    ];
    if (q === "EXPLAIN_RESULT" || q === "HOW_CALCULATED") {
      return [
        [
          `The source export reports more than one different absorbed dose rate at exactly ${m.timestamp} (${rows}).`,
          "There is no documented basis to prefer one value, so CytoZoe keeps every original row for audit but excludes all of them from the plotted rate series and the sensor-dose estimate. It does not take the first value, sum them or average them.",
          "Any integration interval that crosses this timestamp is excluded, and the plotted lines break there.",
        ],
        facts,
      ];
    }
    if (q === "LIMITATIONS") return [[...ev.limitations], facts];
    if (q === "DIAGNOSIS_REQUEST") {
      return [
        [
          "Insufficient evidence. This is an instrument reading on the ISS, not a measurement of any person. CytoZoe draws no health conclusion and shows no safe/unsafe dose signal.",
        ],
        facts,
      ];
    }
    return [
      [
        "No — this record cannot show that radiation caused any health change.",
        "It is a single-instrument environmental record that is not linked to any participant. The Inspiration4 blood samples come from a different mission, time and crew.",
      ],
      facts,
    ];
  }

  const facts = [
    {
      label: "Estimated dose over covered intervals at sensor",
      value: `${fmt(m.estimated_sensor_dose_uGy, 2)} µGy`,
    },
    {
      label: "Covered duration",
      value: `${hms(m.covered_seconds)} of ${hms(m.span_seconds)} (${fmt(100 * (m.coverage_ratio || 0), 2)}%)`,
    },
    {
      label: "Rows",
      value: `${m.raw_rows} raw · ${m.accepted_rows} accepted · ${m.quarantined_conflict_rows} quarantined`,
    },
    {
      label: "Intervals",
      value: `${m.included_intervals} included · ${m.excluded_intervals} excluded`,
    },
  ];

  if (q === "EXPLAIN_RESULT") {
    return [
      [
        `On 1 March 2022 the DosTel1 instrument in the ISS Columbus module exported ${m.raw_rows} rows. ${m.quarantined_conflict_rows} rows share timestamps with conflicting values and were quarantined; ${m.accepted_rows} rows were accepted.`,
        `Integrating the accepted readings gives an estimated ${fmt(m.estimated_sensor_dose_uGy, 2)} µGy absorbed at the sensor over ${hms(m.covered_seconds)} of covered time (${fmt(100 * (m.coverage_ratio || 0), 2)}% of the recorded span).`,
        "This is an approximate instrument-level estimate. It is not a personal, organ or effective dose and is not compared with any exposure limit.",
      ],
      facts,
    ];
  }
  if (q === "HOW_CALCULATED") {
    const f = ev.comparison.formulas;
    return [
      [
        `Per interval: ${f.interval}.`,
        `Inclusion: ${f.inclusion}.`,
        `Total: ${f.total}.`,
        "The 300-second cut-off is an engineering coverage rule, not a NASA safety threshold. The instrument's documented nominal cadence is 300 s, but this export shows irregular intervals.",
        `Rule version ${ev.comparison.rule_version}. Source SHA-256 ${ev.source.sha256.slice(0, 12)}….`,
      ],
      facts,
    ];
  }
  if (q === "LIMITATIONS") return [[...ev.limitations], facts];
  if (q === "DIAGNOSIS_REQUEST") {
    return [
      [
        "Insufficient evidence. This is an instrument reading on the ISS, not a measurement of any person. CytoZoe draws no health conclusion and shows no safe/unsafe dose signal.",
      ],
      facts,
    ];
  }
  return [
    [
      "No — this record cannot show that radiation caused any health change.",
      "It is a single-instrument environmental record that is not linked to any participant. The Inspiration4 blood samples come from a different mission, time and crew.",
    ],
    facts,
  ];
}

export function buildExplanation(evidence: any, questionId: string) {
  if (questionId === "SOURCE_LOCATION" || questionId === "FOLLOW_UP_OPTIONS") {
    const baseFacts =
      evidence.case === "health"
        ? explainHealth(evidence, "LIMITATIONS")[1]
        : explainEnvironment(evidence, "LIMITATIONS")[1];
    const paragraphs =
      questionId === "SOURCE_LOCATION" ? sourceParagraphs(evidence) : [...FOLLOW_UP_TEXT];
    return {
      mode: "VERIFIED_EXPLANATION" as const,
      label: "Verified explanation",
      question_id: questionId,
      question: QUESTIONS[questionId],
      evidence_id: evidence.evidence_id,
      paragraphs,
      facts: baseFacts,
      source_ids: [evidence.evidence_id, evidence.source.dataset_id],
      generated_by: "deterministic template (no language model)",
    };
  }
  const [paragraphs, facts] =
    evidence.case === "health"
      ? explainHealth(evidence, questionId)
      : explainEnvironment(evidence, questionId);

  return {
    mode: "VERIFIED_EXPLANATION" as const,
    label: "Verified explanation",
    question_id: questionId,
    question: QUESTIONS[questionId],
    evidence_id: evidence.evidence_id,
    paragraphs,
    facts,
    source_ids: [evidence.evidence_id, evidence.source.dataset_id],
    generated_by: "deterministic template (no language model)",
  };
}
