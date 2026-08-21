// O FORMULÁRIO NÃO PODE SER APAGADO POR BAIXO DE QUEM ESTÁ PREENCHENDO.
//
// `render()` reconstrói a página inteira do zero. Numa tela de consulta é o
// que se quer; numa de formulário, é apagar o trabalho de quem está no meio
// dele. E a carga de fundo chama `render()` sozinha — pelo temporizador de
// 5 minutos, pelo evento `online` e, o que mais dói, pelo `visibilitychange`.
//
// O caso que trouxe isto à luz veio do canteiro: no Bota-Fora, o apontador
// preenchia a viagem, tocava em "Tirar" e o celular abria a câmera. Ao voltar,
// o navegador dispara `visibilitychange`, o app ressincroniza — e a viagem
// inteira, INCLUSIVE a foto recém-tirada, sumia da tela. Ele voltava da câmera
// para um formulário em branco, com o caminhão esperando.
//
// A guarda que existia não pegava: ela olhava se havia campo FOCADO, e o dedo
// estava na câmera, não no teclado. Nos Equipamentos era o mesmo — um turno
// inteiro de apontamento, com paradas e horas apuradas, apagado.
//
// Este teste dispara o mesmo `visibilitychange` que o retorno da câmera
// dispara, nas duas telas, e confere que nada se perde.
//
// Como rodar:  node tests/formulario-nao-se-apaga.ui.test.js
//   (sobe o próprio servidor; não depende do 8099)
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const PORTA = 8130;
const BASE = 'http://localhost:' + PORTA;

let falhas = 0;
const ok = (n, c, e) => { if (c) console.log('  ✓ ' + n); else { falhas++; console.log('  ✗ ' + n + (e !== undefined ? '  → ' + e : '')); } };

const srv = spawn('python3', ['-m', 'http.server', String(PORTA)], { cwd: RAIZ, stdio: 'ignore' });
process.on('exit', () => { try { srv.kill(); } catch (e) { } });

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR42mP8z8BQz0AEYBxVSF+FAP2FBPhML7VJAAAAAElFTkSuQmCC',
  'base64');

async function abrir(navegador) {
  const ctx = await navegador.newContext({ viewport: { width: 400, height: 860 }, isMobile: true, hasTouch: true });
  await ctx.route('**script.google*.com/**', r => {
    const u = new URL(r.request().url());
    const cb = u.searchParams.get('callback');
    const a = u.searchParams.get('action') || '';
    let c = { ok: true };
    if (a === 'login') c = { ok: true, usuario: 'Wallace', perfil: 'admin', token: 't', obras: '*' };
    else if (a === 'usuariosNomes') c = { ok: true, usuarios: ['Wallace'] };
    else if (a === 'equipListar') c = { ok: true, equipamentos: [{ nome: 'Escavadeira CAT 320', tipo: 'Linha Amarela' }], locadoras: [] };
    else if (a === 'bfListar') c = { ok: true, viagens: [] };
    r.fulfill({ status: 200, contentType: 'application/javascript', body: cb ? `${cb}(${JSON.stringify(c)})` : JSON.stringify(c) });
  });
  // CSV com uma linha: a carga de fundo precisa TERMINAR BEM para chegar ao
  // `render()`. Devolver vazio faria a carga falhar e o teste passaria por
  // um motivo errado.
  await ctx.route('**docs.google.com/**', r => r.fulfill({ status: 200, contentType: 'text/csv', body: 'id,Data\r\nr1,2026-07-01\r\n' }));
  const p = await ctx.newPage();
  const erros = [];
  p.on('pageerror', e => erros.push(e.message));
  await p.goto(BASE + '/index.html', { waitUntil: 'load' });
  await p.waitForTimeout(900);
  await p.evaluate(() => navigate('rdo'));
  await p.waitForSelector('#loginBtn', { timeout: 15000 });
  await p.evaluate(async () => {
    (document.getElementById('loginUser') || document.getElementById('loginUserSelect')).value = 'Wallace';
    document.getElementById('loginPass').value = 'x';
    await fazerLogin();
  });
  await p.waitForTimeout(700);
  return { p, erros };
}

/* O mesmo evento que o navegador dispara quando o app volta para a frente —
   fechar a câmera, tirar o celular do bolso, voltar de outro aplicativo. */
async function voltarParaOApp(p) {
  await p.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await p.waitForTimeout(2500);
}

