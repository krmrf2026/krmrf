(() => {
  'use strict';

  const STYLE_URL = 'https://tiles.openfreemap.org/styles/bright';
  const OSM_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
  const DEFAULT_CENTER = [38.15, 48.95]; // [lng, lat]
  const DEFAULT_ZOOM = 6;
  const MAPLIBRE_TIMEOUT = 9000;

  const el = id => document.getElementById(id);
  const statusEl = el('mapStatus');
  const updatedEl = el('mapUpdated');
  const historyControl = el('mapHistoryControl');
  const snapshotSelect = el('mapSnapshotSelect');
  const compareBtn = el('compareSnapshotBtn');
  const resetBtn = el('resetMapBtn');
  const copyBtn = el('copyMapLinkBtn');
  const viewNote = el('mapViewNote');
  const searchForm = el('mapSearchForm');
  const searchInput = el('mapPlaceSearch');
  const suggestions = el('mapPlaceSuggestions');
  const wrapper = el('mapWrapper');
  const singlePanel = el('mapSinglePanel');
  const comparePanel = el('mapComparePanel');
  const compareOldLabel = el('compareOldLabel');
  const compareCurrentLabel = el('compareCurrentLabel');
  const openBtn = el('openFullscreenBtn');
  const exitBtn = el('exitFullscreenBtn');

  const state = {
    currentZones: null,
    currentUpdated: updatedEl?.dataset?.updatedIso || '',
    regions: null,
    places: [],
    history: [],
    selected: 'current',
    selectedZones: null,
    singleMap: null,
    compareMaps: [],
    engine: '',
    comparing: false,
    fullscreen: false,
    initialCamera: null
  };

  const setStatus = (message, level = 'info') => {
    if (!statusEl) return;
    statusEl.textContent = message || '';
    statusEl.dataset.level = level;
    statusEl.hidden = !message;
  };
  const formatDate = value => {
    if (!value) return 'дата не указана';
    const date = new Date(String(value).trim().replace(' ', 'T'));
    if (Number.isNaN(date.getTime())) return String(value);
    const options = { day: 'numeric', month: 'long', year: 'numeric' };
    if (/\d{1,2}:\d{2}/.test(String(value))) { options.hour = '2-digit'; options.minute = '2-digit'; }
    return new Intl.DateTimeFormat('ru-RU', options).format(date).replace(' г.', ' года');
  };
  const fetchJson = async (url, timeout = 12000) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetch(url, { credentials: 'same-origin', signal: controller.signal });
      if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
      return await response.json();
    } finally { clearTimeout(timer); }
  };
  const normalize = value => String(value || '').toLocaleLowerCase('ru-RU')
    .replace(/ё/g, 'е').replace(/[—–-]/g, ' ').replace(/[^a-zа-я0-9\s]/gi, ' ').replace(/\s+/g, ' ').trim();

  const walkCoords = (value, visit) => {
    if (!Array.isArray(value)) return;
    if (value.length >= 2 && Number.isFinite(Number(value[0])) && Number.isFinite(Number(value[1]))) {
      visit(Number(value[0]), Number(value[1])); return;
    }
    value.forEach(item => walkCoords(item, visit));
  };
  const bbox = geojson => {
    let west = Infinity, south = Infinity, east = -Infinity, north = -Infinity;
    for (const feature of geojson?.features || []) {
      walkCoords(feature?.geometry?.coordinates, (lng, lat) => {
        west = Math.min(west, lng); south = Math.min(south, lat); east = Math.max(east, lng); north = Math.max(north, lat);
      });
    }
    return Number.isFinite(west) ? [[west, south], [east, north]] : null;
  };
  const zoneColor = feature => {
    const name = String(feature?.properties?.name || '').toLowerCase();
    if (name.includes('russian')) return '#c44545';
    if (name.includes('ukrainian')) return '#2563a8';
    if (name.includes('contested') || name.includes('disputed')) return '#b7791f';
    return '#6b7280';
  };
  const zoneExpression = ['case',
    ['in', 'russian', ['downcase', ['coalesce', ['get', 'name'], '']]], '#c44545',
    ['in', 'ukrainian', ['downcase', ['coalesce', ['get', 'name'], '']]], '#2563a8',
    ['any',
      ['in', 'contested', ['downcase', ['coalesce', ['get', 'name'], '']]],
      ['in', 'disputed', ['downcase', ['coalesce', ['get', 'name'], '']]]
    ], '#b7791f', '#6b7280'];

  const placeFeatureCollection = places => ({
    type: 'FeatureCollection',
    features: places.map((place, index) => ({
      type: 'Feature',
      id: index,
      properties: { name: place.name, minZoom: Number(place.minZoom || 6), rank: place.rank || 'city' },
      geometry: { type: 'Point', coordinates: [Number(place.lng), Number(place.lat)] }
    }))
  });

  const localizeMapLibre = map => {
    for (const layer of map.getStyle()?.layers || []) {
      if (layer.type !== 'symbol') continue;
      if (/flag|\bpoi\b|airport|transit|station/i.test(layer.id)) {
        try { map.setLayoutProperty(layer.id, 'visibility', 'none'); } catch {}
        continue;
      }
      let field;
      try { field = map.getLayoutProperty(layer.id, 'text-field'); } catch { continue; }
      if (!field || !/name/i.test(JSON.stringify(field))) continue;
      try {
        // Intentionally no fallback to generic `name`: on this map a missing Russian
        // translation is better than an unwanted Ukrainian label. Important places are
        // supplied by the local KRM place layer below.
        map.setLayoutProperty(layer.id, 'text-field', [
          'case',
          ['has', 'name:ru'], ['get', 'name:ru'],
          ['has', 'name_ru'], ['get', 'name_ru'],
          ''
        ]);
      } catch {}
    }
  };

  const addMapLibreData = (map, zones, regions, places) => {
    map.addSource('krm-zones', { type: 'geojson', data: zones });
    map.addLayer({ id: 'krm-zones-fill', type: 'fill', source: 'krm-zones', paint: { 'fill-color': zoneExpression, 'fill-opacity': 0.38 } });
    map.addLayer({ id: 'krm-zones-shadow', type: 'line', source: 'krm-zones', paint: { 'line-color': '#000', 'line-width': 6, 'line-opacity': 0.18 } });
    map.addLayer({ id: 'krm-zones-outline', type: 'line', source: 'krm-zones', paint: { 'line-color': '#6e1111', 'line-width': 2.2, 'line-opacity': 0.96 } });
    if (regions?.features?.length) {
      map.addSource('krm-regions', { type: 'geojson', data: regions });
      map.addLayer({ id: 'krm-regions-line', type: 'line', source: 'krm-regions', paint: { 'line-color': '#2f63c7', 'line-width': 1.2, 'line-opacity': 0.88 } });
    }
    if (places.length) {
      map.addSource('krm-places', { type: 'geojson', data: placeFeatureCollection(places) });
      const addPlaces = (rank, minzoom, size) => {
        map.addLayer({
          id: `krm-places-${rank}-dot`, type: 'circle', source: 'krm-places', minzoom,
          filter: ['==', ['get', 'rank'], rank],
          paint: { 'circle-radius': 2.7, 'circle-color': '#1b1b1b', 'circle-stroke-color': '#fff', 'circle-stroke-width': 1 }
        });
        map.addLayer({
          id: `krm-places-${rank}-label`, type: 'symbol', source: 'krm-places', minzoom,
          filter: ['==', ['get', 'rank'], rank],
          layout: {
            'text-field': ['get', 'name'], 'text-size': size, 'text-font': ['Noto Sans Bold'],
            'text-offset': [0, -1.05], 'text-anchor': 'bottom', 'text-allow-overlap': false,
            'text-optional': true
          },
          paint: { 'text-color': '#111', 'text-halo-color': '#fff', 'text-halo-width': 1.5, 'text-halo-blur': .3 }
        });
      };
      addPlaces('major', 5, 13); addPlaces('city', 6, 12); addPlaces('town', 7.5, 11.5);
    }
  };

  const createMapLibre = (containerId, zones, { camera = null, fit = false } = {}) => new Promise((resolve, reject) => {
    if (!window.maplibregl) { reject(new Error('MapLibre не загрузился')); return; }
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return; settled = true;
      try { map.remove(); } catch {}
      reject(new Error('Векторная подложка не ответила вовремя'));
    }, MAPLIBRE_TIMEOUT);
    const map = new maplibregl.Map({
      container: containerId, style: STYLE_URL, center: camera?.center || DEFAULT_CENTER,
      zoom: Number.isFinite(camera?.zoom) ? camera.zoom : DEFAULT_ZOOM,
      bearing: camera?.bearing || 0, pitch: camera?.pitch || 0, attributionControl: false,
      maplibreLogo: false, fadeDuration: 0, maxZoom: 17
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-left');
    map.addControl(new maplibregl.AttributionControl({ compact: true, customAttribution: 'KRM РФ · OpenFreeMap' }), 'bottom-right');
    const fail = error => {
      if (settled) return;
      if (!map.loaded()) { settled = true; clearTimeout(timer); try { map.remove(); } catch {}; reject(error?.error || error || new Error('Ошибка MapLibre')); }
    };
    map.once('error', fail);
    map.once('load', () => {
      if (settled) return;
      try {
        localizeMapLibre(map);
        addMapLibreData(map, zones, state.regions, state.places);
        if (fit) {
          const bounds = bbox(zones);
          if (bounds) map.fitBounds(bounds, { padding: 24, maxZoom: 9, duration: 0 });
        }
        settled = true; clearTimeout(timer);
        resolve({
          kind: 'maplibre', raw: map,
          setZones(data) { const source = map.getSource('krm-zones'); if (source?.setData) source.setData(data); },
          fitZones(data) { const bounds = bbox(data); if (bounds) map.fitBounds(bounds, { padding: 24, maxZoom: 9, duration: 0 }); },
          flyTo(place) { map.flyTo({ center: [place.lng, place.lat], zoom: Math.max(9, map.getZoom()), duration: 700 }); },
          camera() { const c = map.getCenter(); return { center: [c.lng, c.lat], zoom: map.getZoom(), bearing: map.getBearing(), pitch: map.getPitch() }; },
          jump(cameraValue) { if (cameraValue) map.jumpTo({ center: cameraValue.center, zoom: cameraValue.zoom, bearing: cameraValue.bearing || 0, pitch: cameraValue.pitch || 0 }); },
          resize() { map.resize(); }, remove() { map.remove(); },
          onMove(handler) { map.on('moveend', handler); }, onContinuousMove(handler) { map.on('move', handler); }
        });
      } catch (error) { settled = true; clearTimeout(timer); try { map.remove(); } catch {}; reject(error); }
    });
  });

  const createLeaflet = (containerId, zones, { camera = null, fit = false } = {}) => {
    if (!window.L) throw new Error('Leaflet не загрузился');
    const center = camera?.center ? [camera.center[1], camera.center[0]] : [DEFAULT_CENTER[1], DEFAULT_CENTER[0]];
    const map = L.map(containerId, { preferCanvas: true, attributionControl: true, zoomControl: true }).setView(center, camera?.zoom || DEFAULT_ZOOM);
    L.tileLayer(OSM_URL, { maxZoom: 19, attribution: '© <a href="https://www.openstreetmap.org/copyright" rel="noopener">OpenStreetMap</a>' }).addTo(map);
    const fill = L.geoJSON(zones, { style: feature => ({ color: '#6e1111', weight: 2.2, opacity: .95, fillColor: zoneColor(feature), fillOpacity: .38 }) }).addTo(map);
    if (state.regions?.features?.length) L.geoJSON(state.regions, { interactive: false, style: { color: '#2f63c7', weight: 1.2, opacity: .88, fillOpacity: 0 } }).addTo(map);
    const placeLayer = L.layerGroup().addTo(map);
    const renderPlaces = () => {
      placeLayer.clearLayers();
      const zoom = map.getZoom();
      for (const place of state.places) {
        if (zoom < Number(place.minZoom || 6)) continue;
        const marker = L.marker([place.lat, place.lng], {
          interactive: false,
          icon: L.divIcon({ className: '', html: `<span class="krm-place-dot" aria-hidden="true"></span><span class="krm-place-label">${String(place.name).replace(/[<>&]/g, '')}</span>`, iconSize: [1, 1] })
        });
        marker.addTo(placeLayer);
      }
    };
    map.on('zoomend', renderPlaces); renderPlaces();
    if (fit) { const bounds = fill.getBounds(); if (bounds.isValid()) map.fitBounds(bounds, { padding: [20, 20], maxZoom: 9, animate: false }); }
    return {
      kind: 'leaflet', raw: map,
      setZones(data) { fill.clearLayers().addData(data); },
      fitZones(data) { const temp = L.geoJSON(data); const bounds = temp.getBounds(); if (bounds.isValid()) map.fitBounds(bounds, { padding: [20, 20], maxZoom: 9, animate: false }); },
      flyTo(place) { map.flyTo([place.lat, place.lng], Math.max(9, map.getZoom()), { duration: .7 }); },
      camera() { const c = map.getCenter(); return { center: [c.lng, c.lat], zoom: map.getZoom(), bearing: 0, pitch: 0 }; },
      jump(cameraValue) { if (cameraValue) map.setView([cameraValue.center[1], cameraValue.center[0]], cameraValue.zoom, { animate: false }); },
      resize() { map.invalidateSize(); }, remove() { map.remove(); },
      onMove(handler) { map.on('moveend', handler); }, onContinuousMove(handler) { map.on('move', handler); }
    };
  };

  const createMap = async (containerId, zones, options = {}) => {
    if (window.maplibregl) {
      try { return await createMapLibre(containerId, zones, options); }
      catch (error) {
        console.warn('MapLibre/OpenFreeMap недоступны, включён резервный OSM:', error);
        if (!state.engine) setStatus('Русскоязычная векторная подложка временно недоступна. Включён резерв OpenStreetMap; данные KRM РФ и поиск продолжают работать.', 'warning');
      }
    }
    return createLeaflet(containerId, zones, options);
  };

  const cameraFromUrl = () => {
    const params = new URLSearchParams(location.search);
    const lng = Number(params.get('lng')), lat = Number(params.get('lat')), zoom = Number(params.get('z'));
    if (!Number.isFinite(lng) || !Number.isFinite(lat) || !Number.isFinite(zoom)) return null;
    return { center: [lng, lat], zoom: Math.max(3, Math.min(17, zoom)), bearing: 0, pitch: 0 };
  };
  let urlTimer = 0;
  const updateUrl = () => {
    clearTimeout(urlTimer);
    urlTimer = setTimeout(() => {
      const active = state.comparing ? state.compareMaps[0] : state.singleMap;
      if (!active) return;
      const camera = active.camera();
      const params = new URLSearchParams();
      params.set('lat', camera.center[1].toFixed(5)); params.set('lng', camera.center[0].toFixed(5)); params.set('z', camera.zoom.toFixed(2));
      if (state.selected !== 'current') params.set('snapshot', state.selected);
      if (state.comparing) params.set('compare', '1');
      history.replaceState(null, '', `${location.pathname}?${params.toString()}${location.hash}`);
    }, 150);
  };

  const recordByUpdated = updated => state.history.find(item => String(item.updated) === String(updated));
  const loadSnapshot = async updated => {
    const record = recordByUpdated(updated);
    if (!record?.snapshot) throw new Error('Исторический срез не найден');
    return fetchJson(record.snapshot);
  };
  const historyNote = record => {
    if (!record) return 'Показан текущий редакционный срез. История содержит только те даты, когда геометрия карты реально менялась.';
    const tail = record.summary ? ` — ${record.summary}` : '';
    return `Показан редакционный срез: ${formatDate(record.updated)}${tail}`;
  };

  const closeCompare = () => {
    state.compareMaps.forEach(map => { try { map.remove(); } catch {} });
    state.compareMaps = []; state.comparing = false;
    if (comparePanel) comparePanel.hidden = true;
    if (singlePanel) singlePanel.hidden = false;
    if (compareBtn) compareBtn.textContent = 'Сравнить с текущей';
    setTimeout(() => state.singleMap?.resize(), 40);
    updateUrl();
  };
  const syncMaps = (a, b) => {
    let locking = false;
    const sync = (from, to) => {
      if (locking) return;
      locking = true;
      try { to.jump(from.camera()); } finally { locking = false; }
    };
    a.onContinuousMove(() => sync(a, b)); b.onContinuousMove(() => sync(b, a));
  };
  const openCompare = async () => {
    if (state.selected === 'current' || !state.selectedZones) return;
    if (state.comparing) { closeCompare(); return; }
    const camera = state.singleMap?.camera() || state.initialCamera;
    if (singlePanel) singlePanel.hidden = true;
    if (comparePanel) comparePanel.hidden = false;
    const record = recordByUpdated(state.selected);
    if (compareOldLabel) compareOldLabel.textContent = `Было — ${formatDate(record?.updated || state.selected)}`;
    if (compareCurrentLabel) compareCurrentLabel.textContent = `Сейчас — ${formatDate(state.currentUpdated)}`;
    try {
      const oldMap = await createMap('mapCompareOld', state.selectedZones, { camera, fit: false });
      const currentMap = await createMap('mapCompareCurrent', state.currentZones, { camera, fit: false });
      state.compareMaps = [oldMap, currentMap]; state.comparing = true;
      syncMaps(oldMap, currentMap);
      oldMap.onMove(updateUrl); currentMap.onMove(updateUrl);
      if (compareBtn) compareBtn.textContent = 'Закрыть сравнение';
      setStatus('Сравнение открыто: слева выбранный редакционный срез, справа текущее состояние. Масштаб и перемещение синхронизированы.', 'success');
      updateUrl();
    } catch (error) {
      console.error(error); closeCompare(); setStatus('Не удалось открыть режим сравнения.', 'error');
    }
  };

  const selectSnapshot = async value => {
    if (state.comparing) closeCompare();
    state.selected = value || 'current';
    if (state.selected === 'current') {
      state.selectedZones = state.currentZones; state.singleMap?.setZones(state.currentZones);
      if (viewNote) viewNote.textContent = historyNote(null);
      if (compareBtn) compareBtn.hidden = true;
      setStatus('', 'info'); updateUrl(); return;
    }
    const record = recordByUpdated(state.selected);
    try {
      const data = await loadSnapshot(state.selected);
      state.selectedZones = data; state.singleMap?.setZones(data);
      if (viewNote) viewNote.textContent = historyNote(record);
      if (compareBtn) compareBtn.hidden = false;
      setStatus(`Показано состояние карты на ${formatDate(record?.updated || state.selected)}. Для наглядного сравнения нажмите «Сравнить с текущей».`, 'success');
      updateUrl();
    } catch (error) {
      console.error(error); state.selected = 'current'; if (snapshotSelect) snapshotSelect.value = 'current';
      state.selectedZones = state.currentZones; state.singleMap?.setZones(state.currentZones); if (compareBtn) compareBtn.hidden = true;
      setStatus('Исторический срез не загрузился; показано текущее состояние.', 'error');
    }
  };

  const setupHistory = manifest => {
    const versions = Array.isArray(manifest?.versions) ? manifest.versions : [];
    state.history = versions;
    const previous = versions.filter(item => String(item.updated) !== String(state.currentUpdated));
    if (!previous.length || !snapshotSelect || !historyControl) {
      if (viewNote) viewNote.textContent = manifest?.generatedFrom === 'current-only'
        ? 'Показан текущий редакционный срез. В этой копии нет Git-истории; в рабочей ветке прошлые срезы восстановятся автоматически.'
        : 'Показан текущий редакционный срез. Прошлые состояния появятся после следующего реально изменённого и закоммиченного обновления карты.';
      return;
    }
    historyControl.hidden = false;
    snapshotSelect.replaceChildren(new Option(`Сейчас — ${formatDate(state.currentUpdated)}`, 'current'));
    for (const record of previous) snapshotSelect.add(new Option(formatDate(record.updated), String(record.updated)));
  };

  const setupPlaces = places => {
    state.places = Array.isArray(places?.places) ? places.places.filter(place => Number.isFinite(Number(place.lat)) && Number.isFinite(Number(place.lng))) : [];
    if (suggestions) for (const place of state.places) suggestions.appendChild(new Option(place.name));
  };
  const findPlace = query => {
    const needle = normalize(query); if (!needle) return null;
    const scored = [];
    for (const place of state.places) {
      const names = [place.name, ...(place.aliases || [])].map(normalize);
      const exact = names.includes(needle), prefix = names.some(name => name.startsWith(needle)), contains = names.some(name => name.includes(needle));
      if (exact || prefix || contains) scored.push({ place, score: exact ? 0 : prefix ? 1 : 2 });
    }
    scored.sort((a, b) => a.score - b.score || String(a.place.name).localeCompare(String(b.place.name), 'ru'));
    return scored[0]?.place || null;
  };

  const fitActive = () => {
    if (state.comparing) state.compareMaps.forEach(map => map.fitZones(state.currentZones));
    else state.singleMap?.fitZones(state.selectedZones || state.currentZones);
  };
  const copyLink = async () => {
    updateUrl(); await new Promise(resolve => setTimeout(resolve, 180));
    try { await navigator.clipboard.writeText(location.href); setStatus('Ссылка на текущий вид карты скопирована.', 'success'); }
    catch { setStatus('Не удалось скопировать ссылку автоматически. Скопируйте адрес из строки браузера.', 'warning'); }
  };

  const syncFullscreen = value => {
    state.fullscreen = value; wrapper?.classList.toggle('fullscreen', value);
    openBtn?.setAttribute('aria-expanded', String(value)); openBtn?.setAttribute('aria-pressed', String(value));
    exitBtn?.setAttribute('aria-expanded', String(value)); exitBtn?.setAttribute('aria-pressed', String(value));
    setTimeout(() => { state.singleMap?.resize(); state.compareMaps.forEach(map => map.resize()); }, 120);
  };
  const enterFullscreen = async () => {
    if (!wrapper || state.fullscreen) return;
    try { if (wrapper.requestFullscreen) await wrapper.requestFullscreen(); } catch {}
    syncFullscreen(true);
  };
  const exitFullscreen = async () => {
    if (!wrapper || !state.fullscreen) return;
    try { if (document.fullscreenElement) await document.exitFullscreen(); } catch {}
    syncFullscreen(false); openBtn?.focus();
  };

  snapshotSelect?.addEventListener('change', () => selectSnapshot(snapshotSelect.value));
  compareBtn?.addEventListener('click', openCompare);
  resetBtn?.addEventListener('click', fitActive);
  copyBtn?.addEventListener('click', copyLink);
  searchForm?.addEventListener('submit', event => {
    event.preventDefault(); const place = findPlace(searchInput?.value);
    if (!place) { setStatus('Населённый пункт не найден в локальном справочнике KRM РФ.', 'warning'); return; }
    const activeMaps = state.comparing ? state.compareMaps : [state.singleMap]; activeMaps.filter(Boolean).forEach(map => map.flyTo(place));
    setStatus(`Показан населённый пункт: ${place.name}.`, 'success');
  });
  openBtn?.addEventListener('click', enterFullscreen); exitBtn?.addEventListener('click', exitFullscreen);
  document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && state.fullscreen) syncFullscreen(false); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && state.fullscreen && !document.fullscreenElement) exitFullscreen(); });

  const init = async () => {
    try {
      const [zones, regions, places, history] = await Promise.all([
        fetchJson('/data/zones.geojson'),
        fetchJson('/data/rf_regions.json').catch(() => ({ type: 'FeatureCollection', features: [] })),
        fetchJson('/data/map-places.json').catch(() => ({ places: [] })),
        fetchJson('/data/map-history/manifest.json').catch(() => ({ versions: [], generatedFrom: 'unavailable' }))
      ]);
      if (zones?.type !== 'FeatureCollection' || !Array.isArray(zones.features) || !zones.features.length) throw new Error('zones.geojson: нет геометрии');
      state.currentZones = zones; state.selectedZones = zones; state.currentUpdated = String(zones.updated || state.currentUpdated || '').trim(); state.regions = regions;
      if (updatedEl && state.currentUpdated) updatedEl.textContent = formatDate(state.currentUpdated);
      setupPlaces(places); setupHistory(history);
      state.initialCamera = cameraFromUrl();
      state.singleMap = await createMap('map', zones, { camera: state.initialCamera, fit: !state.initialCamera });
      state.engine = state.singleMap.kind; state.singleMap.onMove(updateUrl);
      if (state.engine === 'maplibre') setStatus('Русскоязычная векторная подложка загружена. Подписи без русской версии скрываются; ключевые ориентиры добавлены слоем KRM РФ.', 'success');

      const params = new URLSearchParams(location.search);
      const requested = params.get('snapshot');
      if (requested && recordByUpdated(requested) && requested !== state.currentUpdated) {
        if (snapshotSelect) snapshotSelect.value = requested;
        await selectSnapshot(requested);
        if (params.get('compare') === '1') await openCompare();
      } else updateUrl();
    } catch (error) {
      console.error('Карта KRM РФ:', error);
      if (updatedEl) updatedEl.textContent = updatedEl.dataset.fallback || 'Дата последнего подтверждённого обновления не установлена';
      setStatus('Не удалось запустить интерактивную карту. Текстовое описание и датированные оценки фронта остаются доступны.', 'error');
    }
  };

  init();
})();
