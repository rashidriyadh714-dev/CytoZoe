/**
 * E1 — Deterministic Ingestion, Schema Validation & Data Quality Engine
 * Mirrors CytoZoe backend/app/engines/quality.py with 100% fidelity + full 18-analyte CMP support.
 */
import crypto from "node:crypto";

export const SCHEMA_VERSION = "1.0";
export const PARSER_VERSION = "e1-quality-v1";
export const RADLAB_INSTRUMENT = "DosTel1";
export const RADLAB_UNIT = "µGy/hour";
export const RADLAB_COLUMNS = ["timestamp", "instrument_id", "absorbed_dose_rate"];

export const VISITS: Record<string, { phase: "PREFLIGHT" | "POSTFLIGHT"; relative_day: number; order: number; label: string }> = {
  "L-92": { phase: "PREFLIGHT", relative_day: -92, order: 1, label: "L-92 · Preflight" },
  "L-44": { phase: "PREFLIGHT", relative_day: -44, order: 2, label: "L-44 · Preflight" },
  "L-3": { phase: "PREFLIGHT", relative_day: -3, order: 3, label: "L-3 · Preflight" },
  "R+1": { phase: "POSTFLIGHT", relative_day: 1, order: 4, label: "R+1 · Postflight" },
  "R+45": { phase: "POSTFLIGHT", relative_day: 45, order: 5, label: "R+45 · Postflight" },
  "R+82": { phase: "POSTFLIGHT", relative_day: 82, order: 6, label: "R+82 · Postflight" },
  "R+194": { phase: "POSTFLIGHT", relative_day: 194, order: 7, label: "R+194 · Postflight" },
};

export const PREFLIGHT_VISITS = ["L-92", "L-44", "L-3"] as const;

export const CMP_MARKERS: ReadonlyArray<[string, string, string]> = [
  ["glucose", "Glucose", "milligram_per_deciliter"],
  ["sodium", "Sodium", "millimol_per_liter"],
  ["potassium", "Potassium", "millimol_per_liter"],
  ["creatinine", "Creatinine", "milligram_per_deciliter"],
  ["calcium", "Calcium", "milligram_per_deciliter"],
];

export interface FullCmpAnalyteSpec {
  stem: string;
  name: string;
  category: "Electrolytes & Renal" | "Hepatic & Protein" | "Metabolic";
  valueCol: string;
  lowCol: string;
  highCol: string;
  unitDisplay: string;
  core: boolean;
}

