/*
 * Sistema de controle de obra — Av. Senador Teotônio Vilela
 * Copyright © 2026 Leonardo Maciel. Todos os direitos reservados.
 *
 * Software proprietário. O código estar visível não autoriza uso, cópia
 * nem obra derivada — ver LICENSE, na raiz do repositório.
 */
/* ====================================================================
   DESENHO EM VOLUME (SVG) — a maquete da pista e o relevo do ritmo
   --------------------------------------------------------------------
   Dois desenhos do Painel que precisam de TERCEIRA dimensão para dizer o
   que dizem, e que não podem custar o que o Modelo 3D custa (three.js,
   WebGL, 3 MB de trechos): são SVG puro, montado como texto, que abre no
   celular do canteiro junto com o resto do Painel.

     MAQUETE DA PISTA  — cada estaca é uma coluna que sobe até a etapa
       mais avançada que o RDO lançou nela (demolição → … → sinalização).
       A leitura é a mesma da tela Modelo 3D (`m3dEtapaDe`, `m3dBase`):
       regra de etapa NÃO mora aqui, só o desenho.

     RELEVO DO RITMO   — um calendário de semanas × dias em que cada dia
       sobe conforme o avanço que ganhou; chuva e paralisação vêm do RDO
       Diário, pela mesma leitura do mapa de chuva (`mapaChuvaDoMes`).

   A projeção é OBLÍQUA (o comprido da via fica quase deitado, a
   profundidade foge para cima e para a direita): a avenida tem 44 estacas
   de comprimento e 2 pistas de largura, e numa isométrica de verdade ela
   viraria uma diagonal que não cabe num cartão.

   Com essa projeção, de cada bloco se veem TRÊS faces — frente, topo e a
   ponta direita — e a ordem de pintura é simples: o que está mais ao
   fundo primeiro, e dentro de cada pista, de baixo para cima.
   ==================================================================== */
