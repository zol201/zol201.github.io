'use strict';

/* =========================================================
   leafmap_project.js
   - Initializes Leaflet map
   - Loads TARP GeoJSON layers
   - Controls UI: tabs + collapsible sections
   - Renders simple charts and map legend
   ========================================================= */

/* =======================
   0) App Config
======================= */

const CONFIG = {
  map: {
    center: [41.8781, -87.5],
    zoom: 10,
    basemapUrl: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
    basemapAttribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors ' +
      '&copy; <a href="https://carto.com/attributions">CARTO</a>',
  },

  data: {
    tarpUrl: 'GGIS517/project/geoshape/TARP_NEW_4.geojson',
    wrpresUrl: 'GGIS517/project/geoshape/WRPRES.geojson',
  },

  styles: {
    defaultLine: {
      color: '#4b5563',
      weight: 4,
      opacity: 0.9,
    },

    reservoir: {
      radius: 8,
      fillColor: '#E6AB02',
      color: '#000000',
      weight: 1.6,
      opacity: 1,
      fillOpacity: 0.9,
    },

    wrpSquare: {
      size: 14,
      fillColor: '#8c510a',
      color: '#333333',
      weight: 1.5,
      opacity: 1,
      fillOpacity: 1,
    },
  },

  legend: {
    position: 'topright',
    title: 'TARP Infrastructure',
  },
};

/* =======================
   1) Global State
======================= */

let map = null;
let legendControl = null;
let legendDiv = null;
let allTarpLayersGroup = null;
const zoomTargets = {
  all: null,
  systems: {},
  facilities: {
    reservoir: null,
    wrp: null,
  },
};

/* =======================
   2) Utilities
======================= */

function onReady(fn) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', fn);
  } else {
    fn();
  }
}

function escapeHtml(value) {
  const s = String(value ?? '');
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/* =======================
   3) System Helpers
======================= */

function colorFromString(str) {
  if (!str) return '#6b7280';

  const s = String(str).toLowerCase().trim();

  if (s.includes('calumet') || s === 'system 4' || s === 'system4') return '#7550B3';
  if ((s.includes('des plaines') && !s.includes('upper')) || s === 'system 2' || s === 'system2') return '#1F78B4';
  if (s.includes('mainstream') || s === 'system 3' || s === 'system3') return '#1B9E77';
  if (s.includes('upper des plaines') || s === 'system 1' || s === 'system1') return '#D95F02';

  return '#6b7280';
}

function normalizeSystemName(name) {
  const s = String(name ?? '').toLowerCase();

  if (s.includes('calumet')) return 'System 4';
  if (s.includes('des plaines') && !s.includes('upper')) return 'System 2';
  if (s.includes('mainstream')) return 'System 3';
  if (s.includes('upper des plaines')) return 'System 1';

  return String(name ?? '');
}

function getSystemDisplayName(name) {
  const normalized = normalizeSystemName(name);

  if (normalized === 'System 4') return 'Calumet';
  if (normalized === 'System 2') return 'Des Plaines';
  if (normalized === 'System 3') return 'Mainstream';
  if (normalized === 'System 1') return 'Upper Des Plaines';

  return String(name ?? '');
}

function getSystemKey(name) {
  const normalized = normalizeSystemName(name);

  if (normalized === 'System 1') return 'system1';
  if (normalized === 'System 2') return 'system2';
  if (normalized === 'System 3') return 'system3';
  if (normalized === 'System 4') return 'system4';

  return null;
}

function ensureFeatureGroup(target) {
  return target ?? L.featureGroup();
}

function registerZoomTarget(feature, layer, isWRPRES) {
  if (!layer) return;

  zoomTargets.all = ensureFeatureGroup(zoomTargets.all);
  zoomTargets.all.addLayer(layer);

  if (isWRPRES) {
    const type = feature?.properties?.type?.toLowerCase();

    if (type === 'reservoir') {
      zoomTargets.facilities.reservoir = ensureFeatureGroup(zoomTargets.facilities.reservoir);
      zoomTargets.facilities.reservoir.addLayer(layer);
    }

    if (type === 'wrp') {
      zoomTargets.facilities.wrp = ensureFeatureGroup(zoomTargets.facilities.wrp);
      zoomTargets.facilities.wrp.addLayer(layer);
    }

    return;
  }

  const systemKey = getSystemKey(feature?.properties?.system);
  if (!systemKey) return;

  zoomTargets.systems[systemKey] = ensureFeatureGroup(zoomTargets.systems[systemKey]);
  zoomTargets.systems[systemKey].addLayer(layer);
}

function zoomToLayer(targetName = 'all') {
  if (!map) return;

  const key = String(targetName ?? 'all').toLowerCase();
  let targetLayer = null;

  if (key === 'all') {
    targetLayer = zoomTargets.all;
  } else if (zoomTargets.systems[key]) {
    targetLayer = zoomTargets.systems[key];
  } else if (zoomTargets.facilities[key]) {
    targetLayer = zoomTargets.facilities[key];
  }

  if (!targetLayer || !targetLayer.getLayers || targetLayer.getLayers().length === 0) {
    console.warn(`No zoom target found for: ${targetName}`);
    return;
  }

  map.fitBounds(targetLayer.getBounds(), { padding: [20, 20] });
}

function initZoomButtons() {
  const zoomButtons = document.querySelectorAll('[data-zoom-target]');

  zoomButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const target = button.getAttribute('data-zoom-target');
      zoomToLayer(target);
    });
  });
}

