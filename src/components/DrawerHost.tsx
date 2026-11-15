import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiError } from "../api/client";
import type { EnvEvidence, HealthEvidence } from "../api/contracts";
import { useDrawer, useServiceStatus } from "../app/providers";
import { localDateTime, REVIEW_LABEL } from "../lib/format";
import { useAsync } from "../lib/useAsync";
import { Assistant } from "./Assistant";
import { Drawer } from "./Drawer";
import { EnvEvidencePanel, HealthEvidencePanel } from "./EvidencePanel";
import { IconArrow, IconDownload } from "./icons";
import { ReviewForm } from "./ReviewForm";
import { Alert, ErrorState, Skeleton } from "./StatusViews";

export function DrawerHost() {
  const { target, close } = useDrawer();
  if (!target) return null;
  if (target.kind === "evidence") {
    return <EvidenceDrawer id={target.id} section={target.section} onClose={close} />;
  }
  if (target.kind === "sources") {
    return <SourcesDrawer onClose={close} />;
  }
  if (target.kind === "brief-pdf") {
    return <ProjectBriefPdfDrawer onClose={close} />;
  }
  return <ReviewDrawer id={target.id} onClose={close} />;
}

function EvidenceDrawer({
  id,
  section,
  onClose,
}: {
  id: string;
  section?: "explain" | "review";
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const { dataVersion } = useDrawer();
  const { data: ev, error, loading, reload } = useAsync(
    () => api.evidence(id),
    [id, dataVersion]
  );

  const form = ev ? (
    <ReviewForm key={ev.evidence_id} findingId={ev.evidence_id} review={ev.review} autoFocus={section === "review"} />
  ) : null;

  return (
    <Drawer
      title={ev?.title ?? "Evidence & Provenance"}
      subtitle={
        ev
          ? ev.case === "health"
            ? "Health case · NASA OSD-575 Inspiration4"
            : "Environment case · NASA RadLab DosTel1 (separate study)"
          : undefined
      }
      onClose={onClose}
    >
      {error ? <ErrorState error={error} onRetry={reload} /> : null}
      {!ev && loading ? <Skeleton height={360} label="Loading evidence…" /> : null}
      {ev ? (
        <>
          <Assistant evidenceId={ev.evidence_id} />
          {ev.case === "health" ? (
            <>
              <HealthEvidencePanel ev={ev as HealthEvidence} followUp={form} />
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  const h = ev as HealthEvidence;
                  onClose();
                  navigate(
                    `/health?participant=${h.context.participant_id}&sample=${encodeURIComponent(
                      h.context.visit
                    )}&marker=${h.measurement.marker}`
                  );
                }}
              >
                Compare with other visits in Health Trends
                <IconArrow />
              </button>
            </>
          ) : (
            <EnvEvidencePanel ev={ev as EnvEvidence} followUp={form} />
          )}
        </>
      ) : null}
    </Drawer>
  );
}

