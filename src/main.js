import './style.css';
import { icon } from './icons.js';
import { mod, attach, hooks, resetAll, insets } from './modules.js';
import { W, H, mk, layers, makeLayer, flatten, MODE } from './doc.js';
import { push, undo, redo, patch, whole, hist, touch, canUndo, clearHistory } from './history.js';
import * as IO from './io.js';

const SW = ['#1b1b1f', '#ffffff', '#e5484d', '#f76b15', '#ffc53d', '#46a758', '#12a594', '#3e63dd', '#8e4ec6', '#d6409f', '#a18072', '#8b8d98'];
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const el = (t, c, h) => { const e = document.createElement(t); if (c) e.className = c; if (h != null) e.innerHTML = h; return e; };
const BR = {
  pen: { n: 'Pen', s: 8, o: 100, b: 0, p: .7 },
  ink: { n: 'Ink', s: 6, o: 100, b: 0, p: 1 },
  marker: { n: 'Marker', s: 24, o: 70, b: .5, p: .2 },
  pencil: { n: 'Pencil', s: 4, o: 75, b: .25, p: .5 },
  airbrush: { n: 'Airbrush', s: 60, o: 30, b: 1.2, p: .3 },
  highlighter: { n: 'Highlighter', s: 34, o: 35, b: 0, p: 0 }
};
const S = { tool: 'brush', brush: 'pen', more: false, dbl: false, touchDraw: true, penSeen: false, hsv: [0, 0, .11], theme: 'dark', bg: { hex: '#000000', hsv: [0, 0, 0], a: 0 }, color: '#1b1b1f', size: 8, opacity: 100, stab: 40, active: 1, v: { x: 0, y: 0, k: 1, r: 0 } };
const B = () => BR[S.brush];
const cur = () => layers[S.active];

const app = document.getElementById('app');
const stage = el('div', 'stage'), board = el('div', 'board');
const stroke = mk(), sctx = stroke.getContext('2d'); stroke.className = 'stroke';
const pre = mk(), pctx = pre.getContext('2d');
board.style.cssText = `width:${W}px;height:${H}px`;
stage.append(board); app.append(stage);

/* layers */
function addLayer(name, bg, quiet) {
  const L = makeLayer({ name, bg });
  if (bg || quiet) { layers.splice(bg ? 0 : S.active + 1, 0, L); S.active = bg ? 1 : layers.indexOf(L); stack(); panel(); return L; }
  return insertOp(L, S.active + 1);
}
/* Every layer operation below is one undo step: it has a do and an undo, both safe to run again */
function insertOp(L, at) {
  const was = S.active, doit = () => { layers.splice(at, 0, L); S.active = at; }, undoit = () => { layers.splice(layers.indexOf(L), 1); S.active = was; };
  doit(); push({ n: 0, u: undoit, r: doit }); stack(); panel(); return L;
}
function setProp(L, k, v) {
  const old = L[k]; if (old === v) return;
  const set = x => { L[k] = x; }; set(v); push({ n: 0, u: () => set(old), r: () => set(v) }); stack(); panel();
}
function paintBg() {
  const L = layers[0], n = parseInt(S.bg.hex.slice(1), 16);
  L.ctx.clearRect(0, 0, W, H); L.ctx.fillStyle = `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${S.bg.a})`; L.ctx.fillRect(0, 0, W, H); L.dirty = true; touch();
}
function stack() {
  board.replaceChildren();
  layers.forEach((L, i) => { const s = L.c.style; s.opacity = L.op; s.display = L.show ? '' : 'none'; s.mixBlendMode = L.mode; board.append(L.c); if (i === S.active) board.append(stroke); });
}

/* view: pan, zoom and rotate. Only the view changes; the artwork underneath is never rotated or resized */
const ROT = Math.PI / 12, norm = a => Math.atan2(Math.sin(a), Math.cos(a));
const apply = () => { board.style.transform = `translate(${S.v.x}px,${S.v.y}px) rotate(${S.v.r}rad) scale(${S.v.k})`; board.style.setProperty('--k', S.v.k); };
function fit() { const r = stage.getBoundingClientRect(), k = Math.min(r.width / W, r.height / H) * .94; S.v = { k, r: 0, x: (r.width - W * k) / 2, y: (r.height - H * k) / 2 }; apply(); }
/* screen point -> canvas point */
function pt(cx, cy) { const r = stage.getBoundingClientRect(), v = S.v, dx = cx - r.left - v.x, dy = cy - r.top - v.y, c = Math.cos(v.r), s = Math.sin(v.r); return [(dx * c + dy * s) / v.k, (-dx * s + dy * c) / v.k]; }
/* set zoom k and rotation rot so that canvas point p appears at screen point (sx, sy) */
function anchor(p, sx, sy, k, rot) { const r = stage.getBoundingClientRect(), c = Math.cos(rot), s = Math.sin(rot); S.v = { k, r: rot, x: sx - r.left - k * (c * p[0] - s * p[1]), y: sy - r.top - k * (s * p[0] + c * p[1]) }; apply(); }
const zoomAt = (cx, cy, k) => anchor(pt(cx, cy), cx, cy, clamp(k, .1, 16), S.v.r);
const mid = () => { const r = stage.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; };
const zoom100 = () => zoomAt(...mid(), 1);
const rotateTo = rot => { const [cx, cy] = mid(); anchor(pt(cx, cy), cx, cy, S.v.k, norm(rot)); };
const rotateBy = d => rotateTo(S.v.r + d), resetRot = () => rotateTo(0);

/* history */
const doUndo = () => { if (!undo()) flash('Nothing to undo'); }, doRedo = () => { if (!redo()) flash('Nothing to redo'); };
hist.onchange = () => { S.active = clamp(S.active, 1, layers.length - 1); stack(); panel(); };

