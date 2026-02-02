// 1) Create the map (UIUC center)
const map = L.map('map').setView([40.1105, -88.2288], 14);

// 2) Base map layer
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

// 3) Path to your GeoJSON file
const GEOJSON_PATH = 'champaign_coffee_shops.geojson';

// Color by coffee shop type
function colorByType(type) {
  if (type === 'independent') return '#ffc800';   // yellow
  if (type === 'chain-local') return '#fb00d1';   // red
  return '#6C757D';                               // gray (default)
}

function popupHTML(props) {
  const name = props?.name ?? 'Unknown';
  const address = props?.address ?? '';
  const description = props?.description ?? '';
  const type = props?.type ?? '';

  return `
    <div style="line-height:1.25;">
      <div style="font-weight:700; font-size:14px;">${name}</div>
      ${type ? `<div style="opacity:.75; margin:4px 0;">Type: ${type}</div>` : ''}
      ${address ? `<div style="margin:4px 0;">${address}</div>` : ''}
      ${description ? `<div style="margin-top:6px;">${description}</div>` : ''}
    </div>
  `;
}

fetch(GEOJSON_PATH)
  .then((res) => {
    if (!res.ok) throw new Error(`Failed to load ${GEOJSON_PATH} (${res.status})`);
    return res.json();
  })
  .then((geojson) => {
    const layer = L.geoJSON(geojson, {
      pointToLayer: (feature, latlng) => {
        const type = feature?.properties?.type;
        const color = colorByType(type);

        // 1) Yellow halo (bigger) to increase visual salience
        const halo = L.circleMarker(latlng, {
          radius: 12,
          color: '#ffffff',
          weight: 2,
          fillColor: '#ffffff',
          fillOpacity: 0.7
        });

        // 2) Colored dot (on top)
        const dot = L.circleMarker(latlng, {
          radius: 10,
          color: '#1f1f1f',
          weight: 2,
          fillColor: color,
          fillOpacity: 0.95
        });

        // Attach a reference so we can bind popups reliably in onEachFeature
        const g = L.layerGroup([halo, dot]);
        g.__dot = dot;
        g.__halo = halo;
        return g;
      },
      onEachFeature: (feature, lyr) => {
        const html = popupHTML(feature.properties);

        // If this is our halo+dot group, bind to the dot so clicks open the popup reliably
        if (lyr && lyr.__dot) {
          lyr.__dot.bindPopup(html);
        } else if (lyr && typeof lyr.bindPopup === 'function') {
          // Fallback for normal single markers
          lyr.bindPopup(html);
        }
      }
    }).addTo(map);

    // =======================
    // Legend (coffee shop types)
    // =======================
    const legend = L.control({ position: 'bottomright' });

    legend.onAdd = function () {
      const div = L.DomUtil.create('div', 'legend');
      div.innerHTML = `
        <div class="legend-title">Coffee Shop Type</div>
        <div class="legend-item"><span class="legend-swatch" style="background:${colorByType('independent')}"></span>Independent</div>
        <div class="legend-item"><span class="legend-swatch" style="background:${colorByType('chain-local')}"></span>Chain (Local)</div>
      `;

      // Prevent map drag/zoom when interacting with the legend
      L.DomEvent.disableClickPropagation(div);
      L.DomEvent.disableScrollPropagation(div);
      return div;
    };

    legend.addTo(map);

    const bounds = layer.getBounds();
    if (bounds.isValid()) map.fitBounds(bounds.pad(0.2));
  })
  .catch((err) => {
    console.error(err);
    L.popup()
      .setLatLng(map.getCenter())
      .setContent(`Could not load <b>${GEOJSON_PATH}</b>. Check filename/path.`)
      .openOn(map);
  });