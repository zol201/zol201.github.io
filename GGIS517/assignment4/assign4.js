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
  selectedDisaster: "All",  // string
  rows: [],                 // long rows: {city, disaster, count}
  disasters: [],            // unique disaster types
};

/* =======================
   3) Leaflet globals
======================= */
let map = null;
let geoLayer = null;
const cityLayerByName = new Map(); // cityName -> Leaflet layer

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
  if (state.selectedDisaster === "All") return state.rows;
  return state.rows.filter((d) => d.disaster === state.selectedDisaster);
}

/* =======================
   5) Leaflet: Map + Legend
======================= */
function initMap() {
  // US-centered view
  map = L.map("map").setView([39.5, -98.35], 4);

  L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors ' +
      '&copy; <a href="https://carto.com/attributions">CARTO</a>',
  }).addTo(map);
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
    radius: 7,
    weight: 1,
    opacity: 1,
    color: "#111827",
    fillColor: fillColor || "#3b82f6",
    fillOpacity: 0.75,
  };
}

function selectedCityStyle(fillColor) {
  return {
    radius: 10,
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

    cityLayerByName.clear();

    if (geoLayer) {
      geoLayer.remove();
      geoLayer = null;
    }

    geoLayer = L.geoJSON(geo, {
      pointToLayer: (_feature, latlng) => L.circleMarker(latlng, baseCityStyle("#3b82f6")),
      onEachFeature: (feature, layer) => {
        const name = getCityNameFromFeatureProps(feature?.properties);
        if (!name) return;

        cityLayerByName.set(name, layer);
        layer.bindPopup(name);

        layer.on("click", () => {
          state.selectedCity = name;
          renderAll();
        });
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

  cityLayerByName.forEach((layer, name) => {
    if (!layer || !layer.setStyle) return;

    const v = totalsByCity.get(name) ?? 0;
    const isSelected = !!state.selectedCity && name === state.selectedCity;

    const fill = v === 0 ? "#bdbdbd" : colorScale(v);
    layer.setStyle(isSelected ? selectedCityStyle(fill) : baseCityStyle(fill));

    const disasterLabel = state.selectedDisaster === "All" ? "All disasters" : state.selectedDisaster;
    layer.bindPopup(`${name}<br><b>${disasterLabel}</b>: ${v}`);
  });

  updateLegendColor(colorScale, maxVal);
}

function updateLegendColor(colorScale, maxVal) {
  if (!legendDiv) return;

  const title =
    state.selectedDisaster === "All"
      ? "Total (All disasters)"
      : `Total (${state.selectedDisaster})`;

  // Quantize breaks (only for 1..max). Add explicit 0 = gray item.
  const thresholds = colorScale.thresholds();
  const bounds = [1, ...thresholds, Math.max(1, maxVal || 1)];

  let html = `<div class="legend"><div class="legend-title">${title}</div>`;

  // 0 bin
  html += `
    <div class="legend-item">
      <span class="legend-swatch" style="background:#bdbdbd"></span>
      <span>0 (no event)</span>
    </div>`;

  // Positive bins
  for (let i = 0; i < bounds.length - 1; i++) {
    const a = Math.round(bounds[i]);
    const b = Math.round(bounds[i + 1]);
    const mid = (bounds[i] + bounds[i + 1]) / 2;
    const swatch = colorScale(mid);

    html += `
      <div class="legend-item">
        <span class="legend-swatch" style="background:${swatch}"></span>
        <span>${a} – ${b}</span>
      </div>`;
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
function initDisasterDropdown() {
  const sel = document.getElementById("disasterSelect");
  if (!sel) return;

  sel.innerHTML = "";
  ["All", ...state.disasters].forEach((v) => {
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
  setText("statCity", state.selectedCity ? state.selectedCity : "All");
  setText("statDisaster", state.selectedDisaster);

  const total = d3.sum(rowsFiltered, (d) => d.count);
  setText("statTotal", String(total));
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

  const max = totals[0];
  setText("statMaxCity", max ? `${max.city} (${max.total})` : "—");

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

  initDisasterDropdown();
  renderAll();
});
