const map = L.map('map', {
  preferCanvas: true,
  attributionControl: true
});

const statusEl = document.getElementById('mapStatus');
const updatedEl = document.getElementById('mapUpdated');
const snapshotEl = document.getElementById('mapSnapshot');
const mapChangesEl = document.getElementById('mapChanges');

const setStatus = (message, level = 'info') => {
  if (!statusEl) return;
  statusEl.textContent = message || '';
  statusEl.dataset.level = level;
  statusEl.hidden = !message;
};

const tileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '© OpenStreetMap'
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
  if (!updatedEl) return;
  updatedEl.textContent = text || 'Дата последнего подтверждённого обновления не установлена';
};

const formatMapDate = value => {
  if (!value) return 'Дата последнего подтверждённого обновления не установлена';
  const normalized = String(value).trim().replace(' ', 'T');
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return String(value);
  const hasTime = /\d{1,2}:\d{2}/.test(String(value));
  const options = { day: 'numeric', month: 'long', year: 'numeric' };
  if (hasTime) {
    options.hour = '2-digit';
    options.minute = '2-digit';
  }
  return new Intl.DateTimeFormat('ru-RU', options).format(date).replace(' г.', ' года');
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
  const heading = mapChangesEl.querySelector('h2')?.textContent || 'Что изменилось на карте';
  mapChangesEl.textContent = '';
  appendText(mapChangesEl, 'h2', heading);

  const changes = Array.isArray(payload?.changes) ? payload.changes : [];
  if (!changes.length) {
    appendText(mapChangesEl, 'p', 'Журнал изменений карты пока не заполнен. При изменении data/zones.geojson добавьте запись в data/map-changes.json.');
    return;
  }

  const latest = changes[0];
  appendText(mapChangesEl, 'p', formatMapDate(latest.zonesUpdated || payload.updated || zonesUpdated), 'eyebrow');
  appendText(mapChangesEl, 'h3', latest.title || 'Последнее изменение карты');
  appendText(mapChangesEl, 'p', latest.summary || 'Краткое описание изменения не заполнено.');

  if (Array.isArray(latest.details) && latest.details.length) {
    const list = document.createElement('ul');
    for (const detail of latest.details.slice(0, 4)) appendText(list, 'li', detail);
    mapChangesEl.appendChild(list);
  }

  if (latest.relatedUrl && latest.relatedTitle) {
    const link = document.createElement('a');
    link.href = latest.relatedUrl;
    link.textContent = latest.relatedTitle;
    mapChangesEl.appendChild(link);
  }

  if (zonesUpdated && latest.zonesUpdated && String(latest.zonesUpdated) !== String(zonesUpdated)) {
    setStatus('Внимание: дата последнего изменения в data/map-changes.json не совпадает с updated в data/zones.geojson. Проверьте журнал карты.', 'warning');
  }
};

const loadMapChanges = async zonesUpdated => {
  if (!mapChangesEl) return;
  try {
    const response = await fetch('/data/map-changes.json', { cache: 'no-cache' });
    if (!response.ok) throw new Error(`map-changes.json: HTTP ${response.status}`);
    const payload = await response.json();
    renderMapChanges(payload, zonesUpdated);
  } catch (error) {
    console.error('Ошибка загрузки журнала изменений карты:', error);
    mapChangesEl.textContent = '';
    appendText(mapChangesEl, 'h2', 'Что изменилось на карте');
    appendText(mapChangesEl, 'p', 'Журнал изменений карты временно недоступен. Основная геометрия карты загружается из data/zones.geojson.');
  }
};

const getColor = name => {
  const normalized = String(name || '').toLowerCase();
  if (normalized.includes('russian')) return '#c44545';
  if (normalized.includes('ukrainian')) return '#0057b7';
  return '#0057b7';
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

const resolveZonesSource = async () => ({ url: '/data/zones.geojson', snapshot: null });

const loadZones = async () => {
  try {
    const source = await resolveZonesSource();
    const response = await fetch(source.url, { cache: 'no-cache' });
    if (!response.ok) throw new Error(`${source.url}: HTTP ${response.status}`);

    const lastModified = response.headers.get('Last-Modified');
    const data = await response.json();
    const zonesUpdated = data?.updated || source.snapshot?.validFrom || lastModified;
    setMapUpdated(formatMapDate(zonesUpdated));
    loadMapChanges(zonesUpdated);

    if (snapshotEl) {
      if (source.snapshot) {
        snapshotEl.hidden = false;
        snapshotEl.textContent = `Открыт архивный снимок: ${formatMapDate(source.snapshot.validFrom)}`;
      } else {
        snapshotEl.hidden = true;
        snapshotEl.textContent = '';
      }
    }

    zonesLayer.clearLayers();
    zonesOutlineShadow.clearLayers();
    zonesOutlineLayer.clearLayers();
    zonesLayer.addData(data);
    zonesOutlineShadow.addData(data);
    zonesOutlineLayer.addData(data);
    zonesOutlineShadow.bringToFront();
    zonesOutlineLayer.bringToFront();

    if (zonesLayer.getBounds().isValid()) {
      map.fitBounds(zonesLayer.getBounds(), { padding: [20, 20], maxZoom: 10 });
    }
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
    const response = await fetch('/data/rf_regions.json', { cache: 'no-cache' });
    if (!response.ok) throw new Error(`rf_regions.json: HTTP ${response.status}`);
    const data = await response.json();
    regionsBorderLayer.clearLayers();
    regionsBorderLayer.addData(data);
    regionsBorderLayer.bringToFront();
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
  if (wrapper) wrapper.classList.toggle('fullscreen', value);
  if (openBtn) {
    openBtn.setAttribute('aria-expanded', String(value));
    openBtn.setAttribute('aria-pressed', String(value));
  }
  if (exitBtn) {
    exitBtn.setAttribute('aria-expanded', String(value));
    exitBtn.setAttribute('aria-pressed', String(value));
  }
  setTimeout(() => map.invalidateSize(), 200);
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

loadZones();
loadRegions();
