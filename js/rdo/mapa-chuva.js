/*
 * Sistema de controle de obra — Av. Senador Teotônio Vilela
 * Copyright © 2026 Leonardo Maciel. Todos os direitos reservados.
 *
 * Software proprietário. O código estar visível não autoriza uso, cópia
 * nem obra derivada — ver LICENSE, na raiz do repositório.
 */
/* ====================================================================
   MAPA DE CHUVA
   --------------------------------------------------------------------
   O gráfico circular do mês que acompanha a medição: uma fatia por dia,
   três anéis — Manhã (dentro), Tarde (meio) e Noite (fora) — e cada casa
   numa de quatro cores:

       verde    seco produtivo        azul      chuva produtivo
       amarelo  seco improdutivo      vermelho  chuva improdutivo

   Era pintado à mão no fim do mês, de memória. Agora sai sozinho do RDO:
   QUEM ALIMENTA SÃO OS APONTADORES — o clima que marcaram em cada período
   e as paralisações que lançaram. Não é a estação do INMET: o mapa é o
   registro do canteiro, e a fiscalização o confere contra os RDOs que
   assinou. (A chuva medida continua na tela Dias Improdutivos, como
   contraprova.)

   A regra (`mapaChuvaClassificar`) está escrita DUAS VEZES, letra por
   letra: aqui, que desenha, e no Code.gs, que mantém a aba Mapa_Chuva da
   planilha. tests/mapa-chuva.test.js confere que os dois corpos são o
   mesmo texto — mudou um, mude o outro.
   ==================================================================== */
