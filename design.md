# Quill — Design System

Minimal Notion-style todo with tactile mechanical keyboard sound on typing.

## Vibe
Quiet, focused, monochrome. White canvas, lots of whitespace, no chrome. Every keystroke feels physical (thocky mechanical click via Web Audio).

## Color
- Background: #ffffff
- Text primary: #37352f (Notion ink)
- Text muted: #9b9a97
- Text faint: #cfcecb
- Hover surface: #f1f1ef
- Divider: #ececeb
- Accent (checkbox done / subtle): #37352f (monochrome, no color)
- Strikethrough done text: #b3b2af

## Typography
- Font: Inter (UI), system fallback. Notion uses ui-sans-serif; Inter is the closest clean match and user requested Notion-like.
- Title: 40px / 700
- Task text: 16px / 400, line-height 1.5
- Meta/hints: 13px / 400 muted

## Layout
- Centered column, max-width 640px, generous top padding (~12vh)
- Title editable inline at top
- Add-row: ghost "+ New task" that turns into input
- Task rows: checkbox + text, hover reveals delete (×) on right
- Empty state: faint hint text

## Components
- Checkbox: 18px rounded-[4px] border, fills ink + white check when done
- Task row: py-1.5 px-2, rounded-[4px], hover bg #f1f1ef
- Inline edit: click text → contenteditable / input, blur or Enter saves
- Delete: subtle × appears on hover, right aligned
- Mute toggle: top-right corner icon button (speaker / speaker-off)

## Sound
- Synthesized mechanical keyboard via Web Audio (no asset files)
- Triggered on every keystroke while typing (add input + edit)
- Thocky profile: short noise burst + low-pass filtered click, slight pitch randomization per key, separate brighter tick for spacebar
- Respects mute toggle (persisted in localStorage)

## Persistence
- localStorage: tasks list, page title, muted state

## Motion
- Subtle: task add fade/slide-in, check scale pop. CSS transitions only, fast (120-160ms).
