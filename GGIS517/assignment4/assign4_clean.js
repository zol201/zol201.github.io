/* =========================================================
   GGIS 517 — Assignment 5 Dashboard (Leaflet + D3)

   Data
   - GeoJSON: Top10cities.json
   - CSV: disaster.csv (supports BOTH long + wide formats)

   Interactions
   - Click a city on the map OR a bar in Chart 1 to select a city
   - City dropdown (optional) + Disaster dropdown (required to show charts)
   - Coordinated multiple views: map + charts update together

   Map Symbology (when a disaster is selected)
   - Blue (low) → Red (high)
   - Gray = 0 (no event)
   - Legend updates with selected disaster type
   ========================================================= */

/* =======================
   0) DOM Ready helper
======================= */
function onReady(fn) {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", fn);
  } else {
    fn();
  }
}

/* =======================
   1) File paths
======================= */
const GEOJSON_URL = "GGIS517/assignment4/Top10cities.json";
const CSV_URL = "GGIS517/assignment4/disaster.csv";

// Zoom behavior: when zoomed in enough, hide point markers and color city boundaries instead
const ZOOM_POLYGON_MODE = 7; // >= this zoom: polygons use data color, points + labels hidden

/* =======================
   2) Global state
======================= */
const state = {
  selectedCity: null,   // string | null
  selectedDisaster: "", // string ("" means no selection / default view)
  rows: [],             // long rows: {city, disaster, count}
  disasters: [],        // unique disaster types
  cities: [],           // unique city names for the City dropdown
};

/* =======================
   3) Leaflet globals
======================= */
let map = null;
let geoLayer = null;

// City boundary polygons (outline) + centroid circles (data-driven)
const cityPolygonByName = new Map(); // cityName -> Leaflet polygon layer
const cityCircleByName = new Map();  // cityName -> Leaflet circleMarker layer
const cityMetaByName = new Map();    // cityName -> { population?: number }

// Legend control
let legendControl = null;
let legendDiv = null;

/* =======================
   4) Utilities
======================= */
function normalizeCityName(x) {
  let s = String(x || "").trim();
  if (!s) return s;

  // Fix common misspelling in dataset
  if (s.toLowerCase() === "jacksonvile") s = "Jacksonville";

  return s;
}

function toNumber(x) {
  const n = +x;
  return Number.isFinite(n) ? n : 0;
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function getCityNameFromFeatureProps(props) {
  const p = props || {};
  const raw =
    p.name ||
    p.NAME ||
    p.city ||
    p.CITY ||
    p.City ||
    p.city_name ||
    p.CityName;

  return normalizeCityName(raw);
}

function getPopulationFromFeatureProps(props) {
  const p = props || {};

  // Explicitly support population_M (stored in millions)
  const raw =
    p.population ||
    p.Population ||
    p.POPULATION ||
    p.pop ||
    p.POP ||
    p.pop_2020 ||
    p.POP2020 ||
    p.pop2020 ||
    p.population_M ||   // <-- your actual field
    p.population_m ||
    p.Population_M;

  if (raw === undefined || raw === null || raw === "") return null;

  const s = String(raw).trim().replace(/,/g, "");
  let n = Number(s);
  if (!Number.isFinite(n)) return null;

  // population_M is stored in millions → convert to actual population
  if ("population_M" in p || "population_m" in p || "Population_M" in p) {
    n = Math.round(n * 1_000_000);
  }

  return n > 0 ? n : null;
}

function formatNumber(n) {
  try {
    return new Intl.NumberFormat("en-US").format(n);
  } catch (_e) {
    return String(n);
  }
}

function zoomToCityByName(city) {
  if (!map || !city) return;

  const poly = cityPolygonByName.get(city);
  if (poly && typeof poly.getBounds === "function") {
    map.fitBounds(poly.getBounds(), { padding: [20, 20] });
  } else if (poly && typeof poly.getLatLng === "function") {
    map.setView(poly.getLatLng(), Math.max(map.getZoom(), 9));
  }
}

// Toggle permanent tooltips (city labels)
function setCityLabelsVisible(visible) {
  cityCircleByName.forEach((circle) => {
    if (!circle) return;
    try {
      if (visible) {
        // Restore tooltip if it exists
        if (circle.getTooltip && circle.getTooltip()) circle.openTooltip();
      } else {
        if (circle.closeTooltip) circle.closeTooltip();
      }
    } catch (_e) {}
  });
}

/* =======================
   5) Filtering + dropdown helpers
======================= */
function getFilteredRows() {
  // Empty string means: no selection yet
  if (!state.selectedDisaster) return state.rows;
  return state.rows.filter((d) => d.disaster === state.selectedDisaster);
}

function buildCityList() {
  // Prefer GeoJSON city names (so dropdown matches map), fallback to CSV
  const fromGeo = Array.from(cityPolygonByName.keys());
  const fromCSV = Array.from(new Set(state.rows.map((d) => d.city)));

  const cities = Array.from(
    new Set([...fromGeo, ...fromCSV].map(normalizeCityName))
  )
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));

  state.cities = cities;
}