function SourcesDrawer({ onClose }: { onClose: () => void }) {
  const { dataVersion, notifyChanged, open } = useDrawer();
  const { refresh } = useServiceStatus();
  const { data, error, loading, reload } = useAsync(() => api.datasets(), [dataVersion]);
  const fileRef = useRef<HTMLInputElement>(null);
  const [importMsg, setImportMsg] = useState<{
    tone: "success" | "error" | "info";
    text: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);

  async function onImport(file: File | undefined) {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      setImportMsg({ tone: "error", text: "The file exceeds the 10 MB import limit." });
      return;
    }
    setBusy(true);
    setImportMsg(null);
    try {
      const res = await api.importCsv(file);
      setImportMsg({
        tone: res.status === "ALREADY_IMPORTED" ? "info" : "success",
        text:
          res.status === "ALREADY_IMPORTED"
            ? `This exact file (SHA-256 ${res.sha256.slice(0, 12)}…) is already imported. Nothing changed.`
            : `Imported ${res.dataset_id}.`,
      });
      notifyChanged();
      refresh();
    } catch (err) {
      setImportMsg({
        tone: "error",
        text:
          err instanceof ApiError
            ? `${err.message} (${err.code}) The last good data is still loaded.`
            : "Import failed. The last good data is still loaded.",
      });
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <Drawer
      title="Sources & cryptographic quality"
      subtitle="Public NASA research data, verified by SHA-256. Fetched once during setup; the app never downloads at runtime."
      onClose={onClose}
    >
      {error ? <ErrorState error={error} onRetry={reload} /> : null}
      {!data && loading ? <Skeleton height={300} label="Loading sources…" /> : null}
      {data?.map((d) => {
        const q = d.quality as Record<string, unknown>;
        return (
          <section
            key={d.id}
            className="card"
            style={{ boxShadow: "none" }}
            aria-labelledby={`ds-${d.id}`}
          >
            <h3 id={`ds-${d.id}`}>{d.title}</h3>
            <p className="small muted">
              {d.provider} ·{" "}
              {d.kind === "HEALTH_CMP" ? "Health case" : "Environment case (separate)"}
            </p>
            <dl className="kv small" style={{ marginTop: 12 }}>
              <dt>File</dt>
              <dd>
                <code>{d.file_name}</code> ({d.byte_count.toLocaleString()} bytes)
              </dd>
              <dt>SHA-256</dt>
              <dd>
                <code>{d.sha256}</code>
              </dd>
              <dt>Pinned manifest</dt>
              <dd>
                {q.matches_pinned_manifest_sha256
                  ? "Matches pinned snapshot (NASA_PINNED_VERIFIED)"
                  : "Differs from pinned snapshot — review the change"}
              </dd>
              {d.kind === "HEALTH_CMP" ? (
                <>
                  <dt>Contents</dt>
                  <dd>
                    {String(q.samples)} samples · {(q.participants as string[]).length} participants
                    · {(q.visits as string[]).length} visits · {String(q.nonmissing_values)}{" "}
                    selected values
                  </dd>
                  <dt>Parse issues</dt>
                  <dd>{(q.issues as unknown[]).length}</dd>
                  <dt>Scope</dt>
                  <dd>{String(q.excluded_columns_note)}</dd>
                </>
              ) : (
                <>
                  <dt>Rows</dt>
                  <dd>
                    {String(q.raw_rows)} raw · {String(q.accepted_rows)} accepted ·{" "}
                    {String(q.quarantined_rows)} quarantined
                  </dd>
                  <dt>Conflicts</dt>
                  <dd>
                    {(q.conflict_groups as unknown[]).length} timestamp groups with different values
                  </dd>
                  <dt>Cadence</dt>
                  <dd>
                    Documented nominal {String(q.documented_nominal_cadence_seconds)} s; observed
                    max interval {String(q.observed_max_interval_seconds)} s
                  </dd>
                  <dt>Timestamps</dt>
                  <dd>{String(q.timestamp_semantics)}</dd>
                </>
              )}
              <dt>Fetched</dt>
              <dd>{d.fetched_at ?? "not recorded"}</dd>
              <dt>Imported</dt>
              <dd>{d.imported_at}</dd>
              <dt>Licence</dt>
              <dd>{d.license_note}</dd>
              <dt>Citation</dt>
              <dd>{d.citation}</dd>
            </dl>
            <p className="small" style={{ marginTop: 8 }}>
              Source:{" "}
              <a href={d.source_url} target="_blank" rel="noreferrer noopener">
                {d.source_url}
              </a>
            </p>
          </section>
        );
      })}

      <section className="card stack" style={{ boxShadow: "none" }} aria-labelledby="brief-pdf-ref">
        <h3 id="brief-pdf-ref">Official CytoZoe One-Page Project Brief</h3>
        <p className="small muted">
          Inspect the official project specification detailing the Three System Modules, Data
          Boundaries (RadLab, OSD-575, GLDS-174, PhysioNet BIDMC), and Offline Scientific
          Safeguards.
        </p>
        <div className="btn-row">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => open({ kind: "brief-pdf" })}
          >
            View One-Page Brief PDF
          </button>
          <a
            className="btn btn-ghost btn-sm"
            href={`${import.meta.env.BASE_URL}assets/docs/CytoZoe_One_Page_Project_Brief_Updated_90d54bc2.pdf`}
            download="CytoZoe_One_Page_Project_Brief.pdf"
          >
            <IconDownload />
            Download PDF
          </a>
        </div>
      </section>

      <section className="stack" aria-labelledby="import-title">
        <h3 id="import-title">Import a documented CSV</h3>
        <p className="small muted">
          Only the OSD-575 CMP and RadLab DosTel1 schemas are accepted (≤ 10 MB). Identical files
          are ignored; different bytes for a loaded dataset are refused and the current data is
          kept.
        </p>
        <div>
          <label className="btn btn-secondary" aria-disabled={busy}>
            {busy ? "Importing…" : "Choose CSV file…"}
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              className="sr-only"
              disabled={busy}
              onChange={(e) => onImport(e.target.files?.[0])}
            />
          </label>
        </div>
        {importMsg ? <Alert tone={importMsg.tone}>{importMsg.text}</Alert> : null}
      </section>
    </Drawer>
  );
}

