/*
 * Sistema de controle de obra — Av. Senador Teotônio Vilela
 * Copyright © 2026 Leonardo Maciel. Todos os direitos reservados.
 *
 * Software proprietário. O código estar visível não autoriza uso, cópia
 * nem obra derivada — ver LICENSE, na raiz do repositório.
 */
/* ============================================================
   TELA "MODELO 3D" — a avenida em 3D, pintada com o que foi lançado
   ------------------------------------------------------------
   O modelo 3D da obra (o mesmo da página publicada pelo pipeline do
   modelo) roda em modelo3d.html, dentro de um <iframe> desta tela. Este
   arquivo é o lado do APP: ele sabe o que é RDO, o visor não.

   O que amarra os dois é a ESTACA. Cada lançamento do RDO_Avanco diz onde
   foi feito ("E210 a E215 (BC)"), e `lerLocalEstaca` — a mesma leitura da
   Avanço Físico, do Painel e da Galeria — devolve as estacas. Aqui elas são
   agrupadas, filtradas (período, dia de RDO, frente, pacote), ganham uma
   cor e viram FAIXAS DE EIXO no vocabulário do modelo: o eixo do app
   (CB/BC) vira o do projeto (PE/PD) pelo `modelo3d.eixos` do cadastro da
   obra, e a estaca N cobre de N×20 − 10 a N×20 + 10 m — o ponto da estaca
   com meia estaca de cada lado, porque "E212" sozinha é um ponto.

   O caminho de volta: tocar uma faixa no 3D devolve a chave da estaca
   ("BC:212"), e esta tela abre os lançamentos dela, com os atalhos para o
   Histórico, a Galeria e o Lançar Serviço — que chega com a estaca já
   preenchida, sem apagar nada do rascunho do apontador.

   Três leituras a mais do mesmo dado:
   · LINHA DO TEMPO (4D): o período "linha" mostra o que estava lançado ATÉ
     uma data, e o ▶ anda com ela — a avenida sendo pintada dia a dia. A
     recência, nesse modo, conta a partir da data da linha, não de hoje.
   · ETAPA DA PISTA: a cor "Etapa" diz até onde a pista chegou em cada estaca
     (demolição → terraplenagem → redes → guias → sub-base → base →
     imprimação → binder → capa → sinalização). A etapa sai do NOME do pacote
     (m3dEtapaDe), e na falta dele, da frente; muro, passeio e desapropriação
     ficam fora da escada (não são a pista).
   · FOTOS: estaca com foto ganha um pino de câmera no 3D, e a estaca aberta
     mostra as miniaturas — as MESMAS da Galeria (baixarFotoServidor, com o
     login de quem está no app). O visor recebe só a imagem pronta (data:) e
     o índice dela; o id do Drive não sai daqui.

   REGRAS QUE NÃO PODEM CAIR
   · A tela NUNCA é redesenhada inteira pela carga de fundo: o iframe
     recarregaria o modelo (2,4 MB, 20 s no 4G) e a câmera voltaria ao
     início. O refresh de 5 em 5 min só manda os dados novos (m3dRefrescar).
   · Mensagem só de mesma origem E do próprio iframe.
   · Texto de lançamento vai para o visor como dado e é escrito lá com
     textContent; aqui, tudo passa por escHtml/jsArg.
   · A barra da linha do tempo mora DENTRO do #m3dVisor, ao lado do iframe
     (nunca recriá-lo ali dentro: mexer no iframe recarrega o modelo), para
     ir junto na tela cheia.
   ============================================================ */
'use strict';

var M3D = window.M3D = {
  periodo: 'tudo',   // 'tudo' | '7d' | '30d' | 'AAAA-MM' | 'dia' | 'linha'
  dia: '',           // AAAA-MM-DD, quando periodo === 'dia'
  ate: '',           // AAAA-MM-DD, quando periodo === 'linha' (linha do tempo)
  passo: 'semana',   // quanto a linha do tempo anda a cada quadro: 'dia' | 'semana' | 'mes'
  tocando: 0,        // o setInterval da reprodução (0 = parada)
  frente: '', pacote: '',
  cor: 'etapa',      // 'frente' | 'etapa' | 'qtd' | 'recencia' — a escolhida fica lembrada no aparelho (m3dCorGuardada)
  etapaSel: null,    // etapa realçada pela legenda (índice em M3D_ETAPAS): as outras estacas ficam cinza
  apresentando: false,   // o visor está apresentando a obra (o voo guiado)
  sel: null,         // chave da estaca aberta ('BC:212')
  fotos: null,       // { chave, itens:[{fileId, limpa, legenda, src}] } — as fotos da estaca aberta
  pronto: false,     // o visor do iframe já escuta
  irPendente: null,  // estaca pedida por outra tela antes de o visor ficar pronto
  guardando: false,
};

/* A cor nasce em "Etapa": na avenida, "Frente" pinta quase tudo de Pav.
   Flexível (é a frente com mais lançamentos em quase toda estaca), e a
   pergunta de quem abre o 3D é até onde a pista chegou. A escolha de quem
   trocou fica lembrada neste aparelho. */
var M3D_LS_COR = 'teotonio_m3d_cor';
(function () { try { var c = localStorage.getItem(M3D_LS_COR); if (['frente', 'etapa', 'qtd', 'recencia'].indexOf(c) >= 0) M3D.cor = c; } catch (e) { } })();

function m3dDisponivel() {
  return !!(typeof OBRA !== 'undefined' && OBRA && OBRA.modelo3d && OBRA.modelo3d.eixos) && podeVer('modelo3d');
}
function m3dEixoModelo(eixoApp) {
  return (((OBRA && OBRA.modelo3d) || {}).eixos || {})[String(eixoApp || '').toUpperCase()] || null;
}
function m3dFrame() {
  var f = document.getElementById('m3dFrame');
  return f && f.contentWindow ? f : null;
}
function m3dEnviar(msg) {
  var f = m3dFrame();
  if (!f || !M3D.pronto) return false;
  try { f.contentWindow.postMessage(Object.assign({ m3d: 1 }, msg), location.origin); return true; }
  catch (e) { return false; }
}
function m3dSrc() {
  return 'modelo3d.html?obra=' + encodeURIComponent(OBRA.id) + '&embed=1';
}

/* ---------- cor: o 3D é desenhado em sRGB, e o app pensa em OKLCH */
function oklchHex(L, C, H) {
  var h = H * Math.PI / 180, a = C * Math.cos(h), b = C * Math.sin(h);
  var l_ = L + 0.3963377774 * a + 0.2158037573 * b, m_ = L - 0.1055613458 * a - 0.0638541728 * b, s_ = L - 0.0894841775 * a - 1.2914855480 * b;
  var l = l_ * l_ * l_, m = m_ * m_ * m_, s = s_ * s_ * s_;
  var rgb = [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
             -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
             -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s];
  return '#' + rgb.map(function (x) {
    x = Math.max(0, Math.min(1, x));
    x = x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055;
    return ('0' + Math.round(x * 255).toString(16)).slice(-2);
  }).join('');
}
/* A cor da frente é a MESMA do resto do app (corDaFrente: o matiz por frente
   do contrato), só que com brilho fixo: sobre o asfalto escuro do modelo, a
   cor do tema claro sumia. */
