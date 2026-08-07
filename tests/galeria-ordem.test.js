// A galeria ordenava só pela data. Dentro do MESMO dia quem decidia era a
// ordem em que a linha caiu na planilha, e a foto do turno noturno aparecia
// antes da foto da manhã — o dia lido ao contrário.
//
// Este teste semeia a planilha DE PROPÓSITO ao contrário (o noturno lançado
// antes do diurno) e cobra a ordem do relógio da obra: dia mais novo
// primeiro, e dentro do dia Diurno antes de Noturno.
//
// Como rodar:
//   python3 -m http.server 8099        (na raiz do repositório)
//   npx playwright install chromium    (uma vez)
//   node tests/galeria-ordem.test.js
const { chromium } = require('playwright');
let falhas = 0;
const ok = (n, c, e) => { if (c) console.log('  ✓ ' + n); else { falhas++; console.log('  ✗ ' + n + (e !== undefined ? '  → ' + e : '')); } };

(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const p = await b.newPage({ viewport: { width: 1380, height: 900 } });
  const err = [];
  p.on('pageerror', e => err.push('PAGEERROR: ' + e.message));

  await p.route('**://script.google.com/**', (route) => {
    const u = new URL(route.request().url());
    const acao = u.searchParams.get('action');
    const cb = u.searchParams.get('callback');
    let corpo;
    if (acao === 'login') corpo = { ok: true, usuario: 'Leonardo', perfil: 'admin', token: 't', obras: '*' };
    else if (acao === 'usuariosNomes') corpo = { ok: true, usuarios: ['Leonardo'] };
    else if (acao === 'obterFoto') corpo = { ok: true, mini: true, dataUri: 'data:image/jpeg;base64,' + 'A'.repeat(400) };
    else corpo = { ok: true };
    route.fulfill({ status: 200, contentType: 'application/javascript', body: `${cb}(${JSON.stringify(corpo)})` });
  });
  await p.route('**://docs.google.com/**', r => r.fulfill({ status: 200, body: '' }));

  await p.goto('http://localhost:8099/index.html', { waitUntil: 'load' });
  await p.waitForTimeout(1200);
  await p.evaluate(() => navigate('rdo'));
  await p.waitForSelector('#loginBtn', { timeout: 5000 });
  await p.evaluate(async () => {
    document.getElementById('loginUserSelect').value = 'Leonardo';
    document.getElementById('loginPass').value = 'x';
    await fazerLogin();
  });
  await p.waitForTimeout(500);

  const semear = (linhas) => p.evaluate((ls) => { STATE.rdoavanco = ls; }, linhas);
  // Sai da galeria e volta: sem isso a tela seguiria com os quadros da
  // rodada anterior, e o teste leria a ordem errada como se fosse a nova.
  const ordemNaTela = async () => {
    await p.evaluate(() => { STATE.currentPage = 'executivo'; render(); });
    await p.evaluate(() => navigate('galeria'));
    await p.waitForSelector('[id^="galbox-"]', { timeout: 8000 });
    return p.evaluate(() =>
      [...document.querySelectorAll('[id^="galbox-"]')].map(d => d.id.slice(7)));
  };

  console.log('DENTRO DO DIA, O TURNO MANDA');
  await semear([
    { ID: '20260806220000_0_1111', Data: '2026-08-06', Turno: 'Noturno', Pacote_Nome: 'CBUQ',
      Local_Estaca: 'E1 120', foto_link: 'drive_id:NOITE6' },
    { ID: '20260806090000_0_2222', Data: '2026-08-06', Turno: 'Diurno', Pacote_Nome: 'CBUQ',
      Local_Estaca: 'E1 110', foto_link: 'drive_id:DIA6' },
    { ID: '20260807230000_0_3333', Data: '2026-08-07', Turno: 'Noturno', Pacote_Nome: 'CBUQ',
      Local_Estaca: 'E1 130', foto_link: 'drive_id:NOITE7' },
    { ID: '20260807080000_0_4444', Data: '2026-08-07', Turno: 'Diurno', Pacote_Nome: 'CBUQ',
      Local_Estaca: 'E1 125', foto_link: 'drive_id:DIA7' }
  ]);
  let ordem = await ordemNaTela();
  ok('dia mais novo primeiro, e nele o diurno antes do noturno',
    JSON.stringify(ordem) === JSON.stringify(['DIA7', 'NOITE7', 'DIA6', 'NOITE6']), ordem.join(' → '));

  console.log('\nTURNO VAZIO CONTA COMO DIURNO (é o padrão do lançamento)');
  await semear([
    { ID: '20260807220000_0_1111', Data: '2026-08-07', Turno: 'Noturno', Pacote_Nome: 'CBUQ',
      Local_Estaca: 'E1 120', foto_link: 'drive_id:NOITE' },
    { ID: '20260807090000_0_2222', Data: '2026-08-07', Turno: '', Pacote_Nome: 'CBUQ',
      Local_Estaca: 'E1 110', foto_link: 'drive_id:SEMTURNO' }
  ]);
  ordem = await ordemNaTela();
  ok('a linha sem turno vem antes da noturna',
    JSON.stringify(ordem) === JSON.stringify(['SEMTURNO', 'NOITE']), ordem.join(' → '));

  console.log('\nMESMO DIA, MESMO TURNO: QUEM LANÇOU ANTES VEM ANTES');
  await semear([
    { ID: '20260807150000_0_1111', Data: '2026-08-07', Turno: 'Diurno', Pacote_Nome: 'CBUQ',
      Local_Estaca: 'E1 120', foto_link: 'drive_id:TARDE' },
    { ID: '20260807080000_0_2222', Data: '2026-08-07', Turno: 'Diurno', Pacote_Nome: 'CBUQ',
      Local_Estaca: 'E1 110', foto_link: 'drive_id:CEDO' }
  ]);
  ordem = await ordemNaTela();
  ok('o ID do lançamento (yyyyMMddHHmmss) desempata',
    JSON.stringify(ordem) === JSON.stringify(['CEDO', 'TARDE']), ordem.join(' → '));

  console.log('\nAS FOTOS DE UM MESMO SERVIÇO FICAM JUNTAS E NA ORDEM');
  await semear([
    { ID: '20260807080000_0_2222', Data: '2026-08-07', Turno: 'Diurno', Pacote_Nome: 'CBUQ',
      Local_Estaca: 'E1 110', foto_link: 'drive_id:A drive_id:B drive_id:C' }
  ]);
  ordem = await ordemNaTela();
  ok('na ordem em que foram anexadas',
    JSON.stringify(ordem) === JSON.stringify(['A', 'B', 'C']), ordem.join(' → '));

  console.log('\n--- ERROS DE JS (' + err.length + ') ---');
  [...new Set(err)].slice(0, 8).forEach(e => console.log('  ' + e));
  console.log(falhas || err.length ? `\n${falhas} FALHA(S)` : '\nTudo certo.');
  await b.close();
  process.exit(falhas || err.length ? 1 : 0);
})();
