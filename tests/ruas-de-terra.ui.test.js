// A OBRA ABERTA É A OBRA ABERTA — dois defeitos que só apareciam fora da
// Teotônio, e que este arquivo prende no lugar.
//
//  1. TROCAR DE PRANCHA NÃO ACONTECIA. O rótulo do zoom ("· nível 2 de 6")
//     ganhou a classe `proj-nivel`, que já era a da CAMADA de quadrados da
//     pirâmide — `position:absolute` de 100%×100%. Como o `.card` é `static`,
//     o pai posicionado virava o `#page`: o rótulo do cabeçalho passava a ser
//     uma folha invisível do tamanho da página, e engolia o clique de tudo o
//     que estivesse embaixo. A Teotônio tem UMA prancha e não mostra lista —
//     por isso ninguém tinha visto. As Ruas de Terra têm cinco, e nenhuma
//     delas abria.
//
//  2. OS PAPÉIS SAÍAM COMO TEOTÔNIO. O cabeçalho do PDF Interno trazia
//     "Av. Senador Teotônio Vilela · Gestor Engenharia" escrito no código,
//     então o relatório diário de QUALQUER obra chegava ao grupo com o nome
//     da avenida. O mesmo defeito estava na capa e no rodapé do Relatório
//     Executivo, no nome do arquivo dele e no prompt do Analista IA — que
//     mandava a IA recomendar coisas de "duplicação viária" para uma obra
//     de pavimentação de ruas de terra.
//
// Como rodar:  node tests/ruas-de-terra.ui.test.js
//   (sobe o próprio servidor; não depende do 8099)
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const path = require('path');

/* O repositório, a partir DESTE arquivo — nunca um caminho absoluto: na CI
   ele não existe, e `spawn` com `cwd` inexistente devolve um ENOENT que
   acusa o comando ("spawn python3 ENOENT") em vez da pasta. */
const RAIZ = path.join(__dirname, '..');
const PORTA = 8128;
const BASE = 'http://localhost:' + PORTA;

let falhas = 0;
const ok = (n, c, e) => { if (c) console.log('  ✓ ' + n); else { falhas++; console.log('  ✗ ' + n + (e !== undefined ? '  → ' + e : '')); } };

const srv = spawn('python3', ['-m', 'http.server', String(PORTA)], { cwd: RAIZ, stdio: 'ignore' });
const encerrar = () => { try { srv.kill(); } catch (e) { } };
process.on('exit', encerrar);

