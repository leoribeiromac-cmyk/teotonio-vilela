// O RDO era desenhado como se sempre coubesse numa folha A4. Quando não
// cabia acontecia o pior dos dois mundos: o excedente ia para uma página SEM
// cabeçalho — quem recebia a folha 2 não sabia de que obra nem de que dia ela
// era — e as duas colunas escreviam sempre na página CORRENTE do documento,
// então a coluna de serviços podia cair em cima da continuação do efetivo.
// Fora isso, nome de pacote, de local e de equipe eram cortados no meio da
// palavra ao estourar a célula.
//
// Este teste monta um dia grande de propósito (48 serviços, nomes longos),
// gera o PDF pelo app de verdade e cobra folha a folha:
//   • toda página abre com o cabeçalho completo;
//   • toda página traz "Página N de T", com o N certo;
//   • nada é escrito fora da margem nem invade a coluna vizinha;
//   • local e equipe cabem na célula (terminam em reticências quando faltam);
//   • as assinaturas aparecem uma vez só, na última folha.
//
// Como rodar:  node tests/rdo-paginacao.ui.test.js
//   (sobe o próprio servidor numa porta separada; não depende do 8099)
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const PORTA = 8141;
const MM = 72 / 25.4;          // o PDF sai em pontos; o layout é pensado em mm
const pt = mm => mm * MM;

let falhas = 0;
const ok = (n, c, e) => {
  if (c) console.log('  ✓ ' + n);
  else { falhas++; console.log('  ✗ ' + n + (e !== undefined ? '  → ' + e : '')); }
};

// ---------- um dia que não cabe numa folha ----------
const DIA = '2026-07-15';
const N_DIU = 30, N_NOT = 18;

const LOCAL = 'Decantador Secundário Norte — Estaca 12+340 a 13+120';
const EQUIPE = 'Equipe de Estrutura e Formas — Subempreiteira Alfa Construções Ltda';
const PACOTE = 'Execução de armadura, formas e concretagem estrutural do decantador';

const efetivo = { pedreiro: 12, servente: 20, carpinteiro: 8, armador: 6, encarregado: 3 };
const equip = { veiculo_leve: 2, caminhao_basculante: 3, escavadeira_hidraulica: 1, vibrador: 4 };