function m3dCorFrente(f) {
  var m = /oklch\(\s*[\d.]+\s+[\d.]+\s+([\d.]+)/.exec(corDaFrente(f) || '');
  return oklchHex(0.68, 0.16, m ? +m[1] : 38);
}
var M3D_RECENCIA = [[7, '#e0452a', 'até 7 dias'], [30, '#f08a24', '8 a 30 dias'], [90, '#d8c13a', '31 a 90 dias'], [Infinity, '#7f9bb3', 'mais de 90 dias']];
function m3dCorQtd(t) { return oklchHex(0.88 - 0.42 * Math.max(0, Math.min(1, t)), 0.17, 38); }

/* ---------- a etapa da pista
   A ESCADA, na ordem em que a pista é feita. A estaca fica na etapa MAIS
   ALTA que já recebeu lançamento: BGTC lançado na E212 quer dizer que a pista
   ali chegou à base, mesmo que a demolição tenha sido lançada noutro trecho.
   Quem diz a etapa é o nome do pacote ("BGTC", "SMA - Capa de rolamento",
   "Guia PMSP 100") — o cadastro não tem coluna para isso, e o nome é o que o
   apontador escolhe. Sem nome que diga, vale a frente ("Drenagem"). */
var M3D_ETAPAS = [
  { id: 'demolicao', nome: 'Demolição', cor: '#8d8d8d' },
  { id: 'terra', nome: 'Terraplenagem', cor: '#b98a4e' },
  { id: 'redes', nome: 'Drenagem e redes', cor: '#4f8fd6' },
  { id: 'guias', nome: 'Guias e sarjetas', cor: '#c9c3b5' },
  { id: 'subbase', nome: 'Sub-base', cor: '#d8c08a' },
  { id: 'base', nome: 'Base', cor: '#e07b39' },
  { id: 'imprimacao', nome: 'Imprimação', cor: '#b04a3a' },
  { id: 'binder', nome: 'Binder', cor: '#7a4fbf' },
  { id: 'capa', nome: 'Capa / placa', cor: '#2b9e6a' },
  { id: 'sinal', nome: 'Sinalização', cor: '#f5d33b' },
];
var M3D_FORA_COR = '#8a949b';
var M3D_APAGADA = '#5d656c';   // estaca fora da etapa realçada na legenda
/* A ordem dos testes NÃO é a da escada: "Demolição de muros" é muro (fora da
   pista) antes de ser demolição; "Pintura horizontal" é sinalização antes de
   ser imprimação; "Muro D — 1. Escavação" é muro, não terraplenagem. */
var M3D_ETAPA_TESTES = [
  [null, /muro|arrimo|contencao|desapropri/],
  ['demolicao', /demoli|fresag|remocao|arrancamento/],
  [null, /passeio|calcada|podot|tatil|rampa|paisag|plantio|ilumina|urbanismo/],
  ['sinal', /sinaliza|pintura horizontal|tacha|legenda|faixa de pedestre/],
  ['capa', /\bsma\b|capa|cbuq|revestimento|rolamento|placa|concreto asf/],
  ['binder', /binder|\bpmf\b/],
  ['imprimacao', /imprima|pintura de liga|\blona\b/],
  ['base', /bgtc|\bbases?\b|solo.?cimento|concreto magro/],
  ['subbase', /rachao|\bbgs\b|sub.?base|reforco|macadame/],
  ['guias', /guia|sarjet|meio.?fio/],
  ['redes', /drenag|tubo|galeria|boca de lobo|\bbl\b|\bpv\b|poco de visita|bacia|bueiro|vala|duto|caixa|\brede/],
  ['terra', /terraplen|terraplan|escava|aterro|\bcorte\b|regulariza|subleito|movimento de terra/],
];
function m3dSemAcento(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}
/* -> índice em M3D_ETAPAS, ou -1 (fora da pista ou não se sabe) */
function m3dEtapaDe(nomePacote, frente) {
  var tenta = function (txt) {
    var t = m3dSemAcento(txt);
    if (!t) return undefined;
    for (var i = 0; i < M3D_ETAPA_TESTES.length; i++) {
      if (M3D_ETAPA_TESTES[i][1].test(t)) {
        var id = M3D_ETAPA_TESTES[i][0];
        return id ? M3D_ETAPAS.findIndex(function (e) { return e.id === id; }) : -1;
      }
    }
    return undefined;
  };
  var r = tenta(nomePacote);
  if (r === undefined) r = tenta(frente);
  return r === undefined ? -1 : r;
}

/* ---------- filtro de período */
function m3dHoje() { return getLocalISODate(new Date()); }
function m3dDiaMais(iso, n, unidade) {
  var d = new Date(iso + 'T12:00:00');
  if (unidade === 'mes') d.setMonth(d.getMonth() + n); else d.setDate(d.getDate() + n);
  return getLocalISODate(d);
}
function m3dDiasEntre(a, b) { return Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 86400000); }
function m3dDataLonga(iso) {
  var d = new Date(iso + 'T12:00:00');
  return isNaN(d) ? String(iso || '') : d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' });
}
function m3dNoPeriodo(iso) {
  var p = M3D.periodo;
  if (!p || p === 'tudo') return true;
  if (!iso) return false;
  if (p === 'linha') return iso <= (M3D.ate || m3dHoje());
  if (p === 'dia') return iso === M3D.dia;
  if (p === '7d' || p === '30d') {
    var lim = getLocalISODate(new Date(Date.now() - ((p === '7d' ? 7 : 30) - 1) * 86400000));
    return iso >= lim && iso <= m3dHoje();
  }
  if (/^\d{4}-\d{2}$/.test(p)) return iso.slice(0, 7) === p;
  return true;
}
function m3dRotuloMes(m) {
  var l = new Date(m + '-01T12:00:00').toLocaleString('pt-BR', { month: 'long', year: 'numeric' });
  return l.charAt(0).toUpperCase() + l.slice(1);
}
function m3dDescFiltro() {
  var p = M3D.periodo, partes = [];
  if (p === 'linha') partes.push('até ' + fmtData(M3D.ate || m3dHoje()));
  else if (p === 'dia' && M3D.dia) partes.push('RDO de ' + fmtData(M3D.dia));
  else if (p === '7d') partes.push('últimos 7 dias');
  else if (p === '30d') partes.push('últimos 30 dias');
  else if (/^\d{4}-\d{2}$/.test(p)) partes.push(m3dRotuloMes(p));
  else partes.push('toda a obra');
  if (M3D.pacote) {
    var pac = (STATE.pacotes || []).find(function (x) { return String(getCSVField(x, 'ID')) === M3D.pacote; });
    partes.push(pac ? getCSVField(pac, 'Pacote') : M3D.pacote);
  } else if (M3D.frente) partes.push(M3D.frente);
  return partes.join(' · ');
}

/* ---------- os lançamentos, por estaca */
function m3dPacotePorId() {
  var mp = new Map();
  (STATE.pacotes || []).forEach(function (p) { mp.set(String(getCSVField(p, 'ID')), p); });
  return mp;
}
/* Cada lançamento lido UMA vez por carga (estaca, frente, data, etapa,
   fotos): a linha do tempo refaz o mapa a cada quadro, e reler o
   Local_Estaca de mil linhas a cada 450 ms era o que pesava. O STATE.rdoavanco
   e o STATE.pacotes são TROCADOS (nunca mexidos no lugar) quando a carga
   muda — a referência deles é a chave do cache. */
var _m3dBase = { fonte: null, pac: null, linhas: [] };
function m3dBase() {
  if (_m3dBase.fonte === STATE.rdoavanco && _m3dBase.pac === STATE.pacotes) return _m3dBase.linhas;
  var pac = m3dPacotePorId(), linhas = [];
  (STATE.rdoavanco || []).forEach(function (r) {
    var pid = String(getCSVField(r, 'Pacote_ID') || getCSVField(r, 'Pacote_id') || '');
    if (!pid || pid === 'OUTRO') return;           // serviço avulso não tem lugar no mapa
    var ests = lerLocalEstaca(getCSVField(r, 'Local_Estaca'));
    if (!ests.length) return;
    var p = pac.get(pid);
    var frente = (p && getCSVField(p, 'Frente')) || 'Outros';
    linhas.push({ r: r, pid: pid, frente: frente, iso: normalizarDataCSV(getCSVField(r, 'Data')), ests: ests,
      id: String(getCSVField(r, 'ID') || ''),
      nf: fotosDaLinha(r).length, etapa: m3dEtapaDe((p && getCSVField(p, 'Pacote')) || getCSVField(r, 'Pacote_Nome'), frente) });
  });
  _m3dBase = { fonte: STATE.rdoavanco, pac: STATE.pacotes, linhas: linhas };
  return linhas;
}
/* A etapa de um lançamento qualquer (o detalhe da estaca lê linhas que não
   passaram pelo m3dBase) */
function m3dEtapaDaLinha(r, pac) {
  var pid = String(getCSVField(r, 'Pacote_ID') || getCSVField(r, 'Pacote_id') || '');
  var p = (pac || m3dPacotePorId()).get(pid);
  return m3dEtapaDe((p && getCSVField(p, 'Pacote')) || getCSVField(r, 'Pacote_Nome'), (p && getCSVField(p, 'Frente')) || '');
}
function m3dEstacas() {
  var out = new Map();
  m3dBase().forEach(function (L) {
    if (M3D.frente && L.frente !== M3D.frente) return;
    if (M3D.pacote && L.pid !== M3D.pacote) return;
    if (!m3dNoPeriodo(L.iso)) return;
    L.ests.forEach(function (e) {
      var k = e.eixo + ':' + e.num, a = out.get(k);
      if (!a) out.set(k, a = { chave: k, eixo: e.eixo, num: e.num, linhas: [], frentes: {}, ultima: '', fotos: 0, etapa: -1, top: [] });
      a.linhas.push(L.r);
      m3dTopInserir(a.top, L);
      a.frentes[L.frente] = (a.frentes[L.frente] || 0) + 1;
      if (L.iso > a.ultima) a.ultima = L.iso;
      a.fotos += L.nf;
      if (L.etapa > a.etapa) a.etapa = L.etapa;
    });
  });
  return out;
}
/* As etapas que ESTA obra tem: alguma pacote dela cai na etapa. A escada da
   estaca mostrava "Terraplenagem" pendente numa obra sem pacote de
   terraplenagem — trabalho por fazer que não existe. */
var _m3dEtapasObra = { pac: null, set: null };
function m3dEtapasDaObra() {
  if (_m3dEtapasObra.pac === STATE.pacotes && _m3dEtapasObra.set) return _m3dEtapasObra.set;
  var set = {};
  (STATE.pacotes || []).forEach(function (p) { var e = m3dEtapaDe(getCSVField(p, 'Pacote'), getCSVField(p, 'Frente')); if (e >= 0) set[e] = 1; });
  _m3dEtapasObra = { pac: STATE.pacotes, set: set };
  return set;
}

/* O começo e o fim da linha do tempo: do primeiro lançamento com estaca até
   o último (nunca depois de hoje). */
function m3dTempoLimites() {
  var ini = '', fim = '', hoje = m3dHoje();
  m3dBase().forEach(function (L) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(L.iso) || L.iso > hoje) return;
    if (!ini || L.iso < ini) ini = L.iso;
    if (L.iso > fim) fim = L.iso;
  });
  return { ini: ini || hoje, fim: fim || hoje };
}
/* Os 4 lançamentos mais novos da estaca, guardados enquanto a estaca é
   montada: ordenar TODAS as linhas de cada estaca (relendo a data a cada
   comparação) só para mostrar quatro custava 170–200 ms por quadro da linha
   do tempo — a reprodução engasgava no celular. */
