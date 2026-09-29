import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { test } from 'node:test';
import { setImmediate } from 'node:timers/promises';

// Execute the production script with a small DOM/Leaflet/network model.
// These tests cover state and failures, not browser layout or map rendering.
const source = fs.readFileSync('assets/js/map.js', 'utf8');
const current = { type: 'FeatureCollection', updated: '2026-09-26 08:46', features: [{ geometry: { coordinates: [30, 50] } }] };
const previous = { ...current, updated: '2026-09-20 08:00' };
const older = { ...current, updated: '2026-09-10 08:00' };
const pause = () => setImmediate();
async function runtime() {
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) elements.set(id, { value: '', textContent: '', hidden: true, disabled: false,
      dataset: {}, handlers: {}, classList: { toggle() {} },
      addEventListener(name, handler) { this.handlers[name] = handler; },
      setAttribute() {}, replaceChildren() {}, appendChild() {}, add() {}, focus() {} });
    return elements.get(id);
  };
  element('mapUpdated').dataset.updatedIso = current.updated;
  const location = new URL('https://krmrf.invalid/map/?utm_source=test#map');
  const timers = new Map(); let timerId = 0;
  const pending = new Map(); const layers = [];
  const sandbox = { URLSearchParams, AbortController, Intl, location,
    console: { warn() {}, error() {} },
    setTimeout(fn, delay) { timers.set(++timerId, { fn, delay }); return timerId; },
    clearTimeout(id) { timers.delete(id); },
    history: { replaceState(_s, _t, next) { location.href = new URL(next, location).href; } },
    document: { getElementById: element, addEventListener() {} },
    Option: function(text, value) { this.text = text; this.value = value; },
    fetch: async url => {
      const known = {
        '/data/zones.geojson': current, '/data/rf_regions.json': { features: [] }, '/data/map-places.json': { places: [] },
        '/data/map-history/manifest.json': { versions: [previous, older].map((x, i) => ({ updated: x.updated, snapshot: `/snapshot-${i}.json` })) }
      };
      if (url in known) return { ok: true, json: async () => known[url] };
      return new Promise(resolve => pending.set(url, resolve));
    },
    L: {
      map() { return { setView() { return this; }, getCenter: () => ({ lng: 30, lat: 50 }), getZoom: () => 6,
        on() {}, invalidateSize() {}, remove() {} }; },
      tileLayer: () => ({ addTo() {} }),
      layerGroup: () => ({ addTo() { return this; }, clearLayers() {} }),
      geoJSON(data) { const layer = { data, addTo() { return this; }, clearLayers() { this.data = null; return this; },
        addData(value) { this.data = value; return this; } }; layers.push(layer); return layer; }
    }
  };
  sandbox.window = sandbox;
  vm.runInNewContext(source, sandbox, { filename: 'assets/js/map.js' });
  await pause();
  const flushUrl = () => { for (const [id, timer] of timers) if (timer.delay === 150) { timers.delete(id); timer.fn(); } };
  const select = value => { const e = element('mapSnapshotSelect'); e.value = value; return e.handlers.change(); };
  const settle = async (url, data) => { assert.ok(pending.has(url), 'snapshot request made'); pending.get(url)({ ok: Boolean(data), status: data ? 200 : 503, json: async () => data }); await pause(); flushUrl(); };
  return { element, location, layers, select, settle, flushUrl };
}

test('failed snapshot restores current geometry, label and share URL together', async () => {
  const r = await runtime();
  r.select(previous.updated); await r.settle('/snapshot-0.json', previous);
  assert.equal(r.location.searchParams.get('snapshot'), previous.updated);
  assert.match(r.element('mapViewNote').textContent, /20 сентября/);
  r.select(older.updated); await r.settle('/snapshot-1.json', null);
  assert.equal(r.layers[0].data.updated, current.updated);
  assert.equal(r.element('mapSnapshotSelect').value, 'current');
  assert.equal(r.element('compareSnapshotBtn').hidden, true);
  assert.match(r.element('mapViewNote').textContent, /текущий редакционный срез/);
  assert.equal(r.location.searchParams.has('snapshot'), false);
  assert.equal(r.location.searchParams.has('compare'), false);
  assert.equal(r.location.searchParams.get('utm_source'), 'test');
  assert.equal(r.location.hash, '#map');
});

test('pending snapshot cannot compare previous geometry under a newly selected date', async () => {
  const r = await runtime();
  r.select(previous.updated); await r.settle('/snapshot-0.json', previous);
  assert.equal(r.element('compareSnapshotBtn').hidden, false);
  const loading = r.select(older.updated);
  assert.equal(r.element('compareSnapshotBtn').hidden, true);
  await r.element('compareSnapshotBtn').handlers.click();
  assert.equal(r.layers.length, 1, 'no comparison maps created while snapshot is pending');
  await r.settle('/snapshot-1.json', older); await loading;
  assert.equal(r.element('compareSnapshotBtn').hidden, false);
  assert.equal(r.layers[0].data.updated, older.updated);
});

test('late snapshot failure cannot override a newer successful selection', async () => {
  const r = await runtime();
  r.select(previous.updated); r.select(older.updated);
  await r.settle('/snapshot-1.json', older);
  await r.settle('/snapshot-0.json', null);
  assert.equal(r.layers[0].data.updated, older.updated);
  assert.equal(r.location.searchParams.get('snapshot'), older.updated);
  assert.equal(r.element('compareSnapshotBtn').hidden, false);
});

test('return to current while a snapshot loads ignores its late success', async () => {
  const r = await runtime();
  r.select(previous.updated); await r.select('current');
  await r.settle('/snapshot-0.json', previous);
  assert.equal(r.layers[0].data.updated, current.updated);
  assert.equal(r.location.searchParams.has('snapshot'), false);
  assert.equal(r.element('compareSnapshotBtn').hidden, true);
});
