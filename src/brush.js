import { mk } from './doc.js';

/* Brush library and engine.
   k: 'line' (swept stroke: smooth edges, optional nib angle and roundness), 'round' | 'square' (stamped dabs),
      'spray' (random dots), 'bristle' (fixed bristle pattern).
   c: collection. e: erases. s / o: default size and opacity.
   p pressure to size, po pressure to flow, b softness (line), sp spacing, fl flow, hd hardness, ro roundness, an angle,
   fd follow stroke direction, sc scatter, jt size jitter, gr grain, gs grain size, ct count, ds dot size. */
const D = { k: 'round', p: 0, po: 0, b: 0, sp: .1, fl: 1, hd: 1, ro: 1, an: 0, fd: 0, sc: 0, jt: 0, gr: 0, gs: 1, ct: 1, ds: .05 };
const ln = (n, s, o, b, p, x) => ({ c: 'basic', k: 'line', n, s, o, b, p, ...x });
const fl = (n, s, o, x) => ({ c: 'flat', n, s, o, ...x });
const tx = (n, s, o, x) => ({ c: 'texture', n, s, o, ...x });
const er = (n, s, o, x) => ({ c: 'erase', e: 1, n, s, o, ...x });

export const COL = [
  ['basic', 'Basic', 'Smooth, solid brushes'],
  ['flat', 'Flat', 'The familiar MS Paint-style brushes'],
  ['texture', 'Texture', 'Grainy, speckled and broken-up strokes'],
  ['erase', 'Erasers', 'Different ways to take paint away']
];
export const BR = {
  pen: ln('Pen', 8, 100, 0, .7), ink: ln('Ink', 6, 100, 0, 1), marker: ln('Marker', 24, 70, .5, .2),
  pencil: ln('Pencil', 4, 75, .25, .5), airbrush: ln('Airbrush', 60, 30, 1.2, .3), highlighter: ln('Highlighter', 34, 35, 0, 0),

  brush: fl('Brush', 10, 100, { k: 'line', b: 0, p: .25 }),
  cal1: fl('Calligraphy 1', 18, 100, { k: 'line', ro: .2, an: 45 }),
  cal2: fl('Calligraphy 2', 18, 100, { k: 'line', ro: .2, an: -45 }),
  spray: fl('Spray', 44, 100, { k: 'spray', ct: 26, ds: .035, sp: .12 }),
  oil: fl('Oil', 24, 95, { k: 'bristle', ct: 16, ds: .24, hd: .5, fl: .85, sp: .1, p: .3 }),
  crayon: fl('Crayon', 14, 100, { hd: .95, gr: .85, gs: 2, fl: .9, sp: .08 }),
  fmarker: fl('Flat marker', 16, 80, { k: 'line', b: 0 }),
  npencil: fl('Natural pencil', 3, 90, { hd: .8, gr: .65, fl: .6, sp: .1, p: .5, po: .4 }),
  wcolour: fl('Watercolour', 36, 80, { hd: .3, fl: .1, sp: .06, gr: .25, gs: 3 }),

  charcoal: tx('Charcoal', 20, 90, { hd: .7, gr: 1, fl: .55, sp: .08, p: .6, po: .5, jt: .1 }),
  chalk: tx('Chalk', 22, 100, { hd: .95, gr: .85, gs: 2, fl: .9, sp: .1, ro: .8, an: 30 }),
  pastel: tx('Pastel', 28, 90, { hd: .8, gr: .7, gs: 2, fl: .6, sp: .08, ro: .55, an: 20, po: .3 }),
  graphite: tx('Graphite', 12, 90, { hd: .5, gr: .8, fl: .3, sp: .06, p: .7, po: .6 }),
  sponge: tx('Sponge', 40, 85, { gr: 1, gs: 3, fl: .5, sp: .35, sc: .35, jt: .3, hd: .9 }),
  stipple: tx('Stipple', 24, 100, { k: 'spray', ct: 6, ds: .09, sp: .5 }),
  spatter: tx('Spatter', 70, 100, { k: 'spray', ct: 12, ds: .06, sp: .7, jt: .4 }),
  mist: tx('Mist', 70, 100, { hd: 0, fl: .07, sp: .07, sc: .12, jt: .2, gr: .3 }),
  dry: tx('Dry brush', 34, 90, { k: 'bristle', ct: 24, ds: .07, hd: .7, fl: .6, sp: .08, jt: .15, p: .4 }),
  hatch: tx('Hatch', 20, 100, { ro: .1, an: 90, fd: 1, sp: 1.3 }),
  dotted: tx('Dotted', 8, 100, { sp: 1.7, p: .5 }),

  eraser: er('Eraser', 24, 100, { k: 'line', b: 0 }),
  softE: er('Soft eraser', 40, 100, { hd: .2, fl: .85, sp: .08 }),
  blockE: er('Block eraser', 26, 100, { k: 'square', sp: .2 }),
  grainE: er('Grain eraser', 30, 100, { hd: .8, gr: .9, fl: .6, sp: .1 }),
  chisel: er('Chisel eraser', 36, 100, { k: 'line', ro: .22, an: -30 })
};

