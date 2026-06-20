// ================= INIT MAP =================

const map = L.map("map", {
  preferCanvas: true,
  attributionControl: true
});

// ================= BASE LAYER =================

L.tileLayer(
  "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
  {
    maxZoom: 19,
    attribution: "© OpenStreetMap"
  }
).addTo(map);

// ================= UI: UPDATED LABEL =================

const updatedEl = document.getElementById("mapUpdated");

function setMapUpdated(text) {

  if (!updatedEl) return;

  updatedEl.textContent =
    text || "Дата последнего подтверждённого обновления не установлена";
}


function formatMapDate(value) {
  if (!value) return "Дата последнего подтверждённого обновления не установлена";
  const normalized = String(value).trim().replace(" ", "T");
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return String(value);
  const hasTime = /\d{1,2}:\d{2}/.test(String(value));
  const options = { day: "numeric", month: "long", year: "numeric" };
  if (hasTime) { options.hour = "2-digit"; options.minute = "2-digit"; }
  return new Intl.DateTimeFormat("ru-RU", options).format(date).replace(" г.", " года");
}

// ================= COLORS =================

function getColor(name) {

  if (!name) {
    return "#0057b7";
  }

  const n = String(name).toLowerCase();

  if (n.includes("russian")) {
    return "#c44545";
  }

  if (n.includes("ukrainian")) {
    return "#0057b7";
  }

  return "#0057b7";
}

// ================= ZONES =================

// заливка

const zonesLayer = L.geoJSON(null, {

  style: (feature) => ({

    stroke: false,

    fillColor: getColor(
      feature?.properties?.name
    ),

    fillOpacity: 0.40
  })

}).addTo(map);

// ================= OUTLINE =================

// тень

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

// основной контур

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

    const resp = await fetch(
      "../data/zones.geojson",
      {
        cache: "no-cache"
      }
    );

    if (!resp.ok) {
      throw new Error(
        `zones.geojson: HTTP ${resp.status}`
      );
    }

    const lastModified =
      resp.headers.get("Last-Modified");

    const data = await resp.json();

    // дата обновления
    const updated = data?.updated || lastModified;
    setMapUpdated(formatMapDate(updated));

    // очистка слоев
    zonesLayer.clearLayers();
    zonesOutlineShadow.clearLayers();
    zonesOutlineLayer.clearLayers();

    // заливка
    zonesLayer.addData(data);

    // контур
    zonesOutlineShadow.addData(data);
    zonesOutlineLayer.addData(data);

    // поднять контур выше
    zonesOutlineShadow.bringToFront();
    zonesOutlineLayer.bringToFront();

    // стартовый масштаб
    if (zonesLayer.getBounds().isValid()) {

      map.fitBounds(
        zonesLayer.getBounds(),
        {
          padding: [20, 20],
          maxZoom: 10
        }
      );
    }

  } catch (err) {

    console.error(
      "Ошибка загрузки карты:",
      err
    );

    setMapUpdated(updatedEl?.dataset?.fallback || "Дата последнего подтверждённого обновления не установлена");
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

// ================= LOAD REGIONS =================

async function loadRegions() {

  try {

    const resp = await fetch(
      "../data/rf_regions.json",
      {
        cache: "no-cache"
      }
    );

    if (!resp.ok) {
      throw new Error(
        `rf_regions.json: HTTP ${resp.status}`
      );
    }

    const data = await resp.json();

    regionsBorderLayer.clearLayers();

    regionsBorderLayer.addData(data);

    regionsBorderLayer.bringToFront();

  } catch (err) {

    console.error(
      "Ошибка загрузки границ:",
      err
    );
  }
}

loadRegions();

// ================= FULLSCREEN =================

const wrapper =
  document.getElementById("mapWrapper");

const openBtn =
  document.getElementById(
    "openFullscreenBtn"
  );

const exitBtn =
  document.getElementById(
    "exitFullscreenBtn"
  );

let isFullscreen = false;

function toggleFullScreen() {

  if (!wrapper) return;

  if (!isFullscreen) {

    if (wrapper.requestFullscreen) {

      wrapper.requestFullscreen()
        .catch(() => {});
    }

    wrapper.classList.add("fullscreen");

    isFullscreen = true;

  } else {

    if (document.fullscreenElement) {

      document.exitFullscreen()
        .catch(() => {});
    }

    wrapper.classList.remove("fullscreen");

    isFullscreen = false;
  }

  setTimeout(() => {
    map.invalidateSize();
  }, 200);
}

// кнопки

if (openBtn) {
  openBtn.addEventListener(
    "click",
    toggleFullScreen
  );
}

if (exitBtn) {
  exitBtn.addEventListener(
    "click",
    toggleFullScreen
  );
}

// выход через ESC

document.addEventListener(
  "fullscreenchange",
  () => {

    if (!document.fullscreenElement) {

      if (wrapper) wrapper.classList.remove(
        "fullscreen"
      );

      isFullscreen = false;

      setTimeout(() => {
        map.invalidateSize();
      }, 200);
    }
  }
);
