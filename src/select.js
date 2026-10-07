/*
 * Selection. The selection is a mask canvas (doc.sel): its alpha says how selected each pixel is, which also makes
 * soft (feathered) selections work. Painting, filling, erasing, clearing and moving all respect it.
 */
import { W, H, mk, doc, flatten } from './doc.js';
import { push } from './history.js';
import { flood } from './flood.js';

export const opts = { shape: 'rect', mode: 'replace', tol: 32, all: false };   // mode: replace | add | sub | int
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
let stroke = null, kget = () => 1, layer = () => null, onchange = () => { };
const NS = 'http://www.w3.org/2000/svg';
export const ants = document.createElement('div'); ants.className = 'ants'; ants.style.cssText = `width:${W}px;height:${H}px;display:none`;
export const pv = document.createElementNS(NS, 'svg'); pv.setAttribute('class', 'selpv'); pv.setAttribute('viewBox', `0 0 ${W} ${H}`); pv.style.cssText = `width:${W}px;height:${H}px`;
export const overlay = [ants, pv];
export function init(o) { stroke = o.stroke; kget = o.k; layer = o.layer; onchange = o.onchange || onchange; }

/* --- looking at masks --- */
export function bounds(c) {
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data, w = c.width, h = c.height; let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0, i = (y * w) * 4 + 3; x < w; x++, i += 4) if (d[i]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; y1 = y; }
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}
export const isEmpty = c => !bounds(c);

/* --- showing the selection: marching ants, and a CSS mask that keeps the live stroke inside it --- */
let token = 0, urls = [], lastK = 1, zt = 0;
const url = c => new Promise(r => c.toBlob(b => r(URL.createObjectURL(b))));
const setMask = (e, v) => { e.style.maskImage = e.style.webkitMaskImage = v; e.style.maskSize = e.style.webkitMaskSize = '100% 100%'; };
const free = () => { urls.forEach(u => URL.revokeObjectURL(u)); urls = []; };
function outline(m, d) {
  const o = mk(), x = o.getContext('2d'), e = mk(), ex = e.getContext('2d');
  x.drawImage(m, 0, 0); ex.drawImage(m, 0, 0); ex.globalCompositeOperation = 'destination-in';
  for (const [dx, dy] of [[d, 0], [-d, 0], [0, d], [0, -d]]) ex.drawImage(m, dx, dy);
  x.globalCompositeOperation = 'destination-out'; x.drawImage(e, 0, 0); return o;
}
export function refresh() {
  const tok = ++token, m = doc.sel; lastK = kget();
  if (!m) { ants.style.display = 'none'; if (stroke) setMask(stroke, ''); free(); return; }
  const d = clamp(Math.round(1.6 / lastK), 1, 6);
  Promise.all([url(m), url(outline(m, d))]).then(([a, b]) => {
    if (tok !== token) { URL.revokeObjectURL(a); URL.revokeObjectURL(b); return; }
    free(); urls = [a, b]; if (stroke) setMask(stroke, `url(${a})`); ants.style.display = 'block'; setMask(ants, `url(${b})`);
  });
}
/* the ants are drawn at a thickness that suits the zoom, so redraw them after the zoom has changed a lot */
export function rezoom() { if (!doc.sel || Math.abs(Math.log(kget() / lastK)) < .4) return; clearTimeout(zt); zt = setTimeout(refresh, 250); }

/* --- changing the selection (every change is one undo step) --- */
export function applyRaw(m) { doc.sel = m; refresh(); onchange(); }
export function set(next) {
  const prev = doc.sel; if (prev === next) return;
  applyRaw(next); push({ n: W * H * 8, u: () => applyRaw(prev), r: () => applyRaw(next) });
}
function combine(m, mode) {
  const old = doc.sel;
  if (mode === 'replace') return m;
  if (!old) return mode === 'add' ? m : null;
  const r = mk(), c = r.getContext('2d'); c.drawImage(old, 0, 0);
  if (mode === 'add') c.drawImage(m, 0, 0); else { c.globalCompositeOperation = mode === 'sub' ? 'destination-out' : 'destination-in'; c.drawImage(m, 0, 0); }
  return r;
}
export function commit(m, mode = opts.mode) { let r = combine(m, mode); if (r && mode !== 'replace' && isEmpty(r)) r = null; set(r); }
export const clear = () => set(null);
const white = () => { const m = mk(), c = m.getContext('2d'); c.fillStyle = '#fff'; c.fillRect(0, 0, W, H); return m; };
export const all = () => set(white());
export function invert() {
  const m = white(); if (doc.sel) { const c = m.getContext('2d'); c.globalCompositeOperation = 'destination-out'; c.drawImage(doc.sel, 0, 0); if (isEmpty(m)) return set(null); } set(m);
}
export function feather(px) {
  if (!doc.sel) return false; const m = mk(), c = m.getContext('2d'); if (!('filter' in c)) return false;
  c.filter = `blur(${px}px)`; c.drawImage(doc.sel, 0, 0); set(m); return true;
}

