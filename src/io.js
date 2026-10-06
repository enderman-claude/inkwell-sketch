/*
 * Getting the document in and out: autosave and crash recovery (IndexedDB), the native .inkwell project file
 * (keeps every layer with its opacity, blend mode and locks), and flat exports.
 */
import { W, H, mk, layers, makeLayer, flatten } from './doc.js';

export const io = { extra: () => ({}), busy: () => false, onstatus: null, failed: false, last: 0 };

/* --- IndexedDB key/value --- */
const open = () => new Promise((res, rej) => { const r = indexedDB.open('inkwell', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
async function kv(mode, fn) {
  const db = await open();
  return new Promise((res, rej) => { const t = db.transaction('kv', mode), q = fn(t.objectStore('kv')); t.oncomplete = () => { db.close(); res(q && q.result); }; t.onerror = () => { db.close(); rej(t.error); }; });
}
const blob = (c, type = 'image/png', q) => new Promise(r => c.toBlob(r, type, q));

/* Everything needed to rebuild the document. Only layers that changed since the last snapshot are re-encoded. */
export async function snapshot() {
  const out = [];
  for (const L of layers) {
    if (L.dirty || !L.blob) { L.dirty = false; L.blob = await blob(L.c); }
    out.push({ name: L.name, show: L.show, op: L.op, lock: L.lock, alock: L.alock, mode: L.mode, bg: L.bg, blob: L.blob });
  }
  return { app: 'inkwell', v: 1, w: W, h: H, t: Date.now(), ...io.extra(), layers: out };
}

/* Replace the document with a snapshot (from autosave or from a project file) */
export async function load(snap) {
  const made = [];
  for (const d of snap.layers) {
    const L = makeLayer({ name: d.name, show: d.show !== false, op: d.op ?? 1, lock: !!d.lock, alock: !!d.alock, mode: d.mode || 'normal', bg: !!d.bg, dirty: false });
    const bmp = await createImageBitmap(d.blob); L.ctx.drawImage(bmp, 0, 0); bmp.close && bmp.close(); L.blob = d.blob; made.push(L);
  }
  if (made.length < 2 || !made[0].bg) throw new Error('not an Inkwell project');
  layers.length = 0; layers.push(...made);
  return snap;
}

/* --- autosave --- */
let timer = 0, running = false, again = false;
export const pending = () => !!timer || running;
export function schedule(ms = 2500) {
  clearTimeout(timer); timer = setTimeout(save, ms);
}
export async function save() {
  clearTimeout(timer); timer = 0;
  if (io.busy()) return schedule(800);
  if (running) { again = true; return; }
  running = true;
  try { const snap = await snapshot(); await kv('readwrite', s => s.put(snap, 'autosave')); io.failed = false; io.last = Date.now(); } catch { io.failed = true; }
  running = false; io.onstatus && io.onstatus();
  if (again) { again = false; schedule(300); }
}
export async function recover() { try { const s = await kv('readonly', s => s.get('autosave')); return s && s.layers && s.layers.length > 1 ? s : null; } catch { io.failed = true; return null; } }

/* --- project file --- */
const dataUrl = b => new Promise(r => { const f = new FileReader(); f.onload = () => r(f.result); f.readAsDataURL(b); });
export async function projectFile() {
  const snap = await snapshot(), layersOut = [];
  for (const d of snap.layers) { const { blob: b, ...rest } = d; layersOut.push({ ...rest, png: await dataUrl(b) }); }
  return new Blob([JSON.stringify({ ...snap, layers: layersOut })], { type: 'application/json' });
}
export async function readProject(file) {
  const j = JSON.parse(await file.text());
  if (j.app !== 'inkwell' || !Array.isArray(j.layers)) throw new Error('not an Inkwell project');
  for (const d of j.layers) d.blob = await (await fetch(d.png)).blob();
  return j;
}

/* --- exports: the working document is never touched --- */
export async function exportImage(type) {
  let c = flatten();
  if (type === 'image/jpeg') { const o = mk(), x = o.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, W, H); x.drawImage(c, 0, 0); c = o; }
  return blob(c, type, .92);
}
export function download(b, name) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
