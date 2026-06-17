import React from "react";

// ── Live time chip — updates every second ────────────────────────────────────
// Rendered for the "{{time}}" token, inserted by typing "/add time".
export function LiveTime() {
  const [now, setNow] = React.useState(() => new Date());
  React.useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const hh = now.getHours().toString().padStart(2, "0");
  const mm = now.getMinutes().toString().padStart(2, "0");
  const ss = now.getSeconds().toString().padStart(2, "0");
  return (
    <span className="inline-flex items-center align-baseline gap-1 mx-px rounded-md bg-[#f1f4f9] px-1.5 py-0.5 font-mono text-[0.82em] font-medium text-[#5a6273] tabular-nums">
      <svg width="10" height="10" viewBox="0 0 16 16" fill="none" className="text-[#9aa4b6]">
        <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.3"/>
        <path d="M8 5v3.2l2 1.3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
      </svg>
      {hh}:{mm}<span className="text-[#aab2c0]">:{ss}</span>
    </span>
  );
}

// ── Heading detection ────────────────────────────────────────────────────────
// Leading "# ", "## ", "### " → heading level 1..3 (rest is the visible text)
export function headingLevel(text: string): { level: 1 | 2 | 3; rest: string } | null {
  const m = text.match(/^(#{1,3})\s+(.*)$/);
  if (!m) return null;
  return { level: m[1].length as 1 | 2 | 3, rest: m[2] };
}

export const HEADING_CLASS: Record<1 | 2 | 3, string> = {
  1: "text-[26px] font-bold leading-snug tracking-tight",
  2: "text-[21px] font-semibold leading-snug tracking-tight",
  3: "text-[17px] font-semibold leading-snug",
};

// ── Inline tokens: #tag, [[wikilink]], **bold**, _italic_, __underline__ ──────
type Token =
  | { type: "text"; value: string }
  | { type: "tag"; value: string }          // value = tag without "#"
  | { type: "link"; value: string }         // value = page title inside [[ ]]
  | { type: "url"; value: string }          // raw https?:// URL
  | { type: "time" }                        // {{time}} → live clock
  | { type: "bold"; value: string }         // **text**
  | { type: "italic"; value: string }       // _text_
  | { type: "underline"; value: string };   // __text__

// Order matters: __underline__ before _italic_, **bold** standalone
const TOKEN_RE = /(\{\{time\}\})|(https?:\/\/[^\s<>"]+)|(\[\[[^\]]+\]\])|(#[A-Za-z0-9_\-/]+)|(\*\*([^*]+)\*\*)|(__([^_]+)__)|((?<![_])_([^_]+)_(?![_]))/g;

export function tokenize(text: string): Token[] {
  const out: Token[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  TOKEN_RE.lastIndex = 0;
  while ((m = TOKEN_RE.exec(text)) !== null) {
    if (m.index > last) out.push({ type: "text", value: text.slice(last, m.index) });
    if (m[1]) out.push({ type: "time" });
    else if (m[2]) out.push({ type: "url", value: m[2] });
    else if (m[3]) out.push({ type: "link", value: m[3].slice(2, -2).trim() });
    else if (m[4]) out.push({ type: "tag", value: m[4].slice(1) });
    else if (m[5]) out.push({ type: "bold", value: m[6] });
    else if (m[7]) out.push({ type: "underline", value: m[8] });
    else if (m[9]) out.push({ type: "italic", value: m[10] });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ type: "text", value: text.slice(last) });
  return out;
}

// Render text with clickable tags + wikilinks.
export function RichText({
  text,
  onTag,
  onLink,
  className = "",
  style,
}: {
  text: string;
  onTag?: (tag: string) => void;
  onLink?: (title: string) => void;
  className?: string;
  style?: React.CSSProperties;
}) {
  const tokens = tokenize(text);
  return (
    <span className={className} style={style}>
      {tokens.map((t, i) => {
        if (t.type === "time") {
          return <LiveTime key={i} />;
        }
        if (t.type === "url") {
          return (
            <a
              key={i}
              href={t.value}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="text-[#3b82f6] underline underline-offset-2 decoration-[#bfdbfe] hover:decoration-[#3b82f6] transition-colors break-all"
            >
              {t.value}
            </a>
          );
        }
        if (t.type === "tag") {
          return (
            <button
              key={i}
              onClick={(e) => { e.stopPropagation(); onTag?.(t.value); }}
              className="inline-flex items-center align-baseline text-[0.82em] font-medium text-[#2f7fdb] bg-sky-50 hover:bg-sky-100 px-1.5 py-0.5 rounded-md mx-px transition-colors"
            >
              #{t.value}
            </button>
          );
        }
        if (t.type === "link") {
          return (
            <button
              key={i}
              onClick={(e) => { e.stopPropagation(); onLink?.(t.value); }}
              className="text-[#2f7fdb] underline decoration-[#bfdcfb] underline-offset-2 hover:decoration-[#2f7fdb] transition-colors"
            >
              {t.value}
            </button>
          );
        }
        if (t.type === "bold") return <strong key={i} className="font-semibold">{t.value}</strong>;
        if (t.type === "italic") return <em key={i}>{t.value}</em>;
        if (t.type === "underline") return <u key={i}>{t.value}</u>;
        return <React.Fragment key={i}>{t.value}</React.Fragment>;
      })}
    </span>
  );
}

// Collect all unique tags across a body of text lines.
export function collectTags(texts: string[]): string[] {
  const set = new Set<string>();
  for (const txt of texts) {
    for (const t of tokenize(txt)) if (t.type === "tag") set.add(t.value);
  }
  return [...set].sort();
}

// Collect wikilink targets.
export function collectLinks(texts: string[]): string[] {
  const set = new Set<string>();
  for (const txt of texts) {
    for (const t of tokenize(txt)) if (t.type === "link") set.add(t.value);
  }
  return [...set];
}
