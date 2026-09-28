// A PREVISÃO DO TEMPO NA CENTRAL DE CAMPO.
//
// O app registra a chuva que JÁ caiu; a decisão que custa dinheiro é a de
// amanhã (concretar, imprimar, aplicar CBUQ). A Central de Campo mostra os
// próximos dias na coordenada do canteiro, com o dia de risco marcado.
//
// O que não pode cair:
//   • a faixa nunca segura o Painel — nasce vazia e é preenchida depois;
//   • sem sinal, fica a última previsão guardada, DIZENDO de quando ela é;
//   • previsão falhando não vira erro na tela nem no console.
//
// Como rodar:  node tests/previsao-tempo.ui.test.js
const H = require('./harness.js');

let falhas = 0;
const ok = (nome, cond, extra) => {
  if (cond) console.log('  ✓ ' + nome);
  else { falhas++; console.log('  ✗ ' + nome + (extra !== undefined ? '  → ' + extra : '')); }
};

function previsao(mm) {
  const time = []; const d0 = new Date();
  for (let i = 0; i < 6; i++) {
    const d = new Date(d0.getFullYear(), d0.getMonth(), d0.getDate() + i);
    time.push(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'));
  }
  return { daily: { time, precipitation_sum: mm, precipitation_probability_max: [5, 30, 70, 90, 40, 10],
    temperature_2m_max: [29, 27, 24, 21, 23, 26], temperature_2m_min: [17, 16, 15, 14, 14, 15],
    weather_code: [0, 2, 61, 65, 3, 1] } };
}

(async () => {
  console.log('A FAIXA DOS PRÓXIMOS DIAS');
  const opts = { logar: { usuario: 'Leonardo', perfil: 'admin' }, previsao: previsao([0, 0.4, 7.2, 23.5, 1.2, 0]) };
  const s = await H.abrir(opts);
  await s.ir('executivo');
  await s.p.waitForTimeout(1200);
  const f = await s.p.evaluate(() => {
    const el = document.getElementById('ccPrevisao');
    return el ? {
      visivel: !el.hidden, dias: el.querySelectorAll('.prev-dia').length,
      risco: el.querySelectorAll('.prev-risco').length, forte: el.querySelectorAll('.prev-forte').length,
      alerta: (el.querySelector('.prev-alerta') || {}).textContent || '',
      texto: el.textContent,
    } : null;
  });
  ok('a Central de Campo mostra a previsão', f && f.visivel, JSON.stringify(f));
  ok('com cinco dias', f && f.dias === 5, f && f.dias);
  ok('o dia de 7,2 mm é marcado como risco', f && f.risco === 1, f && f.risco);
  ok('e o de 23,5 mm como chuva forte', f && f.forte === 1, f && f.forte);
  ok('o alerta nomeia os dias e manda conferir a programação',
     f && /7,2 mm/.test(f.alerta) && /24 mm/.test(f.alerta) && /concretagem/.test(f.alerta), f && f.alerta);
  ok('os milímetros saem com vírgula (pt-BR)', f && /0,4 mm/.test(f.texto), f && f.texto.slice(0, 200));

  console.log('\nSEM SINAL');
  // a previsão guardada fica velha (mais de 20 h) e a rede cai
  await s.p.evaluate(() => {
    const k = previsaoChave(); const g = JSON.parse(localStorage.getItem(k));
    g.em = Date.now() - 26 * 3600 * 1000; localStorage.setItem(k, JSON.stringify(g));
  });
  opts.previsao = null;
  await s.p.evaluate(() => { navigate('historico'); });
  await s.p.waitForTimeout(300);
  await s.ir('executivo');
  await s.p.waitForTimeout(1200);
  const off = await s.p.evaluate(() => {
    const el = document.getElementById('ccPrevisao');
    return el ? { visivel: !el.hidden, fonte: (el.querySelector('.prev-fonte') || {}).textContent || '' } : null;
  });
  ok('sem sinal, a última previsão guardada continua na tela', off && off.visivel, JSON.stringify(off));
  ok('e diz de quando ela é', off && /sem sinal para atualizar/.test(off.fonte), off && off.fonte);

  console.log('\nOBRA SEM COORDENADA');
  const semCoord = await s.p.evaluate(() => {
    const c = OBRA.coord, id = OBRA.id;
    const salvo = COORD_OBRAS[id]; delete COORD_OBRAS[id]; OBRA.coord = null;
    const html = renderCentralCampo();
    COORD_OBRAS[id] = salvo; OBRA.coord = c;
    return /ccPrevisao/.test(html);
  });
  ok('obra sem coordenada não desenha faixa vazia', semCoord === false);

  ok('nenhum erro de página', s.erros.length === 0, s.erros.slice(0, 3).join(' ; '));
  await s.fechar();
  console.log(falhas ? `\n${falhas} falha(s).` : '\nTudo certo.');
  process.exit(falhas ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
