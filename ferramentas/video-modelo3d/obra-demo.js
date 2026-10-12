/*
 * Sistema de controle de obra — Av. Senador Teotônio Vilela
 * Copyright © 2026 Leonardo Maciel. Todos os direitos reservados.
 *
 * Software proprietário. O código estar visível não autoriza uso, cópia
 * nem obra derivada — ver LICENSE, na raiz do repositório.
 */
// Obra de DEMONSTRAÇÃO da Teotônio (não é o RDO de verdade): pacotes reais, estacas reais, uma
// sequência de obra plausível andando pela avenida desde maio/2024.
const H = require(require('path').join(__dirname, '../../tests/harness.js'));

const PAC = [
  ['P01', 'Drenagem', 'Tubo Ø500mm', 'ML', 315.15], ['P02', 'Drenagem', 'Tubo Ø600mm', 'ML', 290.5],
  ['P03', 'Drenagem', 'Tubo Ø800mm', 'ML', 157], ['P04', 'Drenagem', 'Tubo Ø1000mm', 'ML', 184.5],
  ['P05', 'Drenagem', 'Tubo Ø1200mm', 'ML', 103.5], ['P06', 'Drenagem', 'Boca de Lobo Dupla', 'UN', 18],
  ['P07', 'Drenagem', 'Boca de Lobo Tripla', 'UN', 6], ['P08', 'Drenagem', 'PV Tipo 2 (1,6×1,6×1,6)', 'UN', 16],
  ['P09', 'Drenagem', 'Bacia de Captação', 'UN', 1], ['P10', 'Drenagem', 'Bacia de Dissipação', 'UN', 1],
  ['P11', 'Demolição', 'Demolição de sarjeta', 'm²', 770], ['P12', 'Demolição', 'Demolição de passeio', 'm²', 5000],
  ['P13', 'Demolição', 'Demolição de piso rígido (paradas)', 'm²', 300], ['P14', 'Demolição', 'Demolição de pavimento asfáltico', 'm²', 13056],
  ['P15', 'Via', 'Guia PMSP 100 - via nova', 'ML', 1312], ['P16', 'Via', 'Guia PMSP 100 - reposição', 'ML', 2114],
  ['P17', 'Via', 'Superguia SPTrans', 'ML', 100], ['P18', 'Via', 'Sarjeta', 'ML', 2851], ['P19', 'Via', 'Sarjetão', 'ML', 63],
  ['P20', 'Via', 'Passeio cimentado', 'm²', 4569], ['P21', 'Via', 'Piso podotátil', 'm²', 62.53],
  ['P22', 'Vala Técnica', 'Vala técnica + dutos', 'ML', 1800], ['P23', 'Vala Técnica', 'Caixa subterrânea R1', 'UN', 52],
  ['P24', 'Vala Técnica', 'Caixa subterrânea R2', 'UN', 15],
  ['P25', 'Pav. Flexível', 'Rachão', 'm²', 3598], ['P26', 'Pav. Flexível', 'BGS', 'm²', 17389], ['P27', 'Pav. Flexível', 'BGTC', 'm²', 17389],
  ['P28', 'Pav. Flexível', 'Binder asfáltico', 'm²', 17389], ['P29', 'Pav. Flexível', 'SMA - Capa de rolamento', 'm²', 17389],
  ['P30A', 'Pav. Rígido', 'Pav. rígido: Preparo + Bases', 'm²', 990], ['P30B', 'Pav. Rígido', 'Pav. rígido: Lona + Imprimações', 'm²', 990],
  ['P30C', 'Pav. Rígido', 'Pav. rígido: Placa armada', 'm²', 990],
  ['P31', 'Sinalização', 'Pintura horizontal', 'm²', 1199], ['P32', 'Sinalização', 'Tachas/Tachões', 'UN', 1725],
  ['P33', 'Sinalização', 'Sinalização vertical', 'm²', 48.4], ['P34', 'Drenagem', 'Galeria', 'm', 45],
  ['P35', 'Desapropriações', 'Demolição de muros', 'm²', 1100], ['P36', 'Desapropriações', 'Reconstrução de muros de divisa', 'm²', 1100],
];
function pacotesCsv() {
  const rows = [['ID', 'Frente', 'Pacote', 'Unidade Física', 'Qtd Estimada', 'Produtividade', 'Status', 'Observação']];
  for (const [id, f, n, u, q] of PAC) rows.push([id, f, n, u, H.pt(q), H.pt(10), id === 'P05' ? 'Histórico' : 'Ativo', '']);
  return H.csv(rows);
}

// uma semente fixa: o mesmo passeio vê a mesma obra
let s = 20240509;
const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
const pick = a => a[Math.floor(rnd() * a.length)];

