// O QUE A REVISÃO DE SETEMBRO/2026 ACHOU NAS TELAS — e que não pode voltar.
//
//   • texto digitado no campo (ocorrências, apontador, nome de serviço) ia
//     CRU para o innerHTML: um <img onerror> rodava script na sessão de quem
//     abrisse o RDO — e a sessão do admin apaga lançamento e arquiva firma;
//   • valor dentro de onclick="fn('…')" com apóstrofo ("caixa d'água")
//     quebrava o clique;
//   • a edição do Histórico achava o lançamento pela POSIÇÃO na lista: um
//     refresh no meio e o Salvar gravava por cima do lançamento vizinho;
//   • o Analista IA falava português de Portugal, punha a resposta da IA
//     crua na tela e mandava a chave na URL;
//   • a tabela de feriados acabava em 2028.
//
// Como rodar:  node tests/telas-seguras.ui.test.js
const H = require('./harness.js');

let falhas = 0;
const ok = (nome, cond, extra) => {
  if (cond) console.log('  ✓ ' + nome);
  else { falhas++; console.log('  ✗ ' + nome + (extra !== undefined ? '  → ' + extra : '')); }
};

const XSS = '<img src=x onerror="window.__xss=(window.__xss||0)+1">';
const hoje = (() => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); })();

const diario = H.csv([
  ['id', 'Data', 'Clima_Manha', 'Clima_Tarde', 'Clima_Noite', 'Apontador_Diurno', 'Encarregado',
   'Ocorrencias', 'Visitas', 'Observacoes_Gerais', 'Efetivo_JSON', 'obra'],
  ['D0001', hoje, 'Bom', 'Bom', '', 'Wallace ' + XSS, 'Zé ' + XSS, 'Chuva ' + XSS, XSS, XSS,
   JSON.stringify({ padrao_diurno: {}, customDireto_diurno: [{ nome: 'Função ' + XSS, qtd: 2 }] }), 'teotonio'],
]);

