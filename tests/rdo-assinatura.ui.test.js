// A PÁGINA DE ASSINAR O RDO — no navegador de verdade
//
// Quem abre a `assinar.html` é o ENGENHEIRO ou o FISCAL, pelo link pessoal
// que chegou no e-mail. Não há login, não há app instalado, e quase sempre é
// um celular. Se essa página falhar, o RDO fica sem assinatura — e não há
// ninguém do lado de cá para perceber.
//
// Por isso o teste roda a página DE VERDADE no Chromium, com o Apps Script
// falso: desenha no canvas com o mouse (que é o que o dedo faz), confere que
// o botão só libera quando o traço, o nome e o "li e assino" estão os três
// lá, e que o que sobe é um PNG de verdade.
//
// Pré-requisito: `python3 -m http.server 8099` na raiz (o harness sobe sozinho).
// Roda com:  node tests/rdo-assinatura.ui.test.js
const { chromium } = require('playwright');
const H = require('./harness.js');

const PAGINA = 'http://localhost:8099/assinar.html';

let falhas = 0;
const ok = (n, c, e) => {
  if (c) console.log('  ✓ ' + n);
  else { falhas++; console.log('  ✗ ' + n + (e !== undefined ? '  → ' + e : '')); }
};

/* Um PDF de uma folha, com xref certinho — o PDF.js precisa abrir de
   verdade, senão o teste da folha na tela não provaria nada. */
function pdfDeUmaFolha() {
  const objs = [
    '<</Type/Catalog/Pages 2 0 R>>',
    '<</Type/Pages/Kids[3 0 R]/Count 1>>',
    '<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 200]/Resources<</Font<</F1 5 0 R>>>>/Contents 4 0 R>>',
    '<</Length 46>>\nstream\nBT /F1 14 Tf 20 100 Td (RDO de teste) Tj ET\nendstream',
    '<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>',
  ];
  let corpo = '%PDF-1.4\n';
  const offsets = [];
  objs.forEach((o, i) => {
    offsets.push(corpo.length);
    corpo += (i + 1) + ' 0 obj\n' + o + '\nendobj\n';
  });
  const inicioXref = corpo.length;
  corpo += 'xref\n0 ' + (objs.length + 1) + '\n0000000000 65535 f \n';
  offsets.forEach(o => { corpo += String(o).padStart(10, '0') + ' 00000 n \n'; });
  corpo += 'trailer\n<</Size ' + (objs.length + 1) + '/Root 1 0 R>>\nstartxref\n' +
           inicioXref + '\n%%EOF\n';
  return 'data:application/pdf;base64,' + Buffer.from(corpo, 'latin1').toString('base64');
}

function respostaAbrir(extra) {
  return Object.assign({
    ok: true,
    obra: 'teotonio', obraNome: 'Teotônio Vilela',
    data: '2026-08-24', dataBR: '24/08/2026', diaSemana: 'segunda-feira',
    numeroRdo: '128',
    papel: 'fiscalizacao', rotulo: 'Cliente / Fiscalização — SP OBRAS',
    nome: '', email: 'fiscal@spobras.sp.gov.br',
    assinada: false, assinadoEm: '', nomeAssinante: '',
    codigo: 'A1B2C3D4',
    resumo: 'RDO nº 128 — 24/08/2026\n\nApontador: Carlos Apontador\nClima: manhã: Bom',
    outras: [
      { papel: 'engenheiro', rotulo: 'Engenheiro — Gestor Engenharia', assinada: true,
        assinadoEm: '2026-08-25 09:12:00', nomeAssinante: 'Paulo Engenheiro' },
      { papel: 'fiscalizacao', rotulo: 'Cliente / Fiscalização — SP OBRAS', assinada: false },
    ],
    pdf: pdfDeUmaFolha(), pdfNome: 'RDO_128_20260824.pdf',
  }, extra || {});
}

/* Abre a página com o Apps Script FALSO. `guiao` decide o que cada ação
   responde; `enviadas` guarda o que a página mandou, que é o que prova o
   formato do que chega ao servidor. */
