// ===========================================================
// APP LOGIC
// Home list → search/filter → details → WhatsApp/Maps.
// Manage screen → add/edit/delete/import/export.
// Map picker → Leaflet + OpenStreetMap (no paid API key needed).
// ===========================================================

import {
  isFirebaseConfigured,
  fetchLocations,
  saveNewLocation,
  updateExistingLocation,
  deleteLocationById
} from "./firebase.js";

// ---------- Demo data (used only the very first time, if the
// store is empty, so the app is testable immediately) ----------
const DEMO_LOCATIONS = [
  { name: "Maharashtra College", shortName: "Maharashtra Coll.", address: "246-A, Jahangir Boman Behram Marg, Nagpada, Mumbai", latitude: 18.9678, longitude: 72.8331, category: "College", notes: "Demo data — edit or delete me." },
  { name: "Anjuman Islam College", shortName: "Anjuman Islam", address: "Dr. D. N. Road, Fort, Mumbai", latitude: null, longitude: null, category: "College", notes: "Demo data — pick exact pin on the map." },
  { name: "Akbar Peerbhoy College", shortName: "Akbar Peerbhoy", address: "Grant Road, Mumbai", latitude: null, longitude: null, category: "College", notes: "Demo data — pick exact pin on the map." },
  { name: "Siddharth College", shortName: "Siddharth Coll.", address: "Anand Bhavan, C D Deshmukh Marg, Fort, Mumbai", latitude: null, longitude: null, category: "College", notes: "Demo data — pick exact pin on the map." },
  { name: "Bharda College", shortName: "Bharda Coll.", address: "New Marine Lines, Mumbai", latitude: null, longitude: null, category: "College", notes: "Demo data — pick exact pin on the map." }
];
const SEEDED_FLAG_KEY = "dls_seeded_v1";

// ---------- State ----------
let allLocations = [];
let activeCategory = "all";
let activeSearch = "";
let editingId = null;
let currentDetailsId = null;
let pickerMap = null;
let pickerMarker = null;
let pickerLat = null;
let pickerLng = null;
let liveSearchTimer = null;
let liveSearchAbort = null;
let liveSearchSeq = 0;

// ---------- DOM refs ----------
const $ = (id) => document.getElementById(id);
const locationList = $("locationList");
const manageList = $("manageList");
const emptyState = $("emptyState");
const listLabel = $("listLabel");

// ===========================================================
// INIT
// ===========================================================
init();

async function init() {
  registerServiceWorker();
  wireStaticEvents();

  if (!isFirebaseConfigured()) {
    showConnBanner("⚠️ Firebase isn't set up yet — running in local test mode (data stays on this device only). See README.md.");
  }

  await loadAndSeed();
  render();
}

async function loadAndSeed() {
  try {
    allLocations = await fetchLocations();
    const alreadySeeded = localStorage.getItem(SEEDED_FLAG_KEY);
    if (allLocations.length === 0 && !alreadySeeded) {
      for (const demo of DEMO_LOCATIONS) {
        const saved = await saveNewLocation(demo);
        allLocations.push(saved);
      }
      localStorage.setItem(SEEDED_FLAG_KEY, "1");
    }
  } catch (err) {
    console.error(err);
    showConnBanner("⚠️ Could not reach the database right now. Showing whatever is available offline.");
  }
}

// ===========================================================
// RENDERING — HOME LIST
// ===========================================================
function getFilteredLocations() {
  const q = activeSearch.trim().toLowerCase();
  return allLocations.filter(loc => {
    const matchesCategory = activeCategory === "all" || loc.category === activeCategory;
    if (!matchesCategory) return false;
    if (!q) return true;
    const haystack = `${loc.name} ${loc.shortName || ""} ${loc.address || ""}`.toLowerCase();
    return haystack.includes(q);
  });
}

function render() {
  const filtered = getFilteredLocations();
  listLabel.textContent = activeSearch ? "Search Results" : "Frequently Used Locations";

  locationList.innerHTML = "";
  emptyState.classList.toggle("hidden", allLocations.length > 0);

  if (allLocations.length > 0 && filtered.length === 0) {
    const p = document.createElement("p");
    p.className = "empty-body";
    p.style.padding = "20px 4px";
    p.textContent = "No locations match your search.";
    locationList.appendChild(p);
  }

  filtered.forEach(loc => locationList.appendChild(buildLocationCard(loc)));
  renderManageList();
}

