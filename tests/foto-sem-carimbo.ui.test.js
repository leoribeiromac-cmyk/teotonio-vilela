// A FOTO SEM CARIMBO — no app de verdade
//
// O carimbo é queimado NA IMAGEM (é o que o faz sobreviver a download,
// e-mail, impressão e PDF — e por isso vale como prova). O preço é que a
// mesma foto não servia mais para relatório, ofício ou apresentação: a
// versão limpa deixava de existir no instante em que a tarja era desenhada,
// ainda dentro do aparelho.
//
// Agora há dois caminhos até ela, e este teste roda os dois no app real:
//
//   1. A ORIGINAL, guardada junto: ao escolher a foto, o app fica com a
//      versão sem carimbo e a manda para o Drive ao lado da carimbada.
//   2. O RECORTE, para o acervo que já subiu carimbado — dali a original
//      não existe em lugar nenhum, e o que dá para devolver é a foto sem a
//      faixa, achando o filete de acento que o próprio app desenhou.
//
// E a trava que importa: um horizonte liso NÃO pode ser confundido com
// carimbo. Recortar foto que não tem tarja seria comer pedaço de prova.
//
// Como rodar:  node tests/foto-sem-carimbo.ui.test.js
//   (sobe o próprio servidor; não depende do 8099)
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const PORTA = 8137;
const BASE = 'http://localhost:' + PORTA;

let falhas = 0;
const ok = (n, c, e) => { if (c) console.log('  ✓ ' + n); else { falhas++; console.log('  ✗ ' + n + (e !== undefined ? '  → ' + e : '')); } };

const srv = spawn('python3', ['-m', 'http.server', String(PORTA)], { cwd: RAIZ, stdio: 'ignore' });
process.on('exit', () => { try { srv.kill(); } catch (e) {} });