var M3D_TOP = 4;
function m3dMaisNovo(x, y) { return x.iso > y.iso || (x.iso === y.iso && x.id > y.id); }
function m3dTopInserir(top, L) {
  if (top.length >= M3D_TOP && !m3dMaisNovo(L, top[top.length - 1])) return;
  var i = top.length;
  while (i > 0 && m3dMaisNovo(L, top[i - 1])) i--;
  top.splice(i, 0, L);
  if (top.length > M3D_TOP) top.pop();
}
function m3dFrentesOrdenadas(a) {
  // a estaca é refeita a cada montagem: a ordem das frentes vale por ela inteira
  if (a._frs) return a._frs;
  return (a._frs = Object.keys(a.frentes).sort(function (x, y) { return a.frentes[y] - a.frentes[x] || x.localeCompare(y); }));
}
/* "Há quantos dias": de hoje, ou — na linha do tempo — da data da linha */
function m3dDiasDesde(iso) {
  if (!iso) return Infinity;
  return m3dDiasEntre(iso, M3D.periodo === 'linha' && M3D.ate ? M3D.ate : m3dHoje());
}
function m3dCorDe(a, maxN, minN) {
  // do menor ao maior volume DO FILTRO: de 1 ao máximo, numa obra em que toda estaca tem 70 a 100 lançamentos, saía tudo da mesma cor
  if (M3D.cor === 'qtd') return m3dCorQtd(maxN > minN ? (a.linhas.length - minN) / (maxN - minN) : 1);
  if (M3D.cor === 'etapa') {
    if (M3D.etapaSel != null && a.etapa !== M3D.etapaSel) return M3D_APAGADA;
    return a.etapa >= 0 ? M3D_ETAPAS[a.etapa].cor : M3D_FORA_COR;
  }
  if (M3D.cor === 'recencia') {
    var dias = m3dDiasDesde(a.ultima);
    for (var i = 0; i < M3D_RECENCIA.length; i++) if (dias <= M3D_RECENCIA[i][0]) return M3D_RECENCIA[i][1];
  }
  return m3dCorFrente(m3dFrentesOrdenadas(a)[0] || '');
}
function m3dOrdenarLinhas(linhas) {
  return linhas.slice().sort(function (x, y) {
    return String(normalizarDataCSV(getCSVField(y, 'Data'))).localeCompare(String(normalizarDataCSV(getCSVField(x, 'Data')))) ||
      String(getCSVField(y, 'ID')).localeCompare(String(getCSVField(x, 'ID')));
  });
}
function m3dPodeLancar() { return !!(STATE.usuarioLogado && pode('lancarServico')); }

/* As faixas que vão para o visor. Tudo é texto pronto: o visor não conhece
   pacote, frente nem RDO. */
function m3dDados() {
  var est = m3dEstacas(), lista = Array.from(est.values());
  var ns = lista.map(function (a) { return a.linhas.length; });
  var maxN = Math.max.apply(null, [1].concat(ns)), minN = ns.length ? Math.min.apply(null, ns) : 1;
  var passo = pvMetrosPorEstaca(), lancar = m3dPodeLancar(), faixas = [];
  lista.forEach(function (a) {
    var eixoM = m3dEixoModelo(a.eixo);
    if (!eixoM) return;
    var eixo = eixoPorId(a.eixo), n = a.linhas.length;
    // as três frentes com mais lançamentos e quantas mais: a lista inteira ocupava seis linhas do painel do 3D
    var frs = m3dFrentesOrdenadas(a), fr = frs.slice(0, 3).map(function (f) { return f + ' (' + a.frentes[f] + ')'; }).join(', ') +
      (frs.length > 3 ? ' +' + (frs.length - 3) : '');
    var rows = [['Lançamentos', String(n)], ['Último', a.ultima ? fmtData(a.ultima) : '—']];
    rows.push(['Etapa', a.etapa >= 0 ? M3D_ETAPAS[a.etapa].nome : 'fora da pista']);
    rows.push(['Frentes', fr]);
    if (a.fotos) rows.push(['Fotos', String(a.fotos)]);
    a.top.forEach(function (L) {
      var r = L.r;
      rows.push([fmtData(getCSVField(r, 'Data')),
        ((nomeDoPacote(r) || '—') + ' · ' + fmtNum(num(getCSVField(r, 'Quantidade'))) + ' ' + (getCSVField(r, 'Unidade') || '')).trim()]);
    });
    var acoes = [['Ver lançamentos', 'historico']];
    if (a.fotos) acoes.push(['Fotos (' + a.fotos + ')', 'galeria']);
    if (lancar) acoes.push(['Lançar serviço aqui', 'lancar', true]);
    a.cor = m3dCorDe(a, maxN, minN);
    faixas.push({
      chave: a.chave, eixo: eixoM, m0: a.num * passo - passo / 2, m1: a.num * passo + passo / 2, cor: a.cor, fotos: a.fotos,
      titulo: 'E' + a.num + ' · ' + (eixo ? eixo.label : a.eixo),
      linha: (a.etapa >= 0 ? M3D_ETAPAS[a.etapa].nome + ' · ' : '') + n + ' lançamento' + (n > 1 ? 's' : '') +
        (a.ultima ? ' · último ' + fmtData(a.ultima) : '') + (a.fotos ? ' · ' + a.fotos + ' foto' + (a.fotos > 1 ? 's' : '') : ''),
      resumo: n + ' lançamento' + (n > 1 ? 's' : '') + ' · ' + frs.join(', '),
      rows: rows, acoes: acoes, src: 'serviços lançados no app (RDO_Avanco) · ' + m3dDescFiltro(),
    });
  });
  return { est: est, lista: lista, faixas: faixas, maxN: maxN, minN: minN };
}

/* "PD — Bairro→Centro": o rótulo que o visor põe ao lado da estaca do projeto */
function m3dRotulosEixos() {
  var rot = {};
  Object.keys((OBRA.modelo3d || {}).eixos || {}).forEach(function (app) {
    var e = eixoPorId(app);
    rot[OBRA.modelo3d.eixos[app]] = (e ? e.label : app) + ' · ' + app;
  });
  return rot;
}
/* Disciplina que o 3D precisa abrir para a frente filtrada fazer sentido: a
   drenagem é enterrada, e só aparece com a superfície transparente. */
function m3dCamadaDaFrente(f) {
  return f && typeof icFrente === 'function' && icFrente(f) === 'fDrenagem' ? 'dre' : null;
}

/* O carimbo de data que o visor põe no alto do 3D: na linha do tempo e no
   "um dia", é o que diz de QUANDO é aquela pintura. */
function m3dCarimbo(D) {
  var n = D.faixas.length + ' estaca' + (D.faixas.length !== 1 ? 's' : '') + ' com serviço';
  if (M3D.periodo === 'linha') return { t: m3dDataLonga(M3D.ate || m3dHoje()), s: 'linha do tempo · ' + n };
  if (M3D.periodo === 'dia' && M3D.dia) return { t: m3dDataLonga(M3D.dia), s: 'RDO do dia · ' + n };
  return null;
}

var _m3dUltimo = null;
function m3dSincronizar() {
  var D = m3dDados();
  _m3dUltimo = D;
  m3dEnviar({ tipo: 'execucao', faixas: D.faixas, rotulos: m3dRotulosEixos(), carimbo: m3dCarimbo(D),
    resumo: D.faixas.length + ' estaca' + (D.faixas.length !== 1 ? 's' : '') + ' com serviço · ' + m3dDescFiltro() });
  // a transparência só muda quando a frente muda: a linha do tempo sincroniza
  // a cada quadro, e o visor recompilaria os materiais todas as vezes
  var camada = m3dCamadaDaFrente(M3D.frente);
  if (camada !== M3D.realce && m3dEnviar({ tipo: 'realce', camada: camada })) M3D.realce = camada;
  m3dDesenharPartes(D);
  m3dDesenharTempo();
  return D;
}

/* ---------- a tela */
function renderModelo3D() {
  if (!OBRA.modelo3d) {
    return '<div class="card"><div class="card-body" style="text-align:center;padding:34px">' +
      '<div class="empty-icon" style="width:48px;height:48px;margin-bottom:10px">' + ic('cubo') + '</div>' +
      '<div style="font-weight:700;margin-top:8px">Esta obra ainda não tem modelo 3D</div>' +
      '<div style="font-size:var(--fs-md);color:var(--muted);margin-top:5px">O modelo entra pela ' +
      '<code>ferramentas/modelo3d-importar.py</code> e é declarado em <code>modelo3d</code> no cadastro da obra.</div>' +
      '</div></div>';
  }
  M3D.pronto = false;   // iframe novo: espera ele dizer que está escutando
  M3D.falhou = false;
  M3D.apresentando = false;
  M3D.realce = undefined;
  M3D.fotos = null;
  m3dParar();
  return '' +
    '<div class="card m3d-card stagger-item">' +
      '<div class="card-header m3d-header">' +
        '<div style="min-width:0">' +
          '<div class="card-title">' + ic('cubo') + ' Modelo 3D · ' + escHtml(OBRA.nomeCurto || OBRA.nome) + '</div>' +
          '<div class="card-title-sub" id="m3dResumo">Carregando o modelo…</div>' +
        '</div>' +
        '<div class="m3d-acoes">' +
          '<button type="button" class="btn btn-sm" id="m3dBtnApresentar" onclick="m3dApresentar()" aria-pressed="false" title="Um voo guiado pela obra, trecho a trecho, com legendas — para mostrar a quem não conhece o projeto" aria-label="Apresentar a obra">' + ic('play') + '<span class="m3d-rot"> Apresentar</span></button>' +
          '<button type="button" class="btn btn-sm" onclick="m3dTelaCheia()" title="O modelo na tela inteira" aria-label="Tela cheia">' + ic('apresentar') + '<span class="m3d-rot"> Tela cheia</span></button>' +
          '<a class="btn btn-sm m3d-so-pc" href="' + escHtml(m3dSrc().replace('&embed=1', '')) + '" target="_blank" rel="noopener" title="Abrir o modelo sozinho, em outra aba">' + ic('enviar') + ' Abrir</a>' +
          '<button type="button" class="btn btn-sm" id="m3dBtnGuardar" onclick="m3dGuardarOffline()" title="Baixar o modelo para abrir no canteiro sem sinal" aria-label="Guardar para abrir sem sinal">' + ic('nuvem') + '<span class="m3d-rot"> Offline</span></button>' +
        '</div>' +
      '</div>' +
      '<div id="m3dFiltros">' + m3dFiltrosHtml() + '</div>' +
      '<div class="m3d-visor" id="m3dVisor">' +
        '<iframe id="m3dFrame" src="' + escHtml(m3dSrc()) + '" title="Modelo 3D da obra" allow="fullscreen"></iframe>' +
        '<div class="m3d-tempo" id="m3dTempo" hidden></div>' +
      '</div>' +
      '<div class="m3d-legenda" id="m3dLegenda"></div>' +
    '</div>' +
    '<div class="m3d-lados">' +
      '<div class="card" id="m3dDetalhe"></div>' +
      '<div class="card" id="m3dLista"></div>' +
    '</div>';
}