function syncCityDropdown() {
  const sel = document.getElementById("citySelect");
  if (!sel) return;
  sel.value = state.selectedCity ? state.selectedCity : "";
}

/* =======================
   6) Leaflet: Map + Legend
======================= */
function initMap() {
  // US-centered view
  map = L.map("map").setView([39.5, -98.35], 4);

  // Ensure consistent click behavior: polygons below, circles above
  map.createPane("cityPolygons");
  map.getPane("cityPolygons").style.zIndex = 350;

  map.createPane("cityCircles");
  map.getPane("cityCircles").style.zIndex = 450;

  // Basemap
  L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors ' +
      '&copy; <a href="https://carto.com/attributions">CARTO</a>',
  }).addTo(map);

  // Scale bar (metric + imperial)
  L.control
    .scale({
      position: "bottomleft",
      metric: true,
      imperial: true,
      maxWidth: 140,
    })
    .addTo(map);

  // Re-apply styles on zoom so polygon/point mode switches immediately
  map.on("zoomend", () => {
    applyMapStylesAndLegend(getFilteredRows());
  });

  // Popup action: zoom to the selected city's boundary when clicking the button inside the popup
  map.on("popupopen", (e) => {
    const el = e.popup.getElement();
    if (!el) return;

    const btn = el.querySelector("button.zoom-city");
    if (!btn) return;

    btn.addEventListener(
      "click",
      () => {
        const city = btn.getAttribute("data-city");
        if (!city) return;

        zoomToCityByName(city);
        map.closePopup();
      },
      { once: true }
    );
  });
}

function initLegend() {
  if (legendControl) return;

  legendControl = L.control({ position: "bottomright" });
  legendControl.onAdd = function () {
    legendDiv = L.DomUtil.create("div", "legend");

    // Prevent scroll/drag conflicts when interacting with legend
    L.DomEvent.disableClickPropagation(legendDiv);
    L.DomEvent.disableScrollPropagation(legendDiv);

    legendDiv.innerHTML =
      '<div class="legend">' +
      '<div class="legend-title">Total (Loading…)</div>' +
      '<div class="small-muted">Blue = low, Red = high, Gray = 0. Updates with the selected disaster type.</div>' +
      "</div>";

    return legendDiv;
  };

  legendControl.addTo(map);
}

function baseCityStyle(fillColor) {
  return {
    radius: 10,
    weight: 1,
    opacity: 1,
    color: "#111827",
    fillColor: fillColor || "#3b82f6",
    fillOpacity: 0.75,
  };
}

function selectedCityStyle(fillColor) {
  return {
    radius: 14,
    weight: 3,
    opacity: 1,
    color: "#111827",
    fillColor: fillColor || "#3b82f6",
    fillOpacity: 0.95,
  };
}

