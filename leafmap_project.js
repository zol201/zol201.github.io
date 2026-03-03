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

/* =======================
   0.5) Mini Charts (no library)
======================= */

function ensureChartStyles() {
  if (document.getElementById('tarp-mini-chart-styles')) return;

  const style = document.createElement('style');
  style.id = 'tarp-mini-chart-styles';
  style.textContent = `
    .mini-chart{ margin: 10px 0 6px; }
    .mini-chart-title{ margin: 0 0 8px; font-weight: 700; font-size: 14px; color: #0f172a; }
    .mini-chart-sub{ margin: 0 0 10px; font-size: 12px; color: rgba(15,23,42,0.72); }

    .mini-bars{ display: grid; gap: 10px; }
    .mini-row{ display: grid; grid-template-columns: 150px 1fr 70px; gap: 10px; align-items: center; }

    .mini-label{ font-size: 12px; color: rgba(15,23,42,0.85); }
    .mini-track{ height: 10px; background: rgba(0,0,0,0.08); border-radius: 999px; overflow: hidden; }
    .mini-bar{ height: 100%; border-radius: 999px; }
    .mini-value{ font-size: 12px; text-align: right; color: rgba(15,23,42,0.75); }

    @media (max-width: 520px){
      .mini-row{ grid-template-columns: 1fr; gap: 6px; }
      .mini-value{ text-align: left; }
    }
  `;
  document.head.appendChild(style);
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
  if (!el) return; // Safe: do nothing if the container isn't in HTML yet

  ensureChartStyles();

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
  // 1) Reservoir storage capacity (billion gallons)
  renderMiniBarChart(
    'chart-reservoir-capacity',
    'Reservoir Storage Capacity',
    'Approx. storage (billion gallons).',
    [
      { label: 'Majewski', value: 0.35, valueLabel: '0.35 BG', color: '#0077ff' },
      { label: 'Thornton', value: 7.9, valueLabel: '7.9 BG', color: '#0077ff' },
      { label: 'McCook Stage 1', value: 3.5, valueLabel: '3.5 BG', color: '#0077ff' },
      { label: 'McCook Stage 2 (Est.)', value: 6.5, valueLabel: '6.5 BG', color: '#0077ff' },
    ]
  );

  // 2) Tunnel system length (illustrative; replace with your exact numbers if needed)
  renderMiniBarChart(
    'chart-tunnel-length',
    'Tunnel System Length',
    'Illustrative lengths (miles). Replace with your source values.',
    [
      { label: 'Upper Des Plaines', value: 35, valueLabel: '35 mi', color: '#db2870' },
      { label: 'Desplaines', value: 40, valueLabel: '40 mi', color: '#ffaa00' },
      { label: 'Culmet', value: 45, valueLabel: '45 mi', color: '#00c251' },
    ]
  );
}

/* =======================
   1) App Config
======================= */

