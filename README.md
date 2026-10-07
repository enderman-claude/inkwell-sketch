# Inkwell
Focused drawing app: Kleki-style layers, brushes and stabilizer with a Sketchbook-style touch UI.
`npm ci && npm run build` writes one self-contained `dist/index.html` (works offline).
Pushing to `main` builds it with GitHub Actions and deploys to GitHub Pages. The built file is also attached to each run as the `inkwell-html` artifact.

## What it does
- **Canvas:** pan, zoom, rotate (two-finger twist, `R`), fit (`0`), actual size (`1`). Only the view rotates, never the artwork.
- **Drawing:** pressure, 31 brushes in Basic, Flat (MS Paint style), Texture and Eraser collections, nine brush slots (keys 1 to 9), per-brush settings (flow, spacing, hardness, grain, scatter, angle and more), stabiliser, eyedropper (`I` or Alt), Shift+click straight lines, Shift-drag axis lock, symmetry (mirror, four-way, radial, movable centre).
- **Layers:** add, delete, duplicate, merge down, reorder, rename, hide, lock, alpha lock, opacity, ten blend modes. Every layer operation is undoable.
- **Selection:** rectangle, ellipse, freehand, polygon, magic wand; add/subtract/intersect; invert, all, none, soften edge; marching ants. Painting, erasing, fill, delete, copy and cut all respect it.
- **Transform:** move, scale, rotate, flip the selection (or the whole layer). It re-renders from the original while you adjust, so it only resamples once.
- **Fill:** tolerance setting, optional read-all-layers, stays inside the selection.
- **Files:** autosave and crash recovery (IndexedDB), `.inkwell` project files that keep layers, PNG/JPEG/WebP export, import by button, paste or drop.
- **Interface:** every control is a module you can drag; drop near an edge to dock and rotate it.

## Code map
`doc.js` document (size, layers, selection) · `history.js` undo/redo with a memory cap · `io.js` autosave, project files, export · `select.js` selection · `xform.js` transform · `flood.js` flood fill · `modules.js` draggable UI · `main.js` input, tools and panels.

## Not built yet
Layer masks, clipping masks, layer groups, rulers and perspective guides, gradient fill, gap-closing fill, distort/perspective transform, canvas resize and crop, PSD export, tilt and pressure-to-opacity, custom brushes, palm rejection beyond stylus-first touch handling.
