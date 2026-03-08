'use strict';

/* =========================================================
   leafmap_project.js
   - Initializes Leaflet map
   - Loads TARP GeoJSON layers
   - Controls UI: Tabs + Collapsible sections
   ========================================================= */

/* =======================
   0) Utilities
======================= */

// Run callback when DOM is ready (safe for both local + GitHub Pages)
function onReady(fn) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', fn);
  } else {
    fn();
  }
}

// Basic HTML escaping for dynamic strings injected into innerHTML
function escapeHtml(value) {
  const s = String(value ?? '');
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}


/**
 * Render a simple horizontal bar chart into a container.
 * - containerId: the target element id in HTML
 * - title: chart title
 * - subtitle: optional
 * - rows: [{ label, value, valueLabel, color }]
 */
function renderMiniBarChart(containerId, title, subtitle, rows) {
  const el = document.getElementById(containerId);

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
    'Approx. storage (billion gallons).',
    [
      { label: 'Majewski', value: 0.35, valueLabel: '0.35 BG', color: '#2F80ED' },
      { label: 'Thornton', value: 7.9, valueLabel: '7.9 BG', color: '#2F80ED' },
      { label: 'McCook Stage 1', value: 3.5, valueLabel: '3.5 BG', color: '#2F80ED' },
      { label: 'McCook Stage 2 (Est.)', value: 6.5, valueLabel: '6.5 BG', color: '#2F80ED' },
    ]
  );

  renderMiniBarChart(
    'chart-tunnel-length',
    'Tunnel System Length',
    'Illustrative lengths (miles). Replace with your source values.',
    [
      { label: 'Upper Des Plaines', value: 35, valueLabel: '35 mi', color: ' #7A4DA3' },
      { label: 'Des Plaines', value: 40, valueLabel: '40 mi', color: '#2C7FB8' },
      { label: 'Calumet', value: 45, valueLabel: '45 mi', color: '#4C9A5F' },
    ]
  );
}

/* =======================
   1) App Config
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
    tarpUrl: 'GGIS517/project/geoshape/TARP_NEW.geojson',
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
      fillColor: '#c65622',
      color: '#1F4E79',
      weight: 1.6,
      opacity: 1,
      fillOpacity: 0.9,
    },

    wrp: {
      radius: 11,
      fillColor: '#d44444',
      color: '#FFFFFF',
      weight: 1.5,
      opacity: 1,
      fillOpacity: 0.95,
    },

    fallbackPoint: {
      radius: 6,
      color: "#555",
      fillColor: "#888",
      weight: 1,
      opacity: 1,
      fillOpacity: 0.6,
    },
  },

  legend: {
    position: 'topright',
    title: 'TARP Infrastructure',
  },
};

/* =======================
   2) Global State
======================= */

let map = null;
let legendControl = null;
let legendDiv = null;

/* =======================
   3) Color Helpers
======================= */

// Stable color for each tunnel system
function colorFromString(str) {
  if (!str) return '#6b7280';

  const s = str.toLowerCase();

  if (s.includes('upper')) return '#7A4DA3';
  if (s.includes('des plaines') || s.includes('desplaines'))return '#2C7FB8';
  if (s.includes('calumet') || s === 'culmet' || s.includes('culmet')) return '#4C9A5F';

  return '#6b7280';
}

function normalizeSystemName(name) {
  const s = String(name ?? '').toLowerCase();

  if (s.includes('upper des')) return 'Upper Des Plaines';
  if (s.includes('des')) return 'Des Plaines';
  if (s.includes('calumet') || s.includes('culmet')) return 'Calumet';

  return String(name ?? '');
}

/* =======================
   4) Legend
======================= */

