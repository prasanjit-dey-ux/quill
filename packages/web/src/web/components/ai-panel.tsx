import { useRef, useState } from "react";

type Action = "summarise" | "improve" | "suggest" | "ask";

const QUICK: { id: Action; label: string; icon: JSX.Element; sub: string }[] = [
  {
    id: "summarise",
    label: "Summarise",
    sub: "Tighten it into a few lines",
    icon: (
      <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
        <path d="M3 4h10M3 8h10M3 12h6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: "improve",
    label: "Improve writing",
    sub: "Clearer, better phrased",
    icon: (
      <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
        <path d="M11 2l3 3-8 8-3.5.5L3 10l8-8z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    id: "suggest",
    label: "Suggest tasks",
    sub: "Next steps as a checklist",
    icon: (
      <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
        <rect x="2.5" y="2.5" width="11" height="11" rx="2.5" stroke="currentColor" strokeWidth="1.3" />
        <path d="M5.5 8l1.8 1.8L11 6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
];

function ChatIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} width="17" height="17" viewBox="0 0 18 18" fill="none">
      <path d="M2.5 4.2c0-.9.7-1.7 1.7-1.7h9.6c1 0 1.7.8 1.7 1.7v6.1c0 1-.7 1.7-1.7 1.7H7.3L4 14.8c-.5.4-1.2 0-1.2-.6v-2H4.2"
        stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5.6 6.4h6.8M5.6 8.6h4.2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function Sparkle({ className = "" }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 18 18" fill="none">
      <path d="M9 1.5l1.6 4.4 4.4 1.6-4.4 1.6L9 13.5l-1.6-4.4L3 7.5l4.4-1.6L9 1.5z" fill="currentColor" />
      <path d="M14.5 11l.7 1.9 1.9.7-1.9.7-.7 1.9-.7-1.9-1.9-.7 1.9-.7.7-1.9z" fill="currentColor" opacity="0.6" />
    </svg>
  );
}

export function AIPanel({
  open,
  onClose,
  noteText,
  onInsert,
  onReplace,
  onAddTasks,
}: {
  open: boolean;
  onClose: () => void;
  noteText: () => string;
  onInsert: (text: string) => void;
  onReplace: (text: string) => void;
  onAddTasks: (lines: string[]) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState("");
  const [lastAction, setLastAction] = useState<Action | null>(null);
  const [ask, setAsk] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  const run = async (action: Action, instruction?: string) => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setBusy(true);
    setAnswer("");
    setLastAction(action);
    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, note: noteText(), instruction }),
        signal: ctrl.signal,
      });
      if (!res.body) throw new Error("no stream");
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let acc = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        acc += dec.decode(value, { stream: true });
        setAnswer(acc);
      }
    } catch (e: any) {
      if (e?.name !== "AbortError") setAnswer("Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const checklistLines = answer
    .split("\n")
    .map((l) => l.match(/^- \[( |x|X)\]\s?(.*)$/))
    .filter(Boolean)
    .map((m) => m![2].trim())
    .filter(Boolean);

  const isChecklist = (lastAction === "suggest" || lastAction === "ask") && checklistLines.length > 0;

  return (
    <div
      className="fixed top-0 right-0 h-full z-20 flex flex-col bg-[#fafafa] border-l border-[#ededeb] transition-transform duration-200 ease-out "
      style={{ width: 320, transform: open ? "translateX(0)" : "translateX(100%)" }}
    >
      {/* header */}
      <div className="flex items-center justify-between px-4 h-[52px] border-b border-[#ededeb]">
        <div className="flex items-center gap-2 text-ink">
          <span className="text-[#3b82f6]"><ChatIcon /></span>
          <span className="text-[13px] font-semibold tracking-tight">Quill AI</span>
        </div>
        <div className="flex items-center gap-1">
          {answer && (
            <button
              onClick={() => { setAnswer(""); setLastAction(null); }}
              className="text-[12px] text-faint hover:text-muted-ink px-1.5 py-1 rounded transition-colors"
            >
              Clear
            </button>
          )}
          <button
            onClick={onClose}
            className="h-7 w-7 grid place-items-center rounded-md text-muted-ink hover:bg-[#efefed] transition-colors"
            title="Close"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M3.5 3.5l7 7M10.5 3.5l-7 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>

      {/* body */}
      <div className="flex-1 overflow-y-auto px-3 py-3">
        {/* quick actions */}
        <div className="space-y-1">
          {QUICK.map((q) => (
            <button
              key={q.id}
              disabled={busy}
              onClick={() => run(q.id)}
              className={`w-full flex items-start gap-2.5 px-2.5 py-2 rounded-lg text-left transition-colors disabled:opacity-50 ${
                lastAction === q.id ? "bg-white shadow-sm" : "hover:bg-[#efefed]"
              }`}
            >
              <span className="mt-0.5 text-muted-ink">{q.icon}</span>
              <span className="flex-1">
                <span className="block text-[13px] font-medium text-ink leading-4">{q.label}</span>
                <span className="block text-[11px] text-faint mt-0.5">{q.sub}</span>
              </span>
            </button>
          ))}
        </div>

        {/* answer */}
        {(busy || answer) && (
          <div className="mt-4">
            <div className="flex items-center gap-1.5 mb-2 px-1">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-faint">Answer</span>
              {busy && (
                <span className="h-1.5 w-1.5 rounded-full bg-sky-400 animate-pulse" />
              )}
            </div>
            <div className="rounded-xl bg-white border border-[#ededeb] px-3.5 py-3 text-[13px] leading-[1.55] text-[#37352f] whitespace-pre-wrap break-words min-h-[44px]">
              {answer || <span className="text-faint">Thinking…</span>}
              {busy && answer && <span className="inline-block w-[2px] h-[14px] bg-sky-400 ml-0.5 align-middle animate-pulse" />}
            </div>

            {/* result actions */}
            {answer && !busy && (
              <div className="flex flex-wrap gap-1.5 mt-2.5">
                {isChecklist ? (
                  <ResultBtn primary onClick={() => onAddTasks(checklistLines)}>
                    Add {checklistLines.length} task{checklistLines.length > 1 ? "s" : ""}
                  </ResultBtn>
                ) : (
                  <>
                    {lastAction === "improve" && (
                      <ResultBtn primary onClick={() => onReplace(answer)}>Replace note</ResultBtn>
                    )}
                    <ResultBtn onClick={() => onInsert(answer)}>Add to note</ResultBtn>
                  </>
                )}
                <ResultBtn onClick={() => navigator.clipboard?.writeText(answer)}>Copy</ResultBtn>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ask box */}
      <div className="p-3 border-t border-[#ededeb]">
        <form
          onSubmit={(e) => { e.preventDefault(); if (ask.trim() && !busy) { run("ask", ask.trim()); setAsk(""); } }}
          className="relative"
        >
          <input
            value={ask}
            onChange={(e) => setAsk(e.target.value)}
            placeholder="Ask anything about this note…"
            disabled={busy}
            className="w-full text-[13px] bg-white border border-[#ededeb] rounded-lg pl-3 pr-9 py-2.5 outline-none focus:border-sky-300 focus:ring-2 focus:ring-sky-100 transition-all placeholder:text-faint disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!ask.trim() || busy}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 h-6 w-6 grid place-items-center rounded-md bg-ink text-white disabled:opacity-30 transition-opacity"
            title="Ask"
          >
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
              <path d="M7 11.5V2.5M3 6l4-4 4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </form>
      </div>
    </div>
  );
}

function ResultBtn({
  children,
  onClick,
  primary,
}: {
  children: React.ReactNode;
  onClick: () => void;
  primary?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`text-[12px] font-medium px-2.5 py-1.5 rounded-md transition-colors ${
        primary
          ? "bg-ink text-white hover:bg-[#2a2925]"
          : "bg-white border border-[#ededeb] text-muted-ink hover:bg-[#efefed]"
      }`}
    >
      {children}
    </button>
  );
}