export const FULL_CMP_ANALYTES: ReadonlyArray<FullCmpAnalyteSpec> = [
  {
    stem: "glucose",
    name: "Glucose",
    category: "Metabolic",
    valueCol: "glucose_value_milligram_per_deciliter",
    lowCol: "glucose_range_min_milligram_per_deciliter",
    highCol: "glucose_range_max_milligram_per_deciliter",
    unitDisplay: "mg/dL",
    core: true,
  },
  {
    stem: "sodium",
    name: "Sodium",
    category: "Electrolytes & Renal",
    valueCol: "sodium_value_millimol_per_liter",
    lowCol: "sodium_range_min_millimol_per_liter",
    highCol: "sodium_range_max_millimol_per_liter",
    unitDisplay: "mmol/L",
    core: true,
  },
  {
    stem: "potassium",
    name: "Potassium",
    category: "Electrolytes & Renal",
    valueCol: "potassium_value_millimol_per_liter",
    lowCol: "potassium_range_min_millimol_per_liter",
    highCol: "potassium_range_max_millimol_per_liter",
    unitDisplay: "mmol/L",
    core: true,
  },
  {
    stem: "creatinine",
    name: "Creatinine",
    category: "Electrolytes & Renal",
    valueCol: "creatinine_value_milligram_per_deciliter",
    lowCol: "creatinine_range_min_milligram_per_deciliter",
    highCol: "creatinine_range_max_milligram_per_deciliter",
    unitDisplay: "mg/dL",
    core: true,
  },
  {
    stem: "calcium",
    name: "Calcium",
    category: "Metabolic",
    valueCol: "calcium_value_milligram_per_deciliter",
    lowCol: "calcium_range_min_milligram_per_deciliter",
    highCol: "calcium_range_max_milligram_per_deciliter",
    unitDisplay: "mg/dL",
    core: true,
  },
  {
    stem: "chloride",
    name: "Chloride",
    category: "Electrolytes & Renal",
    valueCol: "chloride_value_millimol_per_liter",
    lowCol: "chloride_range_min_millimol_per_liter",
    highCol: "chloride_range_max_millimol_per_liter",
    unitDisplay: "mmol/L",
    core: false,
  },
  {
    stem: "carbon_dioxide",
    name: "Carbon Dioxide (CO₂)",
    category: "Electrolytes & Renal",
    valueCol: "carbon_dioxide_value_millimol_per_liter",
    lowCol: "carbon_dioxide_range_min_millimol_per_liter",
    highCol: "carbon_dioxide_range_max_millimol_per_liter",
    unitDisplay: "mmol/L",
    core: false,
  },
  {
    stem: "urea_nitrogen_bun",
    name: "Urea Nitrogen (BUN)",
    category: "Electrolytes & Renal",
    valueCol: "urea_nitrogen_bun_value_milligram_per_deciliter",
    lowCol: "urea_nitrogen_bun_range_min_milligram_per_deciliter",
    highCol: "urea_nitrogen_bun_range_max_milligram_per_deciliter",
    unitDisplay: "mg/dL",
    core: false,
  },
  {
    stem: "bun_to_creatinine_ratio",
    name: "BUN / Creatinine Ratio",
    category: "Electrolytes & Renal",
    valueCol: "bun_to_creatinine_ratio_value",
    lowCol: "bun_to_creatinine_ratio_range_min",
    highCol: "bun_to_creatinine_ratio_range_max",
    unitDisplay: "ratio",
    core: false,
  },
  {
    stem: "albumin",
    name: "Albumin",
    category: "Hepatic & Protein",
    valueCol: "albumin_value_gram_per_deciliter",
    lowCol: "albumin_range_min_gram_per_deciliter",
    highCol: "albumin_range_max_gram_per_deciliter",
    unitDisplay: "g/dL",
    core: false,
  },
  {
    stem: "globulin",
    name: "Globulin",
    category: "Hepatic & Protein",
    valueCol: "globulin_value_gram_per_deciliter",
    lowCol: "globulin_range_min_gram_per_deciliter",
    highCol: "globulin_range_max_gram_per_deciliter",
    unitDisplay: "g/dL",
    core: false,
  },
  {
    stem: "albumin_to_globulin_ratio",
    name: "Albumin / Globulin Ratio",
    category: "Hepatic & Protein",
    valueCol: "albumin_to_globulin_ratio_value",
    lowCol: "albumin_to_globulin_ratio_range_min",
    highCol: "albumin_to_globulin_ratio_range_max",
    unitDisplay: "ratio",
    core: false,
  },
  {
    stem: "total_protein",
    name: "Total Protein",
    category: "Hepatic & Protein",
    valueCol: "total_protein_value_gram_per_deciliter",
    lowCol: "total_protein_range_min_gram_per_deciliter",
    highCol: "total_protein_range_max_gram_per_deciliter",
    unitDisplay: "g/dL",
    core: false,
  },
  {
    stem: "alkaline_phosphatase",
    name: "Alkaline Phosphatase (ALP)",
    category: "Hepatic & Protein",
    valueCol: "alkaline_phosphatase_value_units_per_liter",
    lowCol: "alkaline_phosphatase_range_min_units_per_liter",
    highCol: "alkaline_phosphatase_range_max_units_per_liter",
    unitDisplay: "U/L",
    core: false,
  },
  {
    stem: "alt",
    name: "Alanine Transaminase (ALT)",
    category: "Hepatic & Protein",
    valueCol: "alt_value_units_per_liter",
    lowCol: "alt_range_min_units_per_liter",
    highCol: "alt_max_units_per_liter",
    unitDisplay: "U/L",
    core: false,
  },
  {
    stem: "ast",
    name: "Aspartate Transaminase (AST)",
    category: "Hepatic & Protein",
    valueCol: "ast_value_units_per_liter",
    lowCol: "ast_range_min_units_per_liter",
    highCol: "ast_max_units_per_liter",
    unitDisplay: "U/L",
    core: false,
  },
  {
    stem: "total_bilirubin",
    name: "Total Bilirubin",
    category: "Hepatic & Protein",
    valueCol: "total_bilirubin_value_milligram_per_deciliter",
    lowCol: "total_bilirubin_range_min_milligram_per_deciliter",
    highCol: "total_bilirubin_range_max_milligram_per_deciliter",
    unitDisplay: "mg/dL",
    core: false,
  },
];

