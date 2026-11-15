import { useEffect, useState, type ReactNode } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { useDrawer, useLive, useServiceStatus } from "../app/providers";
import { REVIEW_LABEL } from "../lib/format";
import {
  BrandMark,
  IconCheck,
  IconClose,
  IconDoc,
  IconLog,
  IconMenu,
  IconOverview,
  IconRadiation,
  IconShield,
  IconTrend,
} from "./icons";

const NAV = [
  { to: "/overview", label: "Health Overview", shortLabel: "Overview", Icon: IconOverview },
  { to: "/health", label: "Health Trends", shortLabel: "Trends", Icon: IconTrend },
  { to: "/environment", label: "Radiation Review", shortLabel: "ISS DosTel1", Icon: IconRadiation },
  { to: "/reviews", label: "Review Log & Export", shortLabel: "Audit Log", Icon: IconLog },
];

function Brand() {
  return (
    <NavLink to="/overview" className="brand">
      <span className="brand-mark-pill">
        <BrandMark className="brand-mark" />
      </span>
      <span className="brand-text">
        <span className="brand-name">CytoZoe</span>
        <span className="brand-sub">NASA OSDR · OFFLINE</span>
      </span>
    </NavLink>
  );
}

function RecentReviews() {
  const { recent, flashId } = useLive();
  const { open } = useDrawer();
  return (
    <section aria-labelledby="recent-title" className="side-recent-box">
      <div className="side-recent-head">
        <h2 id="recent-title" className="side-label">
          Recent reviews
        </h2>
        <span className="side-count tabular">{recent.length}</span>
      </div>
      {recent.length === 0 ? (
        <p className="side-empty">No saved follow-ups yet. Inspect any biomarker to record one.</p>
      ) : (
        <ul className="recent-list">
          {recent.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                className={`recent-item${flashId === r.id ? " flash" : ""}`}
                onClick={() => open({ kind: "review", id: r.id })}
                title={`${r.title} — ${REVIEW_LABEL[r.status]}`}
              >
                <span className="recent-dot" aria-hidden="true" />
                <div className="recent-copy">
                  <span className="t">{r.title}</span>
                  <span className="recent-status-text">{REVIEW_LABEL[r.status]}</span>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Toasts() {
  const { toasts } = useLive();
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div className="toast" key={t.id}>
          <IconCheck />
          {t.text}
        </div>
      ))}
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();
  const { state } = useServiceStatus();
  const { open } = useDrawer();

  useEffect(() => setMenuOpen(false), [location.pathname]);

  return (
    <div className="shell">
      <a className="skip-link" href="#main">
        Skip to main content
      </a>

      <div className="mobile-bar">
        <button
          type="button"
          className="menu-button"
          aria-expanded={menuOpen}
          aria-controls="primary-nav"
          aria-label={menuOpen ? "Close navigation menu" : "Open navigation menu"}
          onClick={() => setMenuOpen((o) => !o)}
        >
          {menuOpen ? <IconClose width={22} height={22} /> : <IconMenu width={22} height={22} />}
        </button>
        <Brand />
      </div>

      {menuOpen ? (
        <div className="scrim" onClick={() => setMenuOpen(false)} aria-hidden="true" />
      ) : null}

      <aside className={`sidebar${menuOpen ? " open" : ""}`} id="primary-nav">
        <Brand />
        <nav aria-label="Primary">
          <p className="side-label" aria-hidden="true">
            Workspace Modules
          </p>
          <ul className="nav-list">
            {NAV.map(({ to, label, Icon }, i) => (
              <li key={to}>
                <NavLink
                  to={to}
                  className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}
                >
                  <Icon />
                  <span className="nav-label">{label}</span>
                  <span className="nav-index" aria-hidden="true">
                    0{i + 1}
                  </span>
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        {state === "READY" ? <RecentReviews /> : null}

        {/* Floating Orbital Provenance Card (inspired by Terroni sidebar card) */}
        <div className="side-mission-card">
          <div className="side-mission-badge">
            <IconShield />
            <span>SHA-256 Pinned</span>
          </div>
          <h3>Offline Mission Mode</h3>
          <p>
            OSD-575 &amp; RadLab DosTel1 verified locally in WAL SQLite. Zero external network
            calls.
          </p>
          <div className="side-mission-actions">
            <button
              type="button"
              className="side-lime-btn"
              onClick={() => open({ kind: "sources" })}
            >
              Verify Hashes
            </button>
            <Link to="/" className="side-space-link">
              Space Landing →
            </Link>
          </div>
        </div>
      </aside>

      <main id="main" className="main" tabIndex={-1}>
        {/* Top Horizontal Channel & Crew Telemetry Bar (Terroni-inspired) */}
        <div className="workspace-topbar" aria-label="Quick module switcher and provenance bar">
          <div className="workspace-channels">
            <Link to="/" className="channel-tab">
              00 · Space Stage
            </Link>
            {NAV.map(({ to, shortLabel }, idx) => {
              const active = location.pathname.startsWith(to);
              return (
                <Link
                  key={to}
                  to={to}
                  className={`channel-tab${active ? " active" : ""}`}
                >
                  <span>0{idx + 1} · {shortLabel}</span>
                </Link>
              );
            })}
          </div>

          <div className="workspace-profile-bar">
            <a
              href={`${import.meta.env.BASE_URL}assets/docs/CytoZoe_One_Page_Project_Brief_Updated_90d54bc2.pdf`}
              target="_blank"
              rel="noreferrer"
              className="topbar-icon-pill"
              title="Open Official CytoZoe One-Page Brief PDF"
            >
              <IconDoc />
              <span>One-Page Brief</span>
            </a>
            <button
              type="button"
              className="crew-badge-pill"
              onClick={() => open({ kind: "sources" })}
            >
              <span className="crew-avatar">I4</span>
              <span className="crew-badge-copy">
                <small>Verified Cohort</small>
                <strong>OSD-575 &amp; DosTel1</strong>
              </span>
            </button>
          </div>
        </div>

        <div key={location.pathname} className="content anim-page-enter">
          {children}
        </div>
      </main>

      <Toasts />
    </div>
  );
}