/* "Apresentar a obra": o voo guiado mora no visor (js/modelo3d/cine.js); o app
   só pede e para. Com o 3D fora da vista, o pedido traz ele para a tela. */
window.m3dApresentar = function () {
  // o 3D que não abriu (sem WebGL) não está "carregando": dizer isso fazia esperar para sempre
  if (M3D.falhou) { toast('O 3D não abriu neste aparelho (WebGL indisponível) — não há o que apresentar aqui.', 'error', 5000); return; }
  if (!M3D.pronto) { toast('O modelo ainda está carregando.', 'info', 2500); return; }
  if (M3D.apresentando) { m3dEnviar({ tipo: 'parar-apresentacao' }); return; }
  var v = document.getElementById('m3dVisor'); if (v && v.getBoundingClientRect().top < 0) v.scrollIntoView({ block: 'start' });
  m3dEnviar({ tipo: 'apresentar' });
};
/* O Esc só chegava ao visor com o foco DENTRO do iframe; quem tinha tocado no
   botão do app (o foco ficou aqui fora) apertava Esc e nada acontecia. */
// (fora do navegador — o teste das etapas lê este arquivo numa VM — não há documento)
if (typeof document !== 'undefined') document.addEventListener('keydown', function (e) {
  if (e.key === 'Escape' && M3D.apresentando && STATE.currentPage === 'modelo3d') m3dEnviar({ tipo: 'parar-apresentacao' });
});

function m3dFiltrosHtml() {
  var meses = {}, frentesSet = {};
  (STATE.rdoavanco || []).forEach(function (r) {
    var iso = normalizarDataCSV(getCSVField(r, 'Data'));
    if (/^\d{4}-\d{2}/.test(iso)) meses[iso.slice(0, 7)] = 1;
  });
  (STATE.pacotes || []).forEach(function (p) { var f = getCSVField(p, 'Frente'); if (f) frentesSet[f] = 1; });
  var listaMeses = Object.keys(meses).sort().reverse();
  var frentes = Object.keys(frentesSet).sort();
  var pacotes = (STATE.pacotes || []).filter(function (p) {
    return getCSVField(p, 'Status') !== 'Histórico' && (!M3D.frente || getCSVField(p, 'Frente') === M3D.frente);
  });
  var opt = function (v, t, sel) { return '<option value="' + escHtml(v) + '"' + (sel ? ' selected' : '') + '>' + escHtml(t) + '</option>'; };
  var seg = function (v, t) { return '<button type="button" aria-pressed="' + (M3D.cor === v) + '" onclick="m3dFiltro(\'cor\',\'' + v + '\')">' + t + '</button>'; };
  return '<div class="m3d-filtros">' +
    '<label for="m3dPeriodo">Período</label>' +
    '<select id="m3dPeriodo" onchange="m3dFiltro(\'periodo\', this.value)">' +
      opt('tudo', 'Toda a obra', M3D.periodo === 'tudo') + opt('7d', 'Últimos 7 dias', M3D.periodo === '7d') +
      opt('30d', 'Últimos 30 dias', M3D.periodo === '30d') + opt('dia', 'Um dia (RDO)', M3D.periodo === 'dia') +
      opt('linha', 'Linha do tempo (4D)', M3D.periodo === 'linha') +
      listaMeses.map(function (m) { return opt(m, m3dRotuloMes(m), M3D.periodo === m); }).join('') +
    '</select>' +
    (M3D.periodo === 'dia' ? '<input type="date" id="m3dDia" value="' + escHtml(M3D.dia || m3dHoje()) + '" onchange="m3dFiltro(\'dia\', this.value)" aria-label="Dia do RDO">' : '') +
    '<label for="m3dFrente">Frente</label>' +
    '<select id="m3dFrente" onchange="m3dFiltro(\'frente\', this.value)">' + opt('', 'Todas', !M3D.frente) +
      frentes.map(function (f) { return opt(f, f, M3D.frente === f); }).join('') + '</select>' +
    '<label for="m3dPacote">Pacote</label>' +
    '<select id="m3dPacote" onchange="m3dFiltro(\'pacote\', this.value)">' + opt('', 'Todos', !M3D.pacote) +
      pacotes.map(function (p) { var id = String(getCSVField(p, 'ID')); return opt(id, getCSVField(p, 'Pacote') || id, M3D.pacote === id); }).join('') + '</select>' +
    '<span class="m3d-cor-rot">Cor</span>' +
    '<span class="m3d-seg" role="group" aria-label="O que a cor da estaca mostra">' + seg('frente', 'Frente') + seg('etapa', 'Etapa') + seg('qtd', 'Volume') + seg('recencia', 'Recência') + '</span>' +
  '</div>';
}

window.m3dFiltro = function (campo, valor) {
  if (campo === 'periodo') {
    M3D.periodo = valor || 'tudo';
    if (valor === 'dia' && !M3D.dia) M3D.dia = m3dHoje();
    // a linha do tempo abre no FIM (a obra como está), pronta para o ▶ voltar ao começo
    if (valor === 'linha') M3D.ate = m3dTempoLimites().fim;
    else m3dParar();
  }
  else if (campo === 'dia') M3D.dia = valor || m3dHoje();
  else if (campo === 'passo') { M3D.passo = valor || 'semana'; return; }
  else if (campo === 'frente') { M3D.frente = valor; M3D.pacote = ''; }
  else if (campo === 'pacote') {
    M3D.pacote = valor;
    var p = valor && m3dPacotePorId().get(valor);
    if (p) M3D.frente = getCSVField(p, 'Frente') || M3D.frente;
  }
  else if (campo === 'cor') { M3D.cor = valor; M3D.etapaSel = null; try { localStorage.setItem(M3D_LS_COR, valor); } catch (e) { } }
  var box = document.getElementById('m3dFiltros');
  if (box) box.innerHTML = m3dFiltrosHtml();
  m3dSincronizar();
};

/* Troca o HTML de uma parte da tela SÓ quando ele mudou, e devolve a rolagem
   das listas de dentro. A linha do tempo redesenha tudo a cada 450 ms: a lista
   de estacas voltava para o topo no meio da rolagem, e as miniaturas piscavam. */
function m3dPor(el, html) {
  if (!el || el._m3dHtml === html) return false;
  var rol = [].map.call(el.querySelectorAll('.m3d-lista, .m3d-fotos'), function (x) { return x.scrollTop || x.scrollLeft ? [x.scrollTop, x.scrollLeft] : null; });
  el.innerHTML = html; el._m3dHtml = html;
  [].forEach.call(el.querySelectorAll('.m3d-lista, .m3d-fotos'), function (x, i) { if (rol[i]) { x.scrollTop = rol[i][0]; x.scrollLeft = rol[i][1]; } });
  return true;
}

function m3dDesenharPartes(D) {
  D = D || _m3dUltimo || m3dDados();
  var res = document.getElementById('m3dResumo');
  if (res) {
    var nL = 0; D.lista.forEach(function (a) { nL += a.linhas.length; });
    m3dPor(res, D.lista.length ? escHtml(D.lista.length + ' estaca' + (D.lista.length !== 1 ? 's' : '') + ' com serviço · ' + m3dDescFiltro()) +
        '<span class="m3d-dica"> — toque numa faixa colorida para ver o que foi lançado ali</span>'
      : escHtml('Nenhum serviço com estaca em ' + m3dDescFiltro() + '.'));
  }
  m3dDesenharLegenda(D);
  m3dDesenharLista(D);
  m3dDesenharDetalhe(D);
}

function m3dDesenharLegenda(D) {
  D = D || _m3dUltimo || m3dDados();
  var el = document.getElementById('m3dLegenda');
  if (!el) return;
  var h = '';
  if (M3D.cor === 'qtd') {
    h = '<span>Volume de lançamentos</span><span>' + (D.minN || 1) + '</span><span class="rampa" style="background:linear-gradient(90deg,' +
      m3dCorQtd(0) + ',' + m3dCorQtd(0.5) + ',' + m3dCorQtd(1) + ')"></span><span>' + D.maxN + '</span>';
  } else if (M3D.cor === 'recencia') {
    h = '<span>Último lançamento' + (M3D.periodo === 'linha' ? ' (contado da data da linha)' : '') + ':</span>' +
      M3D_RECENCIA.map(function (r) { return '<span><i style="background:' + r[1] + '"></i>' + r[2] + '</span>'; }).join('');
  } else if (M3D.cor === 'etapa') {
    var porEt = {}, fora = 0;
    D.lista.forEach(function (a) { if (a.etapa >= 0) porEt[a.etapa] = (porEt[a.etapa] || 0) + 1; else fora++; });
    // cada etapa da legenda é um botão: realça só as estacas dela (as outras ficam cinza no 3D e na lista)
    h = '<span>Até onde a pista chegou:</span>' + M3D_ETAPAS.map(function (e, i) {
      if (!porEt[i] && M3D.etapaSel !== i) return '';
      return '<button type="button" class="m3d-leg-bt" aria-pressed="' + (M3D.etapaSel === i) + '" onclick="m3dEtapaRealce(' + i + ')" ' +
        'title="' + escHtml(M3D.etapaSel === i ? 'Voltar a mostrar todas as etapas' : 'Realçar só as estacas em ' + e.nome) + '">' +
        '<i style="background:' + e.cor + '"></i>' + escHtml(e.nome) + ' <small>(' + (porEt[i] || 0) + ')</small></button>';
    }).join('') + (fora ? '<span><i style="background:' + M3D_FORA_COR + '"></i>Fora da pista (muro, passeio…) <small>(' + fora + ')</small></span>' : '') +
      (D.lista.length ? '' : '<span>Nenhuma estaca com serviço neste filtro.</span>');
    h += m3dAvancoEtapasHtml();
  } else {
    var cont = {};
    D.lista.forEach(function (a) { var f = m3dFrentesOrdenadas(a)[0]; if (f) cont[f] = (cont[f] || 0) + 1; });
    var fs = Object.keys(cont).sort(function (x, y) { return cont[y] - cont[x]; });
    h = fs.length ? '<span>Frente com mais lançamentos na estaca:</span>' + fs.map(function (f) {
      return '<span><i style="background:' + m3dCorFrente(f) + '"></i>' + escHtml(f) + ' <small>(' + cont[f] + ')</small></span>';
    }).join('') : '<span>Nenhuma estaca com serviço neste filtro.</span>';
  }
  m3dPor(el, h + '<span class="m3d-legenda-nota">' + ic('info') + ' cada faixa cobre a pista da estaca (meia estaca para cada lado)</span>');
}

