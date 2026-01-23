const CACHE_NAME = "comunica-sindico-v2";

const ASSETS = [
  "./",
  "./index.html",
  "./data.json",
  "./manifest.json",
  "./versiculos.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];

// Instala e guarda o essencial
self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)));
  self.skipWaiting();
});

// Ativa e limpa caches antigos
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((k) => (k !== CACHE_NAME ? caches.delete(k) : null)))
    )
  );
  self.clients.claim();
});

// Fetch
self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Só controla o mesmo domínio
  if (url.origin !== location.origin) return;

  // ✅ 1) NÃO cachear vídeos (MP4) nem respostas parciais (Range/206)
  const isVideo = url.pathname.toLowerCase().endsWith(".mp4");
  const hasRange = req.headers.has("range");
  if (isVideo || hasRange) {
    event.respondWith(fetch(req));
    return;
  }

  // ✅ 2) JSON: network-first (sempre tenta atualizar)
  const isJson =
    url.pathname.endsWith("/data.json") ||
    url.pathname.endsWith("/versiculos.json");

  if (isJson) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          // só salva no cache se for resposta "normal" (200)
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          }
          return res;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  // ✅ 3) Demais arquivos: cache-first
  event.respondWith(caches.match(req).then((cached) => cached || fetch(req)));
});
