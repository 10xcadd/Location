# Delivery Location Sender

A simple, mobile-first tool for sending the exact pin of a college, office,
shop, or delivery destination to a delivery agent on WhatsApp in a couple of
taps. Built as a PWA — installable on Android, works from GitHub Pages, no
backend server to run.

The workflow it's built for: **Search → Tap the place → Tap WhatsApp.**

---

## 1. Try it right now (no setup needed)

You can open `index.html` directly, or deploy it to GitHub Pages, and it will
work immediately using **local test mode**: it saves data in your phone/
browser's local storage instead of Firestore, and comes pre-loaded with 5
sample colleges so you can test the full flow before setting up Firebase.

You'll see a small banner at the top saying Firebase isn't configured yet —
that's expected until you complete Step 2. Nothing else is disabled.

---

## 2. Set up Firebase (so your data syncs across devices)

1. Go to [console.firebase.google.com](https://console.firebase.google.com)
   and click **Add project**. Give it any name (e.g. "delivery-locations").
   You can turn off Google Analytics for this project — not needed.
2. Once the project is created, click the **web icon (`</>`)** on the project
   overview page to register a new web app. Give it a nickname, click
   **Register app**. You do *not* need Firebase Hosting.
3. Firebase will show you a `firebaseConfig` object. Copy the values (apiKey,
   authDomain, projectId, etc.).
4. Open **`firebase-config.js`** in this project and paste your values in,
   replacing the placeholder `"YOUR_..."` strings.
5. In the Firebase Console, go to **Build → Firestore Database → Create
   database**. Choose **Start in production mode** and pick a region close to
   you (e.g. `asia-south1` for India).
6. Go to the **Rules** tab of Firestore and set:

   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /locations/{docId} {
         allow read, write: if true;
       }
     }
   }
   ```

   > ⚠️ `allow read, write: if true` means anyone with your app's URL can read
   > and edit your saved locations. That's fine for a **private personal
   > tool** you're not sharing publicly, which is what this was built for.
   > If you ever share the link publicly, add Firebase Authentication and
   > tighten these rules — ask if you'd like help with that later.

7. Reload the app. The "Firebase isn't set up" banner should disappear, and
   your saved locations now live in Firestore instead of just your device.

**Note on the API key:** a Firebase *web* `apiKey` is not a secret the way a
server API key is — it's fine for it to be visible in your GitHub Pages code.
Firestore Security Rules (step 6) are what actually control access, not the
key being hidden.

---

## 3. Deploy to GitHub Pages

1. Create a new GitHub repository and push all the files in this project to
   it (keep the folder structure as-is).
2. In the repo, go to **Settings → Pages**.
3. Under **Build and deployment**, set **Source** to "Deploy from a branch",
   pick your main branch and the `/ (root)` folder, then **Save**.
4. GitHub will give you a URL like
   `https://your-username.github.io/your-repo-name/`. It can take a minute
   to go live.
5. Open that URL on your phone.

---

## 4. Install it on Android (so it feels like a real app)

1. Open your GitHub Pages URL in **Chrome** on your Android phone.
2. Tap the **⋮** menu → **Add to Home screen** (or Chrome may show an
   automatic "Install app" prompt/banner).
3. Confirm. The app icon now appears on your home screen and opens full-
   screen, without browser address bars.

(On iPhone: open in Safari → Share icon → **Add to Home Screen**.)

---

## 5. Add your first real college/location

1. Open the app → tap the **+** button (bottom-right) or the ⚙️ Manage
   screen → **+**.
2. Fill in **Location Name** and **Address**.
3. Tap **📍 Pick Location From Map** — search for the place or drag the pin
   to the exact gate/entrance, then **Confirm This Location**. This is what
   makes the WhatsApp pin land on the exact building instead of a nearby
   same-named place.
4. Pick a **Category** (College, Office, Shop, etc.) — optional but makes
   filtering easier later.
5. Tap **Save Location**.

### Adding many locations at once (CSV import)

Go to ⚙️ **Manage Locations → Import CSV**. Your file needs these columns,
in this order, with a header row:

```
Name,Address,Latitude,Longitude,Category
Maharashtra College,"246-A, Jahangir Boman Behram Marg, Nagpada, Mumbai",18.9678,72.8331,College
Anjuman Islam College,"Dr. D. N. Road, Fort, Mumbai",,,College
```

Leave Latitude/Longitude blank if you don't have them yet — you can pick the
pin later by editing the location. Use **Export CSV** any time to back up
everything you've saved.

---

## 6. Sending a location on WhatsApp

1. On the home screen, type part of the name in the search box (e.g.
   "Maharashtra").
2. Tap the location card.
3. Tap **📲 Send WhatsApp** (from the card directly, or from the details
   screen).
4. WhatsApp opens with the message already written — name, address, and the
   Google Maps link — and lets you pick which contact or group to send it to.

If a location doesn't have exact coordinates saved yet, the app will still
send the address as text, but will warn you to add a pin for better
accuracy.

---

## Project structure

```
/
├── index.html          Screens: home, details, manage, add/edit form, map picker
├── style.css            All styling (mobile-first)
├── app.js                App logic: search, CRUD, WhatsApp/Maps links, CSV, map picker
├── firebase.js           Firestore read/write helpers (falls back to local storage if unconfigured)
├── firebase-config.js     Your Firebase project keys go here
├── manifest.json          PWA install metadata
├── service-worker.js      Offline app-shell caching
├── icons/                 App icons (192px, 512px, plus maskable versions)
└── README.md
```

## What this app deliberately does NOT do

No user accounts, no CRM, no delivery/route management, no payments, no
analytics, no chat, no push notifications, no live tracking. It does one
thing — get a saved pin onto WhatsApp in a couple of taps — on purpose.

## Notes on the map picker

The "Pick Location From Map" screen uses **Leaflet + OpenStreetMap** for the
map itself and **Nominatim** for place search — both free, no API key or
billing needed. The "Open Google Maps" and "Send WhatsApp" buttons just build
a plain `google.com/maps?q=lat,lng` link, which also needs no API key — it's
a link, not an embedded map.
