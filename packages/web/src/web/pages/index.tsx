import { useEffect, useRef, useState } from "react";
import {
  playKey,
  kindForKey,
  initSound,
  ensureProfile,
  playCheck,
  playDelete,
  type Switch,
} from "../lib/sound";
import { ContextMenu, type MenuState } from "../components/context-menu";
import { AutoTextarea } from "../components/auto-textarea";
import { AIPanel } from "../components/ai-panel";
import { headingLevel, HEADING_CLASS, RichText } from "../lib/richtext";

type Block = {
  id: string;
  kind: "todo" | "note";
  text: string;
  done: boolean;
  color?: string; // user-set text color key (e.g. "sky", "blue", "red")
};

type Page = {
  id: string;
  title: string;
  blocks: Block[];
  folderId?: string | null;
  shareId?: string;
  shareMode?: "view" | "edit";
};

type Folder = {
  id: string;
  name: string;
  open?: boolean;
};

const LS_PAGES    = "quill.pages.v1";
const LS_ACTIVE   = "quill.active.v1";
const LS_MUTED    = "quill.muted";
const LS_SWITCH   = "quill.switch";
const LS_SIDEBAR  = "quill.leftbar";
const LS_AIPANEL  = "quill.aipanel";
const LS_FOLDERS  = "quill.folders.v1";
const LS_OWNERKEY = "quill.ownerkey";

const DONE_TEXT_COLOR = "#7DD3FC";       // light sky for completed task text
const DONE_STRIKE     = "#38BDF8";        // sky-blue strikethrough

// user text-color palette (matches context-menu.tsx TEXT_COLORS)
const COLOR_MAP: Record<string, string> = {
  default: "#37352f",
  sky:     "#38BDF8",
  blue:    "#3B82F6",
  purple:  "#8B5CF6",
  pink:    "#EC4899",
  red:     "#EF4444",
  orange:  "#F97316",
  yellow:  "#EAB308",
  green:   "#22C55E",
  gray:    "#9CA3AF",
};

function ownerKey(): string {
  if (typeof window === "undefined") return "anon";
  let k = localStorage.getItem(LS_OWNERKEY);
  if (!k) { k = Math.random().toString(36).slice(2) + Date.now().toString(36); localStorage.setItem(LS_OWNERKEY, k); }
  return k;
}

function load<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : (JSON.parse(v) as T);
  } catch { return fallback; }
}

function uid() { return Math.random().toString(36).slice(2, 10); }

// "/add time" slash command → live time token "{{time}}"
const TIME_CMD_RE = /\/add\s+time\b ?/i;
function applyTimeCmd(value: string): string {
  return value.replace(TIME_CMD_RE, "{{time}} ");
}

function parseMd(text: string): { done: boolean; rest: string } | null {
  const m = text.match(/^- \[( |x|X)\]\s?(.*)$/);
  if (!m) return null;
  return { done: m[1].toLowerCase() === "x", rest: m[2] };
}

function defaultPage(): Page {
  return {
    id: uid(),
    title: "Today",
    blocks: [
      { id: uid(), kind: "todo", text: "Type to hear deep Holy Panda thock", done: false },
      { id: uid(), kind: "todo", text: "Click any line to edit it", done: false },
      { id: uid(), kind: "note", text: "Tip: type \"- [ ]\" + space or enter for a checkbox", done: false },
      { id: uid(), kind: "todo", text: "Check me off", done: true },
    ],
  };
}

// ── Pomodoro + Clock ───────────────────────────────────────────────────────
const SKY = "#38BDF8";
const PRESETS = [
  { min: 30, name: "Quick focus" },
  { min: 45, name: "Deep work" },
  { min: 60, name: "Full session" },
];

const LS_POMO = "quill.pomo.v1";
type PomoState = { x: number; y: number; scale: number; hidden: boolean };

