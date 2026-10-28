// ひとり将棋：アプリ本体と将棋エンジンを保存し、オフラインで動作します。
// GitHub PagesではHTTPヘッダーを直接設定できないため、同一オリジンの応答に
// COOP / COEPを付け、SharedArrayBufferを必要とするWASMエンジンを試します。
const CACHE_NAME = "hitori-shogi-sounds-v7";
const FILES = [
  "./", "./index.html", "./style.css", "./app.js", "./manifest.json",
  "./engine/nosimd/yaneuraou.js",
  "./engine/nosimd/yaneuraou.wasm",
  "./engine/nosimd/yaneuraou.worker.js"
];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(FILES)));
  self.skipWaiting();
});
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
  );
  self.clients.claim();
});

function addIsolationHeaders(response) {
  if (!response || response.type === "opaque") return response;
  const headers = new Headers(response.headers);
  headers.set("Cross-Origin-Opener-Policy", "same-origin");
  headers.set("Cross-Origin-Embedder-Policy", "require-corp");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  event.respondWith((async () => {
    try {
      const cached = await caches.match(event.request);
      if (cached) return addIsolationHeaders(cached);
      const response = await fetch(event.request);
      if (response && response.ok && new URL(event.request.url).origin === self.location.origin) {
        const copy = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy)).catch(() => {});
      }
      return addIsolationHeaders(response);
    } catch (error) {
      const cached = await caches.match(event.request);
      if (cached) return addIsolationHeaders(cached);
      if (event.request.mode === "navigate") {
        const fallback = await caches.match("./index.html");
        if (fallback) return addIsolationHeaders(fallback);
      }
      return new Response("オフラインです。保存済みのページを開いてください。", {
        status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" }
      });
    }
  })());
});