async function loadCitiesGeoJSON() {
  try {
    const r = await fetch(GEOJSON_URL);
    const geo = await r.json();

    cityPolygonByName.clear();
    cityCircleByName.clear();

    if (geoLayer) {
      geoLayer.remove();
      geoLayer = null;
    }

    geoLayer = L.geoJSON(geo, {
      pane: "cityPolygons",
      style: {
        color: "#9ca3af",
        weight: 1,
        opacity: 0.9,
        fillOpacity: 0.0,
      },
      onEachFeature: (feature, layer) => {
        const name = getCityNameFromFeatureProps(feature?.properties);
        if (!name) return;

        // Store population (if available) from GeoJSON properties
        const pop = getPopulationFromFeatureProps(feature?.properties);
        if (pop) cityMetaByName.set(name, { population: pop });

        // Store boundary layer
        cityPolygonByName.set(name, layer);

        // Click boundary selects city + opens circle popup
        layer.on("click", () => {
          state.selectedCity = name;
          renderAll();

          const circle = cityCircleByName.get(name);
          if (circle && typeof circle.openPopup === "function") {
            circle.openPopup();
          }
        });

        // Create centroid circle marker (carries data-driven symbology)
        let center = null;
        try {
          if (layer.getBounds) {
            center = layer.getBounds().getCenter();
          } else if (layer.getLatLng) {
            center = layer.getLatLng();
          }
        } catch (_e) {
          center = null;
        }

        if (!center) return;

        const circle = L.circleMarker(center, {
          ...baseCityStyle("#3b82f6"),
          pane: "cityCircles",
        }).addTo(map);

        cityCircleByName.set(name, circle);

        // Circle click selects city
        circle.on("click", () => {
          state.selectedCity = name;
          renderAll();
        });

        // Label + popup
        circle.bindTooltip(name, {
          permanent: true,
          direction: "right",
          offset: [8, 0],
          className: "city-label",
        });

        circle.bindPopup(name);
      },
    }).addTo(map);

    if (geoLayer.getLayers().length) {
      map.fitBounds(geoLayer.getBounds(), { padding: [20, 20] });
    }
  } catch (err) {
    console.error("Error loading Top10cities.json:", err);
  }
}

/* =======================
   7) Data: CSV loading (supports long OR wide)
======================= */
function isLongFormat(columns) {
  const cols = (columns || []).map((c) => String(c).toLowerCase());
  const hasCity = cols.includes("city");
  const hasDisaster = cols.includes("disaster") || cols.includes("disaster_type");
  const hasCount = cols.includes("count");
  return hasCity && hasDisaster && hasCount;
}

function parseLongRow(d) {
  const city = normalizeCityName(d.City || d.city);
  const disaster = String(d.Disaster || d.disaster_type || d.disaster || "").trim();
  const count = toNumber(d.Count || d.count);
  return { city, disaster, count };
}

function wideToLong(rows, columns) {
  // Common case: first column is "Unnamed: 0" and stores disaster type
  const firstCol = columns[0];
  const cityCols = columns.slice(1);

  const longRows = [];
  for (const r of rows) {
    const disaster = String(r[firstCol] || "").trim();
    if (!disaster) continue;

    for (const cityCol of cityCols) {
      const city = normalizeCityName(cityCol);
      const count = toNumber(r[cityCol]);
      longRows.push({ city, disaster, count });
    }
  }

  return longRows;
}

async function loadDisasterCSV() {
  try {
    const rows = await d3.csv(CSV_URL);
    const columns = rows.columns || [];

    const longRows = isLongFormat(columns)
      ? rows.map(parseLongRow)
      : wideToLong(rows, columns);

    state.rows = longRows.filter((d) => d.city && d.disaster);
    state.disasters = Array.from(new Set(state.rows.map((d) => d.disaster))).sort();

    if (!state.rows.length) {
      console.warn("CSV loaded but no usable rows parsed. Check headers/values.");
    }
  } catch (err) {
    console.error("Error loading disaster.csv:", err);
  }
}

/* =======================
   8) Map updates: symbology + legend
======================= */
function computeCityTotals(rowsFiltered) {
  const totals = d3
    .rollups(
      rowsFiltered,
      (v) => d3.sum(v, (d) => d.count),
      (d) => d.city
    )
    .map(([city, total]) => [normalizeCityName(city), total]);

  return new Map(totals);
}

