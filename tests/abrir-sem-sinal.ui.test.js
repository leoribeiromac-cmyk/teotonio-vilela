// O APP ABRE SEM SINAL COM A ÚLTIMA CARGA BOA.
//
// Abrir o app sem sinal — que no canteiro do Ranário é o normal — dava a tela
// de falha em TODAS as telas, e o "Lançar assim mesmo" navegava para uma tela
// que pintava a falha de novo. Agora cada carga boa guarda os CSVs no aparelho
// (IndexedDB, por obra) e a abertura sem sinal usa essa cópia, dizendo na
// barra de quando ela é.
//
// E o refresh de fundo não reinterpreta nem redesenha nada quando a planilha
// não mudou — com 20 mil lançamentos, era meio segundo de tela presa a cada
// 5 minutos e a cada volta da câmera.
//
// Como rodar:  node tests/abrir-sem-sinal.ui.test.js
const H = require('./harness.js');

let falhas = 0;
const ok = (nome, cond, extra) => {
  if (cond) console.log('  ✓ ' + nome);
  else { falhas++; console.log('  ✗ ' + nome + (extra !== undefined ? '  → ' + extra : '')); }
};

(async () => {
  console.log('A ÚLTIMA CARGA BOA FICA NO APARELHO');
  // `falharCSV` é lido a cada pedido: começa com sinal, depois o sinal cai
  const opts = { logar: { usuario: 'Leonardo', perfil: 'admin' }, rdo: H.gerarRDO({ linhas: 300 }) };
  const s = await H.abrir(opts);
  ok('a primeira carga, com sinal, deu certo', s.carregou);
  const antes = await s.p.evaluate(() => STATE.rdoavanco.length);
  // a cópia é gravada sem esperar: dá tempo de o IndexedDB terminar
  await s.p.waitForTimeout(800);
  const guardada = await s.p.evaluate(async () => {
    const g = await cargaLer(OBRA.id);
    return g ? { temR: typeof g.textos.r === 'string', em: g.em } : null;
  });
  ok('e ficou guardada no aparelho', guardada && guardada.temR, JSON.stringify(guardada));

  // SEM SINAL: a planilha publicada não responde mais
  opts.falharCSV = true;
  await s.p.reload({ waitUntil: 'load' });
  await s.p.waitForFunction(() => typeof STATE !== 'undefined' && STATE.loaded === true, null, { timeout: 20000 })
    .catch(() => {});
  const sem = await s.p.evaluate(() => ({
    loaded: STATE.loaded, falhou: STATE.cargaFalhou, doAparelho: !!STATE.dadosDoAparelho,
    n: STATE.rdoavanco.length, status: (document.getElementById('syncText') || {}).textContent || '',
    tela: (document.getElementById('page') || {}).textContent || '',
  }));
  ok('sem sinal, o app abre com os dados guardados', sem.loaded && sem.doAparelho, JSON.stringify(sem).slice(0, 200));
  ok('com os mesmos lançamentos de antes', sem.n === antes, sem.n + ' × ' + antes);
  ok('a barra diz que são dados guardados, e de quando', /dados guardados de/.test(sem.status), sem.status);
  ok('e a tela NÃO é a de falha de carga', !/Não foi possível carregar os dados da obra/.test(sem.tela));
  await s.ir('rdo');
  await s.p.waitForTimeout(500);   // a troca de tela anima 160 ms antes de desenhar
  const podeLancar = await s.p.evaluate(() => !!document.querySelector('.rdo-form') &&
    STATE.pacotes.length > 0 && !/Não foi possível carregar/.test(document.getElementById('page').textContent));
  ok('dá para abrir o Lançar Serviço e escolher pacote', podeLancar);

  // O SINAL VOLTA: a carga nova substitui a cópia
  opts.falharCSV = false;
  await s.p.evaluate(() => carregarTudo());
  await s.p.waitForTimeout(600);
  const volta = await s.p.evaluate(() => ({ doAparelho: STATE.dadosDoAparelho, falhou: STATE.cargaFalhou,
    status: (document.getElementById('syncText') || {}).textContent || '' }));
  ok('com o sinal de volta, a barra volta a "Sincronizado"', !volta.doAparelho && !volta.falhou && /Sincronizado/.test(volta.status),
     JSON.stringify(volta));

  console.log('\nREFRESH DE FUNDO SEM MUDANÇA NÃO REDESENHA');
  await s.ir('executivo');
  await s.p.waitForTimeout(400);
  const semMudanca = await s.p.evaluate(async () => {
    let desenhos = 0; const r = window.render;
    window.render = function () { desenhos++; return r.apply(this, arguments); };
    const ref = STATE.rdoavanco;
    await carregarTudo({ fundo: true });
    window.render = r;
    return { desenhos, mesmoArray: ref === STATE.rdoavanco };
  });
  ok('planilha igual: nenhum redesenho', semMudanca.desenhos === 0, JSON.stringify(semMudanca));
  ok('e nem reinterpreta os CSVs (o STATE é o mesmo)', semMudanca.mesmoArray);

  console.log('\nLANÇAMENTO APAGADO NÃO VOLTA COM O CSV ATRASADO');
  const apagado = await s.p.evaluate(async () => {
    const alvo = STATE.rdoavanco[0];
    const id = String(getCSVField(alvo, 'ID'));
    _APAGADOS_LOCAL.add(id);
    STATE.lastSync = null; _textosCarga = { obra: '', textos: null };   // força a releitura
    await carregarTudo({ fundo: true });   // o CSV "publicado" ainda traz a linha
    return { id, voltou: STATE.rdoavanco.some(r => String(getCSVField(r, 'ID')) === id) };
  });
  ok('o CSV ainda traz a linha, mas ela não volta para a tela', !apagado.voltou, JSON.stringify(apagado));

  ok('nenhum erro de página', s.erros.length === 0, s.erros.slice(0, 3).join(' ; '));
  await s.fechar();
  console.log(falhas ? `\n${falhas} falha(s).` : '\nTudo certo.');
  process.exit(falhas ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
