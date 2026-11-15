/**
 * SQLite Database Initialization, Schema Migrations & Automatic Verified NASA Data Seeding
 * Uses Node 22 built-in `node:sqlite` (DatabaseSync) for zero-dependency, rock-solid persistence.
 */
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import * as quality from "../engines/quality";

export const APP_VERSION = "3.2.0";
export const GIT_VERSION = "nasa-space-apps-2026-masterpiece";
export const DB_SCHEMA_VERSION = 2;

const ROOT = process.cwd();
const RUNTIME_DIR = path.resolve(ROOT, "runtime");
const DB_PATH = process.env.CYTOZOE_DB_PATH
  ? path.resolve(process.env.CYTOZOE_DB_PATH)
  : path.resolve(RUNTIME_DIR, "cytozoe.db");
const MANIFEST_PATH = path.resolve(ROOT, "data/manifests/sources.json");
const RAW_DIR = path.resolve(ROOT, "data/raw");

let dbInstance: DatabaseSync | null = null;

export function utcNow(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

export interface ManifestEntry {
  id: string;
  fetch_key: string;
  kind: "HEALTH_CMP" | "ENV_RADIATION";
  title: string;
  provider: string;
  study_id: string;
  study_url: string;
  download_url: string;
  file_name: string;
  expected_sha256: string;
  expected_bytes: number;
  accepted_sha256: string[];
  license_note: string;
  citation: string;
}

export function loadManifest(): { manifest_version: string; datasets: ManifestEntry[] } {
  return JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf-8"));
}

export function acceptedHashes(entry: ManifestEntry): Set<string> {
  return new Set([entry.expected_sha256, ...(entry.accepted_sha256 ?? [])]);
}

export function getDb(): DatabaseSync {
  if (dbInstance) return dbInstance;
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const db = new DatabaseSync(DB_PATH);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  runMigrations(db);
  dbInstance = db;
  autoSeedVerifiedNasaDatasets(db);
  reconcileProvenance(db);
  return db;
}

function runMigrations(db: DatabaseSync): void {
  const versionRow = db.prepare("PRAGMA user_version").get() as { user_version: number } | undefined;
  const currentVersion = versionRow?.user_version ?? 0;

  if (currentVersion < 1) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS datasets (
        id              TEXT PRIMARY KEY,
        kind            TEXT NOT NULL CHECK (kind IN ('HEALTH_CMP', 'ENV_RADIATION')),
        title           TEXT NOT NULL,
        provider        TEXT NOT NULL,
        source_url      TEXT NOT NULL,
        download_url    TEXT NOT NULL,
        file_name       TEXT NOT NULL,
        fetched_at      TEXT,
        imported_at     TEXT NOT NULL,
        sha256          TEXT NOT NULL,
        byte_count      INTEGER NOT NULL,
        license_note    TEXT NOT NULL,
        citation        TEXT NOT NULL,
        schema_version  TEXT NOT NULL,
        parser_version  TEXT NOT NULL,
        quality_json    TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS import_runs (
        id          TEXT PRIMARY KEY,
        dataset_id  TEXT,
        sha256      TEXT NOT NULL,
        status      TEXT NOT NULL,
        report_json TEXT NOT NULL,
        created_at  TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS health_observations (
        id             TEXT PRIMARY KEY,
        dataset_id     TEXT NOT NULL REFERENCES datasets(id),
        source_row     INTEGER NOT NULL,
        participant_id TEXT NOT NULL,
        sample_id      TEXT NOT NULL,
        visit          TEXT NOT NULL,
        phase          TEXT NOT NULL CHECK (phase IN ('PREFLIGHT', 'POSTFLIGHT')),
        relative_day   INTEGER NOT NULL,
        visit_order    INTEGER NOT NULL,
        marker         TEXT NOT NULL,
        value          REAL,
        value_raw      TEXT NOT NULL,
        unit           TEXT NOT NULL,
        source_unit    TEXT NOT NULL,
        source_column  TEXT NOT NULL,
        range_low      REAL,
        range_high     REAL,
        UNIQUE (dataset_id, sample_id, marker)
      );

      CREATE INDEX IF NOT EXISTS idx_health_participant ON health_observations (participant_id, marker);

      CREATE TABLE IF NOT EXISTS radiation_observations (
        id               TEXT PRIMARY KEY,
        dataset_id       TEXT NOT NULL REFERENCES datasets(id),
        source_row       INTEGER NOT NULL,
        instrument_id    TEXT NOT NULL,
        source_timestamp TEXT NOT NULL,
        rate             REAL,
        rate_raw         TEXT NOT NULL,
        unit             TEXT NOT NULL,
        quality_status   TEXT NOT NULL CHECK (quality_status IN
          ('ACCEPTED', 'DUPLICATE_CONFLICT', 'DUPLICATE_IDENTICAL', 'INVALID_TIMESTAMP', 'INVALID_RATE', 'MISSING_VALUE')),
        quality_detail   TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_radiation_dataset ON radiation_observations (dataset_id, source_row);

      CREATE TABLE IF NOT EXISTS findings (
        id             TEXT PRIMARY KEY,
        kind           TEXT NOT NULL CHECK (kind IN ('HEALTH_OBSERVATION', 'ENV_OBSERVATION', 'DATA_QUALITY')),
        observation_id TEXT,
        dataset_id     TEXT NOT NULL REFERENCES datasets(id),
        dataset_sha256 TEXT NOT NULL,
        rule_version   TEXT NOT NULL,
        evidence_json  TEXT NOT NULL,
        created_at     TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS reviews (
        id             TEXT PRIMARY KEY,
        finding_id     TEXT NOT NULL UNIQUE REFERENCES findings(id),
        case_kind      TEXT NOT NULL CHECK (case_kind IN ('health', 'environment')),
        participant_id TEXT,
        instrument_id  TEXT,
        title          TEXT NOT NULL,
        status         TEXT NOT NULL CHECK (status IN ('OPEN', 'FOLLOW_UP_REQUESTED', 'REVIEWED')),
        note           TEXT NOT NULL,
        follow_up_date TEXT,
        created_at     TEXT NOT NULL,
        updated_at     TEXT NOT NULL,
        version        INTEGER NOT NULL DEFAULT 1,
        CHECK (case_kind = 'health' OR participant_id IS NULL),
        CHECK (case_kind = 'environment' OR instrument_id IS NULL)
      );

      CREATE TABLE IF NOT EXISTS review_events (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        review_id   TEXT NOT NULL REFERENCES reviews(id),
        action      TEXT NOT NULL,
        before_json TEXT,
        after_json  TEXT NOT NULL,
        timestamp   TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_review_events ON review_events (review_id, id);
      PRAGMA user_version = 1;
    `);
  }

  const cols = db.prepare("PRAGMA table_info(datasets)").all() as Array<{ name: string }>;
  const hasProvenance = cols.some((c) => c.name === "provenance");
  if (!hasProvenance) {
    db.exec(`
      ALTER TABLE datasets ADD COLUMN provenance TEXT NOT NULL DEFAULT 'UNVERIFIED_LEGACY'
        CHECK (provenance IN ('NASA_PINNED_VERIFIED', 'RESEARCH_IMPORTED_UNVERIFIED', 'MISSION_ADAPTER_TEST', 'UNVERIFIED_LEGACY'));
      CREATE INDEX IF NOT EXISTS idx_datasets_kind_provenance ON datasets (kind, provenance);
      PRAGMA user_version = 2;
    `);
  } else if (currentVersion < 2) {
    db.exec("PRAGMA user_version = 2;");
  }
}

export function importDatasetBytes(
  db: DatabaseSync,
  raw: Buffer,
  fetchedAt: string | null = null
): {
  import_run_id: string;
  dataset_id: string;
  status: string;
  sha256: string;
  provenance: string;
  matches_pinned_manifest_sha256: boolean;
  report: Record<string, unknown>;
} {
  const runId = crypto.randomUUID();
  const sha = quality.sha256Hex(raw);
  const kind = quality.detectKind(raw);
  const manifest = loadManifest();
  const meta = manifest.datasets.find((d) => d.kind === kind);
  if (!meta) {
    throw new quality.SchemaMismatch("UNKNOWN_SCHEMA", "No manifest entry for detected dataset kind.");
  }

  const allowed = acceptedHashes(meta);
  const existing = db.prepare("SELECT sha256 FROM datasets WHERE id = ?").get(meta.id) as
    | { sha256: string }
    | undefined;

  if (existing && existing.sha256 === sha) {
    const parsed = kind === "HEALTH_CMP" ? quality.parseOsd575Cmp(raw) : quality.parseRadlab(raw);
    const payload = {
      import_run_id: runId,
      dataset_id: meta.id,
      status: "ALREADY_IMPORTED",
      sha256: sha,
      provenance: "NASA_PINNED_VERIFIED",
      matches_pinned_manifest_sha256: sha === meta.expected_sha256,
      report: parsed.report,
    };
    db.prepare(
      "INSERT INTO import_runs (id, dataset_id, sha256, status, report_json, created_at) VALUES (?,?,?,?,?,?)"
    ).run(runId, meta.id, sha, "ALREADY_IMPORTED", JSON.stringify(payload), utcNow());
    return payload;
  }

  if (!allowed.has(sha)) {
    throw new quality.SchemaMismatch(
      "SOURCE_HASH_MISMATCH",
      `File SHA-256 (${sha.slice(0, 12)}…) is not a registered verified NASA snapshot for ${meta.id}. Existing data was preserved.`,
      { dataset_id: meta.id, actual_sha256: sha, expected_sha256: meta.expected_sha256 }
    );
  }

  const parsed = kind === "HEALTH_CMP" ? quality.parseOsd575Cmp(raw) : quality.parseRadlab(raw);
  const now = utcNow();
  const qualitySummary = {
    ...parsed.report,
    matches_pinned_manifest_sha256: sha === meta.expected_sha256,
  };

  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare("DELETE FROM health_observations WHERE dataset_id = ?").run(meta.id);
    db.prepare("DELETE FROM radiation_observations WHERE dataset_id = ?").run(meta.id);

    db.prepare(
      `INSERT INTO datasets (
        id, kind, title, provider, source_url, download_url, file_name,
        fetched_at, imported_at, sha256, byte_count, license_note, citation,
        schema_version, parser_version, quality_json, provenance
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET
        fetched_at = excluded.fetched_at,
        imported_at = excluded.imported_at,
        sha256 = excluded.sha256,
        byte_count = excluded.byte_count,
        quality_json = excluded.quality_json,
        parser_version = excluded.parser_version,
        schema_version = excluded.schema_version,
        provenance = 'NASA_PINNED_VERIFIED'`
    ).run(
      meta.id,
      kind,
      meta.title,
      meta.provider,
      meta.study_url,
      meta.download_url,
      meta.file_name,
      fetchedAt,
      now,
      sha,
      raw.length,
      meta.license_note,
      meta.citation,
      quality.SCHEMA_VERSION,
      quality.PARSER_VERSION,
      JSON.stringify(qualitySummary),
      "NASA_PINNED_VERIFIED"
    );

    if (kind === "HEALTH_CMP") {
      const insertHealth = db.prepare(`
        INSERT INTO health_observations (
          id, dataset_id, source_row, participant_id, sample_id, visit, phase,
          relative_day, visit_order, marker, value, value_raw, unit, source_unit,
          source_column, range_low, range_high
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      `);
      for (const r of parsed.records as quality.HealthObservationRecord[]) {
        insertHealth.run(
          r.id,
          meta.id,
          r.source_row,
          r.participant_id,
          r.sample_id,
          r.visit,
          r.phase,
          r.relative_day,
          r.visit_order,
          r.marker,
          r.value,
          r.value_raw,
          r.unit,
          r.source_unit,
          r.source_column,
          r.range_low,
          r.range_high
        );
      }
    } else {
      const insertRad = db.prepare(`
        INSERT INTO radiation_observations (
          id, dataset_id, source_row, instrument_id, source_timestamp,
          rate, rate_raw, unit, quality_status, quality_detail
        ) VALUES (?,?,?,?,?,?,?,?,?,?)
      `);
      for (const r of parsed.records as quality.RadiationObservationRecord[]) {
        insertRad.run(
          r.id,
          meta.id,
          r.source_row,
          r.instrument_id,
          r.source_timestamp,
          r.rate,
          r.rate_raw,
          r.unit,
          r.quality_status,
          r.quality_detail
        );
      }
    }

    const status = existing ? "IMPORTED_NEW_VERSION" : "IMPORTED";
    const result = {
      import_run_id: runId,
      dataset_id: meta.id,
      status,
      sha256: sha,
      provenance: "NASA_PINNED_VERIFIED",
      matches_pinned_manifest_sha256: sha === meta.expected_sha256,
      report: parsed.report,
    };

    db.prepare(
      "INSERT INTO import_runs (id, dataset_id, sha256, status, report_json, created_at) VALUES (?,?,?,?,?,?)"
    ).run(runId, meta.id, sha, status, JSON.stringify(result), now);

    db.exec("COMMIT");
    return result;
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

function autoSeedVerifiedNasaDatasets(db: DatabaseSync): void {
  const manifest = loadManifest();
  for (const entry of manifest.datasets) {
    const row = db.prepare("SELECT id, sha256 FROM datasets WHERE id = ?").get(entry.id) as
      | { id: string; sha256: string }
      | undefined;
    if (row && acceptedHashes(entry).has(row.sha256)) {
      continue;
    }
    const rawFile = path.resolve(RAW_DIR, entry.file_name);
    if (!fs.existsSync(rawFile)) {
      continue;
    }
    const fetchMetaPath = path.resolve(RAW_DIR, `${entry.fetch_key}.fetch.json`);
    let fetchedAt: string | null = null;
    if (fs.existsSync(fetchMetaPath)) {
      try {
        const fetchMeta = JSON.parse(fs.readFileSync(fetchMetaPath, "utf-8"));
        fetchedAt = fetchMeta.fetched_at ?? null;
      } catch {
        fetchedAt = null;
      }
    }
    const rawBytes = fs.readFileSync(rawFile);
    importDatasetBytes(db, rawBytes, fetchedAt);
  }
}

export function reconcileProvenance(db: DatabaseSync): void {
  const manifest = loadManifest();
  const registered = new Map(manifest.datasets.map((e) => [e.id, acceptedHashes(e)]));
  const rows = db.prepare("SELECT id, sha256, provenance FROM datasets").all() as Array<{
    id: string;
    sha256: string;
    provenance: string;
  }>;
  for (const r of rows) {
    const want = registered.get(r.id)?.has(r.sha256) ? "NASA_PINNED_VERIFIED" : "UNVERIFIED_LEGACY";
    if (r.provenance !== want) {
      db.prepare("UPDATE datasets SET provenance = ? WHERE id = ?").run(want, r.id);
    }
  }
}

export function getRawDatasetBuffer(kind: "HEALTH_CMP" | "ENV_RADIATION"): Buffer | null {
  const manifest = loadManifest();
  const entry = manifest.datasets.find((d) => d.kind === kind);
  if (!entry) return null;
  const rawFile = path.resolve(RAW_DIR, entry.file_name);
  if (!fs.existsSync(rawFile)) return null;
  return fs.readFileSync(rawFile);
}