function renderLegend(systems = []) {
  if (!legendDiv) return;

  const safeSystems = systems
    .filter(Boolean)
    .map((s) => normalizeSystemName(s))
    .filter((value, index, array) => array.indexOf(value) === index)
    .sort((a, b) => {
      const order = ['Upper Des Plaines', 'Des Plaines', 'Calumet'];
      return order.indexOf(a) - order.indexOf(b);
    });

  const systemsHtml = safeSystems
    .map((s) => {
      return `
        <div class="legend-item">
          <span class="legend-line"
                style="display:inline-block;
                       width:36px;
                       height:4px;
                       background:${colorFromString(s)};
                       border-radius:2px;
                       margin-right:8px;
                       vertical-align:middle;"></span>
          <span>${escapeHtml(s)}</span>
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
        <span
          style="display:inline-block;
                 width:11px;
                 height:11px;
                 background:#555555;
                 border:1.5px solid #ffffff;
                 box-sizing:border-box;
                 margin-right:8px;
                 vertical-align:middle;"></span>
        <span>Water Reclamation Plant</span>
      </div>

      <div class="legend-item">
        <span
          style="display:inline-block;
                 width:9px;
                 height:9px;
                 background:#2F80ED;
                 border:1.5px solid #1F4E79;
                 border-radius:50%;
                 box-sizing:border-box;
                 margin-right:8px;
                 vertical-align:middle;"></span>
        <span>Reservoir</span>
      </div>
    </div>
  `;
}

/* =======================
   5) Map Initialization
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
   6) Data Layers
======================= */

function loadTarpLayers() {
  if (!map) return;

  const urls = [CONFIG.data.tarpUrl, CONFIG.data.wrpresUrl];
  const group = L.featureGroup().addTo(map);
  const systemSet = new Set();

  function tarpStyleBySystem(feature) {
    const system = feature?.properties?.system;
    return {
      color: colorFromString(system),
      weight: 4,
      opacity: 0.9,
    };
  }

  const loaders = urls.map((url) =>
  fetch(url)
      .then((r) => {
        if (!r.ok) {
          throw new Error("GeoJSON failed to load: " + url);
        }
        return r.json();
      })
      .then((data) => {
        const isWRPRES = url.includes('WRPRES.geojson');
        const isTARPNEW = url.includes('TARP_NEW.geojson');

        if (isTARPNEW && data && Array.isArray(data.features)) {
          data.features.forEach((f) => {
            const sys = f?.properties?.system;
            if (sys) systemSet.add(normalizeSystemName(sys));
          });
        }

        const layer = L.geoJSON(data, {
          style: isTARPNEW ? tarpStyleBySystem : CONFIG.styles.defaultLine,

          pointToLayer: function (feature, latlng) {
            if (!isWRPRES) {
              return L.circleMarker(latlng, CONFIG.styles.fallbackPoint);
            }

            const type = feature?.properties?.type?.toLowerCase();

            if (type === 'reservoir') {
              return L.circleMarker(latlng, CONFIG.styles.reservoir);
            }

            if (type === 'wrp') {
              return L.marker(latlng, {
                icon: L.divIcon({
                  className: 'wrp-square-icon',
                  iconSize: [14, 14],
                  iconAnchor: [7, 7],
                }),
              });
            }

            return L.circleMarker(latlng, CONFIG.styles.fallbackPoint);
          },

          onEachFeature: function (feature, layer) {
            if (isWRPRES && feature?.properties?.name) {
              layer.bindPopup(escapeHtml(feature.properties.name));
            }
          },
        });

        layer.addTo(group);
        return layer;
      })
  );

  Promise.all(loaders)
    .then(() => {
      if (group.getLayers().length) {
        map.fitBounds(group.getBounds(), {
          padding: [20, 20],
        });
      }

      renderLegend(Array.from(systemSet));
    })
    .catch((error) => {
      console.error('Error loading GeoJSON layers:', error);
    });
}

/* =======================
   7) UI: Collapsibles
======================= */

function initCollapsibles() {
  const contents = document.getElementsByClassName('collapse-content');
  for (let c = 0; c < contents.length; c++) {
    contents[c].style.display = 'none';
  }

  const coll = document.getElementsByClassName('collapsible');
  for (let i = 0; i < coll.length; i++) {
    coll[i].setAttribute('aria-expanded', 'false');

    coll[i].addEventListener('click', function () {
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
   8) UI: Tabs
======================= */

function openPage(pageName, elmnt) {
  const tabcontent = document.getElementsByClassName('tabcontent');
  const tablinks = document.getElementsByClassName('tablink');

  for (let i = 0; i < tabcontent.length; i++) {
    tabcontent[i].style.display = 'none';
  }

  for (let i = 0; i < tablinks.length; i++) {
    tablinks[i].style.backgroundColor = '';
  }

  const target = document.getElementById(pageName);
  if (target) target.style.display = 'block';
  if (elmnt) elmnt.style.backgroundColor = '#555';
}

function openDefaultTab() {
  const defaultBtn = document.getElementById('defaultOpen');
  if (defaultBtn) defaultBtn.click();
}

/* =======================
   9) Initialize Everything
======================= */

onReady(function () {
  initMap();
  loadTarpLayers();

  initCollapsibles();
  openDefaultTab();

  renderTarpCharts();

  window.openPage = openPage;
});