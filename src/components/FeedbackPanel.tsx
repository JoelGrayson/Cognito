import type { CheckResponse, Verdict } from "../../shared/types";

export interface Attempt extends CheckResponse {
  at: number;
}

interface Props {
  attempts: Attempt[];
  checking: boolean;
  error: string | null;
  disabled: boolean;
  onCheck: () => void;
}

const VERDICT: Record<Verdict, { label: string; className: string }> = {
  correct: { label: "Correct", className: "v-correct" },
  partial: { label: "Partially correct", className: "v-partial" },
  incorrect: { label: "Incorrect", className: "v-incorrect" },
  unclear: { label: "Couldn't read it", className: "v-unclear" },
};

export function FeedbackPanel({ attempts, checking, error, disabled, onCheck }: Props) {
  const latest = attempts[0];
  return (
    <aside className="feedback">
      <button className="check" onClick={onCheck} disabled={disabled || checking}>
        {checking ? "Checking…" : "Check my work"}
      </button>
      {disabled && !checking && <p className="muted">Write your answer on the page first.</p>}
      {error && <p className="error">{error}</p>}

      {!latest && !checking && !error && (
        <div className="empty">
          <p>Work the problem on the page, then hit <b>Check my work</b>.</p>
          <p className="muted">
            The grader writes feedback here and marks your page in red pen on its own layer, so your
            writing stays untouched.
          </p>
        </div>
      )}

      {latest && (
        <div className={`verdict ${VERDICT[latest.verdict].className}`}>
          <div className="verdict-label">{VERDICT[latest.verdict].label}</div>
          <p>{latest.feedback}</p>
          {latest.issues.length > 0 && (
            <ul>
              {latest.issues.map((it, i) => (
                <li key={i}>{it}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {attempts.length > 1 && (
        <div className="history">
          <div className="panel-title">Earlier attempts</div>
          {attempts.slice(1).map((a) => (
            <div key={a.at} className={`history-row ${VERDICT[a.verdict].className}`}>
              <span className="verdict-dot" />
              <span>{VERDICT[a.verdict].label}</span>
              <span className="muted">{new Date(a.at).toLocaleTimeString([], { timeStyle: "short" })}</span>
            </div>
          ))}
        </div>
      )}
    </aside>
  );
}
