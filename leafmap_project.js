/* ======================= Initialize ======================= */

var map = L.map('map').setView([41.8781, -87.6298], 11);  // Chicago center

L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
}).addTo(map);

/* =======================
   Add TARP GeoJSON Layer
======================= */

fetch("GGIS517/project/geoshape/TARP.geojson")
  .then(response => response.json())
  .then(data => {
      var tarpLayer = L.geoJSON(data, {
          style: {
              color: "#0055ff",
              weight: 3,
              opacity: 0.9
          }
      }).addTo(map);

      // Automatically zoom to TARP extent
      map.fitBounds(tarpLayer.getBounds());
  })
  .catch(error => {
      console.error("Error loading TARP GeoJSON:", error);
  });