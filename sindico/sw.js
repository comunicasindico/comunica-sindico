const CACHE_VERSION = "v1";
const CACHE_NAME = `comunica-sindico-sindico-${CACHE_VERSION}`;

const ASSETS = [
  "./",
  "./admin_simple.html",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-512-maskable.png"
];

const OFFLINE_HTML = `<!doctype html>
<html lang="pt-BR">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Comunica Síndico — Offline</title>
<style>
body{margin:0;font-family:Segoe UI,Arial;background:#061726;color:#eaf2ff;display:flex;align-items:center;justify-content:center;height:100vh}
.box{padding:20px;border-radius:16px;background:#0b1f33;max-width:420px;text-align:center}
</style>
<div class="box">
<h2>Sem internet</h2>
<p>O painel do síndico pode funcionar parcialmente offline. Assim que a conexão voltar, ele será atualizado automaticamente.</p>
</div>
</html>`;

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      cache.addAll(ASSETS);
      cache.put("./offline.html", new Response(OFFLINE_HTML,{headers:{"Content-Type":"text/html; charset=utf-8"}}));
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.map(k => k !== CACHE_NAME ? caches.delete(k) : null))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", event => {
  const req = event.request;

  // navegação (HTML)
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req,{cache:"no-store"})
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put("./admin_simple.html", copy));
          return res;
        })
        .catch(() => caches.match("./admin_simple.html") || caches.match("./offline.html"))
    );
    return;
  }

  // demais recursos
  event.respondWith(
    caches.match(req).then(cached => {
      return cached || fetch(req).then(res => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(req, copy));
        return res;
      }).catch(() => cached);
    })
  );
});