async function abrirPagina(navegador, guiao, query) {
  const ctx = await navegador.newContext();
  const p = await ctx.newPage();
  const enviadas = [];
  await p.route('**script.google.com/**', async rota => {
    const req = rota.request();
    const corpo = req.postData() || '';
    const params = {};
    // multipart do FormData: só precisamos dos campos, que vêm em texto
    corpo.split(/------[^\r\n]*/).forEach(parte => {
      const m = parte.match(/name="([^"]+)"\r\n\r\n([\s\S]*?)\r\n$/);
      if (m) params[m[1]] = m[2];
    });
    enviadas.push(params);
    const r = guiao(params);
    if (r === null) return rota.abort('failed');           // sinal caiu
    await rota.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(r) });
  });
  await p.goto(PAGINA + (query === undefined ? '?t=' + 'f'.repeat(40) : query),
               { waitUntil: 'domcontentloaded' });
  return { ctx, p, enviadas };
}

// Desenha um rabisco no quadro, como o dedo faria.
async function rabiscar(p) {
  /* Rolar até o quadro antes de mexer o mouse não é firula: as coordenadas
     do Playwright são da JANELA, e com o PDF na tela o quadro de assinar
     nasce abaixo da dobra — o traço iria parar em cima de outra coisa. */
  await p.locator('#tela').scrollIntoViewIfNeeded();
  const c = await p.locator('#tela').boundingBox();
  await p.mouse.move(c.x + 20, c.y + c.height * 0.7);
  await p.mouse.down();
  for (let i = 1; i <= 12; i++) {
    await p.mouse.move(c.x + 20 + i * (c.width - 50) / 12,
                       c.y + c.height * (0.7 - 0.25 * Math.sin(i)));
  }
  await p.mouse.up();
}

