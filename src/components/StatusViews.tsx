import type { ReactNode } from "react";
import { ApiError, SERVICE_UNAVAILABLE } from "../api/client";
import { IconError, IconInfo } from "./icons";

export function Skeleton({ height = 160, label = "Loading…" }: { height?: number; label?: string }) {
  return (
    <div className="skeleton" style={{ height }} role="status" aria-live="polite">
      <span className="sr-only">{label}</span>
    </div>
  );
}

export function ErrorState({
  error,
  onRetry,
  title,
}: {
  error: ApiError;
  onRetry?: () => void;
  title?: string;
}) {
  const unavailable = error.code === SERVICE_UNAVAILABLE;
  const noData = error.code === "NO_DATA";
  return (
    <div className={`alert ${noData ? "alert-info" : "alert-error"}`} role="alert">
      {noData ? <IconInfo /> : <IconError />}
      <div className="stack" style={{ gap: 6 }}>
        <strong>
          {title ??
            (unavailable
              ? "Local service unavailable"
              : noData
              ? "No data imported"
              : "Could not load this view")}
        </strong>
        <span>{error.message}</span>
        {noData ? <span>No values are fabricated while data is missing.</span> : null}
        {onRetry ? (
          <div>
            <button type="button" className="btn btn-secondary btn-sm" onClick={onRetry}>
              Try again
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}

export function Alert({
  tone,
  children,
}: {
  tone: "info" | "review" | "error" | "success";
  children: ReactNode;
}) {
  return (
    <div className={`alert alert-${tone}`} role={tone === "error" ? "alert" : "status"}>
      {tone === "error" ? <IconError /> : <IconInfo />}
      <div>{children}</div>
    </div>
  );
}

export function SetupScreen({ kind }: { kind: "NO_DATA" | "SERVICE_UNAVAILABLE" }) {
  return (
    <div className="center-screen">
      <div className="card status-card stack">
        <h1 style={{ fontSize: 24, lineHeight: "32px" }}>
          {kind === "NO_DATA" ? "No research data imported yet" : "Local service unavailable"}
        </h1>
        {kind === "NO_DATA" ? (
          <>
            <p className="muted">
              CytoZoe never fabricates measurements. Stage the pinned NASA files once, then import them:
            </p>
            <pre className="formula">
              python scripts/fetch_data.py --all{"\n"}python scripts/verify_data.py --strict{"\n"}
              python scripts/import_data.py --all
            </pre>
            <p className="muted small">
              You can also import a documented CSV from the “Sources &amp; quality” panel.
            </p>
          </>
        ) : (
          <>
            <p className="muted">
              The interface cannot reach the CytoZoe service on this computer. Saving is disabled
              until it is back — nothing is stored in the browser alone.
            </p>
            <pre className="formula">npm run dev</pre>
            <p className="muted small">This page re-checks the service every 15 seconds.</p>
          </>
        )}
      </div>
    </div>
  );
}
