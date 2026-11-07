import test from 'node:test';
import assert from 'node:assert/strict';
import { selectHome, selectItems } from '../../tools/lib/catalog.mjs';
import { laterChronicle, syncChronicleStatus } from '../../tools/lib/chronicle-status.mjs';
import { dossierEventIssues, renderDossierEvents } from '../../tools/lib/dossier-events.mjs';
import { requiresReview, guideFreshnessState } from '../../tools/lib/guide-freshness.mjs';

const dossier = (id, published, modified, home) => ({ id, url: `/${id}/`, title: id, type: 'dossier', section: 'warcrimes', datePublished: published, dateModified: modified, home });

test('editing the oldest case file promotes it past legacy pins on home and in the dossier index', () => {
  const pages = [dossier('bus', '2026-08-28', '2026-08-28', { dossier: 1 }),
    dossier('starobelsk', '2026-05-22', '2026-10-25', { dossier: 2 }),
    dossier('kremennaya', '2026-06-30', '2026-11-07')];
  assert.deepEqual(selectHome(pages, 'dossier').map(item => item.id), ['kremennaya', 'starobelsk']);
  assert.deepEqual(selectItems(pages, 'type:dossier').map(item => item.id), ['kremennaya', 'starobelsk', 'bus']);
  pages.push(dossier('new', '2026-11-08', '2026-11-08'));
  assert.deepEqual(selectHome(pages, 'dossier').map(item => item.id), ['new', 'kremennaya']);
});

test('ties are stable; other home groups retain editorial priorities and exclude duplicates', () => {
  const pages = [dossier('older', '2026-05-22', '2026-11-07'), dossier('newer', '2026-08-28', '2026-11-07')];
  assert.deepEqual(selectHome(pages, 'dossier').map(item => item.id), ['newer', 'older']);
  const article = { ...pages[0], type: 'article', section: 'kremennaya', home: { important: 1 } };
  assert.equal(selectHome([...pages, article], 'important')[0], article);
  assert.equal(selectHome([...pages, article], 'important', new Set([article.url])).length, 0);
});

test('historical articles point to the latest member of their series without changing publication dates or body', () => {
  const old = { id: 'old', type: 'article', chronicleSeries: 'kremennaya-state', datePublished: '2026-05-01', dateModified: '2026-10-25' };
  const current = { ...old, id: 'now', url: '/now/', title: 'Город <сегодня>', datePublished: '2026-10-28' };
  const unrelated = { ...current, id: 'holiday', url: '/holiday/', title: 'Праздник', datePublished: '2026-11-04', chronicleSeries: undefined };
  assert.equal(laterChronicle(old, [old, current, unrelated]), current);
  const html = '<article><header class="article-header"><h1>Архив</h1></header><p>Исходный текст.</p></article>';
  const before = structuredClone(old);
  const updated = syncChronicleStatus(html, old, [old, current, unrelated]);
  assert.match(updated, /href="\/now\/"/);
  assert.match(updated, /Город &lt;сегодня&gt;/);
  assert.ok(updated.includes('<p>Исходный текст.</p>'));
  assert.deepEqual(old, before);
  assert.equal(syncChronicleStatus(updated, old, [old, current, unrelated]), updated);
  assert.equal(syncChronicleStatus(updated, old, [old]), html);
});

test('dossiers enter the same expiry queue as guides; expiry never invents a new review', () => {
  const item = { type: 'dossier', reviewedAt: '2026-11-07', dateModified: '2026-11-07', reviewAfter: '2026-12-07', reviewStatus: 'current' };
  assert.equal(requiresReview(item), true);
  assert.equal(guideFreshnessState(item, '2026-12-08').state, 'overdue');
  assert.equal(item.reviewedAt, '2026-11-07');
});

const sourceEvent = () => ({ id: 'a', dossierId: 'case', reportedAt: '2026-09-25', occurredOn: '2026-09-06', verifiedAt: '2026-11-07',
  place: 'Округ', summary: 'Сообщение о погибшей.', attribution: 'Заявление источника.', sources: [{ url: 'https://example.org/report', label: 'Источник' }] });
const casePage = dossier('case', '2026-06-30', '2026-11-07');

test('case events preserve the difference between event and report dates and reject invalid evidence', () => {
  const event = sourceEvent();
  assert.deepEqual(dossierEventIssues({ schemaVersion: 1, events: [event] }, [casePage], '2026-11-07'), []);
  const rendered = renderDossierEvents([event]);
  assert.match(rendered, /25\.09\.2026/);
  assert.match(rendered, /Событие: 06\.09\.2026/);
  for (const patch of [{ id: '' }, { occurredOn: '2026-09-26' }, { reportedAt: '2026-11-08' },
    { sources: [{ url: 'https://krmrf.ru/own-report/', label: 'Самоссылка' }] }, { dossierId: 'unknown' }]) {
    assert.ok(dossierEventIssues({ schemaVersion: 1, events: [{ ...event, ...patch }] }, [casePage], '2026-11-07').length);
  }
  assert.ok(dossierEventIssues({ schemaVersion: 1, events: [event, event] }, [casePage], '2026-11-07').some(issue => issue.includes('уникальный')));
  assert.ok(dossierEventIssues({ schemaVersion: 1, events: [event] }, [{ ...casePage, dateModified: '2026-10-01' }], '2026-11-07').some(issue => issue.includes('dateModified')));
});
