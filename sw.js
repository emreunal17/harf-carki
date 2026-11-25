// Çevrimdışı çalışma için basit önbellek. Dosyaları güncellediğinizde VERSION'ı artırın.
const VERSION = "harfcarki-v5";
const FILES = ["./", "./index.html", "./style.css", "./app.js", "./questions.js", "./speech-text.js", "./auth.js", "./firebase-config.js", "./manifest.json", "./icon.svg"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
// Önce ağ, olmazsa önbellek (soruları güncellediğinizde hemen görünsün diye)
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  e.respondWith(
    fetch(e.request)
      .then((res) => { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(e.request, copy)); return res; })
      .catch(() => caches.match(e.request))
  );
});