(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  const p = await ctx.newPage();

  const erros = [];
  p.on('pageerror', e => erros.push('PAGEERROR: ' + e.message));
  p.on('console', m => {
    const t = m.text();
    if (m.type() === 'error' && !/Failed to load resource|net::/.test(t)) erros.push('CONSOLE: ' + t);
  });
  const baixados = [];
  p.on('request', r => { const u = r.url(); if (/\/projetos\//.test(u)) baixados.push(u.replace(BASE, '')); });

  /* Parte das chamadas do app é JSONP: a resposta chega como <script>. Sem
     embrulhar no callback, o navegador tenta EXECUTAR o JSON e derruba um
     "Unexpected token ':'" que não tem nada a ver com o que se está medindo. */
  await ctx.route('**script.google*.com/**', r => {
    const cb = new URL(r.request().url()).searchParams.get('callback');
    const c = { ok: true };
    r.fulfill({ status: 200, contentType: 'application/javascript',
                body: cb ? `${cb}(${JSON.stringify(c)})` : JSON.stringify(c) });
  });
  await ctx.route('**docs.google.com/**', r => r.fulfill({ status: 200, contentType: 'text/csv', body: '' }));
  // O Analista IA descreve a obra DENTRO do prompt. Interceptar a chamada é a
  // única forma de ler o texto que de fato sai do aparelho.
  let promptIA = '';
  await ctx.route('**generativelanguage.googleapis.com/**', r => {
    try { promptIA = JSON.parse(r.request().postData() || '{}').contents[0].parts[0].text; } catch (e) { }
    r.fulfill({ status: 200, contentType: 'application/json',
                body: JSON.stringify({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] }) });
  });

  await p.goto(BASE + '/index.html', { waitUntil: 'load' });
  await p.waitForTimeout(900);
  await p.evaluate(() => trocarObra('ruas-de-terra'));
  await p.waitForTimeout(900);
  // O cadastro desta obra vem de arquivo; a planilha só traz LANÇAMENTO, e
  // sem rede a tela de falha cobriria o que se quer medir aqui.
  await p.evaluate(() => { STATE.cargaFalhou = false; STATE.loaded = true; navigate('projetos'); });
  await p.waitForTimeout(1800);

  // ------------------------------------------------------------------
  console.log('\nA LISTA DE PRANCHAS DA OBRA');
  const lista = await p.$$eval('.proj-item', els => els.map(e => e.textContent.replace(/\s+/g, ' ').trim()));
  ok('as cinco pranchas das Ruas de Terra aparecem', lista.length === 5, lista.length);
  ok('e a primeira já está aberta',
     await p.evaluate(() => PROJ.sel === 'projetos/ruas-de-terra/agrimensor-pavimentacao.pdf'),
     await p.evaluate(() => PROJ.sel));

  // ------------------------------------------------------------------
  console.log('\nNADA COBRE A TELA');
  // O defeito era exatamente este: um elemento do cartão do visor esticado
  // por cima da lista. Medir "quem recebe o clique" é o que pega de volta
  // qualquer sobreposição futura, não só a que existiu.
  const cobertura = await p.evaluate(() => {
    const fora = [];
    document.querySelectorAll('.proj-item').forEach((it, i) => {
      const r = it.getBoundingClientRect();
      const alvo = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      if (!alvo || !it.contains(alvo)) {
        fora.push(i + ': ' + (alvo ? (alvo.className || alvo.tagName) : 'nada'));
      }
    });
    return fora;
  });
  ok('cada item da lista recebe o próprio clique', cobertura.length === 0, cobertura.join(' ; '));

  const rotulo = await p.evaluate(() => {
    const el = document.querySelector('#projZoom .proj-degrau');
    if (!el) return { achou: false };
    const cs = getComputedStyle(el), r = el.getBoundingClientRect();
    return { achou: true, texto: el.textContent.trim(), pos: cs.position, largura: Math.round(r.width) };
  });
  ok('o rótulo do nível continua sendo escrito', rotulo.achou && /nível \d+ de \d+/.test(rotulo.texto), JSON.stringify(rotulo));
  ok('mas é texto no cabeçalho, não uma camada esticada',
     rotulo.pos !== 'absolute' && rotulo.largura < 300, JSON.stringify(rotulo));

  // ------------------------------------------------------------------
  console.log('\nTROCAR DE PRANCHA');
  baixados.length = 0;
  await p.click('.proj-item:nth-of-type(3)');   // Astrogildo · Pavimentação
  await p.waitForTimeout(1800);
  const trocado = await p.evaluate(() => ({
    sel: PROJ.sel,
    base: VISOR.base,
    sub: (document.querySelector('.proj-visor .card-title-sub') || {}).textContent || '',
    abrir: (document.querySelector('.proj-visor a[target=_blank]') || {}).getAttribute('href'),
  }));
  ok('o clique troca a prancha selecionada',
     trocado.sel === 'projetos/ruas-de-terra/astrogildo-pavimentacao.pdf', trocado.sel);
  ok('o visor passa a desenhar a pirâmide DELA',
     trocado.base === 'projetos/ruas-de-terra/astrogildo-pavimentacao/', trocado.base);
  ok('e os quadrados baixados são os dela',
     baixados.length > 0 && baixados.every(u => u.indexOf('/astrogildo-pavimentacao/') !== -1),
     baixados.slice(0, 3).join(' ; '));
  ok('o carimbo do cabeçalho acompanha', /CT-AP-101-1001-0G-DE/.test(trocado.sub), trocado.sub);
  ok('e Abrir/Baixar apontam para o PDF certo',
     trocado.abrir === 'projetos/ruas-de-terra/astrogildo-pavimentacao.pdf', trocado.abrir);

  // Voltar para outra prancha do mesmo grupo, para garantir que não é um
  // "funciona uma vez só".
  await p.click('.proj-item:nth-of-type(2)');   // Agrimensor · Drenagem
  await p.waitForTimeout(1500);
  ok('trocar de novo continua funcionando',
     await p.evaluate(() => VISOR.base === 'projetos/ruas-de-terra/agrimensor-drenagem/'),
     await p.evaluate(() => VISOR.base));

  // ------------------------------------------------------------------
  console.log('\nO PDF INTERNO FALA DA OBRA ABERTA');
  // Não se gera arquivo: intercepta-se o que o jsPDF escreveria na folha.
  const textos = await p.evaluate(async () => {
    await comLib('pdf', () => { }, 'o PDF do RDO');
    /* O espião entra no CONSTRUTOR, não no prototype: no jsPDF v2 os métodos
       da API não são propriedade própria do prototype, e trocá-los lá não
       chega ao `doc` que a função cria. */
    if (!window.__espiao) {
      window.__espiao = true;
      const Orig = window.jspdf.jsPDF;
      function Espiao() {
        const d = new Orig(...arguments);
        const escrever = d.text.bind(d);
        d.text = function (t) { window.__linhas.push(String(t)); return escrever.apply(null, arguments); };
        // nada de baixar no teste — mas o NOME do arquivo importa: dois
        // relatórios com o mesmo nome na pasta de downloads é o começo de
        // um ser mandado no lugar do outro.
        d.save = function (nome) { window.__salvou = true; window.__arquivo = nome || ''; };
        return d;
      }
      window.jspdf = Object.assign({}, window.jspdf, { jsPDF: Espiao });
    }
    window.__linhas = [];
    STATE.rdodiario = [{
      Data: '2026-09-10', Apontador_Diurno: 'Wallace', Apontador_Noturno: '',
      Clima_Manha: 'Bom', Clima_Tarde: 'Bom', Clima_Noite: 'Bom',
      Ocorrencias: '', Observacoes_Gerais: '', Visitas: '',
      Efetivo_JSON: '{}', Equipamentos_JSON: '{}',
    }];
    STATE.rdoavanco = [];
    if (typeof DIARIO_V4 !== 'undefined') DIARIO_V4 = null;
    await gerarPDFInterno('2026-09-10', 'diurno');
    return window.__linhas;
  });
  const cabecalho = textos.find(t => / · /.test(t) && /Gestor Engenharia/.test(t)) || '';
  ok('o PDF foi montado', textos.some(t => /RELATÓRIO DIÁRIO/.test(t)), textos.slice(0, 3).join(' | '));
  ok('o cabeçalho traz a obra ABERTA', /Ruas de Terra/.test(cabecalho), cabecalho);
  ok('e não a Teotônio', !/Teotônio/i.test(textos.join(' | ')),
     textos.filter(t => /Teotônio/i.test(t)).join(' | '));

  // E na Teotônio o texto continua o que sempre foi.
  const teot = await p.evaluate(async () => {
    trocarObra('teotonio');
    await new Promise(r => setTimeout(r, 400));
    window.__linhas = [];
    STATE.rdodiario = [{
      Data: '2026-09-10', Apontador_Diurno: 'Wallace', Apontador_Noturno: '',
      Clima_Manha: 'Bom', Clima_Tarde: 'Bom', Clima_Noite: 'Bom',
      Ocorrencias: '', Observacoes_Gerais: '', Visitas: '',
      Efetivo_JSON: '{}', Equipamentos_JSON: '{}',
    }];
    STATE.rdoavanco = [];
    if (typeof DIARIO_V4 !== 'undefined') DIARIO_V4 = null;
    await gerarPDFInterno('2026-09-10', 'diurno');
    return window.__linhas.find(t => /Gestor Engenharia/.test(t)) || '';
  });
  ok('na Teotônio o cabeçalho segue idêntico ao que era',
     teot === 'Av. Senador Teotônio Vilela · Gestor Engenharia', teot);

  // ------------------------------------------------------------------
  console.log('\nQUEM ASSINA O RDO É DE QUEM É A OBRA');
  // A supervisão é um campo do CADASTRO (`rdo.supervisao`), como o objeto e a
  // fiscalização. Obra que não a declara não pode ganhar um quadro de
  // assinatura em branco na folha — nem herdar a supervisão da avenida.
  const assinam = await p.evaluate(async () => {
    const daTeotonio = rdoTitulosAssinatura();   // a Teotônio está aberta aqui
    trocarObra('ruas-de-terra');
    await new Promise(r => setTimeout(r, 400));
    return { daTeotonio, dasRuas: rdoTitulosAssinatura() };
  });
  ok('a Teotônio assina em três: contratada, fiscalização e supervisão',
     assinam.daTeotonio.length === 3 && /SUPERVISÃO \(SP OBRAS\)/.test(assinam.daTeotonio[2]),
     JSON.stringify(assinam.daTeotonio));
  ok('obra que não declara supervisão continua assinando em dois',
     assinam.dasRuas.length === 2, JSON.stringify(assinam.dasRuas));
  ok('e nenhum quadro das Ruas de Terra fala da supervisão da avenida',
     !assinam.dasRuas.some(t => /SUPERVIS|SP OBRAS/.test(t)), JSON.stringify(assinam.dasRuas));

  // ------------------------------------------------------------------
  console.log('\nOS OUTROS PAPÉIS TAMBÉM FALAM DA OBRA ABERTA');
  // O Relatório Executivo é o que vai para a diretoria. Sai da mesma obra
  // aberta, e o nome do arquivo tem de dizer de qual obra ele é — dois
  // relatórios com o mesmo nome na pasta de downloads é o começo de um ser
  // mandado no lugar do outro.
  const exec = await p.evaluate(async () => {
    trocarObra('ruas-de-terra');
    await new Promise(r => setTimeout(r, 400));
    STATE.cargaFalhou = false; STATE.loaded = true;
    navigate('executivo');
    await new Promise(r => setTimeout(r, 800));
    window.__linhas = [];
    window.__arquivo = '';
    await exportarRelatorioExecutivoPDF();
    return { linhas: window.__linhas, arquivo: window.__arquivo };
  });
  ok('a capa do Relatório Executivo nomeia a obra aberta',
     exec.linhas.some(t => /RUAS DE TERRA.*PAINEL EXECUTIVO/i.test(t)),
     (exec.linhas.find(t => /PAINEL EXECUTIVO/i.test(t)) || '(não achei)'));
  ok('o rodapé de todas as páginas também',
     exec.linhas.some(t => /Ruas de Terra.*Relatório Gerencial/i.test(t)),
     (exec.linhas.find(t => /Relatório Gerencial/i.test(t)) || '(não achei)'));
  ok('e nada nele fala da Teotônio',
     !exec.linhas.some(t => /Teotônio/i.test(t)),
     exec.linhas.filter(t => /Teotônio/i.test(t)).join(' | '));
  ok('o arquivo é nomeado pela obra, não pela Teotônio',
     /^Relatorio_Executivo_ruas-de-terra_/.test(exec.arquivo || ''), exec.arquivo);

  // O Analista IA descrevia a obra no próprio prompt. Com o texto fixo, a
  // recomendação saía falando de duplicação viária numa obra de rua de terra.
  await p.evaluate(async () => {
    localStorage.setItem('teotonio_gemini_key', 'chave-de-teste');
    await refreshIA();
  });
  await p.waitForTimeout(1200);
  ok('o Analista IA foi chamado', !!promptIA, promptIA.slice(0, 60));
  ok('e o prompt descreve a obra ABERTA', /Ruas de Terra/.test(promptIA),
     promptIA.split('\n')[0].slice(0, 160));
  ok('e não manda a IA opinar sobre a duplicação da avenida',
     !/Teot[oô]nio|duplica/i.test(promptIA.split('\n')[0]),
     promptIA.split('\n')[0].slice(0, 160));

  // ------------------------------------------------------------------
  console.log('\nO QUE NÃO PODE ACONTECER');
  ok('nenhum erro de página', erros.length === 0, erros.slice(0, 4).join(' ; '));

  await b.close();
  srv.kill();
  console.log(falhas ? `\n${falhas} falha(s).` : '\nTudo certo.');
  process.exit(falhas ? 1 : 0);
})();
