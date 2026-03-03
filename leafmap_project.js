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

  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }

  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 70%, 45%)`;
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
          <span class="legend-swatch" style="background:${colorFromString(s)};"></span>
          ${escapeHtml(displayName)}
        </div>`;
    })
    .join('');

  legendDiv.innerHTML = `
    <div class="legend-title">${escapeHtml(CONFIG.legend.title)}</div>

    <div class="legend-item">
      <span class="legend-swatch" style="background:#0077ff; border-radius:50%;"></span>
      Reservoir
    </div>

    <div class="legend-item">
      <span class="legend-swatch" style="background:#ff4d4d; border-radius:50%;"></span>
      WRP
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

  // Expose openPage globally if your HTML calls it via onclick="openPage(...)"
  window.openPage = openPage;
});
