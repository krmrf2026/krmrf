import fs from 'node:fs';
import path from 'node:path';
const root = process.argv.find(arg => arg.startsWith('--root='))?.slice(7) || process.cwd();
const html = fs.readFileSync(path.join(root, 'map/index.html'), 'utf8');
const loaderFile = path.join(root, 'assets/js/map-loader.js');
const loader = fs.existsSync(loaderFile) ? fs.readFileSync(loaderFile, 'utf8') : '';
const references = [...(html + loader).matchAll(/https:\/\/unpkg\.com\/maplibre-gl@(\d+\.\d+\.\d+)\/dist\/maplibre-gl\.(m?js|css)/g)];
if (references.length !== 2 || new Set(references.map(m => m[2])).size !== 2)
  throw new Error('Expected pinned MapLibre JS and CSS references; update the dependency audit if delivery changes.');
const versions = new Set(references.map(m => m[1]));
if (versions.size !== 1) throw new Error('MapLibre JS and CSS versions differ.');
const version = [...versions][0];
const parts = version.split('.').map(Number);
const floor = [6, 4, 1];
const comparison = parts.map((n,i) => n - floor[i]).find(n => n !== 0) || 0;
if (comparison < 0) throw new Error(`MapLibre ${version} is below the reviewed security floor 6.4.1; GHSA-jrc7-96c5-q579.`);
if (!loader || references.some(m => m[2] === 'js') || !/<script[^>]*type="module"[^>]*src="\/assets\/js\/map-loader\.js/.test(html))
  throw new Error('MapLibre v6 requires the external ESM loader; the old UMD .js path is absent.');
if (!html.includes(`worker-src 'self' blob: https://unpkg.com/maplibre-gl@${version}/dist/`)) throw Error('Pinned module-worker directory missing from CSP');
console.log(`MapLibre dependency floor passed: ${version}. This does not replace a browser compatibility test.`);
