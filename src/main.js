import './style.css';
import { icon } from './icons.js';

const W = 2048, H = 1536;
const SW = ['#1b1b1f', '#ffffff', '#e5484d', '#f76b15', '#ffc53d', '#46a758', '#12a594', '#3e63dd', '#8e4ec6', '#d6409f', '#a18072', '#8b8d98'];
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const el = (t, c, h) => { const e = document.createElement(t); if (c) e.className = c; if (h != null) e.innerHTML = h; return e; };
const mk = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; return c; };
const S = { tool: 'pen', color: '#1b1b1f', size: 8, opacity: 100, stab: 40, active: 0, v: { x: 0, y: 0, k: 1 } };
const layers = [], undo = [], redo = [];
const cur = () => layers[S.active];

const app = document.getElementById('app');
const stage = el('div', 'stage'), board = el('div', 'board');
const stroke = mk(), sctx = stroke.getContext('2d'); stroke.className = 'stroke';
const pre = mk(), pctx = pre.getContext('2d');
board.style.cssText = `width:${W}px;height:${H}px`;
stage.append(board); app.append(stage);

/* layers */
function addLayer(name, paper) {
  const c = mk(), ctx = c.getContext('2d');
  if (paper) { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H); }
  const L = { c, ctx, name, show: true, op: 1 };
  layers.splice(paper ? 0 : S.active + 1, 0, L);
  S.active = layers.indexOf(L); stack(); panel();
}
function stack() {
  board.replaceChildren();
  layers.forEach((L, i) => { L.c.style.opacity = L.op; L.c.style.display = L.show ? '' : 'none'; board.append(L.c); if (i === S.active) board.append(stroke); });
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
const wid = p => S.size * (.3 + .7 * p);
function seg(c, x0, y0, x1, y1, w) { c.lineWidth = w; c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1 + .01, y1); c.stroke(); }
let draw = null;
function begin(e) {
  const L = cur(); if (!L.show) return flash('This layer is hidden');
  const [x, y] = pt(e.clientX, e.clientY);
  if (S.tool === 'fill') return fill(L, x | 0, y | 0);
  const er = S.tool === 'eraser', c = er ? L.ctx : sctx;
  c.lineCap = c.lineJoin = 'round'; c.strokeStyle = S.color;
  if (er) { pctx.clearRect(0, 0, W, H); pctx.drawImage(L.c, 0, 0); c.globalCompositeOperation = 'destination-out'; }
  else { sctx.clearRect(0, 0, W, H); stroke.style.opacity = S.opacity / 100; c.shadowBlur = S.tool === 'marker' ? S.size * .5 : 0; c.shadowColor = S.color; }
  draw = { L, c, x, y, tx: x, ty: y, bb: [x, y, x, y], p: 1 };
  move(e);
}
function move(e) {
  const d = draw, [tx, ty] = pt(e.clientX, e.clientY);
  d.p = e.pointerType === 'pen' ? Math.max(.08, e.pressure) : 1;
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
  draw = null;
  const pad = S.size * 2 + 8, [a, b, c, e] = d.bb, x = clamp(Math.floor(a - pad), 0, W), y = clamp(Math.floor(b - pad), 0, H);
  const w = clamp(Math.ceil(c + pad), 0, W) - x, h = clamp(Math.ceil(e + pad), 0, H) - y, er = S.tool === 'eraser', L = d.L;
  if (w > 0 && h > 0) {
    const before = (er ? pctx : L.ctx).getImageData(x, y, w, h);
    if (!er) { L.ctx.globalAlpha = S.opacity / 100; L.ctx.drawImage(stroke, 0, 0); L.ctx.globalAlpha = 1; }
    push({ L, x, y, before, after: L.ctx.getImageData(x, y, w, h) });
  }
  sctx.clearRect(0, 0, W, H); d.c.globalCompositeOperation = 'source-over'; d.c.shadowBlur = 0;
}
function cancel() {
  if (!draw) return; const d = draw; draw = null; sctx.clearRect(0, 0, W, H);
  if (S.tool === 'eraser') { d.c.globalCompositeOperation = 'source-over'; d.L.ctx.clearRect(0, 0, W, H); d.L.ctx.drawImage(pre, 0, 0); }
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
const pops = [];
const closeAll = () => { pops.forEach(p => p.classList.remove('on')); puck.classList.remove('open'); };
stage.onpointerdown = e => {
  stage.setPointerCapture(e.pointerId); closeAll();
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
  begin(e);
};
stage.onpointermove = e => {
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
  if (draw) for (const c of (e.getCoalescedEvents?.() || [e])) move(c);
};
stage.onpointerup = stage.onpointercancel = e => {
  if (e.pointerType === 'touch') {
    touches.delete(e.pointerId); if (touches.size < 2) g = null;
    if (!touches.size) {
      if (tap && performance.now() - tap.t < 350 && tap.m < 12) { if (tap.n === 2) step(undo, redo); else if (tap.n === 3) step(redo, undo); }
      tap = null; locked = false;
    }
  }
  pan = null; if (draw) end();
};
stage.onwheel = e => { e.preventDefault(); zoomAt(e.clientX, e.clientY, S.v.k * Math.exp(-e.deltaY * (e.ctrlKey ? .01 : .0015))); };

/* ui */
const btn = (n, t, f, c = '') => { const b = el('button', 'btn ' + c, icon(n)); b.title = t; b.setAttribute('aria-label', t); b.onclick = f; return b; };
const toast = el('div', 'toast'); app.append(toast); let tt;
function flash(m) { toast.textContent = m; toast.classList.add('on'); clearTimeout(tt); tt = setTimeout(() => toast.classList.remove('on'), 1600); }
function toggle(p) { const was = p.classList.contains('on'); closeAll(); p.classList.toggle('on', !was); }
function exportPng() {
  const c = mk(), x = c.getContext('2d');
  layers.forEach(L => { if (L.show) { x.globalAlpha = L.op; x.drawImage(L.c, 0, 0); } });
  c.toBlob(b => { const a = el('a'); a.href = URL.createObjectURL(b); a.download = 'sketch.png'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); });
}
const lp = el('div', 'pop'), sp = el('div', 'pop'), cp = el('div', 'pop'); lp.id = 'lp'; sp.id = 'sp'; cp.id = 'cp'; pops.push(lp, sp, cp);

