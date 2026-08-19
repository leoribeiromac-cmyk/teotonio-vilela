// CONTROLE DE BOTA-FORA — a viagem de caminhão que sai do canteiro.
//
// A tela só vale se as três coisas abaixo forem verdade ao mesmo tempo:
//
//  • AS PROVAS VIAJAM COM A VIAGEM. Foto da carga/placa, assinatura do
//    motorista e foto do ticket. Sem elas, a fatura do transportador é
//    palavra contra palavra — que é exatamente o problema que este controle
//    veio resolver. Se alguma prova cair no caminho entre a tela e o
//    servidor, o registro perde a razão de existir.
//  • A PLANILHA SAI NO FORMATO DO FECHAMENTO. A contabilidade cola o que
//    vem daqui na aba FRETE do "SLT GERAL". Coluna fora de ordem, data em
//    texto ou valor em texto obrigam a refazer tudo à mão — e aí o
//    escritório volta para o maço de tickets.
//  • SEM SINAL, A VIAGEM NÃO SE PERDE. Bota-fora se registra na boca da
//    obra, que é onde o 4G falha. O que não entra na fila, o apontador
//    perde de vez: o caminhão já foi embora.
//
// Como rodar:  node tests/bota-fora.ui.test.js
//   (sobe o próprio servidor; não depende do 8099)
const { chromium } = require('playwright');
const { spawn } = require('child_process');

const RAIZ = '/home/user/teotonio-vilela';
const PORTA = 8129;
const BASE = 'http://localhost:' + PORTA;

let falhas = 0;
const ok = (n, c, e) => { if (c) console.log('  ✓ ' + n); else { falhas++; console.log('  ✗ ' + n + (e !== undefined ? '  → ' + e : '')); } };

const srv = spawn('python3', ['-m', 'http.server', String(PORTA)], { cwd: RAIZ, stdio: 'ignore' });
const encerrar = () => { try { srv.kill(); } catch (e) { } };
process.on('exit', encerrar);

// PNG 2×2 de verdade — o `comprimirImg` do app carrega a imagem num <img>
// antes de redesenhar no canvas, então um buffer inventado não serviria.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR42mP8z8BQz0AEYBxVSF+FAP2FBPhML7VJAAAAAElFTkSuQmCC',
  'base64');

// Viagens que o "servidor" devolve na consulta — duas datas, dois materiais,
// e uma sem ticket, para a conferência ter o que apontar como falta.
const VIAGENS = [
  { id: 'bf1', obra: 'ruas-de-terra', data: '2026-07-14', fornecedor: 'SLT', placa: 'CLU-0J95',
    material: 'ENTULHO', servico: 'FRETE', projeto: 'RUAS DE TERRA 3', motorista: 'LUIZ',
    valor: 900, origem: 'IJUCAPIRAMA', destino: 'ITAQUAREIA', obs: '',
    fotoCarga: 'drive_id:aaa', assinatura: 'drive_id:bbb', fotoTicket: 'drive_id:ccc', usuario: 'Leonardo' },
  { id: 'bf2', obra: 'ruas-de-terra', data: '2026-07-15', fornecedor: 'SLT', placa: 'ETC-0C18',
    material: 'SOLO', servico: 'FRETE', projeto: 'RUAS DE TERRA 3', motorista: 'GENILSON',
    valor: 1250.5, origem: 'IJUCAPIRAMA', destino: 'ITAQUAREIA', obs: 'duas viagens de fresa',
    fotoCarga: 'drive_id:ddd', assinatura: '', fotoTicket: '', usuario: 'Leonardo' },
];

function camposDoPost(corpo) {
  const out = {};
  String(corpo || '').split(/------[^\r\n]*/).forEach(parte => {
    const m = parte.match(/name="([^"]+)"\r?\n\r?\n([\s\S]*?)\r?\n$/);
    if (m) out[m[1]] = m[2];
  });
  return out;
}