/* O AVANÇO DA PISTA POR ETAPA: quantas estacas dos eixos do modelo já
   chegaram a cada degrau da escada. Acumulado — a estaca que está no Binder
   já passou pela base —, e contado sobre TODAS as estacas do eixo (com ou sem
   lançamento), que é o que "quanto da avenida" quer dizer. Não é a medição:
   a Avanço Físico mede quantidade; isto mede extensão. */
function m3dAvancoEtapas() {
  var eixos = eixosDaObraAtiva().filter(function (x) { return m3dEixoModelo(x.id); });
  var total = 0, nos = {};
  eixos.forEach(function (x) { total += Math.max(0, (+x.fim) - (+x.ini) + 1); nos[x.id] = x; });
  var tem = m3dEtapasDaObra(), conta = M3D_ETAPAS.map(function () { return 0; });
  /* De TODOS os lançamentos, não do filtro: com "últimos 7 dias" ou uma
     frente escolhida, o "quanto da avenida chegou à base" contava só o que o
     filtro deixava — a obra parecia andar para trás. Só a linha do tempo
     corta, na data dela: é o avanço ATÉ aquele dia. */
  var ate = M3D.periodo === 'linha' ? (M3D.ate || m3dHoje()) : '';
  var topo = new Map();
  m3dBase().forEach(function (L) {
    if (L.etapa < 0 || (ate && L.iso > ate)) return;
    L.ests.forEach(function (e) {
      var x = nos[e.eixo]; if (!x || e.num < +x.ini || e.num > +x.fim) return;
      var k = e.eixo + ':' + e.num;
      if (!(topo.get(k) >= L.etapa)) topo.set(k, L.etapa);
    });
  });
  topo.forEach(function (et) { for (var i = 0; i <= et; i++) conta[i]++; });
  return { total: total, etapas: M3D_ETAPAS.map(function (e, i) { return { i: i, nome: e.nome, cor: e.cor, n: conta[i], tem: !!tem[i] || conta[i] > 0 }; }).filter(function (e) { return e.tem; }) };
}
function m3dAvancoEtapasHtml() {
  var A = m3dAvancoEtapas();
  if (!A.total || !A.etapas.length) return '';
  return '<details class="m3d-avanco"' + (M3D.avancoAberto ? ' open' : '') + ' ontoggle="M3D.avancoAberto=this.open">' +
    '<summary>Avanço da pista por etapa <small>' + A.total + ' estacas nos eixos do modelo' + (M3D.periodo === 'linha' ? ' · até ' + escHtml(fmtData(M3D.ate || m3dHoje())) : '') + '</small></summary>' +
    '<div class="m3d-avanco-lista">' + A.etapas.map(function (e) {
      var pc = Math.round(100 * e.n / A.total);
      return '<button type="button" class="m3d-av" aria-pressed="' + (M3D.etapaSel === e.i) + '" onclick="m3dEtapaRealce(' + e.i + ')" ' +
        'title="' + escHtml(e.n + ' de ' + A.total + ' estacas já chegaram a ' + e.nome + ' (ou além)') + '">' +
        '<span class="m3d-av-nome">' + escHtml(e.nome) + '</span>' +
        '<span class="m3d-av-barra"><i style="width:' + pc + '%;background:' + e.cor + '"></i></span>' +
        '<span class="m3d-av-pc">' + pc + '%</span></button>';
    }).join('') + '</div>' +
    '<div class="m3d-av-nota">Estacas que já receberam a etapa ou uma posterior, pelo que o RDO lançou. Mede extensão, não quantidade — a medição continua na Avanço Físico.</div>' +
  '</details>';
}
window.m3dEtapaRealce = function (i) {
  M3D.etapaSel = M3D.etapaSel === i ? null : i;
  m3dSincronizar();
};

function m3dDesenharLista(D) {
  D = D || _m3dUltimo || m3dDados();
  var el = document.getElementById('m3dLista');
  if (!el) return;
  var eixos = eixosDaObraAtiva().filter(function (x) { return m3dEixoModelo(x.id); });
  var porEixo = eixos.map(function (x) {
    var lista = D.lista.filter(function (a) { return a.eixo === x.id; }).sort(function (a, b) { return a.num - b.num; });
    return '<div class="m3d-lista-eixo">' + escHtml(x.label) + ' · E' + x.ini + '–E' + x.fim + ' <small>' + lista.length + ' com serviço</small></div>' +
      (lista.length ? '<div class="m3d-lista">' + lista.map(function (a) {
        return '<button type="button" class="m3d-est' + (M3D.sel === a.chave ? ' on' : '') + '" onclick="m3dSelecionar(' + jsArg(a.chave) + ')" ' +
          'title="' + escHtml('E' + a.num + ' · ' + a.linhas.length + ' lançamento(s) · último em ' + fmtData(a.ultima)) + '">' +
          '<i style="background:' + escHtml(a.cor || '#999') + '"></i><b>E' + a.num + '</b><small>' + a.linhas.length + '</small></button>';
      }).join('') + '</div>' : '<div class="m3d-vazio">Nada lançado com estaca neste eixo, neste filtro.</div>');
  }).join('');
  /* O "Ir para a estaca" é montado UMA vez; só a lista abaixo dele é refeita.
     Com a linha do tempo tocando a lista muda a cada quadro, e o campo era
     redesenhado junto: o número digitado sumia e o teclado fechava. */
  var corpo = document.getElementById('m3dListaCorpo');
  if (!corpo) {
    el.innerHTML = '<div class="card-header"><div><div class="card-title">Estacas com serviço</div>' +
      '<div class="card-title-sub">Toque para levar o 3D até a estaca</div></div></div>' +
      '<div class="card-body">' +
        '<div class="m3d-ir"><label for="m3dIrNum">Ir para a estaca</label>' +
          (eixos.length > 1 ? '<select id="m3dIrEixo" aria-label="Eixo">' + eixos.map(function (x) { return '<option value="' + escHtml(x.id) + '">' + escHtml(x.label) + '</option>'; }).join('') + '</select>' : '') +
          '<input id="m3dIrNum" type="text" inputmode="numeric" placeholder="ex.: 212" onkeyup="if(event.key===\'Enter\') m3dIrDigitada()">' +
          '<button type="button" class="btn btn-outline btn-sm" onclick="m3dIrDigitada()">' + ic('lupa') + ' Ir</button>' +
          '<div class="field-error" id="m3dIrErro" style="display:none;flex-basis:100%"></div>' +
        '</div><div id="m3dListaCorpo"></div>' +
      '</div>';
    el._m3dHtml = null;
    corpo = document.getElementById('m3dListaCorpo');
  }
  m3dPor(corpo, porEixo);
}

