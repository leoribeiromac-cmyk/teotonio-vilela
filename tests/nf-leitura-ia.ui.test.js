// A LEITURA DA NOTA POR IA — o lado do aparelho
//
// A queixa do canteiro era "demora e às vezes dá erro em alguns aparelhos".
// As três causas, e o que este teste tranca para elas não voltarem:
//
//  1. A FOTO ERA ABERTA QUATRO VEZES (miniatura, cópia guardada e mais duas
//     do leitor de código de barras). Uma foto de 12 MP vira ~48 MB de bitmap
//     cada vez — é assim que o celular simples devolve tela em branco. Agora
//     é uma vez só, e o teste conta as aberturas.
//  2. SUBIA A FOTO GUARDADA, do tamanho da prova. O que vai para a IA agora é
//     uma cópia mais leve; a que fica guardada não mudou.
//  3. UM POST SEM PRAZO ficava pendurado para sempre quando o sinal caía: a
//     tela dizia "Lendo os dados da imagem…" até a pessoa desistir. Agora
//     esgota o tempo, vira erro de rede (portanto vai para a fila) e a
//     leitura ainda tenta uma segunda vez antes de dar a nota por perdida.
//
// E a trava de regressão do que ficou em paralelo: as folhas do PDF passaram
// a virar imagem em segundo plano, enquanto a IA lê o texto. Se essa corrida
// se perder, a nota é gravada sem a folha — prova que some sem avisar.
//
// Como rodar:
//   python3 -m http.server 8099        (na raiz do repositório)
//   node tests/nf-leitura-ia.ui.test.js
const { chromium } = require('playwright');
let falhas = 0;
const ok = (n, c, e) => { if (c) console.log('  ✓ ' + n); else { falhas++; console.log('  ✗ ' + n + (e !== undefined ? '  → ' + e : '')); } };