(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });

  // ------------------------------------------------------------------
  console.log('\nBOTA-FORA — a viagem sobrevive à ida à câmera');
  {
    const { p, erros } = await abrir(b);
    await p.evaluate(() => { STATE.cargaFalhou = false; STATE.loaded = true; navigate('botafora'); });
    await p.waitForSelector('#bfForm', { timeout: 15000 });
    await p.waitForTimeout(500);
    await p.evaluate(() => {
      const s = (i, v) => { const e = document.getElementById(i); if (e) e.value = v; };
      s('bfPlaca', 'EFU-7H47'); s('bfMotorista', 'ARI'); s('bfFornecedor', 'SLT');
      s('bfValor', '900,00'); s('bfOrigem', 'Ijucapirama'); s('bfDestino', 'Itaquareia');
      s('bfObs', 'carga cheia');
    });
    // "Tirar" abre a câmera traseira; o arquivo volta por este input.
    await p.setInputFiles('#bfArqcargaCam', { name: 'carga.png', mimeType: 'image/png', buffer: PNG });
    await p.waitForTimeout(700);

    const antes = await p.evaluate(() => ({
      placa: document.getElementById('bfPlaca').value,
      motorista: document.getElementById('bfMotorista').value,
      fornecedor: document.getElementById('bfFornecedor').value,
      valor: document.getElementById('bfValor').value,
      obs: document.getElementById('bfObs').value,
      foto: !!document.querySelector('#bfPrevcarga img'),
    }));
    ok('a viagem está preenchida e a foto anexada',
       antes.placa === 'EFU-7H47' && antes.foto, JSON.stringify(antes));

    await voltarParaOApp(p);

    const depois = await p.evaluate(() => ({
      placa: document.getElementById('bfPlaca').value,
      motorista: document.getElementById('bfMotorista').value,
      fornecedor: document.getElementById('bfFornecedor').value,
      valor: document.getElementById('bfValor').value,
      obs: document.getElementById('bfObs').value,
      foto: !!document.querySelector('#bfPrevcarga img'),
    }));
    ok('a placa continua lá', depois.placa === antes.placa, depois.placa);
    ok('o motorista continua lá', depois.motorista === antes.motorista, depois.motorista);
    ok('o fornecedor continua lá', depois.fornecedor === antes.fornecedor, depois.fornecedor);
    ok('o valor do frete continua lá', depois.valor === antes.valor, depois.valor);
    ok('as observações continuam lá', depois.obs === antes.obs, depois.obs);
    ok('e A FOTO recém-tirada continua anexada', depois.foto === true, depois.foto);
    ok('sem erro de página', erros.length === 0, erros.slice(0, 3).join(' ; '));
    await p.context().close();
  }

  // ------------------------------------------------------------------
  console.log('\nEQUIPAMENTOS — o apontamento sobrevive ao mesmo caminho');
  {
    const { p, erros } = await abrir(b);
    await p.evaluate(() => { STATE.cargaFalhou = false; STATE.loaded = true; navigate('equip'); });
    await p.waitForSelector('#apontamentoForm', { timeout: 15000 });
    await p.waitForTimeout(600);
    await p.evaluate(() => {
      const s = (i, v) => { const e = document.getElementById(i); if (e) e.value = v; };
      s('operador', 'Genilson Rocha'); s('inicio', '07:00'); s('fim', '17:00');
      s('horimInicial', '1200'); s('horimFinal', '1209'); s('combustivel', '80');
      s('observacoesUI', 'frente da Astrogildo');
      EQ.adicionarParada('Almoço', '12:00', '13:00');
      EQ.calcularHoras();
    });
    await p.waitForTimeout(400);
    const antes = await p.evaluate(() => ({
      operador: document.getElementById('operador').value,
      horim: document.getElementById('horimInicial').value,
      obs: document.getElementById('observacoesUI').value,
      paradas: document.querySelectorAll('#paradasList .parada-row').length,
      horas: document.getElementById('horas').value,
    }));
    ok('o apontamento está preenchido, com parada e horas apuradas',
       antes.paradas === 1 && antes.horas === '9.00', JSON.stringify(antes));

    await voltarParaOApp(p);

    const depois = await p.evaluate(() => ({
      operador: document.getElementById('operador').value,
      horim: document.getElementById('horimInicial').value,
      obs: document.getElementById('observacoesUI').value,
      paradas: document.querySelectorAll('#paradasList .parada-row').length,
      horas: document.getElementById('horas').value,
    }));
    ok('o operador continua lá', depois.operador === antes.operador, depois.operador);
    ok('o horímetro continua lá', depois.horim === antes.horim, depois.horim);
    ok('as observações continuam lá', depois.obs === antes.obs, depois.obs);
    ok('a parada lançada continua lá', depois.paradas === 1, depois.paradas);
    ok('e as horas apuradas não voltaram a zero', depois.horas === '9.00', depois.horas);
    ok('sem erro de página', erros.length === 0, erros.slice(0, 3).join(' ; '));
    await p.context().close();
  }

  // ------------------------------------------------------------------
  // A guarda vale para quem PREENCHE. Tela de consulta tem de continuar
  // recebendo dado novo sozinha — senão o conserto vira outro defeito.
  console.log('\nTELA DE CONSULTA CONTINUA SE ATUALIZANDO SOZINHA');
  {
    const { p, erros } = await abrir(b);
    await p.evaluate(() => { STATE.cargaFalhou = false; STATE.loaded = true; navigate('historico'); });
    await p.waitForTimeout(1200);
    await p.evaluate(() => { window.__redesenhou = false; const r = window.render; window.render = function () { window.__redesenhou = true; return r.apply(this, arguments); }; });
    await voltarParaOApp(p);
    ok('o Histórico se redesenha ao voltar para o app',
       await p.evaluate(() => window.__redesenhou === true));
    ok('sem erro de página', erros.length === 0, erros.slice(0, 3).join(' ; '));
    await p.context().close();
  }

  await b.close();
  srv.kill();
  console.log(falhas ? `\n${falhas} falha(s).` : '\nTudo certo.');
  process.exit(falhas ? 1 : 0);
})();
