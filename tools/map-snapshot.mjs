import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import process from 'node:process';

const ROOT = process.cwd();
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');
const write = (file, content) => fs.writeFileSync(path.join(ROOT, file), content, 'utf8');
const sha256 = content => crypto.createHash('sha256').update(content).digest('hex');
const ensureDir = file => fs.mkdirSync(path.dirname(path.join(ROOT, file)), { recursive: true });

const currentFile = 'data/zones.geojson';
const manifestFile = 'data/map/manifest.json';
const raw = read(currentFile);
const data = JSON.parse(raw);
const pages = JSON.parse(read('data/pages.json'));
const updatedRaw = String(data.updated || '').trim();
if (!updatedRaw) throw new Error('data/zones.geojson: отсутствует поле updated');

const normalized = updatedRaw.includes('T') ? updatedRaw : updatedRaw.replace(' ', 'T');
const withZone = /(?:Z|[+-]\d{2}:?\d{2})$/.test(normalized) ? normalized : `${normalized}:00+03:00`;
const date = new Date(withZone);
if (Number.isNaN(date.getTime())) throw new Error(`data/zones.geojson: невозможно разобрать updated=${updatedRaw}`);
const id = withZone.replace(/:00(?=[+-]\d{2}:?\d{2}$)/, ':00');
const safe = id.replace(/:/g, '-').replace('+', '+');
const snapshotFile = `/data/map/snapshots/${safe}.geojson`;
const relativeSnapshot = snapshotFile.replace(/^\//, '');
const hash = sha256(raw);

const manifest = fs.existsSync(path.join(ROOT, manifestFile))
  ? JSON.parse(read(manifestFile))
  : { version: 1, current: '/data/zones.geojson', currentHash: '', snapshots: [] };

const snapshots = Array.isArray(manifest.snapshots) ? manifest.snapshots : [];
const same = snapshots.find(item => item.sha256 === hash);
const sameId = snapshots.find(item => item.id === id);
if (sameId && sameId.sha256 !== hash) {
  throw new Error(`Снимок ${id} уже существует с другой контрольной суммой. Измените поле updated в data/zones.geojson; архивные снимки нельзя перезаписывать.`);
}
if (!same) {
  ensureDir(relativeSnapshot);
  write(relativeSnapshot, raw.endsWith('\n') ? raw : `${raw}\n`);
  const latestAssessment = pages
    .filter(item => item.type === 'assessment' && item.datePublished <= id.slice(0, 10))
    .sort((a, b) => b.datePublished.localeCompare(a.datePublished))[0];
  const previous = snapshots.sort((a, b) => String(a.validFrom).localeCompare(String(b.validFrom))).at(-1);
  if (previous && !previous.validTo) previous.validTo = id;
  snapshots.push({
    id,
    file: snapshotFile,
    validFrom: id,
    validTo: null,
    sha256: hash,
    assessmentUrl: latestAssessment?.url || null,
    methodologyUrl: '/methodology/',
    confidence: data.provenance?.confidence || 'orientировочная аналитическая оценка',
    sourceIds: Array.isArray(data.provenance?.sourceIds) ? data.provenance.sourceIds : [],
    summary: data.provenance?.summary || 'Снимок опубликованной оценочной зоны территориального контроля KRM РФ.'
  });
  manifest.snapshots = snapshots.sort((a, b) => String(a.validFrom).localeCompare(String(b.validFrom)));
  console.log(`Создан снимок карты: ${snapshotFile}`);
} else {
  console.log(`Снимок карты уже существует: ${same.file}`);
}
manifest.version = 1;
manifest.current = '/data/zones.geojson';
manifest.currentHash = hash;
manifest.updated = id;
ensureDir(manifestFile);
write(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);