function applyMapStylesAndLegend(rowsFiltered) {
  const totalsByCity = computeCityTotals(rowsFiltered);
  const maxVal = d3.max(Array.from(totalsByCity.values())) || 0;

  const zoomedIn = map && map.getZoom && map.getZoom() >= ZOOM_POLYGON_MODE;

  // -----------------------
  // Default view (no disaster selected)
  // -----------------------
  if (!state.selectedDisaster) {
    // Ensure labels are visible in default view
    setCityLabelsVisible(true);

    cityCircleByName.forEach((layer, name) => {
      if (!layer || !layer.setStyle) return;

      const isSelected = !!state.selectedCity && name === state.selectedCity;

      layer.setStyle(
        isSelected ? selectedCityStyle("#3b82f6") : baseCityStyle("#3b82f6")
      );

      if (typeof layer.setRadius === "function") {
        layer.setRadius(isSelected ? 16 : 12);
      }

      // Make sure points are visible in default view
      layer.setStyle({ opacity: 1, fillOpacity: isSelected ? 0.95 : 0.75 });

      layer.bindPopup(`<div class="popup-title">${name}</div>`);

      if (typeof layer.bringToFront === "function") {
        layer.bringToFront();
      }
    });

    // Default polygon outline (gray)
    cityPolygonByName.forEach((poly, name) => {
      if (!poly || !poly.setStyle) return;

      const isSel = !!state.selectedCity && name === state.selectedCity;
      poly.setStyle({
        weight: isSel ? 3 : 1,
        color: isSel ? "#111827" : "#9ca3af",
        opacity: isSel ? 1 : 0.9,
        fillOpacity: 0.4,
      });
    });

    if (legendDiv) {
      legendDiv.innerHTML =
        '<div class="legend">' +
        '<div class="legend-title">Select a disaster</div>' +
        '<div class="small-muted">Choose a disaster type to color circles (blue→red, gray=0) and scale size by count.</div>' +
        "</div>";
    }

    return;
  }

  // -----------------------
  // Disaster-selected view
  // -----------------------
  const colors = ["#2166ac", "#67a9cf", "#d1e5f0", "#fddbc7", "#ef8a62", "#b2182b"];

const colorScale = d3
  .scaleSequential()
  .domain([1, Math.max(1, maxVal)])
  .interpolator(d3.interpolateTurbo);

  const rScale = d3
    .scaleLinear()
    .domain([0, Math.max(10, maxVal)])
    .range([6, 14])
    .clamp(true);

  // Points + popups (hidden when zoomed in)
  cityCircleByName.forEach((layer, name) => {
    if (!layer || !layer.setStyle) return;

    const v = totalsByCity.get(name) ?? 0;
    const isSelected = !!state.selectedCity && name === state.selectedCity;

    const fill = v === 0 ? "#bdbdbd" : colorScale(v);
    layer.setStyle(isSelected ? selectedCityStyle(fill) : baseCityStyle(fill));

    const r = v === 0 ? 6 : rScale(v);

    if (zoomedIn) {
      // Hide point markers and labels at high zoom (polygon mode)
      layer.setStyle({ opacity: 0, fillOpacity: 0 });
      if (typeof layer.setRadius === "function") layer.setRadius(1);
    } else {
      // Normal point mode
      layer.setStyle({ opacity: 1, fillOpacity: isSelected ? 0.95 : 0.75 });
      if (typeof layer.setRadius === "function") {
        layer.setRadius(isSelected ? r + 4 : r);
      }
    }

    if (typeof layer.bringToFront === "function") {
      layer.bringToFront();
    }

    // Keep popup content the same
    layer.bindPopup(
      `<div class="popup-title">${name}</div>` +
        `<div class="popup-sub"><b>${state.selectedDisaster}</b>: ${v}</div>` +
        `<button class="zoom-city" data-city="${name}" type="button">Zoom to city</button>`
    );
  });

  // Labels: show only in point mode
  setCityLabelsVisible(!zoomedIn);

  // Polygons: gray outline in point mode; data-colored outline in polygon mode
  cityPolygonByName.forEach((poly, name) => {
    if (!poly || !poly.setStyle) return;

    const isSel = !!state.selectedCity && name === state.selectedCity;

    if (zoomedIn) {
      const v = totalsByCity.get(name) ?? 0;
      const fill = v === 0 ? "#bdbdbd" : colorScale(v);

      // In polygon mode, make boundary outline use the SAME color as the circle marker.
      poly.setStyle({
        color: fill,
        weight: isSel ? 4 : 2,
        opacity: 1,
        fillOpacity: 0.4,
      });

      if (typeof poly.bringToFront === "function") poly.bringToFront();
    } else {
      poly.setStyle({
        weight: isSel ? 3 : 1,
        color: isSel ? "#111827" : "#9ca3af",
        opacity: isSel ? 1 : 0.9,
        fillOpacity: 0.4,
      });
    }
  });

  updateLegendColor(colorScale, totalsByCity);
}

