/* ==========================================================
   Comunica Síndico — SW ENTERPRISE iOS AUTO UPDATE
   Atualização automática real + reload invisível
   Escopo: /comunica-sindico/
   ========================================================== */

const CACHE_NAME = "cs-enterprise-v2";

/* ============================
   INSTALL
============================ */
self.addEventListener("install", (event) => {
  self.skipWaiting();
});

/* ============================
   ACTIVATE
============================ */
self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map(k => caches.delete(k)));
    await self.clients.claim();

    // 🔥 avisa páginas abertas para recarregar
    const clients = await self.clients.matchAll({ type: "window" });
    clients.forEach(client => {
      client.postMessage({ type: "NEW_VERSION" });
    });

  })());
});

/* ============================
   FETCH
============================ */
self.addEventListener("fetch", (event) => {

  const req = event.request;
  const url = new URL(req.url);

  if (req.method !== "GET") return;
  if (url.origin !== location.origin) return;
  if (!url.pathname.startsWith("/comunica-sindico/")) return;

  /* ============================
     HTML → NETWORK ONLY (iOS SAFE)
  ============================ */
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req, { cache: "no-store" })
        .catch(() => new Response("Offline", { status: 503 }))
    );
    return;
  }

  /* ============================
     JSON → SEM CACHE
  ============================ */
  if (url.pathname.endsWith(".json")) {
    event.respondWith(
      fetch(req, { cache: "no-store" })
        .catch(() =>
          new Response("{}", {
            headers: { "Content-Type": "application/json" }
          })
        )
    );
    return;
  }

  /* ============================
     VÍDEOS → SEM CACHE
  ============================ */
  if (
    req.destination === "video" ||
    url.pathname.endsWith(".mp4") ||
    url.pathname.endsWith(".webm")
  ) {
    event.respondWith(fetch(req));
    return;
  }

  /* ============================
     OUTROS ARQUIVOS → CACHE LEVE
  ============================ */
  event.respondWith((async () => {

    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(req);

    if (cached) {
      event.waitUntil(
        fetch(req, { cache: "no-store" })
          .then(res => {
            if (res.ok) cache.put(req, res.clone());
          })
          .catch(() => {})
      );
      return cached;
    }

    try {
      const fresh = await fetch(req, { cache: "no-store" });
      if (fresh.ok) cache.put(req, fresh.clone());
      return fresh;
    } catch {
      return new Response("Offline", { status: 503 });
    }

  })());

});
