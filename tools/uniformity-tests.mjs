import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { test } from 'node:test';
import { setImmediate } from 'node:timers/promises';
import { ancestors, attribute, hasClass, rawElement, scanElements, textContent } from './lib/html-fragments.mjs';
import { syncPublicationLayout } from './lib/publication-layout.mjs';

const read = file => fs.readFileSync(file, 'utf8');
const pages = JSON.parse(read('data/pages.json'));
const index = JSON.parse(read('data/search-index.json'));
const core = read('assets/js/search-core.js');
const archive = read('archive/index.html');
const archiveNodes = scanElements(archive);
const pause = () => setImmediate();

// A deliberately small DOM model exercises the unchanged production scripts.
// Browser rendering/interaction is covered separately by tests/e2e/uniformity.
const element = (tag = 'div', dataset = {}) => {
  const result = { tag, dataset, children: [], attributes: {}, events: {}, value: '', hidden: false,
    addEventListener(name, handler) { this.events[name] = handler; },
    setAttribute(name, value) { this.attributes[name] = value; },
    getAttribute(name) { return this.attributes[name] ?? null; },
    append(...children) { this.children.push(...children); },
    replaceChildren(...children) { this.children = [...children]; },
    querySelector() { return null; }, focus() {} };
  Object.defineProperty(result, 'textContent', {
    get() { return this.children.map(child => typeof child === 'string' ? child : child.textContent).join(''); },
    set(value) { this.children = [String(value)]; }
  });
  return result;
};

