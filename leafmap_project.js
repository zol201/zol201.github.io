

/* =======================
   Initialize Map
======================= */

var map = L.map('map').setView([41.8781, -87.6298], 11);  // Chicago center

L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; OpenStreetMap &copy; CARTO',
    subdomains: 'abcd',
    maxZoom: 20
}).addTo(map);


/* =======================
   Add Polyline Layer
======================= */

// Example coordinates (replace with your own GIS coordinates if needed)
var polylineCoordinates = [
    [41.8781, -87.6298],
    [41.8850, -87.6200],
    [41.8900, -87.6100]
];

// Create polyline
var polylineLayer = L.polyline(polylineCoordinates, {
    color: 'blue',
    weight: 4,
    opacity: 0.8
});

// Add polyline to map
polylineLayer.addTo(map);