function m3dDesenharDetalhe(D) {
  var el = document.getElementById('m3dDetalhe');
  if (!el) return;
  D = D || _m3dUltimo;
  if (!M3D.sel) {
    m3dPor(el, '<div class="card-header"><div><div class="card-title">' + ic('pino') + ' Estaca</div>' +
      '<div class="card-title-sub">O que foi lançado onde você tocar</div></div></div>' +
      '<div class="card-body"><div class="m3d-vazio">Toque numa faixa colorida no modelo, ou numa estaca da lista, ' +
      'para ver os serviços lançados nela' + (m3dPodeLancar() ? ' — e lançar um serviço novo ali mesmo' : '') + '.</div></div>');
    return;
  }
  var partes = M3D.sel.split(':'), eixoId = partes[0], n = +partes[1];
  var eixo = eixoPorId(eixoId);
  var todas = lancamentosNaEstaca(eixoId, n);
  var a = D && D.est.get(M3D.sel);
  var noFiltro = a ? m3dOrdenarLinhas(a.linhas) : [];
  var pac = m3dPacotePorId();
  var fotos = 0; todas.forEach(function (r) { fotos += fotosDaLinha(r).length; });
  var linha = function (r) {
    var pid = String(getCSVField(r, 'Pacote_ID') || getCSVField(r, 'Pacote_id') || '');
    var p = pac.get(pid);
    var un = p ? (getCSVField(p, 'Unidade Física') || '') : (getCSVField(r, 'Unidade') || '');
    var nf = fotosDaLinha(r).length;
    return '<div class="m3d-lanc">' +
      '<span class="t-mono m3d-lanc-data">' + escHtml(fmtData(getCSVField(r, 'Data'))) + '</span>' +
      '<span class="m3d-lanc-pac">' + escHtml(nomeDoPacote(r) || pid || '—') +
        '<small>' + escHtml([getCSVField(r, 'Local_Estaca'), getCSVField(r, 'Turno'), getCSVField(r, 'Apontador')].filter(Boolean).join(' · ')) +
        (nf ? ' · ' + nf + ' foto' + (nf > 1 ? 's' : '') : '') + '</small></span>' +
      '<span class="t-mono m3d-lanc-qtd">' + fmtNum(num(getCSVField(r, 'Quantidade')), 2) + ' ' + escHtml(un) + '</span></div>';
  };
  var lista = noFiltro.length ? noFiltro : todas;
  // a escada: cada etapa que já recebeu lançamento aqui, com a data do último
  var feitas = {}, topo = -1;
  lista.forEach(function (r) {
    var e = m3dEtapaDaLinha(r, pac), iso = normalizarDataCSV(getCSVField(r, 'Data'));
    if (e < 0) return;
    if (!feitas[e] || iso > feitas[e]) feitas[e] = iso;
    if (e > topo) topo = e;
  });
  var escada = topo < 0 ? '' :
    '<div class="m3d-etapas-tit">Até onde a pista chegou: <b>' + escHtml(M3D_ETAPAS[topo].nome) + '</b></div>' +
    '<div class="m3d-etapas" role="list" aria-label="Etapas da pista nesta estaca">' + M3D_ETAPAS.map(function (e, i) {
      if (!feitas[i] && !m3dEtapasDaObra()[i]) return '';   // etapa que a obra não tem não é pendência
      return feitas[i]
        ? '<span role="listitem" class="on" title="' + escHtml(e.nome + ' — último lançamento em ' + fmtData(feitas[i])) + '"><i style="background:' + e.cor + '"></i>' + ic('check') + escHtml(e.nome) + ' <small>' + escHtml(fmtData(feitas[i])) + '</small></span>'
        : '<span role="listitem"><i></i>' + escHtml(e.nome) + '</span>';
    }).join('') + '</div>';
  var aviso = !todas.length ? 'Nenhum serviço lançado nesta estaca ainda.'
    : !noFiltro.length ? 'Nada nesta estaca no filtro atual — abaixo, tudo o que já foi lançado nela.'
    : (noFiltro.length < todas.length ? noFiltro.length + ' de ' + todas.length + ' lançamentos (filtro: ' + escHtml(m3dDescFiltro()) + ')' : '');
  m3dPor(el, '<div class="card-header"><div><div class="card-title">' + ic('pino') + ' Estaca E' + n + ' · ' + escHtml(eixo ? eixo.label : eixoId) + '</div>' +
      '<div class="card-title-sub">' + todas.length + ' lançamento' + (todas.length !== 1 ? 's' : '') + ' no total' + (fotos ? ' · ' + fotos + ' foto' + (fotos > 1 ? 's' : '') : '') + '</div></div>' +
      '<button type="button" class="btn btn-ghost btn-sm" onclick="m3dSelecionar(null)" aria-label="Fechar a estaca">' + ic('fechar') + '</button></div>' +
    '<div class="card-body">' +
      '<div class="m3d-det-acoes">' +
        (m3dPodeLancar() ? '<button type="button" class="btn btn-primary btn-sm" onclick="m3dLancarNaEstaca(' + jsArg(eixoId) + ',' + n + ')">' + ic('lancar') + ' Lançar serviço aqui</button>' : '') +
        (todas.length ? '<button type="button" class="btn btn-outline btn-sm" onclick="m3dAcao(\'historico\',' + jsArg(M3D.sel) + ')">' + ic('historico') + ' No Histórico</button>' : '') +
        (fotos ? '<button type="button" class="btn btn-outline btn-sm" onclick="m3dAcao(\'galeria\',' + jsArg(M3D.sel) + ')">' + ic('galeria') + ' Fotos</button>' : '') +
        '<button type="button" class="btn btn-ghost btn-sm" onclick="m3dIrEstaca(' + jsArg(eixoId) + ',' + n + ')">' + ic('pino') + ' Centralizar</button>' +
      '</div>' +
      escada +
      (fotos ? '<div class="m3d-fotos" id="m3dFotos"></div>' : '') +
      (aviso ? '<div class="m3d-vazio">' + aviso + '</div>' : '') +
      lista.slice(0, 15).map(linha).join('') +
      (lista.length > 15 ? '<div class="m3d-vazio">+ ' + (lista.length - 15) + ' mais — veja no Histórico</div>' : '') +
    '</div>');
  if (fotos) m3dDesenharFotos();
}

/* ---------- as fotos da estaca aberta
   As mesmas miniaturas da Galeria: baixarFotoServidor(id, true), com o
   cache do aparelho e o login de quem está no app. Sem login não há foto
   (o Drive é privado) — a tela diz isso em vez de mostrar quadro vazio. */
var M3D_MAX_FOTOS = 8;
function m3dFotosDaEstaca(chave) {
  var p = String(chave).split(':'), itens = [];
  m3dOrdenarLinhas(lancamentosNaEstaca(p[0], +p[1])).forEach(function (r) {
    fotosDaLinha(r).forEach(function (ptr) {
      var id = fotoFileId(ptr);
      if (!id || itens.length >= M3D_MAX_FOTOS || itens.some(function (x) { return x.fileId === id; })) return;
      itens.push({ fileId: id, limpa: fotoLimpaId(ptr), src: '',
        legenda: [fmtData(getCSVField(r, 'Data')), nomeDoPacote(r), getCSVField(r, 'Local_Estaca')].filter(Boolean).join(' · ') });
    });
  });
  return itens;
}
/* Chamada a cada estaca aberta (no app ou no 3D). Na mesma estaca, só
   reenvia o que já tem — o visor pede de novo a cada toque. */
function m3dCarregarFotos(chave) {
  if (!chave) { M3D.fotos = null; return; }
  if (!M3D.fotos || M3D.fotos.chave !== chave) {
    var itens = m3dFotosDaEstaca(chave);
    M3D.fotos = { chave: chave, itens: itens };
    if (STATE.usuarioLogado) itens.forEach(function (it) {
      baixarFotoServidor(it.fileId, true).then(function (src) {
        if (!M3D.fotos || M3D.fotos.chave !== chave || !src) return;
        it.src = src;
        m3dDesenharFotos(); m3dEnviarFotos();
      });
    });
  }
  m3dDesenharFotos(); m3dEnviarFotos();
}
function m3dEnviarFotos() {
  var F = M3D.fotos;
  if (!F || !F.itens.length) return;
  m3dEnviar({ tipo: 'miniaturas', chave: F.chave,
    aviso: STATE.usuarioLogado ? '' : 'Entre no app para ver as fotos.',
    itens: STATE.usuarioLogado ? F.itens.map(function (it) { return { src: it.src, legenda: it.legenda }; }) : [] });
}
function m3dDesenharFotos() {
  var el = document.getElementById('m3dFotos'), F = M3D.fotos;
  if (!el) return;
  if (!F || F.chave !== M3D.sel || !F.itens.length) { m3dPor(el, ''); return; }
  if (!STATE.usuarioLogado) { m3dPor(el, '<span class="m3d-vazio">' + ic('cadeado') + ' entre para ver as fotos desta estaca</span>'); return; }
  m3dPor(el, F.itens.map(function (it, i) {
    return '<button type="button" onclick="m3dVerFoto(' + i + ')" title="' + escHtml(it.legenda) + '" aria-label="' + escHtml('Ampliar a foto: ' + it.legenda) + '">' +
      (it.src ? '<img src="' + escHtml(it.src) + '" alt="">' : '<span>' + ic('camera') + '</span>') + '</button>';
  }).join(''));
}
/* O índice vem do visor (ou do clique aqui): o id do Drive é o que ESTA tela
   guardou, nunca o que chega por mensagem. */
window.m3dVerFoto = function (i) {
  var it = M3D.fotos && M3D.fotos.itens[+i];
  if (!it) return;
  try { if (document.fullscreenElement) document.exitFullscreen().catch(function () { }); } catch (e) { }
  ampliarFoto(it.fileId, it.legenda, it.limpa);
};

/* ---------- a linha do tempo (4D)
   A barra fica dentro do #m3dVisor (vai junto para a tela cheia) e é só
   ATUALIZADA a cada quadro — refazer o HTML dela tiraria o dedo do controle
   deslizante no meio do arraste. */
