// O painel de Notas Fiscais ganhou filtros, uma aba de CONSULTAS (tabela
// dinâmica: linha × coluna × medida), visão em tabela e mais tabelas no
// Painel, no Estoque e nos Preços.
//
// O que este teste segura:
//   • o filtro é UM só e vale para a lista, para as consultas e para o painel;
//   • cada filtro novo (fornecedor, material, faixa de valor, intervalo de
//     datas, base da data, marcadores) recorta de verdade a lista;
//   • a consulta cruzada soma o mesmo total, cruzando ou não;
//   • quando material entra na conta, a apuração desce para o item da nota —
//     e frete/ICMS, que são da nota inteira, não descem junto;
//   • as telas novas abrem sem erro de console em nenhuma aba.
//
// Como rodar:
//   python3 -m http.server 8099        (na raiz do repositório)
//   node tests/notas-consultas.ui.test.js
const { chromium } = require('playwright');
let falhas = 0;
const ok = (n, c, e) => { if (c) console.log('  ✓ ' + n); else { falhas++; console.log('  ✗ ' + n + (e !== undefined ? '  → ' + e : '')); } };

// três fornecedores, três meses, três materiais — o suficiente para cruzar
const NOTAS = [
  { id: 'a1', clientId: 'a1', obra: 'teotonio', numero: '101', serie: '1',
    cnpj: '11111111000191', razaoSocial: 'CONCRETEIRA ALFA', municipio: 'São Paulo', uf: 'SP',
    dataEmissao: '2026-06-10', dataEntrada: '2026-06-12',
    vProd: 10000, vFrete: 0, vTotal: 10000, vBaseICMS: 10000, vICMS: 1800,
    status: 'Conferida', responsavel: 'Leonardo', criadoEm: 1,
    itens: [{ descricao: 'CONCRETO USINADO 25 MPA', un: 'M3', qtd: 50, vUnit: 200, vTotal: 10000 }] },
  { id: 'a2', clientId: 'a2', obra: 'teotonio', numero: '102', serie: '1',
    cnpj: '11111111000191', razaoSocial: 'CONCRETEIRA ALFA', municipio: 'São Paulo', uf: 'SP',
    dataEmissao: '2026-07-05', dataEntrada: '2026-07-07',
    vProd: 13000, vFrete: 500, vTotal: 13500, vBaseICMS: 13000, vICMS: 2340,
    status: 'Recebida', responsavel: 'Leonardo', criadoEm: 2,
    itens: [{ descricao: 'CONCRETO USINADO 25 MPA', un: 'M3', qtd: 50, vUnit: 260, vTotal: 13000 }] },
  { id: 'b1', clientId: 'b1', obra: 'teotonio', numero: '55', serie: '2',
    cnpj: '22222222000191', razaoSocial: 'BRITAS BETA', municipio: 'Guarulhos', uf: 'SP',
    dataEmissao: '2026-07-02', dataEntrada: '2026-07-03',
    vProd: 4000, vFrete: 200, vTotal: 4200, vBaseICMS: 4000, vICMS: 720,
    status: 'Integrada ao estoque', responsavel: 'Wallace', criadoEm: 3,
    itens: [{ descricao: 'BRITA 1', un: 'M3', qtd: 100, vUnit: 40, vTotal: 4000 }] },
  { id: 'b2', clientId: 'b2', obra: 'teotonio', numero: '56', serie: '2',
    cnpj: '22222222000191', razaoSocial: 'BRITAS BETA', municipio: 'Guarulhos', uf: 'SP',
    dataEmissao: '2026-08-01', dataEntrada: '2026-08-02',
    vProd: 3000, vFrete: 0, vTotal: 3000, vBaseICMS: 3000, vICMS: 540,
    status: 'Recebida', responsavel: 'Wallace', criadoEm: 4,
    itens: [{ descricao: 'BRITA 1', un: 'M3', qtd: 100, vUnit: 30, vTotal: 3000 }] },
  { id: 'c1', clientId: 'c1', obra: 'teotonio', numero: '900', serie: '1',
    cnpj: '33333333000191', razaoSocial: 'TUBOS GAMA', municipio: 'Osasco', uf: 'SP',
    dataEmissao: '2026-08-10', dataEntrada: '2026-08-11',
    vProd: 20000, vFrete: 1000, vTotal: 21000, vBaseICMS: 20000, vICMS: 3600,
    status: 'Em análise', responsavel: 'Leonardo', criadoEm: 5,
    itens: [{ descricao: 'TUBO PVC DN 400', un: 'M', qtd: 200, vUnit: 100, vTotal: 20000 }] }
];
const TOTAL = 10000 + 13500 + 4200 + 3000 + 21000;

