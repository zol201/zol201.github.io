// 1) Create the map (UIUC / Campustown as a reasonable default center)
const map = L.map('map').setView([40.1105, -88.2288], 14);

// 2) Base map layer
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

// 3) Path to your GeoJSON file
const GEOJSON_PATH = 'champaign_coffee_shops.geojson'; // <- change if your file is in /data


function popupHTML(props){
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
        return L.circleMarker(latlng, {
          radius: 7,
          color: '#2E86AB',
          weight: 2,
          fillColor: '#2E86AB',
          fillOpacity: 0.85
        });
      },
      onEachFeature: (feature, lyr) => {
        lyr.bindPopup(popupHTML(feature.properties));
      }
    }).addTo(map);

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