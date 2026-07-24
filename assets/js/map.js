(() => {
  'use strict';

  const statusEl = document.getElementById('mapStatus');
  const updatedEl = document.getElementById('mapUpdated');
  const mapChangesEl = document.getElementById('mapChanges');

  const setStatus = (message, level = 'info') => {
    if (!statusEl) return;
    statusEl.textContent = message || '';
    statusEl.dataset.level = level;
    statusEl.hidden = !message;
  };

  if (!window.L) {
    setStatus('Не удалось запустить интерактивную карту. Используйте текстовое описание и раздел оценок фронта.', 'error');
    return;
  }

  const map = L.map('map', {
    preferCanvas: true,
    attributionControl: true,
    zoomControl: true
  });

  const tileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© <a href="https://www.openstreetmap.org/copyright" rel="noopener">OpenStreetMap</a>'
  });

  let tileErrorShown = false;
  tileLayer.on('tileerror', () => {
    if (tileErrorShown) return;
    tileErrorShown = true;
    setStatus('Фоновая подложка OpenStreetMap временно недоступна. Оценочная зона и текстовые пояснения остаются доступными.', 'warning');
  });
  tileLayer.on('load', () => {
    if (tileErrorShown) setStatus('Фоновая подложка OpenStreetMap снова доступна.', 'success');
    tileErrorShown = false;
  });
  tileLayer.addTo(map);

  const setMapUpdated = text => {
    if (updatedEl) updatedEl.textContent = text || 'Дата последнего подтверждённого обновления не установлена';
  };

  const formatMapDate = value => {
    if (!value) return 'Дата последнего подтверждённого обновления не установлена';
    const normalized = String(value).trim().replace(' ', 'T');
    const date = new Date(normalized);
    if (Number.isNaN(date.getTime())) return String(value);
    const options = { day: 'numeric', month: 'long', year: 'numeric' };
    if (/\d{1,2}:\d{2}/.test(String(value))) {
      options.hour = '2-digit';
      options.minute = '2-digit';
    }
    return new Intl.DateTimeFormat('ru-RU', options).format(date).replace(' г.', ' года');
  };

  const fetchJson = async url => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch(url, {
        credentials: 'same-origin',
        signal: controller.signal
      });
      if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
      return { data: await response.json(), lastModified: response.headers.get('Last-Modified') };
    } finally {
      clearTimeout(timer);
    }
  };

  const appendText = (parent, tagName, text, className = '') => {
    const element = document.createElement(tagName);
    if (className) element.className = className;
    element.textContent = text;
    parent.appendChild(element);
    return element;
  };

  const renderMapChanges = (payload, zonesUpdated = '') => {
    if (!mapChangesEl) return;
    mapChangesEl.replaceChildren();
    appendText(mapChangesEl, 'h2', 'Что изменилось на карте');
    const changes = Array.isArray(payload?.changes) ? payload.changes : [];
    if (!changes.length) {
      appendText(mapChangesEl, 'p', 'Описание последнего обновления карты пока не заполнено.');
      return;
    }

    const latest = changes[0];
    appendText(mapChangesEl, 'p', formatMapDate(latest.zonesUpdated || payload.updated || zonesUpdated), 'eyebrow');
    appendText(mapChangesEl, 'h3', latest.title || 'Последнее изменение карты');
    appendText(mapChangesEl, 'p', latest.summary || 'Краткое описание изменения не заполнено.');

    if (Array.isArray(latest.details) && latest.details.length) {
      const list = document.createElement('ul');
      latest.details.slice(0, 4).forEach(detail => appendText(list, 'li', detail));
      mapChangesEl.appendChild(list);
    }
    if (latest.relatedUrl && latest.relatedTitle) {
      const paragraph = document.createElement('p');
      const link = document.createElement('a');
      link.href = latest.relatedUrl;
      link.textContent = latest.relatedTitle;
      paragraph.appendChild(link);
      mapChangesEl.appendChild(paragraph);
    }

    if (zonesUpdated && latest.zonesUpdated && String(latest.zonesUpdated) !== String(zonesUpdated)) {
      setStatus('Дата журнала изменений не совпадает с датой карты. Редакции необходимо проверить обновление.', 'warning');
    }
  };

  const loadMapChanges = async zonesUpdated => {
    if (!mapChangesEl) return;
    try {
      const { data } = await fetchJson('/data/map-changes.json');
      renderMapChanges(data, zonesUpdated);
    } catch (error) {
      console.error('Ошибка загрузки журнала изменений карты:', error);
      // The build embeds a complete static fallback, so it remains visible.
    }
  };

  const getColor = name => {
    const normalized = String(name || '').toLowerCase();
    if (normalized.includes('russian')) return '#c44545';
    if (normalized.includes('ukrainian')) return '#2563a8';
    if (normalized.includes('contested') || normalized.includes('disputed')) return '#b7791f';
    return '#6b7280';
  };

  const zonesLayer = L.geoJSON(null, {
    style: feature => ({
      stroke: false,
      fillColor: getColor(feature?.properties?.name),
      fillOpacity: 0.40
    })
  }).addTo(map);

  const zonesOutlineShadow = L.geoJSON(null, {
    interactive: false,
    style: {
      color: '#000', weight: 6, opacity: 0.20,
      lineCap: 'round', lineJoin: 'round', fill: false
    }
  }).addTo(map);

  const zonesOutlineLayer = L.geoJSON(null, {
    interactive: false,
    style: {
      color: '#6e1111', weight: 2.2, opacity: 0.95,
      lineCap: 'round', lineJoin: 'round', fill: false
    }
  }).addTo(map);

  const loadZones = async () => {
    try {
      const { data, lastModified } = await fetchJson('/data/zones.geojson');
      if (data?.type !== 'FeatureCollection' || !Array.isArray(data.features)) {
        throw new Error('zones.geojson: ожидается FeatureCollection');
      }
      const zonesUpdated = data.updated || lastModified;
      setMapUpdated(formatMapDate(zonesUpdated));
      loadMapChanges(zonesUpdated);

      zonesLayer.clearLayers().addData(data);
      zonesOutlineShadow.clearLayers().addData(data);
      zonesOutlineLayer.clearLayers().addData(data);
      zonesOutlineShadow.bringToFront();
      zonesOutlineLayer.bringToFront();

      const bounds = zonesLayer.getBounds();
      if (bounds.isValid()) map.fitBounds(bounds, { padding: [20, 20], maxZoom: 10, animate: false });
    } catch (error) {
      console.error('Ошибка загрузки карты:', error);
      setMapUpdated(updatedEl?.dataset?.fallback || 'Дата последнего подтверждённого обновления не установлена');
      setStatus('Не удалось загрузить данные карты. Используйте текстовую альтернативу и датированные оценки фронта.', 'error');
    }
  };

  const regionsBorderLayer = L.geoJSON(null, {
    interactive: false,
    style: {
      color: '#2f63c7', weight: 1.2, opacity: 0.9,
      lineCap: 'round', lineJoin: 'round', fillOpacity: 0
    }
  }).addTo(map);

  const loadRegions = async () => {
    try {
      const { data } = await fetchJson('/data/rf_regions.json');
      if (data?.type !== 'FeatureCollection' || !Array.isArray(data.features)) {
        throw new Error('rf_regions.json: ожидается FeatureCollection');
      }
      regionsBorderLayer.clearLayers().addData(data).bringToFront();
    } catch (error) {
      console.error('Ошибка загрузки административных границ:', error);
      setStatus('Слой административных границ временно недоступен. Оценочная зона загружается отдельно.', 'warning');
    }
  };

  const wrapper = document.getElementById('mapWrapper');
  const openBtn = document.getElementById('openFullscreenBtn');
  const exitBtn = document.getElementById('exitFullscreenBtn');
  let isFullscreen = false;

  const syncFullscreenState = value => {
    isFullscreen = value;
    wrapper?.classList.toggle('fullscreen', value);
    openBtn?.setAttribute('aria-expanded', String(value));
    openBtn?.setAttribute('aria-pressed', String(value));
    exitBtn?.setAttribute('aria-expanded', String(value));
    exitBtn?.setAttribute('aria-pressed', String(value));
    setTimeout(() => map.invalidateSize(), 150);
  };

  const enterFullscreen = async () => {
    if (!wrapper || isFullscreen) return;
    try {
      if (wrapper.requestFullscreen) await wrapper.requestFullscreen();
    } catch {
      // CSS fullscreen remains available when the browser API is blocked.
    }
    syncFullscreenState(true);
  };

  const exitFullscreen = async () => {
    if (!wrapper || !isFullscreen) return;
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
    } catch {
      // The CSS state is still cleared below.
    }
    syncFullscreenState(false);
    openBtn?.focus();
  };

  openBtn?.addEventListener('click', enterFullscreen);
  exitBtn?.addEventListener('click', exitFullscreen);
  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement && isFullscreen) syncFullscreenState(false);
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && isFullscreen && !document.fullscreenElement) exitFullscreen();
  });

  Promise.allSettled([loadZones(), loadRegions()]);
})();