(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const p = await b.newPage({ viewport: { width: 1440, height: 950 } });
  const err = [];
  p.on('pageerror', e => err.push('PAGEERROR: ' + e.message));
  p.on('console', m => {
    const t = m.text();
    if (m.type() === 'error' && !/Failed to load resource|net::/.test(t)) err.push('CONSOLE: ' + t);
  });

  await p.route('**://script.google.com/**', (route) => {
    const req = route.request();
    const u = new URL(req.url());
    const par = {};
    u.searchParams.forEach((v, k) => par[k] = v);
    let corpo = { ok: true };
    if (par.action === 'login') corpo = { ok: true, usuario: 'Leonardo', perfil: 'admin', token: 't', obras: '*' };
    else if (par.action === 'usuariosNomes') corpo = { ok: true, usuarios: ['Leonardo'] };
    else if (par.action === 'nfListar') corpo = { ok: true, notas: [], saidas: [] };
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
    (document.getElementById('loginUser') || document.getElementById('loginUserSelect')).value = 'Leonardo';
    document.getElementById('loginPass').value = 'x';
    await fazerLogin();
  });
  await p.waitForTimeout(600);

  // as notas entram direto no aparelho, com o estoque que elas geram
  await p.evaluate((notas) => {
    nfSet(obra().id, notas);
    notas.forEach(n => nfIntegrarEstoque(obra().id, n));
    nfSaiSet(obra().id, [{ id: 's1', materialId: nfNorm('BRITA 1'), descricao: 'BRITA 1', un: 'M3',
      qtd: 60, dataISO: '2026-07-20', capId: 'Drenagem', rua: 'Rua das Acácias',
      responsavel: 'Wallace', usuario: 'Wallace', criadoEm: 9 }]);
    navigate('notas');
  }, NOTAS);
  await p.waitForTimeout(900);

  const tela = () => p.evaluate(() => document.getElementById('page').innerHTML);
  const txt = () => p.evaluate(() => document.getElementById('page').textContent);
  const filtradas = () => p.evaluate(() => nfFiltrar(obra()).map(n => n.numero));
  const zerar = () => p.evaluate(() => { nfLimparFiltros(); });

  console.log('AS ABAS');
  const abas = await p.evaluate(() => [...document.querySelectorAll('.nf-abas .btn-toggle')].map(b => b.textContent.trim()));
  ok('a tela tem as cinco abas, com Consultas', abas.length === 5 && abas.some(a => /Consultas/.test(a)), JSON.stringify(abas));

  console.log('\nA FAIXA DE NÚMEROS DA LISTA');
  ok('mostra as 5 notas do filtro', /5\s*\/\s*5/.test((await txt()).replace(/\s+/g, ' ')), (await txt()).slice(0, 200));
  ok('e soma o valor do recorte', await p.evaluate((t) => {
    const r = nfResumo(nfFiltrar(obra()));
    return Math.abs(r.total - t) < 0.01 && Math.abs(r.frete - 1700) < 0.01;
  }, TOTAL));
  ok('o ticket médio é o total dividido pelas notas', await p.evaluate((t) => {
    const r = nfResumo(nfFiltrar(obra()));
    return Math.abs(r.ticket - t / 5) < 0.01;
  }, TOTAL));

  console.log('\nOS FILTROS NOVOS');
  await p.evaluate(() => nfSetFiltro('nfForn', '22222222000191'));
  await p.waitForTimeout(250);
  ok('fornecedor: só as duas da Britas Beta', JSON.stringify(await filtradas()) === JSON.stringify(['56', '55']), JSON.stringify(await filtradas()));
  await zerar();

  await p.evaluate(() => nfSetFiltro('nfMat', nfNorm('TUBO PVC DN 400')));
  await p.waitForTimeout(250);
  ok('material: só a nota que tem o tubo', JSON.stringify(await filtradas()) === JSON.stringify(['900']), JSON.stringify(await filtradas()));
  await zerar();

  await p.evaluate(() => { nfSetFiltro('nfVmin', '5000'); nfSetFiltro('nfVmax', '15000'); });
  await p.waitForTimeout(250);
  ok('faixa de valor: fica só o que está entre 5 e 15 mil',
    JSON.stringify(await filtradas()) === JSON.stringify(['102', '101']), JSON.stringify(await filtradas()));
  await zerar();

  await p.evaluate(() => { nfSetFiltro('nfDe', '2026-07-01'); nfSetFiltro('nfAte', '2026-07-31'); });
  await p.waitForTimeout(250);
  ok('intervalo de datas: só julho, pelo RECEBIMENTO',
    JSON.stringify(await filtradas()) === JSON.stringify(['102', '55']), JSON.stringify(await filtradas()));

  // a nota 900 foi emitida em 10/08 e recebida em 11/08; a 101, emitida em
  // 10/06. Trocar a base muda o mês de quem cruza a virada.
  await p.evaluate(() => { nfSetFiltro('nfBase', 'emissao'); nfSetFiltro('nfDe', '2026-08-01'); nfSetFiltro('nfAte', '2026-08-05'); });
  await p.waitForTimeout(250);
  ok('base da data: por EMISSÃO, só a nota emitida em 01/08',
    JSON.stringify(await filtradas()) === JSON.stringify(['56']), JSON.stringify(await filtradas()));
  await zerar();

  await p.evaluate(() => nfMarcaToggle('pend'));
  await p.waitForTimeout(250);
  ok('marcador "a conferir": só Recebida e Em análise',
    JSON.stringify(await filtradas()) === JSON.stringify(['900', '56', '102']), JSON.stringify(await filtradas()));
  await p.evaluate(() => nfMarcaToggle('frete'));
  await p.waitForTimeout(250);
  ok('dois marcadores somam condições (E), não listas (OU)',
    JSON.stringify(await filtradas()) === JSON.stringify(['900', '102']), JSON.stringify(await filtradas()));
  await zerar();

  await p.evaluate(() => nfSetFiltro('nfOrdem', 'valor-desc'));
  await p.waitForTimeout(250);
  ok('ordenar por valor põe a maior nota na frente',
    (await filtradas())[0] === '900', JSON.stringify(await filtradas()));
  await p.evaluate(() => nfSetFiltro('nfOrdem', 'data-desc'));
  await p.waitForTimeout(250);

  ok('o botão de limpar aparece quando há filtro', await p.evaluate(async () => {
    nfSetFiltro('nfUF', 'SP');
    await new Promise(r => setTimeout(r, 150));
    const tem = !!document.querySelector('.nf-chip-limpar');
    nfLimparFiltros();
    return tem;
  }));

  console.log('\nA MESMA LISTA EM TABELA');
  await p.evaluate(() => nfSetFiltro('nfVista', 'tabela'));
  await p.waitForTimeout(300);
  const emTabela = await tela();
  ok('a visão em tabela desenha a tabela, não os cartões',
    /nf-tbl/.test(emTabela) && !/nf-card-b/.test(emTabela));
  ok('e o rodapé traz a soma do filtro inteiro', /somas do filtro inteiro/.test(await txt()));
  await p.evaluate(() => nfSetFiltro('nfVista', 'cartoes'));
  await p.waitForTimeout(250);

  console.log('\nA ABA DE CONSULTAS');
  await p.evaluate(() => nfTab('consultas'));
  await p.waitForTimeout(400);
  const porForn = await p.evaluate(() => {
    const c = nfConsulta(nfFiltrar(obra()), 'fornecedor', 'nenhum', 'valor');
    return { linhas: c.linhas.length, primeira: c.linhas[0].chave, total: c.total, notas: c.linhas[0].qtdNotas };
  });
  ok('agrupa por fornecedor: três fornecedores', porForn.linhas === 3, JSON.stringify(porForn));
  ok('a maior é a CONCRETEIRA ALFA, somando as duas notas dela',
    porForn.primeira === 'CONCRETEIRA ALFA' && porForn.notas === 2, JSON.stringify(porForn));
  ok('e o total bate com a soma das notas', Math.abs(porForn.total - TOTAL) < 0.01, JSON.stringify(porForn));

  const cruzada = await p.evaluate(() => {
    const c = nfConsulta(nfFiltrar(obra()), 'fornecedor', 'mes', 'valor');
    return { colunas: c.colunas, total: c.total,
             alfaJulho: (c.linhas.find(l => l.chave === 'CONCRETEIRA ALFA').cels['2026-07'] || {}).v };
  });
  ok('cruzar com o mês cria uma coluna por mês', cruzada.colunas.length === 3, JSON.stringify(cruzada.colunas));
  ok('a célula fornecedor × mês traz o valor daquela nota', Math.abs(cruzada.alfaJulho - 13500) < 0.01, JSON.stringify(cruzada));
  ok('cruzando ou não, o total é o mesmo', Math.abs(cruzada.total - TOTAL) < 0.01, JSON.stringify(cruzada));

  const porMat = await p.evaluate(() => {
    const c = nfConsulta(nfFiltrar(obra()), 'material', 'nenhum', 'qtd');
    const brita = c.linhas.find(l => /BRITA/.test(l.chave));
    return { porItem: c.porItem, linhas: c.linhas.length, brita: brita && brita.total, un: brita && brita.un };
  });
  ok('material desce a apuração para o item da nota', porMat.porItem === true, JSON.stringify(porMat));
  ok('a quantidade soma as duas compras de brita', porMat.brita === 200, JSON.stringify(porMat));
  ok('e a tabela sabe a unidade do material', porMat.un === 'M3', JSON.stringify(porMat));

  const freteNoItem = await p.evaluate(() => nfConsulta(nfFiltrar(obra()), 'material', 'nenhum', 'frete').med);
  ok('frete não é de item nenhum: a medida volta para o valor', freteNoItem === 'valor', freteNoItem);

  const contagem = await p.evaluate(() => {
    const c = nfConsulta(nfFiltrar(obra()), 'status', 'nenhum', 'notas');
    return c.linhas.map(l => l.chave + '=' + l.total).sort().join(',');
  });
  ok('a medida "nº de notas" conta nota, não linha de item',
    contagem === 'Conferida=1,Em análise=1,Integrada ao estoque=1,Recebida=2', contagem);

  ok('a consulta pronta troca linha, coluna e medida de uma vez', await p.evaluate(async () => {
    nfConsultaPronta('material', 'fornecedor', 'valor');
    await new Promise(r => setTimeout(r, 200));
    return estado.nfCdim === 'material' && estado.nfCcruz === 'fornecedor' && estado.nfCmed === 'valor';
  }));
  await p.waitForTimeout(300);
  ok('a tabela cruzada aparece na tela', /nf-tbl/.test(await tela()));

  console.log('\nA TABELA DE PRODUTOS');
  ok('lista uma linha por produto das notas do filtro',
    await p.evaluate(() => nfItensDe(nfFiltrar(obra())).length) === 5);
  await p.evaluate(() => { estado.nfIbusca = 'brita'; render(); });
  await p.waitForTimeout(300);
  // só o corpo da tabela: o texto da tela inteira traz também as opções dos
  // selects de filtro, que listam todos os materiais
  const soBrita = await p.evaluate(() => {
    const t = document.querySelector('.nf-itens tbody');
    return t ? t.textContent : '';
  });
  ok('procurar "brita" deixa só as compras de brita',
    /BRITA 1/.test(soBrita) && !/TUBO PVC DN 400/.test(soBrita), soBrita.slice(0, 160));
  await p.evaluate(() => { estado.nfIbusca = ''; render(); });
  await p.waitForTimeout(250);

  console.log('\nO FILTRO VALE PARA AS OUTRAS ABAS');
  await p.evaluate(() => { nfSetFiltro('nfForn', '11111111000191'); nfTab('painel'); });
  await p.waitForTimeout(400);
  const painelFiltrado = await p.evaluate(() => {
    const t = document.querySelector('.nf-forn tbody');
    return t ? t.textContent : '';
  });
  ok('o painel consolida só o que o filtro deixou passar',
    /CONCRETEIRA ALFA/.test(painelFiltrado) && !/TUBOS GAMA/.test(painelFiltrado), painelFiltrado.slice(0, 160));
  await zerar();
  await p.waitForTimeout(300);

  console.log('\nO PAINEL');
  const painel = await txt();
  ok('mostra a evolução mês a mês em tabela', /vs\. mês anterior/.test(painel) && /Acumulado/.test(painel));
  ok('mostra a concentração da compra por fornecedor', /concentração da compra/i.test(painel));
  ok('e a idade da conferência pendente', /Conferência pendente, por idade/.test(painel));
  ok('a tabela de quem lançou traz as duas pessoas', /Leonardo/.test(painel) && /Wallace/.test(painel));
  ok('a barra de participação tem largura de verdade (o CSS existe)',
    await p.evaluate(() => {
      const i = document.querySelector('#page .bar > i');
      return !!i && i.getBoundingClientRect().height > 0;
    }));

  console.log('\nO ESTOQUE');
  await p.evaluate(() => nfTab('estoque'));
  await p.waitForTimeout(400);
  const estoque = await txt();
  ok('soma o que foi consumido, e não só o que entrou', /consumido/.test(estoque));
  ok('mostra para onde o material foi', /Consumo por frente e rua/.test(estoque) && /Rua das Acácias/.test(estoque));
  ok('o filtro "com saldo" recorta a tabela', await p.evaluate(async () => {
    const antes = nfEstoqueFiltrado(obra()).length;
    nfSetFiltro('nfEfiltro', 'negativo');
    await new Promise(r => setTimeout(r, 150));
    const depois = nfEstoqueFiltrado(obra()).length;
    nfSetFiltro('nfEfiltro', 'todos');
    return antes === 3 && depois === 0;
  }));
  ok('procurar material filtra o estoque', await p.evaluate(async () => {
    estado.nfEbusca = 'brita';
    const n = nfEstoqueFiltrado(obra()).length;
    estado.nfEbusca = '';
    return n === 1;
  }));

  console.log('\nOS PREÇOS');
  await p.evaluate(() => nfTab('precos'));
  await p.waitForTimeout(400);
  const precos = await txt();
  ok('mostra o ranking de quem cobra mais barato', /quem cobra mais barato/i.test(precos));
  ok('e a diferença para o menor preço já pago', /menor preço já pago/.test(precos));
  ok('o concreto subiu 30% entre a 1ª e a última compra', await p.evaluate(() => {
    const m = nfPrecos(obra().id).find(x => /CONCRETO/.test(x.descricao));
    return m && Math.abs(m.variacao - 30) < 0.01;
  }));
  ok('a brita caiu 25%', await p.evaluate(() => {
    const m = nfPrecos(obra().id).find(x => /BRITA/.test(x.descricao));
    return m && Math.abs(m.variacao + 25) < 0.01;
  }));
  ok('o filtro "subiram de preço" deixa só o concreto', await p.evaluate(async () => {
    nfSetFiltro('nfPfiltro', 'subiram');
    await new Promise(r => setTimeout(r, 150));
    const l = nfPrecosFiltrados(obra().id);
    nfSetFiltro('nfPfiltro', 'todos');
    return l.length === 1 && /CONCRETO/.test(l[0].descricao);
  }));

  console.log('\nERROS DE CONSOLE');
  ok('nenhum erro em nenhuma aba', err.length === 0, err.join(' | '));

  await b.close();
  console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTudo certo.');
  process.exit(falhas ? 1 : 0);
})();
