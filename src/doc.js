/* The document: canvas size, layers and selection. Nothing in here knows about the UI. */
export const W = 2048, H = 1536;
export const mk = (w = W, h = H) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
export const layers = [];                 // bottom to top; layers[0] is the background
export const doc = { sel: null };         // sel: a canvas whose alpha says how selected each pixel is, or null for no selection
export const MODE = m => m === 'normal' ? 'source-over' : m;

export function makeLayer(p = {}) {
  const c = mk();
  return { c, ctx: c.getContext('2d'), name: 'Layer', show: true, op: 1, lock: false, alock: false, mode: 'normal', bg: false, dirty: true, ...p };
}

/* Composite the visible layers (optionally only those passing `only`) into canvas c */
export function flatten(c = mk(), only) {
  const x = c.getContext('2d');
  layers.forEach(L => { if (L.show && (!only || only(L))) { x.globalAlpha = L.op; x.globalCompositeOperation = MODE(L.mode); x.drawImage(L.c, 0, 0); } });
  x.globalAlpha = 1; x.globalCompositeOperation = 'source-over'; return c;
}
