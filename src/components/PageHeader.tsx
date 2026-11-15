import { useEffect, type ReactNode } from "react";

export function StudyMetadataLine({ kind }: { kind: "health" | "environment" }) {
  return kind === "health" ? (
    <span className="study-provenance-tag">
      STUDY // NASA OSD-575 INSPIRATION4 · HISTORICAL SERUM CMP
    </span>
  ) : (
    <span className="study-provenance-tag">
      CASE STUDY // NASA RADLAB ISS COLUMBUS DOSTEL1 · 1 MARCH 2022
    </span>
  );
}

export function PageHeader({
  eyebrow,
  title,
  purpose,
  study,
  children,
}: {
  eyebrow: string;
  title: string;
  purpose: string;
  study?: "health" | "environment";
  children?: ReactNode;
}) {
  useEffect(() => {
    document.title = `${title} · CytoZoe`;
  }, [title]);

  return (
    <header className="page-head">
      <div className="page-head-text">
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p className="purpose">{purpose}</p>
      </div>
      <div className="page-head-meta">
        {study ? <StudyMetadataLine kind={study} /> : null}
        {children}
      </div>
    </header>
  );
}
