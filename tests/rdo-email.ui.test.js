// O RDO do dia sai por e-mail sozinho. Quem manda o e-mail é o Apps Script,
// mas quem DESENHA o PDF é o navegador — então o envio automático só existe
// enquanto o app continuar depositando o PDF do dia no backend.
//
// Este teste é a trava desse contrato. Ele sobe o app de verdade e cobra:
//   • depositarRDOPdf() manda uma ação `rdoPdfDoDia` com um PDF de verdade
//     (data URI de application/pdf que começa em %PDF), a data, a obra e o
//     número do RDO que sai no cabeçalho;
//   • o depósito NÃO baixa arquivo nenhum — o celular do apontador não pode
//     acumular um PDF na pasta de downloads a cada turno salvo;
//   • gerar o PDF Oficial à mão continua baixando (isso é o botão), e de
//     quebra repõe o depósito quando o dia é recente;
//   • dia antigo gerado à mão não deposita: não vai ser enviado mesmo, e
//     subir 200 KB do 4G do canteiro para nada é caro;
//   • o Code.gs tem a ação, o gatilho e os destinatários ligados.
//
// Roda com:  node tests/rdo-email.ui.test.js
const fs = require('fs');
const path = require('path');
const H = require('./harness.js');

const RAIZ = path.join(__dirname, '..');

let falhas = 0;
const ok = (n, c, e) => {
  if (c) console.log('  ✓ ' + n);
  else { falhas++; console.log('  ✗ ' + n + (e !== undefined ? '  → ' + e : '')); }
};

// A mesma conta que o app faz (getLocalISODate): data LOCAL, não UTC.
const iso = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') +
                 '-' + String(d.getDate()).padStart(2, '0');
const HOJE = iso(new Date());
const ANTIGO = '2026-03-10';