function buildLocationCard(loc) {
  const card = document.createElement("div");
  card.className = "loc-card";
  card.tabIndex = 0;

  const hasPin = hasValidCoords(loc);

  card.innerHTML = `
    <div class="loc-card-top">
      <div class="loc-name">${escapeHtml(loc.name)}</div>
      <div class="loc-cat">${escapeHtml(loc.category || "Other")}</div>
    </div>
    <div class="loc-address">${escapeHtml(loc.address || "No address saved")}</div>
    ${!hasPin ? `<div class="loc-no-pin">⚠️ No exact pin yet</div>` : ""}
    <div class="loc-actions">
      <button class="btn btn-map" data-action="map">📍 Open Map</button>
      <button class="btn btn-whatsapp" data-action="whatsapp">📲 WhatsApp</button>
    </div>
  `;

  card.addEventListener("click", (e) => {
    const actionBtn = e.target.closest("[data-action]");
    if (actionBtn) {
      e.stopPropagation();
      if (actionBtn.dataset.action === "map") openInGoogleMaps(loc);
      if (actionBtn.dataset.action === "whatsapp") sendOnWhatsapp(loc);
      return;
    }
    openDetails(loc.id);
  });

  return card;
}

function hasValidCoords(loc) {
  return typeof loc.latitude === "number" && typeof loc.longitude === "number"
    && !Number.isNaN(loc.latitude) && !Number.isNaN(loc.longitude);
}

function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, s => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[s]));
}

// ===========================================================
// GOOGLE MAPS + WHATSAPP
// ===========================================================
function googleMapsLink(loc) {
  if (hasValidCoords(loc)) {
    return `https://www.google.com/maps?q=${loc.latitude},${loc.longitude}`;
  }
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(loc.address || loc.name)}`;
}

function openInGoogleMaps(loc) {
  if (!hasValidCoords(loc)) {
    toast("⚠️ This location does not have coordinates yet. Please pick the exact location on the map.");
  }
  window.open(googleMapsLink(loc), "_blank", "noopener");
}

function whatsappMessage(loc) {
  // Send ONLY the link — no name/address lines above it. WhatsApp
  // auto-generates a single map preview card from the link itself,
  // the same way it does when you paste any Google Maps link, so the
  // chat shows one tappable card instead of text plus a separate card.
  return googleMapsLink(loc);
}

function sendOnWhatsapp(loc) {
  if (!hasValidCoords(loc)) {
    toast("⚠️ No exact pin saved — sharing the address text instead. Add a pin for accuracy.");
  }
  const text = encodeURIComponent(whatsappMessage(loc));
  window.open(`https://wa.me/?text=${text}`, "_blank", "noopener");
}

// ===========================================================
// DETAILS SCREEN
// ===========================================================
function openDetails(id) {
  const loc = allLocations.find(l => l.id === id);
  if (!loc) return;
  currentDetailsId = id;

  $("detailsName").textContent = loc.name;
  $("detailsCategory").textContent = loc.category || "Other";
  $("detailsAddress").textContent = loc.address || "No address saved";
  $("detailsLat").textContent = hasValidCoords(loc) ? loc.latitude : "Not set";
  $("detailsLng").textContent = hasValidCoords(loc) ? loc.longitude : "Not set";
  $("detailsNotes").textContent = loc.notes || "";
  $("detailsNotes").classList.toggle("hidden", !loc.notes);

  showScreen("detailsScreen");
}

function currentDetailsLoc() {
  return allLocations.find(l => l.id === currentDetailsId);
}

// ===========================================================
// ADD / EDIT FORM
// ===========================================================
function openForm(loc = null) {
  editingId = loc ? loc.id : null;
  $("formTitle").textContent = loc ? "Edit Location" : "Add Location";
  $("formId").value = loc ? loc.id : "";
  $("formName").value = loc ? loc.name || "" : "";
  $("formShortName").value = loc ? loc.shortName || "" : "";
  $("formAddress").value = loc ? loc.address || "" : "";
  $("formLat").value = loc && hasValidCoords(loc) ? loc.latitude : "";
  $("formLng").value = loc && hasValidCoords(loc) ? loc.longitude : "";
  $("formCategory").value = loc ? loc.category || "Other" : "College";
  $("formNotes").value = loc ? loc.notes || "" : "";
  updateCoordHint();
  showScreen("formScreen");
}

