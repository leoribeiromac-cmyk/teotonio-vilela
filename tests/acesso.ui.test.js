// A TELA DE ACESSO — o que ela cobra de quem está de luva, no sol.
//
// 15) A senha era digitada às cegas, e o servidor tranca a conta por 15
//     minutos depois de 5 erros: o erro nascia no campo escondido e o preço
//     era ficar fora do sistema no meio do turno.
// 16) Sem <form>, sem name e sem autocomplete, o gerenciador de senhas do
//     aparelho nunca se ofereceu para guardar nem para preencher.
// 17) Senha errada só aparecia no toast, que passa em 6 s enquanto a pessoa
//     ainda olha para o campo.
// 18) Três toques (abrir a roleta, rolar, confirmar) para dizer quem você é —
//     numa lista de seis nomes que quase nunca muda.
// 12) A promessa de "funciona sem sinal" vivia num painel que some abaixo de
//     960 px. O público do login é o apontador, e ele entra pelo celular.
//
// Como rodar:
//   python3 -m http.server 8099        (na raiz do repositório)
//   node tests/acesso.ui.test.js
const H = require('./harness.js');

let falhas = 0;
const ok = (n, c, e) => { if (c) console.log('  ✓ ' + n); else { falhas++; console.log('  ✗ ' + n + (e !== undefined ? '  → ' + e : '')); } };

const gasSenhaErrada = (acao) => {
  if (acao === 'usuariosNomes') return { ok: true, usuarios: ['Leonardo', 'Wallace', 'Guilherme'] };
  if (acao === 'login') return { ok: false, error: 'CREDENCIAIS_INVALIDAS' };
  return { ok: true };
};