(async () => {
  await H.garantirServidor(8099);
  const navegador = await chromium.launch({ executablePath: H.CHROME });

  console.log('\nA PÁGINA DE ASSINAR O RDO\n');

  // ---------------------------------------------------------------- abrir
  {
    console.log('Abrir o link');
    const { ctx, p } = await abrirPagina(navegador, () => respostaAbrir());
    await p.waitForSelector('#cartaoAssinar:not(.oculto)', { timeout: 15000 });
    ok('o cabeçalho diz qual RDO é', (await p.textContent('#tituloTopo')).includes('nº 128') &&
       (await p.textContent('#tituloTopo')).includes('24/08/2026'),
       await p.textContent('#tituloTopo'));
    ok('diz em que papel a pessoa está assinando',
       (await p.textContent('#tituloAssinar')).includes('Cliente / Fiscalização'),
       await p.textContent('#tituloAssinar'));
    ok('o resumo do dia aparece',
       (await p.textContent('#resumo')).includes('Carlos Apontador'));
    ok('mostra quem mais assina, e quem já assinou',
       (await p.textContent('#listaQuem')).includes('Paulo Engenheiro'));

    // o PDF é desenhado na página: quem assina lê o documento antes
    await p.waitForFunction(() => document.querySelectorAll('#folhas canvas').length > 0,
                            null, { timeout: 15000 }).catch(() => {});
    ok('a folha do RDO é desenhada na tela',
       (await p.locator('#folhas canvas').count()) === 1,
       (await p.textContent('#dicaFolhas')));
    ok('e dá para baixar o PDF',
       (await p.getAttribute('#baixar', 'download')) === 'RDO_128_20260824.pdf');
    await ctx.close();
  }

  // ------------------------------------------------------- travas do botão
  {
    console.log('\nO botão só libera com as três coisas');
    const { ctx, p } = await abrirPagina(navegador, () => respostaAbrir());
    await p.waitForSelector('#cartaoAssinar:not(.oculto)', { timeout: 15000 });
    ok('começa desligado', await p.isDisabled('#btAssinar'));

    await p.fill('#nome', 'Walter Botelho');
    ok('nome sozinho não basta', await p.isDisabled('#btAssinar'));

    await rabiscar(p);
    ok('nome + traço ainda não bastam — falta o "li e assino"',
       await p.isDisabled('#btAssinar'));

    await p.check('#concordo');
    ok('com os três, libera', await p.isEnabled('#btAssinar'));

    await p.click('#btLimpar');
    ok('apagar o traço trava de novo', await p.isDisabled('#btAssinar'));
    await ctx.close();
  }

  // ---------------------------------------------------------------- assinar
  {
    console.log('\nAssinar');
    const { ctx, p, enviadas } = await abrirPagina(navegador, (params) =>
      params.action === 'rdoAssinaturaGravar'
        ? { ok: true, assinadoEm: '2026-08-25 10:30:00', codigo: 'A1B2C3D4', faltam: 0,
            nomeAssinante: params.nome }
        : respostaAbrir());
    await p.waitForSelector('#cartaoAssinar:not(.oculto)', { timeout: 15000 });
    await p.fill('#nome', 'Walter Botelho');
    await p.fill('#documento', 'CREA 5060708090');
    await rabiscar(p);
    await p.check('#concordo');
    await p.click('#btAssinar');
    await p.waitForSelector('#mensagem.feito', { timeout: 15000 });

    const env = enviadas.filter(e => e.action === 'rdoAssinaturaGravar')[0];
    ok('manda a ação de gravar', !!env);
    ok('com o token do link', env && env.t === 'f'.repeat(40), env && env.t);
    ok('com o nome de quem assinou', env && env.nome === 'Walter Botelho');
    ok('com o documento', env && env.documento === 'CREA 5060708090');
    ok('e com um PNG de verdade',
       !!env && env.assinatura.indexOf('data:image/png;base64,') === 0 &&
       env.assinatura.length > 1000, env && env.assinatura.slice(0, 40));

    const recado = await p.textContent('#mensagem');
    ok('confirma com o código do registro', recado.includes('A1B2C3D4'), recado);
    ok('e avisa que era a última assinatura',
       recado.includes('assinado por todos'), recado);
    ok('o quadro de assinar some — não dá para assinar duas vezes',
       await p.isHidden('#cartaoAssinar'));
    await ctx.close();
  }

  // --------------------------------------------------- falha ao enviar
  {
    console.log('\nQuando o sinal cai na hora de enviar');
    const { ctx, p } = await abrirPagina(navegador, (params) =>
      params.action === 'rdoAssinaturaGravar' ? null : respostaAbrir());
    await p.waitForSelector('#cartaoAssinar:not(.oculto)', { timeout: 15000 });
    await p.fill('#nome', 'Walter Botelho');
    await rabiscar(p);
    await p.check('#concordo');
    await p.click('#btAssinar');
    await p.waitForSelector('#mensagem.erro', { timeout: 15000 });

    ok('avisa a falha', (await p.textContent('#mensagem')).length > 10);
    ok('o quadro de assinar CONTINUA na tela',
       await p.isVisible('#cartaoAssinar'));
    ok('o botão volta a funcionar — dá para tentar de novo sem redesenhar',
       await p.isEnabled('#btAssinar'));
    ok('o traço não foi apagado',
       await p.evaluate(() => {
         const c = document.getElementById('tela');
         const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
         for (let i = 0; i < d.length; i += 4) if (d[i] < 200) return true;
         return false;
       }));
    await ctx.close();
  }

  // ------------------------------------------------------- já assinado
  {
    console.log('\nQuem já assinou');
    const { ctx, p } = await abrirPagina(navegador, () => respostaAbrir({
      assinada: true, assinadoEm: '2026-08-25 09:12:00', nomeAssinante: 'Walter Botelho' }));
    await p.waitForSelector('#mensagem:not(.oculto)', { timeout: 15000 });
    ok('não vê o quadro de assinar de novo', await p.isHidden('#cartaoAssinar'));
    ok('e é avisado de quando assinou',
       (await p.textContent('#mensagem')).includes('2026-08-25 09:12'),
       await p.textContent('#mensagem'));
    ok('mas continua podendo ler o RDO', await p.isVisible('#cartaoRdo'));
    await ctx.close();
  }

  // ------------------------------------------------------- links ruins
  {
    console.log('\nLink que não presta');
    const { ctx, p } = await abrirPagina(navegador,
      () => ({ ok: false, error: 'Link de assinatura inválido ou já cancelado.' }));
    await p.waitForSelector('#mensagem.erro', { timeout: 15000 });
    ok('diz que o link não vale',
       (await p.textContent('#mensagem')).includes('inválido'));
    ok('e não oferece nada para assinar', await p.isHidden('#cartaoAssinar'));
    await ctx.close();
  }
  {
    const { ctx, p, enviadas } = await abrirPagina(navegador, () => respostaAbrir(), '');
    await p.waitForSelector('#mensagem.erro', { timeout: 15000 });
    ok('endereço sem o código do convite nem chama o servidor', enviadas.length === 0);
    ok('e explica o que fazer',
       (await p.textContent('#mensagem')).includes('e-mail'),
       await p.textContent('#mensagem'));
    await ctx.close();
  }

  // -------------------------------------------------- RDO ainda sem PDF
  {
    console.log('\nDia cujo PDF ainda não foi depositado');
    const { ctx, p } = await abrirPagina(navegador, () => respostaAbrir({
      pdf: undefined, pdfNome: undefined, semPdf: true,
      aviso: 'O PDF deste RDO ainda não foi depositado pelo app.' }));
    await p.waitForSelector('#mensagem:not(.oculto)', { timeout: 15000 });
    ok('avisa que o relatório ainda não está lá',
       (await p.textContent('#mensagem')).includes('ainda não foi depositado'));
    ok('e não mostra folha nenhuma', await p.isHidden('#cartaoRdo'));
    await ctx.close();
  }

  await navegador.close();

  // =================================================================
  // O OUTRO LADO: o PDF oficial sai com a firma DENTRO do quadro
  // -----------------------------------------------------------------
  // Guardar a assinatura não serve de nada se ela não chegar ao papel que
  // a fiscalização arquiva. Quem desenha o RDO é o app, então é o app de
  // verdade que tem de provar isto — com o RDO gerado e lido de volta.
  // =================================================================
  console.log('\nO PDF oficial com as firmas');
  await comOAppDeVerdade();

  console.log(falhas ? `\n${falhas} FALHA(S)\n` : '\nTudo certo.\n');
  process.exit(falhas ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });

// ------------------------------------------------------------------
const HOJE_ISO = (d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') +
                       '-' + String(d.getDate()).padStart(2, '0'))(new Date());

const csvEsc = v => (/[",\n]/.test(String(v)) ? '"' + String(v).replace(/"/g, '""') + '"' : String(v));
const CSV_DIARIO = [
  'ID,Data,Clima_Manha,Clima_Tarde,Clima_Noite,Efetivo_JSON,Equipamentos_JSON,Ocorrencias,' +
  'Observacoes_Gerais,Apontador_Diurno,Apontador_Noturno,Obra,numero_rdo',
  ['D0128', HOJE_ISO, 'Bom', 'Bom', 'Bom',
   JSON.stringify({ padrao_diurno: { pedreiro: 6, servente: 10 } }),
   JSON.stringify({ padrao_diurno: { escavadeira_hidraulica: 1 } }),
   'Sem ocorrências.', 'Concretagem liberada.', 'Carlos Apontador', '', 'teotonio', '128',
  ].map(csvEsc).join(','),
].join('\n');

/* Uma assinatura de mentira, mas um PNG DE VERDADE — montado aqui, byte a
   byte, porque o jsPDF recusa qualquer outra coisa e é exatamente isso que
   este teste existe para provar: que o traço vira imagem no documento. */
function pngDeRabisco() {
  const zlib = require('zlib');
  const crc = buf => {
    let c = ~0;
    for (const b of buf) { c ^= b; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xEDB88320 & -(c & 1)); }
    return ~c >>> 0;
  };
  const bloco = (tipo, dados) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(dados.length);
    const t = Buffer.from(tipo, 'latin1');
    const c = Buffer.alloc(4); c.writeUInt32BE(crc(Buffer.concat([t, dados])));
    return Buffer.concat([len, t, dados, c]);
  };
  const W = 60, H = 20;
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 2;   // 8 bits, RGB
  const linhas = [];
  for (let y = 0; y < H; y++) {
    const l = Buffer.alloc(1 + W * 3, 255); l[0] = 0;                             // fundo branco
    for (let x = 0; x < W; x++) {
      if (Math.abs(y - (10 + 6 * Math.sin(x / 6))) < 2.2) {                       // o rabisco
        l[1 + x * 3] = 16; l[2 + x * 3] = 24; l[3 + x * 3] = 40;
      }
    }
    linhas.push(l);
  }
  const png = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    bloco('IHDR', ihdr),
    bloco('IDAT', zlib.deflateSync(Buffer.concat(linhas))),
    bloco('IEND', Buffer.alloc(0)),
  ]);
  return 'data:image/png;base64,' + png.toString('base64');
}
const PNG_ASSINATURA = pngDeRabisco();

