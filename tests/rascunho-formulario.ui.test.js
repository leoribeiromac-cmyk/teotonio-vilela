// O QUE FOI PREENCHIDO TEM DE VOLTAR DEPOIS QUE O APARELHO RECARREGA.
//
// A guarda de `carregarTudo` (tests/formulario-nao-se-apaga.ui.test.js)
// impede o app de se redesenhar por cima de quem preenche. Ela não alcança
// o caso que continuou aparecendo no canteiro: o celular DESCARTA a aba
// enquanto a câmera está aberta, para dar memória ao aplicativo de foto.
// Ao voltar não houve re-render — houve um carregamento novo, e nada do
// que estava só na tela existe mais. Depende de RAM, por isso acontecia
// num aparelho e não no outro: "no meu funciona, no dele às vezes apaga".
//
// Este teste recarrega a página de verdade (page.reload), que é o que o
// navegador faz ao restaurar uma aba descartada, e confere que a viagem e
// o apontamento voltam — provas e paradas incluídas.
//
// Como rodar:  node tests/rascunho-formulario.ui.test.js
//   (sobe o próprio servidor; não depende do 8099)
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const PORTA = 8131;
const BASE = 'http://localhost:' + PORTA;

let falhas = 0;
const ok = (n, c, e) => { if (c) console.log('  ✓ ' + n); else { falhas++; console.log('  ✗ ' + n + (e !== undefined ? '  → ' + e : '')); } };

const srv = spawn('python3', ['-m', 'http.server', String(PORTA)], { cwd: RAIZ, stdio: 'ignore' });
process.on('exit', () => { try { srv.kill(); } catch (e) { } });

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR42mP8z8BQz0AEYBxVSF+FAP2FBPhML7VJAAAAAElFTkSuQmCC',
  'base64');

/* Um handler só para o Apps Script: o login e as listas de nomes chegam
   por JSONP (com ?callback=), e as listas de equipamento por fetch/JSON.
   Dois `route` no mesmo endereço não serviriam — o último registrado vence,
   e o login voltaria como JSON puro, sem ninguém entrar. */
function rotas(ctx) {
  ctx.route('**script.google*.com/**', r => {
    const u = new URL(r.request().url());
    const cb = u.searchParams.get('callback');
    const a = u.searchParams.get('action') || u.searchParams.get('acao') || '';
    let c = { ok: true };
    if (a === 'login') c = { ok: true, usuario: 'Wallace', perfil: 'admin', token: 't', obras: '*' };
    else if (a === 'usuariosNomes') c = { ok: true, usuarios: ['Wallace'] };
    else if (a === 'bfListar') c = { ok: true, viagens: [] };
    else if (a === 'listas' || a === 'equipListar') {
      c = { ok: true, equipamentos: [{ nome: 'Escavadeira CAT 320', tipo: 'Linha Amarela' }], locadoras: [] };
    }
    r.fulfill(cb
      ? { status: 200, contentType: 'application/javascript', body: `${cb}(${JSON.stringify(c)})` }
      : { status: 200, contentType: 'application/json', body: JSON.stringify(c) });
  });
  ctx.route('**docs.google.com/**', r => r.fulfill({ status: 200, contentType: 'text/csv', body: 'id,Data\r\nr1,2026-07-01\r\n' }));
}

async function novoContexto(navegador) {
  const ctx = await navegador.newContext({ viewport: { width: 400, height: 860 }, isMobile: true, hasTouch: true });
  rotas(ctx);
  return ctx;
}

async function abrir(ctx, tela) {
  const p = await ctx.newPage();
  const erros = [];
  p.on('pageerror', e => erros.push(e.message));
  await p.goto(BASE + '/index.html', { waitUntil: 'load' });
  await p.waitForTimeout(900);
  if (!(await p.evaluate(() => !!STATE.usuarioLogado))) {
    await p.evaluate(() => navigate('rdo'));
    await p.waitForSelector('#loginBtn', { timeout: 15000 });
    await p.evaluate(async () => {
      (document.getElementById('loginUser') || document.getElementById('loginUserSelect')).value = 'Wallace';
      document.getElementById('loginPass').value = 'x';
      await fazerLogin();
    });
    await p.waitForTimeout(700);
  }
  await p.evaluate(t => { STATE.cargaFalhou = false; STATE.loaded = true; navigate(t); }, tela);
  return { p, erros };
}