/* =======================
   4) Charts
======================= */

function renderMiniBarChart(containerId, title, subtitle, rows) {
  const el = document.getElementById(containerId);
  if (!el || !Array.isArray(rows) || rows.length === 0) return;

  const maxVal = Math.max(...rows.map((r) => r.value));
  const barsHtml = rows
    .map((r) => {
      const pct = maxVal ? Math.round((r.value / maxVal) * 100) : 0;
      return `
        <div class="mini-row">
          <div class="mini-label">${escapeHtml(r.label)}</div>
          <div class="mini-track">
            <div class="mini-bar" style="width:${pct}%; background:${r.color};"></div>
          </div>
          <div class="mini-value">${escapeHtml(r.valueLabel ?? String(r.value))}</div>
        </div>
      `;
    })
    .join('');

  el.innerHTML = `
    <div class="mini-chart" role="img" aria-label="${escapeHtml(title)}">
      <div class="mini-chart-title">${escapeHtml(title)}</div>
      ${subtitle ? `<div class="mini-chart-sub">${escapeHtml(subtitle)}</div>` : ''}
      <div class="mini-bars">${barsHtml}</div>
    </div>
  `;
}

function renderTarpCharts() {
  renderMiniBarChart(
    'chart-reservoir-capacity',
    'Reservoir Storage Capacity',
    'Storage capacity (billion gallons).',
    [
      { label: 'Majewski', value: 0.35, valueLabel: '0.35 BG', color: '#2F80ED' },
      { label: 'Thornton', value: 4.8, valueLabel: '4.8 BG', color: '#2F80ED' },
      { label: 'McCook', value: 10.0, valueLabel: '10.0 BG', color: '#2F80ED' },
    ]
  );

  renderMiniBarChart(
    'chart-tunnel-length',
    'Tunnel System Length',
    'Tunnel length (miles).',
    [
      { label: 'Calumet', value: 36.7, valueLabel: '36.7 mi', color: '#7A4DA3' },
      { label: 'Des Plaines', value: 26.6, valueLabel: '26.6 mi', color: '#2C7FB8' },
      { label: 'Mainstream', value: 40.5, valueLabel: '40.5 mi', color: '#4C9A5F' },
      { label: 'Upper Des Plaines', value: 6.6, valueLabel: '6.6 mi', color: '#C65622' },
    ]
  );
}

/* =======================
   5) Legend
======================= */

function getReservoirLegendStyle() {
  const s = CONFIG.styles.reservoir;
  const diameter = s.radius * 2;
  return `
    width:${diameter}px;
    height:${diameter}px;
    background:${s.fillColor};
    border:${s.weight}px solid ${s.color};
    border-radius:50%;
    box-sizing:border-box;
    opacity:${s.opacity};
  `;
}

