// TEÓRICO × REAL — o que a obra devia ter consumido contra o que saiu.
//
// O app já sabia as duas metades e nunca as pôs lado a lado: o teórico
// (avanço × coeficientes, a mesma conta da prévia de medição) e o real (as
// saídas do almoxarifado, que a tela de Notas já registrava).
//
// Como rodar:
//   python3 -m http.server 8099        (na raiz do repositório)
//   node tests/teorico-real.ui.test.js
const { chromium } = require('playwright');

let falhas = 0;
const ok = (n, c, e) => { if (c) console.log('  ✓ ' + n); else { falhas++; console.log('  ✗ ' + n + (e !== undefined ? '  → ' + e : '')); } };

const GID = { pacotes: '386002450', coeficientes: '1962881430', rdoavanco: '1906961773' };

const PAC = ['ID,Frente,Pacote,Unidade Física,Qtd Estimada,Produtividade,Status',
  'P01,Drenagem,Assentamento de tubulação,m,1000,20,Ativo',
  'P02,Pav. Flexível,Base de brita graduada,m²,5000,40,Ativo',
  'P03,Muros de Contenção,Fuste do muro,m,135,2.5,Ativo'].join('\r\n');

// P01: 100 m × 0,5 = 50 m³ de lastro de brita  (vínculo DECLARADO)
// P02: 200 m² × 0,15 = 30 m³ de BGS            (vínculo AUTOMÁTICO pela descrição)
// P03: 10 m × 1,2 = 12 m³ de concreto          (SEM material vinculado)
const COEF = ['Pacote ID,Pacote Nome,Item Contratual,Descrição Item,Unid Item,Coef,Unid Coef,Tipo,Item Planilha,Material Estoque',
  'P01,Tubulação,06-06-00,Lastro de brita,M3,"0,5",m³/m,Manual,101,BRITA 1',
  'P02,BGS,05-48-00,Brita graduada simples,M3,"0,15",m³/m²,Manual,102,',
  'P03,Fuste,04-11-00,Concreto estrutural,M3,"1,2",m³/m,Manual,103,'].join('\r\n');

const RDO = ['id,Data,Pacote_ID,Quantidade,Local_Estaca,Apontador,Turno,obra',
  'r1,2026-06-10,P01,100,E100,Wallace,Diurno,teotonio',
  'r2,2026-06-11,P02,200,E101,Wallace,Diurno,teotonio',
  'r3,2026-06-12,P03,10,E102,Wallace,Diurno,teotonio',
  'r4,2026-07-02,P01,40,E103,Wallace,Diurno,teotonio'].join('\r\n');

