# Quill — big update

## Requests
1. ✅ decisions made
2. Blue: keep checkbox sky-blue (#38BDF8), completed TEXT → soft muted gray (#9aa4b6-ish), strikethrough muted. (was too-bright #7DD3FC)
3. Shareable link: real backend + DB. share link with view OR edit access. anyone w/ link opens.
4. Sidebar: FOLDERS + pages (nest pages in folders, like Obsidian)
5. [[wikilinks]] between pages — autocomplete, clickable, navigates
6. #tag (no space) → clickable tag chip
7. # / ## / ### heading markdown → auto-style line as heading

## Architecture
- DB: Drizzle + Turso (template default). Table: documents (id, data json, share_id, share_mode).
- Push localStorage → server on change (debounced). Load from server if share link.
- Share: /s/:shareId route, mode view|edit.
- Block model gains kind: "heading" with level. Or keep note + render markdown inline.

## Plan / Progress
- [ ] check template DB setup (drizzle/turso)
- [ ] schema: documents table
- [ ] API: GET/PUT doc, POST share, GET shared
- [ ] sidebar folders model (Page gets folderId; Folder[])
- [ ] heading detection (# ## ###) in block render + edit
- [ ] #tag chips
- [ ] [[wikilink]] autocomplete + click nav
- [ ] color fix
- [ ] share UI (modal: copy link, view/edit toggle)
- [ ] /s/:id shared route
- [ ] build + verify

## ✅ DONE — all shipped & verified (2026-06-12)
- [x] color fix: completed text → #9aa4b6, strike → #c0c7d2
- [x] RichText + #tag chips + [[wikilink]] (click-nav, autocomplete popup)
- [x] # / ## / ### heading auto-styling (prefix stripped in display)
- [x] sidebar folders: new/rename/delete, drag-to-file pages, collapsible
- [x] Share button + ShareModal (view/edit), ownerKey + per-page shareId in LS
- [x] auto-sync shared pages (debounced PUT)
- [x] /s/:id SharedView route (read-only OR editable per mode)
- [x] build clean (tsc+vite), verified via playwright
