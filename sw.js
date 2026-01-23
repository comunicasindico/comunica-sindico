const CACHE_NAME = "comunica-sindico-v1";

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
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
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

// Estratégia: Network-first para JSON, Cache-first para o resto
self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // só arquivos do próprio site
  if (url.origin !== self.location.origin) return;

  const isJson =
    url.pathname.endsWith("/data.json") ||
    url.pathname.endsWith("/versiculos.json");

  // JSON: tenta rede primeiro
  if (isJson) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          return res;
        })
        .catch(async () => (await caches.match(req)) || new Response("{}", {
          headers: { "Content-Type": "application/json" }
        }))
    );
    return;
  }

  // Demais arquivos: cache primeiro, depois rede, fallback no index.html
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;

      return fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          return res;
        })
        .catch(() => caches.match("./index.html"));
    })
  );
});
