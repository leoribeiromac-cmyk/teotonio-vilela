/*
 * Sistema de controle de obra — Av. Senador Teotônio Vilela
 * Copyright © 2026 Leonardo Maciel. Todos os direitos reservados.
 *
 * Software proprietário. O código estar visível não autoriza uso, cópia
 * nem obra derivada — ver LICENSE, na raiz do repositório.
 */
// ============================================================
// Service Worker — Sistema Gestor Engenharia
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
const VERSAO = 'teotonio-v64'; // v64: RDO — PDF oficial do gravado, turno que não é deste aparelho sobe em branco, texto por turno, RDO assinado só muda reaberto; login por POST
// As bibliotecas do vendor/ têm balde PRÓPRIO, que NÃO é descartado quando o
// app muda de versão. Antes, cada atualização do sistema jogava fora 1,2 MB de
// Chart.js, jsPDF, xlsx, PDF.js e fontes — e o aparelho baixava tudo de novo no
// 4G do canteiro, só porque uma linha do app mudou. Suba este número apenas
// quando trocar de fato um arquivo dentro de vendor/.
const VERSAO_VENDOR = 'teotonio-vendor-v1';
// As pranchas também têm balde próprio, pela mesma razão e com mais motivo: a
// pirâmide da Teotônio tem 2.586 quadrados / ~16 MB. Se ela morasse no balde do
// app, cada correção de uma linha de código mandaria o celular baixar tudo de
// novo. Suba este número quando REFATIAR uma prancha — é o que descarta os
// quadrados antigos, já que o nome do arquivo não muda.
// v2: a Teotônio refatiada a 24 px por ponto do PDF (era 12). O nível novo tem
// nome de arquivo novo e viria sozinho, mas os sete de baixo foram regravados
// em quase-sem-perdas — mesmas URLs, conteúdo melhor e menor — e sem trocar o
// balde o celular seguiria servindo os quadrados com artefato do cache.
const VERSAO_PRANCHAS = 'teotonio-pranchas-v2';
const BALDES = [VERSAO, VERSAO_VENDOR, VERSAO_PRANCHAS];
// Quadrado de prancha: o conteúdo de cada URL nunca muda dentro de uma versão.
const IMUTAVEL = /\/projetos\/.+\/\d+\/\d+_\d+\.webp$/;
// brasilapi/minhareceita: cadastro de CNPJ do fornecedor da nota fiscal. Não
// pode entrar no balde de estáticos — lá a regra é cache-primeiro, e a razão
// social do fornecedor ficaria congelada no aparelho para sempre. Quem guarda
// esse cadastro (por meio ano) é o próprio módulo de notas, em localStorage.
const SO_REDE = ['docs.google.com', 'script.google.com', 'script.googleusercontent.com',
                 'generativelanguage.googleapis.com', 'brasilapi.com.br', 'minhareceita.org',
                 // previsão do tempo: servir a de ontem do cache seria pior que não mostrar
                 'api.open-meteo.com'];

// Em qual balde este pedido mora.
function baldeDe(url) {
  if (url.pathname.indexOf('/vendor/') !== -1) return VERSAO_VENDOR;
  if (url.pathname.indexOf('/projetos/') !== -1) return VERSAO_PRANCHAS;
  return VERSAO;
}

/* A VERSÃO NOVA JÁ NASCE COM O APP GUARDADO.
   O `install` não guardava nada, e o `activate` apaga os baldes antigos: o
   aparelho que recebeu uma atualização com sinal e depois abriu o app no
   canteiro SEM sinal encontrava o balde novo vazio — o app não abria. Agora
   a casca (index.html e os scripts versionados que ele pede) é baixada aqui,
   antes de a versão nova poder assumir. Se a casca não vier e já houver uma
   versão rodando, a instalação falha de propósito: a velha continua, e o
   navegador tenta de novo na próxima visita. */
async function guardarCasca() {
  const c = await caches.open(VERSAO);
  const r = await fetch('./index.html', { cache: 'no-cache' });
  if (!r.ok) throw new Error('casca: HTTP ' + r.status);
  const html = await r.clone().text();
  await c.put('./index.html', r);
  const deps = [];
  const re = /<script src="((?:js|dados)\/[^"]+)"/g;
  let m;
  while ((m = re.exec(html)) !== null) deps.push(m[1]);
  // o resto é conveniência: um arquivo que falhar não derruba a instalação
  await Promise.all(['manifest.json', 'favicon.svg'].concat(deps)
    .map(u => c.add(u).catch(() => {})));
}

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const haVersaoRodando = !!(self.registration && self.registration.active);
    try { await guardarCasca(); }
    catch (err) { if (haVersaoRodando) throw err; }
    // sem cliente controlando (primeira instalação) não há o que interromper:
    // assume na hora, senão o app abriria a primeira vez sem service worker.
    if (!haVersaoRodando) await self.skipWaiting();
  })());
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
    /* A cópia guardada da casca: a do próprio endereço ou, para "/" e
       "/index.html" (dois endereços da MESMA página), a guardada no install. */
    const guardada = async () => (await caches.match(e.request, { ignoreSearch: true })) ||
      (/\/(index\.html)?$/.test(url.pathname) ? caches.match('./index.html') : undefined);
    e.respondWith((async () => {
      const rede = fetch(e.request).then(resp => {
        // só página boa substitui a guardada: erro 5xx ou redirecionamento
        // por cima da cópia boa era trocar o app offline por uma página de erro
        if (resp && resp.ok && !resp.redirected) {
          const clone = resp.clone();
          // waitUntil: servida a cópia pelo prazo de 4 s, o worker podia ser
          // desligado antes de gravar a nova — e o aparelho ficava na versão velha
          e.waitUntil(caches.open(VERSAO).then(c => c.put(e.request, clone)).catch(() => {}));
        }
        return resp;
      });
      rede.catch(() => {}); // evita "unhandled rejection" quando servimos o cache
      const timeout = new Promise(res => setTimeout(() => res(null), 4000));
      try {
        const resp = await Promise.race([rede, timeout]);
        if (resp) return resp;
        const hit = await guardada();
        return hit || rede; // sem cache: espera a rede mesmo lenta
      } catch (_) {
        const hit = await guardada();
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