var M3D_PASSOS = [['dia', '1 dia por passo'], ['semana', '1 semana por passo'], ['mes', '1 mês por passo']];
function m3dDesenharTempo() {
  var el = document.getElementById('m3dTempo');
  if (!el) return;
  if (M3D.periodo !== 'linha') { if (!el.hidden) { el.hidden = true; el.innerHTML = ''; } return; }
  var L = m3dTempoLimites(), total = Math.max(0, m3dDiasEntre(L.ini, L.fim));
  if (!M3D.ate || M3D.ate > L.fim) M3D.ate = L.fim;
  if (M3D.ate < L.ini) M3D.ate = L.ini;
  var v = m3dDiasEntre(L.ini, M3D.ate);
  if (el.hidden || el.dataset.ini !== L.ini || el.dataset.fim !== L.fim) {
    el.dataset.ini = L.ini; el.dataset.fim = L.fim;
    el.innerHTML =
      '<button type="button" class="btn btn-primary btn-sm m3d-play" id="m3dPlay" onclick="m3dTocar()"></button>' +
      '<span class="m3d-tempo-ext t-mono">' + escHtml(fmtData(L.ini)) + '</span>' +
      '<input type="range" id="m3dTempoR" min="0" max="' + total + '" step="1" value="' + v + '" aria-label="Data da linha do tempo" oninput="m3dTempoIr(this.value)">' +
      '<span class="m3d-tempo-ext t-mono">' + escHtml(fmtData(L.fim)) + '</span>' +
      '<b class="m3d-tempo-data t-mono" id="m3dTempoData" aria-live="off"></b>' +
      '<select id="m3dPasso" aria-label="Quanto a reprodução anda a cada passo" onchange="m3dFiltro(\'passo\', this.value)">' +
        M3D_PASSOS.map(function (p) { return '<option value="' + p[0] + '"' + (M3D.passo === p[0] ? ' selected' : '') + '>' + p[1] + '</option>'; }).join('') +
      '</select>';
    el.hidden = false;
  }
  var r = document.getElementById('m3dTempoR');
  if (r && document.activeElement !== r) r.value = v;
  var dt = document.getElementById('m3dTempoData');
  if (dt) dt.textContent = m3dDataLonga(M3D.ate);
  var b = document.getElementById('m3dPlay');
  if (b) {
    m3dPor(b, ic(M3D.tocando ? 'pausa' : 'play') + (M3D.tocando ? ' Pausar' : ' Reproduzir'));
    b.setAttribute('aria-pressed', M3D.tocando ? 'true' : 'false');
  }
}
/* O controle deslizante: a data muda na hora, o 3D a cada 80 ms — arrastar
   de ponta a ponta dispara centenas de 'input'. */
var _m3dTempoT = 0;
window.m3dTempoIr = function (v) {
  m3dParar();
  var L = m3dTempoLimites();
  M3D.ate = m3dDiaMais(L.ini, Math.max(0, +v || 0));
  if (M3D.ate > L.fim) M3D.ate = L.fim;
  var dt = document.getElementById('m3dTempoData');
  if (dt) dt.textContent = m3dDataLonga(M3D.ate);
  if (!_m3dTempoT) _m3dTempoT = setTimeout(function () { _m3dTempoT = 0; m3dSincronizar(); }, 80);
};
function m3dParar() {
  if (M3D.tocando) { clearInterval(M3D.tocando); M3D.tocando = 0; }
  var b = document.getElementById('m3dPlay');
  if (b) { m3dPor(b, ic('play') + ' Reproduzir'); b.setAttribute('aria-pressed', 'false'); }
}
window.m3dTocar = function () {
  if (M3D.tocando) { m3dParar(); return; }
  if (M3D.periodo !== 'linha') { M3D.periodo = 'linha'; var box = document.getElementById('m3dFiltros'); if (box) box.innerHTML = m3dFiltrosHtml(); }
  var L = m3dTempoLimites();
  if (!M3D.ate || M3D.ate >= L.fim) M3D.ate = L.ini;   // no fim, o ▶ recomeça do primeiro dia
  M3D.tocando = setInterval(function () {
    // saiu da tela (ou do modo): a reprodução para sozinha
    if (STATE.currentPage !== 'modelo3d' || !document.getElementById('m3dFrame') || M3D.periodo !== 'linha') { m3dParar(); return; }
    var lim = m3dTempoLimites();
    var prox = M3D.passo === 'mes' ? m3dDiaMais(M3D.ate, 1, 'mes') : m3dDiaMais(M3D.ate, M3D.passo === 'dia' ? 1 : 7);
    M3D.ate = prox >= lim.fim ? lim.fim : prox;
    m3dSincronizar();
    if (M3D.ate >= lim.fim) m3dParar();
  }, 450);
  m3dSincronizar();
};

/* ---------- ações */
window.m3dSelecionar = function (chave) {
  M3D.sel = chave || null;
  if (chave) {
    var p = String(chave).split(':'), eixoM = m3dEixoModelo(p[0]);
    if (eixoM) m3dEnviar({ tipo: 'ir', chave: chave, eixo: eixoM, m: (+p[1]) * pvMetrosPorEstaca() });
  } else m3dEnviar({ tipo: 'soltar' });
  m3dDesenharLista();
  m3dDesenharDetalhe();
  m3dCarregarFotos(M3D.sel);
};

/* Outra tela pede uma estaca no 3D: o filtro volta para "toda a obra", que é
   o que quem chega de um lançamento espera ver — a estaca com tudo dela. */
window.m3dIrEstaca = function (eixoApp, num) {
  var eixoM = m3dEixoModelo(eixoApp);
  if (!eixoM) return;
  var chave = String(eixoApp).toUpperCase() + ':' + num;
  var alvo = { chave: chave, eixo: eixoM, m: num * pvMetrosPorEstaca() };
  M3D.sel = chave;
  if (STATE.currentPage === 'modelo3d' && document.getElementById('m3dFrame')) {
    if (!m3dEnviar(Object.assign({ tipo: 'ir' }, alvo))) M3D.irPendente = alvo;
    m3dDesenharLista(); m3dDesenharDetalhe(); m3dCarregarFotos(chave);
    var v = document.getElementById('m3dVisor');
    if (v && v.scrollIntoView) v.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    return;
  }
  M3D.periodo = 'tudo'; M3D.frente = ''; M3D.pacote = ''; m3dParar();
  M3D.irPendente = alvo;
  navigate('modelo3d');
};
/* O lançamento inteiro (um trecho): vai para a primeira estaca dele. */
window.m3dIrLancamento = function (localEstaca) {
  var e = lerLocalEstaca(localEstaca)[0];
  if (e) m3dIrEstaca(e.eixo, e.num);
};
/* O RDO de um dia: o que foi lançado naquele dia, no 3D. */
window.m3dAbrirDia = function (iso) {
  m3dParar();
  M3D.periodo = 'dia'; M3D.dia = iso || m3dHoje(); M3D.frente = ''; M3D.pacote = ''; M3D.sel = null;
  if (STATE.currentPage === 'modelo3d' && document.getElementById('m3dFrame')) {
    var box = document.getElementById('m3dFiltros'); if (box) box.innerHTML = m3dFiltrosHtml();
    m3dSincronizar(); return;
  }
  navigate('modelo3d');
};
window.m3dIrDigitada = function () {
  var inp = document.getElementById('m3dIrNum'), erro = document.getElementById('m3dIrErro');
  var dizer = function (m) { if (erro) { erro.textContent = m; erro.style.display = m ? '' : 'none'; } };
  // "212+10" é a estaca 212 e mais 10 m: tirar tudo que não é dígito dava 21210
  var n = parseInt((/\d+/.exec(String((inp && inp.value) || '')) || [''])[0], 10);
  if (!isFinite(n)) { dizer('Digite o número da estaca.'); return; }
  var sel = document.getElementById('m3dIrEixo');
  var eixos = eixosDaObraAtiva().filter(function (x) { return m3dEixoModelo(x.id); });
  // sem escolher o eixo, vale o eixo em cuja faixa o número cai (E212 só existe num deles)
  var x = sel ? eixoPorId(sel.value) : null;
  if (!sel || (x && (n < x.ini || n > x.fim))) x = eixos.find(function (e) { return n >= e.ini && n <= e.fim; }) || x;
  if (!x || n < x.ini || n > x.fim) { dizer('Estaca fora do trecho do modelo (' + eixos.map(function (e) { return 'E' + e.ini + '–E' + e.fim; }).join(' e ') + ').'); return; }
  dizer('');
  m3dIrEstaca(x.id, n);
};

window.m3dAcao = function (acao, chave) {
  var p = String(chave || '').split(':'), eixo = p[0], n = +p[1];
  if (!eixo || !isFinite(n)) return;
  if (acao === 'historico') {
    HIST_FILTRO = Object.assign({}, HIST_FILTRO, { estaca: eixo + ':' + n, busca: '' });
    HIST_LIMITE = HIST_PAGINA;
    HISTORICO_TAB = 'servicos';
    navigate('historico');
  } else if (acao === 'galeria') {
    GAL_FILTRO.estaca = 'E' + n + ' (' + eixo + ')';
    GAL_SELECAO = null;
    navigate('galeria');
  } else if (acao === 'lancar') {
    m3dLancarNaEstaca(eixo, n);
  }
};

/* LANÇAR NA ESTACA TOCADA. O rascunho do formulário é trabalho do apontador
   (ver "Formulário aberto é dado do apontador"): nada preenchido é apagado.
   A estaca vai para o primeiro serviço que ainda está em branco; sem nenhum,
   entra um serviço novo no fim da lista. */
window.m3dLancarNaEstaca = function (eixo, n) {
  if (!m3dPodeLancar()) { toast('Para lançar serviço, entre com um acesso de campo ou de engenharia.', 'info', 5000); return; }
  if (!STATE.draft) STATE.draft = loadDraft() || defaultDraft();
  var d = STATE.draft;
  d.servicos = d.servicos || [];
  var vazio = function (s) { return s && !s.pacoteId && !s.estacaIni && !s.estacaFim && !(qtdDoServico(s) > 0); };
  var i = d.servicos.findIndex(vazio);
  if (i < 0) {
    var ult = d.servicos[d.servicos.length - 1];
    d.servicos.push({ frente: '', pacoteId: '', sentido: eixo, estacaIni: '', estacaFim: '', lado: (ult && ult.lado) || '',
      quantidade: '', area: '', espCm: '', equipe: '', observacao: '' });
    i = d.servicos.length - 1;
  }
  var s = d.servicos[i];
  s.sentido = eixo; s.estacaIni = 'E' + n; s.estacaFim = 'E' + n;
  // o filtro da tela já dizia qual serviço se estava olhando: vem junto
  if (M3D.pacote) {
    var p = m3dPacotePorId().get(M3D.pacote);
    if (p && getCSVField(p, 'Status') !== 'Histórico') { s.pacoteId = M3D.pacote; s.frente = getCSVField(p, 'Frente') || s.frente; }
  } else if (M3D.frente && !s.frente) s.frente = M3D.frente;
  saveDraft(d);
  var e = eixoPorId(eixo);
  navigate('rdo');
  toast('Estaca E' + n + ' (' + (e ? e.label : eixo) + ') no serviço ' + (i + 1) + ' — confira o trecho e preencha o resto.', 'success', 6000);
  /* A tela nova começa do topo; o serviço que recebeu a estaca pode estar lá
     embaixo. Depois do desenho (o navigate troca a tela em ~160 ms), a tela
     desce até o campo da estaca e o marca por um instante. */
  setTimeout(function () {
    var el = document.querySelector('[data-svc="' + i + '"][data-field="estacaIni"]');
    if (!el || STATE.currentPage !== 'rdo') return;
    if (el.scrollIntoView) el.scrollIntoView({ block: 'center' });
    el.classList.add('m3d-destaque');
    setTimeout(function () { el.classList.remove('m3d-destaque'); }, 2600);
  }, 400);
};