function updateLegendColor(colorScale, totalsByCity) {
  if (!legendDiv) return;

  const title = `Total (${state.selectedDisaster})`;

  const values = totalsByCity instanceof Map ? Array.from(totalsByCity.values()) : [];
  const unique = Array.from(
    new Set(values.map((v) => Math.round(Number.isFinite(+v) ? +v : 0)))
  ).sort((a, b) => a - b);

  const positives = unique.filter((v) => v > 0);
  const hasZero = unique.includes(0);

  let html = `<div class="legend"><div class="legend-title">${title}</div>`;

  if (hasZero) {
    html += `
      <div class="legend-item">
        <span class="legend-swatch" style="background:#bdbdbd"></span>
        <span>0 (no event)</span>
      </div>`;
  }

  for (const v of positives) {
    const swatch = colorScale(v);
    html += `
      <div class="legend-item">
        <span class="legend-swatch" style="background:${swatch}"></span>
        <span>${v}</span>
      </div>`;
  }

  if (!hasZero && positives.length === 0) {
    html += `<div class="small-muted">No values to display.</div>`;
  }

  html += `</div>`;
  legendDiv.innerHTML = html;
}

/* =======================
   9) UI controls
======================= */
function initCityDropdown() {
  const sel = document.getElementById("citySelect");
  if (!sel) return;

  sel.innerHTML = "";

  const allOpt = document.createElement("option");
  allOpt.value = "";
  allOpt.textContent = "All cities";
  sel.appendChild(allOpt);

  state.cities.forEach((c) => {
    const opt = document.createElement("option");
    opt.value = c;
    opt.textContent = c;
    sel.appendChild(opt);
  });

  sel.value = state.selectedCity ? state.selectedCity : "";

  sel.addEventListener("change", (e) => {
    const v = e.target.value;
    state.selectedCity = v ? v : null;
    renderAll();
  });
}

function initDisasterDropdown() {
  const sel = document.getElementById("disasterSelect");
  if (!sel) return;

  sel.innerHTML = "";

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Select a disaster…";
  sel.appendChild(placeholder);

  state.disasters.forEach((v) => {
    const opt = document.createElement("option");
    opt.value = v;
    opt.textContent = v;
    sel.appendChild(opt);
  });

  sel.value = state.selectedDisaster;

  sel.addEventListener("change", (e) => {
    state.selectedDisaster = e.target.value;
    renderAll();
  });
}

/* =======================
   10) Summary
======================= */
function updateSummary(rowsFiltered) {
  // Keep the City dropdown synced with map/chart interactions
  syncCityDropdown();

  const zoomBtn = document.getElementById("zoomCityBtn");

  // Helper: set text only if the element exists (so JS won't break if HTML differs)
  const safeSet = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };

  // Default state: do not reveal any all-cities totals
  if (!state.selectedDisaster) {
    safeSet("statTotal", "—");           // selected city count
    safeSet("statPop", "—");             // selected city population
    safeSet("statDisasterTotal", "—");   // total across all cities for selected disaster
    safeSet("statMaxCity", "—");         // city with max count
    safeSet("statMaxValue", "—");        // max value
    if (zoomBtn) zoomBtn.disabled = true;
    return;
  }

  // Total count across ALL cities for the selected disaster
  const disasterTotal = d3.sum(rowsFiltered, (d) => d.count);
  safeSet("statDisasterTotal", String(disasterTotal));

  // Max city (for the selected disaster)
  const totalsByCity = d3
    .rollups(
      rowsFiltered,
      (v) => d3.sum(v, (d) => d.count),
      (d) => d.city
    )
    .map(([city, total]) => ({ city, total }));

  const maxEntry =
    totalsByCity.reduce(
      (best, cur) => (cur.total > (best?.total ?? -Infinity) ? cur : best),
      null
    ) || null;

  if (maxEntry) {
    safeSet("statMaxCity", maxEntry.city);
    safeSet("statMaxValue", String(maxEntry.total));
  } else {
    safeSet("statMaxCity", "—");
    safeSet("statMaxValue", "—");
  }

  // Selected city count (only when a city is selected)
  if (state.selectedCity) {
    const cityCount = d3.sum(
      rowsFiltered.filter((d) => d.city === state.selectedCity),
      (d) => d.count
    );
    safeSet("statTotal", String(cityCount));

    // Population display (only meaningful when a city is selected)
    const meta = cityMetaByName.get(state.selectedCity);
    const pop = meta?.population;
    safeSet("statPop", pop ? formatNumber(pop) : "N/A");

    if (zoomBtn) zoomBtn.disabled = false;
  } else {
    // If no city selected, keep city-specific stats hidden
    safeSet("statTotal", "—");
    safeSet("statPop", "—");
    if (zoomBtn) zoomBtn.disabled = true;
  }
}

