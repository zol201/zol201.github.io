'use strict';

/* ===================== CONFIG ===================== */
const CONFIG = {
  map: {
    center: [41.8781, -87.5],
    zoom: 10,
    basemapUrl: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
    basemapAttribution:
      '&copy; OpenStreetMap contributors &copy; CARTO',
  },

  data: {
    tarpUrl: 'GGIS517/project/geoshape/TARP_NEW_4.geojson',
    wrpresUrl: 'GGIS517/project/geoshape/WRPRES.geojson',
  },

  styles: {
    reservoir: {
      radius: 8,
      fillColor: '#E6AB02',
      color: '#000000',
      weight: 1.6,
    },

    wrp: {
      size: 14,
      fillColor: '#8c510a',
      color: '#333333',
      weight: 1.5,
    },
  },
};

/* ===================== GLOBAL ===================== */
let map;
let zoomTargets = {
  all: null,
  system1: null,
  system2: null,
  system3: null,
  system4: null,
};

/* ===================== INIT ===================== */
document.addEventListener('DOMContentLoaded', () => {
  initMap();
  loadLayers();
  initTabs();
  initCollapsible();
  initZoomButtons();
  renderCharts();

  document.getElementById("defaultOpen").click();
});

/* ===================== MAP ===================== */
function initMap() {
  map = L.map('map').setView(CONFIG.map.center, CONFIG.map.zoom);

  L.tileLayer(CONFIG.map.basemapUrl, {
    attribution: CONFIG.map.basemapAttribution,
  }).addTo(map);
}

/* ===================== LOAD DATA ===================== */
function loadLayers() {
  const group = L.featureGroup().addTo(map);

  fetch(CONFIG.data.tarpUrl)
    .then(res => res.json())
    .then(data => {
      const tarpLayer = L.geoJSON(data, {
        style: feature => ({
          color: getSystemColor(feature.properties.system),
          weight: 4,
        }),
        onEachFeature: registerZoom,
      });

      tarpLayer.addTo(group);
      return fetch(CONFIG.data.wrpresUrl);
    })
    .then(res => res.json())
    .then(data => {
      const wrpLayer = L.geoJSON(data, {
        pointToLayer: createPoint,
        onEachFeature: registerZoom,
      });

      wrpLayer.addTo(group);

      if (group.getLayers().length) {
        map.fitBounds(group.getBounds());
      }
    });
}

/* ===================== STYLE ===================== */
function getSystemColor(system) {
  const s = String(system).toLowerCase();

  if (s.includes('upper')) return '#D95F02';
  if (s.includes('des plaines') && !s.includes('upper')) return '#1F78B4';
  if (s.includes('mainstream')) return '#1B9E77';
  if (s.includes('calumet')) return '#7550B3';

  return '#999';
}

/* ===================== POINT ===================== */
function createPoint(feature, latlng) {
  const type = feature.properties.type;

  if (type === 'reservoir') {
    return L.circleMarker(latlng, {
      radius: CONFIG.styles.reservoir.radius,
      fillColor: CONFIG.styles.reservoir.fillColor,
      color: CONFIG.styles.reservoir.color,
      weight: CONFIG.styles.reservoir.weight,
      fillOpacity: 0.9,
    });
  }

  return L.marker(latlng, {
    icon: L.divIcon({
      html: `<div style="
        width:${CONFIG.styles.wrp.size}px;
        height:${CONFIG.styles.wrp.size}px;
        background:${CONFIG.styles.wrp.fillColor};
        border:${CONFIG.styles.wrp.weight}px solid ${CONFIG.styles.wrp.color};
      "></div>`,
    }),
  });
}

/* ===================== ZOOM ===================== */
function registerZoom(feature, layer) {
  if (!zoomTargets.all) zoomTargets.all = L.featureGroup();
  zoomTargets.all.addLayer(layer);

  const system = feature.properties.system;

  if (system?.includes("Upper")) addTo("system1", layer);
  else if (system?.includes("Des Plaines")) addTo("system2", layer);
  else if (system?.includes("Mainstream")) addTo("system3", layer);
  else if (system?.includes("Calumet")) addTo("system4", layer);
}

function addTo(key, layer) {
  if (!zoomTargets[key]) zoomTargets[key] = L.featureGroup();
  zoomTargets[key].addLayer(layer);
}

function zoomTo(target) {
  const layer = zoomTargets[target];
  if (layer) map.fitBounds(layer.getBounds());
}

function initZoomButtons() {
  document.querySelectorAll("[data-zoom-target]").forEach(btn => {
    btn.addEventListener("click", () => {
      zoomTo(btn.dataset.zoomTarget);
    });
  });
}

/* ===================== TABS ===================== */
function initTabs() {
  window.openPage = function (name, elm) {
    document.querySelectorAll(".tabcontent").forEach(t => t.style.display = "none");
    document.querySelectorAll(".tablink").forEach(t => t.classList.remove("active"));

    document.getElementById(name).style.display = "block";
    elm.classList.add("active");
  };
}

/* ===================== COLLAPSIBLE ===================== */
function initCollapsible() {
  document.querySelectorAll(".collapsible").forEach(btn => {
    btn.addEventListener("click", function () {
      this.classList.toggle("active");

      const content = this.nextElementSibling;
      content.style.display = content.style.display === "block" ? "none" : "block";
    });
  });
}

/* ===================== CHART ===================== */
function renderCharts() {
  renderBar("chart-reservoir-capacity", [
    { label: "Majewski", value: 0.35 },
    { label: "Thornton", value: 4.8 },
    { label: "McCook", value: 10 },
  ]);

  renderBar("chart-tunnel-length", [
    { label: "Upper", value: 6.6 },
    { label: "Des Plaines", value: 26.6 },
    { label: "Mainstream", value: 40.5 },
    { label: "Calumet", value: 36.7 },
  ]);
}

function renderBar(id, data) {
  const el = document.getElementById(id);
  if (!el) return;

  const max = Math.max(...data.map(d => d.value));

  el.innerHTML = data.map(d => `
    <div style="display:flex;align-items:center;margin:6px 0;">
      <div style="width:120px">${d.label}</div>
      <div style="flex:1;background:#ddd;height:10px;">
        <div style="width:${(d.value / max) * 100}%;background:#4CAF50;height:100%;"></div>
      </div>
    </div>
  `).join("");
}