function updateCoordHint() {
  const lat = $("formLat").value;
  const lng = $("formLng").value;
  $("coordHint").textContent = (lat && lng)
    ? "✓ Exact pin saved. The Google Maps link will point straight to this spot."
    : "No coordinates yet — pick the exact spot on the map for an accurate pin.";
}

async function handleFormSubmit(e) {
  e.preventDefault();
  const name = $("formName").value.trim();
  if (!name) {
    toast("⚠️ Location name is required.");
    return;
  }

  const latRaw = $("formLat").value;
  const lngRaw = $("formLng").value;
  let latitude = latRaw === "" ? null : parseFloat(latRaw);
  let longitude = lngRaw === "" ? null : parseFloat(lngRaw);

  if ((latRaw !== "" && Number.isNaN(latitude)) || (lngRaw !== "" && Number.isNaN(longitude))) {
    toast("⚠️ Coordinates look invalid. Please pick the location on the map instead.");
    return;
  }
  if (latitude !== null && (latitude < -90 || latitude > 90)) {
    toast("⚠️ Latitude must be between -90 and 90.");
    return;
  }
  if (longitude !== null && (longitude < -180 || longitude > 180)) {
    toast("⚠️ Longitude must be between -180 and 180.");
    return;
  }

  const data = {
    name,
    shortName: $("formShortName").value.trim(),
    address: $("formAddress").value.trim(),
    latitude, longitude,
    category: $("formCategory").value,
    notes: $("formNotes").value.trim()
  };

  const submitBtn = e.target.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  const originalLabel = submitBtn.textContent;
  submitBtn.textContent = "Saving...";

  try {
    if (editingId) {
      await updateExistingLocation(editingId, data);
      const idx = allLocations.findIndex(l => l.id === editingId);
      if (idx > -1) allLocations[idx] = { ...allLocations[idx], ...data };
      toast("Saved changes.");
    } else {
      const saved = await saveNewLocation(data);
      allLocations.push(saved);
      toast("Location saved.");
    }
    render();
    closeScreen("formScreen");
    if (currentDetailsId === editingId) openDetails(editingId);
  } catch (err) {
    console.error(err);
    toast("⚠️ Could not save this location. Check your connection and try again.");
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = originalLabel;
  }
}

async function handleDelete(id) {
  const loc = allLocations.find(l => l.id === id);
  if (!loc) return;
  const ok = window.confirm(`Delete "${loc.name}"? This can't be undone.`);
  if (!ok) return;

  try {
    await deleteLocationById(id);
    allLocations = allLocations.filter(l => l.id !== id);
    render();
    toast("Location deleted.");
    if (currentDetailsId === id) closeScreen("detailsScreen");
  } catch (err) {
    console.error(err);
    toast("⚠️ Could not delete this location. Please try again.");
  }
}

// ===========================================================
// MANAGE SCREEN
// ===========================================================
function renderManageList() {
  if (!manageList) return;
  manageList.innerHTML = "";
  allLocations.forEach(loc => {
    const card = document.createElement("div");
    card.className = "loc-card";
    card.innerHTML = `
      <div class="loc-card-top">
        <div class="loc-name">${escapeHtml(loc.name)}</div>
        <div class="loc-cat">${escapeHtml(loc.category || "Other")}</div>
      </div>
      <div class="loc-address">${escapeHtml(loc.address || "No address saved")}</div>
      ${!hasValidCoords(loc) ? `<div class="loc-no-pin">⚠️ No exact pin yet</div>` : ""}
      <div class="manage-card-actions">
        <button class="btn btn-secondary btn-sm" data-action="edit">✏️ Edit</button>
        <button class="btn btn-danger btn-sm" data-action="delete">🗑️ Delete</button>
      </div>
    `;
    card.querySelector('[data-action="edit"]').addEventListener("click", () => openForm(loc));
    card.querySelector('[data-action="delete"]').addEventListener("click", () => handleDelete(loc.id));
    manageList.appendChild(card);
  });
}