/* =======================
   11) Chart 1 — Total by City (clickable)
======================= */
function renderCityTotalChart(rowsFiltered) {
  const totals = d3
    .rollups(
      rowsFiltered,
      (v) => d3.sum(v, (d) => d.count),
      (d) => d.city
    )
    .map(([city, total]) => ({ city, total }))
    .sort((a, b) => d3.descending(a.total, b.total));

  const container = d3.select("#chartCity");
  container.selectAll("*").remove();

  const width = container.node()?.clientWidth || 360;
  const height = 240;
  const margin = { top: 10, right: 10, bottom: 70, left: 46 };

  const svg = container.append("svg").attr("width", width).attr("height", height);

  const x = d3
    .scaleBand()
    .domain(totals.map((d) => d.city))
    .range([margin.left, width - margin.right])
    .padding(0.22);

  const y = d3
    .scaleLinear()
    .domain([0, d3.max(totals, (d) => d.total) || 1])
    .nice()
    .range([height - margin.bottom, margin.top]);

  svg
    .append("g")
    .selectAll("rect")
    .data(totals)
    .join("rect")
    .attr("x", (d) => x(d.city))
    .attr("y", (d) => y(d.total))
    .attr("width", x.bandwidth())
    .attr("height", (d) => height - margin.bottom - y(d.total))
    .attr("opacity", (d) =>
      state.selectedCity && d.city !== state.selectedCity ? 0.35 : 0.9
    )
    .on("click", (_event, d) => {
      state.selectedCity = d.city;
      renderAll();
    });

  svg
    .append("g")
    .attr("transform", `translate(0,${height - margin.bottom})`)
    .call(d3.axisBottom(x))
    .selectAll("text")
    .attr("transform", "rotate(-35)")
    .style("text-anchor", "end");

  svg
    .append("g")
    .attr("transform", `translate(${margin.left},0)`)
    .call(d3.axisLeft(y).ticks(5));
}

