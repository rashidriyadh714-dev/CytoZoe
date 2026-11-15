import { useId, useRef, type KeyboardEvent } from "react";
import type { Participant, SampleVisit } from "../api/contracts";

export function ParticipantSelect({
  participants,
  value,
  onChange,
}: {
  participants: Participant[];
  value: string;
  onChange: (v: string) => void;
}) {
  const id = useId();
  return (
    <div className="field">
      <div className="field-top-row">
        <label className="field-label" htmlFor={id}>
          Crew Subject (OSD-575)
        </label>
        <div className="crew-pill-strip" role="group" aria-label="Quick crew subject switcher">
          {participants.map((p) => (
            <button
              key={p.participant_id}
              type="button"
              className={`crew-quick-btn ${p.participant_id === value ? "active" : ""}`}
              aria-pressed={p.participant_id === value}
              onClick={() => onChange(p.participant_id)}
            >
              {p.participant_id}
            </button>
          ))}
        </div>
      </div>
      <select
        id={id}
        className="select"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {participants.map((p) => (
          <option key={p.participant_id} value={p.participant_id}>
            {p.participant_id} (Inspiration4 crew · 7 draws)
          </option>
        ))}
      </select>
    </div>
  );
}

export function SampleSelect({
  samples,
  value,
  onChange,
}: {
  samples: SampleVisit[];
  value: string;
  onChange: (v: string) => void;
}) {
  const id = useId();
  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>
        Visit Timepoint (Sample)
      </label>
      <select
        id={id}
        className="select"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {samples.map((s) => (
          <option key={s.visit} value={s.visit}>
            {s.label}
          </option>
        ))}
      </select>
    </div>
  );
}

/**
 * Interactive Orbital Trajectory & Mission Timeline Visit Scrubber
 * Renders both a clickable SVG orbital trajectory curve (Preflight -> 585km Orbital Apogee -> Postflight)
 * and the 7-visit telemetry command buttons.
 */
