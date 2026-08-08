// O bloco EQUIPAMENTOS do RDO parava na oitava linha. Primeiro o corte era
// cego — `equipamentos.slice(0, 8)` acontecia ANTES do laço que soma, então
// equipamento do 9º em diante sumia da tabela E do total, e o PDF divergia do
// Excel do mesmo dia. Depois o total passou a fechar, mas o excedente virava
// "+ N outro(s) — ver planilha": quem lia o RDO não sabia QUAIS máquinas eram.
//
// Agora sai a frota inteira, uma linha por equipamento. Este teste monta um dia
// com mais equipamentos do que cabia na régua antiga, gera o PDF e a planilha
// pelo app de verdade, e cobra que os dois listem e somem tudo.
//
// Como rodar:  node tests/rdo-equipamentos.ui.test.js
//   (sobe o próprio servidor numa porta separada; não depende do 8099)
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const PORTA = 8137;

let falhas = 0;
const ok = (n, c, e) => {
  if (c) console.log('  ✓ ' + n);
  else { falhas++; console.log('  ✗ ' + n + (e !== undefined ? '  → ' + e : '')); }
};

// ---------- um dia com 12 tipos de equipamento (mais do que as 8 linhas) ----------
const DIA = '2026-07-31';
const EQ_DIURNO = {
  veiculo_leve: 3, veiculo_utilitario: 2, caminhao_toco: 1, caminhao_basculante: 4,
  caminhao_tanque: 1, rolo_pc: 1, escavadeira_hidraulica: 2, retro_escavadeira: 2,
  bobcat: 1, serra_circular: 3, sapo_compactador: 3, vibrador: 4,
};
const EQ_NOTURNO = { caminhao_basculante: 2, vibrador: 3, gerador: 2 };
const soma = o => Object.values(o).reduce((s, v) => s + v, 0);
const ESPERADO = { diu: soma(EQ_DIURNO), not: soma(EQ_NOTURNO) };
ESPERADO.total = ESPERADO.diu + ESPERADO.not;
const N_TIPOS = new Set([...Object.keys(EQ_DIURNO), ...Object.keys(EQ_NOTURNO)]).size;

