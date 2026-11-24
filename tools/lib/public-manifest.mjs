import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

// This is the existing display window. Both the generator and the release
// validator use it, so a shortened copy cannot attest to its own completeness.
export const publicHistoryWindow = (records, limit) => records
  .filter((record, i) => !i || record.geometrySha256 !== records[i - 1].geometrySha256 || i === records.length - 1)
  .slice(-limit).reverse();

export const publicManifestIssues = directory => {
  const issues = [];
  const manifestPath = path.join(directory, 'data/map-history/manifest.json');
  let manifest;
  try { manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')); }
  catch { return ['Нет читаемого data/map-history/manifest.json. Выполните npm run build перед экспортом.']; }
  if (manifest?.schema !== 'krmrf-map-history-v3' || !Array.isArray(manifest.versions) || !manifest.versions.length) {
    return ['Некорректный или пустой манифест публичной истории.'];
  }
  if (!Number.isInteger(manifest.limit) || manifest.limit < 2 || manifest.limit > 48) return ['Некорректный размер окна манифеста.'];
  try {
    const journal = JSON.parse(fs.readFileSync(path.join(directory, 'data/map-archive/journal.json'), 'utf8'));
    const expected = publicHistoryWindow(journal.versions, manifest.limit);
    if (expected.length !== manifest.versions.length || expected.some((row, i) =>
      manifest.versions[i]?.snapshot !== '/data/map-history/' + row.id + '.geojson'
      || manifest.versions[i]?.sha256 !== row.sha256)) issues.push('Состав манифеста расходится с постоянным архивом.');
  } catch { issues.push('Не удалось сверить манифест с постоянным архивом.'); }
  const seen = new Set();
  for (const entry of manifest.versions) {
    const file = entry?.snapshot;
    if (typeof file !== 'string' || !/^\/data\/map-history\/[\w.-]+\.geojson$/.test(file)
        || seen.has(file) || !/^[a-f0-9]{64}$/.test(entry.sha256)) {
      issues.push('Некорректное или повторное имя/хеш в манифесте.');
      continue;
    }
    seen.add(file);
    try {
      const bytes = fs.readFileSync(path.join(directory, file.slice(1)));
      if (crypto.createHash('sha256').update(bytes).digest('hex') !== entry.sha256) issues.push('Содержимое не совпало с манифестом: ' + file);
    } catch { issues.push('Отсутствует файл из манифеста: ' + file); }
  }
  const actual = fs.readdirSync(path.dirname(manifestPath)).filter(name => name.endsWith('.geojson'));
  for (const name of actual) if (!seen.has('/data/map-history/' + name)) issues.push('Файл отсутствует в манифесте: ' + name);
  return issues;
};
