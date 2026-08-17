// Duas defesas novas do módulo de notas fiscais:
//
//  1. AVISO DE NOTA REPETIDA. A mesma DANFE entra duas vezes com frequência
//     (uma via no barracão, outra no escritório; foto tremida e relançada).
//     Só aparecia semanas depois, com o material dobrado no estoque.
//  2. FORNECEDOR PELO CNPJ. A chave de acesso carrega o CNPJ do emitente,
//     não o nome dele. O app preenchia número, série, CNPJ e UF e parava
//     ali — o fornecedor continuava em branco quando a IA não respondia.
//     Agora o cadastro público da Receita (BrasilAPI / Minha Receita)
//     completa razão social, município e UF.
//
// Como rodar:
//   python3 -m http.server 8099        (na raiz do repositório)
//   node tests/notas-duplicadas.ui.test.js
const { chromium } = require('playwright');
let falhas = 0;
const ok = (n, c, e) => { if (c) console.log('  ✓ ' + n); else { falhas++; console.log('  ✗ ' + n + (e !== undefined ? '  → ' + e : '')); } };

// duas notas com a MESMA chave (a repetida) e uma terceira, sozinha
const CHAVE = '35260712345678000195550010000012341000012347';
const NOTAS = [
  { id: 'nA', clientId: 'nA', obra: 'teotonio', numero: '1234', serie: '1', chave: '',
    dataEmissao: '2026-07-01', dataEntrada: '2026-07-02', cnpj: '12345678000195',
    razaoSocial: 'Concreteira Alfa', vTotal: 1500, status: 'Recebida', usuario: 'Leonardo', itens: '[]' },
  { id: 'nB', clientId: 'nB', obra: 'teotonio', numero: '01234', serie: '01', chave: '',
    dataEmissao: '2026-07-01', dataEntrada: '2026-07-05', cnpj: '12345678000195',
    razaoSocial: 'Concreteira Alfa', vTotal: 1500, status: 'Recebida', usuario: 'Wallace', itens: '[]' },
  { id: 'nC', clientId: 'nC', obra: 'teotonio', numero: '9999', serie: '1', chave: '',
    dataEmissao: '2026-07-08', dataEntrada: '2026-07-08', cnpj: '99999999000191',
    razaoSocial: 'Ferragens Beta', vTotal: 300, status: 'Recebida', usuario: 'Leonardo', itens: '[]' }
];