/* drawing */
const wid = p => { const k = B().p; return S.size * (1 - k + k * p); };
function seg(c, x0, y0, x1, y1, w) { c.lineWidth = w; c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1 + .01, y1); c.stroke(); }
let draw = null, curTool = 'brush';
function begin(e) {
  if (S.picking || e.altKey) return pickAt(e);
  const L = cur(); if (!L.show) return flash('This layer is hidden. Show it to draw on it'); if (L.lock) return flash('This layer is locked. Unlock it to draw on it');
  const [x, y] = pt(e.clientX, e.clientY);
  curTool = e.pointerType === 'pen' && (e.buttons & 32) ? 'eraser' : S.tool;
  if (curTool === 'fill') return fill(L, x | 0, y | 0);
  if (curTool === 'eraser' && L.alock) return flash('Alpha lock is on, so erasing is off. Turn it off in Layers to erase');
  const er = curTool === 'eraser', c = er ? L.ctx : sctx;
  c.lineCap = c.lineJoin = 'round'; c.strokeStyle = S.color;
  if (er) { pctx.clearRect(0, 0, W, H); pctx.drawImage(L.c, 0, 0); c.globalCompositeOperation = 'destination-out'; }
  else { sctx.clearRect(0, 0, W, H); stroke.style.opacity = S.opacity / 100; c.shadowBlur = S.size * B().b; c.shadowColor = S.color; }
  draw = { L, c, x, y, tx: x, ty: y, bb: [x, y, x, y], p: 1, n: 0, id: e.pointerId, pen: e.pointerType === 'pen' };
  app.classList.add('drawing'); move(e);
}
function move(e) {
  const d = draw, [tx, ty] = pt(e.clientX, e.clientY);
  const r = e.pointerType === 'pen' ? Math.max(.05, e.pressure) ** .85 : 1; d.p = d.n++ ? d.p * .55 + r * .45 : r;
  d.tx = tx; d.ty = ty; follow(1 - S.stab / 100);
}
function follow(f) {
  const d = draw, nx = d.x + (d.tx - d.x) * f, ny = d.y + (d.ty - d.y) * f;
  seg(d.c, d.x, d.y, nx, ny, wid(d.p));
  const b = d.bb; b[0] = Math.min(b[0], d.x, nx); b[1] = Math.min(b[1], d.y, ny); b[2] = Math.max(b[2], d.x, nx); b[3] = Math.max(b[3], d.y, ny);
  d.x = nx; d.y = ny;
}
function end() {
  const d = draw;
  for (let i = 0; i < 80 && Math.hypot(d.tx - d.x, d.ty - d.y) > .5; i++) follow(.25);
  draw = null; app.classList.remove('drawing');
  const pad = S.size * (2 + B().b) + 8, [a, b, c, e] = d.bb, x = clamp(Math.floor(a - pad), 0, W), y = clamp(Math.floor(b - pad), 0, H);
  const w = clamp(Math.ceil(c + pad), 0, W) - x, h = clamp(Math.ceil(e + pad), 0, H) - y, er = curTool === 'eraser', L = d.L;
  if (w > 0 && h > 0) {
    const before = (er ? pctx : L.ctx).getImageData(x, y, w, h);
    if (!er) { L.ctx.globalAlpha = S.opacity / 100; if (L.alock) L.ctx.globalCompositeOperation = 'source-atop'; L.ctx.drawImage(stroke, 0, 0); L.ctx.globalCompositeOperation = 'source-over'; L.ctx.globalAlpha = 1; }
    L.dirty = true; push(patch(L, x, y, before, L.ctx.getImageData(x, y, w, h)));
    if (!er) addRecent(S.color);
  }
  sctx.clearRect(0, 0, W, H); d.c.globalCompositeOperation = 'source-over'; d.c.shadowBlur = 0;
}
function cancel() {
  if (!draw) return; const d = draw; draw = null; app.classList.remove('drawing'); sctx.clearRect(0, 0, W, H);
  if (curTool === 'eraser') { d.c.globalCompositeOperation = 'source-over'; d.L.ctx.clearRect(0, 0, W, H); d.L.ctx.drawImage(pre, 0, 0); }
}
const sc = document.createElement('canvas'); sc.width = sc.height = 1; const sg = sc.getContext('2d', { willReadFrequently: true });
function sample(x, y) {
  x |= 0; y |= 0; if (x < 0 || y < 0 || x >= W || y >= H) return null;
  sg.clearRect(0, 0, 1, 1);
  layers.forEach(L => { if (L.show) { sg.globalAlpha = L.op; sg.globalCompositeOperation = MODE(L.mode); sg.drawImage(L.c, x, y, 1, 1, 0, 0, 1, 1); } });
  sg.globalAlpha = 1; sg.globalCompositeOperation = 'source-over';
  const d = sg.getImageData(0, 0, 1, 1).data; return d[3] ? '#' + [d[0], d[1], d[2]].map(c => c.toString(16).padStart(2, '0')).join('') : null;
}
function fill(L, sx, sy) {
  if (sx < 0 || sy < 0 || sx >= W || sy >= H) return;
  const img = L.ctx.getImageData(0, 0, W, H), d = img.data, i0 = (sy * W + sx) * 4, t = [d[i0], d[i0 + 1], d[i0 + 2], d[i0 + 3]];
  const n = parseInt(S.color.slice(1), 16), col = [n >> 16, (n >> 8) & 255, n & 255, Math.round(S.opacity * 2.55)];
  const seen = new Uint8Array(W * H), st = [sy * W + sx]; let x0 = sx, x1 = sx, y0 = sy, y1 = sy;
  const ok = i => Math.abs(d[i] - t[0]) + Math.abs(d[i + 1] - t[1]) + Math.abs(d[i + 2] - t[2]) + Math.abs(d[i + 3] - t[3]) < 96;
  while (st.length) {
    const p = st.pop(); if (seen[p] || !ok(p * 4)) continue; seen[p] = 1;
    const x = p % W, y = (p / W) | 0; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    if (x > 0) st.push(p - 1); if (x < W - 1) st.push(p + 1); if (y > 0) st.push(p - W); if (y < H - 1) st.push(p + W);
  }
  const w = x1 - x0 + 1, h = y1 - y0 + 1, before = L.ctx.getImageData(x0, y0, w, h);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (seen[y * W + x]) { const o = (y * W + x) * 4; if (!L.alock) d.set(col, o); else if (d[o + 3]) { d[o] = col[0]; d[o + 1] = col[1]; d[o + 2] = col[2]; } }
  L.ctx.putImageData(img, 0, 0); L.dirty = true; push(patch(L, x0, y0, before, L.ctx.getImageData(x0, y0, w, h))); addRecent(S.color);
}

