/* ============================================================
   NOTAS FISCAIS (DANFE) — Gestor, Controle de Obras
   ------------------------------------------------------------
   Registro das notas de material recebido na obra. O apontador
   fotografa a DANFE e o sistema tenta preencher tudo sozinho,
   nesta ordem:

     1. CODIGO DE BARRAS / QR da propria DANFE  -> chave de acesso
     2. CHAVE DE ACESSO (44 digitos)            -> numero, serie,
        CNPJ do emitente, UF e mes de emissao, sem nenhuma duvida
     3. LEITURA DA IMAGEM (OCR + IA no backend) -> o resto dos campos
     4. DIGITACAO                               -> sempre disponivel

   Nada aqui bloqueia o cadastro: se a leitura falhar, o apontador
   digita e salva do mesmo jeito.

   Este arquivo depende de funcoes do index.html (esc, toast, obra,
   postAcao, comprimirImg, abrirModal...). Ele so as chama em tempo
   de execucao, por isso pode ser carregado antes.

   ------------------------------------------------------------
   ARQUIVO COMPARTILHADO — mantenha os dois repositorios IGUAIS
   ------------------------------------------------------------
   O mesmo arquivo roda em `teotonio-vilela` e em `gestor-obras`.
   No teotonio quem faz a ponte de vocabulario e `js/nf/adaptador.js`;
   nao ha logica de negocio la dentro, entao o arquivo continua sendo
   copia literal dos dois lados.

   Ele ja divergiu: cada repo recebeu correcoes que o outro nao teve
   (parse de itens vindos como texto, limite de itens da nota, campos
   escondidos no modo simples). Todas foram reunidas aqui.

   Regra: alterou aqui, copie o arquivo INTEIRO para o outro repo no
   mesmo dia. Nada especifico de um app entra neste arquivo — se
   precisar, o lugar e o adaptador.

   Multi-obra: `ORDEM` e `OBRAS` so existem no gestor-obras. Onde forem
   usados, e obrigatorio checar `typeof` antes — no teotonio, que e de
   obra unica, o acesso direto lanca ReferenceError.
   ============================================================ */
'use strict';

/* ---------- constantes ---------- */
const NF_STATUS = ['Recebida', 'Em análise', 'Conferida', 'Divergência encontrada', 'Integrada ao estoque', 'Cancelada'];
const NF_STATUS_COR = {
  'Recebida': 'pill-blu', 'Em análise': 'pill-ylw', 'Conferida': 'pill-grn',
  'Divergência encontrada': 'pill-red', 'Integrada ao estoque': 'pill-grn',
  'Cancelada': 'pill-red'
};
const NF_UF = {11:'RO',12:'AC',13:'AM',14:'RR',15:'PA',16:'AP',17:'TO',21:'MA',22:'PI',23:'CE',24:'RN',25:'PB',26:'PE',27:'AL',28:'SE',29:'BA',31:'MG',32:'ES',33:'RJ',35:'SP',41:'PR',42:'SC',43:'RS',50:'MS',51:'MT',52:'GO',53:'DF'};
const NF_UN = ['UN','PC','CX','SC','KG','TON','M','M2','M3','L','MIL','CJ','BR','RL','GL','PAR'];
const NF_MAX_LADO = 1600;    // resolucao guardada da nota (o OCR precisa enxergar)
const NF_PAGINA = 24;        // quantas notas a lista mostra por vez

/* ---------- armazenamento local ---------- */
function nfKey(obraId) { return 'gestor:nf:' + obraId; }
function nfGet(obraId) {
  try {
    const arr = JSON.parse(localStorage.getItem(nfKey(obraId)) || '[]');
    arr.forEach(nfMigrarStatus);
    return arr;
  } catch (e) { return []; }
}
/* nota gravada quando existia pedido de compra: o status vira Conferida */
function nfMigrarStatus(n) {
  if (n && n.status === 'Integrada ao pedido de compra') n.status = 'Conferida';
  return n;
}
function nfSet(obraId, arr) { localStorage.setItem(nfKey(obraId), JSON.stringify(arr)); }
/* ENTRADAS sao derivadas: nascem da nota e podem ser recalculadas a qualquer
   momento. SAIDAS nao — ninguem consegue reconstruir um consumo depois. Por
   isso ficam em chave propria, com fila de sincronizacao e linha na planilha. */
function nfMovGet(obraId) { try { return JSON.parse(localStorage.getItem('gestor:nfmov:' + obraId) || '[]'); } catch (e) { return []; } }
function nfMovSet(obraId, arr) { localStorage.setItem('gestor:nfmov:' + obraId, JSON.stringify(arr)); }
function nfSaiKey(obraId) { return 'gestor:nfsaida:' + obraId; }
function nfSaiGet(obraId) { try { return JSON.parse(localStorage.getItem(nfSaiKey(obraId)) || '[]'); } catch (e) { return []; } }
function nfSaiSet(obraId, arr) { localStorage.setItem(nfSaiKey(obraId), JSON.stringify(arr)); }
function nfPorId(obraId, id) { return nfGet(obraId).find(n => n.id === id) || null; }

/* imagem em resolucao cheia: mesmo IndexedDB das fotos do RDO */
/* A folha 1 mantem a chave de sempre — nota antiga continua achando a
   imagem dela no aparelho. As folhas seguintes ganham sufixo. */
function nfImgChave(obraId, id, pagina) {
  const p = parseInt(pagina, 10);
  return 'nf:' + obraId + ':' + id + (p > 1 ? ':p' + p : '');
}
/* Quantas folhas a nota tem, contando a capa. */
function nfNumPaginas(n) { return 1 + ((n && n.paginas) || []).length; }

/* ---------- numeros, datas e documentos ---------- */
function nfNum(v) {
  if (typeof v === 'number') return isFinite(v) ? v : 0;
  if (v == null || v === '') return 0;
  let s = String(v).replace(/[^\d,.-]/g, '');
  const lc = s.lastIndexOf(','), ld = s.lastIndexOf('.');
  if (lc > -1 && ld > -1) {
    // tem os dois: o que vier por ultimo e o separador decimal
    s = lc > ld ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (lc > -1) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (ld > -1 && /\.\d{3}$/.test(s)) {
    // so ponto e o ultimo grupo com 3 digitos: e milhar, nao decimal.
    // "1.500" digitado aqui e mil e quinhentos, nao um e meio.
    s = s.replace(/\./g, '');
  }
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}
function nfDigitos(s) { return String(s == null ? '' : s).replace(/\D/g, ''); }
function nfISO(v) {
  if (!v) return '';
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = s.match(/(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})/);
  if (!m) return '';
  const a = m[3].length === 2 ? '20' + m[3] : m[3];
  return a + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2);
}
function nfDataBR(iso) { return iso ? new Date(iso + 'T00:00:00').toLocaleDateString('pt-BR') : '—'; }
function nfCNPJnorm(c) { return String(c == null ? '' : c).toUpperCase().replace(/[^A-Z0-9]/g, ''); }
function nfCNPJfmt(c) {
  const d = nfCNPJnorm(c);
  if (d.length !== 14) return c || '';
  return d.slice(0, 2) + '.' + d.slice(2, 5) + '.' + d.slice(5, 8) + '/' + d.slice(8, 12) + '-' + d.slice(12);
}
/* Vale para o CNPJ de sempre e para o alfanumerico: as 12 primeiras posicoes
   podem ter letra, os 2 digitos verificadores continuam numericos e o calculo
   usa ASCII menos 48 (para numero, da no mesmo de antes). */
