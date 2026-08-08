// AS CORREÇÕES DESTA LEVA, TRAVADAS — no app de verdade, no navegador.
//
// Cada bloco aqui corresponde a um defeito que chegou a existir em produção.
// Se algum voltar, este arquivo falha antes do merge.
//
// Como rodar:
//   python3 -m http.server 8099        (na raiz do repositório)
//   node tests/correcoes.ui.test.js
const { chromium } = require('playwright');

let falhas = 0;
const ok = (n, c, e) => { if (c) console.log('  ✓ ' + n); else { falhas++; console.log('  ✗ ' + n + (e !== undefined ? '  → ' + e : '')); } };

const GID = { cronograma: '565093066', pacotes: '386002450', coeficientes: '1962881430',
              rdoavanco: '1906961773', rdodiario: '1234324544' };

const PACOTES = [
  'ID,Frente,Pacote,Unidade Física,Qtd Estimada,Produtividade,Status,Observação',
  'P01,Drenagem,Concreto estrutural,m³,1000,20,Ativo,',
  'P02,Pav. Flexível,BGS,m²,5000,40,Ativo,',
].join('\r\n');

// A descrição do item traz marcação: é digitada à mão na aba Coeficientes.
const COEF = [
  'Pacote ID,Pacote Nome,Item Contratual,Descrição Item,Unid Item,Coef,Unid Coef,Tipo',
  'P01,Concreto estrutural,04-11-00,"Concreto <b>fck</b> 25 & cia",M3,1,m³/m³,Manual',
  'P02,BGS,05-48-00,Brita graduada,M3,"0,15",m³/m²,Manual',
].join('\r\n');

const RDO_VAZIO = 'id,Data,Pacote_ID,Quantidade,Local_Estaca,Turno,Apontador,obra';
const RDO_COM_DADO = [RDO_VAZIO,
  'r1,2026-07-10,P01,"22,26",E100,Diurno,Wallace,teotonio',
  'r2,2026-07-10,P02,"1.000,50",E101,Diurno,Wallace,teotonio'].join('\r\n');

// Cronograma cujo plano começa ANTES da janela do contrato — é o caso que
// fazia a curva prevista fechar abaixo de 100%.
const CRONO = [
  'Nivel,EDT,Nome da tarefa,Início,Término,Pacote_ID',
  '0,1,OBRA COMPLETA,09/05/2024,08/03/2026,',
  '1,1.1,Concreto,01/01/2024,01/03/2024,P01',
  '1,1.2,BGS,01/06/2025,01/06/2026,P02',
].join('\r\n');