(function () {
  'use strict';

  function mapaChuvaClassificar(dia) {
    var periodos = [['manha', 'diurno', 360, 720], ['tarde', 'diurno', 720, 1080], ['noite', 'noturno', 1080, 1800]];
    var emMin = function (s) {
      var m = /^(\d{1,2}):(\d{2})/.exec(String(s == null ? '' : s).trim());
      if (!m) return null;
      var h = +m[1], mi = +m[2];
      return (h < 24 && mi < 60) ? h * 60 + mi : null;
    };
    var out = {};
    periodos.forEach(function (per) {
      var nome = per[0], turno = per[1];
      if (!dia || !dia[turno]) { out[nome] = ''; return; }
      var chuva = /garoa|chuv/i.test(String((dia.clima || {})[nome] || ''));
      var paradas = ((dia.paralisacoes || {})[turno] || []).filter(function (x) {
        return x && String(x.motivo || '').trim();
      });
      var tocam = paradas.filter(function (x) {
        var a = emMin(x.inicio), b = emMin(x.fim);
        if (a === null || b === null) return true;
        if (turno === 'noturno' && a < 360) { a += 1440; b += 1440; }
        if (b <= a) b += 1440;
        return a < per[3] && b > per[2];
      });
      var porChuva = chuva || tocam.some(function (x) { return /chuv/i.test(String(x.motivo)); });
      if (tocam.length) out[nome] = porChuva ? 'chuva_improdutivo' : 'seco_improdutivo';
      else out[nome] = chuva ? 'chuva_produtivo' : 'seco_produtivo';
    });
    return out;
  }

  var CATEGORIAS = [
    { id: 'seco_produtivo',    rotulo: 'Seco produtivo',    cor: '#2e8b3a', rgb: [46, 139, 58] },
    { id: 'seco_improdutivo',  rotulo: 'Seco improdutivo',  cor: '#f2c200', rgb: [242, 194, 0] },
    { id: 'chuva_produtivo',   rotulo: 'Chuva produtivo',   cor: '#1f5fbf', rgb: [31, 95, 191] },
    { id: 'chuva_improdutivo', rotulo: 'Chuva improdutivo', cor: '#d32f2f', rgb: [211, 47, 47] }
  ];
  var POR_ID = {};
  CATEGORIAS.forEach(function (c) { POR_ID[c.id] = c; });

  var PERIODOS = [
    { id: 'manha', rotulo: 'Manhã', letra: 'M', horas: '06:00 às 12:00', clima: 'Clima_Manha' },
    { id: 'tarde', rotulo: 'Tarde', letra: 'T', horas: '12:00 às 18:00', clima: 'Clima_Tarde' },
    { id: 'noite', rotulo: 'Noite', letra: 'N', horas: '18:00 às 06:00', clima: 'Clima_Noite' }
  ];

  function campo(linha, nome) {
    return getCSVField(linha, nome) || getCSVField(linha, nome.toLowerCase()) || '';
  }

  /* O dia do mapa a partir da linha do RDO — a MESMA leitura do resto do
     app (`linhaDoDiaRDO`, com as linhas repetidas juntas). */
  function diaDaLinha(linha) {
    if (!linha) return null;
    var pa = paralisacoesDaLinha(linha);
    return {
      diurno: !!String(campo(linha, 'Apontador_Diurno')).trim(),
      noturno: !!String(campo(linha, 'Apontador_Noturno')).trim(),
      clima: { manha: campo(linha, 'Clima_Manha'), tarde: campo(linha, 'Clima_Tarde'),
               noite: campo(linha, 'Clima_Noite') },
      paralisacoes: pa
    };
  }

  /* O mês inteiro: um item por dia do calendário, com a classe de cada
     período ('' quando não houve turno lançado). */
  function mapaChuvaDoMes(mes) {
    var ano = parseInt(String(mes).slice(0, 4), 10), m = parseInt(String(mes).slice(5, 7), 10);
    if (!ano || !m) return [];
    var ultimo = new Date(ano, m, 0).getDate();
    var out = [];
    for (var d = 1; d <= ultimo; d++) {
      var iso = ano + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0');
      var linha = linhaDoDiaRDO(iso);
      var dia = diaDaLinha(linha);
      var cls = dia ? mapaChuvaClassificar(dia) : { manha: '', tarde: '', noite: '' };
      out.push({
        dia: d, iso: iso, cls: cls,
        clima: dia ? dia.clima : {},
        apontadores: linha ? [campo(linha, 'Apontador_Diurno'), campo(linha, 'Apontador_Noturno')]
          .map(function (x) { return String(x || '').trim(); }).filter(Boolean).join(' / ') : ''
      });
    }
    return out;
  }

  function totaisDoMes(dias) {
    var t = { periodos: {}, diasComChuva: 0, diasImprodutivos: 0, diasComRDO: 0 };
    CATEGORIAS.forEach(function (c) { t.periodos[c.id] = 0; });
    dias.forEach(function (x) {
      var vals = PERIODOS.map(function (p) { return x.cls[p.id]; }).filter(Boolean);
      if (vals.length) t.diasComRDO++;
      vals.forEach(function (v) { t.periodos[v]++; });
      if (vals.some(function (v) { return v.indexOf('chuva') === 0; })) t.diasComChuva++;
      if (vals.some(function (v) { return /improdutivo$/.test(v); })) t.diasImprodutivos++;
    });
    return t;
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  /* O desenho, em SVG. Cores FIXAS, fundo branco: é um documento que vai
     impresso para a fiscalização, igual no tema claro e no escuro. */
  function mapaChuvaSVG(mes, dias) {
    var S = 560, c = S / 2;
    var aneis = [[58, 120], [120, 182], [182, 244]];   // M, T, N
    var rRotulo = 258;
    // Uma fatia a mais, no alto e em branco, para as letras dos anéis —
    // como no mapa em papel. Os dias começam logo à direita dela.
    var n = (dias.length || 31) + 1;
    var passo = 2 * Math.PI / n;
    var inicio = -Math.PI / 2 + passo / 2;
    var ponto = function (r, a) {
      return (c + r * Math.cos(a)).toFixed(2) + ' ' + (c + r * Math.sin(a)).toFixed(2);
    };
    var casa = function (r0, r1, a0, a1) {
      return 'M' + ponto(r1, a0) + ' A' + r1 + ' ' + r1 + ' 0 0 1 ' + ponto(r1, a1) +
             ' L' + ponto(r0, a1) + ' A' + r0 + ' ' + r0 + ' 0 0 0 ' + ponto(r0, a0) + ' Z';
    };
    var partes = [];
    dias.forEach(function (x, i) {
      var a0 = inicio + i * passo, a1 = a0 + passo;
      PERIODOS.forEach(function (p, k) {
        var cat = POR_ID[x.cls[p.id]];
        var dica = fmtDia(x.iso) + ' · ' + p.rotulo + ': ' +
          (cat ? cat.rotulo + (x.clima[p.id] ? ' (' + x.clima[p.id] + ')' : '') : 'sem RDO') +
          (x.apontadores ? ' · ' + x.apontadores : '');
        partes.push('<path d="' + casa(aneis[k][0], aneis[k][1], a0, a1) + '" fill="' +
          (cat ? cat.cor : '#ffffff') + '" stroke="#1d1d1d" stroke-width="0.8" data-dia="' + x.iso +
          '" data-periodo="' + p.id + '" data-cat="' + (cat ? cat.id : '') + '"><title>' + esc(dica) + '</title></path>');
      });
      var am = a0 + passo / 2;
      var pr = ponto(rRotulo, am).split(' ');
      partes.push('<text x="' + pr[0] + '" y="' + pr[1] + '" font-size="12" font-weight="700" ' +
        'text-anchor="middle" dominant-baseline="central" fill="#1d1d1d">' + x.dia + '</text>');
    });
    // A fatia das letras: M, T e N, cada uma no seu anel.
    PERIODOS.forEach(function (p, k) {
      partes.push('<path d="' + casa(aneis[k][0], aneis[k][1], inicio - passo, inicio) +
        '" fill="#ffffff" stroke="#1d1d1d" stroke-width="0.8"/>');
      var r = (aneis[k][0] + aneis[k][1]) / 2;
      partes.push('<text x="' + c + '" y="' + (c - r) + '" font-size="12" font-weight="700" ' +
        'text-anchor="middle" dominant-baseline="central" fill="#1d1d1d">' + p.letra + '</text>');
    });
    var ano = String(mes).slice(0, 4), m = String(mes).slice(5, 7);
    partes.push('<circle cx="' + c + '" cy="' + c + '" r="' + (aneis[0][0] - 1) + '" fill="#ffffff" stroke="#1d1d1d" stroke-width="0.8"/>');
    partes.push('<text x="' + c + '" y="' + (c - 9) + '" font-size="10.5" font-weight="700" text-anchor="middle" fill="#1d1d1d">MAPA DE CHUVA</text>');
    partes.push('<text x="' + c + '" y="' + (c + 11) + '" font-size="15" font-weight="700" text-anchor="middle" fill="#1d1d1d">' + m + '/' + ano + '</text>');
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + S + ' ' + S + '" width="' + S + '" height="' + S +
      '" font-family="Arial, Helvetica, sans-serif" role="img" aria-label="Mapa de chuva ' + m + '/' + ano + '">' +
      '<rect width="100%" height="100%" fill="#ffffff"/>' + partes.join('') + '</svg>';
  }

  function fmtDia(iso) {
    var p = String(iso).split('-');
    return p[2] + '/' + p[1];
  }

  function legendaHTML() {
    return '<div class="mapa-chuva-legenda">' + CATEGORIAS.map(function (c) {
      return '<span><i style="background:' + c.cor + '"></i>' + c.rotulo + '</span>';
    }).join('') + '<span><i style="background:#fff"></i>Sem RDO no período</span></div>' +
      '<div class="mapa-chuva-periodos">' + PERIODOS.map(function (p, k) {
        return '<span><b>' + p.letra + '</b> ' + p.rotulo + ' ' + p.horas + ' · anel ' +
          ['de dentro', 'do meio', 'de fora'][k] + '</span>';
      }).join('') + '</div>';
  }

  /* O cartão da tela Dias Improdutivos. */
  function renderMapaChuvaCard(mes, rotuloMes) {
    var dias = mapaChuvaDoMes(mes);
    var t = totaisDoMes(dias);
    return '<div class="card stagger-item" id="mapaChuvaCard">' +
      '<div class="card-header"><div>' +
        '<div class="card-title">Mapa de chuva — ' + esc(rotuloMes) + '</div>' +
        '<div class="card-title-sub">Montado sozinho pelo RDO: clima e paralisações lançados pelos apontadores</div>' +
      '</div>' +
      '<button class="btn btn-primary btn-sm" onclick="baixarMapaChuvaPDF(\'' + esc(mes) + '\')">' + ic('pdf') + ' PDF do mapa</button>' +
      '</div>' +
      '<div class="card-body mapa-chuva-corpo">' +
        '<div class="mapa-chuva-grafico">' + mapaChuvaSVG(mes, dias) + '</div>' +
        '<div class="mapa-chuva-lado">' +
          legendaHTML() +
          '<div class="mapa-chuva-totais">' +
            [['Dias com RDO', t.diasComRDO], ['Dias com chuva', t.diasComChuva], ['Dias com improdutivo', t.diasImprodutivos]]
              .map(function (x) { return '<div><span>' + x[0] + '</span><b>' + x[1] + '</b></div>'; }).join('') +
          '</div>' +
          '<div class="mapa-chuva-nota">A noite só é pintada quando houve turno noturno. Período com paralisação lançada é ' +
            'improdutivo; parada por chuva conta como chuva mesmo com o período marcado seco.</div>' +
        '</div>' +
      '</div></div>';
  }

  /* SVG → PNG, para o PDF. Rasterizar o mesmo desenho da tela garante que
     o papel e a tela não se desmintam. */
  function svgParaPng(svg, px) {
    return new Promise(function (ok, falha) {
      var img = new Image();
      img.onload = function () {
        try {
          var cv = document.createElement('canvas');
          cv.width = cv.height = px;
          var g = cv.getContext('2d');
          g.fillStyle = '#fff'; g.fillRect(0, 0, px, px);
          g.drawImage(img, 0, 0, px, px);
          ok(cv.toDataURL('image/png'));
        } catch (e) { falha(e); }
      };
      img.onerror = function () { falha(new Error('Não foi possível desenhar o mapa.')); };
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    });
  }

  async function gerarMapaChuvaPDF(mes) {
    var dias = mapaChuvaDoMes(mes);
    var t = totaisDoMes(dias);
    var png = await svgParaPng(mapaChuvaSVG(mes, dias), 1400);
    var jsPDF = window.jspdf.jsPDF;
    var doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    var W = 210, M = 14;
    var info = (typeof rdoInfo === 'function' ? rdoInfo() : {}) || {};
    var obra = (typeof OBRA !== 'undefined' && OBRA) ? OBRA : {};
    var mm = String(mes).slice(5, 7), aa = String(mes).slice(0, 4);

    doc.setDrawColor(40); doc.setLineWidth(0.3);
    doc.rect(M, M, W - 2 * M, 30);
    doc.line(M, M + 12, W - M, M + 12);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(15);
    doc.text('MAPA DE CHUVA', W / 2, M + 8.2, { align: 'center' });
    doc.setFontSize(8.5);
    var linha = function (rot, val, x, y) {
      doc.setFont('helvetica', 'bold'); doc.text(rot, x, y);
      var larg = doc.getTextWidth(rot);   // medida em negrito, que é como saiu
      doc.setFont('helvetica', 'normal'); doc.text(String(val || '—'), x + larg + 1.5, y);
    };
    linha('Obra:', obra.nome || obra.nomeCurto || '', M + 3, M + 17.5);
    linha('Contratada:', info.contratada || obra.contratada || '', M + 3, M + 22.5);
    linha('Contrato:', obra.contrato || '', M + 3, M + 27.5);
    linha('Mês de referência:', mm + '/' + aa, W / 2 + 18, M + 22.5);
    linha('Local:', obra.local || '', W / 2 + 18, M + 27.5);

    var lado = 150, x0 = (W - lado) / 2, y0 = M + 36;
    // 'FAST' comprime: sem ele a imagem entra crua e o PDF passa de 10 MB.
    doc.addImage(png, 'PNG', x0, y0, lado, lado, undefined, 'FAST');

    var y = y0 + lado + 6;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
    doc.text('LEGENDA', M, y);
    doc.text('PERÍODO', W / 2 + 18, y);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5);
    CATEGORIAS.forEach(function (c, i) {
      var yy = y + 5 + i * 6;
      doc.setFillColor(c.rgb[0], c.rgb[1], c.rgb[2]);
      doc.rect(M, yy - 3.2, 9, 4, 'FD');
      doc.text(c.rotulo + '  (' + t.periodos[c.id] + ' período' + (t.periodos[c.id] === 1 ? '' : 's') + ')', M + 12, yy);
    });
    PERIODOS.forEach(function (p, i) {
      var yy = y + 5 + i * 6;
      doc.setFont('helvetica', 'bold'); doc.text(p.letra + ' - ' + p.rotulo, W / 2 + 18, yy);
      doc.setFont('helvetica', 'normal'); doc.text(p.horas, W / 2 + 45, yy);
    });
    doc.setFillColor(255, 255, 255);
    doc.rect(M, y + 5 + 4 * 6 - 3.2, 9, 4, 'FD');
    doc.text('Sem RDO no período', M + 12, y + 5 + 4 * 6);

    y += 38;
    doc.setFontSize(8.5);
    doc.text('Dias com RDO: ' + t.diasComRDO + '   ·   Dias com chuva: ' + t.diasComChuva +
             '   ·   Dias com período improdutivo: ' + t.diasImprodutivos, M, y);
    doc.setFontSize(7); doc.setTextColor(110);
    doc.text(doc.splitTextToSize('Fonte: RDO diário — clima de cada período e paralisações lançados pelos apontadores. ' +
      'Gerado em ' + new Date().toLocaleString('pt-BR') + '.', W - 2 * M), M, y + 5);
    doc.setTextColor(0);

    // Assinaturas: contratada e fiscalização, como no RDO.
    var ya = 281;
    doc.setDrawColor(60);
    doc.line(M + 6, ya, M + 76, ya);
    doc.line(W - M - 76, ya, W - M - 6, ya);
    doc.setFontSize(8);
    doc.text('Contratada', M + 41, ya + 4, { align: 'center' });
    doc.text('Fiscalização', W - M - 41, ya + 4, { align: 'center' });

    doc.save('mapa-de-chuva-' + (obra.id || 'obra') + '-' + mes + '.pdf');
  }

  window.mapaChuvaClassificar = mapaChuvaClassificar;
  window.mapaChuvaDoMes = mapaChuvaDoMes;
  window.mapaChuvaSVG = mapaChuvaSVG;
  window.renderMapaChuvaCard = renderMapaChuvaCard;
  window.MAPA_CHUVA_CATEGORIAS = CATEGORIAS;
  window.baixarMapaChuvaPDF = function (mes) {
    return comLib('pdf', function () {
      return gerarMapaChuvaPDF(mes).catch(function (e) {
        toast('Não foi possível gerar o PDF do mapa: ' + (e && e.message ? e.message : e), 'error', 6000);
      });
    }, 'o PDF do mapa de chuva');
  };
})();
