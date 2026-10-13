// O RELATÓRIO FOTOGRÁFICO CONTA AS FOTOS E NÃO MONTA DOIS DE UMA VEZ.
//
// Cada foto do relatório vem do Drive, uma por vez (1 a 3 s cada no 4G). O
// relatório do mês levava minutos com a tela parada, e quem tocava de novo,
// achando que não tinha pegado, montava dois ao mesmo tempo. Agora o aviso
// diz "foto N de M", o segundo toque espera o primeiro e relatório grande
// pergunta antes.
//
// Como rodar:  node tests/relatorio-fotografico.ui.test.js
const { abrir, gerarRDO } = require('./harness');

let falhas = 0;
const ok = (n, c, e) => { if (c) console.log('  ✓ ' + n); else { falhas++; console.log('  ✗ ' + n + (e !== undefined ? '  → ' + e : '')); } };

// JPEG 1×1 de verdade (o jsPDF lê o cabeçalho)
const JPEG = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP////////////////////////////////////////' +
  '//////////////////////////////////////////////wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAA' +
  'AAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==';

(async () => {
  const s = await abrir({
    logar: { usuario: 'Leonardo', perfil: 'admin' },
    rdo: gerarRDO({ linhas: 70, dias: 20, comFoto: 70 }),
    gas: async (acao, params) => {
      if (acao === 'usuariosNomes') return { ok: true, usuarios: ['Leonardo'] };
      if (acao === 'login') return { ok: true, usuario: params.usuario, perfil: 'admin', token: 'tok-falso', obras: '*' };
      if (acao === 'obterFoto') { await new Promise(r => setTimeout(r, 25)); return { ok: true, dataUri: JPEG, mini: params.mini === '1' }; }
      return { ok: true };
    },
  });
  const { p } = s;
  await s.ir('galeria');
  await p.waitForTimeout(800);
  const total = await p.evaluate(() => galeriaParaRelatorio().length);
  ok('(a galeria tem as 70 fotos)', total === 70, total);

  console.log('RELATÓRIO GRANDE PERGUNTA ANTES');
  await p.evaluate(() => { window.__perguntou = ''; window.confirm = (m) => { window.__perguntou = m; return false; }; });
  await p.evaluate(() => gerarRelatorioFotografico());
  await p.waitForTimeout(300);
  const pergunta = await p.evaluate(() => window.__perguntou);
  ok('com mais de 60 fotos, pergunta antes de montar', /70 fotos/.test(pergunta), pergunta.slice(0, 80));
  ok('e "Cancelar" não baixa nada', s.chamadas.filter(c => c.acao === 'obterFoto' && !c.params.mini).length === 0);

  console.log('\nO AVISO CONTA AS FOTOS, E O SEGUNDO TOQUE ESPERA');
  await p.evaluate(() => { window.confirm = () => true; });
  const baixou = p.waitForEvent('download', { timeout: 60000 }).catch(() => null);
  await p.evaluate(() => { window.__rel = gerarRelatorioFotografico(); });
  await p.waitForTimeout(700);
  const avisoMeio = await p.evaluate(() => [...document.querySelectorAll('.toast .toast-msg')].map(e => e.textContent).join(' | '));
  ok('enquanto monta, o aviso diz "foto N de 70"', /foto \d+ de 70/.test(avisoMeio), avisoMeio.slice(0, 120));
  await p.evaluate(() => gerarRelatorioFotografico());
  await p.waitForTimeout(200);
  const avisoDuplo = await p.evaluate(() => [...document.querySelectorAll('.toast .toast-msg')].map(e => e.textContent).join(' | '));
  ok('tocar de novo não monta outro: avisa para esperar', /ainda está sendo montado/.test(avisoDuplo), avisoDuplo.slice(0, 160));
  const arq = await baixou;
  await p.evaluate(() => window.__rel);
  ok('o relatório sai como arquivo', !!arq && /relatorio-fotografico-teotonio/.test(arq.suggestedFilename()),
     arq ? arq.suggestedFilename() : 'sem download');
  const depois = await p.evaluate(() => [...document.querySelectorAll('.toast .toast-msg')].map(e => e.textContent).join(' | '));
  ok('pronto, o aviso de progresso some', !/foto \d+ de 70/.test(depois), depois.slice(0, 160));
  ok('e cada foto foi pedida uma vez só',
     s.chamadas.filter(c => c.acao === 'obterFoto' && !c.params.mini).length <= 70,
     s.chamadas.filter(c => c.acao === 'obterFoto' && !c.params.mini).length);

  ok('nenhum erro de página', s.erros.length === 0, s.erros.join(' | '));
  await s.fechar();
  console.log(falhas ? `\n${falhas} falha(s)\n` : '\nTudo certo.\n');
  process.exit(falhas ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
