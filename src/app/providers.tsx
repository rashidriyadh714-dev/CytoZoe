import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { api, CLIENT_ID } from "../api/client";
import type { Review, Status } from "../api/contracts";
import { REVIEW_LABEL } from "../lib/format";

/* ---------- Service readiness state ---------- */
export type ServiceState = "BOOTING" | "READY" | "NO_DATA" | "SERVICE_UNAVAILABLE";

interface StatusCtx {
  status: Status | null;
  state: ServiceState;
  refresh: () => void;
}

const StatusContext = createContext<StatusCtx>({
  status: null,
  state: "BOOTING",
  refresh: () => {},
});

export function StatusProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [state, setState] = useState<ServiceState>("BOOTING");
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    let active = true;
    async function check() {
      try {
        const s = await api.status();
        if (!active) return;
        setStatus(s);
        if (s.ready || s.datasets_imported >= 2) {
          setState("READY");
        } else {
          setState("NO_DATA");
        }
      } catch {
        if (!active) return;
        setState("SERVICE_UNAVAILABLE");
      }
    }
    void check();
    const id = window.setInterval(check, 15000);
    return () => {
      active = false;
      window.clearInterval(id);
    };
  }, [tick]);

  const value = useMemo(() => ({ status, state, refresh }), [status, state, refresh]);
  return <StatusContext.Provider value={value}>{children}</StatusContext.Provider>;
}

export const useServiceStatus = () => useContext(StatusContext);

/* ---------- Drawer navigation & global data refresh ---------- */
export type DrawerTarget =
  | { kind: "evidence"; id: string; section?: "explain" | "review" }
  | { kind: "sources" }
  | { kind: "review"; id: string }
  | { kind: "brief-pdf" };

interface DrawerCtx {
  target: DrawerTarget | null;
  open: (t: DrawerTarget) => void;
  close: () => void;
  dataVersion: number;
  notifyChanged: () => void;
}

const DrawerContext = createContext<DrawerCtx>({
  target: null,
  open: () => {},
  close: () => {},
  dataVersion: 0,
  notifyChanged: () => {},
});

export function DrawerProvider({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<DrawerTarget | null>(null);
  const [dataVersion, setDataVersion] = useState(0);
  const opener = useRef<HTMLElement | null>(null);

  const open = useCallback((t: DrawerTarget) => {
    if (!opener.current) opener.current = document.activeElement as HTMLElement | null;
    setTarget(t);
  }, []);

  const close = useCallback(() => {
    setTarget(null);
    const el = opener.current;
    opener.current = null;
    window.setTimeout(() => el?.focus?.(), 0);
  }, []);

  const notifyChanged = useCallback(() => setDataVersion((v) => v + 1), []);
  const value = useMemo(
    () => ({ target, open, close, dataVersion, notifyChanged }),
    [target, open, close, dataVersion, notifyChanged]
  );
  return <DrawerContext.Provider value={value}>{children}</DrawerContext.Provider>;
}

export const useDrawer = () => useContext(DrawerContext);

/* ---------- Live sync over server-sent events ---------- */
export interface Toast {
  id: number;
  text: string;
}

interface LiveCtx {
  connected: boolean;
  recent: Review[];
  flashId: string | null;
  toasts: Toast[];
  pushToast: (text: string) => void;
}

const LiveContext = createContext<LiveCtx>({
  connected: false,
  recent: [],
  flashId: null,
  toasts: [],
  pushToast: () => {},
});

export function LiveProvider({ children }: { children: ReactNode }) {
  const { notifyChanged, dataVersion } = useDrawer();
  const { state } = useServiceStatus();
  const [connected, setConnected] = useState(false);
  const [recent, setRecent] = useState<Review[]>([]);
  const [flashId, setFlashId] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const pushToast = useCallback((text: string) => {
    const id = nextId.current++;
    setToasts((t) => [...t.slice(-2), { id, text }]);
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4500);
  }, []);

  useEffect(() => {
    if (state !== "READY") return;
    api
      .reviews({})
      .then((r) => setRecent(r.items.slice(0, 8)))
      .catch(() => {});
  }, [dataVersion, state]);

  useEffect(() => {
    if (state !== "READY" || typeof EventSource === "undefined") return;
    const es = new EventSource("/api/events");
    es.addEventListener("hello", () => setConnected(true));
    es.onerror = () => setConnected(false);

    const onReview = (kind: string) => (ev: MessageEvent) => {
      const data = JSON.parse(ev.data) as { review: Review; origin?: string };
      notifyChanged();
      setFlashId(data.review.id);
      window.setTimeout(() => setFlashId(null), 1700);
      if (data.origin && data.origin !== CLIENT_ID) {
        pushToast(
          `${kind === "review.created" ? "New review" : "Review updated"} in another window: ${
            data.review.title
          } — ${REVIEW_LABEL[data.review.status]}`
        );
      }
    };

    es.addEventListener("review.created", onReview("review.created"));
    es.addEventListener("review.updated", onReview("review.updated"));
    es.addEventListener("dataset.imported", () => {
      notifyChanged();
      pushToast("A dataset was imported. Views refreshed.");
    });

    return () => {
      es.close();
      setConnected(false);
    };
  }, [state, notifyChanged, pushToast]);

  const value = useMemo(
    () => ({ connected, recent, flashId, toasts, pushToast }),
    [connected, recent, flashId, toasts, pushToast]
  );
  return <LiveContext.Provider value={value}>{children}</LiveContext.Provider>;
}

export const useLive = () => useContext(LiveContext);
