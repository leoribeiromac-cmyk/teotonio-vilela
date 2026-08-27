// A FOTO ESCOLHIDA É DAQUELE SERVIÇO, DAQUELA OBRA.
//
// O que apareceu no canteiro: a Galeria das Ruas de Terra mostrando fotos do
// Ranário — cartão com os dados das Ruas de Terra (o avulso, a estaca, o
// apontador) e, dentro dele, a imagem de outra obra, carimbada com o texto
// de lá.
//
// A causa não estava na Galeria, que só desenha o que a linha do serviço
// aponta. Estava em quem escolhe a foto: `_fotosPorServico` é um mapa em
// memória cuja chave é a POSIÇÃO do serviço no formulário — '0', '1', 'o0'.
// Essa posição existe igual em toda obra, e o mapa não era zerado ao trocar
// de obra (o rascunho era). Então a foto escolhida no Ranário e não gravada
// ficava pendurada na posição, reaparecia no serviço de mesma posição das
// Ruas de Terra e subia ligada a ELE.
//
// O mesmo mapa erra dentro de UMA obra: tirar um serviço do meio da lista
// faz os de baixo subirem uma posição, e as fotos, paradas na chave antiga,
// passavam a pertencer ao serviço que tomou o lugar.
//
// Como rodar:  node tests/foto-fica-na-obra.ui.test.js
//   (sobe o próprio servidor; não depende do 8099)
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const PORTA = 8134;
const BASE = 'http://localhost:' + PORTA;

let falhas = 0;
const ok = (n, c, e) => { if (c) console.log('  ✓ ' + n); else { falhas++; console.log('  ✗ ' + n + (e !== undefined ? '  → ' + e : '')); } };

const srv = spawn('python3', ['-m', 'http.server', String(PORTA)], { cwd: RAIZ, stdio: 'ignore' });
process.on('exit', () => { try { srv.kill(); } catch (e) { } });

// Um JPEG de 1 px — o bastante para o caminho real da escolha de foto
// (compressão em canvas + carimbo queimado na imagem) rodar inteiro.
const JPG = Buffer.from(
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAP//////////////////////////////////////////' +
  '////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBAB' +
  'AAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=', 'base64');

/* Escolhe uma foto pelo caminho de verdade: o <input type=file> do serviço,
   como o apontador faz ao anexar do celular. */
async function anexarFoto(p, chave) {
  await p.setInputFiles('#fotoArq' + chave,
    { name: 'obra.jpg', mimeType: 'image/jpeg', buffer: JPG });
  await p.waitForTimeout(700);   // compressão + carimbo são assíncronos
}

const fotosDe = (p, chave) => p.evaluate(k => (_fotosPorServico[k] || []).length, chave);
const previasNaTela = (p, chave) =>
  p.$$eval('#fotosPrev' + chave + ' img', els => els.length).catch(() => -1);

async function abrirLancamento(p) {
  await p.evaluate(() => {
    STATE.cargaFalhou = false; STATE.loaded = true;
    navigate('rdo');
  });
  await p.waitForTimeout(400);
}

// Cria um serviço avulso e devolve a chave de foto dele ('o0', 'o1'…).
async function novoAvulso(p, descricao) {
  const i = await p.evaluate(d => {
    adicionarOutroServico();
    const n = STATE.draft.outrosServicos.length - 1;
    STATE.draft.outrosServicos[n].descricao = d;
    return n;
  }, descricao);
  await p.waitForTimeout(300);
  return 'o' + i;
}