// equipes por etapa: pacotes, ritmo (estacas/dia útil) e folga atrás da etapa anterior
const EQUIPES = [
  { pac: ['P14', 'P14', 'P11', 'P12', 'P13'], ritmo: 0.22, folga: 0 },
  { pac: ['P01', 'P02', 'P03', 'P04', 'P06', 'P08', 'P22', 'P23'], ritmo: 0.075, folga: 3 },
  { pac: ['P15', 'P16', 'P18', 'P17', 'P19'], ritmo: 0.12, folga: 3 },
  { pac: ['P25', 'P26'], ritmo: 0.13, folga: 2 },
  { pac: ['P27'], ritmo: 0.13, folga: 2 },
  { pac: ['P28'], ritmo: 0.16, folga: 3 },
  { pac: ['P29'], ritmo: 0.16, folga: 2 },
  { pac: ['P31', 'P32', 'P33'], ritmo: 0.3, folga: 4 },
];
const EIXOS = [{ id: 'BC', ini: 201, fim: 244, comeca: '2024-05-20' }, { id: 'CB', ini: 99, fim: 141, comeca: '2024-10-07' }];
const APONT = ['Wallace', 'Guilherme', 'Leonardo', 'Marcos'];

function rdoCsv({ ate = '2026-10-09' } = {}) {
  const head = ['id', 'Data', 'Pacote_ID', 'Quantidade', 'Local_Estaca', 'Equipe', 'Apontador', 'Turno', 'Observações', 'foto_link', 'usuario', 'timestamp', 'obra'];
  const rows = [head];
  let n = 0;
  const lanca = (iso, pid, a, b, eixo) => {
    const loc = a === b ? `E${a} (${eixo})` : `E${a} a E${b} (${eixo})`;
    const ap = pick(APONT), foto = rnd() < 0.28 ? 'drive_id:f' + n + (rnd() < 0.3 ? ' drive_id:g' + n : '') : '';
    rows.push(['r' + n, iso, pid, H.pt(Math.round((b - a + 1) * (20 + rnd() * 60) * 10) / 10), loc, 'Equipe ' + (1 + Math.floor(rnd() * 4)),
      ap, rnd() < 0.15 ? 'Noturno' : 'Diurno', rnd() < 0.08 ? 'Interferência com rede da Sabesp' : '', foto, ap, iso + 'T12:00:00Z', 'teotonio']);
    n++;
  };
  for (const E of EIXOS) {
    const pos = EQUIPES.map(() => E.ini - 0.0001);  // até onde cada equipe chegou
    for (let d = new Date(E.comeca + 'T12:00:00Z'); d.toISOString().slice(0, 10) <= ate; d = new Date(d.getTime() + 86400000)) {
      if (d.getUTCDay() === 0) continue;                 // domingo
      const iso = d.toISOString().slice(0, 10);
      EQUIPES.forEach((q, k) => {
        if (rnd() < 0.18) return;                        // chuva, falta de material…
        const teto = k === 0 ? E.fim + 1 : pos[k - 1] - q.folga;
        if (pos[k] >= Math.min(teto, E.fim + 1) - 0.01) return;
        const novo = Math.min(teto, E.fim + 1, pos[k] + q.ritmo * (0.4 + rnd() * 1.2));
        const a = Math.max(E.ini, Math.floor(pos[k])), b = Math.min(E.fim, Math.max(a, Math.floor(novo - 0.001)));
        pos[k] = novo;
        lanca(iso, pick(q.pac), a, b, E.id);
      });
    }
  }
  // muros e desapropriação nos trechos deles
  const muros = [['P37A', 'CB', 103, 106, '2025-02-10'], ['P37B', 'CB', 103, 106, '2025-03-17'], ['P38A', 'BC', 212, 215, '2025-06-02'],
    ['P38B', 'BC', 212, 215, '2025-07-07'], ['P38C', 'BC', 212, 215, '2025-08-04'], ['P39A', 'CB', 129, 136, '2025-09-15'], ['P35', 'BC', 236, 238, '2024-06-10']];
  for (const [pid, eixo, a, b, iso] of muros) for (let i = 0; i < 4; i++) lanca(new Date(Date.parse(iso) + i * 5 * 86400000).toISOString().slice(0, 10), pid, a, b, eixo);
  // serviço avulso e lançamento sem estaca
  lanca('2026-09-30', 'OUTRO', 210, 210, 'BC');
  return H.csv(rows);
}
module.exports = { pacotesCsv, rdoCsv };

if (require.main === module) {
  const t = rdoCsv();
  const linhas = t.split('\r\n');
  console.log(linhas.length - 1, 'lançamentos');
  console.log(linhas.slice(1, 4).join('\n'));
  console.log(linhas.slice(-4).join('\n'));
}
