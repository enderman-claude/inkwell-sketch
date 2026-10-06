import { build } from 'esbuild';
import { mkdirSync, writeFileSync } from 'node:fs';
const r = await build({ entryPoints: ['src/main.js'], bundle: true, minify: true, write: false, outdir: 'out', target: 'es2020' });
const get = ext => r.outputFiles.find(f => f.path.endsWith(ext)).text;
const js = get('.js').replace(/<\/script/gi, '<\\/script');
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover"><meta name="theme-color" content="#25272b"><meta name="apple-mobile-web-app-capable" content="yes"><title>Inkwell</title><style>${get('.css')}</style></head><body><div id="app"></div><script>${js}</script></body></html>`;
mkdirSync('dist', { recursive: true });
writeFileSync('dist/index.html', html);
console.log('dist/index.html', (html.length / 1024).toFixed(1) + ' KB');