function Pomodoro() {
  const [now, setNow] = useState(() => new Date());
  // running timer state
  const [total, setTotal] = useState(0);      // selected length in seconds
  const [left, setLeft] = useState(0);        // remaining seconds
  const [running, setRunning] = useState(false);
  const [hover, setHover] = useState<number | null>(null);

  // widget state (scale, visibility only — no drag)
  const [pomo, setPomo] = useState<PomoState>(() =>
    load<PomoState>(LS_POMO, { x: 20, y: 20, scale: 1, hidden: false })
  );
  const [menu, setMenu] = useState(false);
  useEffect(() => { localStorage.setItem(LS_POMO, JSON.stringify(pomo)); }, [pomo]);

  const bump = (d: number) =>
    setPomo((p) => ({ ...p, scale: Math.min(1.6, Math.max(0.8, +(p.scale + d).toFixed(2))) }));

  // live clock tick
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  // countdown tick
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      setLeft((l) => {
        if (l <= 1) {
          setRunning(false);
          // gentle chime
          try {
            const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
            const o = ctx.createOscillator();
            const g = ctx.createGain();
            o.connect(g); g.connect(ctx.destination);
            o.frequency.value = 880; o.type = "sine";
            g.gain.setValueAtTime(0.0001, ctx.currentTime);
            g.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.02);
            g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 1.1);
            o.start(); o.stop(ctx.currentTime + 1.2);
          } catch {}
          return 0;
        }
        return l - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [running]);

  const start = (min: number) => {
    const secs = min * 60;
    setTotal(secs); setLeft(secs); setRunning(true);
  };
  const reset = () => { setRunning(false); setTotal(0); setLeft(0); };

  const mm = (s: number) => String(Math.floor(s / 60)).padStart(2, "0");
  const ss = (s: number) => String(s % 60).padStart(2, "0");
  const pct = total > 0 ? (left / total) * 100 : 0;

  const h = now.getHours().toString().padStart(2, "0");
  const m = now.getMinutes().toString().padStart(2, "0");
  const s = now.getSeconds().toString().padStart(2, "0");

  // ── hidden: show a tiny restore pill ──
  if (pomo.hidden) {
    return (
      <div className="fixed z-10 right-5 bottom-5">
        <button
          onClick={() => setPomo((p) => ({ ...p, hidden: false }))}
          title="Show timer"
          className="h-8 w-8 grid place-items-center rounded-full bg-white border border-[#eceae7] shadow-sm text-muted-ink hover:text-ink transition-colors"
        >
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
            <circle cx="8" cy="9" r="5.3" stroke="currentColor" strokeWidth="1.3" />
            <path d="M8 9V6.3M6.3 1.7h3.4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    );
  }

  // ── inner content (active timer OR idle clock) ──
  const inner = total > 0 ? (
    <div className="flex items-center gap-2.5 rounded-full bg-white border border-[#eceae7] shadow-sm pl-3 pr-1.5 py-1.5">
      <div className="relative h-6 w-6 grid place-items-center">
        <svg className="absolute -rotate-90" width="24" height="24" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="10" fill="none" stroke="#eef0f1" strokeWidth="2.5" />
          <circle
            cx="12" cy="12" r="10" fill="none" stroke={SKY} strokeWidth="2.5" strokeLinecap="round"
            strokeDasharray={2 * Math.PI * 10}
            strokeDashoffset={2 * Math.PI * 10 * (1 - pct / 100)}
            style={{ transition: "stroke-dashoffset 1s linear" }}
          />
        </svg>
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: running ? SKY : "#cbd5e1" }} />
      </div>
      <span className="font-mono text-[13px] tabular-nums tracking-wide" style={{ color: "#374151" }}>
        {mm(left)}:{ss(left)}
      </span>
      <button
        onClick={() => setRunning((r) => !r)}
        title={running ? "Pause" : "Resume"}
        className="h-6 w-6 grid place-items-center rounded-full text-muted-ink hover:bg-surface transition-colors"
      >
        {running ? (
          <svg width="11" height="11" viewBox="0 0 12 12" fill="currentColor"><rect x="2.5" y="2" width="2.5" height="8" rx="0.6"/><rect x="7" y="2" width="2.5" height="8" rx="0.6"/></svg>
        ) : (
          <svg width="11" height="11" viewBox="0 0 12 12" fill="currentColor"><path d="M3 2l7 4-7 4z"/></svg>
        )}
      </button>
      <button
        onClick={reset}
        title="Stop"
        className="h-6 w-6 grid place-items-center rounded-full text-faint hover:bg-surface hover:text-muted-ink transition-colors"
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M1.5 1.5l7 7M8.5 1.5l-7 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
      </button>
    </div>
  ) : (
    <div className="flex items-center gap-2.5 rounded-full bg-white border border-[#eceae7] shadow-sm px-3 py-1.5">
      <span title="Local time" className="font-mono text-[12px] select-none tracking-wide tabular-nums" style={{ color: "#6b7280" }}>
        {h}:{m}<span style={{ color: "#aab2c0" }}>:{s}</span>
      </span>
      <span className="h-3.5 w-px bg-[#e7e5e2]" />
      <svg className="text-muted-ink shrink-0" width="13" height="13" viewBox="0 0 16 16" fill="none">
        <circle cx="8" cy="9" r="5.3" stroke="currentColor" strokeWidth="1.3" />
        <path d="M8 9V6.3M6.3 1.7h3.4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      </svg>
      <div className="flex items-center gap-0.5">
        {PRESETS.map((p) => (
          <div key={p.min} className="relative">
            <button
              onClick={() => start(p.min)}
              onMouseEnter={() => setHover(p.min)}
              onMouseLeave={() => setHover(null)}
              className="px-1.5 py-0.5 rounded-md text-[12px] font-semibold tabular-nums text-[#5a6273] hover:text-[#0EA5E9] hover:bg-sky-50 transition-colors"
            >
              {p.min}
            </button>
            {hover === p.min && (
              <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 whitespace-nowrap rounded-md bg-ink px-2 py-1 text-[11px] font-medium text-white shadow-md">
                {p.name}
                <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-ink" />
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );

  // ── floating shell: fixed position, scalable + 3-dot menu ──
  return (
    <div
      className="fixed z-10 select-none right-5 bottom-5"
      style={{ transform: `scale(${pomo.scale})`, transformOrigin: "bottom right" }}
    >
      <div className="group/pomo relative flex items-center gap-1">
        {inner}

        {/* three-dot menu trigger */}
        <button
          onClick={() => setMenu((v) => !v)}
          title="Options"
          className={`h-6 w-6 grid place-items-center rounded-full transition-all ${
            menu ? "opacity-100 bg-white border border-[#eceae7] text-ink shadow-sm"
                 : "opacity-0 group-hover/pomo:opacity-100 text-muted-ink hover:bg-white hover:shadow-sm"
          }`}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <circle cx="8" cy="3.5" r="1.3"/><circle cx="8" cy="8" r="1.3"/><circle cx="8" cy="12.5" r="1.3"/>
          </svg>
        </button>

        {menu && (
          <>
            <div className="fixed inset-0 z-0" onClick={() => setMenu(false)} />
            <div className="absolute bottom-full right-0 mb-2 z-10 w-44 rounded-lg border border-[#e7e5e2] bg-white shadow-lg py-1">
              <button
                onClick={() => { setPomo((p) => ({ ...p, hidden: true })); setMenu(false); }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-[13px] text-[#37352f] hover:bg-surface transition-colors"
              >
                <svg className="shrink-0 text-[#8b8b87]" width="14" height="14" viewBox="0 0 16 16" fill="none">
                  <path d="M2 8s2.2-3.8 6-3.8S14 8 14 8s-2.2 3.8-6 3.8S2 8 2 8z" stroke="currentColor" strokeWidth="1.3"/>
                  <path d="M2.5 2.5l11 11" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                </svg>
                Hide
              </button>
              <div className="px-3 py-1.5 flex items-center justify-between text-[13px] text-[#37352f]">
                <span className="flex items-center gap-2">
                  <svg className="shrink-0 text-[#8b8b87]" width="14" height="14" viewBox="0 0 16 16" fill="none">
                    <path d="M8 2v12M2 8h12" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                  </svg>
                  Scale
                </span>
                <span className="flex items-center gap-1">
                  <button onClick={() => bump(-0.1)} className="h-5 w-5 grid place-items-center rounded text-muted-ink hover:bg-surface">
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 5h6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>
                  </button>
                  <span className="text-[11px] tabular-nums text-faint w-7 text-center">{Math.round(pomo.scale * 100)}%</span>
                  <button onClick={() => bump(0.1)} className="h-5 w-5 grid place-items-center rounded text-muted-ink hover:bg-surface">
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M5 2v6M2 5h6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>
                  </button>
                </span>
              </div>
              <button
                onClick={() => { setPomo((p) => ({ ...p, scale: 1 })); setMenu(false); }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-[13px] text-[#37352f] hover:bg-surface transition-colors"
              >
                <svg className="shrink-0 text-[#8b8b87]" width="14" height="14" viewBox="0 0 16 16" fill="none">
                  <path d="M8 3a5 5 0 103.5 1.5M8 1v3l2-1.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                Reset scale
              </button>
              <div className="px-3 pt-1 pb-1 text-[10.5px] text-[#b3b3af] border-t border-[#f0efed] mt-1">
                Drag the timer to move it anywhere
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Left Sidebar ───────────────────────────────────────────────────────────
function PageRow({
  p, isActive, editingId, editVal, setEditVal, startRename, commitRename, setEditingId,
  onSelect, onDelete, canDelete, indent,
}: {
  p: Page; isActive: boolean; editingId: string | null; editVal: string;
  setEditVal: (v: string) => void; startRename: (p: Page) => void;
  commitRename: (id: string) => void; setEditingId: (v: string | null) => void;
  onSelect: (id: string) => void; onDelete: (id: string) => void; canDelete: boolean; indent: boolean;
}) {
  const pending = p.blocks.filter((b) => b.kind === "todo" && !b.done).length;
  return (
    <div
      className={`group flex items-center gap-1.5 px-2 py-1.5 rounded-[6px] cursor-pointer transition-colors ${
        isActive ? "bg-white text-ink" : "hover:bg-[#efefed] text-[#6b6b66]"
      }`}
      style={indent ? { marginLeft: 16 } : undefined}
      onClick={() => onSelect(p.id)}
      onDoubleClick={() => startRename(p)}
    >
      <svg className="shrink-0" width="13" height="13" viewBox="0 0 14 14" fill="none">
        <rect x="2" y="1.5" width="10" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.3"/>
        <path d="M4.5 5h5M4.5 7.5h5M4.5 10h3" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/>
      </svg>
      {editingId === p.id ? (
        <input
          autoFocus
          value={editVal}
          onChange={(e) => setEditVal(e.target.value)}
          onBlur={() => commitRename(p.id)}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitRename(p.id);
            if (e.key === "Escape") setEditingId(null);
          }}
          onClick={(e) => e.stopPropagation()}
          className="flex-1 text-[13px] bg-transparent outline-none border-b border-ink/30 text-ink"
        />
      ) : (
        <span className="flex-1 text-[13px] leading-5 truncate">
          {p.title || "Untitled"}
        </span>
      )}
      {pending > 0 && <span className="shrink-0 text-[10px] text-[#9aa4b6] tabular-nums">{pending}</span>}
      {canDelete && (
        <button
          onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); onDelete(p.id); }}
          className="opacity-0 group-hover:opacity-100 shrink-0 h-4 w-4 grid place-items-center text-[#9aa4b6] hover:text-[#5a6273] transition-all"
        >
          <svg width="9" height="9" viewBox="0 0 10 10" fill="none">
            <path d="M1.5 1.5l7 7M8.5 1.5l-7 7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
          </svg>
        </button>
      )}
    </div>
  );
}

function LeftSidebar({
  pages,
  folders,
  activeId,
  onSelect,
  onNew,
  onNewFolder,
  onToggleFolder,
  onRenameFolder,
  onDeleteFolder,
  onMovePage,
  onRename,
  onDelete,
  open,
  onToggle,
}: {
  pages: Page[];
  folders: Folder[];
  activeId: string;
  onSelect: (id: string) => void;
  onNew: () => void;
  onNewFolder: () => void;
  onToggleFolder: (id: string) => void;
  onRenameFolder: (id: string, name: string) => void;
  onDeleteFolder: (id: string) => void;
  onMovePage: (pageId: string, folderId: string | null) => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
  open: boolean;
  onToggle: () => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editVal, setEditVal] = useState("");
  const [editingFolder, setEditingFolder] = useState<string | null>(null);
  const [folderVal, setFolderVal] = useState("");
  const [dragId, setDragId] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  const startRename = (p: Page) => { setEditingId(p.id); setEditVal(p.title); };
  const commitRename = (id: string) => { onRename(id, editVal.trim() || "Untitled"); setEditingId(null); };

  const canDelete = pages.length > 1;
  const rootPages = pages.filter((p) => !p.folderId);
  const pagesIn = (fid: string) => pages.filter((p) => p.folderId === fid);

  return (
    <>
      {!open && (
        <button
          onClick={onToggle}
          title="Open sidebar"
          className="fixed top-5 left-5 z-30 h-8 w-8 grid place-items-center rounded-md text-muted-ink hover:bg-[#e7ecf3] transition-colors"
        >
          <svg width="16" height="16" viewBox="0 0 18 18" fill="none">
            <rect x="1.5" y="1.5" width="15" height="15" rx="2.5" stroke="currentColor" strokeWidth="1.4"/>
            <line x1="6.5" y1="1.5" x2="6.5" y2="16.5" stroke="currentColor" strokeWidth="1.4"/>
          </svg>
        </button>
      )}

      <div
        className={`fixed top-0 left-0 h-full z-20 flex flex-col bg-[#fafafa] border-r border-[#ededeb] transition-transform duration-200 ease-out`}
        style={{ width: 220, transform: open ? "translateX(0)" : "translateX(-100%)" }}
      >
        {/* header — title + collapse only */}
        <div className="flex items-center justify-between pl-3.5 pr-2 pt-[18px] pb-1">
          <span className="text-[14px] font-semibold text-ink tracking-tight">Quill</span>
          <button
            onClick={onToggle}
            title="Collapse sidebar"
            className="h-7 w-7 grid place-items-center rounded-md text-muted-ink hover:bg-[#efefed] transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 18 18" fill="none">
              <rect x="1.5" y="1.5" width="15" height="15" rx="2.5" stroke="currentColor" strokeWidth="1.4"/>
              <line x1="6.5" y1="1.5" x2="6.5" y2="16.5" stroke="currentColor" strokeWidth="1.4"/>
            </svg>
          </button>
        </div>

        {/* divider under header */}
        <div className="h-px bg-[#ebebea] mx-3 mt-1" />

        {/* breathing room */}
        <div className="h-3" />

        {/* Recent header + three-dot menu */}
        <div className="relative flex items-center justify-between px-3.5 pb-1">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[#9a9a96]">Recent</span>
          <button
            onClick={() => setMenuOpen((v) => !v)}
            title="More"
            className={`h-6 w-6 grid place-items-center rounded-md transition-colors ${menuOpen ? "bg-[#ededeb] text-ink" : "text-[#a3a3a0] hover:bg-[#efefed] hover:text-ink"}`}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
              <circle cx="3.5" cy="8" r="1.3"/><circle cx="8" cy="8" r="1.3"/><circle cx="12.5" cy="8" r="1.3"/>
            </svg>
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-2 top-7 z-40 w-40 rounded-lg border border-[#e7e5e2] bg-white shadow-lg py-1">
                <button
                  onClick={() => { onNewFolder(); setMenuOpen(false); }}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-[13px] text-[#37352f] hover:bg-surface transition-colors"
                >
                  <svg className="shrink-0 text-[#8b8b87]" width="14" height="14" viewBox="0 0 16 16" fill="none">
                    <path d="M2 4.2c0-.66.54-1.2 1.2-1.2h2.3c.4 0 .77.2 1 .53L7.3 4.4h5.5c.66 0 1.2.54 1.2 1.2v6c0 .66-.54 1.2-1.2 1.2H3.2c-.66 0-1.2-.54-1.2-1.2V4.2z" stroke="currentColor" strokeWidth="1.3"/>
                    <path d="M8 7.2v3M6.5 8.7h3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                  </svg>
                  New folder
                </button>
                <button
                  onClick={() => { onNew(); setMenuOpen(false); }}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-[13px] text-[#37352f] hover:bg-surface transition-colors"
                >
                  <svg className="shrink-0 text-[#8b8b87]" width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <path d="M7 2v10M2 7h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
                  </svg>
                  New note
                </button>
              </div>
            </>
          )}
        </div>

        {/* list */}
        <div className="flex-1 overflow-y-auto px-1.5 pb-2 space-y-0.5">
          {/* folders */}
          {folders.map((f) => {
            const fpages = pagesIn(f.id);
            const isOpen = f.open !== false;
            return (
              <div
                key={f.id}
                onDragOver={(e) => { if (dragId) e.preventDefault(); }}
                onDrop={(e) => { e.preventDefault(); if (dragId) { onMovePage(dragId, f.id); setDragId(null); } }}
              >
                <div
                  className="group flex items-center gap-1.5 px-2 py-1.5 rounded-[6px] cursor-pointer text-[#6b6b66] hover:bg-[#efefed] transition-colors"
                  onClick={() => onToggleFolder(f.id)}
                  onDoubleClick={() => { setEditingFolder(f.id); setFolderVal(f.name); }}
                >
                  <svg className={`shrink-0 transition-transform ${isOpen ? "rotate-90" : ""}`} width="9" height="9" viewBox="0 0 10 10" fill="none">
                    <path d="M3 1.5L7 5l-4 3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  <svg className="shrink-0 text-[#7c8aa3]" width="13" height="13" viewBox="0 0 16 16" fill="none">
                    <path d="M2 4.2c0-.66.54-1.2 1.2-1.2h2.3c.4 0 .77.2 1 .53L7.3 4.4h5.5c.66 0 1.2.54 1.2 1.2v6c0 .66-.54 1.2-1.2 1.2H3.2c-.66 0-1.2-.54-1.2-1.2V4.2z" stroke="currentColor" strokeWidth="1.3"/>
                  </svg>
                  {editingFolder === f.id ? (
                    <input
                      autoFocus
                      value={folderVal}
                      onChange={(e) => setFolderVal(e.target.value)}
                      onBlur={() => { onRenameFolder(f.id, folderVal.trim() || "Folder"); setEditingFolder(null); }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") { onRenameFolder(f.id, folderVal.trim() || "Folder"); setEditingFolder(null); }
                        if (e.key === "Escape") setEditingFolder(null);
                      }}
                      onClick={(e) => e.stopPropagation()}
                      className="flex-1 text-[13px] font-medium bg-transparent outline-none border-b border-ink/30 text-ink"
                    />
                  ) : (
                    <span className="flex-1 text-[13px] font-medium leading-5 truncate">{f.name}</span>
                  )}
                  <span className="shrink-0 text-[10px] text-[#9aa4b6] tabular-nums">{fpages.length}</span>
                  <button
                    onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); onDeleteFolder(f.id); }}
                    title="Delete folder (pages move to root)"
                    className="opacity-0 group-hover:opacity-100 shrink-0 h-4 w-4 grid place-items-center text-[#9aa4b6] hover:text-[#5a6273] transition-all"
                  >
                    <svg width="9" height="9" viewBox="0 0 10 10" fill="none">
                      <path d="M1.5 1.5l7 7M8.5 1.5l-7 7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                    </svg>
                  </button>
                </div>
                {isOpen && fpages.map((p) => (
                  <div key={p.id} draggable onDragStart={() => setDragId(p.id)} onDragEnd={() => setDragId(null)}>
                    <PageRow
                      p={p} isActive={p.id === activeId} editingId={editingId} editVal={editVal}
                      setEditVal={setEditVal} startRename={startRename} commitRename={commitRename}
                      setEditingId={setEditingId} onSelect={onSelect} onDelete={onDelete} canDelete={canDelete} indent
                    />
                  </div>
                ))}
              </div>
            );
          })}

          {/* root pages (drop target to unfile) */}
          <div
            onDragOver={(e) => { if (dragId) e.preventDefault(); }}
            onDrop={(e) => { e.preventDefault(); if (dragId) { onMovePage(dragId, null); setDragId(null); } }}
            className="space-y-0.5 min-h-[4px]"
          >
            {rootPages.map((p) => (
              <div key={p.id} draggable onDragStart={() => setDragId(p.id)} onDragEnd={() => setDragId(null)}>
                <PageRow
                  p={p} isActive={p.id === activeId} editingId={editingId} editVal={editVal}
                  setEditVal={setEditVal} startRename={startRename} commitRename={commitRename}
                  setEditingId={setEditingId} onSelect={onSelect} onDelete={onDelete} canDelete={canDelete} indent={false}
                />
              </div>
            ))}
          </div>
        </div>

      </div>
    </>
  );
}

// ── Main ───────────────────────────────────────────────────────────────────
function Index() {
  const [pages, setPages] = useState<Page[]>(() => {
    const saved = load<Page[]>(LS_PAGES, []);
    return saved.length ? saved : [defaultPage()];
  });
  const [activeId, setActiveId] = useState<string>(() => {
    const saved = load<string>(LS_ACTIVE, "");
    return saved || pages[0]?.id || "";
  });
  const [folders, setFolders] = useState<Folder[]>(() => load<Folder[]>(LS_FOLDERS, []));
  const [muted, setMuted] = useState<boolean>(() => load<boolean>(LS_MUTED, false));
  const [sw, setSw] = useState<Switch>(() => load<Switch>(LS_SWITCH, "thock"));
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(() => load<boolean>(LS_SIDEBAR, true));
  const [aiOpen, setAiOpen] = useState<boolean>(() => load<boolean>(LS_AIPANEL, false));
  const [shareOpen, setShareOpen] = useState(false);

  const addRowFocusRef = useRef<(() => void) | null>(null);
  const mutedRef = useRef(muted);
  useEffect(() => { mutedRef.current = muted; }, [muted]);

  const swRef = useRef(sw);
  useEffect(() => {
    swRef.current = sw;
    localStorage.setItem(LS_SWITCH, JSON.stringify(sw));
    ensureProfile(sw);
  }, [sw]);

  useEffect(() => { localStorage.setItem(LS_PAGES, JSON.stringify(pages)); }, [pages]);
  useEffect(() => { localStorage.setItem(LS_FOLDERS, JSON.stringify(folders)); }, [folders]);
  useEffect(() => { localStorage.setItem(LS_ACTIVE, JSON.stringify(activeId)); }, [activeId]);
  useEffect(() => { localStorage.setItem(LS_MUTED, JSON.stringify(muted)); }, [muted]);
  useEffect(() => { localStorage.setItem(LS_SIDEBAR, JSON.stringify(sidebarOpen)); }, [sidebarOpen]);
  useEffect(() => { localStorage.setItem(LS_AIPANEL, JSON.stringify(aiOpen)); }, [aiOpen]);

  // auto-sync shared pages to the server (debounced)
  const activePageForSync = pages.find((p) => p.id === activeId);
  useEffect(() => {
    if (!activePageForSync?.shareId) return;
    const id = activePageForSync.shareId;
    const payload = { ownerKey: ownerKey(), title: activePageForSync.title || "Untitled", blocks: activePageForSync.blocks };
    const t = setTimeout(() => {
      fetch(`/api/share/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }).catch(() => {});
    }, 800);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePageForSync?.shareId, activePageForSync?.title, JSON.stringify(activePageForSync?.blocks)]);

  useEffect(() => {
    const arm = () => initSound(swRef.current);
    window.addEventListener("pointerdown", arm, { once: true });
    window.addEventListener("keydown", arm, { once: true });
    return () => {
      window.removeEventListener("pointerdown", arm);
      window.removeEventListener("keydown", arm);
    };
  }, []);

  const newPageRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "n") {
        e.preventDefault();
        newPageRef.current?.();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  function sound(key: string) {
    if (mutedRef.current) return;
    playKey(kindForKey(key), swRef.current);
  }
  function checkSound() { if (!mutedRef.current) playCheck(); }
  function deleteSound() { if (!mutedRef.current) playDelete(); }

  function onKeyType(e: React.KeyboardEvent) {
    if (e.key.length === 1 || e.key === "Backspace" || e.key === "Enter" || e.key === " ") {
      sound(e.key);
    }
  }

  // ── multi-block selection helpers (for Cut / Copy / Delete across rows) ──
  const blockListRef = useRef<HTMLDivElement>(null);

  // ids of blocks the current DOM selection touches
  const selectedBlockIds = (): string[] => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !blockListRef.current) return [];
    const ids: string[] = [];
    blockListRef.current.querySelectorAll<HTMLElement>("[data-block-id]").forEach((el) => {
      if (sel.containsNode(el, true)) {
        const id = el.getAttribute("data-block-id");
        if (id) ids.push(id);
      }
    });
    return ids;
  };

  const selectAllBlocks = () => {
    const root = blockListRef.current;
    if (!root) return;
    const sel = window.getSelection();
    if (!sel) return;
    const range = document.createRange();
    range.selectNodeContents(root);
    sel.removeAllRanges();
    sel.addRange(range);
  };

  // page-level Ctrl+A / Ctrl+C / Ctrl+X across multiple blocks
  useEffect(() => {
    const onKey = async (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      const tag = (e.target as HTMLElement)?.tagName;
      const inField = tag === "TEXTAREA" || tag === "INPUT";

      // Ctrl+A — if not editing a field, select all blocks
      if (e.key.toLowerCase() === "a" && !inField) {
        e.preventDefault();
        selectAllBlocks();
        return;
      }

      const ids = selectedBlockIds();
      if (ids.length < 2) return; // single-block handled by native / row menu

      if (e.key.toLowerCase() === "c") {
        e.preventDefault();
        await copyText(window.getSelection()?.toString() ?? "");
      } else if (e.key.toLowerCase() === "x") {
        e.preventDefault();
        await copyText(window.getSelection()?.toString() ?? "");
        removeBlocks(ids);
        window.getSelection()?.removeAllRanges();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, pages]);

  // ── page helpers ──
  const activePage = pages.find((p) => p.id === activeId) ?? pages[0];

  const setBlocks = (fn: (prev: Block[]) => Block[]) => {
    setPages((prev) =>
      prev.map((p) => p.id === activeId ? { ...p, blocks: fn(p.blocks) } : p)
    );
  };

  const addBlock = (kind: "todo" | "note", text: string, done = false) => {
    const t = text.trim();
    if (!t && kind === "note") return;
    setBlocks((prev) => [...prev, { id: uid(), kind, text: t, done }]);
  };
  const toggle = (id: string) =>
    setBlocks((prev) =>
      prev.map((b) => {
        if (b.id !== id) return b;
        return { ...b, done: !b.done };
      })
    );
  const remove = (id: string) =>
    setBlocks((prev) => {
      if (prev.some((b) => b.id === id)) deleteSound();
      return prev.filter((b) => b.id !== id);
    });
  const removeBlocks = (ids: string[]) =>
    setBlocks((prev) => {
      if (prev.some((b) => ids.includes(b.id))) deleteSound();
      return prev.filter((b) => !ids.includes(b.id));
    });
  const update = (id: string, patch: Partial<Block>) =>
    setBlocks((prev) => prev.map((b) => (b.id === id ? { ...b, ...patch } : b)));

  // insert a new block right after the block with the given id
  const insertAfter = (afterId: string, kind: "todo" | "note", text: string) => {
    const newBlock: Block = { id: uid(), kind, text, done: false };
    setBlocks((prev) => {
      const idx = prev.findIndex((b) => b.id === afterId);
      if (idx === -1) return [...prev, newBlock];
      const next = [...prev];
      next.splice(idx + 1, 0, newBlock);
      return next;
    });
    // focus the new block after render
    setTimeout(() => {
      const el = document.querySelector<HTMLElement>(`[data-block-id="${newBlock.id}"]`);
      if (el) {
        // simulate a click to enter edit mode
        el.click();
        const ta = el.querySelector<HTMLTextAreaElement>("textarea");
        if (ta) ta.focus();
      }
      // If the new block gets rendered, we need to click on it to edit
      // Since BlockRow starts in display mode, we dispatch a synthetic click on the span
      const spans = document.querySelectorAll<HTMLElement>("[data-block-id]");
      spans.forEach((s) => {
        if (s.getAttribute("data-block-id") === newBlock.id) {
          const span = s.querySelector<HTMLElement>("span.cursor-text");
          span?.click();
        }
      });
    }, 30);
  };

  const setTitle = (t: string) =>
    setPages((prev) => prev.map((p) => p.id === activeId ? { ...p, title: t } : p));

  const newPage = () => {
    const p: Page = { id: uid(), title: "Untitled", blocks: [] };
    setPages((prev) => [...prev, p]);
    setActiveId(p.id);
    // focus title after render
    setTimeout(() => {
      const el = document.querySelector<HTMLTextAreaElement>(".page-title-input");
      el?.focus();
      el?.select();
    }, 50);
  };
  newPageRef.current = newPage;

  const renamePage = (id: string, title: string) =>
    setPages((prev) => prev.map((p) => p.id === id ? { ...p, title } : p));

  const deletePage = (id: string) => {
    const remaining = pages.filter((p) => p.id !== id);
    setPages(remaining);
    if (activeId === id) setActiveId(remaining[0]?.id ?? "");
  };

  // ── folder helpers ──
  const newFolder = () => {
    const f: Folder = { id: uid(), name: "New folder", open: true };
    setFolders((prev) => [...prev, f]);
  };
  const renameFolder = (id: string, name: string) =>
    setFolders((prev) => prev.map((f) => f.id === id ? { ...f, name } : f));
  const toggleFolder = (id: string) =>
    setFolders((prev) => prev.map((f) => f.id === id ? { ...f, open: f.open === false } : f));
  const deleteFolder = (id: string) => {
    setPages((prev) => prev.map((p) => p.folderId === id ? { ...p, folderId: null } : p));
    setFolders((prev) => prev.filter((f) => f.id !== id));
  };
  const movePage = (pageId: string, folderId: string | null) =>
    setPages((prev) => prev.map((p) => p.id === pageId ? { ...p, folderId } : p));

  // ── navigation: open a page by its title (for [[wikilinks]]) ──
  const openByTitle = (title: string) => {
    const t = title.trim().toLowerCase();
    const found = pages.find((p) => (p.title || "Untitled").trim().toLowerCase() === t);
    if (found) { setActiveId(found.id); return; }
    // create a new page with that title
    const p: Page = { id: uid(), title: title.trim() || "Untitled", blocks: [] };
    setPages((prev) => [...prev, p]);
    setActiveId(p.id);
  };

  // ── tag click → simple in-app filter: open AI panel? For now scroll/no-op-friendly: log.
  const onTagClick = (_tag: string) => { /* tags are visual chips; click reserved for future filtering */ };

  // ── share: persist returned shareId/mode onto the active page ──
  const setPageShare = (shareId: string, mode: "view" | "edit") =>
    setPages((prev) => prev.map((p) => p.id === activeId ? { ...p, shareId, shareMode: mode } : p));
  const clearPageShare = () =>
    setPages((prev) => prev.map((p) => p.id === activeId ? { ...p, shareId: undefined, shareMode: undefined } : p));

  // ── AI helpers ──
  const serializeNote = () => {
    const t = activePage?.title ? `${activePage.title}\n\n` : "";
    const body = (activePage?.blocks ?? [])
      .map((b) =>
        b.kind === "todo" ? `- [${b.done ? "x" : " "}] ${b.text}` : b.text
      )
      .join("\n");
    return (t + body).trim();
  };

  // parse a chunk of text into blocks (checkbox lines → todos, rest → notes)
  const textToBlocks = (text: string): Block[] =>
    text
      .split("\n")
      .map((line) => line.trimEnd())
      .filter((line) => line.length > 0)
      .map((line) => {
        const md = parseMd(line);
        if (md) return { id: uid(), kind: "todo" as const, text: md.rest, done: md.done };
        return { id: uid(), kind: "note" as const, text: line, done: false };
      });

  const aiInsert = (text: string) =>
    setBlocks((prev) => [...prev, ...textToBlocks(text)]);

  const aiReplace = (text: string) =>
    setBlocks(() => textToBlocks(text));

  const aiAddTasks = (lines: string[]) =>
    setBlocks((prev) => [
      ...prev,
      ...lines.map((l) => ({ id: uid(), kind: "todo" as const, text: l, done: false })),
    ]);

  const blocks = activePage?.blocks ?? [];
  const todos = blocks.filter((b) => b.kind === "todo");
  const remaining = todos.filter((b) => !b.done).length;

  return (
    <div className="min-h-screen bg-white text-ink font-sans flex">
      {/* left sidebar */}
      <LeftSidebar
        pages={pages}
        folders={folders}
        activeId={activeId}
        onSelect={setActiveId}
        onNew={newPage}
        onNewFolder={newFolder}
        onToggleFolder={toggleFolder}
        onRenameFolder={renameFolder}
        onDeleteFolder={deleteFolder}
        onMovePage={movePage}
        onRename={renamePage}
        onDelete={deletePage}
        open={sidebarOpen}
        onToggle={() => setSidebarOpen((o) => !o)}
      />

      {/* main area — shifts right when sidebar open */}
      <div
        className="flex-1 min-h-screen transition-all duration-200"
        style={{ marginLeft: sidebarOpen ? 220 : 0, marginRight: aiOpen ? 320 : 0 }}
      >
        {/* top-right controls */}
        <div
          className="fixed top-5 z-10 flex items-center gap-2 transition-all duration-200"
          style={{ right: aiOpen ? 320 + 20 : 20 }}
        >
          <div className="relative">
            <button
              onClick={() => setShareOpen((v) => !v)}
              title={activePage?.shareId ? "Shared — manage link" : "Share this note"}
              className={`h-9 w-9 grid place-items-center rounded-md transition-colors ${
                shareOpen ? "bg-surface text-ink" : activePage?.shareId ? "text-[#0c7fc4] hover:bg-sky-50" : "text-muted-ink hover:bg-surface"
              }`}
            >
              <svg width="17" height="17" viewBox="0 0 16 16" fill="none">
                <circle cx="4" cy="8" r="2" stroke="currentColor" strokeWidth="1.4"/>
                <circle cx="12" cy="3.5" r="2" stroke="currentColor" strokeWidth="1.4"/>
                <circle cx="12" cy="12.5" r="2" stroke="currentColor" strokeWidth="1.4"/>
                <path d="M5.8 7L10.2 4.6M5.8 9L10.2 11.4" stroke="currentColor" strokeWidth="1.3"/>
              </svg>
            </button>
            {shareOpen && activePage && (
              <SharePopover
                page={activePage}
                onClose={() => setShareOpen(false)}
                onShared={setPageShare}
                onUnshare={clearPageShare}
              />
            )}
          </div>
          <button
            onClick={() => setAiOpen((o) => !o)}
            title="Quill AI"
            className={`h-9 w-9 grid place-items-center rounded-md transition-colors ${
              aiOpen ? "text-[#3b82f6]" : "text-muted-ink hover:bg-surface"
            }`}
          >
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
              <path d="M3 5.5A2.5 2.5 0 015.5 3h9A2.5 2.5 0 0117 5.5v5A2.5 2.5 0 0114.5 13H8l-3.4 3v-3H5.5A2.5 2.5 0 013 10.5v-5z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
            </svg>
          </button>
          <div className="flex items-center rounded-full bg-surface p-0.5 text-[12px] font-medium">
            {(["thock", "clicky"] as Switch[]).map((s) => (
              <button
                key={s}
                onClick={() => {
                  setSw(s);
                  ensureProfile(s);
                  if (!mutedRef.current) playKey("normal", s);
                }}
                className={`px-2.5 py-1 rounded-full capitalize transition-colors ${
                  sw === s ? "bg-white text-ink shadow-sm" : "text-muted-ink hover:text-ink"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
          <button
            onClick={() => setMuted((m) => !m)}
            title={muted ? "Sound off" : "Sound on"}
            className="h-9 w-9 grid place-items-center rounded-md text-muted-ink hover:bg-surface transition-colors"
          >
            {muted ? <SpeakerOff /> : <Speaker />}
          </button>
        </div>

        {/* page content */}
        <div className="mx-auto max-w-[720px] px-[96px] pt-[12vh] pb-32">
          <AutoTextarea
            value={activePage?.title ?? ""}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.preventDefault();
              onKeyType(e);
            }}
            className="page-title-input text-[40px] font-bold leading-tight tracking-tight placeholder:text-faint mb-1"
            placeholder="Untitled"
          />
          <p
            className="text-[13px] mb-7"
            style={{ color: remaining === 0 && todos.length > 0 ? "#38BDF8" : "#9aa4b6" }}
          >
            {todos.length === 0
              ? "Start writing…"
              : remaining === 0
                ? "All done — nice ✓"
                : `${remaining} remaining`}
          </p>

          <div className="flex flex-col" ref={blockListRef}>
            {blocks.map((b) => (
              <BlockRow
                key={b.id}
                block={b}
                onToggle={() => toggle(b.id)}
                onRemove={() => remove(b.id)}
                onChange={(patch) => update(b.id, patch)}
                onType={onKeyType}
                onMenu={(state) => setMenu(state)}
                onLink={openByTitle}
                onTag={onTagClick}
                onInsertBelow={(kind, text) => insertAfter(b.id, kind, text)}
                pageTitles={pages.map((p) => p.title || "Untitled")}
              />
            ))}
          </div>

          <AddRow onAdd={addBlock} onType={onKeyType} focusRef={addRowFocusRef} />
        </div>{/* end page content */}

        {/* floating Pomodoro/clock — self-positioned, draggable */}
        <Pomodoro />
      </div>

      {/* right AI panel */}
      <AIPanel
        open={aiOpen}
        onClose={() => setAiOpen(false)}
        noteText={serializeNote}
        onInsert={aiInsert}
        onReplace={aiReplace}
        onAddTasks={aiAddTasks}
      />

      {menu && <ContextMenu state={menu} onClose={() => setMenu(null)} />}

    </div>
  );
}

// ── slash command definitions ──────────────────────────────────────────────
const SLASH_CMDS = [
  { id: "todo",     label: "To-do",       desc: "Action item with checkbox",  icon: "☑" },
  { id: "note",     label: "Text",         desc: "Plain text line",            icon: "¶" },
  { id: "h1",       label: "Heading 1",   desc: "Large section title",        icon: "H1" },
  { id: "h2",       label: "Heading 2",   desc: "Medium heading",             icon: "H2" },
  { id: "h3",       label: "Heading 3",   desc: "Small heading",              icon: "H3" },
  { id: "divider",  label: "Divider",     desc: "Horizontal rule",            icon: "─" },
  { id: "date",     label: "Date",        desc: "Insert today's date",        icon: "📅" },
  { id: "time",     label: "Time",        desc: "Insert live time",           icon: "⏱" },
];

// ── BlockRow ───────────────────────────────────────────────────────────────
function BlockRow({
  block,
  onToggle,
  onRemove,
  onChange,
  onType,
  onMenu,
  onLink,
  onTag,
  onInsertBelow,
  pageTitles,
}: {
  block: Block;
  onToggle: () => void;
  onRemove: () => void;
  onChange: (patch: Partial<Block>) => void;
  onType: (e: React.KeyboardEvent) => void;
  onMenu: (state: MenuState) => void;
  onLink: (title: string) => void;
  onTag: (tag: string) => void;
  onInsertBelow: (kind: "todo" | "note", text: string) => void;
  pageTitles: string[];
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(block.text);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [linkMenu, setLinkMenu] = useState<{ query: string; from: number } | null>(null);
  const [slashMenu, setSlashMenu] = useState<{ query: string; from: number } | null>(null);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      const len = inputRef.current?.value.length ?? 0;
      inputRef.current?.setSelectionRange(len, len);
    }
  }, [editing]);

  const commit = (text?: string) => {
    const t = (text ?? draft).trim();
    if (!t) { onRemove(); return; }
    onChange({ text: t });
    setEditing(false);
  };

  const tryConvert = (value: string): boolean => {
    const parsed = parseMd(value);
    if (parsed && block.kind === "note") {
      onChange({ kind: "todo", done: parsed.done, text: parsed.rest });
      setDraft(parsed.rest);
      return true;
    }
    return false;
  };

  // apply slash command and insert a block below
  const applySlashCmd = (cmdId: string) => {
    const ta = inputRef.current;
    if (!ta || !slashMenu) return;
    const caret = ta.selectionStart;
    const head = draft.slice(0, slashMenu.from - 1); // remove the "/" too
    const tail = draft.slice(caret);
    setSlashMenu(null);

    const today = new Date().toLocaleDateString("en-IN", { year: "numeric", month: "long", day: "numeric" });
    switch (cmdId) {
      case "todo":
        // save current line without slash, insert todo below
        onChange({ text: (head + tail).trim() || block.text });
        setDraft((head + tail).trim() || block.text);
        setEditing(false);
        onInsertBelow("todo", "");
        break;
      case "note":
        onChange({ text: (head + tail).trim() || block.text });
        setDraft((head + tail).trim() || block.text);
        setEditing(false);
        onInsertBelow("note", "");
        break;
      case "h1":
        { const next = head + "# " + tail; setDraft(next); onChange({ text: next.trim() }); }
        break;
      case "h2":
        { const next = head + "## " + tail; setDraft(next); onChange({ text: next.trim() }); }
        break;
      case "h3":
        { const next = head + "### " + tail; setDraft(next); onChange({ text: next.trim() }); }
        break;
      case "divider":
        { const next = "---"; setDraft(next); onChange({ kind: "note", text: next }); setEditing(false); }
        break;
      case "date":
        { const next = head + today + tail; setDraft(next); requestAnimationFrame(() => { ta.focus(); ta.setSelectionRange(head.length + today.length, head.length + today.length); }); }
        break;
      case "time":
        { const next = head + "{{time}}" + tail; setDraft(next); requestAnimationFrame(() => { ta.focus(); ta.setSelectionRange(head.length + 8, head.length + 8); }); }
        break;
    }
  };

  const slashMatches = slashMenu
    ? SLASH_CMDS.filter((c) => c.label.toLowerCase().includes(slashMenu.query.toLowerCase()) || c.id.includes(slashMenu.query.toLowerCase()))
    : [];

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    onType(e);
    // slash menu navigation
    if (slashMenu && slashMatches.length) {
      if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); applySlashCmd(slashMatches[0].id); return; }
      if (e.key === "Escape") { e.preventDefault(); setSlashMenu(null); return; }
      if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); return; }
    }
    // wikilink popup navigation
    if (linkMenu && linkMatches.length) {
      if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); chooseLink(linkMatches[0]); return; }
      if (e.key === "Escape") { e.preventDefault(); setLinkMenu(null); return; }
    }
    if (e.key === " ") {
      if (tryConvert(draft + " ")) { e.preventDefault(); return; }
    }
    if (e.key === "Backspace" && draft.length === 0) {
      e.preventDefault(); onRemove(); return;
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (slashMenu) { setSlashMenu(null); return; }
      if (tryConvert(draft)) return;
      // split: save text up to caret, insert new block below with tail
      const ta = inputRef.current;
      const caret = ta?.selectionStart ?? draft.length;
      const head = draft.slice(0, caret).trimEnd();
      const tail = draft.slice(caret).trimStart();
      onChange({ text: head || " " });
      setDraft(head || " ");
      setEditing(false);
      onInsertBelow(block.kind, tail);
      return;
    }
    if (e.key === "Escape") {
      setDraft(block.text); setEditing(false);
    }
  };

  const startEdit = () => { setDraft(block.text); setEditing(true); };
  const isTodo = block.kind === "todo";

  // detect "[[query" or "/query" before the caret to drive autocomplete popups
  const refreshLinkMenu = (value: string, caret: number) => {
    const before = value.slice(0, caret);
    // wikilink
    const wm = before.match(/\[\[([^\]\[]*)$/);
    if (wm) { setLinkMenu({ query: wm[1], from: caret - wm[1].length }); setSlashMenu(null); return; }
    setLinkMenu(null);
    // slash command — only at start of line or after a space
    const sm = before.match(/(^|\s)\/([a-zA-Z0-9]*)$/);
    if (sm) { setSlashMenu({ query: sm[2], from: caret - sm[2].length }); return; }
    setSlashMenu(null);
  };

  const chooseLink = (title: string) => {
    const ta = inputRef.current;
    if (!ta || !linkMenu) return;
    const caret = ta.selectionStart;
    const head = draft.slice(0, linkMenu.from);
    const tail = draft.slice(caret);
    const inserted = `${head}${title}]]${tail}`;
    setDraft(inserted);
    setLinkMenu(null);
    requestAnimationFrame(() => {
      ta.focus();
      const pos = (head + title + "]]").length;
      ta.setSelectionRange(pos, pos);
    });
  };

  const linkMatches = linkMenu
    ? pageTitles
        .filter((t) => t.toLowerCase().includes(linkMenu.query.toLowerCase()))
        .slice(0, 6)
    : [];

  const head = headingLevel(block.text);
  const displayText = head ? head.rest : block.text;
  // user color override takes precedence; done state overrides for todos
  const userColor = block.color && block.color !== "default" ? COLOR_MAP[block.color] : null;
  const baseColor = userColor
    ? (isTodo && block.done ? DONE_TEXT_COLOR : userColor)
    : head
      ? "#37352f"
      : isTodo && block.done ? DONE_TEXT_COLOR : isTodo ? "#37352f" : "#37352f";

  const openMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    const ta = inputRef.current;

    // textarea selection (when editing this row)
    const taSel =
      ta && editing && ta.selectionStart !== ta.selectionEnd
        ? ta.value.slice(ta.selectionStart, ta.selectionEnd)
        : "";

    // browser-level selection — works for Ctrl+A across multiple spans
    const winSel = window.getSelection()?.toString().trim() || "";

    // prefer winSel when it covers more text (e.g. select-all), else taSel
    const sel = winSel.length >= taSel.length ? winSel : taSel;

    const allSelected =
      ta && editing
        ? ta.selectionStart === 0 && ta.selectionEnd === ta.value.length
        : false;

    const replaceTaSelection = (insert: string) => {
      if (!ta) return;
      const s = ta.selectionStart;
      const en = ta.selectionEnd;
      const next = ta.value.slice(0, s) + insert + ta.value.slice(en);
      setDraft(next);
      onChange({ text: next });
      requestAnimationFrame(() => {
        ta.focus();
        ta.setSelectionRange(s + insert.length, s + insert.length);
      });
    };

    onMenu({
      x: e.clientX,
      y: e.clientY,
      hasSelection: !!sel,
      onCopy: () => {
        navigator.clipboard?.writeText(sel || block.text);
      },
      onCut: () => {
        navigator.clipboard?.writeText(sel || block.text);
        if (ta && editing) {
          if (allSelected || (!taSel && winSel)) {
            setDraft(""); onChange({ text: "" }); onRemove();
          } else if (taSel) {
            replaceTaSelection("");
          } else {
            onRemove();
          }
        } else if (winSel) {
          onRemove();
        } else {
          onRemove();
        }
      },
      onPaste: async () => {
        try {
          const t = await navigator.clipboard?.readText();
          if (!t) return;
          if (ta && editing) replaceTaSelection(t);
          else onChange({ text: (block.text + t).trim() });
        } catch { /* blocked in iframe */ }
      },
      onEmoji: (emoji: string) => {
        if (ta && editing) replaceTaSelection(emoji);
        else onChange({ text: (block.text + " " + emoji).trim() });
      },
      onDelete: onRemove,
      // text color — available whenever there's any selection or just as block-level color
      onTextColor: (colorKey: string) => {
        onChange({ color: colorKey === "default" ? undefined : colorKey });
      },
    });
  };

  return (
    <div
      data-block-id={block.id}
      className="row-in group flex items-center rounded-[4px] px-2 py-[3px] -mx-2 hover:bg-[#f4f7fd] transition-colors"
      onContextMenu={openMenu}
    >
      {isTodo ? (
        <button
          onClick={onToggle}
          className="mr-2.5 shrink-0 h-[18px] w-[18px] grid place-items-center rounded-[4px] border transition-colors"
          style={{
            borderColor: block.done ? "#38BDF8" : "#cfcecb",
            background: block.done ? "#38BDF8" : "transparent",
          }}
        >
          {block.done && (
            <svg className="check-pop" width="11" height="11" viewBox="0 0 12 12" fill="none">
              <path d="M2.5 6.2L4.8 8.5L9.5 3.5" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          )}
        </button>
      ) : null /* no bullet dot for notes — clean page feel */}

      {editing ? (
        <div className="relative flex-1">
          <AutoTextarea
            ref={inputRef}
            value={draft}
            onChange={(e) => {
              const v = applyTimeCmd(e.target.value);
              setDraft(v);
              refreshLinkMenu(v, e.target.selectionStart);
            }}
            onKeyUp={(e) => refreshLinkMenu((e.target as HTMLTextAreaElement).value, (e.target as HTMLTextAreaElement).selectionStart)}
            onClick={(e) => refreshLinkMenu((e.target as HTMLTextAreaElement).value, (e.target as HTMLTextAreaElement).selectionStart)}
            onKeyDown={handleKey}
            onBlur={() => { setTimeout(() => { setLinkMenu(null); setSlashMenu(null); }, 120); commit(); }}
            className="w-full text-[16px] leading-6 -mt-px"
          />
          {/* slash command palette */}
          {slashMenu && slashMatches.length > 0 && (
            <div className="absolute left-0 top-full mt-1 z-30 w-64 rounded-lg border border-[#e3e6ec] bg-white shadow-lg py-1">
              <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-[#9aa4b6]">Commands</div>
              {slashMatches.map((cmd) => (
                <button
                  key={cmd.id}
                  onMouseDown={(e) => { e.preventDefault(); applySlashCmd(cmd.id); }}
                  className="w-full text-left px-3 py-1.5 text-[13px] text-[#37352f] hover:bg-sky-50 transition-colors flex items-center gap-2.5"
                >
                  <span className="shrink-0 w-6 text-center text-[13px] text-[#9aa4b6] font-mono">{cmd.icon}</span>
                  <span className="flex-1 font-medium">{cmd.label}</span>
                  <span className="text-[11px] text-faint">{cmd.desc}</span>
                </button>
              ))}
            </div>
          )}
          {/* wikilink popup */}
          {linkMenu && linkMatches.length > 0 && (
            <div className="absolute left-0 top-full mt-1 z-30 w-56 rounded-lg border border-[#e3e6ec] bg-white shadow-lg py-1">
              <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-[#9aa4b6]">Link to page</div>
              {linkMatches.map((t) => (
                <button
                  key={t}
                  onMouseDown={(e) => { e.preventDefault(); chooseLink(t); }}
                  className="w-full text-left px-3 py-1.5 text-[13px] text-[#37352f] hover:bg-sky-50 transition-colors flex items-center gap-2"
                >
                  <svg className="shrink-0 text-[#9aa4b6]" width="12" height="12" viewBox="0 0 14 14" fill="none">
                    <rect x="2" y="1.5" width="10" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.3"/>
                  </svg>
                  {t}
                </button>
              ))}
            </div>
          )}
        </div>
      ) : head ? (
        <span
          onClick={startEdit}
          className={`flex-1 cursor-text break-words ${HEADING_CLASS[head.level]}`}
          style={{ color: baseColor }}
        >
          <RichText text={displayText} onTag={onTag} onLink={onLink} />
        </span>
      ) : (
        <span onClick={startEdit} className="flex-1 cursor-text">
          <RichText
            text={displayText}
            onTag={onTag}
            onLink={onLink}
            className="text-[16px] leading-6 break-words"
            style={{
              color: baseColor,
              textDecoration: isTodo && block.done ? "line-through" : "none",
              textDecorationColor: isTodo && block.done ? DONE_STRIKE : undefined,
              textDecorationThickness: isTodo && block.done ? "2px" : undefined,
            }}
          />
        </span>
      )}

      <button
        onMouseDown={(e) => { e.preventDefault(); onRemove(); }}
        title="Delete"
        className="shrink-0 h-[18px] w-[18px] grid place-items-center rounded text-faint opacity-0 group-hover:opacity-100 hover:text-muted-ink transition-all"
      >
        <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
          <path d="M3.5 3.5l7 7M10.5 3.5l-7 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      </button>
    </div>
  );
}

// ── AddRow ─────────────────────────────────────────────────────────────────
function AddRow({
  onAdd,
  onType,
  focusRef,
}: {
  onAdd: (kind: "todo" | "note", text: string, done?: boolean) => void;
  onType: (e: React.KeyboardEvent) => void;
  focusRef: React.MutableRefObject<(() => void) | null>;
}) {
  const [value, setValue] = useState("");
  const [todoMode, setTodoMode] = useState(false);
  const [done, setDone] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    focusRef.current = () => { setTodoMode(true); taRef.current?.focus(); };
  }, [focusRef]);

  const reset = () => { setValue(""); setTodoMode(false); setDone(false); };

  const submit = () => {
    if (todoMode) { onAdd("todo", value, done); }
    else {
      const parsed = parseMd(value);
      if (parsed) onAdd("todo", parsed.rest, parsed.done);
      else if (value.trim()) onAdd("note", value);
    }
    reset();
  };

  const maybeEnterTodoMode = (next: string): boolean => {
    if (todoMode) return false;
    const parsed = parseMd(next);
    if (!parsed) return false;
    setTodoMode(true); setDone(parsed.done); setValue(parsed.rest);
    return true;
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const next = applyTimeCmd(e.target.value);
    if (maybeEnterTodoMode(next)) return;
    setValue(next);
  };

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    onType(e);
    if (e.key === " " && !todoMode) {
      if (maybeEnterTodoMode(value + " ")) { e.preventDefault(); return; }
    }
    if (e.key === "Backspace" && todoMode && value === "") {
      e.preventDefault(); setTodoMode(false); setDone(false); return;
    }
    if (e.key === "Enter") { e.preventDefault(); submit(); }
  };

  return (
    <div className="flex items-center gap-2.5 rounded-[4px] px-2 py-1.5 -mx-2 mt-0.5">
      {todoMode ? (
        <button
          onClick={() => setDone((d) => !d)}
          className="shrink-0 h-[18px] w-[18px] grid place-items-center rounded-[4px] border transition-colors"
          style={{ borderColor: done ? "#38BDF8" : "#cfcecb", background: done ? "#38BDF8" : "transparent" }}
        >
          {done && (
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
              <path d="M2.5 6.2L4.8 8.5L9.5 3.5" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          )}
        </button>
      ) : (
        <span className="shrink-0 h-[18px] w-[18px] grid place-items-center text-faint">
          <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
            <path d="M7 2.5v9M2.5 7h9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </span>
      )}
      <AutoTextarea
        ref={taRef}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKey}
        placeholder={todoMode ? "Task…" : "Type a task, note, or \u201c- [ ]\u201d for a checkbox"}
        className="flex-1 text-[16px] leading-6 placeholder:text-faint"
      />
    </div>
  );
}

