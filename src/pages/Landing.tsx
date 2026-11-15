import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  IconArrow,
  IconBan,
  IconCheck,
  IconDoc,
  IconDownload,
  IconLog,
  IconOverview,
  IconRadiation,
  IconShield,
  IconTrend,
} from "../components/icons";
import { StarfieldCanvas } from "../components/StarfieldCanvas";

const WORKSPACE = "/overview?participant=C001&sample=L-3";

const MODULES = [
  {
    num: "01 · INTERNAL HEALTH",
    to: WORKSPACE,
    title: "Astronaut Biomarker & Baseline Telemetry",
    target:
      "Target measurements: Serum CMP (Glucose, Sodium, Potassium, Creatinine, Calcium + 12 extended analytes), and future HR, HRV, BP, SpO₂, sleep & fatigue.",
    body: "Establishes individual preflight baselines (retrospective and prospective prior-visit replay) and flags deviations against supplied laboratory bounds with exact CSV row provenance.",
    metric: "17 Analytes · 7 Visits",
    Icon: IconOverview,
  },
  {
    num: "02 · EXTERNAL ENVIRONMENT",
    to: "/environment",
    title: "ISS Radiation Dose Rate & Sensor Integration",
    target:
      "Target measurements: Absorbed dose rate (µGy/hour), cumulative sensor dose (µGy), orbital pass context, and data-quality quarantine.",
    body: "Visualises real ISS Columbus DosTel1 observations (1 March 2022), quarantining 4 conflicting duplicate timestamps (8 rows) rather than averaging or cherry-picking.",
    metric: "296.04 µGy · 1,194 Accepted",
    Icon: IconRadiation,
  },
  {
    num: "03 · OFFLINE INTELLIGENCE",
    to: "/reviews",
    title: "Evidence-Bound Briefs & Audit Handoff",
    target:
      "Target capability: Review local health trends alongside exposure context, show evidence strength and uncertainty, and prompt investigation.",
    body: "Generates deterministic MissionBriefV1 reports, answers questions via fixed verified templates (zero LLM hallucinations), and exports self-contained HTML/JSON packets.",
    metric: "WAL SQLite · Zero Cloud Calls",
    Icon: IconLog,
  },
];

const DATA_SOURCES_MATRIX = [
  {
    dataset: "NASA RadLab · ISS DosTel1",
    context: "1 March 2022 · ISS Columbus Module",
    status: "Active in Workspace · SHA-256 Pinned",
    useInCytoZoe:
      "Real ISS radiation observations. Used for local radiation trend visualisation, duplicate-conflict quarantine, and trapezoidal cumulative sensor-dose calculations.",
    boundary:
      "Environmental area-monitor readings are not an individual astronaut's personal, organ or effective dose or health record.",
    route: "/environment",
  },
  {
    dataset: "NASA OSD-575 · Inspiration4",
    context: "SpaceX Inspiration4 Crew · LSDS-8 CMP",
    status: "Active in Workspace · SHA-256 Pinned",
    useInCytoZoe:
      "Human serum Comprehensive Metabolic Panel research across 4 crew participants and 7 mission timepoints (L-92, L-44, L-3, R+1, R+45, R+82, R+194).",
    boundary:
      "Sparse blood draws — not continuous HR, HRV, BP or SpO₂ telemetry; never automatically linked or correlated to RadLab.",
    route: WORKSPACE,
  },
  {
    dataset: "NASA GLDS-174",
    context: "ISS Astronaut Hair-Follicle Transcriptomics",
    status: "Documented Molecular Context",
    useInCytoZoe:
      "Astronaut hair-follicle gene-expression research. Used as molecular reference context for spaceflight-related biological responses in the Trends workspace.",
    boundary:
      "Gene-expression results are not direct vital signs, clinical lab bounds, or proof of radiation-caused effects.",
    route: "/health?participant=C001&sample=L-3&marker=creatinine",
  },
  {
    dataset: "PhysioNet BIDMC",
    context: "PPG, ECG, SpO₂ & Respiration Waveforms",
    status: "Optional Technical Validation Scope",
    useInCytoZoe:
      "Optional technical-validation benchmark for HR, ECG, PPG, SpO₂ and respiration signal-processing algorithms using local files.",
    boundary:
      "Terrestrial clinical human data, not astronaut data. Must never be used as astronaut-health evidence or astronaut baseline data.",
    route: "/health?participant=C001&sample=L-3&marker=creatinine",
  },
];

