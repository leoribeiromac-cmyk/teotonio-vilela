// AS FUNCIONALIDADES NOVAS, TRAVADAS — no app de verdade, no navegador.
//
// Como rodar:
//   python3 -m http.server 8099        (na raiz do repositório)
//   node tests/funcionalidades.ui.test.js
const { chromium } = require('playwright');

let falhas = 0;
const ok = (n, c, e) => { if (c) console.log('  ✓ ' + n); else { falhas++; console.log('  ✗ ' + n + (e !== undefined ? '  → ' + e : '')); } };

const GID = { cronograma: '565093066', pacotes: '386002450', coeficientes: '1962881430',
              rdoavanco: '1906961773', rdodiario: '1234324544' };

const PACOTES = ['ID,Frente,Pacote,Unidade Física,Qtd Estimada,Produtividade,Status',
  'P01,Drenagem,Assentamento de tubulação,m,1000,20,Ativo',
  'P02,Pav. Flexível,Base de brita graduada,m²,5000,40,Ativo'].join('\r\n');

async function abrir(csv) {
  const b = await chromium.launch({ executablePath: process.env.CHROME_PATH ||
    '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  const ctx = await b.newContext({ locale: 'pt-BR', viewport: { width: 1440, height: 950 } });
  const p = await ctx.newPage();
  const erros = [];
  p.on('pageerror', e => erros.push('PAGEERROR: ' + e.message));
  p.on('console', m => { const t = m.text();
    if (m.type() === 'error' && !/Failed to load resource|net::|favicon/.test(t)) erros.push('CONSOLE: ' + t); });

  await p.route('**://docs.google.com/**', r => {
    const gid = new URL(r.request().url()).searchParams.get('gid');
    r.fulfill({ status: 200, contentType: 'text/csv', body: csv[gid] === undefined ? '' : csv[gid] });
  });
  await p.route('**://script.google.com/**', r => {
    const u = new URL(r.request().url()), cb = u.searchParams.get('callback');
    r.fulfill({ status: 200, contentType: 'application/javascript',
      body: `${cb}(${JSON.stringify(u.searchParams.get('action') === 'login'
        ? { ok: true, usuario: 'Leonardo', perfil: 'admin', token: 't', obras: '*' } : { ok: true })})` });
  });
  await p.goto('http://localhost:8099/index.html', { waitUntil: 'load' });
  await p.evaluate(() => { localStorage.setItem('teotonio_user', 'Leonardo');
    localStorage.setItem('teotonio_perfil_v1', 'admin'); localStorage.setItem('teotonio_token_v1', 't'); });
  await p.reload({ waitUntil: 'load' });
  await p.waitForFunction(() => typeof STATE !== 'undefined' && STATE.loaded === true, null, { timeout: 30000 });
  return { b, p, erros };
}

(async () => {
  // ================================================================
  console.log('\nDIAS IMPRODUTIVOS — a chuva do INMET que já estava gravada');
  {
    // 02 e 03/07 chovem e não há serviço → improdutivos.
    // 01 e 06/07 têm serviço → produtivos, mesmo com clima ruim.
    // 07/07 tem garoa medida e nenhum serviço → improdutivo.
    const dias = ['2026-07-01', '2026-07-02', '2026-07-03', '2026-07-06', '2026-07-07'];
    const chuva = ['0', '12,4', '30,2', '0', '0,3'];
    const clima = ['Bom', 'Chuva', 'Chuva forte', 'Bom', 'Garoa'];
    const diario = ['id,numero_rdo,Data,Turno,Clima_Manha,Clima_Tarde,Clima_Noite,Apontador_Diurno,Chuva_mm_Auto,Clima_Fonte,obra']
      .concat(dias.map((d, i) => `D${100 + i},${i + 1},${d},Diurno,${clima[i]},${clima[i]},Bom,Wallace,"${chuva[i]}",Open-Meteo,teotonio`))
      .join('\r\n');
    const rdo = ['id,Data,Pacote_ID,Quantidade,Local_Estaca,Apontador,Turno,obra',
      'r1,2026-07-01,P01,100,E100,Wallace,Diurno,teotonio',
      'r2,2026-07-06,P01,80,E101,Wallace,Diurno,teotonio'].join('\r\n');

    const { b, p, erros } = await abrir({ [GID.pacotes]: PACOTES, [GID.rdoavanco]: rdo, [GID.rdodiario]: diario });
    const r = await p.evaluate(() => {
      const c = calcDiasImprodutivos('2026-07');
      return { t: c.totais, improd: c.dias.filter(x => x.improdutivo).map(x => x.iso) };
    });
    ok('acha os dias com chuva medida e sem serviço',
      JSON.stringify(r.improd) === JSON.stringify(['2026-07-02', '2026-07-03', '2026-07-07']), JSON.stringify(r.improd));
    ok('dia com chuva MAS com serviço lançado não é improdutivo', r.improd.indexOf('2026-07-01') === -1);
    ok('soma a chuva do mês', Math.abs(r.t.mmAcumulado - 42.9) < 0.01, r.t.mmAcumulado + ' mm');
    ok('conta os dias com chuva medida', r.t.comChuvaMedida === 3, String(r.t.comChuvaMedida));

    await p.evaluate(() => { STATE.currentPage = 'improdutivos'; render(); });
    await p.waitForTimeout(500);
    const tela = await p.evaluate(() => ({
      linhas: document.querySelectorAll('#page tbody tr').length,
      txt: document.getElementById('page').innerText,
    }));
    ok('a tela imprime o mês inteiro', tela.linhas === 31, tela.linhas + ' linhas');
    ok('e mostra a chuva medida com a unidade', /12,40\s*mm/.test(tela.txt));
    ok('e a fonte da medição', tela.txt.indexOf('Open-Meteo') !== -1);
    ok('sem erro de console', erros.length === 0, JSON.stringify(erros.slice(0, 2)));
    await b.close();
  }

  // ================================================================
  console.log('\nHISTÓRICO — alcança a obra inteira');
  {
    const linhas = ['id,Data,Pacote_ID,Quantidade,Local_Estaca,Equipe,Apontador,Turno,Observações,obra'];
    for (let i = 0; i < 260; i++) {
      const d = new Date(Date.UTC(2026, 4, 4) + (i % 60) * 86400000).toISOString().slice(0, 10);
      linhas.push(`r${i},${d},P0${(i % 2) + 1},${10 + i},E${100 + (i % 30)},Sena,Wallace,Diurno,,teotonio`);
    }
    const { b, p, erros } = await abrir({ [GID.pacotes]: PACOTES, [GID.rdoavanco]: linhas.join('\r\n') });
    await p.evaluate(() => { STATE.currentPage = 'historico'; render(); });
    await p.waitForTimeout(500);

    // Conta só LINHA DE DADO: fora a linha de edição (que fica escondida
    // embaixo de cada registro) e a linha de rodapé do "Mostrar mais", que
    // usa colspan.
    const conta = () => p.evaluate(() => ({
      visiveis: [...document.querySelectorAll('#page tbody tr')].filter(tr =>
        !/hist-edit-row/.test(tr.id || '') && !tr.querySelector('td[colspan]')).length,
      txt: (document.getElementById('page').innerText.match(/mostrando[^\n]*/i) || [''])[0],
    }));
    const a = await conta();
    ok('mostra 100 na primeira página', a.visiveis === 100, JSON.stringify(a));
    ok('e diz quantos existem no total', /de 260/.test(a.txt), a.txt);

    await p.evaluate(() => histMostrarMais());
    await p.waitForTimeout(400);
    const c = await conta();
    ok('"Mostrar mais" traz os próximos 100', c.visiveis === 200, JSON.stringify(c));

    // setHistFiltro re-renderiza por transitionTo (assíncrono): sem esperar,
    // a leitura pega a tela anterior.
    await p.evaluate(() => { limparHistFiltro(); setHistFiltro('busca', 'E118'); });
    await p.waitForTimeout(450);
    const busca = (await conta()).visiveis;
    ok('a busca livre acha pela estaca', busca > 0 && busca < 260, busca + ' de 260');

    await p.evaluate(() => { limparHistFiltro(); setHistFiltro('data', '2026-05-05'); });
    await p.waitForTimeout(450);
    const porData = (await conta()).visiveis;
    ok('o filtro por dia exato reduz a lista', porData > 0 && porData < 100, String(porData));
    ok('sem erro de console', erros.length === 0, JSON.stringify(erros.slice(0, 2)));
    await b.close();
  }

  console.log(falhas === 0 ? '\nTUDO CERTO\n' : `\n${falhas} FALHA(S)\n`);
  process.exit(falhas === 0 ? 0 : 1);
})();