(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  const p = await ctx.newPage();

  const erros = [];
  p.on('pageerror', e => erros.push('PAGEERROR: ' + e.message));
  p.on('console', m => {
    const t = m.text();
    if (m.type() === 'error' && !/Failed to load resource|net::/.test(t)) erros.push('CONSOLE: ' + t);
  });

  await ctx.route('**script.google*.com/**', r => {
    const cb = new URL(r.request().url()).searchParams.get('callback');
    const c = { ok: true };
    r.fulfill({ status: 200, contentType: 'application/javascript',
                body: cb ? `${cb}(${JSON.stringify(c)})` : JSON.stringify(c) });
  });
  await ctx.route('**docs.google.com/**', r => r.fulfill({ status: 200, contentType: 'text/csv', body: '' }));

  await p.goto(BASE + '/index.html', { waitUntil: 'load' });
  await p.waitForTimeout(600);
  // Entra como engenharia: a tela de lançamento é de quem lança.
  await p.evaluate(() => {
    localStorage.setItem('teotonio_user', 'Rafael');
    localStorage.setItem('teotonio_perfil_v1', 'engenharia');
    localStorage.setItem('teotonio_token_v1', 'tok-falso');
  });
  await p.reload({ waitUntil: 'load' });
  await p.waitForTimeout(900);

  // ------------------------------------------------------------------
  console.log('\nA FOTO ESCOLHIDA NO RANÁRIO NÃO ATRAVESSA A TROCA DE OBRA');
  await p.evaluate(() => trocarObra('ranario'));
  await p.waitForTimeout(700);
  await abrirLancamento(p);
  const chaveRan = await novoAvulso(p, 'teste');
  await anexarFoto(p, chaveRan);
  ok('a foto entra no serviço avulso do Ranário', await fotosDe(p, chaveRan) === 1,
     await fotosDe(p, chaveRan));
  ok('e aparece na prévia da tela', await previasNaTela(p, chaveRan) === 1,
     await previasNaTela(p, chaveRan));

  await p.evaluate(() => trocarObra('ruas-de-terra'));
  await p.waitForTimeout(700);
  ok('a obra aberta agora é a das Ruas de Terra',
     await p.evaluate(() => OBRA.id) === 'ruas-de-terra', await p.evaluate(() => OBRA.id));
  ok('e nenhuma foto sobrou pendurada em posição nenhuma',
     await p.evaluate(() => Object.keys(_fotosPorServico).length) === 0,
     await p.evaluate(() => JSON.stringify(Object.keys(_fotosPorServico))));

  await abrirLancamento(p);
  const chaveRdt = await novoAvulso(p, 'Compactação rolo pé de carneiro');
  ok('o avulso das Ruas de Terra nasce SEM foto', await fotosDe(p, chaveRdt) === 0,
     await fotosDe(p, chaveRdt));
  ok('e a prévia da tela também está vazia', await previasNaTela(p, chaveRdt) === 0,
     await previasNaTela(p, chaveRdt));

  // Some em silêncio é o que não pode: quem escolheu precisa saber.
  const aviso = await p.evaluate(() =>
    [...document.querySelectorAll('.toast, #toastBox, [class*=toast]')]
      .map(e => e.textContent).join(' | '));
  ok('a troca avisa que a foto não gravada ficou para trás',
     /foto\(s\) escolhida\(s\)/i.test(aviso), aviso.slice(0, 160));

  // ------------------------------------------------------------------
  console.log('\nDENTRO DA OBRA, A FOTO SEGUE O SERVIÇO QUE MUDA DE POSIÇÃO');
  // Dois avulsos; a foto é do SEGUNDO. Some o primeiro: o segundo passa a
  // ocupar a posição 0 — e a foto tem de ir com ele.
  await p.evaluate(() => { STATE.draft.outrosServicos = []; limparFotosDoFormulario(); });
  const a0 = await novoAvulso(p, 'primeiro avulso');
  const a1 = await novoAvulso(p, 'segundo avulso — este é o da foto');
  await anexarFoto(p, a1);
  ok('a foto está no segundo avulso', await fotosDe(p, a1) === 1, await fotosDe(p, a1));

  await p.evaluate(() => removerOutroServico(0));
  await p.waitForTimeout(400);
  const sobrou = await p.evaluate(() => STATE.draft.outrosServicos.map(o => o.descricao));
  ok('sobrou só o segundo avulso', sobrou.length === 1 && /este é o da foto/.test(sobrou[0]),
     JSON.stringify(sobrou));
  ok('e a foto desceu junto com ele, para a posição 0', await fotosDe(p, a0) === 1,
     await fotosDe(p, a0));
  ok('sem sobrar cópia na posição antiga', await fotosDe(p, a1) === 0, await fotosDe(p, a1));

  // ------------------------------------------------------------------
  console.log('\nA OBRA VAI JUNTO COM A FOTO PARA O SERVIDOR');
  const params = await p.evaluate(() => {
    // O que `enviarFotosDoLote` monta é o que o servidor usa para achar a
    // linha. Sem a obra ali, o id sozinho pode casar com a linha de outra.
    const fonte = String(enviarFotosDoLote);
    return { temObra: /obra:\s*OBRA\.id/.test(fonte) };
  });
  ok('o envio da foto declara a obra', params.temObra === true, JSON.stringify(params));

  ok('nenhum erro de JavaScript no caminho todo', erros.length === 0, erros.slice(0, 3).join(' ; '));

  await b.close();
  console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTudo certo.');
  process.exit(falhas ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
