/* SisExeFin — PWA: instalável; dados sempre pela rede (Firebase/HTTP).
   Versão: 2026-05-19-no-cache (forçar invalidação de SW antigos). */
const SW_VERSION = '2026-05-19-no-cache';

self.addEventListener('install', (event) => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil((async () => {
        try {
            const nomes = await caches.keys();
            await Promise.all(nomes.map((n) => caches.delete(n)));
        } catch (e) { /* ignora */ }
        await self.clients.claim();
    })());
});

self.addEventListener('fetch', (event) => {
    const req = event.request;
    if (req.method !== 'GET') {
        event.respondWith(fetch(req));
        return;
    }
    event.respondWith(fetch(req, { cache: 'no-store' }).catch(() => fetch(req)));
});
