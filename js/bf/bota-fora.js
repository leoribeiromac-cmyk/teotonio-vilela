/*
 * Sistema de controle de obra — Av. Senador Teotônio Vilela
 * Copyright © 2026 Leonardo Maciel. Todos os direitos reservados.
 *
 * Software proprietário. O código estar visível não autoriza uso, cópia
 * nem obra derivada — ver LICENSE, na raiz do repositório.
 */
/* ====================================================================
   CONTROLE DE BOTA-FORA
   --------------------------------------------------------------------
   Cada caminhão que sai do canteiro com entulho ou solo é uma viagem
   cobrada. O controle disso vivia numa planilha do escritório preenchida
   de memória no fim do mês, a partir de um maço de tickets — e a conta do
   transportador chegava com viagens que ninguém conseguia confirmar nem
   contestar. Sem prova, discutir frete é a palavra de um contra a do
   outro.

   Então a viagem passa a ser registrada NA SAÍDA, pelo apontador, com as
   três provas que a discussão exige:

     • FOTO DA CARGA / PLACA — o que saiu e em qual caminhão. É a única
       coisa que liga o valor cobrado a um veículo e a um volume.
     • ASSINATURA DO MOTORISTA — quem levou. Assinada no aparelho, na
       hora, com o dedo.
     • FOTO DO TICKET — o comprovante do aterro/destino. É o documento
       que o transportador anexa à fatura; tê-lo do nosso lado é o que
       permite conferir a fatura linha a linha.

   As imagens vão para o Drive privado; a planilha guarda só o ponteiro —
   mesmo desenho das fotos do serviço e da assinatura do operador.

   A PLANILHA. O escritório fecha o frete no formato que a contabilidade
   da empresa já usa: a aba FRETE do "SLT GERAL", com as colunas
   FORNECEDOR · DATA FRETE · PLACA · TIPO MATERIAL · MOTORISTA · FRETE OU
   FRESA · PROJETO · VALOR FRETE · OBSERVAÇÕES, e o título
   "FRETE - <origem> >> <destino>" na primeira linha. É esse arquivo que
   sai daqui, com as mesmas colunas na mesma ordem — quem recebe cola no
   fechamento sem reorganizar nada. Junto vai uma segunda aba com os
   links das provas, que é o que faltava para conferir a fatura.

   Offline: a viagem entra na fila do aparelho como qualquer lançamento e
   sobe sozinha quando o sinal volta. Bota-fora acontece na boca da obra,
   que é onde o 4G falha.
   ==================================================================== */
