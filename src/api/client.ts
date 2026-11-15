import type {
  ApiErrorBody,
  DatasetInfo,
  EnvironmentView,
  Evidence,
  ExportPacket,
  Explanation,
  FullCmpPanelResponse,
  HealthOverview,
  HealthReplay,
  HealthTrend,
  MissionBrief,
  Participant,
  QuestionId,
  Review,
  ReviewDetail,
  ReviewList,
  ReviewStatus,
  Status,
} from "./contracts";

export class ApiError extends Error {
  status: number;
  code: string;
  details: Record<string, unknown>;
  constructor(status: number, body: ApiErrorBody) {
    super(body.message);
    this.status = status;
    this.code = body.code;
    this.details = body.details ?? {};
  }
}

export const SERVICE_UNAVAILABLE = "SERVICE_UNAVAILABLE";

/** Identifies this browser tab so live events can say "updated in another window". */
export const CLIENT_ID = (
  globalThis.crypto?.randomUUID?.() ?? `tab-${Date.now()}-${Math.random().toString(36).slice(2)}`
)
  .replace(/[^A-Za-z0-9-]/g, "")
  .slice(0, 64);

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      headers: {
        Accept: "application/json",
        "X-CytoZoe-Client": CLIENT_ID,
        ...(init?.headers ?? {}),
      },
    });
  } catch {
    throw new ApiError(0, {
      code: SERVICE_UNAVAILABLE,
      message: "The local CytoZoe service is not reachable. Start it and try again.",
      details: {},
    });
  }
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  if (!res.ok) {
    const err = (body ?? {}) as Partial<ApiErrorBody>;
    throw new ApiError(res.status, {
      code: err.code ?? (res.status >= 500 ? SERVICE_UNAVAILABLE : "HTTP_ERROR"),
      message: err.message ?? `The local service returned HTTP ${res.status}.`,
      details: err.details ?? {},
    });
  }
  return body as T;
}

const json = (method: string, data: unknown): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(data),
});

const qs = (params: Record<string, string | number | undefined | null>) => {
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") s.set(k, String(v));
  }
  const out = s.toString();
  return out ? `?${out}` : "";
};

export const api = {
  status: () => request<Status>("/api/status"),
  datasets: () => request<DatasetInfo[]>("/api/datasets"),
  participants: () => request<Participant[]>("/api/participants"),
  health: (participant: string, sample: string) =>
    request<HealthOverview>(`/api/health${qs({ participant, sample })}`),
  fullPanel: (participant: string, sample: string) =>
    request<FullCmpPanelResponse>(`/api/health/full-panel${qs({ participant, sample })}`),
  trend: (participant: string, marker: string) =>
    request<HealthTrend>(`/api/health/trend${qs({ participant, marker })}`),
  environment: () => request<EnvironmentView>("/api/environment"),
  evidence: (id: string) => request<Evidence>(`/api/evidence/${encodeURIComponent(id)}`),
  explain: (evidence_id: string, question_id: QuestionId) =>
    request<Explanation>("/api/explain", json("POST", { evidence_id, question_id })),
  ask: (evidence_id: string, message: string) =>
    request<Explanation>("/api/explain", json("POST", { evidence_id, message })),
  missionBrief: (participant: string, sample: string) =>
    request<MissionBrief>(`/api/mission/brief${qs({ participant, sample, mode: "historical" })}`),
  healthReplay: (participant: string) =>
    request<HealthReplay>(`/api/replay/health${qs({ participant })}`),
  reviews: (f: { case?: string; status?: string; participant?: string; page?: number }) =>
    request<ReviewList>(`/api/reviews${qs({ ...f, page_size: 200 })}`),
  review: (id: string) => request<ReviewDetail>(`/api/reviews/${encodeURIComponent(id)}`),
  createReview: (body: {
    finding_id: string;
    status: ReviewStatus;
    note: string;
    follow_up_date: string | null;
  }) => request<{ review: Review; created: boolean }>("/api/reviews", json("POST", body)),
  patchReview: (
    id: string,
    body: {
      version: number;
      status?: ReviewStatus;
      note?: string;
      follow_up_date?: string | null;
      clear_follow_up_date?: boolean;
    }
  ) => request<{ review: Review }>(`/api/reviews/${encodeURIComponent(id)}`, json("PATCH", body)),
  exportPreview: () => request<ExportPacket>("/api/export?format=json&download=false"),
  importCsv: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return request<{ status: string; dataset_id: string; sha256: string }>("/api/import", {
      method: "POST",
      body: form,
    });
  },
};