/* per-brush changes the person made in the full menu */
let OV = {};
export const loadOv = o => { OV = o && typeof o === 'object' ? o : {}; };
export const allOv = () => OV;
export const getOv = id => OV[id];
export const hasOv = id => !!OV[id];
export const resetOv = id => { delete OV[id]; };
export const resolve = id => ({ ...D, ...(BR[id] || BR.pen), ...OV[id] });
export function setOv(id, k, v) {
  const dv = BR[id][k] ?? D[k], o = OV[id] || (OV[id] = {});
  if (v === dv) delete o[k]; else o[k] = v;
  if (!Object.keys(o).length) delete OV[id];
}

const pct = v => Math.round(v * 100) + '%';
const ST = ['round', 'square', 'spray', 'bristle'], SH = ['round', 'square'];
/* [key, label, min, max, step, format, brush kinds it applies to (null = all)] */
export const SET = [
  ['p', 'Pressure to size', 0, 1, .05, pct, null],
  ['b', 'Softness', 0, 2, .05, pct, ['line']],
  ['ro', 'Roundness', .05, 1, .01, pct, ['line', ...SH]],
  ['an', 'Angle', -90, 90, 1, v => Math.round(v) + '°', ['line', ...SH]],
  ['fl', 'Flow', .02, 1, .01, pct, ST],
  ['po', 'Pressure to flow', 0, 1, .05, pct, ST],
  ['sp', 'Spacing', .02, 3, .01, pct, ST],
  ['hd', 'Hardness', 0, 1, .01, pct, ['round', 'bristle']],
  ['gr', 'Grain', 0, 1, .01, pct, SH],
  ['gs', 'Grain size', 1, 6, 1, v => v + 'px', SH],
  ['sc', 'Scatter', 0, 1.5, .01, pct, ST],
  ['jt', 'Size jitter', 0, 1, .01, pct, ST],
  ['ct', 'Count', 1, 60, 1, v => String(v), ['spray', 'bristle']],
  ['ds', 'Dot size', .01, .4, .005, pct, ['spray', 'bristle']]
];

/* swept stroke. A nib (roundness below 1, or an angle) is a circle squashed and turned, so the edge stays smooth */
export function line(c, x0, y0, x1, y1, w, mats, b) {
  c.lineWidth = w;
  const ro = b ? b.ro : 1, an = b ? b.an * Math.PI / 180 : 0, nib = ro < 1 || an, ca = Math.cos(an), sa = Math.sin(an);
  for (const m of mats) {
    c.setTransform(...m);
    let a0 = x0, a1 = y0, e0 = x1 + .01, e1 = y1;
    if (nib) {
      c.transform(ca, sa, -sa, ca, 0, 0); c.transform(1, 0, 0, ro, 0, 0);
      a0 = x0 * ca + y0 * sa; a1 = (-x0 * sa + y0 * ca) / ro; e0 = x1 * ca + y1 * sa + .01; e1 = (-x1 * sa + y1 * ca) / ro;
    }
    c.beginPath(); c.moveTo(a0, a1); c.lineTo(e0, e1); c.stroke();
  }
  c.setTransform(1, 0, 0, 1, 0, 0);
}

const R = Math.random, TAU = Math.PI * 2, cache = new Map(), TL = new Map(), gt = mk(192, 192), gc = gt.getContext('2d');
/* one dab as a small image: round (soft or hard edge) or square, squashed by roundness */
function dabImg(b, di, col) {
  const dd = Math.max(1, Math.round(di * 2) / 2), key = b.k + '|' + b.hd + '|' + b.ro + '|' + dd + '|' + col;
  let c = cache.get(key); if (c) return c;
  if (cache.size > 160) cache.clear();
  const w = Math.ceil(dd) + 3, g = (c = mk(w, w)).getContext('2d'), r = dd / 2;
  g.translate(w / 2, w / 2); g.scale(1, b.ro); g.fillStyle = col;
  if (b.k === 'square') g.fillRect(-r, -r, dd, dd);
  else {
    if (b.hd < .99) { const gr = g.createRadialGradient(0, 0, r * b.hd, 0, 0, r); gr.addColorStop(0, col); gr.addColorStop(1, col + '00'); g.fillStyle = gr; }
    g.beginPath(); g.arc(0, 0, r, 0, TAU); g.fill();
  }
  cache.set(key, c); return c;
}
/* paper grain: a noise tile that stays fixed to the canvas, so overlapping dabs keep the same tooth */
function tile(g, s) {
  g = Math.round(g * 10) / 10; const key = g + '|' + s; let p = TL.get(key); if (p) return p;
  const n = 192, m = Math.max(8, Math.ceil(n / s)), a = mk(m, m), im = a.getContext('2d').createImageData(m, m);
  for (let i = 0; i < m * m; i++) { const v = R(), q = v * v * (3 - 2 * v); im.data[i * 4 + 3] = Math.round(255 * (1 - g * (1 - q))); }
  a.getContext('2d').putImageData(im, 0, 0);
  const f = mk(n, n), fx = f.getContext('2d'); fx.imageSmoothingEnabled = s > 1; fx.drawImage(a, 0, 0, n, n);
  p = gc.createPattern(f, 'repeat'); TL.set(key, p); return p;
}
function grained(img, g, s, x, y) {
  const w = img.width, ox = Math.round(x - w / 2), oy = Math.round(y - w / 2);
  gc.globalCompositeOperation = 'copy'; gc.drawImage(img, 0, 0);
  gc.globalCompositeOperation = 'destination-in'; gc.setTransform(1, 0, 0, 1, -ox, -oy); gc.fillStyle = tile(g, s); gc.fillRect(ox, oy, w, w);
  gc.setTransform(1, 0, 0, 1, 0, 0); gc.globalCompositeOperation = 'source-over'; return gt;
}
const bristles = d => d._br || (d._br = Array.from({ length: d.b.ct }, () => { const q = Math.sqrt(R()), t = R() * TAU; return [Math.cos(t) * q, Math.sin(t) * q, .35 + .65 * R()]; }));

