// Nota fiscal de duas folhas. Antes o app guardava só a primeira: a segunda
// era descartada em silêncio, tanto no PDF (só a folha 1 virava imagem) quanto
// na foto (o código pegava files[0] e ignorava o resto).
//
// Como rodar:
//   python3 -m http.server 8099        (na raiz do repositório)
//   node tests/notas-paginas.ui.test.js
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

  const todas = [];        // toda ação que chegou ao servidor falso
  let imagens = [];        // {id, pagina} de cada nfImagem
  let salvas = [];         // payload de cada nfSalvar
  const NOTAS = [];
  let servidorAntigo = false;
  await p.route('**://script.google.com/**', (route) => {
    const req = route.request();
    const u = new URL(req.url());
    const par = {};
    u.searchParams.forEach((v, k) => par[k] = v);
    // chamada com imagem vai por POST em multipart/form-data (FormData),
    // não em querystring — é assim que o app manda foto sem estourar a URL
    if (req.method() === 'POST') {
      const corpoBruto = req.postData() || '';
      const re = /name="([^"]+)"\r?\n\r?\n([\s\S]*?)\r?\n--/g;
      let m;
      while ((m = re.exec(corpoBruto)) !== null) par[m[1]] = m[2];
    }
    let corpo;
    if (par.action === 'login') corpo = { ok: true, usuario: 'Leonardo', perfil: 'admin', token: 't', obras: '*' };
    else if (par.action === 'usuariosNomes') corpo = { ok: true, usuarios: ['Leonardo'] };
    else if (par.action === 'nfListar') corpo = { ok: true, notas: NOTAS, saidas: [] };
    else if (par.action === 'nfImagem') {
      const pag = parseInt(par.pagina, 10) || 1;
      imagens.push({ id: par.id, pagina: pag });
      corpo = { ok: true, fileId: 'drv-' + par.id + '-p' + pag,
                link: 'https://drive/' + par.id + '/p' + pag, pasta: 'Agosto' };
      // backend antigo nao conhece `pagina` e nao devolve o campo
      if (!servidorAntigo) corpo.pagina = pag;
    }
    else if (par.action === 'nfSalvar') {
      salvas.push(par);
      // o servidor falso guarda a nota, senão a sincronização seguinte
      // (que agora roda sozinha) apagaria a cópia local
      const i = NOTAS.findIndex(x => x.clientId === par.clientId);
      const reg = { id: par.id, clientId: par.clientId, obra: par.obra, numero: par.numero || '',
                    dataEmissao: par.dataemissao || '', dataEntrada: par.dataentrada || '',
                    razaoSocial: par.razaosocial || '', vTotal: par.vtotal || 0,
                    status: par.status || 'Recebida', itens: par.itens || '[]',
                    driveId: par.driveid || '', driveLink: par.drivelink || '',
                    paginas: par.paginas || '[]', usuario: par.usuario || '' };
      if (i > -1) NOTAS[i] = reg; else NOTAS.push(reg);
      corpo = { ok: true, id: par.id };
    }
    else if (par.action === 'obterFoto') {
      corpo = { ok: true, mini: false,
                dataUri: 'data:image/jpeg;base64,' + 'A'.repeat(400) + par.fileId.length };
    }
    else if (par.action === 'ping') {
      corpo = servidorAntigo ? { ok: true, pong: true }
                             : { ok: true, pong: true, recursos: { paginas: true } };
    }
    else corpo = { ok: true };
    todas.push(par.action || '?');
    if (par.callback) return route.fulfill({ status: 200, contentType: 'application/javascript',
                                             body: `${par.callback}(${JSON.stringify(corpo)})` });
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(corpo) });
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
  await p.waitForTimeout(600);
  await p.evaluate(() => navigate('notas'));
  await p.waitForTimeout(900);

  console.log('O CAMPO DE ARQUIVO ACEITA MAIS DE UM ARQUIVO');
  // ponto cego do teste anterior: ele chamava nfArquivoSelecionado direto e
  // nunca olhou o <input>. Sem `multiple`, o caminho de várias folhas era
  // código morto — o celular só deixava escolher uma foto.
  await p.evaluate(() => nfAbrirNova());
  await p.waitForTimeout(600);
  const entradas = await p.evaluate(() =>
    [...document.querySelectorAll('input[type=file]')].map(i => ({
      accept: i.accept, multiple: i.multiple, captura: i.hasAttribute('capture') })));
  ok('achou os dois campos de arquivo da tela de nova nota', entradas.length >= 2,
    JSON.stringify(entradas));
  ok('TODOS aceitam seleção múltipla', entradas.every(e => e.multiple), JSON.stringify(entradas));
  ok('e a tela avisa que dá para mandar as duas folhas',
    /duas folhas/i.test(await p.evaluate(() => document.body.innerText)));

  console.log('\nDUAS FOTOS DE UMA VEZ VIRAM DUAS FOLHAS');
  // duas imagens diferentes, geradas no próprio navegador
  await p.evaluate(async () => {
    window.__arq = (txt, cor) => new Promise(res => {
      const c = document.createElement('canvas'); c.width = 600; c.height = 800;
      const g = c.getContext('2d');
      g.fillStyle = cor; g.fillRect(0, 0, 600, 800);
      g.fillStyle = '#000'; g.font = '48px sans-serif'; g.fillText(txt, 40, 120);
      c.toBlob(bl => res(new File([bl], txt + '.jpg', { type: 'image/jpeg' })), 'image/jpeg', .9);
    });
    nfAbrirNova();
    const f1 = await window.__arq('FOLHA1', '#eee');
    const f2 = await window.__arq('FOLHA2', '#ddd');
    const dt = new DataTransfer(); dt.items.add(f1); dt.items.add(f2);
    await nfArquivoSelecionado({ files: dt.files, value: '' });
  });
  await p.waitForTimeout(2500);

  const est = await p.evaluate(() => ({ capa: !!_nfFull, extras: _nfPags.length }));
  ok('a folha 1 virou a capa', est.capa);
  ok('a folha 2 entrou como página extra', est.extras === 1, JSON.stringify(est));
  ok('o formulário diz quantas páginas tem',
    /2 páginas guardadas/.test(await p.evaluate(() =>
      (document.getElementById('nfPagsInfo') || {}).textContent || '')),
    await p.evaluate(() => (document.getElementById('nfPagsInfo') || {}).textContent));

  console.log('\nSALVAR ENVIA AS DUAS FOLHAS');
  imagens = []; salvas = [];
  await p.evaluate(() => {
    document.getElementById('nf_razaoSocial').value = 'FORNECEDOR DUAS FOLHAS';
    document.getElementById('nf_vTotal').value = '1234,56';
    nfSalvarForm();
  });
  await p.waitForTimeout(4000);
  ok('subiu duas imagens', imagens.length === 2, JSON.stringify(imagens) + ' | ações: ' + todas.join(','));
  ok('uma como folha 1 e outra como folha 2',
    imagens.some(x => x.pagina === 1) && imagens.some(x => x.pagina === 2), JSON.stringify(imagens));
  const comPags = salvas.filter(s => s.paginas && s.paginas !== '[]');
  ok('a nota é gravada com a lista de páginas', comPags.length > 0,
    JSON.stringify(salvas.map(s => s.paginas)));
  ok('e a lista traz o arquivo da folha 2',
    /p2/.test(comPags.map(s => s.paginas).join('')), comPags.map(s => s.paginas).join(''));

  console.log('\nAS DUAS FOLHAS FICAM NO APARELHO');
  const local = await p.evaluate(async () => {
    const n = nfGet(obra().id)[0];
    return {
      paginasNaNota: (n.paginas || []).length,
      folha1: !!(await fotoLer(nfImgChave(obra().id, n.id))),
      folha2: !!(await fotoLer(nfImgChave(obra().id, n.id, 2))),
      chave2: nfImgChave(obra().id, n.id, 2)
    };
  });
  ok('a nota registra 1 página extra', local.paginasNaNota === 1, JSON.stringify(local));
  ok('a folha 1 está guardada', local.folha1);
  ok('a folha 2 está guardada em chave própria', local.folha2 && /:p2$/.test(local.chave2), local.chave2);

  console.log('\nVER A NOTA NAVEGA ENTRE AS FOLHAS');
  await p.evaluate(() => { const n = nfGet(obra().id)[0]; _nfRascunho = null; nfVerImagem(n.id); });
  await p.waitForTimeout(1200);
  ok('a janela mostra "Folha 1 de 2"',
    /Folha 1 de 2/.test(await p.evaluate(() => (document.getElementById('nfVerLbl') || {}).textContent || '')),
    await p.evaluate(() => (document.getElementById('nfVerLbl') || {}).textContent));
  ok('o botão de voltar começa desligado',
    await p.evaluate(() => (document.getElementById('nfVerAnt') || {}).disabled === true));
  const img1 = await p.evaluate(() => (document.getElementById('nfVerImg') || {}).src || '');
  await p.evaluate(() => document.getElementById('nfVerProx').click());
  await p.waitForTimeout(1200);
  ok('avançar leva para a folha 2',
    /Folha 2 de 2/.test(await p.evaluate(() => (document.getElementById('nfVerLbl') || {}).textContent || '')),
    await p.evaluate(() => (document.getElementById('nfVerLbl') || {}).textContent));
  const img2 = await p.evaluate(() => (document.getElementById('nfVerImg') || {}).src || '');
  ok('e mostra uma imagem DIFERENTE da folha 1', img1 && img2 && img1 !== img2);
  ok('no fim, avançar fica desligado',
    await p.evaluate(() => (document.getElementById('nfVerProx') || {}).disabled === true));

  console.log('\nBACKEND ANTIGO: A FOLHA 2 NÃO SOBE (senão apagaria a folha 1)');
  // o Code.gs antigo ignora `pagina` e usa o MESMO nome de arquivo: ele apaga
  // o existente antes de criar o novo. Subir a folha 2 destruiria a folha 1.
  await p.evaluate(() => { fecharModal(); NF_PAGS_SERVIDOR.sabe = null; NF_PAGS_SERVIDOR.avisado = false; });
  servidorAntigo = true;
  imagens = [];
  await p.evaluate(async () => {
    const arq = (t, c) => new Promise(res => { const cv = document.createElement('canvas');
      cv.width = 400; cv.height = 500; const g = cv.getContext('2d');
      g.fillStyle = c; g.fillRect(0, 0, 400, 500); g.fillStyle = '#000'; g.font = '30px sans-serif';
      g.fillText(t, 20, 60);
      cv.toBlob(b => res(new File([b], t + '.jpg', { type: 'image/jpeg' })), 'image/jpeg', .9); });
    nfAbrirNova();
    const dt = new DataTransfer();
    dt.items.add(await arq('A', '#fff')); dt.items.add(await arq('B', '#eee'));
    await nfArquivoSelecionado({ files: dt.files, value: '' });
  });
  await p.waitForTimeout(2500);
  await p.evaluate(() => {
    document.getElementById('nf_razaoSocial').value = 'BACKEND ANTIGO';
    document.getElementById('nf_vTotal').value = '99';
    nfSalvarForm();
  });
  await p.waitForTimeout(3500);
  ok('só a capa é enviada', imagens.length === 1 && imagens[0].pagina === 1, JSON.stringify(imagens));
  ok('e o usuário é avisado do porquê',
    /republicado/.test(await p.evaluate(() =>
      [...document.querySelectorAll('.toast')].map(t => t.textContent).join(' '))),
    await p.evaluate(() => [...document.querySelectorAll('.toast')].map(t => t.textContent).join(' ').slice(0, 120)));
  const guardadas = await p.evaluate(async () => {
    const n = nfGet(obra().id).find(x => x.razaoSocial === 'BACKEND ANTIGO');
    return n ? !!(await fotoLer(nfImgChave(obra().id, n.id, 2))) : false;
  });
  ok('mas a folha 2 fica guardada no aparelho, não se perde', guardadas);
  servidorAntigo = false;

  console.log('\nNOTA DE UMA FOLHA SÓ CONTINUA COMO ANTES');
  await p.evaluate(() => { fecharModal();
    nfSet(obra().id, [{ id: 'so1', clientId: 'so1', obraId: obra().id, numero: '55', status: 'Recebida',
      dataEntrada: '2026-08-01', itens: [], historico: [], thumb: '', vTotal: 10,
      drive: { fileId: 'drv-so1-p1', link: 'https://drive/so1' } }]);
    nfVerImagem('so1'); });
  await p.waitForTimeout(1200);
  ok('sem barra de páginas quando só há uma',
    await p.evaluate(() => !document.getElementById('nfVerLbl')));
  ok('e a imagem da folha única aparece',
    await p.evaluate(() => { const i = document.getElementById('nfVerImg');
      return !!i && i.style.display !== 'none' && !!i.src; }));

  console.log('\nNOTA SEM IMAGEM PODE RECEBER A FOTO DEPOIS');
  // o bloco da imagem dependia de `n.thumb`: nota digitada à mão, ou recebida
  // pela sincronização, não tinha nem como anexar a foto
  await p.evaluate(() => {
    fecharModal();
    nfSet(obra().id, [{ id: 'semimg', clientId: 'semimg', obraId: obra().id, numero: '77',
      status: 'Recebida', dataEntrada: '2026-08-03', itens: [], historico: [],
      thumb: '', drive: null, paginas: [], vTotal: 50, razaoSocial: 'DIGITADA A MAO' }]);
    nfEditar('semimg');
  });
  await p.waitForTimeout(700);
  ok('o formulário mostra o bloco mesmo sem imagem',
    await p.evaluate(() => !!document.getElementById('nfPagsInfo')));
  ok('e diz que falta a imagem',
    /Sem imagem da nota/.test(await p.evaluate(() =>
      (document.getElementById('nfPagsInfo') || {}).textContent || '')),
    await p.evaluate(() => (document.getElementById('nfPagsInfo') || {}).textContent));
  ok('o botão convida a anexar, não a "adicionar página"',
    /Anexar a imagem da nota/.test(await p.evaluate(() =>
      document.querySelector('#nfPagsInfo').parentElement.textContent)));

  await p.evaluate(async () => {
    const arq = (t) => new Promise(res => { const c = document.createElement('canvas');
      c.width = 400; c.height = 520; const g = c.getContext('2d');
      g.fillStyle = '#fff'; g.fillRect(0, 0, 400, 520); g.fillStyle = '#000';
      g.font = '28px sans-serif'; g.fillText(t, 20, 60);
      c.toBlob(b => res(new File([b], t + '.jpg', { type: 'image/jpeg' })), 'image/jpeg', .9); });
    const dt = new DataTransfer(); dt.items.add(await arq('CAPA'));
    await nfAddPaginas({ files: dt.files, value: '' });
  });
  await p.waitForTimeout(1500);
  const virou = await p.evaluate(() => ({ capa: !!_nfFull, thumb: !!_nfRascunho.thumb,
                                          extras: _nfPags.length,
                                          txt: (document.getElementById('nfPagsInfo') || {}).textContent || '' }));
  ok('a primeira folha anexada vira a CAPA, não a página 2',
    virou.capa && virou.extras === 0, JSON.stringify(virou));
  ok('e a nota passa a ter miniatura', virou.thumb);
  ok('a contagem passa a dizer uma página', /Uma página/.test(virou.txt), virou.txt);

  console.log('\nTERCEIRA FOLHA NÃO SOBRESCREVE A SEGUNDA');
  await p.evaluate(() => { NF_PAGS_SERVIDOR.sabe = null; NF_PAGS_SERVIDOR.avisado = false; });
  // renumerar sempre a partir de 2 fazia a folha nova apagar a anterior no
  // Drive, e a contagem com Math.max escondia isso
  imagens = [];
  await p.evaluate(async () => {
    fecharModal();
    nfSet(obra().id, [{ id: 'tres', clientId: 'tres', obraId: obra().id, numero: '300',
      status: 'Recebida', dataEntrada: '2026-08-04', itens: [], historico: [],
      thumb: 'data:image/jpeg;base64,AAAA', vTotal: 30, razaoSocial: 'TRES FOLHAS',
      drive: { fileId: 'drv-tres-p1', link: 'https://drive/tres/1' },
      paginas: [{ fileId: 'drv-tres-p2', link: 'https://drive/tres/2', pagina: 2 }] }]);
    nfEditar('tres');
  });
  await p.waitForTimeout(700);
  ok('a nota já conta 2 páginas', /2 páginas guardadas/.test(await p.evaluate(() =>
    (document.getElementById('nfPagsInfo') || {}).textContent || '')),
    await p.evaluate(() => (document.getElementById('nfPagsInfo') || {}).textContent));

  await p.evaluate(async () => {
    const arq = (t) => new Promise(res => { const c = document.createElement('canvas');
      c.width = 300; c.height = 400; const g = c.getContext('2d');
      g.fillStyle = '#fff'; g.fillRect(0, 0, 300, 400); g.fillStyle = '#000';
      g.font = '24px sans-serif'; g.fillText(t, 15, 50);
      c.toBlob(b => res(new File([b], t + '.jpg', { type: 'image/jpeg' })), 'image/jpeg', .9); });
    const dt = new DataTransfer(); dt.items.add(await arq('TERCEIRA'));
    await nfAddPaginas({ files: dt.files, value: '' });
  });
  await p.waitForTimeout(1200);
  ok('agora a contagem diz 3 páginas (soma, não máximo)',
    /3 páginas guardadas/.test(await p.evaluate(() =>
      (document.getElementById('nfPagsInfo') || {}).textContent || '')),
    await p.evaluate(() => (document.getElementById('nfPagsInfo') || {}).textContent));

  await p.evaluate(() => {
    document.getElementById('nf_vTotal').value = '30';
    nfSalvarForm();
  });
  await p.waitForTimeout(3500);
  const pags = imagens.filter(x => x.pagina > 1).map(x => x.pagina);
  ok('a folha nova sobe como página 3, não como 2', pags.includes(3) && !pags.includes(2),
    JSON.stringify(imagens));
  ok('e a nota fica com 3 folhas registradas',
    await p.evaluate(() => {
      const n = nfGet(obra().id).find(x => x.id === 'tres');
      return n && (n.paginas || []).filter(Boolean).length === 2;
    }),
    await p.evaluate(() => JSON.stringify((nfGet(obra().id).find(x => x.id === 'tres') || {}).paginas)));

  console.log('\nFOLHA QUE NÃO SUBIU CONTINUA EXISTINDO PARA O APP');
  servidorAntigo = true;
  await p.evaluate(() => { NF_PAGS_SERVIDOR.sabe = null; NF_PAGS_SERVIDOR.avisado = false; });
  await p.evaluate(async () => {
    fecharModal();
    nfSet(obra().id, [{ id: 'presa', clientId: 'presa', obraId: obra().id, numero: '500',
      status: 'Recebida', dataEntrada: '2026-08-04', itens: [], historico: [],
      thumb: 'data:image/jpeg;base64,AAAA', vTotal: 50, razaoSocial: 'FOLHA PRESA',
      drive: { fileId: 'drv-presa-p1', link: 'https://drive/presa/1' }, paginas: [] }]);
    nfEditar('presa');
    const arq = () => new Promise(res => { const c = document.createElement('canvas');
      c.width = 300; c.height = 400; c.getContext('2d').fillRect(0, 0, 300, 400);
      c.toBlob(b => res(new File([b], 'p.jpg', { type: 'image/jpeg' })), 'image/jpeg', .9); });
    const dt = new DataTransfer(); dt.items.add(await arq());
    await nfAddPaginas({ files: dt.files, value: '' });
  });
  await p.waitForTimeout(1200);
  await p.evaluate(() => { document.getElementById('nf_vTotal').value = '50'; nfSalvarForm(); });
  await p.waitForTimeout(3500);
  const presa = await p.evaluate(async () => {
    const n = nfGet(obra().id).find(x => x.id === 'presa');
    return { paginas: (n.paginas || []).length,
             local: !!((n.paginas || [])[0] || {}).local,
             noAparelho: !!(await fotoLer(nfImgChave(obra().id, 'presa', 2))),
             total: nfNumPaginas(n) };
  });
  ok('a nota registra a folha mesmo sem ela ter subido', presa.paginas === 1 && presa.local,
    JSON.stringify(presa));
  ok('a imagem dela está no aparelho', presa.noAparelho);
  ok('e a nota conta 2 folhas', presa.total === 2, JSON.stringify(presa));
  const enviado = salvas.filter(s2 => /presa/.test(s2.clientId || '')).map(s2 => s2.paginas).join('');
  ok('mas a folha local NÃO é gravada na planilha como se tivesse subido',
    !/fileId/.test(enviado), enviado);
  servidorAntigo = false;

  console.log('\n--- ERROS DE JS (' + err.length + ') ---');
  [...new Set(err)].slice(0, 8).forEach(e => console.log('  ' + e));
  console.log(falhas || err.length ? `\n${falhas} FALHA(S)` : '\nTudo certo.');
  await b.close();
  process.exit(falhas || err.length ? 1 : 0);
})();
