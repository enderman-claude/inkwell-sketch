import './style.css';
import { icon } from './icons.js';

const W = 2048, H = 1536;
const SW = ['#1b1b1f', '#ffffff', '#e5484d', '#f76b15', '#ffc53d', '#46a758', '#12a594', '#3e63dd', '#8e4ec6', '#d6409f', '#a18072', '#8b8d98'];
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const el = (t, c, h) => { const e = document.createElement(t); if (c) e.className = c; if (h != null) e.innerHTML = h; return e; };
const mk = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; return c; };
const BR = {
  pen: { n: 'Pen', s: 8, o: 100, b: 0, p: .7 },
  ink: { n: 'Ink', s: 6, o: 100, b: 0, p: 1 },
  marker: { n: 'Marker', s: 24, o: 70, b: .5, p: .2 },
  pencil: { n: 'Pencil', s: 4, o: 75, b: .25, p: .5 },
  airbrush: { n: 'Airbrush', s: 60, o: 30, b: 1.2, p: .3 },
  highlighter: { n: 'Highlighter', s: 34, o: 35, b: 0, p: 0 }
};
const S = { tool: 'brush', brush: 'pen', more: false, dbl: false, touchDraw: true, penSeen: false, hsv: [0, 0, .11], theme: 'dark', bg: { hex: '#000000', a: 0 }, color: '#1b1b1f', size: 8, opacity: 100, stab: 40, active: 1, v: { x: 0, y: 0, k: 1 } };
const B = () => BR[S.brush];
const layers = [], undo = [], redo = [];
const cur = () => layers[S.active];

const app = document.getElementById('app');
const stage = el('div', 'stage'), board = el('div', 'board');
const stroke = mk(), sctx = stroke.getContext('2d', { desynchronized: true }); stroke.className = 'stroke';
const pre = mk(), pctx = pre.getContext('2d');
board.style.cssText = `width:${W}px;height:${H}px`;
stage.append(board); app.append(stage);

/* layers */
function addLayer(name, bg) {
  const c = mk(), ctx = c.getContext('2d');
  const L = { c, ctx, name, show: true, op: 1, lock: false, mode: 'normal', bg };
  layers.splice(bg ? 0 : S.active + 1, 0, L);
  S.active = bg ? 1 : layers.indexOf(L); stack(); panel(); return L;
}
function paintBg() {
  const L = layers[0], n = parseInt(S.bg.hex.slice(1), 16);
  L.ctx.clearRect(0, 0, W, H); L.ctx.fillStyle = `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${S.bg.a})`; L.ctx.fillRect(0, 0, W, H);
}
function stack() {
  board.replaceChildren();
  layers.forEach((L, i) => { const s = L.c.style; s.opacity = L.op; s.display = L.show ? '' : 'none'; s.mixBlendMode = L.mode; board.append(L.c); if (i === S.active) board.append(stroke); });
}

/* view */
const apply = () => { board.style.transform = `translate(${S.v.x}px,${S.v.y}px) scale(${S.v.k})`; };
function fit() { const r = stage.getBoundingClientRect(), k = Math.min(r.width / W, r.height / H) * .94; S.v = { k, x: (r.width - W * k) / 2, y: (r.height - H * k) / 2 }; apply(); }
function pt(cx, cy) { const r = stage.getBoundingClientRect(); return [(cx - r.left - S.v.x) / S.v.k, (cy - r.top - S.v.y) / S.v.k]; }
function zoomAt(cx, cy, k) { const [x, y] = pt(cx, cy), r = stage.getBoundingClientRect(); k = clamp(k, .1, 16); S.v = { k, x: cx - r.left - x * k, y: cy - r.top - y * k }; apply(); }

/* history */
function push(s) { undo.push(s); if (undo.length > 40) undo.shift(); redo.length = 0; }
function step(a, b) { const s = a.pop(); if (!s) return; s.L.ctx.putImageData(a === undo ? s.before : s.after, s.x, s.y); b.push(s); }