/* --- drawing a selection --- */
let d = null, poly = null;
function drawPv(tag, attrs) { ['u', 't'].forEach(cls => { const e = document.createElementNS(NS, tag); e.setAttribute('class', cls); for (const k in attrs) e.setAttribute(k, attrs[k]); pv.append(e); }); }
const pts2 = a => a.map(p => p.join(',')).join(' ');
function preview() {
  pv.replaceChildren();
  if (d) {
    const x = Math.min(d.x0, d.x1), y = Math.min(d.y0, d.y1), w = Math.abs(d.x1 - d.x0), h = Math.abs(d.y1 - d.y0);
    if (d.sh === 'rect') drawPv('rect', { x, y, width: w, height: h });
    else if (d.sh === 'ellipse') drawPv('ellipse', { cx: x + w / 2, cy: y + h / 2, rx: w / 2, ry: h / 2 });
    else drawPv('polygon', { points: pts2(d.pts) });
  }
  if (poly) { const p = poly.cur ? [...poly.pts, poly.cur] : poly.pts; drawPv('polyline', { points: pts2(p), fill: 'none' }); const f = poly.pts[0]; drawPv('circle', { cx: f[0], cy: f[1], r: 6 / kget() }); }
}
function shapeMask(sh, pts, x0, y0, x1, y1) {
  const m = mk(), c = m.getContext('2d'); c.fillStyle = '#fff'; c.beginPath();
  const x = Math.min(x0, x1), y = Math.min(y0, y1), w = Math.abs(x1 - x0), h = Math.abs(y1 - y0);
  if (sh === 'rect') c.rect(x, y, w, h); else if (sh === 'ellipse') c.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
  else { pts.forEach((p, i) => i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])); c.closePath(); }
  c.fill(); return m;
}
const modeOf = ev => ev.altKey ? 'sub' : ev.shiftKey ? 'add' : opts.mode;

export function down(x, y, ev = {}) {
  const sh = opts.shape, mode = modeOf(ev);
  if (sh === 'wand') return wand(x, y, mode);
  if (sh === 'poly') {
    const now = performance.now();
    if (poly && poly.pts.length >= 3) {
      const f = poly.pts[0], l = poly.pts[poly.pts.length - 1], near = Math.hypot(x - f[0], y - f[1]) < 14 / kget(), dbl = now - poly.t < 350 && Math.hypot(x - l[0], y - l[1]) < 10 / kget();
      if (near || dbl) return closePoly();
    }
    if (!poly) poly = { pts: [], mode, t: 0 };
    poly.pts.push([x, y]); poly.t = now; poly.cur = null; return preview();
  }
  d = { sh, mode, x0: x, y0: y, x1: x, y1: y, pts: [[x, y]] }; preview();
}
export function move(x, y) {
  if (!d) return; d.x1 = x; d.y1 = y;
  if (d.sh === 'lasso') { const l = d.pts[d.pts.length - 1]; if (Math.hypot(x - l[0], y - l[1]) > 1.5 / kget()) d.pts.push([x, y]); }
  preview();
}
export function hover(x, y) { if (poly) { poly.cur = [x, y]; preview(); } }
export function up() {
  if (!d) return; const s = d; d = null; pv.replaceChildren();
  const tiny = s.sh === 'lasso' ? s.pts.length < 3 : Math.abs(s.x1 - s.x0) < 2 || Math.abs(s.y1 - s.y0) < 2;
  if (tiny) { if (s.mode === 'replace') clear(); return; }
  commit(shapeMask(s.sh, s.pts, s.x0, s.y0, s.x1, s.y1), s.mode);
}
export function closePoly() {
  if (!poly) return false; const p = poly; poly = null; pv.replaceChildren();
  if (p.pts.length < 3) return false;
  commit(shapeMask('poly', p.pts), p.mode); return true;
}
export const polyOpen = () => !!poly;
export function cancelDrag() { d = null; poly = null; pv.replaceChildren(); }
export function abortDrag() { d = null; preview(); }       // a second finger arrived: drop the drag but keep a polygon in progress

/* --- magic wand: select the area of similar colour --- */
function wand(x, y, mode) {
  x |= 0; y |= 0; if (x < 0 || y < 0 || x >= W || y >= H) return;
  const L = layer(), src = (opts.all ? flatten() : L.c).getContext('2d').getImageData(0, 0, W, H);
  const { seen, box } = flood(src.data, x, y, opts.tol);
  const out = new ImageData(W, H), od = out.data; for (let y2 = box[1]; y2 <= box[3]; y2++) for (let x2 = box[0], p = y2 * W + box[0]; x2 <= box[2]; x2++, p++) if (seen[p]) od[p * 4 + 3] = 255;
  const m = mk(); m.getContext('2d').putImageData(out, 0, 0); commit(m, mode);
}
