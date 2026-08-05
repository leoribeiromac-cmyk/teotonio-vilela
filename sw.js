// ============================================================
// Service Worker — Sistema Teotônio Vilela
//
// Estratégia:
//  • index.html (navegação): REDE PRIMEIRO — atualizações do app chegam
//    na hora; o cache só entra como fallback quando estiver sem sinal.
//  • Estáticos (vendor/, js/, fontes, ícones, pranchas): CACHE PRIMEIRO com
//    revalidação em segundo plano — abre rápido no 4G do campo. As bibliotecas
//    pesadas (jsPDF, xlsx, PDF.js, Chart.js) são buscadas só quando fazem
//    falta, e a partir daí ficam aqui: a segunda vez não custa nada.
//  • Google Sheets / Apps Script / Gemini: NUNCA intercepta — dados de
//    produção vêm sempre da rede (a fila offline do app cuida do resto).
// ============================================================
// v4: conjunto de ícones redesenhado + marca do app. Trocar a versão é o que
// descarta o cache antigo — sem isso o aparelho seguiria servindo os ícones
// e o js/ui/icones.js anteriores até a revalidação em segundo plano rodar.
const VERSAO = 'teotonio-v11'; // v11: bibliotecas sob demanda + fontes vendorizadas
const SO_REDE = ['docs.google.com', 'script.google.com', 'script.googleusercontent.com', 'generativelanguage.googleapis.com'];

// O app avisa "nova versão disponível" e só troca quando o usuário mandar —
// trocar sozinho no meio de um lançamento perderia o que estava na tela.
self.addEventListener('install', () => {
  // sem cliente controlando (primeira instalação) não há o que interromper:
  // assume na hora, senão o app abriria a primeira vez sem service worker.
  if (!self.clients || !self.registration.active) self.skipWaiting();
});

self.addEventListener('message', (e) => {
  if (e.data && e.data.action === 'skipWaiting') self.skipWaiting();
});

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
