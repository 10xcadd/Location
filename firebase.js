// ===========================================================
// FIREBASE / FIRESTORE LAYER
// All Firestore access for the app lives in this one file.
// Uses the Firebase v9 modular SDK loaded straight from the CDN
// (no npm/build step needed — works as-is on GitHub Pages).
// ===========================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import {
  getFirestore,
  collection,
  doc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  enableIndexedDbPersistence
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const isConfigured = firebaseConfig.apiKey && !firebaseConfig.apiKey.startsWith("YOUR_");

let app = null;
let db = null;
let firestoreReady = false;

if (isConfigured) {
  try {
    app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    // Lets saved locations stay visible/browsable offline.
    enableIndexedDbPersistence(db).catch(() => {
      // Fails silently in browsers/tabs that don't support it
      // (e.g. multiple tabs open) — app still works, just without
      // offline cache in that tab.
    });
    firestoreReady = true;
  } catch (err) {
    console.error("Firebase init failed:", err);
    firestoreReady = false;
  }
}

const LOCATIONS_COLLECTION = "locations";
const LOCAL_FALLBACK_KEY = "dls_local_locations_v1";

/** True once a real Firebase project has been configured. */
export function isFirebaseConfigured() {
  return firestoreReady;
}

// ---------- Local fallback storage ----------
// Used automatically if firebase-config.js still has placeholder
// values, so the app is fully testable before Firebase is set up.
function readLocalLocations() {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_FALLBACK_KEY) || "[]");
  } catch {
    return [];
  }
}
function writeLocalLocations(list) {
  localStorage.setItem(LOCAL_FALLBACK_KEY, JSON.stringify(list));
}

// ---------- Public data API ----------
// Every function below works the same whether Firestore is
// configured or not, so app.js never needs to branch on it.

export async function fetchLocations() {
  if (!firestoreReady) {
    return readLocalLocations();
  }
  const snap = await getDocs(collection(db, LOCATIONS_COLLECTION));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function saveNewLocation(data) {
  const payload = {
    name: data.name || "",
    shortName: data.shortName || "",
    address: data.address || "",
    latitude: data.latitude,
    longitude: data.longitude,
    category: data.category || "Other",
    notes: data.notes || ""
  };

  if (!firestoreReady) {
    const list = readLocalLocations();
    const record = {
      id: "local_" + Date.now() + "_" + Math.floor(Math.random() * 1000),
      ...payload,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    list.push(record);
    writeLocalLocations(list);
    return record;
  }

  const ref = await addDoc(collection(db, LOCATIONS_COLLECTION), {
    ...payload,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
  return { id: ref.id, ...payload };
}

export async function updateExistingLocation(id, data) {
  const payload = {
    name: data.name || "",
    shortName: data.shortName || "",
    address: data.address || "",
    latitude: data.latitude,
    longitude: data.longitude,
    category: data.category || "Other",
    notes: data.notes || ""
  };

  if (!firestoreReady) {
    const list = readLocalLocations();
    const idx = list.findIndex(l => l.id === id);
    if (idx > -1) {
      list[idx] = { ...list[idx], ...payload, updatedAt: Date.now() };
      writeLocalLocations(list);
    }
    return;
  }

  await updateDoc(doc(db, LOCATIONS_COLLECTION, id), {
    ...payload,
    updatedAt: serverTimestamp()
  });
}

export async function deleteLocationById(id) {
  if (!firestoreReady) {
    const list = readLocalLocations().filter(l => l.id !== id);
    writeLocalLocations(list);
    return;
  }
  await deleteDoc(doc(db, LOCATIONS_COLLECTION, id));
}
