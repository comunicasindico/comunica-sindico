/* ==========================================================
   Comunica Síndico — sw.js (RAIZ) BLINDADO — PWA Condôminos
   - Atualiza sozinho (skipWaiting + clientsClaim)
   - Não trava em cache velho (cache versionado + limpeza)
   - JSON sempre atualizado (network-first com fallback cache)
   - Vídeos MP4 e requests com Range NÃO entram no cache
   - HTML navegação: network-first (fallback offline)
   ========================================================== */

const CACHE_VERSION = "v10"; // <- suba para forçar refresh geral
const CACHE_NAME = `cs-condominos-${CACHE_VERSION}`;

// App Shell (somente Condôminos)
const ASSETS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./data.json",
  "./versiculos.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-512-maskable.png" // se existir, cacheia; se não existir, ignora (via addAllSafe)
];

// Página offline (fallback)
const OFFLINE_HTML = `<!doctype html>
<html lang="pt-BR"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Condôminos — Offline</title>
<style>
  body{margin:0;font-family:Segoe UI,Arial,sans-serif;background:#061726;color:#eaf2ff;display:flex;min-height:100vh;align-items:center;justify-content:center}
  .c{max-width:520px;padding:22px;border:1px solid rgba(255,255,255,.12);border-radius:16px;background:rgba(12,35,56,.35)}
  h1{margin:0 0 10px;font-size:20px}
  p{margin:0;opacity:.85;line-height:1.35}
</style>
<div class="c">
  <h1>Sem internet no momento</h1>
  <p>O app pode abrir parcialmente com dados em cache. Assim que a conexão voltar, ele se atualiza sozinho.</p>
</div></html>`;

// ===== Helpers =====
function isVideoRequest(req, url) {
  return url.pathname.toLowerCase().endsWith(".mp4") || req.destination === "video";
}
function hasRangeHeader(req) {
  return req.headers.has("range");
}
function isJSON(url) {
  const p = url.pathname.toLowerCase();
  return p.endsWith("/data.json") || p.endsWith("/versiculos.json") || p.endsWith(".json");
}
function isNavigation(req) {
  return req.mode === "navigate";
}
function sameOrigin(url) {
  return url.origin === self.location.origin;
}
function isInSindicoScope(url) {
  // ✅ garante isolamento: SW da raiz NÃO controla /sindico/
  return url.pathname.includes("/sindico/");
}

// addAll robusto: não falha se algum asset não existir
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

// ===== INSTALL =====
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

// ===== ACTIVATE =====
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => (k !== CACHE_NAME ? caches.delete(k) : null)));
      await self.clients.claim();
    })()
  );
});

// ===== MESSAGE =====
self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});

// ===== FETCH =====
self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Só controla mesmo domínio
  if (!sameOrigin(url)) return;

  // ✅ isolamento: ignora tudo de /sindico/ (outro PWA terá seu próprio SW)
  if (isInSindicoScope(url)) return;

  // ❌ Não cachear MP4 nem Range/206
  if (isVideoRequest(req, url) || hasRangeHeader(req)) {
    event.respondWith(fetch(req));
    return;
  }

  // ✅ Navegação (HTML): network-first + fallback offline
  if (isNavigation(req)) {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(req, { cache: "no-store" });

          // salva a navegação (melhora offline/back/forward)
          try {
            const cache = await caches.open(CACHE_NAME);
            cache.put(req, fresh.clone());
          } catch {}

          // mantém o shell atualizado
          try {
            const freshShell = await fetch("./index.html", { cache: "no-store" });
            if (freshShell && freshShell.ok) {
              const cache = await caches.open(CACHE_NAME);
              cache.put("./index.html", freshShell.clone());
            }
          } catch {}

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

  // ✅ JSON: network-first + fallback cache
  if (isJSON(url)) {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(req, { cache: "no-store" });
          if (fresh && fresh.ok) {
            const cache = await caches.open(CACHE_NAME);
            cache.put(req, fresh.clone());
          }
          return fresh;
        } catch {
          const cached = await caches.match(req);
          return (
            cached ||
            new Response("{}", { headers: { "Content-Type": "application/json; charset=utf-8" } })
          );
        }
      })()
    );
    return;
  }

  // ✅ Demais (CSS/JS/Ícones): cache-first + atualiza em background
  event.respondWith(
    (async () => {
      const cached = await caches.match(req);
      if (cached) {
        event.waitUntil(
          (async () => {
            try {
              const fresh = await fetch(req);
              if (fresh && fresh.ok) {
                const cache = await caches.open(CACHE_NAME);
                cache.put(req, fresh.clone());
              }
            } catch {}
          })()
        );
        return cached;
      }

      try {
        const fresh = await fetch(req);
        if (fresh && fresh.ok) {
          const cache = await caches.open(CACHE_NAME);
          cache.put(req, fresh.clone());
        }
        return fresh;
      } catch {
        const fallback = await caches.match(req);
        return fallback || new Response("Offline", { status: 503, statusText: "Offline" });
      }
    })()
  );
});