(function () {
  'use strict';

  /* Cadastros curtos, e de propósito. Lista comprida em <select> no celular
     é rolagem; estes são os valores que a aba FRETE de fato recebe. */
  const MATERIAIS = ['ENTULHO', 'SOLO', 'FRESA', 'CONCRETO', 'MADEIRA', 'MISTO'];
  const SERVICOS = ['FRETE', 'FRESA'];

  /* O que o aparelho lembra de um lançamento para o outro. Fornecedor,
     projeto, origem e destino são os MESMOS o dia inteiro — redigitar
     quatro campos por viagem, dez viagens por dia, é o que faz o
     apontador desistir do registro e voltar ao maço de tickets. */
  const LS_PADROES = 'teotonio_bf_padroes_v1';

  let VIAGENS = [];          // o que a última consulta trouxe
  let PROVAS = { carga: null, ticket: null, assinatura: '' };
  let form = null, submitBtn = null, btnText = null;
  let carregando = false;

  // ------------------------------------------------------------------
  // BACKEND
  // ------------------------------------------------------------------
  /* Bota-fora é dado desta empresa e desta obra: fala sempre com o Code.gs
     principal, que separa as linhas pela coluna `obra`. Não há o caso do
     Apps Script legado que os equipamentos da Teotônio ainda usam. */
  function urlBF(acao, params) {
    const base = (typeof CONFIG !== 'undefined' && CONFIG && CONFIG.appsScript) || '';
    if (!base) return '';
    const q = new URLSearchParams();
    q.set('action', acao);
    Object.keys(params || {}).forEach(k => {
      if (params[k] !== '' && params[k] != null) q.set(k, params[k]);
    });
    q.set('obra', obraId());
    const t = (typeof tokenSessao === 'function') ? tokenSessao() : '';
    if (t) q.set('token', t);
    return base + '?' + q.toString();
  }

  function obraId() { return (typeof OBRA !== 'undefined' && OBRA && OBRA.id) || ''; }
  function obraNome() {
    const o = (typeof OBRA !== 'undefined' && OBRA) ? OBRA : {};
    return o.nomeCurto || o.nome || '';
  }

  const esc = s => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  const aviso = (msg, tipo) => toast(msg, tipo === 'success' ? 'success' : tipo === 'info' ? 'info' : 'error');

  function padroes() {
    try { return JSON.parse(localStorage.getItem(LS_PADROES) || '{}') || {}; }
    catch (e) { return {}; }
  }
  function guardarPadroes(p) {
    try { localStorage.setItem(LS_PADROES, JSON.stringify(p)); } catch (e) { }
  }

  const g = id => document.getElementById(id);
  const val = id => { const e = g(id); return e ? String(e.value || '').trim() : ''; };

  /* O valor do frete é digitado à mão, em teclado pt-BR: "1.250,50". O
     `num()` do app é quem entende isso (ponto é milhar). Nunca `type=number`
     — o Chromium descarta o valor inteiro em silêncio, e frete errado é
     dinheiro errado. É a mesma decisão já tomada no horímetro. */
  function valorFrete() {
    const bruto = val('bfValor');
    return bruto ? num(bruto) : 0;
  }

  function dataBR(iso) {
    if (!iso) return '—';
    const p = String(iso).slice(0, 10).split('-');
    return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : String(iso);
  }
  const reais = v => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const viagens = n => n + (n === 1 ? ' viagem' : ' viagens');

  // ------------------------------------------------------------------
  // AS TRÊS PROVAS
  // ------------------------------------------------------------------
  /* 1400 px de lado a 0,72 é o suficiente para ler uma placa e o número de
     um ticket, e cabe na fila do aparelho: a foto entra em base64, que
     infla 33%, e são três provas por viagem. A foto do serviço usa a mesma
     ordem de grandeza pelo mesmo motivo. */
  const LADO_MAX = 1400, QUALIDADE = 0.72;

  window.bfFoto = function (qual, origem) {
    const inp = g('bfArq' + qual + (origem === 'camera' ? 'Cam' : ''));
    if (inp) inp.click();
  };

  window.bfFotoEscolhida = async function (input, qual) {
    const arq = (input.files || [])[0];
    input.value = '';
    if (!arq) return;
    try {
      PROVAS[qual] = await comprimirImg(arq, LADO_MAX, QUALIDADE);
      pintarProvas();
    } catch (e) {
      aviso('Não consegui ler essa imagem. Tente tirar de novo.', 'error');
    }
  };

  window.bfRemoverFoto = function (qual) { PROVAS[qual] = null; pintarProvas(); };

  function pintarProvas() {
    ['carga', 'ticket'].forEach(qual => {
      const box = g('bfPrev' + qual);
      if (!box) return;
      box.innerHTML = PROVAS[qual]
        ? `<div class="bf-prova-thumb">
             <img src="${PROVAS[qual]}" alt="prova">
             <button type="button" class="bf-prova-x" onclick="bfRemoverFoto('${qual}')"
                     title="Remover" aria-label="Remover">${ic('fechar', 11)}</button>
           </div>`
        : '';
    });
    const assinBox = g('bfPrevassinatura');
    if (assinBox) {
      assinBox.innerHTML = PROVAS.assinatura
        ? `<div class="bf-prova-thumb bf-prova-assin">
             <img src="${PROVAS.assinatura}" alt="assinatura do motorista">
             <button type="button" class="bf-prova-x" onclick="bfRemoverAssinatura()"
                     title="Apagar assinatura" aria-label="Apagar assinatura">${ic('fechar', 11)}</button>
           </div>`
        : '';
    }
    const cont = g('bfProvasEstado');
    if (cont) {
      const n = (PROVAS.carga ? 1 : 0) + (PROVAS.ticket ? 1 : 0) + (PROVAS.assinatura ? 1 : 0);
      cont.textContent = n === 3 ? 'As três provas estão anexadas.'
        : n === 0 ? 'Nenhuma prova ainda — a viagem pode ser registrada assim, mas sem prova não se contesta fatura.'
        : `${n} de 3 provas anexadas.`;
    }
  }

  /* A assinatura mora num modal de tela cheia pelo mesmo motivo da do
     operador: embutida no formulário, o `touch-action:none` engolia a
     rolagem numa faixa de 200 px, e quem tentava rolar riscava a folha. */
  window.bfAbrirAssinatura = function () {
    abrir('bfAssinaturaModal');
    montarCanvas();
  };
  window.bfConfirmarAssinatura = function () {
    const c = g('bfCanvas');
    if (c && c._temTraco && c._temTraco()) PROVAS.assinatura = c.toDataURL('image/png');
    fechar('bfAssinaturaModal');
    pintarProvas();
  };
  window.bfLimparCanvas = function () { const c = g('bfCanvas'); if (c && c._limpar) c._limpar(); };
  window.bfRemoverAssinatura = function () {
    PROVAS.assinatura = '';
    const c = g('bfCanvas'); if (c && c._limpar) c._limpar();
    pintarProvas();
  };

  function montarCanvas() {
    const canvas = g('bfCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const ratio = window.devicePixelRatio || 1;
    const w = canvas.clientWidth || 600, h = canvas.clientHeight || 200;
    canvas.width = w * ratio; canvas.height = h * ratio;
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.2; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = getComputedStyle(document.body).getPropertyValue('--text') || '#111';
    /* Remedir é obrigatório a cada abertura (canvas escondido mede 0), e
       mudar canvas.width já apaga o traço. Os OUVINTES entram uma vez só:
       reatá-los a cada abertura empilhava um mousemove por abertura. */
    if (canvas._ligado) { canvas._zerarTraco(); return; }
    canvas._ligado = true;
    let desenhando = false, ultimo = null, temTraco = false;
    const pos = e => {
      const r = canvas.getBoundingClientRect();
      const t = (e.touches && e.touches[0]) ? e.touches[0] : e;
      return { x: t.clientX - r.left, y: t.clientY - r.top };
    };
    const inicio = e => { desenhando = true; ultimo = pos(e); e.preventDefault(); };
    const move = e => {
      if (!desenhando) return;
      const p = pos(e);
      ctx.beginPath(); ctx.moveTo(ultimo.x, ultimo.y); ctx.lineTo(p.x, p.y); ctx.stroke();
      ultimo = p; temTraco = true; e.preventDefault();
    };
    const fim = () => { desenhando = false; };
    canvas.addEventListener('mousedown', inicio);
    canvas.addEventListener('mousemove', move);
    window.addEventListener('mouseup', fim);
    canvas.addEventListener('touchstart', inicio, { passive: false });
    canvas.addEventListener('touchmove', move, { passive: false });
    canvas.addEventListener('touchend', fim);
    canvas._temTraco = () => temTraco;
    canvas._zerarTraco = () => { temTraco = false; };
    canvas._limpar = () => { ctx.clearRect(0, 0, canvas.width, canvas.height); temTraco = false; };
  }

  // ------------------------------------------------------------------
  // REGISTRAR A VIAGEM
  // ------------------------------------------------------------------
  function ligarForm() {
    form = g('bfForm');
    if (!form) return;
    form.addEventListener('submit', e => {
      e.preventDefault();
      if (!val('bfData')) { aviso('Informe a data da viagem.'); return; }
      if (!val('bfPlaca')) { aviso('A placa é o que liga a viagem ao caminhão — sem ela a fatura não se confere.'); return; }
      if (!valorFrete() && valorFrete() !== 0) { aviso('Confira o valor do frete.'); return; }
      abrirConferencia();
    });
  }

  function abrirConferencia() {
    const p = (id, v) => { const e = g(id); if (e) e.textContent = v || '—'; };
    p('bfcData', dataBR(val('bfData')));
    p('bfcPlaca', val('bfPlaca'));
    p('bfcMotorista', val('bfMotorista'));
    p('bfcMaterial', val('bfMaterial') + ' · ' + val('bfServico'));
    p('bfcTrajeto', (val('bfOrigem') || '—') + '  →  ' + (val('bfDestino') || '—'));
    p('bfcValor', reais(valorFrete()));
    p('bfcFornecedor', val('bfFornecedor'));
    p('bfcProjeto', val('bfProjeto'));
    const faltam = [
      PROVAS.carga ? null : 'foto da carga/placa',
      PROVAS.assinatura ? null : 'assinatura do motorista',
      PROVAS.ticket ? null : 'foto do ticket',
    ].filter(Boolean);
    p('bfcProvas', faltam.length ? 'FALTA: ' + faltam.join(', ') : 'carga/placa, assinatura e ticket');
    const el = g('bfcProvas');
    if (el) el.classList.toggle('bf-falta', faltam.length > 0);
    abrir('bfConfirmModal');
  }

  window.bfConfirmar = async function () {
    fechar('bfConfirmModal');
    enviando(true);
    const p = {
      action: 'bfSalvar',
      clientId: 'bf_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
      obra: obraId(),
      data: val('bfData'),
      fornecedor: val('bfFornecedor'),
      placa: val('bfPlaca').toUpperCase(),
      material: val('bfMaterial'),
      servico: val('bfServico'),
      projeto: val('bfProjeto'),
      motorista: val('bfMotorista'),
      // canônico com ponto decimal: quem lê a aba espera número, e
      // "1.250,50" lido como milhar viraria 125050.
      valor: String(valorFrete()),
      origem: val('bfOrigem'),
      destino: val('bfDestino'),
      obs: val('bfObs'),
      fotoCarga: PROVAS.carga || '',
      fotoTicket: PROVAS.ticket || '',
      assinatura: PROVAS.assinatura || '',
    };
    // o que se repete o dia inteiro fica guardado para a próxima viagem
    guardarPadroes({
      fornecedor: p.fornecedor, projeto: p.projeto, valor: val('bfValor'),
      origem: p.origem, destino: p.destino, material: p.material, servico: p.servico,
    });

    const descricao = 'bota-fora ' + p.placa + ' em ' + dataBR(p.data);
    try {
      const r = await enviarAcao({ ...p, ...authParams() }, 1, 2000);
      if (r && r.ok) {
        aviso('Viagem registrada.', 'success');
        limparFormulario();
      } else {
        throw new Error((r && (r.error || r.mensagem)) || 'erro');
      }
    } catch (e) {
      /* Sem sinal, a viagem NÃO se perde: entra na fila do aparelho com as
         provas dentro e sobe sozinha quando a internet voltar. É o caminho
         normal aqui — bota-fora se registra na boca da obra. */
      if (typeof ehErroDeRede === 'function' && ehErroDeRede(e)) {
        /* `tipo` é o que o indicador da fila lê para dizer o que está
           esperando. Sem ele, uma viagem de caminhão aparecia no aparelho
           do apontador como "1 RDO" — e ele ia procurar um lançamento de
           serviço que não existe. */
        const guardou = await outboxAdicionar({ tipo: 'botafora', params: p, descricao });
        if (guardou) {
          aviso('Sem sinal — a viagem ficou guardada no aparelho e sobe sozinha.', 'info');
          limparFormulario();
        }
      } else {
        aviso('Não foi possível registrar: ' + (e && e.message ? e.message : 'erro do servidor'));
      }
    } finally {
      enviando(false);
    }
  };

  function enviando(estado) {
    if (!submitBtn) return;
    submitBtn.disabled = estado;
    if (btnText) btnText.textContent = estado ? 'Registrando…' : 'Registrar viagem';
  }

  /* Depois de registrar, o que se apaga é a VIAGEM — não o dia de trabalho.
     Data, fornecedor, projeto, origem e destino ficam: a próxima carga sai
     do mesmo lugar, para o mesmo aterro, no mesmo dia. O que muda é placa,
     motorista e as provas. */
  function limparFormulario() {
    ['bfPlaca', 'bfMotorista', 'bfObs'].forEach(id => { const e = g(id); if (e) e.value = ''; });
    PROVAS = { carga: null, ticket: null, assinatura: '' };
    const c = g('bfCanvas'); if (c && c._limpar) c._limpar();
    pintarProvas();
    const pl = g('bfPlaca'); if (pl) pl.focus();
  }

  // ------------------------------------------------------------------
  // AS VIAGENS JÁ REGISTRADAS
  // ------------------------------------------------------------------
  window.bfAbrirViagens = function () { abrir('bfViagensModal'); carregarViagens(); };

  window.bfPeriodoMes = function () {
    const n = new Date(), y = n.getFullYear(), m = n.getMonth();
    const fmt = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    g('bfDe').value = fmt(new Date(y, m, 1));
    g('bfAte').value = fmt(new Date(y, m + 1, 0));
    carregarViagens();
  };
  window.bfPeriodoTudo = function () { g('bfDe').value = ''; g('bfAte').value = ''; carregarViagens(); };
  window.bfCarregarViagens = function () { carregarViagens(); };

  async function carregarViagens() {
    const box = g('bfLista');
    if (!box || carregando) return;
    carregando = true;
    box.innerHTML = '<p class="eq-vazio">Carregando…</p>';
    try {
      const url = urlBF('bfListar', { de: val('bfDe'), ate: val('bfAte') });
      const r = await (await fetch(url)).json();
      VIAGENS = (r && r.viagens) || [];
      pintarViagens();
    } catch (e) {
      box.innerHTML = '<p class="eq-vazio">Não consegui buscar as viagens. Tente de novo.</p>';
    } finally {
      carregando = false;
    }
  }

  function pintarViagens() {
    const box = g('bfLista'), res = g('bfResumo');
    if (!box) return;
    if (!VIAGENS.length) {
      box.innerHTML = '<p class="eq-vazio">Nenhuma viagem no período.</p>';
      if (res) res.textContent = '';
      return;
    }
    const total = VIAGENS.reduce((s, v) => s + num(v.valor), 0);
    if (res) res.textContent = `${viagens(VIAGENS.length)} · ${reais(total)}`;

    const prova = (v, campo, rot) => v[campo]
      ? `<span class="bf-selo" title="${rot} anexada">${ic('check', 12)} ${rot}</span>`
      : `<span class="bf-selo bf-selo-falta" title="${rot} não anexada">${ic('alerta', 12)} ${rot}</span>`;

    box.innerHTML = VIAGENS.map(v => `
      <div class="eq-item">
        <div class="eq-item-txt">
          <p class="eq-item-nome">${esc(v.placa)} · ${esc(v.material)}</p>
          <p class="kpi-s">${dataBR(v.data)} · ${esc(v.motorista || 'sem motorista')} · ${esc(v.fornecedor || '—')}
             ${v.origem || v.destino ? ' · ' + esc(v.origem || '?') + ' → ' + esc(v.destino || '?') : ''}</p>
          <p class="bf-selos">${prova(v, 'fotoCarga', 'carga')}${prova(v, 'assinatura', 'assinatura')}${prova(v, 'fotoTicket', 'ticket')}</p>
        </div>
        <div class="eq-item-lado">
          <span class="eq-item-horas">${reais(num(v.valor))}</span>
          <button type="button" data-id="${esc(v.id)}" class="bf-apagar btn btn-ghost btn-icone"
                  title="Apagar esta viagem" aria-label="Apagar esta viagem">${ic('lixeira')}</button>
        </div>
      </div>`).join('');
    box.querySelectorAll('.bf-apagar').forEach(b =>
      b.addEventListener('click', () => apagarViagem(b.getAttribute('data-id'))));
  }

  async function apagarViagem(id) {
    if (!confirm('Apagar esta viagem? Esta ação não pode ser desfeita.')) return;
    try {
      const r = await enviarAcao({ action: 'bfExcluir', obra: obraId(), id, ...authParams() }, 1, 2000);
      if (r && r.ok) { aviso('Viagem apagada.', 'success'); carregarViagens(); }
      else aviso((r && (r.mensagem || r.error)) || 'Não foi possível apagar.');
    } catch (e) {
      aviso('Erro de conexão com o servidor.');
    }
  }

  // ------------------------------------------------------------------
  // A PLANILHA — aba FRETE, no formato do fechamento
  // ------------------------------------------------------------------
  window.bfGerarPlanilha = function () {
    return comLib('excel', () => montarPlanilha(), 'a planilha de frete');
  };

  function bordaFina() {
    const c = { style: 'thin', color: { rgb: 'B8B8B8' } };
    return { top: c, bottom: c, left: c, right: c };
  }
  const STL = {
    titulo: { font: { bold: true, sz: 13, color: { rgb: 'FFFFFF' } }, fill: { fgColor: { rgb: '0F172A' } },
              alignment: { horizontal: 'center', vertical: 'center' } },
    th:     { font: { bold: true, sz: 10, color: { rgb: 'FFFFFF' } }, fill: { fgColor: { rgb: '0E7490' } },
              alignment: { horizontal: 'center', vertical: 'center', wrapText: true }, border: bordaFina() },
    td:     { font: { sz: 10 }, alignment: { vertical: 'center', wrapText: true }, border: bordaFina() },
    tdC:    { font: { sz: 10 }, alignment: { horizontal: 'center', vertical: 'center' }, border: bordaFina() },
    tdData: { font: { sz: 10 }, alignment: { horizontal: 'center', vertical: 'center' }, border: bordaFina(), numFmt: 'dd/mm/yyyy' },
    tdR$:   { font: { sz: 10 }, alignment: { horizontal: 'right', vertical: 'center' }, border: bordaFina(), numFmt: 'R$ #,##0.00' },
    total:  { font: { bold: true, sz: 10 }, fill: { fgColor: { rgb: 'E2E8F0' } },
              alignment: { horizontal: 'center', vertical: 'center' }, border: bordaFina() },
    totalR$:{ font: { bold: true, sz: 10 }, fill: { fgColor: { rgb: 'E2E8F0' } },
              alignment: { horizontal: 'right', vertical: 'center' }, border: bordaFina(), numFmt: 'R$ #,##0.00' },
    link:   { font: { sz: 10, color: { rgb: '0E7490' }, underline: true }, alignment: { vertical: 'center' }, border: bordaFina() },
  };
  const T = (v, s) => ({ v: v == null ? '' : String(v), t: 's', s: s || STL.td });
  const R$ = (v, s) => ({ v: Number(v) || 0, t: 'n', s: s || STL.tdR$ });

  /* A data vai como DATA de verdade, não como texto: a aba FRETE do
     fechamento soma e ordena por ela, e "14/07/2026" em texto não ordena.
     O serial do Excel conta a partir de 30/12/1899. */
  function serialData(iso) {
    const p = String(iso || '').slice(0, 10).split('-');
    if (p.length !== 3) return null;
    const d = Date.UTC(+p[0], +p[1] - 1, +p[2]);
    return { v: Math.round(d / 86400000) + 25569, t: 'n', s: STL.tdData };
  }

  function montarSheet(matriz) {
    const aoa = matriz.map(r => r.map(c => (c && typeof c === 'object' && 'v' in c) ? c.v : (c == null ? '' : c)));
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    matriz.forEach((linha, R) => linha.forEach((cel, C) => {
      if (cel && typeof cel === 'object' && 'v' in cel) {
        const end = XLSX.utils.encode_cell({ r: R, c: C });
        const o = ws[end] || (ws[end] = { t: cel.t || 's', v: cel.v });
        if (cel.t) o.t = cel.t;
        if (cel.s) o.s = cel.s;
        if (cel.l) o.l = cel.l;
      }
    }));
    return ws;
  }

  /* O ponteiro que a planilha guarda é "drive_id:<id>". Para quem abre o
     arquivo no escritório, o que serve é o endereço que o navegador abre. */
  function linkDaProva(ponteiro) {
    const p = String(ponteiro || '');
    if (!p) return '';
    if (p.indexOf('http') === 0) return p;
    const m = p.match(/^drive_id:(.+)$/);
    return m ? 'https://drive.google.com/file/d/' + m[1] + '/view' : '';
  }

  async function montarPlanilha() {
    if (typeof XLSX === 'undefined') {
      aviso('A biblioteca de Excel não carregou. Verifique a conexão e recarregue.');
      return;
    }
    const de = val('bfDe'), ate = val('bfAte');
    let dados = VIAGENS.slice();
    if (!dados.length) {
      // Quem abre direto na planilha ainda não consultou nada.
      await carregarViagens();
      dados = VIAGENS.slice();
    }
    if (!dados.length) { aviso('Nenhuma viagem no período para exportar.'); return; }
    dados.sort((a, b) => String(a.data).localeCompare(String(b.data)) ||
                         String(a.placa).localeCompare(String(b.placa), 'pt-BR'));

    /* O título da aba FRETE é o TRAJETO: "FRETE - <origem> >> <destino>".
       Quando as viagens do período têm origens ou destinos diferentes, o
       título traz os que aparecem — mentir um trajeto único seria pior do
       que uma linha comprida. */
    const unicos = campo => [...new Set(dados.map(v => String(v[campo] || '').trim().toUpperCase()).filter(Boolean))];
    const origens = unicos('origem'), destinos = unicos('destino');
    const titulo = 'FRETE' + (origens.length || destinos.length
      ? ' - ' + (origens.join(' / ') || '?') + ' >> ' + (destinos.join(' / ') || '?')
      : '');

    // ---- ABA FRETE: as colunas do fechamento, na ordem do fechamento ----
    const COLS = ['FORNECEDOR', 'DATA FRETE', 'PLACA', 'TIPO MATERIAL', 'MOTORISTA',
                  'FRETE OU FRESA', 'PROJETO', 'VALOR FRETE', 'OBSERVAÇÕES'];
    const M = [];
    // O título fica em B1, como no arquivo do escritório.
    M.push([T('', STL.titulo), T(titulo, STL.titulo), ...Array(COLS.length - 2).fill(T('', STL.titulo))]);
    M.push(COLS.map(c => T(c, STL.th)));
    dados.forEach(v => {
      M.push([
        T(v.fornecedor, STL.tdC),
        serialData(v.data) || T(dataBR(v.data), STL.tdC),
        T(String(v.placa || '').toUpperCase(), STL.tdC),
        T(v.material, STL.tdC),
        T(v.motorista, STL.td),
        T(v.servico || 'FRETE', STL.tdC),
        T(v.projeto, STL.td),
        R$(num(v.valor)),
        T(v.obs, STL.td),
      ]);
    });
    const total = dados.reduce((s, v) => s + num(v.valor), 0);
    M.push([
      T('TOTAL', STL.total), T('', STL.total), T('', STL.total), T('', STL.total), T('', STL.total),
      T('', STL.total), T(viagens(dados.length), STL.total), R$(total, STL.totalR$), T('', STL.total),
    ]);
    const wsFrete = montarSheet(M);
    wsFrete['!cols'] = [{ wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 16 }, { wch: 20 },
                        { wch: 15 }, { wch: 20 }, { wch: 14 }, { wch: 42 }];
    wsFrete['!merges'] = [{ s: { r: 0, c: 1 }, e: { r: 0, c: 8 } }];
    wsFrete['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 1, c: 0 }, e: { r: 1 + dados.length, c: 8 } }) };
    wsFrete['!freeze'] = { xSplit: 0, ySplit: 2 };

    /* ---- ABA COMPROVAÇÃO ----
       A aba FRETE é a que a contabilidade recebe e não muda de forma. Mas
       o que este controle tem de diferente do maço de tickets são as
       PROVAS, e elas precisam viajar junto: é com esta segunda aba que se
       confere a fatura do transportador linha a linha. */
    const C = [];
    const COLSP = ['DATA', 'PLACA', 'MOTORISTA', 'MATERIAL', 'VALOR',
                   'FOTO DA CARGA / PLACA', 'ASSINATURA DO MOTORISTA', 'FOTO DO TICKET', 'LANÇADO POR'];
    C.push([T('COMPROVAÇÃO DAS VIAGENS — abra os links com a conta que tem acesso ao Drive da obra', STL.titulo),
            ...Array(COLSP.length - 1).fill(T('', STL.titulo))]);
    C.push(COLSP.map(c => T(c, STL.th)));
    dados.forEach(v => {
      const cel = (ponteiro, rot) => {
        const url = linkDaProva(ponteiro);
        if (!url) return T('— sem ' + rot + ' —', STL.tdC);
        const o = T('abrir ' + rot, STL.link);
        o.l = { Target: url, Tooltip: 'Abrir ' + rot + ' no Drive' };
        return o;
      };
      C.push([
        serialData(v.data) || T(dataBR(v.data), STL.tdC),
        T(String(v.placa || '').toUpperCase(), STL.tdC),
        T(v.motorista, STL.td),
        T(v.material, STL.tdC),
        R$(num(v.valor)),
        cel(v.fotoCarga, 'carga'),
        cel(v.assinatura, 'assinatura'),
        cel(v.fotoTicket, 'ticket'),
        T(v.usuario, STL.tdC),
      ]);
    });
    const wsProvas = montarSheet(C);
    wsProvas['!cols'] = [{ wch: 12 }, { wch: 12 }, { wch: 20 }, { wch: 14 }, { wch: 14 },
                         { wch: 24 }, { wch: 26 }, { wch: 22 }, { wch: 16 }];
    wsProvas['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 8 } }];

    const wb = XLSX.utils.book_new();
    wb.Props = { Title: 'Controle de bota-fora — frete', Subject: obraNome(), Author: 'Gestor Engenharia' };
    XLSX.utils.book_append_sheet(wb, wsFrete, 'FRETE');
    XLSX.utils.book_append_sheet(wb, wsProvas, 'COMPROVAÇÃO');

    const periodo = de && ate ? de + '_a_' + ate : (de || ate || 'tudo');
    XLSX.writeFile(wb, `Bota-fora_FRETE_${periodo}.xlsx`);
    aviso(`Planilha gerada — ${viagens(dados.length)}, ${reais(total)}.`, 'success');
  }

  // ------------------------------------------------------------------
  // A TELA
  // ------------------------------------------------------------------
  function modal(id, titulo, sub, corpo, largura) {
    return `<div id="${id}" class="eq-modal" style="display:none">
      <div class="eq-modal-caixa" style="max-width:${largura || '560px'}">
        <div class="eq-modal-topo">
          <div>
            <div class="card-title">${titulo}</div>
            <div class="card-title-sub">${sub}</div>
          </div>
          <button type="button" class="btn btn-sm btn-ghost" onclick="BF.fechar('${id}')">${ic('fechar')}</button>
        </div>
        <div class="eq-modal-corpo">${corpo}</div>
      </div>
    </div>`;
  }

  /* Os dois caminhos de imagem, como no lançamento de serviço: a câmera
     traseira para quem está na saída do canteiro, e a galeria para quem
     fotografou antes e lança depois. */
  function campoProva(qual, rotulo, ajuda) {
    return `
      <div class="bf-prova">
        <div class="bf-prova-topo">
          <div>
            <div class="card-title" style="font-size:13px">${rotulo}</div>
            <div class="card-title-sub">${ajuda}</div>
          </div>
          <div class="eq-assin-acoes">
            <button type="button" class="btn btn-sm btn-outline" onclick="bfFoto('${qual}','camera')">${ic('camera', 15)} Tirar</button>
            <button type="button" class="btn btn-sm btn-outline" onclick="bfFoto('${qual}','anexo')">${ic('galeria', 15)} Anexar</button>
          </div>
        </div>
        <input id="bfArq${qual}Cam" type="file" accept="image/*" capture="environment"
               onchange="bfFotoEscolhida(this,'${qual}')" style="display:none">
        <input id="bfArq${qual}" type="file" accept="image/*"
               onchange="bfFotoEscolhida(this,'${qual}')" style="display:none">
        <div id="bfPrev${qual}" class="bf-prova-prev"></div>
      </div>`;
  }

  function linhaConf(rot, id) {
    return `<div class="eq-conf-linha"><span class="kpi-s">${rot}</span><span id="${id}">—</span></div>`;
  }

  function render() {
    const p = padroes();
    const hoje = new Date();
    const iso = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`;
    const opts = (lista, sel) => lista.map(v =>
      `<option value="${esc(v)}"${v === sel ? ' selected' : ''}>${esc(v)}</option>`).join('');

    return `
    <div class="eq-topo">
      <div>
        <div class="card-title">Controle de bota-fora</div>
        <div class="card-title-sub">Cada viagem sai com prova: foto da carga e da placa, assinatura do motorista e foto do ticket</div>
      </div>
      <div class="eq-topo-acoes">
        <button type="button" class="btn btn-sm btn-primary" onclick="bfAbrirViagens()">${ic('planilha')} Viagens e planilha</button>
      </div>
    </div>

    <form id="bfForm" class="card" style="margin-top:14px">
      <div class="card-body">

        <div class="form-grid">
          <div class="field"><label for="bfData">Data da viagem</label>
            <input type="date" id="bfData" value="${iso}" required></div>
          <div class="field"><label for="bfPlaca">Placa do caminhão</label>
            <input type="text" id="bfPlaca" required autocomplete="off" placeholder="ABC-1D23"
                   style="text-transform:uppercase"></div>
          <div class="field"><label for="bfMotorista">Motorista</label>
            <input type="text" id="bfMotorista" autocomplete="off" placeholder="Nome de quem levou"></div>
          <div class="field"><label for="bfFornecedor">Fornecedor (transportador)</label>
            <input type="text" id="bfFornecedor" autocomplete="off" placeholder="ex: SLT"
                   value="${esc(p.fornecedor || '')}"></div>
        </div>

        <div class="form-grid" style="margin-top:14px">
          <div class="field"><label for="bfMaterial">Tipo de material</label>
            <select id="bfMaterial">${opts(MATERIAIS, p.material || 'ENTULHO')}</select></div>
          <div class="field"><label for="bfServico">Frete ou fresa</label>
            <select id="bfServico">${opts(SERVICOS, p.servico || 'FRETE')}</select></div>
          <div class="field"><label for="bfProjeto">Projeto</label>
            <input type="text" id="bfProjeto" autocomplete="off"
                   value="${esc(p.projeto || obraNome())}"></div>
          <!-- type=text + inputmode=decimal, e NUNCA type=number: em teclado
               pt-BR o operador digita "1.250,50" e o Chromium descarta o valor
               inteiro em silêncio. Frete errado é dinheiro errado. -->
          <div class="field"><label for="bfValor">Valor do frete (R$)</label>
            <input type="text" inputmode="decimal" id="bfValor" autocomplete="off" placeholder="900,00"
                   value="${esc(p.valor || '')}"></div>
        </div>

        <div class="eq-duo" style="margin-top:14px">
          <div class="field"><label for="bfOrigem">Origem</label>
            <input type="text" id="bfOrigem" autocomplete="off" placeholder="de onde saiu a carga"
                   value="${esc(p.origem || '')}"></div>
          <div class="field"><label for="bfDestino">Destino</label>
            <input type="text" id="bfDestino" autocomplete="off" placeholder="aterro / destino"
                   value="${esc(p.destino || '')}"></div>
        </div>

        <div class="field" style="margin-top:14px"><label for="bfObs">Observações (opcional)</label>
          <textarea id="bfObs" rows="2" placeholder="ex: duas viagens de fresa para o canteiro"></textarea></div>

        <div class="eq-bloco">
          <div class="eq-bloco-topo">
            <div>
              <div class="card-title" style="font-size:13px">Comprovação da viagem</div>
              <div class="card-title-sub" id="bfProvasEstado">Nenhuma prova ainda — a viagem pode ser registrada assim, mas sem prova não se contesta fatura.</div>
            </div>
          </div>
          ${campoProva('carga', 'Foto da carga / placa', 'O que saiu e em qual caminhão')}
          <div class="bf-prova">
            <div class="bf-prova-topo">
              <div>
                <div class="card-title" style="font-size:13px">Assinatura do motorista</div>
                <div class="card-title-sub">Abre em tela cheia para assinar com o dedo</div>
              </div>
              <div class="eq-assin-acoes">
                <button type="button" class="btn btn-sm btn-outline" onclick="bfAbrirAssinatura()">${ic('assinatura', 15)} Assinar</button>
              </div>
            </div>
            <div id="bfPrevassinatura" class="bf-prova-prev"></div>
          </div>
          ${campoProva('ticket', 'Foto do ticket', 'O comprovante do aterro — é o que a fatura anexa')}
        </div>

        <div class="eq-enviar">
          <button type="submit" id="bfEnviar" class="btn btn-primary btn-lg" style="width:100%;justify-content:center">
            <span id="bfEnviarTxt">Registrar viagem</span>
          </button>
        </div>
      </div>
    </form>

    ${modal('bfAssinaturaModal', 'Assinatura do motorista', 'Confirmar guarda o traço; limpar apaga.', `
      <canvas id="bfCanvas" class="eq-assinatura"></canvas>
      <div class="eq-modal-rodape">
        <button type="button" class="btn btn-outline" onclick="bfLimparCanvas()">Limpar</button>
        <button type="button" class="btn btn-primary" onclick="bfConfirmarAssinatura()">${ic('check')} Confirmar assinatura</button>
      </div>`, '640px')}

    ${modal('bfConfirmModal', 'Confira antes de registrar', 'A viagem entra no fechamento do frete', `
      <div class="eq-conf">
        ${linhaConf('Data', 'bfcData')}${linhaConf('Placa', 'bfcPlaca')}
        ${linhaConf('Motorista', 'bfcMotorista')}${linhaConf('Material', 'bfcMaterial')}
        ${linhaConf('Trajeto', 'bfcTrajeto')}${linhaConf('Valor', 'bfcValor')}
        ${linhaConf('Fornecedor', 'bfcFornecedor')}${linhaConf('Projeto', 'bfcProjeto')}
        ${linhaConf('Provas', 'bfcProvas')}
      </div>
      <div class="eq-modal-rodape">
        <button type="button" class="btn btn-outline" onclick="BF.fechar('bfConfirmModal')">Voltar e revisar</button>
        <button type="button" class="btn btn-primary" onclick="bfConfirmar()">${ic('check')} Registrar viagem</button>
      </div>`)}

    ${modal('bfViagensModal', 'Viagens e planilha de frete', 'Confira o período e gere a planilha no formato do fechamento', `
      <div class="eq-duo">
        <div class="field"><label for="bfDe">De</label><input type="date" id="bfDe"></div>
        <div class="field"><label for="bfAte">Até</label><input type="date" id="bfAte"></div>
      </div>
      <div class="eq-topo-acoes" style="margin:12px 0">
        <button type="button" class="btn btn-sm btn-primary" onclick="bfCarregarViagens()">Aplicar</button>
        <button type="button" class="btn btn-sm btn-outline" onclick="bfPeriodoMes()">Este mês</button>
        <button type="button" class="btn btn-sm btn-outline" onclick="bfPeriodoTudo()">Tudo</button>
        <button type="button" class="btn btn-sm btn-ghost" onclick="bfGerarPlanilha()">${ic('planilha')} Gerar planilha (FRETE)</button>
      </div>
      <div id="bfResumo" class="kpi-s" style="margin-bottom:8px"></div>
      <div id="bfLista" class="eq-lista"></div>`, '760px')}
    `;
  }

  /* O `.page` roda uma animação com transform, e transform cria contexto de
     empilhamento: dentro dele nenhum z-index vence a barra de navegação do
     celular, que é fixa e comeria o pé do modal. Movido para o body, o modal
     volta a mandar na tela. É a mesma solução da tela de equipamentos. */
  function abrir(id) {
    const e = g(id);
    if (!e) return;
    if (e.parentElement !== document.body) document.body.appendChild(e);
    e.style.display = 'flex';
  }
  function fechar(id) { const e = g(id); if (e) e.style.display = 'none'; }

  function boot() {
    document.querySelectorAll('body > .eq-modal[id^="bf"]').forEach(m => m.remove());
    form = g('bfForm');
    submitBtn = g('bfEnviar');
    btnText = g('bfEnviarTxt');
    if (!form) return;
    // Provas são da viagem que estava na tela; remontar a tela zera.
    PROVAS = { carga: null, ticket: null, assinatura: '' };
    VIAGENS = [];
    ligarForm();
    pintarProvas();
    const mes = g('bfDe');
    if (mes && !mes.value) {
      const n = new Date();
      const fmt = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      g('bfDe').value = fmt(new Date(n.getFullYear(), n.getMonth(), 1));
      g('bfAte').value = fmt(new Date(n.getFullYear(), n.getMonth() + 1, 0));
    }
  }

  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    ['bfAssinaturaModal', 'bfConfirmModal', 'bfViagensModal'].forEach(id => {
      const el = g(id);
      if (el && el.style.display !== 'none') el.style.display = 'none';
    });
  });

  window.BF = { render, boot, abrir, fechar };
})();
