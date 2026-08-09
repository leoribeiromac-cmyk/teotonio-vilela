// MEDIÇÃO FECHADA — o mês que já foi apresentado à fiscalização não muda calado.
//
// Enquanto a competência está aberta, a prévia é um número vivo: apagar um RDO
// de junho em setembro reescreve, sem rastro, o que foi apresentado em junho.
// Fechar congela o snapshot; o lançamento retroativo continua sendo aceito e a
// diferença passa a aparecer em tela.
//
// Como rodar:
//   python3 -m http.server 8099        (na raiz do repositório)
//   node tests/medicao-fechada.ui.test.js
const { chromium } = require('playwright');

let falhas = 0;
const ok = (n, c, e) => { if (c) console.log('  ✓ ' + n); else { falhas++; console.log('  ✗ ' + n + (e !== undefined ? '  → ' + e : '')); } };

const GID = { pacotes: '386002450', coeficientes: '1962881430', rdoavanco: '1906961773' };

const PAC = ['ID,Frente,Pacote,Unidade Física,Qtd Estimada,Produtividade,Status',
  'P01,Drenagem,Assentamento de tubulação,m,1000,20,Ativo',
  'P02,Pav. Flexível,Base de brita graduada,m²,5000,40,Ativo'].join('\r\n');
// Coef 1 de propósito: o item contratual sai igual à quantidade do pacote, e a
// conta do teste fica conferível de cabeça.
const COEF = ['Pacote ID,Pacote Nome,Item Contratual,Descrição Item,Unid Item,Coef,Unid Coef,Tipo,Item Planilha,Qtd Contratual',
  'P01,Tubulação,06-06-00,Lastro de brita,M3,"1",m³/m,Manual,101,"5.000"',
  'P02,BGS,05-48-00,Brita graduada,M3,"1",m³/m²,Manual,102,"9.000"'].join('\r\n');
const RDO = ['id,Data,Pacote_ID,Quantidade,Local_Estaca,Apontador,Turno,obra',
  'r1,2026-06-10,P01,100,E100,Wallace,Diurno,teotonio',
  'r2,2026-06-11,P02,200,E101,Wallace,Diurno,teotonio',
  'r3,2026-07-02,P01,50,E102,Wallace,Diurno,teotonio'].join('\r\n');

// O que o backend devolve em medicaoListar — trocado entre os casos.
let MEDICOES = [];
let ULTIMO_FECHAR = null;

