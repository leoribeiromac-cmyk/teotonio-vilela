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
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const p = await b.newPage({ viewport: { width: 1380, height: 900 } });
  const err = [];
  p.on('pageerror', e => err.push('PAGEERROR: ' + e.message));
  p.on('console', m => { const t = m.text();
    if (m.type() === 'error' && !/Failed to load resource|net::/.test(t)) err.push('CONSOLE: ' + t); });

  const todas = [];        // toda ação que chegou ao servidor falso
  let imagens = [];        // {id, pagina} de cada nfImagem
  let salvas = [];         // payload de cada nfSalvar
  const NOTAS = [];
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
      corpo = { ok: true, pagina: pag, fileId: 'drv-' + par.id + '-p' + pag,
                link: 'https://drive/' + par.id + '/p' + pag, pasta: 'Agosto' };
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

  console.log('DUAS FOTOS DE UMA VEZ VIRAM DUAS FOLHAS');
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

  console.log('\n--- ERROS DE JS (' + err.length + ') ---');
  [...new Set(err)].slice(0, 8).forEach(e => console.log('  ' + e));
  console.log(falhas || err.length ? `\n${falhas} FALHA(S)` : '\nTudo certo.');
  await b.close();
  process.exit(falhas || err.length ? 1 : 0);
})();