/* O que o navegador faz ao voltar para uma aba que foi descartada: some a
   página e monta tudo de novo. `visibilitychange` para "escondida" é o
   último instante em que o app ainda roda — é lá que o rascunho grava. */
async function aparelhoDescartaEReabre(p) {
  await p.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await p.waitForTimeout(400);
  await p.reload({ waitUntil: 'load' });
  await p.waitForTimeout(1200);
}

(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });

  // ------------------------------------------------------------------
  console.log('\nBOTA-FORA — a viagem volta depois de o aparelho recarregar');
  {
    const ctx = await novoContexto(b);
    const { p, erros } = await abrir(ctx, 'botafora');
    await p.waitForSelector('#bfForm', { timeout: 15000 });
    await p.waitForTimeout(600);
    await p.evaluate(() => {
      const s = (i, v) => { const e = document.getElementById(i); if (e) { e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); } };
      s('bfPlaca', 'EFU-7H47'); s('bfMotorista', 'ARI'); s('bfFornecedor', 'SLT');
      s('bfValor', '900,00'); s('bfOrigem', 'Ijucapirama'); s('bfDestino', 'Itaquareia');
      s('bfObs', 'carga cheia');
    });
    // "Tirar" abre a câmera traseira; o arquivo volta por este input.
    await p.setInputFiles('#bfArqcargaCam', { name: 'carga.png', mimeType: 'image/png', buffer: PNG });
    await p.waitForTimeout(800);
    ok('a viagem está preenchida e a foto anexada',
       await p.evaluate(() => document.getElementById('bfPlaca').value === 'EFU-7H47' && !!document.querySelector('#bfPrevcarga img')));

    await aparelhoDescartaEReabre(p);
    await p.evaluate(() => { STATE.cargaFalhou = false; STATE.loaded = true; navigate('botafora'); });
    await p.waitForSelector('#bfForm', { timeout: 15000 });
    await p.waitForTimeout(1200);

    const d = await p.evaluate(() => ({
      placa: document.getElementById('bfPlaca').value,
      motorista: document.getElementById('bfMotorista').value,
      valor: document.getElementById('bfValor').value,
      obs: document.getElementById('bfObs').value,
      destino: document.getElementById('bfDestino').value,
      foto: !!document.querySelector('#bfPrevcarga img'),
      aviso: (document.getElementById('bfRascunho') || {}).style ? document.getElementById('bfRascunho').style.display !== 'none' : false,
    }));
    ok('a placa voltou', d.placa === 'EFU-7H47', d.placa);
    ok('o motorista voltou', d.motorista === 'ARI', d.motorista);
    ok('o valor do frete voltou', d.valor === '900,00', d.valor);
    ok('as observações voltaram', d.obs === 'carga cheia', d.obs);
    ok('o destino voltou', d.destino === 'Itaquareia', d.destino);
    ok('A FOTO da carga voltou anexada', d.foto === true, d.foto);
    ok('e a tela diz que recuperou o preenchimento', d.aviso === true, d.aviso);

    // Descartar limpa a viagem E o rascunho: não pode ressuscitar depois.
    await p.evaluate(() => bfDescartarRascunho());
    await p.waitForTimeout(500);
    await p.reload({ waitUntil: 'load' });
    await p.waitForTimeout(1000);
    await p.evaluate(() => { STATE.cargaFalhou = false; STATE.loaded = true; navigate('botafora'); });
    await p.waitForSelector('#bfForm', { timeout: 15000 });
    await p.waitForTimeout(1000);
    ok('depois de Descartar, a viagem não volta mais',
       await p.evaluate(() => document.getElementById('bfPlaca').value === ''),
       await p.evaluate(() => document.getElementById('bfPlaca').value));
    ok('sem erro de página', erros.length === 0, erros.slice(0, 3).join(' ; '));
    await ctx.close();
  }

  // ------------------------------------------------------------------
  console.log('\nEQUIPAMENTOS — o apontamento volta pelo mesmo caminho');
  {
    const ctx = await novoContexto(b);
    const { p, erros } = await abrir(ctx, 'equip');
    await p.waitForSelector('#apontamentoForm', { timeout: 15000 });
    await p.waitForTimeout(700);
    await p.evaluate(() => {
      const s = (i, v) => { const e = document.getElementById(i); if (e) { e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); } };
      s('operador', 'Genilson Rocha'); s('inicio', '07:00'); s('fim', '17:00');
      s('horimInicial', '1200'); s('horimFinal', '1209'); s('combustivel', '80');
      s('observacoesUI', 'frente da Astrogildo');
      s('equipamento', 'Escavadeira CAT 320');
      EQ.adicionarParada('Almoço', '12:00', '13:00');
      EQ.calcularHoras();
    });
    await p.waitForTimeout(700);
    ok('o apontamento está preenchido, com parada e horas apuradas',
       await p.evaluate(() => document.querySelectorAll('#paradasList .parada-row').length === 1
                           && document.getElementById('horas').value === '9.00'));

    await aparelhoDescartaEReabre(p);
    await p.evaluate(() => { STATE.cargaFalhou = false; STATE.loaded = true; navigate('equip'); });
    await p.waitForSelector('#apontamentoForm', { timeout: 15000 });
    await p.waitForTimeout(1400);

    const d = await p.evaluate(() => ({
      operador: document.getElementById('operador').value,
      horim: document.getElementById('horimInicial').value,
      comb: document.getElementById('combustivel').value,
      obs: document.getElementById('observacoesUI').value,
      paradas: document.querySelectorAll('#paradasList .parada-row').length,
      motivo: (document.querySelector('#paradasList .parada-motivo') || {}).value,
      horas: document.getElementById('horas').value,
      equipamento: document.getElementById('equipamento').value,
      aviso: document.getElementById('eqRascunho').style.display !== 'none',
    }));
    ok('o operador voltou', d.operador === 'Genilson Rocha', d.operador);
    ok('o horímetro voltou', d.horim === '1200', d.horim);
    ok('o combustível voltou', d.comb === '80', d.comb);
    ok('as observações voltaram', d.obs === 'frente da Astrogildo', d.obs);
    ok('a parada lançada voltou, com o motivo', d.paradas === 1 && d.motivo === 'Almoço', d.paradas + ' / ' + d.motivo);
    ok('e as horas apuradas voltaram calculadas', d.horas === '9.00', d.horas);
    /* O <select> de equipamentos é preenchido DEPOIS, pelo servidor: repor o
       valor no boot não pegaria, porque o <option> ainda não existe. Ele
       espera a lista chegar (equipPendente). */
    ok('o equipamento voltou selecionado, mesmo vindo a lista do servidor',
       d.equipamento === 'Escavadeira CAT 320', d.equipamento);
    ok('a tela diz que recuperou o preenchimento', d.aviso === true, d.aviso);
    ok('sem erro de página', erros.length === 0, erros.slice(0, 3).join(' ; '));
    await ctx.close();
  }

  // ------------------------------------------------------------------
  // Formulário em branco não vira rascunho: senão toda abertura mostraria a
  // faixa de "recuperei" sem ter recuperado nada.
  console.log('\nTELA EM BRANCO NÃO GUARDA RASCUNHO');
  {
    const ctx = await novoContexto(b);
    const { p, erros } = await abrir(ctx, 'botafora');
    await p.waitForSelector('#bfForm', { timeout: 15000 });
    await p.waitForTimeout(600);
    await aparelhoDescartaEReabre(p);
    await p.evaluate(() => { STATE.cargaFalhou = false; STATE.loaded = true; navigate('botafora'); });
    await p.waitForSelector('#bfForm', { timeout: 15000 });
    await p.waitForTimeout(1000);
    ok('não aparece faixa de recuperação numa tela que ninguém preencheu',
       await p.evaluate(() => document.getElementById('bfRascunho').style.display === 'none'));
    ok('sem erro de página', erros.length === 0, erros.slice(0, 3).join(' ; '));
    await ctx.close();
  }

  await b.close();
  srv.kill();
  console.log(falhas ? `\n${falhas} falha(s).` : '\nTudo certo.');
  process.exit(falhas ? 1 : 0);
})();