(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 950 } });
  const p = await ctx.newPage();

  const erros = [];
  p.on('pageerror', e => erros.push('PAGEERROR: ' + e.message));
  p.on('console', m => {
    const t = m.text();
    if (m.type() === 'error' && !/Failed to load resource|net::/.test(t)) erros.push('CONSOLE: ' + t);
  });

  const chamadas = [];          // { acao, campos }
  let derrubarRede = false;     // liga o cenário "sem sinal"
  await ctx.route('**script.google*.com/**', async rota => {
    const req = rota.request();
    const u = new URL(req.url());
    const cb = u.searchParams.get('callback');
    let acao = u.searchParams.get('action') || '';
    let campos = null;
    if (req.method() === 'POST') {
      campos = camposDoPost(req.postData());
      acao = campos.action || acao;
    } else {
      campos = Object.fromEntries(u.searchParams.entries());
    }
    chamadas.push({ acao, campos });
    if (derrubarRede && acao === 'bfSalvar') { await rota.abort('connectionfailed'); return; }
    let c = { ok: true };
    if (acao === 'login') c = { ok: true, usuario: 'Leonardo', perfil: 'admin', token: 't', obras: '*' };
    else if (acao === 'usuariosNomes') c = { ok: true, usuarios: ['Leonardo'] };
    else if (acao === 'bfListar') c = { ok: true, viagens: VIAGENS };
    else if (acao === 'bfSalvar') c = { ok: true, id: 'bf-novo' };
    await rota.fulfill({ status: 200, contentType: 'application/javascript',
                         body: cb ? `${cb}(${JSON.stringify(c)})` : JSON.stringify(c) });
  });
  await ctx.route('**docs.google.com/**', r => r.fulfill({ status: 200, contentType: 'text/csv', body: '' }));

  await p.goto(BASE + '/index.html', { waitUntil: 'load' });
  await p.waitForTimeout(1000);
  await p.evaluate(() => navigate('rdo'));
  await p.waitForSelector('#loginBtn', { timeout: 15000 });
  await p.evaluate(async () => {
    (document.getElementById('loginUser') || document.getElementById('loginUserSelect')).value = 'Leonardo';
    document.getElementById('loginPass').value = 'x';
    await fazerLogin();
  });
  await p.waitForTimeout(600);
  await p.evaluate(() => trocarObra('ruas-de-terra'));
  await p.waitForTimeout(800);

  // ------------------------------------------------------------------
  console.log('\nA TELA EXISTE E ESTÁ NO MENU');
  const noMenu = await p.evaluate(() =>
    [...document.querySelectorAll('.nav-item')].some(e => /Bota-Fora/.test(e.textContent)));
  ok('Bota-Fora aparece no menu de Operação', noMenu);
  await p.evaluate(() => navigate('botafora'));
  await p.waitForSelector('#bfForm', { timeout: 15000 });
  await p.waitForTimeout(400);
  ok('a tela abre com o formulário da viagem', await p.evaluate(() => !!document.getElementById('bfForm')));
  ok('e o cabeçalho nomeia a tela',
     await p.evaluate(() => document.getElementById('pageTitle').textContent) === 'Bota-Fora');
  const hoje = await p.evaluate(() => document.getElementById('bfData').value);
  ok('a data já vem preenchida com hoje', /^\d{4}-\d{2}-\d{2}$/.test(hoje), hoje);

  // ------------------------------------------------------------------
  console.log('\nAS TRÊS PROVAS');
  await p.setInputFiles('#bfArqcarga', { name: 'carga.png', mimeType: 'image/png', buffer: PNG });
  await p.waitForTimeout(500);
  await p.setInputFiles('#bfArqticket', { name: 'ticket.png', mimeType: 'image/png', buffer: PNG });
  await p.waitForTimeout(500);
  ok('a foto da carga/placa entra e aparece na tela',
     await p.evaluate(() => !!document.querySelector('#bfPrevcarga img')));
  ok('a foto do ticket entra e aparece na tela',
     await p.evaluate(() => !!document.querySelector('#bfPrevticket img')));

  // Assinatura: o traço é desenhado no canvas do modal, como o motorista faria.
  await p.evaluate(() => bfAbrirAssinatura());
  await p.waitForTimeout(400);
  const cv = await p.$('#bfCanvas');
  const box = await cv.boundingBox();
  await p.mouse.move(box.x + 30, box.y + box.height / 2);
  await p.mouse.down();
  await p.mouse.move(box.x + 120, box.y + box.height / 2 - 22, { steps: 8 });
  await p.mouse.move(box.x + 210, box.y + box.height / 2 + 18, { steps: 8 });
  await p.mouse.up();
  await p.evaluate(() => bfConfirmarAssinatura());
  await p.waitForTimeout(300);
  ok('a assinatura do motorista fica guardada',
     await p.evaluate(() => !!document.querySelector('#bfPrevassinatura img')));
  ok('e a tela reconhece as três provas',
     /três provas/i.test(await p.evaluate(() => document.getElementById('bfProvasEstado').textContent)),
     await p.evaluate(() => document.getElementById('bfProvasEstado').textContent));

  // Descartar uma prova tem de descartá-la de verdade.
  await p.evaluate(() => bfRemoverFoto('ticket'));
  await p.waitForTimeout(200);
  ok('remover a foto do ticket a tira mesmo',
     await p.evaluate(() => !document.querySelector('#bfPrevticket img')));
  await p.setInputFiles('#bfArqticket', { name: 'ticket.png', mimeType: 'image/png', buffer: PNG });
  await p.waitForTimeout(500);

  // ------------------------------------------------------------------
  console.log('\nREGISTRAR A VIAGEM');
  await p.evaluate(() => {
    document.getElementById('bfData').value = '2026-07-16';
    document.getElementById('bfPlaca').value = 'efu-7h47';
    document.getElementById('bfMotorista').value = 'ARI';
    document.getElementById('bfFornecedor').value = 'SLT';
    document.getElementById('bfMaterial').value = 'ENTULHO';
    document.getElementById('bfServico').value = 'FRETE';
    document.getElementById('bfProjeto').value = 'RUAS DE TERRA 3';
    // pt-BR de verdade: ponto de milhar e vírgula decimal
    document.getElementById('bfValor').value = '1.250,50';
    document.getElementById('bfOrigem').value = 'Ijucapirama';
    document.getElementById('bfDestino').value = 'Itaquareia';
    document.getElementById('bfObs').value = 'carga cheia';
    document.getElementById('bfForm').requestSubmit();
  });
  await p.waitForTimeout(500);
  const conf = await p.evaluate(() => ({
    aberto: getComputedStyle(document.getElementById('bfConfirmModal')).display !== 'none',
    valor: document.getElementById('bfcValor').textContent,
    trajeto: document.getElementById('bfcTrajeto').textContent,
    provas: document.getElementById('bfcProvas').textContent,
  }));
  ok('a conferência abre antes de gravar', conf.aberto);
  ok('e o valor é lido em pt-BR (1.250,50 → R$ 1.250,50)', /1\.250,50/.test(conf.valor), conf.valor);
  ok('o trajeto aparece na conferência', /Ijucapirama.*Itaquareia/.test(conf.trajeto), conf.trajeto);
  ok('e as três provas estão anunciadas', !/FALTA/.test(conf.provas), conf.provas);

  // Antes de gravar de verdade: um valor que não é número não pode virar
  // R$ 0,00 em silêncio — o `num()` do app devolve 0 para qualquer lixo.
  await p.evaluate(() => {
    BF.fechar('bfConfirmModal');
    document.getElementById('bfValor').value = 'novecentos reais';
    document.getElementById('bfForm').requestSubmit();
  });
  await p.waitForTimeout(400);
  ok('valor que não é número é recusado, em vez de virar R$ 0,00',
     await p.evaluate(() => getComputedStyle(document.getElementById('bfConfirmModal')).display === 'none'));
  await p.evaluate(() => {
    document.getElementById('bfValor').value = '1.250,50';
    document.getElementById('bfForm').requestSubmit();
  });
  await p.waitForTimeout(400);

  chamadas.length = 0;
  await p.evaluate(() => bfConfirmar());
  await p.waitForTimeout(1200);

  const salvou = chamadas.find(c => c.acao === 'bfSalvar');
  ok('a viagem é enviada como bfSalvar', !!salvou, JSON.stringify(chamadas.map(c => c.acao)));
  if (salvou) {
    const c = salvou.campos;
    ok('leva a obra aberta', c.obra === 'ruas-de-terra', c.obra);
    ok('leva a data', c.data === '2026-07-16', c.data);
    ok('a placa sobe em maiúsculas', c.placa === 'EFU-7H47', c.placa);
    ok('o valor sobe canônico, com ponto decimal', c.valor === '1250.5', c.valor);
    ok('leva o material e o tipo de serviço', c.material === 'ENTULHO' && c.servico === 'FRETE',
       c.material + '/' + c.servico);
    ok('leva origem e destino', c.origem === 'Ijucapirama' && c.destino === 'Itaquareia',
       c.origem + '→' + c.destino);
    ok('a FOTO DA CARGA viaja junto', /^data:image\//.test(c.fotoCarga || ''), (c.fotoCarga || '').slice(0, 24));
    ok('a ASSINATURA viaja junto', /^data:image\//.test(c.assinatura || ''), (c.assinatura || '').slice(0, 24));
    ok('a FOTO DO TICKET viaja junto', /^data:image\//.test(c.fotoTicket || ''), (c.fotoTicket || '').slice(0, 24));
    ok('e leva um clientId — reenvio não pode cobrar a viagem duas vezes',
       /^bf_/.test(c.clientId || ''), c.clientId);
  }

  const limpou = await p.evaluate(() => ({
    placa: document.getElementById('bfPlaca').value,
    motorista: document.getElementById('bfMotorista').value,
    provas: !!document.querySelector('#bfPrevcarga img'),
    // o que se repete o dia inteiro FICA
    data: document.getElementById('bfData').value,
    fornecedor: document.getElementById('bfFornecedor').value,
    destino: document.getElementById('bfDestino').value,
  }));
  ok('depois de registrar, placa/motorista/provas saem da tela',
     limpou.placa === '' && limpou.motorista === '' && !limpou.provas, JSON.stringify(limpou));
  ok('mas data, fornecedor e destino ficam para a próxima carga',
     limpou.data === '2026-07-16' && limpou.fornecedor === 'SLT' && limpou.destino === 'Itaquareia',
     JSON.stringify(limpou));

  // ------------------------------------------------------------------
  console.log('\nSEM SINAL, A VIAGEM VAI PARA A FILA');
  derrubarRede = true;
  // A viagem anterior foi registrada e limpou as provas da tela: esta é uma
  // carga NOVA, e ela precisa das suas — o ponto do teste é justamente que a
  // prova entre na fila junto com o resto.
  await p.setInputFiles('#bfArqcarga', { name: 'carga.png', mimeType: 'image/png', buffer: PNG });
  await p.waitForTimeout(500);
  await p.evaluate(() => {
    document.getElementById('bfPlaca').value = 'ELQ-5B54';
    document.getElementById('bfMotorista').value = 'MAQUESUEL';
    document.getElementById('bfForm').requestSubmit();
  });
  await p.waitForTimeout(400);
  await p.evaluate(() => bfConfirmar());
  await p.waitForTimeout(1500);
  const naFila = await p.evaluate(() => (outboxLer() || []).filter(i => i.params && i.params.action === 'bfSalvar'));
  ok('a viagem entra na fila do aparelho quando a rede cai', naFila.length === 1, naFila.length);
  ok('e a fila a chama pelo que ela é, não de "RDO"',
     naFila.length === 1 && naFila[0].tipo === 'botafora', naFila.length && naFila[0].tipo);
  ok('o indicador da fila diz "viagem de bota-fora"',
     /viagem de bota-fora/.test(await p.evaluate(() => descricaoDaFila(outboxLer()))),
     await p.evaluate(() => descricaoDaFila(outboxLer())));
  if (naFila.length) {
    ok('e vai para a fila COM as provas dentro',
       /^data:image\//.test(naFila[0].params.fotoCarga || ''), (naFila[0].params.fotoCarga || '').slice(0, 20));
    ok('e com a placa da viagem que não subiu', naFila[0].params.placa === 'ELQ-5B54', naFila[0].params.placa);
  }
  ok('e o formulário é liberado para a próxima carga',
     await p.evaluate(() => document.getElementById('bfPlaca').value) === '');
  derrubarRede = false;

  // ------------------------------------------------------------------
  console.log('\nAS VIAGENS JÁ REGISTRADAS');
  await p.evaluate(() => bfAbrirViagens());
  await p.waitForTimeout(1000);
  const lista = await p.evaluate(() => ({
    n: document.querySelectorAll('#bfLista .eq-item').length,
    resumo: document.getElementById('bfResumo').textContent,
    faltas: document.querySelectorAll('#bfLista .bf-selo-falta').length,
  }));
  ok('a lista traz as viagens do período', lista.n === 2, lista.n);
  ok('e soma o que já foi gasto no período', /2 viagens/.test(lista.resumo) && /2\.150,50/.test(lista.resumo), lista.resumo);
  ok('a viagem sem ticket e sem assinatura é marcada como faltando prova',
     lista.faltas === 2, lista.faltas);

  // ------------------------------------------------------------------
  console.log('\nA PLANILHA NO FORMATO DO FECHAMENTO (aba FRETE)');
  const plan = await p.evaluate(async () => {
    await comLib('excel', () => { }, 'a planilha');
    // Captura o workbook em vez de baixar arquivo.
    const escrever = XLSX.writeFile;
    let capturado = null, nome = '';
    XLSX.writeFile = function (wb, arq) { capturado = wb; nome = arq; };
    await bfGerarPlanilha();
    XLSX.writeFile = escrever;
    if (!capturado) return { erro: 'nada foi gerado' };
    const cel = (ws, end) => ws[end] || null;
    const f = capturado.Sheets['FRETE'];
    const c = capturado.Sheets['COMPROVAÇÃO'];
    const cabecalho = ['A2', 'B2', 'C2', 'D2', 'E2', 'F2', 'G2', 'H2', 'I2'].map(e => (cel(f, e) || {}).v);
    return {
      nome,
      abas: capturado.SheetNames,
      titulo: (cel(f, 'B1') || {}).v,
      cabecalho,
      linha3: ['A3', 'B3', 'C3', 'D3', 'E3', 'F3', 'G3', 'H3', 'I3'].map(e => {
        const x = cel(f, e); return x ? { v: x.v, t: x.t, fmt: x.s && x.s.numFmt } : null;
      }),
      linha4valor: (cel(f, 'H4') || {}).v,
      total: (cel(f, 'H5') || {}).v,
      rotuloTotal: (cel(f, 'A5') || {}).v,
      linkProva: (cel(c, 'F3') || {}).l,
      semProva: (cel(c, 'G4') || {}).v,
    };
  });
  ok('gera as duas abas — FRETE e COMPROVAÇÃO',
     JSON.stringify(plan.abas) === JSON.stringify(['FRETE', 'COMPROVAÇÃO']), JSON.stringify(plan.abas));
  ok('o título traz o trajeto, como no arquivo do escritório',
     plan.titulo === 'FRETE - IJUCAPIRAMA >> ITAQUAREIA', plan.titulo);
  ok('as colunas são exatamente as do fechamento, na mesma ordem',
     JSON.stringify(plan.cabecalho) === JSON.stringify(
       ['FORNECEDOR', 'DATA FRETE', 'PLACA', 'TIPO MATERIAL', 'MOTORISTA',
        'FRETE OU FRESA', 'PROJETO', 'VALOR FRETE', 'OBSERVAÇÕES']),
     JSON.stringify(plan.cabecalho));
  const l3 = plan.linha3 || [];
  ok('a primeira linha é a viagem mais antiga (ordenada por data)',
     l3[2] && l3[2].v === 'CLU-0J95', l3[2] && l3[2].v);
  ok('DATA FRETE é data de verdade, não texto',
     l3[1] && l3[1].t === 'n' && /dd\/mm\/yyyy/.test(l3[1].fmt || ''), JSON.stringify(l3[1]));
  ok('e cai no dia certo (14/07/2026 → serial 46217)', l3[1] && l3[1].v === 46217, l3[1] && l3[1].v);
  ok('VALOR FRETE é número, não texto', l3[7] && l3[7].t === 'n' && l3[7].v === 900, JSON.stringify(l3[7]));
  ok('o valor com decimal atravessa inteiro', plan.linha4valor === 1250.5, plan.linha4valor);
  ok('a última linha fecha o total do período',
     plan.rotuloTotal === 'TOTAL' && plan.total === 2150.5, plan.rotuloTotal + ' / ' + plan.total);
  ok('a aba de comprovação leva o link da prova no Drive',
     plan.linkProva && /drive\.google\.com\/file\/d\/aaa/.test(plan.linkProva.Target),
     JSON.stringify(plan.linkProva));
  ok('e diz quando a prova não existe, em vez de deixar a célula vazia',
     /sem assinatura/.test(plan.semProva || ''), plan.semProva);
  ok('o arquivo é nomeado pelo período', /^Bota-fora_FRETE_.*\.xlsx$/.test(plan.nome || ''), plan.nome);

  // ------------------------------------------------------------------
  // A tela é usada NA SAÍDA DO CANTEIRO, de pé, com o caminhão esperando.
  // Se algo estourar a largura ou o botão de registrar ficar atrás da barra
  // de navegação, o registro não acontece — e o caminhão vai embora.
  console.log('\nNO CELULAR, EM PÉ');
  const ctxCel = await b.newContext({ viewport: { width: 390, height: 844 },
                                      isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const cel = await ctxCel.newPage();
  const errosCel = [];
  cel.on('pageerror', e => errosCel.push(e.message));
  await ctxCel.route('**script.google*.com/**', r => {
    const u = new URL(r.request().url());
    const cb = u.searchParams.get('callback');
    const acao = u.searchParams.get('action') || '';
    let c = { ok: true };
    if (acao === 'login') c = { ok: true, usuario: 'Leonardo', perfil: 'admin', token: 't', obras: '*' };
    else if (acao === 'usuariosNomes') c = { ok: true, usuarios: ['Leonardo'] };
    else if (acao === 'bfListar') c = { ok: true, viagens: VIAGENS };
    r.fulfill({ status: 200, contentType: 'application/javascript',
                body: cb ? `${cb}(${JSON.stringify(c)})` : JSON.stringify(c) });
  });
  await ctxCel.route('**docs.google.com/**', r => r.fulfill({ status: 200, contentType: 'text/csv', body: '' }));
  await cel.goto(BASE + '/index.html', { waitUntil: 'load' });
  await cel.waitForTimeout(1000);
  await cel.evaluate(() => navigate('rdo'));
  await cel.waitForSelector('#loginBtn', { timeout: 15000 });
  await cel.evaluate(async () => {
    (document.getElementById('loginUser') || document.getElementById('loginUserSelect')).value = 'Leonardo';
    document.getElementById('loginPass').value = 'x';
    await fazerLogin();
  });
  await cel.waitForTimeout(600);
  await cel.evaluate(() => navigate('botafora'));
  await cel.waitForSelector('#bfForm', { timeout: 15000 });
  await cel.waitForTimeout(500);

  const estouro = await cel.evaluate(() => {
    const W = window.innerWidth, fora = [];
    document.querySelectorAll('#bfForm *, .eq-topo *').forEach(e => {
      const r = e.getBoundingClientRect();
      if (!r.width || getComputedStyle(e).visibility === 'hidden') return;
      if (r.right > W + 2 || r.left < -2) fora.push((e.tagName + '.' + (typeof e.className === 'string' ? e.className : '')).slice(0, 44));
    });
    return { W, doc: document.documentElement.scrollWidth, fora: fora.slice(0, 5) };
  });
  ok('nada estoura a largura da tela', estouro.fora.length === 0, JSON.stringify(estouro.fora));
  ok('e a página não rola de lado', estouro.doc <= estouro.W + 2, estouro.doc + ' > ' + estouro.W);

  const alvos = await cel.evaluate(() => {
    const pequenos = [];
    document.querySelectorAll('#bfForm button, #bfForm input, #bfForm select').forEach(e => {
      const r = e.getBoundingClientRect();
      if (r.width && r.height && r.height < 34) pequenos.push(e.id || e.textContent.trim().slice(0, 20));
    });
    return pequenos;
  });
  ok('nenhum controle do formulário abaixo de 34px de altura', alvos.length === 0, JSON.stringify(alvos));

  // O botão de registrar tem de estar acessível — não atrás da barra de baixo.
  const botao = await cel.evaluate(async () => {
    // Quem rola é o `.main`, não a janela: rolar `window` aqui não move nada.
    document.querySelector('.main').scrollTop = 900;
    await new Promise(r => setTimeout(r, 250));
    const b = document.getElementById('bfEnviar').getBoundingClientRect();
    const barra = document.querySelector('.bottom-nav-mobile');
    const bb = barra ? barra.getBoundingClientRect() : null;
    return { visivel: b.top < window.innerHeight && b.bottom > 0,
             sobreposto: bb ? b.bottom > bb.top + 1 : false };
  });
  ok('o botão de registrar fica alcançável no fim do formulário', botao.visivel, JSON.stringify(botao));
  ok('e não fica atrás da barra de navegação', !botao.sobreposto, JSON.stringify(botao));

  // O modal das viagens vive por cima da barra fixa — mesma razão do de Equipamentos.
  await cel.evaluate(() => bfAbrirViagens());
  await cel.waitForTimeout(900);
  const modal = await cel.evaluate(() => {
    const m = document.getElementById('bfViagensModal');
    const caixa = m.querySelector('.eq-modal-caixa').getBoundingClientRect();
    const barra = document.querySelector('.bottom-nav-mobile');
    const bb = barra ? barra.getBoundingClientRect() : null;
    return {
      noBody: m.parentElement === document.body,
      largura: Math.round(caixa.width), tela: window.innerWidth,
      porCima: bb ? (parseInt(getComputedStyle(m).zIndex || 0, 10) >= parseInt(getComputedStyle(barra).zIndex || 0, 10)) : true,
    };
  });
  ok('o modal das viagens sai para o body, e não fica preso na página',
     modal.noBody, JSON.stringify(modal));
  ok('e cabe na tela do celular', modal.largura <= modal.tela + 2, JSON.stringify(modal));
  ok('sem erro de página no celular', errosCel.length === 0, errosCel.slice(0, 3).join(' ; '));

  // ------------------------------------------------------------------
  console.log('\nO QUE NÃO PODE ACONTECER');
  ok('nenhum erro de página', erros.length === 0, erros.slice(0, 4).join(' ; '));

  await b.close();
  srv.kill();
  console.log(falhas ? `\n${falhas} falha(s).` : '\nTudo certo.');
  process.exit(falhas ? 1 : 0);
})();
