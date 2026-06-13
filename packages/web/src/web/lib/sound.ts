// Real mechanical keyboard samples with two switchable profiles:
//   "thock"  → Holy Pandas (deep tactile thock)
//   "clicky" → Cherry MX Blue (sharp clicky)
// Plus UI sounds for check/delete. Preloaded, decoded, played with
// random rotation + slight pitch/gain variation so repeats never sound identical.

export type Switch = "thock" | "clicky";

const NORMAL_KEYS = ["key0", "key1", "key2", "key3", "key4"];
const SPECIAL = ["space", "enter", "back"];
const UI = ["check", "delete"]; // shared across profiles, live at /keys root

let ctx: AudioContext | null = null;
const buffers = new Map<string, AudioBuffer>(); // key: "thock/key0", "ui/check"
const loadedProfiles = new Set<Switch>();
let uiLoaded = false;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}

async function loadOne(c: AudioContext, url: string, mapKey: string) {
  try {
    const res = await fetch(url);
    const arr = await res.arrayBuffer();
    const buf = await c.decodeAudioData(arr);
    buffers.set(mapKey, buf);
  } catch {
    /* ignore */
  }
}

async function loadUI(c: AudioContext) {
  if (uiLoaded) return;
  await Promise.all(UI.map((n) => loadOne(c, `/keys/${n}.mp3`, `ui/${n}`)));
  uiLoaded = true;
}

async function loadProfile(c: AudioContext, sw: Switch) {
  if (loadedProfiles.has(sw)) return;
  const names = [...NORMAL_KEYS, ...SPECIAL];
  await Promise.all(names.map((n) => loadOne(c, `/keys/${sw}/${n}.mp3`, `${sw}/${n}`)));
  loadedProfiles.add(sw);
}

/** Preload UI sounds + the given profile. Call after a user gesture. */
export function initSound(sw: Switch = "thock"): Promise<void> {
  const c = getCtx();
  if (!c) return Promise.resolve();
  return Promise.all([loadUI(c), loadProfile(c, sw)]).then(() => {});
}

/** Ensure a profile is loaded (used when user switches). */
export function ensureProfile(sw: Switch) {
  const c = getCtx();
  if (c) loadProfile(c, sw);
}

type KeyKind = "normal" | "space" | "enter" | "back";

export function kindForKey(key: string): KeyKind {
  if (key === " " || key === "Spacebar") return "space";
  if (key === "Enter") return "enter";
  if (key === "Backspace" || key === "Delete") return "back";
  return "normal";
}

let lastIdx = -1;
function pickNormal(): string {
  let i = Math.floor(Math.random() * NORMAL_KEYS.length);
  if (i === lastIdx) i = (i + 1) % NORMAL_KEYS.length;
  lastIdx = i;
  return NORMAL_KEYS[i];
}

function play(mapKey: string, opts: { vary?: boolean } = {}) {
  const c = getCtx();
  if (!c) return;
  const buf = buffers.get(mapKey);
  if (!buf) return;
  const src = c.createBufferSource();
  src.buffer = buf;
  if (opts.vary !== false) {
    src.playbackRate.value = 1 + (Math.random() * 0.08 - 0.04);
  }
  const g = c.createGain();
  g.gain.value = opts.vary !== false ? 0.85 + Math.random() * 0.25 : 1;
  src.connect(g);
  g.connect(c.destination);
  src.start();
  src.onended = () => {
    src.disconnect();
    g.disconnect();
  };
}

/** Play one keypress for the active switch profile. */
export function playKey(kind: KeyKind, sw: Switch) {
  const name = kind === "normal" ? pickNormal() : kind;
  play(`${sw}/${name}`);
}

/** UI action sounds. */
export function playCheck() {
  play("ui/check", { vary: false });
}
export function playDelete() {
  play("ui/delete", { vary: false });
}
