// CORRIGIR UM APONTAMENTO DE EQUIPAMENTO JÁ ENVIADO.
//
// Até aqui, hora de máquina lançada errada só tinha um conserto: APAGAR e
// lançar de novo. Isso custava o carimbo (a identidade da linha), o dono e a
// assinatura do operador — e, entre uma coisa e outra, a hora daquele
// equipamento sumia da medição. Errar o horário de fim é o engano mais comum
// do campo; não pode custar o registro inteiro.
//
// O que estes testes protegem:
//
//  • O APONTAMENTO VOLTA INTEIRO PARA O FORMULÁRIO. Campo que não volta é
//    campo que o apontador redigita — e redigitar é onde nasce o segundo erro.
//    Paradas e observações são texto montado no envio; a volta tem de desfazer
//    exatamente o caminho da ida.
//  • CORRIGIR NÃO É LANÇAR. A tela tem de dizer em que modo está: um
//    formulário preenchido é indistinguível de um lançamento novo, e essa
//    confusão vira hora de máquina cobrada duas vezes.
//  • A CORREÇÃO VAI PARA equipEditar, COM O CARIMBO. Se escapar como
//    equipApontar, a linha antiga fica de pé e nasce uma duplicata.
//  • A ASSINATURA DO ENVIO ORIGINAL NÃO SE PERDE. O que a planilha guarda é
//    um ponteiro do Drive; quem corrige o horímetro não vai reassinar.
//  • CORREÇÃO ABANDONADA NÃO SOBREVIVE À TELA. Sair e voltar tem de zerar o
//    modo — senão o próximo envio grava por cima de uma linha que ninguém
//    mais está vendo.
//
// Como rodar:  node tests/equip-editar.ui.test.js
//   (sobe o próprio servidor; não depende do 8099)
const { chromium } = require('playwright');
const { spawn } = require('child_process');

const RAIZ = '/home/user/teotonio-vilela';
const PORTA = 8127;
const BASE = 'http://localhost:' + PORTA;

let falhas = 0;
const ok = (n, c, e) => { if (c) console.log('  ✓ ' + n); else { falhas++; console.log('  ✗ ' + n + (e !== undefined ? '  → ' + e : '')); } };

const srv = spawn('python3', ['-m', 'http.server', String(PORTA)], { cwd: RAIZ, stdio: 'ignore' });
const encerrar = () => { try { srv.kill(); } catch (e) { } };
process.on('exit', encerrar);

const EQUIPS = [
  { nome: 'Escavadeira Hidráulica CAT 320', tipo: 'Linha Amarela', vinculo: 'Locado', locadora: 'Locarma', ativo: 'SIM' },
  { nome: 'Caminhão Basculante Mercedes 2726', tipo: 'Transporte', vinculo: 'Próprio', ativo: 'SIM' },
];

// O apontamento que será corrigido. `observacoes` e `paradas` estão no
// formato EXATO que o envio grava — é a ida que a edição tem de desfazer.
const ALVO = {
  carimbo: '1755000000000', data: '2026-07-14', turno: 'Diurno',
  equipamento: 'Escavadeira Hidráulica CAT 320', operador: 'Genilson Rocha',
  inicio: '07:00', fim: '17:00', horas: '9.00',
  paradas: 'Almoço 12:00-13:00',
  horimIni: '1200', horimFim: '1209', horimInicial: '1200', horimFinal: '1209',
  combustivel: '80', situacao: 'ManutencaoPreventiva', status: 'ManutencaoPreventiva',
  observacoes: '[Turno: Diurno] | Operação: 07:00 às 17:00 | Paradas: Almoço 12:00-13:00\nDetalhes: frente da Astrogildo',
  assinatura: 'drive_id:abc123', usuario: 'Leonardo', obra: 'ruas-de-terra',
};

// Um segundo, com equipamento que saiu do cadastro: corrigir a hora dele
// não pode ficar impossível porque a máquina foi desativada depois.
const ALVO_FORA = Object.assign({}, ALVO, {
  carimbo: '1755000000001', equipamento: 'Motoniveladora que saiu do cadastro',
  // De propósito NO FORMATO DO LEGADO: a planilha da Teotônio devolve a
  // célula como Date serializado, e o <input type=date> recusa isso.
  data: '2026-07-15T03:00:00.000Z', paradas: '', assinatura: '',
  observacoes: '[Turno: Diurno] | Operação: 07:00 às 17:00 | Paradas: Sem paradas\nDetalhes: Sem detalhes adicionais.',
});

