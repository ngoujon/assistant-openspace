import { useState } from "react";
import type { MissionAgentJournalEntry } from "@/types";

interface AgentJournalPanelProps {
  entries: MissionAgentJournalEntry[];
}

export function AgentJournalPanel({ entries }: AgentJournalPanelProps) {
  const [open, setOpen] = useState(false);
  if (entries.length === 0) return null;

  const sorted = [...entries].sort((a, b) => a.createdAt - b.createdAt);

  return (
    <div className="agent-journal">
      <button
        type="button"
        className="btn-secondary btn-compact agent-journal-toggle"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        Journal des agents ({entries.length})
      </button>
      {open ? (
        <ul className="agent-journal-list" aria-label="Journal détaillé par agent">
          {sorted.map((e, i) => (
            <li key={`${e.createdAt}-${i}`} className="agent-journal-item">
              <p className="agent-journal-head">
                <strong>{e.memberLabel}</strong>
                <span className="agent-journal-step">{e.stepLabel}</span>
              </p>
              <pre className="agent-journal-content">{e.content.slice(0, 1200)}
                {e.content.length > 1200 ? "\n…" : ""}
              </pre>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