/* input: pen/mouse draw, one finger draws, two fingers pinch/pan, two-finger tap undo, three-finger tap redo */
const touches = new Map(); let g = null, tap = null, locked = false, pan = null, space = false;
const pops = [], pucks = [];
const closeAll = () => { pops.forEach(p => p.classList.remove('on')); pucks.forEach(p => p.classList.remove('open')); };
stage.onpointerdown = e => {
  if (e.pointerType === 'touch' && draw && draw.pen) return;
  stage.setPointerCapture(e.pointerId); closeAll(); sawPen(e);
  if (e.pointerType === 'touch') {
    touches.set(e.pointerId, [e.clientX, e.clientY]);
    if (touches.size === 1) tap = { t: performance.now(), n: 1, m: 0 }; else if (tap) tap.n = Math.max(tap.n, touches.size);
    if (touches.size >= 2) {
      cancel(); locked = true; const [a, b] = [...touches.values()];
      const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2; g = { d: Math.hypot(a[0] - b[0], a[1] - b[1]) || 1, a: Math.atan2(b[1] - a[1], b[0] - a[0]), mx, my, p: pt(mx, my), v: { ...S.v } }; return;
    }
  }
  if (e.button === 1 || space) { pan = { x: e.clientX, y: e.clientY, v: { ...S.v } }; return; }
  if (locked || e.button > 0) return;
  if (e.pointerType === 'touch' && !S.touchDraw) { pan = { x: e.clientX, y: e.clientY, v: { ...S.v } }; return; }
  begin(e);
};
stage.onpointermove = e => {
  hover(e);
  if (e.pointerType === 'touch' && touches.has(e.pointerId)) {
    touches.set(e.pointerId, [e.clientX, e.clientY]);
    if (g && touches.size >= 2) {
      const [a, b] = [...touches.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]), mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
      const da = norm(Math.atan2(b[1] - a[1], b[0] - a[0]) - g.a);
      if (tap) tap.m = Math.abs(d - g.d) + Math.hypot(mx - g.mx, my - g.my) + Math.abs(da) * 80;
      let rot = norm(g.v.r + da); if (Math.abs(rot) < .06) rot = 0;       // twist snaps back to upright
      anchor(g.p, mx, my, clamp(g.v.k * d / g.d, .1, 16), rot); return;
    }
  }
  if (pan) { S.v = { ...pan.v, x: pan.v.x + e.clientX - pan.x, y: pan.v.y + e.clientY - pan.y }; apply(); return; }
  if (draw && e.pointerId === draw.id) for (const c of (e.getCoalescedEvents?.() || [e])) move(c);
};
stage.onpointerup = stage.onpointercancel = e => {
  if (e.pointerType === 'touch') {
    touches.delete(e.pointerId); if (touches.size < 2) g = null;
    if (!touches.size) {
      if (tap && performance.now() - tap.t < 350 && tap.m < 12) { if (tap.n === 2) doUndo(); else if (tap.n === 3) doRedo(); }
      tap = null; locked = false;
    }
  }
  pan = null; if (draw && draw.id === e.pointerId) end();
};
const ghost = el('div', 'ghost'); stage.append(ghost);
function sawPen(e) { if (e.pointerType === 'pen' && !S.penSeen) { S.penSeen = true; if (S.touchDraw) { S.touchDraw = false; flash('Stylus detected. Fingers now pan and zoom; turn on Finger drawing in Settings to change this', 3200); fingerBtn.u(); } } }
function hover(e) {
  if (e.pointerType === 'touch') return; sawPen(e);
  const r = stage.getBoundingClientRect(), z = Math.max(5, S.size * S.v.k);
  ghost.style.cssText = `display:block;width:${z}px;height:${z}px;transform:translate(${e.clientX - r.left - z / 2}px,${e.clientY - r.top - z / 2}px)`;
}
stage.onpointerleave = () => { ghost.style.display = 'none'; };
stage.oncontextmenu = e => e.preventDefault();
stage.onwheel = e => { e.preventDefault(); if (e.altKey) { const p = pt(e.clientX, e.clientY); anchor(p, e.clientX, e.clientY, S.v.k, norm(S.v.r - e.deltaY * .002)); } else zoomAt(e.clientX, e.clientY, S.v.k * Math.exp(-e.deltaY * (e.ctrlKey ? .01 : .0015))); };

/* ui */
const btn = (n, t, f, c = '', lb = '') => { const b = el('button', 'btn ' + c, icon(n) + (lb ? `<span class="lb">${lb}</span>` : '')); b.title = t; b.setAttribute('aria-label', t); b.onclick = f; return b; };
const toast = el('div', 'toast'); app.append(toast); let tt;
function flash(m, ms = 1800) { toast.textContent = m; toast.classList.add('on'); clearTimeout(tt); tt = setTimeout(() => toast.classList.remove('on'), ms); }
function toggle(p, a) {
  const was = p.classList.contains('on'); pops.forEach(q => q.classList.remove('on')); p.classList.toggle('on', !was); if (a) p.anc = a;
  if (!was) { if (p === cp) { prevCol = S.color; old.style.setProperty('--c', prevCol); renderPal(); } placePop(p); }
}
/* A panel opens beside the module that opened it, on the side with room */
function placePop(p) {
  const a = p.anc; if (!a || !p.classList.contains('on')) return;
  const r = a.node.getBoundingClientRect(), w = p.offsetWidth, h = p.offsetHeight, e = a.at.e, g = 8, i = insets();
  let x = r.left + r.width / 2 - w / 2, y = r.top + r.height / 2 - h / 2;
  if (e === 'top') y = r.bottom + g; else if (e === 'bottom') y = r.top - h - g; else if (e === 'left') x = r.right + g; else x = r.left - w - g;
  p.style.left = clamp(x, 6 + i.l, innerWidth - w - 6 - i.r) + 'px'; p.style.top = clamp(y, 6 + i.t, innerHeight - h - 6 - i.b) + 'px';
}
const mkPop = id => { const p = el('div', 'pop'); p.id = id; pops.push(p); return p; };
const lp = mkPop('lp'), sp = mkPop('sp'), cp = mkPop('cp'), bp = mkPop('bp'), fp = mkPop('fp');
hooks.lift = closeAll; hooks.move = m => pops.forEach(p => p.anc === m && placePop(p));