window.m3dTelaCheia = function () {
  var v = document.getElementById('m3dVisor');
  if (v && v.requestFullscreen) v.requestFullscreen().catch(function () { window.open(m3dSrc().replace('&embed=1', ''), '_blank'); });
  else window.open(m3dSrc().replace('&embed=1', ''), '_blank');
};

/* GUARDAR PARA ABRIR SEM SINAL. Cada arquivo pedido aqui passa pelo service
   worker, que o guarda no balde do modelo (sw.js, VERSAO_MODELO3D). No
   celular vai o essencial do modo Leve (~3 MB); no computador, também as
   texturas e o entorno do modo Alta. */
var M3D_VENDOR = ['vendor/three/three.module.min.js', 'vendor/three/addons/controls/OrbitControls.js',
  'vendor/three/addons/objects/Sky.js', 'vendor/three/addons/utils/BufferGeometryUtils.js',
  'vendor/three/addons/postprocessing/EffectComposer.js', 'vendor/three/addons/postprocessing/RenderPass.js',
  'vendor/three/addons/postprocessing/GTAOPass.js', 'vendor/three/addons/postprocessing/OutputPass.js',
  'vendor/three/addons/postprocessing/ShaderPass.js', 'vendor/three/addons/postprocessing/MaskPass.js',
  'vendor/three/addons/postprocessing/Pass.js', 'vendor/three/addons/shaders/CopyShader.js',
  'vendor/three/addons/shaders/GTAOShader.js', 'vendor/three/addons/shaders/OutputShader.js',
  'vendor/three/addons/shaders/PoissonDenoiseShader.js', 'vendor/three/addons/math/SimplexNoise.js',
  'vendor/three/addons/libs/fflate.module.js'];   // o gzip dos navegadores antigos
window.M3D_VENDOR = M3D_VENDOR;
/* Leve ou Alta: a escolha que o visor guardou neste aparelho (Ferramentas ›
   Tela › Qualidade) e, sem escolha, o mesmo palpite que ele faz. */
function m3dAparelhoFraco() {
  var q = null; try { q = localStorage.getItem('tv3d_qualidade'); } catch (e) { }
  if (q === 'leve') return true;
  if (q === 'alta') return false;
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || (navigator.deviceMemory && navigator.deviceMemory < 4) ||
    Math.min(screen.width, screen.height) < 600;
}
window.m3dGuardarOffline = async function () {
  if (M3D.guardando || !OBRA.modelo3d) return;
  var b = document.getElementById('m3dBtnGuardar');
  var pasta = String(OBRA.modelo3d.pasta || ('modelo3d/' + OBRA.id + '/')).replace(/\/*$/, '/');
  M3D.guardando = true;
  try {
    var idx = await (await fetch(pasta + 'index.json')).json();
    var alta = !m3dAparelhoFraco();
    var arqs = ((idx.pacote && idx.pacote.arquivos) || []).filter(function (a) {
      if (/^renders\//.test(a.f)) return false;                       // galeria de imagens: abre com sinal
      return alta || !/^(tex\/|entorno\.)/.test(a.f);                // só o modo Alta usa textura e entorno
    }).map(function (a) { return pasta + a.f; });
    var ver = (document.querySelector('script[src*="js/modelo3d/tela.js"]') || { src: '' }).src.replace(/.*\?v=/, '');
    // o cinema (Apresentar a obra) é importado pelo visor com a mesma ?v= dele
    var lista = ['modelo3d.html', 'js/modelo3d/visor.js?v=' + ver, 'js/modelo3d/cine.js?v=' + ver]
      .concat(M3D_VENDOR).concat(alta ? ['vendor/three/ez-tree/ez-tree.es.js'] : []).concat(arqs);
    var feitos = 0, falhas = 0;
    var mostra = function () { if (b) b.innerHTML = ic('ampulheta') + ' ' + feitos + '/' + lista.length; };
    mostra();
    for (var i = 0; i < lista.length; i++) {
      try { var r = await fetch(lista[i]); if (!r.ok) falhas++; else await r.arrayBuffer(); } catch (e) { falhas++; }
      feitos++; mostra();
    }
    if (falhas) toast(falhas + ' arquivo(s) do modelo não vieram. Tente de novo com sinal melhor.', 'error', 6000);
    else toast('Modelo 3D guardado neste aparelho' + (alta ? '' : ' (modo Leve)') + ': ele abre no canteiro sem sinal.', 'success', 6000);
  } catch (e) {
    toast('Não foi possível guardar o modelo agora. Verifique a conexão.', 'error', 6000);
  } finally {
    M3D.guardando = false;
    var b2 = document.getElementById('m3dBtnGuardar');
    if (b2) b2.innerHTML = ic('nuvem') + '<span class="m3d-rot"> Offline</span>';
  }
};

/* As imagens fotorrealistas do modelo (para o modo Apresentação), com o
   caminho já completo. O índice é buscado uma vez por obra. */
var _m3dRendersP = {};
function m3dRenders() {
  if (!OBRA.modelo3d) return Promise.resolve([]);
  var pasta = String(OBRA.modelo3d.pasta || ('modelo3d/' + OBRA.id + '/')).replace(/\/*$/, '/');
  if (!_m3dRendersP[pasta]) {
    _m3dRendersP[pasta] = fetch(pasta + 'index.json').then(function (r) { return r.json(); }).then(function (M) {
      return (M.renders || []).map(function (r) { return { f: pasta + r.f, th: r.th ? pasta + r.th : '', t: r.t || '', d: r.d || '' }; });
    }).catch(function () { delete _m3dRendersP[pasta]; return []; });
  }
  return _m3dRendersP[pasta];
}

/* Depois que o HTML da tela entrou: desenha o que não depende do visor. */
function m3dMontar() {
  if (!OBRA.modelo3d) return;
  /* guardado já aqui: o painel da estaca (m3dDesenharDetalhe sem argumento)
     lê o _m3dUltimo, e antes do primeiro m3dSincronizar ele era null — a
     estaca tocada dizia "Nada nesta estaca no filtro atual" com lançamento nela */
  var D = m3dDados();
  _m3dUltimo = D;
  m3dDesenharPartes(D);
  m3dDesenharTempo();
  if (M3D.sel) m3dCarregarFotos(M3D.sel);
}

/* A carga de fundo trouxe dados novos e a tela é esta: NÃO redesenha a página
   (o iframe recarregaria o modelo), só reenvia os dados e refaz as partes. */
function m3dRefrescar() {
  var f = document.getElementById('m3dFrame');
  if (STATE.currentPage !== 'modelo3d' || !f) return false;
  if (!OBRA.modelo3d || f.getAttribute('src') !== m3dSrc()) return false;   // o iframe é de outra obra: redesenha
  var box = document.getElementById('m3dFiltros');
  var foco = document.activeElement && box && box.contains(document.activeElement);
  if (box && !foco) box.innerHTML = m3dFiltrosHtml();
  m3dSincronizar();
  return true;
}

window.addEventListener('message', function (e) {
  if (e.origin !== location.origin || !e.data || e.data.m3d !== 1) return;
  var f = m3dFrame();
  if (!f || e.source !== f.contentWindow) return;
  var d = e.data;
  if (d.tipo === 'pronto') {
    M3D.pronto = true;
    M3D.realce = undefined;
    m3dSincronizar();
    if (M3D.irPendente) { m3dEnviar(Object.assign({ tipo: 'ir' }, M3D.irPendente)); M3D.irPendente = null; }
    else if (M3D.sel) m3dSelecionar(M3D.sel);
  } else if (d.tipo === 'estaca') {
    M3D.sel = d.chave ? String(d.chave) : null;
    m3dDesenharLista(); m3dDesenharDetalhe();
    m3dCarregarFotos(M3D.sel);
  } else if (d.tipo === 'foto') {
    if (M3D.fotos && String(d.chave || '') === M3D.fotos.chave) m3dVerFoto(+d.i);
  } else if (d.tipo === 'acao') {
    m3dAcao(String(d.acao || ''), String(d.chave || ''));
  } else if (d.tipo === 'apresentacao') {
    // a apresentação manda na câmera: a linha do tempo para, e o botão vira "Parar"
    M3D.apresentando = !!d.on;
    if (M3D.apresentando) m3dParar();
    var b = document.getElementById('m3dBtnApresentar');
    if (b) { b.innerHTML = ic(M3D.apresentando ? 'pausa' : 'play') + '<span class="m3d-rot"> ' + (M3D.apresentando ? 'Parar' : 'Apresentar') + '</span>'; b.setAttribute('aria-pressed', String(M3D.apresentando)); }
  } else if (d.tipo === 'falhou') {
    M3D.falhou = true;
    var r = document.getElementById('m3dResumo');
    if (r) r.textContent = 'O 3D não abriu neste aparelho (WebGL indisponível). A lista de estacas abaixo continua valendo.';
  }
});
