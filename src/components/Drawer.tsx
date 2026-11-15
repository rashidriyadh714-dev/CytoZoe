import { useEffect, useId, useRef, type ReactNode } from "react";
import { IconClose } from "./icons";

export function Drawer({
  title,
  subtitle,
  onClose,
  children,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const id = useId();
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside
        className="drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby={id}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="drawer-head">
          <div style={{ minWidth: 0 }}>
            <h2 id={id}>{title}</h2>
            {subtitle ? <p className="small muted">{subtitle}</p> : null}
          </div>
          <button
            ref={closeRef}
            type="button"
            className="icon-btn"
            aria-label="Close panel"
            onClick={onClose}
          >
            <IconClose width={20} height={20} />
          </button>
        </header>
        <div className="drawer-body">{children}</div>
      </aside>
    </div>
  );
}
