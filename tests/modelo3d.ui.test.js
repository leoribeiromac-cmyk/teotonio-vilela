// O MODELO 3D AMARRADO AO RDO — o app de verdade com o visor de verdade.
//
// A tela "Modelo 3D" põe a avenida em 3D (modelo3d.html, num iframe) e pinta
// cada estaca com o que foi lançado nela. O que este teste segura:
//
//  · a ESTACA é a mesma conta dos dois lados: o trecho "E210 a E215 (BC)" vira
//    seis faixas na pista PD, e o filtro de frente/dia muda o que o 3D mostra;
//  · o caminho de volta: a estaca tocada no 3D abre os lançamentos dela, e o
//    "Lançar serviço aqui" chega ao formulário com a estaca preenchida SEM
//    apagar o serviço que o apontador já tinha no rascunho;
//  · mensagem que não vem do próprio iframe é ignorada;
//  · a carga de fundo NÃO recarrega o iframe (o modelo inteiro de novo, e a
//    câmera de volta ao início) — só manda os dados novos;
//  · Histórico e Galeria filtram pela LEITURA da estaca (o trecho E210–E215
//    passa pela E212), e a busca acha a estaca no 3D sem roubar o Enter;
//  · a LINHA DO TEMPO (4D) mostra o que existia até a data, anda sozinha mês a
//    mês, conta a recência a partir da data da linha e para ao sair da tela;
//  · a ETAPA da pista é a mais alta lançada na estaca, e vai para o 3D;
//  · estaca com FOTO ganha pino no 3D, e a estaca aberta mostra a miniatura
//    da Galeria — no app e no painel do 3D, que recebe a imagem, não o id;
//  · guardado pelo botão Offline, o modelo abre sem sinal;
//  · obra sem modelo não mostra a tela.
//
// Como rodar:  node tests/modelo3d.ui.test.js   (pede o servidor da 8099; o
// harness sobe sozinho). É lento: o WebGL aqui é por software.
const H = require('./harness.js');

let falhas = 0;
const ok = (nome, cond, extra) => {
  if (cond) console.log('  ✓ ' + nome);
  else { falhas++; console.log('  ✗ ' + nome + (extra !== undefined ? '  → ' + extra : '')); }
};

const DIA = '2025-03-10';
function rdoCsv() {
  const head = ['id', 'Data', 'Pacote_ID', 'Quantidade', 'Local_Estaca', 'Equipe', 'Apontador',
    'Turno', 'Observações', 'foto_link', 'usuario', 'timestamp', 'obra'];
  const rows = [head];
  // no gerador do harness (FRENTES[i % 6]) o P01 é Drenagem e o P02, Terraplanagem
  rows.push(['t1', DIA, 'P01', '12,5', 'E210 a E215 (BC)', 'Equipe A', 'Wallace', 'Diurno', '', 'drive_id:fotoTrecho', 'Wallace', DIA + 'T12:00:00Z', 'teotonio']);
  rows.push(['t2', DIA, 'P02', '40', 'E120 (CB)', 'Equipe B', 'Guilherme', 'Diurno', '', '', 'Guilherme', DIA + 'T12:00:00Z', 'teotonio']);
  rows.push(['t3', '2025-03-11', 'P02', '30', 'E212 (BC)', 'Equipe B', 'Guilherme', 'Diurno', '', '', 'Guilherme', '2025-03-11T12:00:00Z', 'teotonio']);
  rows.push(['t4', '2025-03-12', 'OUTRO', '1', 'E213 (BC)', 'Equipe C', 'Leonardo', 'Diurno', '', '', 'Leonardo', '2025-03-12T12:00:00Z', 'teotonio']);
  for (let i = 0; i < 60; i++) {
    const iso = new Date(Date.UTC(2025, 0, 6) + i * 86400000).toISOString().slice(0, 10);
    rows.push(['g' + i, iso, 'P' + String((i % 6) + 1).padStart(2, '0'), '5', 'E' + (225 + (i % 15)) + ' (BC)', 'Equipe', 'Wallace', 'Diurno', '', '', 'Wallace', iso + 'T12:00:00Z', 'teotonio']);
  }
  return H.csv(rows);
}

// 1×1 px: o que o "Drive" devolve de miniatura
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const pedidosFoto = [];
function gas(acao, params) {
  if (acao === 'obterFoto') { pedidosFoto.push(params.fileId + (params.mini ? ':mini' : '')); return { ok: true, mini: true, dataUri: PNG }; }
  if (acao === 'usuariosNomes') return { ok: true, usuarios: ['Leonardo', 'Wallace', 'Guilherme'] };
  if (acao === 'login') return { ok: true, usuario: params.usuario, perfil: 'admin', token: 'tok-falso', obras: '*' };
  return { ok: true };
}