function nfCNPJvalido(c) {
  const d = nfCNPJnorm(c);
  if (!/^[A-Z0-9]{12}\d{2}$/.test(d)) return false;
  if (/^(.)\1{13}$/.test(d)) return false;
  const calc = pesos => {
    let s = 0;
    for (let i = 0; i < pesos.length; i++) s += nfValCar(d[i]) * pesos[i];
    const r = s % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return calc([5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]) === +d[12] &&
         calc([6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]) === +d[13];
}

/* ---------- chave de acesso da NF-e (44 digitos) ----------
   cUF(2) AAMM(4) CNPJ(14) mod(2) serie(3) nNF(9) tpEmis(1) cNF(8) cDV(1)
   O digito verificador e modulo 11, entao da para saber se a leitura
   do codigo de barras veio certa antes de preencher qualquer campo.  */
/* A chave passou a aceitar LETRAS nas 12 posicoes do CNPJ do emitente
   (CNPJ alfanumerico, Nota Tecnica 2026.004). O digito verificador agora
   converte cada caractere pela tabela ASCII menos 48 antes do modulo 11.
   Para chave so de numeros o resultado e exatamente o mesmo de antes —
   a regra nova engloba a antiga. */
function nfValCar(c) { return String(c).charCodeAt(0) - 48; }
function nfChaveNorm(s) { return String(s == null ? '' : s).toUpperCase().replace(/[^A-Z0-9]/g, ''); }
function nfDVchave(ch43) {
  let p = 2, s = 0;
  for (let i = 42; i >= 0; i--) { s += nfValCar(ch43[i]) * p; p = p === 9 ? 2 : p + 1; }
  const r = s % 11;
  return (r === 0 || r === 1) ? 0 : 11 - r;
}
function nfChaveValida(ch) {
  const d = nfChaveNorm(ch);
  if (d.length !== 44) return false;
  // so o miolo do CNPJ pode ter letra; o resto continua numerico
  if (!/^\d{6}[A-Z0-9]{12}\d{26}$/.test(d)) return false;
  return nfDVchave(d.slice(0, 43)) === +d[43];
}
function nfDaChave(ch) {
  const d = nfChaveNorm(ch);
  if (d.length !== 44) return null;
  const uf = NF_UF[+d.slice(0, 2)] || '';
  const ano = '20' + d.slice(2, 4), mes = d.slice(4, 6);
  return {
    chave: d, uf: uf,
    cnpj: d.slice(6, 20),
    modelo: d.slice(20, 22),
    serie: String(+d.slice(22, 25)),
    numero: String(+d.slice(25, 34)),
    competencia: ano + '-' + mes,
    dataEmissao: ano + '-' + mes + '-01',   // a chave so garante mes/ano
    valida: nfDVchave(d.slice(0, 43)) === +d[43]
  };
}
function nfChaveDeTexto(txt) {
  // Junta tudo num so bloco e corre uma janela de 44. Na DANFE a chave sai em
  // grupos de 4 e no meio de muito outro texto; quebrar o texto em pedacos
  // fazia a chave sumir justamente quando ela caia na emenda de dois pedacos.
  const puro = nfChaveNorm(txt);
  if (puro.length < 44) return '';
  let reserva = '';
  for (let i = 0; i + 44 <= puro.length; i++) {
    const ch = puro.slice(i, i + 44);
    if (!nfChaveValida(ch)) continue;
    if (NF_UF[+ch.slice(0, 2)]) return ch;   // comeca com um codigo de UF real: e ela
    if (!reserva) reserva = ch;              // passou no digito mas com UF estranha
  }
  return reserva;
}

/* ============================================================
   1) LEITURA DO CODIGO DE BARRAS / QR
   Usa o BarcodeDetector do proprio navegador (Chrome/Android, que e
   o aparelho do campo). Sem biblioteca externa, sem download.
   ============================================================ */
function nfTemLeitorCodigo() { return typeof window !== 'undefined' && 'BarcodeDetector' in window; }

async function nfLerCodigos(fonte) {
  const res = { chave: '', codigos: [], suportado: nfTemLeitorCodigo() };
  if (!res.suportado) return res;
  try {
    let formatos = ['qr_code', 'code_128', 'itf', 'data_matrix', 'pdf417', 'code_39'];
    try {
      const sup = await window.BarcodeDetector.getSupportedFormats();
      if (sup && sup.length) formatos = formatos.filter(f => sup.indexOf(f) > -1);
    } catch (e) { /* alguns navegadores nao expoem a lista */ }
    if (!formatos.length) return res;
    const det = new window.BarcodeDetector({ formats: formatos });

    // 1a tentativa na imagem original; 2a numa versao reduzida (detector
    // costuma falhar em foto de 12 MP e acertar na mesma foto menor)
    const fontes = [fonte];
    try { fontes.push(await nfBitmapReduzido(fonte, 1400)); } catch (e) { /* segue com a original */ }

    for (const f of fontes) {
      if (!f) continue;
      let achados = [];
      try { achados = await det.detect(f); } catch (e) { achados = []; }
      for (const c of achados) {
        const valor = String(c.rawValue || '');
        res.codigos.push(valor);
        const ch = nfChaveDeTexto(valor);
        if (ch) { res.chave = ch; break; }
      }
      if (res.chave) break;
    }
  } catch (e) { /* sem leitor: segue para a leitura por imagem */ }
  return res;
}
function nfBitmapReduzido(fonte, maxLado) {
  return new Promise((res, rej) => {
    const desenhar = img => {
      let w = img.width || img.naturalWidth, h = img.height || img.naturalHeight;
      const m = Math.max(w, h);
      if (m > maxLado) { const k = maxLado / m; w = Math.round(w * k); h = Math.round(h * k); }
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      c.getContext('2d').drawImage(img, 0, 0, w, h);
      res(c);
    };
    if (fonte instanceof Blob) {
      const img = new Image();
      img.onload = () => desenhar(img);
      img.onerror = rej;
      img.src = URL.createObjectURL(fonte);
    } else if (typeof fonte === 'string') {
      const img = new Image(); img.onload = () => desenhar(img); img.onerror = rej; img.src = fonte;
    } else { desenhar(fonte); }
  });
}

/* ============================================================
   2) LEITURA DA IMAGEM (OCR + IA) — roda no backend
   A chave da IA fica nas propriedades do Apps Script, nunca no app.
   ============================================================ */
/* Busca a nota pela chave de acesso num serviço que tenha o certificado
   digital (consultadanfe, meudanfe, nfe.io...). Quando funciona é o melhor
   caminho de todos: os dados vêm do XML que o fornecedor emitiu, não de
   leitura de imagem. */
async function nfConsultarPelaChave(chave) {
  if (!BACKEND || isDemo()) return { ok: false, motivo: 'local' };
  try {
    const r = await postAcao({ action: 'nfConsultarChave', chave: chave, obra: (obra() || {}).id || '' });
    return r || { ok: false, motivo: 'sem_resposta' };
  } catch (e) {
    return { ok: false, motivo: 'rede' };
  }
}

async function nfLerImagemIA(dataUrl, chave, texto) {
  if (!BACKEND || isDemo()) return { ok: false, motivo: 'local' };
  try {
    // com o texto do PDF em mãos, mandar a imagem junto só atrapalha (e é
    // 10x mais caro): o texto já é a nota inteira, sem OCR no meio
    const temTexto = texto && texto.length > 200;
    const r = await postAcao({
      action: 'nfLerIA',
      foto: temTexto ? '' : dataUrl,
      texto: temTexto ? String(texto).slice(0, 24000) : '',
      chave: chave || ''
    });
    return r || { ok: false, motivo: 'sem_resposta' };
  } catch (e) {
    return { ok: false, motivo: 'rede' };
  }
}

/* junta o que veio da chave com o que veio da IA.
   A chave sempre ganha: ela e matematicamente verificavel. */
function nfMesclarLeitura(base, daChave, daIA) {
  const n = Object.assign({}, base);
  const conf = {};
  const por = (campo, valor, c) => {
    if (valor === '' || valor == null) return;
    if (typeof valor === 'number' && !valor && n[campo]) return;
    n[campo] = valor; conf[campo] = c;
  };
  if (daIA && daIA.ok && daIA.dados) {
    const d = daIA.dados, cIA = daIA.confianca || {};
    const c = k => (typeof cIA[k] === 'number' ? cIA[k] : (typeof daIA.confiancaGeral === 'number' ? daIA.confiancaGeral : 0.6));
    por('numero', String(d.numero || '').trim(), c('numero'));
    por('serie', String(d.serie || '').trim(), c('serie'));
    por('dataEmissao', nfISO(d.dataEmissao), c('dataEmissao'));
    por('dataEntrada', nfISO(d.dataEntrada), c('dataEntrada'));
    por('cnpj', nfCNPJnorm(d.cnpj), c('cnpj'));
    por('razaoSocial', String(d.razaoSocial || '').trim(), c('razaoSocial'));
    por('nomeFantasia', String(d.nomeFantasia || '').trim(), c('nomeFantasia'));
    por('municipio', String(d.municipio || '').trim(), c('municipio'));
    por('uf', String(d.uf || '').trim().toUpperCase().slice(0, 2), c('uf'));
    por('vProd', nfNum(d.vProd), c('vProd'));
    por('vFrete', nfNum(d.vFrete), c('vFrete'));
    por('vTotal', nfNum(d.vTotal), c('vTotal'));
    por('vBaseICMS', nfNum(d.vBaseICMS), c('vBaseICMS'));
    por('vICMS', nfNum(d.vICMS), c('vICMS'));
    let rawItens = d.itens;
    if (typeof rawItens === 'string') {
      try { rawItens = JSON.parse(rawItens); } catch (e) { rawItens = []; }
    }
    if (Array.isArray(rawItens) && rawItens.length) {
      n.itens = rawItens.slice(0, 200).map(it => ({
        codigo: String(it.codigo || '').trim(),
        descricao: String(it.descricao || '').trim(),
        qtd: nfNum(it.qtd),
        un: String(it.un || 'UN').trim().toUpperCase().slice(0, 6),
        vUnit: nfNum(it.vUnit),
        vTotal: nfNum(it.vTotal) || (nfNum(it.qtd) * nfNum(it.vUnit)),
        materialId: String(it.materialId || '').trim()
      })).filter(it => it.descricao);
      conf.itens = c('itens');
    }
    if (!nfChaveValida(n.chave)) por('chave', nfChaveNorm(d.chave).slice(0, 44), c('chave'));
  }
  // a chave por ultimo, para sobrepor a IA
  if (daChave && daChave.valida) {
    n.chave = daChave.chave;
    n.numero = daChave.numero; conf.numero = 1;
    n.serie = daChave.serie; conf.serie = 1;
    n.cnpj = daChave.cnpj; conf.cnpj = 1;
    n.uf = daChave.uf; conf.uf = 1;
    conf.chave = 1;
    // so completa o mes/ano se a IA nao tiver achado a data exata
    if (!n.dataEmissao || n.dataEmissao.slice(0, 7) !== daChave.competencia) {
      if (!n.dataEmissao) { n.dataEmissao = daChave.dataEmissao; conf.dataEmissao = 0.5; }
    }
  }
  if (nfNum(n.vTotal) && !nfNum(n.vProd)) n.vProd = nfNum(n.vTotal) - nfNum(n.vFrete);
  if (!nfNum(n.vTotal) && nfNum(n.vProd)) n.vTotal = nfNum(n.vProd) + nfNum(n.vFrete);
  n.leituraConf = conf;
  return n;
}
function nfConfBaixa(nota, campo) {
  const c = (nota && nota.leituraConf) ? nota.leituraConf[campo] : undefined;
  return typeof c === 'number' && c < 0.8;
}

/* ============================================================
   ASSOCIACAO INTELIGENTE
   Nao existe cadastro previo de material nesta obra, entao o
   catalogo e aprendido: cada item conferido vira referencia para
   as proximas notas. E o que da para fazer sem obrigar ninguem a
   cadastrar 300 materiais antes de usar.
   ============================================================ */
const NF_RUIDO = ['de', 'da', 'do', 'com', 'para', 'em', 'un', 'und', 'unid', 'pc', 'pct', 'cx', 'kg', 'mm', 'cm', 'ref'];
function nfNorm(s) {
  return String(s || '').toUpperCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9 ]/g, ' ')
    // separa letra de numero: cada fornecedor escreve de um jeito e
    // "DN400MM", "DN 400 MM" e "DN400 MM" sao o mesmo tubo
    .replace(/([A-Z])(\d)/g, '$1 $2').replace(/(\d)([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ').trim();
}
// numero de um digito conta (BRITA 1 nao e BRITA 2); letra solta, nao
function nfTokens(s) {
  return nfNorm(s).split(' ')
    .filter(t => (t.length > 1 || /\d/.test(t)) && NF_RUIDO.indexOf(t.toLowerCase()) === -1);
}
function nfSim(a, b) {
  const A = nfTokens(a), B = nfTokens(b);
  if (!A.length || !B.length) return 0;
  if (nfNorm(a) === nfNorm(b)) return 1;
  const sb = new Set(B);
  let inter = 0;
  A.forEach(t => { if (sb.has(t)) inter++; });
  const dice = (2 * inter) / (A.length + B.length);
  // numeros iguais (bitola, diametro) valem bonus: "TUBO PVC 100" x "TUBO PVC 150"
  const nA = A.filter(t => /\d/.test(t)), nB = B.filter(t => /\d/.test(t));
  if (nA.length && nB.length) {
    const igual = nA.filter(t => nB.indexOf(t) > -1).length;
    if (!igual) return dice * 0.55;
  }
  return dice;
}
/* catalogo aprendido das notas ja conferidas */
function nfMateriais(obraId) {
  const cat = {};
  nfGet(obraId).forEach(n => {
    if (n.status === 'Cancelada') return;
    (n.itens || []).forEach(it => {
      const k = it.materialId || nfNorm(it.descricao);
      if (!k) return;
      const m = cat[k] || (cat[k] = { id: k, descricao: it.descricao, un: it.un, notas: 0, qtd: 0, valor: 0, ultUnit: 0, fornecedores: {} });
      m.notas++; m.qtd += nfNum(it.qtd); m.valor += nfNum(it.vTotal);
      if (nfNum(it.vUnit)) m.ultUnit = nfNum(it.vUnit);
      if (n.cnpj) m.fornecedores[n.cnpj] = (n.razaoSocial || n.cnpj);
    });
  });
  return Object.values(cat).sort((a, b) => b.valor - a.valor);
}
/* ============================================================
   HISTORICO DE PRECO POR MATERIAL
   ------------------------------------------------------------
   Sai das proprias notas: cada item com valor unitario e uma compra.
   Serve para responder "esse material subiu?" e "qual fornecedor
   cobrou mais barato" sem cadastrar nada a mais.

   O preco medio e PONDERADO pela quantidade. Media simples mentiria:
   uma compra de 5 unidades pesaria igual a uma de 5.000.
   ============================================================ */
const NF_PRECO_ALERTA = 10;   // variacao em % a partir da qual vale destacar

function nfPrecos(obraId) {
  const cat = {};
  nfGet(obraId).forEach(n => {
    if (n.status === 'Cancelada') return;
    const data = n.dataEmissao || n.dataEntrada || '';
    (n.itens || []).forEach(it => {
      const vu = nfNum(it.vUnit);
      const qtd = nfNum(it.qtd);
      // sem valor unitario nao ha preco; qtd zero nao pondera
      if (vu <= 0 || qtd <= 0) return;
      const k = it.materialId || nfNorm(it.descricao);
      if (!k) return;
      const m = cat[k] || (cat[k] = { id: k, descricao: it.descricao, un: it.un || 'UN', compras: [] });
      m.compras.push({
        dataISO: data, vUnit: vu, qtd: qtd,
        cnpj: n.cnpj || '', fornecedor: n.razaoSocial || n.nomeFantasia || '',
        notaId: n.id, numero: n.numero || ''
      });
    });
  });
  return Object.values(cat).map(m => {
    // mais antiga primeiro: a variacao e do primeiro ao ultimo preco
    m.compras.sort((a, b) => (a.dataISO || '').localeCompare(b.dataISO || ''));
    const qt = m.compras.reduce((a, c) => a + c.qtd, 0);
    const vt = m.compras.reduce((a, c) => a + c.qtd * c.vUnit, 0);
    const precos = m.compras.map(c => c.vUnit);
    m.n = m.compras.length;
    m.qtdTotal = qt;
    m.valorTotal = vt;
    m.medio = qt ? vt / qt : 0;
    m.min = Math.min.apply(null, precos);
    m.max = Math.max.apply(null, precos);
    m.primeiro = m.compras[0].vUnit;
    m.ultimo = m.compras[m.compras.length - 1].vUnit;
    m.ultimaData = m.compras[m.compras.length - 1].dataISO;
    m.variacao = m.primeiro > 0 ? (m.ultimo - m.primeiro) / m.primeiro * 100 : 0;
    m.vsMedio = m.medio > 0 ? (m.ultimo - m.medio) / m.medio * 100 : 0;
    m.fornecedores = [...new Set(m.compras.map(c => c.fornecedor || c.cnpj).filter(Boolean))];
    // com um preco so nao existe variacao para comparar
    m.comparavel = m.n > 1;
    return m;
  }).sort((a, b) => b.valorTotal - a.valorTotal);
}

/* o fornecedor mais barato e o mais caro de um material, pelo preco unitario */
function nfPrecoExtremos(mat) {
  if (!mat || !mat.compras.length) return null;
  const ord = mat.compras.slice().sort((a, b) => a.vUnit - b.vUnit);
  return { barato: ord[0], caro: ord[ord.length - 1] };
}

function nfSugerirMaterial(desc, obraId) {
  return nfMateriais(obraId)
    .map(m => ({ material: m, score: nfSim(desc, m.descricao) }))
    .filter(x => x.score >= 0.62)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4);
}
function nfFornecedores(obraId) {
  const f = {};
  nfGet(obraId).forEach(n => {
    if (!n.cnpj || n.status === 'Cancelada') return;
    const x = f[n.cnpj] || (f[n.cnpj] = { cnpj: n.cnpj, nome: n.razaoSocial || n.nomeFantasia || nfCNPJfmt(n.cnpj), fantasia: n.nomeFantasia || '', municipio: n.municipio || '', uf: n.uf || '', notas: 0, valor: 0, ultima: '' });
    x.notas++; x.valor += nfNum(n.vTotal);
    if (n.razaoSocial && !x.nome) x.nome = n.razaoSocial;
    if (!x.ultima || (n.dataEmissao || '') > x.ultima) x.ultima = n.dataEmissao || '';
  });
  return Object.values(f).sort((a, b) => b.valor - a.valor);
}
/* fornecedor ja conhecido pelo CNPJ — evita cadastrar o mesmo duas vezes */
function nfFornecedorConhecido(obraId, cnpj) {
  const d = nfCNPJnorm(cnpj);
  if (d.length !== 14) return null;
  return nfFornecedores(obraId).find(f => f.cnpj === d) || null;
}

/* ============================================================
   ESTOQUE — entrada gerada a partir da nota confirmada
   ============================================================ */
function nfIntegrarEstoque(obraId, nota) {
  const movs = nfMovGet(obraId).filter(m => m.notaId !== nota.id);   // regrava, nunca duplica
  const lote = 'NF ' + (nota.numero || '?') + (nota.serie ? '/' + nota.serie : '');
  (nota.itens || []).forEach((it, i) => {
    if (!it.descricao || !nfNum(it.qtd)) return;
    movs.push({
      id: 'mv' + uid(), notaId: nota.id, itemIdx: i, tipo: 'entrada', lote: lote,
      materialId: it.materialId || nfNorm(it.descricao),
      descricao: it.descricao, un: it.un || 'UN',
      qtd: nfNum(it.qtd), vUnit: nfNum(it.vUnit), vTotal: nfNum(it.vTotal),
      cnpj: nota.cnpj || '', fornecedor: nota.razaoSocial || '',
      dataISO: nota.dataEntrada || nota.dataEmissao || hoje(),
      usuario: usuarioAtual(), criadoEm: Date.now()
    });
  });
  nfMovSet(obraId, movs);
  return movs.filter(m => m.notaId === nota.id).length;
}
function nfDesfazerEstoque(obraId, notaId) {
  nfMovSet(obraId, nfMovGet(obraId).filter(m => m.notaId !== notaId));
}
function nfSaldos(obraId) {
  const s = {};
  const pega = m => {
    const k = m.materialId || nfNorm(m.descricao);
    return s[k] || (s[k] = { id: k, descricao: m.descricao, un: m.un || 'UN', entradas: 0, saidas: 0, valor: 0, lotes: [], ultima: '' });
  };
  nfMovGet(obraId).forEach(m => {
    const x = pega(m);
    x.entradas += nfNum(m.qtd); x.valor += nfNum(m.vTotal);
    if (m.lote && x.lotes.indexOf(m.lote) === -1) x.lotes.push(m.lote);
    if (!x.ultima || (m.dataISO || '') > x.ultima) x.ultima = m.dataISO || '';
  });
  nfSaiGet(obraId).forEach(m => {
    const x = pega(m);
    x.saidas += nfNum(m.qtd);
    if (!x.ultima || (m.dataISO || '') > x.ultima) x.ultima = m.dataISO || '';
  });
  return Object.values(s).map(x => {
    x.saldo = x.entradas - x.saidas;
    // preco medio do que entrou: serve para valorizar o que ainda tem
    x.unitMedio = x.entradas > 0 ? x.valor / x.entradas : 0;
    x.valorSaldo = x.saldo * x.unitMedio;
    return x;
  }).sort((a, b) => b.valor - a.valor);
}
/* saldo de um material so — usado na validacao da saida */
function nfSaldoDe(obraId, materialId) {
  const s = nfSaldos(obraId).find(x => x.id === materialId);
  return s ? s.saldo : 0;
}

/* ============================================================
   SINCRONIZACAO — mesma fila/outbox do resto do app
   ============================================================ */
function nfEnfileirar(obraId, nota) {
  if (!BACKEND || isDemo()) return;
  const payload = {
    action: 'nfSalvar', obra: obraId, clientId: nota.clientId || nota.id, id: nota.id,
    numero: nota.numero || '', serie: nota.serie || '', chave: nota.chave || '',
    dataemissao: nota.dataEmissao || '', dataentrada: nota.dataEntrada || '',
    cnpj: nota.cnpj || '', razaosocial: nota.razaoSocial || '', nomefantasia: nota.nomeFantasia || '',
    municipio: nota.municipio || '', uf: nota.uf || '',
    vprod: nfNum(nota.vProd), vfrete: nfNum(nota.vFrete), vtotal: nfNum(nota.vTotal),
    vbaseicms: nfNum(nota.vBaseICMS), vicms: nfNum(nota.vICMS),
    itens: JSON.stringify(nota.itens || []), obs: nota.obs || '',
    responsavel: nota.responsavel || '', status: nota.status || 'Recebida',
    driveid: (nota.drive && nota.drive.fileId) || '', drivelink: (nota.drive && nota.drive.link) || '',
    // folhas 2..N; nota de uma folha so manda '[]' e a coluna nem e criada
    paginas: JSON.stringify((nota.paginas || []).filter(Boolean)),
    leitura: JSON.stringify(nota.leitura || {}), historico: JSON.stringify((nota.historico || []).slice(-30)),
    usuario: nota.usuario || usuarioAtual(), criadoem: nota.criadoEm || Date.now()
  };
  outboxAdd({ id: 'ob' + uid(), obra: obraId, tipo: 'nf', clientId: payload.clientId, params: payload });
  outboxFlush();
}
function nfEnfileirarExcluir(obraId, id) {
  if (!BACKEND || isDemo()) return;
  outboxAdd({ id: 'ob' + uid(), obra: obraId, tipo: 'nfDel', params: { action: 'nfExcluir', obra: obraId, id: id } });
  outboxFlush();
}
/* envia a imagem depois que a nota ja existe (mesma regra das fotos do RDO).
   `pagina` ausente ou 1 = a capa, que continua indo para `drive`; da 2 em
   diante o arquivo entra em `nota.paginas`, na posicao da folha. */
function nfEnviarImagem(obraId, nota, dataUrl, pagina) {
  if (!BACKEND || isDemo() || !dataUrl) return Promise.resolve(null);
  const pag = parseInt(pagina, 10) > 1 ? parseInt(pagina, 10) : 1;
  const comp = (nota.dataEntrada || nota.dataEmissao || hoje()).slice(0, 7);
  return postAcao({ action: 'nfImagem', obra: obraId, id: nota.id, competencia: comp,
                    numero: nota.numero || '', pagina: pag, foto: dataUrl })
    .then(r => {
      if (r && r.ok && r.fileId) {
        const arr = nfGet(obraId), n = arr.find(x => x.id === nota.id);
        if (n) {
          const ref = { fileId: r.fileId, link: r.link || '', pasta: r.pasta || '', enviadoEm: Date.now() };
          if (pag === 1) n.drive = ref;
          else {
            n.paginas = n.paginas || [];
            n.paginas[pag - 2] = ref;
            // uma folha que falhou deixaria buraco no meio da lista
            for (let i = 0; i < n.paginas.length; i++) if (!n.paginas[i]) n.paginas[i] = null;
          }
          nfSet(obraId, arr);
          nfEnfileirar(obraId, n);
        }
      }
      return r;
    })
    .catch(() => null);
}

/* ---------- auditoria ---------- */
function nfRegistrar(nota, acao, detalhe) {
  nota.historico = nota.historico || [];
  nota.historico.push({ quando: Date.now(), usuario: usuarioAtual() || '—', acao: acao, detalhe: detalhe || '' });
  nota.atualizadoEm = Date.now();
}
function nfDiff(antes, depois) {
  const campos = ['numero', 'serie', 'chave', 'dataEmissao', 'dataEntrada', 'cnpj', 'razaoSocial', 'vProd', 'vFrete', 'vTotal', 'vBaseICMS', 'vICMS', 'status', 'responsavel', 'obs'];
  const mud = [];
  campos.forEach(c => {
    const a = antes ? (antes[c] == null ? '' : String(antes[c])) : '';
    const b = depois[c] == null ? '' : String(depois[c]);
    if (a !== b) mud.push(c + ': "' + a + '" → "' + b + '"');
  });
  const ia = (antes && (antes.itens || []).length) || 0, ib = (depois.itens || []).length;
  if (ia !== ib) mud.push('itens: ' + ia + ' → ' + ib);
  return mud.join(' · ');
}

/* ============================================================
   FLUXO DO APONTADOR — fotografar e pronto
   ============================================================ */
let _nfRascunho = null;    // nota em conferencia
let _nfModoSimples = true; // formulario enxuto: so o essencial para digitar
let _nfFull = '';          // folha 1 em resolucao cheia da nota em conferencia
let _nfPags = [];          // folhas 2..N, na ordem (data-uris em resolucao cheia)

function nfNovaVazia(obraId) {
  return {
    id: 'nf' + uid(), clientId: 'nf' + uid(), obraId: obraId,
    numero: '', serie: '', chave: '', dataEmissao: '', dataEntrada: hoje(),
    cnpj: '', razaoSocial: '', nomeFantasia: '', municipio: '', uf: '',
    vProd: 0, vFrete: 0, vTotal: 0, vBaseICMS: 0, vICMS: 0,
    itens: [], obs: '', responsavel: usuarioAtual() || '', status: 'Recebida',
    drive: null, paginas: [], thumb: '', leitura: { metodo: 'manual', quando: Date.now() }, leituraConf: {},
    historico: [], usuario: usuarioAtual() || '', criadoEm: Date.now(), atualizadoEm: Date.now()
  };
}

function nfAbrirNova() {
  const o = obra(); if (!o) return;
  if (!pode('lancarNota')) { toast('Seu acesso não cadastra nota fiscal'); return; }
  _nfRascunho = nfNovaVazia(o.id); _nfFull = ''; _nfPags = [];
  abrirModal('Nova nota fiscal', `
    <div id="nfPasso">
      <div class="empty" style="padding:14px 6px 18px">
        ${ic('notas')}
        <div style="font-size:14px;color:var(--text-2);line-height:1.5">Fotografe a DANFE inteira, de frente e sem sombra.<br>
        O sistema lê o código de barras, a chave de acesso e o restante dos dados sozinho.</div>
      </div>
      <label class="btn btn-pri" style="width:100%;justify-content:center;margin-bottom:9px;cursor:pointer">${ic('camera')} Fotografar a nota
        <input type="file" accept="image/*" capture="environment" onchange="nfArquivoSelecionado(this)" style="display:none"></label>
      <label class="btn" style="width:100%;justify-content:center;margin-bottom:4px;cursor:pointer">${ic('arquivo')} Escolher arquivo (PDF ou imagem)
        <input type="file" accept="image/*,application/pdf,.pdf" onchange="nfArquivoSelecionado(this)" style="display:none"></label>
      <div class="kpi-s" style="text-align:center;margin-bottom:14px">Se você tem o <b>PDF da DANFE</b>, use-o: o texto vem direto do arquivo e a leitura sai certa.</div>
      <div class="card" style="box-shadow:none"><div class="card-b" style="padding:13px 15px">
        <label class="fl">Não tem a nota em mãos?</label>
        <div class="row" style="gap:8px">
          <input id="nfChaveManual" inputmode="numeric" placeholder="Chave de acesso (44 dígitos)" style="flex:1;min-width:190px">
          <button class="btn" onclick="nfUsarChaveDigitada()">Usar chave</button></div>
        <button class="btn btn-ghost" style="width:100%;justify-content:center;margin-top:8px" onclick="_nfModoSimples=true;nfConferir()">Preencher à mão</button>
      </div></div>
    </div>`, 620);
}

function nfPassoUI(linhas) {
  const box = el('nfPasso'); if (!box) return;
  box.innerHTML = `<div class="card" style="box-shadow:none"><div class="card-b" style="padding:16px 18px">
    ${linhas.map(l => `<div style="display:flex;gap:10px;align-items:flex-start;padding:7px 0;font-size:13.5px">
      <span class="nf-passo-ic ${l.st === 'ok' ? 'ok' : ''}">${l.ic === 'traco' ? '—' : (l.ic ? ic(l.ic) : '·')}</span>
      <span style="flex:1;color:${l.st === 'ok' ? 'var(--text)' : 'var(--muted)'}">${l.t}</span></div>`).join('')}
    </div></div>`;
}

/* ---------- PDF da DANFE ----------
   O PDF quase sempre traz o texto embutido. Nesse caso não há OCR nenhum:
   os campos saem do próprio arquivo, sem erro de leitura. Só quando o PDF é
   um escaneado (sem texto) é que se cai na imagem. */
function nfCanvasJpeg(canvas, maxLado, q) {
  let w = canvas.width, h = canvas.height;
  const m = Math.max(w, h);
  if (m <= maxLado) return canvas.toDataURL('image/jpeg', q);
  const k = maxLado / m;
  const c = document.createElement('canvas');
  c.width = Math.round(w * k); c.height = Math.round(h * k);
  const x = c.getContext('2d');
  x.imageSmoothingQuality = 'high';
  x.drawImage(canvas, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', q);
}
function nfPDFdeBase64(b64) {
  const bin = atob(String(b64).replace(/\s/g, ''));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new File([bytes], 'danfe.pdf', { type: 'application/pdf' });
}
/* Quantas folhas o app guarda de uma nota. DANFE de duas paginas e comum
   (a segunda traz a continuacao dos itens); o teto existe so para um PDF
   errado de 80 folhas nao virar 80 idas ao Drive. */
const NF_MAX_PAGINAS = 8;

async function nfLerPDF(file) {
  const out = { texto: '', thumb: '', full: '', paginas: 0, extras: [] };
  // O PDF.js e pesado (313 KB) e so faz falta quando chega uma DANFE em PDF.
  // O app carrega sob demanda; aqui pedimos e seguimos sem ele se falhar —
  // a leitura cai para OCR na imagem, que e o plano B de sempre.
  if (typeof window.usarLib === 'function') {
    try { await window.usarLib('lerPdf'); } catch (e) { return out; }
  }
  if (!window.pdfjsLib) return out;
  const buf = await file.arrayBuffer();
  const doc = await window.pdfjsLib.getDocument({ data: buf }).promise;
  out.paginas = doc.numPages;
  // a DANFE cabe em poucas folhas; ler tudo de uma nota de 40 páginas é desperdício
  const lim = Math.min(doc.numPages, 4);
  for (let i = 1; i <= lim; i++) {
    const pg = await doc.getPage(i);
    const tc = await pg.getTextContent();
    out.texto += tc.items.map(it => it.str).join(' ') + '\n';
  }
  out.texto = out.texto.replace(/[ \t]+/g, ' ').trim();
  /* TODAS as folhas viram imagem, nao so a primeira. Antes o PDF de duas
     paginas era lido inteiro (o texto), mas so a folha 1 era guardada: a
     comprovacao da nota ficava pela metade e ninguem era avisado disso.
     A folha 1 segue sendo a capa (miniatura, Drive, visualizacao); as
     demais entram em `extras`, na ordem. */
  const paraJpeg = async (num) => {
    const pg = await doc.getPage(num);
    const v1 = pg.getViewport({ scale: 1 });
    const escala = Math.min(3, Math.max(1, NF_MAX_LADO / Math.max(v1.width, v1.height)));
    const vp = pg.getViewport({ scale: escala });
    const c = document.createElement('canvas');
    c.width = Math.round(vp.width); c.height = Math.round(vp.height);
    const cx = c.getContext('2d');
    cx.fillStyle = '#fff'; cx.fillRect(0, 0, c.width, c.height);
    await pg.render({ canvasContext: cx, viewport: vp }).promise;
    return c;
  };
  const c1 = await paraJpeg(1);
  out.full = nfCanvasJpeg(c1, NF_MAX_LADO, .85);
  out.thumb = nfCanvasJpeg(c1, 320, .6);
  const ate = Math.min(doc.numPages, NF_MAX_PAGINAS);
  for (let i = 2; i <= ate; i++) {
    try { out.extras.push(nfCanvasJpeg(await paraJpeg(i), NF_MAX_LADO, .85)); }
    catch (e) { break; }   // uma folha ilegivel nao pode derrubar a nota toda
  }
  return out;
}

async function nfArquivoSelecionado(inp) {
  const escolhidos = [...(inp.files || [])]; inp.value = '';
  const f = escolhidos[0];
  const ehPDF = f && (/pdf/i.test(f.type) || /\.pdf$/i.test(f.name || ''));
  if (!f || (!ehPDF && !/^image\//.test(f.type))) { toast('Escolha o PDF ou uma foto da nota'); return; }
  // Fotografou as duas folhas de uma vez: a 1a e a capa, as outras entram
  // como paginas. Antes o codigo pegava files[0] e descartava o resto — em
  // silencio, o que e o pior jeito de perder a segunda folha de uma nota.
  const outrasFotos = escolhidos.slice(1).filter(x => /^image\//.test(x.type));
  const o = obra(); if (!o) return;
  const passos = [
    { ic: 'ampulheta', t: ehPDF ? 'Abrindo o PDF…' : 'Preparando a imagem…', st: '' },
    { ic: '', t: ehPDF ? 'Procurando a chave de acesso no arquivo' : 'Procurando o código de barras da DANFE', st: '' },
    { ic: '', t: 'Lendo os dados da nota', st: '' }
  ];
  nfPassoUI(passos);

  let thumb = '', full = '', textoPDF = '', extras = [], totalPDF = 0;
  if (ehPDF) {
    try {
      const p = await nfLerPDF(f);
      thumb = p.thumb; full = p.full; textoPDF = p.texto;
      extras = p.extras || []; totalPDF = p.paginas || 1;
    } catch (e) { toast('Não consegui abrir esse PDF'); nfAbrirNova(); return; }
    const quantas = 1 + extras.length;
    passos[0] = { ic: 'check', st: 'ok',
      t: (quantas > 1 ? quantas + ' páginas guardadas — ' : '') +
         (textoPDF.length > 200 ? 'texto lido do PDF' : 'PDF aberto (parece ser digitalizado)') };
    if (totalPDF > quantas) {
      toast(`O PDF tem ${totalPDF} páginas; guardei as ${quantas} primeiras.`, 'info', 6000);
    }
  } else {
    try {
      const r = await Promise.all([comprimirImg(f, 320, .55), comprimirImg(f, NF_MAX_LADO, .88)]);
      thumb = r[0]; full = r[1];
      for (const x of outrasFotos.slice(0, NF_MAX_PAGINAS - 1)) {
        try { extras.push(await comprimirImg(x, NF_MAX_LADO, .88)); } catch (e) { /* pula a que nao abriu */ }
      }
    } catch (e) { toast('Não consegui ler essa imagem'); nfAbrirNova(); return; }
    passos[0] = { ic: 'check', st: 'ok',
      t: extras.length ? (1 + extras.length) + ' páginas prontas' : 'Imagem pronta' };
  }
  passos[1].ic = 'ampulheta'; nfPassoUI(passos);

  _nfRascunho.thumb = thumb; _nfFull = full; _nfPags = extras;

  // 1) chave de acesso — do texto do PDF ou do código de barras da foto.
  //    Nos dois casos o dígito verificador confirma que veio certa.
  let chaveAchada = '', comoAchou = '';
  if (textoPDF) {
    chaveAchada = nfChaveDeTexto(textoPDF);
    if (chaveAchada) comoAchou = 'Chave de acesso lida do PDF';
  }
  let cod = { codigos: [], suportado: nfTemLeitorCodigo() };
  if (!chaveAchada && !ehPDF) {
    cod = await nfLerCodigos(f);
    chaveAchada = cod.chave;
    if (chaveAchada) comoAchou = 'Chave de acesso lida do código de barras';
  }
  const daChave = chaveAchada ? nfDaChave(chaveAchada) : null;
  passos[1] = daChave
    ? { ic: 'check', t: comoAchou, st: 'ok' }
    : { ic: 'traco', t: ehPDF ? 'Sem chave de acesso legível no arquivo' : (cod.suportado ? 'Sem código legível na foto' : 'Este aparelho não lê código de barras'), st: '' };
  passos[2].ic = 'ampulheta'; nfPassoUI(passos);

  // 2) com a chave em mãos, buscar a nota oficial antes de tentar ler imagem
  let consulta = null;
  if (daChave) {
    passos[2] = { ic: 'ampulheta', t: 'Buscando a nota pela chave de acesso', st: '' };
    nfPassoUI(passos);
    consulta = await nfConsultarPelaChave(daChave.chave);
  }

  // 3) só se a consulta não resolveu é que se recorre ao texto/imagem
  let ia = null;
  if (consulta && consulta.ok) {
    passos[2] = { ic: 'check', t: 'Nota obtida pela chave — dados oficiais da NF-e', st: 'ok' };
    // a consulta devolve o DANFE oficial em PDF: vale mais como arquivo da
    // nota do que a foto tirada no barracão
    if (consulta.pdf) {
      try {
        const oficial = await nfLerPDF(nfPDFdeBase64(consulta.pdf));
        if (oficial.full) { thumb = oficial.thumb; full = oficial.full; _nfRascunho.thumb = thumb; _nfFull = full; }
      } catch (e) { /* fica com a imagem que o apontador enviou */ }
    }
  } else {
    passos[2] = { ic: 'ampulheta', t: textoPDF.length > 200 ? 'Lendo os dados do texto do PDF' : 'Lendo os dados da imagem', st: '' };
    nfPassoUI(passos);
    ia = await nfLerImagemIA(full, daChave ? daChave.chave : '', textoPDF);
    if (ia && ia.ok) passos[2] = { ic: 'check', t: textoPDF.length > 200 ? 'Dados extraídos do PDF' : 'Dados extraídos da imagem', st: 'ok' };
    else passos[2] = { ic: 'traco', t: nfMotivoTxt(ia), st: '' };
  }
  nfPassoUI(passos);
  const fonte = (consulta && consulta.ok) ? consulta : ia;
  // falha do lado do servidor: guarda para o botão de teste explicar direito
  if (ia && !ia.ok && ['api', 'autorizacao', 'chave_invalida', 'chave_sem_acesso', 'modelo', 'limite', 'vazia', 'resposta', 'bloqueado'].indexOf(ia.motivo) > -1) {
    _nfUltimaFalhaIA = ia;
  }

  let nota = nfMesclarLeitura(_nfRascunho, daChave, fonte);
  const leuAlgo = !!daChave || !!(fonte && fonte.ok);
  nota.leitura = {
    metodo: (consulta && consulta.ok) ? 'consulta'
      : daChave ? (ehPDF ? 'pdf+chave' : (ia && ia.ok ? 'codigo+ia' : 'codigo'))
      : (ia && ia.ok ? (ehPDF ? 'pdf' : 'ia') : 'manual'),
    origem: ehPDF ? 'pdf' : 'foto',
    codigos: (cod.codigos || []).slice(0, 3),
    quando: Date.now(),
    modelo: (ia && ia.modelo) || '',
    confiancaGeral: (fonte && fonte.confiancaGeral) || (daChave ? 1 : 0)
  };
  // quem não teve nada lido vai digitar: abre o formulário enxuto
  _nfModoSimples = !leuAlgo;
  if (!nota.dataEntrada) nota.dataEntrada = hoje();
  nfRegistrar(nota, 'leitura automática', nota.leitura.metodo);
  nfAutoVincular(o.id, nota);
  _nfRascunho = nota;
  setTimeout(() => nfConferir(), 450);
}

async function nfUsarChaveDigitada() {
  const v = el('nfChaveManual') ? el('nfChaveManual').value : '';
  const ch = nfChaveNorm(v);
  if (ch.length !== 44) { toast('A chave tem 44 caracteres'); return; }
  if (!nfChaveValida(ch)) { toast('Chave inválida — confira os caracteres'); return; }
  nfPassoUI([
    { ic: 'check', t: 'Chave de acesso conferida', st: 'ok' },
    { ic: 'ampulheta', t: 'Buscando a nota pela chave', st: '' }
  ]);
  const consulta = await nfConsultarPelaChave(ch);
  if (consulta && consulta.ok && consulta.pdf) {
    try {
      const oficial = await nfLerPDF(nfPDFdeBase64(consulta.pdf));
      if (oficial.full) { _nfRascunho.thumb = oficial.thumb; _nfFull = oficial.full; }
    } catch (e) { /* segue sem imagem */ }
  }
  _nfRascunho = nfMesclarLeitura(_nfRascunho, nfDaChave(ch), consulta && consulta.ok ? consulta : null);
  _nfRascunho.leitura = {
    metodo: (consulta && consulta.ok) ? 'consulta' : 'chave',
    quando: Date.now(), confiancaGeral: 1
  };
  nfRegistrar(_nfRascunho, (consulta && consulta.ok) ? 'nota obtida pela chave' : 'chave digitada', ch);
  nfAutoVincular(obra().id, _nfRascunho);
  _nfModoSimples = false;
  nfConferir();
}

/* preenche fornecedor conhecido e vincula itens com alta compatibilidade */
function nfAutoVincular(obraId, nota) {
  const forn = nfFornecedorConhecido(obraId, nota.cnpj);
  if (forn) {
    if (!nota.razaoSocial) nota.razaoSocial = forn.nome;
    if (!nota.nomeFantasia) nota.nomeFantasia = forn.fantasia;
    if (!nota.municipio) nota.municipio = forn.municipio;
    if (!nota.uf) nota.uf = forn.uf;
  }
  (nota.itens || []).forEach(it => {
    if (!it.materialId) {
      const s = nfSugerirMaterial(it.descricao, obraId);
      if (s.length && s[0].score >= 0.85 && (s.length === 1 || s[0].score - s[1].score > 0.12)) it.materialId = s[0].material.id;
    }
  });
}

/* motivo da falha em português, para o apontador não ficar no escuro */
let _nfUltimaFalhaIA = null;
function nfMotivoTxt(ia) {
  const m = (ia && ia.motivo) || '';
  return ({
    local: 'Sem servidor — confira os campos abaixo',
    sem_ia: 'Leitura por imagem não está ligada no servidor',
    autorizacao: 'O servidor ainda não tem permissão para usar a IA',
    chave_invalida: 'A chave da IA foi recusada pelo Google',
    chave_sem_acesso: 'A chave da IA não tem acesso à API',
    modelo: 'O modelo de IA configurado não existe',
    limite: 'Cota da IA esgotada — tente daqui a pouco',
    longa: 'Nota comprida demais para uma leitura só',
    bloqueado: 'A IA recusou a imagem',
    vazia: 'A IA não devolveu os dados',
    resposta: 'A IA respondeu num formato inesperado',
    rede: 'Não consegui falar com o servidor',
    sem_resposta: 'O servidor não respondeu',
    // consulta da nota pela chave
    sem_api: 'Consulta por chave não está ligada',
    nao_encontrada: 'A SEFAZ não devolveu essa nota (fora do mês corrente ou ainda não autorizada)',
    chave_recusada: 'A consulta recusou a chave',
    pendente: 'Nota em contingência — ainda não disponível na SEFAZ',
    sefaz: 'A SEFAZ está fora do ar no momento',
    sem_xml: 'A consulta respondeu, mas sem o XML da nota'
  })[m] || 'Não consegui ler a imagem — confira os campos';
}

/* Diagnóstico da leitura automática. Existe porque "não leu a nota" pode ser
   backend antigo, chave errada, autorização faltando ou cota estourada — e o
   apontador não tem como adivinhar qual. */
async function nfTestarLeitura() {
  if (isDemo()) { toast('Saia do modo demonstração para testar'); return; }
  if (!BACKEND) { abrirModal('Teste da leitura', `<div class="nf-alerta nf-alerta-ylw">O app está sem servidor configurado. A leitura da nota funciona pelo código de barras e pela chave de acesso; os demais campos são digitados.</div>`, 560); return; }
  abrirModal('Teste da leitura', `<div class="empty">${ic('ampulheta')}Conversando com o servidor…</div>`, 560);
  let r = null;
  try { r = await postAcao({ action: 'nfDiag' }); } catch (e) { r = null; }

  const bloco = (cor, titulo, texto, passos) => `
    <div class="nf-alerta nf-alerta-${cor}"><b>${titulo}</b><br>${texto}</div>
    ${passos ? `<div style="font-size:13.5px;line-height:1.7">${passos}</div>` : ''}`;

  if (!r) {
    abrirModal('Teste da leitura', bloco('red', 'Não consegui falar com o servidor.',
      'Confira a conexão e tente de novo.'), 560);
    return;
  }
  // backend antigo: a ação nem existe lá
  if (r.error && /desconhecida/i.test(r.error)) {
    abrirModal('Teste da leitura', bloco('red', 'O backend publicado está desatualizado.',
      'A versão no ar não conhece o módulo de notas fiscais.',
      `<b>Como resolver:</b><br>
       1. Abra a planilha → <b>Extensões ▸ Apps Script</b><br>
       2. Cole o <b>Code.gs</b> novo por cima e salve<br>
       3. <b>Implantar ▸ Gerenciar implantações ▸ ✏️ Editar ▸ Versão: Nova versão ▸ Implantar</b><br>
       <span style="color:var(--vermelho)">Nunca use "Nova implantação" — isso cria outro endereço e o app continua no antigo.</span>`), 620);
    return;
  }
  if (r.error && /TOKEN/i.test(r.error)) {
    abrirModal('Teste da leitura', bloco('ylw', 'Sua sessão expirou.', 'Saia e entre de novo no app.'), 560);
    return;
  }
  if (r.leituraOk) {
    abrirModal('Teste da leitura', bloco('grn', ic('checkCirculo') + ' Leitura automática funcionando',
      esc(r.mensagem || ''),
      `Modelo: <b>${esc(r.modelo || '')}</b>`), 560);
    return;
  }
  let extra = '';
  if (r.motivo === 'autorizacao' || r.precisaAutorizar) {
    extra = `<b>Como resolver:</b><br>
       1. Abra a planilha → <b>Extensões ▸ Apps Script</b><br>
       2. No seletor de função lá em cima, escolha <b>autorizarInternet</b> e clique em <b>▶ Executar</b><br>
       3. Aceite a autorização que o Google pedir<br>
       4. Volte aqui e teste de novo
       <div class="kpi-s" style="margin-top:8px">Essa função existe só para o Google perguntar. Rodar o <b>nfDiag</b> não serve: sem a chave cadastrada ele volta antes de tocar na internet e o Google não pergunta nada.</div>
       ${r.autorizacaoUrl ? `<a class="btn btn-pri" style="width:100%;justify-content:center;margin-top:10px" href="${esc(r.autorizacaoUrl)}" target="_blank" rel="noopener">Autorizar agora</a>` : ''}`;
  } else if (r.chaveConfigurada === false) {
    extra = `<b>Como resolver:</b><br>
       1. Pegue a chave em <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">aistudio.google.com/apikey</a><br>
       2. Apps Script → <b>⚙ Configurações do projeto ▸ Propriedades do script</b><br>
       3. Adicione <b>GEMINI_API_KEY</b> com a chave e salve`;
  }
  // o erro cru sempre aparece: é o que permite descobrir o que ninguém previu
  const tec = [];
  if (r.motivo) tec.push('motivo: ' + r.motivo);
  if (r.codigo) tec.push('código: ' + r.codigo);
  if (r.modelo) tec.push('modelo: ' + r.modelo);
  if (typeof r.tamanhoChave === 'number') tec.push('tamanho da chave: ' + r.tamanhoChave);
  if (r.propriedades) tec.push('propriedades: ' + r.propriedades);
  if (r.versaoBackend) tec.push('backend: ' + r.versaoBackend);
  if (r.detalhe) tec.push('detalhe: ' + String(r.detalhe).slice(0, 300));

  abrirModal('Teste da leitura', bloco('ylw', 'A leitura por imagem não está funcionando.',
    esc(r.mensagem || 'Motivo não informado.'), extra) +
    `<div class="kpi-s" style="margin-top:12px">O cadastro de notas continua funcionando: o código de barras e a chave de acesso já preenchem número, série, CNPJ e UF.</div>
     ${tec.length ? `<details style="margin-top:12px"><summary class="kpi-s" style="cursor:pointer">${ic('ajustes')} Detalhes técnicos (para mandar a quem der suporte)</summary>
       <pre class="mono" style="font-size:11px;white-space:pre-wrap;word-break:break-word;background:var(--surface-2);border:1px solid var(--border);border-radius:8px;padding:10px;margin-top:8px">${esc(tec.join('\n'))}</pre></details>` : ''}`, 620);
}

/* ---------- tela de conferência ---------- */
function nfConferir() {
  const o = obra(); if (!o || !_nfRascunho) return;
  const n = _nfRascunho;
  const dup = nfGet(o.id).find(x => x.id !== n.id && ((n.chave && x.chave === n.chave) ||
    (n.numero && n.cnpj && x.numero === n.numero && x.cnpj === n.cnpj)));
  const marca = c => nfConfBaixa(n, c) ? ' nf-confira' : '';
  const aviso = c => nfConfBaixa(n, c) ? '<span class="nf-tag-confira">confira</span>' : '';
  const totItens = (n.itens || []).reduce((a, it) => a + nfNum(it.vTotal), 0);
  const difer = nfNum(n.vTotal) && Math.abs(nfNum(n.vTotal) - (totItens + nfNum(n.vFrete))) > 0.05;

  // Todos os campos ficam no formulário; o modo enxuto apenas ESCONDE os
  // acessórios. Assim alternar não perde nada do que já foi digitado.
  abrirModal((n.criadoEm && nfPorId(o.id, n.id) ? 'Editar nota fiscal' : 'Conferir nota fiscal'), `
    ${n.thumb ? `<div style="display:flex;gap:12px;align-items:flex-start;margin-bottom:14px">
      <img src="${esc(n.thumb)}" alt="nota fiscal" onclick="nfVerImagem('${n.id}')" style="width:88px;height:110px;object-fit:cover;object-position:top center;border-radius:8px;border:1px solid var(--border-strong);cursor:zoom-in">
      <div style="flex:1;min-width:0">
        <div class="kpi-s">${nfLeituraTxt(n)}</div>
        ${n.chave ? `<div class="mono nf-extra" style="font-size:10.5px;word-break:break-all;margin-top:6px;color:var(--text-2)">${esc(n.chave)}</div>` : ''}
        <div id="nfPagsInfo" class="kpi-s" style="margin-top:4px">${nfPaginasTxt(n)}</div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px">
          <button class="btn btn-sm btn-ghost" style="padding-left:0" onclick="nfVerImagem('${n.id}')">${ic('lupa')} Ver a nota</button>
          <label class="btn btn-sm btn-ghost" style="cursor:pointer" title="A nota tem mais de uma folha? Junte-as aqui.">
            ${ic('mais')} Adicionar página
            <input type="file" accept="image/*,application/pdf,.pdf" multiple
                   onchange="nfAddPaginas(this)" style="display:none"></label>
        </div>
      </div></div>` : ''}
    ${dup ? `<div class="nf-alerta nf-alerta-red">Já existe a nota <b>${esc(dup.numero || '—')}</b> deste fornecedor no sistema. Salvar vai criar uma segunda.</div>` : ''}
    ${difer ? `<div class="nf-alerta nf-alerta-ylw">A soma dos itens + frete (${fmtBRL(totItens + nfNum(n.vFrete))}) não bate com o valor total da nota (${fmtBRL(nfNum(n.vTotal))}).</div>` : ''}

    <div id="nfForm" class="${_nfModoSimples ? 'nf-simples' : ''}">

    <div class="field"><label class="fl">Empresa (fornecedor) ${aviso('razaoSocial')}</label>
      <input id="nf_razaoSocial" class="${marca('razaoSocial')}" value="${esc(n.razaoSocial)}" placeholder="Razão social de quem emitiu a nota" list="nfFornLista">
      <datalist id="nfFornLista">${nfFornecedores(o.id).map(f => `<option value="${esc(f.nome)}">`).join('')}</datalist></div>
    <div class="field"><label class="fl">Data da nota ${aviso('dataEmissao')}</label>
      <input type="date" id="nf_dataEmissao" class="${marca('dataEmissao')}" value="${esc(n.dataEmissao)}"></div>

    <div class="nf-extra">
      <div class="row"><div class="field"><label class="fl">Número ${aviso('numero')}</label><input id="nf_numero" class="${marca('numero')}" value="${esc(n.numero)}" inputmode="numeric"></div>
        <div class="field" style="max-width:110px"><label class="fl">Série ${aviso('serie')}</label><input id="nf_serie" class="${marca('serie')}" value="${esc(n.serie)}" inputmode="numeric"></div>
        <div class="field"><label class="fl">Recebimento</label><input type="date" id="nf_dataEntrada" value="${esc(n.dataEntrada || hoje())}"></div></div>
      <div class="field"><label class="fl">Chave de acesso ${aviso('chave')}</label>
        <input id="nf_chave" class="mono ${marca('chave')}" value="${esc(n.chave)}" inputmode="numeric" placeholder="44 dígitos" onblur="nfChaveNoForm()" style="font-size:12.5px"></div>
      <div class="field"><label class="fl">CNPJ ${aviso('cnpj')}</label>
        <input id="nf_cnpj" class="mono ${marca('cnpj')}" value="${esc(nfCNPJfmt(n.cnpj))}" inputmode="numeric" onblur="nfCnpjNoForm()"><div id="nf_cnpjMsg" class="kpi-s"></div></div>
      <div class="row"><div class="field"><label class="fl">Nome fantasia</label><input id="nf_nomeFantasia" value="${esc(n.nomeFantasia)}"></div>
        <div class="field"><label class="fl">Município</label><input id="nf_municipio" value="${esc(n.municipio)}"></div>
        <div class="field" style="max-width:88px"><label class="fl">UF</label><input id="nf_uf" value="${esc(n.uf)}" maxlength="2" style="text-transform:uppercase"></div></div>
    </div>

    <div class="nf-sep" style="display:flex;justify-content:space-between;align-items:center">
      <span>Itens da nota ${aviso('itens')}</span>
      <button class="btn btn-sm" onclick="nfAddItem()">+ Item</button></div>
    <div id="nfItens"></div>
    <div class="kpi-s" id="nfItensTot" style="text-align:right;margin:4px 2px 12px"></div>

    <div class="nf-sep">Valores</div>
    <div class="row">
      <div class="field"><label class="fl">Frete</label><input id="nf_vFrete" class="num" inputmode="decimal" value="${nfNum(n.vFrete) ? fmtNum(n.vFrete) : ''}" placeholder="se tiver" oninput="nfTotalAuto()" onblur="nfTotalAuto()"></div>
      <div class="field"><label class="fl">Valor da nota ${aviso('vTotal')}</label><input id="nf_vTotal" class="num ${marca('vTotal')}" inputmode="decimal" value="${nfNum(n.vTotal) ? fmtNum(n.vTotal) : ''}" oninput="this.dataset.auto=''" style="font-weight:700"></div></div>
    <div class="row nf-extra">
      <div class="field"><label class="fl">Produtos ${aviso('vProd')}</label><input id="nf_vProd" class="num ${marca('vProd')}" inputmode="decimal" value="${nfNum(n.vProd) ? fmtNum(n.vProd) : ''}" onblur="nfRecalcTotal()"></div>
      <div class="field"><label class="fl">Base de ICMS</label><input id="nf_vBaseICMS" class="num" inputmode="decimal" value="${nfNum(n.vBaseICMS) ? fmtNum(n.vBaseICMS) : ''}"></div>
      <div class="field"><label class="fl">ICMS</label><input id="nf_vICMS" class="num" inputmode="decimal" value="${nfNum(n.vICMS) ? fmtNum(n.vICMS) : ''}"></div></div>

    <div class="nf-extra">
      <div class="nf-sep">Conferência</div>
      <div class="row"><div class="field"><label class="fl">Status</label><select id="nf_status">${NF_STATUS.map(s => `<option ${n.status === s ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
        <div class="field"><label class="fl">Recebido por</label><input id="nf_responsavel" value="${esc(n.responsavel || usuarioAtual())}"></div></div>
      <div class="field"><label class="fl">Observações</label><textarea id="nf_obs" rows="2" placeholder="Divergência, avaria, local de descarga…">${esc(n.obs)}</textarea></div>
      <label style="display:flex;gap:9px;align-items:flex-start;font-size:13.5px;margin-bottom:6px;cursor:pointer">
        <input type="checkbox" id="nf_estoque" style="width:auto;margin-top:3px" checked> <span>Dar entrada dos materiais no estoque ao salvar</span></label>
    </div>

    <button class="btn btn-ghost btn-sm" id="nfBtnCampos" style="width:100%;justify-content:center;margin:4px 0 14px" onclick="nfAlternarCampos()">
      ${_nfModoSimples ? ic('chevronBaixo') + ' Mostrar todos os campos' : ic('chevronCima') + ' Mostrar só o essencial'}</button>

    </div>

    <div style="display:flex;gap:9px">
      <button class="btn" style="flex:1;justify-content:center" onclick="fecharModal()">Cancelar</button>
      <button class="btn btn-pri" style="flex:2;justify-content:center" onclick="nfSalvarForm()">Salvar nota</button></div>
    ${(n.historico || []).length ? `<button class="btn btn-ghost btn-sm" style="width:100%;justify-content:center;margin-top:10px" onclick="nfVerHistorico('${n.id}')">${ic('relogio')} Histórico de alterações (${n.historico.length})</button>` : ''}
  `, 680);
  nfRenderItens();
  nfCnpjNoForm();
}

/* alterna entre o formulário enxuto e o completo, sem recarregar nada:
   os campos continuam no lugar, só deixam de aparecer */
function nfAlternarCampos() {
  _nfModoSimples = !_nfModoSimples;
  const f = el('nfForm'), b = el('nfBtnCampos');
  if (f) f.classList.toggle('nf-simples', _nfModoSimples);
  if (b) b.innerHTML = _nfModoSimples ? ic('chevronBaixo') + ' Mostrar todos os campos' : ic('chevronCima') + ' Mostrar só o essencial';
  nfRenderItens();
}

function nfLeituraTxt(n) {
  const l = n.leitura || {};
  const m = {
    'consulta': 'Dados oficiais da NF-e, obtidos pela chave de acesso',
    'pdf+chave': 'Lido do texto do PDF, com a chave de acesso conferida',
    'pdf': 'Lido do texto do PDF da nota',
    'codigo+ia': 'Lido do código de barras e da imagem',
    'codigo': 'Lido do código de barras da DANFE',
    'chave': 'Preenchido pela chave de acesso',
    'ia': 'Lido da imagem da nota',
    'manual': 'Preenchido à mão'
  }[l.metodo] || 'Preenchido à mão';
  const c = typeof l.confiancaGeral === 'number' ? Math.round(l.confiancaGeral * 100) : null;
  return esc(m) + (c != null && l.metodo !== 'manual' ? ` · confiança ${c}%` : '');
}

/* ---------- itens ---------- */
function nfRenderItens() {
  const box = el('nfItens'); if (!box || !_nfRascunho) return;
  const o = obra();
  const itens = _nfRascunho.itens || [];
  if (!itens.length) {
    box.innerHTML = `<div class="kpi-s" style="padding:8px 2px 12px">Nenhum item ainda. Use <b>+ Item</b> para lançar o que veio na nota — não é obrigatório para salvar.</div>`;
  } else {
    box.innerHTML = itens.map((it, i) => {
      const sugM = it.materialId ? [] : nfSugerirMaterial(it.descricao, o.id);
      const mat = it.materialId ? nfMateriais(o.id).find(m => m.id === it.materialId) : null;
      return `<div class="nf-item">
        <div class="row" style="gap:7px;margin-bottom:6px">
          <div class="field" style="margin:0;flex:3;min-width:150px"><input value="${esc(it.descricao)}" placeholder="Item (descrição do material)" oninput="nfItemCampo(${i},'descricao',this.value)"></div>
          <div class="field nf-extra" style="margin:0;max-width:74px"><input class="num" inputmode="decimal" value="${it.qtd ? fmtQtd(it.qtd) : ''}" placeholder="Qtd" oninput="nfItemCampo(${i},'qtd',this.value)"></div>
          <div class="field nf-extra" style="margin:0;max-width:78px"><input value="${esc(it.un)}" placeholder="Un" oninput="nfItemCampo(${i},'un',this.value)" style="text-transform:uppercase"></div>
          <div class="field nf-extra" style="margin:0;max-width:96px"><input class="num" inputmode="decimal" value="${it.vUnit ? fmtNum(it.vUnit) : ''}" placeholder="V. unit." oninput="nfItemCampo(${i},'vUnit',this.value)"></div>
          <div class="field" style="margin:0;max-width:118px"><input class="num" inputmode="decimal" value="${it.vTotal ? fmtNum(it.vTotal) : ''}" placeholder="Valor do item" oninput="nfItemCampo(${i},'vTotal',this.value)"></div>
          <button class="btn btn-sm btn-ghost" onclick="nfDelItem(${i})" title="Remover">${ic('fechar')}</button></div>
        ${mat ? `<div class="nf-vinc">${ic('vinculo')} Material <b>${esc(mat.descricao)}</b> · ${mat.notas} nota(s) <button class="btn btn-sm btn-ghost" onclick="nfItemCampo(${i},'materialId','');nfRenderItens()">desvincular</button></div>` : ''}
        ${sugM.length ? `<div class="nf-vinc">Material parecido: ${sugM.map(s => `<button class="chip nf-chip-sug" onclick="nfItemCampo(${i},'materialId','${esc(s.material.id).replace(/'/g, '')}');nfRenderItens()">${esc(s.material.descricao)} · ${Math.round(s.score * 100)}%</button>`).join(' ')}</div>` : ''}
      </div>`;
    }).join('');
  }
  const t = (itens).reduce((a, it) => a + nfNum(it.vTotal), 0);
  const tt = el('nfItensTot');
  if (tt) tt.innerHTML = itens.length ? `Soma dos itens: <b class="mono">${fmtBRL(t)}</b>` : '';
}
function nfItemCampo(i, campo, valor) {
  const it = (_nfRascunho.itens || [])[i]; if (!it) return;
  if (campo === 'qtd' || campo === 'vUnit' || campo === 'vTotal') {
    it[campo] = nfNum(valor);
    if (campo !== 'vTotal' && nfNum(it.qtd) && nfNum(it.vUnit)) it.vTotal = +(nfNum(it.qtd) * nfNum(it.vUnit)).toFixed(2);
    const soma = (_nfRascunho.itens || []).reduce((a, x) => a + nfNum(x.vTotal), 0);
    const tt = el('nfItensTot');
    if (tt) tt.innerHTML = `Soma dos itens: <b class="mono">${fmtBRL(soma)}</b>`;
    nfTotalAuto();
    nfTotalAuto();
  } else if (campo === 'un') it.un = String(valor || '').toUpperCase();
  else it[campo] = valor;
}
function nfAddItem() {
  _nfRascunho.itens = _nfRascunho.itens || [];
  _nfRascunho.itens.push({ codigo: '', descricao: '', qtd: 0, un: 'UN', vUnit: 0, vTotal: 0, materialId: '' });
  nfRenderItens();
}
function nfDelItem(i) { _nfRascunho.itens.splice(i, 1); nfRenderItens(); }

function nfChaveNoForm() {
  const c = el('nf_chave'); if (!c) return;
  const ch = nfChaveNorm(c.value);
  if (ch.length !== 44) return;
  if (!nfChaveValida(ch)) { toast('Chave inválida — confira os números'); c.classList.add('nf-confira'); return; }
  c.classList.remove('nf-confira');
  const d = nfDaChave(ch);
  if (el('nf_numero')) el('nf_numero').value = d.numero;
  if (el('nf_serie')) el('nf_serie').value = d.serie;
  if (el('nf_cnpj')) el('nf_cnpj').value = nfCNPJfmt(d.cnpj);
  if (el('nf_uf')) el('nf_uf').value = d.uf;
  ['nf_numero', 'nf_serie', 'nf_cnpj', 'nf_uf'].forEach(id => { const e = el(id); if (e) e.classList.remove('nf-confira'); });
  nfCnpjNoForm();
  toast('Dados preenchidos pela chave de acesso');
}
function nfCnpjNoForm() {
  const c = el('nf_cnpj'), msg = el('nf_cnpjMsg'); if (!c || !msg) return;
  const d = nfCNPJnorm(c.value);
  if (!d) { msg.textContent = ''; return; }
  if (d.length !== 14) { msg.innerHTML = '<span style="color:var(--amarelo)">CNPJ incompleto</span>'; return; }
  c.value = nfCNPJfmt(d);
  if (!nfCNPJvalido(d)) { msg.innerHTML = '<span style="color:var(--vermelho)">CNPJ não confere</span>'; return; }
  const o = obra();
  const f = o ? nfFornecedorConhecido(o.id, d) : null;
  if (f) {
    msg.innerHTML = `<span style="color:var(--accent)">Fornecedor já cadastrado: <b>${esc(f.nome)}</b> · ${f.notas} nota(s)</span>`;
    if (el('nf_razaoSocial') && !el('nf_razaoSocial').value) el('nf_razaoSocial').value = f.nome;
    if (el('nf_municipio') && !el('nf_municipio').value) el('nf_municipio').value = f.municipio;
    if (el('nf_uf') && !el('nf_uf').value) el('nf_uf').value = f.uf;
  } else msg.innerHTML = '<span style="color:var(--muted)">Fornecedor novo — será cadastrado com esta nota</span>';
}
/* O valor da nota se vira sozinho a partir dos itens e do frete ENQUANTO
   ninguem o digitou. No instante em que a pessoa digita o total, ele passa a
   mandar e o sistema nao mexe mais — senao o valor conferido some ao mudar
   qualquer outra coisa. */
function nfTotalAuto() {
  const t = el('nf_vTotal');
  if (!t) return;
  if (nfNum(t.value) && t.dataset.auto !== '1') return;   // total digitado a mao
  const soma = (_nfRascunho && _nfRascunho.itens || []).reduce((a, x) => a + nfNum(x.vTotal), 0);
  const base = soma || nfNum((el('nf_vProd') || {}).value);
  const frete = nfNum((el('nf_vFrete') || {}).value);
  if (!base) return;
  t.value = fmtNum(base + frete);
  t.dataset.auto = '1';
}
function nfRecalcTotal() { nfTotalAuto(); }

/* ---------- salvar ---------- */
function nfSalvarForm() {
  const o = obra(); if (!o || !_nfRascunho) return;
  const v = id => { const e = el(id); return e ? e.value.trim() : ''; };
  const n = _nfRascunho;
  const antes = nfPorId(o.id, n.id);
  const antesCopia = antes ? JSON.parse(JSON.stringify(antes)) : null;

  n.numero = v('nf_numero'); n.serie = v('nf_serie');
  n.chave = nfChaveNorm(v('nf_chave')).slice(0, 44);
  n.dataEmissao = v('nf_dataEmissao'); n.dataEntrada = v('nf_dataEntrada') || hoje();
  n.cnpj = nfCNPJnorm(v('nf_cnpj')); n.razaoSocial = v('nf_razaoSocial'); n.nomeFantasia = v('nf_nomeFantasia');
  n.municipio = v('nf_municipio'); n.uf = v('nf_uf').toUpperCase();
  n.vProd = nfNum(v('nf_vProd')); n.vFrete = nfNum(v('nf_vFrete')); n.vTotal = nfNum(v('nf_vTotal'));
  n.vBaseICMS = nfNum(v('nf_vBaseICMS')); n.vICMS = nfNum(v('nf_vICMS'));
  n.status = v('nf_status') || 'Recebida'; n.responsavel = v('nf_responsavel'); n.obs = v('nf_obs');
  n.itens = (n.itens || []).filter(it => String(it.descricao || '').trim());
  n.obraId = o.id;
  if (!n.numero && !n.chave && !n.vTotal) { toast('Informe ao menos o número ou o valor da nota'); return; }

  const paraEstoque = el('nf_estoque') && el('nf_estoque').checked;

  // item digitado à mão também entra na associação automática
  nfAutoVincular(o.id, n);
  nfRegistrar(n, antes ? 'alterada' : 'cadastrada', antes ? nfDiff(antesCopia, n) : ('nº ' + (n.numero || '—')));

  const arr = nfGet(o.id);
  const i = arr.findIndex(x => x.id === n.id);
  if (i > -1) arr[i] = n; else arr.unshift(n);
  nfSet(o.id, arr);

  let msg = 'Nota salva';
  if (paraEstoque && n.status !== 'Cancelada' && (n.itens || []).length) {
    const q = nfIntegrarEstoque(o.id, n);
    if (q) { msg = q + ' material(is) no estoque'; if (n.status === 'Recebida' || n.status === 'Conferida') n.status = 'Integrada ao estoque'; nfRegistrar(n, 'entrada no estoque', q + ' item(ns)'); }
  } else if (!paraEstoque) nfDesfazerEstoque(o.id, n.id);
  nfSet(o.id, nfGet(o.id).map(x => x.id === n.id ? n : x));

  // imagens em resolucao cheia: IndexedDB local + Drive em segundo plano.
  // A folha 1 e a capa; as demais sobem com o numero da pagina, e e a
  // resposta delas que monta `n.paginas`.
  if (_nfFull) {
    try { fotoGuardarFull(nfImgChave(o.id, n.id), _nfFull); } catch (e) { /* segue sem a copia local */ }
    nfEnviarImagem(o.id, n, _nfFull);
  }
  if (_nfPags.length) {
    n.paginas = [];
    _nfPags.forEach((uri, k) => {
      const pag = k + 2;
      try { fotoGuardarFull(nfImgChave(o.id, n.id, pag), uri); } catch (e) { /* idem */ }
      nfEnviarImagem(o.id, n, uri, pag);
    });
  }
  nfEnfileirar(o.id, n);

  _nfRascunho = null; _nfFull = ''; _nfPags = [];
  fecharModal(); toast(msg);
  if (estado.tela === 'notas') render();
}

/* ---------- paginas da nota ----------
   Nota de duas folhas e comum, e a segunda costuma trazer a continuacao dos
   itens. Ate aqui o app guardava so a folha 1: a leitura do PDF ate lia o
   texto das outras, mas a imagem delas era descartada sem aviso. */
function nfPaginasTotalRascunho(n) {
  // no rascunho contam as folhas ja no Drive MAIS as que acabaram de entrar
  return 1 + Math.max(((n && n.paginas) || []).filter(Boolean).length, _nfPags.length);
}
function nfPaginasTxt(n) {
  const t = nfPaginasTotalRascunho(n);
  return t > 1 ? `${ic('arquivo')} ${t} páginas guardadas` : 'Uma página. A nota tem verso ou continuação?';
}

/* Junta folhas a nota em conferencia. Aceita varias imagens de uma vez ou
   um PDF — cada pagina do PDF vira uma folha. */
window.nfAddPaginas = async function (inp) {
  const arquivos = [...(inp.files || [])]; inp.value = '';
  if (!arquivos.length || !_nfRascunho) return;
  const cabem = NF_MAX_PAGINAS - nfPaginasTotalRascunho(_nfRascunho);
  if (cabem <= 0) { toast(`A nota já está com o máximo de ${NF_MAX_PAGINAS} páginas`, 'info', 5000); return; }
  let entraram = 0;
  for (const f of arquivos) {
    if (entraram >= cabem) break;
    const ehPDF = /pdf/i.test(f.type) || /\.pdf$/i.test(f.name || '');
    try {
      if (ehPDF) {
        const p = await nfLerPDF(f);
        for (const uri of [p.full, ...(p.extras || [])]) {
          if (!uri || entraram >= cabem) break;
          _nfPags.push(uri); entraram++;
        }
      } else if (/^image\//.test(f.type)) {
        _nfPags.push(await comprimirImg(f, NF_MAX_LADO, .88)); entraram++;
      }
    } catch (e) { /* arquivo que nao abriu nao derruba os outros */ }
  }
  if (!entraram) { toast('Não consegui ler esse arquivo'); return; }
  const info = el('nfPagsInfo');
  if (info) info.innerHTML = nfPaginasTxt(_nfRascunho);
  toast(entraram === 1 ? 'Página adicionada — salve a nota para enviá-la'
                       : entraram + ' páginas adicionadas — salve a nota para enviá-las', 'success', 5000);
  if (arquivos.length > entraram) {
    toast(`Só cabiam ${cabem} página(s) nesta nota.`, 'info', 5000);
  }
};

function nfEditar(id) {
  const o = obra(); if (!o) return;
  const n = nfPorId(o.id, id); if (!n) return;
  if (!podeEditar(n)) { toast('Seu acesso não edita esta nota'); return; }
  _nfRascunho = JSON.parse(JSON.stringify(n));
  _nfFull = ''; _nfPags = [];
  const met = (n.leitura && n.leitura.metodo) || 'manual';
  _nfModoSimples = (met === 'manual');
  nfConferir();
}
function nfExcluir(id) {
  const o = obra(); const n = nfPorId(o.id, id); if (!n) return;
  if (!podeExcluir(n)) { toast('Só quem lançou ou o administrador pode excluir'); return; }
  if (!confirm('Excluir a nota ' + (n.numero || '') + '? A entrada de estoque gerada por ela também sai.')) return;
  nfDesfazerEstoque(o.id, id);
  nfSet(o.id, nfGet(o.id).filter(x => x.id !== id));
  nfEnfileirarExcluir(o.id, id);
  fecharModal(); toast('Nota excluída'); render();
}
function nfMudarStatus(id, st) {
  const o = obra(); const arr = nfGet(o.id); const n = arr.find(x => x.id === id); if (!n) return;
  const de = n.status; n.status = st;
  nfRegistrar(n, 'status', de + ' → ' + st);
  if (st === 'Cancelada') nfDesfazerEstoque(o.id, id);
  nfSet(o.id, arr); nfEnfileirar(o.id, n);
  toast('Status: ' + st); render();
}

/* ---------- imagem da nota ---------- */
/* Busca UMA folha: primeiro o aparelho, depois o rascunho aberto, depois o
   Drive. `pagina` e 1-based; a 1 e a capa. */
async function nfImagemDaPagina(o, n, pagina) {
  const p = pagina > 1 ? pagina : 1;
  let src = '';
  try { src = await fotoLerFull(nfImgChave(o.id, n.id, p)); } catch (e) { src = ''; }
  if (!src && _nfRascunho && _nfRascunho.id === n.id) {
    src = p === 1 ? (_nfFull || '') : (_nfPags[p - 2] || '');
  }
  const ref = p === 1 ? n.drive : ((n.paginas || [])[p - 2]);
  if (!src && ref && ref.fileId && BACKEND && !isDemo()) {
    try {
      const r = await postAcao({ action: 'obterFoto', fileId: ref.fileId });
      if (r && r.ok && r.dataUri) {
        src = r.dataUri;
        try { fotoGuardarFull(nfImgChave(o.id, n.id, p), src); } catch (e) { /* segue sem cache */ }
      }
    } catch (e) { /* fica com o que houver */ }
  }
  if (!src && p === 1) src = n.thumb || '';
  return { src: src, link: (ref && ref.link) || '' };
}

let _nfVerPag = 1;
window.nfIrPagina = async function (id, pagina) {
  const o = obra();
  const n = (_nfRascunho && _nfRascunho.id === id) ? _nfRascunho : nfPorId(o.id, id);
  if (!n) return;
  const total = nfNumPaginas(n);
  _nfVerPag = Math.min(Math.max(1, pagina), total);
  const img = el('nfVerImg'), lbl = el('nfVerLbl'), bx = el('nfVerBaixar'), dv = el('nfVerDrive');
  if (lbl) lbl.textContent = `Folha ${_nfVerPag} de ${total}`;
  if (img) { img.style.opacity = '.35'; }
  const r = await nfImagemDaPagina(o, n, _nfVerPag);
  if (img) {
    img.style.opacity = '';
    if (r.src) { img.src = r.src; img.style.display = ''; }
    else { img.style.display = 'none'; }
  }
  const vazio = el('nfVerVazio');
  if (vazio) vazio.style.display = r.src ? 'none' : '';
  if (bx) {
    bx.style.display = r.src ? '' : 'none';
    bx.href = r.src || '#';
    bx.download = 'NF-' + (n.numero || n.id) + (_nfVerPag > 1 ? '_p' + _nfVerPag : '') + '.jpg';
  }
  if (dv) { dv.style.display = r.link ? '' : 'none'; dv.href = r.link || '#'; }
  const ant = el('nfVerAnt'), pro = el('nfVerProx');
  if (ant) ant.disabled = _nfVerPag <= 1;
  if (pro) pro.disabled = _nfVerPag >= total;
};

async function nfVerImagem(id) {
  const o = obra();
  const n = (_nfRascunho && _nfRascunho.id === id) ? _nfRascunho : nfPorId(o.id, id);
  if (!n) return;
  const total = nfNumPaginas(n);
  _nfVerPag = 1;
  const primeira = await nfImagemDaPagina(o, n, 1);
  abrirModal('Nota fiscal ' + esc(n.numero || ''), `
    ${total > 1 ? `<div style="display:flex;align-items:center;gap:9px;margin-bottom:10px">
      <button id="nfVerAnt" class="btn btn-sm btn-ghost" aria-label="Folha anterior" disabled>${ic('voltar')}</button>
      <span id="nfVerLbl" style="font-size:13px;font-weight:600">Folha 1 de ${total}</span>
      <button id="nfVerProx" class="btn btn-sm btn-ghost" aria-label="Próxima folha">${ic('seta')}</button>
    </div>` : ''}
    <img id="nfVerImg" src="${esc(primeira.src)}" alt="nota fiscal"
         style="width:100%;border-radius:8px;transition:opacity .15s;${primeira.src ? '' : 'display:none'}">
    <div id="nfVerVazio" class="empty" style="${primeira.src ? 'display:none' : ''}">${ic('notas')}Imagem não disponível neste aparelho.</div>
    <div style="display:flex;gap:9px;margin-top:12px;flex-wrap:wrap">
      <a id="nfVerDrive" class="btn" href="${esc(primeira.link || '#')}" target="_blank" rel="noopener"
         style="${primeira.link ? '' : 'display:none'}">${ic('pasta')} Abrir no Google Drive</a>
      <a id="nfVerBaixar" class="btn" href="${esc(primeira.src || '#')}" download="NF-${esc(n.numero || n.id)}.jpg"
         style="${primeira.src ? '' : 'display:none'}">${ic('baixar')} Baixar imagem</a>
      <button class="btn btn-ghost" onclick="nfEditar('${n.id}')">${ic('editar')} Editar dados</button></div>`, 720);
  // os botoes andam a partir da folha que estiver aberta
  const ant = el('nfVerAnt'), pro = el('nfVerProx');
  if (ant) ant.onclick = () => nfIrPagina(n.id, _nfVerPag - 1);
  if (pro) pro.onclick = () => nfIrPagina(n.id, _nfVerPag + 1);
}
function nfVerHistorico(id) {
  const o = obra();
  const n = (_nfRascunho && _nfRascunho.id === id) ? _nfRascunho : nfPorId(o.id, id);
  if (!n) return;
  const h = (n.historico || []).slice().reverse();
  abrirModal('Histórico da nota ' + esc(n.numero || ''), h.length ? h.map(x => `
    <div style="padding:9px 0;border-bottom:1px solid var(--border)">
      <div style="font-size:13.5px;font-weight:600">${esc(x.acao)}</div>
      <div class="kpi-s">${new Date(x.quando).toLocaleString('pt-BR')} · ${esc(x.usuario || '—')}</div>
      ${x.detalhe ? `<div class="kpi-s" style="color:var(--text-2);word-break:break-word">${esc(x.detalhe)}</div>` : ''}
    </div>`).join('') : '<div class="empty">Sem alterações registradas.</div>', 560);
}

/* ============================================================
   TELAS
   ============================================================ */
function viewNotas(o) {
  const abas = [['notas', 'notas', 'Notas'], ['estoque', 'caixa', 'Estoque'], ['precos', 'dinheiro', 'Preços'], ['painel', 'grafico', 'Painel']];
  // 'pedidos' era uma aba: quem tinha ela guardada no aparelho cai na lista de notas
  const tab = abas.some(a => a[0] === estado.nfTab) ? estado.nfTab : 'notas';
  const topo = `<div class="row nf-topo" style="align-items:center;margin-bottom:16px;gap:9px">
    <div style="display:flex;gap:7px;flex-wrap:wrap">${abas.map(a => `<button class="chip ${tab === a[0] ? 'on' : ''}" onclick="nfTab('${a[0]}')">${ic(a[1])} ${a[2]}</button>`).join('')}</div>
    <button class="btn btn-ghost btn-sm nf-teste" style="margin-left:auto" onclick="nfTestarLeitura()" title="Conferir se a leitura automática está no ar">${ic('lupa')} Testar leitura</button>
    ${pode('lancarNota')?`<button class="btn btn-pri nf-nova" onclick="nfAbrirNova()">${ic('camera')} Nova nota fiscal</button>`:''}</div>`;
  const corpo = tab === 'estoque' ? nfViewEstoque(o) : tab === 'precos' ? nfViewPrecos(o) : tab === 'painel' ? nfViewPainel(o) : nfViewLista(o);
  return topo + corpo;
}
function nfTab(t) { estado.nfTab = t; estado.nfLimite = NF_PAGINA; render(); }

/* ---------- lista de notas + pesquisa ---------- */
function nfFiltrar(o) {
  const q = nfNorm(estado.nfBusca || '');
  const qd = nfDigitos(estado.nfBusca || '');
  const st = estado.nfStatus || 'Todos';
  const mes = estado.nfMes || 'Todos';
  return nfGet(o.id).filter(n => {
    if (st !== 'Todos' && n.status !== st) return false;
    if (mes !== 'Todos' && (n.dataEntrada || n.dataEmissao || '').slice(0, 7) !== mes) return false;
    if (!q) return true;
    const alvo = nfNorm([n.numero, n.serie, n.razaoSocial, n.nomeFantasia, n.municipio, n.uf, n.responsavel, n.status, n.obs,
      (n.itens || []).map(i => i.descricao).join(' ')].join(' '));
    if (alvo.indexOf(q) > -1) return true;
    if (qd && (nfDigitos(n.cnpj).indexOf(qd) > -1 || String(n.chave).indexOf(qd) > -1 || String(n.numero).indexOf(qd) > -1)) return true;
    if (qd && String(Math.round(nfNum(n.vTotal))).indexOf(qd) > -1) return true;
    return false;
  }).sort((a, b) => (b.dataEntrada || b.dataEmissao || '').localeCompare(a.dataEntrada || a.dataEmissao || '') || b.criadoEm - a.criadoEm);
}
function nfViewLista(o) {
  const todas = nfGet(o.id);
  const meses = [...new Set(todas.map(n => (n.dataEntrada || n.dataEmissao || '').slice(0, 7)).filter(m => /^\d{4}-\d{2}$/.test(m)))].sort().reverse();
  const fs = nfFiltrar(o);
  const lim = estado.nfLimite || NF_PAGINA;
  const mostra = fs.slice(0, lim);
  const filtros = `<div class="card" style="margin-bottom:16px"><div class="card-b" style="padding:12px 15px">
    <div class="row" style="align-items:flex-end;gap:10px">
      <div class="field" style="margin:0;flex:2;min-width:190px"><label class="fl">Pesquisar</label>
        <input id="nfBusca" value="${esc(estado.nfBusca || '')}" placeholder="Nº, fornecedor, CNPJ, material, valor…" oninput="nfSetBusca(this.value)"></div>
      <div class="field" style="margin:0;max-width:200px"><label class="fl">Status</label>
        <select onchange="nfSetFiltro('nfStatus',this.value)"><option>Todos</option>
          ${NF_STATUS.map(s => `<option ${estado.nfStatus === s ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
      <div class="field" style="margin:0;max-width:170px"><label class="fl">Período</label>
        <select onchange="nfSetFiltro('nfMes',this.value)"><option value="Todos">Todos os meses</option>
          ${meses.map(m => `<option value="${m}" ${estado.nfMes === m ? 'selected' : ''}>${mesLabel(m + '-01')}</option>`).join('')}</select></div>
      <div style="margin-left:auto;display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <span class="chip">${fs.length} de ${todas.length}</span>
        <button class="btn btn-sm" onclick="nfExportarCSV()" ${fs.length ? '' : 'disabled'}>${ic('baixar')} CSV</button></div></div></div></div>`;

  if (!todas.length) return filtros + `<div class="empty">${ic('notas')}Nenhuma nota fiscal registrada nesta obra.<br>
    <span class="kpi-s">Toque em <b>Nova nota fiscal</b> e fotografe a DANFE — o resto o sistema preenche.</span></div>`;
  if (!fs.length) return filtros + `<div class="empty">${ic('lupa')}Nenhuma nota encontrada com esse filtro.</div>`;

  const cards = mostra.map(n => {
    const div = nfDivergencia(n);
    return `<div class="card nf-card">
      <div class="nf-card-img" onclick="nfVerImagem('${n.id}')">
        ${n.thumb ? `<img src="${esc(n.thumb)}" alt="nota ${esc(n.numero)}" loading="lazy">` : `<div class="nf-card-sem">${ic('notas', 40)}</div>`}
        <span class="pill ${NF_STATUS_COR[n.status] || 'pill-blu'} nf-card-st">${esc(n.status)}</span></div>
      <div class="nf-card-b">
        <div style="display:flex;justify-content:space-between;gap:8px;align-items:baseline">
          <div style="font-weight:700;font-size:14.5px">NF ${esc(n.numero || '—')}${n.serie ? '<span class="kpi-s"> · série ' + esc(n.serie) + '</span>' : ''}</div>
          <div class="mono" style="font-weight:700;font-size:13.5px">${fmtBRL(nfNum(n.vTotal))}</div></div>
        <div style="font-size:13px;font-weight:600;margin-top:3px;line-height:1.3">${esc(n.razaoSocial || n.nomeFantasia || nfCNPJfmt(n.cnpj) || 'Fornecedor não informado')}</div>
        <div class="kpi-s nf-1linha">${nfDataBR(n.dataEntrada || n.dataEmissao)}${n.responsavel ? ' · ' + esc(n.responsavel) : ''} · ${(n.itens || []).length} produto(s)${n.municipio ? ' · ' + esc(n.municipio) + (n.uf ? '/' + esc(n.uf) : '') : ''}</div>
        <div class="kpi-s nf-1linha" title="${esc(o.nome)}">${esc(o.nome)}</div>
        ${div ? `<div class="nf-alerta nf-alerta-ylw" style="margin:8px 0 0;padding:8px 10px">${esc(div)}</div>` : ''}
        <div style="display:flex;gap:6px;margin-top:10px;flex-wrap:wrap">
          ${podeEditar(n)?`<button class="btn btn-sm" onclick="nfEditar('${n.id}')">${ic('editar')} Conferir</button>`:''}
          <button class="btn btn-sm btn-ghost" onclick="nfVerImagem('${n.id}')">${ic('lupa')} Nota</button>
          ${n.drive && n.drive.link ? `<a class="btn btn-sm btn-ghost" href="${esc(n.drive.link)}" target="_blank" rel="noopener" title="Abrir no Google Drive">${ic('pasta')}</a>` : ''}
          ${podeExcluir(n)?`<button class="btn btn-sm btn-ghost" onclick="nfExcluir('${n.id}')" title="Excluir">${ic('fechar')}</button>`:''}</div>
      </div></div>`;
  }).join('');

  const mais = fs.length > mostra.length
    ? `<div style="text-align:center;margin-top:18px"><button class="btn" onclick="nfMais()">Mostrar mais ${Math.min(NF_PAGINA, fs.length - mostra.length)} de ${fs.length - mostra.length}</button></div>` : '';
  return filtros + `<div class="grid nf-grid">${cards}</div>${mais}`;
}
function nfDivergencia(n) {
  const itens = (n.itens || []).reduce((a, it) => a + nfNum(it.vTotal), 0);
  if (nfNum(n.vTotal) && itens && Math.abs(nfNum(n.vTotal) - (itens + nfNum(n.vFrete))) > 0.05)
    return 'Itens + frete não fecham com o total da nota';
  if (n.cnpj && !nfCNPJvalido(n.cnpj)) return 'CNPJ do fornecedor não confere';
  if (n.chave && !nfChaveValida(n.chave)) return 'Chave de acesso inválida';
  if (!n.numero) return 'Nota sem número';
  return '';
}
function nfSetBusca(v) {
  estado.nfBusca = v; estado.nfLimite = NF_PAGINA;
  clearTimeout(nfSetBusca._t);
  nfSetBusca._t = setTimeout(() => {
    render();
    const c = el('nfBusca');
    if (c) { c.focus(); c.setSelectionRange(c.value.length, c.value.length); }
  }, 260);
}
function nfSetFiltro(k, v) { estado[k] = v; estado.nfLimite = NF_PAGINA; render(); }
function nfMais() { estado.nfLimite = (estado.nfLimite || NF_PAGINA) + NF_PAGINA; render(); }

function nfExportarCSV() {
  const o = obra();
  const fs = nfFiltrar(o);
  const cab = ['Numero', 'Serie', 'Chave', 'Emissao', 'Recebimento', 'CNPJ', 'Fornecedor', 'Municipio', 'UF', 'Produtos', 'Frete', 'Total', 'BaseICMS', 'ICMS', 'Status', 'Responsavel', 'Itens'];
  const esc2 = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
  const linhas = fs.map(n => [n.numero, n.serie, n.chave, n.dataEmissao, n.dataEntrada, nfCNPJfmt(n.cnpj), n.razaoSocial,
    n.municipio, n.uf, nfNum(n.vProd).toFixed(2), nfNum(n.vFrete).toFixed(2), nfNum(n.vTotal).toFixed(2),
    nfNum(n.vBaseICMS).toFixed(2), nfNum(n.vICMS).toFixed(2), n.status, n.responsavel,
    (n.itens || []).map(i => `${i.descricao} (${fmtQtd(i.qtd)} ${i.un})`).join(' | ')].map(esc2).join(';'));
  const csv = '﻿' + cab.map(esc2).join(';') + '\n' + linhas.join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = 'notas-fiscais-' + o.id + '-' + hoje() + '.csv';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

/* ---------- estoque ---------- */
function nfViewEstoque(o) {
  const saldos = nfSaldos(o.id);
  const movs = nfMovGet(o.id).slice().sort((a, b) => (b.dataISO || '').localeCompare(a.dataISO || '') || b.criadoEm - a.criadoEm);
  const sai = nfSaiGet(o.id).slice().sort((a, b) => (b.dataISO || '').localeCompare(a.dataISO || '') || b.criadoEm - a.criadoEm);
  const btnSaida = pode('saidaEstoque')
    ? `<button class="btn" onclick="nfSaidaModal('')">${ic('saida')} Registrar saída</button>` : '';
  if (!saldos.length) return `<div class="empty">${ic('caixa')}Nada no estoque ainda.<br>
    <span class="kpi-s">A entrada é gerada quando você salva uma nota com os produtos preenchidos.</span></div>`;

  const total = saldos.reduce((a, s) => a + s.valor, 0);
  const emMao = saldos.reduce((a, s) => a + s.valorSaldo, 0);
  const negativos = saldos.filter(s => s.saldo < -0.0001);
  const topo = `<div class="row" style="align-items:center;margin-bottom:16px;gap:9px">
    <div class="kpi-s" style="flex:1;min-width:200px">A entrada vem da nota. A saída é o consumo, registrada aqui.</div>
    ${btnSaida}</div>`;
  const kpis = `<div class="grid g4" style="margin-bottom:18px">
    <div class="kpi"><div class="kpi-l">Materiais</div><div class="kpi-v">${saldos.length}</div><div class="kpi-s">itens distintos</div></div>
    <div class="kpi"><div class="kpi-l">Movimentos</div><div class="kpi-v">${movs.length} <span style="font-size:15px;color:var(--muted)">/ ${sai.length}</span></div><div class="kpi-s">entradas / saídas</div></div>
    <div class="kpi"><div class="kpi-l">Valor recebido</div><div class="kpi-v" style="font-size:24px">${fmtBRLc(total)}</div><div class="kpi-s">soma das entradas</div></div>
    <div class="kpi"><div class="kpi-l">Saldo em mão</div><div class="kpi-v" style="font-size:24px">${fmtBRLc(emMao)}</div><div class="kpi-s">pelo preço médio de entrada</div></div></div>`;

  const aviso = negativos.length ? `<div class="nf-alerta nf-alerta-ylw">
    ${negativos.length} material(is) com <b>saldo negativo</b>: saiu mais do que entrou.
    Normalmente falta lançar a nota de entrada — ${esc(negativos.slice(0, 3).map(s => s.descricao).join(', '))}${negativos.length > 3 ? ' e outros' : ''}.</div>` : '';

  const tab = `<div class="tbl-wrap" style="margin-bottom:20px"><table class="t">
    <thead><tr><th>Material</th><th class="num">Un</th><th class="num">Entrou</th><th class="num">Saiu</th><th class="num">Saldo</th><th class="num">Valor em mão</th><th>Lotes</th><th class="num">Última</th><th></th></tr></thead>
    <tbody>${saldos.map(s => `<tr>
      <td style="font-weight:600">${esc(s.descricao)}</td>
      <td class="num">${esc(s.un)}</td>
      <td class="num">${fmtQtd(s.entradas)}</td>
      <td class="num" style="color:${s.saidas ? 'var(--text-2)' : 'var(--muted)'}">${s.saidas ? fmtQtd(s.saidas) : '—'}</td>
      <td class="num" style="font-weight:700;color:${s.saldo < -0.0001 ? 'var(--vermelho)' : 'inherit'}">${fmtQtd(s.saldo)}</td>
      <td class="num">${fmtBRL(s.valorSaldo)}</td>
      <td class="kpi-s">${esc(s.lotes.slice(0, 3).join(', '))}${s.lotes.length > 3 ? ' +' + (s.lotes.length - 3) : ''}</td>
      <td class="num kpi-s">${nfDataBR(s.ultima)}</td>
      <td>${pode('saidaEstoque') ? `<button class="btn btn-sm btn-ghost" onclick="nfSaidaModal('${esc(s.id).replace(/'/g, '')}')" title="Registrar saída deste material">${ic('saida')}</button>` : ''}</td></tr>`).join('')}</tbody></table></div>`;

  const tabSaidas = !sai.length ? '' : `<div class="card" style="margin-bottom:20px"><div class="card-h"><div><div class="card-t">Saídas registradas</div>
    <div class="card-st">consumo lançado na obra · ${sai.length} movimento(s)</div></div></div>
    <div class="tbl-wrap" style="border:none"><table class="t">
    <thead><tr><th>Data</th><th>Material</th><th class="num">Qtd</th><th>Onde</th><th>Quem retirou</th><th></th></tr></thead>
    <tbody>${sai.slice(0, 60).map(m => `<tr>
      <td class="num kpi-s">${nfDataBR(m.dataISO)}</td>
      <td>${esc(m.descricao)}${m.obs ? `<div class="kpi-s">${esc(m.obs)}</div>` : ''}</td>
      <td class="num">${fmtQtd(m.qtd)} ${esc(m.un)}</td>
      <td class="kpi-s">${esc([m.capId != null ? frenteNome(o, m.capId) : '', m.rua].filter(Boolean).join(' · ')) || '—'}</td>
      <td class="kpi-s">${esc(m.responsavel || m.usuario || '—')}</td>
      <td>${podeExcluir(m) ? `<button class="btn btn-sm btn-ghost" onclick="nfSaidaExcluir('${m.id}')" title="Apagar">${ic('fechar')}</button>` : ''}</td></tr>`).join('')}</tbody></table></div></div>`;

  const rastro = `<div class="card"><div class="card-h"><div><div class="card-t">Rastreabilidade das entradas</div>
    <div class="card-st">cada movimento aponta para a nota que o gerou</div></div></div>
    <div class="tbl-wrap" style="border:none"><table class="t">
    <thead><tr><th>Data</th><th>Material</th><th class="num">Qtd</th><th>Lote</th><th>Fornecedor</th><th>Nota</th></tr></thead>
    <tbody>${movs.slice(0, 60).map(m => `<tr>
      <td class="num kpi-s">${nfDataBR(m.dataISO)}</td>
      <td>${esc(m.descricao)}</td>
      <td class="num">${fmtQtd(m.qtd)} ${esc(m.un)}</td>
      <td class="mono" style="font-size:12px">${esc(m.lote)}</td>
      <td class="kpi-s">${esc(m.fornecedor || nfCNPJfmt(m.cnpj))}</td>
      <td><button class="btn btn-sm btn-ghost" onclick="nfEditar('${m.notaId}')">abrir</button></td></tr>`).join('')}</tbody></table></div></div>`;
  return topo + kpis + aviso + tab + tabSaidas + rastro;
}

/* ============================================================
   SAIDA DE ESTOQUE (CONSUMO)
   ------------------------------------------------------------
   Sem isso o estoque so cresce e o saldo mostrado e "o que chegou",
   nao "o que ainda tem".

   Decisao: saida acima do saldo NAO e bloqueada, so avisada e pedida
   confirmacao. No canteiro o material e consumido antes de a nota ser
   lancada. Bloquear faria o apontador desistir de registrar, e estoque
   sem registro e pior do que estoque com saldo negativo aparente.
   ============================================================ */
function nfSaidaModal(materialId) {
  const o = obra();
  if (!pode('saidaEstoque')) { toast('Seu acesso não registra saída de material'); return; }
  const saldos = nfSaldos(o.id).filter(s => s.entradas > 0);
  if (!saldos.length) { toast('Nada no estoque para dar saída'); return; }
  const sel = saldos.find(s => s.id === materialId) || saldos[0];
  const frentes = o.frentes || [];
  abrirModal('Saída de material', `
    <div class="field"><label class="fl">Material</label>
      <select id="sa_mat" onchange="nfSaidaSaldo()">${saldos.map(s =>
        `<option value="${esc(s.id)}" ${s.id === sel.id ? 'selected' : ''}>${esc(s.descricao)} — saldo ${fmtQtd(s.saldo)} ${esc(s.un)}</option>`).join('')}</select></div>
    <div class="row">
      <div class="field"><label class="fl">Quantidade</label>
        <input id="sa_qtd" class="num" inputmode="decimal" placeholder="0,00" oninput="nfSaidaSaldo()"></div>
      <div class="field"><label class="fl">Data</label><input type="date" id="sa_data" value="${hoje()}"></div></div>
    <div id="sa_saldo" class="kpi-s" style="margin:-6px 0 12px"></div>
    <div class="row">
      <div class="field"><label class="fl">Frente de serviço</label>
        <select id="sa_frente"><option value="">— não informar —</option>
          ${frentes.map(f => `<option value="${f.id}">${esc(f.nome)}</option>`).join('')}</select></div>
      <div class="field"><label class="fl">Rua / local</label>
        <select id="sa_rua"><option value="">— não informar —</option>
          ${(o.ruas || []).map(r => `<option>${esc(r)}</option>`).join('')}</select></div></div>
    <div class="field"><label class="fl">Quem retirou</label>
      <input id="sa_resp" value="${esc(usuarioAtual())}" placeholder="Nome de quem levou o material"></div>
    <div class="field"><label class="fl">Observação</label>
      <textarea id="sa_obs" rows="2" placeholder="Onde foi aplicado, nº do RDO, motivo…"></textarea></div>
    <div id="sa_erro" class="kpi-s" style="color:var(--vermelho);min-height:16px;margin:-4px 0 10px"></div>
    <div style="display:flex;gap:9px">
      <button class="btn" style="flex:1;justify-content:center" onclick="fecharModal()">Cancelar</button>
      <button class="btn btn-pri" style="flex:2;justify-content:center" onclick="nfSaidaSalvar()">Registrar saída</button></div>`, 580);
  nfSaidaSaldo();
}
/* mostra o saldo que sobra enquanto a pessoa digita */
function nfSaidaSaldo() {
  const o = obra(), cx = el('sa_saldo'); if (!cx) return;
  const s = nfSaldos(o.id).find(x => x.id === (el('sa_mat') || {}).value);
  if (!s) { cx.textContent = ''; return; }
  const q = nfNum((el('sa_qtd') || {}).value);
  const resta = s.saldo - q;
  cx.innerHTML = `Saldo hoje: <b>${fmtQtd(s.saldo)} ${esc(s.un)}</b>` +
    (q > 0 ? ` · depois desta saída: <b style="color:${resta < -0.0001 ? 'var(--vermelho)' : 'var(--text)'}">${fmtQtd(resta)} ${esc(s.un)}</b>` : '') +
    (resta < -0.0001 ? ` — <span style="color:var(--vermelho)">maior que o saldo; confira se falta lançar a nota de entrada</span>` : '');
}
function nfSaidaSalvar() {
  const o = obra(), erro = el('sa_erro');
  const dizer = t => { if (erro) erro.textContent = t; };
  if (!pode('saidaEstoque')) { dizer('Seu acesso não registra saída.'); return; }
  const matId = (el('sa_mat') || {}).value || '';
  const qtd = nfNum((el('sa_qtd') || {}).value);
  const s = nfSaldos(o.id).find(x => x.id === matId);
  if (!s) { dizer('Escolha o material.'); return; }
  if (qtd <= 0) { dizer('Informe a quantidade.'); return; }
  if (qtd - s.saldo > 0.0001 && !confirm('A saída de ' + fmtQtd(qtd) + ' ' + s.un +
      ' é maior que o saldo de ' + fmtQtd(s.saldo) + ' ' + s.un + '.\n\n' +
      'O saldo vai ficar negativo. Isso costuma significar que falta lançar a nota de entrada.\n\nRegistrar assim mesmo?')) return;
  const frenteId = (el('sa_frente') || {}).value;
  const reg = {
    id: 'sa' + uid(), obraId: o.id, materialId: s.id, descricao: s.descricao, un: s.un,
    qtd: qtd, dataISO: (el('sa_data') || {}).value || hoje(),
    capId: frenteId === '' ? null : (isNaN(+frenteId) ? frenteId : +frenteId),
    rua: (el('sa_rua') || {}).value || '',
    responsavel: (el('sa_resp') || {}).value || '',
    obs: (el('sa_obs') || {}).value || '',
    usuario: usuarioAtual(), criadoEm: Date.now()
  };
  nfSaiSet(o.id, [reg].concat(nfSaiGet(o.id)));
  nfEnfileirarSaida(o.id, reg);
  fecharModal();
  toast('Saída registrada — saldo agora ' + fmtQtd(s.saldo - qtd) + ' ' + s.un);
  render();
}
function nfSaidaExcluir(id) {
  const o = obra();
  const reg = nfSaiGet(o.id).find(x => x.id === id);
  if (!reg) return;
  if (!podeExcluir(reg)) { toast('Só quem registrou a saída, ou o administrador, pode apagar'); return; }
  if (!confirm('Apagar esta saída de ' + fmtQtd(reg.qtd) + ' ' + reg.un + ' de ' + reg.descricao + '?\n\nO saldo volta ao que era.')) return;
  nfSaiSet(o.id, nfSaiGet(o.id).filter(x => x.id !== id));
  if (BACKEND && !isDemo()) {
    outboxAdd({ id: 'ob' + uid(), obra: o.id, tipo: 'saidaDel', params: { action: 'saidaExcluir', obra: o.id, id: id } });
    outboxFlush();
  }
  toast('Saída apagada'); render();
}
function nfEnfileirarSaida(obraId, reg) {
  if (!BACKEND || isDemo()) return;
  outboxAdd({ id: 'ob' + uid(), obra: obraId, tipo: 'saida', clientId: reg.id, params: {
    action: 'saidaSalvar', obra: obraId, id: reg.id, materialId: reg.materialId,
    descricao: reg.descricao, un: reg.un, qtd: reg.qtd, data: reg.dataISO,
    capid: reg.capId == null ? '' : reg.capId, rua: reg.rua,
    responsavel: reg.responsavel, obs: reg.obs, usuario: reg.usuario, criadoem: reg.criadoEm
  } });
  outboxFlush();
}
function nfSaidaDoServidor(s, obraId) {
  return {
    id: s.id, obraId: obraId, materialId: s.materialId || nfNorm(s.descricao),
    descricao: s.descricao || '', un: s.un || 'UN', qtd: nfNum(s.qtd),
    dataISO: nfISO(s.data), capId: s.capid === '' || s.capid == null ? null : s.capid,
    rua: s.rua || '', responsavel: s.responsavel || '', obs: s.obs || '',
    usuario: s.usuario || '', criadoEm: nfNum(s.criadoem) || Date.now()
  };
}

/* ---------- historico de preco por material ---------- */
function nfViewPrecos(o) {
  const mats = nfPrecos(o.id);
  if (!mats.length) return `<div class="empty">${ic('dinheiro')}Nenhum preço para comparar ainda.<br>
    <span class="kpi-s">O histórico sai das notas: é preciso ter o <b>valor unitário</b> e a <b>quantidade</b>
    dos itens preenchidos.</span></div>`;

  const comp = mats.filter(m => m.comparavel);
  const subiram = comp.filter(m => m.variacao >= NF_PRECO_ALERTA).sort((a, b) => b.variacao - a.variacao);
  const cairam = comp.filter(m => m.variacao <= -NF_PRECO_ALERTA).sort((a, b) => a.variacao - b.variacao);
  const gasto = mats.reduce((a, m) => a + m.valorTotal, 0);

  const kpis = `<div class="grid g4" style="margin-bottom:18px">
    <div class="kpi"><div class="kpi-l">Materiais com preço</div><div class="kpi-v">${mats.length}</div>
      <div class="kpi-s">${comp.length} com duas compras ou mais</div></div>
    <div class="kpi"><div class="kpi-l">Subiram</div><div class="kpi-v" style="color:${subiram.length ? 'var(--vermelho)' : 'inherit'}">${subiram.length}</div>
      <div class="kpi-s">${NF_PRECO_ALERTA}% ou mais desde a 1ª compra</div></div>
    <div class="kpi"><div class="kpi-l">Caíram</div><div class="kpi-v" style="color:${cairam.length ? 'var(--accent)' : 'inherit'}">${cairam.length}</div>
      <div class="kpi-s">${NF_PRECO_ALERTA}% ou mais de queda</div></div>
    <div class="kpi"><div class="kpi-l">Valor comprado</div><div class="kpi-v" style="font-size:24px">${fmtBRLc(gasto)}</div>
      <div class="kpi-s">itens com preço unitário</div></div></div>`;

  // fmtPct: no app "Gestor" recebe 0–100; no Teotônio recebe fração. Como este
  // arquivo é compartilhado entre os dois, a variação é formatada aqui mesmo.
  const sinal = v => (v >= 0 ? '+' : '') + (v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%';
  const corVar = v => v >= NF_PRECO_ALERTA ? 'var(--vermelho)' : (v <= -NF_PRECO_ALERTA ? 'var(--accent)' : 'var(--text-2)');

  const destaque = !subiram.length ? '' : `<div class="card" style="margin-bottom:18px;border-left:3px solid var(--vermelho)">
    <div class="card-h"><div><div class="card-t"><span class="ic-tx">${ic('alerta')}</span>Materiais que subiram de preço</div>
      <div class="card-st">comparando a primeira compra com a última</div></div>
      <span class="pill pill-red">${subiram.length}</span></div>
    <div class="card-b" style="padding:6px 22px 14px">
      ${subiram.slice(0, 6).map(m => `<div style="display:flex;align-items:center;gap:12px;padding:9px 0;border-bottom:1px solid var(--border)">
        <div style="flex:1;min-width:0"><div style="font-weight:600;font-size:13.5px">${esc(m.descricao)}</div>
          <div class="kpi-s">${fmtBRL(m.primeiro)} → ${fmtBRL(m.ultimo)} por ${esc(m.un)} · ${m.n} compra(s) · última em ${nfDataBR(m.ultimaData)}</div></div>
        <span class="pill pill-red" style="white-space:nowrap">${sinal(m.variacao)}</span></div>`).join('')}</div></div>`;

  const tabela = `<div class="card"><div class="card-h"><div><div class="card-t">Preço por material</div>
    <div class="card-st">preço médio ponderado pela quantidade · ordenado pelo valor comprado</div></div></div>
    <div class="tbl-wrap" style="border:none"><table class="t">
    <thead><tr><th>Material</th><th class="num">Un</th><th class="num">Compras</th><th class="num">Menor</th>
      <th class="num">Médio</th><th class="num">Maior</th><th class="num">Último</th><th class="num">Variação</th><th></th></tr></thead>
    <tbody>${mats.map(m => `<tr>
      <td style="font-weight:600">${esc(m.descricao)}<div class="kpi-s">${fmtQtd(m.qtdTotal)} ${esc(m.un)} · ${fmtBRL(m.valorTotal)} · ${m.fornecedores.length} fornecedor(es)</div></td>
      <td class="num">${esc(m.un)}</td>
      <td class="num">${m.n}</td>
      <td class="num kpi-s">${fmtBRL(m.min)}</td>
      <td class="num" style="font-weight:700">${fmtBRL(m.medio)}</td>
      <td class="num kpi-s">${fmtBRL(m.max)}</td>
      <td class="num">${fmtBRL(m.ultimo)}</td>
      <td class="num" style="color:${m.comparavel ? corVar(m.variacao) : 'var(--muted)'};font-weight:600">${m.comparavel ? sinal(m.variacao) : '—'}</td>
      <td><button class="btn btn-sm btn-ghost" onclick="nfPrecoDetalhe('${esc(m.id).replace(/'/g, '')}')">ver</button></td></tr>`).join('')}</tbody></table></div></div>`;

  return kpis + destaque + tabela;
}

/* todas as compras de um material, na ordem, com o mais barato marcado */
function nfPrecoDetalhe(id) {
  const o = obra();
  const m = nfPrecos(o.id).find(x => x.id === id);
  if (!m) { toast('Material não encontrado'); return; }
  const ex = nfPrecoExtremos(m);
  const linhas = m.compras.slice().reverse().map(c => {
    const marca = ex && c === ex.barato ? '<span class="pill pill-grn" style="margin-left:7px">menor preço</span>'
      : (ex && c === ex.caro && m.n > 1 ? '<span class="pill pill-ylw" style="margin-left:7px">maior preço</span>' : '');
    return `<div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--border)">
      <div style="flex:1;min-width:0">
        <div style="font-weight:600;font-size:13.5px">${fmtBRL(c.vUnit)} <span class="kpi-s" style="text-transform:none;letter-spacing:0">por ${esc(m.un)}</span>${marca}</div>
        <div class="kpi-s">${nfDataBR(c.dataISO)} · ${esc(c.fornecedor || nfCNPJfmt(c.cnpj) || 'fornecedor não informado')} · ${fmtQtd(c.qtd)} ${esc(m.un)}</div></div>
      <button class="btn btn-sm btn-ghost" onclick="fecharModal();nfEditar('${c.notaId}')">nota ${esc(c.numero)}</button></div>`;
  }).join('');
  const economia = ex && m.n > 1 ? (m.ultimo - ex.barato.vUnit) * m.qtdTotal : 0;
  abrirModal(esc(m.descricao), `
    <div class="grid g2" style="margin-bottom:14px">
      <div class="kpi"><div class="kpi-l">Preço médio</div><div class="kpi-v" style="font-size:20px">${fmtBRL(m.medio)}</div>
        <div class="kpi-s">ponderado pela quantidade</div></div>
      <div class="kpi"><div class="kpi-l">Último preço</div><div class="kpi-v" style="font-size:20px">${fmtBRL(m.ultimo)}</div>
        <div class="kpi-s">${m.comparavel ? sinalTxt(m.vsMedio) + ' que a média' : 'primeira compra'}</div></div></div>
    ${economia > 0.01 ? `<div class="nf-alerta nf-alerta-ylw">Comprando sempre pelo menor preço já praticado
      (${fmtBRL(ex.barato.vUnit)}, de ${esc(ex.barato.fornecedor || nfCNPJfmt(ex.barato.cnpj) || 'fornecedor não informado')}),
      o volume já adquirido sairia por ${fmtBRL(economia)} menos.</div>` : ''}
    <div class="nf-sep">Compras (${m.n})</div>
    ${linhas}
    <button class="btn" style="width:100%;justify-content:center;margin-top:14px" onclick="fecharModal()">Fechar</button>`, 620);
}
function sinalTxt(v) { return (v >= 0 ? '+' : '') + (v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%'; }

/* ---------- painel ---------- */
function nfViewPainel(o) {
  const notas = nfGet(o.id).filter(n => n.status !== 'Cancelada');
  if (!notas.length) return `<div class="empty">${ic('grafico')}Sem notas para consolidar ainda.</div>`;
  const total = notas.reduce((a, n) => a + nfNum(n.vTotal), 0);
  const frete = notas.reduce((a, n) => a + nfNum(n.vFrete), 0);
  const pend = notas.filter(n => n.status === 'Recebida' || n.status === 'Em análise').length;
  const diverg = notas.filter(n => n.status === 'Divergência encontrada' || nfDivergencia(n)).length;
  const mat = nfMateriais(o.id);
  const forn = nfFornecedores(o.id);

  // notas por obra (todas as obras geridas)
  const listaObras = (typeof ORDEM !== 'undefined' && typeof OBRAS !== 'undefined') ? ORDEM.map(id => OBRAS[id]) : [o];
  const porObra = listaObras.filter(x => x && !x.externo)
    .map(x => ({ nome: x.nome, n: nfGet(x.id).filter(n => n.status !== 'Cancelada').length, v: nfGet(x.id).filter(n => n.status !== 'Cancelada').reduce((a, n) => a + nfNum(n.vTotal), 0) }))
    .filter(x => x.n).sort((a, b) => b.v - a.v);

  // evolução mensal
  const porMes = {};
  notas.forEach(n => {
    const m = (n.dataEntrada || n.dataEmissao || '').slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(m)) return;
    const x = porMes[m] || (porMes[m] = { mes: m, n: 0, v: 0 });
    x.n++; x.v += nfNum(n.vTotal);
  });
  const meses = Object.values(porMes).sort((a, b) => a.mes.localeCompare(b.mes)).slice(-12);

  const kpis = `<div class="grid g4" style="margin-bottom:18px">
    <div class="kpi kpi-hero"><div class="kpi-l">Valor recebido</div><div class="kpi-v">${fmtBRLc(total)}</div><div class="kpi-s">${notas.length} nota(s) · frete ${fmtBRLc(frete)}</div></div>
    <div class="kpi"><div class="kpi-l">Notas</div><div class="kpi-v">${notas.length}</div><div class="kpi-s">${pend} aguardando conferência</div></div>
    <div class="kpi"><div class="kpi-l">Fornecedores</div><div class="kpi-v">${forn.length}</div><div class="kpi-s">${mat.length} materiais distintos</div></div>
    <div class="kpi"><div class="kpi-l">Divergências</div><div class="kpi-v" style="color:${diverg ? 'var(--vermelho)' : 'var(--accent)'}">${diverg}</div><div class="kpi-s">${diverg ? 'notas para revisar' : 'nenhuma pendência'}</div></div></div>`;

  const evolucao = meses.length ? `<div class="card" style="margin-bottom:18px"><div class="card-h">
      <div><div class="card-t">Evolução mensal dos recebimentos</div><div class="card-st">valor das notas por mês de recebimento</div></div></div>
    <div class="card-b">${nfBarrasSVG(meses)}</div></div>` : '';

  const listaTop = (titulo, sub, linhas) => `<div class="card"><div class="card-h"><div><div class="card-t">${titulo}</div><div class="card-st">${sub}</div></div></div>
    <div class="card-b" style="padding:8px 20px 16px">${linhas || '<div class="kpi-s" style="padding:10px 0">Sem dados.</div>'}</div></div>`;
  const barra = (nome, det, v, max) => `<div style="padding:9px 0;border-bottom:1px solid var(--border)">
    <div style="display:flex;justify-content:space-between;gap:10px;font-size:13.5px"><span style="font-weight:600;flex:1;min-width:0">${esc(nome)}</span>
      <span class="mono" style="font-weight:700;white-space:nowrap">${fmtBRL(v)}</span></div>
    <div class="kpi-s">${esc(det)}</div>
    <div class="bar" style="margin-top:6px"><i style="width:${max ? (v / max * 100).toFixed(1) : 0}%"></i></div></div>`;

  const maxF = Math.max(1, ...forn.map(f => f.valor));
  const maxM = Math.max(1, ...mat.map(m => m.valor));
  const maxO = Math.max(1, ...porObra.map(x => x.v));

  return kpis + evolucao + `<div class="grid g2" style="align-items:start;margin-bottom:18px">
    ${listaTop('Principais fornecedores', forn.length + ' no total', forn.slice(0, 6).map(f => barra(f.nome, f.notas + ' nota(s) · ' + (f.municipio ? f.municipio + '/' + f.uf : nfCNPJfmt(f.cnpj)), f.valor, maxF)).join(''))}
    ${listaTop('Materiais mais recebidos', mat.length + ' materiais', mat.slice(0, 6).map(m => barra(m.descricao, fmtQtd(m.qtd) + ' ' + m.un + ' · ' + m.notas + ' nota(s)', m.valor, maxM)).join(''))}
  </div>
  <div class="grid g2" style="align-items:start">
    ${listaTop('Notas por obra', 'todas as obras geridas no app', porObra.map(x => barra(x.nome, x.n + ' nota(s)', x.v, maxO)).join(''))}
    ${listaTop('Situação das notas', 'fluxo de conferência', NF_STATUS.map(s => {
      const q = nfGet(o.id).filter(n => n.status === s).length;
      if (!q) return '';
      return `<div style="display:flex;justify-content:space-between;align-items:center;padding:9px 0;border-bottom:1px solid var(--border)">
        <span class="pill ${NF_STATUS_COR[s]}">${s}</span><span class="mono" style="font-weight:700">${q}</span></div>`;
    }).join(''))}
  </div>`;
}
function nfBarrasSVG(meses) {
  const W = 620, H = 190, pad = 34, pw = W - pad * 2, ph = H - pad * 2;
  const max = Math.max(1, ...meses.map(m => m.v));
  const n = meses.length;
  const lw = Math.min(46, pw / Math.max(n, 1) * 0.62);
  const barras = meses.map((m, i) => {
    const x = pad + (pw / n) * (i + 0.5) - lw / 2;
    const h = Math.max(2, (m.v / max) * ph);
    const y = pad + ph - h;
    return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${lw.toFixed(1)}" height="${h.toFixed(1)}" rx="3" fill="var(--accent)" opacity=".85"><title>${esc(mesLabel(m.mes + '-01'))}: ${fmtBRL(m.v)} em ${m.n} nota(s)</title></rect>
      <text x="${(x + lw / 2).toFixed(1)}" y="${(y - 5).toFixed(1)}" text-anchor="middle" font-size="9.5" font-family="JetBrains Mono,monospace" fill="var(--text-2)">${fmtBRLc(m.v).replace('R$ ', '')}</text>
      <text x="${(x + lw / 2).toFixed(1)}" y="${H - pad + 15}" text-anchor="middle" font-size="10" fill="var(--muted)">${esc(mesLabel(m.mes + '-01'))}</text>`;
  }).join('');
  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block" role="img" aria-label="Evolução mensal dos recebimentos">
    <line x1="${pad}" y1="${pad + ph}" x2="${W - pad}" y2="${pad + ph}" stroke="var(--border)"/>${barras}</svg>`;
}

/* ---------- carga do servidor ---------- */
/* Uma trava POR OBRA, e nao uma so para o app inteiro: com a trava global,
   trocar de obra no meio de uma carga fazia a obra nova voltar em silencio,
   e a tela ficava com a lista da outra ate alguem sair e entrar. */
const _nfCarregando = {};
/* Quando cada obra sincronizou pela ultima vez, e por que falhou. A tela
   mostra isso: sem esse aviso, lista velha e lista atual sao identicas na
   aparencia — foi assim que uma nota lancada num aparelho passou o dia sem
   aparecer no outro, sem nenhum sinal de que nada estava sendo buscado. */
const nfSync = {};
function nfSyncEstado(obraId) { return nfSync[obraId] || { em: 0, erro: '' }; }

async function nfCarregar(obraId, opcoes) {
  if (!BACKEND || isDemo() || !obraId) return;
  if (_nfCarregando[obraId]) return;
  if (!getToken()) {
    nfSync[obraId] = { em: nfSyncEstado(obraId).em, erro: 'semLogin' };
    return;
  }
  _nfCarregando[obraId] = true;
  const antes = JSON.stringify(nfGet(obraId).map(n => [n.id, n.status, n.atualizadoEm || 0]));
  try {
    const r = await postAcao({ action: 'nfListar', obra: obraId });
    if (r && r.ok && Array.isArray(r.notas)) {
      const locais = nfGet(obraId);
      const pend = new Set(outboxLer().filter(it => it.tipo === 'nf').map(it => it.clientId));
      const naoConf = locais.filter(l => pend.has(l.clientId || l.id));
      const mapa = {};
      r.notas.forEach(s => { mapa[s.clientId || s.id] = nfDoServidor(s, obraId, locais); });
      naoConf.forEach(l => { mapa[l.clientId || l.id] = l; });
      nfSet(obraId, Object.values(mapa).sort((a, b) => (b.dataEntrada || '').localeCompare(a.dataEntrada || '')));
    }
    if (r && r.ok && Array.isArray(r.saidas)) {
      // saida pendente na fila nao pode ser sobrescrita pelo servidor
      const pendS = new Set(outboxLer().filter(it => it.tipo === 'saida').map(it => it.clientId));
      const locaisS = nfSaiGet(obraId).filter(x => pendS.has(x.id));
      const mapaS = {};
      r.saidas.forEach(s => { const x = nfSaidaDoServidor(s, obraId); mapaS[x.id] = x; });
      locaisS.forEach(x => { mapaS[x.id] = x; });
      nfSaiSet(obraId, Object.values(mapaS).sort((a, b) => (b.dataISO || '').localeCompare(a.dataISO || '')));
    }
    if (!r || !r.ok) throw new Error((r && r.error) || 'resposta invalida');
    nfSync[obraId] = { em: Date.now(), erro: '' };
    /* Redesenha quando a lista MUDOU, e nao quando dois estados batem.
       A condicao antiga comparava `estado.obraId`, que nem existia neste
       app: dava sempre falso, a nota nova era gravada no aparelho e a tela
       so mostrava depois de sair e voltar. */
    const depois = JSON.stringify(nfGet(obraId).map(n => [n.id, n.status, n.atualizadoEm || 0]));
    if (estado.tela === 'notas' && (depois !== antes || !(opcoes && opcoes.fundo))) render();
  } catch (e) {
    // offline: fica com o que ja esta no aparelho, mas a tela passa a dizer isso
    nfSync[obraId] = { em: nfSyncEstado(obraId).em, erro: String((e && e.message) || 'falha') };
    if (estado.tela === 'notas' && !(opcoes && opcoes.fundo)) render();
  }
  finally { delete _nfCarregando[obraId]; }
}
function nfDoServidor(s, obraId, locais) {
  const local = locais.find(l => (l.clientId || l.id) === (s.clientId || s.id));
  let itens = [];
  try {
    if (Array.isArray(s.itens)) itens = s.itens;
    else if (typeof s.itens === 'string' && s.itens.trim()) itens = JSON.parse(s.itens);
    else if (Array.isArray(s.Itens)) itens = s.Itens;
    else if (typeof s.Itens === 'string' && s.Itens.trim()) itens = JSON.parse(s.Itens);
  } catch (e) { itens = []; }
  if (!Array.isArray(itens)) itens = [];
  let hist = [];
  try {
    if (Array.isArray(s.historico)) hist = s.historico;
    else if (typeof s.historico === 'string' && s.historico.trim()) hist = JSON.parse(s.historico);
  } catch (e) { hist = []; }
  let leitura = {};
  try {
    if (typeof s.leitura === 'object' && s.leitura) leitura = s.leitura;
    else if (typeof s.leitura === 'string' && s.leitura.trim()) leitura = JSON.parse(s.leitura);
  } catch (e) { leitura = {}; }
  return {
    id: s.id, clientId: s.clientId || s.id, obraId: obraId,
    numero: String(s.numero || ''), serie: String(s.serie || ''), chave: nfChaveNorm(s.chave),
    dataEmissao: nfISO(s.dataEmissao), dataEntrada: nfISO(s.dataEntrada),
    cnpj: nfCNPJnorm(s.cnpj), razaoSocial: s.razaoSocial || '', nomeFantasia: s.nomeFantasia || '',
    municipio: s.municipio || '', uf: s.uf || '',
    vProd: nfNum(s.vProd), vFrete: nfNum(s.vFrete), vTotal: nfNum(s.vTotal),
    vBaseICMS: nfNum(s.vBaseICMS), vICMS: nfNum(s.vICMS),
    itens: itens, obs: s.obs || '', responsavel: s.responsavel || '',
    status: s.status === 'Integrada ao pedido de compra' ? 'Conferida' : (NF_STATUS.indexOf(s.status) > -1 ? s.status : 'Recebida'),
    drive: s.driveId ? { fileId: s.driveId, link: s.driveLink || '' } : null,
    paginas: nfPaginasDoServidor(s, local),
    thumb: (local && local.thumb) || '',
    leitura: leitura, leituraConf: (local && local.leituraConf) || {},
    historico: hist, usuario: s.usuario || '',
    criadoEm: nfNum(s.criadoEm) || Date.now(), atualizadoEm: Date.now()
  };
}

/* As folhas 2..N vem da coluna `paginas`, em JSON. Backend ainda nao
   republicado nao manda a coluna: nesse caso o que ja estava no aparelho
   e mantido, para uma sincronizacao nao apagar paginas que existem. */
function nfPaginasDoServidor(s, local) {
  const bruto = s.paginas != null ? s.paginas : s.Paginas;
  if (bruto == null || bruto === '') return (local && local.paginas) || [];
  let arr = bruto;
  if (typeof arr === 'string') { try { arr = JSON.parse(arr); } catch (e) { return (local && local.paginas) || []; } }
  if (!Array.isArray(arr)) return (local && local.paginas) || [];
  return arr.filter(x => x && x.fileId);
}

/* quantas notas a obra tem — usado no badge da navegação */
function nfTotal(obraId) { return nfGet(obraId).length; }

/* ============================================================
   MODO DEMONSTRACAO — notas ficticias, so neste navegador
   Nada aqui vai para o servidor (o app inteiro checa isDemo()).
   ============================================================ */
function _nfDemoCNPJ(base12) {
  const calc = (b, pesos) => { let s = 0; for (let i = 0; i < pesos.length; i++) s += (+b[i]) * pesos[i]; const r = s % 11; return r < 2 ? 0 : 11 - r; };
  const d1 = calc(base12, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = calc(base12 + d1, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return base12 + d1 + d2;
}
function _nfDemoChave(cUF, aamm, cnpj, serie, numero) {
  const b = String(cUF) + aamm + cnpj + '55' +
    ('000' + serie).slice(-3) + ('00000000' + numero).slice(-9) + '1' + ('0000000' + (numero * 7 % 99999999)).slice(-8);
  return b + nfDVchave(b);
}
/* miniatura de uma DANFE desenhada no proprio navegador (nenhum arquivo externo) */
function _nfDemoImagem(numero, fornecedor, valor) {
  const c = document.createElement('canvas'); c.width = 330; c.height = 430;
  const x = c.getContext('2d');
  x.fillStyle = '#f2f0ea'; x.fillRect(0, 0, 330, 430);
  x.fillStyle = '#fff'; x.fillRect(12, 12, 306, 406);
  x.strokeStyle = '#111'; x.lineWidth = 1.4; x.strokeRect(20, 20, 290, 390);
  x.fillStyle = '#111';
  x.font = 'bold 15px sans-serif'; x.fillText('DANFE', 30, 44);
  x.font = '7.5px sans-serif';
  x.fillText('Documento Auxiliar da', 30, 56); x.fillText('Nota Fiscal Eletrônica', 30, 65);
  x.font = 'bold 9px monospace';
  x.fillText('Nº ' + numero, 232, 44); x.fillText('SÉRIE 1', 232, 56);
  // codigo de barras decorativo
  let px = 30;
  for (let i = 0; i < 88; i++) { const w = 1 + (i * 7 % 3); x.fillStyle = i % 2 ? '#fff' : '#111'; x.fillRect(px, 76, w, 26); px += w; if (px > 296) break; }
  x.fillStyle = '#111'; x.font = '6px monospace';
  x.fillText('CHAVE DE ACESSO', 30, 112);
  x.strokeStyle = '#111'; x.beginPath(); x.moveTo(20, 120); x.lineTo(310, 120); x.stroke();
  x.font = 'bold 9px sans-serif';
  x.fillText(String(fornecedor).slice(0, 34), 30, 136);
  x.font = '7.5px sans-serif'; x.fillStyle = '#444';
  x.fillText('EMITENTE · SÃO PAULO / SP', 30, 147);
  x.strokeStyle = '#999'; x.beginPath(); x.moveTo(20, 156); x.lineTo(310, 156); x.stroke();
  x.fillStyle = '#111'; x.font = 'bold 7px sans-serif';
  x.fillText('DADOS DOS PRODUTOS / SERVIÇOS', 30, 170);
  x.fillStyle = '#666'; x.font = '7px sans-serif';
  for (let i = 0; i < 12; i++) {
    const y = 184 + i * 15;
    x.fillStyle = i % 2 ? '#fafafa' : '#fff'; x.fillRect(24, y - 9, 282, 14);
    x.fillStyle = '#555';
    x.fillRect(30, y - 3, 120 + (i * 23 % 70), 2.2);
    x.fillRect(210, y - 3, 26, 2.2);
    x.fillRect(258, y - 3, 42, 2.2);
  }
  x.strokeStyle = '#111'; x.strokeRect(24, 372, 282, 30);
  x.fillStyle = '#111'; x.font = 'bold 8px sans-serif'; x.fillText('VALOR TOTAL DA NOTA', 32, 385);
  x.font = 'bold 13px monospace'; x.fillText('R$ ' + valor.toFixed(2).replace('.', ','), 32, 399);
  return c.toDataURL('image/jpeg', 0.72);
}
function _nfDemoSeed(o) {
  let seed = 20260728; const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const isoAdd = (b, d) => { const x = new Date(b + 'T00:00:00'); x.setDate(x.getDate() + d); return x.toISOString().slice(0, 10); };
  const forn = [
    { cnpj: _nfDemoCNPJ('613044550001'), nome: 'CONCRETEIRA PAULISTA LTDA', fant: 'Concreteira Paulista', mun: 'São Paulo', uf: 'SP' },
    { cnpj: _nfDemoCNPJ('204119870001'), nome: 'TUBOS E ARTEFATOS SÃO JORGE LTDA', fant: 'Tubos São Jorge', mun: 'Guarulhos', uf: 'SP' },
    { cnpj: _nfDemoCNPJ('331508220001'), nome: 'PEDREIRA VALE DO TIETÊ S/A', fant: 'Pedreira Vale', mun: 'Santana de Parnaíba', uf: 'SP' },
    { cnpj: _nfDemoCNPJ('478290110001'), nome: 'AÇO FORTE COMÉRCIO DE FERRO LTDA', fant: 'Aço Forte', mun: 'Osasco', uf: 'SP' }
  ];
  const catalogo = [
    [0, 'CONCRETO USINADO FCK 25 MPA', 'M3', 480], [0, 'CONCRETO USINADO FCK 30 MPA', 'M3', 512],
    [1, 'TUBO DE CONCRETO PA-1 DN 400MM', 'M', 96], [1, 'TUBO DE CONCRETO PA-1 DN 600MM', 'M', 168],
    [1, 'ARO E TAMPA DE FERRO FUNDIDO D400', 'UN', 640],
    [2, 'BRITA 1 GRADUADA', 'M3', 118], [2, 'PEDRISCO', 'M3', 104], [2, 'AREIA MEDIA LAVADA', 'M3', 92],
    [3, 'VERGALHAO CA-50 10,0MM', 'KG', 8.4], [3, 'VERGALHAO CA-60 5,0MM', 'KG', 9.1],
    [3, 'TELA SOLDADA Q-196', 'M2', 27.5]
  ];
  // datas contadas de hoje para tras: numa apresentacao, nota com data
  // no futuro entrega na hora que os dados sao ficticios
  const base = hoje();
  const notas = [];
  const status = ['Integrada ao estoque', 'Conferida', 'Integrada ao estoque', 'Em análise', 'Recebida', 'Divergência encontrada', 'Integrada ao estoque', 'Conferida', 'Integrada ao estoque'];
  for (let i = 0; i < 9; i++) {
    const f = forn[i % forn.length];
    const dia = isoAdd(base, -(6 + i * 11 + Math.floor(rnd() * 6)));
    const numero = 18420 + i * 37;
    const meus = catalogo.filter(c => c[0] === (i % forn.length));
    const qtos = 1 + Math.floor(rnd() * Math.min(3, meus.length));
    const itens = [];
    for (let k = 0; k < qtos; k++) {
      const c = meus[(k + i) % meus.length];
      const q = +(c[2] === 'KG' ? 300 + rnd() * 900 : 8 + rnd() * 40).toFixed(2);
      const vu = +(c[3] * (0.94 + rnd() * 0.12)).toFixed(2);
      itens.push({ codigo: 'P' + (100 + k + i * 3), descricao: c[1], qtd: q, un: c[2], vUnit: vu, vTotal: +(q * vu).toFixed(2), materialId: '' });
    }
    const vProd = +itens.reduce((a, it) => a + it.vTotal, 0).toFixed(2);
    const vFrete = +(vProd * 0.025).toFixed(2);
    const st = status[i];
    // uma nota fica de proposito com o total fora, para o alerta de divergencia aparecer
    const vTotal = st === 'Divergência encontrada' ? +(vProd + vFrete - 412.9).toFixed(2) : +(vProd + vFrete).toFixed(2);
    const chave = _nfDemoChave(35, dia.slice(2, 4) + dia.slice(5, 7), f.cnpj, 1, numero);
    notas.push({
      id: 'nfd' + i + '_' + o.id, clientId: 'nfd' + i + '_' + o.id, obraId: o.id,
      numero: String(numero), serie: '1', chave: chave,
      dataEmissao: dia, dataEntrada: isoAdd(dia, rnd() > 0.6 ? 1 : 0),
      cnpj: f.cnpj, razaoSocial: f.nome, nomeFantasia: f.fant, municipio: f.mun, uf: f.uf,
      vProd: vProd, vFrete: vFrete, vTotal: vTotal,
      vBaseICMS: vProd, vICMS: +(vProd * 0.18).toFixed(2),
      itens: itens, obs: st === 'Divergência encontrada' ? 'Faltou 1 peça na descarga — aguardando carta de correção.' : '',
      responsavel: ['Wallace', 'Guilherme', 'Leonardo'][i % 3], status: st,
      drive: null, thumb: _nfDemoImagem(numero, f.fant, vTotal),
      leitura: { metodo: i % 3 === 2 ? 'codigo+ia' : (i % 3 === 1 ? 'codigo' : 'ia'), quando: Date.now() - i * 86400000, confiancaGeral: i % 3 === 0 ? 0.82 : 1 },
      leituraConf: {},
      historico: [{ quando: Date.now() - i * 86400000, usuario: ['Wallace', 'Guilherme', 'Leonardo'][i % 3], acao: 'cadastrada', detalhe: 'nº ' + numero }],
      usuario: ['Wallace', 'Guilherme', 'Leonardo'][i % 3], criadoEm: Date.now() - i * 86400000, atualizadoEm: Date.now() - i * 86400000
    });
  }
  return { notas: notas };
}

/* grava a demo das notas e ja gera o estoque, para as abas Estoque e
   Painel abrirem com conteudo na apresentacao */
function nfDemoCarregar(o) {
  const d = _nfDemoSeed(o);
  nfSet(o.id, d.notas);
  nfMovSet(o.id, []);
  d.notas.forEach(n => {
    nfAutoVincular(o.id, n);
    if (n.status !== 'Cancelada' && n.status !== 'Recebida') nfIntegrarEstoque(o.id, n);
  });
  nfSet(o.id, d.notas);
  // algumas saidas, para a aba abrir com saldo de verdade na apresentacao
  const saldos = nfSaldos(o.id).filter(s => s.entradas > 0).slice(0, 4);
  const frentes = o.frentes || [];
  const diasAtras = d => { const x = new Date(hoje() + 'T00:00:00'); x.setDate(x.getDate() - d); return x.toISOString().slice(0, 10); };
  nfSaiSet(o.id, saldos.map((s, i) => ({
    id: 'sad' + i + '_' + o.id, obraId: o.id, materialId: s.id, descricao: s.descricao, un: s.un,
    // unidade contavel nao sai pela metade: 3 aros, nao 3,42
    qtd: (function (q) { return ['UN', 'PC', 'CX', 'SC', 'CJ', 'RL', 'BR', 'MIL', 'PAR'].indexOf(String(s.un).toUpperCase()) > -1 ? Math.max(1, Math.round(q)) : +q.toFixed(2); })(s.entradas * (0.3 + i * 0.15)),
    dataISO: diasAtras(3 + i * 4),
    capId: frentes.length ? frentes[i % frentes.length].id : null,
    rua: (o.ruas || [])[i % Math.max(1, (o.ruas || []).length)] || '',
    responsavel: ['Wallace', 'Guilherme', 'Leonardo'][i % 3], obs: 'Aplicado na frente de serviço',
    usuario: ['Wallace', 'Guilherme', 'Leonardo'][i % 3], criadoEm: Date.now() - i * 86400000
  })));
}
function nfDemoLimpar(o) {
  localStorage.removeItem(nfKey(o.id));
  localStorage.removeItem('gestor:nfmov:' + o.id);
  localStorage.removeItem(nfSaiKey(o.id));
  localStorage.removeItem('gestor:pedidos:' + o.id);   // sobra da versao com pedido de compra
}
