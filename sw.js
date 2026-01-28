const CACHE_VERSION = "v13";
const CACHE_PREFIX = "cs-condominos-";
const CACHE_NAME = `${CACHE_PREFIX}${CACHE_VERSION}`;

const ASSETS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./data.json",
  "./versiculos.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-512-maskable.png"
];

const OFFLINE_HTML = `<!doctype html>
<html lang="pt-BR"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Condôminos - Offline</title>
<style>
  body{margin:0;font-family:Segoe UI,Arial,sans-serif;background:#061726;color:#eaf2ff;
  display:flex;min-height:100vh;align-items:center;justify-content:center}
  .c{max-width:520px;padding:22px;border:1px solid rgba(255,255,255,.12);
  border-radius:16px;background:rgba(12,35,56,.35)}
  h1{margin:0 0 10px 0;font-size:20px}
  p{margin:0;opacity:.85;line-height:1.35}
</style>
<div class="c">
  <h1>Sem internet no momento</h1>
  <p>Você pode abrir parcialmente com dados em cache. Assim que a conexão voltar, ele se atualiza sozinho.</p>
</div></html>`;

function sameOrigin(url){
  return url.origin === self.location.origin;
}

function isInSindicoScope(url){
  return url.pathname.includes("/sindico/");
}

function isNavigation(req){
  return req.mode === "navigate";
}

function isVideoRequest(req, url){
  const p = url.pathname.toLowerCase();
  return p.endsWith(".mp4") || req.destination === "video";
}

function hasRangeHeader(req){
  return req.headers && req.headers.has("range");
}

function isCriticalJson(url){
  const p = url.pathname.toLowerCase();
  return p.endsWith("/data.json") || p.endsWith("/versiculos.json");
}

function isAnyJson(url){
  return url.pathname.toLowerCase().endsWith(".json");
}

// normaliza: remove query/hash e transforma em "./arquivo"
function toRelativePath(url){
  const p = url.pathname;
  const last = p.split("/").pop() || "";
  return `./${last}`;
}

async function addAllSafe(cache, assets){
  await Promise.all(
    assets.map(async (path) => {
      try{
        const res = await fetch(new Request(path, { cache:"reload" }));
        if (res && res.ok) await cache.put(path, res.clone());
      }catch(e){}
    })
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await addAllSafe(cache, ASSETS);
    await cache.put("./offline.html", new Response(OFFLINE_HTML, {
      headers: { "Content-Type":"text/html; charset=utf-8" }
    }));
    self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys.map(k => (k.startsWith(CACHE_PREFIX) && k !== CACHE_NAME) ? caches.delete(k) : null)
    );
    await self.clients.claim();
  })());
});

self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  if (req.method !== "GET") return;
  if (!sameOrigin(url)) return;

  // mantém como você já queria: SW não interfere no /sindico/
  if (isInSindicoScope(url)) return;

  // vídeos e Range: não cachear
  if (isVideoRequest(req, url) || hasRangeHeader(req)) {
    event.respondWith(fetch(req));
    return;
  }

  // NAVEGAÇÃO (HTML)
  if (isNavigation(req)) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      try{
        const fresh = await fetch(req, { cache:"no-store" });
        if (fresh && fresh.ok) cache.put(req, fresh.clone());

        // tenta atualizar o shell também
        try{
          const freshShell = await fetch("./index.html", { cache:"no-store" });
          if (freshShell && freshShell.ok) cache.put("./index.html", freshShell.clone());
        }catch(e){}

        return fresh;
      }catch(e){
        // fallback: tenta URL exata, depois "./index.html", depois offline.html
        const cachedNav = await cache.match(req);
        if (cachedNav) return cachedNav;

        const cachedShell = await cache.match("./index.html");
        return cachedShell || (await cache.match("./offline.html"));
      }
    })());
    return;
  }

  // JSON CRÍTICO (data/versiculos) — network-first + fallback que resolve query (?ts=)
  if (isCriticalJson(url) || isAnyJson(url)) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const rel = toRelativePath(url); // "./data.json" etc

      try{
        const fresh = await fetch(req, { cache:"no-store" });
        if (fresh && fresh.ok) {
          // grava tanto pela request (com query) quanto pelo path limpo
          cache.put(req, fresh.clone());
          cache.put(rel, fresh.clone());
        }
        return fresh;
      }catch(e){
        // tenta casar com query, depois com path limpo
        return (await cache.match(req)) ||
               (await cache.match(rel)) ||
               new Response("{}", { headers: { "Content-Type":"application/json; charset=utf-8" }});
      }
    })());
    return;
  }

  // OUTROS (stale-while-revalidate)
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(req);
    if (cached) {
      event.waitUntil((async () => {
        try{
          const fresh = await fetch(req);
          if (fresh && fresh.ok) await cache.put(req, fresh.clone());
        }catch(e){}
      })());
      return cached;
    }
    try{
      const fresh = await fetch(req);
      if (fresh && fresh.ok) await cache.put(req, fresh.clone());
      return fresh;
    }catch(e){
      return new Response("Offline", { status:503, statusText:"Offline" });
    }
  })());
});