export function VisitTimelineScrubber({
  samples,
  value,
  onChange,
}: {
  samples: SampleVisit[];
  value: string;
  onChange: (v: string) => void;
}) {
  const activeIdx = Math.max(
    0,
    samples.findIndex((s) => s.visit === value)
  );

  // Coordinates along the 840x92 SVG trajectory arc for 7 visits
  const nodePositions = [
    { x: 64, y: 66 },  // L-92
    { x: 168, y: 58 }, // L-44
    { x: 272, y: 42 }, // L-3
    { x: 468, y: 42 }, // R+1
    { x: 572, y: 56 }, // R+45
    { x: 676, y: 64 }, // R+82
    { x: 776, y: 68 }, // R+194
  ];

  return (
    <div className="visit-scrubber" role="group" aria-label="Mission timeline visit selector">
      <div className="visit-scrubber-head">
        <span className="visit-phase-label">01 // Preflight Baseline Draws (L-92 → L-3)</span>
        <span className="visit-launch-marker" aria-hidden="true">
          ✦ 585 KM LEO ORBITAL APOGEE · INSPIRATION4 ✦
        </span>
        <span className="visit-phase-label">02 // Postflight Recovery Draws (R+1 → R+194)</span>
      </div>

      {/* Interactive SVG Orbital Trajectory Visualization */}
      <div className="visit-orbital-svg-wrap" aria-hidden="true">
        <svg viewBox="0 0 840 86" className="visit-orbital-svg">
          <defs>
            <linearGradient id="orbitalArcGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="rgba(34, 211, 238, 0.25)" />
              <stop offset="44%" stopColor="rgba(34, 211, 238, 0.95)" />
              <stop offset="56%" stopColor="rgba(245, 158, 11, 0.9)" />
              <stop offset="100%" stopColor="rgba(34, 211, 238, 0.25)" />
            </linearGradient>
          </defs>
          {/* Baseline horizontal datum */}
          <line
            x1="36"
            y1="72"
            x2="804"
            y2="72"
            stroke="rgba(148, 163, 184, 0.14)"
            strokeDasharray="3 5"
          />
          {/* Orbital trajectory curve */}
          <path
            d="M 64 66 Q 210 56, 272 42 C 330 22, 410 22, 468 42 Q 585 60, 776 68"
            fill="none"
            stroke="url(#orbitalArcGrad)"
            strokeWidth="2"
          />
          {/* Orbital insertion window marker */}
          <line
            x1="370"
            y1="8"
            x2="370"
            y2="78"
            stroke="rgba(34, 211, 238, 0.4)"
            strokeDasharray="2 4"
          />
          <circle cx="370" cy="26" r="4" fill="#22D3EE" />
          <text
            x="370"
            y="15"
            textAnchor="middle"
            fill="#22D3EE"
            fontSize="9.5"
            fontFamily="JetBrains Mono, IBM Plex Mono, monospace"
            letterSpacing="0.12em"
          >
            ORBITAL INSERTION
          </text>

          {samples.map((s, idx) => {
            const pos = nodePositions[idx] ?? { x: 64 + idx * 110, y: 60 };
            const isSelected = idx === activeIdx;
            return (
              <g
                key={s.visit}
                style={{ cursor: "pointer" }}
                onClick={() => onChange(s.visit)}
              >
                {isSelected ? (
                  <circle
                    cx={pos.x}
                    cy={pos.y}
                    r="11"
                    fill="rgba(34, 211, 238, 0.16)"
                    stroke="#22D3EE"
                    strokeWidth="1"
                  />
                ) : null}
                <circle
                  cx={pos.x}
                  cy={pos.y}
                  r={isSelected ? "5.5" : "4"}
                  fill={isSelected ? "#22D3EE" : s.phase === "PREFLIGHT" ? "#0B192C" : "#1E293B"}
                  stroke={isSelected ? "#FFFFFF" : "#22D3EE"}
                  strokeWidth="1.5"
                />
              </g>
            );
          })}
        </svg>
      </div>

      <div className="visit-scrubber-track">
        {samples.map((s, idx) => {
          const active = s.visit === value;
          const isFirstPost = s.phase === "POSTFLIGHT" && samples[idx - 1]?.phase === "PREFLIGHT";
          return (
            <div key={s.visit} className="visit-node-wrap">
              {isFirstPost ? <span className="visit-flight-divider" aria-hidden="true" /> : null}
              <button
                type="button"
                onClick={() => onChange(s.visit)}
                aria-pressed={active}
                className={`visit-node ${active ? "active" : ""} ${
                  s.phase === "PREFLIGHT" ? "pre" : "post"
                }`}
              >
                <span className="visit-code">{s.visit}</span>
                <span className="visit-phase-sub">
                  {s.phase === "PREFLIGHT" ? "Preflight" : "Postflight"}
                </span>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** WAI-ARIA tabs with roving focus (Left/Right/Home/End). */
export function MarkerTabs({
  markers,
  value,
  onChange,
  flagged,
  panelId,
}: {
  markers: { id: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
  flagged: Set<string>;
  panelId: string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKey = (e: KeyboardEvent, i: number) => {
    let next = -1;
    if (e.key === "ArrowRight") next = (i + 1) % markers.length;
    else if (e.key === "ArrowLeft") next = (i - 1 + markers.length) % markers.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = markers.length - 1;
    if (next >= 0) {
      e.preventDefault();
      refs.current[next]?.focus();
      onChange(markers[next].id);
    }
  };
  return (
    <div className="tabs" role="tablist" aria-label="Blood marker">
      {markers.map((m, i) => (
        <button
          key={m.id}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="button"
          role="tab"
          className="tab"
          id={`tab-${m.id}`}
          aria-selected={value === m.id}
          aria-controls={panelId}
          tabIndex={value === m.id ? 0 : -1}
          onClick={() => onChange(m.id)}
          onKeyDown={(e) => onKey(e, i)}
        >
          {m.label}
          {flagged.has(m.id) ? (
            <>
              <span className="tab-flag" aria-hidden="true" />
              <span className="sr-only"> (outside supplied range at this visit)</span>
            </>
          ) : null}
        </button>
      ))}
    </div>
  );
}