const data = node => Object.fromEntries([...node.open.matchAll(/\sdata-([a-z-]+)=(["'])([\s\S]*?)\2/g)]
  .map(match => [match[1].replace(/-([a-z])/g, (_, char) => char.toUpperCase()), attribute(node.open, `data-${match[1]}`)]));

const contextFor = (location, elements, { fail = false, waitForFetch = null } = {}) => {
  const events = {};
  const timers = new Map();
  let sequence = 0;
  const context = { URLSearchParams, location, console: { warn() {}, error() {} },
    window: { location, addEventListener(name, handler) { events[name] = handler; } },
    history: {
      replaceState(_state, _title, next) { location.href = new URL(next, location).href; },
      pushState(_state, _title, next) { location.href = new URL(next, location).href; }
    },
    document: { getElementById: id => elements[id] || null, createElement: tag => element(tag), querySelectorAll: () => [] },
    fetch: async () => { if (waitForFetch) await waitForFetch; return { ok: !fail, status: fail ? 503 : 200, json: async () => index }; },
    setTimeout(fn) { timers.set(++sequence, fn); return sequence; },
    clearTimeout(id) { timers.delete(id); }
  };
  vm.runInNewContext(core, context, { filename: 'search-core.js' });
  return { context, events, timers, async flush() {
    for (const [id, fn] of timers) { timers.delete(id); await fn(); }
    await pause();
  } };
};

const archiveRuntime = (query = '', options = {}) => {
  const location = new URL(`https://krmrf.invalid/archive/${query}`);
  const input = element('input'), status = element('p'), reset = element('button');
  const rowNodes = archiveNodes.filter(node => node.tag === 'li' && attribute(node.open, 'data-url'));
  const rows = rowNodes.map(node => { const row = element('li', data(node)); row.textContent = textContent(rawElement(archive, node)); return row; });
  const controls = archiveNodes.filter(node => attribute(node.open, 'data-filter-group')).map(node => element('button', data(node)));
  const groups = archiveNodes.filter(node => hasClass(node, 'archive-group')).map(node => ({ hidden: false,
    querySelectorAll: () => rows.filter((_row, i) => ancestors(rowNodes[i]).includes(node)) }));
  const list = { querySelectorAll: selector => selector === '.archive-list li' ? rows : selector === '.archive-group' ? groups : [] };
  const runtime = contextFor(location, { 'archive-list': list, 'archive-search': input, 'archive-status': status, 'archive-reset': reset }, options);
  runtime.context.document.querySelectorAll = () => controls;
  vm.runInNewContext(read('assets/js/archive-filter.js'), runtime.context, { filename: 'archive-filter.js' });
  return { ...runtime, input, status, reset, location, rows,
    visible: () => rows.filter(row => !row.hidden).map(row => row.dataset.url),
    async type(value) { input.value = value; input.events.input(); await runtime.flush(); },
    async pop(query) { location.href = `https://krmrf.invalid/archive/${query}`; await runtime.events.popstate(); }
  };
};

const searchRuntime = (query, options = {}) => {
  const location = new URL(`https://krmrf.invalid/search/${query}`);
  const form = element('form'), input = element('input'), results = element('div'), status = element('p');
  const runtime = contextFor(location, { 'site-search-form': form, 'site-search-input': input, 'search-results': results, 'search-status': status }, options);
  vm.runInNewContext(read('assets/js/search.js'), runtime.context, { filename: 'search.js' });
  return { ...runtime, input, results, status, location,
    submit(value) { input.value = value; form.events.submit({ preventDefault() {} }); }
  };
};

test('one-letter archive query does not inherit full-text matches', async () => {
  const runtime = archiveRuntime();
  await runtime.type('контратаки');
  assert(runtime.visible().length > 2);
  await runtime.type('ъ');
  const direct = archiveRuntime('?q=ъ');
  assert.deepEqual(runtime.visible(), direct.visible());
  runtime.reset.events.click();
  assert.equal(runtime.visible().length, pages.length);
  await runtime.type('ъ');
  assert.deepEqual(runtime.visible(), direct.visible());
});

test('delayed index cannot restore a superseded query after reset', async () => {
  let release;
  const waitForFetch = new Promise(resolve => { release = resolve; });
  const runtime = archiveRuntime('', { waitForFetch });
  const pending = runtime.type('контратаки');
  await runtime.type('ъ');
  runtime.reset.events.click();
  release();
  await pending;
  assert.equal(runtime.visible().length, pages.length);
  await runtime.type('ъ');
  assert.deepEqual(runtime.visible(), archiveRuntime('?q=ъ').visible());
});

test('archive history and reset retain unrelated parameters and fragments', async () => {
  const runtime = archiveRuntime('?utm_source=test#archive-list');
  await runtime.type('контратаки');
  assert.equal(runtime.location.searchParams.get('utm_source'), 'test');
  assert.equal(runtime.location.hash, '#archive-list');
  await runtime.pop('?q=ъ&utm_source=test#archive-list');
  assert.deepEqual(runtime.visible(), archiveRuntime('?q=ъ').visible());
  runtime.reset.events.click();
  assert.equal(runtime.location.searchParams.get('utm_source'), 'test');
  assert.equal(runtime.location.searchParams.get('q'), null);
  assert.equal(runtime.location.hash, '#archive-list');
});

test('archive exposes the metadata-only fallback after an index error', async () => {
  const runtime = archiveRuntime('', { fail: true });
  await runtime.type('Кременная');
  assert(runtime.visible().length > 0);
  assert.match(runtime.status.textContent, /Полнотекстовый поиск недоступен/);
});

test('search displays every match, with human-readable semantic dates', async () => {
  const runtime = searchRuntime('?q=2026&utm_source=test#search-results');
  await pause();
  const expected = runtime.context.window.KRMSearchIndex.create(index).find('2026', { limit: index.documents.length }).length;
  assert(expected > 50);
  assert.equal(runtime.results.children.length, expected);
  assert.equal(runtime.status.textContent, `Найдено материалов: ${expected}`);
  const date = runtime.results.children[0].children[0].children.find(child => child.tag === 'time');
  assert.match(date.dateTime, /^\d{4}-\d{2}-\d{2}$/);
  assert.match(date.textContent, /^\d{1,2} [а-я]+ \d{4} года$/u);
  runtime.submit('ЛНР');
  assert(runtime.results.children.length > 50);
  assert.equal(runtime.location.searchParams.get('utm_source'), 'test');
  assert.equal(runtime.location.hash, '#search-results');
});

test('fuzzy suggestions also retain dates', async () => {
  const runtime = searchRuntime('?q=кременая');
  await pause();
  assert.match(runtime.status.textContent, /Точных совпадений нет/);
  assert(runtime.results.children.length > 0);
  for (const result of runtime.results.children) {
    assert.match(result.className, /search-result--suggestion/);
    assert(result.children[0].children.some(child => child.tag === 'time'));
  }
});

test('shared layout is idempotent for the entire catalog', () => {
  for (const item of pages) {
    const original = read(`${item.url.slice(1)}index.html`);
    const normalized = syncPublicationLayout(original, item, pages);
    assert.equal(normalized, original, item.url);
    assert.equal(syncPublicationLayout(normalized, item, pages), normalized, item.url);
  }
});

test('new assessment supplies the old last assessment with a forward link', () => {
  const latest = pages.filter(item => item.type === 'assessment').sort((a, b) => a.datePublished.localeCompare(b.datePublished)).at(-1);
  const date = new Date(`${latest.datePublished}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 7);
  const future = { ...latest, datePublished: date.toISOString().slice(0, 10), title: 'Проверка следующей оценки', url: '/assessment/template-test-future/' };
  const output = syncPublicationLayout(read(`${latest.url.slice(1)}index.html`), latest, [...pages, future]);
  const next = scanElements(output).find(node => attribute(node.open, 'data-series-kind') === 'next');
  assert.equal(attribute(next.open, 'href'), future.url);
  assert.match(rawElement(output, next), /Проверка следующей оценки/);
});

test('parser preserves quoted angle brackets, raw scripts and HTML text', () => {
  const sample = '<article class="article"><p title="a > b">До <strong>после</strong>.</p><!-- comment --><script type="application/ld+json">{"text":"<test>"}</script></article>';
  const nodes = scanElements(sample);
  assert.equal(nodes.length, 4);
  assert.equal(rawElement(sample, nodes[0]), sample);
  assert.equal(attribute(nodes[1].open, 'title'), 'a > b');
  assert.throws(() => scanElements('<article><p>lost</article>'), /Несогласованные/);
});