const csvDiario = [
  'ID,Data,Clima_Manha,Clima_Tarde,Clima_Noite,Efetivo_JSON,Equipamentos_JSON,Ocorrencias,Observacoes_Gerais,Apontador_Diurno,Apontador_Noturno,Obra',
  ['D0042', DIA, 'Bom', 'Bom', 'Chuva',
    JSON.stringify({ padrao_diurno: efetivo, padrao_noturno: { pedreiro: 5, servente: 9 } }),
    JSON.stringify({ padrao_diurno: equip, padrao_noturno: { vibrador: 2 } }),
    'Chuva forte a partir das 18h20 obrigou a parar a concretagem do decantador 2; a forma ficou escorada e será liberada amanhã após vistoria.',
    'Recebimento de 14 m³ de concreto usinado FCK 30, notas 88213 e 88214. Fiscalização esteve no canteiro pela manhã.',
    'Carlos Apontador', 'Marina Apontadora', 'teotonio',
  ].map(v => (/[",\n]/.test(String(v)) ? '"' + String(v).replace(/"/g, '""') + '"' : v)).join(','),
].join('\n');

const linhasAvanco = [];
for (let i = 1; i <= N_DIU; i++) {
  linhasAvanco.push(['AD' + i, DIA, 'Estrutura', 'P0' + ((i % 3) + 1), PACOTE + ' — trecho ' + i,
    LOCAL, 10, 'm³', 'Diurno', EQUIPE, 'teotonio']);
}
for (let i = 1; i <= N_NOT; i++) {
  linhasAvanco.push(['AN' + i, DIA, 'Estrutura', 'P0' + ((i % 3) + 1), PACOTE + ' — trecho noturno ' + i,
    LOCAL, 8, 'm³', 'Noturno', EQUIPE, 'teotonio']);
}
const csvAvanco = [
  'ID,Data,Frente,Pacote_ID,Pacote_Nome,Local_Estaca,Quantidade,Unidade,Turno,Equipe,Obra',
  ...linhasAvanco.map(l => l.map(v =>
    (/[",]/.test(String(v)) ? '"' + String(v).replace(/"/g, '""') + '"' : v)).join(',')),
].join('\n');

const csvPacotes = [
  'ID,Frente,Pacote,Unidade Física,Qtd Estimada,Status,Observação',
  'P01,Estrutura de Concreto Armado,Concreto,m³,1000,Ativo,',
  'P02,Estrutura de Concreto Armado,Formas,m²,4000,Ativo,',
  'P03,Terraplenagem e Drenagem,Aterro,m³,9000,Ativo,',
].join('\n');

(async () => {
  const srv = spawn('python3', ['-m', 'http.server', String(PORTA), '--bind', '127.0.0.1'],
    { cwd: RAIZ, stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 1500));

  const navegador = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const ctx = await navegador.newContext({ acceptDownloads: true });

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
  await pg.waitForFunction(() => window.STATE && STATE.rdoavanco && STATE.rdoavanco.length > 0,
    { timeout: 30000 }).catch(() => {});

  console.log(`PAGINAÇÃO DO RDO — ${N_DIU + N_NOT} serviços num dia`);

  const espera = pg.waitForEvent('download', { timeout: 60000 });
  await pg.evaluate((dia) => gerarPDFDiario(dia), DIA);
  const arq = await espera;
  const destino = path.join(require('os').tmpdir(), 'rdo-paginacao-teste.pdf');
  await arq.saveAs(destino);

  await pg.addScriptTag({ url: '/vendor/pdfjs/pdf.min.js' });
  const paginas = await pg.evaluate(async (b64) => {
    const lib = window.pdfjsLib;
    lib.GlobalWorkerOptions.workerSrc = '/vendor/pdfjs/pdf.worker.min.js';
    const doc = await lib.getDocument({ data: Uint8Array.from(atob(b64), c => c.charCodeAt(0)) }).promise;
    const out = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const p = await doc.getPage(n);
      const alturaPt = p.getViewport({ scale: 1 }).height;
      out.push((await p.getTextContent()).items
        .filter(it => it.str.trim())
        .map(it => ({
          t: it.str.trim(),
          x: it.transform[4],
          // vira topo-origem, que é como o layout raciocina
          y: alturaPt - it.transform[5],
          w: it.width,
        })));
    }
    return out;
  }, require('fs').readFileSync(destino).toString('base64'));

  const T = paginas.length;
  const tem = (p, txt) => p.some(it => it.t.includes(txt));

  ok('o dia grande gera mais de uma folha', T > 1, T + ' página(s)');

  // ---------- 1. cabeçalho em toda página ----------
  const semTitulo = paginas.map((p, i) => tem(p, 'RELATÓRIO DIÁRIO DE OBRA') ? null : i + 1).filter(Boolean);
  ok('toda página abre com o título do RDO', semTitulo.length === 0, 'faltou em ' + semTitulo);

  const semData = paginas.map((p, i) =>
    p.some(it => /^15\/07\/(26|2026)$/.test(it.t)) ? null : i + 1).filter(Boolean);
  ok('toda página identifica a data', semData.length === 0, 'faltou em ' + semData);

  const semObjeto = paginas.map((p, i) => tem(p, 'OBJETO') && tem(p, 'PRAZO') ? null : i + 1).filter(Boolean);
  ok('toda página traz o quadro de objeto e prazo', semObjeto.length === 0, 'faltou em ' + semObjeto);

  // O dia do teste é Bom de manhã, Bom à tarde e Chuva à noite. O quadro
  // mostrava só a manhã: o RDO de um dia que parou por chuva dizia "Bom".
  const semClima = paginas.map((p, i) =>
    ['MANHÃ', 'TARDE', 'NOITE'].every(t => tem(p, t)) ? null : i + 1).filter(Boolean);
  ok('o quadro de clima traz os três períodos', semClima.length === 0, 'faltou em ' + semClima);
  ok('e o período que choveu aparece como chuva', paginas.every(p => tem(p, 'Chuva')));

  const marcadas = paginas.map((p, i) => tem(p, 'continuação') ? i + 1 : null).filter(Boolean);
  ok('as folhas seguintes vêm marcadas como continuação',
     marcadas.length === T - 1 && !marcadas.includes(1), 'marcadas: ' + marcadas);

  // ---------- 2. rodapé numerado ----------
  const rodapesErrados = paginas.map((p, i) =>
    tem(p, 'Página ' + (i + 1) + ' de ' + T) ? null : i + 1).filter(Boolean);
  ok('toda página numera a si mesma', rodapesErrados.length === 0, 'errado em ' + rodapesErrados);

  // ---------- 3. nada fora da margem ----------
  const ESQ = pt(8), DIR = pt(8 + 194), FOLGA = pt(1.2);
  const forat = [];
  paginas.forEach((p, i) => p.forEach(it => {
    if (it.x < ESQ - FOLGA || it.x + it.w > DIR + FOLGA) forat.push(`p${i + 1} "${it.t}"`);
  }));
  ok('nada escapa da margem da folha', forat.length === 0, forat.slice(0, 3).join(' | '));

  // ---------- 4. as colunas não se invadem ----------
  // Onde a folha é dividida, a esquerda vai de 8 a 120 mm e os serviços
  // começam em 123 mm. Cabeçalho, rodapé, fecho — e a lista de serviços
  // quando ela toma a folha inteira — ocupam os 194 mm por direito.
  const GUT_ESQ = pt(120), GUT_DIR = pt(123);
  // Faixa usada pelos serviços em cada folha, lida do próprio PDF.
  const faixaArr = [];
  paginas.forEach((p, i) => {
    const h = p.find(it => it.t === 'FRENTE / PACOTE');
    faixaArr[i] = h ? (h.x < pt(20) ? pt(194) : pt(79)) : (faixaArr[i - 1] || pt(79));
  });
  const faixa = i => faixaArr[i];

  const p1 = paginas[0];
  const yEfetivo = (p1.find(it => it.t.startsWith('EFETIVO')) || {}).y;
  const yFecho = Math.min(
    ...p1.filter(it => it.t === 'ASSINATURAS' || it.t === 'OBS:'
                    || (/^SERVIÇOS/.test(it.t) && it.x < pt(20))).map(it => it.y),
    pt(297 - 24));
  const invadem = p1.filter(it => it.y > yEfetivo && it.y < yFecho)
    .filter(it => it.x < GUT_ESQ - FOLGA && it.x + it.w > GUT_DIR + FOLGA)
    .map(it => `"${it.t}"`);
  ok('onde a folha é dividida, nenhuma coluna invade a outra',
     yEfetivo !== undefined && invadem.length === 0, invadem.slice(0, 3).join(' | '));

  // ---------- 5. local e equipe cabem na célula ----------
  ok('num dia grande a lista de serviços usa a folha inteira',
     faixaArr.every(f => f === pt(194)), faixaArr.map(f => (f / MM).toFixed(0) + 'mm').join(', '));

  ok('a folha 1 não fica com meia página em branco',
     p1.filter(it => it.y > pt(200)).length > 5,
     p1.filter(it => it.y > pt(200)).length + ' itens abaixo de 200mm');

  const CELULA = /^(Decantador|Equipe de)/;
  const estourou = [];
  paginas.forEach((p, i) => p.forEach(it => {
    if (!CELULA.test(it.t)) return;
    const permitido = faixa(i) * 0.23 - pt(2.5);
    if (it.w > permitido + FOLGA) estourou.push(`p${i + 1} "${it.t}" (${it.w.toFixed(0)}pt > ${permitido.toFixed(0)}pt)`);
  }));
  ok('local e equipe cabem na célula', estourou.length === 0, estourou.slice(0, 3).join(' | '));

  const cortados = paginas.flat().filter(it => CELULA.test(it.t));
  ok('o que não coube termina em reticências, não no meio da palavra',
     cortados.length > 0 && cortados.every(it => it.t.endsWith('…')),
     (cortados.find(it => !it.t.endsWith('…')) || {}).t);

  // ---------- 6. os serviços não somem ----------
  const linhasServico = paginas.flat().filter(it => it.t.startsWith('Equipe de')).length;
  ok('todos os serviços do dia foram impressos', linhasServico === N_DIU + N_NOT,
     linhasServico + ' de ' + (N_DIU + N_NOT));

  ok('os dois turnos ganham seu bloco',
     paginas.some(p => tem(p, 'SERVIÇOS DIURNOS')) && paginas.some(p => tem(p, 'SERVIÇOS NOTURNOS')));

  ok('o bloco que vira a folha se reapresenta na seguinte',
     paginas.some(p => tem(p, '(cont.)')),
     'nenhum título de continuação');

  // ---------- 7. o fecho fica na última folha ----------
  const pagsComAssinatura = paginas.map((p, i) => tem(p, 'ASSINATURAS') ? i + 1 : null).filter(Boolean);
  ok('as assinaturas aparecem uma vez só, na última folha',
     pagsComAssinatura.length === 1 && pagsComAssinatura[0] === T, 'em ' + pagsComAssinatura);

  ok('a ocorrência do dia é impressa por inteiro',
     paginas.some(p => tem(p, 'OBS:')) && paginas.some(p => tem(p, 'Chuva forte a partir das 18h20')));

  // ---------- 8. nada por baixo do rodapé ----------
  const noRodape = [];
  paginas.forEach((p, i) => p.forEach(it => {
    if (it.y > pt(297 - 12) && !/Página|Gestor|RDO Nº|Teotônio|São Paulo|Data:/.test(it.t))
      noRodape.push(`p${i + 1} "${it.t}"`);
  }));
  ok('o conteúdo para antes do rodapé', noRodape.length === 0, noRodape.slice(0, 3).join(' | '));

  ok('sem erro de página', erros.length === 0, erros[0]);

  await navegador.close();
  srv.kill();
  console.log(falhas ? `\n${falhas} falha(s).` : '\nTudo certo.');
  process.exit(falhas ? 1 : 0);
})();