function ProjectBriefPdfDrawer({ onClose }: { onClose: () => void }) {
  return (
    <Drawer
      title="CytoZoe One-Page Project Brief"
      subtitle="Offline-First Astronaut Health & Environmental Intelligence specification"
      onClose={onClose}
    >
      <div className="stack" style={{ gap: 16 }}>
        <div className="btn-row">
          <a
            className="btn btn-primary btn-sm"
            href={`${import.meta.env.BASE_URL}assets/docs/CytoZoe_One_Page_Project_Brief_Updated_90d54bc2.pdf`}
            download="CytoZoe_One_Page_Project_Brief.pdf"
          >
            <IconDownload />
            Download Official PDF Brief
          </a>
        </div>
        <iframe
          src={`${import.meta.env.BASE_URL}assets/docs/CytoZoe_One_Page_Project_Brief_Updated_90d54bc2.pdf`}
          title="CytoZoe One-Page Project Brief PDF"
          style={{
            width: "100%",
            height: "72vh",
            border: "1px solid var(--border)",
            borderRadius: "12px",
            background: "#fff",
          }}
        />
      </div>
    </Drawer>
  );
}

function ReviewDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  const { dataVersion, open } = useDrawer();
  const { data: r, error, loading, reload } = useAsync(
    () => api.review(id),
    [id, dataVersion]
  );
  return (
    <Drawer
      title={r?.title ?? "Review"}
      subtitle={
        r
          ? r.case === "health"
            ? `Health case · participant ${r.participant_id}`
            : "Environment case · DosTel1 · no participant"
          : undefined
      }
      onClose={onClose}
    >
      {error ? <ErrorState error={error} onRetry={reload} /> : null}
      {!r && loading ? <Skeleton height={300} label="Loading review…" /> : null}
      {r ? (
        <>
          <section className="stack" aria-labelledby="rv-current">
            <h3 id="rv-current">Current record</h3>
            <dl className="kv small">
              <dt>Status</dt>
              <dd>{REVIEW_LABEL[r.status]}</dd>
              <dt>Follow-up date</dt>
              <dd>{r.follow_up_date ?? "—"}</dd>
              <dt>Updated</dt>
              <dd>
                {localDateTime(r.updated_at)} · version {r.version}
              </dd>
              <dt>Evidence</dt>
              <dd>
                <code>{r.finding_id}</code>
              </dd>
              <dt>Frozen with</dt>
              <dd>
                {r.rule_version} · SHA-256 {r.dataset_sha256.slice(0, 16)}…
              </dd>
            </dl>
            <div className="note-text">{r.note}</div>
            <div>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => open({ kind: "evidence", id: r.finding_id })}
              >
                Open evidence and explanation
                <IconArrow />
              </button>
            </div>
          </section>

          <section className="stack" aria-labelledby="rv-edit">
            <h3 id="rv-edit">Update review</h3>
            <ReviewForm key={r.id} findingId={r.finding_id} review={r} />
          </section>

          <section className="stack" aria-labelledby="rv-hist">
            <h3 id="rv-hist">History</h3>
            <p className="small muted">
              Local audit trail on this computer — not a tamper-proof compliance record.
            </p>
            <ol className="history">
              {r.events.map((e) => (
                <li key={e.id}>
                  <strong>
                    {e.action === "CREATED"
                      ? "Created"
                      : e.action === "STATUS_CHANGED"
                      ? "Status changed"
                      : "Updated"}
                  </strong>
                  {" · "}
                  {localDateTime(e.timestamp)}
                  <div className="small muted">
                    {e.before ? `${REVIEW_LABEL[e.before.status!]} → ` : ""}
                    {REVIEW_LABEL[e.after.status]} · version {e.after.version}
                    {e.before && e.before.note !== e.after.note ? " · note edited" : ""}
                  </div>
                </li>
              ))}
            </ol>
          </section>
        </>
      ) : null}
    </Drawer>
  );
}
