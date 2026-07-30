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
const VERSAO = 'teotonio-v3'; // v3: entram os módulos js/ (notas fiscais, ícones)
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
  // Com TIMEOUT: em sinal fraco (4G de campo), se a rede não responder em 4s
  // e já houver cópia em cache, abre do cache na hora em vez de tela branca —
  // a resposta da rede continua em segundo plano e atualiza o cache pro próximo open.
  if (e.request.mode === 'navigate' || url.pathname.endsWith('/index.html')) {
    e.respondWith((async () => {
      const rede = fetch(e.request).then(resp => {
        const clone = resp.clone();
        caches.open(VERSAO).then(c => c.put(e.request, clone));
        return resp;
      });
      rede.catch(() => {}); // evita "unhandled rejection" quando servimos o cache
      const timeout = new Promise(res => setTimeout(() => res(null), 4000));
      try {
        const resp = await Promise.race([rede, timeout]);
        if (resp) return resp;
        const hit = await caches.match(e.request, { ignoreSearch: true });
        return hit || rede; // sem cache: espera a rede mesmo lenta
      } catch (_) {
        const hit = await caches.match(e.request, { ignoreSearch: true });
        if (hit) return hit;
        throw _;
      }
    })());
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
