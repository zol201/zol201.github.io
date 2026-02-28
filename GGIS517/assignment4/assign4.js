/* =========================================================
   GGIS 517 — Assignment 5 Dashboard (Leaflet + D3)
   Data:
   - GeoJSON: Top10cities.json
   - CSV: disaster.csv (supports BOTH long and wide formats)

   Interactions:
   - Click a city on the map OR a bar in Chart 1 to select a city
   - Use dropdown to filter by disaster type
   - Map + charts update together (coordinated multiple views)

   Map Symbology:
   - Blue (low) → Red (high)
   - Gray = 0 (no event)
   - Dynamic legend updates with the selected disaster type
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

/* =======================
   2) Global state
======================= */
const state = {
  selectedCity: null,       // string | null
  selectedDisaster: "",     // string ("" means no selection / default view)
  rows: [],                 // long rows: {city, disaster, count}
  disasters: [],            // unique disaster types
  cities: [],               // unique city names for the City dropdown
};

/* =======================
   3) Leaflet globals
======================= */
let map = null;
let geoLayer = null;
// City boundary polygons (outline) and centroid circles (data-driven)
const cityPolygonByName = new Map(); // cityName -> Leaflet polygon layer
const cityCircleByName = new Map();  // cityName -> Leaflet circleMarker layer

let legendControl = null;  // Leaflet legend control
let legendDiv = null;      // DOM container for legend

/* =======================
   4) Utility
======================= */
function normalizeCityName(x) {
  let s = String(x || "").trim();
  if (!s) return s;

  // Fix common misspelling in your dataset
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

function getFilteredRows() {
  // Empty string means: no selection yet (use all rows for charts/summaries)
  if (!state.selectedDisaster) return state.rows;
  return state.rows.filter((d) => d.disaster === state.selectedDisaster);
}

function buildCityList() {
  // Prefer GeoJSON city names (so dropdown matches map), fallback to CSV
  const fromGeo = Array.from(cityPolygonByName.keys());
  const fromCSV = Array.from(new Set(state.rows.map((d) => d.city)));

  const cities = Array.from(new Set([...fromGeo, ...fromCSV].map(normalizeCityName)))
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
   5) Leaflet: Map + Legend
======================= */
function initMap() {
  // US-centered view
  map = L.map("map").setView([39.5, -98.35], 4);

  // Ensure consistent click behavior: polygons below, circles above
  map.createPane("cityPolygons");
  map.getPane("cityPolygons").style.zIndex = 350;

  map.createPane("cityCircles");
  map.getPane("cityCircles").style.zIndex = 450;

  L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors ' +
      '&copy; <a href="https://carto.com/attributions">CARTO</a>',
  }).addTo(map);

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

        const poly = cityPolygonByName.get(city);
        if (poly && typeof poly.getBounds === "function") {
          map.fitBounds(poly.getBounds(), { padding: [20, 20] });
        } else if (poly && typeof poly.getLatLng === "function") {
          map.setView(poly.getLatLng(), Math.max(map.getZoom(), 9));
        }

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
      '<div class="legend"><div class="legend-title">Total (Loading…)</div><div class="small-muted">Blue = low, Red = high, Gray = 0. Updates with the selected disaster type.</div></div>';
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