(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const p = await b.newPage({ viewport: { width: 1440, height: 950 } });
  const err = [];
  p.on('pageerror', e => err.push('PAGEERROR: ' + e.message));
  p.on('console', m => { const t = m.text();
    if (m.type() === 'error' && !/Failed to load resource|net::/.test(t)) err.push('CONSOLE: ' + t); });

  const responder = (params) => {
    if (params.action === 'usuariosNomes') return { ok: true, usuarios: ['Leonardo'] };
    if (params.action === 'login') return { ok: true, usuario: 'Leonardo', perfil: 'admin', token: 'tok', obras: '*' };
    if (params.action === 'nfListar') return { ok: true, notas: params.obra === 'teotonio' ? NOTAS : [], saidas: [] };
    return { ok: true };
  };
  await p.route('**://script.google.com/**', (route) => {
    const req = route.request();
    const u = new URL(req.url());
    const params = {};
    u.searchParams.forEach((v, k) => params[k] = v);
    if (req.method() === 'POST') {
      (req.postData() || '').split('&').forEach(par => {
        const [k, v] = par.split('=');
        if (k) params[decodeURIComponent(k)] = decodeURIComponent((v || '').replace(/\+/g, ' '));
      });
    }
    const corpo = responder(params);
    if (params.callback) {
      return route.fulfill({ status: 200, contentType: 'application/javascript',
                             body: `${params.callback}(${JSON.stringify(corpo)})` });
    }
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(corpo) });
  });
  await p.route('**://docs.google.com/**', r => r.fulfill({ status: 200, body: '' }));

  // Receita falsa: a primeira fonte responde; a segunda nunca é chamada.
  let pedidosCNPJ = 0;
  await p.route('**://brasilapi.com.br/**', (route) => {
    pedidosCNPJ++;
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
      cnpj: '12345678000195', razao_social: 'CONCRETEIRA ALFA LTDA', nome_fantasia: 'Alfa Concreto',
      municipio: 'SAO PAULO', uf: 'SP', descricao_situacao_cadastral: 'ATIVA',
      cnae_fiscal_descricao: 'Fabricação de concreto', logradouro: 'RUA TESTE', numero: '100', bairro: 'CENTRO'
    }) });
  });
  let usouSegunda = 0;
  await p.route('**://minhareceita.org/**', (route) => { usouSegunda++; route.fulfill({ status: 500, body: '' }); });

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
  await p.waitForTimeout(1200);

  console.log('NOTA REPETIDA');
  const grupos = await p.evaluate(() => nfGruposDuplicados(obra().id).map(g => ({
    n: g.notas.length, ids: g.notas.map(x => x.id).sort(), motivo: g.motivo })));
  ok('acha o par repetido, e só ele', grupos.length === 1 && grupos[0].n === 2, JSON.stringify(grupos));
  ok('zero à esquerda não engana ("01234"/"01" = "1234"/"1")',
    grupos.length === 1 && grupos[0].ids.join(',') === 'nA,nB', JSON.stringify(grupos));

  const tela = await p.evaluate(() => document.getElementById('page').innerHTML);
  ok('a lista avisa em cima', /lançada em duplicidade|lançadas em duplicidade/.test(tela));
  ok('e marca os dois cartões repetidos',
    (tela.match(/nf-card-dup/g) || []).length === 2, (tela.match(/nf-card-dup/g) || []).length);

  ok('nota cancelada não conta como repetida', await p.evaluate(() => {
    const o = obra().id, arr = nfGet(o);
    arr.find(x => x.id === 'nB').status = 'Cancelada';
    nfSet(o, arr);
    const g = nfGruposDuplicados(o);
    arr.find(x => x.id === 'nB').status = 'Recebida';
    nfSet(o, arr);
    return g.length === 0;
  }));

  ok('chave igual basta, mesmo com número diferente', await p.evaluate((ch) => {
    const o = obra().id, arr = nfGet(o);
    arr.find(x => x.id === 'nC').chave = ch;
    nfSet(o, arr);
    const d = nfDuplicadas(o, { id: 'novo', chave: ch, numero: '777', cnpj: '', vTotal: 0 });
    arr.find(x => x.id === 'nC').chave = '';
    nfSet(o, arr);
    return d.length === 1 && d[0].certeza && d[0].nota.id === 'nC';
  }, CHAVE));

  ok('fornecedor diferente com o mesmo número NÃO é repetida', await p.evaluate(() =>
    nfDuplicadas(obra().id, { id: 'x', numero: '1234', serie: '1', cnpj: '99999999000191', vTotal: 0 })
      .length === 0));

  console.log('\nA TELA DE CONFERÊNCIA');
  await p.evaluate(() => nfEditar('nA'));
  await p.waitForTimeout(400);
  const modal = await p.evaluate(() => document.body.innerHTML);
  ok('abre com o aviso da repetida', /já está lançada nesta obra/.test(modal));
  ok('e mostra qual é a outra', /NF 1234/.test(modal) && /Abrir a que já existe/.test(modal));
  await p.evaluate(() => fecharModal());

  console.log('\nFORNECEDOR PELO CNPJ');
  const r = await p.evaluate(async () => {
    localStorage.removeItem('gestor:nf:cnpj:v1');
    return await nfConsultarCNPJ('12.345.678/0001-95');
  });
  ok('busca na Receita e traz a razão social',
    r.ok && r.dados.razaoSocial === 'CONCRETEIRA ALFA LTDA', JSON.stringify(r));
  ok('traz também município e UF', r.ok && r.dados.municipio === 'SAO PAULO' && r.dados.uf === 'SP');
  ok('a primeira fonte respondeu — a segunda nem foi chamada', pedidosCNPJ === 1 && usouSegunda === 0,
    'brasilapi=' + pedidosCNPJ + ' minhareceita=' + usouSegunda);

  const r2 = await p.evaluate(async () => await nfConsultarCNPJ('12345678000195'));
  ok('a segunda consulta sai do aparelho, sem rede', r2.ok && r2.fonte === 'aparelho' && pedidosCNPJ === 1);

  const nota = await p.evaluate(async () => {
    const n = { cnpj: '12345678000195', razaoSocial: '', municipio: '', uf: '' };
    await nfCompletarEmitente(n);
    return n;
  });
  ok('completa a nota que veio só com o CNPJ da chave',
    nota.razaoSocial === 'CONCRETEIRA ALFA LTDA' && nota.uf === 'SP', JSON.stringify(nota));

  const naoMexe = await p.evaluate(async () => {
    const n = { cnpj: '12345678000195', razaoSocial: 'Nome que veio do XML', municipio: 'Guarulhos', uf: 'SP' };
    await nfCompletarEmitente(n);
    return n.razaoSocial;
  });
  ok('não passa por cima do que já estava preenchido', naoMexe === 'Nome que veio do XML', naoMexe);

  const invalido = await p.evaluate(async () => await nfConsultarCNPJ('11111111111111'));
  ok('CNPJ que não fecha o dígito nem vai à rede', !invalido.ok && pedidosCNPJ === 1, JSON.stringify(invalido));

  console.log('\nERROS DE CONSOLE');
  ok('nenhum erro de console', err.length === 0, err.join(' | '));

  await b.close();
  console.log(falhas ? `\n${falhas} falha(s)` : '\nTudo certo.');
  process.exit(falhas ? 1 : 0);
})();
