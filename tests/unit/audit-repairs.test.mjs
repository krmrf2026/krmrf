import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { publicManifestIssues } from '../../tools/lib/public-manifest.mjs';
import '../../assets/js/search-core.js';
import '../../assets/js/review-label.js';

const read = file => fs.readFileSync(file, 'utf8');
const pages = JSON.parse(read('data/pages.json'));
const index = JSON.parse(read('data/search-index.json'));
const engine = globalThis.KRMSearchIndex.create(index);
const byId = new Map(pages.map(p => [p.id, p]));
const family = 'poisk-evakuirovannogo-grazhdanskogo';
const inheritance = 'nasledstvo-nedvizhimost-lnr';
const registration = 'egrn-posle-1-iyulya-2026';
const tasks = [
  ['телефоны Кременной', 'contacts-kremennaya-2026-07-31'], ['номера служб', 'contacts-kremennaya-2026-07-31'],
  ['как найти эвакуированного', family], ['как найти родственника', family], ['красный крест', family],
  ['потерял связь с родными', family], ['потерял связь родными', family],
  ['регистрация в росреестре', registration], ['регистрация росреестре', registration],
  ['компенсация за жилье', 'powrlnr-2026-05-13'], ['наследство', inheritance],
  ['нотариус', inheritance], ['наследство на дом', inheritance]
];
for (const [query, id] of tasks) test('Контрольный запрос: ' + query, () => {
  const hits = engine.find(query, { limit: pages.length });
  assert.equal(hits[0]?.document.url, byId.get(id).url);
  if (['наследство', 'нотариус'].includes(query)) assert.ok(hits.length < pages.length / 3);
});

test('Варианты с предлогами имеют одинаковый порядок, редкая опечатка по-прежнему работает', () => {
  const urls = query => engine.find(query).map(hit => hit.document.url);
  assert.deepEqual(urls(tasks[5][0]), urls(tasks[6][0]));
  assert.deepEqual(urls(tasks[7][0]), urls(tasks[8][0]));
  assert.ok(engine.find('кременая').some(hit => hit.suggestion));
  for (const query of ['в с на', '', '   ', 'космощщцгъф']) assert.deepEqual(urls(query), []);
});

test('Карточки, поисковые документы и шапки статей получают даты из реестра', () => {
  const reference = read('reference/index.html');
  for (const p of pages.filter(p => p.reviewStatus)) {
    const doc = index.documents.find(d => d.url === p.url);
    assert.deepEqual(doc.review, { status: p.reviewStatus, checked: p.reviewedAt, due: p.reviewAfter });
    const html = read('.' + p.url + 'index.html');
    assert.ok(html.includes('data-review-due="' + p.reviewAfter + '"'));
    if (p.type === 'guide') {
      const card = reference.split('<article class="material-card"').find(c => c.includes('href="' + p.url + '"') && c.includes('data-review-due='));
      assert.ok(card, p.id);
    }
  }
  assert.ok(reference.indexOf('<nav class="reference-tasks"') < reference.indexOf('<article class="material-card"'));
  for (const p of ['index.html', 'reference/index.html', 'archive/index.html', 'search/index.html']) assert.ok(read(p).includes('/assets/js/review-label.js?'), p);
});

test('Смена дня, архив и замена обработаны независимо от даты сборки', () => {
  const m = { status: 'current', checked: '2026-11-18', due: '2026-11-25' };
  const label = globalThis.KRMReview.label;
  assert.match(label(m, '2026-11-25'), /Проверено/);
  assert.match(label(m, '2026-11-26'), /истёк 25.11/);
  assert.match(label({ ...m, status: 'review-due' }, '2026-11-24'), /Требует/);
  assert.match(label({ ...m, status: 'archived' }, '2026-11-26'), /Архив/);
  assert.match(label({ ...m, status: 'superseded' }, '2026-11-26'), /заменён/);
});

const simulate = (entry, referrer = '') => {
  const location = new URL(entry);
  const events = [];
  const window = { location };
  const history = { state: { retained: true }, replaceState(state, title, next) { this.state = state; location.href = next; } };
  const document = { referrer, documentElement: { classList: { replace() {} } },
    querySelector: () => null, createElement: () => ({}), head: { appendChild: tag => events.push(tag.src) },
    addEventListener() {} };
  const context = vm.createContext({ window, history, location, document, URL });
  for (const file of ['assets/js/head.js', 'assets/js/metrika.js']) vm.runInContext(read(file), context);
  return { window, history, location, events };
};
test('Ссылка с текстом очищена до счётчика. Категории, якорь и UTM переживают очистку', () => {
  for (const route of ['search', 'archive']) {
    const result = simulate('https://krmrf.ru/' + route + '/?q=private-marker&type=guide&utm_source=max#top');
    assert.equal(result.history.state.q, 'private-marker'); assert.ok(result.history.state.retained);
    assert.equal(result.location.search, '?type=guide&utm_source=max'); assert.equal(result.location.hash, '#top');
    assert.deepEqual(result.events, []); assert.equal(result.window.ym, undefined);
    assert.doesNotMatch(read(route + '/index.html'), /analytics-noscript-pixel/);
  }
  assert.equal(simulate('https://krmrf.ru/reference/', 'https://krmrf.ru/search/?q=test').events.length, 0);
  const ordinary = simulate('https://krmrf.ru/search/?utm_source=telegram');
  assert.equal(ordinary.events.length, 1);
  assert.equal(ordinary.window.ym.a[0][1], 'init');
  ordinary.window.KRMAnalytics.goal('search_submit', { words: 2, length: 12 });
  assert.deepEqual(Object.keys(ordinary.window.ym.a[1][3]), ['words', 'length']);
});

