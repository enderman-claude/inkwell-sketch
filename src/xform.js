/*
 * Move / scale / rotate / flip. Works on the selected pixels of the active layer, or the whole layer when nothing is selected.
 * While a transform is open the layer is redrawn from the untouched original on every change, so nothing gets blurrier
 * as you adjust it. It becomes one undo step when you apply it.
 */
import { W, H, mk, doc } from './doc.js';
import { push, whole } from './history.js';
import * as SEL from './select.js';

export const xf = { onchange: null };
let tf = null;
export const active = () => !!tf;
export const state = () => tf;

export function begin(L, ignoreSel) {
  if (tf) return true;
  const m = ignoreSel ? null : doc.sel, full = mk(), fx = full.getContext('2d'); fx.drawImage(L.c, 0, 0);
  if (m) { fx.globalCompositeOperation = 'destination-in'; fx.drawImage(m, 0, 0); }
  const b = SEL.bounds(full); if (!b) return false;
  const fl = mk(b.w, b.h); fl.getContext('2d').drawImage(full, -b.x, -b.y);
  const base = mk(), bx = base.getContext('2d'); bx.drawImage(L.c, 0, 0); if (m) { bx.globalCompositeOperation = 'destination-out'; bx.drawImage(m, 0, 0); } else bx.clearRect(0, 0, W, H);
  const before = mk(); before.getContext('2d').drawImage(L.c, 0, 0);
  tf = { L, fl, base, before, b, m, cx: b.x + b.w / 2, cy: b.y + b.h / 2, tx: 0, ty: 0, rot: 0, sc: 1, fx: 1, fy: 1 };
  xf.onchange && xf.onchange(true); return true;
}
function put(t, ctx, img, ox, oy) {
  ctx.save(); ctx.translate(t.cx + t.tx, t.cy + t.ty); ctx.rotate(t.rot); ctx.scale(t.sc * t.fx, t.sc * t.fy); ctx.imageSmoothingQuality = 'high'; ctx.drawImage(img, ox, oy); ctx.restore();
}
export function render() {
  const t = tf; t.L.ctx.clearRect(0, 0, W, H); t.L.ctx.drawImage(t.base, 0, 0); put(t, t.L.ctx, t.fl, -t.b.w / 2, -t.b.h / 2); t.L.dirty = true;
}
export function drag(dx, dy) { if (!tf) return; tf.tx += dx; tf.ty += dy; render(); }
export function set(p) { if (!tf) return; Object.assign(tf, p); render(); }
export function flip(axis) { if (!tf) return; if (axis === 'h') tf.fx *= -1; else tf.fy *= -1; render(); }

export function commit() {
  if (!tf) return; const t = tf; tf = null; xf.onchange && xf.onchange(false);
  if (!(t.tx || t.ty || t.rot || t.sc !== 1 || t.fx < 0 || t.fy < 0)) { t.L.ctx.clearRect(0, 0, W, H); t.L.ctx.drawImage(t.before, 0, 0); return; }
  const after = mk(); after.getContext('2d').drawImage(t.L.c, 0, 0);
  let nm = null; if (t.m) { nm = mk(); put(t, nm.getContext('2d'), t.m, -t.cx, -t.cy); }
  const e = whole(t.L, t.before, after), prev = t.m;
  if (t.m) SEL.applyRaw(nm);
  push({ n: e.n + (nm ? W * H * 4 : 0), u() { e.u(); if (prev) SEL.applyRaw(prev); }, r() { e.r(); if (nm) SEL.applyRaw(nm); } });
}
export function cancel() {
  if (!tf) return; const t = tf; tf = null; xf.onchange && xf.onchange(false);
  t.L.ctx.clearRect(0, 0, W, H); t.L.ctx.drawImage(t.before, 0, 0); t.L.dirty = true;
}
