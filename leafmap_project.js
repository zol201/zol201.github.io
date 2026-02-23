/* =========================================================
   leafmap_project.js
   - Initializes Leaflet map
   - Loads TARP GeoJSON
   - Controls UI: Tabs + Collapsible sections
   ========================================================= */

/* =======================
   0) Run when DOM is ready
   (safe for both local + GitHub Pages)
======================= */
function onReady(fn) {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", fn);
  } else {
    fn();
  }
}

/* =======================
   1) Leaflet Map Setup
======================= */
let map = null;

/* Explanation:
   initMap() creates the Leaflet map, adds a basemap, and sets the initial view.
   We keep it in a function so the file is easier to read and maintain.
*/
function initMap() {
  // Chicago center
  map = L.map("map").setView([41.8781, -87.6298], 11);

  // CARTO light basemap
  L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors ' +
      '&copy; <a href="https://carto.com/attributions">CARTO</a>',
  }).addTo(map);
}

/* =======================
   2) Data Layer: TARP GeoJSON
======================= */

/* Explanation:
   loadTarpLayers() fetches multiple GeoJSON files and adds them to the map.
   We add each GeoJSON to a featureGroup so we can zoom to the combined extent.
*/
function loadTarpLayers() {
  const urls = [
    "GGIS517/project/geoshape/TARP_NEW.geojson",
    "GGIS517/project/geoshape/WRPRES.geojson",
  ];

  // Group to hold all GeoJSON layers for combined zoom
  const group = L.featureGroup().addTo(map);

  // Default line style (used when we don't need categorical styling)
  const defaultLineStyle = {
    color: "#0055ff",
    weight: 3,
    opacity: 0.9,
  };

  // Deterministic color from a string (so each "system" gets a stable color)
  function colorFromString(str) {
    if (!str) return "#666666";
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue = Math.abs(hash) % 360;
    return `hsl(${hue}, 70%, 45%)`;
  }

  // Style function for TARP_NEW features by the "system" field
  function tarpStyleBySystem(feature) {
    const system = feature?.properties?.system;
    return {
      color: colorFromString(system),
      weight: 3,
      opacity: 0.9,
    };
  }

  Promise.all(
    urls.map((url) =>
      fetch(url)
        .then((r) => r.json())
        .then((data) => {
          // If this is WRPRES, attach popup using "name" field
          const isWRPRES = url.includes("WRPRES.geojson");
          const isTARPNEW = url.includes("TARP_NEW.geojson");

          const layer = L.geoJSON(data, {
            style: isTARPNEW ? tarpStyleBySystem : defaultLineStyle,

            // Only customize symbols for WRPRES points
            pointToLayer: function (feature, latlng) {
              if (!isWRPRES) {
                return L.circleMarker(latlng, {
                  radius: 6,
                  weight: 1,
                  opacity: 1,
                  fillOpacity: 0.6,
                });
              }

              const type = feature.properties?.type;

              // Reservoir = blue
              if (type === "Reservoir") {
                return L.circleMarker(latlng, {
                  radius: 8,
                  fillColor: "#0077ff",
                  color: "#003f88",
                  weight: 1,
                  opacity: 1,
                  fillOpacity: 0.8,
                });
              }

              // WRP = red
              if (type === "WRP") {
                return L.circleMarker(latlng, {
                  radius: 8,
                  fillColor: "#ff4d4d",
                  color: "#990000",
                  weight: 1,
                  opacity: 1,
                  fillOpacity: 0.8,
                });
              }

              // Default fallback
              return L.circleMarker(latlng);
            },

            onEachFeature: function (feature, layer) {
              if (isWRPRES && feature.properties && feature.properties.name) {
                layer.bindPopup(feature.properties.name);
              }
            },
          });

          layer.addTo(group);
          return layer;
        })
    )
  )
    .then(() => {
      // Zoom to combined bounds once all layers are loaded
      if (group.getLayers().length) {
        map.fitBounds(group.getBounds());
      }
    })
    .catch((error) => {
      console.error("Error loading GeoJSON layers:", error);
    });
}

/* =======================
   3) UI: Collapsible Sections
======================= */

/* Explanation:
   initCollapsibles() makes buttons with class="collapsible" expand/collapse
   the next sibling element (your <div class="collapse-content">).
*/
function initCollapsibles() {
  // Ensure collapse-content starts hidden (CSS also does this; this is a safe fallback)
  const contents = document.getElementsByClassName("collapse-content");
  for (let c = 0; c < contents.length; c++) {
    contents[c].style.display = "none";
  }

  // Wire up collapsible buttons
  const coll = document.getElementsByClassName("collapsible");
  for (let i = 0; i < coll.length; i++) {
    coll[i].setAttribute("aria-expanded", "false");

    coll[i].addEventListener("click", function () {
      this.classList.toggle("active");

      const content = this.nextElementSibling;
      if (!content) return;

      const isOpen = content.style.display === "block";
      content.style.display = isOpen ? "none" : "block";
      this.setAttribute("aria-expanded", isOpen ? "false" : "true");
    });
  }
}

/* =======================
   4) UI: Tabs
======================= */

/* Explanation:
   openPage(pageName, elmnt) hides all tabcontent blocks, then shows the selected one.
   - pageName: the id of the tab content <div> (e.g., "TARP", "MapDisplay")
   - elmnt: the clicked button element (used to apply active styling)
*/
function openPage(pageName, elmnt) {
  let i;
  const tabcontent = document.getElementsByClassName("tabcontent");
  const tablinks = document.getElementsByClassName("tablink");

  // Hide all tab content sections
  for (i = 0; i < tabcontent.length; i++) {
    tabcontent[i].style.display = "none";
  }

  // Reset all tab button styles
  for (i = 0; i < tablinks.length; i++) {
    tablinks[i].style.backgroundColor = "";
  }

  // Show the selected tab and mark the button active
  const target = document.getElementById(pageName);
  if (target) target.style.display = "block";
  if (elmnt) elmnt.style.backgroundColor = "#555";
}

/* Explanation:
   openDefaultTab() clicks the button with id="defaultOpen"
   so the right panel is not empty on first load.
*/
function openDefaultTab() {
  const defaultBtn = document.getElementById("defaultOpen");
  if (defaultBtn) defaultBtn.click();
}

/* =======================
   5) Initialize Everything
======================= */
onReady(function () {
  initMap();
  loadTarpLayers();

  initCollapsibles();
  openDefaultTab();
});