const csvDiario = [
  'ID,Data,Clima_Manha,Clima_Tarde,Clima_Noite,Efetivo_JSON,Equipamentos_JSON,Ocorrencias,Observacoes_Gerais,Apontador_Diurno,Apontador_Noturno,Obra',
  [`D0001`, DIA, 'Bom', 'Bom', 'Bom',
    JSON.stringify({ padrao_diurno: { pedreiro: 4 }, padrao_noturno: { pedreiro: 2 } }),
    JSON.stringify({ padrao_diurno: EQ_DIURNO, padrao_noturno: EQ_NOTURNO }),
    '', '', 'Apontador Dia', 'Apontador Noite', 'teotonio',
  ].map(v => (/[",]/.test(String(v)) ? '"' + String(v).replace(/"/g, '""') + '"' : v)).join(','),
].join('\n');

const csvAvanco = [
  'ID,Data,Frente,Pacote_ID,Pacote_Nome,Local_Estaca,Quantidade,Unidade,Turno,Equipe,Obra',
  `A1,${DIA},Estrutura,P01,Concreto,Decantador 1,10,m³,Diurno,Equipe A,teotonio`,
].join('\n');

const csvPacotes = 'ID,Frente,Pacote,Unidade Física,Qtd Estimada,Status,Observação\nP01,Estrutura,Concreto,m³,100,Ativo,';

(async () => {
  const srv = spawn('python3', ['-m', 'http.server', String(PORTA), '--bind', '127.0.0.1'],
    { cwd: RAIZ, stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 1500));

  const navegador = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const ctx = await navegador.newContext({ acceptDownloads: true });

  // a planilha publicada e o Apps Script não entram no teste
  await ctx.route('**docs.google.com/**', rota => {
    const url = rota.request().url();
    const corpo = /1234324544/.test(url) ? csvDiario
                : /1906961773/.test(url) ? csvAvanco
                : /386002450/.test(url) ? csvPacotes : '';
    rota.fulfill({ status: 200, contentType: 'text/csv; charset=utf-8', body: corpo });
  });
  await ctx.route('**script.google*.com/**', rota => {
    const cb = new URL(rota.request().url()).searchParams.get('callback');
    rota.fulfill({ status: 200, contentType: 'text/javascript; charset=utf-8',
                   body: cb ? cb + '({"ok":true})' : '{"ok":true}' });
  });

  const pg = await ctx.newPage();
  const erros = [];
  pg.on('pageerror', e => erros.push(e.message));
  await pg.goto(`http://127.0.0.1:${PORTA}/index.html`, { waitUntil: 'domcontentloaded' });
  await pg.waitForFunction(() => window.STATE && STATE.rdodiario && STATE.rdodiario.length > 0,
    { timeout: 30000 }).catch(() => {});

  console.log(`EQUIPAMENTOS NO RDO — ${N_TIPOS} tipos num dia de 8 linhas`);

  // ---------- o que o Excel soma ----------
  const doExcel = await pg.evaluate((dia) => {
    const eq = linhasEquipExport(dadosRDOExport(rdosDaData(dia)[0], dia));
    return { totais: eq.totais, linhas: eq.rows.length };
  }, DIA);
  ok('Excel lista todos os tipos', doExcel.linhas === N_TIPOS, doExcel.linhas + ' linhas');
  ok('Excel soma a frota inteira',
     doExcel.totais[0] === ESPERADO.diu && doExcel.totais[1] === ESPERADO.not,
     JSON.stringify(doExcel.totais));

  // os rótulos dos 13 tipos do dia, lidos do cadastro do próprio app
  const ROTULOS = await pg.evaluate((chaves) =>
    CATEGORIAS_EQUIP_PADRAO.filter(e => chaves.includes(e.key)).map(e => e.label),
    [...new Set([...Object.keys(EQ_DIURNO), ...Object.keys(EQ_NOTURNO)])]);

  // ---------- o que o PDF imprime ----------
  const espera = pg.waitForEvent('download', { timeout: 60000 });
  await pg.evaluate((dia) => gerarPDFDiario(dia), DIA);
  const arq = await espera;
  const destino = path.join(require('os').tmpdir(), 'rdo-equip-teste.pdf');
  await arq.saveAs(destino);

  await pg.addScriptTag({ url: '/vendor/pdfjs/pdf.min.js' });
  const doPdf = await pg.evaluate(async ({ b64, rotulosEsperados }) => {
    const lib = window.pdfjsLib;
    lib.GlobalWorkerOptions.workerSrc = '/vendor/pdfjs/pdf.worker.min.js';
    const doc = await lib.getDocument({ data: Uint8Array.from(atob(b64), c => c.charCodeAt(0)) }).promise;
    const itens = (await (await doc.getPage(1)).getTextContent()).items
      .map(x => x.str.trim()).filter(Boolean);
    const i = itens.findIndex(t => t.startsWith('TOTAL EQUIPAMENTOS'));
    // o rótulo longo quebra em duas linhas dentro da célula; juntar os itens
    // na ordem em que foram impressos reconstrói o texto original.
    const corrido = itens.join(' ').replace(/\s+/g, ' ');
    return {
      linha: itens.slice(i + 1, i + 4),
      resumo: itens.filter(t => /^\+ \d+ outro/.test(t)),
      faltando: rotulosEsperados.filter(r => !corrido.includes(r)),
    };
  }, { b64: require('fs').readFileSync(destino).toString('base64'), rotulosEsperados: ROTULOS });

  ok('PDF soma a frota inteira, e não só o que coube na folha',
     doPdf.linha[0] === String(ESPERADO.diu) &&
     doPdf.linha[1] === String(ESPERADO.not) &&
     doPdf.linha[2] === String(ESPERADO.total),
     'imprimiu ' + JSON.stringify(doPdf.linha) + ', esperado ' +
     JSON.stringify([ESPERADO.diu, ESPERADO.not, ESPERADO.total].map(String)));

  ok('PDF não esconde equipamento atrás de um resumo', doPdf.resumo.length === 0,
     doPdf.resumo[0]);

  ok('PDF lista a frota inteira, uma linha por equipamento',
     doPdf.faltando.length === 0, 'faltou: ' + doPdf.faltando.join(', '));

  ok('PDF e Excel fecham no mesmo número',
     doPdf.linha[2] === String(doExcel.totais[2]),
     'PDF ' + doPdf.linha[2] + ' × Excel ' + doExcel.totais[2]);

  ok('sem erro de página', erros.length === 0, erros[0]);

  await navegador.close();
  srv.kill();
  console.log(falhas ? `\n${falhas} falha(s).` : '\nTudo certo.');
  process.exit(falhas ? 1 : 0);
})();
