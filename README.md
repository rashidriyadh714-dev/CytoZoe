# CytoZoe — Offline-First Astronaut Health & Environmental Intelligence

> **Grounding astronaut health evidence, biomarker baseline telemetry, and ISS radiation intelligence in SHA-256 verified NASA OSDR datasets.**

CytoZoe is an offline-first spaceflight health intelligence system designed to support astronaut medical officers and flight surgeons in deep-space exploration and orbital operations where continuous ground communication cannot be guaranteed.

---

## Key Pillars

### 1. Internal Health — Biomarker & Baseline Telemetry
- **17 Serum Analytes & Longitudinal Tracking**: Comprehensive Metabolic Panel (CMP) tracking Glucose, Sodium, Potassium, Creatinine, Calcium, BUN, eGFR, and extended analytes across 7 mission visit phases (L-180, L-45, L-3, R+0, R+3, R+30, R+180).
- **Individual Preflight Baselines**: Retrospective and prospective prior-visit replay comparing in-flight shifts against astronaut-specific preflight baselines rather than generic terrestrial averages.
- **Evidence Provenance**: Exact row-level CSV and SHA-256 hash provenance for every biological finding.

### 2. External Environment — ISS Radiation Dose Rate & Sensor Integration
- **ISS Columbus DosTel1 Sensor Data**: Grounded in real radiation telemetry recorded aboard the European Columbus laboratory module on the International Space Station (1 March 2022).
- **Data Quality & Quarantine Integrity**: Conflicting duplicate timestamps are quarantined rather than averaged or cherry-picked, guaranteeing verifiable scientific integrity.
- **Orbital Pass Context**: Cumulative absorbed dose (µGy) and real-time dose rate (µGy/h) tracking through South Atlantic Anomaly (SAA) traversals and polar horn passes.

### 3. Offline Intelligence & Audit Handoff
- **Deterministic Mission Briefs (`MissionBriefV1`)**: Generates verifiable, deterministic clinical summaries and structured observation handoffs with zero LLM hallucinations.
- **Zero Cloud Calls Required**: Complete local execution using built-in WAL SQLite persistence with zero telemetry leaks or mandatory internet connectivity.
- **Self-Contained Audit Packets**: Export portable JSON and formatted clinical packets for flight surgeon review and ground handoff.

---

## Verified NASA Data Sources

| Dataset | Provider | Study ID | SHA-256 Checksum Verified |
|---|---|---|---|
| **Comprehensive Metabolic Panel (CMP)** | NASA OSDR / LSDS-8 | OSD-575 | `60b45d2906e414c330fceab9bdfc2826cfd4957e2f5b6fb89146522c0ffdb7ea` |
| **DosTel1 Silicon Radiation Dosimeter** | NASA RadLab / ESA Columbus | DosTel1 | `4f364e037b359fce8f38d33d83dc4e94b15eb5743b67c3bb8ba80e77d85c19aa` |

All data ingestion enforces cryptographic hash verification against `data/manifests/sources.json`.

---

## Tech Stack

- **Frontend**: [React 19](https://react.dev/), [TypeScript](https://www.typescriptlang.org/), [Vite](https://vite.dev/), [Tailwind CSS v4](https://tailwindcss.com/), [Recharts](https://recharts.org/), [Motion](https://motion.dev/), [Lucide React](https://lucide.dev/)
- **Backend & Storage**: [Express](https://expressjs.com/), [Node.js 22 built-in SQLite](https://nodejs.org/docs/latest-v22.x/api/sqlite.html) (`node:sqlite` DatabaseSync with WAL journal mode)
- **Deployment**: [GitHub Pages](https://pages.github.com/) via GitHub Actions

---

## Getting Started

### Prerequisites

- **Node.js**: Version 20.x or 22.x recommended
- **npm** (or bun / pnpm)

### Local Development

1. **Clone the repository:**
   ```bash
   git clone https://github.com/rashidriyadh714-dev/CytoZoe.git
   cd CytoZoe
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure environment (optional):**
   ```bash
   cp .env.example .env.local
   ```

4. **Launch the full-stack system:**
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000) in your browser.

### Production Build

To build the optimized static bundle:
```bash
npm run build
```

---

## GitHub Deployment

The repository includes a GitHub Actions workflow (`.github/workflows/deploy.yml`) that automatically builds and deploys the static CytoZoe interface to **GitHub Pages** on every push to the `main` branch.

To enable GitHub Pages in your GitHub repository:
1. Navigate to **Settings** > **Pages** in your repository.
2. Under **Build and deployment** > **Source**, select **GitHub Actions**.
3. Push to `main`, and the deployment action will publish the site automatically.

---

## License

GPL-3.0 / Apache-2.0. Grounded in publicly available NASA Open Science Data Repository (OSDR) research data.