export const UNIT_DISPLAY: Record<string, string> = {
  milligram_per_deciliter: "mg/dL",
  millimol_per_liter: "mmol/L",
};

export const SAMPLE_RE = /^(C\d{3})_serum_(L-\d+|R\+\d+)$/;
export const TIMESTAMP_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/;
const MISSING_TOKENS = new Set(["", "na", "n/a", "null", "none", "nan"]);

export class SchemaMismatch extends Error {
  code: string;
  details: Record<string, unknown>;
  constructor(code: string, message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

export function sha256Hex(raw: Buffer): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

export function cmpColumns(stem: string, unit: string): [string, string, string] {
  return [
    `${stem}_value_${unit}`,
    `${stem}_range_min_${unit}`,
    `${stem}_range_max_${unit}`,
  ];
}

export function parseNumber(raw: string | undefined | null): [number | null, string | null] {
  const token = (raw ?? "").trim();
  if (MISSING_TOKENS.has(token.toLowerCase())) {
    return [null, "MISSING"];
  }
  const num = Number(token);
  if (!Number.isFinite(num)) {
    return [null, "NON_NUMERIC"];
  }
  return [num, null];
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        result.push(cur);
        cur = "";
      } else {
        cur += ch;
      }
    }
  }
  result.push(cur);
  return result;
}

export function readCsvTable(raw: Buffer): { columns: string[]; rows: Record<string, string>[] } {
  if (raw.includes(0)) {
    throw new SchemaMismatch("BINARY_CONTENT", "Binary content cannot be imported as CSV.");
  }
  let text = raw.toString("utf-8");
  if (text.startsWith("\uFEFF")) {
    text = text.slice(1);
  }
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  if (lines.length === 0) {
    throw new SchemaMismatch("EMPTY_FILE", "The CSV file is empty.");
  }
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].length > 8192) {
      throw new SchemaMismatch("LINE_TOO_LONG", "A CSV line exceeds the 8,192-character safety limit.", { line: i + 1 });
    }
  }
  if (lines.length - 1 > 100000) {
    throw new SchemaMismatch("TOO_MANY_ROWS", "The CSV file exceeds the 100,000-row safety limit.");
  }
  const columns = parseCsvLine(lines[0]).map((c) => c.trim());
  if (columns.length === 0 || columns.some((c) => !c) || new Set(columns).size !== columns.length) {
    throw new SchemaMismatch("INVALID_HEADER", "The CSV header has blank or duplicate column names.");
  }
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const vals = parseCsvLine(lines[i]);
    if (vals.length !== columns.length) {
      throw new SchemaMismatch("COLUMN_COUNT_MISMATCH", "A CSV row does not match the header column count.", {
        line: i + 1,
        expected: columns.length,
        actual: vals.length,
      });
    }
    const rec: Record<string, string> = {};
    for (let c = 0; c < columns.length; c++) {
      rec[columns[c]] = vals[c];
    }
    rows.push(rec);
  }
  if (rows.length === 0) {
    throw new SchemaMismatch("NO_DATA_ROWS", "The CSV file has a header but no data rows.");
  }
  return { columns, rows };
}

