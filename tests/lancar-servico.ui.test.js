// O LANÇAR SERVIÇO NÃO PERDE NEM DUPLICA — no app de verdade.
//
// 1. Serviço com estaca e quantidade, mas sem pacote, era descartado calado:
//    o salvar subia só os serviços com pacote e depois LIMPAVA o formulário.
//    Agora o envio é barrado e o formulário fica como está.
// 2. O serviço recém-salvo sumia até o CSV publicado alcançá-lo (minutos), e
//    o apontador o lançava de novo — duplicata na medição. Agora ele aparece
//    na hora (`_LANCADOS_LOCAL`), e salvar o mesmo serviço de novo é
//    reconhecido como "já lançado".
//
// Como rodar:  node tests/lancar-servico.ui.test.js
const { abrir } = require('./harness');

let falhas = 0;
const ok = (n, c, e) => { if (c) console.log('  ✓ ' + n); else { falhas++; console.log('  ✗ ' + n + (e !== undefined ? '  → ' + e : '')); } };

(async () => {
  const s = await abrir({
    logar: { usuario: 'Leonardo', perfil: 'admin' },
    gas: (acao, params) => {
      if (acao === 'usuariosNomes') return { ok: true, usuarios: ['Leonardo', 'Wallace'] };
      if (acao === 'login') return { ok: true, usuario: params.usuario, perfil: 'admin', token: 'tok-falso', obras: '*' };
      if (acao === 'addBatchRDO') return { ok: true, inserted: JSON.parse(params.batch || '[]').length };
      return { ok: true };
    },
  });
  const { p } = s;
  const lotes = () => s.chamadas.filter(c => c.acao === 'addBatchRDO');
  await s.ir('rdo');
  await p.waitForTimeout(600);

  const montar = (comPacote) => p.evaluate((cp) => {
    const eixo = eixoPadrao();
    const fx = eixoPorId(eixo);
    const pac = STATE.pacotes[0];
    STATE.draft.apontador = 'Wallace';
    STATE.draft.turno = 'Diurno';
    STATE.draft.servicos = [{
      frente: cp ? getCSVField(pac, 'Frente') : '', pacoteId: cp ? getCSVField(pac, 'ID') : '',
      sentido: eixo, estacaIni: 'E' + fx.ini, estacaFim: 'E' + (fx.ini + 1), lado: '',
      quantidade: '7', area: '', espCm: '', equipe: 'Equipe teste', observacao: '' }];
    STATE.draft.outrosServicos = [];
    window.confirm = () => true;
  }, comPacote);

  console.log('SERVIÇO SEM PACOTE NÃO SOME CALADO');
  await montar(false);
  await p.evaluate(() => salvarRDO());
  await p.waitForTimeout(600);
  ok('o envio é barrado', lotes().length === 0, lotes().length + ' lote(s)');
  const aviso = await p.evaluate(() => [...document.querySelectorAll('.toast .toast-msg')].map(e => e.textContent).join(' | '));
  ok('e o aviso diz para escolher o pacote', /escolha o pacote/i.test(aviso), aviso.slice(0, 160));
  ok('o que foi digitado continua no formulário', await p.evaluate(() =>
    STATE.draft.servicos.length === 1 && STATE.draft.servicos[0].quantidade === '7'));

  console.log('\nO SERVIÇO SALVO APARECE NA HORA, E NÃO É LANÇADO DE NOVO');
  await montar(true);
  const antes = await p.evaluate(() => STATE.rdoavanco.length);
  await p.evaluate(() => salvarRDO());
  await p.waitForTimeout(1500);
  ok('o lote subiu', lotes().length === 1, lotes().length + ' lote(s)');
  ok('o serviço já está na lista do aparelho (o CSV ainda não o viu)',
     await p.evaluate(() => STATE.rdoavanco.length) === antes + 1,
     (await p.evaluate(() => STATE.rdoavanco.length)) + ' × ' + (antes + 1));
  // o refresh de fundo traz o CSV de antes (sem o serviço): ele continua ali
  await p.evaluate(() => carregarTudo({ fundo: true }));
  await p.waitForTimeout(1500);
  ok('e continua lá depois de uma carga que ainda não o traz',
     await p.evaluate(() => STATE.rdoavanco.length) === antes + 1,
     (await p.evaluate(() => STATE.rdoavanco.length)) + ' × ' + (antes + 1));
  // o apontador, sem ver o serviço, lança o mesmo de novo
  await p.evaluate(() => { STATE.currentPage = 'executivo'; navigate('rdo'); });
  await p.waitForTimeout(600);
  await montar(true);
  let perguntou = '';
  await p.exposeFunction('__pergunta', m => { perguntou = m; });
  await p.evaluate(() => { window.confirm = (m) => { window.__pergunta(m); return false; }; });
  await p.evaluate(() => salvarRDO());
  await p.waitForTimeout(800);
  ok('salvar o mesmo serviço de novo é reconhecido como já lançado', /J[AÁ] est[aã]o lan[cç]ados/i.test(perguntou),
     perguntou.slice(0, 160));
  ok('e não sobe duplicata', lotes().length === 1, lotes().length + ' lote(s)');

  ok('nenhum erro de página', s.erros.length === 0, s.erros.join(' | '));
  await s.fechar();
  console.log(falhas ? `\n${falhas} falha(s)\n` : '\nTudo certo.\n');
  process.exit(falhas ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
