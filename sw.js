/*
 * Sistema de controle de obra — Av. Senador Teotônio Vilela
 * Copyright © 2026 Leonardo Maciel. Todos os direitos reservados.
 *
 * Software proprietário. O código estar visível não autoriza uso, cópia
 * nem obra derivada — ver LICENSE, na raiz do repositório.
 */
// ============================================================
// Service Worker — Sistema Teotônio Vilela
//
// Estratégia:
//  • index.html (navegação): REDE PRIMEIRO — atualizações do app chegam
//    na hora; o cache só entra como fallback quando estiver sem sinal.
//  • Estáticos (vendor/, js/, fontes, ícones): CACHE PRIMEIRO com
//    revalidação em segundo plano — abre rápido no 4G do campo. As bibliotecas
//    pesadas (jsPDF, xlsx, PDF.js, Chart.js) são buscadas só quando fazem
//    falta, e a partir daí ficam aqui: a segunda vez não custa nada.
//  • Quadrados das pranchas (projetos/…/N/L_C.webp): CACHE PRIMEIRO e PONTO —
//    sem revalidar. São arquivos imutáveis, e cada arrastada na prancha toca
//    dezenas deles; revalidar todos em segundo plano só gastaria o 4G do
//    canteiro para receber de novo, byte por byte, o mesmo desenho.
//  • Google Sheets / Apps Script / Gemini: NUNCA intercepta — dados de
//    produção vêm sempre da rede (a fila offline do app cuida do resto).
// ============================================================
// v4: conjunto de ícones redesenhado + marca do app. Trocar a versão é o que
// descarta o cache antigo — sem isso o aparelho seguiria servindo os ícones
// e o js/ui/icones.js anteriores até a revalidação em segundo plano rodar.
const VERSAO = 'teotonio-v50'; // v50: painel de notas com filtros, consultas e tabelas novas (notas.js e o CSS mudaram)
// As bibliotecas do vendor/ têm balde PRÓPRIO, que NÃO é descartado quando o
// app muda de versão. Antes, cada atualização do sistema jogava fora 1,2 MB de
// Chart.js, jsPDF, xlsx, PDF.js e fontes — e o aparelho baixava tudo de novo no
// 4G do canteiro, só porque uma linha do app mudou. Suba este número apenas
// quando trocar de fato um arquivo dentro de vendor/.
const VERSAO_VENDOR = 'teotonio-vendor-v1';
// As pranchas também têm balde próprio, pela mesma razão e com mais motivo: a
// pirâmide da Teotônio tem 835 quadrados / ~13 MB. Se ela morasse no balde do
// app, cada correção de uma linha de código mandaria o celular baixar tudo de
// novo. Suba este número quando REFATIAR uma prancha — é o que descarta os
// quadrados antigos, já que o nome do arquivo não muda.
const VERSAO_PRANCHAS = 'teotonio-pranchas-v1';
const BALDES = [VERSAO, VERSAO_VENDOR, VERSAO_PRANCHAS];
// Quadrado de prancha: o conteúdo de cada URL nunca muda dentro de uma versão.
const IMUTAVEL = /\/projetos\/.+\/\d+\/\d+_\d+\.webp$/;
// brasilapi/minhareceita: cadastro de CNPJ do fornecedor da nota fiscal. Não
// pode entrar no balde de estáticos — lá a regra é cache-primeiro, e a razão
// social do fornecedor ficaria congelada no aparelho para sempre. Quem guarda
// esse cadastro (por meio ano) é o próprio módulo de notas, em localStorage.
const SO_REDE = ['docs.google.com', 'script.google.com', 'script.googleusercontent.com',
                 'generativelanguage.googleapis.com', 'brasilapi.com.br', 'minhareceita.org'];

// Em qual balde este pedido mora.
function baldeDe(url) {
  if (url.pathname.indexOf('/vendor/') !== -1) return VERSAO_VENDOR;
  if (url.pathname.indexOf('/projetos/') !== -1) return VERSAO_PRANCHAS;
  return VERSAO;
}

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
      .then(keys => Promise.all(keys.filter(k => BALDES.indexOf(k) === -1).map(k => caches.delete(k))))
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
  //
  // Dois cuidados que faltavam, e que transformavam "um carregamento de
  // atraso" em "nunca":
  //  • a revalidação ia solta; o navegador pode desligar o service worker
  //    assim que a resposta é entregue, e a gravação no cache nunca acontecia.
  //    O `e.waitUntil` mantém o worker vivo até ela terminar.
  //  • o `fetch` da revalidação passava pelo cache HTTP do navegador, então
  //    muitas vezes revalidava contra a MESMA cópia velha. `cache:'no-cache'`
  //    obriga a perguntar ao servidor.
  const balde = baldeDe(url);

  // Quadrado de prancha já guardado: entrega e acabou. Nada de revalidar.
  if (IMUTAVEL.test(url.pathname)) {
    e.respondWith(
      caches.match(e.request).then(hit => hit || fetch(e.request).then(resp => {
        if (resp && resp.ok) {
          const clone = resp.clone();
          e.waitUntil(caches.open(balde).then(c => c.put(e.request, clone)));
        }
        return resp;
      }))
    );
    return;
  }

  e.respondWith(
    caches.match(e.request).then(hit => {
      const rede = fetch(hit ? new Request(e.request, { cache: 'no-cache' }) : e.request)
        .then(resp => {
          if (resp && resp.ok) {
            const clone = resp.clone();
            e.waitUntil(caches.open(balde).then(c => c.put(e.request, clone)));
          }
          return resp;
        })
        .catch(() => hit);
      return hit || rede;
    })
  );
});
