// --- Service Worker (versioned) ---
const SW_VERSION = 'v2.0.3';
const CACHE_NAME = 'zeiterfassung-cache-' + SW_VERSION;
const CORE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/icon-192.png',
  '/icon-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(c=>c.addAll(CORE_ASSETS.map(a=>a+`?v=${SW_VERSION}`)))
      .then(()=>self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('zeiterfassung-cache-') && k!==CACHE_NAME).map(k=>caches.delete(k))))
      .then(()=>self.clients.claim())
  );
});

function networkFirst(req){
  return fetch(req).then(res=>{
    const copy = res.clone();
    caches.open(CACHE_NAME).then(c=>c.put(req, copy));
    return res;
  }).catch(()=>caches.match(req));
}

function cacheFirst(req){
  return caches.match(req).then(cached=>{
    if(cached) return cached;
    return fetch(req).then(res=>{
      const copy = res.clone();
      caches.open(CACHE_NAME).then(c=>c.put(req, copy));
      return res;
    });
  });
}

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if(e.request.method !== 'GET') return; // don't touch non-GET
  if(url.origin !== location.origin) return; // ignore external

  // NEVER cache API responses (avoid stale active/entries data)
  if(url.pathname.startsWith('/api/')){
    e.respondWith(
      fetch(e.request).catch(()=>caches.match(e.request)) // fallback only if previously in cache (likely null)
    );
    return;
  }
  // Always network-first for the shell to avoid needing hard reloads
  if(url.pathname === '/' || url.pathname === '/index.html'){
    e.respondWith(networkFirst(e.request));
    return;
  }
  // Static core assets cache-first
  if(CORE_ASSETS.includes(url.pathname)){
    e.respondWith(cacheFirst(e.request));
    return;
  }
  // For everything else: try cache, then network (runtime asset caching) BUT skip storing responses with Cache-Control: no-store
  e.respondWith(cacheFirst(e.request));
});

// Listen for manual version skip (optional message API)
self.addEventListener('message', e=>{
  if(e.data === 'SW_SKIP_WAITING') self.skipWaiting();
});