// ── Share Popover (anchored under the share button) ──────────────────────────
async function copyText(text: string): Promise<boolean> {
  // try the async clipboard API first
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch { /* fall through */ }
  // fallback for iframes / insecure contexts: temp textarea + execCommand
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.top = "-1000px";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

function SharePopover({
  page,
  onClose,
  onShared,
  onUnshare,
}: {
  page: Page;
  onClose: () => void;
  onShared: (shareId: string, mode: "view" | "edit") => void;
  onUnshare: () => void;
}) {
  const [mode, setMode] = useState<"view" | "edit">(page.shareMode ?? "view");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const shareUrl = page.shareId
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/s/${page.shareId}`
    : "";

  // close on Escape
  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [onClose]);

  const createOrSync = async (m: "view" | "edit") => {
    setBusy(true);
    try {
      const res = await fetch("/api/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shareId: page.shareId,
          ownerKey: ownerKey(),
          mode: m,
          title: page.title || "Untitled",
          blocks: page.blocks,
        }),
      });
      const data = await res.json();
      if (data.shareId) onShared(data.shareId, data.mode);
    } finally {
      setBusy(false);
    }
  };

  const switchMode = (m: "view" | "edit") => {
    setMode(m);
    if (page.shareId) createOrSync(m);
  };

  const copy = async () => {
    inputRef.current?.select();
    const ok = await copyText(shareUrl);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    }
  };

  const stopShare = () => { onUnshare(); onClose(); };

  return (
    <>
      {/* click-away backdrop */}
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div
        className="share-pop absolute right-0 top-full mt-2 z-50 w-[320px] rounded-2xl bg-white shadow-xl border border-[#ececec] p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-0.5">
          <h2 className="text-[14px] font-semibold text-ink">Share note</h2>
          <button onClick={onClose} className="h-6 w-6 grid place-items-center rounded-md text-faint hover:bg-surface">
            <svg width="12" height="12" viewBox="0 0 14 14" fill="none"><path d="M3.5 3.5l7 7M10.5 3.5l-7 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
          </button>
        </div>
        <p className="text-[12px] text-muted-ink mb-3">Anyone with the link can open this note.</p>

        {/* access mode */}
        <div className="flex items-center gap-1 rounded-xl bg-surface p-1 mb-3">
          {([
            { v: "view", label: "Can view", desc: "Read only" },
            { v: "edit", label: "Can edit", desc: "Anyone edits" },
          ] as const).map((o) => (
            <button
              key={o.v}
              onClick={() => switchMode(o.v)}
              className={`flex-1 rounded-lg px-2.5 py-1.5 text-left transition-colors ${
                mode === o.v ? "bg-white shadow-sm" : "hover:bg-white/60"
              }`}
            >
              <div className="text-[12.5px] font-medium text-ink">{o.label}</div>
              <div className="text-[10.5px] text-faint">{o.desc}</div>
            </button>
          ))}
        </div>

        {page.shareId ? (
          <>
            <div className="flex items-center gap-2 rounded-xl border border-[#e7e5e2] bg-[#fafafa] px-2.5 py-1.5 mb-2.5">
              <input
                ref={inputRef}
                readOnly
                value={shareUrl}
                onFocus={(e) => e.currentTarget.select()}
                className="flex-1 bg-transparent text-[12.5px] text-muted-ink outline-none truncate"
              />
              <button
                onClick={copy}
                className="shrink-0 rounded-lg bg-ink px-2.5 py-1.5 text-[12px] font-medium text-white hover:opacity-90 transition-opacity"
              >
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
            <div className="flex items-center justify-between">
              <button onClick={stopShare} className="text-[12px] font-medium text-[#c0504d] hover:underline">
                Stop sharing
              </button>
              <button
                onClick={() => createOrSync(mode)}
                disabled={busy}
                className="text-[12px] font-medium text-muted-ink hover:text-ink disabled:opacity-50"
              >
                {busy ? "Syncing…" : "Sync latest"}
              </button>
            </div>
          </>
        ) : (
          <button
            onClick={() => createOrSync(mode)}
            disabled={busy}
            className="w-full rounded-xl bg-ink py-2.5 text-[13px] font-medium text-white hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {busy ? "Creating link…" : "Create share link"}
          </button>
        )}
      </div>
    </>
  );
}

// ── Icons ──────────────────────────────────────────────────────────────────
function Speaker() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
      <path d="M4 7.5h2.5L10 4.5v11L6.5 12.5H4z" fill="currentColor"/>
      <path d="M13 7.5a3.5 3.5 0 010 5M15 5.5a6 6 0 010 9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
    </svg>
  );
}
function SpeakerOff() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
      <path d="M4 7.5h2.5L10 4.5v11L6.5 12.5H4z" fill="currentColor"/>
      <path d="M13.5 8l4 4M17.5 8l-4 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
    </svg>
  );
}

export default Index;
