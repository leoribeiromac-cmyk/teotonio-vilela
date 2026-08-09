// HARNESS COMPARTILHADO — sobe o app de verdade no Chromium com a planilha
// e o Apps Script FALSOS, para forçar o app em cenários que a obra ainda não
// viveu (volume, dados sujos, rede ruim, offline).
//
// Uso:
//   const H = require('./harness.js');
//   const s = await H.abrir({ pacotes: H.gerarPacotes(40), rdo: H.gerarRDO({linhas: 20000}) });
//   await s.p.evaluate(() => navigate('executivo'));
//   ...
//   await s.fechar();
//
// Pré-requisito: `python3 -m http.server 8099` rodando na raiz do repositório.

// o playwright está instalado na raiz do repositório
const { chromium } = require('playwright');
const { execSync, spawn } = require('child_process');
const http = require('http');

/* O sandbox recolhe processos de fundo entre turnos, então o servidor
   estático da porta 8099 morre sozinho de tempos em tempos. Em vez de
   exigir que cada agente se lembre de religá-lo, o harness confere e
   sobe de novo — é a diferença entre um cenário que falha e um que roda. */
function _servidorNoAr(porta = 8099, ms = 800) {
  return new Promise(resolve => {
    const req = http.get({ host: '127.0.0.1', port: porta, path: '/index.html', timeout: ms },
      res => { res.resume(); resolve(res.statusCode === 200); });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

async function garantirServidor(porta = 8099) {
  if (await _servidorNoAr(porta)) return true;
  spawn('python3', ['-m', 'http.server', String(porta)],
    { cwd: '/home/user/teotonio-vilela', detached: true, stdio: 'ignore' }).unref();
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 300));
    if (await _servidorNoAr(porta)) return true;
  }
  throw new Error('Não consegui subir o servidor estático em ' + porta);
}

const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const BASE = 'http://localhost:8099/index.html';

const GID = {
  cronograma: '565093066', pacotes: '386002450', coeficientes: '1962881430',
  rdoavanco: '1906961773', rdodiario: '1234324544',
};