(async () => {
  console.log('NO CELULAR (390px), QUE É POR ONDE O APONTADOR ENTRA');
  const s = await H.abrir({ mobile: true, gas: gasSenhaErrada });
  await s.ir('rdo');
  await s.p.waitForTimeout(700);

  console.log('\nO GERENCIADOR DE SENHAS É CONVIDADO (16)');
  const form = await s.p.evaluate(() => {
    const f = document.getElementById('loginForm');
    const p = document.getElementById('loginPass');
    const u = document.getElementById('loginUser') || document.getElementById('loginUserSelect');
    return {
      temForm: !!f,
      senhaName: p.getAttribute('name'),
      senhaAuto: p.getAttribute('autocomplete'),
      usuarioName: u && u.getAttribute('name'),
      usuarioAuto: u && u.getAttribute('autocomplete'),
    };
  });
  ok('os campos vivem dentro de um <form>', form.temForm);
  ok('a senha tem name', form.senhaName === 'password', form.senhaName);
  ok('e autocomplete="current-password"', form.senhaAuto === 'current-password', form.senhaAuto);
  ok('o usuário tem name', form.usuarioName === 'username', form.usuarioName);
  ok('e autocomplete="username"', form.usuarioAuto === 'username', form.usuarioAuto);

  console.log('\nA SENHA PODE SER VISTA (15)');
  const olho0 = await s.p.evaluate(() => {
    const b = document.getElementById('loginPassOlho');
    return b ? { existe: true, pressed: b.getAttribute('aria-pressed'), rot: b.getAttribute('aria-label'),
                 tipo: document.getElementById('loginPass').type } : { existe: false };
  });
  ok('há um botão de ver a senha dentro do campo', olho0.existe);
  ok('o campo nasce escondido', olho0.tipo === 'password', olho0.tipo);
  ok('e o botão nasce não-pressionado', olho0.pressed === 'false', olho0.pressed);

  await s.p.evaluate(() => alternarVerSenha());
  const olho1 = await s.p.evaluate(() => ({
    tipo: document.getElementById('loginPass').type,
    pressed: document.getElementById('loginPassOlho').getAttribute('aria-pressed'),
    rot: document.getElementById('loginPassOlho').getAttribute('aria-label'),
  }));
  ok('um toque revela a senha', olho1.tipo === 'text', olho1.tipo);
  ok('o aria-pressed acompanha', olho1.pressed === 'true', olho1.pressed);
  ok('e o rótulo passa a dizer "ocultar"', /ocultar/i.test(olho1.rot), olho1.rot);

  await s.p.evaluate(() => alternarVerSenha());
  ok('outro toque esconde de novo',
     await s.p.evaluate(() => document.getElementById('loginPass').type) === 'password');

  console.log('\nDIZER QUEM VOCÊ É CUSTA UM TOQUE (18)');
  const chips = await s.p.evaluate(() =>
    [...document.querySelectorAll('#loginChips .chip')].map(c => c.textContent.trim()));
  ok('os nomes ficam à vista, sem roleta', chips.length === 3, chips.join(' | '));
  ok('e não há <select> de usuário', !(await s.p.evaluate(() => !!document.getElementById('loginUserSelect'))));

  await s.p.evaluate(() => document.querySelectorAll('#loginChips .chip')[1].click());
  const escolhido = await s.p.evaluate(() => ({
    valor: document.getElementById('loginUser').value,
    marcado: [...document.querySelectorAll('#loginChips .chip')]
      .filter(c => c.classList.contains('on')).map(c => c.textContent.trim()),
    focoNaSenha: document.activeElement === document.getElementById('loginPass'),
  }));
  ok('um toque escolhe o usuário', escolhido.valor === chips[1], JSON.stringify(escolhido));
  ok('a fileira marca quem foi escolhido', escolhido.marcado.length === 1, JSON.stringify(escolhido.marcado));
  ok('e o foco já vai para a senha', escolhido.focoNaSenha);

  console.log('\nSENHA ERRADA APARECE NO CAMPO, NÃO SÓ NO TOAST (17)');
  await s.p.evaluate(() => { document.getElementById('loginPass').value = 'errada'; fazerLogin(); });
  await s.p.waitForTimeout(700);
  const erro = await s.p.evaluate(() => {
    const e = document.getElementById('loginErro');
    return { visivel: !!e && e.style.display !== 'none', txt: e ? e.textContent : '',
             invalido: document.getElementById('loginPass').classList.contains('invalid') };
  });
  ok('o aviso fica embaixo do campo', erro.visivel, JSON.stringify(erro));
  ok('dizendo o que houve', /senha incorret/i.test(erro.txt), erro.txt);
  ok('e a borda do campo marca o erro', erro.invalido);

  await s.p.evaluate(() => { const p = document.getElementById('loginPass'); p.value = 'o'; p.dispatchEvent(new Event('input', { bubbles: true })); });
  ok('começar a digitar limpa o aviso',
     await s.p.evaluate(() => document.getElementById('loginErro').style.display === 'none' &&
                              !document.getElementById('loginPass').classList.contains('invalid')));

  console.log('\nA PROMESSA DE OFFLINE CHEGA AO CELULAR (12)');
  const off = await s.p.evaluate(() => {
    const e = document.querySelector('.login-offline');
    const btn = document.getElementById('loginBtn');
    if (!e) return null;
    return {
      visivel: getComputedStyle(e).display !== 'none',
      txt: e.innerText.trim(),
      acimaDoEntrar: e.getBoundingClientRect().bottom <= btn.getBoundingClientRect().top + 1,
    };
  });
  ok('a linha existe', !!off);
  ok('e aparece no celular', off && off.visivel, JSON.stringify(off));
  ok('dizendo que o lançamento entra na fila do aparelho',
     off && /fila do aparelho/.test(off.txt), off && off.txt);
  ok('acima do botão Entrar', off && off.acimaDoEntrar, JSON.stringify(off));

  ok('nenhum erro de JS', s.erros.length === 0, s.erros.slice(0, 3).join(' | '));
  await s.fechar();

  console.log('\nNO COMPUTADOR, O PAINEL DA DIREITA JÁ DIZ ISSO — A LINHA SAI');
  const s2 = await H.abrir({ gas: gasSenhaErrada, viewport: { width: 1440, height: 950 } });
  await s2.ir('rdo');
  await s2.p.waitForTimeout(700);
  const desk = await s2.p.evaluate(() => ({
    linha: (() => { const e = document.querySelector('.login-offline'); return e ? getComputedStyle(e).display : 'ausente'; })(),
    painel: (() => { const e = document.querySelector('.login-contexto'); return e ? getComputedStyle(e).display : 'ausente'; })(),
  }));
  ok('a linha some acima de 960px', desk.linha === 'none', desk.linha);
  ok('porque o painel de contexto assume', desk.painel === 'block', desk.painel);
  ok('nenhum erro de JS', s2.erros.length === 0, s2.erros.slice(0, 3).join(' | '));
  await s2.fechar();

  console.log('\nCOM MUITOS NOMES, A ROLETA VOLTA (a fileira viraria parede)');
  const s3 = await H.abrir({
    gas: (acao) => acao === 'usuariosNomes'
      ? { ok: true, usuarios: ['Ana', 'Bruno', 'Carla', 'Diego', 'Elias', 'Fabio', 'Gisele', 'Hugo'] }
      : { ok: true },
  });
  await s3.ir('rdo');
  await s3.p.waitForTimeout(1200);
  const muitos = await s3.p.evaluate(() => ({
    select: !!document.getElementById('loginUserSelect'),
    opcoes: document.getElementById('loginUserSelect')
      ? document.getElementById('loginUserSelect').options.length : 0,
    chips: document.querySelectorAll('#loginChips .chip').length,
  }));
  ok('acima de seis nomes volta o <select>', muitos.select, JSON.stringify(muitos));
  ok('com todos os nomes dentro', muitos.opcoes === 9, String(muitos.opcoes));
  ok('e sem a fileira de chips', muitos.chips === 0, String(muitos.chips));
  ok('nenhum erro de JS', s3.erros.length === 0, s3.erros.slice(0, 3).join(' | '));
  await s3.fechar();

  console.log(falhas === 0 ? '\nTUDO CERTO' : `\n${falhas} FALHA(S)`);
  process.exit(falhas === 0 ? 0 : 1);
})();
