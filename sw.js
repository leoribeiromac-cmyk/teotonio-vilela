// ============================================================
// Service Worker — Sistema Teotônio Vilela
//
// Estratégia:
//  • index.html (navegação): REDE PRIMEIRO — atualizações do app chegam
//    na hora; o cache só entra como fallback quando estiver sem sinal.
//  • Estáticos e CDNs (fontes, chart.js, jspdf, xlsx): CACHE PRIMEIRO com
//    revalidação em segundo plano — abre rápido no 4G do campo.
//  • Google Sheets / Apps Script / Gemini: NUNCA intercepta — dados de
//    produção vêm sempre da rede (a fila offline do app cuida do resto).
// ============================================================
const VERSAO = 'teotonio-v1';
const SO_REDE = ['docs.google.com', 'script.google.com', 'script.googleusercontent.com', 'generativelanguage.googleapis.com'];

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSAO).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (SO_REDE.some(h => url.hostname.endsWith(h))) return; // dados: sempre rede

  // Navegação (o próprio app): rede primeiro, cache como fallback offline.
  if (e.request.mode === 'navigate' || url.pathname.endsWith('/index.html')) {
    e.respondWith(
      fetch(e.request)
        .then(resp => {
          const clone = resp.clone();
          caches.open(VERSAO).then(c => c.put(e.request, clone));
          return resp;
        })
        .catch(() => caches.match(e.request, { ignoreSearch: true }))
    );
    return;
  }

  // Estáticos: cache primeiro + revalidação em segundo plano.
  e.respondWith(
    caches.match(e.request).then(hit => {
      const rede = fetch(e.request)
        .then(resp => {
          if (resp && resp.ok) {
            const clone = resp.clone();
            caches.open(VERSAO).then(c => c.put(e.request, clone));
          }
          return resp;
        })
        .catch(() => hit);
      return hit || rede;
    })
  );
});
