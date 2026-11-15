import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../api/client";
import type { Participant } from "../api/contracts";
import { useAsync } from "./useAsync";

export const MARKERS = ["glucose", "sodium", "potassium", "creatinine", "calcium"] as const;
export const MARKER_NAME: Record<string, string> = {
  glucose: "Glucose",
  sodium: "Sodium",
  potassium: "Potassium",
  creatinine: "Creatinine",
  calcium: "Calcium",
};
const DEFAULT = { participant: "C001", sample: "L-3", marker: "creatinine" };

/**
 * Participant / visit / marker live in the URL. Invalid params fall back to a visible valid selection
 * (never a fabricated value) and the reviewer is told what happened.
 */
export function useHealthSelection(withMarker: boolean) {
  const [params, setParams] = useSearchParams();
  const participants = useAsync<Participant[]>(() => api.participants(), []);
  const [notice, setNotice] = useState<string | null>(null);

  const resolved = useMemo(() => {
    const list = participants.data;
    if (!list || list.length === 0) return null;
    const reqP = params.get("participant");
    const reqS = params.get("sample");
    const reqM = params.get("marker");
    const problems: string[] = [];

    let p = list.find((x) => x.participant_id === reqP);
    if (!p) {
      p = list.find((x) => x.participant_id === DEFAULT.participant) ?? list[0];
      if (reqP) problems.push(`participant “${reqP.slice(0, 20)}”`);
    }
    let s = p.samples.find((x) => x.visit === reqS);
    if (!s) {
      s = p.samples.find((x) => x.visit === DEFAULT.sample) ?? p.samples[0];
      if (reqS) problems.push(`visit “${reqS.slice(0, 20)}”`);
    }
    let m = withMarker ? reqM : null;
    if (withMarker && !MARKERS.includes(m as (typeof MARKERS)[number])) {
      if (reqM) problems.push(`marker “${reqM.slice(0, 20)}”`);
      m = DEFAULT.marker;
    }
    return { participant: p, sample: s, marker: m, problems };
  }, [participants.data, params, withMarker]);

  useEffect(() => {
    if (!resolved) return;
    const want: Record<string, string> = {
      participant: resolved.participant.participant_id,
      sample: resolved.sample.visit,
    };
    if (withMarker && resolved.marker) want.marker = resolved.marker;
    const same = Object.entries(want).every(([k, v]) => params.get(k) === v);
    if (!same) {
      if (resolved.problems.length) {
        setNotice(
          `The requested ${resolved.problems.join(", ")} is not in this dataset. Showing ${want.participant} · ${want.sample} instead.`
        );
      }
      const next = new URLSearchParams(params);
      Object.entries(want).forEach(([k, v]) => next.set(k, v));
      setParams(next, { replace: true });
    }
  }, [resolved, params, setParams, withMarker]);

  const list = participants.data;
  const update = useCallback(
    (
      patch: Partial<{ participant: string; sample: string; marker: string }>,
      opts?: { replace?: boolean }
    ) => {
      setNotice(null);
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          Object.entries(patch).forEach(([k, v]) => v && next.set(k, v));
          if (patch.participant) {
            const np = list?.find((x) => x.participant_id === patch.participant);
            if (np && !np.samples.some((s) => s.visit === next.get("sample"))) {
              next.set("sample", np.samples[0].visit);
            }
          }
          return next;
        },
        { replace: opts?.replace }
      );
    },
    [list, setParams]
  );

  return { participants, resolved, notice, update };
}