const top = el('header', 'top'), g1 = el('div', 'grp'), g2 = el('div', 'grp');
g1.append(btn('undo', 'Undo (Ctrl+Z)', () => step(undo, redo)), btn('redo', 'Redo (Ctrl+Shift+Z)', () => step(redo, undo)));
g2.append(btn('layers', 'Layers', () => toggle(lp)), btn('tune', 'Settings', () => toggle(sp)), btn('fit', 'Fit to screen', fit), btn('download', 'Save as PNG', exportPng));
top.append(g1, g2); app.append(top, lp, sp, cp);

const side = el('div', 'side'), prev = el('div', 'prev'), dot = el('i'), sls = el('div', 'sls');
prev.append(dot); side.append(prev, sls); app.append(side);
function preview() { const s = Math.min(S.size, 40); dot.style.cssText = `width:${s}px;height:${s}px;opacity:${S.opacity / 100}`; }
function slider(label, min, max, key, fmt, parent) {
  const w = el('label', 'vs'), v = el('span'), i = el('input'); i.type = 'range'; i.min = min; i.max = max;
  const set = x => { S[key] = clamp(x, min, max); i.value = S[key]; v.textContent = fmt(S[key]); preview(); };
  i.oninput = () => set(+i.value); set(S[key]); w.append(v, i, el('span', '', label)); parent.append(w); return set;
}
const setSize = slider('Size', 1, 120, 'size', v => v + 'px', sls);
slider('Opacity', 1, 100, 'opacity', v => v + '%', sls);

const puck = el('div', 'puck'), core = el('button', 'core'), ring = el('div', 'ring');
core.title = 'Tools'; core.onclick = () => { const o = puck.classList.contains('open'); closeAll(); puck.classList.toggle('open', !o); };
const tools = [['pen', 'Pen (B)'], ['marker', 'Marker (M)'], ['eraser', 'Eraser (E)'], ['fill', 'Fill (G)'], ['color', 'Colour']];
tools.forEach(([n, t], i) => {
  const b = btn(n, t, () => { if (n === 'color') { const was = cp.classList.contains('on'); pops.forEach(p => p.classList.remove('on')); cp.classList.toggle('on', !was); } else { S.tool = n; sync(); } });
  const a = (-90 + i * 90 / (tools.length - 1)) * Math.PI / 180;
  b.style.setProperty('--x', Math.cos(a) * 104 + 'px'); b.style.setProperty('--y', Math.sin(a) * 104 + 'px'); b.dataset.t = n; ring.append(b);
});
puck.append(ring, core); app.append(puck);
function sync() {
  core.innerHTML = icon(S.tool); puck.style.setProperty('--c', S.color); prev.style.setProperty('--c', S.color);
  ring.querySelectorAll('.btn').forEach(b => b.classList.toggle('sel', b.dataset.t === S.tool)); preview();
}