const FIRMAS = [
  { papel: 'engenheiro', rotulo: 'Engenheiro — Gestor Engenharia', nome: '', email: 'eng@x.com',
    status: 'assinada', assinadoEm: '2026-08-25 09:12:00', nomeAssinante: 'Paulo Facanha',
    codigo: 'A1B2C3D4', link: 'https://x/assinar.html?t=abc', imagem: PNG_ASSINATURA },
  { papel: 'fiscalizacao', rotulo: 'Cliente / Fiscalização — SP OBRAS', nome: '', email: 'fis@y.com',
    status: 'pendente', assinadoEm: '', nomeAssinante: '', codigo: 'E5F6A7B8',
    link: 'https://x/assinar.html?t=def' },
  { papel: 'supervisao', rotulo: 'Supervisão', nome: '', email: 'sup@z.com',
    status: 'pendente', assinadoEm: '', nomeAssinante: '', codigo: 'C9D0E1F2',
    link: 'https://x/assinar.html?t=ghi' },
];

function camposMultipart(corpo) {
  const out = {};
  const fim = corpo.indexOf('\r\n');
  if (fim === -1) return out;
  const boundary = corpo.slice(0, fim);
  corpo.split(boundary).forEach(bloco => {
    const m = bloco.match(/name="([^"]+)"\r\n\r\n([\s\S]*?)\r\n$/);
    if (m) out[m[1]] = m[2];
  });
  return out;
}