async function abrir(perfil) {
  const b = await chromium.launch({ executablePath: process.env.CHROME_PATH ||
    '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  const ctx = await b.newContext({ locale: 'pt-BR', viewport: { width: 1440, height: 950 } });
  const p = await ctx.newPage();
  const erros = [];
  p.on('pageerror', e => erros.push('PAGEERROR: ' + e.message));
  p.on('console', m => { const t = m.text();
    if (m.type() === 'error' && !/Failed to load resource|net::|favicon/.test(t)) erros.push('CONSOLE: ' + t); });
  p.on('dialog', d => d.accept());   // o confirm() de fechar/reabrir

  const csv = { [GID.pacotes]: PAC, [GID.coeficientes]: COEF, [GID.rdoavanco]: RDO };
  await p.route('**://docs.google.com/**', r => {
    const gid = new URL(r.request().url()).searchParams.get('gid');
    r.fulfill({ status: 200, contentType: 'text/csv', body: csv[gid] === undefined ? '' : csv[gid] });
  });
  await p.route('**://script.google.com/**', r => {
    const u = new URL(r.request().url()), cb = u.searchParams.get('callback'), acao = u.searchParams.get('action');
    let resp = { ok: true };
    if (acao === 'login') resp = { ok: true, usuario: 'Leonardo', perfil, token: 't', obras: '*' };
    else if (acao === 'medicaoListar') resp = { ok: true, medicoes: MEDICOES };
    else if (acao === 'medicaoFechar') {
      ULTIMO_FECHAR = { competencia: u.searchParams.get('competencia'), itens: u.searchParams.get('itens') };
      MEDICOES = [{ competencia: ULTIMO_FECHAR.competencia, fechadaEm: '2026-07-05T10:00:00',
                    fechadaPor: 'Leonardo', itens: ULTIMO_FECHAR.itens, reaberta: '' }];
    } else if (acao === 'medicaoReabrir') {
      MEDICOES = MEDICOES.map(m => Object.assign({}, m, { reaberta: 'sim' }));
    }
    r.fulfill({ status: 200, contentType: 'application/javascript', body: `${cb}(${JSON.stringify(resp)})` });
  });
  await p.goto('http://localhost:8099/index.html', { waitUntil: 'load' });
  await p.evaluate(pf => { localStorage.setItem('teotonio_user', 'Leonardo');
    localStorage.setItem('teotonio_perfil_v1', pf); localStorage.setItem('teotonio_token_v1', 't'); }, perfil);
  await p.reload({ waitUntil: 'load' });
  await p.waitForFunction(() => typeof STATE !== 'undefined' && STATE.loaded === true, null, { timeout: 30000 });
  return { b, p, erros };
}

const irPara = async (p, mes) => {
  await p.evaluate(m => { STATE.currentPage = 'medicao'; MEDICAO_MES = m; render(); }, mes);
  await p.waitForTimeout(800);   // render + medicaoGarantirFechadas + re-render
};
// O CSS deixa o cabeçalho da tabela em maiúsculas, então innerText devolve
// "MEDIDO". Comparar sem diferenciar caixa — senão o teste passa por engano.
const txt = async p => (await p.evaluate(() => document.getElementById('page').innerText)).toLowerCase();
const colunas = p => p.evaluate(() => [...document.querySelectorAll('#page th')].map(t => t.textContent.trim().toLowerCase()));

(async () => {
  console.log('\nMÊS ABERTO → FECHAR → CONFERIR');
  {
    MEDICOES = []; ULTIMO_FECHAR = null;
    const { b, p, erros } = await abrir('engenharia');
    await irPara(p, '2026-06');
    let t = await txt(p);
    ok('mês aberto mostra o convite para fechar', /em aberto/.test(t) && /fechar medição do mês/.test(t));
    ok('e ainda não tem coluna Medido', (await colunas(p)).indexOf('medido') === -1, JSON.stringify(await colunas(p)));

    await p.evaluate(() => fecharMedicao());
    await p.waitForTimeout(1200);
    ok('o fechamento manda a competência escolhida', ULTIMO_FECHAR && ULTIMO_FECHAR.competencia === '2026-06',
       JSON.stringify(ULTIMO_FECHAR && ULTIMO_FECHAR.competencia));
    const snap = ULTIMO_FECHAR ? JSON.parse(ULTIMO_FECHAR.itens) : [];
    ok('o snapshot leva os 2 itens contratuais', snap.length === 2, JSON.stringify(snap));
    ok('com as quantidades derivadas de junho, não as de julho',
       snap.some(x => Math.abs(x.q - 100) < 0.01) && snap.some(x => Math.abs(x.q - 200) < 0.01), JSON.stringify(snap));

    t = await txt(p);
    ok('a faixa passa a dizer que está fechada', /fechada em 05\/07\/2026/.test(t), t.slice(0, 140));
    ok('e diz quem fechou', /leonardo/.test(t));
    ok('sem divergência, avisa que bate', /bate com o que foi apresentado/.test(t));
    const c = await colunas(p);
    ok('as colunas Medido e Diferença aparecem', c.indexOf('medido') > -1 && c.indexOf('diferença') > -1, JSON.stringify(c));
    ok('sem erro de console', erros.length === 0, JSON.stringify(erros.slice(0, 2)));
    await b.close();
  }

  console.log('\nRDO MEXIDO DEPOIS DO FECHAMENTO — a diferença aparece');
  {
    // Apresentado: 160 e 200, mais um item que hoje nem existe. Hoje o P01 dá
    // 100 → o item medido a mais some 60 e um item medido sumiu da prévia.
    MEDICOES = [{ competencia: '2026-06', fechadaEm: '2026-07-05T10:00:00', fechadaPor: 'Leonardo',
      itens: JSON.stringify([{ k: '06-06-00 101', q: 160 }, { k: '05-48-00 102', q: 200 },
                             { k: '99-99-00 199', q: 12 }]), reaberta: '' }];
    const { b, p, erros } = await abrir('engenharia');
    await irPara(p, '2026-06');
    const t = await txt(p);
    ok('conta quantos itens mudaram', /2 itens mudaram/.test(t), (t.match(/\d+ ite(m|ns) mud\w+/) || [''])[0]);
    ok('mostra a diferença com sinal', /-60,00/.test(t), (t.match(/[-+]\d+,\d\d/g) || []).join(' '));
    ok('avisa o item medido que sumiu da prévia', /sumiu da prévia/.test(t) && /99-99-00 199/.test(t));
    ok('o item que continua batendo não entra na conta', !/3 itens mudaram/.test(t));
    ok('sem erro de console', erros.length === 0, JSON.stringify(erros.slice(0, 2)));
    await b.close();
  }

  console.log('\nREABRIR — e quem não responde pela obra não fecha');
  {
    MEDICOES = [{ competencia: '2026-06', fechadaEm: '2026-07-05T10:00:00', fechadaPor: 'Leonardo',
      itens: JSON.stringify([{ k: '06-06-00 101', q: 100 }, { k: '05-48-00 102', q: 200 }]), reaberta: '' }];
    const { b, p, erros } = await abrir('engenharia');
    await irPara(p, '2026-06');
    ok('fechada mostra Reabrir', /reabrir/.test(await txt(p)));
    await p.evaluate(() => reabrirMedicao());
    await p.waitForTimeout(1200);
    const t = await txt(p);
    ok('depois de reabrir volta a ser mês aberto', /em aberto/.test(t), t.slice(0, 120));
    ok('sem erro de console', erros.length === 0, JSON.stringify(erros.slice(0, 2)));
    await b.close();
  }
  {
    MEDICOES = [];
    const { b, p } = await abrir('administrativo');
    await irPara(p, '2026-06');
    const t = await txt(p);
    ok('administrativo NÃO vê o botão de fechar', t.indexOf('fechar medição do mês') === -1, t.slice(0, 120));
    ok('mas continua vendo a prévia', /prévia de medição/.test(t), t.slice(0, 120));
    await b.close();
  }

  console.log('\nOBRA INTEIRA — sem competência não há o que fechar');
  {
    MEDICOES = [{ competencia: '2026-06', fechadaEm: '2026-07-05T10:00:00', fechadaPor: 'Leonardo',
      itens: JSON.stringify([{ k: '06-06-00 101', q: 100 }]), reaberta: '' }];
    const { b, p, erros } = await abrir('engenharia');
    await irPara(p, '');
    const t = await txt(p);
    ok('não oferece fechar a obra inteira', t.indexOf('fechar medição do mês') === -1);
    ok('nem compara com o snapshot de um mês só', (await colunas(p)).indexOf('medido') === -1);
    ok('sem erro de console', erros.length === 0, JSON.stringify(erros.slice(0, 2)));
    await b.close();
  }

  console.log(falhas === 0 ? '\nTUDO CERTO\n' : `\n${falhas} FALHA(S)\n`);
  process.exit(falhas === 0 ? 0 : 1);
})();