const ci = el('input'); ci.type = 'color'; ci.value = S.color; ci.oninput = () => { S.color = ci.value; sync(); };
const sw = el('div', 'sw'); SW.forEach(c => { const b = el('button'); b.style.setProperty('--c', c); b.setAttribute('aria-label', c); b.onclick = () => { ci.value = S.color = c; sync(); }; sw.append(b); });
cp.append(ci, sw);

function panel() {
  lp.replaceChildren(); const h = el('div', 'ph', '<b>Layers</b>'); h.append(btn('plus', 'Add layer', () => addLayer('Layer ' + layers.length))); lp.append(h);
  [...layers].reverse().forEach(L => {
    const i = layers.indexOf(L), r = el('div', 'row' + (i === S.active ? ' on' : '')), nm = el('span', 'nm'), o = el('input');
    nm.textContent = L.name; nm.onclick = () => { S.active = i; stack(); panel(); };
    o.type = 'range'; o.min = 0; o.max = 100; o.value = L.op * 100; o.setAttribute('aria-label', 'Layer opacity'); o.oninput = () => { L.op = o.value / 100; L.c.style.opacity = L.op; };
    r.append(btn(L.show ? 'eye' : 'eyeoff', 'Show or hide', () => { L.show = !L.show; stack(); panel(); }), nm, o,
      btn('up', 'Move up', () => shift(i, 1)), btn('down', 'Move down', () => shift(i, -1)), btn('trash', 'Delete layer', () => remove(i)));
    lp.append(r);
  });
}
function shift(i, d) { const j = i + d; if (j < 0 || j >= layers.length) return; [layers[i], layers[j]] = [layers[j], layers[i]]; if (S.active === i) S.active = j; else if (S.active === j) S.active = i; stack(); panel(); }
function remove(i) { if (layers.length < 2) return flash('Keep at least one layer'); layers.splice(i, 1); S.active = Math.min(S.active, layers.length - 1); stack(); panel(); }

const sl = el('label', '', 'Stabilizer'), si = el('input'); si.type = 'range'; si.min = 0; si.max = 92; si.value = S.stab; si.oninput = () => { S.stab = +si.value; }; sl.append(si);
const clr = el('button', 'btn wide', 'Clear layer');
clr.onclick = () => { const L = cur(), before = L.ctx.getImageData(0, 0, W, H); L.ctx.clearRect(0, 0, W, H); push({ L, x: 0, y: 0, before, after: L.ctx.getImageData(0, 0, W, H) }); };
sp.append(sl, clr, el('p', 'txt', 'Pinch to zoom and pan. Tap with two fingers to undo, three to redo. Space + drag pans on desktop. B, M, E, G switch tools; [ and ] change size.'));

addEventListener('keydown', e => {
  const k = e.key.toLowerCase(), m = e.ctrlKey || e.metaKey; if (e.target.tagName === 'INPUT' && e.target.type !== 'range') return;
  if (m && k === 'z') { e.preventDefault(); e.shiftKey ? step(redo, undo) : step(undo, redo); }
  else if (m && k === 'y') step(redo, undo);
  else if (k === ' ') { space = true; e.preventDefault(); }
  else if (!m) { const t = { b: 'pen', m: 'marker', e: 'eraser', g: 'fill' }[k]; if (t) { S.tool = t; sync(); } if (k === '[') setSize(S.size - 2); if (k === ']') setSize(S.size + 2); }
});
addEventListener('keyup', e => { if (e.key === ' ') space = false; });
addEventListener('beforeunload', e => { if (undo.length) e.preventDefault(); });

addLayer('Paper', true); addLayer('Sketch'); sync(); fit();
