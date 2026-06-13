import { useEffect, useRef, useState } from "react";

export type MenuState = {
  x: number;
  y: number;
  hasSelection: boolean;
  onCopy: () => void;
  onCut: () => void;
  onPaste: () => void;
  onEmoji: (emoji: string) => void;
  onDelete: () => void;
  onTextColor?: (color: string) => void; // only present when text is selected
};

const EMOJIS = [
  "✅", "🔥", "⭐", "💡", "📌", "⚡",
  "❤️", "🎯", "🚀", "📝", "⏰", "✨",
  "👍", "🎉", "💪", "☕", "🌙", "🍀",
];

const TEXT_COLORS = [
  { label: "Default",  value: "default",  hex: "#37352f" },
  { label: "Sky",      value: "sky",      hex: "#38BDF8" },
  { label: "Blue",     value: "blue",     hex: "#3B82F6" },
  { label: "Purple",   value: "purple",   hex: "#8B5CF6" },
  { label: "Pink",     value: "pink",     hex: "#EC4899" },
  { label: "Red",      value: "red",      hex: "#EF4444" },
  { label: "Orange",   value: "orange",   hex: "#F97316" },
  { label: "Yellow",   value: "yellow",   hex: "#EAB308" },
  { label: "Green",    value: "green",    hex: "#22C55E" },
  { label: "Gray",     value: "gray",     hex: "#9CA3AF" },
];

export function ContextMenu({
  state,
  onClose,
}: {
  state: MenuState;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [showEmoji, setShowEmoji] = useState(false);
  const [showColor, setShowColor] = useState(false);

  // keep menu inside viewport
  const [pos, setPos] = useState({ x: state.x, y: state.y });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    let x = state.x;
    let y = state.y;
    if (x + r.width > window.innerWidth - 8) x = window.innerWidth - r.width - 8;
    if (y + r.height > window.innerHeight - 8) y = window.innerHeight - r.height - 8;
    setPos({ x, y });
  }, [state.x, state.y, showEmoji, showColor]);

  useEffect(() => {
    const close = () => onClose();
    window.addEventListener("pointerdown", close);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    const onEsc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onEsc);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("keydown", onEsc);
    };
  }, [onClose]);

  const run = (fn: () => void) => (e: React.MouseEvent) => {
    e.stopPropagation();
    fn();
    onClose();
  };

  const back = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowEmoji(false);
    setShowColor(false);
  };

  return (
    <div
      ref={ref}
      onPointerDown={(e) => e.stopPropagation()}
      className="menu-in fixed z-50 min-w-[176px] rounded-lg border border-divider bg-white py-1 shadow-[0_6px_24px_rgba(15,15,15,0.12)]"
      style={{ left: pos.x, top: pos.y }}
    >
      {!showEmoji && !showColor ? (
        <>
          <Item label="Copy"  shortcut="⌘C" onClick={run(state.onCopy)}  icon={<CopyIcon />} />
          <Item label="Cut"   shortcut="⌘X" onClick={run(state.onCut)}   icon={<CutIcon />} />
          <Item label="Paste" shortcut="⌘V" onClick={run(state.onPaste)} icon={<PasteIcon />} />
          <div className="my-1 h-px bg-divider" />
          {/* Text color — only show when text is selected */}
          {state.hasSelection && state.onTextColor && (
            <>
              <Item
                label="Text color"
                onClick={(e) => { e.stopPropagation(); setShowColor(true); }}
                icon={<ColorIcon />}
                chevron
              />
              <div className="my-1 h-px bg-divider" />
            </>
          )}
          <Item
            label="Emoji"
            onClick={(e) => { e.stopPropagation(); setShowEmoji(true); }}
            icon={<EmojiIcon />}
            chevron
          />
          <div className="my-1 h-px bg-divider" />
          <Item label="Delete" onClick={run(state.onDelete)} icon={<TrashIcon />} danger />
        </>
      ) : showColor ? (
        <div className="px-2 py-1.5 w-[200px]">
          <button onClick={back} className="mb-1.5 flex items-center gap-1 text-[12px] text-muted-ink hover:text-ink">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M7.5 2.5L4 6l3.5 3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Back
          </button>
          <div className="space-y-0.5">
            {TEXT_COLORS.map((c) => (
              <button
                key={c.value}
                onClick={run(() => state.onTextColor!(c.value))}
                className="flex w-full items-center gap-2.5 px-1.5 py-1.5 rounded-md text-[13px] text-ink hover:bg-surface transition-colors"
              >
                <span
                  className="h-4 w-4 rounded-full border border-[#e5e5e3] shrink-0"
                  style={{ background: c.hex }}
                />
                {c.label}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="px-2 py-1.5">
          <button onClick={back} className="mb-1.5 flex items-center gap-1 text-[12px] text-muted-ink hover:text-ink">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M7.5 2.5L4 6l3.5 3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Back
          </button>
          <div className="grid grid-cols-6 gap-0.5">
            {EMOJIS.map((em) => (
              <button
                key={em}
                onClick={run(() => state.onEmoji(em))}
                className="h-7 w-7 grid place-items-center rounded text-[16px] hover:bg-surface"
              >
                {em}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Item({
  label,
  shortcut,
  onClick,
  icon,
  danger,
  chevron,
}: {
  label: string;
  shortcut?: string;
  onClick: (e: React.MouseEvent) => void;
  icon?: React.ReactNode;
  danger?: boolean;
  chevron?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 px-3 py-1.5 text-[13px] transition-colors hover:bg-surface ${
        danger ? "text-[#d44c47]" : "text-ink"
      }`}
    >
      <span className="grid h-4 w-4 place-items-center text-muted-ink">{icon}</span>
      <span className="flex-1 text-left">{label}</span>
      {shortcut && <span className="text-[11px] text-faint">{shortcut}</span>}
      {chevron && (
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="text-faint">
          <path d="M4.5 2.5L8 6l-3.5 3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </button>
  );
}

function CopyIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <rect x="5.5" y="5.5" width="7.5" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
      <path d="M10.5 5.5V4a1.5 1.5 0 00-1.5-1.5H4A1.5 1.5 0 002.5 4v5A1.5 1.5 0 004 10.5h1.5" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}
function CutIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <circle cx="4" cy="4" r="1.8" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="4" cy="12" r="1.8" stroke="currentColor" strokeWidth="1.3" />
      <path d="M5.5 5L13 12M5.5 11L13 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}
function PasteIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <rect x="3" y="3" width="10" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
      <path d="M6 3V2.5A1.5 1.5 0 017.5 1h1A1.5 1.5 0 0110 2.5V3" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}
function EmojiIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="6" cy="7" r="0.8" fill="currentColor" />
      <circle cx="10" cy="7" r="0.8" fill="currentColor" />
      <path d="M5.5 10c.7.9 1.6 1.4 2.5 1.4S9.8 10.9 10.5 10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}
function TrashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <path d="M3 4.5h10M6 4.5V3.5A1 1 0 017 2.5h2a1 1 0 011 1v1M4.5 4.5l.5 8a1 1 0 001 1h4a1 1 0 001-1l.5-8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function ColorIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <path d="M8 2L3 13h2l1.2-3h3.6L11 13h2L8 2z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" fill="none"/>
      <path d="M6.8 8.5h2.4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    </svg>
  );
}