export function detectKind(raw: Buffer): "HEALTH_CMP" | "ENV_RADIATION" {
  const { columns } = readCsvTable(raw);
  if (
    columns.length === RADLAB_COLUMNS.length &&
    columns.every((c, i) => c === RADLAB_COLUMNS[i])
  ) {
    return "ENV_RADIATION";
  }
  if (columns.includes("Sample Name") && columns.includes("creatinine_value_milligram_per_deciliter")) {
    return "HEALTH_CMP";
  }
  throw new SchemaMismatch(
    "UNKNOWN_SCHEMA",
    "This file does not match the OSD-575 CMP or RadLab DosTel1 schema.",
    { columns: columns.slice(0, 8) }
  );
}

export interface HealthObservationRecord {
  id: string;
  source_row: number;
  participant_id: string;
  sample_id: string;
  visit: string;
  phase: "PREFLIGHT" | "POSTFLIGHT";
  relative_day: number;
  visit_order: number;
  marker: string;
  value: number | null;
  value_raw: string;
  unit: string;
  source_unit: string;
  source_column: string;
  range_low: number | null;
  range_high: number | null;
}

export function parseOsd575Cmp(raw: Buffer): {
  records: HealthObservationRecord[];
  report: Record<string, unknown>;
} {
  const table = readCsvTable(raw);
  const required = [
    "Sample Name",
    ...CMP_MARKERS.flatMap(([stem, , unit]) => cmpColumns(stem, unit)),
  ];
  const missing = required.filter((c) => !table.columns.includes(c));
  if (missing.length > 0) {
    throw new SchemaMismatch("DATA_SCHEMA_MISMATCH", "Required OSD-575 CMP columns are missing.", { missing });
  }

  const records: HealthObservationRecord[] = [];
  const issues: Array<{ source_row: number; column: string; issue: string }> = [];
  const seen = new Set<string>();

  table.rows.forEach((row, index) => {
    const source_row = index + 1;
    const sample_id = (row["Sample Name"] ?? "").trim();
    const match = SAMPLE_RE.exec(sample_id);
    if (!match || !(match[2] in VISITS)) {
      throw new SchemaMismatch(
        "SAMPLE_LABEL_UNRECOGNISED",
        "A sample label does not follow the documented '<participant>_serum_<visit>' pattern.",
        { source_row, sample: sample_id.slice(0, 40) }
      );
    }
    if (seen.has(sample_id)) {
      throw new SchemaMismatch("DUPLICATE_SAMPLE", "A sample appears more than once.", { sample: sample_id });
    }
    seen.add(sample_id);
    const participant = match[1];
    const visit = match[2];
    const meta = VISITS[visit];

    for (const [stem, , unit] of CMP_MARKERS) {
      const [valueCol, lowCol, highCol] = cmpColumns(stem, unit);
      const [value, issue] = parseNumber(row[valueCol]);
      const [low, lowIssue] = parseNumber(row[lowCol]);
      const [high, highIssue] = parseNumber(row[highCol]);

      for (const [col, problem] of [
        [valueCol, issue],
        [lowCol, lowIssue],
        [highCol, highIssue],
      ] as const) {
        if (problem) {
          issues.push({ source_row, column: col, issue: problem });
        }
      }

      records.push({
        id: `osd575-cmp:${sample_id}:${stem}`,
        source_row,
        participant_id: participant,
        sample_id,
        visit,
        phase: meta.phase,
        relative_day: meta.relative_day,
        visit_order: meta.order,
        marker: stem,
        value,
        value_raw: row[valueCol] ?? "",
        unit: UNIT_DISPLAY[unit],
        source_unit: unit,
        source_column: valueCol,
        range_low: low,
        range_high: high,
      });
    }
  });

  const participants = Array.from(new Set(records.map((r) => r.participant_id))).sort();
  const visits = Array.from(new Set(records.map((r) => r.visit))).sort(
    (a, b) => VISITS[a].order - VISITS[b].order
  );

  const report = {
    parser_version: PARSER_VERSION,
    raw_rows: table.rows.length,
    samples: seen.size,
    participants,
    visits,
    selected_markers: CMP_MARKERS.map(([s]) => s),
    selected_observations: records.length,
    nonmissing_values: records.filter((r) => r.value !== null).length,
    issues,
    excluded_columns_note: "Only five selected markers are imported. Race-based eGFR fields are deliberately not used.",
  };

  return { records, report };
}