/* drawing */
const wid = p => { const k = B().p; return S.size * (1 - k + k * p); };
function seg(c, x0, y0, x1, y1, w) { c.lineWidth = w; c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1 + .01, y1); c.stroke(); }
let draw = null, curTool = 'brush';
function begin(e) {
  const L = cur(); if (!L.show) return flash('This layer is hidden'); if (L.lock) return flash('This layer is locked');
  const [x, y] = pt(e.clientX, e.clientY);
  curTool = e.pointerType === 'pen' && (e.buttons & 32) ? 'eraser' : S.tool;
  if (curTool === 'fill') return fill(L, x | 0, y | 0);
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
    if (!er) { L.ctx.globalAlpha = S.opacity / 100; L.ctx.drawImage(stroke, 0, 0); L.ctx.globalAlpha = 1; }
    push({ L, x, y, before, after: L.ctx.getImageData(x, y, w, h) });
  }
  sctx.clearRect(0, 0, W, H); d.c.globalCompositeOperation = 'source-over'; d.c.shadowBlur = 0;
}
function cancel() {
  if (!draw) return; const d = draw; draw = null; app.classList.remove('drawing'); sctx.clearRect(0, 0, W, H);
  if (curTool === 'eraser') { d.c.globalCompositeOperation = 'source-over'; d.L.ctx.clearRect(0, 0, W, H); d.L.ctx.drawImage(pre, 0, 0); }
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
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (seen[y * W + x]) d.set(col, (y * W + x) * 4);
  L.ctx.putImageData(img, 0, 0); push({ L, x: x0, y: y0, before, after: L.ctx.getImageData(x0, y0, w, h) });
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
      g = { d: Math.hypot(a[0] - b[0], a[1] - b[1]) || 1, mx: (a[0] + b[0]) / 2, my: (a[1] + b[1]) / 2, v: { ...S.v } }; return;
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
      if (tap) tap.m = Math.abs(d - g.d) + Math.hypot(mx - g.mx, my - g.my);
      const k = clamp(g.v.k * d / g.d, .1, 16), r = stage.getBoundingClientRect();
      const x = (g.mx - r.left - g.v.x) / g.v.k, y = (g.my - r.top - g.v.y) / g.v.k;
      S.v = { k, x: mx - r.left - x * k, y: my - r.top - y * k }; apply(); return;
    }
  }
  if (pan) { S.v = { ...pan.v, x: pan.v.x + e.clientX - pan.x, y: pan.v.y + e.clientY - pan.y }; apply(); return; }
  if (draw && e.pointerId === draw.id) for (const c of (e.getCoalescedEvents?.() || [e])) move(c);
};
stage.onpointerup = stage.onpointercancel = e => {
  if (e.pointerType === 'touch') {
    touches.delete(e.pointerId); if (touches.size < 2) g = null;
    if (!touches.size) {
      if (tap && performance.now() - tap.t < 350 && tap.m < 12) { if (tap.n === 2) step(undo, redo); else if (tap.n === 3) step(redo, undo); }
      tap = null; locked = false;
    }
  }
  pan = null; if (draw && draw.id === e.pointerId) end();
};
const ghost = el('div', 'ghost'); stage.append(ghost);
function sawPen(e) { if (e.pointerType === 'pen' && !S.penSeen) { S.penSeen = true; if (S.touchDraw) { S.touchDraw = false; flash('Stylus found: fingers now pan and zoom'); fingerBtn.u(); } } }
function hover(e) {
  if (e.pointerType === 'touch') return; sawPen(e);
  const r = stage.getBoundingClientRect(), z = Math.max(5, S.size * S.v.k);
  ghost.style.cssText = `display:block;width:${z}px;height:${z}px;transform:translate(${e.clientX - r.left - z / 2}px,${e.clientY - r.top - z / 2}px)`;
}
stage.onpointerleave = () => { ghost.style.display = 'none'; };
stage.oncontextmenu = e => e.preventDefault();
stage.onwheel = e => { e.preventDefault(); zoomAt(e.clientX, e.clientY, S.v.k * Math.exp(-e.deltaY * (e.ctrlKey ? .01 : .0015))); };