function getWRPSquareStyle() {
  const s = CONFIG.styles.wrpSquare;
  return `
    width:${s.size}px;
    height:${s.size}px;
    background:${s.fillColor};
    border:${s.weight}px solid ${s.color};
    box-sizing:border-box;
    opacity:${s.opacity};
    border-radius:2px;
  `;
}

function getReservoirMarkerStyle() {
  const s = CONFIG.styles.reservoir;
  const diameter = s.radius * 2;
  return `
    width:${diameter}px;
    height:${diameter}px;
    background:${s.fillColor};
    border:${s.weight}px solid ${s.color};
    border-radius:50%;
    box-sizing:border-box;
    opacity:${s.opacity};
  `;
}

function renderLegend(systems = []) {
  if (!legendDiv) return;

  const safeSystems = systems
    .filter(Boolean)
    .map((s) => normalizeSystemName(s))
    .filter((value, index, array) => array.indexOf(value) === index)
    .sort((a, b) => {
      const order = ['System 1', 'System 2', 'System 3', 'System 4'];
      return order.indexOf(a) - order.indexOf(b);
    });

  const systemsHtml = safeSystems
    .map((s) => {
      const lineColor = colorFromString(s);
      return `
        <div class="legend-item">
          <span class="legend-line"
                style="display:inline-block;
                       width:36px;
                       height:4px;
                       background:${lineColor};
                       border-radius:2px;
                       margin-right:8px;
                       vertical-align:middle;"></span>
          <span>${escapeHtml(getSystemDisplayName(s))}</span>
        </div>`;
    })
    .join('');

  legendDiv.innerHTML = `
    <div class="legend-title">${escapeHtml(CONFIG.legend.title)}</div>

    <div class="legend-group" style="margin-top:8px;">
      <div class="legend-item" style="font-weight:600; margin-bottom:6px;">Tunnel systems</div>
      ${systemsHtml || '<div class="legend-item"><em>Loading…</em></div>'}
    </div>

    <hr class="legend-sep">

    <div class="legend-group">
      <div class="legend-item" style="font-weight:600; margin-bottom:6px;">Facilities</div>

      <div class="legend-item">
        <span style="display:inline-flex; align-items:center; justify-content:center; margin-right:8px; vertical-align:middle;">
          <span style="${getWRPSquareStyle()}"></span>
        </span>
        <span>Water Reclamation Plant</span>
      </div>

      <div class="legend-item">
        <span style="display:inline-flex; align-items:center; justify-content:center; margin-right:8px; vertical-align:middle;">
          <span style="${getReservoirLegendStyle()}"></span>
        </span>
        <span>Reservoir</span>
      </div>
    </div>
  `;
}

/* =======================
   6) Map Initialization
======================= */

function initMap() {
  map = L.map('map').setView(CONFIG.map.center, CONFIG.map.zoom);

  L.tileLayer(CONFIG.map.basemapUrl, {
    attribution: CONFIG.map.basemapAttribution,
  }).addTo(map);

  legendControl = L.control({ position: CONFIG.legend.position });

  legendControl.onAdd = function () {
    legendDiv = L.DomUtil.create('div', 'legend');

    L.DomEvent.disableClickPropagation(legendDiv);
    L.DomEvent.disableScrollPropagation(legendDiv);

    renderLegend([]);
    return legendDiv;
  };

  legendControl.addTo(map);
}

/* =======================
   7) Data Layers
======================= */

function getTarpLineStyle(feature) {
  const system = feature?.properties?.system;
  return {
    color: colorFromString(system),
    weight: 4,
    opacity: 0.9,
  };
}


