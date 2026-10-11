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

   REGRAS QUE NÃO PODEM CAIR
   · A tela NUNCA é redesenhada inteira pela carga de fundo: o iframe
     recarregaria o modelo (2,4 MB, 20 s no 4G) e a câmera voltaria ao
     início. O refresh de 5 em 5 min só manda os dados novos (m3dRefrescar).
   · Mensagem só de mesma origem E do próprio iframe.
   · Texto de lançamento vai para o visor como dado e é escrito lá com
     textContent; aqui, tudo passa por escHtml/jsArg.
   ============================================================ */
'use strict';

var M3D = window.M3D = {
  periodo: 'tudo',   // 'tudo' | '7d' | '30d' | 'AAAA-MM' | 'dia'
  dia: '',           // AAAA-MM-DD, quando periodo === 'dia'
  frente: '', pacote: '',
  cor: 'frente',     // 'frente' | 'qtd' | 'recencia'
  sel: null,         // chave da estaca aberta ('BC:212')
  pronto: false,     // o visor do iframe já escuta
  irPendente: null,  // estaca pedida por outra tela antes de o visor ficar pronto
  guardando: false,
};

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

/* ---------- filtro de período */
function m3dHoje() { return getLocalISODate(new Date()); }
function m3dNoPeriodo(iso) {
  var p = M3D.periodo;
  if (!p || p === 'tudo') return true;
  if (!iso) return false;
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
  if (p === 'dia' && M3D.dia) partes.push('RDO de ' + fmtData(M3D.dia));
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
function m3dEstacas() {
  var pac = m3dPacotePorId(), out = new Map();
  (STATE.rdoavanco || []).forEach(function (r) {
    var pid = String(getCSVField(r, 'Pacote_ID') || getCSVField(r, 'Pacote_id') || '');
    if (!pid || pid === 'OUTRO') return;           // serviço avulso não tem lugar no mapa
    var p = pac.get(pid);
    var frente = (p && getCSVField(p, 'Frente')) || 'Outros';
    if (M3D.frente && frente !== M3D.frente) return;
    if (M3D.pacote && pid !== M3D.pacote) return;
    var iso = normalizarDataCSV(getCSVField(r, 'Data'));
    if (!m3dNoPeriodo(iso)) return;
    var ests = lerLocalEstaca(getCSVField(r, 'Local_Estaca'));
    if (!ests.length) return;
    var nf = fotosDaLinha(r).length;
    ests.forEach(function (e) {
      var k = e.eixo + ':' + e.num, a = out.get(k);
      if (!a) out.set(k, a = { chave: k, eixo: e.eixo, num: e.num, linhas: [], frentes: {}, ultima: '', fotos: 0 });
      a.linhas.push(r);
      a.frentes[frente] = (a.frentes[frente] || 0) + 1;
      if (iso > a.ultima) a.ultima = iso;
      a.fotos += nf;
    });
  });
  return out;
}
function m3dFrentesOrdenadas(a) {
  return Object.keys(a.frentes).sort(function (x, y) { return a.frentes[y] - a.frentes[x] || x.localeCompare(y); });
}
function m3dCorDe(a, maxN) {
  if (M3D.cor === 'qtd') return m3dCorQtd(a.linhas.length / maxN);
  if (M3D.cor === 'recencia') {
    var d = parseISODate(a.ultima), dias = d ? (Date.now() - d.getTime()) / 86400000 : Infinity;
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
  var maxN = Math.max.apply(null, [1].concat(lista.map(function (a) { return a.linhas.length; })));
  var passo = pvMetrosPorEstaca(), lancar = m3dPodeLancar(), faixas = [];
  lista.forEach(function (a) {
    var eixoM = m3dEixoModelo(a.eixo);
    if (!eixoM) return;
    var eixo = eixoPorId(a.eixo), n = a.linhas.length;
    var fr = m3dFrentesOrdenadas(a).map(function (f) { return f + ' (' + a.frentes[f] + ')'; }).join(', ');
    var rows = [['Lançamentos', String(n)], ['Último', a.ultima ? fmtData(a.ultima) : '—'], ['Frentes', fr]];
    if (a.fotos) rows.push(['Fotos', String(a.fotos)]);
    m3dOrdenarLinhas(a.linhas).slice(0, 4).forEach(function (r) {
      rows.push([fmtData(getCSVField(r, 'Data')),
        ((nomeDoPacote(r) || '—') + ' · ' + fmtNum(num(getCSVField(r, 'Quantidade'))) + ' ' + (getCSVField(r, 'Unidade') || '')).trim()]);
    });
    var acoes = [['Ver lançamentos', 'historico']];
    if (a.fotos) acoes.push(['Fotos (' + a.fotos + ')', 'galeria']);
    if (lancar) acoes.push(['Lançar serviço aqui', 'lancar', true]);
    a.cor = m3dCorDe(a, maxN);
    faixas.push({
      chave: a.chave, eixo: eixoM, m0: a.num * passo - passo / 2, m1: a.num * passo + passo / 2, cor: a.cor,
      titulo: 'E' + a.num + ' · ' + (eixo ? eixo.label : a.eixo),
      resumo: n + ' lançamento' + (n > 1 ? 's' : '') + ' · ' + m3dFrentesOrdenadas(a).join(', '),
      rows: rows, acoes: acoes, src: 'serviços lançados no app (RDO_Avanco) · ' + m3dDescFiltro(),
    });
  });
  return { est: est, lista: lista, faixas: faixas, maxN: maxN };
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

var _m3dUltimo = null;
function m3dSincronizar() {
  var D = m3dDados();
  _m3dUltimo = D;
  m3dEnviar({ tipo: 'execucao', faixas: D.faixas, rotulos: m3dRotulosEixos(),
    resumo: D.faixas.length + ' estaca' + (D.faixas.length !== 1 ? 's' : '') + ' com serviço · ' + m3dDescFiltro() });
  m3dEnviar({ tipo: 'realce', camada: m3dCamadaDaFrente(M3D.frente) });
  m3dDesenharPartes(D);
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
  return '' +
    '<div class="card m3d-card stagger-item">' +
      '<div class="card-header m3d-header">' +
        '<div style="min-width:0">' +
          '<div class="card-title">' + ic('cubo') + ' Modelo 3D · ' + escHtml(OBRA.nomeCurto || OBRA.nome) + '</div>' +
          '<div class="card-title-sub" id="m3dResumo">Carregando o modelo…</div>' +
        '</div>' +
        '<div class="m3d-acoes">' +
          '<button type="button" class="btn btn-sm" onclick="m3dTelaCheia()" title="O modelo na tela inteira">' + ic('apresentar') + ' Tela cheia</button>' +
          '<a class="btn btn-sm m3d-so-pc" href="' + escHtml(m3dSrc().replace('&embed=1', '')) + '" target="_blank" rel="noopener" title="Abrir o modelo sozinho, em outra aba">' + ic('enviar') + ' Abrir</a>' +
          '<button type="button" class="btn btn-sm" id="m3dBtnGuardar" onclick="m3dGuardarOffline()" title="Baixar o modelo para abrir no canteiro sem sinal">' + ic('nuvem') + ' Offline</button>' +
        '</div>' +
      '</div>' +
      '<div id="m3dFiltros">' + m3dFiltrosHtml() + '</div>' +
      '<div class="m3d-visor" id="m3dVisor">' +
        '<iframe id="m3dFrame" src="' + escHtml(m3dSrc()) + '" title="Modelo 3D da obra" allow="fullscreen"></iframe>' +
      '</div>' +
      '<div class="m3d-legenda" id="m3dLegenda"></div>' +
    '</div>' +
    '<div class="m3d-lados">' +
      '<div class="card" id="m3dDetalhe"></div>' +
      '<div class="card" id="m3dLista"></div>' +
    '</div>';
}

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
    '<span class="m3d-seg" role="group" aria-label="O que a cor da estaca mostra">' + seg('frente', 'Frente') + seg('qtd', 'Volume') + seg('recencia', 'Recência') + '</span>' +
  '</div>';
}

window.m3dFiltro = function (campo, valor) {
  if (campo === 'periodo') { M3D.periodo = valor || 'tudo'; if (valor === 'dia' && !M3D.dia) M3D.dia = m3dHoje(); }
  else if (campo === 'dia') M3D.dia = valor || m3dHoje();
  else if (campo === 'frente') { M3D.frente = valor; M3D.pacote = ''; }
  else if (campo === 'pacote') {
    M3D.pacote = valor;
    var p = valor && m3dPacotePorId().get(valor);
    if (p) M3D.frente = getCSVField(p, 'Frente') || M3D.frente;
  }
  else if (campo === 'cor') M3D.cor = valor;
  var box = document.getElementById('m3dFiltros');
  if (box) box.innerHTML = m3dFiltrosHtml();
  m3dSincronizar();
};

function m3dDesenharPartes(D) {
  D = D || _m3dUltimo || m3dDados();
  var res = document.getElementById('m3dResumo');
  if (res) {
    var nL = 0; D.lista.forEach(function (a) { nL += a.linhas.length; });
    res.textContent = D.lista.length ? (D.lista.length + ' estaca' + (D.lista.length !== 1 ? 's' : '') + ' com serviço · ' + m3dDescFiltro() + ' — toque numa faixa colorida para ver o que foi lançado ali')
      : 'Nenhum serviço com estaca em ' + m3dDescFiltro() + '.';
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
    h = '<span>Volume de lançamentos</span><span>1</span><span class="rampa" style="background:linear-gradient(90deg,' +
      m3dCorQtd(0) + ',' + m3dCorQtd(0.5) + ',' + m3dCorQtd(1) + ')"></span><span>' + D.maxN + '</span>';
  } else if (M3D.cor === 'recencia') {
    h = '<span>Último lançamento:</span>' + M3D_RECENCIA.map(function (r) { return '<span><i style="background:' + r[1] + '"></i>' + r[2] + '</span>'; }).join('');
  } else {
    var cont = {};
    D.lista.forEach(function (a) { var f = m3dFrentesOrdenadas(a)[0]; if (f) cont[f] = (cont[f] || 0) + 1; });
    var fs = Object.keys(cont).sort(function (x, y) { return cont[y] - cont[x]; });
    h = fs.length ? '<span>Frente com mais lançamentos na estaca:</span>' + fs.map(function (f) {
      return '<span><i style="background:' + m3dCorFrente(f) + '"></i>' + escHtml(f) + ' <small>(' + cont[f] + ')</small></span>';
    }).join('') : '<span>Nenhuma estaca com serviço neste filtro.</span>';
  }
  el.innerHTML = h + '<span class="m3d-legenda-nota">' + ic('info') + ' cada faixa cobre a pista da estaca (meia estaca para cada lado)</span>';
}

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
  el.innerHTML = '<div class="card-header"><div><div class="card-title">Estacas com serviço</div>' +
    '<div class="card-title-sub">Toque para levar o 3D até a estaca</div></div></div>' +
    '<div class="card-body">' +
      '<div class="m3d-ir"><label for="m3dIrNum">Ir para a estaca</label>' +
        (eixos.length > 1 ? '<select id="m3dIrEixo" aria-label="Eixo">' + eixos.map(function (x) { return '<option value="' + escHtml(x.id) + '">' + escHtml(x.label) + '</option>'; }).join('') + '</select>' : '') +
        '<input id="m3dIrNum" type="text" inputmode="numeric" placeholder="ex.: 212" onkeyup="if(event.key===\'Enter\') m3dIrDigitada()">' +
        '<button type="button" class="btn btn-outline btn-sm" onclick="m3dIrDigitada()">' + ic('lupa') + ' Ir</button>' +
        '<div class="field-error" id="m3dIrErro" style="display:none;flex-basis:100%"></div>' +
      '</div>' + porEixo +
    '</div>';
}

function m3dDesenharDetalhe(D) {
  var el = document.getElementById('m3dDetalhe');
  if (!el) return;
  D = D || _m3dUltimo;
  if (!M3D.sel) {
    el.innerHTML = '<div class="card-header"><div><div class="card-title">' + ic('pino') + ' Estaca</div>' +
      '<div class="card-title-sub">O que foi lançado onde você tocar</div></div></div>' +
      '<div class="card-body"><div class="m3d-vazio">Toque numa faixa colorida no modelo, ou numa estaca da lista, ' +
      'para ver os serviços lançados nela' + (m3dPodeLancar() ? ' — e lançar um serviço novo ali mesmo' : '') + '.</div></div>';
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
  var aviso = !todas.length ? 'Nenhum serviço lançado nesta estaca ainda.'
    : !noFiltro.length ? 'Nada nesta estaca no filtro atual — abaixo, tudo o que já foi lançado nela.'
    : (noFiltro.length < todas.length ? noFiltro.length + ' de ' + todas.length + ' lançamentos (filtro: ' + escHtml(m3dDescFiltro()) + ')' : '');
  el.innerHTML = '<div class="card-header"><div><div class="card-title">' + ic('pino') + ' Estaca E' + n + ' · ' + escHtml(eixo ? eixo.label : eixoId) + '</div>' +
      '<div class="card-title-sub">' + todas.length + ' lançamento' + (todas.length !== 1 ? 's' : '') + ' no total' + (fotos ? ' · ' + fotos + ' foto' + (fotos > 1 ? 's' : '') : '') + '</div></div>' +
      '<button type="button" class="btn btn-ghost btn-sm" onclick="m3dSelecionar(null)" aria-label="Fechar a estaca">' + ic('fechar') + '</button></div>' +
    '<div class="card-body">' +
      '<div class="m3d-det-acoes">' +
        (m3dPodeLancar() ? '<button type="button" class="btn btn-primary btn-sm" onclick="m3dLancarNaEstaca(' + jsArg(eixoId) + ',' + n + ')">' + ic('lancar') + ' Lançar serviço aqui</button>' : '') +
        (todas.length ? '<button type="button" class="btn btn-outline btn-sm" onclick="m3dAcao(\'historico\',' + jsArg(M3D.sel) + ')">' + ic('historico') + ' No Histórico</button>' : '') +
        (fotos ? '<button type="button" class="btn btn-outline btn-sm" onclick="m3dAcao(\'galeria\',' + jsArg(M3D.sel) + ')">' + ic('galeria') + ' Fotos</button>' : '') +
        '<button type="button" class="btn btn-ghost btn-sm" onclick="m3dIrEstaca(' + jsArg(eixoId) + ',' + n + ')">' + ic('pino') + ' Centralizar</button>' +
      '</div>' +
      (aviso ? '<div class="m3d-vazio">' + aviso + '</div>' : '') +
      lista.slice(0, 15).map(linha).join('') +
      (lista.length > 15 ? '<div class="m3d-vazio">+ ' + (lista.length - 15) + ' mais — veja no Histórico</div>' : '') +
    '</div>';
}

/* ---------- ações */
window.m3dSelecionar = function (chave) {
  M3D.sel = chave || null;
  if (chave) {
    var p = String(chave).split(':'), eixoM = m3dEixoModelo(p[0]);
    if (eixoM) m3dEnviar({ tipo: 'ir', chave: chave, eixo: eixoM, m: (+p[1]) * pvMetrosPorEstaca() });
  } else m3dEnviar({ tipo: 'soltar' });
  m3dDesenharLista();
  m3dDesenharDetalhe();
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
    m3dDesenharLista(); m3dDesenharDetalhe();
    var v = document.getElementById('m3dVisor');
    if (v && v.scrollIntoView) v.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    return;
  }
  M3D.periodo = 'tudo'; M3D.frente = ''; M3D.pacote = '';
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
  var n = parseInt(String((inp && inp.value) || '').replace(/[^\d]/g, ''), 10);
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
    var lista = ['modelo3d.html', 'js/modelo3d/visor.js?v=' + (document.querySelector('script[src*="js/modelo3d/tela.js"]') || { src: '' }).src.replace(/.*\?v=/, '')]
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
    if (b2) b2.innerHTML = ic('nuvem') + ' Offline';
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
  m3dDesenharPartes(m3dDados());
}

/* A carga de fundo trouxe dados novos e a tela é esta: NÃO redesenha a página
   (o iframe recarregaria o modelo), só reenvia os dados e refaz as partes. */
function m3dRefrescar() {
  if (STATE.currentPage !== 'modelo3d' || !document.getElementById('m3dFrame')) return false;
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
    m3dSincronizar();
    if (M3D.irPendente) { m3dEnviar(Object.assign({ tipo: 'ir' }, M3D.irPendente)); M3D.irPendente = null; }
    else if (M3D.sel) m3dSelecionar(M3D.sel);
  } else if (d.tipo === 'estaca') {
    M3D.sel = d.chave ? String(d.chave) : null;
    m3dDesenharLista(); m3dDesenharDetalhe();
  } else if (d.tipo === 'acao') {
    m3dAcao(String(d.acao || ''), String(d.chave || ''));
  } else if (d.tipo === 'falhou') {
    var r = document.getElementById('m3dResumo');
    if (r) r.textContent = 'O 3D não abriu neste aparelho (WebGL indisponível). A lista de estacas abaixo continua valendo.';
  }
});