// ===========================================================
// CSV IMPORT / EXPORT
// ===========================================================
function exportCsv() {
  const header = "Name,Address,Latitude,Longitude,Category";
  const rows = allLocations.map(loc => [
    csvEscape(loc.name),
    csvEscape(loc.address || ""),
    hasValidCoords(loc) ? loc.latitude : "",
    hasValidCoords(loc) ? loc.longitude : "",
    csvEscape(loc.category || "Other")
  ].join(","));
  const csv = [header, ...rows].join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "delivery-locations.csv";
  a.click();
  URL.revokeObjectURL(url);
}

function csvEscape(val) {
  const s = String(val ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function parseCsv(text) {
  // Minimal CSV parser: handles quoted fields with commas/newlines.
  const rows = [];
  let row = [], field = "", inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ",") { row.push(field); field = ""; }
      else if (c === "\n" || c === "\r") {
        if (field !== "" || row.length) { row.push(field); rows.push(row); row = []; field = ""; }
        if (c === "\r" && text[i + 1] === "\n") i++;
      } else field += c;
    }
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows.filter(r => r.length && r.some(cell => cell.trim() !== ""));
}

async function importCsvFile(file) {
  const text = await file.text();
  const rows = parseCsv(text);
  if (rows.length < 2) {
    toast("⚠️ That CSV file looks empty.");
    return;
  }

  const header = rows[0].map(h => h.trim().toLowerCase());
  const idx = {
    name: header.indexOf("name"),
    address: header.indexOf("address"),
    latitude: header.indexOf("latitude"),
    longitude: header.indexOf("longitude"),
    category: header.indexOf("category")
  };
  if (idx.name === -1) {
    toast('⚠️ CSV must have a "Name" column. Expected: Name,Address,Latitude,Longitude,Category');
    return;
  }

  let imported = 0, skipped = 0;
  for (const r of rows.slice(1)) {
    const name = (r[idx.name] || "").trim();
    if (!name) { skipped++; continue; }
    const lat = idx.latitude > -1 ? parseFloat(r[idx.latitude]) : NaN;
    const lng = idx.longitude > -1 ? parseFloat(r[idx.longitude]) : NaN;
    const data = {
      name,
      shortName: name,
      address: idx.address > -1 ? (r[idx.address] || "").trim() : "",
      latitude: Number.isNaN(lat) ? null : lat,
      longitude: Number.isNaN(lng) ? null : lng,
      category: idx.category > -1 && r[idx.category] ? r[idx.category].trim() : "Other",
      notes: ""
    };
    try {
      const saved = await saveNewLocation(data);
      allLocations.push(saved);
      imported++;
    } catch {
      skipped++;
    }
  }
  render();
  toast(`Imported ${imported} location${imported === 1 ? "" : "s"}${skipped ? `, skipped ${skipped}` : ""}.`);
}

// ===========================================================
// MAP PICKER (Leaflet + OpenStreetMap — no paid API key)
// ===========================================================
function openMapPicker() {
  showScreen("mapPickerScreen");

  const startLat = parseFloat($("formLat").value) || 19.0760;
  const startLng = parseFloat($("formLng").value) || 72.8777;

  setTimeout(() => {
    if (!pickerMap) {
      pickerMap = L.map("pickerMap").setView([startLat, startLng], 15);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "&copy; OpenStreetMap contributors"
      }).addTo(pickerMap);

      pickerMarker = L.marker([startLat, startLng], { draggable: true }).addTo(pickerMap);
      pickerMarker.on("dragend", () => {
        const pos = pickerMarker.getLatLng();
        setPickerCoords(pos.lat, pos.lng);
      });
      pickerMap.on("click", (e) => {
        pickerMarker.setLatLng(e.latlng);
        setPickerCoords(e.latlng.lat, e.latlng.lng);
      });
    } else {
      pickerMap.invalidateSize();
      pickerMap.setView([startLat, startLng], 15);
      pickerMarker.setLatLng([startLat, startLng]);
    }
    setPickerCoords(startLat, startLng);
  }, 50);
}

function setPickerCoords(lat, lng) {
  pickerLat = lat;
  pickerLng = lng;
  $("pickerLatLabel").textContent = `Lat: ${lat.toFixed(6)}`;
  $("pickerLngLabel").textContent = `Lng: ${lng.toFixed(6)}`;
}

