# Vice Cover Studio

[![make.fun · gta6-cover-art-01](https://make.fun/badge/gta6-cover-art-01.svg)](https://make.fun/bounty/gta6-cover-art-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-cover-art-01)
[![rank](https://make.fun/badge/gta6-cover-art-01/inijikin/gta6-cover-art-01/rank.svg)](https://make.fun/bounty/gta6-cover-art-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-cover-art-01)
[![reward](https://make.fun/badge/gta6-cover-art-01/inijikin/gta6-cover-art-01/reward.svg)](https://make.fun/bounty/gta6-cover-art-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-cover-art-01)

An offline web app that turns your photos and a caption into a multi-panel
GTA-style poster cover — Vice City sunset or neon grade, bold gradient
lettering, exported as a PNG to share. Built for the
[make.fun GTA 6 Cover Art bounty](https://make.fun/bounty/gta6-cover-art-01).

Everything runs in your browser from local files. Photos are read on your
machine and never uploaded. No network request, no build step, no account.

## How to use it

1. Serve `app/` with any static server, or run `node serve.ts` and open
   <http://localhost:8080>.
2. Drop 1–8 photos in (or pick files), or try one of the three samples.
3. Pick a layout — Hero Left, Comic Strip, Diagonal Split, Center Stage,
   Tilted Snapshots, or Nine Grid. Click a panel in the preview to select it,
   drag to move its photo, scroll to zoom.
4. Per panel: choose its photo, zoom, fit or fill, grade (Vice Sunset, Neon
   Nights, Duotone Vice, Noir Coast, Natural Light) and grade strength.
5. Write the caption: title, script sub-caption, size, letter spacing,
   gradient, outline, shadow, position, plus a location badge.
6. One-click looks set grade, lettering and effects together. Grain,
   halftone title block and vignette finish the print.
7. Export PNG in 1080 × 1080, 1080 × 1350 or 1920 × 1080 — one click each.

Shortcuts: `Ctrl+Z` undo, `Ctrl+Y` redo, `Ctrl+E` export at the preview
size, `1`/`2`/`3` switch preview size, arrow keys nudge the selected panel's
photo.

## What is in the box

- `app/index.html`, `app/style.css` — the editor shell and its dark neon UI.
- `app/src/main.js` — wiring: upload, drag-drop, panel editing, export.
- `app/src/cover.js` — the renderer: panels, grades, caption, grain, vignette.
- `app/src/layouts.js` — the six multi-panel layouts.
- `app/src/grades.js` — the five colour grades and the duotone remap.
- `app/src/state.js` — state, one-click looks, undo/redo history.
- `app/src/shots.js` — fixed scenes for screenshots (`?shot=cover` etc).
- `app/fonts/` — Anton, Archivo Black and Pacifico, all SIL Open Font
  License (their OFL texts sit beside them).
- `app/samples/` — three photos made with an image model, free to use.
- `main.ts` — the entry program: copies `app/` and `screenshots/` to
  `/output` and writes `dossier.json` (Node 22, standard library only).

## Originality

No Rockstar Games logo, wordmark, artwork, character or font is used
anywhere. The lettering is Anton / Archivo Black / Pacifico under the SIL
Open Font License, the titles are invented ("Sunset Heist", "Boulevard
Queen", "Neon Shore"), and every photo is either the user's own or a
model-made sample shipped with the app.

## License

MIT — see [LICENSE](LICENSE).
