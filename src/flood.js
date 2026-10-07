import { W, H } from './doc.js';

/*
 * Flood from (sx, sy) over pixel data d (RGBA, W x H). A pixel joins if its colour is within tol (per channel, on average)
 * of the start pixel. If md (the selection's RGBA data) is given, the flood stays inside the selected area.
 * Returns which pixels were reached and their bounding box [x0, y0, x1, y1].
 */
export function flood(d, sx, sy, tol, md) {
  const i0 = (sy * W + sx) * 4, t0 = d[i0], t1 = d[i0 + 1], t2 = d[i0 + 2], t3 = d[i0 + 3], lim = tol * 4;
  const seen = new Uint8Array(W * H), st = [sy * W + sx]; let x0 = sx, x1 = sx, y0 = sy, y1 = sy;
  while (st.length) {
    const p = st.pop(); if (seen[p]) continue; const i = p * 4;
    if (Math.abs(d[i] - t0) + Math.abs(d[i + 1] - t1) + Math.abs(d[i + 2] - t2) + Math.abs(d[i + 3] - t3) > lim) continue;
    if (md && md[i + 3] < 128) continue;
    seen[p] = 1; const x = p % W, y = (p / W) | 0;
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    if (x > 0) st.push(p - 1); if (x < W - 1) st.push(p + 1); if (y > 0) st.push(p - W); if (y < H - 1) st.push(p + W);
  }
  return { seen, box: [x0, y0, x1, y1] };
}
