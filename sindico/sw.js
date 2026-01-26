/* ==========================================================
   Comunica Síndico — sw.js (SÍNDICO) BLINDADO — PWA Launcher
   - Escopo exclusivo: /sindico/
   - Cache versionado independente
   - HTML: network-first + fallback offline
   - Não cacheia requests cross-domain (script.google.com)
   ========================================================== */

const CACHE_VERSION = "v3";
const CACHE_NAME = `cs-sindico-${CACHE_VERSION}`;

const ASSETS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-512-maskable.png"
];

const OFFLINE_HTML = `<!doctype html>
<html lang="pt-BR"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Síndico(a) — Offline</title>
<style>
  body{margin:0;font-family:Segoe UI,Arial,sans-serif;background:#061726;color:#eaf2ff;display:flex;min-height:100vh;align-items:center;justify-content:center}
  .c{max-width:520px;padding:22px;border:1px solid rgba(255,255,255,.12);border-radius:16px;background:rgba(12,35,56,.35)}
  h1{margin:0 0 10px;font-size:20px}
  p{margin:0;opacity:.85;line-height:1.35}
</style>
<div class="c">
  <h1>Sem internet no momento</h1>
  <p>O app do Síndico abre, mas o painel online (Apps Script) precisa de conexão.</p>
</div></html>`;

function sameOrigin(url) {
  return url.origin === self.location.origin;
}
function isNavigation(req) {
  return req.mode === "navigate";
}

async function addAllSafe(cache, assets) {
  await Promise.all(
    assets.map(async (path) => {
      try {
        const res = await fetch(new Request(path, { cache: "reload" }));
        if (res && res.ok) await cache.put(path, res.clone());
      } catch (_) {}
    })
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      await addAllSafe(cache, ASSETS);
      await cache.put(
        "./offline.html",
        new Response(OFFLINE_HTML, { headers: { "Content-Type": "text/html; charset=utf-8" } })
      );
    })()
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => (k !== CACHE_NAME ? caches.delete(k) : null)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // ✅ Somente mesmo domínio (GitHub Pages). Apps Script é outro domínio -> deixa passar.
  if (!sameOrigin(url)) return;

  if (isNavigation(req)) {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(req, { cache: "no-store" });
          const cache = await caches.open(CACHE_NAME);
          cache.put(req, fresh.clone());
          return fresh;
        } catch {
          const cachedNav = await caches.match(req);
          if (cachedNav) return cachedNav;

          const cachedShell = await caches.match("./index.html");
          return cachedShell || (await caches.match("./offline.html"));
        }
      })()
    );
    return;
  }

  // Assets: cache-first + refresh em background
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(req);
      if (cached) {
        event.waitUntil(
          (async () => {
            try {
              const fresh = await fetch(req);
              if (fresh && fresh.ok) cache.put(req, fresh.clone());
            } catch {}
          })()
        );
        return cached;
      }

      try {
        const fresh = await fetch(req);
        if (fresh && fresh.ok) cache.put(req, fresh.clone());
        return fresh;
      } catch {
        return new Response("Offline", { status: 503, statusText: "Offline" });
      }
    })()
  );
});
