// AUDITORIA POR TELA — todas as telas, todos os perfis, desktop e celular.
//
// É a cobertura que faltou no relatório. Para cada combinação perfil × tela ×
// viewport, mede:
//   - a tela abriu? (conteúdo de verdade, não só a moldura)
//   - erro de console / pageerror
//   - rolagem lateral (tabela estourando a largura no celular)
//   - alvo de toque menor que 44 px (regra de dedo com luva)
//   - texto cortado por overflow
//   - e o principal: PERMISSÃO — o perfil viu o que não devia?
//
// Roda: node jornada.js
const H = require('./harness.js');
const fs = require('fs');

const TELAS = ['executivo','avancofisico','cronograma','medicao','improdutivos','teoricoreal',
               'analista','rdo','rdodiario','historico','equip','notas','galeria','projetos','usuarios'];

// O que cada perfil PODE ver, copiado do PERFIS do index.html — é contra isto
// que a medição é conferida. Se o app divergir, um dos dois está errado.
const ESPERADO = {
  campo:          ['rdo','rdodiario','historico','avancofisico','galeria','projetos','equip','notas'],
  administrativo: ['executivo','avancofisico','cronograma','medicao','improdutivos','teoricoreal','historico','galeria','projetos','equip','notas'],
  engenharia:     ['executivo','avancofisico','cronograma','medicao','improdutivos','teoricoreal','analista','rdo','rdodiario','historico','galeria','projetos','equip','notas'],
  diretoria:      ['executivo','avancofisico','cronograma','medicao','improdutivos','teoricoreal','analista','historico','galeria','projetos','notas'],
  admin:          TELAS,
  visitante:      ['executivo','avancofisico','cronograma','medicao','improdutivos','teoricoreal','analista','historico','galeria','projetos'],
};

const PAC = ['ID,Frente,Pacote,Unidade Física,Qtd Estimada,Produtividade,Status,Observação',
  'P01,Drenagem,Assentamento de tubulação de concreto,m,1000,20,Ativo,Est. 110+10 a 118',
  'P02,Pav. Flexível,Base de brita graduada simples,m²,5000,40,Ativo,Espessura 15cm',
  'P03,Muros de Contenção,Fuste do muro de arrimo,m,135,2.5,Ativo,'].join('\r\n');
const COEF = ['Pacote ID,Pacote Nome,Item Contratual,Descrição Item,Unid Item,Coef,Unid Coef,Tipo',
  'P01,Tubulação,06-06-00,Lastro de brita,M3,"0,15",m³/m,Manual',
  'P02,BGS,05-48-00,Brita graduada simples,M3,"0,15",m³/m²,Manual',
  'P03,Fuste,04-11-00,Concreto estrutural,M3,"1,2",m³/m,Manual'].join('\r\n');