/* Gera o PDF oficial do dia no app de verdade e devolve o que o desenho
   produziu: o texto de cada folha, quantas imagens entraram e o que foi
   depositado no backend. */
async function gerarEler(pagina, capturadas, data) {
  const espera = pagina.waitForEvent('download', { timeout: 60000 });
  await pagina.evaluate(d => gerarPDFDiario(d), data);
  const arq = await espera;
  const destino = require('path').join(require('os').tmpdir(), 'rdo-assinatura-teste.pdf');
  await arq.saveAs(destino);
  const b64 = require('fs').readFileSync(destino).toString('base64');

  await pagina.addScriptTag({ url: '/vendor/pdfjs/pdf.min.js' }).catch(() => {});
  return pagina.evaluate(async (base64) => {
    const lib = window.pdfjsLib;
    lib.GlobalWorkerOptions.workerSrc = '/vendor/pdfjs/pdf.worker.min.js';
    const doc = await lib.getDocument({
      data: Uint8Array.from(atob(base64), c => c.charCodeAt(0)) }).promise;
    let texto = '', imagens = 0;
    for (let n = 1; n <= doc.numPages; n++) {
      const pg = await doc.getPage(n);
      texto += (await pg.getTextContent()).items.map(i => i.str).join(' ') + '\n';
      const ops = await pg.getOperatorList();
      ops.fnArray.forEach(f => {
        if (f === lib.OPS.paintImageXObject || f === lib.OPS.paintJpegXObject) imagens++;
      });
    }
    return { texto, imagens };
  }, b64);
}