/* modules: each piece of UI is a module that can be dragged and docked (see modules.js). Defaults are { e: edge, t: 0..1 along it } */
const M = {}, grip = label => { const g = el('button', 'grip'); g.title = 'Drag to move. Drop near a screen edge to dock it'; g.setAttribute('aria-label', label); return g; };

const bar = el('header', 'mod bar'), barGrip = grip('Move toolbar');
bar.append(barGrip, btn('undo', 'Undo (Ctrl+Z)', () => doUndo(), 'lab', 'Undo'), btn('redo', 'Redo (Ctrl+Shift+Z)', () => doRedo(), 'lab', 'Redo'), el('i', 'sep'),
  btn('layers', 'Layers', () => toggle(lp, M.bar), 'lab', 'Layers'), btn('tune', 'Settings', () => toggle(sp, M.bar), 'lab', 'Settings'), btn('download', 'File: save, open, import, export', () => toggle(fp, M.bar), 'lab', 'File'));
app.append(bar, lp, sp, cp, bp, fp); M.bar = mod('bar', bar, { e: 'top', t: .5 }); attach(M.bar, barGrip);

const side = el('div', 'mod panel size'), prev = el('div', 'prev'), dot = el('i'), sls = el('div', 'sls'), sideGrip = grip('Move brush size and opacity');
prev.append(dot); side.append(sideGrip, prev, sls); app.append(side); M.size = mod('size', side, { e: 'right', t: .3 }); attach(M.size, sideGrip);
const dp = el('div', 'mod dpuck', '<button class="grip" aria-label="Move puck"></button><button class="dt" aria-label="Brush size and opacity: drag to change, tap for brushes"><i></i></button><button class="db" aria-label="Colour: drag to adjust, tap for colour editor"></button>');
const dpDot = dp.querySelector('.dt i'); app.append(dp); M.dbl = mod('dbl', dp, { e: 'right', t: .8 }); attach(M.dbl, dp.querySelector('.grip'));
function preview() { const s = Math.min(S.size, 40); dpDot.style.cssText = `width:${Math.min(s, 26)}px;height:${Math.min(s, 26)}px;opacity:${S.opacity / 100}`; dot.style.cssText = `width:${s}px;height:${s}px;opacity:${S.opacity / 100}`; }
function slider(label, min, max, key, fmt, parent) {
  const w = el('label', 'vs'), v = el('span'), i = el('input'); i.type = 'range'; i.min = min; i.max = max;
  const set = x => { S[key] = clamp(x, min, max); i.value = S[key]; v.textContent = fmt(S[key]); preview(); };
  i.oninput = () => set(+i.value); set(S[key]); w.append(v, i, el('span', '', label)); parent.append(w); return set;
}
const setSize = slider('Size', 1, 120, 'size', v => Math.round(v) + 'px', sls);
const setOp = slider('Opacity', 1, 100, 'opacity', v => Math.round(v) + '%', sls);

const LS = (k, v) => { try { return v === undefined ? JSON.parse(localStorage.getItem(k)) : localStorage.setItem(k, JSON.stringify(v)); } catch { return null; } };
function drag(node, o) {
  let d = null; node.style.touchAction = 'none';
  node.onpointerdown = e => { node.setPointerCapture(e.pointerId); d = { x: e.clientX, y: e.clientY, lx: e.clientX, ly: e.clientY, m: false }; };
  node.onpointermove = e => { if (!d || (!d.m && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 6)) return; d.m = true; o.move(e.clientX - d.lx, e.clientY - d.ly); d.lx = e.clientX; d.ly = e.clientY; };
  node.onpointerup = () => { if (!d) return; const m = d.m; d = null; if (m) o.end && o.end(); else o.tap && o.tap(); };
  node.onpointercancel = () => { d = null; };
  node.addEventListener('click', e => { if (e.detail === 0 && o.tap) o.tap(); });
}
function ringLayout(p) {
  const r = p.getBoundingClientRect(), e = p.m.at.e, cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  const dx = e === 'left' ? 1 : e === 'right' ? -1 : cx < innerWidth / 2 ? 1 : -1, dy = e === 'top' ? 1 : e === 'bottom' ? -1 : cy > innerHeight / 2 ? -1 : 1;
  p.ring.querySelectorAll('.btn').forEach((b, i) => { const t = i / (p.n - 1) * Math.PI / 2; b.style.setProperty('--x', dx * Math.sin(t) * 96 + 'px'); b.style.setProperty('--y', dy * Math.cos(t) * 96 + 'px'); });
}
function makePuck(items, label, id, def) {
  const p = el('div', 'mod puck'), core = el('button', 'core'), ring = el('div', 'ring'); pucks.push(p);
  core.setAttribute('aria-label', label); core.title = label + ' (tap for tools, drag to move)';
  const open = () => { const o = p.classList.contains('open'); closeAll(); if (!o) { ringLayout(p); p.classList.add('open'); } };
  items.forEach(([n, t, f, k]) => { const b = btn(n, t, f, 'tool', t); b.dataset.t = k || ''; ring.append(b); });
  p.append(ring, core); p.core = core; p.ring = ring; p.n = items.length; app.append(p);
  p.m = M[id] = mod(id, p, def); attach(p.m, core, { tap: open });
  return p;
}
const pA = makePuck([
  ['pen', 'Brushes', () => { S.tool = 'brush'; sync(); brushes(); toggle(bp, M.tools); }, 'brush'],
  ['eraser', 'Eraser', () => { S.tool = 'eraser'; sync(); }, 'eraser'],
  ['fill', 'Fill', () => { S.tool = 'fill'; sync(); }, 'fill'],
  ['color', 'Colour', () => toggle(cp, M.tools)]], 'Tools', 'tools', { e: 'bottom', t: 0 });