function getPointLayer(feature, latlng, isWRPRES) {
  if (!isWRPRES) {
    return L.circleMarker(latlng, CONFIG.styles.fallbackPoint);
  }

  const type = feature?.properties?.type?.toLowerCase();

  if (type === 'reservoir') {
    const s = CONFIG.styles.reservoir;
    const diameter = s.radius * 2;

    return L.marker(latlng, {
      icon: L.divIcon({
        className: 'reservoir-circle-icon',
        iconSize: [diameter, diameter],
        iconAnchor: [diameter / 2, diameter / 2],
        html: `<div style="${getReservoirMarkerStyle()}"></div>`,
      }),
    });
  }

  if (type === 'wrp') {
    const s = CONFIG.styles.wrpSquare;

    return L.marker(latlng, {
      icon: L.divIcon({
        className: 'wrp-square-icon',
        iconSize: [s.size, s.size],
        iconAnchor: [s.size / 2, s.size / 2],
        html: `<div style="${getWRPSquareStyle()}"></div>`,
      }),
    });
  }

  return L.circleMarker(latlng, CONFIG.styles.fallbackPoint);
}

function bindFeaturePopup(feature, layer, isWRPRES) {
  if (isWRPRES && feature?.properties?.name) {
    layer.bindPopup(escapeHtml(feature.properties.name));
  }
}

function loadTarpLayers() {
  if (!map) return;

  const urls = [CONFIG.data.tarpUrl, CONFIG.data.wrpresUrl];
  const group = L.featureGroup().addTo(map);
  allTarpLayersGroup = group;
  const systemSet = new Set();

  const loaders = urls.map((url) =>
    fetch(url)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`GeoJSON failed to load: ${url}`);
        }
        return response.json();
      })
      .then((data) => {
        const isWRPRES = url.includes('WRPRES.geojson');
        const isTARPNEW = url.includes('TARP_NEW_4.geojson');

        if (isTARPNEW && Array.isArray(data?.features)) {
          data.features.forEach((feature) => {
            const system = feature?.properties?.system;
            if (system) systemSet.add(normalizeSystemName(system));
          });
        }

        const layer = L.geoJSON(data, {
          style: isTARPNEW ? getTarpLineStyle : CONFIG.styles.defaultLine,
          pointToLayer: (feature, latlng) => getPointLayer(feature, latlng, isWRPRES),
          onEachFeature: (feature, featureLayer) => {
            bindFeaturePopup(feature, featureLayer, isWRPRES);
            registerZoomTarget(feature, featureLayer, isWRPRES);
          },
        });

        layer.addTo(group);
        return layer;
      })
  );

  Promise.all(loaders)
    .then(() => {
      if (group.getLayers().length) {
        zoomToLayer('all');
      }

      renderLegend(Array.from(systemSet));
    })
    .catch((error) => {
      console.error('Error loading GeoJSON layers:', error);
    });
}

/* =======================
   8) UI: Collapsibles
======================= */

function initCollapsibles() {
  const contents = document.getElementsByClassName('collapse-content');
  for (let i = 0; i < contents.length; i++) {
    contents[i].style.display = 'none';
  }

  const collapsibles = document.getElementsByClassName('collapsible');
  for (let i = 0; i < collapsibles.length; i++) {
    collapsibles[i].setAttribute('aria-expanded', 'false');

    collapsibles[i].addEventListener('click', function () {
      this.classList.toggle('active');

      const content = this.nextElementSibling;
      if (!content) return;

      const isOpen = content.style.display === 'block';
      content.style.display = isOpen ? 'none' : 'block';
      this.setAttribute('aria-expanded', isOpen ? 'false' : 'true');
    });
  }
}

/* =======================
   9) UI: Tabs
======================= */

function openPage(pageName, elmnt) {
  const tabcontent = document.getElementsByClassName('tabcontent');
  const tablinks = document.getElementsByClassName('tablink');

  for (let i = 0; i < tabcontent.length; i++) {
    tabcontent[i].style.display = 'none';
  }

  for (let i = 0; i < tablinks.length; i++) {
    tablinks[i].classList.remove('active');
  }

  const target = document.getElementById(pageName);
  if (target) target.style.display = 'block';
  if (elmnt) elmnt.classList.add('active');
}

function openDefaultTab() {
  const defaultBtn = document.getElementById('defaultOpen');
  if (defaultBtn) defaultBtn.click();
}

/* =======================
   10) App Start
======================= */

onReady(function () {
  initMap();
  loadTarpLayers();
  initCollapsibles();
  openDefaultTab();
  renderTarpCharts();
  initZoomButtons();

  window.openPage = openPage;
  window.zoomToLayer = zoomToLayer;
});