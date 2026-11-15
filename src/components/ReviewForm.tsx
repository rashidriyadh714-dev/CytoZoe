import { useEffect, useId, useState, type FormEvent } from "react";
import { api, ApiError } from "../api/client";
import type { Review, ReviewStatus } from "../api/contracts";
import { useDrawer, useServiceStatus } from "../app/providers";
import { localDateTime, REVIEW_LABEL } from "../lib/format";
import { IconCheck, IconError } from "./icons";

const MAX = 2000;

export function ReviewForm({
  findingId,
  review,
  autoFocus = false,
  onSaved,
}: {
  findingId: string;
  review: Review | null;
  autoFocus?: boolean;
  onSaved?: (r: Review) => void;
}) {
  const id = useId();
  const { notifyChanged } = useDrawer();
  const { state } = useServiceStatus();
  const offline = state === "SERVICE_UNAVAILABLE";

  const [current, setCurrent] = useState<Review | null>(review);
  const [status, setStatus] = useState<ReviewStatus>(review?.status ?? "FOLLOW_UP_REQUESTED");
  const [note, setNote] = useState(review?.note ?? "");
  const [date, setDate] = useState(review?.follow_up_date ?? "");
  const [edited, setEdited] = useState(false);
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<Review | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  useEffect(() => {
    if (!edited) {
      setCurrent(review);
      setStatus(review?.status ?? "FOLLOW_UP_REQUESTED");
      setNote(review?.note ?? "");
      setDate(review?.follow_up_date ?? "");
    }
  }, [review, edited]);

  const edit =
    <T,>(fn: (v: T) => void) =>
    (v: T) => {
      setEdited(true);
      setSavedAt(null);
      fn(v);
    };

  const noteInvalid = !note.trim() || note.length > MAX;
  const dirty = !current
    ? Boolean(note.trim())
    : status !== current.status ||
      note.trim() !== current.note ||
      (date || null) !== current.follow_up_date;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (noteInvalid || saving || offline) return;
    setSaving(true);
    setError(null);
    setSavedAt(null);
    try {
      let saved: Review;
      if (!current) {
        const res = await api.createReview({
          finding_id: findingId,
          status,
          note,
          follow_up_date: date || null,
        });
        if (!res.created) {
          setCurrent(res.review);
          setConflict(res.review);
          setSaving(false);
          return;
        }
        saved = res.review;
      } else {
        const res = await api.patchReview(current.id, {
          version: current.version,
          status,
          note,
          ...(date ? { follow_up_date: date } : { clear_follow_up_date: true }),
        });
        saved = res.review;
      }
      setCurrent(saved);
      setConflict(null);
      setEdited(false);
      setSavedAt(saved.updated_at);
      notifyChanged();
      onSaved?.(saved);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        const latest = (err.details as { current?: Review }).current ?? null;
        setConflict(latest);
      } else {
        setError(
          err instanceof ApiError
            ? err.message
            : "Saving failed. Your draft is kept; try again."
        );
      }
    } finally {
      setSaving(false);
    }
  }

  function loadLatest() {
    if (!conflict) return;
    setCurrent(conflict);
    setStatus(conflict.status);
    setNote(conflict.note);
    setDate(conflict.follow_up_date ?? "");
    setConflict(null);
  }

  function keepDraft() {
    if (!conflict) return;
    setCurrent(conflict);
    setConflict(null);
  }

  return (
    <form className="stack" onSubmit={submit} noValidate aria-describedby={`${id}-scope`}>
      <p id={`${id}-scope`} className="small muted">
        Your own note. Status is an administrative workflow state, not the subject's medical
        status. Saved only on this computer.
      </p>
      <div className="field">
        <label className="field-label" htmlFor={`${id}-status`}>
          Review status
        </label>
        <select
          id={`${id}-status`}
          className="select"
          value={status}
          onChange={(e) => edit(setStatus)(e.target.value as ReviewStatus)}
        >
          {(Object.keys(REVIEW_LABEL) as ReviewStatus[]).map((s) => (
            <option key={s} value={s}>
              {REVIEW_LABEL[s]}
            </option>
          ))}
        </select>
      </div>

      <div className="field">
        <label className="field-label" htmlFor={`${id}-note`}>
          Reviewer note <span className="muted">(required)</span>
        </label>
        <textarea
          id={`${id}-note`}
          className="textarea"
          value={note}
          maxLength={MAX}
          autoFocus={autoFocus}
          placeholder="e.g. Request repeat measurement / discuss with qualified medical staff"
          aria-invalid={touched && noteInvalid}
          aria-describedby={`${id}-count ${id}-noteerr`}
          onChange={(e) => edit(setNote)(e.target.value)}
          onBlur={() => setTouched(true)}
        />
        <div className="field-hint tabular" id={`${id}-count`}>
          {note.length} / {MAX} characters
        </div>
        {touched && noteInvalid ? (
          <div className="small" style={{ color: "var(--error)" }} id={`${id}-noteerr`}>
            Write a short note before saving.
          </div>
        ) : (
          <span id={`${id}-noteerr`} />
        )}
      </div>

      <div className="field">
        <label className="field-label" htmlFor={`${id}-date`}>
          Follow-up date <span className="muted">(optional, reviewer-chosen)</span>
        </label>
        <input
          id={`${id}-date`}
          type="date"
          className="input"
          value={date}
          onChange={(e) => edit(setDate)(e.target.value)}
        />
      </div>

      {conflict ? (
        <div className="alert alert-review" role="alert">
          <IconError />
          <div className="stack" style={{ gap: 8 }}>
            <strong>
              This review changed elsewhere (now version {conflict.version},{" "}
              {REVIEW_LABEL[conflict.status]}).
            </strong>
            <span>
              Your draft is still here. Saved note: “
              {conflict.note.length > 140 ? `${conflict.note.slice(0, 140)}…` : conflict.note}”
            </span>
            <div className="btn-row">
              <button type="button" className="btn btn-secondary btn-sm" onClick={loadLatest}>
                Load saved version
              </button>
              <button type="button" className="btn btn-secondary btn-sm" onClick={keepDraft}>
                Keep my draft, then save again
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {error ? (
        <div className="alert alert-error" role="alert">
          <IconError />
          <div>
            {error}{" "}
            <button
              type="submit"
              className="btn btn-secondary btn-sm"
              style={{ marginLeft: 8 }}
            >
              Retry
            </button>
          </div>
        </div>
      ) : null}

      <div className="btn-row">
        <button
          type="submit"
          className="btn btn-primary"
          disabled={saving || offline || !!conflict || (!!current && !dirty)}
          aria-describedby={offline ? `${id}-offline` : undefined}
        >
          {saving ? "Saving…" : current ? "Save changes" : "Save follow-up"}
        </button>
        {offline ? (
          <span id={`${id}-offline`} className="small" style={{ color: "var(--error)" }}>
            Saving is disabled while the local service is unavailable.
          </span>
        ) : null}
        {current && !dirty && !savedAt ? (
          <span className="small muted">No unsaved changes.</span>
        ) : null}
      </div>

      <div aria-live="polite" className="live-region">
        {savedAt ? (
          <span className="status-text-saved">
            <IconCheck width={14} height={14} /> Saved locally · {localDateTime(savedAt)}
          </span>
        ) : current ? (
          <span className="small muted">
            Last saved {localDateTime(current.updated_at)} · version {current.version}
          </span>
        ) : null}
      </div>
    </form>
  );
}
