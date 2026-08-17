// O QUE O APONTADOR FAZ TODO DIA — travado no navegador de verdade.
//
// Cinco defeitos que custavam tempo ou erro no canteiro, cada um com o seu
// bloco aqui:
//
// 21) O lançamento mais comum custava CINCO roletas (rua, frente, pacote,
//     estaca início, estaca fim) antes de chegar ao número — e a obra passa
//     semanas lançando os mesmos três pacotes.
// 22) A estaca era um <select> de 43 opções. De pé, com uma mão, rolar até a
//     E118 é mais lento que teclar 118 — e o erro de rolagem é silencioso.
// 23) "Salvar Serviços" morava no fim de ~2.100px de formulário.
// 24) O rascunho voltava preenchido dizendo só a HORA. Quem parou no meio do
//     lançamento de ontem abria hoje com a data de ontem no campo.
// 25) Dois "+ Adicionar outro serviço" idênticos, um por cartão.
//
// Como rodar:
//   python3 -m http.server 8099        (na raiz do repositório)
//   node tests/canteiro.ui.test.js
const H = require('./harness.js');

let falhas = 0;
const ok = (n, c, e) => { if (c) console.log('  ✓ ' + n); else { falhas++; console.log('  ✗ ' + n + (e !== undefined ? '  → ' + e : '')); } };

const iso = d => d.toISOString().slice(0, 10);

// RDO recente: o bloco dos "mais lançados" olha os últimos 30 dias, então os
// dados têm de ser de agora — não de uma data fixa que envelhece.
function rdoRecente() {
  const head = ['id', 'Data', 'Pacote_ID', 'Quantidade', 'Local_Estaca', 'Equipe', 'Apontador',
    'Turno', 'Observações', 'foto_link', 'usuario', 'timestamp', 'obra'];
  const linhas = [head];
  const hoje = Date.now();
  // P02 dez vezes, P05 seis, P09 três, P20 uma — a ordem esperada dos chips.
  const plano = [['P02', 10], ['P05', 6], ['P09', 3], ['P20', 1]];
  let i = 0;
  plano.forEach(([pid, n]) => {
    for (let k = 0; k < n; k++) {
      const d = iso(new Date(hoje - (k + 1) * 86400000));
      linhas.push(['r' + (i++), d, pid, '12,5', 'E10' + k, 'Equipe A', 'Wallace',
        'Diurno', '', '', 'Wallace', d + 'T12:00:00Z', 'teotonio']);
    }
  });
  return H.csv(linhas);
}

