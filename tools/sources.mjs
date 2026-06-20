import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import process from 'node:process';

const ROOT = process.cwd();
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');
const write = (file, content) => fs.writeFileSync(path.join(ROOT, file), content, 'utf8');
const pages = JSON.parse(read('data/pages.json'));
const site = JSON.parse(read('data/site.json'));
const registryFile = 'data/sources.json';
const current = fs.existsSync(path.join(ROOT, registryFile)) ? JSON.parse(read(registryFile)) : [];
const byUrl = new Map(current.map(item => [item.url, item]));

const decodeEntities = value => String(value || '')
  .replace(/&nbsp;/g, ' ')
  .replace(/&amp;/g, '&')
  .replace(/&quot;/g, '"')
  .replace(/&#39;|&#039;/g, "'")
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));

const stripTags = html => decodeEntities(String(html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
const stableId = url => `src-${crypto.createHash('sha256').update(url).digest('hex').slice(0, 12)}`;
const fileForUrl = url => `${url.replace(/^\//, '').replace(/\/$/, '')}/index.html`;

const pageSources = new Map();
const referencesBySource = new Map();
const priorityRank = { normal: 1, medium: 2, high: 3 };
const pagePriority = page => page.type === 'dossier' || page.type === 'assessment' ? 'high' : page.type === 'guide' ? 'medium' : 'normal';
for (const page of pages) {
  const html = read(fileForUrl(page.url));
  const main = html.match(/<main\b[\s\S]*?<\/main>/i)?.[0] || '';
  const sources = [];
  for (const match of main.matchAll(/<a\b([^>]*)href=(['"])(https?:\/\/[^'"]+)\2([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const url = decodeEntities(match[3]).trim();
    let parsed;
    try { parsed = new URL(url); } catch { continue; }
    if (parsed.hostname === 'krmrf.ru' || parsed.hostname.endsWith('.krmrf.ru')) continue;
    const title = stripTags(match[5]) || parsed.hostname;
    const existing = byUrl.get(url);
    const record = existing || {
      id: stableId(url),
      url,
      title,
      publisher: parsed.hostname.replace(/^www\./, ''),
      registeredAt: site.buildDate,
      accessedAt: null,
      archiveUrl: null,
      localCopy: null,
      sha256: null,
      status: 'referenced',
      notes: 'Источник зарегистрирован автоматически по ссылке в публикации; дата доступа и архивная копия заполняются вручную для ключевых доказательств.'
    };
    if (!record.title && title) record.title = title;
    byUrl.set(url, record);
    sources.push(record.id);
    const references = referencesBySource.get(record.id) || [];
    references.push({ pageId: page.id, type: page.type });
    referencesBySource.set(record.id, references);
  }
  pageSources.set(page.id, [...new Set(sources)]);
}

const updatedPages = pages.map(page => ({
  ...page,
  sourceIds: pageSources.get(page.id) || []
}));
const registry = [...byUrl.values()].map(record => {
  const references = referencesBySource.get(record.id) || [];
  const computedPriority = references.reduce((priority, reference) => {
    const candidate = pagePriority(reference);
    return priorityRank[candidate] > priorityRank[priority] ? candidate : priority;
  }, 'normal');
  return {
    ...record,
    preservationPriority: priorityRank[computedPriority] > priorityRank[record.preservationPriority || 'normal'] ? computedPriority : (record.preservationPriority || computedPriority),
    referencedBy: references.map(reference => reference.pageId).sort()
  };
}).sort((a, b) => String(a.id).localeCompare(String(b.id)));
const queue = registry
  .filter(record => record.preservationPriority !== 'normal' && !record.localCopy && !record.archiveUrl)
  .map(record => ({
    sourceId: record.id,
    priority: record.preservationPriority,
    title: record.title,
    url: record.url,
    referencedBy: record.referencedBy,
    action: 'Сохранить допустимую локальную копию или точный архивный URL, затем выполнить npm run source:capture.'
  }))
  .sort((a, b) => priorityRank[b.priority] - priorityRank[a.priority] || a.sourceId.localeCompare(b.sourceId));
write('data/pages.json', `${JSON.stringify(updatedPages, null, 2)}
`);
write(registryFile, `${JSON.stringify(registry, null, 2)}
`);
write('data/source-preservation-queue.json', `${JSON.stringify(queue, null, 2)}
`);
console.log(`Реестр источников синхронизирован: ${registry.length} записей, ${updatedPages.length} публикаций.`);
console.log(`Очередь сохранения ключевых источников: ${queue.length}.`);