async function abrir(opts = {}) {
  const b = await chromium.launch({ executablePath: process.env.CHROME_PATH ||
    '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  const ctx = await b.newContext({ locale: 'pt-BR', viewport: { width: 1380, height: 900 } });
  const p = await ctx.newPage();
  const erros = [];
  p.on('pageerror', e => erros.push('PAGEERROR: ' + e.message));
  p.on('console', m => { const t = m.text();
    if (m.type() === 'error' && !/Failed to load resource|net::|favicon/.test(t)) erros.push('CONSOLE: ' + t); });

  const dados = Object.assign({
    [GID.pacotes]: PACOTES, [GID.coeficientes]: COEF, [GID.rdoavanco]: RDO_VAZIO,
    [GID.rdodiario]: '', [GID.cronograma]: CRONO,
  }, opts.csv || {});

  await p.route('**://docs.google.com/**', r => {
    const gid = new URL(r.request().url()).searchParams.get('gid');
    r.fulfill({ status: 200, contentType: 'text/csv', body: dados[gid] === undefined ? '' : dados[gid] });
  });
  const chamadas = [];
  await p.route('**://script.google.com/**', async r => {
    const u = new URL(r.request().url());
    const acao = u.searchParams.get('action');
    const cb = u.searchParams.get('callback');
    chamadas.push(acao);
    const corpo = opts.gas ? opts.gas(acao, u.searchParams)
      : acao === 'login' ? { ok: true, usuario: 'Leonardo', perfil: 'admin', token: 't', obras: '*' }
      : { ok: true };
    r.fulfill({ status: 200, contentType: 'application/javascript', body: `${cb}(${JSON.stringify(corpo)})` });
  });

  await p.goto('http://localhost:8099/index.html', { waitUntil: 'load' });
  await p.evaluate(() => { localStorage.setItem('teotonio_user', 'Leonardo');
    localStorage.setItem('teotonio_perfil_v1', 'admin'); localStorage.setItem('teotonio_token_v1', 't'); });
  await p.reload({ waitUntil: 'load' });
  await p.waitForFunction(() => typeof STATE !== 'undefined' && STATE.loaded === true, null, { timeout: 30000 });
  return { b, p, erros, chamadas };
}

(async () => {
  // ================================================================
  console.log('\nQUANTIDADE COM DECIMAL — o campo do apontador');
  // O <input type=number> descartava a vírgula em silêncio ("22,26" → "2226")
  // e o num() comia o ponto (separador de milhar do CSV). Toda quantidade
  // quebrada ia 10× ou 100× maior para a medição.
  {
    const { b, p, erros } = await abrir();
    await p.evaluate(() => navigate('rdo'));
    await p.waitForTimeout(600);

    const campo = await p.$('input[data-field="quantidade"]');
    ok('o campo Quantidade existe', !!campo);

    const tipo = await p.evaluate(() =>
      document.querySelector('input[data-field="quantidade"]').getAttribute('type'));
    ok('o campo NÃO é type=number (o navegador apagava a vírgula)', tipo !== 'number', 'type=' + tipo);

    const im = await p.evaluate(() =>
      document.querySelector('input[data-field="quantidade"]').getAttribute('inputmode'));
    ok('mas ainda abre o teclado numérico no celular', im === 'decimal', 'inputmode=' + im);

    for (const [digitado, esperado] of [['22,26', 22.26], ['22.26', 22.26], ['0,5', 0.5],
                                        ['0.5', 0.5], ['7', 7], ['1.234,56', 1234.56]]) {
      await campo.fill('');
      await campo.type(digitado, { delay: 15 });
      const chegou = await p.evaluate(() =>
        numCampo((STATE.draft.servicos[0] || {}).quantidade));
      ok(`digitar "${digitado}" vira ${esperado}`, Math.abs(chegou - esperado) < 1e-9, 'veio ' + chegou);
    }

    ok('num() do CSV segue tratando ponto como MILHAR',
      await p.evaluate(() => num('1.234,56') === 1234.56 && num('22.26') === 2226));
    ok('num() devolve número quando recebe número',
      await p.evaluate(() => num(22.26) === 22.26));
    ok('sem erro de console', erros.length === 0, JSON.stringify(erros.slice(0, 3)));
    await b.close();
  }

  // ================================================================
  console.log('\nCURVA PREVISTA — a meta tem de fechar em 100%');
  // Pacote planejado fora da janela era descartado do numerador, mas o peso
  // dele continuava no denominador: a curva nunca chegava a 1,0 e o painel
  // comparava o avanço real contra uma meta menor que a obra.
  {
    const { b, p } = await abrir();
    const r = await p.evaluate(() => {
      const pacotes = STATE.pacotes;
      const totalDias = pacotes.reduce((s, p) =>
        s + diasEquivalentes(num(getCSVField(p, 'Qtd Estimada')), getCSVField(p, 'ID')), 0);
      return { total: calcCurvaPrevista(pacotes, totalDias).total, totalDias, n: pacotes.length };
    });
    ok('há pacotes e peso para somar', r.n > 0 && r.totalDias > 0, JSON.stringify(r));
    ok('calcCurvaPrevista().total fecha em 1,0', Math.abs(r.total - 1) < 1e-6, 'total=' + r.total);
    await b.close();
  }

  // ================================================================
  console.log('\nJANELA DO CONTRATO — é da obra, não do arquivo');
  {
    const { b, p } = await abrir();
    const r = await p.evaluate(() => {
      const j = janelaDoContrato();
      return { ini: j.inicio.toISOString().slice(0, 10), fim: j.fim.toISOString().slice(0, 10),
               obra: OBRA.id, inicioCad: OBRA.rdo && OBRA.rdo.inicio, prazo: OBRA.rdo && OBRA.rdo.prazoDias };
    });
    ok('a janela sai do cadastro da obra (09/05/2024 + 669 dias)',
      r.ini === '2024-05-09', JSON.stringify(r));
    ok('e não da constante velha de 01/07/2025', r.ini !== '2025-07-01', r.ini);

    // trocar de obra tem de repor a janela
    const depois = await p.evaluate(() => {
      const outra = Object.keys(OBRAS_CFG).find(k => k !== 'teotonio');
      if (!outra) return null;
      trocarObra(outra);
      return { obra: OBRA.id, ini: PROJETO_INICIO.toISOString().slice(0, 10) };
    });
    if (depois) {
      ok('trocar de obra repõe PROJETO_INICIO', depois.ini !== '2024-05-09',
        JSON.stringify(depois));
    } else {
      console.log('  – só há uma obra cadastrada; troca não testada');
    }
    await b.close();
  }

  // ================================================================
  console.log('\nPRÉVIA DE MEDIÇÃO — a planilha não injeta marcação na tela');
  {
    const { b, p } = await abrir({ csv: { [GID.rdoavanco]: RDO_COM_DADO } });
    await p.evaluate(() => navigate('medicao'));
    await p.waitForTimeout(400);
    const r = await p.evaluate(() => {
      const html = document.getElementById('page').innerHTML;
      const txt = document.getElementById('page').textContent;
      return { temTagCrua: html.indexOf('<b>fck</b>') !== -1,
               mostraLiteral: txt.indexOf('<b>fck</b>') !== -1,
               temAmpersand: txt.indexOf('& cia') !== -1 };
    });
    ok('a descrição da planilha NÃO vira marcação', !r.temTagCrua);
    ok('e aparece literal para quem lê', r.mostraLiteral);
    ok('o "&" da descrição sobrevive', r.temAmpersand);
    await b.close();
  }

  // ================================================================
  console.log('\nFERIADOS — a tabela não pode acabar antes da obra');
  {
    const { b, p } = await abrir();
    const r = await p.evaluate(() => ({
      ate: FERIADOS_ATE,
      natal2028: ehFeriadoNacional(new Date(2028, 11, 25)),
      trab2027: ehFeriadoNacional(new Date(2027, 4, 1)),
      diaComum: ehFeriadoNacional(new Date(2027, 4, 4)),
    }));
    ok('a tabela cobre até 2028', r.ate >= 2028, 'FERIADOS_ATE=' + r.ate);
    ok('25/12/2028 é feriado', r.natal2028);
    ok('01/05/2027 é feriado', r.trab2027);
    ok('04/05/2027 (terça comum) não é', !r.diaComum);
    await b.close();
  }

  // ================================================================
  console.log('\nFILA OFFLINE — erro passageiro NÃO apaga o lançamento');
  // O flush tratava tudo que não fosse erro de rede como veredicto final e
  // removia o item. Cota do dia estourada, 500 do /exec e "servidor ocupado"
  // caíam nesse balde — e o lançamento do apontador ia para o lixo.
  {
    const { b, p } = await abrir({
      gas: (acao) => acao === 'login' ? { ok: true, usuario: 'Leonardo', perfil: 'admin', token: 't', obras: '*' }
        : { ok: false, error: 'Serviço invocado muitas vezes num dia' } });

    const r = await p.evaluate(async () => {
      outboxGravar([]);
      await outboxAdicionar({ kind: 'rdo', params: { action: 'addBatchRDO', batch: '[]' }, descricao: 'teste' });
      const antes = outboxLer().length;
      await outboxFlush();
      const depois = outboxLer();
      return { antes, depois: depois.length, tentativas: depois[0] && depois[0].tentativas };
    });
    ok('o item entrou na fila', r.antes === 1);
    ok('erro de COTA não apaga o lançamento', r.depois === 1, 'sobraram ' + r.depois);
    ok('e o contador de tentativas sobe', r.tentativas >= 1, 'tentativas=' + r.tentativas);

    await b.close();
  }

  // ================================================================
  console.log('\nFILA OFFLINE — dado inválido sai da fila, mas com aviso');
  {
    const { b, p } = await abrir({
      gas: (acao) => acao === 'login' ? { ok: true, usuario: 'Leonardo', perfil: 'admin', token: 't', obras: '*' }
        : { ok: false, error: 'batch inválido' } });
    const r = await p.evaluate(async () => {
      outboxGravar([]);
      await outboxAdicionar({ kind: 'rdo', params: { action: 'addBatchRDO', batch: 'xx' }, descricao: 'teste' });
      await outboxFlush();
      return { restam: outboxLer().length,
               avisou: !!document.querySelector('.toast, [class*="toast"]') };
    });
    ok('"batch inválido" (que reenviar não conserta) sai da fila', r.restam === 0);
    ok('e o apontador é avisado na tela', r.avisou);
    await b.close();
  }

  // ================================================================
  console.log('\nCARGA CONCORRENTE — a resposta velha não vence a nova');
  {
    const { b, p } = await abrir();
    const r = await p.evaluate(async () => {
      const a = carregarTudo({ fundo: true });
      const c = carregarTudo({ fundo: true });
      await Promise.all([a, c]);
      return { epoca: _epocaCarga, pacotes: STATE.pacotes.length, loaded: STATE.loaded };
    });
    ok('duas cargas simultâneas não quebram o STATE', r.loaded === true && r.pacotes > 0, JSON.stringify(r));
    ok('a época avançou nas duas', r.epoca >= 2, 'epoca=' + r.epoca);
    await b.close();
  }

  // ================================================================
  console.log('\nPACOTE SEM PRODUTIVIDADE — pesa zero, e a tela tem de dizer');
  {
    const semProd = [
      'ID,Frente,Pacote,Unidade Física,Qtd Estimada,Produtividade,Status',
      'P01,Drenagem,Com produtividade,m,1000,10,Ativo',
      'P97,Muros,Pacote novo sem produtividade,m,1000,,Ativo',
    ].join('\r\n');
    const { b, p } = await abrir({ csv: {
      [GID.pacotes]: semProd,
      [GID.rdoavanco]: RDO_VAZIO + '\r\nr9,2026-07-10,P97,500,E100,Diurno,Wallace,teotonio' } });

    const r = await p.evaluate(() => ({
      pondera: obraPonderaPorProdutividade(),
      peso97: diasEquivalentes(1000, 'P97'),
      semPeso: pacotesSemPeso().map(x => x.id),
    }));
    ok('a obra pondera (há pacote com produtividade)', r.pondera);
    ok('o pacote sem produtividade realmente pesa zero', r.peso97 === 0, 'peso=' + r.peso97);
    ok('e pacotesSemPeso() o encontra', r.semPeso.indexOf('P97') !== -1, JSON.stringify(r.semPeso));

    await p.evaluate(() => navigate('executivo'));
    await p.waitForTimeout(500);
    const txt = await p.evaluate(() => document.getElementById('page').textContent);
    ok('o Painel Executivo AVISA que o pacote está fora do avanço',
      txt.indexOf('fora do Avanço Ponderado') !== -1 && txt.indexOf('P97') !== -1);
    ok('e avisa que ele já tem lançamento', txt.indexOf('já tem lançamento') !== -1);
    await b.close();
  }

  // ================================================================
  console.log('\nMODO APRESENTAÇÃO — o slide do diário mostra o efetivo');
  {
    const efetivo = JSON.stringify({ padrao_diurno: { Servente: 8, Pedreiro: 4 },
                                     customDireto_diurno: [{ nome: 'Topógrafo', qtd: 2 }] });
    const diario = ['id,Data,Turno,Clima_Manha,Clima_Tarde,Apontador_Diurno,Efetivo_JSON,obra',
      'D1,2026-07-10,Diurno,Bom,Chuva,Wallace,"' + efetivo.replace(/"/g, '""') + '",teotonio'].join('\r\n');
    const { b, p } = await abrir({ csv: { [GID.rdodiario]: diario } });
    const r = await p.evaluate(() => {
      const reg = STATE.rdodiario[0];
      return { total: efetivoTotaisRDO(reg).total,
               apont: getCSVField(reg, 'Apontador_Diurno') };
    });
    ok('efetivoTotaisRDO soma padrão + customizados', r.total === 14, 'total=' + r.total);
    ok('e o apontador do turno está lá', r.apont === 'Wallace', r.apont);
    await b.close();
  }

  // ================================================================
  console.log('\nRDO DIÁRIO — recarregar não descarta o que foi digitado');
  {
    const { b, p } = await abrir();
    const r = await p.evaluate(() => {
      const hoje = getLocalISODate(new Date());
      const d = defaultDiarioV4(hoje);
      d.diurno.apontador = 'Guilherme';
      d.diurno.ocorrencias = 'Interferência de concessionária às 10h';
      saveDiarioV4(d);
      DIARIO_V4 = null;                    // simula o recarregar da página
      renderRDODiarioV4();
      return { apont: DIARIO_V4.diurno.apontador, ocor: DIARIO_V4.diurno.ocorrencias };
    });
    ok('o apontador digitado sobrevive', r.apont === 'Guilherme', r.apont);
    ok('e a ocorrência também', /concessionária/.test(r.ocor || ''), r.ocor);

    const limpou = await p.evaluate(() => {
      const hoje = getLocalISODate(new Date());
      clearDiarioV4(hoje);
      return loadDiarioV4(hoje) === null;
    });
    ok('clearDiarioV4 realmente apaga o rascunho', limpou);
    await b.close();
  }

  console.log(falhas === 0 ? '\nTUDO CERTO\n' : `\n${falhas} FALHA(S)\n`);
  process.exit(falhas === 0 ? 0 : 1);
})();
