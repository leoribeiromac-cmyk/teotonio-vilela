// A PRODUTIVIDADE REAL NO PLANEJAMENTO REVERSO.
//
// O Cronograma divide o saldo pela produtividade do cadastro. Se a frente
// rende a metade, a data de início necessária está errada pela metade — e a
// tela não tinha como saber. Agora, embaixo de cada produtividade, sai o que
// o RDO registrou: quantidade ÷ dias com lançamento.
//
// O que não pode cair:
//   • dois lançamentos no mesmo dia são UM dia trabalhado;
//   • ajuste de avanço (Turno "Ajuste") e quantidade negativa ficam de fora;
//   • o id do pacote é casado como no avanço (" p03" é o P03);
//   • com menos de três dias é só informação — não vira botão;
//   • um toque no real planeja com ele, e a duração muda junto.
//
// Como rodar:  node tests/produtividade-real.ui.test.js
const H = require('./harness.js');

let falhas = 0;
const ok = (nome, cond, extra) => {
  if (cond) console.log('  ✓ ' + nome);
  else { falhas++; console.log('  ✗ ' + nome + (extra !== undefined ? '  → ' + extra : '')); }
};

const PAC = H.csv([
  ['ID', 'Frente', 'Pacote', 'Unidade Física', 'Qtd Estimada', 'Produtividade', 'Status', 'Observação'],
  ['P01', 'Pav. Flexível', 'BGTC - base', 'm³', '1000', '100', 'Ativo', ''],
  ['P02', 'Drenagem', 'Tubo de concreto', 'm', '500', '10', 'Ativo', ''],
  ['P03', 'Drenagem', 'Boca de lobo', 'un"><i id=xss>', '40', '2', 'Ativo', ''],
  ['P04', 'Sinalização', 'Pintura horizontal', 'm²', '900', '50', 'Ativo', ''],
]);
const CAB = ['id', 'Data', 'Pacote_ID', 'Quantidade', 'Local_Estaca', 'Equipe', 'Apontador', 'Turno', 'Observações', 'foto_link', 'usuario', 'timestamp', 'obra'];
const L = (id, data, pid, qtd, turno) => [id, data, pid, qtd, 'E120 (CB)', 'Equipe 1', turno === 'Ajuste' ? 'Ajuste' : 'Wallace', turno || 'Diurno', '', '', 'Wallace', data + 'T12:00:00Z', 'teotonio'];
const RDO = H.csv([CAB,
  // P01: quatro dias trabalhados, 220 m³ → 55 m³/dia (o cadastro diz 100)
  L('a1', '2026-03-02', 'P01', '50'), L('a2', '2026-03-03', 'P01', '60'), L('a3', '2026-03-04', 'P01', '70'),
  L('a4', '2026-03-05', 'P01', '20'), L('a5', '2026-03-05', 'P01', '20', 'Noturno'),
  L('a6', '2026-03-09', 'P01', '300', 'Ajuste'),          // ajuste do escritório: não é dia trabalhado
  L('a7', '2026-03-10', 'P01', '-40'),                    // dado sujo
  // P02: só dois dias — cedo para chamar de ritmo
  L('b1', '2026-03-02', 'P02', '12'), L('b2', '2026-03-03', 'P02', '18'),
  // P03: o id veio com espaço e caixa trocada; rende MAIS que o cadastro
  L('c1', '2026-03-02', ' p03', '3'), L('c2', '2026-03-03', 'p03 ', '4'), L('c3', '2026-03-04', 'P03', '5'),
]);