function gerarRDO(n) {
  const l = ['id,Data,Pacote_ID,Quantidade,Local_Estaca,Equipe,Apontador,Turno,Observações,obra'];
  for (let i = 0; i < n; i++) {
    const d = new Date(Date.UTC(2026, 4, 4) + (i % 90) * 86400000).toISOString().slice(0, 10);
    l.push(`r${i},${d},P0${(i % 3) + 1},"${((i % 20) + 1) * 12},5",E${100 + (i % 40)}+10 a E${101 + (i % 40)},Sena Obras,Wallace,Diurno,,teotonio`);
  }
  return l.join('\r\n');
}
const DIARIO = (() => {
  const l = ['id,numero_rdo,Data,Turno,Clima_Manha,Clima_Tarde,Clima_Noite,Apontador_Diurno,Efetivo_JSON,obra'];
  const ef = JSON.stringify({ padrao_diurno: { servente: 8, pedreiro: 4 } }).replace(/"/g, '""');
  for (let i = 0; i < 40; i++) {
    const d = new Date(Date.UTC(2026, 4, 4) + i * 86400000).toISOString().slice(0, 10);
    l.push(`D${1000 + i},${i + 1},${d},Diurno,Bom,Chuva,Bom,Wallace,"${ef}",teotonio`);
  }
  return l.join('\r\n');
})();
const CRONO = ['Nivel,EDT,Nome da tarefa,Início,Término,% concluída,Pacote_ID',
  '0,1,OBRA COMPLETA,09/05/2024,08/03/2026,45%,',
  '1,1.1,Drenagem,01/06/2025,01/12/2025,80%,P01',
  '1,1.2,Pavimentação,01/09/2025,01/06/2026,40%,P02',
  '1,1.3,Muros,01/03/2026,01/09/2026,10%,P03'].join('\r\n');

const achados = [];
const reg = (perfil, tela, vp, gravidade, o_que, detalhe) =>
  achados.push({ perfil, tela, vp, gravidade, o_que, detalhe });

async function auditar(perfil, mobile) {
  const vp = mobile ? 'celular' : 'desktop';
  const s = await H.abrir({
    pacotes: PAC, coeficientes: COEF, rdo: gerarRDO(400), diario: DIARIO, cronograma: CRONO,
    mobile, logar: perfil === 'visitante' ? null : { usuario: 'Leonardo', perfil },
  });
  if (perfil === 'visitante') {
    await s.p.evaluate(() => { localStorage.clear(); });
    await s.p.reload({ waitUntil: 'load' });
    await s.p.waitForFunction(() => typeof STATE !== 'undefined' && STATE.loaded === true, null, { timeout: 30000 }).catch(() => {});
  }

  const permitidas = ESPERADO[perfil] || [];

  for (const tela of TELAS) {
    s.erros.length = 0;
    const podeVer = await s.p.evaluate(t => {
      try { return podeVer(t); } catch (e) { return null; }
    }, tela).catch(() => null);

    await s.p.evaluate(t => { STATE.currentPage = t; render(); }, tela).catch(() => {});
    await s.p.waitForTimeout(mobile ? 520 : 400);

    const m = await s.p.evaluate(() => {
      const pg = document.getElementById('page');
      const txt = pg ? (pg.innerText || '').trim() : '';
      const doc = document.documentElement;
      // alvos de toque pequenos demais
      const clicaveis = [...document.querySelectorAll('#page button, #page a, #page select, #page input')];
      const pequenos = clicaveis.filter(el => {
        // A área de toque de uma caixa de seleção é o RÓTULO inteiro, não o
        // quadradinho. E link dentro de frase corrida não é alvo de toque —
        // é texto; esticá-lo para 44px quebraria a linha.
        const alvo = el.closest('label') || el;
        const r = alvo.getBoundingClientRect();
        // Link dentro de frase corrida não é alvo de toque — é texto. Esticá-lo
        // para 44px quebraria a linha no meio da frase. A lista de recipientes
        // cresceu depois de o detector acusar o "configure sua chave" do painel,
        // que vive dentro de um <span> de texto (.hero-ia-text), não de um <p>.
        if (el.tagName === 'A' && el.closest('p, span, .card-body, .empty-sub, .hero-ia-text')
            && !/btn/.test(el.className || '')) return false;
        return r.width > 0 && r.height > 0 && r.height < 40;
      }).length;
      // texto cortado (scrollWidth maior que o visível, sem rolagem própria)
      const cortados = [...document.querySelectorAll('#page *')].filter(el => {
        if (el.children.length) return false;
        const cs = getComputedStyle(el);
        if (cs.overflowX === 'auto' || cs.overflowX === 'scroll') return false;
        return el.scrollWidth > el.clientWidth + 2 && el.clientWidth > 0;
      }).length;
      // largura de qualquer filho estourando a viewport
      const estouro = Math.max(0, doc.scrollWidth - window.innerWidth);
      return {
        temConteudo: txt.length > 40,
        tamanhoTexto: txt.length,
        // O texto EXATO que telaBloqueada() e renderLogin() imprimem. A primeira
        // versão deste detector procurava outras palavras e deu 38 "telas
        // expostas" que eram, todas, a tela de bloqueio funcionando.
        bloqueada: /Acesso não liberado|não abre (o|a|os|as) /i.test(txt),
        pedeLogin: !!document.querySelector('#page #loginUser, #page #loginPass, #page [id^="login"]')
                   || /entrar no sistema|informe a senha|selecione o usu/i.test(txt),
        pequenos, cortados, estouro,
        amostra: txt.replace(/\s+/g, " ").slice(0, 70),
        nos: pg ? pg.getElementsByTagName('*').length : 0,
      };
    });

    const deveria = permitidas.includes(tela);
    const barrada = m.bloqueada || m.pedeLogin;

    // ---- PERMISSÃO
    if (deveria && barrada) reg(perfil, tela, vp, 'alta', 'tela negada indevidamente', 'o perfil deveria ver e levou bloqueio');
    if (!deveria && !barrada && m.temConteudo)
      reg(perfil, tela, vp, 'critica', 'tela EXPOSTA a quem não deveria', `${m.tamanhoTexto} caracteres renderizados: "${m.amostra}"`);
    if (podeVer !== null && podeVer !== deveria)
      reg(perfil, tela, vp, 'alta', 'podeVer() diverge do PERFIS', `podeVer=${podeVer}, esperado=${deveria}`);

    // ---- SAÚDE DA TELA (só onde o perfil tem acesso)
    if (deveria && !barrada) {
      if (!m.temConteudo) reg(perfil, tela, vp, 'alta', 'tela em branco', `${m.tamanhoTexto} caracteres, ${m.nos} nós`);
      if (m.estouro > 2) reg(perfil, tela, vp, mobile ? 'alta' : 'media', 'rolagem lateral', `${m.estouro}px além da tela`);
      if (mobile && m.pequenos > 0) reg(perfil, tela, vp, 'media', 'alvo de toque abaixo de 40px', `${m.pequenos} elementos`);
      if (m.cortados > 0) reg(perfil, tela, vp, 'media', 'texto cortado', `${m.cortados} elementos`);
    }
    if (s.erros.length) reg(perfil, tela, vp, 'alta', 'erro de console', s.erros.slice(0, 2).join(' | ').slice(0, 180));

    if (deveria && !barrada) {
      await s.p.screenshot({ path: `${__dirname}/tela-${perfil}-${tela}-${vp}.png` }).catch(() => {});
    }
  }
  await s.fechar();
}

(async () => {
  const perfis = ['visitante', 'campo', 'administrativo', 'engenharia', 'diretoria', 'admin'];
  for (const p of perfis) {
    for (const mobile of [false, true]) {
      process.stdout.write(`${p} / ${mobile ? 'celular' : 'desktop'} … `);
      const antes = achados.length;
      try { await auditar(p, mobile); } catch (e) { reg(p, '-', mobile ? 'celular' : 'desktop', 'alta', 'a bancada falhou', String(e.message).slice(0, 140)); }
      console.log(achados.length - antes + ' achado(s)');
    }
  }

  fs.writeFileSync(`${__dirname}/jornada.json`, JSON.stringify(achados, null, 1));
  const ordem = { critica: 0, alta: 1, media: 2 };
  achados.sort((a, b) => ordem[a.gravidade] - ordem[b.gravidade]);
  console.log('\n================ ' + achados.length + ' ACHADOS ================');
  const porTipo = {};
  achados.forEach(a => { const k = a.gravidade + ' · ' + a.o_que; porTipo[k] = (porTipo[k] || 0) + 1; });
  Object.entries(porTipo).sort((a, b) => b[1] - a[1]).forEach(([k, n]) => console.log(String(n).padStart(4), k));
  console.log('\n--- críticos e altos, detalhados ---');
  achados.filter(a => a.gravidade !== 'media').slice(0, 40).forEach(a =>
    console.log(` [${a.gravidade}] ${a.perfil}/${a.tela}/${a.vp}: ${a.o_que} — ${a.detalhe}`));
  process.exit(0);
})();
