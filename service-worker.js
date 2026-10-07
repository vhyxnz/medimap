const CACHE = "medimap-v74";
const ASSETS = ["./", "./index.html", "./styles.css", "./selection.css", "./theme.css", "./expiry.css", "./bulk-edit.css", "./gondolas.css", "./categories.css", "./inventory-tools.css", "./import.css", "./settings.css", "./organize.css", "./export-arrangement.css", "./premium-mobile.css", "./xlsx.full.min.js", "./MediMap_Inventory_Import_Template.xlsx", "./MediMap_Arrangement_Import_Template.xlsx", "./app.js", "./manifest.webmanifest", "./icon.svg", "./icons.svg", "./MediFindLogo.png", "./MediMapLogoPremium.svg", "./MediMapLogoPremium.png", "./favicon.ico", "./favicon-16.png", "./favicon-32.png", "./apple-touch-icon.png?v=4", "./icon-192.png?v=4", "./icon-512.png?v=4", "./icon-maskable-192.png?v=4", "./icon-maskable-512.png?v=4"];

self.addEventListener("install", (event) => event.waitUntil((async () => {
  const cache = await caches.open(CACHE);
  const results = await Promise.allSettled(ASSETS.map(async (asset) => {
    const request = new Request(new URL(asset, self.location.href), { cache: "reload" });
    const response = await fetch(request);
    if (!response.ok) throw new Error(`${asset} returned ${response.status}`);
    await cache.put(request, response);
  }));
  results.forEach((result, index) => { if (result.status === "rejected") console.warn(`MediMap could not precache ${ASSETS[index]}`, result.reason); });
})));
self.addEventListener("activate", (event) => event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith("medimap-") && key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim())));
self.addEventListener("message", (event) => { if (event.data === "SKIP_WAITING") self.skipWaiting(); });
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET" || new URL(event.request.url).origin !== self.location.origin) return;
  if (event.request.mode === "navigate") { event.respondWith(fetch(event.request).then((response) => { const copy = response.clone(); caches.open(CACHE).then((cache) => cache.put("./index.html", copy)); return response; }).catch(() => caches.match("./index.html"))); return; }
  event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => { if (response.ok) { const copy = response.clone(); caches.open(CACHE).then((cache) => cache.put(event.request, copy)); } return response; })));
});
