import './modules.css';

/*
 * UI modules. Any piece of interface can become a module with mod(id, node, defaultSpot).
 *   - A module sits on one screen edge: { e: 'top'|'bottom'|'left'|'right', t: 0..1 }, where t is
 *     how far along that edge it sits (0 = start, 1 = end).
 *   - Modules on the left or right edge get the class `v` (vertical), so CSS can lay them out in a column.
 *   - attach(m, handle) lets the user drag the module by `handle`. Drop it within SNAP px of an edge and it
 *     docks there (and rotates); drop it anywhere else and it returns to its default spot.
 *   - Docked positions are saved per module in localStorage.
 *   - hooks.lift(m) runs when a drag starts, hooks.move(m) after a module has been placed.
 */
export const SNAP = 84;      // how close (px) to an edge a drop must be to dock
const MARGIN = 10;           // gap kept between a docked module and the screen edge
const KEY = 'inkwell-ui';

export const hooks = {};
const mods = new Map();
let saved = {};
try { saved = JSON.parse(localStorage.getItem(KEY)) || {}; } catch { }

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const vertical = e => e === 'left' || e === 'right';

const probe = document.createElement('div');
probe.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)';
document.body.append(probe);
export function insets() {
  const s = getComputedStyle(probe);
  return { t: parseFloat(s.paddingTop) || 0, r: parseFloat(s.paddingRight) || 0, b: parseFloat(s.paddingBottom) || 0, l: parseFloat(s.paddingLeft) || 0 };
}
function area() {
  const i = insets();
  return { x0: i.l + MARGIN, y0: i.t + MARGIN, x1: innerWidth - i.r - MARGIN, y1: innerHeight - i.b - MARGIN };
}

const hint = document.createElement('div');
hint.className = 'edgehint';
(document.getElementById('app') || document.body).append(hint);
const showHint = e => { hint.dataset.e = e || ''; hint.classList.toggle('on', !!e); };

function setEdge(m, e) { m.node.dataset.e = e; m.node.classList.toggle('v', vertical(e)); }
function put(m, x, y) { const s = m.node.style; s.left = x + 'px'; s.top = y + 'px'; s.right = s.bottom = 'auto'; }

function layout(m, at = m.at) {
  setEdge(m, at.e);
  const w = m.node.offsetWidth, h = m.node.offsetHeight;
  if (!w && !h) return;                                   // hidden right now; laid out when it appears
  const a = area(), rx = Math.max(0, a.x1 - a.x0 - w), ry = Math.max(0, a.y1 - a.y0 - h);
  if (at.e === 'top') put(m, a.x0 + at.t * rx, a.y0);
  else if (at.e === 'bottom') put(m, a.x0 + at.t * rx, a.y1 - h);
  else if (at.e === 'left') put(m, a.x0, a.y0 + at.t * ry);
  else put(m, a.x1 - w, a.y0 + at.t * ry);
  hooks.move && hooks.move(m);
}

function store() {
  const o = {};
  mods.forEach((m, id) => { if (m.at.e !== m.def.e || m.at.t !== m.def.t) o[id] = m.at; });
  try { localStorage.setItem(KEY, JSON.stringify(o)); } catch { }
}

/** Register a module. `def` is its default spot, e.g. { e: 'top', t: .5 }. */
export function mod(id, node, def) {
  const m = { id, node, def, at: saved[id] && saved[id].e ? { e: saved[id].e, t: clamp(+saved[id].t || 0, 0, 1) } : { ...def } };
  mods.set(id, m);
  new ResizeObserver(() => { if (!node.classList.contains('dragging')) layout(m); }).observe(node);
  layout(m);
  return m;
}

export const relayout = () => mods.forEach(m => layout(m));
export function resetAll() {
  mods.forEach(m => { m.at = { ...m.def }; });
  try { localStorage.removeItem(KEY); } catch { }
  relayout();
}
addEventListener('resize', relayout);

// Which edge is the dragged module close enough to dock to? Uses the module's thickness so flipping
// between horizontal and vertical doesn't make the answer flicker.
function nearest(m, cx, cy) {
  const a = area(), th = Math.min(m.node.offsetWidth, m.node.offsetHeight) / 2;
  const c = [['top', cy - a.y0], ['bottom', a.y1 - cy], ['left', cx - a.x0], ['right', a.x1 - cx]].sort((p, q) => p[1] - q[1])[0];
  return c[1] - th < SNAP ? c[0] : null;
}

function drop(m, e) {
  const n = m.node;
  if (!e) m.at = { ...m.def };
  else {
    const a = area(), w = n.offsetWidth, h = n.offsetHeight, v = vertical(e);
    const range = v ? a.y1 - a.y0 - h : a.x1 - a.x0 - w, pos = v ? parseFloat(n.style.top) - a.y0 : parseFloat(n.style.left) - a.x0;
    m.at = { e, t: range > 0 ? +clamp(pos / range, 0, 1).toFixed(3) : .5 };
  }
  layout(m); store();
}

/** Make `handle` drag module `m`. A press without movement calls opts.tap. */
export function attach(m, handle, opts = {}) {
  let d = null;
  handle.style.touchAction = 'none';
  handle.addEventListener('pointerdown', e => {
    if (e.button > 0) return;
    handle.setPointerCapture(e.pointerId);
    const r = m.node.getBoundingClientRect();
    d = { x: e.clientX, y: e.clientY, cx: r.left + r.width / 2, cy: r.top + r.height / 2, moved: false, near: null };
  });
  handle.addEventListener('pointermove', e => {
    if (!d) return;
    if (!d.moved) {
      if (Math.hypot(e.clientX - d.x, e.clientY - d.y) < 6) return;
      d.moved = true; m.node.classList.add('dragging'); hooks.lift && hooks.lift(m);
    }
    const cx = d.cx + e.clientX - d.x, cy = d.cy + e.clientY - d.y;
    d.near = nearest(m, cx, cy);
    setEdge(m, d.near || m.def.e); showHint(d.near);
    put(m, cx - m.node.offsetWidth / 2, cy - m.node.offsetHeight / 2);
  });
  const end = tap => e => {
    if (!d) return;
    const s = d; d = null; m.node.classList.remove('dragging'); showHint(null);
    if (s.moved) drop(m, s.near); else if (tap && opts.tap) opts.tap();
  };
  handle.addEventListener('pointerup', end(true));
  handle.addEventListener('pointercancel', end(false));
  handle.addEventListener('click', e => { if (e.detail === 0 && opts.tap) opts.tap(); });   // keyboard activation
}
