import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import * as quality from "./quality";
import * as health from "./health";
import * as environment from "./environment";
import * as explain from "./explain";

test("E2 health range_status strict inequality and baseline calculation", () => {
  assert.equal(health.rangeStatus(1.37, 0.6, 1.35), health.ABOVE);
  assert.equal(health.rangeStatus(1.35, 0.6, 1.35), health.WITHIN);
  assert.equal(health.rangeStatus(0.6, 0.6, 1.35), health.WITHIN);
  assert.equal(health.rangeStatus(0.59, 0.6, 1.35), health.BELOW);
  assert.equal(health.rangeStatus(null, 0.6, 1.35), health.UNKNOWN);

  const base = health.baseline([1.24, 1.1, 1.37]);
  assert.ok(base);
  assert.equal(base.n, 3);
  assert.ok(Math.abs(base.value - 1.2366666666666666) < 1e-12);

  const cmp = health.compare(1.37, base.value);
  assert.ok(cmp.delta !== null && Math.abs(cmp.delta - 0.13333333333333353) < 1e-12);
});

test("E1 & E3 real NASA OSD-575 and RadLab DosTel1 CSV verification and integration", () => {
  const manifestPath = path.resolve(process.cwd(), "data/manifests/sources.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
  const osdEntry = manifest.datasets.find((d: any) => d.id === "OSD-575-CMP");
  const radEntry = manifest.datasets.find((d: any) => d.id === "RADLAB-DOSTEL1-2022-03-01");

  const osdRaw = fs.readFileSync(path.resolve(process.cwd(), "data/raw", osdEntry.file_name));
  assert.equal(quality.sha256Hex(osdRaw), osdEntry.expected_sha256);
  const parsedOsd = quality.parseOsd575Cmp(osdRaw);
  assert.equal(parsedOsd.report.samples, 28);
  assert.equal((parsedOsd.report.participants as string[]).length, 4);
  assert.equal(parsedOsd.records.length, 140);

  const fullC001L3 = quality.parseFullOsd575Sample(osdRaw, "C001", "L-3");
  assert.equal(fullC001L3.length, 17);
  const creat = fullC001L3.find((r) => r.stem === "creatinine");
  assert.equal(creat?.value, 1.37);

  const radRaw = fs.readFileSync(path.resolve(process.cwd(), "data/raw", radEntry.file_name));
  assert.equal(quality.sha256Hex(radRaw), radEntry.expected_sha256);
  const parsedRad = quality.parseRadlab(radRaw);
  assert.equal(parsedRad.report.raw_rows, 1202);
  assert.equal(parsedRad.report.accepted_rows, 1194);
  assert.equal(parsedRad.report.quarantined_rows, 8);
  assert.equal((parsedRad.report.conflict_groups as any[]).length, 4);

  const accepted = parsedRad.records
    .filter((r) => r.quality_status === "ACCEPTED" && r.epoch !== null && r.rate !== null)
    .map((r) => ({ epoch: r.epoch!, rate: r.rate!, source_timestamp: r.source_timestamp, source_row: r.source_row }));
  const breaks = parsedRad.records
    .filter((r) => r.quality_status !== "ACCEPTED" && r.quality_status !== "DUPLICATE_IDENTICAL" && r.epoch !== null)
    .map((r) => r.epoch!);

  const integ = environment.integrate(accepted, breaks, 300);
  assert.ok(Math.abs(integ.estimated_sensor_dose_uGy - 296.03699668320695) < 1e-6);
  assert.equal(integ.excluded_intervals.length, 4);
});

test("E4 deterministic question classification", () => {
  assert.equal(explain.classifyQuestion("Did radiation cause this creatinine change?"), "CAUSATION_REQUEST");
  assert.equal(explain.classifyQuestion("Is the astronaut sick or does this diagnose kidney disease?"), "DIAGNOSIS_REQUEST");
  assert.equal(explain.classifyQuestion("How was the baseline mean calculated?"), "HOW_CALCULATED");
  assert.equal(explain.classifyQuestion("Where did this number come from in the CSV?"), "SOURCE_LOCATION");
});
