// O AJUSTE DE AVANÇO CONTA NO PAINEL E NÃO SAI NO RDO.
//
// O apontador que escreve o serviço como texto (avulso, `OUTRO`) não move o
// avanço: o pacote fica parado no painel enquanto a obra anda. O escritório
// corrige gravando na RDO_Avanco o que falta, com o pacote e a quantidade,
// no turno "Ajuste".
//
// As duas metades da regra:
//   • o ajuste SOMA no avanço do pacote, como qualquer lançamento;
//   • o ajuste NÃO é serviço daquele dia: não aparece no RDO (tela, PDF,
//     planilha exportada) — o papel que a fiscalização assina — nem no
//     "repetir o último dia".
//
// Como rodar:  node tests/ajuste-de-avanco.ui.test.js
const H = require('./harness.js');

let falhas = 0;
const ok = (nome, cond, extra) => {
  if (cond) console.log('  ✓ ' + nome);
  else { falhas++; console.log('  ✗ ' + nome + (extra !== undefined ? '  → ' + extra : '')); }
};

const pacotes = H.csv([
  ['ID', 'Frente', 'Pacote', 'Unidade Física', 'Qtd Estimada', 'Produtividade', 'Status', 'Observação'],
  ['P01', 'Drenagem', 'Rede de drenagem tubular', 'm', H.pt(1000), H.pt(10), 'Ativo', ''],
]);

const rdo = H.csv([
  ['id', 'Data', 'Pacote_ID', 'Pacote_Nome', 'Quantidade', 'Local_Estaca', 'Equipe', 'Apontador',
   'Turno', 'Observações', 'foto_link', 'usuario', 'timestamp', 'obra'],
  ['r1', '2025-06-10', 'P01', 'Rede de drenagem tubular', H.pt(120), 'E100+0', 'Equipe 1', 'Wallace',
   'Diurno', '', '', 'Wallace', '2025-06-10T12:00:00Z', 'teotonio'],
  ['a1', '2025-06-10', 'P01', 'Rede de drenagem tubular', H.pt(380), '', 'Ajuste de avanço', 'Ajuste',
   'Ajuste', 'Avanço informado pelo escritório', '', 'Leonardo', '2025-06-10T20:00:00Z', 'teotonio'],
]);

(async () => {
  const s = await H.abrir({ logar: { usuario: 'Leonardo', perfil: 'admin' },
                            pacotes, rdo,
                            coeficientes: H.gerarCoeficientes(1, 1),
                            diario: H.gerarDiario({ linhas: 2 }) });

  console.log('\n── quem é ajuste ──');
  const quem = await s.p.evaluate(() => ({
    ajuste:     ehAjusteDeAvanco({ Turno: 'Ajuste' }),
    minusculo:  ehAjusteDeAvanco({ turno: ' ajuste ' }),
    diurno:     ehAjusteDeAvanco({ Turno: 'Diurno' }),
    semTurno:   ehAjusteDeAvanco({}),
  }));
  ok('Turno "Ajuste" é ajuste', quem.ajuste === true);
  ok('sem diferença de maiúscula e espaço', quem.minusculo === true);
  ok('Diurno não é ajuste', quem.diurno === false);
  ok('linha sem turno não é ajuste', quem.semTurno === false);

  console.log('\n── conta no avanço ──');
  const av = await s.p.evaluate(() => {
    const m = calcularAvancoPorPacote();
    return { exec: m.P01 && m.P01.qtdExecutada, pct: m.P01 && m.P01.pct };
  });
  ok('o pacote soma o lançamento e o ajuste (120 + 380)', av.exec === 500, av.exec);
  ok('e o percentual sai de 50%', Math.abs(av.pct - 0.5) < 1e-9, av.pct);

  console.log('\n── não sai no RDO do dia ──');
  const rdoDia = await s.p.evaluate(() => {
    const ex = servicosDataExport('2025-06-10');
    return {
      daData: servicosDaData('2025-06-10').map(r => getCSVField(r, 'id')),
      diurnos: ex.diurnos.map(r => getCSVField(r, 'id')),
      noturnos: ex.noturnos.map(r => getCSVField(r, 'id')),
    };
  });
  ok('a lista do dia (tela do RDO) traz só o serviço do apontador',
     JSON.stringify(rdoDia.daData) === '["r1"]', JSON.stringify(rdoDia.daData));
  ok('a planilha exportada do dia traz só o serviço do apontador',
     JSON.stringify(rdoDia.diurnos) === '["r1"]', JSON.stringify(rdoDia.diurnos));
  ok('e o ajuste não cai no turno da noite', rdoDia.noturnos.length === 0, JSON.stringify(rdoDia.noturnos));

  ok('nenhum erro de JS', s.erros.length === 0, s.erros.slice(0, 3).join(' | '));
  await s.fechar();

  console.log(falhas === 0 ? '\nTUDO CERTO' : `\n${falhas} FALHA(S)`);
  process.exit(falhas === 0 ? 0 : 1);
})();
