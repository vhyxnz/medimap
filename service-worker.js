const CACHE = "medimap-v76";
const APP_SHELL = new URL("./index.html", self.location.href).href;
const CORE_ASSETS = ["./", "./index.html", "./styles.css", "./selection.css", "./theme.css", "./expiry.css", "./bulk-edit.css", "./gondolas.css", "./categories.css", "./inventory-tools.css", "./import.css", "./settings.css", "./organize.css", "./export-arrangement.css", "./premium-mobile.css", "./xlsx.full.min.js", "./MediMap_Inventory_Import_Template.xlsx", "./MediMap_Arrangement_Import_Template.xlsx", "./app.js", "./manifest.webmanifest", "./icons.svg", "./MediMapLogoPremium.svg", "./favicon.ico", "./favicon-16.png", "./favicon-32.png", "./apple-touch-icon.png?v=4", "./icon-192.png?v=4", "./icon-512.png?v=4", "./icon-maskable-192.png?v=4", "./icon-maskable-512.png?v=4"];

async function cacheAsset(cache, asset) {
  const request = new Request(new URL(asset, self.location.href), { cache: "reload" });
  try {
    const response = await fetch(request);
    if (!response.ok) throw new Error(`${asset} returned ${response.status}`);
    await cache.put(request, response);
    return;
  } catch (networkError) {
    const previous = await caches.match(request, { ignoreSearch: true });
    if (!previous) throw networkError;
    await cache.put(request, previous);
  }
}

self.addEventListener("install", (event) => event.waitUntil((async () => {
  const cache = await caches.open(CACHE);
  await Promise.all(CORE_ASSETS.map((asset) => cacheAsset(cache, asset)));
})()));

self.addEventListener("activate", (event) => event.waitUntil((async () => {
  const keys = await caches.keys();
  await Promise.all(keys.filter((key) => key.startsWith("medimap-") && key !== CACHE).map((key) => caches.delete(key)));
  await self.clients.claim();
})()));

self.addEventListener("message", (event) => { if (event.data === "SKIP_WAITING") self.skipWaiting(); });

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    const refresh = fetch(request).then(async (response) => {
      if (response.ok) await (await caches.open(CACHE)).put(APP_SHELL, response.clone());
      return response;
    });
    event.waitUntil(refresh.catch(() => undefined));
    event.respondWith(caches.match(APP_SHELL).then((cachedShell) => cachedShell || refresh));
    return;
  }

  event.respondWith((async () => {
    const cached = await caches.match(request);
    if (cached) return cached;
    const response = await fetch(request);
    if (response.ok) await (await caches.open(CACHE)).put(request, response.clone());
    return response;
  })());
});