(function () {
  'use strict';

  /* ---------- cor ---------- */
  function rgbDe(hex) {
    var h = String(hex || '#888').replace('#', '');
    if (h.length === 3) h = h.replace(/./g, '$&$&');
    var n = parseInt(h, 16);
    return isFinite(n) ? [(n >> 16) & 255, (n >> 8) & 255, n & 255] : [136, 136, 136];
  }
  /* t > 0 clareia, t < 0 escurece (0..1) */
  function tom(hex, t) {
    var c = rgbDe(hex), alvo = t >= 0 ? 255 : 0, k = Math.min(1, Math.abs(t));
    return '#' + c.map(function (v) {
      return ('0' + Math.round(v + (alvo - v) * k).toString(16)).slice(-2);
    }).join('');
  }
  function mistura(a, b, t) {
    var x = rgbDe(a), y = rgbDe(b);
    return '#' + x.map(function (v, i) {
      return ('0' + Math.round(v + (y[i] - v) * t).toString(16)).slice(-2);
    }).join('');
  }

  /* ---------- projeção ----------
     P = { ex, ey: [px por unidade em x, em y da tela] } ; z sobe 1 px por unidade */
  function projetor(ex, ey, ox, oy) {
    return function (x, y, z) {
      return [ox + x * ex[0] + y * ey[0], oy + x * ex[1] + y * ey[1] - (z || 0)];
    };
  }
  function caminho(pts) {
    return 'M' + pts.map(function (p) { return p[0].toFixed(1) + ' ' + p[1].toFixed(1); }).join('L') + 'Z';
  }
  /* As três faces visíveis de um bloco. `cor` é a da FRENTE; o topo sai
     mais claro e a ponta mais escura — é só isso que faz o olho ler volume. */
  function bloco(pj, x0, x1, y0, y1, z0, z1, cor, extra) {
    var frente = caminho([pj(x0, y0, z0), pj(x1, y0, z0), pj(x1, y0, z1), pj(x0, y0, z1)]);
    var ponta = caminho([pj(x1, y0, z0), pj(x1, y1, z0), pj(x1, y1, z1), pj(x1, y0, z1)]);
    var topo = caminho([pj(x0, y0, z1), pj(x1, y0, z1), pj(x1, y1, z1), pj(x0, y1, z1)]);
    var a = extra || '';
    return '<path d="' + ponta + '" fill="' + tom(cor, -0.34) + '"' + a + '/>' +
           '<path d="' + frente + '" fill="' + cor + '"' + a + '/>' +
           '<path d="' + topo + '" fill="' + tom(cor, 0.22) + '"' + a + '/>';
  }
  function linha(pj, a, b, attrs) {
    var p = pj(a[0], a[1], a[2]), q = pj(b[0], b[1], b[2]);
    return '<line x1="' + p[0].toFixed(1) + '" y1="' + p[1].toFixed(1) + '" x2="' + q[0].toFixed(1) +
      '" y2="' + q[1].toFixed(1) + '" ' + attrs + '/>';
  }

  /* ==================================================================
     MAQUETE DA PISTA
     ================================================================== */
  var MAQ = { sel: null, realce: null, D: null };

  /* f = { pacotes: [linhas do cadastro no filtro], ate: 'AAAA-MM-DD' | '' }
     Lê do `m3dBase()` — cada lançamento já interpretado UMA vez por carga
     (estaca, frente, data, etapa) — e não do filtro da tela Modelo 3D: a
     maquete obedece ao filtro do PAINEL (frente e data de referência). */
  function maqDados(f) {
    f = f || {};
    var eixos = eixosDaObraAtiva();
    if (!eixos.length || typeof m3dBase !== 'function') return null;
    var porEixo = {};
    eixos.forEach(function (x) { porEixo[x.id] = x; });
    var pacotes = f.pacotes || STATE.pacotes || [];
    var ids = new Set(pacotes.map(function (p) { return String(getCSVField(p, 'ID')); }));
    var tem = {};
    pacotes.forEach(function (p) {
      var e = m3dEtapaDe(getCSVField(p, 'Pacote'), getCSVField(p, 'Frente'));
      if (e >= 0) tem[e] = 1;
    });
    var cols = new Map();
    m3dBase().forEach(function (L) {
      if (!ids.has(L.pid)) return;
      if (f.ate && L.iso > f.ate) return;
      L.ests.forEach(function (e) {
        var x = porEixo[e.eixo];
        if (!x || e.num < +x.ini || e.num > +x.fim) return;
        var k = e.eixo + ':' + e.num, c = cols.get(k);
        if (!c) cols.set(k, c = { topo: -1, n: 0, ultima: '' });
        c.n++;
        if (L.iso > c.ultima) c.ultima = L.iso;
        if (L.etapa > c.topo) c.topo = L.etapa;
        if (L.etapa >= 0) tem[L.etapa] = 1;
      });
    });
    var ordem = Object.keys(tem).map(Number).sort(function (a, b) { return a - b; });
    if (!ordem.length) return null;
    var conta = ordem.map(function () { return 0; });
    var total = 0, comEtapa = 0;
    /* nível = quantos degraus DA OBRA a estaca já subiu (a etapa mais alta
       lançada nela e as de baixo: quem está no binder já passou pela base) */
    var nivelDe = function (topo) {
      var n = 0;
      for (var i = 0; i < ordem.length; i++) if (ordem[i] <= topo) n = i + 1;
      return n;
    };
    var porCena = (typeof CONFIG !== 'undefined' && CONFIG.viaPistaDupla) ? 2 : 1;
    var cenas = [];
    for (var k = 0; k < eixos.length; k += porCena) {
      cenas.push({ pistas: eixos.slice(k, k + porCena).map(function (x) {
        var lista = [];
        for (var n = +x.ini; n <= +x.fim; n++) {
          var c = cols.get(x.id + ':' + n) || { topo: -1, n: 0, ultima: '' };
          var nv = nivelDe(c.topo);
          total++;
          if (nv > 0) comEtapa++;
          for (var i = 0; i < nv; i++) conta[i]++;
          lista.push({ num: n, nivel: nv, topo: c.topo, n: c.n, ultima: c.ultima });
        }
        return { eixo: x, cols: lista };
      }) });
    }
    return {
      total: total, comEtapa: comEtapa, cenas: cenas, solo: porCena === 1,
      etapas: ordem.map(function (i, pos) {
        var e = M3D_ETAPAS[i];
        return { i: i, pos: pos, nome: e.nome, cor: e.cor, n: conta[pos], pc: total ? Math.round(100 * conta[pos] / total) : 0 };
      }),
    };
  }

  /* Medidas da cena, em unidades do viewBox. */
  var MQ = { cw: 15, prof: 24, vao: 9, hz: 8, base: 4, sobe: -0.055, ey: [0.78, -0.52] };

  function maqCenaSvg(cena, D, indice) {
    var nEt = D.etapas.length, H = nEt * MQ.hz;
    var maxN = Math.max.apply(null, cena.pistas.map(function (p) { return p.cols.length; }));
    var L = maxN * MQ.cw;
    var nP = cena.pistas.length;
    var profTotal = nP * MQ.prof + (nP - 1) * MQ.vao;
    var margem = { e: 16, d: 20, t: 26, b: 30 };
    var larg = margem.e + L + profTotal * MQ.ey[0] + margem.d;
    var subida = -L * MQ.sobe;                         // quanto a ponta direita fica acima
    var alt = margem.t + H + subida + profTotal * -MQ.ey[1] + MQ.base + margem.b;
    var pj = projetor([1, MQ.sobe], MQ.ey, margem.e, alt - margem.b - MQ.base);

    var cena3d = '', toque = '', regua = '';
    /* a pista de índice 0 é a do fundo (como na cena de atividade: o primeiro
       sentido em cima, o segundo embaixo) */
    cena.pistas.forEach(function (p, li) {
      var ordemProf = nP - 1 - li;                     // 0 = mais perto de quem olha
      var y0 = ordemProf * (MQ.prof + MQ.vao), y1 = y0 + MQ.prof;
      var n = p.cols.length, cw = L / n;
      var perto = ordemProf === 0;
      var g = '';

      // a sombra no chão e o leito: a faixa de terreno onde a pista vai subir
      g += '<path class="iso-sombra" d="' + caminho([pj(-2, y0 - 3, -MQ.base - 5), pj(L + 5, y0 - 3, -MQ.base - 5),
        pj(L + 5, y1 + 1, -MQ.base - 5), pj(-2, y1 + 1, -MQ.base - 5)]) + '"/>';
      g += '<g class="iso-leito">' + bloco(pj, 0, L, y0, y1, -MQ.base, 0, '#3a322a') + '</g>';
      // marcas de estaca no leito, de 5 em 5
      p.cols.forEach(function (c, i) {
        if (c.num % 5 !== 0) return;
        g += linha(pj, [i * cw, y0, 0], [i * cw, y1, 0], 'class="iso-marca"');
      });
      // aresta de trás do volume de projeto (fica por baixo das camadas)
      var fundo = linha(pj, [0, y1, H], [L, y1, H], 'class="iso-projeto"') +
                  linha(pj, [0, y1, 0], [0, y1, H], 'class="iso-projeto"');

      // camadas: uma faixa por trecho contínuo de estacas que já chegaram ao degrau
      D.etapas.forEach(function (et, pos) {
        var z0 = pos * MQ.hz, z1 = z0 + MQ.hz, partes = '', ini = -1;
        for (var i = 0; i <= n; i++) {
          var tem = i < n && p.cols[i].nivel > pos;
          if (tem && ini < 0) ini = i;
          if (!tem && ini >= 0) {
            partes += bloco(pj, ini * cw, i * cw, y0, y1, z0, z1, et.cor);
            ini = -1;
          }
        }
        if (partes) g += '<g class="iso-l" data-e="' + pos + '" style="animation-delay:' + (120 + pos * 70 + ordemProf * 40) + 'ms">' + partes + '</g>';
      });
      // o volume de projeto, tracejado: até onde a pista ainda tem de subir
      var frente = linha(pj, [0, y0, H], [L, y0, H], 'class="iso-projeto"') +
                linha(pj, [L, y0, H], [L, y1, H], 'class="iso-projeto"') +
                linha(pj, [0, y0, 0], [0, y0, H], 'class="iso-projeto"') +
                linha(pj, [L, y0, 0], [L, y0, H], 'class="iso-projeto"') +
                linha(pj, [L, y1, 0], [L, y1, H], 'class="iso-projeto"');
      /* A pista INTEIRA de uma vez — arestas de trás, camadas, arestas da
         frente — e só então a seguinte, que está mais perto de quem olha e
         passa por cima dela. */
      cena3d += '<g class="iso-pista">' + fundo + g + frente + '</g>';

      // régua: a pista de perto leva os números embaixo; a do fundo, em cima
      p.cols.forEach(function (c, i) {
        if (c.num % 5 !== 0) return;
        var pt = perto ? pj((i + 0.5) * cw, y0, -MQ.base) : pj((i + 0.5) * cw, y1, H);
        regua += '<text class="iso-num" x="' + pt[0].toFixed(1) + '" y="' + (pt[1] + (perto ? 12 : -6)).toFixed(1) + '">E' + c.num + '</text>';
        if (perto) regua += linha(pj, [(i + 0.5) * cw, y0, -MQ.base], [(i + 0.5) * cw, y0, -MQ.base - 3], 'class="iso-tique"');
      });

      // área de toque de cada estaca: a silhueta da coluna (nunca mais baixa que um degrau)
      p.cols.forEach(function (c, i) {
        var h = Math.max(c.nivel, 1) * MQ.hz, xa = i * cw, xb = xa + cw;
        var sil = caminho([pj(xa, y0, 0), pj(xb, y0, 0), pj(xb, y1, 0), pj(xb, y1, h), pj(xa, y1, h), pj(xa, y0, h)]);
        var k = p.eixo.id + ':' + c.num;
        var onde = c.nivel > 0 ? 'chegou a ' + D.etapas[c.nivel - 1].nome
          : (c.n ? 'lançamentos fora das etapas da pista' : 'sem lançamento');
        toque += '<path class="iso-hit' + (MAQ.sel === k ? ' on' : '') + '" data-k="' + escHtml(k) + '" d="' + sil +
          '" onclick="maqSelecionar(this.getAttribute(\'data-k\'))"><title>E' + c.num + ' · ' + escHtml(p.eixo.label || p.eixo.id) +
          ' — ' + escHtml(onde) + '</title></path>';
      });
    });

    return '<svg class="maq-svg" viewBox="0 0 ' + larg.toFixed(0) + ' ' + alt.toFixed(0) + '" ' +
      'style="--maq-larg:' + larg.toFixed(0) + '" role="img" aria-label="Maquete da pista por etapa, cena ' + (indice + 1) + '">' +
      cena3d + '<g>' + regua + '</g><g>' + toque + '</g></svg>';
  }

  function maqRotuloPista(p, cls) {
    var seta = cls === 'cb' ? '↑ ' : '';
    var fim = cls === 'bc' ? ' ↓' : '';
    return '<div class="scene-lane-label ' + cls + '">' + seta + '<span class="acc">' + escHtml(p.eixo.label || p.eixo.id) +
      '</span> · E' + p.eixo.ini + '–E' + p.eixo.fim + fim + '</div>';
  }

  function maqDetalheHtml() {
    var D = MAQ.D;
    if (!D || !MAQ.sel) {
      return '<span class="maq-dica">' + ic('info') + ' Toque numa estaca para ver até onde a pista chegou ali.</span>';
    }
    var p = String(MAQ.sel).split(':'), eixo = p[0], num = +p[1], col = null, ex = null;
    D.cenas.forEach(function (c) { c.pistas.forEach(function (ps) {
      if (ps.eixo.id !== eixo) return;
      ex = ps.eixo;
      ps.cols.forEach(function (x) { if (x.num === num) col = x; });
    }); });
    if (!col) return '';
    var et = col.nivel > 0 ? D.etapas[col.nivel - 1] : null;
    var prox = col.nivel < D.etapas.length ? D.etapas[col.nivel] : null;
    var estado = et
      ? 'chegou a <span class="maq-et" style="--c:' + et.cor + '">' + escHtml(et.nome) + '</span>'
      : (col.n ? 'tem lançamento, mas nenhum de etapa da pista' : 'ainda sem lançamento');
    var k = escHtml(MAQ.sel);
    return '<div class="maq-det-txt"><strong>E' + num + '</strong> · ' + escHtml(ex.label || ex.id) + ' — ' + estado +
        (prox && et ? ' <span class="maq-prox">· falta ' + escHtml(prox.nome) + (col.nivel + 1 < D.etapas.length ? ' em diante' : '') + '</span>' : '') +
        (col.n ? ' <span class="maq-prox">· ' + col.n + ' lançamento' + (col.n !== 1 ? 's' : '') +
          (col.ultima ? ', último em ' + escHtml(fmtData(col.ultima)) : '') + '</span>' : '') + '</div>' +
      '<div class="maq-det-acoes">' +
        (col.n ? '<button type="button" class="btn btn-outline btn-sm" data-k="' + k + '" onclick="m3dAcao(\'historico\', this.getAttribute(\'data-k\'))">' + ic('historico') + ' Ver lançamentos</button>' : '') +
        (typeof m3dDisponivel === 'function' && m3dDisponivel() && m3dEixoModelo(eixo)
          ? '<button type="button" class="btn btn-outline btn-sm" data-k="' + k + '" onclick="maqVerNo3D(this.getAttribute(\'data-k\'))">' + ic('cubo') + ' Ver no modelo 3D</button>' : '') +
      '</div>';
  }

  function maqLegendaHtml(D) {
    return D.etapas.map(function (e) {
      return '<button type="button" class="maq-chip" aria-pressed="' + (MAQ.realce === e.pos) + '" onclick="maqRealcar(' + e.pos + ')" ' +
        'title="' + escHtml(e.n + ' de ' + D.total + ' estacas já chegaram a ' + e.nome + ' (ou além)') + '">' +
        '<i style="background:' + e.cor + '"></i><span>' + escHtml(e.nome) + '</span><b>' + e.pc + '%</b></button>';
    }).join('');
  }

  /* O cartão inteiro (o miolo: palco, legenda e a linha da estaca tocada). */
  function maqueteHtml(f) {
    var D = maqDados(f);
    MAQ.D = D;
    if (!D) return '';
    // a estaca tocada pode ter saído do filtro (outra obra, outra frente)
    if (MAQ.sel && !D.cenas.some(function (c) { return c.pistas.some(function (p) {
      var q = String(MAQ.sel).split(':');
      return p.eixo.id === q[0] && +q[1] >= +p.eixo.ini && +q[1] <= +p.eixo.fim;
    }); })) MAQ.sel = null;
    if (MAQ.realce != null && MAQ.realce >= D.etapas.length) MAQ.realce = null;

    var cenas = D.cenas.map(function (c, i) {
      var rot = D.solo
        ? maqRotuloPista(c.pistas[0], 'uni')
        : c.pistas.map(function (p, li) { return maqRotuloPista(p, li === 0 ? 'cb' : 'bc'); }).join('');
      return '<div class="maq-palco' + (D.solo ? ' solo' : '') + '">' + rot +
        '<div class="maq-rolo">' + maqCenaSvg(c, D, i) + '</div></div>';
    }).join('');
    return '<div class="maq" id="maqBox"' + (MAQ.realce != null ? ' data-realce="' + MAQ.realce + '"' : '') + '>' + cenas +
      '<div class="maq-pe">' +
        '<div class="maq-legenda" id="maqLegenda">' + maqLegendaHtml(D) + '</div>' +
        '<div class="maq-detalhe" id="maqDetalhe">' + maqDetalheHtml() + '</div>' +
        '<div class="maq-nota">Cada estaca sobe até a etapa mais avançada que o RDO lançou nela — o tracejado é a pista pronta. ' +
          'Mede extensão, não quantidade: a medição continua na Avanço Físico.</div>' +
      '</div></div>';
  }
  function maqAplicarRealce() {
    var box = document.getElementById('maqBox');
    if (!box) return;
    if (MAQ.realce == null) box.removeAttribute('data-realce'); else box.setAttribute('data-realce', String(MAQ.realce));
    box.querySelectorAll('.iso-l').forEach(function (g) {
      g.classList.toggle('apagada', MAQ.realce != null && +g.getAttribute('data-e') !== MAQ.realce);
    });
    var leg = document.getElementById('maqLegenda');
    if (leg && MAQ.D) leg.innerHTML = maqLegendaHtml(MAQ.D);
  }
  window.maqSelecionar = function (k) {
    MAQ.sel = MAQ.sel === k ? null : k;
    var box = document.getElementById('maqBox');
    if (!box) return;
    box.querySelectorAll('.iso-hit').forEach(function (h) { h.classList.toggle('on', h.getAttribute('data-k') === MAQ.sel); });
    var d = document.getElementById('maqDetalhe');
    if (d) d.innerHTML = maqDetalheHtml();
  };
  window.maqRealcar = function (pos) {
    MAQ.realce = MAQ.realce === pos ? null : pos;
    maqAplicarRealce();
  };
  window.maqVerNo3D = function (k) {
    var p = String(k || '').split(':');
    if (p[0] && isFinite(+p[1])) m3dIrEstaca(p[0], +p[1]);
  };

  /* ==================================================================
     RELEVO DO RITMO — semanas × dias da semana
     ================================================================== */
  var RIT = { sel: null, D: null };
  var RT = { cw: 17, cp: 13, semanas: 26, hmax: 20, hmin: 2.2, ey: [0.62, -0.60] };
  var DIAS_SEM = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

  function isoMais(iso, n) {
    var d = new Date(iso + 'T12:00:00');
    d.setDate(d.getDate() + n);
    return getLocalISODate(d);
  }

  /* f = { porDia: {iso: fração de avanço ganha no dia}, lanc: {iso: nº de
     lançamentos}, fim: 'AAAA-MM-DD' (o último dia do calendário) } */
  function ritmoDados(f) {
    f = f || {};
    var fim = f.fim || getLocalISODate(new Date());
    var dFim = new Date(fim + 'T12:00:00');
    // a última coluna é a semana de `fim`; a semana começa na segunda
    var dow = (dFim.getDay() + 6) % 7;                 // seg = 0 … dom = 6
    var inicio = isoMais(fim, -dow - 7 * (RT.semanas - 1));
    var clima = {};
    if (typeof mapaChuvaDoMes === 'function') {
      var meses = {};
      for (var i = 0; i < RT.semanas * 7; i += 7) meses[isoMais(inicio, i).slice(0, 7)] = 1;
      meses[fim.slice(0, 7)] = 1;
      Object.keys(meses).forEach(function (m) {
        try {
          mapaChuvaDoMes(m).forEach(function (x) {
            var vals = [x.cls.manha, x.cls.tarde, x.cls.noite].filter(Boolean);
            clima[x.iso] = {
              rdo: vals.length > 0,
              chuva: vals.some(function (v) { return v.indexOf('chuva') === 0; }),
              parada: vals.some(function (v) { return /improdutivo$/.test(v); }),
            };
          });
        } catch (e) { /* mês sem RDO Diário legível: o dia fica sem marca */ }
      });
    }
    var dias = [], max = 0, soma = 0, comProd = 0, uteis = 0, semRdo = 0, chuva = 0;
    for (var s = 0; s < RT.semanas; s++) {
      for (var d = 0; d < 7; d++) {
        var iso = isoMais(inicio, s * 7 + d);
        var futuro = iso > fim;
        var data = new Date(iso + 'T12:00:00');
        var v = futuro ? 0 : Math.max(0, (f.porDia || {})[iso] || 0);
        var c = clima[iso] || {};
        var util = !futuro && ehDiaUtil(data);
        var x = { iso: iso, s: s, d: d, v: v, n: futuro ? 0 : ((f.lanc || {})[iso] || 0), futuro: futuro,
          util: util, feriado: !futuro && ehFeriadoNacional(data), rdo: !!c.rdo, chuva: !!c.chuva, parada: !!c.parada };
        if (v > max) max = v;
        if (!futuro) {
          soma += v;
          if (v > 0 || x.n > 0) comProd++;
          if (util) { uteis++; if (!x.rdo && !x.n) semRdo++; }
          if (x.chuva) chuva++;
        }
        dias.push(x);
      }
    }
    return { dias: dias, max: max, soma: soma, comProd: comProd, uteis: uteis, semRdo: semRdo, chuva: chuva,
             inicio: inicio, fim: fim };
  }

  var MESES_C = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

  function ritmoSvg(D) {
    var W = RT.semanas * RT.cw, P = 7 * RT.cp;
    var margem = { e: 34, d: 12, t: 18, b: 24 };
    var larg = margem.e + W + P * RT.ey[0] + margem.d;
    var alt = margem.t + RT.hmax + P * -RT.ey[1] + margem.b;
    var pj = projetor([1, 0], RT.ey, margem.e, alt - margem.b);
    var folga = 1.6;                                   // vão entre os ladrilhos

    // base do tabuleiro
    var chao = '<path class="rit-chao" d="' + caminho([pj(-3, -3, 0), pj(W + 3, -3, 0), pj(W + 3, P + 3, 0), pj(-3, P + 3, 0)]) + '"/>';

    /* Ordem de pintura: a fileira do fundo primeiro. A SEGUNDA fica no
       fundo e o DOMINGO na frente — o domingo quase nunca tem produção, e
       na frente não tapa ninguém. */
    var blocos = '', toque = '';
    for (var linhaD = 0; linhaD < 7; linhaD++) {       // 0 = seg (fundo) … 6 = dom (frente)
      var y0 = (6 - linhaD) * RT.cp + folga / 2, y1 = y0 + RT.cp - folga;
      for (var s = 0; s < RT.semanas; s++) {
        var x = D.dias[s * 7 + linhaD];
        if (x.futuro) continue;
        var x0 = s * RT.cw + folga / 2, x1 = x0 + RT.cw - folga;
        var t = D.max > 0 ? x.v / D.max : 0;
        // raiz: o dia fraco não some ao lado do dia de pico
        var h = x.v > 0 ? RT.hmin + (RT.hmax - RT.hmin) * Math.sqrt(t) : (x.n > 0 ? RT.hmin : 0.9);
        var cor, cls = 'rit-dia';
        if (x.v > 0) cor = mistura('#8a4a26', '#ff9a4d', Math.sqrt(t));
        else if (x.n > 0) cor = '#6b5a4c';             // lançou, mas sem peso no avanço
        else if (!x.util) { cor = '#2b2520'; cls += ' folga'; }
        else if (x.rdo) cor = '#4a4037';               // dia útil com RDO e sem serviço lançado
        else { cor = '#3a2f29'; cls += ' vazio'; }
        var extra = '';
        if (x.chuva) cls += ' chuva';
        if (x.parada) cls += ' parada';
        blocos += '<g class="' + cls + '" style="animation-delay:' + (80 + s * 14 + linhaD * 10) + 'ms">' + bloco(pj, x0, x1, y0, y1, 0, h, cor, extra);
        // chuva: uma tampa azul; paralisação: filete âmbar na frente
        if (x.chuva) blocos += '<path class="rit-chuva" d="' + caminho([pj(x0 + 2.5, y0 + 2.5, h), pj(x1 - 2.5, y0 + 2.5, h), pj(x1 - 2.5, y1 - 2.5, h), pj(x0 + 2.5, y1 - 2.5, h)]) + '"/>';
        if (x.parada) blocos += linha(pj, [x0, y0, h], [x1, y0, h], 'class="rit-parada"');
        if (cls.indexOf('vazio') >= 0) blocos += '<path class="rit-falta" d="' + caminho([pj(x0, y0, h), pj(x1, y0, h), pj(x1, y1, h), pj(x0, y1, h)]) + '"/>';
        blocos += '</g>';
        var sil = caminho([pj(x0, y0, 0), pj(x1, y0, 0), pj(x1, y1, 0), pj(x1, y1, h), pj(x0, y1, h), pj(x0, y0, h)]);
        toque += '<path class="iso-hit' + (RIT.sel === x.iso ? ' on' : '') + '" data-d="' + x.iso + '" d="' + sil +
          '" onclick="ritSelecionar(this.getAttribute(\'data-d\'))"><title>' + DIAS_SEM[(linhaD + 1) % 7] + ' ' + escHtml(fmtData(x.iso)) +
          (x.v > 0 ? ' · ' + escHtml(fmtPctDelta(x.v, 2)) : '') + (x.n ? ' · ' + x.n + ' lançamento' + (x.n !== 1 ? 's' : '') : '') +
          (x.chuva ? ' · chuva' : '') + (x.parada ? ' · paralisação' : '') + '</title></path>';
      }
    }
    // rótulos: dias da semana à esquerda, mês embaixo (na semana em que ele começa)
    var rot = '';
    [0, 2, 4, 6].forEach(function (linhaD) {
      var p = pj(0, (6 - linhaD + 0.5) * RT.cp, 0);
      rot += '<text class="rit-rot" text-anchor="end" x="' + (p[0] - 7).toFixed(1) + '" y="' + (p[1] + 3).toFixed(1) + '">' + DIAS_SEM[(linhaD + 1) % 7] + '</text>';
    });
    /* O mês é escrito na semana em que ele COMEÇA. A primeira coluna leva o
       mês dela (com o ano) só quando o seguinte começa a pelo menos quatro
       semanas dali — senão "mai/26" e "jun" caíam um em cima do outro. */
    var viradas = [];
    for (var s2 = 0; s2 < RT.semanas; s2++) {
      var mFim = D.dias[s2 * 7 + 6].iso.slice(0, 7);
      if (!viradas.length || viradas[viradas.length - 1].m !== mFim) viradas.push({ s: s2, m: mFim });
    }
    viradas.forEach(function (v, i) {
      if (i === 0 && viradas[1] && viradas[1].s < 4) return;
      var pm = pj(v.s * RT.cw + 2, 0, 0);
      rot += '<text class="rit-rot mes" x="' + pm[0].toFixed(1) + '" y="' + (pm[1] + 14).toFixed(1) + '">' +
        MESES_C[+v.m.slice(5, 7) - 1] + (v.m.slice(5, 7) === '01' || i === 0 ? '/' + v.m.slice(2, 4) : '') + '</text>';
      rot += linha(pj, [v.s * RT.cw, 0, 0], [v.s * RT.cw, -5, 0], 'class="iso-tique"');
    });
    return '<svg class="rit-svg" viewBox="0 0 ' + larg.toFixed(0) + ' ' + alt.toFixed(0) + '" role="img" ' +
      'aria-label="Avanço ganho em cada dia das últimas ' + RT.semanas + ' semanas">' + chao + blocos + '<g>' + rot + '</g><g>' + toque + '</g></svg>';
  }

  function ritDetalheHtml() {
    var D = RIT.D;
    if (!D || !RIT.sel) return '<span class="maq-dica">' + ic('info') + ' Toque num dia para ver o que foi lançado nele.</span>';
    var x = D.dias.filter(function (d) { return d.iso === RIT.sel; })[0];
    if (!x) return '';
    var partes = [];
    partes.push(x.v > 0 ? '<span class="rit-ganho">' + escHtml(fmtPctDelta(x.v, 2)) + '</span> de avanço' : 'sem avanço lançado');
    if (x.n) partes.push(x.n + ' lançamento' + (x.n !== 1 ? 's' : ''));
    if (x.chuva) partes.push('<span class="rit-tag chuva">chuva</span>');
    if (x.parada) partes.push('<span class="rit-tag parada">paralisação</span>');
    if (x.feriado) partes.push('feriado');
    else if (!x.util) partes.push(new Date(x.iso + 'T12:00:00').getDay() === 0 ? 'domingo' : 'sábado');
    if (x.util && !x.rdo) partes.push('<span class="rit-tag falta">sem RDO Diário</span>');
    var nomeDia = DIAS_SEM[new Date(x.iso + 'T12:00:00').getDay()];
    return '<div class="maq-det-txt"><strong>' + nomeDia + ' ' + escHtml(fmtData(x.iso)) + '</strong> — ' + partes.join(' · ') + '</div>' +
      '<div class="maq-det-acoes">' +
        (x.n ? '<button type="button" class="btn btn-outline btn-sm" onclick="ritAcao(\'historico\')">' + ic('historico') + ' Ver lançamentos</button>' : '') +
        (typeof podeVer === 'function' && podeVer('rdodiario')
          ? '<button type="button" class="btn btn-outline btn-sm" onclick="ritAcao(\'rdo\')">' + ic('diario') + ' Abrir o RDO do dia</button>' : '') +
      '</div>';
  }

  function ritmoHtml(f) {
    var D = ritmoDados(f);
    RIT.D = D;
    if (RIT.sel && (RIT.sel < D.inicio || RIT.sel > D.fim)) RIT.sel = null;
    var media = D.comProd ? D.soma / D.comProd : 0;
    return '<div class="rit" id="ritBox">' +
      '<div class="maq-palco rit-palco"><div class="maq-rolo">' + ritmoSvg(D) + '</div></div>' +
      '<div class="maq-pe">' +
        '<div class="rit-resumo">' +
          '<div><b>' + D.comProd + '</b><span>dias com lançamento</span></div>' +
          '<div><b>' + (media > 0 ? escHtml(fmtPctDelta(media, 2)) : '—') + '</b><span>média por dia trabalhado</span></div>' +
          '<div><b>' + D.chuva + '</b><span>dias com chuva no RDO</span></div>' +
          '<div' + (D.semRdo ? ' class="alerta"' : '') + '><b>' + D.semRdo + '</b><span>dias úteis sem registro</span></div>' +
        '</div>' +
        '<div class="rit-legenda">' +
          '<span><i class="rit-sw prod"></i>altura e cor = avanço ganho no dia</span>' +
          '<span><i class="rit-sw chuva"></i>chuva</span>' +
          '<span><i class="rit-sw parada"></i>paralisação</span>' +
          '<span><i class="rit-sw falta"></i>dia útil sem registro</span>' +
        '</div>' +
        '<div class="maq-detalhe" id="ritDetalhe">' + ritDetalheHtml() + '</div>' +
      '</div></div>';
  }
  window.ritSelecionar = function (iso) {
    RIT.sel = RIT.sel === iso ? null : iso;
    var box = document.getElementById('ritBox');
    if (!box) return;
    box.querySelectorAll('.iso-hit').forEach(function (h) { h.classList.toggle('on', h.getAttribute('data-d') === RIT.sel); });
    var d = document.getElementById('ritDetalhe');
    if (d) d.innerHTML = ritDetalheHtml();
  };
  window.ritAcao = function (acao) {
    var iso = RIT.sel;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(iso || ''))) return;
    if (acao === 'historico') {
      HIST_FILTRO = Object.assign({}, HIST_FILTRO, { data: iso, busca: '', estaca: '' });
      HIST_LIMITE = HIST_PAGINA;
      HISTORICO_TAB = 'servicos';
      navigate('historico');
    } else if (acao === 'rdo') {
      navigate('rdodiario');
      // a tela é trocada depois do esmaecer; o dia abre quando ela já existe
      setTimeout(function () { if (STATE.currentPage === 'rdodiario' && typeof abrirDiaV4 === 'function') abrirDiaV4(iso); }, 260);
    }
  };

  window.ISO3D = { tom: tom, mistura: mistura, projetor: projetor, bloco: bloco, caminho: caminho };
  window.maqDados = maqDados;
  window.maqueteHtml = maqueteHtml;
  window.ritmoDados = ritmoDados;
  window.ritmoHtml = ritmoHtml;
  window.MAQ = MAQ;
  window.RIT = RIT;
})();