const CONFIG = {
  map: {
    // Slightly shift center west (move map left visually)
    center: [41.8781, -87.5],
    zoom: 10,
    basemapUrl: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
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
      color: '#0000008e',
      weight: 1.5,
      opacity: 0.9,
    },

    reservoir: {
      radius: 8,
      fillColor: '#0077ff',
      color: '#003f88',
      weight: 1,
      opacity: 1,
      fillOpacity: 0.8,
    },

    wrp: {
      radius: 8,
      fillColor: '#ff4d4d',
      color: '#990000',
      weight: 1,
      opacity: 1,
      fillOpacity: 0.8,
    },

    fallbackPoint: {
      radius: 6,
      weight: 1,
      opacity: 1,
      fillOpacity: 0.6,
    },
  },

  legend: {
    position: 'topright',
    title: 'TARP Legend',
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

// Deterministic color from a string (stable color for each “system”)
function colorFromString(str) {
  if (!str) return '#666666';

  const s = str.toLowerCase();

  if (s.includes('upper')) return '#db2870';      // blue
  if (s.includes('des')) return '#ffaa00';        // green
  if (s.includes('calumet')) return '#00c251';    // purple

  return '#6b7280'; // fallback gray
}
/* =======================
   4) Legend
======================= */

function renderLegend(systems = []) {
  if (!legendDiv) return;

  const safeSystems = systems
    .filter(Boolean)
    .map((s) => String(s))
    .sort((a, b) => {
      // Priority order for tunnel systems in legend
      const order = ['Upper Des Plaines', 'Des Plaines', 'Calumet'];

      const idx = (name) => {
        const s = String(name).toLowerCase();
        const i = order.findIndex((k) => s.includes(k.toLowerCase()));
        return i === -1 ? 999 : i;
      };

      const ai = idx(a);
      const bi = idx(b);

      // If either is in the priority list, sort by that priority first
      if (ai !== 999 || bi !== 999) {
        if (ai !== bi) return ai - bi;
        return a.localeCompare(b);
      }

      // Otherwise alphabetical
      return a.localeCompare(b);
    });

  const systemsHtml = safeSystems
    .map((s) => {
      const lower = s.toLowerCase();

      let displayName = s;

      if (lower.includes('upper des')) {
        displayName = 'Upper Des Plaines';
      } else if (lower.includes('des')) {
        displayName = 'Desplaines';
      } else if (lower.includes('calumet')) {
        displayName = 'Culmet';
      }

      return `
        <div class="legend-item">
          <span class="legend-swatch" 
                style="display:inline-block;
                       width:26px;
                       height:4px;
                       background:${colorFromString(s)};
                       border-radius:2px;
                       margin-right:6px;"></span>
          ${escapeHtml(displayName)}
        </div>`;
    })
    .join('');
    // Static categories for WRPRES points (not based on “system”)
  legendDiv.innerHTML = `
    <div class="legend-title">${escapeHtml(CONFIG.legend.title)}</div>

    <div class="legend-item">
      <span class="legend-swatch" style="background:#0077ff; border-radius:50%;"></span>
      Reservoir
    </div>

    <div class="legend-item">
      <span class="legend-swatch" style="background:#ff4d4d; border-radius:50%;"></span>
      Water Reclamation Plant
    </div>

    <hr class="legend-sep">

    <div class="legend-item" style="font-weight:600;">Tunnel systems</div>

    ${systemsHtml || '<div class="legend-item"><em>Loading…</em></div>'}
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

  // Legend (top-right)
  legendControl = L.control({ position: CONFIG.legend.position });

  legendControl.onAdd = function () {
    legendDiv = L.DomUtil.create('div', 'legend');

    // Prevent legend interaction from affecting the map
    L.DomEvent.disableClickPropagation(legendDiv);
    L.DomEvent.disableScrollPropagation(legendDiv);

    // Initial legend content (updates after GeoJSON loads)
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

  // Group to hold all GeoJSON layers for combined zoom
  const group = L.featureGroup().addTo(map);

  // Collect unique “system” values for the legend
  const systemSet = new Set();

  // Style function for TARP_NEW features by the “system” field
  function tarpStyleBySystem(feature) {
    const system = feature?.properties?.system;
    return {
      color: colorFromString(system),
      weight: 3,
      opacity: 0.9,
    };
  }

  const loaders = urls.map((url) =>
    fetch(url)
      .then((r) => r.json())
      .then((data) => {
        const isWRPRES = url.includes('WRPRES.geojson');
        const isTARPNEW = url.includes('TARP_NEW.geojson');

        // Collect legend categories from TARP
        if (isTARPNEW && data && Array.isArray(data.features)) {
          data.features.forEach((f) => {
            const sys = f?.properties?.system;
            if (sys) systemSet.add(sys);
          });
        }

        const layer = L.geoJSON(data, {
          style: isTARPNEW ? tarpStyleBySystem : CONFIG.styles.defaultLine,

          // Only customize symbols for WRPRES points
          pointToLayer: function (feature, latlng) {
            if (!isWRPRES) {
              return L.circleMarker(latlng, CONFIG.styles.fallbackPoint);
            }

            const type = feature?.properties?.type;

            if (type === 'Reservoir') {
              return L.circleMarker(latlng, CONFIG.styles.reservoir);
            }

            if (type === 'WRP') {
              return L.circleMarker(latlng, CONFIG.styles.wrp);
            }

            // Default fallback
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
      // Zoom to the combined extent once all layers are loaded
      if (group.getLayers().length) {
        map.fitBounds(group.getBounds(), {
          padding: [20, 20],
        });
      }

      // Update legend using actual systems from TARP_NEW.geojson
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
  // Ensure collapse-content starts hidden (CSS also does this; safe fallback)
  const contents = document.getElementsByClassName('collapse-content');
  for (let c = 0; c < contents.length; c++) {
    contents[c].style.display = 'none';
  }

  // Wire up collapsible buttons
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

  // Hide all tab content sections
  for (let i = 0; i < tabcontent.length; i++) {
    tabcontent[i].style.display = 'none';
  }

  // Reset all tab button styles
  for (let i = 0; i < tablinks.length; i++) {
    tablinks[i].style.backgroundColor = '';
  }

  // Show the selected tab and mark the button active
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

  // Optional mini charts (only render if containers exist)
  renderTarpCharts();

  // Expose openPage globally if your HTML calls it via onclick="openPage(...)"
  window.openPage = openPage;
});
