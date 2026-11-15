import { useEffect, useRef, useState } from "react";
import { api } from "../api/client";
import { useDrawer } from "../app/providers";
import { useAsync } from "../lib/useAsync";
import { IconPause, IconPlay, IconRestart, IconStep } from "./icons";

const PACES = [
  { ms: 3200, label: "Slow" },
  { ms: 1800, label: "Normal" },
  { ms: 900, label: "Fast" },
];

/**
 * Steps through a participant's real historical visits in order and drives the page's visit selection, so
 * every card and finding updates as each sample "arrives". Events come from the server's replay endpoint.
 */
export function HealthReplayPanel({
  participant,
  visit,
  onVisit,
}: {
  participant: string;
  visit: string;
  onVisit: (v: string) => void;
}) {
  const { open } = useDrawer();
  const replay = useAsync(() => api.healthReplay(participant), [participant]);
  const [playing, setPlaying] = useState(false);
  const [pace, setPace] = useState(1800);
  const [shown, setShown] = useState<number>(-1);
  const frames = replay.data?.frames ?? [];
  const idx = frames.findIndex((f) => f.visit === visit);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    setPlaying(false);
    setShown(-1);
  }, [participant]);

  useEffect(() => {
    if (!playing || !frames.length) return;
    timer.current = window.setTimeout(
      () => {
        const next = shown + 1;
        if (next >= frames.length) {
          setPlaying(false);
          return;
        }
        setShown(next);
        onVisit(frames[next].visit);
      },
      shown < 0 ? 150 : pace
    );
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [playing, shown, pace, frames, onVisit]);

  function toggle() {
    if (playing) {
      setPlaying(false);
      return;
    }
    if (shown >= frames.length - 1) setShown(-1);
    setPlaying(true);
  }

  function step() {
    setPlaying(false);
    const next = Math.min(frames.length - 1, Math.max(shown, idx) + 1);
    setShown(next);
    onVisit(frames[next].visit);
  }

  function restart() {
    setPlaying(false);
    setShown(-1);
  }

  const feed =
    shown >= 0
      ? frames
          .slice(0, shown + 1)
          .flatMap((f) =>
            f.events
              .filter((e) => e.kind !== "baseline")
              .map((e) => ({ ...e, visit: f.visit }))
          )
          .reverse()
      : [];
  const progress = shown >= 0 ? (shown + 1) / Math.max(frames.length, 1) : 0;

  return (
    <section className="card stack" aria-labelledby="replay-title">
      <div className="card-head" style={{ marginBottom: 0 }}>
        <div>
          <p className="card-kicker">Prospective Replay Engine</p>
          <h2 id="replay-title">Replay {participant}'s mission timeline</h2>
          <p>
            Watch the seven real blood draws arrive in order. Each step updates the cards above
            using only preflight data known strictly before that visit.
          </p>
        </div>
        <span className="meta">Historical replay · not live</span>
      </div>

      <div className="player">
        <button
          type="button"
          className="play"
          onClick={toggle}
          disabled={!frames.length}
          aria-label={
            playing
              ? "Pause timeline replay"
              : shown >= 0 && shown < frames.length - 1
              ? "Resume timeline replay"
              : "Play timeline replay"
          }
        >
          {playing ? <IconPause /> : <IconPlay />}
        </button>
        <div className="progress" aria-hidden="true">
          <div className="progress-track">
            <div className="progress-fill" style={{ width: `${progress * 100}%` }} />
          </div>
          <div className="progress-meta tabular">
            <span>{shown >= 0 ? frames[shown]?.visit_label : "Ready"}</span>
            <span>
              {Math.max(shown + 1, 0)} / {frames.length} visits
            </span>
          </div>
        </div>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={step}
          disabled={!frames.length || shown >= frames.length - 1}
        >
          <IconStep />
          Next visit
        </button>
        <label className="sr-only" htmlFor="replay-pace">
          Replay pace
        </label>
        <select
          id="replay-pace"
          className="select"
          value={pace}
          onChange={(e) => setPace(Number(e.target.value))}
          style={{ minHeight: 40 }}
        >
          {PACES.map((p) => (
            <option key={p.ms} value={p.ms}>
              {p.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={restart}
          disabled={shown < 0}
        >
          <IconRestart />
          Reset
        </button>
      </div>
      <p className="sr-only" role="status">
        {shown >= 0 ? `Showing ${frames[shown]?.visit_label}` : ""}
      </p>
      {feed.length ? (
        <ul className="feed" aria-label="Replay events">
          {feed.slice(0, 12).map((e, i) => (
            <li key={`${e.visit}-${i}-${e.text}`} className={e.kind === "flag" ? "flag" : ""}>
              <time>{e.visit}</time>
              <span>
                {e.text}
                {e.evidence_id ? (
                  <>
                    {" "}
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      style={{ minHeight: 28, padding: "0 6px" }}
                      onClick={() => open({ kind: "evidence", id: e.evidence_id! })}
                    >
                      Inspect
                    </button>
                  </>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="small muted">Press play to start at the first preflight visit (L-92).</p>
      )}
    </section>
  );
}
