// Uma nota lançada num aparelho ficava horas sem aparecer no outro: a tela de
// Notas só buscava do servidor quando era ABERTA, e mesmo quando buscava não se
// redesenhava. Estes testes provam que agora ela se atualiza sozinha, avisa
// quando não consegue, e não esconde uma lista velha atrás de uma tela igual.
//
// Como rodar:
//   python3 -m http.server 8099        (na raiz do repositório)
//   node tests/notas-sync.ui.test.js
const { chromium } = require('playwright');
let falhas = 0;
const ok = (n, c, e) => { if (c) console.log('  ✓ ' + n); else { falhas++; console.log('  ✗ ' + n + (e !== undefined ? '  → ' + e : '')); } };

const nota = (num, obra) => ({
  id: 'n' + num, clientId: 'n' + num, obra, numero: String(num),
  dataEmissao: '2026-08-01', dataEntrada: '2026-08-02',
  razaoSocial: 'FORNECEDOR ' + num, vTotal: 100, status: 'Recebida',
  usuario: 'Leonardo', itens: '[]'
});

(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const p = await b.newPage({ viewport: { width: 1380, height: 900 } });
  const err = [];
  p.on('pageerror', e => err.push('PAGEERROR: ' + e.message));
  p.on('console', m => { const t = m.text();
    if (m.type() === 'error' && !/Failed to load resource|net::/.test(t)) err.push('CONSOLE: ' + t); });

  // o "servidor" tem uma nota; depois ganha outra, como se outro aparelho
  // tivesse lançado
  const NOTAS = { teotonio: [nota(1001, 'teotonio')], ranario: [nota(2002, 'ranario')] };
  let listagens = 0;
  let servidorCai = false;
  await p.route('**://script.google.com/**', (route) => {
    const req = route.request();
    const u = new URL(req.url());
    const par = {};
    u.searchParams.forEach((v, k) => par[k] = v);
    if (req.method() === 'POST') {
      (req.postData() || '').split('&').forEach(x => { const [k, v] = x.split('=');
        if (k) par[decodeURIComponent(k)] = decodeURIComponent((v || '').replace(/\+/g, ' ')); });
    }
    let corpo;
    if (par.action === 'login') corpo = { ok: true, usuario: 'Leonardo', perfil: 'admin', token: 't', obras: '*' };
    else if (par.action === 'usuariosNomes') corpo = { ok: true, usuarios: ['Leonardo'] };
    else if (par.action === 'obterFoto') {
      corpo = { ok: true, mini: par.mini === '1',
                dataUri: 'data:image/jpeg;base64,' + 'A'.repeat(600) };
    }
    else if (par.action === 'nfListar') {
      listagens++;
      corpo = servidorCai ? { ok: false, error: 'FALHA_SIMULADA' }
                          : { ok: true, notas: NOTAS[par.obra] || [], saidas: [] };
    }
    else corpo = { ok: true };
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

  const texto = () => p.evaluate(() => document.getElementById('page').textContent);

  await p.evaluate(() => navigate('notas'));
  await p.waitForTimeout(1200);

  console.log('A TELA DIZ QUANDO SINCRONIZOU');
  ok('mostra o carimbo de atualização', /atualizado/.test(await texto()), (await texto()).slice(0, 120));
  ok('e tem botão de atualizar', await p.evaluate(() => !!document.getElementById('nfBtAtualizar')));
  ok('a primeira nota está na tela', /FORNECEDOR 1001/.test(await texto()));

  console.log('\nNOTA LANÇADA EM OUTRO APARELHO APARECE SOZINHA');
  NOTAS.teotonio.push(nota(1002, 'teotonio'));
  ok('ainda não está na tela', !/FORNECEDOR 1002/.test(await texto()));
  await p.evaluate(() => nfCarregar(obra().id, { fundo: true }));
  await p.waitForTimeout(1000);
  ok('depois de uma sincronização de fundo, ela aparece SEM sair da tela',
    /FORNECEDOR 1002/.test(await texto()));

  console.log('\nVOLTAR AO APP RESSINCRONIZA');
  NOTAS.teotonio.push(nota(1003, 'teotonio'));
  const antesVis = listagens;
  await p.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await p.waitForTimeout(1500);
  ok('trazer o app para a frente dispara uma listagem', listagens > antesVis,
    antesVis + ' → ' + listagens);
  ok('e a nota nova entra na tela', /FORNECEDOR 1003/.test(await texto()));

  console.log('\nO BOTÃO ATUALIZAR FUNCIONA');
  NOTAS.teotonio.push(nota(1004, 'teotonio'));
  await p.evaluate(() => nfAtualizarAgora());
  await p.waitForTimeout(1200);
  ok('busca e mostra na hora', /FORNECEDOR 1004/.test(await texto()));

  console.log('\nQUANDO NÃO DÁ PARA SINCRONIZAR, A TELA DIZ');
  servidorCai = true;
  await p.evaluate(() => nfAtualizarAgora());
  await p.waitForTimeout(1500);
  const t = await texto();
  ok('avisa que não conseguiu atualizar', /não consegui atualizar/.test(t), t.slice(0, 160));
  ok('mas não apaga o que já estava aqui', /FORNECEDOR 1004/.test(t));
  servidorCai = false;

  console.log('\nSEM LOGIN, NÃO FINGE QUE ESTÁ ATUALIZADO');
  await p.evaluate(() => { localStorage.removeItem(CONFIG.ls.token); nfSync[OBRA.id] = { em: 0, erro: '' }; });
  await p.evaluate(() => nfCarregar(obra().id));
  await p.waitForTimeout(400);
  await p.evaluate(() => render());
  await p.waitForTimeout(300);
  ok('diz que precisa entrar', /entre para ver as notas/.test(await texto()),
    (await texto()).slice(0, 160));
  await p.evaluate(() => localStorage.setItem(CONFIG.ls.token, 't'));

  console.log('\nO SERVIDOR NÃO PODE APAGAR O QUE ESTÁ AQUI POR ENGANO');
  // lista vazia com notas no aparelho quase nunca é "apagaram tudo": é chamada
  // torta. Antes isso limpava o aparelho em silêncio.
  const guardadas = await p.evaluate(() => nfGet(OBRA.id).length);
  ok('há notas guardadas antes do teste', guardadas > 0, guardadas);
  const backup = NOTAS.teotonio.slice();
  NOTAS.teotonio.length = 0;
  await p.evaluate(() => nfAtualizarAgora());
  await p.waitForTimeout(1500);
  ok('lista vazia do servidor NÃO apaga as notas do aparelho',
    await p.evaluate(() => nfGet(OBRA.id).length) === guardadas,
    await p.evaluate(() => nfGet(OBRA.id).length) + ' de ' + guardadas);
  ok('e a tela avisa que não conseguiu atualizar',
    /não consegui atualizar/.test(await texto()));
  backup.forEach(n => NOTAS.teotonio.push(n));
  await p.evaluate(() => nfAtualizarAgora());
  await p.waitForTimeout(1500);

  console.log('\nNOTA RECUSADA PELO SERVIDOR NÃO SOME DO APARELHO');
  // a fila descarta o item depois de um erro definitivo; sem a marca
  // `doServidor`, a sincronização seguinte apagava a nota de quem a lançou
  await p.evaluate(() => {
    const arr = nfGet(OBRA.id);
    arr.unshift({ id: 'orfa', clientId: 'orfa', obraId: OBRA.id, numero: '4040',
      razaoSocial: 'RECUSADA PELO SERVIDOR', status: 'Recebida', dataEntrada: '2026-08-05',
      itens: [], historico: [], thumb: '', drive: null, paginas: [], vTotal: 70 });
    nfSet(OBRA.id, arr);
  });
  await p.evaluate(() => nfAtualizarAgora());
  await p.waitForTimeout(1600);
  ok('a nota que o servidor não conhece continua aqui',
    await p.evaluate(() => !!nfGet(OBRA.id).find(n => n.id === 'orfa')));
  ok('e a tela diz que ela não foi confirmada',
    /não confirmadas pelo servidor/.test(await texto()), (await texto()).slice(0, 200));

  console.log('\nNOTA QUE VEIO DE OUTRO APARELHO GANHA MINIATURA');
  // `nfDoServidor` monta `thumb` da cópia LOCAL: quem NÃO lançou a nota
  // recebia um quadro cinza, como se ela tivesse sido lançada sem imagem.
  NOTAS.teotonio.push(Object.assign(nota(1010, 'teotonio'),
    { driveId: 'drv-1010', driveLink: 'https://drive/1010' }));
  await p.evaluate(() => nfAtualizarAgora());
  await p.waitForTimeout(1500);
  // o servidor não guarda miniatura: ela é montada no aparelho de quem lançou
  ok('o servidor não manda miniatura nenhuma',
    !NOTAS.teotonio.find(x => x.numero === '1010').thumb);
  ok('o quadro dela existe na tela, esperando a imagem',
    await p.evaluate(() => { const n = nfGet(OBRA.id).find(x => x.numero === '1010');
      return !!n && !!document.getElementById('nfmini-' + n.id); }));
  await p.waitForTimeout(2000);
  const mini = await p.evaluate(() => {
    const n = nfGet(OBRA.id).find(x => x.numero === '1010');
    const img = n && document.getElementById('nfmini-' + n.id);
    return { pintou: !!(img && img.style.display === 'block' && img.src),
             virouThumb: !!(n && n.thumb) };
  });
  ok('a miniatura é buscada do Drive e aparece', mini.pintou, JSON.stringify(mini));
  ok('e passa a ser a miniatura da nota, sem baixar de novo', mini.virouThumb);

  await p.evaluate(() => nfSet(OBRA.id, nfGet(OBRA.id).filter(n => n.id !== 'orfa')));

  console.log('\nA TRAVA DE CARGA É POR OBRA, NÃO GLOBAL');
  const trava = await p.evaluate(async () => {
    nfCarregar('teotonio');                    // deixa a da Teotônio em curso
    const bloqueada = typeof _nfCarregando === 'object' && !!_nfCarregando['teotonio'];
    const outraLivre = !_nfCarregando['ranario'];
    return { bloqueada, outraLivre };
  });
  ok('a obra em carga fica travada', trava.bloqueada);
  ok('a outra obra continua livre para carregar', trava.outraLivre);
  await p.waitForTimeout(1200);

  await p.evaluate(() => trocarObra('ranario', { manterTela: true }));
  await p.waitForTimeout(1500);
  ok('trocar de obra carrega a lista da obra nova',
    /FORNECEDOR 2002/.test(await texto()) && !/FORNECEDOR 1001/.test(await texto()),
    (await texto()).slice(0, 160));

  console.log('\n--- ERROS DE JS (' + err.length + ') ---');
  [...new Set(err)].slice(0, 8).forEach(e => console.log('  ' + e));
  console.log(falhas || err.length ? `\n${falhas} FALHA(S)` : '\nTudo certo.');
  await b.close();
  process.exit(falhas || err.length ? 1 : 0);
})();