export interface FullCmpAnalyteRow {
  stem: string;
  name: string;
  category: string;
  core: boolean;
  unit: string;
  value: number | null;
  value_raw: string;
  range_low: number | null;
  range_high: number | null;
  source_row: number;
  source_column: string;
}

export function parseFullOsd575Sample(
  raw: Buffer,
  participantId: string,
  visit: string
): FullCmpAnalyteRow[] {
  const table = readCsvTable(raw);
  const targetSample = `${participantId}_serum_${visit}`;
  const rowIndex = table.rows.findIndex((r) => (r["Sample Name"] ?? "").trim() === targetSample);
  if (rowIndex < 0) return [];
  const row = table.rows[rowIndex];
  const source_row = rowIndex + 1;

  return FULL_CMP_ANALYTES.map((spec) => {
    const [val] = parseNumber(row[spec.valueCol]);
    const [low] = parseNumber(row[spec.lowCol]);
    const [high] = parseNumber(row[spec.highCol]);
    return {
      stem: spec.stem,
      name: spec.name,
      category: spec.category,
      core: spec.core,
      unit: spec.unitDisplay,
      value: val,
      value_raw: row[spec.valueCol] ?? "",
      range_low: low,
      range_high: high,
      source_row,
      source_column: spec.valueCol,
    };
  });
}

export function epochFromTimestamp(ts: string): number {
  const ms = Date.parse(`${ts}Z`);
  if (Number.isNaN(ms)) {
    throw new Error("Invalid timestamp");
  }
  return ms / 1000;
}

export interface RadiationObservationRecord {
  id: string;
  source_row: number;
  instrument_id: string;
  source_timestamp: string;
  epoch: number | null;
  rate: number | null;
  rate_raw: string;
  unit: string;
  quality_status:
    | "ACCEPTED"
    | "DUPLICATE_CONFLICT"
    | "DUPLICATE_IDENTICAL"
    | "INVALID_TIMESTAMP"
    | "INVALID_RATE"
    | "MISSING_VALUE";
  quality_detail: string | null;
}