(async () => {
  const s = await H.abrir({ logar: { usuario: 'Leonardo', perfil: 'admin' }, rdo: rdoCsv(), webgl: true, gas });
  ok('o app carregou', s.carregou);
  // o modo Leve: o Alta (texturas, árvores ez-tree) só atrasaria o WebGL por software
  await s.p.evaluate(() => localStorage.setItem('tv3d_qualidade', 'leve'));

  console.log('\n── a tela e o menu ──');
  ok('o menu tem "Modelo 3D"', await s.p.evaluate(() => !!document.querySelector('.nav-item[data-page="modelo3d"]')));
  await s.ir('modelo3d');
  await s.p.waitForFunction(() => !!document.getElementById('m3dFrame'), null, { timeout: 10000 }).catch(() => {});
  ok('a tela traz o iframe do visor', await s.p.evaluate(() => /modelo3d\.html\?obra=teotonio/.test((document.getElementById('m3dFrame') || {}).src || '')));
  await s.p.waitForFunction(() => M3D.pronto === true, null, { timeout: 120000 }).catch(() => {});
  ok('o visor avisou que está pronto', await s.p.evaluate(() => M3D.pronto === true));
  const fr = s.p.frames().find(f => /modelo3d\.html/.test(f.url()));
  ok('o frame do visor existe', !!fr);
  // O headless só produz quadro quando alguém pede um (no iframe, o requestAnimationFrame
  // fica parado): a captura de tela é o que faz a câmera voar, quadro a quadro.
  const bombear = async cond => { for (let i = 0; i < 40; i++) { if (await fr.evaluate(cond)) return true; await s.p.screenshot(); await s.p.waitForTimeout(100); } return false; };
  await fr.waitForFunction(() => window.__allTiles === true, null, { timeout: 240000 }).catch(() => {});
  const tiles = await fr.evaluate(() => window.__tiles());
  ok('os 8 trechos compactados (.bin) abriram', tiles.length === 8 && tiles.every(t => t.st === 'ok'), JSON.stringify(tiles));
  await fr.evaluate(() => { window.__marca = 'mesmo-iframe'; });

  console.log('\n── a estaca é a mesma conta dos dois lados ──');
  await fr.waitForFunction(() => window.__rdo && window.__rdo.n > 0, null, { timeout: 30000 }).catch(() => {});
  const app = await s.p.evaluate(() => ({ faixas: _m3dUltimo.faixas.map(f => f.chave + '|' + f.eixo), n: _m3dUltimo.faixas.length }));
  ok('o trecho "E210 a E215 (BC)" virou seis faixas na PD',
     [210, 211, 212, 213, 214, 215].every(n => app.faixas.includes('BC:' + n + '|PD')), JSON.stringify(app.faixas.slice(0, 12)));
  ok('a E120 do Centro→Bairro está na PE', app.faixas.includes('CB:120|PE'));
  ok('serviço avulso (OUTRO) não conta na estaca', await s.p.evaluate(() => _m3dUltimo.est.get('BC:213').linhas.length) === 1);
  ok('o visor desenhou as mesmas faixas que o app mandou', await fr.evaluate(() => window.__rdo.n) === app.n,
     (await fr.evaluate(() => window.__rdo.n)) + ' × ' + app.n);

  await s.p.evaluate(() => m3dFiltro('frente', 'Drenagem'));
  await fr.waitForTimeout(600);
  const dren = await s.p.evaluate(() => _m3dUltimo.faixas.map(f => f.chave));
  ok('filtrar por Drenagem deixa só as estacas de drenagem', dren.includes('BC:212') && !dren.includes('CB:120'), JSON.stringify(dren));
  await fr.waitForFunction(n => window.__rdo.n === n, dren.length, { timeout: 15000 }).catch(() => {});
  ok('…e o visor acompanha', await fr.evaluate(() => window.__rdo.n) === dren.length);
  ok('drenagem filtrada deixa a superfície transparente no 3D', await fr.evaluate(() => document.getElementById('opac').value) === '30');
  await s.p.evaluate(() => m3dFiltro('frente', ''));
  await fr.waitForTimeout(400);
  ok('tirar o filtro devolve a superfície', await fr.evaluate(() => document.getElementById('opac').value) === '100');

  await s.p.evaluate(d => m3dAbrirDia(d), DIA);
  await fr.waitForTimeout(500);
  const doDia = await s.p.evaluate(() => _m3dUltimo.faixas.map(f => f.chave).sort());
  ok('"Ver o dia no 3D" mostra só o que foi lançado naquele dia', doDia.length === 7 && doDia.includes('CB:120') && !doDia.includes('BC:225'), JSON.stringify(doDia));
  await s.p.evaluate(() => m3dFiltro('periodo', 'tudo'));

  console.log('\n── linha do tempo (4D) ──');
  await s.p.evaluate(() => m3dFiltro('periodo', 'linha'));
  await s.p.waitForTimeout(300);
  const lt = await s.p.evaluate(() => ({ ate: M3D.ate, barra: !document.getElementById('m3dTempo').hidden,
    max: +(document.getElementById('m3dTempoR') || {}).max, n: _m3dUltimo.faixas.length,
    dentro: document.getElementById('m3dVisor').contains(document.getElementById('m3dTempo')) }));
  ok('a linha do tempo abre no último dia lançado, com a barra embaixo do 3D', lt.ate === '2025-03-11' && lt.barra, JSON.stringify(lt));
  ok('…dentro da caixa do visor (vai junto na tela cheia)', lt.dentro);
  ok('…e vai do primeiro lançamento (06/01) ao último (11/03)', lt.max === 64, lt.max);
  ok('no último dia, a linha mostra a obra inteira', lt.n === app.n, lt.n + ' × ' + app.n);
  const arrastar = v => s.p.evaluate(v => { const r = document.getElementById('m3dTempoR'); r.value = v; r.dispatchEvent(new Event('input')); }, v);
  await arrastar(4);
  await s.p.waitForTimeout(400);
  const cedo = await s.p.evaluate(() => ({ ate: M3D.ate, fx: _m3dUltimo.faixas.map(f => f.chave).sort().join() }));
  ok('arrastar a linha até 10/01 mostra só o que existia até ali', cedo.ate === '2025-01-10' && cedo.fx === 'BC:225,BC:226,BC:227,BC:228,BC:229', JSON.stringify(cedo));
  await fr.waitForFunction(() => window.__rdo.n === 5, null, { timeout: 15000 }).catch(() => {});
  ok('…e o visor acompanha', await fr.evaluate(() => window.__rdo.n) === 5);
  const carimbo = await fr.evaluate(() => ({ vis: !document.getElementById('carimbo').hidden, t: document.getElementById('carimboT').textContent }));
  ok('o 3D mostra a data da linha no alto', carimbo.vis && /10\/01\/2025/.test(carimbo.t), JSON.stringify(carimbo));
  await s.p.evaluate(() => m3dFiltro('cor', 'recencia'));
  await arrastar(12);
  await s.p.waitForTimeout(400);
  const rec = await s.p.evaluate(() => [M3D.ate, _m3dUltimo.est.get('BC:237').cor, _m3dUltimo.est.get('BC:225').cor].join('|'));
  ok('na linha do tempo a recência conta da data da linha, não de hoje', rec === '2025-01-18|#e0452a|#f08a24', rec);
  const cache = await fr.evaluate(() => window.__rdo.cacheFaixas);
  await arrastar(4); await s.p.waitForTimeout(300); await arrastar(12); await s.p.waitForTimeout(400);
  ok('voltar e avançar a linha reaproveita a geometria das faixas (não refaz)', await fr.evaluate(() => window.__rdo.cacheFaixas) === cache, cache);
  // a estaca aberta acompanha a data: a E225 tem um lançamento em 06/01 e outro em 21/01
  const lancNoPainel = () => fr.evaluate(() => { const dl = document.getElementById('infoDl'); const dt = [...dl.querySelectorAll('dt')].find(x => x.textContent === 'Lançamentos');
    return document.getElementById('info').hidden ? 'oculto' : (dt ? dt.nextElementSibling.textContent : '?'); });
  await s.p.evaluate(() => m3dSelecionar('BC:225'));
  await fr.waitForFunction(() => window.__rdo.aberta === 'BC:225', null, { timeout: 5000 }).catch(() => {});
  const antes = await lancNoPainel();
  await arrastar(25);
  await s.p.waitForFunction(() => M3D.ate === '2025-01-31' && _m3dUltimo.est.get('BC:225').linhas.length === 2, null, { timeout: 5000 }).catch(() => {});
  await fr.waitForFunction(() => /Lançamentos2/.test(document.getElementById('infoDl').textContent), null, { timeout: 5000 }).catch(() => {});
  const depois = await lancNoPainel();
  ok('o painel da estaca aberta no 3D acompanha a linha do tempo', antes === '1' && depois === '2', antes + ' → ' + depois);
  await s.p.evaluate(() => { m3dFiltro('passo', 'mes'); M3D.ate = '2025-03-11'; m3dTocar(); });
  const tocou = await s.p.evaluate(() => ({ tocando: !!M3D.tocando, ate: M3D.ate, botao: document.getElementById('m3dPlay').textContent.trim() }));
  ok('o ▶ no fim da linha recomeça do primeiro dia', tocou.tocando && tocou.ate === '2025-01-06' && /Pausar/.test(tocou.botao), JSON.stringify(tocou));
  await s.p.waitForFunction(() => !M3D.tocando, null, { timeout: 10000 }).catch(() => {});
  const parou = await s.p.evaluate(() => ({ tocando: !!M3D.tocando, ate: M3D.ate, n: _m3dUltimo.faixas.length }));
  ok('…anda mês a mês e para no último dia, com a obra inteira', !parou.tocando && parou.ate === '2025-03-11' && parou.n === app.n, JSON.stringify(parou));
  await s.p.evaluate(() => { m3dFiltro('cor', 'frente'); m3dFiltro('periodo', 'tudo'); });
  await s.p.waitForTimeout(300);
  ok('fora da linha do tempo a barra e a data do 3D somem', await s.p.evaluate(() => document.getElementById('m3dTempo').hidden) &&
     await fr.evaluate(() => document.getElementById('carimbo').hidden));

  console.log('\n── etapa da pista ──');
  await s.p.evaluate(() => m3dFiltro('cor', 'etapa'));
  await s.p.waitForTimeout(300);
  const et = await s.p.evaluate(() => {
    const g = k => _m3dUltimo.est.get(k), fx = _m3dUltimo.faixas.find(f => f.chave === 'BC:212');
    return { e212: g('BC:212').etapa, c212: fx.cor, e120: g('CB:120').etapa, c120: g('CB:120').cor,
      linha: (fx.rows.find(r => r[0] === 'Etapa') || [])[1], leg: document.getElementById('m3dLegenda').textContent };
  });
  ok('a estaca fica na etapa MAIS ALTA lançada nela (redes, sobre a terraplenagem)', et.e212 === 2 && et.c212 === '#4f8fd6', JSON.stringify(et));
  ok('a E120, só com terraplenagem, fica na terraplenagem', et.e120 === 1 && et.c120 === '#b98a4e', JSON.stringify(et));
  ok('a ficha da estaca no 3D diz a etapa', et.linha === 'Drenagem e redes', et.linha);
  ok('a legenda conta as estacas por etapa', /Drenagem e redes/.test(et.leg) && /Terraplenagem/.test(et.leg), et.leg.slice(0, 160));
  await s.p.evaluate(() => m3dSelecionar('BC:212'));
  await s.p.waitForTimeout(300);
  const esc = await s.p.evaluate(() => ({ feitas: document.querySelectorAll('#m3dDetalhe .m3d-etapas span.on').length,
    total: document.querySelectorAll('#m3dDetalhe .m3d-etapas span').length, tit: (document.querySelector('#m3dDetalhe .m3d-etapas-tit') || {}).textContent }));
  // no cadastro do harness os pacotes são "Serviço N": a etapa vem da frente — Drenagem, Terraplanagem e Sinalização
  ok('a estaca aberta mostra a escada SÓ com as etapas que a obra tem: duas feitas, das três', esc.feitas === 2 && esc.total === 3 && /Drenagem e redes/.test(esc.tit || ''), JSON.stringify(esc));
  const vol = await s.p.evaluate(() => { m3dFiltro('cor', 'qtd'); const D = _m3dUltimo, menor = D.lista.find(a => a.linhas.length === D.minN);
    return { minN: D.minN, maxN: D.maxN, cor: menor && menor.cor, base: m3dCorQtd(0), leg: document.getElementById('m3dLegenda').textContent }; });
  ok('o Volume vai do menor ao maior do filtro (não de 1), e a legenda diz isso', vol.minN > 0 && vol.cor === vol.base && vol.leg.indexOf(String(vol.minN)) >= 0, JSON.stringify(vol));
  const mesma = await s.p.evaluate(() => { const el = document.querySelector('#m3dLista .m3d-lista'); el.scrollTop = 40; m3dSincronizar(); const el2 = document.querySelector('#m3dLista .m3d-lista'); return { mesma: el === el2, rol: el2.scrollTop }; });
  ok('sincronizar sem mudança não refaz a lista (nem perde a rolagem dela)', mesma.mesma, JSON.stringify(mesma));
  await s.p.evaluate(() => m3dFiltro('cor', 'frente'));

  console.log('\n── fotos no 3D ──');
  await fr.waitForFunction(() => window.__rdo.pinos.length >= 6, null, { timeout: 15000 }).catch(() => {});
  const pinos = await fr.evaluate(() => window.__rdo.pinos);
  ok('estaca com foto ganha o pino de câmera (a foto do trecho E210–E215)',
     [210, 211, 212, 213, 214, 215].every(n => pinos.includes('BC:' + n)) && !pinos.includes('CB:120'), JSON.stringify(pinos));
  await bombear(() => !window.__rdo.voando);
  const pxPerto = await fr.evaluate(() => window.__rdo.pinoPx('BC:212'));
  await fr.evaluate(() => window.__goto([700, -1400, 900], [700, 200, 0]));   // de longe, a avenida inteira
  const pxLonge = await fr.evaluate(() => window.__rdo.pinoPx('BC:212'));
  ok('o pino tem tamanho de verdade: legível de perto, some na vista geral', pxPerto >= 20 && pxLonge < 8, JSON.stringify({ pxPerto, pxLonge }));
  await s.p.evaluate(() => m3dSelecionar('BC:212'));
  await bombear(() => !window.__rdo.voando);
  await s.p.waitForFunction(() => document.querySelectorAll('#m3dFotos img').length > 0, null, { timeout: 10000 }).catch(() => {});
  ok('a estaca aberta mostra a miniatura no app', await s.p.evaluate(() => document.querySelectorAll('#m3dFotos img').length) === 1);
  ok('…pedida como MINIATURA, como na Galeria', pedidosFoto.includes('fotoTrecho:mini'), JSON.stringify(pedidosFoto));
  await fr.waitForFunction(() => document.querySelectorAll('#infoFotos img').length > 0, null, { timeout: 10000 }).catch(() => {});
  ok('…e no painel da estaca, dentro do 3D', await fr.evaluate(() => document.querySelectorAll('#infoFotos img').length) === 1);
  ok('o visor recebe a imagem, não o id do Drive', await fr.evaluate(() => !document.getElementById('info').innerHTML.includes('fotoTrecho')));
  await fr.click('#infoFotos button');
  await s.p.waitForFunction(() => !!document.getElementById('fotoAmp'), null, { timeout: 5000 }).catch(() => {});
  ok('tocar a miniatura no 3D abre a foto no app', await s.p.evaluate(() => !!document.getElementById('fotoAmp')));
  ok('o "Baixar" do ampliador aparece sobre o fundo escuro (texto branco)', await s.p.evaluate(() => {
    const b = document.querySelector('.foto-amp-acoes .btn-outline'); return b ? getComputedStyle(b).color : null; }) === 'rgb(255, 255, 255)');
  await s.p.evaluate(() => { const j = document.getElementById('fotoAmp'); if (j) j.parentElement.remove(); });
  // o pino DE VERDADE: só a camada de fotos à vista, e um clique em cima dele
  await fr.waitForFunction(() => !window.__rdo.voando, null, { timeout: 5000 }).catch(() => {});
  await fr.evaluate(() => { document.getElementById('info').hidden = true; for (const g of ['est', 'ilus', 'siv', 'ilu', 'pai', 'edi', 'rdo']) window.__dbg.GRP[g].visible = false; window.__invalidar(3); });
  await s.p.screenshot();
  await s.p.evaluate(() => { M3D.sel = null; });
  const pp = await fr.evaluate(() => window.__rdo.pino('BC:212'));
  const cx = await (await s.p.$('#m3dFrame')).boundingBox();
  if (pp) await s.p.mouse.click(cx.x + pp[0], cx.y + pp[1]);
  await s.p.waitForTimeout(800);
  ok('clicar o pino da foto no 3D abre a estaca', await s.p.evaluate(() => M3D.sel) === 'BC:212', JSON.stringify(pp));
  await fr.evaluate(() => { for (const g of ['est', 'ilus', 'siv', 'ilu', 'pai', 'edi', 'rdo']) window.__dbg.GRP[g].visible = true; window.__invalidar(3); });

  console.log('\n── do 3D para o app ──');
  await s.p.evaluate(() => window.postMessage({ m3d: 1, tipo: 'acao', acao: 'lancar', chave: 'BC:212' }, location.origin));
  await s.p.waitForTimeout(400);
  ok('mensagem que não vem do iframe é ignorada', await s.p.evaluate(() => STATE.currentPage) === 'modelo3d');

  await fr.evaluate(() => window.parent.postMessage({ m3d: 1, tipo: 'estaca', chave: 'BC:212' }, location.origin));
  await s.p.waitForTimeout(500);
  const det = await s.p.evaluate(() => ({ sel: M3D.sel, txt: (document.getElementById('m3dDetalhe') || {}).textContent || '' }));
  ok('tocar a estaca no 3D abre a estaca no app', det.sel === 'BC:212' && /Estaca E212/.test(det.txt), det.sel);
  ok('…com os lançamentos dela (o trecho e o da própria estaca)', /Serviço 2/.test(det.txt) && /Serviço 1/.test(det.txt), det.txt.slice(0, 200));

  // o clique DE VERDADE no 3D: leva a câmera até a estaca, tira da frente o que
  // pode tapar a faixa (rótulos de estaca, carros, postes) e clica no meio dela
  // O headless só produz quadro quando alguém pede um (no iframe, o
  // requestAnimationFrame fica parado): a captura de tela é o que faz a câmera
  // voar até a estaca, quadro a quadro.
  await s.p.evaluate(() => m3dSelecionar('BC:225'));
  await fr.waitForTimeout(300);
  ok('a câmera voa até a estaca pedida pelo app', await bombear(() => !window.__rdo.voando && window.__rdo.sel === 'BC:225'));
  await fr.evaluate(() => { document.getElementById('info').hidden = true; for (const g of ['est', 'ilus', 'siv', 'ilu', 'pai', 'edi']) window.__dbg.GRP[g].visible = false; window.__invalidar(3); });
  await bombear(() => true); await s.p.screenshot();
  await s.p.evaluate(() => { M3D.sel = null; });
  const pt = await fr.evaluate(() => window.__rdo.ponto('BC:225'));
  const caixa = await (await s.p.$('#m3dFrame')).boundingBox();
  if (pt) await s.p.mouse.click(caixa.x + pt[0], caixa.y + pt[1]);
  await s.p.waitForTimeout(800);
  const tocada = await s.p.evaluate(() => M3D.sel);
  ok('clicar a faixa no 3D seleciona a estaca no app', tocada === 'BC:225', tocada + ' em ' + JSON.stringify(pt));
  await fr.evaluate(() => { for (const g of ['est', 'ilus', 'siv', 'ilu', 'pai', 'edi']) window.__dbg.GRP[g].visible = true; window.__invalidar(3); });

  console.log('\n── a carga de fundo não recarrega o modelo ──');
  await s.p.evaluate(async () => { _textosCarga = { obra: 'forcar', textos: {} }; await carregarTudo({ fundo: true }); });
  await s.p.waitForTimeout(800);
  ok('o iframe é o mesmo depois do refresh de 5 em 5 min', await fr.evaluate(() => window.__marca) === 'mesmo-iframe');
  ok('…e continua recebendo dados', await s.p.evaluate(() => M3D.pronto === true));
  // o ⟳ do cabeçalho (carga que não é de fundo) também não: quem pede dados novos não pediu o modelo de novo
  await s.p.evaluate(async () => { _textosCarga = { obra: 'forcar', textos: {} }; await carregarTudo(); });
  await s.p.waitForTimeout(800);
  ok('o ⟳ do cabeçalho (atualizar à mão) também não recarrega o modelo', await fr.evaluate(() => window.__marca) === 'mesmo-iframe');

  console.log('\n── o visor leve ──');
  const vis = await fr.evaluate(() => ({ cons: window.__consolidados, auto: window.__dbg.renderer.shadowMap.autoUpdate, q: window.__rdo.quadro(),
    alfa: window.__dbg.GRP.rdo.children.find(o => o.geometry && o.geometry.attributes.color).geometry.attributes.color.itemSize }));
  ok('placas, semáforos, tubos e abrigos viram poucas malhas por material', vis.cons && vis.cons.pecas > 100, JSON.stringify(vis.cons));
  ok('um quadro do modo Leve fica abaixo de 1.000 chamadas de desenho (eram 3.351)', vis.q.chamadas < 1000, JSON.stringify(vis.q));
  ok('a sombra não é refeita a cada quadro', vis.auto === false);
  ok('a faixa tem borda cheia e miolo translúcido (cor com alfa por vértice)', vis.alfa === 4, vis.alfa);
  // a busca do visor acha a peça que foi juntada às outras e voa até ela
  await fr.evaluate(() => { const q = document.getElementById('sQ'); q.value = 'coluna semaforica'; q.dispatchEvent(new Event('input')); });
  await fr.waitForTimeout(300);
  const achou = await fr.evaluate(() => { const b = document.querySelector('#results button'); if (!b) return null; b.click(); return b.textContent; });
  await fr.waitForTimeout(300);
  const focou = await fr.evaluate(() => ({ voando: window.__rdo.voando, t: document.getElementById('infoT').textContent, aberto: !document.getElementById('info').hidden }));
  ok('a busca do visor acha a peça juntada e abre a ficha dela', !!achou && focou.aberto && /Coluna semaf/.test(focou.t), JSON.stringify({ achou, focou }));
  await fr.evaluate(() => { document.getElementById('info').hidden = true; });
  // a sombra só volta a ser desenhada quando o enquadramento dela anda
  const sombra = await fr.evaluate(() => { const { renderer, controls, updSun } = window.__dbg; updSun(); renderer.shadowMap.needsUpdate = false;
    controls.target.x += 3; updSun(); const perto = renderer.shadowMap.needsUpdate;
    controls.target.x += 60; updSun(); const longe = renderer.shadowMap.needsUpdate; controls.target.x -= 63; updSun(true); return { perto, longe }; });
  ok('andar 3 m não refaz a sombra; andar 60 m refaz', sombra.perto === false && sombra.longe === true, JSON.stringify(sombra));

  console.log('\n── lançar na estaca, sem apagar o rascunho ──');
  await s.p.evaluate(() => {
    STATE.draft = defaultDraft();
    Object.assign(STATE.draft.servicos[0], { frente: 'Drenagem', pacoteId: 'P01', sentido: 'BC', estacaIni: 'E200', estacaFim: 'E201', quantidade: '3' });
    saveDraft(STATE.draft);
  });
  await s.p.evaluate(() => { m3dFiltro('passo', 'dia'); M3D.ate = '2025-01-06'; m3dTocar(); });
  await fr.evaluate(() => window.parent.postMessage({ m3d: 1, tipo: 'acao', acao: 'lancar', chave: 'BC:212' }, location.origin));
  await s.p.waitForTimeout(900);
  ok('a linha do tempo tocando para sozinha quando se sai da tela', await s.p.evaluate(() => M3D.tocando === 0));
  await s.p.evaluate(() => m3dFiltro('periodo', 'tudo'));
  const lanc = await s.p.evaluate(() => ({ tela: STATE.currentPage, sv: STATE.draft.servicos.map(x => [x.pacoteId, x.sentido, x.estacaIni, x.estacaFim, x.quantidade]) }));
  ok('"Lançar serviço aqui" abre o Lançar Serviço', lanc.tela === 'rdo', lanc.tela);
  ok('o serviço que já estava no rascunho ficou intacto', JSON.stringify(lanc.sv[0]) === JSON.stringify(['P01', 'BC', 'E200', 'E201', '3']), JSON.stringify(lanc.sv));
  ok('a estaca tocada entrou num serviço novo', lanc.sv.length === 2 && lanc.sv[1][1] === 'BC' && lanc.sv[1][2] === 'E212' && lanc.sv[1][3] === 'E212', JSON.stringify(lanc.sv));
  ok('e o campo na tela mostra a estaca', await s.p.evaluate(() => {
    const el = document.querySelector('[data-svc="1"][data-field="estacaIni"]'); return el ? el.value : null; }) === 'E212');
  await s.p.waitForFunction(() => { const el = document.querySelector('[data-svc="1"][data-field="estacaIni"]'); if (!el) return false; const r = el.getBoundingClientRect();
    return r.top >= 0 && r.bottom <= innerHeight && el.classList.contains('m3d-destaque'); }, null, { timeout: 4000 }).catch(() => {});
  const desceu = await s.p.evaluate(() => { const el = document.querySelector('[data-svc="1"][data-field="estacaIni"]'); const r = el.getBoundingClientRect();
    return { visivel: r.top >= 0 && r.bottom <= innerHeight, marcado: el.classList.contains('m3d-destaque') }; });
  ok('…e a tela desce até o campo da estaca e o marca', desceu.visivel && desceu.marcado, JSON.stringify(desceu));
  await s.p.evaluate(() => { STATE.draft = defaultDraft(); saveDraft(STATE.draft); });

  console.log('\n── Histórico, Galeria e busca pela estaca ──');
  await s.p.evaluate(() => m3dAcao('historico', 'BC:212'));
  await s.p.waitForTimeout(700);
  const hist = await s.p.evaluate(() => ({ tela: STATE.currentPage, filtro: HIST_FILTRO.estaca,
    ids: [...document.querySelectorAll('table.t tbody tr td.t-mono[data-rot="ID"]')].map(td => td.textContent.trim()) }));
  ok('"Ver lançamentos" leva ao Histórico filtrado pela estaca', hist.tela === 'historico' && hist.filtro === 'BC:212');
  ok('o trecho que passa pela E212 aparece, e o resto não', hist.ids.includes('t1') && hist.ids.includes('t3') && !hist.ids.includes('t2'), JSON.stringify(hist.ids));
  ok('a estaca do Histórico leva de volta ao 3D', await s.p.evaluate(() => !!document.querySelector('button.m3d-txt')));
  await s.p.evaluate(() => limparHistFiltro());

  const gal = await s.p.evaluate(() => { GAL_FILTRO.estaca = 'E212 (BC)'; const n = galeriaFiltrada().map(f => f.id); GAL_FILTRO.estaca = ''; return n; });
  ok('a Galeria acha a foto do trecho E210–E215 pela E212', gal.includes('t1'), JSON.stringify(gal));
  const galTxt = await s.p.evaluate(() => { GAL_FILTRO.estaca = 'E21'; const n = galeriaFiltrada().length; GAL_FILTRO.estaca = ''; return n; });
  ok('texto que não é estaca continua casando pelo texto', galTxt === 1, galTxt);

  await s.p.evaluate(() => { buscaAbrir(); buscaDigitou('E212'); });
  await s.p.waitForTimeout(250);
  const busca = await s.p.evaluate(() => ({ grupos: BUSCA.itens.map(i => i.grupo), primeiro: (BUSCA.itens[0] || {}).grupo }));
  ok('a busca acha a estaca no Modelo 3D', busca.grupos.includes('Modelo 3D'), JSON.stringify(busca.grupos));
  ok('…sem tirar do Histórico o primeiro lugar (o Enter)', busca.primeiro === 'Serviços lançados', busca.primeiro);
  await s.p.evaluate(() => buscaFechar());

  console.log('\n── sem sinal ──');
  const temSW = await s.p.evaluate(async () => { try { await navigator.serviceWorker.ready; return !!navigator.serviceWorker.controller; } catch (e) { return false; } });
  if (!temSW) { await s.p.reload({ waitUntil: 'load' }); await s.p.waitForFunction(() => typeof STATE !== 'undefined' && STATE.loaded, null, { timeout: 60000 }).catch(() => {}); }
  ok('o service worker controla a página', await s.p.evaluate(() => !!navigator.serviceWorker.controller));
  await s.ir('modelo3d');
  await s.p.waitForFunction(() => M3D.pronto === true, null, { timeout: 120000 }).catch(() => {});
  await s.p.evaluate(() => m3dGuardarOffline());
  await s.p.waitForFunction(() => !M3D.guardando, null, { timeout: 120000 }).catch(() => {});
  await s.ir('executivo');
  await s.p.waitForTimeout(400);
  await s.p.evaluate(() => { const m = document.querySelector('.main'); m.scrollTop = 99999; });
  await s.ctx.setOffline(true);
  await s.ir('modelo3d');
  await s.p.waitForTimeout(500);
  ok('a tela nova começa do topo (não herda a rolagem da anterior)', await s.p.evaluate(() => document.querySelector('.main').scrollTop) === 0);
  await s.p.waitForFunction(() => M3D.pronto === true, null, { timeout: 120000 }).catch(() => {});
  const fr2 = s.p.frames().find(f => /modelo3d\.html/.test(f.url()));
  let offTiles = [];
  if (fr2) { await fr2.waitForFunction(() => window.__allTiles === true, null, { timeout: 240000 }).catch(() => {}); offTiles = await fr2.evaluate(() => window.__tiles()); }
  ok('guardado pelo botão Offline, o modelo abre sem sinal', offTiles.length === 8 && offTiles.every(t => t.st === 'ok'), JSON.stringify(offTiles));
  await s.ctx.setOffline(false);

  console.log('\n── obra sem modelo ──');
  await s.p.evaluate(() => trocarObra('ruas-de-terra'));
  await s.p.waitForFunction(() => STATE.loaded === true && OBRA.id === 'ruas-de-terra', null, { timeout: 60000 }).catch(() => {});
  ok('o menu some na obra que não tem modelo', await s.p.evaluate(() => !document.querySelector('.nav-item[data-page="modelo3d"]')));
  await s.ir('modelo3d');
  await s.p.waitForFunction(() => /não tem modelo 3D/.test(document.getElementById('page').textContent), null, { timeout: 10000 }).catch(() => {});
  ok('e a tela diz que não há modelo, sem iframe', await s.p.evaluate(() => !document.getElementById('m3dFrame') && /não tem modelo 3D/.test(document.getElementById('page').textContent)));
  await s.p.evaluate(() => trocarObra('teotonio'));
  await s.p.waitForTimeout(500);

  ok('nenhum erro de JS no app', s.erros.length === 0, s.erros.slice(0, 4).join(' | '));
  await s.fechar();

  console.log('\n── celular ──');
  const m = await H.abrir({ logar: { usuario: 'Wallace', perfil: 'campo' }, rdo: rdoCsv(), mobile: true, webgl: true });
  await m.p.evaluate(() => localStorage.setItem('teotonio_perfil_v1', 'campo'));
  ok('o apontador (campo) enxerga o Modelo 3D', await m.p.evaluate(() => podeVer('modelo3d')));
  await m.ir('modelo3d');
  await m.p.waitForTimeout(1500);
  const lay = await m.p.evaluate(() => {
    const v = document.getElementById('m3dVisor').getBoundingClientRect();
    return { alt: v.height, larg: v.width, vw: innerWidth, rola: document.documentElement.scrollWidth > innerWidth + 1 };
  });
  ok('no celular o 3D ocupa a largura e boa parte da altura', lay.larg <= lay.vw && lay.alt >= 300, JSON.stringify(lay));
  ok('e a página não rola de lado', !lay.rola, JSON.stringify(lay));
  // medido a partir do topo do CARTÃO do 3D, e não da janela: com o WebGL carregando, as animações de
  // entrada (a da tela e a do próprio cartão) ainda o deslocam
  const topo = await m.p.evaluate(() => Math.round(document.getElementById('m3dVisor').getBoundingClientRect().top - document.querySelector('.m3d-card').getBoundingClientRect().top));
  ok('no celular o 3D começa no alto do cartão (cabeçalho e filtros enxutos: eram 252 px antes dele)', topo < 195, topo);
  await m.p.waitForFunction(() => M3D.pronto === true, null, { timeout: 180000 }).catch(() => {});
  const mfr = m.p.frames().find(f => /modelo3d\.html/.test(f.url()));
  await mfr.waitForFunction(() => window.__rdo && window.__rdo.n > 0, null, { timeout: 240000 }).catch(() => {});
  await m.p.evaluate(() => m3dSelecionar('BC:212'));
  await mfr.waitForFunction(() => !document.getElementById('info').hidden, null, { timeout: 15000 }).catch(() => {});
  const painel = await mfr.evaluate(() => { const i = document.getElementById('info'), dl = document.getElementById('infoDl'), r = i.getBoundingClientRect();
    return { linha: document.getElementById('infoLinha').textContent, dl: getComputedStyle(dl).display, alt: Math.round(r.height), tela: innerHeight }; });
  ok('no celular o painel da estaca no 3D é compacto: a linha curta, sem a tabela', /lançamento/.test(painel.linha) && painel.dl === 'none' && painel.alt < painel.tela * 0.42, JSON.stringify(painel));
  await m.p.evaluate(() => m3dFiltro('periodo', 'linha'));
  await m.p.waitForTimeout(400);
  const lay2 = await m.p.evaluate(() => {
    const t = document.getElementById('m3dTempo').getBoundingClientRect(), v = document.getElementById('m3dVisor').getBoundingClientRect();
    return { alt: t.height, dentro: t.bottom <= v.bottom + 1 && t.right <= v.right + 1, rola: document.documentElement.scrollWidth > innerWidth + 1 };
  });
  ok('no celular a barra da linha do tempo cabe na caixa do 3D, sem rolar de lado', lay2.dentro && lay2.alt < 120 && !lay2.rola, JSON.stringify(lay2));
  ok('nenhum erro de JS no celular', m.erros.length === 0, m.erros.slice(0, 3).join(' | '));
  await m.fechar();

  console.log(falhas === 0 ? '\nTUDO CERTO' : `\n${falhas} FALHA(S)`);
  process.exit(falhas === 0 ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