/* =======================
   12) Chart 2 — City composition (pie, %)
======================= */
function renderDisasterBreakdownChart(_rowsFiltered) {
  const container = d3.select("#chartDisaster");
  container.selectAll("*").remove();

  // If no city selected, prompt user
  if (!state.selectedCity) {
    container
      .append("div")
      .attr("class", "small-muted")
      .style("padding", "10px 0")
      .text("Select a city to see composition.");
    return;
  }

  // Composition should be across ALL disaster types for the selected city
  const cityRows = state.rows.filter((d) => d.city === state.selectedCity);

  const byDisaster = d3
    .rollups(
      cityRows,
      (v) => d3.sum(v, (d) => d.count),
      (d) => d.disaster
    )
    .map(([disaster, total]) => ({ disaster, total }))
    .filter((d) => d.total > 0)
    .sort((a, b) => d3.descending(a.total, b.total));

  const totalSum = d3.sum(byDisaster, (d) => d.total) || 0;
  if (!totalSum || byDisaster.length === 0) {
    container
      .append("div")
      .attr("class", "small-muted")
      .style("padding", "10px 0")
      .text("No data for this city.");
    return;
  }

  const data = byDisaster.map((d) => ({
    disaster: d.disaster,
    total: d.total,
    pct: d.total / totalSum,
  }));

  const width = container.node()?.clientWidth || 360;

  // Layout: reserve space at the bottom for the legend so it won't overlap the pie
  const legendItems = Math.min(8, data.length);
  const legendRowH = 16;
  const legendPad = 12;
  const legendH = legendItems * legendRowH + legendPad;

  const pieH = 300; // visual height for the pie area
  const height = pieH + legendH;

  const radius = Math.min(width, pieH) / 2 - 10;

  const svg = container.append("svg").attr("width", width).attr("height", height);

  // Center the pie in the upper area (exclude the legend area)
  const g = svg.append("g").attr("transform", `translate(${width / 2},${pieH / 2})`);

  const pie = d3.pie().sort(null).value((d) => d.total);
  const arcs = pie(data);

  const color = d3
    .scaleOrdinal()
    .domain(data.map((d) => d.disaster))
    .range(d3.schemeTableau10);

  const arc = d3.arc().innerRadius(0).outerRadius(radius);
  const arcLabel = d3
    .arc()
    .innerRadius(radius * 0.65)
    .outerRadius(radius * 0.65);

  g.selectAll("path")
    .data(arcs)
    .join("path")
    .attr("d", arc)
    .attr("fill", (d) => color(d.data.disaster))
    .attr("stroke", "white")
    .attr("stroke-width", 1);

  // Label only meaningful slices (>= 6%)
  g.selectAll("text")
    .data(arcs)
    .join("text")
    .attr("transform", (d) => `translate(${arcLabel.centroid(d)})`)
    .attr("text-anchor", "middle")
    .style("font-size", "11px")
    .style("font-weight", 800)
    .text((d) => (d.data.pct >= 0.06 ? `${Math.round(d.data.pct * 100)}%` : ""));

  // Title
  svg
    .append("text")
    .attr("x", 10)
    .attr("y", 18)
    .style("font-size", "15px")
    .style("font-weight", 900)
    .text(`${state.selectedCity}`);

  // Legend (top 8) — placed under the pie (inside the same SVG)
  const legendData = data.slice(0, 8);
  const legendTop = pieH + 8;
  const legend = svg.append("g").attr("transform", `translate(10, ${legendTop})`);

  const row = legend
    .selectAll("g")
    .data(legendData)
    .join("g")
    .attr("transform", (_d, i) => `translate(0, ${i * 16})`);

  row
    .append("rect")
    .attr("width", 10)
    .attr("height", 10)
    .attr("y", -9)
    .attr("fill", (d) => color(d.disaster));

  row
    .append("text")
    .attr("x", 14)
    .attr("y", 0)
    .style("font-size", "11px")
    .text((d) => `${d.disaster} (${Math.round(d.pct * 100)}%)`);
}

/* =======================
   13) Render all views
======================= */
function renderAll() {
  const rowsFiltered = getFilteredRows();

  updateSummary(rowsFiltered);

  // Default state: hide charts so viewers don't see the overall totals
  if (!state.selectedDisaster) {
    d3.select("#chartCity").selectAll("*").remove();
    d3.select("#chartDisaster").selectAll("*").remove();

    applyMapStylesAndLegend(rowsFiltered);
    return;
  }

  renderCityTotalChart(rowsFiltered);
  renderDisasterBreakdownChart(rowsFiltered);

  applyMapStylesAndLegend(rowsFiltered);
}

/* =======================
   14) Boot
======================= */
onReady(async function () {
  initMap();
  initLegend();

  await loadCitiesGeoJSON();
  await loadDisasterCSV();

  buildCityList();
  initCityDropdown();
  initDisasterDropdown();

  // Summary zoom button (enabled only when a city is selected)
  const zoomBtn = document.getElementById("zoomCityBtn");
  if (zoomBtn) {
    zoomBtn.addEventListener("click", () => {
      if (!state.selectedCity) return;
      zoomToCityByName(state.selectedCity);
    });
  }

  renderAll();
});