async function searchOnPickerMap() {
  const q = $("mapSearchInput").value.trim();
  if (!q) return;
  try {
    const results = await geocodePlaces(q, 1);
    if (!results.length) {
      toast("No results found for that search.");
      return;
    }
    const { lat, lon } = results[0];
    pickerMap.setView([lat, lon], 16);
    pickerMarker.setLatLng([lat, lon]);
    setPickerCoords(lat, lon);
  } catch (err) {
    console.error(err);
    toast("⚠️ Place search failed. Check your internet connection.");
  }
}

// ---------- Shared geocoding helper (Nominatim — free, no API key) ----------
// Biased toward Mumbai (viewbox) but not hard-restricted, so it still
// works if you search a place in another city.
const MUMBAI_VIEWBOX = "72.75,19.30,73.05,18.85"; // left,top,right,bottom
async function geocodePlaces(query, limit = 6, signal) {
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=${limit}` +
    `&countrycodes=in&viewbox=${MUMBAI_VIEWBOX}&q=${encodeURIComponent(query)}`;
  const res = await fetch(url, { signal });
  const raw = await res.json();
  return raw.map(r => ({
    name: (r.display_name || query).split(",")[0].trim(),
    address: r.display_name || "",
    lat: parseFloat(r.lat),
    lon: parseFloat(r.lon)
  }));
}

// ===========================================================
// LIVE SEARCH (home screen) — for places NOT yet saved.
// Kicks in whenever the saved-location search box is used, so
// typing any college/place name finds it even on the first try.
// ===========================================================
function scheduleLiveSearch(query) {
  clearTimeout(liveSearchTimer);
  if (liveSearchAbort) liveSearchAbort.abort();

  const q = query.trim();
  if (q.length < 3) {
    $("liveSearchSection").classList.add("hidden");
    return;
  }

  liveSearchTimer = setTimeout(() => runLiveSearch(q), 450);
}

async function runLiveSearch(query) {
  const mySeq = ++liveSearchSeq;
  const section = $("liveSearchSection");
  const list = $("liveSearchList");
  const status = $("liveSearchStatus");

  section.classList.remove("hidden");
  status.classList.remove("hidden");
  status.textContent = "Searching nearby places...";
  list.innerHTML = "";

  liveSearchAbort = new AbortController();
  try {
    const results = await geocodePlaces(query, 6, liveSearchAbort.signal);
    if (mySeq !== liveSearchSeq) return; // a newer search started; drop this one

    if (!navigator.onLine) {
      status.textContent = "⚠️ You're offline — live place search needs internet.";
      return;
    }
    if (!results.length) {
      status.textContent = "No matching places found. Try a shorter or different spelling.";
      return;
    }
    status.classList.add("hidden");
    results.forEach(r => list.appendChild(buildLiveResultCard(r)));
  } catch (err) {
    if (err.name === "AbortError") return;
    console.error(err);
    status.textContent = "⚠️ Place search failed. Check your internet connection.";
  }
}

function buildLiveResultCard(result) {
  const card = document.createElement("div");
  card.className = "loc-card is-unsaved";
  card.innerHTML = `
    <div class="loc-card-top">
      <div class="loc-name">${escapeHtml(result.name)}</div>
    </div>
    <div class="loc-address">${escapeHtml(result.address)}</div>
    <div class="loc-unsaved-tag">Not saved yet</div>
    <div class="loc-actions">
      <button class="btn btn-map" data-action="map">📍 Open Map</button>
      <button class="btn btn-whatsapp" data-action="whatsapp">📲 WhatsApp</button>
      <button class="btn btn-save" data-action="save" title="Save for next time">💾</button>
    </div>
  `;
  const asLoc = { name: result.name, address: result.address, latitude: result.lat, longitude: result.lon, category: "Other", notes: "" };

  card.querySelector('[data-action="map"]').addEventListener("click", () => openInGoogleMaps(asLoc));
  card.querySelector('[data-action="whatsapp"]').addEventListener("click", () => sendOnWhatsapp(asLoc));
  card.querySelector('[data-action="save"]').addEventListener("click", async (e) => {
    e.target.disabled = true;
    try {
      const saved = await saveNewLocation(asLoc);
      allLocations.push(saved);
      render();
      toast("Saved — you'll find it instantly next time.");
    } catch (err) {
      console.error(err);
      toast("⚠️ Could not save this location right now.");
      e.target.disabled = false;
    }
  });
  return card;
}

function confirmPin() {
  if (pickerLat === null || pickerLng === null) return;
  $("formLat").value = pickerLat.toFixed(6);
  $("formLng").value = pickerLng.toFixed(6);
  updateCoordHint();
  closeScreen("mapPickerScreen");
  showScreen("formScreen");
}

// ===========================================================
// SCREEN / MODAL HELPERS
// ===========================================================
function showScreen(id) {
  document.querySelectorAll(".overlay-screen").forEach(el => el.classList.add("hidden"));
  $(id).classList.remove("hidden");
}
function closeScreen(id) {
  $(id).classList.add("hidden");
}

let toastTimer = null;
function toast(msg) {
  const el = $("toast");
  el.textContent = msg;
  el.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add("hidden"), 3200);
}

function showConnBanner(msg) {
  const el = $("connBanner");
  el.textContent = msg;
  el.classList.remove("hidden");
}

// ===========================================================
// EVENT WIRING
// ===========================================================
function wireStaticEvents() {
  $("searchInput").addEventListener("input", (e) => {
    activeSearch = e.target.value;
    render();
    scheduleLiveSearch(activeSearch);
  });

  $("categoryFilters").addEventListener("click", (e) => {
    const chip = e.target.closest(".chip");
    if (!chip) return;
    activeCategory = chip.dataset.cat;
    document.querySelectorAll(".chip").forEach(c => c.classList.toggle("is-active", c === chip));
    render();
  });

  $("fabAdd").addEventListener("click", () => openForm(null));
  $("emptyAddBtn").addEventListener("click", () => openForm(null));
  $("manageBtn").addEventListener("click", () => { renderManageList(); showScreen("manageScreen"); });
  $("manageAddBtn").addEventListener("click", () => openForm(null));

  document.querySelectorAll("[data-close]").forEach(btn => {
    btn.addEventListener("click", () => closeScreen(btn.dataset.close));
  });

  // Details screen actions
  $("detailsMapBtn").addEventListener("click", () => openInGoogleMaps(currentDetailsLoc()));
  $("detailsWhatsappBtn").addEventListener("click", () => sendOnWhatsapp(currentDetailsLoc()));
  $("detailsCopyBtn").addEventListener("click", async () => {
    const loc = currentDetailsLoc();
    if (!loc) return;
    try {
      await navigator.clipboard.writeText(googleMapsLink(loc));
      toast("Location link copied.");
    } catch {
      toast("⚠️ Could not copy automatically — long-press the link in Maps instead.");
    }
  });
  $("detailsEditBtn").addEventListener("click", () => openForm(currentDetailsLoc()));
  $("detailsDeleteBtn").addEventListener("click", () => handleDelete(currentDetailsId));

  // Form
  $("locationForm").addEventListener("submit", handleFormSubmit);
  $("formLat").addEventListener("input", updateCoordHint);
  $("formLng").addEventListener("input", updateCoordHint);
  $("pickOnMapBtn").addEventListener("click", openMapPicker);

  // Map picker
  $("mapPickerCancel").addEventListener("click", () => { closeScreen("mapPickerScreen"); showScreen("formScreen"); });
  $("mapSearchBtn").addEventListener("click", searchOnPickerMap);
  $("mapSearchInput").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); searchOnPickerMap(); } });
  $("confirmPinBtn").addEventListener("click", confirmPin);

  // Import / export
  $("importBtn").addEventListener("click", () => $("importFile").click());
  $("importFile").addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (file) importCsvFile(file);
    e.target.value = "";
  });
  $("exportBtn").addEventListener("click", exportCsv);

  window.addEventListener("online", () => $("connBanner").classList.add("hidden"));
  window.addEventListener("offline", () => showConnBanner("⚠️ You're offline. Saved locations are still viewable; changes will sync once you're back online."));
}

// ===========================================================
// PWA SERVICE WORKER
// ===========================================================
function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("service-worker.js").catch(err => {
      console.warn("Service worker registration failed:", err);
    });
  }
}