/* one stamp. d: { c, b, size, col, er, op, mats, p } */
function put(d, x, y, spe) {
  const { c, b } = d, p = d.p, di = Math.max(1, d.size * (1 - b.p + b.p * p) * (1 - b.jt * R()));
  let a = b.fl * (1 - b.po + b.po * p);
  if (d.er) a = 1 - (1 - a * d.op) ** Math.min(1, spe);      // erasers fold opacity in, spread over the overlapping dabs
  if (b.sc) { const q = b.sc * di * Math.sqrt(R()), t = R() * TAU; x += Math.cos(t) * q; y += Math.sin(t) * q; }
  const r = di / 2, ang = b.an * Math.PI / 180 + (b.fd ? d._dir || 0 : 0);
  let img = null, w = 0;
  if (b.k === 'round' || b.k === 'square') { img = dabImg(b, di, d.col); w = img.width; if (b.gr > 0) img = grained(img, b.gr, b.gs, x, y); }
  for (const m of d.mats()) {
    c.setTransform(m[0], m[1], m[2], m[3], m[4] + m[0] * x + m[2] * y, m[5] + m[1] * x + m[3] * y);
    if (ang) c.rotate(ang);
    c.globalAlpha = a;
    if (img) c.drawImage(img, 0, 0, w, w, -w / 2, -w / 2, w, w);
    else if (b.k === 'spray') {
      c.fillStyle = d.col; const dr = Math.max(.5, di * b.ds / 2);
      for (let i = 0; i < b.ct; i++) { const q = r * Math.sqrt(R()), t = R() * TAU; c.beginPath(); c.arc(Math.cos(t) * q, Math.sin(t) * q, dr * (.5 + R()), 0, TAU); c.fill(); }
    } else {
      const bi = dabImg({ k: 'round', hd: b.hd, ro: 1 }, Math.max(1, di * b.ds), d.col), bw = bi.width;
      for (const [u, v, k] of bristles(d)) { c.globalAlpha = a * k; c.drawImage(bi, u * r - bw / 2, v * r - bw / 2); }
    }
  }
  c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = 1;
}
/* stamp along a segment, carrying the leftover distance into the next one */
export function stamp(d, x0, y0, x1, y1) {
  const b = d.b, L = Math.hypot(x1 - x0, y1 - y0), di = d.size * (1 - b.p + b.p * d.p), step = Math.max(1, b.sp * di);
  if (L > 1.5) d._dir = Math.atan2(y1 - y0, x1 - x0);
  let s = d._need || 0;
  while (s <= L) { const t = L ? s / L : 0; put(d, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, step / Math.max(1, di)); s += step; }
  d._need = s - L;
}

/* a wavy sample stroke drawn with the real engine, for brush lists and the settings preview */
export function preview(cv, id, col, size) {
  const w = cv.width, h = cv.height, c = cv.getContext('2d'), b = resolve(id), pad = Math.min(14, w * .12), N = 36;
  c.clearRect(0, 0, w, h);
  const d = { c, b, size, col, er: false, op: 1, mats: () => [[1, 0, 0, 1, 0, 0]], p: 1 };
  c.lineCap = c.lineJoin = 'round'; c.strokeStyle = col; c.shadowBlur = b.k === 'line' ? size * b.b : 0; c.shadowColor = col;
  let px, py;
  for (let i = 0; i <= N; i++) {
    const t = i / N, x = pad + t * (w - 2 * pad), y = h / 2 + Math.sin(t * TAU) * h * .2;
    d.p = .25 + .75 * Math.sin(t * Math.PI);
    if (i) { if (b.k === 'line') line(c, px, py, x, y, size * (1 - b.p + b.p * d.p), d.mats(), b); else stamp(d, px, py, x, y); }
    px = x; py = y;
  }
  c.shadowBlur = 0; c.globalAlpha = 1;
}
