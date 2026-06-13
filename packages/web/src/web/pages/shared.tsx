import { useEffect, useRef, useState } from "react";
import { headingLevel, HEADING_CLASS, RichText } from "../lib/richtext";

type Block = {
  id: string;
  kind: "todo" | "note";
  text: string;
  done: boolean;
};

type Shared = {
  shareId: string;
  mode: "view" | "edit";
  title: string;
  blocks: Block[];
  updatedAt: number;
};

const DONE_TEXT_COLOR = "#9aa4b6";
const DONE_STRIKE = "#c0c7d2";

function SharedView({ params }: { params: { id: string } }) {
  const id = params.id;
  const [data, setData] = useState<Shared | null>(null);
  const [status, setStatus] = useState<"loading" | "ok" | "missing">("loading");
  const [saved, setSaved] = useState<"idle" | "saving" | "done">("idle");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetch(`/api/share/${id}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: Shared) => { setData(d); setStatus("ok"); })
      .catch(() => setStatus("missing"));
  }, [id]);

  const editable = data?.mode === "edit";

  const pushSave = (next: Shared) => {
    if (!editable) return;
    setSaved("saving");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      fetch(`/api/share/${id}/edit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: next.title, blocks: next.blocks }),
      })
        .then(() => { setSaved("done"); setTimeout(() => setSaved("idle"), 1200); })
        .catch(() => setSaved("idle"));
    }, 700);
  };

  const mutate = (fn: (d: Shared) => Shared) => {
    setData((prev) => {
      if (!prev) return prev;
      const next = fn(prev);
      pushSave(next);
      return next;
    });
  };

  const toggle = (bid: string) =>
    mutate((d) => ({ ...d, blocks: d.blocks.map((b) => b.id === bid ? { ...b, done: !b.done } : b) }));
  const updateText = (bid: string, text: string) =>
    mutate((d) => ({ ...d, blocks: d.blocks.map((b) => b.id === bid ? { ...b, text } : b) }));

  if (status === "loading") {
    return (
      <div className="min-h-screen grid place-items-center bg-white">
        <div className="text-[14px] text-[#9aa4b6]">Loading…</div>
      </div>
    );
  }
  if (status === "missing" || !data) {
    return (
      <div className="min-h-screen grid place-items-center bg-white">
        <div className="text-center">
          <div className="text-[18px] font-semibold text-ink mb-1">Note not found</div>
          <div className="text-[13px] text-[#9aa4b6]">This share link is invalid or was removed.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white text-ink font-sans">
      {/* top bar */}
      <div className="fixed top-0 inset-x-0 z-10 flex items-center justify-between px-5 h-12 border-b border-[#f0efed] bg-white/80 backdrop-blur">
        <a href="/" className="flex items-center gap-1.5 text-[13px] font-semibold text-ink">
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
            <path d="M11 2.5L13.5 5 5.5 13H3v-2.5L11 2.5z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
          </svg>
          Quill
        </a>
        <div className="flex items-center gap-2">
          <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${editable ? "bg-sky-50 text-[#0c7fc4]" : "bg-surface text-muted-ink"}`}>
            {editable ? "Can edit" : "View only"}
          </span>
          {editable && saved !== "idle" && (
            <span className="text-[11px] text-[#9aa4b6]">{saved === "saving" ? "Saving…" : "Saved"}</span>
          )}
        </div>
      </div>

      <div className="mx-auto max-w-[640px] px-6 pt-[14vh] pb-32">
        <h1 className="text-[40px] font-bold leading-tight tracking-tight mb-7">
          {data.title || "Untitled"}
        </h1>
        <div className="flex flex-col">
          {data.blocks.map((b) => (
            <SharedRow
              key={b.id}
              block={b}
              editable={!!editable}
              onToggle={() => toggle(b.id)}
              onText={(t) => updateText(b.id, t)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function SharedRow({
  block, editable, onToggle, onText,
}: {
  block: Block; editable: boolean; onToggle: () => void; onText: (t: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(block.text);
  const isTodo = block.kind === "todo";
  const head = headingLevel(block.text);
  const displayText = head ? head.rest : block.text;
  const baseColor = head
    ? "#37352f"
    : isTodo && block.done ? DONE_TEXT_COLOR : isTodo ? "#37352f" : "#73726e";

  const commit = () => { onText(draft.trim()); setEditing(false); };

  return (
    <div className="group flex items-start gap-2.5 rounded-[4px] px-2 py-1.5 -mx-2 hover:bg-surface transition-colors">
      {isTodo ? (
        <button
          onClick={editable ? onToggle : undefined}
          className="mt-0.5 shrink-0 h-[18px] w-[18px] grid place-items-center rounded-[4px] border transition-colors"
          style={{
            borderColor: block.done ? "#38BDF8" : "#cfcecb",
            background: block.done ? "#38BDF8" : "transparent",
            cursor: editable ? "pointer" : "default",
          }}
        >
          {block.done && (
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
              <path d="M2.5 6.2L4.8 8.5L9.5 3.5" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          )}
        </button>
      ) : (
        <span className="mt-[11px] shrink-0 h-[3px] w-[3px] rounded-full bg-faint" />
      )}

      {editing && editable ? (
        <textarea
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commit(); } }}
          rows={1}
          className="flex-1 text-[16px] leading-6 -mt-px resize-none outline-none bg-transparent"
        />
      ) : head ? (
        <span
          onClick={editable ? () => { setDraft(block.text); setEditing(true); } : undefined}
          className={`flex-1 break-words ${HEADING_CLASS[head.level]}`}
          style={{ color: baseColor, cursor: editable ? "text" : "default" }}
        >
          <RichText text={displayText} />
        </span>
      ) : (
        <span
          onClick={editable ? () => { setDraft(block.text); setEditing(true); } : undefined}
          className="flex-1"
          style={{ cursor: editable ? "text" : "default" }}
        >
          <RichText
            text={displayText}
            className="text-[16px] leading-6 break-words"
            style={{
              color: baseColor,
              textDecoration: isTodo && block.done ? "line-through" : "none",
              textDecorationColor: isTodo && block.done ? DONE_STRIKE : undefined,
              textDecorationThickness: isTodo && block.done ? "1.5px" : undefined,
            }}
          />
        </span>
      )}
    </div>
  );
}

export default SharedView;