(async () => {
  console.log('OS PACOTES DE TODO DIA, A UM TOQUE (21)');
  const s = await H.abrir({
    mobile: true,
    logar: { usuario: 'Leonardo', perfil: 'admin' },
    rdo: rdoRecente(),
  });
  await s.ir('rdo');
  await s.p.waitForTimeout(600);

  const chips = await s.p.evaluate(() =>
    [...document.querySelectorAll('.svc-frequentes .chip')].map(b => b.getAttribute('onclick')));
  ok('a fileira traz três pacotes', chips.length === 3, chips.length + ': ' + chips.join(' | '));
  ok('e são os MAIS lançados nos últimos 30 dias, em ordem',
     /'P02'/.test(chips[0] || '') && /'P05'/.test(chips[1] || '') && /'P09'/.test(chips[2] || ''),
     chips.join(' | '));

  const antes = await s.p.evaluate(() => ({
    frente: STATE.draft.servicos[0].frente, pacote: STATE.draft.servicos[0].pacoteId }));
  ok('o serviço começa vazio', !antes.frente && !antes.pacote, JSON.stringify(antes));

  await s.p.evaluate(() => document.querySelector('.svc-frequentes .chip').click());
  await s.p.waitForTimeout(250);
  const depois = await s.p.evaluate(() => ({
    frente: STATE.draft.servicos[0].frente,
    pacote: STATE.draft.servicos[0].pacoteId,
    selectHabilitado: !document.querySelector('[data-field="pacoteId"]').disabled,
  }));
  ok('um toque preenche o pacote', depois.pacote === 'P02', JSON.stringify(depois));
  ok('e a frente junto — sem passar pela roleta', !!depois.frente, JSON.stringify(depois));
  ok('a lista de pacotes destrava (a frente está escolhida)', depois.selectHabilitado);

  console.log('\nA ESTACA SE DIGITA, NÃO SE ROLA (22)');
  const campo = await s.p.evaluate(() => {
    const e = document.querySelector('[data-field="estacaIni"]');
    return { tag: e.tagName, tipo: e.type, teclado: e.getAttribute('inputmode'), lista: e.getAttribute('list') };
  });
  ok('estaca início é campo de texto, não <select>', campo.tag === 'INPUT' && campo.tipo === 'text',
     JSON.stringify(campo));
  ok('com teclado numérico no celular', campo.teclado === 'numeric', campo.teclado);
  ok('e a lista do eixo continua à mão (datalist)', !!campo.lista, campo.lista);
  const nDatalist = await s.p.evaluate(() =>
    document.querySelectorAll('datalist#' + document.querySelector('[data-field="estacaIni"]').getAttribute('list') + ' option').length);
  ok('o datalist traz as estacas do eixo', nDatalist > 1, String(nDatalist));

  const digitar = async (campo, valor) => {
    await s.p.evaluate(({ c, v }) => {
      const el = document.querySelector(`[data-field="${c}"]`);
      el.value = v; el.dispatchEvent(new Event('input', { bubbles: true }));
    }, { c: campo, v: valor });
    await s.p.waitForTimeout(120);
  };

  await digitar('estacaIni', '118');
  ok('"118" é guardado no formato de sempre ("E118")',
     await s.p.evaluate(() => STATE.draft.servicos[0].estacaIni) === 'E118');

  const foco = await s.p.evaluate(() =>
    document.activeElement === document.querySelector('[data-field="estacaIni"]') ||
    document.activeElement === document.body);
  ok('digitar não redesenha a linha por baixo do dedo', foco);

  // fora da faixa do eixo: avisa no campo E barra o envio
  const faixa = await s.p.evaluate(() => {
    const fx = eixoPorId(eixoDoServico(STATE.draft.servicos[0]));
    return fx ? { ini: fx.ini, fim: fx.fim } : null;
  });
  if (faixa) {
    await digitar('estacaIni', String(faixa.fim + 500));
    const aviso = await s.p.evaluate(() => {
      const el = document.querySelector('[data-field="estacaIni"]');
      const box = el.parentElement.querySelector('.field-error');
      return { invalido: el.classList.contains('invalid'), msg: box ? box.textContent : '' };
    });
    ok('estaca fora do eixo pinta o campo de erro', aviso.invalido, JSON.stringify(aviso));
    ok('e diz qual é a faixa', /E\d+ à E\d+/.test(aviso.msg), aviso.msg);

    const erros = await s.p.evaluate(() => {
      const d = STATE.draft;
      d.servicos[0].estacaFim = 'E' + (eixoPorId(eixoDoServico(d.servicos[0])).fim);
      d.servicos[0].quantidade = '10';
      d.apontador = 'Wallace';
      return validarRDO(d);
    });
    ok('e o envio é barrado antes de gravar fora do estaqueamento',
       erros.some(e => /fora de/.test(e)), JSON.stringify(erros));
    await digitar('estacaIni', String(faixa.ini));
  }

  console.log('\nSALVAR NÃO MORA NO FIM DE 2.100px (23)');
  const enviar = await s.p.evaluate(() => {
    const env = document.querySelector('.rdo-enviar');
    if (!env) return null;
    const c = env.getBoundingClientRect();
    return {
      pos: getComputedStyle(env).position,
      dentroDaTela: c.top >= 0 && c.bottom <= window.innerHeight + 1,
      temSalvar: !!env.querySelector('#btnSalvarRDO'),
      temLimpar: /Limpar/.test(env.textContent),
      alturaPagina: document.querySelector('.rdo-form').getBoundingClientRect().height,
    };
  });
  ok('a faixa de ações existe', !!enviar, 'não achei .rdo-enviar');
  ok('e é sticky no celular', enviar && enviar.pos === 'sticky', enviar && enviar.pos);
  ok('com Salvar e Limpar dentro', enviar && enviar.temSalvar && enviar.temLimpar, JSON.stringify(enviar));
  ok('visível sem rolar, mesmo num formulário longo',
     enviar && enviar.dentroDaTela, JSON.stringify(enviar));
  // 844 é a altura do celular do harness: sem um formulário mais alto que a
  // tela, "está visível sem rolar" não prova nada.
  ok('e o formulário é mesmo longo (senão o teste não vale nada)',
     enviar && enviar.alturaPagina > 844, String(enviar && enviar.alturaPagina));

  console.log('\nBOTÕES DE ADICIONAR DIZEM ONDE ACRESCENTAM (25)');
  const adds = await s.p.evaluate(() =>
    [...document.querySelectorAll('.btn-add-servico')].map(b => b.textContent.trim()));
  ok('os dois rótulos são diferentes', adds.length === 2 && adds[0] !== adds[1], adds.join(' | '));
  ok('o do cartão de pacotes fala de pacote', /pacote/i.test(adds[0] || ''), adds[0]);
  ok('o de Outros Serviços fala de serviço avulso', /avulso/i.test(adds[1] || ''), adds[1]);

  ok('nenhum erro de JS até aqui', s.erros.length === 0, s.erros.slice(0, 3).join(' | '));
  await s.fechar();

  console.log('\nO RASCUNHO DIZ DE QUE DIA É (24)');
  // rascunho de ONTEM já no aparelho, antes de a tela abrir
  const ontem = iso(new Date(Date.now() - 86400000));
  const s2 = await H.abrir({ mobile: true, logar: { usuario: 'Leonardo', perfil: 'admin' } });
  await s2.p.evaluate((data) => {
    localStorage.setItem(CONFIG.ls.rdoDraft, JSON.stringify({
      data, turno: 'Diurno', apontador: 'Wallace', observacaoGeral: '',
      servicos: [{ frente: 'Drenagem', pacoteId: 'P01', sentido: eixoPadrao(),
                   estacaIni: 'E100', estacaFim: 'E102', lado: '', quantidade: '15',
                   area: '', espCm: '', equipe: '', observacao: '' }],
      outrosServicos: [], _savedAt: Date.now() - 86400000,
    }));
    STATE.draft = null;
  }, ontem);
  await s2.ir('rdo');
  await s2.p.waitForTimeout(500);

  const banner = await s2.p.evaluate(() => {
    const b = document.querySelector('.rdo-rascunho');
    return b ? { antigo: b.classList.contains('antigo'), txt: b.innerText,
                 botoes: [...b.querySelectorAll('button')].map(x => x.textContent.trim()) } : null;
  });
  ok('o banner aparece', !!banner);
  ok('e é o banner de rascunho ANTIGO', banner && banner.antigo, JSON.stringify(banner));
  ok('com a DATA escrita, não só a hora',
     banner && banner.txt.includes(ontem.split('-').reverse().slice(0, 2).join('/')),
     banner && banner.txt);
  ok('diz que não é de hoje', banner && /não de hoje/i.test(banner.txt), banner && banner.txt);
  ok('oferece continuar', banner && banner.botoes.some(b => /Continuar/i.test(b)),
     banner && banner.botoes.join(' | '));
  ok('e oferece começar novo de hoje',
     banner && banner.botoes.some(b => /novo de hoje/i.test(b)), banner && banner.botoes.join(' | '));

  // rascunho de HOJE restaura calado, como sempre restaurou
  await s2.p.evaluate(() => {
    const d = JSON.parse(localStorage.getItem(CONFIG.ls.rdoDraft));
    d.data = getLocalISODate(new Date()); delete d._continuar;
    localStorage.setItem(CONFIG.ls.rdoDraft, JSON.stringify(d));
    STATE.draft = null;
    render();
  });
  await s2.p.waitForTimeout(400);
  const hoje = await s2.p.evaluate(() => {
    const b = document.querySelector('.rdo-rascunho');
    return b ? { antigo: b.classList.contains('antigo'), txt: b.innerText } : null;
  });
  ok('rascunho de hoje continua restaurando sem perguntar',
     hoje && !hoje.antigo && /de hoje/.test(hoje.txt), JSON.stringify(hoje));

  ok('nenhum erro de JS', s2.erros.length === 0, s2.erros.slice(0, 3).join(' | '));
  await s2.fechar();

  console.log(falhas === 0 ? '\nTUDO CERTO' : `\n${falhas} FALHA(S)`);
  process.exit(falhas === 0 ? 0 : 1);
})();