(async () => {
  const s = await H.abrir({ logar: { usuario: 'Leonardo', perfil: 'admin' }, pacotes: PAC, rdo: RDO, coeficientes: '' });
  await s.ir('cronograma');
  await s.p.waitForTimeout(500);

  console.log('O QUE O RDO DIZ DA PRODUTIVIDADE');
  const r = await s.p.evaluate(() => {
    const m = produtividadeReal();
    const linha = pid => {
      const tr = [...document.querySelectorAll('#page tbody tr')].find(t => t.querySelector('input[onblur*=\'"' + pid + '"\']'));
      const el = tr && tr.querySelector('.plan-real');
      return el ? { tag: el.tagName, cls: el.className, txt: el.textContent.trim(), dica: el.getAttribute('title') } : null;
    };
    return { m, p1: linha('P01'), p2: linha('P02'), p3: linha('P03'), p4: linha('P04'), xss: !!document.getElementById('xss') };
  });
  ok('dois lançamentos no mesmo dia são um dia trabalhado: 220 m³ em 4 dias',
     r.m.P01 && r.m.P01.dias === 4 && r.m.P01.qtd === 220 && r.m.P01.media === 55, JSON.stringify(r.m.P01));
  ok('ajuste de avanço e quantidade negativa ficam de fora', r.m.P01.qtd === 220 && r.m.P01.dias === 4);
  ok('a linha mostra o real e avisa que está abaixo do cadastro',
     r.p1 && r.p1.tag === 'BUTTON' && /abaixo/.test(r.p1.cls) && /real 55,00 m³\/dia · 4 d/.test(r.p1.txt), JSON.stringify(r.p1));
  ok('a dica faz a conta por extenso', r.p1 && /220,00 m³ em 4 dias trabalhados/.test(r.p1.dica) && /55% da produtividade em uso/.test(r.p1.dica), r.p1 && r.p1.dica);
  ok('com dois dias é só informação — não vira botão', r.p2 && r.p2.tag === 'DIV' && /pouco/.test(r.p2.cls) && /2 d/.test(r.p2.txt), JSON.stringify(r.p2));
  ok('o id com espaço e caixa trocada é o mesmo pacote', r.m.P03 && r.m.P03.dias === 3 && r.m.P03.qtd === 12, JSON.stringify(r.m.P03));
  ok('rendendo mais que o cadastro, a linha sai em verde', r.p3 && /acima/.test(r.p3.cls), JSON.stringify(r.p3));
  ok('pacote sem lançamento não ganha linha', r.p4 === null, JSON.stringify(r.p4));
  ok('a unidade da planilha vai escapada para a tela', !r.xss);

  console.log('\nPLANEJAR COM O RITMO REAL');
  const antes = await s.p.evaluate(() => {
    const tr = [...document.querySelectorAll('#page tbody tr')].find(t => t.querySelector('input[onblur*=\'"P01"\']'));
    return tr.querySelectorAll('td')[4].textContent.trim();
  });
  await s.p.click('#page button.plan-real.abaixo');
  await s.p.waitForTimeout(500);
  const depois = await s.p.evaluate(() => {
    const tr = [...document.querySelectorAll('#page tbody tr')].find(t => t.querySelector('input[onblur*=\'"P01"\']'));
    const el = tr.querySelector('.plan-real');
    return { campo: tr.querySelector('input[type=number]').value, dur: tr.querySelectorAll('td')[4].textContent.trim(), cls: el.className,
             guardado: (JSON.parse(localStorage.getItem(lsObra('teotonio_plan_reverso_v1')) || '{}').P01 || {}).prod };
  });
  // O ajuste de 300 m³ CONTA no avanço (só não é dia trabalhado): executado
  // 520, saldo 480 m³ — 5 du a 100/dia, 9 du a 55/dia.
  ok('antes, a duração saía da produtividade do cadastro', antes === '5 du', antes);
  ok('um toque no real põe 55 no campo e a duração passa a 9 dias úteis', depois.campo === '55' && depois.dur === '9 du', JSON.stringify(depois));
  ok('a escolha fica guardada no planejamento da obra', depois.guardado === '55', depois.guardado);
  ok('e a linha deixa de acusar diferença', /acima/.test(depois.cls), depois.cls);

  ok('nenhum erro de console', s.erros.length === 0, s.erros.slice(0, 3).join(' | '));
  await s.fechar();

  console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTudo certo.');
  process.exit(falhas ? 1 : 0);
})();