(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const p = await b.newPage({ viewport: { width: 1380, height: 900 } });
  const erros = [];
  p.on('pageerror', e => erros.push('PAGEERROR: ' + e.message));

  const posts = [];
  // O "Drive" do teste: a mesma foto em duas versões, para provar QUAL delas
  // cada caminho traz. Mora aqui no Node porque é a rota que responde.
  const DRIVE_FALSO = {};
  await p.route('**://script.google.com/**', (route) => {
    const req = route.request();
    if (req.method() === 'POST') {
      posts.push(req.postData() || '');
      return route.fulfill({ status: 200, contentType: 'application/json',
                             body: JSON.stringify({ ok: true, fileId: 'F1', fileIdLimpa: 'L1' }) });
    }
    const u = new URL(req.url());
    const acao = u.searchParams.get('action');
    const cb = u.searchParams.get('callback');
    let corpo;
    if (acao === 'login') corpo = { ok: true, usuario: 'Leonardo', perfil: 'admin', token: 't', obras: '*' };
    else if (acao === 'usuariosNomes') corpo = { ok: true, usuarios: ['Leonardo'] };
    else if (acao === 'obterFoto') {
      // Duas imagens diferentes no "Drive": a carimbada e a limpa. É o que
      // permite provar QUAL delas o botão trouxe.
      corpo = { ok: true, mini: false, dataUri: DRIVE_FALSO[u.searchParams.get('fileId')] || '' };
    }
    else corpo = { ok: true };
    route.fulfill({ status: 200, contentType: 'application/javascript', body: `${cb}(${JSON.stringify(corpo)})` });
  });
  await p.route('**://docs.google.com/**', r => r.fulfill({ status: 200, body: '' }));

  await p.goto(BASE + '/index.html', { waitUntil: 'load' });
  await p.waitForTimeout(1200);
  await p.evaluate(() => navigate('rdo'));
  await p.waitForSelector('#loginBtn', { timeout: 8000 });
  await p.evaluate(async () => {
    (document.getElementById('loginUser') || document.getElementById('loginUserSelect')).value = 'Leonardo';
    document.getElementById('loginPass').value = 'x';
    await fazerLogin();
  });
  await p.waitForTimeout(500);

  // ------------------------------------------------------------------
  console.log('\nO PONTEIRO GUARDA AS DUAS VERSÕES');
  const ponteiros = await p.evaluate(() => ({
    novoCarimbada: fotoFileId('drive_id:AAA111|BBB222'),
    novoLimpa:     fotoLimpaId('drive_id:AAA111|BBB222'),
    velhoCarimbada: fotoFileId('drive_id:AAA111'),
    velhoLimpa:     fotoLimpaId('drive_id:AAA111'),
    naLinha: fotosDaLinha({ foto_link: 'drive_id:AAA111|BBB222 drive_id:CCC333' }).length
  }));
  ok('o app lê a foto carimbada no ponteiro novo', ponteiros.novoCarimbada === 'AAA111', ponteiros.novoCarimbada);
  ok('e lê a limpa na segunda metade', ponteiros.novoLimpa === 'BBB222', ponteiros.novoLimpa);
  ok('ponteiro velho (uma versão só) continua valendo', ponteiros.velhoCarimbada === 'AAA111', ponteiros.velhoCarimbada);
  ok('e nele não há limpa nenhuma para prometer', ponteiros.velhoLimpa === '', ponteiros.velhoLimpa);
  ok('duas fotos na mesma célula continuam sendo duas', ponteiros.naLinha === 2, ponteiros.naLinha);

  // ------------------------------------------------------------------
  console.log('\nRECORTAR A TARJA — o acervo que já subiu carimbado');
  const recorte = await p.evaluate(async () => {
    const exemplo = cbImagemExemplo();
    const dados = { data: '27/08/2026', hora: '09:14', frente: 'Pavimentação',
                    pacote: 'CBUQ Binder', estaca: 'E118 a E121', apontador: 'Wallace',
                    coord: '-23.678901, -46.712345  ±8m' };
    const alturaDe = uri => new Promise(res => { const i = new Image(); i.onload = () => res(i.height); i.src = uri; });

    const cfg = Object.assign({}, CARIMBO_PADRAO, { ligado: true, posicao: 'inferior' });
    const rodape = await desenharCarimbo(exemplo, dados, cfg);
    const topo = await desenharCarimbo(exemplo, dados, Object.assign({}, cfg, { posicao: 'superior' }));

    const rr = await recortarCarimbo(rodape);
    const rt = await recortarCarimbo(topo);
    const semCarimbo = await recortarCarimbo(exemplo);

    // A prova de que a tarja saiu: procurar de novo na foto já recortada.
    const aindaTemTarja = async (uri) => {
      const img = await new Promise(res => { const i = new Image(); i.onload = () => res(i); i.src = uri; });
      const c = document.createElement('canvas');
      c.width = img.width; c.height = img.height;
      const g = c.getContext('2d', { willReadFrequently: true });
      g.drawImage(img, 0, 0);
      return !!acharTarjaDoCarimbo(g.getImageData(0, 0, img.width, img.height).data, img.width, img.height);
    };

    return {
      alturaOriginal: await alturaDe(exemplo),
      rodape: rr && { altura: await alturaDe(rr.uri), pct: rr.pct, sobrou: await aindaTemTarja(rr.uri) },
      topo: rt && { altura: await alturaDe(rt.uri), pct: rt.pct, sobrou: await aindaTemTarja(rt.uri) },
      semCarimbo
    };
  });
  ok('acha e recorta a tarja do rodapé', !!recorte.rodape, JSON.stringify(recorte.rodape));
  ok('a foto fica mais baixa (é o pedaço que o carimbo comeu)',
     !!recorte.rodape && recorte.rodape.altura < recorte.alturaOriginal && recorte.rodape.altura > recorte.alturaOriginal * 0.6,
     recorte.rodape && recorte.rodape.altura + ' de ' + recorte.alturaOriginal);
  ok('e a tarja não sobrou na foto recortada', !!recorte.rodape && recorte.rodape.sobrou === false);
  ok('acha e recorta também a tarja do topo', !!recorte.topo && recorte.topo.sobrou === false,
     JSON.stringify(recorte.topo));
  ok('FOTO SEM CARIMBO NÃO É RECORTADA (horizonte liso não é tarja)',
     recorte.semCarimbo === null, JSON.stringify(recorte.semCarimbo));

  // ------------------------------------------------------------------
  console.log('\nA ORIGINAL É GUARDADA AO ESCOLHER A FOTO');
  const exemploUri = await p.evaluate(() => cbImagemExemplo());
  const JPG = Buffer.from(exemploUri.split(',')[1], 'base64');

  await p.evaluate(() => { STATE.cargaFalhou = false; STATE.loaded = true; navigate('rdo'); });
  await p.waitForTimeout(500);
  const chave = await p.evaluate(() => {
    adicionarOutroServico();
    const n = STATE.draft.outrosServicos.length - 1;
    STATE.draft.outrosServicos[n].descricao = 'Serviço de teste';
    return 'o' + n;
  });
  await p.waitForTimeout(300);

  const anexar = async () => {
    await p.setInputFiles('#fotoArq' + chave, { name: 'obra.jpg', mimeType: 'image/jpeg', buffer: JPG });
    await p.waitForTimeout(900);
    return p.evaluate(k => {
      const f = (_fotosPorServico[k] || [])[0] || {};
      return { temLimpa: !!f.limpa, igualACarimbada: f.limpa === f.full };
    }, chave);
  };

  await p.evaluate(() => carimboSalvar(Object.assign(carimboCfg(), { ligado: true, guardarLimpa: true })));
  let r = await anexar();
  ok('com o carimbo ligado, a foto guarda a versão limpa', r.temLimpa);
  ok('e a limpa não é a mesma imagem da carimbada', r.temLimpa && !r.igualACarimbada);

  await p.evaluate(k => { delete _fotosPorServico[k]; }, chave);
  await p.evaluate(() => carimboSalvar(Object.assign(carimboCfg(), { ligado: true, guardarLimpa: false })));
  r = await anexar();
  ok('desligado "guardar a original", nada de segunda versão (é o dobro de envio)', !r.temLimpa);

  await p.evaluate(k => { delete _fotosPorServico[k]; }, chave);
  await p.evaluate(() => carimboSalvar(Object.assign(carimboCfg(), { ligado: false, guardarLimpa: true })));
  r = await anexar();
  ok('sem carimbo nenhum, também não sobe duas vezes a MESMA imagem', !r.temLimpa);
  await p.evaluate(() => carimboSalvar(Object.assign(carimboCfg(), { ligado: true, guardarLimpa: true })));

  // ------------------------------------------------------------------
  console.log('\nA ORIGINAL SOBE JUNTO COM A CARIMBADA');
  posts.length = 0;
  await p.evaluate(() => enviarFotosDoLote({ 'svc-1': [
    { full: 'data:image/jpeg;base64,QUFB', limpa: 'data:image/jpeg;base64,QkJC', cid: 'c1', lat: '', lon: '' }
  ] }, 0));
  ok('o envio carrega as duas versões no mesmo POST',
     posts.length === 1 && /name="foto"/.test(posts[0]) && /name="fotoLimpa"/.test(posts[0]),
     posts.length + ' post(s)');
  ok('e a limpa vai com o conteúdo certo', posts.length === 1 && posts[0].indexOf('QkJC') > -1);

  // ------------------------------------------------------------------
  // A fila offline é o caminho de quem está SEM SINAL — o mais comum no
  // canteiro. Ela passou a carregar as duas versões, e num aparelho com a
  // memória no fim isso pode ser a diferença entre caber e não caber. Aí a
  // limpa cai, e a foto que PROVA continua indo.
  console.log('\nNA FILA OFFLINE, A PROVA VEM ANTES DA VERSÃO DE ENFEITE');
  const fila = await p.evaluate(async () => {
    const original = window.outboxAdicionar;
    const tentativas = [];
    try {
      // aparelho com espaço: passa de primeira, com as duas versões
      window.outboxAdicionar = async (item) => { tentativas.push(item.params.fotoLimpa); return true; };
      const comEspaco = await fotoParaAFila('svc-1', 0, { full: 'F', limpa: 'L', cid: 'c1' });

      // aparelho lotado: o par não cabe, a carimbada sozinha cabe
      tentativas.length = 0;
      window.outboxAdicionar = async (item) => { if (item.params.fotoLimpa) return false; tentativas.push('so-a-carimbada'); return true; };
      const semEspaco = await fotoParaAFila('svc-1', 0, { full: 'F', limpa: 'L', cid: 'c1' });
      const guardadoNoAperto = tentativas.slice();

      // aparelho sem espaço nenhum: nem a carimbada cabe, e o app tem de saber
      window.outboxAdicionar = async () => false;
      const nemUma = await fotoParaAFila('svc-1', 0, { full: 'F', limpa: 'L', cid: 'c1' });
      return { comEspaco, semEspaco, guardadoNoAperto, nemUma };
    } finally { window.outboxAdicionar = original; }
  });
  ok('com espaço, a fila leva as duas versões', fila.comEspaco === true);
  ok('sem espaço para o par, a carimbada vai sozinha — e a foto não se perde',
     fila.semEspaco === true && fila.guardadoNoAperto.length === 1, JSON.stringify(fila));
  ok('sem espaço nenhum, o app não mente dizendo que guardou', fila.nemUma === false);

  // ------------------------------------------------------------------
  console.log('\nBAIXAR SEM CARIMBO — os dois caminhos');
  const imagens = await p.evaluate(async () => {
    const exemplo = cbImagemExemplo();
    const carimbada = await desenharCarimbo(exemplo, { data: '27/08/2026', hora: '09:14',
      frente: 'Pavimentação', pacote: 'CBUQ', estaca: 'E118', apontador: 'Wallace' },
      Object.assign({}, CARIMBO_PADRAO, { ligado: true }));
    return { exemplo, carimbada };
  });
  DRIVE_FALSO.COMCARIMBO = imagens.carimbada;
  DRIVE_FALSO.ORIGINAL = imagens.exemplo;

  const caminhos = await p.evaluate(async (original) => {
    const comOriginal = await fotoSemCarimbo('COMCARIMBO', 'ORIGINAL');
    const soCarimbada = await fotoSemCarimbo('COMCARIMBO', '');
    return {
      comOriginal: comOriginal && comOriginal.modo,
      igualAoOriginal: !!comOriginal && comOriginal.uri === original,
      soCarimbada: soCarimbada && soCarimbada.modo,
      pct: soCarimbada && soCarimbada.pct
    };
  }, imagens.exemplo);
  ok('quando a original existe, é ELA que vem — inteira', caminhos.comOriginal === 'original' && caminhos.igualAoOriginal,
     JSON.stringify(caminhos));
  ok('quando não existe, vem o recorte (e diz quanto se perdeu)',
     caminhos.soCarimbada === 'recorte' && caminhos.pct > 0, JSON.stringify(caminhos));

  // ------------------------------------------------------------------
  console.log('\nOS BOTÕES ESTÃO NA GALERIA');
  await p.evaluate(() => {
    STATE.rdoavanco = [{ ID: 'r1', Data: '2026-08-27', Turno: 'Diurno', Pacote_Nome: 'CBUQ',
                         Pacote_ID: 'P26', Local_Estaca: 'E118', Quantidade: '10', Unidade: 'm2',
                         Apontador: 'Wallace', foto_link: 'drive_id:COMCARIMBO|ORIGINAL' }];
    navigate('galeria');
  });
  await p.waitForSelector('[id^="galbox-"]', { timeout: 8000 });
  const naGaleria = await p.evaluate(() => ({
    lote: !!document.querySelector('button[onclick*="galBaixarSemCarimbo"]'),
    passaALimpa: /ampliarFoto\('COMCARIMBO','CBUQ','ORIGINAL'\)/.test(document.body.innerHTML)
  }));
  ok('a barra da Galeria oferece baixar o lote sem carimbo', naGaleria.lote);
  ok('e cada quadro leva o id da versão limpa para o visualizador', naGaleria.passaALimpa);

  await p.evaluate(() => ampliarFoto('COMCARIMBO', 'CBUQ', 'ORIGINAL'));
  await p.waitForTimeout(400);
  const noVisualizador = await p.evaluate(() =>
    [...document.querySelectorAll('#fotoAmpAcoes button')].map(b => b.textContent.trim()));
  ok('ampliar oferece baixar com e sem carimbo',
     noVisualizador.length === 2 && /sem carimbo/.test(noVisualizador[1]), JSON.stringify(noVisualizador));

  ok('nenhum erro de JavaScript no caminho todo', erros.length === 0, erros.slice(0, 3).join(' | '));

  await b.close();
  srv.kill();
  console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTudo certo.');
  process.exit(falhas ? 1 : 0);
})();
