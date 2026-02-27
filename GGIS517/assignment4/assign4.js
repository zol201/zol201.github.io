/* =========================================================
   GGIS 517 — Assignment 5 Dashboard (Leaflet + D3)
   Data:
   - GeoJSON: Top10cities.json
   - CSV: disaster.csv (supports BOTH long and wide formats)

   Interactions:
   - Click a city on the map OR a bar in Chart 1 to select a city
   - Use dropdown to filter by disaster type
   - Map + charts update together (coordinated multiple views)
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
   1) Paths (edit if you rename files)
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

let map = null;
let geoLayer = null;
const cityLayerByName = new Map(); // cityName -> Leaflet layer

/* =======================
   3) Utility
======================= */
function normalizeCityName(x) {
  // normalize common typos to keep joins consistent
  let s = String(x || "").trim();
  if (!s) return s;

  // fix the common misspelling in your dataset
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
   4) Leaflet Map
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

function baseCityStyle() {
  return {
    radius: 7,
    weight: 1,
    opacity: 1,
    fillOpacity: 0.75,
  };
}

function selectedCityStyle() {
  return {
    radius: 10,
    weight: 2,
    opacity: 1,
    fillOpacity: 0.95,
  };
}

function applyMapHighlight() {
  cityLayerByName.forEach((layer, name) => {
    if (!layer || !layer.setStyle) return;
    const isSelected = !!state.selectedCity && name === state.selectedCity;
    layer.setStyle(isSelected ? selectedCityStyle() : baseCityStyle());
  });
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
      pointToLayer: (_feature, latlng) => L.circleMarker(latlng, baseCityStyle()),
      onEachFeature: (feature, layer) => {
        const name = getCityNameFromFeatureProps(feature?.properties);
        if (name) {
          cityLayerByName.set(name, layer);
          layer.bindPopup(name);

          layer.on("click", () => {
            state.selectedCity = name;
            renderAll();
          });
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
   5) Load CSV (D3)
   Supports BOTH:
   A) Long format: City,Disaster,Count
   B) Wide format: first column = disaster type, city columns after
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

    // Clean + store
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
   6) Dropdown control
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

/* =======================
   7) Summary
======================= */
function updateSummary(rowsFiltered) {
  setText("statCity", state.selectedCity ? state.selectedCity : "All");
  setText("statDisaster", state.selectedDisaster);

  const total = d3.sum(rowsFiltered, (d) => d.count);
  setText("statTotal", String(total));
}

/* =======================
   8) Chart 1 — Total by City (vertical bar)
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
   9) Chart 2 — Disaster Breakdown (selected city)
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
   10) Render all views
======================= */
function renderAll() {
  const rowsFiltered = getFilteredRows();

  updateSummary(rowsFiltered);
  renderCityTotalChart(rowsFiltered);
  renderDisasterBreakdownChart(rowsFiltered);

  applyMapHighlight();
}

/* =======================
   11) Boot
======================= */
onReady(async function () {
  initMap();

  // Load spatial + tabular data
  await loadCitiesGeoJSON();
  await loadDisasterCSV();

  initDisasterDropdown();
  renderAll();
});