/* ui */
const btn = (n, t, f, c = '', lb = '') => { const b = el('button', 'btn ' + c, icon(n) + (lb ? `<span class="lb">${lb}</span>` : '')); b.title = t; b.setAttribute('aria-label', t); b.onclick = f; return b; };
const toast = el('div', 'toast'); app.append(toast); let tt;
function flash(m) { toast.textContent = m; toast.classList.add('on'); clearTimeout(tt); tt = setTimeout(() => toast.classList.remove('on'), 1800); }
function toggle(p) { const was = p.classList.contains('on'); pops.forEach(q => q.classList.remove('on')); p.classList.toggle('on', !was); }
const MODE = m => m === 'normal' ? 'source-over' : m;
function exportPng() {
  const c = mk(), x = c.getContext('2d');
  layers.forEach(L => { if (L.show) { x.globalAlpha = L.op; x.globalCompositeOperation = MODE(L.mode); x.drawImage(L.c, 0, 0); } });
  c.toBlob(b => { const a = el('a'); a.href = URL.createObjectURL(b); a.download = 'sketch.png'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); });
}
const mkPop = id => { const p = el('div', 'pop'); p.id = id; pops.push(p); return p; };
const lp = mkPop('lp'), sp = mkPop('sp'), cp = mkPop('cp'), bp = mkPop('bp');

const top = el('header', 'top'), g1 = el('div', 'grp g1'), g2 = el('div', 'grp');
g1.append(btn('undo', 'Undo (Ctrl+Z)', () => step(undo, redo), 'lab hd', 'Undo'), btn('redo', 'Redo (Ctrl+Shift+Z)', () => step(redo, undo), 'lab hd', 'Redo'));
g2.append(btn('layers', 'Layers', () => toggle(lp), 'lab hd', 'Layers'), btn('tune', 'Settings', () => toggle(sp), 'lab hd', 'Settings'), btn('fit', 'Fit to screen', fit, 'lab', 'Fit'), btn('download', 'Save as PNG', exportPng, 'lab', 'Save'));
top.append(g1, g2); app.append(top, lp, sp, cp, bp);

const side = el('div', 'side'), prev = el('div', 'prev'), dot = el('i'), sls = el('div', 'sls');
prev.append(dot); side.append(prev, sls); app.append(side);
const dp = el('div', 'dpuck', '<button class="grip" aria-label="Move puck"></button><button class="dt" aria-label="Brush size and opacity: drag to change, tap for brushes"><i></i></button><button class="db" aria-label="Colour: drag to adjust, tap for colour editor"></button>');
const dpDot = dp.querySelector('.dt i'); app.append(dp);
function preview() { const s = Math.min(S.size, 40); dpDot.style.cssText = `width:${Math.min(s, 26)}px;height:${Math.min(s, 26)}px;opacity:${S.opacity / 100}`; dot.style.cssText = `width:${s}px;height:${s}px;opacity:${S.opacity / 100}`; }
function slider(label, min, max, key, fmt, parent) {
  const w = el('label', 'vs'), v = el('span'), i = el('input'); i.type = 'range'; i.min = min; i.max = max;
  const set = x => { S[key] = clamp(x, min, max); i.value = S[key]; v.textContent = fmt(S[key]); preview(); };
  i.oninput = () => set(+i.value); set(S[key]); w.append(v, i, el('span', '', label)); parent.append(w); return set;
}
const setSize = slider('Size', 1, 120, 'size', v => Math.round(v) + 'px', sls);
const setOp = slider('Opacity', 1, 100, 'opacity', v => Math.round(v) + '%', sls);