function hex2hsv(x) { const n = parseInt(x.slice(1), 16), r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255, m = Math.max(r, g, b), d = m - Math.min(r, g, b); let h = 0; if (d) { h = m === r ? ((g - b) / d) % 6 : m === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; if (h < 0) h += 360; } return [h, m ? d / m : 0, m]; }
function hsv2hex(h, s, v) { const f = n => { const k = (n + h / 60) % 6; return v - v * s * Math.max(0, Math.min(k, 4 - k, 1)); }; return '#' + [f(5), f(3), f(1)].map(t => Math.round(t * 255).toString(16).padStart(2, '0')).join(''); }
function setColor(h) { S.color = h; S.hsv = hex2hsv(h); sync(); }
/* Double puck: top drags size (left/right) and opacity (up/down); bottom drags saturation and brightness */
drag(dp.querySelector('.dt'), { move: (dx, dy) => { setSize(S.size * Math.exp(dx * .012)); setOp(S.opacity - dy * .4); }, tap: () => { S.tool = 'brush'; sync(); brushes(); toggle(bp, M.dbl); } });
drag(dp.querySelector('.db'), { move: (dx, dy) => { S.hsv[1] = clamp(S.hsv[1] + dx * .006, 0, 1); S.hsv[2] = clamp(S.hsv[2] - dy * .006, 0, 1); S.color = hsv2hex(...S.hsv); sync(); }, tap: () => toggle(cp, M.dbl) });
const chip = btn('eye', 'Hide or show interface (H)', null, 'mod chip keep'); app.append(chip); M.chip = mod('chip', chip, { e: 'left', t: .5 }); attach(M.chip, chip, { tap: () => hideUi() });
const vw = el('div', 'mod panel viewm'), vgrip = grip('Move view controls');
vw.append(vgrip, btn('fit', 'Fit to screen and reset rotation (0)', fit), btn('one', 'Zoom to 100% (1)', zoom100), btn('rotl', 'Rotate canvas left (Shift+R)', () => rotateBy(-ROT)), btn('rotr', 'Rotate canvas right (R)', () => rotateBy(ROT)), btn('north', 'Reset rotation', resetRot));
app.append(vw); M.view = mod('view', vw, { e: 'bottom', t: .62 }); attach(M.view, vgrip);
function hideUi() { const h = app.classList.toggle('nui'); chip.innerHTML = icon(h ? 'eyeoff' : 'eye'); }
function sync() {
  pA.core.innerHTML = icon(S.tool === 'brush' ? 'pen' : S.tool);
  pucks.forEach(p => p.style.setProperty('--c', S.color)); prev.style.setProperty('--c', S.color); dp.style.setProperty('--c', S.color);
  pA.ring.querySelectorAll('.btn').forEach(b => b.classList.toggle('sel', b.dataset.t === S.tool)); preview(); cpk.refresh(); now.style.setProperty('--c', S.color); if (bp.classList.contains('on')) brushes();
}
function pick(k) { S.brush = k; S.tool = 'brush'; setSize(BR[k].s); setOp(BR[k].o); sync(); }
function brushes() {
  bp.replaceChildren(); bp.append(el('div', 'ph', '<b>Brushes</b>'));
  Object.entries(BR).forEach(([k, b], i) => {
    if (i >= 4 && !S.more) return;
    const r = el('button', 'brush' + (S.brush === k && S.tool === 'brush' ? ' on' : ''), `<i style="--s:${Math.min(b.s, 26)}px;--o:${b.o / 100};filter:blur(${b.b * 2}px)"></i><span>${b.n}</span><small>${b.s}px</small>`);
    r.onclick = () => pick(k); bp.append(r);
  });
  const m = el('button', 'btn wide', S.more ? 'Show fewer' : 'More brushes'); m.onclick = () => { S.more = !S.more; brushes(); }; bp.append(m);
}

