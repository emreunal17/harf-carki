// Çevrimdışı çalışma için basit önbellek. Dosyaları güncellediğinizde VERSION'ı artırın.
const VERSION = "harfcarki-v22";
const FILES = ["./", "./index.html", "./style.css", "./app.js", "./questions.js", "./speech-text.js", "./questions-extra.js", "./questions-choices.js", "./online.js", "./extras.js", "./auth.js", "./firebase-config.js", "./manifest.json", "./icon.svg"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FILES.map((f) => new Request(f, { cache: "reload" })))).then(() => self.skipWaiting()));
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
    // Aynı sitedeki dosyalarda tarayıcı önbelleğini atla: her açılışta sunucuya "değişti mi?" diye sorulur
    fetch(e.request, new URL(e.request.url).origin === location.origin ? { cache: "no-cache" } : undefined)
      .then((res) => { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(e.request, copy)); return res; })
      .catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