export function parseRadlab(raw: Buffer): {
  records: RadiationObservationRecord[];
  report: Record<string, unknown>;
} {
  const table = readCsvTable(raw);
  if (
    table.columns.length !== RADLAB_COLUMNS.length ||
    !table.columns.every((c, i) => c === RADLAB_COLUMNS[i])
  ) {
    throw new SchemaMismatch(
      "DATA_SCHEMA_MISMATCH",
      "RadLab export columns must be exactly timestamp,instrument_id,absorbed_dose_rate.",
      { columns: table.columns.slice(0, 10) }
    );
  }

  const rows: RadiationObservationRecord[] = [];
  table.rows.forEach((row, index) => {
    const source_row = index + 1;
    const instrument = (row["instrument_id"] ?? "").trim();
    if (instrument !== RADLAB_INSTRUMENT) {
      throw new SchemaMismatch("UNEXPECTED_INSTRUMENT", "Only DosTel1 exports are supported.", { source_row });
    }
    const ts = (row["timestamp"] ?? "").trim();
    let [rate, rateIssue] = parseNumber(row["absorbed_dose_rate"]);
    let status: RadiationObservationRecord["quality_status"] = "ACCEPTED";
    let detail: string | null = null;
    let epoch: number | null = null;

    if (!TIMESTAMP_RE.test(ts)) {
      status = "INVALID_TIMESTAMP";
      detail = "Timestamp is not in the documented YYYY-MM-DDTHH:MM:SS form.";
    } else {
      try {
        epoch = epochFromTimestamp(ts);
      } catch {
        status = "INVALID_TIMESTAMP";
        detail = "Timestamp is not a real calendar time.";
      }
    }

    if (status === "ACCEPTED") {
      if (rateIssue === "MISSING") {
        status = "MISSING_VALUE";
        detail = "Absorbed dose rate is blank or NA.";
      } else if (rateIssue || rate === null || rate < 0) {
        status = "INVALID_RATE";
        detail = "Absorbed dose rate is not a finite non-negative number.";
        rate = rateIssue ? null : rate;
      }
    }

    rows.push({
      id: `radlab-dostel1:row${source_row}`,
      source_row,
      instrument_id: instrument,
      source_timestamp: ts,
      epoch,
      rate,
      rate_raw: row["absorbed_dose_rate"] ?? "",
      unit: RADLAB_UNIT,
      quality_status: status,
      quality_detail: detail,
    });
  });

  const groups = new Map<string, RadiationObservationRecord[]>();
  for (const r of rows) {
    if (r.epoch !== null) {
      const list = groups.get(r.source_timestamp) ?? [];
      list.push(r);
      groups.set(r.source_timestamp, list);
    }
  }

  const conflict_groups: Array<{
    timestamp: string;
    rows: Array<{ source_row: number; rate: number | null; rate_raw: string }>;
  }> = [];
  const identical_groups: Array<{ timestamp: string; source_rows: number[] }> = [];

  for (const [ts, members] of Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b))) {
    if (members.length < 2) continue;
    const valid = members.filter((m) => m.quality_status === "ACCEPTED");
    const uniqueRates = new Set(valid.map((m) => m.rate));
    if (valid.length === members.length && uniqueRates.size === 1) {
      for (const m of members.slice(1)) {
        m.quality_status = "DUPLICATE_IDENTICAL";
        m.quality_detail = "Identical duplicate of an earlier row; retained, not double-counted.";
      }
      identical_groups.push({ timestamp: ts, source_rows: members.map((m) => m.source_row) });
    } else {
      for (const m of valid) {
        m.quality_status = "DUPLICATE_CONFLICT";
        m.quality_detail = "Same timestamp reported with different rates; all rows quarantined.";
      }
      conflict_groups.push({
        timestamp: ts,
        rows: members.map((m) => ({ source_row: m.source_row, rate: m.rate, rate_raw: m.rate_raw })),
      });
    }
  }

  const counts: Record<string, number> = {};
  for (const r of rows) {
    counts[r.quality_status] = (counts[r.quality_status] ?? 0) + 1;
  }

  const validTs = Array.from(new Set(rows.filter((r) => r.epoch !== null).map((r) => r.source_timestamp))).sort();
  const accepted = rows
    .filter((r) => r.quality_status === "ACCEPTED" && r.epoch !== null)
    .sort((a, b) => (a.epoch ?? 0) - (b.epoch ?? 0));
  const intervals: number[] = [];
  for (let i = 1; i < accepted.length; i++) {
    intervals.push((accepted[i].epoch ?? 0) - (accepted[i - 1].epoch ?? 0));
  }
  const sortedIntervals = [...intervals].sort((a, b) => a - b);

  const report = {
    parser_version: PARSER_VERSION,
    raw_rows: rows.length,
    unique_timestamps: validTs.length,
    first_timestamp: validTs[0] ?? null,
    last_timestamp: validTs[validTs.length - 1] ?? null,
    status_counts: counts,
    accepted_rows: counts["ACCEPTED"] ?? 0,
    quarantined_rows: counts["DUPLICATE_CONFLICT"] ?? 0,
    conflict_groups,
    identical_duplicate_groups: identical_groups,
    observed_max_interval_seconds: sortedIntervals.length ? sortedIntervals[sortedIntervals.length - 1] : null,
    observed_median_interval_seconds: sortedIntervals.length
      ? sortedIntervals[Math.floor(sortedIntervals.length / 2)]
      : null,
    documented_nominal_cadence_seconds: 300,
    timestamp_semantics: "Source clock as exported; no timezone suffix. Not converted to UTC or local time.",
    unit: RADLAB_UNIT,
  };

  return { records: rows, report };
}
