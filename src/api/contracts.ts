export type RangeStatus =
  | "ABOVE_SUPPLIED_UPPER_BOUND"
  | "BELOW_SUPPLIED_LOWER_BOUND"
  | "WITHIN_SUPPLIED_RANGE"
  | "ONE_SIDED_COMPARISON"
  | "UNKNOWN";

export type ReviewStatus = "OPEN" | "FOLLOW_UP_REQUESTED" | "REVIEWED";

export type QuestionId =
  | "EXPLAIN_RESULT"
  | "HOW_CALCULATED"
  | "LIMITATIONS"
  | "DIAGNOSIS_REQUEST"
  | "CAUSATION_REQUEST"
  | "SOURCE_LOCATION"
  | "FOLLOW_UP_OPTIONS";

export interface ApiErrorBody {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface ReadinessCheck {
  name: string;
  ok: boolean;
  code: string | null;
  detail: string;
}

export interface Status {
  status: string;
  app_name: string;
  app_version: string;
  git_version: string;
  db_schema_version: number;
  ready: boolean;
  state: string;
  checks: ReadinessCheck[];
  datasets_imported: number;
  datasets: { id: string; kind: string; sha256: string; imported_at: string; provenance?: string }[];
}

export interface SampleVisit {
  sample_id: string;
  visit: string;
  label: string;
  phase: "PREFLIGHT" | "POSTFLIGHT";
  relative_day: number;
  visit_order: number;
}

export interface Participant {
  participant_id: string;
  samples: SampleVisit[];
}

export interface Review {
  id: string;
  finding_id: string;
  case: "health" | "environment";
  participant_id: string | null;
  instrument_id: string | null;
  title: string;
  status: ReviewStatus;
  note: string;
  follow_up_date: string | null;
  created_at: string;
  updated_at: string;
  version: number;
}

export interface ReviewEvent {
  id: number;
  action: "CREATED" | "STATUS_CHANGED" | "UPDATED";
  before: { status?: ReviewStatus; note?: string; follow_up_date?: string | null; version?: number } | null;
  after: { status: ReviewStatus; note: string; follow_up_date: string | null; version: number };
  timestamp: string;
}

export interface ReviewDetail extends Review {
  evidence_snapshot: Evidence;
  dataset_sha256: string;
  rule_version: string;
  events: ReviewEvent[];
}

export interface EvidenceSource {
  dataset_id: string;
  title: string;
  provider: string;
  file_name: string;
  sha256: string;
  provenance?: string;
  source_url: string;
  download_url: string;
  fetched_at: string | null;
  imported_at: string;
  license_note: string;
  citation: string;
  source_row?: number;
  file_line?: number;
  sample_name?: string;
  source_columns?: { value: string; range_low: string; range_high: string };
  raw_value?: string;
  source_unit?: string;
  instrument_id?: string;
  location?: string;
}

export interface HealthEvidence {
  schema_version: string;
  evidence_id: string;
  case: "health";
  kind: "HEALTH_OBSERVATION";
  title: string;
  source: EvidenceSource;
  context: {
    participant_id: string;
    sample_id: string;
    visit: string;
    visit_label: string;
    phase: "PREFLIGHT" | "POSTFLIGHT";
    relative_day: number;
    relative_day_reference: string;
    linked_radiation_record: null;
  };
  measurement: {
    marker: string;
    marker_name: string;
    value: number | null;
    unit: string;
    range_low: number | null;
    range_high: number | null;
    range_status: RangeStatus;
    needs_review: boolean;
  };
  comparison: {
    baseline: number | null;
    n: number;
    baseline_available: boolean;
    baseline_method: string;
    baseline_values: { visit: string; sample_id: string; value: number | null; source_row: number }[];
    includes_selected_sample: boolean;
    delta: number | null;
    percent_delta: number | null;
    rule_version: string;
    formulas: Record<string, string>;
  };
  evidence_strength: string;
  limitations: string[];
  review: Review | null;
}

export interface EnvSummaryMeasurement {
  label: string;
  estimated_sensor_dose_uGy: number;
  unit: string;
  covered_seconds: number;
  span_seconds: number;
  coverage_ratio: number | null;
  included_intervals: number;
  excluded_intervals: number;
  raw_rows: number;
  accepted_rows: number;
  quarantined_conflict_rows: number;
}

export interface ConflictRow {
  source_row: number;
  rate: number | null;
  rate_raw: string;
}

export interface EnvConflictMeasurement {
  timestamp: string;
  rows: ConflictRow[];
  unit: string;
  quality_status: "DUPLICATE_CONFLICT";
}

export interface EnvEvidence {
  schema_version: string;
  evidence_id: string;
  case: "environment";
  kind: "ENV_OBSERVATION" | "DATA_QUALITY";
  title: string;
  source: EvidenceSource;
  context: {
    instrument_id: string;
    location: string;
    date: string;
    participant_id: null;
    linked_health_participant: null;
  };
  measurement: EnvSummaryMeasurement | EnvConflictMeasurement;
  comparison: {
    method: string;
    rule_version: string;
    max_gap_seconds?: number;
    formulas: Record<string, string>;
  };
  evidence_strength: string;
  limitations: string[];
  review: Review | null;
}

export type Evidence = HealthEvidence | EnvEvidence;

export interface HealthOverview {
  participant_id: string;
  visit: string;
  visit_label: string;
  cards: HealthEvidence[];
  to_review: string[];
  participant_review_counts: Record<ReviewStatus, number>;
  dataset: {
    id: string;
    title: string;
    sha256: string;
    samples: number;
    participants: number;
    visits: string[];
    nonmissing_values: number;
  };
}

export interface FullCmpAnalyte {
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
  range_status: RangeStatus;
  needs_review: boolean;
  evidence_id: string | null;
}

export interface FullCmpPanelResponse {
  participant_id: string;
  visit: string;
  visit_label: string;
  dataset_id: string;
  file_name: string;
  sha256: string;
  analytes: FullCmpAnalyte[];
  excluded_note: string;
}

export interface TrendPoint {
  evidence_id: string;
  sample_id: string;
  visit: string;
  visit_label: string;
  phase: "PREFLIGHT" | "POSTFLIGHT";
  visit_order: number;
  relative_day: number;
  value: number | null;
  range_low: number | null;
  range_high: number | null;
  range_status: RangeStatus;
  needs_review: boolean;
  source_row: number;
}

export interface CohortVisitPoint {
  visit: string;
  visit_label: string;
  C001: number | null;
  C002: number | null;
  C003: number | null;
  C004: number | null;
}

export interface HealthTrend {
  participant_id: string;
  marker: string;
  marker_name: string;
  unit: string;
  points: TrendPoint[];
  cohort_by_visit?: CohortVisitPoint[];
  baseline: {
    value: number | null;
    n: number;
    available: boolean;
    method: string;
    visits: string[];
  };
  bounds_consistent: boolean;
  range_low: number | null;
  range_high: number | null;
  x_axis_note: string;
  rule_version: string;
}

export interface ConflictGroup {
  timestamp: string;
  rows: ConflictRow[];
  evidence_id: string;
  t: number;
  review: Review | null;
}

export interface RadiationPoint {
  t: number;
  ts: string;
  rate: number;
  cumulative: number;
  source_row: number;
}

export interface RadiationSegment {
  index: number;
  start: string;
  end: string;
  points: RadiationPoint[];
}

export interface EnvironmentView {
  dataset: EvidenceSource;
  case_banner: string;
  unit: string;
  quality: {
    raw_rows: number;
    accepted_rows: number;
    excluded_rows: number;
    quarantined_conflict_rows: number;
    status_counts: Record<string, number>;
    unique_timestamps: number;
    first_timestamp: string;
    last_timestamp: string;
    observed_max_interval_seconds: number;
    observed_median_interval_seconds: number;
    documented_nominal_cadence_seconds: number;
    timestamp_semantics: string;
    conflict_groups: ConflictGroup[];
  };
  integration: {
    method: string;
    rule_version: string;
    max_gap_seconds: number;
    covered_seconds: number;
    span_seconds: number;
    coverage_ratio: number | null;
    estimated_sensor_dose_uGy: number;
    label: string;
    included_intervals: number;
    excluded_intervals: {
      start_epoch: number;
      end_epoch: number;
      seconds: number;
      reason: string;
      start: string;
      end: string;
      start_t: number;
      end_t: number;
    }[];
  };
  segments: RadiationSegment[];
  excluded_events: { t: number; ts: string; status: string; source_row: number }[];
  rows: { source_row: number; ts: string; rate_raw: string; rate: number | null; status: string; detail: string | null }[];
  summary_evidence_id: string;
  summary_review: Review | null;
  limitations: string[];
}

export interface ReplayCard {
  evidence_id: string;
  marker: string;
  marker_name: string;
  value: number | null;
  unit: string;
  range_low: number | null;
  range_high: number | null;
  range_status: RangeStatus;
  needs_review: boolean;
  baseline_so_far: number | null;
  n_so_far: number;
  delta: number | null;
  percent_delta: number | null;
  source_row: number;
}

export interface ReplayEvent {
  kind: "sample" | "flag" | "baseline";
  text: string;
  marker?: string;
  evidence_id?: string;
}

export interface ReplayFrame {
  visit: string;
  visit_label: string;
  phase: "PREFLIGHT" | "POSTFLIGHT";
  visit_order: number;
  baseline_context: string;
  baseline_visits: string[];
  cards: ReplayCard[];
  events: ReplayEvent[];
}

export interface HealthReplay {
  participant_id: string;
  mode: "HISTORICAL_REPLAY";
  label: string;
  baseline_method: string;
  rule_version: string;
  frames: ReplayFrame[];
}

export interface StreamReading {
  kind: "reading";
  t: number;
  ts: string;
  rate: number;
  cumulative: number;
  source_row: number;
  segment: number;
  segment_start: boolean;
  covered_seconds: number;
}

export interface StreamExcluded {
  kind: "excluded";
  t: number;
  ts: string;
  evidence_id: string;
  rows: ConflictRow[];
  reason: string;
}

export type StreamEvent = StreamReading | StreamExcluded;

export interface Explanation {
  mode: "VERIFIED_EXPLANATION";
  label: string;
  question_id: QuestionId | null;
  question: string;
  evidence_id: string;
  paragraphs: string[];
  facts: { label: string; value: string }[];
  source_ids: string[];
  generated_by: string;
}

export interface DatasetInfo {
  id: string;
  kind: string;
  title: string;
  provider: string;
  source_url: string;
  download_url: string;
  file_name: string;
  fetched_at: string | null;
  imported_at: string;
  sha256: string;
  byte_count: number;
  license_note: string;
  citation: string;
  schema_version: string;
  parser_version: string;
  provenance?: string;
  quality: Record<string, unknown>;
}

export interface ReviewList {
  items: Review[];
  total: number;
  page: number;
  page_size: number;
}

export interface ExportPacket {
  generated_at: string;
  app: { version: string; git_version: string };
  datasets: { id: string; title: string; sha256: string; provenance?: string }[];
  health: { reviews: ReviewDetail[] };
  environment: { reviews: ReviewDetail[] };
}

export interface BriefBaseline {
  context: string;
  value: number | null;
  n: number;
  available: boolean;
  includes_selected_sample: boolean;
  samples_used: { visit: string; sample_id: string; value: number | null; source_row: number }[];
}

export interface BriefItem {
  evidence_id: string;
  marker: string;
  marker_name: string;
  value: number | null;
  unit: string;
  range_low: number | null;
  range_high: number | null;
  status: RangeStatus;
  needs_review: boolean;
  baseline: BriefBaseline;
  delta: number | null;
  percent_delta: number | null;
  source: {
    dataset_id: string;
    file_name: string;
    sha256: string;
    provenance: string;
    source_row: number;
    file_line: number;
    source_column: string;
    raw_value: string | null;
  };
  explanation: {
    observed: string;
    compared_with: string;
    why_flagged: string | null;
    limitations: string[];
    next_review_action: string;
  };
  review: {
    id: string | null;
    status: ReviewStatus | null;
    version: number | null;
    note_present: boolean;
    updated_at: string | null;
  };
  actions: {
    inspect_evidence: string;
    create_or_open_review: {
      finding_id: string;
      review_id: string | null;
      method: string;
      endpoint: string;
    };
    export_packet: { html: string; json: string };
  };
}

export interface MissionBrief {
  schema_version: string;
  brief_id: string;
  mode: "HISTORICAL_RESEARCH";
  title: string;
  generated_at: string;
  rule_versions: Record<string, string>;
  dataset: {
    dataset_id: string;
    title: string;
    provider: string;
    file_name: string;
    sha256: string;
    provenance: string;
    source_url: string;
    imported_at: string;
    research_case: string;
  };
  context: {
    participant_id: string;
    sample_id: string;
    visit: string;
    visit_label: string;
    phase: string;
    relative_day: number;
    relative_day_reference: string;
  };
  coverage: {
    markers_considered: string[];
    considered_count: number;
    measured_count: number;
    missing_markers: string[];
    with_both_bounds: number;
    one_sided_bounds: number;
    without_bounds: number;
    note: string;
  };
  summary: {
    measured_marker_count: number;
    outside_supplied_range_count: number;
    text: string;
  };
  findings: BriefItem[];
  other_measurements: BriefItem[];
  missing_measurements: BriefItem[];
  quality: {
    provenance: string;
    validation_status: string;
    parser_version: string;
    parse_issues: number;
    warnings: string[];
  };
  dataset_limitations: string[];
  case_separation: string;
  available_questions: { id: QuestionId; label: string }[];
}