test('Три памятки содержат выбранные целевые ссылки, фотографии ведут к описанию происхождения', () => {
  for (const [slug, id] of [['bobp-2026-03-04', 'family'], ['egrn-2026-05-15', 'registration'], ['zemlyalnr-2026-05-04', 'land']]) {
    const html = read('news/reference/' + slug + '/index.html');
    assert.ok(html.includes('data-guide-id="' + id + '"'));
    assert.match(html, /<a\b(?=[^>]*data-guide-action=)(?=[^>]*href="https:\/\/)[^>]*>/);
  }
  const dossier = read('war-crimes/yubileynoe-2026-11-20/index.html');
  assert.equal((dossier.match(/href="#photo-origin"/g) || []).length, 4);
  assert.ok(dossier.includes('id="photo-origin"'));
});

test('Восстановление требует манифест, каждый его файл и верное содержимое', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'krm-manifest-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const folder = path.join(dir, 'data/map-history');
  fs.mkdirSync(folder, { recursive: true });
  assert.ok(publicManifestIssues(dir).length);
  const entry = { snapshot: '/data/map-history/sample.geojson', sha256: createHash('sha256').update('{}').digest('hex') };
  const journal = path.join(dir, 'data/map-archive');
  fs.mkdirSync(journal);
  fs.writeFileSync(path.join(journal, 'journal.json'), JSON.stringify({ versions: [{ id: 'sample', sha256: entry.sha256 }] }));
  const manifest = items => fs.writeFileSync(path.join(folder, 'manifest.json'), JSON.stringify({ schema: 'krmrf-map-history-v3', limit: 24, versions: items }));
  manifest([entry]); assert.ok(publicManifestIssues(dir).length);
  const target = path.join(folder, 'sample.geojson');
  fs.writeFileSync(target, 'changed'); assert.ok(publicManifestIssues(dir).length);
  fs.writeFileSync(target, '{}'); assert.deepEqual(publicManifestIssues(dir), []);
  manifest([entry, entry]); assert.ok(publicManifestIssues(dir).length);
});

test('Клик по выбранному действию и клик по каналу расходятся по разным целям', () => {
  const location = new URL('https://krmrf.ru/news/reference/egrn-2026-05-15/');
  const window = {};
  let click;
  const document = { referrer: '', querySelector: () => null, createElement: () => ({}), head: { appendChild() {} },
    addEventListener(name, handler) { if (name === 'click') click = handler; } };
  vm.runInNewContext(read('assets/js/metrika.js'), { URL, location, window, document });
  const emit = (href, action) => {
    const link = { href, dataset: { guideAction: action }, closest(selector) {
      if (selector === 'article[data-guide-id]') return { dataset: { guideId: 'registration' } };
      if (selector === 'article.article') return {};
      return null;
    } };
    click({ target: { closest: () => link } });
  };
  emit('https://publication.pravo.gov.ru/document/0001202608040002', 'law');
  emit('https://t.me/xykrm');
  const calls = JSON.parse(JSON.stringify(window.ym.a.slice(1)));
  assert.deepEqual(calls.map(args => [args[2], args[3]]), [
    ['guide_action', { guide: 'registration', action: 'law' }],
    ['channel_click', { channel: 'telegram', placement: 'article' }]
  ]);
});

test('Публичный контракт каталога для Булочкина: канонический URL и фактические статусы без подмены дат', () => {
  const docs = index.documents;
  assert.equal(docs.length, pages.length);
  assert.equal(new Set(docs.map(d => d.url)).size, pages.length);
  const guides = pages.filter(p => p.type === 'guide');
  const publicGuides = docs.filter(d => d.type === 'Практическая памятка');
  assert.equal(publicGuides.length, guides.length);
  for (const p of guides) {
    const doc = publicGuides.find(d => d.url === p.url);
    assert.ok(doc, p.id);
    assert.match(doc.url, /^\/(?:[a-z0-9_-]+\/)+$/);
    assert.equal(doc.title, p.title);
    assert.equal(doc.description, p.excerpt);
    assert.deepEqual(doc.review, { status: p.reviewStatus, checked: p.reviewedAt, due: p.reviewAfter });
  }
});