const LS = (k, v) => { try { return v === undefined ? JSON.parse(localStorage.getItem(k)) : localStorage.setItem(k, JSON.stringify(v)); } catch { return null; } };
function place(p, x, y) {
  x = clamp(x, 6, innerWidth - (p.offsetWidth || 64) - 6); y = clamp(y, 56, innerHeight - (p.offsetHeight || 64) - 6);
  p.style.left = x + 'px'; p.style.top = y + 'px'; p.style.right = p.style.bottom = 'auto'; p.pos = [x, y];
}
function drag(node, o) {
  let d = null; node.style.touchAction = 'none';
  node.onpointerdown = e => { node.setPointerCapture(e.pointerId); d = { x: e.clientX, y: e.clientY, lx: e.clientX, ly: e.clientY, m: false }; };
  node.onpointermove = e => { if (!d || (!d.m && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 6)) return; d.m = true; o.move(e.clientX - d.lx, e.clientY - d.ly); d.lx = e.clientX; d.ly = e.clientY; };
  node.onpointerup = () => { if (!d) return; const m = d.m; d = null; if (m) o.end && o.end(); else o.tap && o.tap(); };
  node.onpointercancel = () => { d = null; };
  node.addEventListener('click', e => { if (e.detail === 0 && o.tap) o.tap(); });
}
const savePos = () => LS('inkwell-pos', { a: pA.pos, d: dp.pos });
function ringLayout(p) {
  const dx = p.pos[0] + 32 < innerWidth / 2 ? 1 : -1, dy = p.pos[1] + 32 > innerHeight / 2 ? -1 : 1;
  p.ring.querySelectorAll('.btn').forEach((b, i) => { const t = i / (p.n - 1) * Math.PI / 2; b.style.setProperty('--x', dx * Math.sin(t) * 120 + 'px'); b.style.setProperty('--y', dy * Math.cos(t) * 120 + 'px'); });
}
function makePuck(items, label) {
  const p = el('div', 'puck'), core = el('button', 'core'), ring = el('div', 'ring'); pucks.push(p);
  core.setAttribute('aria-label', label); core.title = label + ' (drag to move)';
  const open = () => { const o = p.classList.contains('open'); closeAll(); if (!o) { ringLayout(p); p.classList.add('open'); } };
  drag(core, { move: (dx, dy) => { pops.forEach(q => q.classList.remove('on')); p.classList.remove('open'); place(p, p.pos[0] + dx, p.pos[1] + dy); }, end: savePos, tap: open });
  items.forEach(([n, t, f, k]) => { const b = btn(n, t, f, 'tool', t); b.dataset.t = k || ''; ring.append(b); });
  p.append(ring, core); p.core = core; p.ring = ring; p.n = items.length; app.append(p); return p;
}
const pA = makePuck([
  ['pen', 'Brushes', () => { S.tool = 'brush'; sync(); brushes(); toggle(bp); }, 'brush'],
  ['eraser', 'Eraser', () => { S.tool = 'eraser'; sync(); }, 'eraser'],
  ['fill', 'Fill', () => { S.tool = 'fill'; sync(); }, 'fill'],
  ['color', 'Colour', () => toggle(cp)]], 'Tools');

