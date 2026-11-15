import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { api, ApiError } from "../api/client";
import type { Explanation, QuestionId } from "../api/contracts";
import { BrandMark, IconCheck, IconSend } from "./icons";

const PRIMARY: { id: QuestionId; label: string }[] = [
  { id: "EXPLAIN_RESULT", label: "Explain this result" },
  { id: "HOW_CALCULATED", label: "How was this calculated?" },
  { id: "SOURCE_LOCATION", label: "Where did this number come from?" },
  { id: "LIMITATIONS", label: "What can this dataset not tell us?" },
];

const BOUNDARY: { id: QuestionId; label: string }[] = [
  { id: "DIAGNOSIS_REQUEST", label: "Does this mean something is wrong?" },
  { id: "CAUSATION_REQUEST", label: "Did radiation cause this?" },
];

type Msg =
  | { id: number; role: "user"; text: string }
  | { id: number; role: "assistant"; answer: Explanation }
  | { id: number; role: "error"; text: string };

/**
 * Deterministic Verified Explanation Engine UI.
 * Typed questions are routed by fixed keyword rules on the server to verified templates;
 * there is no language model, and the typed text is never inserted into an answer.
 */
export function Assistant({ evidenceId }: { evidenceId: string }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [pending, setPending] = useState(false);
  const [draft, setDraft] = useState("");
  const nextId = useRef(1);
  const endRef = useRef<HTMLDivElement>(null);
  const inputId = useId();

  useEffect(() => {
    setMsgs([]);
  }, [evidenceId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest" });
  }, [msgs, pending]);

  async function send(text: string, questionId?: QuestionId) {
    const clean = text.trim();
    if (!clean || pending) return;
    setMsgs((m) => [...m, { id: nextId.current++, role: "user", text: clean }]);
    setDraft("");
    setPending(true);
    try {
      const answer = questionId
        ? await api.explain(evidenceId, questionId)
        : await api.ask(evidenceId, clean.slice(0, 500));
      setMsgs((m) => [...m, { id: nextId.current++, role: "assistant", answer }]);
    } catch (err) {
      setMsgs((m) => [
        ...m,
        {
          id: nextId.current++,
          role: "error",
          text: err instanceof ApiError ? err.message : "The explanation could not be loaded.",
        },
      ]);
    } finally {
      setPending(false);
    }
  }

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void send(draft);
  };
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send(draft);
    }
  };

  const lastQ = [...msgs].reverse().find((m) => m.role === "assistant") as
    | Extract<Msg, { role: "assistant" }>
    | undefined;

  return (
    <section className="chat" aria-labelledby="assistant-title">
      <div className="chat-head">
        <h3 id="assistant-title">Ask about this result</h3>
        <span className="meta status-text-saved">
          <IconCheck width={14} height={14} /> Verified template engine
        </span>
      </div>

      <div className="chat-log" aria-live="polite">
        {msgs.length === 0 ? (
          <div className="msg-assistant">
            <BrandMark className="avatar" />
            <div className="body">
              <p>
                I can explain this result using only the evidence shown here — the source value, the
                supplied range and the calculation. I never diagnose or invent causal links.
              </p>
            </div>
          </div>
        ) : null}

        {msgs.map((m) =>
          m.role === "user" ? (
            <div key={m.id} className="msg-user">
              {m.text}
            </div>
          ) : m.role === "error" ? (
            <div key={m.id} className="alert alert-error" role="alert">
              {m.text}
            </div>
          ) : (
            <div key={m.id} className="msg-assistant">
              <BrandMark className="avatar" />
              <div className="body">
                <div className="who">
                  CytoZoe · {m.answer.label}
                  {m.answer.question_id ? (
                    <span className="meta"> · {m.answer.question}</span>
                  ) : null}
                </div>
                {m.answer.paragraphs.map((p, i) => (
                  <p key={i}>{p}</p>
                ))}
                {m.answer.facts.length ? (
                  <details className="disclosure" style={{ marginTop: 0 }}>
                    <summary>Evidence used ({m.answer.facts.length} facts)</summary>
                    <dl className="kv small facts">
                      {m.answer.facts.map((f) => (
                        <FactRow key={f.label} label={f.label} value={f.value} />
                      ))}
                    </dl>
                  </details>
                ) : null}
                <p className="meta">
                  Sources: {m.answer.source_ids.join(" · ")} — {m.answer.generated_by}.
                </p>
              </div>
            </div>
          )
        )}

        {pending ? (
          <div className="msg-assistant">
            <BrandMark className="avatar" />
            <div className="typing" aria-label="Preparing answer">
              <span />
              <span />
              <span />
            </div>
          </div>
        ) : null}
        <div ref={endRef} />
      </div>

      <div className="suggestions" role="group" aria-label="Suggested questions">
        {PRIMARY.map((q) => (
          <button
            key={q.id}
            type="button"
            className="chip"
            aria-pressed={lastQ?.answer.question_id === q.id}
            disabled={pending}
            onClick={() => send(q.label, q.id)}
          >
            {q.label}
          </button>
        ))}
        {BOUNDARY.map((q) => (
          <button
            key={q.id}
            type="button"
            className="chip quiet"
            aria-pressed={lastQ?.answer.question_id === q.id}
            disabled={pending}
            onClick={() => send(q.label, q.id)}
          >
            {q.label}
          </button>
        ))}
      </div>

      <form className="composer" onSubmit={onSubmit}>
        <label htmlFor={inputId} className="sr-only">
          Ask a question about this result
        </label>
        <textarea
          id={inputId}
          rows={1}
          value={draft}
          maxLength={500}
          placeholder="Ask about this result…"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKey}
        />
        <button
          type="submit"
          className="send"
          disabled={!draft.trim() || pending}
          aria-label="Send question"
        >
          <IconSend />
        </button>
      </form>
      <p className="composer-note">
        Answers come from fixed, source-bound templates — no language model, no diagnosis.
      </p>
    </section>
  );
}

function FactRow({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </>
  );
}
