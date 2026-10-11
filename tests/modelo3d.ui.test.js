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

(async () => {
  const s = await H.abrir({ logar: { usuario: 'Leonardo', perfil: 'admin' }, rdo: rdoCsv(), webgl: true });
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
  const bombear = async cond => { for (let i = 0; i < 40; i++) { if (await fr.evaluate(cond)) return true; await s.p.screenshot(); await s.p.waitForTimeout(100); } return false; };
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

  console.log('\n── lançar na estaca, sem apagar o rascunho ──');
  await s.p.evaluate(() => {
    STATE.draft = defaultDraft();
    Object.assign(STATE.draft.servicos[0], { frente: 'Drenagem', pacoteId: 'P01', sentido: 'BC', estacaIni: 'E200', estacaFim: 'E201', quantidade: '3' });
    saveDraft(STATE.draft);
  });
  await fr.evaluate(() => window.parent.postMessage({ m3d: 1, tipo: 'acao', acao: 'lancar', chave: 'BC:212' }, location.origin));
  await s.p.waitForTimeout(900);
  const lanc = await s.p.evaluate(() => ({ tela: STATE.currentPage, sv: STATE.draft.servicos.map(x => [x.pacoteId, x.sentido, x.estacaIni, x.estacaFim, x.quantidade]) }));
  ok('"Lançar serviço aqui" abre o Lançar Serviço', lanc.tela === 'rdo', lanc.tela);
  ok('o serviço que já estava no rascunho ficou intacto', JSON.stringify(lanc.sv[0]) === JSON.stringify(['P01', 'BC', 'E200', 'E201', '3']), JSON.stringify(lanc.sv));
  ok('a estaca tocada entrou num serviço novo', lanc.sv.length === 2 && lanc.sv[1][1] === 'BC' && lanc.sv[1][2] === 'E212' && lanc.sv[1][3] === 'E212', JSON.stringify(lanc.sv));
  ok('e o campo na tela mostra a estaca', await s.p.evaluate(() => {
    const el = document.querySelector('[data-svc="1"][data-field="estacaIni"]'); return el ? el.value : null; }) === 'E212');
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
  await s.ctx.setOffline(true);
  await s.ir('modelo3d');
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
  ok('nenhum erro de JS no celular', m.erros.length === 0, m.erros.slice(0, 3).join(' | '));
  await m.fechar();

  console.log(falhas === 0 ? '\nTUDO CERTO' : `\n${falhas} FALHA(S)`);
  process.exit(falhas === 0 ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
