/* =========================================================
   assign4.js
   - Initializes Leaflet map
   - Loads current GeoJSON used now (Top10cities.json)
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

function initMap() {
  // Slightly shift center west (move map left visually)
  map = L.map("map").setView([41.8781, -87.67], 11);

  // CARTO light basemap
  L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors ' +
      '&copy; <a href="https://carto.com/attributions">CARTO</a>',
  }).addTo(map);
}

/* =======================
   2) Data Layer: Top10cities
======================= */

// Loads the only GeoJSON you are using right now
function loadTop10Cities() {
  const url = "GGIS517/assignment4/Top10cities.json";

  // Style used for line/polygon features (points handled below)
  const defaultStyle = {
    color: "#0055ff",
    weight: 3,
    opacity: 0.9,
    fillOpacity: 0.15,
  };

  fetch(url)
    .then((r) => r.json())
    .then((data) => {
      const layer = L.geoJSON(data, {
        style: defaultStyle,

        // If your city data is points, this ensures they are visible
        pointToLayer: function (_feature, latlng) {
          return L.circleMarker(latlng, {
            radius: 6,
            weight: 1,
            opacity: 1,
            fillOpacity: 0.7,
          });
        },

        // Simple popup: show a reasonable label if one exists
        onEachFeature: function (feature, lyr) {
          const p = feature?.properties || {};
          const name = p.name || p.NAME || p.city || p.CITY || p.City;
          if (name) lyr.bindPopup(String(name));
        },
      }).addTo(map);

      // Zoom to data extent
      if (layer.getLayers().length) {
        map.fitBounds(layer.getBounds());
      }
    })
    .catch((error) => {
      console.error("Error loading Top10cities.json:", error);
    });
}

/* =======================
   3) UI: Collapsible Sections
======================= */

// Buttons with class="collapsible" expand/collapse the next sibling element
function initCollapsibles() {
  // Ensure collapse-content starts hidden (CSS also does this; safe fallback)
  const contents = document.getElementsByClassName("collapse-content");
  for (let c = 0; c < contents.length; c++) {
    contents[c].style.display = "none";
  }

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

// openPage(pageName, elmnt) hides all tabcontent blocks, then shows the selected one.
function openPage(pageName, elmnt) {
  let i;
  const tabcontent = document.getElementsByClassName("tabcontent");
  const tablinks = document.getElementsByClassName("tablink");

  for (i = 0; i < tabcontent.length; i++) {
    tabcontent[i].style.display = "none";
  }

  for (i = 0; i < tablinks.length; i++) {
    tablinks[i].style.backgroundColor = "";
  }

  const target = document.getElementById(pageName);
  if (target) target.style.display = "block";
  if (elmnt) elmnt.style.backgroundColor = "#555";
}

function openDefaultTab() {
  const defaultBtn = document.getElementById("defaultOpen");
  if (defaultBtn) defaultBtn.click();
}

/* =======================
   5) Initialize Everything
======================= */
onReady(function () {
  initMap();
  loadTop10Cities();

  initCollapsibles();
  openDefaultTab();
});
