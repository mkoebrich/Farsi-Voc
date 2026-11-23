// Offline-Cache: App-Dateien und Vokabeln merken.
// Netz zuerst: ist man online, kommt immer der neueste Stand; offline dient der Cache.
const CACHE = 'farsi-voc-v13';
const FILES = ['./', 'index.html', 'style.css', 'app.js', 'manifest.json', 'flag-iran.svg', 'flag-de.svg', 'data/vocab.json', 'data/extra.json', 'data/vocab-ergaenzung.json', 'data/vocab-kurs.json', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png'];

self.addEventListener('install', e => {
  // Jede Datei einzeln laden (am HTTP-Cache vorbei). Fehlt eine, bricht die Installation nicht ab.
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(FILES.map(f =>
    fetch(new Request(f, { cache: 'reload' })).then(r => { if (r.ok) return c.put(f, r); }).catch(() => {})
  ))));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    fetch(req, { cache: 'no-cache' }).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: true }).then(hit => hit || caches.match('index.html')))
  );
});
