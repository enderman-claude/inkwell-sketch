/*
 * Undo/redo. Every change to the document is an entry { u(), r(), n }:
 * u undoes it, r redoes it, n is roughly how many bytes it keeps alive (used to cap memory).
 */
import { W, H } from './doc.js';

const U = [], R = [], BUDGET = 400e6, MAX = 200;
export const hist = { onchange: null, onedit: null };
const total = a => a.reduce((s, e) => s + (e.n || 0), 0);
const edited = () => hist.onedit && hist.onedit();

export function push(e) {
  U.push(e); R.length = 0;
  while (U.length > 1 && (U.length > MAX || total(U) > BUDGET)) U.shift();
  edited();
}
/* mark the document as changed without an undo step (e.g. a slider that has its own history entry) */
export const touch = edited;
export function undo() { const e = U.pop(); if (!e) return false; e.u(); R.push(e); hist.onchange && hist.onchange(); edited(); return true; }
export function redo() { const e = R.pop(); if (!e) return false; e.r(); U.push(e); hist.onchange && hist.onchange(); edited(); return true; }
export const canUndo = () => U.length > 0;
export const clearHistory = () => { U.length = R.length = 0; };

/* A rectangle of pixels on layer L that changed from `before` to `after` (both ImageData at x,y) */
export function patch(L, x, y, before, after) {
  return { n: before.data.length + after.data.length, u() { L.ctx.putImageData(before, x, y); L.dirty = true; }, r() { L.ctx.putImageData(after, x, y); L.dirty = true; } };
}
/* The whole of layer L changed from canvas `before` to canvas `after` */
export function whole(L, before, after) {
  const put = c => { L.ctx.clearRect(0, 0, W, H); L.ctx.drawImage(c, 0, 0); L.dirty = true; };
  return { n: W * H * 8, u() { put(before); }, r() { put(after); } };
}
