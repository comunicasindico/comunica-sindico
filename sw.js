/* ==========================================================
   Comunica Síndico — sw.js (GLOBAL) — 3 PAINÉIS
   - Escopo: /comunica-sindico/
   - Condôminos + Síndico + Admin
   - HTML: network-first + fallback offline por área
   - JSON crítico: network-first + fallback (resolve ?ts=)
   - Vídeos/Range: não cachear
   - Não interfere em cross-domain (script.google.com etc.)
   ========================================================== */

const CACHE_VERSION = "v1";
const CACHE_PREFIX  = "cs-global-";
const CACHE_NAME    = `${CACHE_PREFIX}${CACHE_VERSION}`;

// Pré-cache essencial (sem depender de /sindico/manifest etc.)
const ASSETS = [
  "./",
  "./index.html",
  "./admin.html",
  "./sindico/",
  "./sindico/index.html",
  "./manifest.json",
  "./data.json",
  "./versiculos.json",
  "./assets/icons/icon-192.png",
  "./assets/icons/icon-512.png"
];

// Offline (Condôminos/Admin)
const OFFLINE_MAIN = `<!doctype html>
<html lang="pt-BR"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Comunica Síndico — Offline</title>
<style>
  body{margin:0;font-family:Segoe UI,Arial,sans-serif;background:#061726;color:#eaf2ff;
  display:flex;min-height:100vh;align-items:center;justify-content:center}
  .c{max-width:560px;padding:22px;border:1px solid rgba(255,255,255,.12);
  border-radius:16px;background:rgba(12,35,56,.35)}
  h1{margin:0 0 10px 0;font-size:20px}
  p{margin:0;opacity:.85;line-height:1.35}
</style>
<div class="c">
  <h1>Sem internet no momento</h1>
  <p>Você pode abrir parcialmente com dados em cache. Assim que a conexão voltar, ele se atualiza.</p>
</div></html>`;

// Offline (Síndico)
const OFFLINE_SINDICO = `<!doctype html>
<html lang="pt-BR"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Síndico(a) — Offline</title>
<style>
  body{margin:0;font-family:Segoe UI,Arial,sans-serif;background:#061726;color:#eaf2ff;
  display:flex;min-height:100vh;align-items:center;justify-content:center}
  .c{max-width:560px;padding:22px;border:1px solid rgba(255,255,255,.12);
  border-radius:16px;background:rgba(12,35,56,.35)}
  h1{margin:0 0 10px 0;font-size:20px}
  p{margin:0;opacity:.85;line-height:1.35}
</style>
<div class="c">
  <h1>Sem internet no momento</h1>
  <p>O app do Síndico abre, mas o painel online (Apps Script) precisa de conexão.</p>
</div></html>`;

function sameOrigin(url){
  return url.origin === self.location.origin;
}

function isNavigation(req){
  return req.mode === "navigate";
}

function isVideoRequest(req, url){
  const p = url.pathname.toLowerCase();
  return p.endsWith(".mp4") || p.endsWith(".webm") || req.destination === "video";
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

function isSindicoPath(url){
  return url.pathname.includes("/sindico/");
}

// normaliza: remove query/hash e transforma em "./arquivo"
function toRelativePath(url){
  const p = url.pathname;
  const last = p.split("/").pop() || "";
  return `./${last}`;
}

// chave limpa para navegação (sem query) evita duplicação
function navKeyFrom(url){
  return new Request(url.pathname, { method: "GET" });
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

    await cache.put("./offline.html", new Response(OFFLINE_MAIN, {
      headers: { "Content-Type":"text/html; charset=utf-8" }
    }));

    await cache.put("./offline-sindico.html", new Response(OFFLINE_SINDICO, {
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

  // ✅ só atua dentro do app (evita pegar outras coisas do domínio)
  if (!url.pathname.startsWith("/comunica-sindico/")) return;

  // vídeos e Range: não cachear
  if (isVideoRequest(req, url) || hasRangeHeader(req)) {
    event.respondWith(fetch(req));
    return;
  }

  // NAVEGAÇÃO (HTML) — network-first + fallback (sem duplicar por query)
  if (isNavigation(req)) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const navKey = navKeyFrom(url);

      try{
        const fresh = await fetch(req, { cache:"no-store" });
        if (fresh && fresh.ok) await cache.put(navKey, fresh.clone());

        // atualiza shell principal/síndico para fallback rápido
        try{
          const shellPath = isSindicoPath(url) ? "./sindico/index.html" : "./index.html";
          const freshShell = await fetch(shellPath, { cache:"no-store" });
          if (freshShell && freshShell.ok) await cache.put(shellPath, freshShell.clone());
        }catch(e){}

        return fresh;
      }catch(e){
        const cachedNav = await cache.match(navKey);
        if (cachedNav) return cachedNav;

        // fallback shell por área
        const shellPath = isSindicoPath(url) ? "./sindico/index.html" : "./index.html";
        const cachedShell = await cache.match(shellPath);
        if (cachedShell) return cachedShell;

        // offline por área
        const offlinePath = isSindicoPath(url) ? "./offline-sindico.html" : "./offline.html";
        return (await cache.match(offlinePath)) || new Response("Offline", { status:503, statusText:"Offline" });
      }
    })());
    return;
  }

  // JSON (data/versiculos e outros) — network-first + fallback que resolve query (?ts=)
  if (isCriticalJson(url) || isAnyJson(url)) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const rel = toRelativePath(url); // "./data.json" etc

      try{
        const fresh = await fetch(req, { cache:"no-store" });
        if (fresh && fresh.ok) {
          await cache.put(req, fresh.clone());
          await cache.put(rel, fresh.clone());
        }
        return fresh;
      }catch(e){
        return (await cache.match(req)) ||
               (await cache.match(rel)) ||
               new Response("{}", { headers: { "Content-Type":"application/json; charset=utf-8" }});
      }
    })());
    return;
  }

  // OUTROS (stale-while-revalidate) — rápido
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(req, { ignoreSearch: true });

    if (cached) {
      event.waitUntil((async () => {
        try{
          const fresh = await fetch(req, { cache:"no-store" });
          if (fresh && fresh.ok) await cache.put(req, fresh.clone());
        }catch(e){}
      })());
      return cached;
    }

    try{
      const fresh = await fetch(req, { cache:"no-store" });
      if (fresh && fresh.ok) await cache.put(req, fresh.clone());
      return fresh;
    }catch(e){
      return new Response("Offline", { status:503, statusText:"Offline" });
    }
  })());
});