async function comOAppDeVerdade() {
  const s = await H.abrir({ diario: CSV_DIARIO, logar: { usuario: 'Leonardo', perfil: 'admin' } });
  const capturadas = [];
  let firmasLigadas = false;

  await s.p.route('**://script.google.com/**', async rota => {
    const req = rota.request();
    const u = new URL(req.url());
    const cb = u.searchParams.get('callback');
    let params = {};
    u.searchParams.forEach((v, k) => { params[k] = v; });
    if (req.method() === 'POST') {
      const buf = req.postDataBuffer();
      if (buf) params = camposMultipart(buf.toString('utf8'));
    }
    capturadas.push(params);
    let corpo = { ok: true, fileId: 'arquivo-falso' };
    if (params.action === 'rdoAssinaturasDoDia') {
      corpo = firmasLigadas
        ? { ok: true, assinaturas: FIRMAS, assinadas: 1, noDeposito: 0 }
        : { ok: true, assinaturas: FIRMAS.map(f => Object.assign({}, f,
              { status: 'pendente', assinadoEm: '', nomeAssinante: '', imagem: undefined })),
            assinadas: 0, noDeposito: 0 };
    }
    rota.fulfill(cb
      ? { status: 200, contentType: 'application/javascript', body: cb + '(' + JSON.stringify(corpo) + ')' }
      : { status: 200, contentType: 'application/json', body: JSON.stringify(corpo) });
  });

  // 1) sem firma nenhuma — é o RDO de sempre, para servir de régua
  const semFirma = await gerarEler(s.p, capturadas, HOJE_ISO);
  ok('sem assinatura online, o RDO sai como sempre saiu',
     semFirma.texto.includes('ASSINATURAS') && !semFirma.texto.includes('Paulo Facanha'));

  // 2) com a firma do engenheiro registrada
  firmasLigadas = true;
  await s.p.evaluate(() => { _ASSIN_RDO = { obra: '', data: '', lista: [], noDeposito: -1, em: 0 }; });
  const comFirma = await gerarEler(s.p, capturadas, HOJE_ISO);

  ok('o nome de quem assinou sai embaixo da linha',
     comFirma.texto.includes('Paulo Facanha'), comFirma.texto.slice(-400));
  ok('com a hora e o código do registro — é como se confere a firma',
     comFirma.texto.includes('2026-08-25 09:12') && comFirma.texto.includes('A1B2C3D4'));
  ok('o traço vira imagem dentro do quadro',
     comFirma.imagens === semFirma.imagens + 1,
     'antes ' + semFirma.imagens + ', depois ' + comFirma.imagens);
  ok('quem ainda não assinou continua com a linha para assinar de caneta',
     comFirma.texto.includes('CLIENTE / FISCALIZAÇÃO'), comFirma.texto.slice(-400));
  ok('o quadro do fiscal NÃO ganhou o nome do engenheiro',
     (comFirma.texto.match(/Paulo Facanha/g) || []).length === 1);

  const depositos = capturadas.filter(c => c.action === 'rdoPdfDoDia');
  ok('o depósito conta as firmas desenhadas — é o que dispara o RDO assinado',
     depositos.length >= 2 && depositos[depositos.length - 1].assinaturas === '1',
     JSON.stringify(depositos.map(d => d.assinaturas)));
  ok('e o depósito do PDF sem firma contou zero',
     depositos[0] && depositos[0].assinaturas === '0', depositos[0] && depositos[0].assinaturas);

  /* O painel na tela do RDO: é onde o escritório vê que o fiscal ainda não
     assinou, e de onde tira o link dele quando o e-mail se perdeu. */
  await s.p.evaluate(() => {
    DIARIO_V4 = null; DIARIO_TURNO_ATIVO = null;
    STATE.currentPage = '';            // navigate() sai fora se a página já for a atual
    navigate('rdodiario');
  });
  await s.p.waitForFunction(
    () => { const e = document.getElementById('rdoAssinaturasPainel');
            return e && e.textContent.indexOf('Consultando') === -1; },
    null, { timeout: 20000 }).catch(() => {});
  const painel = await s.p.textContent('#rdoAssinaturasPainel').catch(() => '');
  ok('a tela do RDO mostra quem já assinou', painel.includes('Paulo Facanha'), painel);
  ok('e quem ainda falta', painel.includes('pendente'), painel);
  ok('com a conta de quantas firmas já entraram',
     painel.includes('1 de 3'), painel);
  ok('e o botão de copiar o link só aparece para quem ainda não assinou',
     (await s.p.locator('#rdoAssinaturasPainel button').count()) === 2,
     await s.p.locator('#rdoAssinaturasPainel button').count());

  ok('nenhum erro de página durante o teste', s.erros.length === 0, s.erros.join(' | '));
  await s.fechar();
}
