import { useEffect, useRef, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";
import type { StreamEvent, StreamExcluded, StreamReading } from "../api/contracts";
import { useDrawer } from "../app/providers";
import { clock, duration, fmt, timeOnly } from "../lib/format";
import { IconPause, IconPlay, IconRestart } from "../components/icons";

const SPEEDS = [
  { v: 60, label: "60× (1 min/s)" },
  { v: 240, label: "240× (4 min/s)" },
  { v: 960, label: "960× (16 min/s)" },
];

interface FeedItem {
  id: string;
  time: string;
  text: string;
  kind: "conflict" | "spike" | "segment";
  evidenceId?: string;
}

/**
 * Historical replay of the 1 March 2022 DosTel1 export over Server-Sent Events (/api/replay/environment).
 * Clearly labelled as a replay of a historical file — never called a live NASA feed.
 */
export function LiveRadiation({
  spanSeconds,
  conflictCount = 4,
}: {
  spanSeconds: number;
  conflictCount?: number;
}) {
  const { open } = useDrawer();
  const [status, setStatus] = useState<"idle" | "playing" | "paused" | "ended" | "error">("idle");
  const [speed, setSpeed] = useState(240);
  const [segments, setSegments] = useState<StreamReading[][]>([]);
  const [excluded, setExcluded] = useState<StreamExcluded[]>([]);
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [latest, setLatest] = useState<StreamReading | null>(null);
  const [peak, setPeak] = useState<StreamReading | null>(null);

  const esRef = useRef<EventSource | null>(null);
  const cursorRef = useRef(0);

  function closeStream() {
    esRef.current?.close();
    esRef.current = null;
  }

  useEffect(() => () => closeStream(), []);

  function start(fromStart = false) {
    closeStream();
    if (fromStart) {
      cursorRef.current = 0;
      setSegments([]);
      setExcluded([]);
      setFeed([]);
      setLatest(null);
      setPeak(null);
    }
    setStatus("playing");
    const es = new EventSource(
      `/api/replay/environment?speed=${speed}&start=${cursorRef.current}`
    );
    esRef.current = es;

    es.addEventListener("frame", (ev: MessageEvent) => {
      const { events } = JSON.parse(ev.data) as { events: StreamEvent[] };
      const readings: StreamReading[] = [];
      const ex: StreamExcluded[] = [];
      const items: FeedItem[] = [];

      for (const e of events) {
        cursorRef.current = e.t + 0.001;
        if (e.kind === "reading") {
          readings.push(e);
          if (e.rate >= 50) {
            items.push({
              id: `r-${e.source_row}`,
              time: timeOnly(e.ts),
              kind: "spike",
              text: `High-rate passage: ${fmt(e.rate, 1)} µGy/hour (row ${e.source_row}).`,
            });
          }
        } else {
          ex.push(e);
          items.push({
            id: e.evidence_id,
            time: timeOnly(e.ts),
            kind: "conflict",
            evidenceId: e.evidence_id,
            text: `Quarantined ${e.rows.length} conflicting rows at ${timeOnly(e.ts)} (${e.rows
              .map((r) => `${fmt(r.rate, 2)} µGy/h`)
              .join(" vs ")}).`,
          });
        }
      }

      if (readings.length) {
        const last = readings[readings.length - 1];
        setLatest(last);
        setPeak((prev) => {
          let best = prev;
          for (const r of readings) if (!best || r.rate > best.rate) best = r;
          return best;
        });
        setSegments((prev) => {
          const next = prev.map((s) => [...s]);
          for (const r of readings) {
            if (!next.length || r.segment_start || next[next.length - 1][0]?.segment !== r.segment) {
              next.push([r]);
            } else {
              next[next.length - 1].push(r);
            }
          }
          return next;
        });
      }
      if (ex.length) setExcluded((prev) => [...prev, ...ex]);
      if (items.length) setFeed((prev) => [...items.reverse(), ...prev].slice(0, 14));
    });

    es.addEventListener("end", () => {
      closeStream();
      setStatus("ended");
    });

    es.onerror = () => {
      closeStream();
      setStatus((s) => (s === "playing" ? "error" : s));
    };
  }

  function pause() {
    closeStream();
    setStatus("paused");
  }

  function reset() {
    closeStream();
    cursorRef.current = 0;
    setSegments([]);
    setExcluded([]);
    setFeed([]);
    setLatest(null);
    setPeak(null);
    setStatus("idle");
  }

  function onSpeed(nextSpeed: number) {
    setSpeed(nextSpeed);
    if (status === "playing") {
      window.setTimeout(() => start(false), 0);
    }
  }

  const progress = latest ? Math.min(1, latest.t / 86400) : 0;
  const coverage = latest && spanSeconds ? latest.covered_seconds / spanSeconds : 0;

  return (
    <section className="card stack" aria-labelledby="replay-rad-title">
      <div className="card-head" style={{ marginBottom: 0 }}>
        <div>
          <p className="card-kicker">Real-Time SSE Telemetry Stream</p>
          <h2 id="replay-rad-title">Replay 1 March 2022 as a live stream</h2>
          <p>
            Streams the historical DosTel1 export from the local server. Quarantined duplicate
            timestamps interrupt the trace as they occur.
          </p>
        </div>
        <span className="meta">Historical replay · not live</span>
      </div>

      <div className="player">
        <button
          type="button"
          className="play"
          onClick={() =>
            status === "playing" ? pause() : start(status === "idle" || status === "ended")
          }
          aria-label={
            status === "playing"
              ? "Pause radiation replay"
              : status === "paused"
              ? "Resume radiation replay"
              : "Play radiation replay"
          }
        >
          {status === "playing" ? <IconPause /> : <IconPlay />}
        </button>
        <div className="progress" aria-hidden="true">
          <div className="progress-track">
            <div className="progress-fill" style={{ width: `${progress * 100}%` }} />
          </div>
          <div className="progress-meta tabular">
            <span>{latest ? `${clock(latest.t, true)} source clock` : "00:00:00"}</span>
            <span>
              {excluded.length} / {conflictCount} conflict timestamps reached
            </span>
          </div>
        </div>
        <label className="sr-only" htmlFor="rad-speed">
          Replay speed
        </label>
        <select
          id="rad-speed"
          className="select"
          value={speed}
          onChange={(e) => onSpeed(Number(e.target.value))}
          style={{ minHeight: 40 }}
        >
          {SPEEDS.map((s) => (
            <option key={s.v} value={s.v}>
              {s.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={reset}
          disabled={status === "idle"}
        >
          <IconRestart />
          Reset
        </button>
      </div>

      <p className="sr-only" role="status">
        {status === "playing"
          ? "Replay playing"
          : status === "paused"
          ? "Replay paused"
          : status === "ended"
          ? "Replay finished"
          : ""}
      </p>
      {status === "error" ? (
        <div className="alert alert-error" role="alert">
          The replay stream was interrupted. Check that the local service is running, then press
          play to resume.
        </div>
      ) : null}

      <div className="live-stats">
        <div className="stat">
          <div className="stat-label">Source clock</div>
          <div className="stat-value tabular">{latest ? clock(latest.t, true) : "—"}</div>
        </div>
        <div className="stat">
          <div className="stat-label">Current rate</div>
          <div className="stat-value tabular">
            {latest ? fmt(latest.rate, 2) : "—"} <small>µGy/h</small>
          </div>
        </div>
        <div className="stat">
          <div className="stat-label">Peak so far</div>
          <div className="stat-value tabular">
            {peak ? fmt(peak.rate, 1) : "—"}{" "}
            <small>{peak ? `at ${clock(peak.t)}` : "µGy/h"}</small>
          </div>
        </div>
        <div className="stat">
          <div className="stat-label">Est. sensor dose so far</div>
          <div className="stat-value tabular">
            {latest ? fmt(latest.cumulative, 2) : "—"} <small>µGy</small>
          </div>
        </div>
      </div>

      <div className="split" style={{ gap: 16 }}>
        <div>
          <div
            className="chart-box live"
            role="img"
            aria-label="Absorbed dose rate as the replay progresses. Exact values are in the static charts and tables below."
          >
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                margin={{ top: 8, right: 12, bottom: 4, left: 0 }}
                accessibilityLayer={false}
              >
                <CartesianGrid stroke="#E2E8F0" vertical={false} />
                <XAxis
                  type="number"
                  dataKey="t"
                  domain={[0, 86400]}
                  ticks={[0, 21600, 43200, 64800, 86400]}
                  tickFormatter={(v: number) => clock(v)}
                  tick={{ fill: "#475569", fontSize: 12 }}
                  tickLine={false}
                  axisLine={{ stroke: "#CBD5E1" }}
                  allowDuplicatedCategory={false}
                />
                <YAxis
                  scale="log"
                  domain={[1, 1000]}
                  allowDataOverflow
                  ticks={[1, 10, 100, 1000]}
                  width={48}
                  tick={{ fill: "#475569", fontSize: 12 }}
                  tickLine={false}
                  axisLine={false}
                />
                {excluded.map((e) => (
                  <ReferenceLine key={e.ts} x={e.t} stroke="#B91C1C" strokeDasharray="3 3" />
                ))}
                {segments.map((s) => (
                  <Line
                    key={s[0].segment}
                    data={s}
                    dataKey="rate"
                    stroke="#0B0B0C"
                    strokeWidth={1.8}
                    dot={false}
                    isAnimationActive={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p className="chart-note">
            µGy/hour, log scale. Coverage so far:{" "}
            {latest
              ? `${duration(latest.covered_seconds)} (${fmt(coverage * 100, 1)}% of the recorded span)`
              : "—"}
            .
          </p>
        </div>

        <div>
          <h3 style={{ marginBottom: 8 }}>Stream events</h3>
          {feed.length === 0 ? (
            <p className="small muted">
              Press play. Data-quality decisions appear here the moment the replay reaches them.
            </p>
          ) : (
            <ul className="feed">
              {feed.map((f) => (
                <li key={f.id} className={f.kind}>
                  <time>{f.time}</time>
                  <span>
                    {f.text}
                    {f.evidenceId ? (
                      <>
                        {" "}
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          style={{ minHeight: 28, padding: "0 6px" }}
                          onClick={() => open({ kind: "evidence", id: f.evidenceId! })}
                        >
                          Inspect
                        </button>
                      </>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