function picker(m) {
  const w = el('div', 'cpick'), sv = el('div', 'svb'), k = el('i'), hue = el('input'), row = el('div', 'rgb'), hx = el('input');
  hue.type = 'range'; hue.min = 0; hue.max = 360; hue.className = 'hue'; hue.setAttribute('aria-label', 'Hue');
  hx.className = 'hx'; hx.maxLength = 7; hx.spellcheck = false; hx.setAttribute('aria-label', 'Hex colour');
  const ch = ['Red', 'Green', 'Blue'].map(l => { const i = el('input', 'hx'); i.type = 'number'; i.min = 0; i.max = 255; i.setAttribute('aria-label', l); return i; });
  sv.tabIndex = 0; sv.setAttribute('role', 'slider'); sv.setAttribute('aria-label', 'Saturation and brightness');
  sv.append(k); row.append(hx, ...ch); w.append(sv, hue, row);
  const draw = () => {
    const [h, s, v] = m.g(), hex = hsv2hex(h, s, v), n = parseInt(hex.slice(1), 16);
    sv.style.background = `linear-gradient(to top,#000,#0000),linear-gradient(to right,#fff,hsl(${h},100%,50%))`;
    k.style.left = s * 100 + '%'; k.style.top = (1 - v) * 100 + '%'; hue.value = h;
    if (document.activeElement !== hx) hx.value = hex;
    [n >> 16, (n >> 8) & 255, n & 255].forEach((c, i) => { if (document.activeElement !== ch[i]) ch[i].value = c; });
  };
  const upd = e => { const r = sv.getBoundingClientRect(); m.s([m.g()[0], clamp((e.clientX - r.left) / r.width, 0, 1), 1 - clamp((e.clientY - r.top) / r.height, 0, 1)]); draw(); };
  sv.onpointerdown = e => { sv.setPointerCapture(e.pointerId); sv.dragging = true; upd(e); };
  sv.onpointermove = e => { if (sv.dragging) upd(e); };
  sv.onpointerup = sv.onpointercancel = () => { sv.dragging = false; };
  sv.onkeydown = e => {
    const st = e.shiftKey ? .1 : .01, [h, s, v] = m.g(), d = { ArrowLeft: [-st, 0], ArrowRight: [st, 0], ArrowUp: [0, st], ArrowDown: [0, -st] }[e.key];
    if (!d) return; e.preventDefault(); m.s([h, clamp(s + d[0], 0, 1), clamp(v + d[1], 0, 1)]); draw();
  };
  hue.oninput = () => { const [, s, v] = m.g(); m.s([+hue.value, s, v]); draw(); };
  hx.oninput = () => {
    let t = hx.value.trim().replace(/^#?/, '#'); if (/^#[0-9a-f]{3}$/i.test(t)) t = '#' + [...t.slice(1)].map(c => c + c).join('');
    if (/^#[0-9a-f]{6}$/i.test(t)) { m.s(hex2hsv(t.toLowerCase())); draw(); }
  };
  ch.forEach(i => { i.oninput = () => { m.s(hex2hsv('#' + ch.map(x => clamp(Math.round(+x.value) || 0, 0, 255).toString(16).padStart(2, '0')).join(''))); draw(); }; });
  w.refresh = draw; draw(); return w;
}
const cpk = picker({ g: () => S.hsv, s: h => { S.hsv = h; S.color = hsv2hex(...h); sync(); } });
const recent = LS('inkwell-recent') || [], saved = LS('inkwell-saved') || [...SW];
const rec = el('div', 'pal'), sav = el('div', 'pal'), now = el('button', 'now'), old = el('button', 'old'), cmp = el('div', 'cmp'), act = el('div', 'act');
let prevCol = S.color; now.dataset.l = 'New'; old.dataset.l = 'Previous'; now.setAttribute('aria-label', 'New colour'); old.setAttribute('aria-label', 'Previous colour: tap to go back to it');
old.onclick = () => setColor(prevCol); cmp.append(now, old);
function swatches(box, list, remove) {
  box.replaceChildren();
  list.forEach(c => { const b = el('button'); b.style.setProperty('--c', c); b.title = c; b.setAttribute('aria-label', c); b.onclick = () => setColor(c); if (remove) b.oncontextmenu = e => { e.preventDefault(); remove(c); }; box.append(b); });
}
function renderPal() { swatches(rec, recent); swatches(sav, saved, c => { saved.splice(saved.indexOf(c), 1); LS('inkwell-saved', saved); renderPal(); flash('Removed ' + c + ' from your palette'); }); }
function addRecent(c) { const i = recent.indexOf(c); if (i === 0) return; if (i > 0) recent.splice(i, 1); recent.unshift(c); recent.length = Math.min(recent.length, 12); LS('inkwell-recent', recent); }
function saveCol() { if (saved.includes(S.color)) return flash('That colour is already in your palette'); saved.push(S.color); LS('inkwell-saved', saved); renderPal(); flash('Added ' + S.color + ' to your palette'); }
function startPick() { closeAll(); S.picking = true; flash('Tap anywhere on the canvas to pick that colour'); }
function pickAt(e) { const [x, y] = pt(e.clientX, e.clientY), c = sample(x, y); S.picking = false; if (c) { setColor(c); flash('Picked ' + c); } else flash('Nothing to pick there. Try a spot with paint'); }
act.append(btn('drop', 'Pick colour from canvas (I)', startPick, '', 'Pick'), btn('plus', 'Save colour to palette', saveCol, '', 'Save'));
cp.append(cpk, cmp, act, el('small', '', 'Recently used'), rec, el('small', '', 'Your palette. Right-click or long-press a swatch to remove it'), sav);

function panel() {
  lp.replaceChildren(); const h = el('div', 'ph', '<b>Layers</b>'); h.append(btn('plus', 'Add layer', () => addLayer('Layer ' + layers.length), 'lab', 'Add')); lp.append(h);
  [...layers].reverse().forEach(L => {
    const i = layers.indexOf(L), r = el('div', 'lyr' + (i === S.active ? ' on' : '') + (L.bg ? ' bg' : '')), a = el('div', 'row'), b = el('div', 'row2');
    if (L.bg) {
      const sw2 = el('button', 'swatch'), ai = el('input'), rd = el('span');
      const show = () => { const m = parseInt(S.bg.hex.slice(1), 16), c = `${m >> 16}, ${(m >> 8) & 255}, ${m & 255}`; rd.textContent = `RGBA ${c}, ${S.bg.a}`; sw2.style.setProperty('--sw', `rgba(${c},${S.bg.a})`); };
      sw2.setAttribute('aria-label', 'Background colour'); const pk = picker({ g: () => S.bg.hsv, s: h => { S.bg.hsv = h; S.bg.hex = hsv2hex(...h); paintBg(); show(); } }); pk.hidden = true; sw2.onclick = () => { pk.hidden = !pk.hidden; };
      ai.type = 'range'; ai.min = 0; ai.max = 100; ai.value = S.bg.a * 100; ai.setAttribute('aria-label', 'Background alpha'); ai.oninput = () => { S.bg.a = +(ai.value / 100).toFixed(2); paintBg(); show(); };
      show(); const nm = el('span', 'nm', 'Background');
      a.append(btn('lock', 'Fixed layer', () => flash('The background is a fixed layer. Change its colour and alpha below')), nm, sw2); b.append(el('span', '', 'Alpha'), ai, rd);
      r.append(a, b, pk); lp.append(r); return;
    }
    const nm = el('span', 'nm'); nm.textContent = L.name; nm.title = 'Tap to select, double-tap to rename';
    nm.onclick = () => { S.active = i; stack(); panel(); };
    nm.ondblclick = () => { const v = prompt('Layer name', L.name); if (v && v.trim()) setProp(L, 'name', v.trim().slice(0, 24)); };
    a.append(btn(L.show ? 'eye' : 'eyeoff', L.show ? 'Hide layer' : 'Show layer', () => setProp(L, 'show', !L.show)), nm,
      btn(L.lock ? 'lock' : 'unlock', L.lock ? 'Unlock layer' : 'Lock layer', () => setProp(L, 'lock', !L.lock)),
      btn('alpha', L.alock ? 'Alpha lock is on: paint only lands where there is already paint' : 'Alpha lock: paint only where there is already paint', () => setProp(L, 'alock', !L.alock), L.alock ? 'on' : ''));
    r.append(a);
    if (i === S.active) {
      const sel = el('select'), o = el('input'), c = el('div', 'row acts'); sel.setAttribute('aria-label', 'Blend mode');
      [['normal', 'Normal'], ['multiply', 'Multiply'], ['screen', 'Screen'], ['overlay', 'Overlay'], ['darken', 'Darken'], ['lighten', 'Lighten'], ['color-dodge', 'Dodge'], ['color-burn', 'Burn'], ['soft-light', 'Soft light'], ['difference', 'Difference']].forEach(([v, t]) => { const op = el('option', '', t); op.value = v; sel.append(op); });
      sel.value = L.mode; sel.onchange = () => setProp(L, 'mode', sel.value);
      let start = L.op; o.type = 'range'; o.min = 0; o.max = 100; o.value = L.op * 100; o.setAttribute('aria-label', 'Layer opacity');
      o.oninput = () => { L.op = o.value / 100; L.c.style.opacity = L.op; };
      o.onchange = () => { const from = start, to = L.op; start = to; if (from !== to) push({ n: 0, u: () => { L.op = from; }, r: () => { L.op = to; } }); };
      b.append(sel, o);
      c.append(btn('copy', 'Duplicate layer', () => dup(L)), btn('up', 'Move layer up', () => shift(i, 1)), btn('down', 'Move layer down', () => shift(i, -1)), btn('merge', 'Merge down into the layer below', () => mergeDown(i)), btn('trash', 'Delete layer', () => remove(i)));
      r.append(b, c);
    }
    lp.append(r);
  });
}
function dup(L) { const n = makeLayer({ name: L.name + ' copy', op: L.op, mode: L.mode, alock: L.alock }); n.ctx.drawImage(L.c, 0, 0); insertOp(n, layers.indexOf(L) + 1); }
function shift(i, d) {
  const j = i + d; if (i < 1 || j < 1 || j >= layers.length) return;
  const a = layers[i], b = layers[j], was = S.active, swap = () => { const x = layers.indexOf(a), y = layers.indexOf(b); layers[x] = b; layers[y] = a; };
  swap(); S.active = was === i ? j : was === j ? i : was; const now = S.active;
  push({ n: 0, u: () => { swap(); S.active = was; }, r: () => { swap(); S.active = now; } }); stack(); panel();
}
function remove(i) {
  if (layers.length < 3) return flash('You need at least one drawing layer');
  const L = layers[i], was = S.active, doit = () => { layers.splice(layers.indexOf(L), 1); S.active = Math.max(1, was >= i ? was - 1 : was); }, undoit = () => { layers.splice(i, 0, L); S.active = was; };
  doit(); push({ n: W * H * 4, u: undoit, r: doit }); stack(); panel();
}
function mergeDown(i) {
  const L = layers[i], low = layers[i - 1]; if (!low || low.bg) return flash('There is no drawing layer below to merge into');
  if (low.lock) return flash('The layer below is locked. Unlock it to merge');
  const snap = mk(), was = S.active; snap.getContext('2d').drawImage(low.c, 0, 0);
  const doit = () => { low.ctx.globalAlpha = L.op; low.ctx.globalCompositeOperation = MODE(L.mode); low.ctx.drawImage(L.c, 0, 0); low.ctx.globalAlpha = 1; low.ctx.globalCompositeOperation = 'source-over'; low.dirty = true; layers.splice(layers.indexOf(L), 1); S.active = layers.indexOf(low); };
  const undoit = () => { low.ctx.clearRect(0, 0, W, H); low.ctx.drawImage(snap, 0, 0); low.dirty = true; layers.splice(layers.indexOf(low) + 1, 0, L); S.active = was; };
  doit(); push({ n: W * H * 4, u: undoit, r: doit }); stack(); panel(); flash('Merged down. Undo splits them again');
}

const sl = el('label'), sv = el('span'), si = el('input'); si.type = 'range'; si.min = 0; si.max = 92; si.value = S.stab;
sl.title = 'Smooths shaky lines. Higher is smoother but follows your hand more slowly'; const lbl = () => { sv.textContent = 'Line smoothing ' + S.stab + '%'; }; lbl(); si.oninput = () => { S.stab = +si.value; lbl(); }; sl.append(sv, si);
const tgl = (label, get, set) => { const b = el('button', 'btn wide'); b.setAttribute('role', 'switch'); const u = () => { b.setAttribute('aria-checked', get()); b.textContent = `${label}: ${get() ? 'On' : 'Off'}`; }; b.onclick = () => { set(!get()); u(); }; u(); b.u = u; return b; };
const setTheme = l => { S.theme = l ? 'light' : 'dark'; document.documentElement.dataset.theme = S.theme; };
const setDbl = on => { S.dbl = on; app.classList.toggle('dbl', on); closeAll(); };
const rst = el('button', 'btn wide', 'Reset interface layout'); rst.onclick = () => { resetAll(); flash('Interface layout reset'); };
const clr = el('button', 'btn wide', 'Clear layer');
clr.onclick = () => { const L = cur(); if (L.lock) return flash('This layer is locked. Unlock it to clear it'); const before = L.ctx.getImageData(0, 0, W, H); L.ctx.clearRect(0, 0, W, H); L.dirty = true; push(patch(L, 0, 0, before, L.ctx.getImageData(0, 0, W, H))); flash('Layer cleared. Undo brings it back'); };
const fingerBtn = tgl('Finger drawing', () => S.touchDraw, v => { S.touchDraw = v; });
sp.append(el('div', 'ph', '<b>Settings</b>'), sl, fingerBtn, tgl('Double puck', () => S.dbl, setDbl), tgl('Light interface', () => S.theme === 'light', setTheme), rst, clr,
  el('p', 'txt', '<b>Touch</b> pinch and twist with two fingers to zoom, pan and rotate the view. Tap with two fingers to undo, three to redo.<br><b>Stylus</b> pressure and hover work. The pen’s eraser end erases where supported.<br><b>Keyboard</b> B brush, E eraser, G fill, M marker, I pick colour, [ ] size, H hide interface, Space pan, 0 fit, 1 actual size, R rotate view, Esc close panels.<br><b>Layout</b> drag a grip (or a puck) and drop it near a screen edge to dock and rotate it. Drop it anywhere else and it returns home.'));

/* files: autosave, project file, import, export (see io.js) */
let autosaveOn = false;
hist.onedit = () => { if (autosaveOn) IO.schedule(); };
IO.io.extra = () => ({ bg: S.bg, active: S.active }); IO.io.busy = () => !!draw;
const fpStat = el('small', 'stat'), fx = el('div', 'fx');
function fileStatus() {
  fpStat.textContent = IO.io.failed ? 'Autosave is unavailable in this browser. Save a project file to keep your work.' : IO.io.last ? 'Autosaved at ' + new Date(IO.io.last).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Autosave is on. Your drawing survives a closed tab or refresh.';
}
IO.io.onstatus = fileStatus; fileStatus();
const fileIn = (accept, cb) => { const i = el('input'); i.type = 'file'; i.accept = accept; i.onchange = () => { if (i.files[0]) cb(i.files[0]); }; i.click(); };
async function applySnap(snap) {
  await IO.load(snap); if (snap.bg && snap.bg.hex) S.bg = snap.bg;
  S.active = clamp(snap.active || 1, 1, layers.length - 1); clearHistory(); stack(); panel();
}
function newDrawing() {
  if (!confirm('Start a new drawing? The current one will be cleared. Save a project first if you want to keep it.')) return;
  layers.length = 0; S.bg = { hex: '#000000', hsv: [0, 0, 0], a: 0 }; S.active = 1; addLayer('Background', true); addLayer('Sketch', false, true); paintBg(); clearHistory(); IO.schedule(300); flash('New drawing');
}
function openProject(f) {
  const go = async f => {
    if (!confirm('Open this project? Your current drawing will be replaced. Save a project first if you want to keep it.')) return;
    try { await applySnap(await IO.readProject(f)); IO.schedule(300); flash('Opened ' + f.name); } catch { flash('That file is not an Inkwell project'); }
  };
  f && f.name ? go(f) : fileIn('.inkwell,application/json', go);
}
async function saveProject() { flash('Saving project…'); IO.download(await IO.projectFile(), 'sketch.inkwell'); flash('Saved sketch.inkwell'); }
async function exportAs(type, ext) { flash('Exporting…'); IO.download(await IO.exportImage(type), 'sketch.' + ext); flash('Exported sketch.' + ext); }
async function importImage(f) {
  let bmp; try { bmp = await createImageBitmap(f); } catch { return flash('Could not read that image'); }
  const k = Math.min(1, W / bmp.width, H / bmp.height), w = bmp.width * k, h = bmp.height * k;
  const L = makeLayer({ name: ((f.name || 'Image').replace(/\.[^.]+$/, '') || 'Image').slice(0, 24) });
  L.ctx.drawImage(bmp, (W - w) / 2, (H - h) / 2, w, h); bmp.close && bmp.close(); insertOp(L, S.active + 1); flash('Imported on a new layer');
}
const fbtn = (t, f) => { const b = el('button', 'btn wide', t); b.onclick = () => { closeAll(); f(); }; return b; };
[['PNG', 'image/png', 'png'], ['JPEG', 'image/jpeg', 'jpg'], ['WebP', 'image/webp', 'webp']].forEach(([n, t, x]) => { const b = el('button', 'btn wide', n); b.onclick = () => { closeAll(); exportAs(t, x); }; fx.append(b); });
fp.append(el('div', 'ph', '<b>File</b>'), fbtn('New drawing', newDrawing), fbtn('Open project…', () => openProject()), fbtn('Save project (Ctrl+S)', saveProject),
  fbtn('Import image… (or paste or drop one)', () => fileIn('image/*', importImage)), el('small', '', 'Export a flat image'), fx, fpStat);
addEventListener('paste', e => { if (/INPUT|TEXTAREA/.test(e.target.tagName)) return; const f = [...(e.clipboardData && e.clipboardData.files || [])].find(f => f.type.startsWith('image/')); if (f) { e.preventDefault(); importImage(f); } });
stage.ondragover = e => e.preventDefault();
stage.ondrop = e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (!f) return; if (/\.inkwell$/i.test(f.name)) openProject(f); else if (f.type.startsWith('image/')) importImage(f); };

addEventListener('keydown', e => {
  const k = e.key.toLowerCase(), m = e.ctrlKey || e.metaKey; if (k === 'escape') { closeAll(); return; }
  if (e.target.tagName === 'INPUT' && e.target.type !== 'range') return;
  if (m && k === 's') { e.preventDefault(); saveProject(); return; }
  if (m && k === 'o') { e.preventDefault(); openProject(); return; }
  if (m && k === 'e') { e.preventDefault(); exportAs('image/png', 'png'); return; }
  if (k === 'h' && !m) { hideUi(); return; }
  if (m && k === 'z') { e.preventDefault(); e.shiftKey ? doRedo() : doUndo(); }
  else if (m && k === 'y') doRedo();
  else if (k === ' ') { space = true; e.preventDefault(); }
  else if (!m) { const t = { b: 'brush', e: 'eraser', g: 'fill' }[k]; if (t) { S.tool = t; sync(); } if (k === 'm') pick('marker'); if (k === '0') fit(); if (k === '1') zoom100(); if (k === 'r') rotateBy(e.shiftKey ? -ROT : ROT); if (k === 'i') startPick(); if (k === '[') setSize(S.size - 2); if (k === ']') setSize(S.size + 2); }
});
addEventListener('keyup', e => { if (e.key === ' ') space = false; });
addEventListener('beforeunload', e => { if (IO.pending() || (IO.io.failed && canUndo())) e.preventDefault(); });
addEventListener('pagehide', () => IO.save());
document.addEventListener('visibilitychange', () => { if (document.hidden) IO.save(); });

addLayer('Background', true); addLayer('Sketch', false, true); paintBg();
setTheme(matchMedia('(prefers-color-scheme: light)').matches); S.hsv = hex2hsv(S.color);
sync(); fit();
IO.recover().then(async s => {
  if (s && !canUndo()) { try { await applySnap(s); flash('Restored your last session', 2600); } catch { } }
  autosaveOn = true; if (s === null) fileStatus();
});
if (!LS('inkwell-seen')) { LS('inkwell-seen', 1); flash('Welcome to Inkwell. Tap the pen button to pick a tool and start drawing', 4000); }
