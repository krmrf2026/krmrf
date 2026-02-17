// Инициализация карты
const map = L.map("map", {
  preferCanvas: true,
  attributionControl: true
});

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: "© OpenStreetMap"
}).addTo(map);

function getColor(name) {
  if (!name) return "#0057b7";
  const n = String(name).toLowerCase();
  if (n.includes("russian")) return "#c44545";
  if (n.includes("ukrainian")) return "#0057b7";
  return "#0057b7";
}

const zonesLayer = L.geoJSON(null, {
  style: (feature) => ({
    stroke: false,
    fillColor: getColor(feature?.properties?.name),
    fillOpacity: 0.45
  })
}).addTo(map);

fetch("../data/zones.geojson")
  .then((r) => r.json())
  .then((data) => {
    zonesLayer.addData(data);
    if (zonesLayer.getBounds().isValid()) {
      map.fitBounds(zonesLayer.getBounds());
    }
  })
  .catch(() => {});

const regionsBorderLayer = L.geoJSON(null, {
  style: {
    color: "#4a0d0d",
    weight: 2.8,
    opacity: 0.95,
    fillOpacity: 0
  }
}).addTo(map);

fetch("../data/rf_regions.json")
  .then((r) => r.json())
  .then((data) => {
    regionsBorderLayer.addData(data);
    regionsBorderLayer.bringToFront();
  })
  .catch(() => {});

// === Fullscreen ===

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
