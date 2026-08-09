// PARALISAÇÃO ESTRUTURADA — a parada de obra deixa de ser frase solta.
//
// A coluna `paralisado_motivo` existia desde sempre e o app SEMPRE a gravava
// vazia. Parada virava, na melhor das hipóteses, texto livre em "Ocorrências":
// não somava, não filtrava e não virava anexo de pleito de prazo.
//
// Como rodar:
//   python3 -m http.server 8099        (na raiz do repositório)
//   node tests/paralisacao.ui.test.js
const { chromium } = require('playwright');

let falhas = 0;
const ok = (n, c, e) => { if (c) console.log('  ✓ ' + n); else { falhas++; console.log('  ✗ ' + n + (e !== undefined ? '  → ' + e : '')); } };

const GID = { pacotes: '386002450', rdoavanco: '1906961773', rdodiario: '1234324544' };
const PAC = ['ID,Frente,Pacote,Unidade Física,Qtd Estimada,Produtividade,Status',
  'P01,Drenagem,Assentamento de tubulação,m,1000,20,Ativo',
  'P02,Pav. Flexível,Base de brita graduada,m²,5000,40,Ativo'].join('\r\n');

let ENVIADO = null;   // últimos parâmetros que o app mandou ao backend

async function abrir(csvExtra) {
  const b = await chromium.launch({ executablePath: process.env.CHROME_PATH ||
    '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  const ctx = await b.newContext({ locale: 'pt-BR', viewport: { width: 1440, height: 950 } });
  const p = await ctx.newPage();
  const erros = [];
  p.on('pageerror', e => erros.push('PAGEERROR: ' + e.message));
  p.on('console', m => { const t = m.text();
    if (m.type() === 'error' && !/Failed to load resource|net::|favicon/.test(t)) erros.push('CONSOLE: ' + t); });
  p.on('dialog', d => d.accept());

  const csv = Object.assign({ [GID.pacotes]: PAC }, csvExtra || {});
  await p.route('**://docs.google.com/**', r => {
    const gid = new URL(r.request().url()).searchParams.get('gid');
    r.fulfill({ status: 200, contentType: 'text/csv', body: csv[gid] === undefined ? '' : csv[gid] });
  });
  await p.route('**://script.google.com/**', r => {
    const u = new URL(r.request().url()), cb = u.searchParams.get('callback'), acao = u.searchParams.get('action');
    if (acao === 'addRDODiario' || acao === 'updateRDODiario') {
      ENVIADO = {}; u.searchParams.forEach((v, k) => { ENVIADO[k] = v; });
    }
    const resp = acao === 'login'
      ? { ok: true, usuario: 'Leonardo', perfil: 'admin', token: 't', obras: '*' } : { ok: true };
    r.fulfill({ status: 200, contentType: 'application/javascript', body: `${cb}(${JSON.stringify(resp)})` });
  });
  await p.goto('http://localhost:8099/index.html', { waitUntil: 'load' });
  await p.evaluate(() => { localStorage.setItem('teotonio_user', 'Leonardo');
    localStorage.setItem('teotonio_perfil_v1', 'admin'); localStorage.setItem('teotonio_token_v1', 't'); });
  await p.reload({ waitUntil: 'load' });
  await p.waitForFunction(() => typeof STATE !== 'undefined' && STATE.loaded === true, null, { timeout: 30000 });
  return { b, p, erros };
}

(async () => {
  console.log('\nA CONTA DAS HORAS');
  {
    const { b, p, erros } = await abrir();
    const r = await p.evaluate(() => ({
      normal: horasParalisacao({ inicio: '08:00', fim: '11:30' }),
      // O turno noturno atravessa a meia-noite: 22:00 → 02:00 são 4 h, não -20.
      virada: horasParalisacao({ inicio: '22:00', fim: '02:00' }),
      semFim: horasParalisacao({ inicio: '08:00', fim: '' }),
      lixo: horasParalisacao({ inicio: 'manhã', fim: '25:99' }),
      // Só conta o registro que tem motivo — linha aberta e não preenchida sai.
      validas: paralisacoesValidas([{ motivo: 'Chuva' }, { motivo: '' }, { motivo: '  ' }]).length,
      texto: textoParalisacao({ motivo: 'Chuva', inicio: '08:00', fim: '11:30', frente: 'Drenagem', efetivo: '12', equip: '3' }),
    }));
    ok('conta as horas do intervalo', Math.abs(r.normal - 3.5) < 0.001, String(r.normal));
    ok('e atravessa a meia-noite sem virar negativo', Math.abs(r.virada - 4) < 0.001, String(r.virada));
    ok('sem hora de fim não inventa duração', r.semFim === null, String(r.semFim));
    ok('hora inválida não vira número', r.lixo === null, String(r.lixo));
    ok('linha sem motivo é descartada', r.validas === 1, String(r.validas));
    ok('o texto legível traz motivo, horário, frente e parados',
       /Chuva/.test(r.texto) && /08:00–11:30/.test(r.texto) && /3,5 h/.test(r.texto) &&
       /Drenagem/.test(r.texto) && /12/.test(r.texto) && /3 equip/.test(r.texto), r.texto);
    ok('sem erro de console', erros.length === 0, JSON.stringify(erros.slice(0, 2)));
    await b.close();
  }

  console.log('\nO FORMULÁRIO GRAVA E ENVIA');
  {
    ENVIADO = null;
    const { b, p, erros } = await abrir();
    await p.evaluate(() => {
      STATE.currentPage = 'rdodiario';
      DIARIO_V4 = defaultDiarioV4('2026-07-15');
      DIARIO_TURNO_ATIVO = 'diurno';
      render(); attachRDODiarioV4Form();
    });
    await p.waitForTimeout(400);
    let t = await p.evaluate(() => document.getElementById('page').innerText.toLowerCase());
    ok('o cartão nasce vazio', /paralisações do turno/i.test(t) && /só preencha se a obra parou/.test(t));

    await p.evaluate(() => adicionarParalisacaoV4());
    await p.waitForTimeout(500);
    const campos = await p.evaluate(() => [...document.querySelectorAll('[data-paralis4]')].map(e => e.dataset.paralis4));
    ok('o botão abre uma linha com todos os campos',
       ['0|motivo', '0|inicio', '0|fim', '0|frente', '0|efetivo', '0|equip', '0|obs'].every(k => campos.includes(k)),
       JSON.stringify(campos));

    // Digitar nos campos é o que o apontador faz — o rascunho tem de acompanhar.
    await p.evaluate(() => {
      const set = (k, v) => { const el = document.querySelector(`[data-paralis4="${k}"]`); el.value = v; el.dispatchEvent(new Event('input')); };
      set('0|inicio', '08:00'); set('0|fim', '12:00'); set('0|frente', 'Drenagem');
      set('0|efetivo', '14'); set('0|equip', '3');
      const el = document.querySelector('[data-diario4="apontador"]');
      el.value = 'Wallace'; el.dispatchEvent(new Event('input'));
    });
    await p.waitForTimeout(300);
    const rascunho = await p.evaluate(() => JSON.parse(localStorage.getItem(lsObra('teotonio_rdo_diario_v4_2026-07-15'))));
    ok('o rascunho local guarda a paralisação',
       rascunho.diurno.paralisacoes.length === 1 && rascunho.diurno.paralisacoes[0].inicio === '08:00',
       JSON.stringify(rascunho.diurno.paralisacoes));

    await p.evaluate(() => salvarDiarioV4());
    await p.waitForTimeout(1500);
    ok('o backend recebeu a paralisação estruturada', !!(ENVIADO && ENVIADO.paralisacoes_json), JSON.stringify(ENVIADO && Object.keys(ENVIADO)));
    const enviado = ENVIADO ? JSON.parse(ENVIADO.paralisacoes_json) : {};
    ok('no turno certo', enviado.diurno && enviado.diurno.length === 1 && (!enviado.noturno || !enviado.noturno.length),
       JSON.stringify(enviado));
    ok('com o horário e a frente', enviado.diurno[0].inicio === '08:00' && enviado.diurno[0].frente === 'Drenagem',
       JSON.stringify(enviado.diurno[0]));
    // A coluna que existia desde sempre e SEMPRE ia vazia.
    ok('e paralisado_motivo deixa de ir em branco', ENVIADO.paralisado_motivo === 'Chuva', JSON.stringify(ENVIADO.paralisado_motivo));
    ok('sem erro de console', erros.length === 0, JSON.stringify(erros.slice(0, 2)));
    await b.close();
  }

  console.log('\n"OUTRO" SEM DESCRIÇÃO NÃO SOBE');
  {
    ENVIADO = null;
    const { b, p, erros } = await abrir();
    await p.evaluate(() => {
      STATE.currentPage = 'rdodiario';
      DIARIO_V4 = defaultDiarioV4('2026-07-16');
      DIARIO_V4.diurno.apontador = 'Wallace';
      DIARIO_V4.diurno.paralisacoes = [{ motivo: 'Outro', inicio: '08:00', fim: '10:00', frente: '', efetivo: '', equip: '', obs: '' }];
      DIARIO_TURNO_ATIVO = 'diurno';
      render(); attachRDODiarioV4Form();
    });
    await p.waitForTimeout(400);
    await p.evaluate(() => salvarDiarioV4());
    await p.waitForTimeout(1200);
    ok('não envia parada "Outro" sem detalhe escrito', ENVIADO === null, JSON.stringify(ENVIADO && ENVIADO.paralisacoes_json));
    ok('e explica por quê', /sustenta pleito/i.test(await p.evaluate(() => document.body.innerText)));
    ok('sem erro de console', erros.length === 0, JSON.stringify(erros.slice(0, 2)));
    await b.close();
  }

  console.log('\nDIAS IMPRODUTIVOS PASSA A CITAR O MOTIVO REGISTRADO');
  {
    // 06/07: parada por interferência da concessionária, sem chuva nenhuma.
    // Antes disso, dia sem chuva e sem serviço era só "sem RDO" — a causa
    // real não existia em lugar nenhum do app.
    const paralis = JSON.stringify({
      diurno: [{ motivo: 'Interferência de concessionária', inicio: '07:00', fim: '17:00',
                 frente: 'Drenagem', efetivo: '18', equip: '4', obs: 'Poste não removido na est. 112' }],
      noturno: [],
    }).replace(/"/g, '""');
    const interno = JSON.stringify({
      diurno: [{ motivo: 'Falta de material', inicio: '08:00', fim: '12:00', frente: 'Pav. Flexível', efetivo: '', equip: '', obs: '' }],
      noturno: [],
    }).replace(/"/g, '""');
    const diario = ['id,numero_rdo,Data,Turno,Clima_Manha,Clima_Tarde,Clima_Noite,Apontador_Diurno,Chuva_mm_Auto,Clima_Fonte,Paralisacoes_JSON,obra',
      `D101,1,2026-07-06,Diurno,Bom,Bom,Bom,Wallace,"0",Open-Meteo,"${paralis}",teotonio`,
      `D102,2,2026-07-07,Diurno,Bom,Bom,Bom,Wallace,"0",Open-Meteo,"${interno}",teotonio`,
      'D103,3,2026-07-08,Diurno,Bom,Bom,Bom,Wallace,"0",Open-Meteo,,teotonio'].join('\r\n');

    const { b, p, erros } = await abrir({ [GID.rdodiario]: diario });
    const r = await p.evaluate(() => {
      const c = calcDiasImprodutivos('2026-07');
      const d6 = c.dias.find(x => x.iso === '2026-07-06');
      const d7 = c.dias.find(x => x.iso === '2026-07-07');
      const d8 = c.dias.find(x => x.iso === '2026-07-08');
      return { t: c.totais,
        d6: { improd: d6.improdutivo, h: d6.horasParadas, pleit: d6.pleiteavel, n: d6.paralisacoes.length },
        d7: { improd: d7.improdutivo, pleit: d7.pleiteavel },
        d8: { improd: d8.improdutivo, n: d8.paralisacoes.length } };
    });
    ok('parada registrada torna o dia improdutivo mesmo sem chuva', r.d6.improd === true, JSON.stringify(r.d6));
    ok('conta as 10 horas paradas', Math.abs(r.d6.h - 10) < 0.01, String(r.d6.h));
    ok('interferência de concessionária sustenta pleito', r.d6.pleit === true);
    ok('falta de material NÃO sustenta pleito (é da construtora)', r.d7.pleit === false, JSON.stringify(r.d7));
    ok('mas continua listada como parada', r.d7.improd === true);
    ok('dia sem coluna preenchida não quebra', r.d8.n === 0 && r.d8.improd === false, JSON.stringify(r.d8));
    ok('o total de dias pleiteáveis separa os dois casos', r.t.diasPleiteaveis === 1, String(r.t.diasPleiteaveis));
    ok('e soma as horas paradas do mês', Math.abs(r.t.horasParadas - 14) < 0.01, String(r.t.horasParadas));

    await p.evaluate(() => { STATE.currentPage = 'improdutivos'; IMPROD_MES = '2026-07'; render(); });
    await p.waitForTimeout(600);
    const tela = await p.evaluate(() => document.getElementById('page').innerText);
    ok('a tela imprime o motivo registrado', /Interferência de concessionária/.test(tela));
    ok('com as horas e a frente', /10,0 h/.test(tela) && /Drenagem/.test(tela));
    ok('e o número que vai no pleito', /Pleiteáveis/i.test(tela));
    ok('sem erro de console', erros.length === 0, JSON.stringify(erros.slice(0, 2)));
    await b.close();
  }

  console.log('\nO RDO IMPRESSO MOSTRA A PARADA — SEM DUPLICAR');
  {
    const paralis = JSON.stringify({
      diurno: [{ motivo: 'Chuva', inicio: '13:00', fim: '17:00', frente: 'Drenagem', efetivo: '10', equip: '2', obs: '' }],
      noturno: [],
    }).replace(/"/g, '""');
    const diario = ['id,numero_rdo,Data,Turno,Clima_Manha,Clima_Tarde,Clima_Noite,Apontador_Diurno,Ocorrencias,Paralisacoes_JSON,obra',
      `D201,7,2026-07-20,Diurno,Bom,Chuva,Bom,Wallace,Visita da fiscalização,"${paralis}",teotonio`].join('\r\n');
    const { b, p, erros } = await abrir({ [GID.rdodiario]: diario });
    const r = await p.evaluate(() => {
      const linha = STATE.rdodiario.find(x => String(getCSVField(x, 'ID')).trim() === 'D201');
      const uma = dadosRDOExport(linha, '2026-07-20').ocorrencias;
      // Gerar duas vezes não pode empilhar o texto: o resumo é montado na hora
      // de imprimir, nunca gravado no campo de ocorrências.
      const duas = dadosRDOExport(linha, '2026-07-20').ocorrencias;
      return { uma, duas, guardado: getCSVField(linha, 'Ocorrencias') };
    });
    ok('o texto do RDO traz a ocorrência original', /Visita da fiscalização/.test(r.uma), r.uma);
    ok('e a paralisação junto', /PARALISAÇÕES/.test(r.uma) && /Chuva/.test(r.uma) && /13:00–17:00/.test(r.uma), r.uma);
    ok('gerar de novo não duplica', r.uma === r.duas, r.duas);
    ok('e o campo gravado na planilha continua intocado',
       r.guardado === 'Visita da fiscalização', JSON.stringify(r.guardado));
    ok('sem erro de console', erros.length === 0, JSON.stringify(erros.slice(0, 2)));
    await b.close();
  }

  console.log('\nRASCUNHO ANTIGO, DE ANTES DA PARALISAÇÃO EXISTIR');
  {
    const { b, p, erros } = await abrir();
    await p.evaluate(() => {
      // Exatamente o formato que ficou gravado no celular de quem estava com
      // um turno aberto quando a versão nova subiu: sem o campo novo.
      const velho = { data: '2026-07-21', clima_manha: 'Bom', clima_tarde: 'Bom', clima_noite: 'Bom',
        diurno: { apontador: 'Wallace', efetivo: { pedreiro: 8 }, equipamentos: {}, customIndireto: [],
                  customDireto: [], customEquip: [], visitas: '', ocorrencias: '', observacoes: '', preenchido: false },
        noturno: { apontador: '', efetivo: {}, equipamentos: {}, customIndireto: [], customDireto: [],
                   customEquip: [], visitas: '', ocorrencias: '', observacoes: '', preenchido: false } };
      localStorage.setItem(lsObra('teotonio_rdo_diario_v4_2026-07-21'), JSON.stringify(velho));
      STATE.currentPage = 'rdodiario';
      DIARIO_V4 = loadDiarioV4('2026-07-21');
      DIARIO_TURNO_ATIVO = 'diurno';
      render(); attachRDODiarioV4Form();
    });
    await p.waitForTimeout(500);
    const r = await p.evaluate(() => ({
      txt: document.getElementById('page').innerText,
      apontador: (document.querySelector('[data-diario4="apontador"]') || {}).value,
      pedreiro: (document.querySelector('[data-efet4="pedreiro"]') || {}).value,
      lista: DIARIO_V4.diurno.paralisacoes,
    }));
    ok('a tela abre com o rascunho antigo', /paralisações do turno/i.test(r.txt) && r.apontador === 'Wallace',
       JSON.stringify(r.apontador));
    ok('o campo novo nasce como lista vazia, não indefinido',
       Array.isArray(r.lista) && r.lista.length === 0, JSON.stringify(r.lista));
    ok('e o efetivo antigo continua lá', String(r.pedreiro) === '8', JSON.stringify(r.pedreiro));

    // E adicionar uma paralisação por cima do rascunho antigo funciona.
    await p.evaluate(() => adicionarParalisacaoV4());
    await p.waitForTimeout(400);
    ok('dá para registrar uma parada por cima dele',
       (await p.evaluate(() => DIARIO_V4.diurno.paralisacoes.length)) === 1);
    ok('sem erro de console', erros.length === 0, JSON.stringify(erros.slice(0, 2)));
    await b.close();
  }

  console.log(falhas === 0 ? '\nTUDO CERTO\n' : `\n${falhas} FALHA(S)\n`);
  process.exit(falhas === 0 ? 0 : 1);
})();