/* Lê um multipart/form-data como o navegador manda — é o corpo do POST que
   diz o que de fato saiu do aparelho. */
function camposDoPost(corpo) {
  const out = {};
  String(corpo || '').split(/------[^\r\n]*/).forEach(parte => {
    const m = parte.match(/name="([^"]+)"\r?\n\r?\n([\s\S]*?)\r?\n$/);
    if (m) out[m[1]] = m[2];
  });
  return out;
}

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

  const posts = [];   // { acao, campos }
  await ctx.route('**script.google*.com/**', async rota => {
    const req = rota.request();
    const u = new URL(req.url());
    const cb = u.searchParams.get('callback');
    let acao = u.searchParams.get('action') || '';
    if (req.method() === 'POST') {
      const campos = camposDoPost(req.postData());
      acao = campos.action || acao;
      posts.push({ acao, campos });
    }
    let c = { ok: true };
    if (acao === 'login') c = { ok: true, usuario: 'Leonardo', perfil: 'admin', token: 't', obras: '*' };
    else if (acao === 'usuariosNomes') c = { ok: true, usuarios: ['Leonardo'] };
    else if (acao === 'equipListar') c = { ok: true, equipamentos: EQUIPS, locadoras: [] };
    else if (acao === 'equipUltimos' || acao === 'equipApontamentos') c = { ok: true, apontamentos: [ALVO, ALVO_FORA] };
    await rota.fulfill({ status: 200, contentType: 'application/javascript',
                         body: cb ? `${cb}(${JSON.stringify(c)})` : JSON.stringify(c) });
  });
  await ctx.route('**docs.google.com/**', r => r.fulfill({ status: 200, contentType: 'text/csv', body: '' }));

  await p.goto(BASE + '/index.html', { waitUntil: 'load' });
  await p.waitForTimeout(1000);
  await p.evaluate(() => navigate('rdo'));
  await p.waitForSelector('#loginBtn', { timeout: 15000 });
  await p.evaluate(async () => {
    (document.getElementById('loginUser') || document.getElementById('loginUserSelect')).value = 'Leonardo';
    document.getElementById('loginPass').value = 'x';
    await fazerLogin();
  });
  await p.waitForTimeout(600);
  // A obra é a das Ruas de Terra: é ela que fala com o backend principal
  // (Code.gs), o único que sabe editar. A Teotônio segue no Apps Script legado.
  await p.evaluate(() => trocarObra('ruas-de-terra'));
  await p.waitForTimeout(900);
  await p.evaluate(() => navigate('equip'));
  await p.waitForSelector('#apontamentoForm', { timeout: 15000 });
  await p.waitForTimeout(600);

  // ------------------------------------------------------------------
  console.log('\nA LISTA DE ÚLTIMOS');
  await p.evaluate(() => EQ.abrirUltimos());
  await p.waitForTimeout(800);
  const nEditar = await p.$$eval('.btn-editar-apont', e => e.length);
  const nApagar = await p.$$eval('.btn-apagar-apont', e => e.length);
  ok('cada apontamento ganha um botão de corrigir', nEditar === 2, nEditar);
  ok('e o de apagar continua onde estava', nApagar === 2, nApagar);

  // ------------------------------------------------------------------
  console.log('\nO APONTAMENTO VOLTA PARA O FORMULÁRIO');
  await p.click('.btn-editar-apont');
  await p.waitForTimeout(700);

  const f = await p.evaluate(() => ({
    data: document.getElementById('data').value,
    turno: document.getElementById('turno').value,
    equip: document.getElementById('equipamento').value,
    operador: document.getElementById('operador').value,
    inicio: document.getElementById('inicio').value,
    fim: document.getElementById('fim').value,
    hi: document.getElementById('horimInicial').value,
    hf: document.getElementById('horimFinal').value,
    comb: document.getElementById('combustivel').value,
    status: document.getElementById('status').value,
    obs: document.getElementById('observacoesUI').value,
    horas: document.getElementById('horas').value,
    paradas: [...document.querySelectorAll('#paradasList .parada-row')].map(r =>
      r.querySelector('.parada-motivo').value + ' ' +
      r.querySelector('.parada-inicio').value + '-' + r.querySelector('.parada-fim').value),
    modalFechado: getComputedStyle(document.getElementById('ultimosModal')).display === 'none',
  }));
  ok('a data volta', f.data === '2026-07-14', f.data);
  ok('o turno volta', f.turno === 'Diurno', f.turno);
  ok('o equipamento volta', f.equip === ALVO.equipamento, f.equip);
  ok('o operador volta', f.operador === 'Genilson Rocha', f.operador);
  ok('início e fim voltam', f.inicio === '07:00' && f.fim === '17:00', f.inicio + '–' + f.fim);
  ok('o horímetro volta', f.hi === '1200' && f.hf === '1209', f.hi + '→' + f.hf);
  ok('o combustível volta', f.comb === '80', f.comb);
  ok('a situação volta', f.status === 'ManutencaoPreventiva', f.status);
  ok('a parada volta como linha de formulário, não como texto',
     f.paradas.length === 1 && f.paradas[0] === 'Almoço 12:00-13:00', JSON.stringify(f.paradas));
  ok('só os DETALHES do apontador voltam para observações (não o cabeçalho montado)',
     f.obs === 'frente da Astrogildo', JSON.stringify(f.obs));
  ok('as horas são recalculadas com a parada descontada', f.horas === '9.00', f.horas);
  ok('o modal de Últimos sai da frente', f.modalFechado);

  // ------------------------------------------------------------------
  console.log('\nA TELA DIZ QUE ESTÁ CORRIGINDO');
  const modo = await p.evaluate(() => ({
    faixa: getComputedStyle(document.getElementById('eqEdicaoFaixa')).display,
    alvo: document.getElementById('eqEdicaoAlvo').textContent,
    btn: document.getElementById('btnText').textContent,
    assin: document.getElementById('assinaturaEstado').textContent,
  }));
  ok('a faixa de correção aparece', modo.faixa !== 'none', modo.faixa);
  ok('e diz QUAL apontamento está sendo corrigido',
     /Escavadeira/.test(modo.alvo) && /14\/07\/2026/.test(modo.alvo), modo.alvo);
  ok('o botão deixa de dizer "enviar"', /correção/i.test(modo.btn), modo.btn);
  ok('e a assinatura do envio original é anunciada como mantida',
     /mantida/i.test(modo.assin), modo.assin);

  // ------------------------------------------------------------------
  console.log('\nSALVAR VAI PARA equipEditar, NÃO PARA equipApontar');
  posts.length = 0;
  await p.evaluate(() => {
    document.getElementById('fim').value = '16:00';
    EQ.calcularHoras();
    document.getElementById('apontamentoForm').requestSubmit();
  });
  await p.waitForTimeout(500);
  const conf = await p.evaluate(() => ({
    titulo: document.getElementById('cfTitulo').textContent,
    botao: document.getElementById('cfBotao').textContent,
    assin: document.getElementById('cfAssin').textContent,
    horas: document.getElementById('cfHoras').textContent,
  }));
  ok('a confirmação fala em salvar, não em enviar', /salvar/i.test(conf.titulo + conf.botao), conf.titulo + ' / ' + conf.botao);
  ok('e não anuncia "sem assinatura" quando existe uma no Drive', /assinada/i.test(conf.assin), conf.assin);
  ok('as horas conferidas são as recalculadas', /8\.00/.test(conf.horas), conf.horas);

  await p.evaluate(() => EQ.confirmarEnvio());
  await p.waitForTimeout(900);

  const editar = posts.find(x => x.acao === 'equipEditar');
  ok('a correção sai como equipEditar', !!editar, JSON.stringify(posts.map(x => x.acao)));
  ok('e NÃO como um lançamento novo', !posts.some(x => x.acao === 'equipApontar'), JSON.stringify(posts.map(x => x.acao)));
  ok('e nenhum apagar foi disparado no caminho', !posts.some(x => x.acao === 'equipApagar'), JSON.stringify(posts.map(x => x.acao)));
  if (editar) {
    const c = editar.campos;
    ok('leva o carimbo da linha a corrigir', c.carimbo === ALVO.carimbo, c.carimbo);
    ok('leva o horário corrigido', c.fim === '16:00', c.fim);
    ok('leva as horas recalculadas', c.horas === '8.00', c.horas);
    ok('leva a obra', c.obra === 'ruas-de-terra', c.obra);
    ok('reenvia a assinatura que já estava no Drive', c.assinatura === 'drive_id:abc123', c.assinatura);
    ok('e NÃO leva clientId — a chave da correção é o carimbo', c.clientId === undefined, c.clientId);
  }

  // ------------------------------------------------------------------
  console.log('\nDEPOIS DE SALVAR, A TELA VOLTA A SER DE LANÇAMENTO');
  const depois = await p.evaluate(() => ({
    faixa: getComputedStyle(document.getElementById('eqEdicaoFaixa')).display,
    btn: document.getElementById('btnText').textContent,
    operador: document.getElementById('operador').value,
  }));
  ok('a faixa some', depois.faixa === 'none', depois.faixa);
  ok('o botão volta a dizer "Enviar apontamento"', depois.btn === 'Enviar apontamento', depois.btn);
  ok('e o formulário fica limpo', depois.operador === '', JSON.stringify(depois.operador));

  // ------------------------------------------------------------------
  console.log('\nCANCELAR A CORREÇÃO');
  await p.evaluate(() => EQ.abrirUltimos());
  await p.waitForTimeout(700);
  await p.click('.btn-editar-apont');
  await p.waitForTimeout(600);
  await p.evaluate(() => EQ.cancelarEdicao());
  await p.waitForTimeout(300);
  const cancelado = await p.evaluate(() => ({
    faixa: getComputedStyle(document.getElementById('eqEdicaoFaixa')).display,
    btn: document.getElementById('btnText').textContent,
    operador: document.getElementById('operador').value,
    paradas: document.querySelectorAll('#paradasList .parada-row').length,
  }));
  ok('cancelar apaga o modo de correção', cancelado.faixa === 'none', cancelado.faixa);
  ok('e devolve o botão de enviar', cancelado.btn === 'Enviar apontamento', cancelado.btn);
  ok('e limpa o que tinha sido carregado', cancelado.operador === '' && cancelado.paradas === 0,
     cancelado.operador + ' / ' + cancelado.paradas);

  // ------------------------------------------------------------------
  console.log('\nEQUIPAMENTO QUE SAIU DO CADASTRO');
  await p.evaluate(() => EQ.abrirUltimos());
  await p.waitForTimeout(700);
  await p.evaluate(() => document.querySelectorAll('.btn-editar-apont')[1].click());
  await p.waitForTimeout(600);
  const fora = await p.evaluate(() => ({
    valor: document.getElementById('equipamento').value,
    rotulo: (document.getElementById('equipamento').selectedOptions[0] || {}).textContent || '',
    data: document.getElementById('data').value,
  }));
  ok('a máquina desativada ainda pode ser corrigida', fora.valor === ALVO_FORA.equipamento, fora.valor);
  ok('e a tela avisa que ela não está mais no cadastro', /fora do cadastro/i.test(fora.rotulo), fora.rotulo);
  ok('e a data do backend legado (Date serializado) entra no campo, em vez de sumir',
     fora.data === '2026-07-15', fora.data);

  // ------------------------------------------------------------------
  console.log('\nCORREÇÃO ABANDONADA NÃO ATRAVESSA A TELA');
  await p.evaluate(() => navigate('executivo'));
  await p.waitForTimeout(700);
  await p.evaluate(() => navigate('equip'));
  await p.waitForSelector('#apontamentoForm', { timeout: 10000 });
  await p.waitForTimeout(600);
  const revolta = await p.evaluate(() => ({
    faixa: getComputedStyle(document.getElementById('eqEdicaoFaixa')).display,
    btn: document.getElementById('btnText').textContent,
  }));
  ok('sair e voltar cancela a correção pendurada', revolta.faixa === 'none', revolta.faixa);
  ok('e o botão volta a ser o de lançar', revolta.btn === 'Enviar apontamento', revolta.btn);

  // ------------------------------------------------------------------
  console.log('\nO QUE NÃO PODE ACONTECER');
  ok('nenhum erro de página', erros.length === 0, erros.slice(0, 4).join(' ; '));

  await b.close();
  srv.kill();
  console.log(falhas ? `\n${falhas} falha(s).` : '\nTudo certo.');
  process.exit(falhas ? 1 : 0);
})();
