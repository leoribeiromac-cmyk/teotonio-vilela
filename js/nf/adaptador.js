/* ============================================================
   ADAPTADOR DO MÓDULO DE NOTAS FISCAIS
   ------------------------------------------------------------
   `js/nf/notas.js` é o MESMO arquivo do app "Gestor — Controle de
   Obras", copiado sem alteração. Ele foi escrito contra o vocabulário
   daquele app (obra(), postAcao(), esc(), fmtBRL()…). Em vez de
   reescrever 1.900 linhas testadas em campo, este arquivo traduz o
   vocabulário do Teotônio para o dele.

   Regra: nada de lógica de negócio aqui. Só ponte. Assim, quando o
   módulo for corrigido de um lado, basta copiar o arquivo de novo.
   ============================================================ */
'use strict';

/* ---------- identidade da obra ----------
   O Gestor é multi-obra e passa o id em toda chamada. Aqui é uma obra
   só, então o id é fixo — e as linhas continuam saindo com a coluna
   `obra` preenchida, do mesmo jeito, o que mantém os dois backends
   compatíveis. */
const OBRA_TEOTONIO = {
  id: 'teotonio',
  nome: 'Av. Senador Teotônio Vilela',
  contrato: '084/SPOBRAS/2024 · CC 182',
  contratada: 'Gestor Engenharia',
  local: 'São Paulo/SP'
};
function obra() { return OBRA_TEOTONIO; }

/* ---------- estado das telas de nota ----------
   O módulo lê e escreve `estado.nfTab`, `estado.nfBusca` etc. */
const estado = {
  nfTab: 'notas', nfBusca: '', nfStatus: 'Todos', nfMes: 'Todos', nfLimite: 24,
  get tela() { return STATE.currentPage; },
  set tela(v) { STATE.currentPage = v; }
};

/* ---------- utilidades de texto e número ---------- */
function el(id) { return document.getElementById(id); }
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function fmtBRL(n) { return 'R$ ' + (n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function fmtBRLc(n) {
  n = n || 0;
  if (n >= 1e6) return 'R$ ' + (n / 1e6).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' mi';
  if (n >= 1e3) return 'R$ ' + (n / 1e3).toLocaleString('pt-BR', { maximumFractionDigits: 0 }) + ' mil';
  return fmtBRL(n);
}
function fmtQtd(n) { return (n || 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 }); }
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function hoje() { return new Date().toISOString().slice(0, 10); }
function isoAdd(iso, dias) {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
}
function mesLabel(iso) {
  const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const [a, m] = String(iso).split('-');
  return MESES[(+m) - 1] + '/' + String(a).slice(2);
}
/* No Gestor, o serviço tem "frente"; aqui o equivalente é a frente do
   pacote. A saída de estoque grava o texto, então basta devolvê-lo. */
function frenteNome(o, id) { return id == null ? '' : String(id); }

/* Modo demonstração não existe neste app — nada é bloqueado por isso. */
function isDemo() { return false; }

/* ---------- backend ---------- */
const BACKEND = true;
function getToken() { return tokenSessao(); }
function usuarioAtual() { return STATE.usuarioLogado || ''; }

/* O módulo chama postAcao({action:…}) e espera a resposta do Apps
   Script. Aqui isso é o jsonp do app, com o token da sessão. */
function postAcao(params) {
  return jsonp(CONFIG.appsScript, { ...params, ...authParams() }, 1, 2000);
}

/* ---------- fila offline ----------
   Nomes diferentes dos dois lados; o comportamento é o mesmo. */
function outboxAdd(item) { outboxAdicionar(item); }

/* ---------- imagens ----------
   O módulo guarda a imagem da nota em resolução boa no aparelho.
   O Teotônio já tem esse cofre (IndexedDB) para as fotos do serviço. */
function fotoGuardarFull(chave, dataUrl) { return fotoGuardar(chave, dataUrl); }
function fotoLerFull(chave) { return fotoLer(chave); }

/* ---------- modal ----------
   O modal do Teotônio não tem título próprio; aqui ele é desenhado
   junto do conteúdo, para as telas do módulo saírem iguais. */
function abrirModal(titulo, html, larg) {
  abrirModalRDO(`
    <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:16px">
      <div style="font-weight:700;font-size:16px">${titulo || ''}</div>
      <button class="btn btn-ghost btn-sm" onclick="fecharModal()" aria-label="Fechar">✕</button>
    </div>
    <div${larg ? ` style="max-width:${larg}px"` : ''}>${html}</div>`);
}
function fecharModal() { fecharModalRDO(); }

/* Expõe no window: notas.js é carregado como script comum e procura
   estas funções no escopo global. */
if (typeof window !== 'undefined') {
  Object.assign(window, {
    obra, estado, el, esc, fmtBRL, fmtBRLc, fmtQtd, uid, hoje, isoAdd, mesLabel,
    frenteNome, isDemo, BACKEND, getToken, usuarioAtual, postAcao, outboxAdd,
    fotoGuardarFull, fotoLerFull, abrirModal, fecharModal
  });
}
