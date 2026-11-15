import { useState } from "react";
import { api } from "../api/client";
import { useDrawer } from "../app/providers";
import { fmt, RANGE_TEXT, rangeText } from "../lib/format";
import { useAsync } from "../lib/useAsync";
import { ErrorState, Skeleton } from "./StatusViews";

const CATEGORIES = ["All", "Electrolytes & Renal", "Hepatic & Protein", "Metabolic"] as const;

/**
 * Extended 17-Analyte Comprehensive Metabolic Panel (CMP) Explorer for OSD-575.
 * Lets reviewers inspect every non-race-based analyte in the source CSV file for the active participant & visit.
 */
export function FullCmpPanel({ participant, visit }: { participant: string; visit: string }) {
  const { open } = useDrawer();
  const [cat, setCat] = useState<(typeof CATEGORIES)[number]>("All");
  const panel = useAsync(() => api.fullPanel(participant, visit), [participant, visit]);

  const filtered =
    panel.data?.analytes.filter((a) => cat === "All" || a.category === cat) ?? [];

  return (
    <section className="card stack" aria-labelledby="full-cmp-title">
      <div className="card-head">
        <div>
          <p className="card-kicker">Full CSV Source Inspection · OSD-575 LSDS-8</p>
          <h2 id="full-cmp-title">
            Extended 17-Analyte Comprehensive Metabolic Panel ({participant} · {visit})
          </h2>
          <p>
            Beyond the 5 primary markers above, the verified NASA OSD-575 CSV records 12 additional
            hepatic, protein and renal analytes per blood draw.
          </p>
        </div>
        <div className="seg-group" role="group" aria-label="Filter analytes by physiological system">
          {CATEGORIES.map((c) => (
            <button
              key={c}
              type="button"
              className={`seg-btn ${cat === c ? "active" : ""}`}
              onClick={() => setCat(c)}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {panel.error ? <ErrorState error={panel.error} onRetry={panel.reload} /> : null}
      {!panel.data && panel.loading ? (
        <Skeleton height={220} label="Loading full CMP panel…" />
      ) : null}

      {panel.data ? (
        <>
          <div className="table-wrap">
            <table className="data">
              <caption>
                {filtered.length} analytes from {panel.data.file_name} (data row{" "}
                {filtered[0]?.source_row ?? "—"})
              </caption>
              <thead>
                <tr>
                  <th scope="col">Analyte</th>
                  <th scope="col">System</th>
                  <th scope="col" className="num">
                    Recorded value
                  </th>
                  <th scope="col" className="num">
                    Supplied range
                  </th>
                  <th scope="col">Range evaluation</th>
                  <th scope="col">Source action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((a) => (
                  <tr
                    key={a.stem}
                    className={a.needs_review ? "row-selected" : undefined}
                  >
                    <td>
                      <strong>{a.name}</strong>
                      {a.core ? (
                        <span className="meta" style={{ marginLeft: 8 }}>
                          · Primary 5
                        </span>
                      ) : null}
                    </td>
                    <td className="small muted">{a.category}</td>
                    <td className="num tabular">
                      {a.value === null ? (
                        <span className="muted">NA (missing in CSV)</span>
                      ) : (
                        `${fmt(a.value)} ${a.unit}`
                      )}
                    </td>
                    <td className="num tabular">{rangeText(a.range_low, a.range_high, a.unit)}</td>
                    <td className={a.needs_review ? "status-review" : "small muted"}>
                      {a.needs_review ? `▲ ${RANGE_TEXT[a.range_status]}` : RANGE_TEXT[a.range_status]}
                    </td>
                    <td>
                      {a.evidence_id ? (
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => open({ kind: "evidence", id: a.evidence_id! })}
                        >
                          Inspect evidence
                        </button>
                      ) : (
                        <span className="meta">Row {a.source_row} · Extended CMP</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="chart-note">{panel.data.excluded_note}</p>
        </>
      ) : null}
    </section>
  );
}
