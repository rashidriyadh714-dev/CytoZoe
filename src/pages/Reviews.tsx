import { useId } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../api/client";
import type { ReviewStatus } from "../api/contracts";
import { useDrawer } from "../app/providers";
import { IconDownload } from "../components/icons";
import { PageHeader } from "../components/PageHeader";
import { Empty, ErrorState, Skeleton } from "../components/StatusViews";
import { localDateTime, REVIEW_LABEL } from "../lib/format";
import { useAsync } from "../lib/useAsync";

const CASES = ["health", "environment"] as const;

export default function Reviews() {
  const [params, setParams] = useSearchParams();
  const { open, dataVersion } = useDrawer();
  const ids = { c: useId(), s: useId(), p: useId() };

  const caseF = CASES.includes(params.get("case") as (typeof CASES)[number])
    ? params.get("case")!
    : "";
  const statusF =
    params.get("status") && params.get("status")! in REVIEW_LABEL
      ? params.get("status")!
      : "";
  const participantF = caseF === "health" ? params.get("participant") ?? "" : "";

  const list = useAsync(
    () => api.reviews({ case: caseF, status: statusF, participant: participantF }),
    [caseF, statusF, participantF, dataVersion]
  );
  const participants = useAsync(() => api.participants(), []);
  const preview = useAsync(() => api.exportPreview(), [dataVersion]);

  const set = (k: string, v: string) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    if (k === "case" && v !== "health") next.delete("participant");
    setParams(next);
  };

  const healthCount = preview.data?.health.reviews.length ?? 0;
  const envCount = preview.data?.environment.reviews.length ?? 0;
  const total = healthCount + envCount;

  return (
    <>
      <PageHeader
        eyebrow="04 · Offline Audit Review Log & Export"
        title="Review Log"
        purpose="What did we decide to follow up? Every saved review with its status and history, and a local evidence packet you can download."
      />

      <div className="split">
        <section className="card" aria-labelledby="log-title">
          <div className="card-head">
            <div>
              <h2 id="log-title">Saved reviews</h2>
              <p>
                Stored in the local SQLite database on this computer. Select a row to open its
                note and audit history.
              </p>
            </div>
          </div>

          <div
            className="filters"
            role="group"
            aria-label="Filter reviews"
            style={{ marginBottom: 16 }}
          >
            <div className="field">
              <label className="field-label" htmlFor={ids.c}>
                Case
              </label>
              <select
                id={ids.c}
                className="select"
                value={caseF}
                onChange={(e) => set("case", e.target.value)}
              >
                <option value="">All cases</option>
                <option value="health">Health (OSD-575)</option>
                <option value="environment">Environment (DosTel1)</option>
              </select>
            </div>

            <div className="field">
              <label className="field-label" htmlFor={ids.s}>
                Status
              </label>
              <select
                id={ids.s}
                className="select"
                value={statusF}
                onChange={(e) => set("status", e.target.value)}
              >
                <option value="">All statuses</option>
                {(Object.keys(REVIEW_LABEL) as ReviewStatus[]).map((s) => (
                  <option key={s} value={s}>
                    {REVIEW_LABEL[s]}
                  </option>
                ))}
              </select>
            </div>

            {caseF === "health" ? (
              <div className="field">
                <label className="field-label" htmlFor={ids.p}>
                  Participant
                </label>
                <select
                  id={ids.p}
                  className="select"
                  value={participantF}
                  onChange={(e) => set("participant", e.target.value)}
                >
                  <option value="">All participants</option>
                  {participants.data?.map((p) => (
                    <option key={p.participant_id} value={p.participant_id}>
                      {p.participant_id}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <p className="field-hint" style={{ alignSelf: "center" }}>
                Choose the Health case to filter by participant.
              </p>
            )}
          </div>

          {list.error ? <ErrorState error={list.error} onRetry={list.reload} /> : null}
          {!list.data && list.loading ? (
            <Skeleton height={220} label="Loading reviews…" />
          ) : null}
          {list.data && list.data.items.length === 0 ? (
            <Empty>
              {caseF || statusF || participantF
                ? "No reviews match these filters."
                : "No reviews saved yet. Inspect a result on Health Overview or Radiation Review and record a follow-up."}
            </Empty>
          ) : null}

          {list.data && list.data.items.length > 0 ? (
            <div className="table-wrap" aria-busy={list.loading}>
              <table className="data">
                <caption>
                  {list.data.total} review{list.data.total === 1 ? "" : "s"}, most recently
                  updated first
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Finding</th>
                    <th scope="col">Case</th>
                    <th scope="col">Participant / instrument</th>
                    <th scope="col">Status</th>
                    <th scope="col">Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {list.data.items.map((r) => (
                    <tr
                      key={r.id}
                      className="row-click"
                      onClick={() => open({ kind: "review", id: r.id })}
                    >
                      <td>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          style={{ paddingLeft: 0 }}
                          onClick={(e) => {
                            e.stopPropagation();
                            open({ kind: "review", id: r.id });
                          }}
                        >
                          {r.title}
                        </button>
                      </td>
                      <td>{r.case === "health" ? "Health" : "Environment"}</td>
                      <td>{r.participant_id ?? `${r.instrument_id} (no participant)`}</td>
                      <td>
                        <span
                          className={
                            r.status === "REVIEWED"
                              ? "status-text-saved"
                              : r.status === "FOLLOW_UP_REQUESTED"
                              ? "status-review"
                              : "meta"
                          }
                        >
                          {REVIEW_LABEL[r.status]}
                        </span>
                      </td>
                      <td className="tabular">{localDateTime(r.updated_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>

        <section className="card stack" aria-labelledby="export-title">
          <div>
            <h2 id="export-title">Export review packet</h2>
            <p className="small muted">
              A local download for handoff — nothing is transmitted. Preview of what is included:
            </p>
          </div>
          {preview.error ? (
            <ErrorState error={preview.error} onRetry={preview.reload} />
          ) : null}
          {!preview.data && preview.loading ? (
            <Skeleton height={160} label="Preparing preview…" />
          ) : null}
          {preview.data ? (
            <>
              <ul className="export-list">
                <li>
                  <strong>Health section:</strong> <span className="tabular">{healthCount}</span>{" "}
                  review{healthCount === 1 ? "" : "s"} with frozen evidence, notes and history
                </li>
                <li>
                  <strong>Environment section (separate):</strong>{" "}
                  <span className="tabular">{envCount}</span> review{envCount === 1 ? "" : "s"}
                </li>
                <li>
                  <strong>Sources:</strong>{" "}
                  {preview.data.datasets
                    .map((d) => `${d.id} (SHA-256 ${d.sha256.slice(0, 10)}…)`)
                    .join("; ")}
                </li>
                <li>
                  <strong>Provenance:</strong> app {preview.data.app.version}, build{" "}
                  {preview.data.app.git_version}, rule versions, limitations
                </li>
              </ul>
              {total === 0 ? (
                <p className="small muted">
                  No reviews yet — the packet would contain sources and limitations only.
                </p>
              ) : null}
              <div className="btn-row">
                <a className="btn btn-primary" href="/api/export?format=html" download>
                  <IconDownload />
                  Download HTML
                </a>
                <a className="btn btn-secondary" href="/api/export?format=json" download>
                  <IconDownload />
                  Download JSON
                </a>
              </div>
              <p className="meta">
                HTML is self-contained and printable. All note text is escaped.
              </p>
            </>
          ) : null}
        </section>
      </div>
    </>
  );
}