const csvEsc = v => /[",\r\n]/.test(String(v)) ? '"' + String(v).replace(/"/g, '""') + '"' : String(v);
const linha = arr => arr.map(csvEsc).join(',');
const csv = rows => rows.map(linha).join('\r\n');
// número no formato que o CSV pt-BR entrega (vírgula decimal)
const pt = n => String(n).replace('.', ',');

// ----------------------------------------------------------- geradores
const FRENTES = ['Pav. Flexível', 'Drenagem', 'Terraplanagem', 'Sinalização', 'Muros de Contenção', 'Urbanismo'];

function gerarPacotes(n = 36, opts = {}) {
  const head = ['ID', 'Frente', 'Pacote', 'Unidade Física', 'Qtd Estimada', 'Produtividade', 'Status', 'Observação'];
  const rows = [head];
  for (let i = 1; i <= n; i++) {
    const id = 'P' + String(i).padStart(2, '0');
    rows.push([id, FRENTES[i % FRENTES.length], 'Serviço ' + i, ['m²', 'm³', 'm', 'un'][i % 4],
      pt(1000 + i * 137.5), opts.semProdutividade ? '' : pt(10 + (i % 30)),
      'Ativo', i % 5 === 0 ? 'Est. ' + (100 + i) + '+10 a ' + (105 + i) : '']);
  }
  return csv(rows);
}

function gerarCoeficientes(nPacotes = 36, porPacote = 3) {
  const head = ['Pacote ID', 'Pacote Nome', 'Item Contratual', 'Descrição Item', 'Unid Item', 'Coef', 'Unid Coef', 'Tipo'];
  const rows = [head];
  for (let i = 1; i <= nPacotes; i++) {
    const id = 'P' + String(i).padStart(2, '0');
    for (let j = 0; j < porPacote; j++) {
      rows.push([id, 'Serviço ' + i, String(4 + j).padStart(2, '0') + '-11-00',
        'Item contratual ' + i + '.' + j, 'M3', pt(0.1 + j * 0.05), 'm³/m²', 'Manual']);
    }
  }
  return csv(rows);
}

// linhas: quantas. dias: em quantos dias distribuir. pacotes: quantos IDs usar.
function gerarRDO({ linhas = 1000, dias = 400, pacotes = 36, obra = 'teotonio', comFoto = 0 } = {}) {
  const head = ['id', 'Data', 'Pacote_ID', 'Quantidade', 'Local_Estaca', 'Equipe', 'Apontador',
    'Turno', 'Observações', 'foto_link', 'usuario', 'timestamp', 'obra'];
  const rows = [head];
  const d0 = new Date('2025-01-06T00:00:00Z');
  for (let i = 0; i < linhas; i++) {
    const d = new Date(d0.getTime() + (i % dias) * 86400000);
    const iso = d.toISOString().slice(0, 10);
    const pid = 'P' + String((i % pacotes) + 1).padStart(2, '0');
    const est = 'E' + (100 + (i % 42)) + '+' + (i % 20);
    rows.push(['r' + i, iso, pid, pt(((i % 37) + 1) * 2.5), est, 'Equipe ' + (i % 4),
      ['Wallace', 'Guilherme', 'Leonardo'][i % 3], i % 7 === 0 ? 'Noturno' : 'Diurno',
      i % 11 === 0 ? 'Observação com ; ponto-e-vírgula e "aspas"' : '',
      i < comFoto ? 'drive_id:fake' + i : '', ['Wallace', 'Guilherme', 'Leonardo'][i % 3],
      iso + 'T12:00:00Z', obra]);
  }
  return csv(rows);
}

function gerarDiario({ linhas = 200, obra = 'teotonio' } = {}) {
  const head = ['id', 'Data', 'Turno', 'Clima_Manha', 'Clima_Tarde', 'Clima_Noite',
    'Efetivo', 'Equipamentos', 'Ocorrencias', 'Servicos', 'Apontador', 'obra'];
  const rows = [head];
  const d0 = new Date('2025-01-06T00:00:00Z');
  for (let i = 0; i < linhas; i++) {
    const iso = new Date(d0.getTime() + i * 86400000).toISOString().slice(0, 10);
    rows.push(['d' + i, iso, i % 5 === 0 ? 'Noturno' : 'Diurno', 'Bom', 'Chuva', 'Bom',
      'Pedreiro: 4\nServente: 8', 'Retroescavadeira: 1', '', 'Execução de base', 'Wallace', obra]);
  }
  return csv(rows);
}

function gerarCronograma({ linhas = 300 } = {}) {
  const head = ['Nivel', 'EDT', 'Nome da tarefa', 'Duração', 'Início', 'Término', '% concluída', 'Pacote_ID'];
  const rows = [head, ['0', '1', 'OBRA COMPLETA', '669 dias', '09/05/2024', '08/03/2026', '45%', '']];
  for (let i = 1; i < linhas; i++) {
    const ini = new Date(Date.UTC(2024, 4, 9) + i * 4 * 86400000);
    const fim = new Date(ini.getTime() + 30 * 86400000);
    const br = d => String(d.getUTCDate()).padStart(2, '0') + '/' + String(d.getUTCMonth() + 1).padStart(2, '0') + '/' + d.getUTCFullYear();
    rows.push([String(1 + (i % 3)), '1.' + i, 'Tarefa ' + i, '30 dias', br(ini), br(fim),
      (i % 101) + '%', i % 4 === 0 ? 'P' + String((i % 36) + 1).padStart(2, '0') : '']);
  }
  return csv(rows);
}

// ----------------------------------------------------------- abrir o app
/**
 * opts:
 *   pacotes, coeficientes, rdo, diario, cronograma  — string CSV (ou função → string)
 *   gas          — (acao, params) => objeto de resposta JSONP (default {ok:true})
 *   atrasoCSV    — ms de atraso antes de responder cada CSV
 *   atrasoGAS    — ms de atraso antes de responder cada JSONP
 *   falharCSV    — true → todos os CSVs respondem 500
 *   viewport     — {width,height}; celular: {width:390,height:844}
 *   mobile       — true → viewport de celular + isMobile/touch
 *   logar        — {usuario,perfil} → faz login antes de devolver
 *   offline      — true → context.setOffline(true) logo após a carga
 *   cpuThrottle  — fator (ex. 4) via CDP
 *   redeLenta    — 'lenta3g' | 'off' — via CDP Network.emulateNetworkConditions
 */
async function abrir(opts = {}) {
  await garantirServidor(8099);
  const b = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
  const ctx = await b.newContext(Object.assign(
    opts.mobile
      ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 }
      : { viewport: opts.viewport || { width: 1440, height: 950 } },
    { permissions: [] }));
  const p = await ctx.newPage();

  const erros = [];      // pageerror + console.error
  const avisos = [];     // console.warn
  const chamadas = [];   // ações enviadas ao Apps Script
  p.on('pageerror', e => erros.push('PAGEERROR: ' + e.message));
  p.on('console', m => {
    const t = m.text();
    if (m.type() === 'error' && !/Failed to load resource|net::|favicon/.test(t)) erros.push('CONSOLE: ' + t);
    if (m.type() === 'warning') avisos.push('WARN: ' + t);
  });

  const dados = {
    [GID.pacotes]: opts.pacotes !== undefined ? opts.pacotes : gerarPacotes(36),
    [GID.coeficientes]: opts.coeficientes !== undefined ? opts.coeficientes : gerarCoeficientes(36),
    [GID.rdoavanco]: opts.rdo !== undefined ? opts.rdo : gerarRDO({ linhas: 500 }),
    [GID.rdodiario]: opts.diario !== undefined ? opts.diario : gerarDiario({ linhas: 100 }),
    [GID.cronograma]: opts.cronograma !== undefined ? opts.cronograma : gerarCronograma({ linhas: 120 }),
  };

  await p.route('**://docs.google.com/**', async route => {
    if (opts.atrasoCSV) await new Promise(r => setTimeout(r, opts.atrasoCSV));
    if (opts.falharCSV) return route.fulfill({ status: 500, body: 'erro' });
    const gid = new URL(route.request().url()).searchParams.get('gid');
    const corpo = dados[gid];
    route.fulfill({ status: 200, contentType: 'text/csv', body: corpo === undefined ? '' : corpo });
  });

  await p.route('**://script.google.com/**', async route => {
    const u = new URL(route.request().url());
    const acao = u.searchParams.get('action');
    const cb = u.searchParams.get('callback');
    const params = {};
    u.searchParams.forEach((v, k) => { params[k] = v; });
    chamadas.push({ acao, params, url: u.toString(), tamanho: u.toString().length });
    if (opts.atrasoGAS) await new Promise(r => setTimeout(r, opts.atrasoGAS));
    let corpo;
    if (opts.gas) corpo = await opts.gas(acao, params);
    else if (acao === 'usuariosNomes') corpo = { ok: true, usuarios: ['Leonardo', 'Wallace', 'Guilherme'] };
    else if (acao === 'login') corpo = { ok: true, usuario: params.usuario, perfil: 'admin', token: 'tok-falso', obras: '*' };
    else corpo = { ok: true };
    if (corpo === null) return route.abort();           // simula rede caindo
    route.fulfill({ status: 200, contentType: 'application/javascript', body: `${cb}(${JSON.stringify(corpo)})` });
  });

  // qualquer outra saída externa morre — o app não deve depender de nada fora
  await p.route('**://*.googleapis.com/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));

  const cdp = await ctx.newCDPSession(p);
  if (opts.cpuThrottle) await cdp.send('Emulation.setCPUThrottlingRate', { rate: opts.cpuThrottle });
  if (opts.redeLenta === 'lenta3g') {
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false, downloadThroughput: 400 * 1024 / 8, uploadThroughput: 400 * 1024 / 8, latency: 400,
    });
  }

  const t0 = Date.now();
  await p.goto(BASE, { waitUntil: 'load' });
  const tLoad = Date.now() - t0;
  // ATENÇÃO: `const STATE` no topo do <script> NÃO vira window.STATE — const/let
  // de topo de script ficam no escopo léxico global, não no objeto global. Testar
  // `window.STATE` dá sempre undefined e o waitForFunction estoura o tempo em
  // silêncio. A referência tem de ser NUA, protegida por typeof.
  await p.waitForFunction(() => typeof STATE !== 'undefined', null, { timeout: 30000 }).catch(() => {});

  if (opts.logar) {
    await p.evaluate(async (u) => {
      localStorage.setItem('teotonio_user', u.usuario || 'Leonardo');
      localStorage.setItem('teotonio_perfil_v1', u.perfil || 'admin');
      localStorage.setItem('teotonio_token_v1', 'tok-falso');
    }, opts.logar);
    await p.reload({ waitUntil: 'load' });
  }

  // espera a primeira carga terminar (STATE.loaded) — sem travar para sempre
  let carregou = true;
  const tc0 = Date.now();
  await p.waitForFunction(() => typeof STATE !== 'undefined' && STATE.loaded === true, null, { timeout: 60000 })
    .catch(() => { carregou = false; /* pode ser cenário de falha proposital */ });
  const tCarga = Date.now() - tc0;

  if (opts.offline) await ctx.setOffline(true);

  return {
    b, ctx, p, cdp, erros, avisos, chamadas, tLoad, tCarga, carregou,
    async ir(pagina) { await p.evaluate(pg => navigate(pg), pagina); await p.waitForTimeout(120); },
    // mede o tempo de uma ação dentro da página
    async medir(nome, fn) { const t = Date.now(); await fn(); return { nome, ms: Date.now() - t }; },
    async metricasMemoria() {
      return p.evaluate(() => (performance.memory
        ? { usadoMB: +(performance.memory.usedJSHeapSize / 1048576).toFixed(1),
            limiteMB: +(performance.memory.jsHeapSizeLimit / 1048576).toFixed(1) } : null));
    },
    async nosDOM() { return p.evaluate(() => document.getElementsByTagName('*').length); },
    async fechar() { await b.close(); },
  };
}

module.exports = {
  abrir, garantirServidor, GID, csv, linha, csvEsc, pt, CHROME, BASE,
  gerarPacotes, gerarCoeficientes, gerarRDO, gerarDiario, gerarCronograma,
};