const csvEsc = v => (/[",\n]/.test(String(v)) ? '"' + String(v).replace(/"/g, '""') + '"' : String(v));
const linhaDiario = (id, data, num) => [
  id, data, 'Bom', 'Bom', 'Bom',
  JSON.stringify({ padrao_diurno: { pedreiro: 6, servente: 10 } }),
  JSON.stringify({ padrao_diurno: { escavadeira_hidraulica: 1 } }),
  'Sem ocorrências.', 'Concretagem liberada pela fiscalização.',
  'Carlos Apontador', '', 'teotonio', num,
].map(csvEsc).join(',');

const csvDiario = [
  'ID,Data,Clima_Manha,Clima_Tarde,Clima_Noite,Efetivo_JSON,Equipamentos_JSON,Ocorrencias,' +
  'Observacoes_Gerais,Apontador_Diurno,Apontador_Noturno,Obra,numero_rdo',
  linhaDiario('D0128', HOJE, '128'),
  linhaDiario('D0042', ANTIGO, '42'),
].join('\n');

/* O depósito é grande demais para a querystring, então o app manda por POST
   com FormData — que chega como multipart. O harness só sabe ler JSONP; aqui
   a rota é reescrita para ler os dois. */
function camposMultipart(corpo) {
  const out = {};
  const fim = corpo.indexOf('\r\n');
  if (fim === -1) return out;
  const boundary = corpo.slice(0, fim);
  corpo.split(boundary).forEach(bloco => {
    const m = bloco.match(/name="([^"]+)"\r\n\r\n([\s\S]*?)\r\n$/);
    if (m) out[m[1]] = m[2];
  });
  return out;
}

(async () => {
  console.log('\nRDO DO DIA POR E-MAIL — o app deposita o PDF que o servidor vai anexar\n');

  // ---------- 1. o Code.gs, que é quem manda o e-mail ----------
  const gs = fs.readFileSync(path.join(RAIZ, 'Code.gs'), 'utf8');
  console.log('Code.gs — a ação, o gatilho e a lista');
  ok('roteador conhece a ação rdoPdfDoDia', /case 'rdoPdfDoDia':/.test(gs));
  ok('a ação exige token como as outras de escrita',
     /PROTEGIDAS[\s\S]{0,900}'rdoPdfDoDia'/.test(gs));
  ok('a ação respeita a obra da sessão', /POR_OBRA[\s\S]{0,200}'rdoPdfDoDia'/.test(gs));
  ok('rdoPdfDoDia() existe', /function rdoPdfDoDia\(/.test(gs));
  ok('o gatilho de envio existe', /function enviarRDODoDiaPorEmail\(/.test(gs));
  ok('configurarGatilhos() agenda o envio',
     /ScriptApp\.newTrigger\('enviarRDODoDiaPorEmail'\)/.test(gs));
  ok('configurarGatilhos() apaga o gatilho antigo antes de recriar (não duplica)',
     /fn === 'enviarRDODoDiaPorEmail'\) ScriptApp\.deleteTrigger/.test(gs));
  ok('existe reenvio manual para o RDO corrigido depois da hora',
     /function reenviarRDOPorEmail\(/.test(gs));
  ok('o mesmo dia não é enviado duas vezes', /function rdoEmailJaEnviado_\(/.test(gs));

  const destinos = (gs.match(/var RDO_EMAIL_DESTINOS = \[([\s\S]*?)\];/) || [])[1] || '';
  const enderecos = (destinos.match(/'[^']+@[^']+'/g) || []).map(s => s.slice(1, -1));
  ok('a lista de destinatários está preenchida', enderecos.length >= 3, enderecos.length + ' endereço(s)');
  ok('todo destinatário é um endereço válido',
     enderecos.every(e => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)), enderecos.join(', '));
  ok('a lista pode ser trocada sem deploy (Propriedade RDO_EMAILS)',
     /getProperty\('RDO_EMAILS'\)/.test(gs));
  ok('dia sem PDF avisa o dono do script, não a fiscalização',
     /Sem PDF depositado[\s\S]{0,80}/.test(gs) && /function rdoEmailAvisarDono_\(/.test(gs));

  // ---------- 2. o app, que é quem deposita ----------
  console.log('\nO app — o depósito do PDF do dia');
  const s = await H.abrir({ diario: csvDiario, logar: { usuario: 'Leonardo', perfil: 'admin' } });

  const capturadas = [];
  const baixados = [];
  s.p.on('download', d => baixados.push(d.suggestedFilename()));

  await s.p.route('**://script.google.com/**', async route => {
    const req = route.request();
    const u = new URL(req.url());
    const cb = u.searchParams.get('callback');
    let params = {};
    u.searchParams.forEach((v, k) => { params[k] = v; });
    if (req.method() === 'POST') {
      const buf = req.postDataBuffer();
      if (buf) params = camposMultipart(buf.toString('utf8'));
    }
    capturadas.push({ acao: params.action || '', params, metodo: req.method() });
    const corpo = { ok: true, fileId: 'arquivo-falso' };
    route.fulfill(cb
      ? { status: 200, contentType: 'application/javascript', body: cb + '(' + JSON.stringify(corpo) + ')' }
      : { status: 200, contentType: 'application/json', body: JSON.stringify(corpo) });
  });

  const doDia = () => capturadas.filter(c => c.acao === 'rdoPdfDoDia');

  // --- depósito puro: sobe o PDF e não baixa nada ---
  const depositou = await s.p.evaluate(d => depositarRDOPdf(d), HOJE);
  await s.p.waitForTimeout(300);

  ok('depositarRDOPdf() existe e diz que conseguiu', depositou === true, JSON.stringify(depositou));
  ok('mandou exatamente um rdoPdfDoDia', doDia().length === 1, doDia().length + ' chamada(s)');

  const dep = doDia()[0] || { params: {} };
  ok('foi por POST (o PDF não cabe na querystring)', dep.metodo === 'POST', dep.metodo);
  ok('mandou a data do RDO', dep.params.data === HOJE, dep.params.data);
  ok('mandou a obra', dep.params.obra === 'teotonio', dep.params.obra);
  ok('mandou o número do RDO que sai no cabeçalho', dep.params.numero_rdo === '128',
     dep.params.numero_rdo);
  ok('mandou o token da sessão (o backend recusa sem ele)', !!dep.params.token, dep.params.token);

  const uri = String(dep.params.pdf || '');
  ok('o anexo é um data URI de PDF', uri.indexOf('data:application/pdf;base64,') === 0,
     uri.slice(0, 40));
  const bytes = Buffer.from(uri.split(',')[1] || '', 'base64');
  ok('o que subiu é um PDF de verdade', bytes.slice(0, 5).toString() === '%PDF-',
     bytes.slice(0, 8).toString());
  ok('o PDF não veio vazio', bytes.length > 5000, bytes.length + ' bytes');
  ok('o depósito NÃO baixou arquivo no aparelho', baixados.length === 0, baixados.join(', '));

  // --- o botão continua baixando, e repõe o depósito do dia recente ---
  await s.p.evaluate(d => gerarPDFDiario(d), HOJE);
  await s.p.waitForTimeout(1200);
  ok('gerar o PDF Oficial à mão baixa o arquivo', baixados.length === 1, baixados.join(', '));
  ok('e repõe o depósito quando o dia é recente', doDia().length === 2,
     doDia().length + ' chamada(s)');

  // --- dia antigo: baixa, mas não gasta 4G do canteiro com depósito ---
  await s.p.evaluate(d => gerarPDFDiario(d), ANTIGO);
  await s.p.waitForTimeout(1200);
  ok('dia antigo também baixa', baixados.length === 2, baixados.join(', '));
  ok('dia antigo NÃO deposita', doDia().length === 2, doDia().length + ' chamada(s)');

  // --- e o salvamento do turno continua chamando o depósito ---
  const html = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8');
  const iSalvar = html.indexOf('async function salvarDiarioV4()');
  // até o começo da próxima função: a de salvar o turno é longa, e um pedaço
  // fixo pode terminar ANTES do trecho que este teste existe para vigiar
  const iFim = html.indexOf('\nfunction ', iSalvar);
  const corpoSalvar = html.slice(iSalvar, iFim === -1 ? iSalvar + 9000 : iFim);
  ok('salvar o turno dispara o depósito', corpoSalvar.indexOf('depositarRDOPdf(d.data)') !== -1);
  ok('o depósito só vai depois da recarga (senão o RDO sai sem número)',
     /carregarTudo\(\)\.then\(\(\) => depositarRDOPdf\(d\.data\)\)/.test(corpoSalvar));

  ok('nenhum erro de página durante o teste', s.erros.length === 0, s.erros.join(' | '));

  await s.fechar();
  console.log(falhas ? `\n${falhas} falha(s)\n` : '\nTudo certo.\n');
  process.exit(falhas ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