function getCityNameFromFeatureProps(props) {
  const p = props || {};
  const raw = p.name || p.NAME || p.city || p.CITY || p.City || p.city_name || p.CityName;
  return normalizeCityName(raw);
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
      // Keep original geometry on the map (polygons or points)
      style: {
        color: "#9ca3af",
        weight: 1,
        opacity: 0.9,
        fillOpacity: 0.0, // keep boundary, no fill
      },
      onEachFeature: (feature, layer) => {
        const name = getCityNameFromFeatureProps(feature?.properties);
        if (!name) return;

        // Store boundary layer (for polygons/lines). For point GeoJSON, this will store the point layer.
        cityPolygonByName.set(name, layer);

        // Click on boundary selects city
        layer.on("click", () => {
          state.selectedCity = name;
          renderAll();

          // Also open the circle popup so the user gets a popup even if polygon captured the click
          const circle = cityCircleByName.get(name);
          if (circle && typeof circle.openPopup === "function") {
            circle.openPopup();
          }
        });

        // Create / attach a centroid circle marker that will carry the data-driven symbology
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

        if (center) {
          const circle = L.circleMarker(center, { ...baseCityStyle("#3b82f6"), pane: "cityCircles" });
          circle.addTo(map);

          cityCircleByName.set(name, circle);

          // Clicking the circle also selects city
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
        }
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
   6) Data: compute totals
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

/* =======================
   7) Map updates: symbology + legend
======================= */
function applyMapStylesAndLegend(rowsFiltered) {
  const totalsByCity = computeCityTotals(rowsFiltered);
  const maxVal = d3.max(Array.from(totalsByCity.values())) || 0;

  // Default view (no selection yet): uniform circles for quick clicking + labels
  if (!state.selectedDisaster) {
    cityCircleByName.forEach((layer, name) => {
      if (!layer || !layer.setStyle) return;
      const isSelected = !!state.selectedCity && name === state.selectedCity;

      // Uniform symbol
      layer.setStyle(isSelected ? selectedCityStyle("#3b82f6") : baseCityStyle("#3b82f6"));
      if (typeof layer.setRadius === "function") layer.setRadius(isSelected ? 16 : 12);

      // Simple popup
      layer.bindPopup(`<div class="popup-title">${name}</div>`);
      if (typeof layer.bringToFront === "function") layer.bringToFront();
    });

    // Boundaries visible (gray), selected boundary emphasized
    cityPolygonByName.forEach((poly, name) => {
      if (!poly || !poly.setStyle) return;
      const isSel = !!state.selectedCity && name === state.selectedCity;
      poly.setStyle({
        weight: isSel ? 3 : 1,
        color: isSel ? "#111827" : "#9ca3af",
        opacity: isSel ? 1 : 0.9,
        fillOpacity: 0.0,
      });
    });

    // Legend message (no bins yet)
    if (legendDiv) {
      legendDiv.innerHTML =
        '<div class="legend"><div class="legend-title">Select a disaster</div><div class="small-muted">Choose a disaster type to color circles (blue→red, gray=0) and scale size by count.</div></div>';
    }

    return;
  }

  // Red–Blue diverging palette (low=blue, high=red). 0 handled as gray.
  const colors = [
    "#2166ac", // blue
    "#67a9cf",
    "#d1e5f0",
    "#fddbc7",
    "#ef8a62",
    "#b2182b", // red
  ];

  // Quantize only for positive values (1..max). Zero is handled separately.
  const colorScale = d3
    .scaleQuantize()
    .domain([1, Math.max(1, maxVal)])
    .range(colors);

  // Proportional circle size (radius) for quick clicking when zoomed out.
  // Anchor examples requested:
  //  - value 2  -> 5px radius
  //  - value 10 -> 10px radius
  // Linear mapping that satisfies the two anchors, with clamping.
  const rScale = d3
    .scaleLinear()
    .domain([0, Math.max(10, maxVal)])
    .range([6, 14])
    .clamp(true);

  // Override the two anchor points precisely (keep as comments for easy tweaks):
  // rScale(2)  ~= 5
  // rScale(10) ~= 10

  cityCircleByName.forEach((layer, name) => {
    if (!layer || !layer.setStyle) return;

    const v = totalsByCity.get(name) ?? 0;
    const isSelected = !!state.selectedCity && name === state.selectedCity;

    const fill = v === 0 ? "#bdbdbd" : colorScale(v);
    layer.setStyle(isSelected ? selectedCityStyle(fill) : baseCityStyle(fill));

    // Set proportional radius based on value (v)
    const r = v === 0 ? 6 : rScale(v);
    if (typeof layer.setRadius === "function") layer.setRadius(isSelected ? r + 4 : r);
    if (typeof layer.bringToFront === "function") layer.bringToFront();

    const disasterLabel = state.selectedDisaster === "All" ? "All disasters" : state.selectedDisaster;
    layer.bindPopup(
      `<div class="popup-title">${name}</div>` +
        `<div class="popup-sub"><b>${disasterLabel}</b>: ${v}</div>` +
        `<button class="zoom-city" data-city="${name}" type="button">Zoom to city</button>`
    );
  });

  // Highlight selected boundary (keep boundaries visible)
  cityPolygonByName.forEach((poly, name) => {
    if (!poly || !poly.setStyle) return;
    const isSel = !!state.selectedCity && name === state.selectedCity;
    poly.setStyle({
      weight: isSel ? 3 : 1,
      color: isSel ? "#111827" : "#9ca3af",
      opacity: isSel ? 1 : 0.9,
      fillOpacity: 0.0,
    });
  });

  updateLegendColor(colorScale, maxVal, totalsByCity);
}

function updateLegendColor(colorScale, maxVal, totalsByCity) {
  if (!legendDiv) return;

  const title =
    state.selectedDisaster === "All"
      ? "Total (All disasters)"
      : `Total (${state.selectedDisaster})`;

  // Collect unique values shown on the map (10 cities → small legend is OK)
  const values = totalsByCity instanceof Map ? Array.from(totalsByCity.values()) : [];
  const unique = Array.from(
    new Set(values.map((v) => Math.round(Number.isFinite(+v) ? +v : 0)))
  ).sort((a, b) => a - b);

  // Separate 0 (no event) and positives
  const positives = unique.filter((v) => v > 0);
  const hasZero = unique.includes(0);

  let html = `<div class="legend"><div class="legend-title">${title}</div>`;

  // 0 entry (gray)
  if (hasZero) {
    html += `
      <div class="legend-item">
        <span class="legend-swatch" style="background:#bdbdbd"></span>
        <span>0 (no event)</span>
      </div>`;
  }

  // Discrete numeric entries
  // Note: multiple values can map to the same color (quantize), but labels remain exact.
  for (const v of positives) {
    const swatch = colorScale(v);
    html += `
      <div class="legend-item">
        <span class="legend-swatch" style="background:${swatch}"></span>
        <span>${v}</span>
      </div>`;
  }

  // Edge case: if all are zero
  if (!hasZero && positives.length === 0) {
    html += `<div class="small-muted">No values to display.</div>`;
  }

  html += `</div>`;
  legendDiv.innerHTML = html;
}

/* =======================
   8) CSV loading (supports long OR wide)
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
    console.log("Loaded CSV:", CSV_URL, "rows:", rows.length, "columns:", columns);

    let longRows = [];
    if (isLongFormat(columns)) {
      longRows = rows.map(parseLongRow);
    } else {
      longRows = wideToLong(rows, columns);
    }

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
   9) UI controls
======================= */
function initCityDropdown() {
  const sel = document.getElementById("citySelect");
  if (!sel) return;

  sel.innerHTML = "";

  // Placeholder = All cities
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

  // Placeholder (default)
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Select a disaster…";
  sel.appendChild(placeholder);

  // No "All" option — only real disaster types
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

function updateSummary(rowsFiltered) {
  // Keep the City dropdown synced with map/chart interactions
  syncCityDropdown();

  // Default state: do not reveal any "all cities" total
  if (!state.selectedDisaster) {
    setText("statTotal", "—");
    return;
  }

  // If a city is selected, show that city's count; otherwise show the overall total for the selected disaster
  const count = state.selectedCity
    ? d3.sum(rowsFiltered.filter((d) => d.city === state.selectedCity), (d) => d.count)
    : d3.sum(rowsFiltered, (d) => d.count);

  setText("statTotal", String(count));
}

/* =======================
   10) Chart 1 — Total by City (clickable)
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
    .attr("opacity", (d) => (state.selectedCity && d.city !== state.selectedCity ? 0.35 : 0.9))
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
   11) Chart 2 — Disaster Breakdown
======================= */
function renderDisasterBreakdownChart(rowsFiltered) {
  const container = d3.select("#chartDisaster");
  container.selectAll("*").remove();

  const rows = state.selectedCity
    ? rowsFiltered.filter((d) => d.city === state.selectedCity)
    : rowsFiltered;

  const byDisaster = d3
    .rollups(
      rows,
      (v) => d3.sum(v, (d) => d.count),
      (d) => d.disaster
    )
    .map(([disaster, total]) => ({ disaster, total }))
    .sort((a, b) => d3.descending(a.total, b.total))
    .slice(0, 12);

  const width = container.node()?.clientWidth || 360;
  const height = 280;
  const margin = { top: 10, right: 10, bottom: 30, left: 150 };

  const svg = container.append("svg").attr("width", width).attr("height", height);

  const y = d3
    .scaleBand()
    .domain(byDisaster.map((d) => d.disaster))
    .range([margin.top, height - margin.bottom])
    .padding(0.2);

  const x = d3
    .scaleLinear()
    .domain([0, d3.max(byDisaster, (d) => d.total) || 1])
    .nice()
    .range([margin.left, width - margin.right]);

  svg
    .append("g")
    .selectAll("rect")
    .data(byDisaster)
    .join("rect")
    .attr("x", margin.left)
    .attr("y", (d) => y(d.disaster))
    .attr("width", (d) => x(d.total) - margin.left)
    .attr("height", y.bandwidth())
    .attr("opacity", 0.9);

  svg
    .append("g")
    .attr("transform", `translate(0,${height - margin.bottom})`)
    .call(d3.axisBottom(x).ticks(5));

  svg
    .append("g")
    .attr("transform", `translate(${margin.left},0)`)
    .call(d3.axisLeft(y));
}

/* =======================
   12) Render all views
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
   13) Boot
======================= */
onReady(async function () {
  initMap();
  initLegend();

  await loadCitiesGeoJSON();
  await loadDisasterCSV();

  // Build dropdown lists
  buildCityList();
  initCityDropdown();
  initDisasterDropdown();

  renderAll();
});