(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const p = await b.newPage({ viewport: { width: 1380, height: 900 } });
  const err = [];
  p.on('pageerror', e => err.push('PAGEERROR: ' + e.message));
  p.on('console', m => { const t = m.text();
    if (m.type() === 'error' && !/Failed to load resource|net::/.test(t)) err.push('CONSOLE: ' + t); });

  let consultas = 0;      // idas ao servidor para consultar a nota pela chave
  let leituras = [];      // cada chamada nfLerIA que chegou ao servidor falso
  let falharProximas = 0; // quantas chamadas de leitura vão cair na rede
  const NOTAS = [];

  await p.route('**://script.google.com/**', async (route) => {
    const req = route.request();
    const u = new URL(req.url());
    const par = {};
    u.searchParams.forEach((v, k) => par[k] = v);
    if (req.method() === 'POST') {
      const corpoBruto = req.postData() || '';
      const re = /name="([^"]+)"\r?\n\r?\n([\s\S]*?)\r?\n--/g;
      let m;
      while ((m = re.exec(corpoBruto)) !== null) par[m[1]] = m[2];
    }
    let corpo;
    // pedido que NUNCA responde: é o sinal caindo no meio da subida
    if (par.action === 'pendurado') return;
    if (par.action === 'login') corpo = { ok: true, usuario: 'Leonardo', perfil: 'admin', token: 't', obras: '*' };
    else if (par.action === 'usuariosNomes') corpo = { ok: true, usuarios: ['Leonardo'] };
    else if (par.action === 'nfListar') corpo = { ok: true, notas: NOTAS, saidas: [] };
    else if (par.action === 'nfConsultarChave') { consultas++; corpo = { ok: false, motivo: 'sem_api' }; }
    else if (par.action === 'nfLerIA') {
      leituras.push({ foto: par.foto || '', texto: par.texto || '', chave: par.chave || '' });
      if (falharProximas > 0) { falharProximas--; return route.abort('failed'); }
      corpo = { ok: true, modelo: 'gemini-2.5-flash',
                dados: { numero: '99887', serie: '1', razaoSocial: 'CONCRETEIRA ALFA',
                         cnpj: '11111111000191', dataEmissao: '2026-08-20', vTotal: 4200,
                         itens: [{ descricao: 'BRITA 1', qtd: 30, un: 'M3', vUnit: 140, vTotal: 4200 }] },
                confiancaGeral: 0.93 };
    }
    else if (par.action === 'nfImagem') corpo = { ok: true, fileId: 'drv1', link: 'https://drive/1', pagina: 1 };
    else corpo = { ok: true };
    if (par.callback) return route.fulfill({ status: 200, contentType: 'application/javascript',
                                             body: `${par.callback}(${JSON.stringify(corpo)})` });
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(corpo) });
  });
  await p.route('**://docs.google.com/**', r => r.fulfill({ status: 200, body: '' }));
  // o cadastro público da Receita não entra nesta prova
  await p.route('**://brasilapi.com.br/**', r => r.abort('failed'));
  await p.route('**://minhareceita.org/**', r => r.abort('failed'));

  await p.goto('http://localhost:8099/index.html', { waitUntil: 'load' });
  await p.waitForTimeout(1200);
  await p.evaluate(() => navigate('rdo'));
  await p.waitForSelector('#loginBtn', { timeout: 5000 });
  await p.evaluate(async () => {
    (document.getElementById('loginUser') || document.getElementById('loginUserSelect')).value = 'Leonardo';
    document.getElementById('loginPass').value = 'x';
    await fazerLogin();
  });
  await p.waitForTimeout(600);
  await p.evaluate(() => navigate('notas'));
  await p.waitForTimeout(900);

  // ---- conta quantas vezes o arquivo da foto é aberto de verdade ----
  await p.evaluate(() => {
    window.__aberturas = { bitmap: 0, fileReader: 0, objectURL: 0 };
    const cib = window.createImageBitmap;
    window.createImageBitmap = function (...a) { window.__aberturas.bitmap++; return cib.apply(this, a); };
    const rad = FileReader.prototype.readAsDataURL;
    FileReader.prototype.readAsDataURL = function (...a) { window.__aberturas.fileReader++; return rad.apply(this, a); };
    const cou = URL.createObjectURL;
    URL.createObjectURL = function (...a) { window.__aberturas.objectURL++; return cou.apply(this, a); };
    // uma foto grande o bastante para o custo de abrir aparecer
    window.__foto = () => new Promise(res => {
      const c = document.createElement('canvas'); c.width = 2400; c.height = 3200;
      const g = c.getContext('2d');
      g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
      g.fillStyle = '#111'; g.font = '90px sans-serif';
      g.fillText('DANFE  Nº 99887', 120, 300);
      for (let i = 0; i < 40; i++) g.fillText('BRITA 1 GRADUADA  M3  30,00', 120, 500 + i * 60);
      c.toBlob(bl => res(new File([bl], 'nota.jpg', { type: 'image/jpeg' })), 'image/jpeg', .9);
    });
  });

  console.log('A FOTO É ABERTA UMA VEZ SÓ');
  leituras = [];
  await p.evaluate(async () => {
    nfAbrirNova();
    window.__aberturas = { bitmap: 0, fileReader: 0, objectURL: 0 };
    const dt = new DataTransfer(); dt.items.add(await window.__foto());
    await nfArquivoSelecionado({ files: dt.files, value: '' });
  });
  await p.waitForTimeout(2500);
  const ab = await p.evaluate(() => window.__aberturas);
  const decodificacoes = ab.bitmap + ab.fileReader + ab.objectURL;
  ok('a foto é decodificada no máximo duas vezes (era quatro)', decodificacoes <= 2, JSON.stringify(ab));
  ok('e o caminho usado é o createImageBitmap, que não trava a tela', ab.bitmap >= 1, JSON.stringify(ab));

  console.log('\nO QUE SOBE PARA A IA É MAIS LEVE QUE O QUE FICA GUARDADO');
  const subiu = leituras.length ? leituras[0].foto.length : 0;
  const guardado = await p.evaluate(() => (_nfFull || '').length);
  ok('a leitura mandou uma imagem', subiu > 1000, 'bytes: ' + subiu);
  ok('a cópia da IA é bem menor que a guardada', subiu < guardado * 0.85,
    'IA=' + subiu + '  guardada=' + guardado);
  ok('mas continua sendo uma imagem de verdade (não uma miniatura)', subiu > guardado * 0.2,
    'IA=' + subiu + '  guardada=' + guardado);
  ok('a foto guardada NÃO encolheu: ela é a prova', guardado > 60000, 'bytes: ' + guardado);
  ok('e a leitura preencheu a nota', await p.evaluate(() => _nfRascunho.razaoSocial) === 'CONCRETEIRA ALFA');

  console.log('\nUM TROPEÇO DE REDE NÃO MANDA DIGITAR A NOTA INTEIRA');
  leituras = [];
  falharProximas = 1;                   // a primeira chamada cai; a segunda vai
  await p.evaluate(async () => {
    nfAbrirNova();
    const dt = new DataTransfer(); dt.items.add(await window.__foto());
    await nfArquivoSelecionado({ files: dt.files, value: '' });
  });
  await p.waitForTimeout(4000);
  ok('a leitura foi tentada duas vezes', leituras.length === 2, leituras.length + ' tentativa(s)');
  ok('e a nota saiu preenchida assim mesmo',
    await p.evaluate(() => _nfRascunho.razaoSocial) === 'CONCRETEIRA ALFA',
    await p.evaluate(() => _nfRascunho.razaoSocial));

  console.log('\nUM PEDIDO PENDURADO ESGOTA O TEMPO EM VEZ DE FICAR PARA SEMPRE');
  const pendurado = await p.evaluate(async () => {
    const t0 = Date.now();
    try {
      await enviarPost({ action: 'pendurado' }, 800);
      return { erro: '', ms: Date.now() - t0 };
    } catch (e) {
      return { erro: String(e.message || e), ms: Date.now() - t0, rede: ehErroDeRede(e) };
    }
  });
  ok('o pedido desiste sozinho', /tempo esgotado/i.test(pendurado.erro), JSON.stringify(pendurado));
  ok('e desiste no prazo pedido, não depois', pendurado.ms < 5000, JSON.stringify(pendurado));
  ok('a falha conta como erro de REDE (o lançamento vai para a fila, não se perde)',
    pendurado.rede === true, JSON.stringify(pendurado));

  console.log('\nPDF COM TEXTO: A IA LÊ O TEXTO E AS FOLHAS VIRAM IMAGEM EM PARALELO');
  leituras = [];
  await p.evaluate(async () => {
    await usarLib('pdf');
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    doc.setFontSize(11);
    doc.text('DANFE - DOCUMENTO AUXILIAR DA NOTA FISCAL ELETRONICA', 12, 20);
    doc.text('EMITENTE: CONCRETEIRA ALFA LTDA   CNPJ 11.111.111/0001-91', 12, 30);
    for (let i = 0; i < 18; i++) doc.text('ITEM ' + i + ' BRITA 1 GRADUADA  M3  30,00  140,00  4.200,00', 12, 40 + i * 7);
    doc.addPage();
    doc.text('CONTINUACAO DOS ITENS DA NOTA FISCAL - FOLHA 2', 12, 20);
    const blob = doc.output('blob');
    window.__pdf = new File([blob], 'danfe.pdf', { type: 'application/pdf' });
  });
  await p.evaluate(async () => {
    nfAbrirNova();
    const dt = new DataTransfer(); dt.items.add(window.__pdf);
    await nfArquivoSelecionado({ files: dt.files, value: '' });
  });
  await p.waitForTimeout(3500);
  ok('a IA recebeu o TEXTO do PDF, não a imagem',
    leituras.length === 1 && leituras[0].texto.length > 200 && !leituras[0].foto,
    JSON.stringify({ texto: (leituras[0] || {}).texto.length, foto: ((leituras[0] || {}).foto || '').length }));
  const folhas = await p.evaluate(() => ({ capa: (_nfFull || '').length, extras: _nfPags.length,
                                           thumb: ((_nfRascunho || {}).thumb || '').length }));
  ok('a folha 1 foi guardada mesmo tendo virado imagem em segundo plano', folhas.capa > 1000, JSON.stringify(folhas));
  ok('a folha 2 também', folhas.extras === 1, JSON.stringify(folhas));
  ok('e a miniatura da nota não se perdeu na corrida', folhas.thumb > 500, JSON.stringify(folhas));
  ok('a nota saiu preenchida pelo texto',
    await p.evaluate(() => _nfRascunho.razaoSocial) === 'CONCRETEIRA ALFA',
    await p.evaluate(() => _nfRascunho.razaoSocial));

  console.log('\nCONSULTA PELA CHAVE DESLIGADA NÃO SE PERGUNTA DUAS VEZES');
  // a ida ao Apps Script é a viagem mais cara do app; onde o serviço da SEFAZ
  // não está contratado, a resposta é sempre a mesma e não vale a espera
  const CH = '35240711111111000191550010000998871000998876';
  consultas = 0;
  const respostas = await p.evaluate(async (ch) => {
    const a = await nfConsultarPelaChave(ch);
    const b = await nfConsultarPelaChave(ch);
    return [a.motivo, b.motivo];
  }, CH + '0');
  ok('as duas consultas devolvem "não está ligada"',
    respostas.join(',') === 'sem_api,sem_api', JSON.stringify(respostas));
  ok('mas só a primeira foi ao servidor', consultas === 1, consultas + ' ida(s)');

  ok('nenhum erro de JavaScript no caminho todo', err.length === 0, err.slice(0, 3).join(' | '));

  console.log(falhas ? '\n' + falhas + ' FALHA(S)' : '\nTudo certo.');
  await b.close();
  process.exit(falhas ? 1 : 0);
})();