function hex2hsv(x) { const n = parseInt(x.slice(1), 16), r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255, m = Math.max(r, g, b), d = m - Math.min(r, g, b); let h = 0; if (d) { h = m === r ? ((g - b) / d) % 6 : m === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; if (h < 0) h += 360; } return [h, m ? d / m : 0, m]; }
function hsv2hex(h, s, v) { const f = n => { const k = (n + h / 60) % 6; return v - v * s * Math.max(0, Math.min(k, 4 - k, 1)); }; return '#' + [f(5), f(3), f(1)].map(t => Math.round(t * 255).toString(16).padStart(2, '0')).join(''); }
function setColor(h) { S.color = h; S.hsv = hex2hsv(h); ci.value = h; sync(); }
/* Double puck: top drags size (left/right) and opacity (up/down); bottom drags saturation and brightness */
drag(dp.querySelector('.grip'), { move: (dx, dy) => place(dp, dp.pos[0] + dx, dp.pos[1] + dy), end: savePos });
drag(dp.querySelector('.dt'), { move: (dx, dy) => { setSize(S.size * Math.exp(dx * .012)); setOp(S.opacity - dy * .4); }, tap: () => { S.tool = 'brush'; sync(); brushes(); toggle(bp); } });
drag(dp.querySelector('.db'), { move: (dx, dy) => { S.hsv[1] = clamp(S.hsv[1] + dx * .006, 0, 1); S.hsv[2] = clamp(S.hsv[2] - dy * .006, 0, 1); S.color = hsv2hex(...S.hsv); ci.value = S.color; sync(); }, tap: () => toggle(cp) });
const chip = btn('eye', 'Hide or show interface (H)', () => hideUi(), 'chip'); app.append(chip);
function hideUi() { const h = app.classList.toggle('nui'); chip.innerHTML = icon(h ? 'eyeoff' : 'eye'); }
function sync() {
  pA.core.innerHTML = icon(S.tool === 'brush' ? 'pen' : S.tool);
  pucks.forEach(p => p.style.setProperty('--c', S.color)); prev.style.setProperty('--c', S.color); dp.style.setProperty('--c', S.color);
  pA.ring.querySelectorAll('.btn').forEach(b => b.classList.toggle('sel', b.dataset.t === S.tool)); preview(); if (bp.classList.contains('on')) brushes();
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

const ci = el('input'); ci.type = 'color'; ci.value = S.color; ci.setAttribute('aria-label', 'Colour'); ci.oninput = () => setColor(ci.value);
const sw = el('div', 'sw'); SW.forEach(c => { const b = el('button'); b.style.setProperty('--c', c); b.setAttribute('aria-label', c); b.onclick = () => setColor(c); sw.append(b); });
cp.append(ci, sw);

function panel() {
  lp.replaceChildren(); const h = el('div', 'ph', '<b>Layers</b>'); h.append(btn('plus', 'Add layer', () => addLayer('Layer ' + layers.length), 'lab', 'Add')); lp.append(h);
  [...layers].reverse().forEach(L => {
    const i = layers.indexOf(L), r = el('div', 'lyr' + (i === S.active ? ' on' : '') + (L.bg ? ' bg' : '')), a = el('div', 'row'), b = el('div', 'row2');
    if (L.bg) {
      const ci2 = el('input'), ai = el('input'), rd = el('span'), n = parseInt(S.bg.hex.slice(1), 16);
      const show = () => { const m = parseInt(S.bg.hex.slice(1), 16); rd.textContent = `RGBA ${m >> 16}, ${(m >> 8) & 255}, ${m & 255}, ${S.bg.a}`; }; void n;
      ci2.type = 'color'; ci2.value = S.bg.hex; ci2.setAttribute('aria-label', 'Background colour'); ci2.oninput = () => { S.bg.hex = ci2.value; paintBg(); show(); };
      ai.type = 'range'; ai.min = 0; ai.max = 100; ai.value = S.bg.a * 100; ai.setAttribute('aria-label', 'Background alpha'); ai.oninput = () => { S.bg.a = +(ai.value / 100).toFixed(2); paintBg(); show(); };
      show(); const nm = el('span', 'nm', 'Background');
      a.append(btn('lock', 'Fixed layer', () => flash('The background can’t be drawn on, moved or deleted')), nm, ci2); b.append(el('span', '', 'Alpha'), ai, rd);
      r.append(a, b); lp.append(r); return;
    }
    const nm = el('span', 'nm'); nm.textContent = L.name; nm.title = 'Tap to select, double-tap to rename';
    nm.onclick = () => { S.active = i; stack(); panel(); };
    nm.ondblclick = () => { const v = prompt('Layer name', L.name); if (v) { L.name = v.slice(0, 24); panel(); } };
    a.append(btn(L.show ? 'eye' : 'eyeoff', 'Show or hide', () => { L.show = !L.show; stack(); panel(); }), nm,
      btn(L.lock ? 'lock' : 'unlock', L.lock ? 'Unlock layer' : 'Lock layer', () => { L.lock = !L.lock; panel(); }),
      btn('copy', 'Duplicate layer', () => dup(L)), btn('up', 'Move up', () => shift(i, 1)), btn('down', 'Move down', () => shift(i, -1)), btn('trash', 'Delete layer', () => remove(i)));
    const sel = el('select'), o = el('input'); sel.setAttribute('aria-label', 'Blend mode');
    [['normal', 'Normal'], ['multiply', 'Multiply'], ['screen', 'Screen'], ['overlay', 'Overlay']].forEach(([v, t]) => { const op = el('option', '', t); op.value = v; sel.append(op); });
    sel.value = L.mode; sel.onchange = () => { L.mode = sel.value; stack(); };
    o.type = 'range'; o.min = 0; o.max = 100; o.value = L.op * 100; o.setAttribute('aria-label', 'Layer opacity'); o.oninput = () => { L.op = o.value / 100; L.c.style.opacity = L.op; };
    b.append(sel, o); r.append(a, b); lp.append(r);
  });
}
function dup(L) { const n = addLayer(L.name + ' copy'); n.ctx.drawImage(L.c, 0, 0); n.op = L.op; n.mode = L.mode; stack(); panel(); }
function shift(i, d) { const j = i + d; if (i < 1 || j < 1 || j >= layers.length) return; [layers[i], layers[j]] = [layers[j], layers[i]]; if (S.active === i) S.active = j; else if (S.active === j) S.active = i; stack(); panel(); }
function remove(i) { if (layers.length < 3) return flash('Keep at least one drawing layer'); layers.splice(i, 1); if (i <= S.active) S.active--; S.active = Math.max(1, S.active); stack(); panel(); }

const sl = el('label'), sv = el('span'), si = el('input'); si.type = 'range'; si.min = 0; si.max = 92; si.value = S.stab;
const lbl = () => { sv.textContent = 'Stabilizer ' + S.stab + '%'; }; lbl(); si.oninput = () => { S.stab = +si.value; lbl(); }; sl.append(sv, si);
const tgl = (label, get, set) => { const b = el('button', 'btn wide'); b.setAttribute('role', 'switch'); const u = () => { b.setAttribute('aria-checked', get()); b.textContent = `${label}: ${get() ? 'On' : 'Off'}`; }; b.onclick = () => { set(!get()); u(); }; u(); b.u = u; return b; };
const setTheme = l => { S.theme = l ? 'light' : 'dark'; document.documentElement.dataset.theme = S.theme; };
const setDbl = on => { S.dbl = on; app.classList.toggle('dbl', on); closeAll(); if (on) requestAnimationFrame(() => place(dp, ...dp.pos)); };
const clr = el('button', 'btn wide', 'Clear layer');
clr.onclick = () => { const L = cur(); if (L.lock) return flash('This layer is locked'); const before = L.ctx.getImageData(0, 0, W, H); L.ctx.clearRect(0, 0, W, H); push({ L, x: 0, y: 0, before, after: L.ctx.getImageData(0, 0, W, H) }); };
const fingerBtn = tgl('Finger drawing', () => S.touchDraw, v => { S.touchDraw = v; });
sp.append(sl, fingerBtn, tgl('Double puck', () => S.dbl, setDbl), tgl('Light interface', () => S.theme === 'light', setTheme), clr,
  el('p', 'txt', '<b>Two fingers</b> pinch, pan, tap to undo<br><b>Three fingers</b> tap to redo<br><b>Stylus</b> pressure and hover; pen eraser end erases where supported<br><b>Keys</b> B E G M tools, [ ] size, H hides UI, Space pans'));

addEventListener('keydown', e => {
  const k = e.key.toLowerCase(), m = e.ctrlKey || e.metaKey; if (e.target.tagName === 'INPUT' && e.target.type !== 'range') return;
  if (k === 'h' && !m) { hideUi(); return; }
  if (m && k === 'z') { e.preventDefault(); e.shiftKey ? step(redo, undo) : step(undo, redo); }
  else if (m && k === 'y') step(redo, undo);
  else if (k === ' ') { space = true; e.preventDefault(); }
  else if (!m) { const t = { b: 'brush', e: 'eraser', g: 'fill' }[k]; if (t) { S.tool = t; sync(); } if (k === 'm') pick('marker'); if (k === '[') setSize(S.size - 2); if (k === ']') setSize(S.size + 2); }
});
addEventListener('keyup', e => { if (e.key === ' ') space = false; });
addEventListener('beforeunload', e => { if (undo.length) e.preventDefault(); });

addLayer('Background', true); addLayer('Sketch'); paintBg();
setTheme(matchMedia('(prefers-color-scheme: light)').matches); S.hsv = hex2hsv(S.color);
{ const v = LS('inkwell-pos'); place(pA, ...(v && v.a || [22, innerHeight - 92])); place(dp, ...(v && v.d || [innerWidth - 100, innerHeight - 130])); }
addEventListener('resize', () => [pA, dp].forEach(q => place(q, ...q.pos)));
sync(); fit();
