// A PRIMEIRA CARGA FALHOU — a tela tem de DIZER, não ficar em branco.
//
// `render()` saía sem pintar nada enquanto `STATE.loaded` fosse falso. Quem
// abrisse o app pela primeira vez sem sinal (ou com a planilha publicada fora
// do ar) ficava com o cabeçalho e o corpo vazio — exatamente o print
// `painel_executivo_state_1778461495796.png` que está na raiz do repositório.
// O app inteiro é construído em cima de "funciona sem sinal", e este era o
// momento em que ele parecia quebrado.
//
// Como rodar:
//   python3 -m http.server 8099        (na raiz do repositório)
//   node tests/carga-falha.ui.test.js
const H = require('./harness.js');

let falhas = 0;
const ok = (n, c, e) => { if (c) console.log('  ✓ ' + n); else { falhas++; console.log('  ✗ ' + n + (e !== undefined ? '  → ' + e : '')); } };

(async () => {
  console.log('CSV FORA DO AR NA PRIMEIRA CARGA');
  const s = await H.abrir({ falharCSV: true });

  ok('a carga realmente não completou', s.carregou === false, 'carregou=' + s.carregou);

  const pagina = await s.p.evaluate(() => {
    const pg = document.getElementById('page');
    return {
      vazia: !pg || pg.innerHTML.trim() === '',
      texto: pg ? pg.innerText : '',
      temBotao: !!(pg && [...pg.querySelectorAll('button')].some(b => /Tentar novamente/i.test(b.textContent))),
      botaoPrimario: !!(pg && [...pg.querySelectorAll('button.btn.btn-primary')]
        .some(b => /Tentar novamente/i.test(b.textContent))),
      loaded: STATE.loaded,
      falhou: STATE.cargaFalhou === true,
    };
  });

  ok('#page NÃO fica vazia', !pagina.vazia);
  ok('diz que não conseguiu carregar os dados da obra',
     /não foi possível carregar/i.test(pagina.texto), pagina.texto.slice(0, 120));
  ok('explica o que aconteceu (planilha / internet)',
     /planilha|internet/i.test(pagina.texto), pagina.texto.slice(0, 200));
  ok('diz que lançar serviço e RDO continua funcionando',
     /fila do aparelho/i.test(pagina.texto), pagina.texto.slice(0, 300));
  ok('tem o botão "Tentar novamente"', pagina.temBotao);
  ok('e ele é o botão primário do bloco', pagina.botaoPrimario);
  ok('o STATE registra a falha para o render saber o que pintar', pagina.falhou);

  console.log('\nO AVISO NÃO EXPIRA ENQUANTO NÃO HÁ DADO NENHUM');
  const toastFixo = await s.p.evaluate(() => {
    const t = document.querySelector('.toast, #toast, [class*="toast"]');
    return { existe: !!t, texto: t ? t.innerText : '' };
  });
  ok('o toast de erro continua na tela', toastFixo.existe, JSON.stringify(toastFixo));
  ok('e repete que o lançamento entra na fila',
     /fila do aparelho/i.test(toastFixo.texto), toastFixo.texto.slice(0, 160));

  console.log('\nO BOTÃO DE ATUALIZAR DO TOPO VIRA O AVISO (a gaveta está fechada no celular)');
  const topo = await s.p.evaluate(() => {
    const b = document.getElementById('btnAtualizarTopo');
    return { existe: !!b, erro: !!(b && b.classList.contains('erro')), title: b ? b.title : '' };
  });
  ok('o botão do topo existe', topo.existe);
  ok('e está marcado como erro', topo.erro);
  ok('com o motivo no title', /falha/i.test(topo.title), topo.title);

  console.log('\nUM SÓ CAMINHO PARA ATUALIZAR');
  const quantos = await s.p.evaluate(() =>
    [...document.querySelectorAll('button')].filter(b => /^\s*ATUALIZAR\s*$/i.test(b.innerText)).length);
  ok('o rodapé do menu não repete o botão de atualizar', quantos === 0, 'achei ' + quantos);

  console.log('\nTENTAR DE NOVO, COM A REDE DE VOLTA, CARREGA');
  // troca a rota: agora os CSVs respondem
  await s.p.unroute('**://docs.google.com/**');
  await s.p.route('**://docs.google.com/**', route => route.fulfill({
    status: 200, contentType: 'text/csv',
    body: new URL(route.request().url()).searchParams.get('gid') === '386002450'
      ? H.gerarPacotes(4) : '',
  }));
  await s.p.evaluate(() => carregarTudo());
  await s.p.waitForFunction(() => STATE.loaded === true, null, { timeout: 20000 }).catch(() => {});
  const depois = await s.p.evaluate(() => ({
    loaded: STATE.loaded,
    falhou: STATE.cargaFalhou === true,
    aindaMostraFalha: /não foi possível carregar/i.test(document.getElementById('page').innerText),
  }));
  ok('a carga passa a valer', depois.loaded === true, JSON.stringify(depois));
  ok('a marca de falha é apagada', depois.falhou === false);
  ok('e a tela deixa de mostrar o erro', depois.aindaMostraFalha === false);

  ok('nenhum erro de JS', s.erros.length === 0, s.erros.slice(0, 3).join(' | '));
  await s.fechar();

  console.log(falhas === 0 ? '\nTUDO CERTO' : `\n${falhas} FALHA(S)`);
  process.exit(falhas === 0 ? 0 : 1);
})();
