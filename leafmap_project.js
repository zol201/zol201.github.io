
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
   loadTarpLayer() fetches the GeoJSON and adds it as a styled Leaflet layer.
   After adding, it zooms the map to the layer’s extent.
*/
function loadTarpLayer() {
  fetch("GGIS517/project/geoshape/TARP.geojson")
    .then((response) => response.json())
    .then((data) => {
      const tarpLayer = L.geoJSON(data, {
        style: {
          color: "#0055ff",
          weight: 3,
          opacity: 0.9,
        },
      }).addTo(map);

      // Zoom to the GeoJSON extent
      map.fitBounds(tarpLayer.getBounds());
    })
    .catch((error) => {
      console.error("Error loading TARP GeoJSON:", error);
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
  loadTarpLayer();

  initCollapsibles();
  openDefaultTab();
});