async function abrir() {
  const b = await chromium.launch({ executablePath: process.env.CHROME_PATH ||
    '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  const ctx = await b.newContext({ locale: 'pt-BR', viewport: { width: 1440, height: 950 } });
  const p = await ctx.newPage();
  const erros = [];
  p.on('pageerror', e => erros.push('PAGEERROR: ' + e.message));
  p.on('console', m => { const t = m.text();
    if (m.type() === 'error' && !/Failed to load resource|net::|favicon/.test(t)) erros.push('CONSOLE: ' + t); });

  const csv = { [GID.pacotes]: PAC, [GID.coeficientes]: COEF, [GID.rdoavanco]: RDO };
  await p.route('**://docs.google.com/**', r => {
    const gid = new URL(r.request().url()).searchParams.get('gid');
    r.fulfill({ status: 200, contentType: 'text/csv', body: csv[gid] === undefined ? '' : csv[gid] });
  });
  await p.route('**://script.google.com/**', r => {
    const u = new URL(r.request().url()), cb = u.searchParams.get('callback');
    const resp = u.searchParams.get('action') === 'login'
      ? { ok: true, usuario: 'Leonardo', perfil: 'admin', token: 't', obras: '*' } : { ok: true };
    r.fulfill({ status: 200, contentType: 'application/javascript', body: `${cb}(${JSON.stringify(resp)})` });
  });
  await p.goto('http://localhost:8099/index.html', { waitUntil: 'load' });
  await p.evaluate(() => { localStorage.setItem('teotonio_user', 'Leonardo');
    localStorage.setItem('teotonio_perfil_v1', 'admin'); localStorage.setItem('teotonio_token_v1', 't'); });
  await p.reload({ waitUntil: 'load' });
  await p.waitForFunction(() => typeof STATE !== 'undefined' && STATE.loaded === true, null, { timeout: 30000 });
  return { b, p, erros };
}

// As saídas de almoxarifado vivem no mesmo armazenamento local que a tela de
// Notas usa — semear ali é semear pelo caminho de verdade.
const semearSaidas = (p, saidas) => p.evaluate(s => {
  nfSaiSet(OBRA.id, s);
}, saidas);

const SAIDAS = [
  // BRITA 1: teórico de junho = 50 m³, saiu 62 → 24 % acima
  { id: 's1', materialId: 'brita1', descricao: 'BRITA 1', un: 'M3', qtd: 62, dataISO: '2026-06-15' },
  // BRITA GRADUADA SIMPLES: bate com a descrição do item, sem declarar
  { id: 's2', materialId: 'bgs', descricao: 'BRITA GRADUADA SIMPLES', un: 'M3', qtd: 30, dataISO: '2026-06-16' },
  // Saiu e não tem serviço nenhum apontado contra ele
  { id: 's3', materialId: 'cim', descricao: 'CIMENTO CP II 50KG', un: 'SC', qtd: 120, dataISO: '2026-06-17' },
  // Julho, para o filtro de mês ter o que separar
  { id: 's4', materialId: 'brita1', descricao: 'BRITA 1', un: 'M3', qtd: 5, dataISO: '2026-07-05' },
];

(async () => {
  console.log('\nA COMPARAÇÃO DO MÊS');
  {
    const { b, p, erros } = await abrir();
    await semearSaidas(p, SAIDAS);
    const r = await p.evaluate(() => {
      const c = consumoTeoricoReal('2026-06');
      const acha = cod => c.linhas.find(x => x.item === cod);
      return { t: c.totais,
        brita: acha('06-06-00'), bgs: acha('05-48-00'), concreto: acha('04-11-00'),
        orfas: c.semTeorico.map(x => x.descricao) };
    });
    ok('deriva o teórico do avanço × coeficiente', Math.abs(r.brita.teorico - 50) < 0.01, String(r.brita.teorico));
    ok('lê o real das saídas do almoxarifado', Math.abs(r.brita.real - 62) < 0.01, String(r.brita.real));
    ok('e a diferença', Math.abs(r.brita.diferenca - 12) < 0.01, String(r.brita.diferenca));
    ok('com o desvio em porcentagem', Math.abs(r.brita.desvio - 0.24) < 0.001, String(r.brita.desvio));
    ok('o vínculo declarado na planilha é honrado', r.brita.vinculo === 'declarado', r.brita.vinculo);

    ok('sem coluna preenchida, casa pela descrição', Math.abs(r.bgs.real - 30) < 0.01, String(r.bgs.real));
    // Palpite tem de se declarar palpite: um vínculo automático errado dá um
    // número errado com cara de conferido.
    ok('e DIZ que casou sozinha', r.bgs.vinculo === 'automático', r.bgs.vinculo);
    ok('item sem material nenhum fica sem real', r.concreto.real === null && r.concreto.desvio === null,
       JSON.stringify({ real: r.concreto.real, d: r.concreto.desvio }));

    ok('material que saiu sem serviço aparece à parte',
       r.orfas.length === 1 && /CIMENTO/.test(r.orfas[0]), JSON.stringify(r.orfas));
    ok('e não some no meio da tabela principal', r.t.saidasOrfas === 1, String(r.t.saidasOrfas));
    ok('conta quantos passaram de 10 % acima', r.t.acima === 1, String(r.t.acima));
    ok('e quantos ficaram sem vínculo', r.t.semVinculo === 1, String(r.t.semVinculo));
    ok('sem erro de console', erros.length === 0, JSON.stringify(erros.slice(0, 2)));
    await b.close();
  }

  console.log('\nO FILTRO DE MÊS SEPARA OS DOIS LADOS');
  {
    const { b, p, erros } = await abrir();
    await semearSaidas(p, SAIDAS);
    const r = await p.evaluate(() => {
      const jul = consumoTeoricoReal('2026-07');
      const tudo = consumoTeoricoReal('');
      return {
        julBrita: jul.linhas.find(x => x.item === '06-06-00'),
        julOrfas: jul.semTeorico.length,
        tudoBrita: tudo.linhas.find(x => x.item === '06-06-00'),
      };
    });
    // Julho: 40 m × 0,5 = 20 m³ teóricos; saíram 5.
    ok('o teórico segue o mês do RDO', Math.abs(r.julBrita.teorico - 20) < 0.01, String(r.julBrita.teorico));
    ok('o real segue o mês da saída', Math.abs(r.julBrita.real - 5) < 0.01, String(r.julBrita.real));
    ok('e o cimento de junho não vaza para julho', r.julOrfas === 0, String(r.julOrfas));
    // Obra inteira: 140 m × 0,5 = 70 m³; saíram 62 + 5 = 67.
    ok('obra inteira soma os dois meses',
       Math.abs(r.tudoBrita.teorico - 70) < 0.01 && Math.abs(r.tudoBrita.real - 67) < 0.01,
       JSON.stringify({ t: r.tudoBrita.teorico, r: r.tudoBrita.real }));
    ok('sem erro de console', erros.length === 0, JSON.stringify(erros.slice(0, 2)));
    await b.close();
  }

  console.log('\nUNIDADES DIFERENTES NÃO VIRAM CONTA');
  {
    const { b, p, erros } = await abrir();
    // Concreto medido em m³ no contrato, cimento comprado em saco: a diferença
    // existe mas não é comparável.
    await semearSaidas(p, [{ id: 'x1', materialId: 'c', descricao: 'CONCRETO ESTRUTURAL',
                             un: 'SC', qtd: 400, dataISO: '2026-06-20' }]);
    const r = await p.evaluate(() => {
      const c = consumoTeoricoReal('2026-06');
      const x = c.linhas.find(l => l.item === '04-11-00');
      return { diverge: x.unidadeDiverge, ui: x.unidadeItem, um: x.unidadeMaterial, acima: c.totais.acima };
    });
    ok('marca que as unidades divergem', r.diverge === true, JSON.stringify(r));
    ok('mostra as duas unidades', r.ui === 'M3' && r.um === 'SC', JSON.stringify(r));
    ok('e não conta como estouro', r.acima === 0, String(r.acima));
    ok('sem erro de console', erros.length === 0, JSON.stringify(erros.slice(0, 2)));
    await b.close();
  }

  console.log('\nDESCRIÇÃO AMBÍGUA NÃO É CHUTADA');
  {
    const { b, p, erros } = await abrir();
    // Duas saídas cujo nome contém a descrição do item: casar com qualquer uma
    // seria inventar. Melhor deixar sem vínculo e dizer que está ambíguo.
    await semearSaidas(p, [
      { id: 'a1', descricao: 'BRITA GRADUADA SIMPLES 0/25', un: 'M3', qtd: 10, dataISO: '2026-06-20' },
      { id: 'a2', descricao: 'BRITA GRADUADA SIMPLES TRATADA', un: 'M3', qtd: 20, dataISO: '2026-06-21' },
    ]);
    const r = await p.evaluate(() => {
      const c = consumoTeoricoReal('2026-06');
      const x = c.linhas.find(l => l.item === '05-48-00');
      return { v: x.vinculo, real: x.real, orfas: c.semTeorico.length };
    });
    ok('não escolhe entre dois candidatos', r.v === 'ambíguo', r.v);
    ok('e não inventa um número', r.real === null, String(r.real));
    ok('as duas saídas aparecem como sem serviço', r.orfas === 2, String(r.orfas));
    ok('sem erro de console', erros.length === 0, JSON.stringify(erros.slice(0, 2)));
    await b.close();
  }

  console.log('\nA TELA');
  {
    const { b, p, erros } = await abrir();
    await semearSaidas(p, SAIDAS);
    await p.evaluate(() => { STATE.currentPage = 'teoricoreal'; TR_MES = '2026-06'; render(); });
    await p.waitForTimeout(600);
    const t = await p.evaluate(() => document.getElementById('page').innerText);
    ok('a tela abre com a comparação', /teórico/i.test(t) && /06-06-00/.test(t), t.slice(0, 120));
    ok('mostra os dois números lado a lado', /50,00/.test(t) && /62,00/.test(t));
    ok('e o desvio', /\+24,0/.test(t), (t.match(/[+-]\d+,\d+%/g) || []).join(' '));
    ok('avisa quando um vínculo foi feito sozinho', /pela descrição/i.test(t));
    ok('e ensina como travá-lo', /Material Estoque/.test(t));
    ok('lista a saída sem serviço correspondente', /sem serviço correspondente/i.test(t) && /CIMENTO/.test(t));
    ok('sem erro de console', erros.length === 0, JSON.stringify(erros.slice(0, 2)));

    // Sem saída nenhuma a tela explica de onde viria a metade que falta,
    // em vez de mostrar uma tabela de zeros.
    await p.evaluate(() => { nfSaiSet(OBRA.id, []); render(); });
    await p.waitForTimeout(500);
    const vazio = await p.evaluate(() => document.getElementById('page').innerText);
    ok('sem saídas, diz de onde viria o real', /nenhuma saída de almoxarifado/i.test(vazio), vazio.slice(0, 160));
    await b.close();
  }

  console.log('\nQUEM VÊ A TELA');
  {
    const { b, p } = await abrir();
    const r = await p.evaluate(() => {
      const antes = STATE.perfilLogado;
      const out = {};
      ['campo', 'administrativo', 'engenharia', 'diretoria', 'admin'].forEach(pf => {
        STATE.perfilLogado = pf;
        out[pf] = podeVer('teoricoreal');
      });
      STATE.perfilLogado = antes;
      return out;
    });
    ok('campo não vê (é tela de análise)', r.campo === false, JSON.stringify(r));
    ok('administrativo, engenharia, diretoria e admin veem',
       r.administrativo && r.engenharia && r.diretoria && r.admin, JSON.stringify(r));
    await b.close();
  }

  console.log(falhas === 0 ? '\nTUDO CERTO\n' : `\n${falhas} FALHA(S)\n`);
  process.exit(falhas === 0 ? 0 : 1);
})();