(async () => {
  let promptIA = '', urlIA = '', chaveNoCabecalho = '';
  const s = await H.abrir({ logar: { usuario: 'Leonardo', perfil: 'admin' }, diario, rdo: H.gerarRDO({ linhas: 60 }) });
  await s.p.route('**generativelanguage.googleapis.com/**', r => {
    urlIA = r.request().url();
    chaveNoCabecalho = r.request().headers()['x-goog-api-key'] || '';
    try { promptIA = JSON.parse(r.request().postData() || '{}').contents[0].parts[0].text; } catch (e) { }
    const resposta = '<h3>Resumo</h3><p>Ritmo bom.</p><img src=x onerror="window.__xss=99"><script>window.__xss=98</script>' +
                     '<p onclick="window.__xss=97">clique</p><a href="javascript:alert(1)">link</a>';
    r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' },
                body: JSON.stringify({ candidates: [{ content: { parts: [{ text: resposta }] } }] }) });
  });

  console.log('TEXTO DO CAMPO NÃO VIRA CÓDIGO');
  await s.p.evaluate(() => visualizarRDO('D0001'));
  await s.p.waitForTimeout(500);
  const ver = await s.p.evaluate(() => ({
    xss: window.__xss || 0, imgs: document.querySelectorAll('#modalRDO img').length,
    texto: (document.getElementById('modalRDO') || {}).textContent || '' }));
  ok('o RDO com <img onerror> nas ocorrências abre sem rodar nada', ver.xss === 0 && ver.imgs === 0, JSON.stringify(ver).slice(0, 160));
  ok('e o texto aparece como texto', /Chuva <img src=x/.test(ver.texto));
  await s.p.evaluate(() => fecharModalRDO());
  await s.p.evaluate(() => { HISTORICO_TAB = 'diarios'; navigate('historico'); });
  await s.p.waitForTimeout(600);
  ok('a lista de RDOs do Histórico também não roda', await s.p.evaluate(() => (window.__xss || 0) === 0));

  console.log('\nAPÓSTROFO NO CLIQUE');
  const jsArg = await s.p.evaluate(() => {
    const b = document.createElement('button');
    window.__arg = null; window.__pegar = v => { window.__arg = v; };
    b.setAttribute('onclick', '');
    const tmp = document.createElement('div');
    tmp.innerHTML = `<button onclick="__pegar(${jsArg("Limpeza caixa d'água\");window.__xss=5;//")})">x</button>`;
    document.body.appendChild(tmp); tmp.firstChild.click(); tmp.remove();
    return { arg: window.__arg, xss: window.__xss || 0 };
  });
  ok('"caixa d\'água" chega inteira ao clique', jsArg.arg === "Limpeza caixa d'água\");window.__xss=5;//", JSON.stringify(jsArg));
  ok('e aspas no meio não fecham a string', jsArg.xss === 0);

  console.log('\nHISTÓRICO EDITA O LANÇAMENTO CERTO');
  const hist = await s.p.evaluate(async () => {
    HISTORICO_TAB = 'servicos'; render();
    const alvoIdx = 0;
    histEditarServico(alvoIdx);
    const idAberto = document.getElementById('hist-edit-row-0').dataset.id;
    // o refresh de fundo troca o STATE com um lançamento NOVO na frente
    const novo = Object.assign({}, STATE.rdoavanco[0], { id: 'NOVO-DO-REFRESH', ID: 'NOVO-DO-REFRESH' });
    STATE.rdoavanco = STATE.rdoavanco.concat([novo]);   // a lista invertida põe ele na posição 0
    const q = document.getElementById('hedit-qtd-0'); q.value = '77';
    let enviado = null;
    const orig = window.jsonp;
    window.jsonp = async (u, p) => { if (p.action === 'updateRDO') enviado = JSON.parse(p.payload); return { ok: true }; };
    await histSalvarEdicao(0);
    window.jsonp = orig;
    return { idAberto, enviado };
  });
  ok('o Salvar vai para o lançamento que estava aberto, não para o vizinho',
     hist.enviado && String(hist.enviado.id) === String(hist.idAberto) && hist.enviado.id !== 'NOVO-DO-REFRESH',
     JSON.stringify(hist));

  console.log('\nANALISTA IA');
  await s.p.evaluate(() => { localStorage.setItem('teotonio_gemini_key', 'AIzaChaveDeTesteQueNaoVale123456'); navigate('analista'); });
  await s.p.waitForTimeout(500);
  const telaIA = await s.p.evaluate(() => document.getElementById('page').textContent);
  ok('a tela fala pt-BR (sem "detete", "A analisar", "registos")', !/detete|A analisar|registos/.test(telaIA));
  await s.p.evaluate(() => runAIAnalysis());
  await s.p.waitForTimeout(1500);
  const ia = await s.p.evaluate(() => {
    const o = document.getElementById('ai-output');
    return { xss: window.__xss || 0, html: o.innerHTML, img: o.querySelectorAll('img,script,a').length,
             attrs: [...o.querySelectorAll('*')].some(e => e.attributes.length) };
  });
  ok('a resposta da IA aparece', /Ritmo bom/.test(ia.html), ia.html.slice(0, 120));
  ok('sem <img>, <script> nem link javascript: da resposta', ia.img === 0 && ia.xss === 0, JSON.stringify(ia).slice(0, 200));
  ok('e sem atributo nenhum (onclick incluído)', !ia.attrs);
  ok('o pedido à IA é em pt-BR e nomeia a obra', /português do Brasil/.test(promptIA) && /Teotônio/.test(promptIA),
     promptIA.slice(0, 120));
  ok('e leva as paralisações do período', /PARALISAÇÕES LANÇADAS/.test(promptIA));
  ok('a chave vai no cabeçalho, não na URL', !/key=/.test(urlIA) && chaveNoCabecalho.indexOf('AIza') === 0, urlIA);
  const md = await s.p.evaluate(() => respostaIAParaHTML('## Título\n- **um** item\n- outro'));
  ok('resposta em Markdown vira marcação', /<h4>Título<\/h4>/.test(md) && /<li><strong>um<\/strong> item<\/li>/.test(md), md);

  console.log('\nFERIADOS NÃO ACABAM');
  const fer = await s.p.evaluate(() => ({
    sextaSanta2031: ehFeriadoNacional(new Date(2031, 3, 11)),
    carnaval2030: ehFeriadoNacional(new Date(2030, 2, 5)),
    corpus2029: ehFeriadoNacional(new Date(2029, 4, 31)),
    comum2030: ehFeriadoNacional(new Date(2030, 2, 6)),
  }));
  ok('Sexta-feira Santa de 2031 (11/04)', fer.sextaSanta2031);
  ok('Carnaval de 2030 (05/03)', fer.carnaval2030);
  ok('Corpus Christi de 2029 (31/05)', fer.corpus2029);
  ok('e quarta de cinzas não é feriado', !fer.comum2030);

  ok('nenhum erro de página', s.erros.length === 0, s.erros.slice(0, 3).join(' ; '));
  await s.fechar();
  console.log(falhas ? `\n${falhas} falha(s).` : '\nTudo certo.');
  process.exit(falhas ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
