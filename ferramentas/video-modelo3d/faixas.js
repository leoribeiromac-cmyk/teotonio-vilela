/*
 * Sistema de controle de obra — Av. Senador Teotônio Vilela
 * Copyright © 2026 Leonardo Maciel. Todos os direitos reservados.
 *
 * Software proprietário. O código estar visível não autoriza uso, cópia
 * nem obra derivada — ver LICENSE, na raiz do repositório.
 */
// As faixas do RDO por data, calculadas pelo APP de verdade (m3dDados) sobre a obra ilustrativa do passeio.
const H = require(require('path').join(__dirname, '../../tests/harness.js'));
const fs = require('fs');
const { pacotesCsv, rdoCsv } = require('./obra-demo.js');
(async () => {
  const s = await H.abrir({ logar: { usuario: 'Leonardo', perfil: 'admin' }, pacotes: pacotesCsv(), rdo: rdoCsv(), gas: (a, p) => a === 'login' ? { ok: true, usuario: p.usuario, perfil: 'admin', token: 't', obras: '*' } : { ok: true } });
  const p = s.p;
  const out = await p.evaluate(() => {
    M3D.periodo = 'linha'; M3D.cor = 'etapa'; M3D.frente = ''; M3D.pacote = '';
    const datas = [], faixas = [];
    const d0 = Date.parse('2024-05-12T12:00:00Z'), d1 = Date.parse('2026-03-09T12:00:00Z'), N = 64;
    for (let i = 0; i < N; i++) {
      const iso = new Date(d0 + (d1 - d0) * i / (N - 1)).toISOString().slice(0, 10);
      M3D.ate = iso; const D = m3dDados();
      datas.push(iso); faixas.push(D.faixas.map(f => ({ chave: f.chave, eixo: f.eixo, m0: f.m0, m1: f.m1, cor: f.cor, titulo: f.titulo })));
    }
    return { datas, faixas, etapas: M3D_ETAPAS.map(e => ({ nome: e.nome, cor: e.cor })) };
  });
  const T = process.env.VIDEO_TRABALHO || require('path').join(require('os').tmpdir(), 'video-modelo3d'); fs.mkdirSync(T, { recursive: true });
  fs.writeFileSync(require('path').join(T, 'faixas.json'), JSON.stringify(out));
  console.log(out.datas.length, 'datas;', out.faixas.map(f => f.length).join(','), '\netapas', JSON.stringify(out.etapas));
  await s.fechar();
})().catch(e => { console.error(e); process.exit(1); });
