// ================= INIT MAP =================

const map = L.map("map", {
  preferCanvas: true,
  attributionControl: true
});

// Базовый слой
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: "© OpenStreetMap"
}).addTo(map);

// ================= UI: UPDATED LABEL =================

const updatedEl = document.getElementById("mapUpdated");

function setMapUpdated(text) {
  if (!updatedEl) return;
  updatedEl.textContent = `Обновлено: ${text || "-"}`;
}

// ================= COLORS =================

function getColor(name) {
  if (!name) return "#0057b7";
  const n = String(name).toLowerCase();
  if (n.includes("russian")) return "#c44545";
  if (n.includes("ukrainian")) return "#0057b7";
  return "#0057b7";
}

// ================= ZONES =================

// Заливка
const zonesLayer = L.geoJSON(null, {
  style: (feature) => ({
    stroke: false,
    fillColor: getColor(feature?.properties?.name),
    fillOpacity: 0.40
  })
}).addTo(map);

// ВНЕШНИЙ КРАСИВЫЙ КОНТУР

// Подложка (мягкая тень)
const zonesOutlineShadow = L.geoJSON(null, {
  interactive: false,
  style: {
    color: "#000",
    weight: 6,
    opacity: 0.20,
    lineCap: "round",
    lineJoin: "round",
    fill: false
  }
}).addTo(map);

// Основной контур
const zonesOutlineLayer = L.geoJSON(null, {
  interactive: false,
  style: {
    color: "#6e1111",
    weight: 2.2,
    opacity: 0.95,
    lineCap: "round",
    lineJoin: "round",
    fill: false
  }
}).addTo(map);

// ================= LOAD ZONES =================

async function loadZones() {
  try {
    // Грузим zones.geojson без кэша + добавляем ?ts=..., чтобы Cloudflare/браузер меньше держали старую версию
    const url = `../data/zones.geojson?ts=${Date.now()}`;
    const resp = await fetch(url, { cache: "no-store" });
    if (!resp.ok) throw new Error(`zones.geojson: HTTP ${resp.status}`);

    // Fallback (может быть неточным на CDN)
    const lastModified = resp.headers.get("Last-Modified");

    const data = await resp.json();

    // "Правдивая" дата - та, что ты сам записал в zones.geojson (поле updated)
    const updated = data?.updated || lastModified || "-";
    setMapUpdated(updated);

    zonesLayer.addData(data);

    // тот же geojson в контур
    zonesOutlineShadow.addData(data);
    zonesOutlineLayer.addData(data);

    // поднимаем контур выше заливки
    zonesOutlineShadow.bringToFront();
    zonesOutlineLayer.bringToFront();

    // Стартовый масштаб
    if (zonesLayer.getBounds().isValid()) {
      map.fitBounds(zonesLayer.getBounds(), {
        padding: [20, 20],
        maxZoom: 10
      });
    }
  } catch (err) {
    console.error(err);
    setMapUpdated("ошибка загрузки");
  }
}

loadZones();

// ================= REGIONS BORDERS =================

const regionsBorderLayer = L.geoJSON(null, {
  interactive: false,
  style: {
    color: "#2f63c7",
    weight: 1.2,
    opacity: 0.9,
    lineCap: "round",
    lineJoin: "round",
    fillOpacity: 0
  }
}).addTo(map);

fetch("../data/rf_regions.json")
  .then(r => r.json())
  .then(data => {
    regionsBorderLayer.addData(data);
    regionsBorderLayer.bringToFront();
  })
  .catch(console.error);

// ================= FULLSCREEN =================

const wrapper = document.getElementById("mapWrapper");
const openBtn = document.getElementById("openFullscreenBtn");
const exitBtn = document.getElementById("exitFullscreenBtn");

let isFullscreen = false;

function toggleFullScreen() {
  if (!isFullscreen) {
    if (wrapper.requestFullscreen) {
      wrapper.requestFullscreen().catch(() => {});
    }
    wrapper.classList.add("fullscreen");
    isFullscreen = true;
  } else {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
    wrapper.classList.remove("fullscreen");
    isFullscreen = false;
  }

  setTimeout(() => map.invalidateSize(), 200);
}

openBtn.addEventListener("click", toggleFullScreen);
exitBtn.addEventListener("click", toggleFullScreen);

document.addEventListener("fullscreenchange", () => {
  if (!document.fullscreenElement) {
    wrapper.classList.remove("fullscreen");
    isFullscreen = false;
    setTimeout(() => map.invalidateSize(), 200);
  }
});