const PIPELINE_STEPS = [
  {
    n: "01 · PRELOAD",
    title: "Stage Verified NASA Snapshots",
    text: "Manually download approved NASA OSDR & RadLab files once. Preserve source URL, version, CC0 licence, units and cryptographic SHA-256 hashes in data/manifests/sources.json.",
    Icon: IconShield,
  },
  {
    n: "02 · PROCESS",
    title: "Deterministic Schema & Quality Gate",
    text: "Run strict schema checks, timestamp validation, missing-value detection, and exact-timestamp conflict quarantine (E1 engine) without fabricating or interpolating data.",
    Icon: IconTrend,
  },
  {
    n: "03 · STORE",
    title: "Immutable Raw + Local SQLite",
    text: "Preserve original CSV files untouched; store cleaned observations, provenance classes (NASA_PINNED_VERIFIED) and versioned reviewer notes in a local WAL SQLite database.",
    Icon: IconOverview,
  },
  {
    n: "04 · ANALYSE & DISPLAY",
    title: "Rule-Based Intelligence & Export",
    text: "Execute local statistical/rule-based comparisons (E2 & E3) and verified explanation templates (E4). Surface trends, provenance and uncertainty with printable HTML/JSON handoff.",
    Icon: IconLog,
  },
];

export default function Landing() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [showPdfModal, setShowPdfModal] = useState(false);
  const [activeShowcase, setActiveShowcase] = useState<"left" | "center" | "right">("center");

  useEffect(() => {
    document.title = "CytoZoe — Offline-First Astronaut Health & Environmental Intelligence";
    if (params.get("autostart") === "1") {
      navigate(WORKSPACE, { replace: true });
    }
  }, [params, navigate]);

  return (
    <div className="landing">
      <a className="skip-link" href="#landing-main">
        Skip to main content
      </a>

      {/* Strict 3-Zone Top Bar Contract (Midnight Black + Pure White + Lime Green) */}
      <header className="l-top">
        <div className="l-wrap l-top-inner">
          <Link to="/" className="l-brand-wordmark">
            <span className="l-brand-badge" aria-hidden="true">
              C
            </span>
            <span>CytoZoe</span>
          </Link>

          <nav className="l-nav-links" aria-label="Landing sections">
            <a href="#system-modules" className="l-nav-link is-active">
              <span className="l-nav-dot" aria-hidden="true" />
              System Modules
            </a>
            <a href="#data-sources" className="l-nav-link">
              Data Sources
            </a>
            <a href="#offline-pipeline" className="l-nav-link">
              Pipeline
            </a>
            <a href="#safeguards" className="l-nav-link">
              Safeguards
            </a>
          </nav>

          <div className="l-top-cta">
            <button
              type="button"
              className="l-top-signin"
              onClick={() => setShowPdfModal(true)}
            >
              Brief PDF
            </button>
            <Link to={WORKSPACE} className="l-top-pill-btn">
              Launch Workspace
            </Link>
          </div>
        </div>
      </header>

      <main id="landing-main">
        {/* Midnight Black & Lime Green Aurora Stage with Flanking Metrics & 3-Card Fan Showcase */}
        <section className="l-hero" aria-labelledby="hero-title">
          <StarfieldCanvas />
          <div className="l-hero-aurora" aria-hidden="true" />
          <div className="l-hero-grid" aria-hidden="true" />

          <div className="l-wrap l-hero-stage">
            {/* Left Floating Stats Wing */}
            <aside
              className="l-wing l-wing-left anim-wing-left"
              aria-label="Astronaut biomarker telemetry highlights"
            >
              <div className="l-wing-stat">
                <div className="l-wing-num tabular">17</div>
                <div className="l-wing-label">CMP ANALYTES VERIFIED</div>
              </div>
              <div className="l-wing-stat">
                <div className="l-wing-num tabular">100%</div>
                <div className="l-wing-label">SHA-256 OFFLINE PROVENANCE</div>
              </div>
            </aside>

            {/* Center Editorial Headline & CTAs */}
            <div className="l-hero-center anim-hero-up">
              <p className="l-kicker">
                <span className="l-kicker-dot" aria-hidden="true" />
                NASA OSDR OSD-575 &amp; RADLAB DOSTEL1 · OFFLINE INTELLIGENCE
              </p>
              <h1 id="hero-title" className="l-editorial-title">
                Understand the <em>change</em>
                <br />
                across every <em>orbit.</em>
              </h1>
              <p className="l-editorial-sub">
                Inspect verified Inspiration4 serum biomarkers alongside ISS Columbus radiation
                telemetry, trace every number to its exact CSV row, and record audit-ready crew
                follow-ups without Earth connectivity.
              </p>
              <div className="l-cta-centered">
                <Link to={WORKSPACE} className="l-btn l-btn-lime">
                  Open Health Workspace
                  <IconArrow />
                </Link>
                <button
                  type="button"
                  className="l-btn l-btn-glass"
                  onClick={() => setShowPdfModal(true)}
                >
                  <IconDoc />
                  Read One-Page Brief
                </button>
              </div>
            </div>

            {/* Right Floating Stats Wing */}
            <aside
              className="l-wing l-wing-right anim-wing-right"
              aria-label="ISS radiation telemetry highlights"
            >
              <div className="l-wing-stat align-right">
                <div className="l-wing-num tabular">1,202</div>
                <div className="l-wing-label">DOSTEL1 SOURCE ROWS</div>
              </div>
              <div className="l-wing-stat align-right">
                <div className="l-wing-num tabular">296.04</div>
                <div className="l-wing-label">
                  <span style={{ textTransform: "none" }}>µGy</span> INTEGRATED SENSOR DOSE
                </div>
              </div>
            </aside>
          </div>

          {/* 3-Card Tilted Fan Showcase (Northline-Inspired Interactive Instrument Deck) */}
          <div className="l-wrap">
            <div
              className="l-showcase-fan"
              role="region"
              aria-label="Interactive CytoZoe workspace telemetry preview"
            >
              {/* Left Tilted Card: Serum CMP Biomarkers */}
              <article
                className={`l-fan-card l-fan-left ${activeShowcase === "left" ? "is-focused" : ""}`}
                onMouseEnter={() => setActiveShowcase("left")}
                onClick={() => navigate(WORKSPACE)}
              >
                <div className="l-fan-head">
                  <span className="l-fan-dot" />
                  <span>Serum CMP panel · C001 · L-3</span>
                </div>
                <div className="l-fan-list">
                  <div className="l-fan-row">
                    <span className="l-fan-avatar">CR</span>
                    <span className="l-fan-row-text">creatinine: 1.37 mg/dL (row 1)</span>
                    <span className="l-fan-pill lime">Above 1.35</span>
                  </div>
                  <div className="l-fan-row">
                    <span className="l-fan-avatar">GL</span>
                    <span className="l-fan-row-text">glucose: 69 mg/dL (65–99)</span>
                    <span className="l-fan-pill outline">Within</span>
                  </div>
                  <div className="l-fan-row">
                    <span className="l-fan-avatar">NA</span>
                    <span className="l-fan-row-text">sodium: 142 mmol/L (135–146)</span>
                    <span className="l-fan-pill muted">Baseline +0.9%</span>
                  </div>
                  <div className="l-fan-row">
                    <span className="l-fan-avatar">CA</span>
                    <span className="l-fan-row-text">calcium: 9.6 mg/dL (8.6–10.3)</span>
                    <span className="l-fan-pill muted">Preflight n=3</span>
                  </div>
                </div>
              </article>

              {/* Center Hero Card: Big Metric + Glowing Lime Area Curve */}
              <article
                className={`l-fan-card l-fan-center ${
                  activeShowcase === "center" ? "is-focused" : ""
                }`}
                onMouseEnter={() => setActiveShowcase("center")}
                onClick={() => navigate("/health?participant=C001&sample=L-3&marker=creatinine")}
              >
                <div className="l-fan-head">
                  <span className="l-fan-dot" />
                  <span>Creatinine score · OSD-575</span>
                </div>
                <div className="l-fan-score-row">
                  <div className="l-fan-score">
                    <span className="l-fan-big-num tabular">1.37</span>
                    <span className="l-fan-score-sub">/ 1.35 mg/dL upper bound</span>
                  </div>
                  <span className="l-fan-pill outline-lime">SHA-256 Verified</span>
                </div>
                <div className="l-fan-chart" aria-hidden="true">
                  <svg viewBox="0 0 360 128" preserveAspectRatio="none">
                    <defs>
                      <linearGradient id="limeAreaGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#C6F432" stopOpacity="0.48" />
                        <stop offset="100%" stopColor="#C6F432" stopOpacity="0.02" />
                      </linearGradient>
                    </defs>
                    {[1, 2, 3, 4, 5].map((i) => (
                      <line
                        key={i}
                        x1={i * 60}
                        y1={8}
                        x2={i * 60}
                        y2={112}
                        stroke="rgba(255,255,255,0.06)"
                        strokeWidth="1"
                      />
                    ))}
                    <path
                      d="M 8 82 L 66 94 L 124 44 L 182 76 L 240 62 L 298 38 L 352 18 L 352 114 L 8 114 Z"
                      fill="url(#limeAreaGrad)"
                    />
                    <path
                      d="M 8 82 L 66 94 L 124 44 L 182 76 L 240 62 L 298 38 L 352 18"
                      fill="none"
                      stroke="#C6F432"
                      strokeWidth="2.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <circle cx="124" cy="44" r="5" fill="#0B0B0C" stroke="#C6F432" strokeWidth="2.5" />
                    <circle cx="352" cy="18" r="4.5" fill="#C6F432" />
                  </svg>
                  <div className="l-fan-chart-axis">
                    <span>L-92</span>
                    <span>L-44</span>
                    <span className="active">L-3</span>
                    <span>R+1</span>
                    <span>R+45</span>
                    <span>R+82</span>
                    <span>R+194</span>
                  </div>
                </div>
              </article>

              {/* Right Tilted Card: ISS DosTel1 Radiation Stream & Conflict Timeline */}
              <article
                className={`l-fan-card l-fan-right ${
                  activeShowcase === "right" ? "is-focused" : ""
                }`}
                onMouseEnter={() => setActiveShowcase("right")}
                onClick={() => navigate("/environment")}
              >
                <div className="l-fan-head">
                  <span className="l-fan-dot" />
                  <span>Radiation timeline · 1 Mar 2022</span>
                </div>
                <div className="l-fan-timeline">
                  <div className="l-fan-time-ticks">
                    <span>06:00</span>
                    <span>09:15</span>
                    <span>12:00</span>
                    <span>18:25</span>
                    <span>23:58</span>
                  </div>
                  <div className="l-fan-bars">
                    <div className="l-fan-cursor" />
                    <div className="l-fan-bar-row">
                      <span className="l-bar muted" style={{ left: "4%", width: "26%" }} />
                      <span className="l-bar lime" style={{ left: "44%", width: "24%" }} />
                    </div>
                    <div className="l-fan-bar-row">
                      <span className="l-bar lime" style={{ left: "18%", width: "42%" }} />
                      <span className="l-bar muted" style={{ left: "66%", width: "22%" }} />
                    </div>
                    <div className="l-fan-bar-row">
                      <span className="l-bar muted" style={{ left: "8%", width: "30%" }} />
                      <span className="l-bar lime" style={{ left: "54%", width: "38%" }} />
                    </div>
                    <div className="l-fan-bar-row">
                      <span className="l-bar muted" style={{ left: "14%", width: "48%" }} />
                    </div>
                  </div>
                  <div className="l-fan-foot-note">
                    <span>296.04 µGy integrated</span>
                    <span className="lime-text">4 conflicts quarantined →</span>
                  </div>
                </div>
              </article>
            </div>
          </div>

          <div className="l-wrap">
            <div className="l-props" aria-label="Key architectural principles">
              <div className="l-prop">
                <b>01</b>
                <div>
                  <h2>Offline-first by design</h2>
                  <p>
                    Runs on 127.0.0.1 with an embedded WAL SQLite database. Once NASA datasets are
                    staged, zero Earth connectivity is required.
                  </p>
                </div>
              </div>
              <div className="l-prop">
                <b>02</b>
                <div>
                  <h2>Traceable to the CSV byte</h2>
                  <p>
                    Every measurement cites its dataset SHA-256 hash, file name, 1-based data row,
                    column header, and unrounded raw string.
                  </p>
                </div>
              </div>
              <div className="l-prop">
                <b>03</b>
                <div>
                  <h2>Scientific boundary enforcement</h2>
                  <p>
                    Prompts human investigation rather than claiming unproven causation or merging
                    disconnected NASA studies.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Three System Modules */}
        <section
          id="system-modules"
          className="l-section"
          aria-labelledby="modules-title"
          tabIndex={-1}
        >
          <div className="l-wrap">
            <div className="l-head">
              <p className="l-kicker">
                <span className="l-kicker-dot" aria-hidden="true" />
                THREE SYSTEM MODULES
              </p>
              <h2 id="modules-title" className="l-sec-editorial">
                From raw spaceflight records to <em>evidence-aware</em> crew review.
              </h2>
              <p>
                Built directly to the CytoZoe architecture brief: separating internal biological
                baselines, external orbital radiation telemetry, and offline review intelligence.
              </p>
            </div>

            <div className="l-modules-grid">
              {MODULES.map(({ num, to, title, target, body, metric, Icon }) => (
                <div key={num}>
                  <Link to={to} className="l-module-card">
                    <div className="l-module-top">
                      <span className="l-module-num">{num}</span>
                      <span className="l-module-icon-box">
                        <Icon />
                      </span>
                    </div>
                    <h3>{title}</h3>
                    <p className="l-module-target">{target}</p>
                    <p className="l-module-body">{body}</p>
                    <div className="l-module-foot">
                      <span className="l-module-metric">{metric}</span>
                      <span className="l-module-cta">
                        Explore <IconArrow />
                      </span>
                    </div>
                  </Link>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Data Sources & Scientific Boundaries Matrix */}
        <section
          id="data-sources"
          className="l-section alt"
          aria-labelledby="sources-matrix-title"
        >
          <div className="l-wrap">
            <div className="l-head-row">
              <div className="l-head" style={{ marginBottom: 0 }}>
                <p className="l-kicker">
                  <span className="l-kicker-dot" aria-hidden="true" />
                  DATA SOURCES &amp; HOW EACH IS USED
                </p>
                <h2 id="sources-matrix-title" className="l-sec-editorial">
                  Four documented datasets. <em>Explicit</em> scientific boundaries.
                </h2>
                <p>
                  RadLab, OSD-575, GLDS-174 and PhysioNet BIDMC involve different studies,
                  participants and dates. CytoZoe preserves each source’s provenance and enforces
                  strict data boundaries so they are never falsely merged.
                </p>
              </div>
              <div className="l-head-actions">
                <button
                  type="button"
                  className="l-btn l-btn-glass"
                  onClick={() => setShowPdfModal(true)}
                >
                  <IconDoc />
                  Inspect One-Page Brief PDF
                </button>
              </div>
            </div>

            <div className="l-matrix-wrap">
              <table className="l-matrix-table">
                <caption>CytoZoe Data Sources &amp; Scientific Boundary Specification</caption>
                <thead>
                  <tr>
                    <th scope="col">Dataset &amp; Study Context</th>
                    <th scope="col">Use in CytoZoe</th>
                    <th scope="col">Scientific &amp; Data Boundary</th>
                    <th scope="col">Workspace Link</th>
                  </tr>
                </thead>
                <tbody>
                  {DATA_SOURCES_MATRIX.map((row) => (
                    <tr key={row.dataset}>
                      <td>
                        <div className="l-matrix-ds">{row.dataset}</div>
                        <div className="l-matrix-sub">{row.context}</div>
                        <div className="l-matrix-status">{row.status}</div>
                      </td>
                      <td>{row.useInCytoZoe}</td>
                      <td className="l-matrix-boundary">{row.boundary}</td>
                      <td>
                        <Link to={row.route} className="l-inline-link">
                          Open →
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="l-cases" style={{ marginTop: 32 }}>
              <article className="l-case" aria-labelledby="case-health">
                <figure className="l-case-media" style={{ margin: 0 }}>
                  <svg
                    viewBox="0 0 560 245"
                    role="img"
                    aria-label="The seven sample visits per participant, from 92 days before launch to 194 days after return"
                    style={{ width: "100%", height: "100%" }}
                  >
                    <line
                      x1="40"
                      x2="520"
                      y1="140"
                      y2="140"
                      stroke="rgba(255, 255, 255, 0.22)"
                      strokeWidth="1"
                    />
                    <line
                      x1="240"
                      x2="240"
                      y1="84"
                      y2="190"
                      stroke="#C6F432"
                      strokeDasharray="3 5"
                      strokeWidth="1.5"
                    />
                    <text
                      x="240"
                      y="74"
                      fill="#C6F432"
                      fontSize="11"
                      textAnchor="middle"
                      fontFamily="IBM Plex Mono, monospace"
                    >
                      ORBITAL FLIGHT
                    </text>
                    {["L-92", "L-44", "L-3", "R+1", "R+45", "R+82", "R+194"].map((v, i) => {
                      const x = 40 + i * 80;
                      return (
                        <g key={v}>
                          <circle
                            cx={x}
                            cy={140}
                            r={i < 3 ? 6 : 7}
                            fill={i < 3 ? "#0B0B0C" : "#C6F432"}
                            stroke="#C6F432"
                            strokeWidth="2"
                          />
                          <text
                            x={x}
                            y={172}
                            fill="#FFFFFF"
                            fontSize="12"
                            textAnchor="middle"
                            fontFamily="IBM Plex Mono, monospace"
                          >
                            {v}
                          </text>
                        </g>
                      );
                    })}
                    <text
                      x="40"
                      y="112"
                      fill="#A1A1AA"
                      fontSize="11"
                      fontFamily="IBM Plex Mono, monospace"
                    >
                      PREFLIGHT (n=3)
                    </text>
                    <text
                      x="520"
                      y="112"
                      fill="#A1A1AA"
                      fontSize="11"
                      textAnchor="end"
                      fontFamily="IBM Plex Mono, monospace"
                    >
                      POSTFLIGHT (n=4)
                    </text>
                  </svg>
                </figure>
                <div className="l-case-body">
                  <span className="tag">Case 01 · NASA OSD-575 Inspiration4</span>
                  <h3 id="case-health">Crew Serum Comprehensive Metabolic Panel</h3>
                  <p>
                    Published in the NASA Open Science Data Repository (LSDS-8). Tracks 4
                    anonymised crew members across 3 preflight and 4 postflight blood draws (5 core
                    markers + 12 extended CMP analytes).
                  </p>
                  <p className="l-unboxed-facts">
                    4 anonymised participants · 7 visits each · 17 non-race-based CMP analytes ·
                    Supplied lab bounds
                  </p>
                </div>
              </article>

              <article className="l-case" aria-labelledby="case-env">
                <figure className="l-case-media" style={{ margin: 0 }}>
                  <picture>
                    <source
                      srcSet="/media/earth-night-iss-800.avif 800w, /media/earth-night-iss-1600.avif 1600w"
                      sizes="(max-width: 900px) 100vw, 560px"
                      type="image/avif"
                    />
                    <source
                      srcSet="/media/earth-night-iss-800.webp 800w, /media/earth-night-iss-1600.webp 1600w"
                      sizes="(max-width: 900px) 100vw, 560px"
                      type="image/webp"
                    />
                    <img
                      src="/media/earth-night-iss-800.webp"
                      alt="Earth at night from the International Space Station"
                      width={1600}
                      height={1066}
                      loading="lazy"
                      decoding="async"
                      referrerPolicy="no-referrer"
                    />
                  </picture>
                  <figcaption>NASA / JSC · iss073e0257211</figcaption>
                </figure>
                <div className="l-case-body">
                  <span className="tag">Case 02 · NASA OSDR RadLab DosTel1</span>
                  <h3 id="case-env">ISS Columbus Module Absorbed Dose Rate</h3>
                  <p>
                    24-hour export from 1 March 2022. Demonstrates transparent data-quality
                    quarantine when 4 timestamps report conflicting absorbed dose rates, plus SSE
                    real-time historical stream replay.
                  </p>
                  <p className="l-unboxed-facts">
                    1,202 raw rows · 1,194 accepted · 8 quarantined conflicts · 296.04 µGy sensor
                    estimate
                  </p>
                </div>
              </article>
            </div>
          </div>
        </section>

        {/* How to Build It — Offline, Without External APIs */}
        <section
          id="offline-pipeline"
          className="l-section"
          aria-labelledby="how-title"
          tabIndex={-1}
        >
          <div className="l-wrap">
            <div className="l-head">
              <p className="l-kicker">
                <span className="l-kicker-dot" aria-hidden="true" />
                HOW IT WORKS — OFFLINE, WITHOUT EXTERNAL APIS
              </p>
              <h2 id="how-title" className="l-sec-editorial">
                Four deterministic stages from <em>raw CSV</em> to audit packet.
              </h2>
              <p>
                Every number is calculated by the local service from the verified source file. The
                interface never interpolates across sparse blood draws or fabricates missing data.
              </p>
            </div>
            <ol className="l-steps">
              {PIPELINE_STEPS.map(({ n, title, text, Icon }) => (
                <li key={n}>
                  <div className="l-step">
                    <Icon />
                    <span className="n">{n}</span>
                    <h3>{title}</h3>
                    <p>{text}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Scope & Scientific Safeguards */}
        <section
          id="safeguards"
          className="l-section alt"
          aria-labelledby="trust-title"
        >
          <div className="l-wrap">
            <div className="l-head">
              <p className="l-kicker">
                <span className="l-kicker-dot" aria-hidden="true" />
                SCOPE &amp; SCIENTIFIC SAFEGUARDS
              </p>
              <h2 id="trust-title" className="l-sec-editorial">
                Honest about what the data <em>can</em> — and cannot — prove.
              </h2>
              <p>
                The NASA datasets currently collected do not provide continuous astronaut HR, HRV,
                BP or SpO₂ time series. Direct onboard vital-sign monitoring remains a future
                capability requiring suitable sensors and validated data access.
              </p>
            </div>
            <div className="l-trust">
              <div className="l-trust-card yes">
                <h3>What CytoZoe does</h3>
                <ul>
                  <li>
                    <IconCheck />
                    <span>
                      Serves NASA data only when its SHA-256 matches a registered snapshot in{" "}
                      <code>sources.json</code>
                    </span>
                  </li>
                  <li>
                    <IconCheck />
                    <span>
                      Traces every measurement to its exact CSV file, 1-based data row, column
                      header and raw string
                    </span>
                  </li>
                  <li>
                    <IconCheck />
                    <span>
                      Compares retrospective preflight means alongside prospective prior-visit
                      replay baselines (zero temporal leakage)
                    </span>
                  </li>
                  <li>
                    <IconCheck />
                    <span>
                      Explains findings with deterministic, source-bound templates — no generative
                      LLM hallucinations
                    </span>
                  </li>
                  <li>
                    <IconCheck />
                    <span>
                      Saves reviews in a local SQLite database with optimistic locking and exports
                      printable HTML &amp; JSON packets
                    </span>
                  </li>
                </ul>
              </div>
              <div className="l-trust-card no">
                <h3>What it never does</h3>
                <ul>
                  <li>
                    <IconBan />
                    <span>
                      Never diagnoses illness, scores clinical risk or recommends medical treatment
                    </span>
                  </li>
                  <li>
                    <IconBan />
                    <span>
                      Never claims live NASA telemetry or real-time astronaut vital-sign monitoring
                    </span>
                  </li>
                  <li>
                    <IconBan />
                    <span>
                      Never merges RadLab, OSD-575, GLDS-174 or BIDMC to claim a matched
                      exposure–health causation
                    </span>
                  </li>
                  <li>
                    <IconBan />
                    <span>
                      Never averages, cherry-picks or hides the 4 conflicting duplicate timestamps
                      (8 rows) in RadLab DosTel1
                    </span>
                  </li>
                  <li>
                    <IconBan />
                    <span>
                      Never transmits reviewer notes over the network; export is strictly a local
                      download
                    </span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        <section className="l-final" aria-labelledby="final-title">
          <div className="l-wrap">
            <h2 id="final-title" className="l-sec-editorial">
              Open the <em>evidence</em> workspace.
            </h2>
            <p>
              Start with participant C001's preflight sample L-3, where Creatinine (1.37 mg/dL)
              sits just above the supplied laboratory bound (1.35 mg/dL).
            </p>
            <div className="l-cta-centered">
              <Link to={WORKSPACE} className="l-btn l-btn-lime">
                Launch Workspace
                <IconArrow />
              </Link>
              <Link to="/environment" className="l-btn l-btn-glass">
                Inspect ISS Radiation Stream
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="l-footer" aria-labelledby="credits-title">
        <div className="l-wrap">
          <h2 id="credits-title">Vision, Data &amp; Imagery Credits</h2>
          <div className="l-credits">
            <div>
              <p>
                <strong>Vision.</strong> Move beyond monitoring the space environment to
                understanding astronaut health in the context of that environment.
              </p>
              <p>
                Prototype scope: offline research-data integration and analysis. Live sensor
                integration and astronaut vital-sign validation remain future work.
              </p>
            </div>
            <div>
              <p>
                <strong>NASA Imagery.</strong> Hero: ISS067-E-245176 (6 Aug 2022) &amp; Case Study:
                iss073e0257211 (17 Jun 2025), courtesy of Earth Science and Remote Sensing Unit,
                NASA Johnson Space Center.
              </p>
              <p>
                <a
                  href="https://eol.jsc.nasa.gov/SearchPhotos/photo.pl?mission=ISS067&roll=E&frame=245176"
                  rel="noreferrer noopener"
                  target="_blank"
                >
                  eol.jsc.nasa.gov
                </a>
              </p>
            </div>
            <div>
              <p>
                <strong>Verified Datasets.</strong> NASA Open Science Data Repository OSD-575
                (Inspiration4 CMP, LSDS-8) and NASA OSDR RadLab DosTel1 export for 1 March 2022.
              </p>
              <p>
                <a
                  href="https://osdr.nasa.gov/bio/repo/data/studies/OSD-575"
                  rel="noreferrer noopener"
                  target="_blank"
                >
                  osdr.nasa.gov/bio/repo/data/studies/OSD-575
                </a>
              </p>
            </div>
          </div>
          <div className="l-legal">
            <span>
              CytoZoe Research Prototype · NASA Space Apps Challenge 2026. Not affiliated with or
              endorsed by NASA. Not a medical device.
            </span>
            <span>All datasets verified locally via SHA-256.</span>
          </div>
        </div>
      </footer>

      {showPdfModal ? (
        <div className="drawer-backdrop" onClick={() => setShowPdfModal(false)}>
          <aside
            className="drawer"
            role="dialog"
            aria-modal="true"
            aria-labelledby="pdf-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="drawer-head">
              <div>
                <h2 id="pdf-modal-title">CytoZoe One-Page Project Brief</h2>
                <p className="small muted">
                  Official Architecture, Data Boundaries &amp; Scientific Safeguards Specification
                </p>
              </div>
              <div className="btn-row">
                <a
                  className="btn btn-primary btn-sm"
                  href={`${import.meta.env.BASE_URL}assets/docs/CytoZoe_One_Page_Project_Brief_Updated_90d54bc2.pdf`}
                  download="CytoZoe_One_Page_Project_Brief.pdf"
                >
                  <IconDownload />
                  Download PDF
                </a>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => setShowPdfModal(false)}
                >
                  Close
                </button>
              </div>
            </header>
            <div className="drawer-body">
              <iframe
                src={`${import.meta.env.BASE_URL}assets/docs/CytoZoe_One_Page_Project_Brief_Updated_90d54bc2.pdf`}
                title="CytoZoe One-Page Project Brief"
                style={{
                  width: "100%",
                  height: "75vh",
                  border: "1px solid var(--border)",
                  borderRadius: "12px",
                  background: "#fff",
                }}
              />
            </div>
          </aside>
        </div>
      ) : null}
    </div>
  );
}
