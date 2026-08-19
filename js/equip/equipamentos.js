/*
 * Sistema de controle de obra — Av. Senador Teotônio Vilela
 * Copyright © 2026 Leonardo Maciel. Todos os direitos reservados.
 *
 * Software proprietário. O código estar visível não autoriza uso, cópia
 * nem obra derivada — ver LICENSE, na raiz do repositório.
 */
/* ====================================================================
   EQUIPAMENTOS — apontamento de hora de máquina
   --------------------------------------------------------------------
   Portado do app `Equipamentos-teotonio`, que os apontadores já usam em
   campo. A LÓGICA veio de lá sem reescrita — cálculo de horas líquidas,
   paradas múltiplas, assinatura, painel e a medição mensal em Excel são
   os mesmos, e por isso o comportamento no canteiro não muda.

   O que mudou na vinda:
     • a tela é montada sob demanda, quando se entra em Equipamentos,
       em vez de na carga da página;
     • Tailwind, Phosphor e a fonte Outfit (que vinham de CDN) deram
       lugar ao CSS, aos ícones e às fontes do próprio app — o sistema
       precisa abrir offline no canteiro;
     • o xlsx-js-style é o de `vendor/`, carregado só ao exportar.

   O BACKEND é POR OBRA, e são dois dialetos:
     • a TEOTÔNIO segue no Apps Script legado do app de equipamentos
       (URL no campo `equipamentos` do cadastro dela): os apontamentos
       já lançados seguem valendo e nada precisa ser migrado;
     • as DEMAIS obras usam o backend principal delas (Code.gs), que
       guarda tudo nas abas Equipamentos/Locadoras/ApontEquip separadas
       pela coluna `obra` — cada obra vê e lança só o que é dela.
   A tela é UMA só; backendEquip() decide URL e dialeto a cada chamada.
   ==================================================================== */
(function () {
  'use strict';
        // ============== QUAL BACKEND ATENDE A OBRA ABERTA ==============
        // Resolvido a cada chamada — troca-se de obra sem recarregar a
        // página. Obra com `equipamentos` no cadastro fala o protocolo
        // LEGADO nessa URL; as demais falam com o Code.gs da própria obra.
        function backendEquip() {
            var legado = (typeof OBRA !== 'undefined' && OBRA && OBRA.equipamentos) || '';
            if (legado) return { url: legado, legado: true };
            var principal = (typeof CONFIG !== 'undefined' && CONFIG && CONFIG.appsScript) || '';
            return { url: principal, legado: false };
        }

        // O mesmo pedido, nos dois dialetos: o nome da ação muda, e o
        // principal exige a obra e o token (as ações são protegidas lá).
        const ACAO_PRINCIPAL = {
            listas: 'equipListar',
            ultimos: 'equipUltimos',
            relatorio: 'equipApontamentos',
            cadastrarEquipamento: 'equipCadastrar',
            cadastrarLocadora: 'locadoraCadastrar',
            desativarEquipamento: 'equipDesativar',
            apagarApontamento: 'equipApagar',
            editarApontamento: 'equipEditar',
        };

        function paramsPrincipal() {
            const out = { obra: (typeof OBRA !== 'undefined' && OBRA && OBRA.id) || '' };
            const t = (typeof tokenSessao === 'function') ? tokenSessao() : '';
            if (t) out.token = t;
            return out;
        }

        // URL de GET no dialeto do backend da obra aberta.
        function urlEquip(acao, params) {
            const be = backendEquip();
            if (!be.url) return '';
            const q = new URLSearchParams();
            q.set('action', be.legado ? acao : (ACAO_PRINCIPAL[acao] || acao));
            Object.keys(params || {}).forEach(k => {
                if (params[k] !== '' && params[k] != null) q.set(k, params[k]);
            });
            if (!be.legado) {
                const extra = paramsPrincipal();
                Object.keys(extra).forEach(k => q.set(k, extra[k]));
            }
            return be.url + '?' + q.toString();
        }

        // Resolvidas em EQ.boot(), depois que a tela existe no DOM.
        let form = null, submitBtn = null, btnText = null;

        // Conversor de Horas
        function timeToMinutes(timeStr) {
            if (!timeStr) return 0;
            const [hours, minutes] = timeStr.split(':').map(Number);
            return (hours * 60) + minutes;
        }

        // Lógica de Cálculo de Horas Líquidas
        function calcularHoras() {
            const start = document.getElementById('inicio').value;
            const end = document.getElementById('fim').value;
            const displayElt = document.getElementById('horasDisplay');

            if (!start || !end) {
                document.getElementById('horas').value = 0;
                displayElt.innerHTML = '0.00<span class="eq-h">h</span>';
                return;
            }

            let workMins = timeToMinutes(end) - timeToMinutes(start);
            if (workMins < 0) workMins += 24 * 60; 

            let stopMins = 0;
            document.querySelectorAll('#paradasList .parada-row').forEach(row => {
                const si = row.querySelector('.parada-inicio').value;
                const sf = row.querySelector('.parada-fim').value;
                if (si && sf) {
                    let m = timeToMinutes(sf) - timeToMinutes(si);
                    if (m < 0) m += 24 * 60;
                    stopMins += m;
                }
            });

            let totalMins = workMins - stopMins;
            if (totalMins < 0) totalMins = 0;

            const totalHours = (totalMins / 60).toFixed(2);
            
            document.getElementById('horas').value = totalHours; 
            displayElt.innerHTML = `${totalHours}<span class="eq-h">h</span>`;
            
            // Animação de glow ao atualizar
            displayElt.parentElement.classList.add('shadow-[0_0_30px_rgba(6,182,212,0.5)]');
            setTimeout(() => displayElt.parentElement.classList.remove('shadow-[0_0_30px_rgba(6,182,212,0.5)]'), 400);
        }

        // Preenche início/fim automaticamente conforme o turno escolhido (Diurno 07-17 / Noturno 19-05)
        function aplicarTurno() {
            const sel = document.getElementById('turno');
            const opt = sel.options[sel.selectedIndex];
            if (!opt) return;
            const ini = opt.getAttribute('data-inicio');
            const fim = opt.getAttribute('data-fim');
            if (ini && fim) {
                document.getElementById('inicio').value = ini;
                document.getElementById('fim').value = fim;
                calcularHoras();
            }
        }

        /* ===================== PARADAS MÚLTIPLAS ===================== */
        function adicionarParada(motivo, ini, fim) {
            const list = document.getElementById('paradasList');
            const row = document.createElement('div');
            row.className = 'parada-row eq-parada';
            // Motivo e lixeira em cima, horário embaixo: no celular os dois
            // campos de hora, o "até" e o botão não cabiam na mesma linha —
            // a lixeira ficava para fora do cartão.
            row.innerHTML = `
                <div class="eq-parada-topo">
                    <select class="parada-motivo" aria-label="Motivo da parada">
                        <option value="">Motivo da parada...</option>
                        <option>Almoço</option>
                        <option>Refeição</option>
                        <option>Manutenção / Quebra</option>
                        <option>Chuva</option>
                        <option>Abastecimento</option>
                        <option>Sem operador</option>
                        <option>Sem frente de serviço</option>
                        <option>Outro</option>
                    </select>
                    <button type="button" class="parada-remover btn btn-ghost btn-icone" title="Remover parada" aria-label="Remover parada">${ic('lixeira')}</button>
                </div>
                <div class="eq-parada-horas">
                    <input type="time" class="parada-inicio mono" aria-label="Início da parada">
                    <span class="eq-ate">até</span>
                    <input type="time" class="parada-fim mono" aria-label="Fim da parada">
                </div>`;
            list.appendChild(row);
            if (motivo) row.querySelector('.parada-motivo').value = motivo;
            if (ini) row.querySelector('.parada-inicio').value = ini;
            if (fim) row.querySelector('.parada-fim').value = fim;
            row.querySelector('.parada-inicio').addEventListener('change', calcularHoras);
            row.querySelector('.parada-fim').addEventListener('change', calcularHoras);
            row.querySelector('.parada-remover').addEventListener('click', () => { row.remove(); atualizarParadasVazio(); calcularHoras(); });
            atualizarParadasVazio();
        }
        function atualizarParadasVazio() {
            const vazio = document.getElementById('paradasVazio');
            if (vazio) vazio.style.display = document.querySelectorAll('#paradasList .parada-row').length ? 'none' : '';
        }
        function resumoParadas() {
            const arr = [];
            document.querySelectorAll('#paradasList .parada-row').forEach(row => {
                const mot = row.querySelector('.parada-motivo').value || 'Parada';
                const si = row.querySelector('.parada-inicio').value;
                const sf = row.querySelector('.parada-fim').value;
                if (si && sf) arr.push(`${mot} ${si}-${sf}`);
            });
            return arr.join('; ');
        }

        function ligarFormApontamento() {
        form.addEventListener('submit', e => {
            e.preventDefault();

            if (!backendEquip().url) {
                showToast('Falha na autenticação: Endpoint não configurado.', 'error');
                return;
            }

            // Formatação inteligente da observação para a planilha
            const turno = document.getElementById('turno').value;
            const inicio = document.getElementById('inicio').value;
            const fim = document.getElementById('fim').value;
            const obsUsuario = document.getElementById('observacoesUI').value;
            const paradasTxt = resumoParadas() || 'Sem paradas';
            
            const textoDetalhado = `[Turno: ${turno}] | Operação: ${inicio} às ${fim} | Paradas: ${paradasTxt}\nDetalhes: ${obsUsuario ? obsUsuario : 'Sem detalhes adicionais.'}`;
            
            document.getElementById('observacoes').value = textoDetalhado;

            // Etapa 2 — valida as horas e abre a tela de confirmação.
            // O envio real ao servidor acontece em enviarApontamento() ao confirmar.
            const horasCalc = parseFloat(document.getElementById('horas').value || '0');
            if (!horasCalc || horasCalc <= 0) {
                showToast('Confira os horários: as horas calculadas estão zeradas.', 'error');
                return;
            }
            // Sanidade do horímetro/km: o final não pode ser menor que o inicial
            const brutoHi = document.getElementById('horimInicial').value;
            const brutoHf = document.getElementById('horimFinal').value;
            const hi = brutoHi.trim() ? num(brutoHi) : NaN;
            const hf = brutoHf.trim() ? num(brutoHf) : NaN;
            if (!isNaN(hi) && !isNaN(hf) && hf < hi) {
                showToast('Horímetro/km final está menor que o inicial. Revise as medições.', 'error');
                return;
            }
            abrirConfirmacao();
        });

        }
        function setLoading(isLoading) {
            if (!submitBtn) return;
            submitBtn.disabled = isLoading;
            if (!btnText) return;
            // Corrigir e lançar são a mesma tela: o botão tem de dizer qual
            // dos dois está acontecendo, inclusive ao voltar do "Enviando…".
            btnText.textContent = isLoading ? (EDICAO ? 'Salvando…' : 'Enviando…')
                                            : (EDICAO ? 'Salvar correção' : 'Enviar apontamento');
        }

        // O aviso passa a ser o do app — um só padrão de mensagem na tela toda.
        function showToast(message, type) {
            toast(message, type === 'success' ? 'success' : 'error');
        }

        /* ===================== LISTAS DINÂMICAS & CADASTROS ===================== */
        let EQUIPAMENTOS = [];
        let LOCADORAS = [];
        const TIPOS_PADRAO = ['Linha Amarela', 'Transporte'];

        function escapeHtml(s) {
            return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
        }

        async function carregarListas() {
            try {
                const resp = await fetch(urlEquip('listas'));
                const data = await resp.json();
                if (data && data.ok) {
                    EQUIPAMENTOS = data.equipamentos || [];
                    LOCADORAS = data.locadoras || [];
                    popularDropdownEquip();
                    popularSelectLocadoras();
                    popularTipos();
                    renderListas();
                }
            } catch (err) {
                console.warn('Não foi possível carregar do servidor; usando lista local.', err);
            }
        }

        function popularDropdownEquip() {
            const sel = document.getElementById('equipamento');
            if (!EQUIPAMENTOS.length) return; // mantém a lista fixa como reserva
            const valorAtual = sel.value;
            const grupos = {};
            EQUIPAMENTOS.forEach(eq => {
                const t = eq.tipo || 'Outros';
                (grupos[t] = grupos[t] || []).push(eq);
            });
            let html = '<option value="" disabled selected >Selecione o ativo...</option>';
            Object.keys(grupos).forEach(tipo => {
                html += `<optgroup label="${escapeHtml(tipo)}" >`;
                grupos[tipo].forEach(eq => {
                    html += `<option value="${escapeHtml(eq.nome)}" >${escapeHtml(eq.nome)}</option>`;
                });
                html += '</optgroup>';
            });
            sel.innerHTML = html;
            if (valorAtual) sel.value = valorAtual;
        }

        function popularSelectLocadoras() {
            const sel = document.getElementById('eqLocadora');
            if (!sel) return;
            let html = '<option value="" >— selecione —</option>';
            LOCADORAS.forEach(l => { html += `<option value="${escapeHtml(l.nome)}" >${escapeHtml(l.nome)}</option>`; });
            sel.innerHTML = html;
        }

        function popularTipos() {
            const dl = document.getElementById('tiposList');
            if (!dl) return;
            const tipos = new Set(TIPOS_PADRAO);
            EQUIPAMENTOS.forEach(eq => { if (eq.tipo) tipos.add(eq.tipo); });
            dl.innerHTML = Array.from(tipos).map(t => `<option value="${escapeHtml(t)}">`).join('');
        }

        function renderListas() {
            // O slide de equipamentos da apresentação lê a frota e as
            // locadoras daqui (EQUIP.equipamentos / EQUIP.locadoras); sem o
            // espelho ele quebrava ao abrir, porque só apontamentos existia.
            window.EQUIP.equipamentos = EQUIPAMENTOS;
            window.EQUIP.locadoras = LOCADORAS;
            const le = document.getElementById('listaEquip');
            document.getElementById('countEquip').textContent = EQUIPAMENTOS.length;
            le.innerHTML = EQUIPAMENTOS.map(eq => `
                <div class="eq-item">
                    <div class="eq-item-txt">
                        <p class="eq-item-nome">${escapeHtml(eq.nome)}</p>
                        <p class="kpi-s">${escapeHtml(eq.tipo || 'Outros')}${eq.vinculo ? ' · ' + escapeHtml(eq.vinculo) : ''}${eq.locadora ? ' · ' + escapeHtml(eq.locadora) : ''}</p>
                    </div>
                    <button type="button" data-nome="${escapeHtml(eq.nome)}" class="btn-desativar btn btn-ghost btn-icone" title="Remover da lista" aria-label="Remover da lista">${ic('lixeira')}</button>
                </div>`).join('') || '<p class="eq-vazio">Nenhum equipamento.</p>';
            le.querySelectorAll('.btn-desativar').forEach(b => b.addEventListener('click', () => desativarEquip(b.getAttribute('data-nome'))));

            const ll = document.getElementById('listaLoc');
            document.getElementById('countLoc').textContent = LOCADORAS.length;
            ll.innerHTML = LOCADORAS.map(l => `
                <div class="eq-item">
                    <div class="eq-item-txt">
                        <p class="eq-item-nome">${escapeHtml(l.nome)}</p>
                        ${l.observacoes ? `<p class="kpi-s">${escapeHtml(l.observacoes)}</p>` : ''}
                    </div>
                </div>`).join('') || '<p class="eq-vazio">Nenhuma locadora.</p>';
        }

        function abrirCadastros() { EQ.abrir('cadastroModal'); }
        function fecharCadastros() { EQ.fechar('cadastroModal'); }

        function trocarAba(qual) {
            const isEquip = qual === 'equip';
            document.getElementById('abaEquip').style.display = isEquip ? '' : 'none';
            document.getElementById('abaLoc').style.display = isEquip ? 'none' : '';
            const on = 'btn btn-sm btn-primary';
            const off = 'btn btn-sm btn-ghost';
            const base = '';
            document.getElementById('tabBtnEquip').className = base + (isEquip ? on : off);
            document.getElementById('tabBtnLoc').className = base + (isEquip ? off : on);
        }

        function toggleLocadora() {
            const proprio = document.querySelector('input[name="eqVinculo"]:checked').value === 'Próprio';
            document.getElementById('locadoraWrap').style.display = proprio ? 'none' : '';
        }

        async function postAcao(params) {
            const be = backendEquip();
            const fd = new FormData();
            Object.keys(params).forEach(k => fd.append(k, params[k]));
            if (!be.legado) {
                fd.set('action', ACAO_PRINCIPAL[params.action] || params.action);
                const extra = paramsPrincipal();
                Object.keys(extra).forEach(k => fd.set(k, extra[k]));
            }
            const resp = await fetch(be.url, { method: 'POST', body: fd });
            const r = await resp.json();
            // O legado avisa em `erro`; o principal, em `error`/`mensagem`.
            // A tela lê `erro` — traduz aqui para o aviso não virar genérico.
            if (r && !r.ok && !r.erro && (r.mensagem || r.error)) r.erro = r.mensagem || r.error;
            return r;
        }

        function ligarFormLoc() {
        document.getElementById('formLoc').addEventListener('submit', async e => {
            e.preventDefault();
            const nome = document.getElementById('locNome').value.trim();
            if (!nome) return;
            try {
                const r = await postAcao({ action: 'cadastrarLocadora', nome, observacoes: document.getElementById('locObs').value.trim() });
                if (r.ok) {
                    LOCADORAS = r.locadoras || LOCADORAS;
                    popularSelectLocadoras(); renderListas();
                    document.getElementById('formLoc').reset();
                    showToast('Locadora cadastrada com sucesso!', 'success');
                } else { showToast(r.erro || 'Não foi possível cadastrar.', 'error'); }
            } catch (err) { showToast('Erro de conexão com o servidor.', 'error'); }
        });

        }
        function ligarFormEquip() {
        document.getElementById('formEquip').addEventListener('submit', async e => {
            e.preventDefault();
            const nome = document.getElementById('eqNome').value.trim();
            if (!nome) return;
            const vinculo = document.querySelector('input[name="eqVinculo"]:checked').value;
            const locadora = vinculo === 'Próprio' ? '' : document.getElementById('eqLocadora').value;
            try {
                const r = await postAcao({ action: 'cadastrarEquipamento', nome, tipo: document.getElementById('eqTipo').value.trim() || 'Outros', vinculo, locadora });
                if (r.ok) {
                    EQUIPAMENTOS = r.equipamentos || EQUIPAMENTOS;
                    popularDropdownEquip(); popularTipos(); renderListas();
                    document.getElementById('formEquip').reset();
                    toggleLocadora();
                    showToast('Equipamento cadastrado com sucesso!', 'success');
                } else { showToast(r.erro || 'Não foi possível cadastrar.', 'error'); }
            } catch (err) { showToast('Erro de conexão com o servidor.', 'error'); }
        });

        }

        async function desativarEquip(nome) {
            if (!confirm('Remover "' + nome + '" da lista de equipamentos?')) return;
            try {
                const r = await postAcao({ action: 'desativarEquipamento', nome });
                if (r.ok) {
                    EQUIPAMENTOS = r.equipamentos || EQUIPAMENTOS;
                    popularDropdownEquip(); renderListas();
                    showToast('Equipamento removido da lista.', 'success');
                } else { showToast(r.erro || 'Não foi possível remover.', 'error'); }
            } catch (err) { showToast('Erro de conexão com o servidor.', 'error'); }
        }

        /* ===================== ENVIO COM CONFIRMAÇÃO + ÚLTIMOS (Etapa 2) ===================== */
        const STATUS_LABEL = {
            OperandoNormalmente: '🟢 Operando',
            ManutencaoCorretiva: '🔴 Corretiva',
            ManutencaoPreventiva: '🟡 Preventiva',
            ParadoChuva: '🌧️ Parado (chuva)',
            FaltaOperador: '👤 Falta operador',
            FaltaFrenteServico: '🚧 Sem frente'
        };
        function rotuloStatus(s) { return STATUS_LABEL[s] || s || '—'; }
        function formatarData(iso) {
            if (!iso) return '—';
            const p = String(iso).split('-');
            return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : iso;
        }

        function abrirConfirmacao() {
            const g = id => document.getElementById(id);
            const set = (id, v) => { g(id).textContent = v || '—'; };
            const st = g('status');
            set('cfData', formatarData(g('data').value));
            set('cfTurno', g('turno').value);
            set('cfEquip', g('equipamento').value);
            set('cfOperador', g('operador').value);
            set('cfPeriodo', (g('inicio').value || '--:--') + ' às ' + (g('fim').value || '--:--'));
            set('cfParadas', resumoParadas() || 'Nenhuma');
            set('cfHoras', (g('horas').value || '0') + ' h');
            set('cfStatus', (st.options[st.selectedIndex] ? st.options[st.selectedIndex].text : '—'));
            const hi = g('horimInicial').value, hf = g('horimFinal').value;
            set('cfHorim', (hi || hf) ? ((hi || '—') + ' → ' + (hf || '—')) : '—');
            set('cfComb', g('combustivel').value ? (g('combustivel').value + ' L') : '—');
            set('cfAssin', document.getElementById('assinatura').value ? 'assinada'
                 : (EDICAO && EDICAO.assinatura) ? 'assinada (a mesma de antes)' : '—');
            set('cfObs', g('observacoesUI').value.trim() || 'Sem detalhes adicionais.');
            EQ.abrir('confirmModal');
        }
        function fecharConfirmacao() { EQ.fechar('confirmModal'); }
        function confirmarEnvio() { enviarApontamento(false); }

        async function enviarApontamento(forcar) {
            fecharConfirmacao();
            setLoading(true);
            try {
                /* NÃO se captura o canvas aqui: o que vale é o que o operador
                   CONFIRMOU no modal (hidden #assinatura). Traço deixado no
                   canvas e abandonado pelo X não vira assinatura de ninguém. */
                const be = backendEquip();
                let fd;
                if (be.legado) {
                    // O legado recebe o formulário como sempre recebeu.
                    fd = new FormData(form);
                } else {
                    // O principal recebe os campos com os nomes das colunas
                    // da aba ApontEquip, mais a obra, o token e um clientId —
                    // que é o que impede um reenvio de lançar hora duas vezes.
                    const g = id => { const e = document.getElementById(id); return e ? e.value : ''; };
                    fd = new FormData();
                    fd.set('action', 'equipApontar');
                    fd.set('clientId', 'eq_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8));
                    fd.set('data', g('data'));
                    fd.set('turno', g('turno'));
                    fd.set('equipamento', g('equipamento'));
                    fd.set('operador', g('operador'));
                    fd.set('inicio', g('inicio'));
                    fd.set('fim', g('fim'));
                    fd.set('horas', g('horas'));
                    fd.set('paradas', resumoParadas());
                    fd.set('horimIni', g('horimInicial'));
                    fd.set('horimFim', g('horimFinal'));
                    fd.set('combustivel', g('combustivel'));
                    fd.set('situacao', g('status'));
                    fd.set('observacoes', g('observacoes'));
                    fd.set('assinatura', g('assinatura'));
                    const extra = paramsPrincipal();
                    Object.keys(extra).forEach(k => fd.set(k, extra[k]));
                }
                /* Com o campo em type=text, o que sai daqui pode ser
                   "1.250,5". O ida-e-volta do número tem de ser canônico:
                   quem lê a aba (e o relatório) espera ponto decimal, e
                   "1.250,5" lido como milhar viraria 12.505. Vazio continua
                   vazio — 0 é uma medição, ausência não é. */
                const canon = v => { const t = String(v == null ? '' : v).trim(); return t ? String(num(t)) : ''; };
                const chaves = be.legado
                    ? { hi: 'horimInicial', hf: 'horimFinal', cb: 'combustivel' }
                    : { hi: 'horimIni', hf: 'horimFim', cb: 'combustivel' };
                fd.set(chaves.hi, canon(document.getElementById('horimInicial').value));
                fd.set(chaves.hf, canon(document.getElementById('horimFinal').value));
                fd.set(chaves.cb, canon(document.getElementById('combustivel').value));

                if (forcar) fd.append('forcar', 'true');

                /* CORRIGINDO: o mesmo formulário, outro destino. A linha é
                   achada pelo carimbo e reescrita no lugar — o carimbo, o
                   dono e o clientId ficam como estavam, senão a correção
                   viraria um lançamento novo por cima do antigo. */
                if (EDICAO) {
                    const rEd = await salvarEdicao(fd, forcar);
                    if (rEd && rEd.ok) {
                        showToast(rEd.aviso || 'Correção salva.', rEd.aviso ? 'error' : 'success');
                        cancelarEdicao();
                    } else if (rEd && rEd.duplicado) {
                        if (confirm(rEd.erro + '\n\nSalvar assim mesmo?')) {
                            await enviarApontamento(true);
                            return;
                        }
                        showToast('Correção cancelada — já existe apontamento igual.', 'error');
                    } else {
                        showToast((rEd && rEd.erro) || 'Não foi possível salvar a correção.', 'error');
                    }
                    return;
                }

                const resp = await fetch(be.url, { method: 'POST', body: fd });
                const r = await resp.json();
                if (r.ok) {
                    showToast('Transmissão concluída com sucesso!', 'success');
                    const tempDate = document.getElementById('data').value;
                    form.reset();
                    document.getElementById('data').value = tempDate;
                    document.getElementById('status').value = 'OperandoNormalmente';
                    document.getElementById('horasDisplay').innerHTML = '0.00<span class="eq-h">h</span>';
                    limparAssinatura();
                    document.getElementById('paradasList').innerHTML = ''; atualizarParadasVazio();
                } else if (r.duplicado) {
                    if (confirm(r.erro + '\n\nDeseja registrar mesmo assim (2º apontamento)?')) {
                        await enviarApontamento(true);
                        return;
                    }
                    showToast('Envio cancelado — apontamento já existente.', 'error');
                } else {
                    showToast(r.erro || 'Não foi possível enviar.', 'error');
                }
            } catch (err) {
                console.error('Error!', err);
                showToast('Erro de conexão com o servidor. Tente novamente.', 'error');
            } finally {
                setLoading(false);
            }
        }

        /* ------------------------------------------------------------------
           GRAVAR A CORREÇÃO
           ------------------------------------------------------------------
           Os dois backends não sabem a mesma coisa, e o campo não tem por que
           saber disso:

           • BACKEND PRINCIPAL (Code.gs, obras novas) — `equipEditar` reescreve
             a linha NO LUGAR. Carimbo, dono e clientId ficam de pé, e a
             Auditoria guarda o antes e o depois.

           • BACKEND LEGADO (o Apps Script antigo da Teotônio, que este
             repositório não publica) — não tem ação de editar. Ali a correção
             é REENVIO: grava o apontamento corrigido e só depois apaga o
             antigo. Nessa ordem de propósito. Se a segunda metade falhar,
             sobra uma linha repetida — que aparece na lista e se apaga com um
             toque. Na ordem inversa, uma falha apagaria a hora da medição e
             não sobraria nada para ver.
           ------------------------------------------------------------------ */
        async function salvarEdicao(fd, forcar) {
            const be = backendEquip();
            const carimbo = EDICAO.carimbo;
            /* Sem traço novo, a assinatura é a que já está no Drive: o que a
               planilha guarda é um ponteiro, e reenviá-lo não cria arquivo. */
            const assinNova = document.getElementById('assinatura').value;
            const assinatura = assinNova || EDICAO.assinatura || '';

            if (!be.legado) {
                fd.set('action', 'equipEditar');
                fd.set('carimbo', carimbo);
                fd.delete('clientId');            // o carimbo é a chave; clientId era do INSERT
                // Campo ausente é campo que o servidor não toca. Sem assinatura
                // nenhuma dos dois lados, melhor não mandar do que mandar vazio
                // e apagar a que está lá.
                if (assinatura) fd.set('assinatura', assinatura); else fd.delete('assinatura');
                if (forcar) fd.set('forcar', 'true');
                const resp = await fetch(be.url, { method: 'POST', body: fd });
                const r = await resp.json();
                if (r && !r.ok && !r.erro && (r.mensagem || r.error)) r.erro = r.mensagem || r.error;
                return r;
            }

            // Legado: grava o corrigido primeiro…
            if (assinatura) fd.set('assinatura', assinatura);
            fd.set('forcar', 'true');             // o antigo ainda está lá; ele mesmo é a "duplicata"
            const resp = await fetch(be.url, { method: 'POST', body: fd });
            const r = await resp.json();
            if (r && !r.ok && !r.erro && (r.mensagem || r.error)) r.erro = r.mensagem || r.error;
            if (!r || !r.ok) return r;
            // …e só então tira o antigo do caminho.
            try {
                const rDel = await postAcao({ action: 'apagarApontamento', carimbo });
                if (!rDel || !rDel.ok) {
                    return { ok: true, aviso: 'O apontamento corrigido entrou, mas o antigo continua na lista — apague-o em "Últimos".' };
                }
            } catch (e) {
                return { ok: true, aviso: 'O apontamento corrigido entrou, mas não consegui apagar o antigo — apague-o em "Últimos".' };
            }
            return { ok: true };
        }

        function abrirUltimos() { EQ.abrir('ultimosModal'); carregarUltimos(); }
        function fecharUltimos() { EQ.fechar('ultimosModal'); }

        /* O que a lista mostrou da última vez. É daqui que a EDIÇÃO tira os
           campos do apontamento — não vale pedir a linha de novo ao servidor
           só para preencher um formulário que já está na tela. */
        let ULTIMOS = [];

        async function carregarUltimos() {
            const box = document.getElementById('listaUltimos');
            box.innerHTML = '<p class="eq-vazio">Carregando…</p>';
            try {
                const resp = await fetch(urlEquip('ultimos', { n: 15 }));
                const data = await resp.json();
                const items = (data && data.apontamentos) || [];
                ULTIMOS = items;
                if (!items.length) { box.innerHTML = '<p class="eq-vazio">Nenhum apontamento ainda.</p>'; return; }
                box.innerHTML = items.map(a => `
                    <div class="eq-item">
                        <div class="eq-item-txt">
                            <p class="eq-item-nome">${escapeHtml(a.equipamento)}</p>
                            <p class="kpi-s">${formatarData(a.data)} · ${escapeHtml(a.turno)} · ${escapeHtml(a.operador)} · ${rotuloStatus(a.status)}</p>
                            ${a.assinatura && String(a.assinatura).indexOf('http') === 0 ? `<a href="${escapeHtml(a.assinatura)}" target="_blank" rel="noopener" class="kpi-s"> ver assinatura</a>` : ''}
                        </div>
                        <div class="eq-item-lado">
                            <span class="eq-item-horas">${escapeHtml(String(a.horas))}h</span>
                            <button type="button" data-carimbo="${a.carimbo}" class="btn-editar-apont btn btn-ghost btn-icone" title="Corrigir este apontamento" aria-label="Corrigir este apontamento">${ic('editar')}</button>
                            <button type="button" data-carimbo="${a.carimbo}" class="btn-apagar-apont btn btn-ghost btn-icone" title="Apagar este apontamento" aria-label="Apagar este apontamento">${ic('lixeira')}</button>
                        </div>
                    </div>`).join('');
                box.querySelectorAll('.btn-editar-apont').forEach(b => b.addEventListener('click', () => editarApontamentoUI(b.getAttribute('data-carimbo'))));
                box.querySelectorAll('.btn-apagar-apont').forEach(b => b.addEventListener('click', () => apagarApontamentoUI(b.getAttribute('data-carimbo'))));
            } catch (err) {
                box.innerHTML = '<p class="eq-vazio">Erro ao carregar. Tente de novo.</p>';
            }
        }

        /* ==================================================================
           CORRIGIR UM APONTAMENTO JÁ ENVIADO
           ------------------------------------------------------------------
           Errar a hora do fim é o engano mais comum do campo. Até aqui o
           único conserto era APAGAR e lançar tudo de novo — e, entre uma
           coisa e a outra, a hora daquele equipamento sumia da medição.

           Editar traz o apontamento de volta PARA O MESMO FORMULÁRIO. Nada
           de uma segunda tela com os mesmos campos: quem lança já sabe onde
           fica cada um, e duas telas para o mesmo dado é o começo de duas
           regras de cálculo diferentes para a mesma hora.
           ================================================================== */
        let EDICAO = null;   // { carimbo, assinatura } enquanto durar a correção

        /* O texto que foi gravado nas paradas volta a ser linha de formulário.
           `resumoParadas()` escreve "Almoço 12:00-13:00; Chuva 15:00-15:30";
           isto é a volta exata desse caminho. */
        function paraISO(v) {
            const t = String(v == null ? '' : v).trim();
            if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10);
            const br = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
            if (br) return `${br[3]}-${br[2].padStart(2, '0')}-${br[1].padStart(2, '0')}`;
            return '';
        }

        function paradasDoTexto(txt) {
            return String(txt || '').split(';').map(s => s.trim()).filter(Boolean)
                .map(item => {
                    const m = item.match(/^(.*?)\s*(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})$/);
                    return m ? { motivo: m[1].trim(), ini: m[2], fim: m[3] } : null;
                }).filter(Boolean);
        }

        /* O campo `observacoes` guarda o cabeçalho montado no envio
           ("[Turno: …] | Operação: … | Paradas: …") e, na segunda linha,
           "Detalhes: <o que o apontador escreveu>". Só a segunda linha volta
           para a tela — o resto se remonta sozinho no próximo envio. */
        function detalhesDoTexto(txt) {
            const m = String(txt || '').match(/Detalhes:\s*([\s\S]*)$/);
            const d = m ? m[1].trim() : '';
            return d === 'Sem detalhes adicionais.' ? '' : d;
        }

        function editarApontamentoUI(carimbo) {
            const a = ULTIMOS.find(x => String(x.carimbo) === String(carimbo));
            if (!a) { showToast('Não encontrei esse apontamento para corrigir.', 'error'); return; }
            const g = id => document.getElementById(id);
            const set = (id, v) => { const e = g(id); if (e) e.value = v == null ? '' : String(v); };

            /* O <input type=date> só aceita 'aaaa-mm-dd'. O backend principal
               já normaliza, mas o LEGADO devolve a célula como a planilha
               entregou — que pode vir '2026-07-14T03:00:00.000Z' (Date) ou
               '14/07/2026'. Data que o campo recusa entra em branco, e o
               apontador salva a correção com a data apagada. */
            set('data', paraISO(a.data));
            set('turno', a.turno);
            set('operador', a.operador);
            set('inicio', a.inicio);
            set('fim', a.fim);
            set('horimInicial', a.horimInicial != null && a.horimInicial !== '' ? a.horimInicial : a.horimIni);
            set('horimFinal', a.horimFinal != null && a.horimFinal !== '' ? a.horimFinal : a.horimFim);
            set('combustivel', a.combustivel);
            set('status', a.status || a.situacao || 'OperandoNormalmente');
            set('observacoesUI', detalhesDoTexto(a.observacoes));

            /* O equipamento pode ter sido DESATIVADO depois do lançamento, e aí
               não está mais no <select>. Corrigir a hora dele não pode ser
               impossível por isso: entra como opção da própria linha. */
            const sel = g('equipamento');
            if (sel && a.equipamento) {
                if (![...sel.options].some(o => o.value === a.equipamento)) {
                    const op = document.createElement('option');
                    op.value = a.equipamento;
                    op.textContent = a.equipamento + ' (fora do cadastro)';
                    sel.appendChild(op);
                }
                sel.value = a.equipamento;
            }

            g('paradasList').innerHTML = '';
            paradasDoTexto(a.paradas).forEach(p => adicionarParada(p.motivo, p.ini, p.fim));
            atualizarParadasVazio();
            calcularHoras();

            /* A assinatura JÁ ESTÁ no Drive — o que a planilha guarda é o
               ponteiro, não a imagem. Reaproveita-se o ponteiro; só se o
               operador assinar de novo é que sobe traço novo. */
            EDICAO = { carimbo: String(carimbo), assinatura: a.assinatura || '' };
            set('assinatura', '');
            const c = g('assinaturaCanvas'); if (c && c._clear) c._clear();
            mostrarEstadoAssinatura();

            EQ.fechar('ultimosModal');
            marcarModoEdicao();
            const topo = document.querySelector('.eq-topo');
            if (topo && topo.scrollIntoView) topo.scrollIntoView({ behavior: 'smooth', block: 'start' });
            showToast('Apontamento aberto para correção.', 'success');
        }

        function cancelarEdicao() {
            EDICAO = null;
            const d = document.getElementById('data');
            const tempDate = d ? d.value : '';
            if (form) form.reset();
            if (d) d.value = tempDate;
            document.getElementById('status').value = 'OperandoNormalmente';
            document.getElementById('horasDisplay').innerHTML = '0.00<span class="eq-h">h</span>';
            limparAssinatura();
            document.getElementById('paradasList').innerHTML = '';
            atualizarParadasVazio();
            marcarModoEdicao();
        }

        /* A tela inteira precisa dizer que está corrigindo, não lançando:
           a faixa no alto do formulário, o texto do botão e o título da
           confirmação. Um formulário idêntico nos dois modos é como se
           envia de novo o que se queria consertar. */
        function marcarModoEdicao() {
            const faixa = document.getElementById('eqEdicaoFaixa');
            const alvo = document.getElementById('eqEdicaoAlvo');
            const editando = !!EDICAO;
            if (faixa) faixa.style.display = editando ? '' : 'none';
            if (alvo && editando) {
                const a = ULTIMOS.find(x => String(x.carimbo) === EDICAO.carimbo);
                alvo.textContent = a
                    ? `${a.equipamento} · ${formatarData(a.data)} · ${a.turno}`
                    : 'apontamento já enviado';
            }
            if (btnText) btnText.textContent = editando ? 'Salvar correção' : 'Enviar apontamento';
            const t = document.getElementById('cfTitulo');
            if (t) t.textContent = editando ? 'Confira antes de salvar' : 'Confira antes de enviar';
            const bt = document.getElementById('cfBotao');
            if (bt) bt.textContent = editando ? 'Salvar correção' : 'Confirmar e enviar';
        }

        async function apagarApontamentoUI(carimbo) {
            if (!confirm('Apagar este apontamento? Esta ação não pode ser desfeita.')) return;
            try {
                const r = await postAcao({ action: 'apagarApontamento', carimbo });
                if (r.ok) { showToast('Apontamento apagado.', 'success'); carregarUltimos(); }
                else { showToast(r.erro || 'Não foi possível apagar.', 'error'); }
            } catch (err) { showToast('Erro de conexão com o servidor.', 'error'); }
        }

        /* ===================== ASSINATURA NA TELA (Etapa 3) ===================== */
        function initAssinatura() {
            const canvas = document.getElementById('assinaturaCanvas');
            if (!canvas) return;
            const ctx = canvas.getContext('2d');
            const ratio = window.devicePixelRatio || 1;
            const w = canvas.clientWidth || 600, h = canvas.clientHeight || 160;
            canvas.width = w * ratio; canvas.height = h * ratio;
            ctx.scale(ratio, ratio);
            ctx.lineWidth = 2.2; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#e2e8f0';
            /* Remedir é obrigatório a cada abertura (canvas escondido mede 0),
               e mudar canvas.width já apaga o traço. Os OUVINTES, esses, só
               entram uma vez: reatar a cada abertura empilhava um mousemove
               por vez que o operador abriu o modal. */
            if (canvas._ligado) { canvas._resetInk(); return; }
            canvas._ligado = true;
            let drawing = false, last = null, hasInk = false;
            const posOf = e => { const r = canvas.getBoundingClientRect(); const t = (e.touches && e.touches[0]) ? e.touches[0] : e; return { x: t.clientX - r.left, y: t.clientY - r.top }; };
            const start = e => { drawing = true; last = posOf(e); e.preventDefault(); };
            const move = e => { if (!drawing) return; const p = posOf(e); ctx.beginPath(); ctx.moveTo(last.x, last.y); ctx.lineTo(p.x, p.y); ctx.stroke(); last = p; hasInk = true; e.preventDefault(); };
            const end = () => { drawing = false; };
            canvas.addEventListener('mousedown', start);
            canvas.addEventListener('mousemove', move);
            window.addEventListener('mouseup', end);
            canvas.addEventListener('touchstart', start, { passive: false });
            canvas.addEventListener('touchmove', move, { passive: false });
            canvas.addEventListener('touchend', end);
            canvas._hasInk = () => hasInk;
            canvas._clear = () => { ctx.clearRect(0, 0, canvas.width, canvas.height); hasInk = false; };
            canvas._resetInk = () => { hasInk = false; };
        }
        function temAssinatura() { const c = document.getElementById('assinaturaCanvas'); return !!(c && c._hasInk && c._hasInk()); }
        function limparAssinatura() {
            const c = document.getElementById('assinaturaCanvas'); if (c && c._clear) c._clear();
            const h = document.getElementById('assinatura'); if (h) h.value = '';
            mostrarEstadoAssinatura();
        }
        function capturarAssinatura() {
            const c = document.getElementById('assinaturaCanvas');
            const h = document.getElementById('assinatura');
            if (!h) return false;
            if (temAssinatura()) { h.value = c.toDataURL('image/png'); return true; }
            h.value = ''; return false;
        }

        /* O canvas mora num modal, e canvas escondido tem clientWidth 0: a
           medição só vale depois de o modal estar visível. Por isso o init
           acontece na ABERTURA, não no boot da tela. */
        function abrirAssinatura() {
            EQ.abrir('assinaturaModal');
            initAssinatura();
        }
        function confirmarAssinatura() {
            capturarAssinatura();
            EQ.fechar('assinaturaModal');
            mostrarEstadoAssinatura();
        }
        /* O formulário mostra o que foi assinado sem precisar reabrir nada:
           o traço é a prova que viaja no apontamento. */
        function mostrarEstadoAssinatura() {
            const txt = document.getElementById('assinaturaEstado');
            const img = document.getElementById('assinaturaPrev');
            const h = document.getElementById('assinatura');
            const assinado = !!(h && h.value);
            const herdada = !assinado && !!(EDICAO && EDICAO.assinatura);
            if (txt) txt.textContent = assinado
                ? 'Assinado. Toque em Assinar para refazer, ou Limpar para apagar.'
                : herdada
                ? 'Assinatura do envio original mantida. Toque em Assinar para refazer.'
                : 'Sem assinatura — o apontamento pode ser enviado assim.';
            if (img) {
                if (assinado) { img.src = h.value; img.style.display = ''; }
                else { img.removeAttribute('src'); img.style.display = 'none'; }
            }
        }

        /* ===================== PAINEL DE RELATÓRIOS (Etapa 4) ===================== */
        let REL_RAW = [];
        let REL_DADOS = [];
        let REL_AGG = null;
        const JORNADA_H = 10; // horas padrão do turno (Diurno/Noturno = 10h) — base da utilização

        function abrirPainel() { EQ.abrir('painelModal'); carregarRelatorio(); }
        function fecharPainel() { EQ.fechar('painelModal'); }

        function periodoMes() {
            const now = new Date(), y = now.getFullYear(), m = now.getMonth();
            const fmt = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
            document.getElementById('relDe').value = fmt(new Date(y, m, 1));
            document.getElementById('relAte').value = fmt(new Date(y, m + 1, 0));
            carregarRelatorio();
        }
        function periodoTudo() {
            document.getElementById('relDe').value = '';
            document.getElementById('relAte').value = '';
            carregarRelatorio();
        }

        async function carregarRelatorio() {
            const corpo = document.getElementById('painelCorpo');
            corpo.innerHTML = '<p class="eq-vazio">Carregando…</p>';
            const de = document.getElementById('relDe').value, ate = document.getElementById('relAte').value;
            try {
                const url = urlEquip('relatorio', { de: de, ate: ate });
                const data = await (await fetch(url)).json();
                REL_RAW = (data && data.apontamentos) || [];
                // A Central de Campo mostra o que já foi apontado hoje. Enquanto
                // ninguém abrir o painel ela diz "abra a tela" — nunca "0".
                window.EQUIP.apontamentos = REL_RAW;
                window.EQUIP.carregado = true;
                popularFiltroEquip();
                aplicarFiltroEquip();
            } catch (err) {
                corpo.innerHTML = '<p class="eq-vazio">Erro ao carregar. Tente de novo.</p>';
            }
        }

        function popularFiltroEquip() {
            const sel = document.getElementById('relEquip');
            const atual = sel.value;
            const nomes = [...new Set(REL_RAW.map(a => a.equipamento).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
            sel.innerHTML = '<option value="">Todos os equipamentos</option>' + nomes.map(n => `<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`).join('');
            if (atual && nomes.indexOf(atual) !== -1) sel.value = atual;
        }

        function aplicarFiltroEquip() {
            const eq = document.getElementById('relEquip').value;
            REL_DADOS = eq ? REL_RAW.filter(a => a.equipamento === eq) : REL_RAW.slice();
            REL_AGG = agregarRel(REL_DADOS);
            renderPainel();
        }

        function locadoraDe(nome) {
            const eq = (typeof EQUIPAMENTOS !== 'undefined') ? EQUIPAMENTOS.find(e => e.nome === nome) : null;
            return (eq && eq.locadora) ? eq.locadora : '— sem locadora —';
        }

        function agregarRel(dados) {
            const porEquip = {}, porStatus = {}, porLoc = {};
            let totalHoras = 0, totalComb = 0;
            dados.forEach(a => {
                const h = num(a.horas), c = num(a.combustivel);
                totalHoras += h; totalComb += c;
                (porEquip[a.equipamento] = porEquip[a.equipamento] || { horas: 0, apont: 0, comb: 0 });
                porEquip[a.equipamento].horas += h; porEquip[a.equipamento].apont++; porEquip[a.equipamento].comb += c;
                const st = a.status || 'Sem status';
                (porStatus[st] = porStatus[st] || { horas: 0, apont: 0 });
                porStatus[st].horas += h; porStatus[st].apont++;
                const loc = locadoraDe(a.equipamento);
                (porLoc[loc] = porLoc[loc] || { horas: 0, apont: 0 });
                porLoc[loc].horas += h; porLoc[loc].apont++;
            });
            const equips = Object.keys(porEquip).map(k => ({ nome: k, horas: porEquip[k].horas, apont: porEquip[k].apont, comb: porEquip[k].comb, util: porEquip[k].apont ? porEquip[k].horas / (porEquip[k].apont * JORNADA_H) : 0 })).sort((a, b) => b.horas - a.horas);
            const status = Object.keys(porStatus).map(k => ({ nome: k, horas: porStatus[k].horas, apont: porStatus[k].apont })).sort((a, b) => b.horas - a.horas);
            const locs = Object.keys(porLoc).map(k => ({ nome: k, horas: porLoc[k].horas, apont: porLoc[k].apont })).sort((a, b) => b.horas - a.horas);
            return { total: dados.length, totalHoras, totalComb, nEquip: equips.length, utilMedia: dados.length ? totalHoras / (dados.length * JORNADA_H) : 0, equips, status, locs };
        }

        const numBR = n => Number(n).toLocaleString('pt-BR', { maximumFractionDigits: 1 });
        function barraRel(valor, max, cor) {
            const pct = max > 0 ? Math.round((valor / max) * 100) : 0;
            return `<div class="eq-barra" style="width:${Math.max(pct, 2)}%"></div>`;
        }
        function kpiRel(label, valor, icon, cor) {
            return `<div class="eq-kpi">
                <i class="ph ${icon} text-2xl ${cor}"></i>
                <p class="eq-kpi-num">${valor}</p>
                <p class="eq-kpi-lbl">${label}</p>
            </div>`;
        }
        function secaoRel(titulo, conteudo) {
            return `<div class="eq-secao">
                <h3 class="eq-sec-tit">${titulo}</h3>
                <div class="eq-sec-corpo">${conteudo || '<p class="eq-vazio">Sem dados.</p>'}</div>
            </div>`;
        }

        function renderPainel() {
            const A = REL_AGG, corpo = document.getElementById('painelCorpo');
            if (!A || !A.total) { corpo.innerHTML = '<p class="eq-vazio">Nenhum apontamento no período.</p>'; return; }
            let html = `<div class="eq-kpis">
                ${kpiRel('Apontamentos', A.total, 'ph-list-checks')}
                ${kpiRel('Horas totais', numBR(A.totalHoras) + 'h', 'ph-clock')}
                ${kpiRel('Equipamentos', A.nEquip, 'ph-tractor')}
                ${kpiRel('Combustível', numBR(A.totalComb) + ' L', 'ph-gas-pump')}
                ${kpiRel('Utilização média', Math.round(A.utilMedia * 100) + '%', 'ph-gauge')}
            </div>`;
            const maxE = A.equips[0] ? A.equips[0].horas : 0;
            html += secaoRel('Horas por equipamento (ranking)', A.equips.map(e => `
                <div class="eq-barra-item">
                    <div class="eq-barra-lbl"><span>${escapeHtml(e.nome)}</span><span class="kpi-s">${numBR(e.horas)}h · ${Math.round(e.util * 100)}% · ${e.apont}x</span></div>
                    ${barraRel(e.horas, maxE, '')}
                </div>`).join(''));
            const maxS = A.status[0] ? A.status[0].horas : 0;
            html += secaoRel('Por situação / status', A.status.map(s => `
                <div class="eq-barra-item">
                    <div class="eq-barra-lbl"><span>${rotuloStatus(s.nome)}</span><span class="kpi-s">${numBR(s.horas)}h · ${s.apont}x</span></div>
                    ${barraRel(s.horas, maxS, '')}
                </div>`).join(''));
            const maxL = A.locs[0] ? A.locs[0].horas : 0;
            html += secaoRel('Por locadora', A.locs.map(l => `
                <div class="eq-barra-item">
                    <div class="eq-barra-lbl"><span>${escapeHtml(l.nome)}</span><span class="kpi-s">${numBR(l.horas)}h · ${l.apont}x</span></div>
                    ${barraRel(l.horas, maxL, '')}
                </div>`).join(''));
            corpo.innerHTML = html;
        }

        function rotuloStatusTxt(s) { return String(rotuloStatus(s)).replace(/^[^\p{L}\p{N}]+/u, '').trim() || s; }

        function exportarCSV() {
            if (!REL_DADOS.length) { showToast('Nada para exportar no período.', 'error'); return; }
            const head = ['Data', 'Turno', 'Equipamento', 'Operador', 'Horas', 'Status', 'Combustivel(L)', 'Locadora'];
            const linhas = REL_DADOS.map(a => [a.data, a.turno, a.equipamento, a.operador, a.horas, rotuloStatusTxt(a.status), a.combustivel, locadoraDe(a.equipamento)]);
            const csv = [head].concat(linhas).map(r => r.map(c => '"' + String(c == null ? '' : c).replace(/"/g, '""') + '"').join(';')).join('\r\n');
            const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = 'relatorio-equipamentos.csv';
            a.click();
        }

        /* ===================== MEDIÇÃO MENSAL — XLSX por equipamento ===================== */
        // Conversão numérica tolerante (aceita "1.234,5", "80", número, vazio…)
        const num = v => {
            if (typeof v === 'number') return isFinite(v) ? v : 0;
            let s = String(v == null ? '' : v).trim();
            if (!s) return 0;
            if (s.indexOf(',') > -1 && s.indexOf('.') > -1) s = s.replace(/\./g, '').replace(',', '.');
            else s = s.replace(',', '.');
            const n = parseFloat(s);
            return isNaN(n) ? 0 : n;
        };
        const MESES_PT = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
        function nomeMes(mesStr) { const p = String(mesStr).split('-'); const m = parseInt(p[1], 10); return `${MESES_PT[m - 1] || '?'} / ${p[0]}`; }
        function diaSemanaBR(iso) { const d = new Date(iso + 'T12:00:00'); return isNaN(d.getTime()) ? '' : ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'][d.getDay()]; }

        // Extrai início/fim/paradas/detalhes do texto de observação salvo no apontamento
        function parseObs(obs) {
            const t = String(obs || '');
            const op = t.match(/Opera[çc][ãa]o:\s*([0-9]{1,2}:[0-9]{2})\s*[àa]s\s*([0-9]{1,2}:[0-9]{2})/i);
            const par = t.match(/Paradas:\s*([^\n]*)/i);
            const det = t.match(/Detalhes:\s*([\s\S]*)$/i);
            let paradas = par ? par[1].trim() : '';
            if (/^sem paradas/i.test(paradas)) paradas = '';
            let detalhes = det ? det[1].trim() : '';
            if (/^sem detalhes/i.test(detalhes)) detalhes = '';
            return { inicio: op ? op[1] : '', fim: op ? op[2] : '', paradas, detalhes };
        }

        // Situação simplificada para a engenharia
        const STATUS_MED = {
            OperandoNormalmente: 'Produtivo',
            ManutencaoCorretiva: 'Corretiva',
            ManutencaoPreventiva: 'Preventiva',
            ParadoChuva: 'Chuva',
            FaltaOperador: 'Falta operador',
            FaltaFrenteServico: 'Sem frente'
        };
        function statusMed(s) { return STATUS_MED[s] || rotuloStatusTxt(s) || 'Sem status'; }
        function infoEquipMed(nome) {
            const eq = (typeof EQUIPAMENTOS !== 'undefined' ? EQUIPAMENTOS : []).find(e => e.nome === nome) || {};
            return { tipo: eq.tipo || '—', vinculo: eq.vinculo || '—', locadora: eq.locadora || '—' };
        }

        // ---- Estilos da planilha (xlsx-js-style) ----
        function bordaFina() { const s = { style: 'thin', color: { rgb: 'CBD5E1' } }; return { top: s, bottom: s, left: s, right: s }; }
        const STL = {
            titulo:    { font: { bold: true, sz: 15, color: { rgb: 'FFFFFF' } }, fill: { fgColor: { rgb: '0F172A' } }, alignment: { horizontal: 'center', vertical: 'center' } },
            subtitulo: { font: { bold: true, sz: 11, color: { rgb: 'FFFFFF' } }, fill: { fgColor: { rgb: '0E7490' } }, alignment: { horizontal: 'center', vertical: 'center' } },
            rotulo:    { font: { bold: true, sz: 10, color: { rgb: '334155' } }, fill: { fgColor: { rgb: 'F1F5F9' } }, alignment: { vertical: 'center' }, border: bordaFina() },
            valor:     { font: { sz: 10, color: { rgb: '0F172A' } }, alignment: { vertical: 'center' }, border: bordaFina() },
            valorNum:  { font: { sz: 10, color: { rgb: '0F172A' } }, alignment: { horizontal: 'right', vertical: 'center' }, border: bordaFina(), numFmt: '#,##0.00' },
            th:        { font: { bold: true, sz: 10, color: { rgb: 'FFFFFF' } }, fill: { fgColor: { rgb: '0E7490' } }, alignment: { horizontal: 'center', vertical: 'center', wrapText: true }, border: bordaFina() },
            td:        { font: { sz: 10 }, alignment: { vertical: 'center', wrapText: true }, border: bordaFina() },
            tdC:       { font: { sz: 10 }, alignment: { horizontal: 'center', vertical: 'center' }, border: bordaFina() },
            tdInt:     { font: { sz: 10 }, alignment: { horizontal: 'center', vertical: 'center' }, border: bordaFina(), numFmt: '0' },
            tdNum:     { font: { sz: 10 }, alignment: { horizontal: 'right', vertical: 'center' }, border: bordaFina(), numFmt: '#,##0.00' },
            tdPct:     { font: { sz: 10 }, alignment: { horizontal: 'center', vertical: 'center' }, border: bordaFina(), numFmt: '0%' },
            total:     { font: { bold: true, sz: 10, color: { rgb: '0F172A' } }, fill: { fgColor: { rgb: 'E2E8F0' } }, alignment: { horizontal: 'center', vertical: 'center' }, border: bordaFina() },
            totalNum:  { font: { bold: true, sz: 10, color: { rgb: '0F172A' } }, fill: { fgColor: { rgb: 'E2E8F0' } }, alignment: { horizontal: 'right', vertical: 'center' }, border: bordaFina(), numFmt: '#,##0.00' },
            totalPct:  { font: { bold: true, sz: 10, color: { rgb: '0F172A' } }, fill: { fgColor: { rgb: 'E2E8F0' } }, alignment: { horizontal: 'center', vertical: 'center' }, border: bordaFina(), numFmt: '0%' }
        };
        const T  = (v, s) => ({ v: v == null ? '' : String(v), t: 's', s: s || STL.td });
        const N  = (v, s) => ({ v: num(v),  t: 'n', s: s || STL.tdNum });
        const I  = (v, s) => ({ v: num(v),  t: 'n', s: s || STL.tdInt });
        const P  = (v, s) => ({ v: num(v),  t: 'n', s: s || STL.tdPct });

        // Constrói uma worksheet a partir de uma matriz de células {v,t,s} (ou valores crus)
        function montarSheet(matriz) {
            const aoa = matriz.map(r => r.map(c => (c && typeof c === 'object' && 'v' in c) ? c.v : (c == null ? '' : c)));
            const ws = XLSX.utils.aoa_to_sheet(aoa);
            matriz.forEach((row, R) => row.forEach((cell, C) => {
                if (cell && typeof cell === 'object' && 'v' in cell) {
                    const addr = XLSX.utils.encode_cell({ r: R, c: C });
                    const o = ws[addr] || (ws[addr] = { t: cell.t || 's', v: cell.v });
                    if (cell.t) o.t = cell.t;
                    if (cell.s) o.s = cell.s;
                }
            }));
            return ws;
        }
        function nomeAbaSeguro(nome, usados) {
            let base = String(nome || 'Equip').replace(/[\\\/\?\*\[\]:]/g, ' ').trim().slice(0, 28) || 'Equip';
            let nm = base, i = 2;
            while (usados.has(nm.toLowerCase())) { nm = (base.slice(0, 25) + ' ' + i).slice(0, 31); i++; }
            usados.add(nm.toLowerCase());
            return nm;
        }

        // Estatística de um equipamento no mês
        function estatEquip(lista) {
            let horas = 0, comb = 0, horasProd = 0;
            const porStatus = {};
            let horimMin = null, horimMax = null;
            lista.forEach(a => {
                const h = num(a.horas);
                horas += h; comb += num(a.combustivel);
                if (a.status === 'OperandoNormalmente') horasProd += h;
                const k = statusMed(a.status);
                porStatus[k] = (porStatus[k] || 0) + 1;
                const hi = num(a.horimInicial), hf = num(a.horimFinal);
                if (hi > 0) horimMin = horimMin === null ? hi : Math.min(horimMin, hi);
                if (hf > 0) horimMax = horimMax === null ? hf : Math.max(horimMax, hf);
            });
            const dias = lista.length;
            const deltaHorim = (horimMin !== null && horimMax !== null && horimMax >= horimMin) ? horimMax - horimMin : 0;
            return { dias, horas, horasProd, comb, porStatus, deltaHorim, util: dias ? horas / (dias * JORNADA_H) : 0, lph: horas > 0 ? comb / horas : 0 };
        }

        async function _gerarMedicaoMensal() {
            const mesEl = document.getElementById('medMes');
            const stEl = document.getElementById('medStatus');
            const btn = document.getElementById('btnMedicao');
            const mes = mesEl.value;
            if (!mes) { showToast('Escolha o mês de referência da medição.', 'error'); return; }
            if (typeof XLSX === 'undefined') { showToast('A biblioteca de Excel não carregou. Verifique a conexão e recarregue.', 'error'); return; }

            const [y, m] = mes.split('-').map(Number);
            const ultimoDia = new Date(y, m, 0).getDate();
            const de = `${y}-${String(m).padStart(2, '0')}-01`;
            const ate = `${y}-${String(m).padStart(2, '0')}-${String(ultimoDia).padStart(2, '0')}`;

            btn.disabled = true; btn.classList.add('opacity-60', 'cursor-wait');
            stEl.textContent = 'Buscando apontamentos…';
            try {
                const url = urlEquip('relatorio', { de: de, ate: ate });
                const data = await (await fetch(url)).json();
                let dados = (data && data.apontamentos) || [];
                const eqFiltro = document.getElementById('relEquip').value;
                if (eqFiltro) dados = dados.filter(a => a.equipamento === eqFiltro);
                // Garante que cai só no mês pedido mesmo se o backend ignorar o filtro
                dados = dados.filter(a => String(a.data || '').slice(0, 7) === mes);
                if (!dados.length) { stEl.textContent = ''; showToast('Nenhum apontamento encontrado nesse mês.', 'error'); return; }
                stEl.textContent = 'Montando planilha…';
                construirWorkbookMedicao(dados, mes, eqFiltro);
                stEl.textContent = `✓ ${dados.length} apontamento(s) exportado(s).`;
                showToast('Medição gerada com sucesso!', 'success');
            } catch (err) {
                console.error(err);
                stEl.textContent = '';
                showToast('Erro ao gerar a medição. Tente novamente.', 'error');
            } finally {
                btn.disabled = false; btn.classList.remove('opacity-60', 'cursor-wait');
            }
        }

        function construirWorkbookMedicao(dados, mes, eqFiltro) {
            const mesLabel = nomeMes(mes);
            const geradoEm = new Date().toLocaleString('pt-BR');
            const grupos = {};
            dados.forEach(a => { const k = a.equipamento || 'Sem equipamento'; (grupos[k] = grupos[k] || []).push(a); });
            const nomes = Object.keys(grupos).sort((a, b) => a.localeCompare(b, 'pt-BR'));

            const wb = XLSX.utils.book_new();
            wb.Props = { Title: 'Medição mensal de equipamentos', Subject: mesLabel, Author: 'FrotaSync' };

            /* ---------- ABA: RESUMO GERAL ---------- */
            const colsResumo = ['Equipamento','Tipo','Vínculo','Locadora','Dias apont.','Horas trab.','Horas produt.','Utilização','Combustível (L)','Consumo (L/h)','Δ Horímetro','Corretiva (d)','Preventiva (d)','Chuva (d)','Sem operador (d)','Sem frente (d)'];
            const nC = colsResumo.length;
            const M = [];
            M.push([T('MEDIÇÃO MENSAL DE EQUIPAMENTOS — RESUMO GERAL', STL.titulo), ...Array(nC - 1).fill(T('', STL.titulo))]);
            M.push([T(mesLabel + (eqFiltro ? '  •  ' + eqFiltro : '  •  Frota completa'), STL.subtitulo), ...Array(nC - 1).fill(T('', STL.subtitulo))]);
            M.push([T('Gerado em ' + geradoEm + '  •  Jornada de referência: ' + JORNADA_H + 'h/dia', STL.valor), ...Array(nC - 1).fill(T('', STL.valor))]);
            M.push(Array(nC).fill(T('', STL.valor)));
            M.push(colsResumo.map(c => T(c, STL.th)));

            let tDias = 0, tHoras = 0, tProd = 0, tComb = 0, tDelta = 0;
            const tStat = {};
            nomes.forEach(nome => {
                const e = estatEquip(grupos[nome]);
                const info = infoEquipMed(nome);
                tDias += e.dias; tHoras += e.horas; tProd += e.horasProd; tComb += e.comb; tDelta += e.deltaHorim;
                ['Corretiva','Preventiva','Chuva','Falta operador','Sem frente'].forEach(k => { tStat[k] = (tStat[k] || 0) + (e.porStatus[k] || 0); });
                M.push([
                    T(nome, STL.td), T(info.tipo, STL.tdC), T(info.vinculo, STL.tdC), T(info.locadora, STL.td),
                    I(e.dias), N(e.horas), N(e.horasProd), P(e.util), N(e.comb), N(e.lph), N(e.deltaHorim),
                    I(e.porStatus['Corretiva'] || 0), I(e.porStatus['Preventiva'] || 0), I(e.porStatus['Chuva'] || 0),
                    I(e.porStatus['Falta operador'] || 0), I(e.porStatus['Sem frente'] || 0)
                ]);
            });
            const utilTot = tDias ? tHoras / (tDias * JORNADA_H) : 0;
            const lphTot = tHoras > 0 ? tComb / tHoras : 0;
            M.push([
                T('TOTAL', STL.total), T('', STL.total), T('', STL.total), T('', STL.total),
                I(tDias, STL.total), N(tHoras, STL.totalNum), N(tProd, STL.totalNum), P(utilTot, STL.totalPct), N(tComb, STL.totalNum), N(lphTot, STL.totalNum), N(tDelta, STL.totalNum),
                I(tStat['Corretiva'] || 0, STL.total), I(tStat['Preventiva'] || 0, STL.total), I(tStat['Chuva'] || 0, STL.total),
                I(tStat['Falta operador'] || 0, STL.total), I(tStat['Sem frente'] || 0, STL.total)
            ]);

            const wsR = montarSheet(M);
            wsR['!cols'] = [{ wch: 26 }, { wch: 14 }, { wch: 10 }, { wch: 20 }, { wch: 10 }, { wch: 11 }, { wch: 12 }, { wch: 10 }, { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 11 }, { wch: 12 }, { wch: 10 }, { wch: 14 }, { wch: 12 }];
            wsR['!merges'] = [
                { s: { r: 0, c: 0 }, e: { r: 0, c: nC - 1 } },
                { s: { r: 1, c: 0 }, e: { r: 1, c: nC - 1 } },
                { s: { r: 2, c: 0 }, e: { r: 2, c: nC - 1 } }
            ];
            wsR['!rows'] = [{ hpt: 24 }, { hpt: 18 }, { hpt: 16 }];
            wsR['!freeze'] = { xSplit: 0, ySplit: 5 };
            XLSX.utils.book_append_sheet(wb, wsR, 'Resumo Geral');

            /* ---------- ABA POR EQUIPAMENTO ---------- */
            const usados = new Set();
            const colsDia = ['Data','Dia','Turno','Operador','Início','Fim','Paradas','Horas trab.','Horím. ini.','Horím. fim','Δ Horím.','Comb. (L)','Situação','Observações'];
            const nD = colsDia.length;
            nomes.forEach(nome => {
                const lista = grupos[nome].slice().sort((a, b) => String(a.data).localeCompare(String(b.data)));
                const e = estatEquip(lista);
                const info = infoEquipMed(nome);
                const D = [];
                const vazia = () => Array(nD).fill(T('', STL.valor));

                D.push([T('MEDIÇÃO MENSAL DE EQUIPAMENTO', STL.titulo), ...Array(nD - 1).fill(T('', STL.titulo))]);
                D.push([T(nome + '  •  ' + mesLabel, STL.subtitulo), ...Array(nD - 1).fill(T('', STL.subtitulo))]);
                D.push(vazia());
                // Ficha do equipamento
                D.push([T('Tipo', STL.rotulo), T(info.tipo, STL.valor), T('Vínculo', STL.rotulo), T(info.vinculo, STL.valor), T('Locadora', STL.rotulo), T(info.locadora, STL.valor), ...Array(nD - 6).fill(T('', STL.valor))]);
                // KPIs
                D.push([
                    T('Dias apont.', STL.rotulo), I(e.dias, STL.valor),
                    T('Horas trab.', STL.rotulo), N(e.horas, STL.valorNum),
                    T('Utilização', STL.rotulo), P(e.util, Object.assign({}, STL.valor, { numFmt: '0%', alignment: { horizontal: 'right', vertical: 'center' } })),
                    ...Array(nD - 6).fill(T('', STL.valor))
                ]);
                D.push([
                    T('Combustível', STL.rotulo), N(e.comb, STL.valorNum),
                    T('Consumo L/h', STL.rotulo), N(e.lph, STL.valorNum),
                    T('Δ Horímetro', STL.rotulo), N(e.deltaHorim, STL.valorNum),
                    ...Array(nD - 6).fill(T('', STL.valor))
                ]);
                D.push(vazia());
                // Cabeçalho da tabela diária
                const headRow = D.length;
                D.push(colsDia.map(c => T(c, STL.th)));
                // Linhas diárias
                lista.forEach(a => {
                    const o = parseObs(a.observacoes);
                    const hi = num(a.horimInicial), hf = num(a.horimFinal);
                    const delta = (hi > 0 && hf >= hi) ? hf - hi : 0;
                    D.push([
                        T(formatarData(a.data), STL.tdC),
                        T(diaSemanaBR(a.data), STL.tdC),
                        T(a.turno || '', STL.tdC),
                        T(a.operador || '', STL.td),
                        T(o.inicio, STL.tdC),
                        T(o.fim, STL.tdC),
                        T(o.paradas || '—', STL.td),
                        N(a.horas),
                        hi > 0 ? N(hi) : T('—', STL.tdC),
                        hf > 0 ? N(hf) : T('—', STL.tdC),
                        delta > 0 ? N(delta) : T('—', STL.tdC),
                        N(a.combustivel),
                        T(statusMed(a.status), STL.tdC),
                        T(o.detalhes || '', STL.td)
                    ]);
                });
                // Totais
                D.push([
                    T('TOTAIS', STL.total), T('', STL.total), T('', STL.total), T('', STL.total), T('', STL.total), T('', STL.total),
                    T(e.dias + ' dia(s)', STL.total), N(e.horas, STL.totalNum),
                    T('', STL.total), T('', STL.total), N(e.deltaHorim, STL.totalNum), N(e.comb, STL.totalNum),
                    T('', STL.total), T('', STL.total)
                ]);
                // Resumo por situação (dias)
                D.push(vazia());
                D.push([T('Resumo por situação (dias):', STL.rotulo), ...Array(nD - 1).fill(T('', STL.valor))]);
                const ordemSit = ['Produtivo','Corretiva','Preventiva','Chuva','Falta operador','Sem frente'];
                Object.keys(e.porStatus).filter(k => ordemSit.indexOf(k) === -1).forEach(k => ordemSit.push(k));
                ordemSit.filter(k => e.porStatus[k]).forEach(k => {
                    D.push([T(k, STL.valor), I(e.porStatus[k], STL.valorNum), ...Array(nD - 2).fill(T('', STL.valor))]);
                });

                const ws = montarSheet(D);
                ws['!cols'] = [{ wch: 11 }, { wch: 5 }, { wch: 9 }, { wch: 20 }, { wch: 7 }, { wch: 7 }, { wch: 24 }, { wch: 10 }, { wch: 11 }, { wch: 11 }, { wch: 10 }, { wch: 10 }, { wch: 14 }, { wch: 34 }];
                ws['!merges'] = [
                    { s: { r: 0, c: 0 }, e: { r: 0, c: nD - 1 } },
                    { s: { r: 1, c: 0 }, e: { r: 1, c: nD - 1 } }
                ];
                ws['!rows'] = [{ hpt: 24 }, { hpt: 18 }];
                ws['!freeze'] = { xSplit: 0, ySplit: headRow + 1 };
                XLSX.utils.book_append_sheet(wb, ws, nomeAbaSeguro(nome, usados));
            });

            const sufixo = eqFiltro ? '_' + String(eqFiltro).replace(/[^\w\-]+/g, '-').slice(0, 24) : '';
            XLSX.writeFile(wb, `Medicao_${mes}${sufixo}.xlsx`);
        }

        function imprimirPainel() {
            if (!REL_AGG || !REL_AGG.total) { showToast('Nada para imprimir.', 'error'); return; }
            const A = REL_AGG;
            const de = document.getElementById('relDe').value, ate = document.getElementById('relAte').value;
            const periodo = (de || ate) ? `${de || 'início'} a ${ate || 'hoje'}` : 'Todos os períodos';
            const tabela = (titulo, rows) => `<h2>${titulo}</h2><table><tr><th>Item</th><th>Horas</th><th>Apont.</th></tr>${rows}</table>`;
            const w = window.open('', '_blank');
            if (!w) { showToast('Permita pop-ups para imprimir.', 'error'); return; }
            w.document.write(`<html><head><title>Relatório de Equipamentos</title><style>
                body{font-family:Arial,sans-serif;color:#111;margin:24px}h1{margin:0 0 4px;font-size:20px}h2{margin:18px 0 6px;font-size:15px}
                .sub{color:#666;font-size:12px;margin-bottom:12px}table{border-collapse:collapse;width:100%;font-size:13px;margin-bottom:8px}
                th,td{border:1px solid #ccc;padding:6px 8px;text-align:left}th{background:#f3f4f6}
                .kpis{display:flex;gap:10px;flex-wrap:wrap;margin:10px 0}.kpi{border:1px solid #ddd;border-radius:8px;padding:8px 14px}.kpi b{font-size:18px;display:block}
            </style></head><body>
                <h1>Relatório de Equipamentos — FrotaSync</h1>
                <div class="sub">Período: ${periodo} &bull; Gerado em ${new Date().toLocaleString('pt-BR')}</div>
                <div class="kpis">
                    <div class="kpi"><b>${A.total}</b>Apontamentos</div>
                    <div class="kpi"><b>${numBR(A.totalHoras)}h</b>Horas totais</div>
                    <div class="kpi"><b>${A.nEquip}</b>Equipamentos</div>
                    <div class="kpi"><b>${numBR(A.totalComb)} L</b>Combustível</div>
                    <div class="kpi"><b>${Math.round(A.utilMedia * 100)}%</b>Utilização média</div>
                </div>
                ${tabela('Horas por equipamento', A.equips.map(e => `<tr><td>${escapeHtml(e.nome)}</td><td>${numBR(e.horas)}h (${Math.round(e.util * 100)}%)</td><td>${e.apont}</td></tr>`).join(''))}
                ${tabela('Por situação', A.status.map(s => `<tr><td>${escapeHtml(rotuloStatusTxt(s.nome))}</td><td>${numBR(s.horas)}h</td><td>${s.apont}</td></tr>`).join(''))}
                ${tabela('Por locadora', A.locs.map(l => `<tr><td>${escapeHtml(l.nome)}</td><td>${numBR(l.horas)}h</td><td>${l.apont}</td></tr>`).join(''))}
            </body></html>`);
            w.document.close();
            setTimeout(() => { w.print(); }, 350);
        }

        // Fecha qualquer modal aberto com a tecla Esc (UX)
        document.addEventListener('keydown', e => {
            if (e.key !== 'Escape') return;
            ['cadastroModal', 'confirmModal', 'ultimosModal', 'painelModal'].forEach(id => {
                const el = document.getElementById(id);
                if (el && !el.classList.contains('hidden')) el.classList.add('hidden');
            });
        });

        // Mês de medição inicia no mês corrente
        (function () {
            const m = document.getElementById('medMes');
            if (m && !m.value) { const n = new Date(); m.value = `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`; }
        })();

        // Carrega as listas do motor ao abrir o app


        // O xlsx-js-style vem de vendor/, carregado só quando alguém exporta.
        async function gerarMedicaoMensal() {
            return comLib('excel', () => _gerarMedicaoMensal(), 'a medição mensal');
        }

  /* ==================================================================
     A TELA — mesma operação, no visual do app
     ================================================================== */

  const OPS_STATUS = [
    ['OperandoNormalmente', 'Operando normalmente'],
    ['ManutencaoCorretiva', 'Manutenção corretiva (quebrado)'],
    ['ManutencaoPreventiva', 'Manutenção preventiva (programada)'],
    ['ParadoChuva', 'Parado por chuva'],
    ['FaltaOperador', 'Ocioso por falta de operador'],
    ['FaltaFrenteServico', 'Ocioso por falta de frente'],
  ];

  function modal(id, titulo, sub, corpo, largura) {
    return `<div id="${id}" class="eq-modal" style="display:none">
      <div class="eq-modal-caixa" style="max-width:${largura || '560px'}">
        <div class="eq-modal-topo">
          <div>
            <div class="card-title">${titulo}</div>
            <div class="card-title-sub">${sub}</div>
          </div>
          <button type="button" class="btn btn-sm btn-ghost" onclick="EQ.fechar('${id}')">${ic('fechar')}</button>
        </div>
        <div class="eq-modal-corpo">${corpo}</div>
      </div>
    </div>`;
  }

  function render() {
    const linhaConf = (rot, id) =>
      `<div class="eq-conf-linha"><span class="kpi-s">${rot}</span><span id="${id}">—</span></div>`;

    return `
    <div class="eq-topo">
      <div>
        <div class="card-title">Apontamento de equipamento</div>
        <div class="card-title-sub">Hora de máquina do dia — horas líquidas, paradas com motivo e assinatura do operador</div>
      </div>
      <div class="eq-topo-acoes">
        <button type="button" class="btn btn-sm btn-outline" onclick="EQ.abrirCadastros()">${ic('mais')} Cadastros</button>
        <button type="button" class="btn btn-sm btn-outline" onclick="EQ.abrirUltimos()">${ic('relogio')} Últimos</button>
        <button type="button" class="btn btn-sm btn-primary" onclick="EQ.abrirPainel()">${ic('grafico')} Painel</button>
      </div>
    </div>

    <form id="apontamentoForm" class="card" style="margin-top:14px">
      <div class="card-body">

        <!-- A faixa é o que separa CORRIGIR de LANÇAR. Sem ela, o formulário
             preenchido parece um lançamento novo, e salvar vira duplicata. -->
        <div id="eqEdicaoFaixa" class="eq-edicao" style="display:none">
          <div class="eq-edicao-txt">
            <b>Corrigindo um apontamento já enviado</b>
            <span id="eqEdicaoAlvo" class="kpi-s"></span>
          </div>
          <button type="button" class="btn btn-sm btn-ghost" onclick="EQ.cancelarEdicao()">Cancelar correção</button>
        </div>

        <div class="eq-horas">
          <div>
            <div class="kpi-s">Horas apuradas</div>
            <div class="eq-horas-num"><span id="horasDisplay">0.00<span class="eq-h">h</span></span></div>
          </div>
          <div class="kpi-s eq-horas-nota">
            Descontadas as paradas lançadas abaixo. É este número que vai para a medição.
          </div>
        </div>

        <div class="form-grid" style="margin-top:16px">
          <div class="field"><label for="data">Data do serviço</label>
            <input type="date" id="data" name="data" required></div>
          <div class="field"><label for="turno">Turno</label>
            <select id="turno" name="turno" required onchange="EQ.aplicarTurno()">
              <option value="" disabled selected>Selecione o turno…</option>
              <option value="Diurno" data-inicio="07:00" data-fim="17:00">Diurno (07:00 – 17:00)</option>
              <option value="Noturno" data-inicio="19:00" data-fim="05:00">Noturno (19:00 – 05:00)</option>
            </select></div>
          <div class="field"><label for="equipamento">Equipamento</label>
            <select id="equipamento" name="equipamento" required>
              <option value="" disabled selected>Selecione o ativo…</option>
            </select></div>
          <div class="field"><label for="operador">Operador responsável</label>
            <input type="text" id="operador" name="operador" required placeholder="Nome de quem operou"></div>
        </div>
        <!-- Início/Fim continuam lado a lado no celular: é um par, e separá-los
             em duas linhas cheias só faz o apontador rolar mais. -->
        <div class="eq-duo" style="margin-top:14px">
          <div class="field"><label for="inicio">Início</label>
            <input type="time" id="inicio" required onchange="EQ.calcularHoras()"></div>
          <div class="field"><label for="fim">Fim</label>
            <input type="time" id="fim" required onchange="EQ.calcularHoras()"></div>
        </div>

        <div class="eq-bloco">
          <div class="eq-bloco-topo">
            <div>
              <div class="card-title" style="font-size:13px">Paradas do turno</div>
              <div class="card-title-sub">Cada parada desconta da hora trabalhada</div>
            </div>
            <button type="button" class="btn btn-sm btn-outline" onclick="EQ.adicionarParada()">${ic('mais')} Adicionar parada</button>
          </div>
          <div id="paradasList"></div>
          <p id="paradasVazio" class="eq-vazio">Nenhuma parada lançada. O turno conta integral.</p>
        </div>

        <!-- type=text + inputmode=decimal, e NUNCA type=number: em teclado
             pt-BR o operador digita "1.250,5" e o Chromium descarta o valor
             inteiro em silêncio (o campo fica vazio ao ler .value). Horímetro
             errado é hora de máquina errada, e hora de máquina é cobrança.
             É a mesma decisão já tomada na quantidade do Lançar Serviço; o
             valor é lido por num(), que entende vírgula e ponto. -->
        <div class="eq-duo">
          <div class="field"><label for="horimInicial">Horímetro / km inicial</label>
            <input type="text" inputmode="decimal" autocomplete="off" id="horimInicial" name="horimInicial" placeholder="h ou km"></div>
          <div class="field"><label for="horimFinal">Horímetro / km final</label>
            <input type="text" inputmode="decimal" autocomplete="off" id="horimFinal" name="horimFinal" placeholder="h ou km"></div>
        </div>
        <div class="form-grid" style="margin-top:14px">
          <div class="field"><label for="combustivel">Combustível (litros)</label>
            <input type="text" inputmode="decimal" autocomplete="off" id="combustivel" name="combustivel" placeholder="litros"></div>
          <div class="field"><label for="status">Situação ao fim do turno</label>
            <select id="status" name="status" required>
              ${OPS_STATUS.map(([v, t], i) => `<option value="${v}"${i === 0 ? ' selected' : ''}>${t}</option>`).join('')}
            </select></div>
        </div>

        <div class="field"><label for="observacoesUI">Observações (opcional)</label>
          <textarea id="observacoesUI" rows="3" placeholder="Ocorrências, frente atendida, avarias…"></textarea></div>

        <!-- A ASSINATURA NÃO PODE SER UMA ARMADILHA DE ROLAGEM.
             O canvas ficava embutido no meio de um formulário longo, com
             touch-action:none numa faixa de 160px: quem arrastava o dedo ali
             para ROLAR a página riscava a assinatura em vez de rolar, e a
             página não saía do lugar. Agora o canvas mora num modal de tela
             cheia — onde arrastar só pode significar assinar. -->
        <div class="eq-bloco">
          <div class="eq-bloco-topo">
            <div>
              <div class="card-title" style="font-size:13px">Assinatura do operador</div>
              <div class="card-title-sub">Opcional — abre em tela cheia para assinar com o dedo</div>
            </div>
            <div class="eq-assin-acoes">
              <button type="button" class="btn btn-sm btn-outline" onclick="EQ.abrirAssinatura()">${ic('assinatura')} Assinar</button>
              <button type="button" class="btn btn-sm btn-ghost" onclick="EQ.limparAssinatura()">Limpar</button>
            </div>
          </div>
          <div id="assinaturaEstado" class="eq-assin-estado">Sem assinatura — o apontamento pode ser enviado assim.</div>
          <img id="assinaturaPrev" class="eq-assin-prev" alt="Assinatura do operador" style="display:none">
        </div>

        <input type="hidden" id="horas" name="horas">
        <input type="hidden" id="observacoes" name="observacoes">
        <input type="hidden" id="assinatura" name="assinatura">

        <!-- No celular o botão gruda no pé da tela: o formulário é longo e
             ninguém devia rolar até o fim só para enviar. -->
        <div class="eq-enviar">
          <button type="submit" id="submitBtn" class="btn btn-primary btn-lg" style="width:100%;justify-content:center">
            <span id="btnText">Enviar apontamento</span>
          </button>
        </div>
      </div>
    </form>

    ${modal('assinaturaModal', 'Assinatura do operador', 'Assine com o dedo. Confirmar guarda; descartar apaga o traço.', `
      <canvas id="assinaturaCanvas" class="eq-assinatura"></canvas>
      <div class="eq-modal-rodape">
        <button type="button" class="btn btn-outline" onclick="EQ.limparAssinatura()">Limpar</button>
        <button type="button" class="btn btn-primary" onclick="EQ.confirmarAssinatura()">${ic('check')} Confirmar assinatura</button>
      </div>`, '640px')}

    ${modal('confirmModal', '<span id="cfTitulo">Confira antes de enviar</span>', 'Depois de enviado, só o administrador apaga', `
      <div class="eq-conf">
        ${linhaConf('Data', 'cfData')}${linhaConf('Turno', 'cfTurno')}
        ${linhaConf('Equipamento', 'cfEquip')}${linhaConf('Operador', 'cfOperador')}
        ${linhaConf('Período', 'cfPeriodo')}${linhaConf('Paradas', 'cfParadas')}
        ${linhaConf('Horas', 'cfHoras')}${linhaConf('Situação', 'cfStatus')}
        ${linhaConf('Horímetro', 'cfHorim')}${linhaConf('Combustível', 'cfComb')}
        ${linhaConf('Assinatura', 'cfAssin')}${linhaConf('Observações', 'cfObs')}
      </div>
      <div class="eq-modal-rodape">
        <button type="button" class="btn btn-outline" onclick="EQ.fechar('confirmModal')">Voltar e revisar</button>
        <button type="button" class="btn btn-primary" onclick="EQ.confirmarEnvio()"><span id="cfBotao">Confirmar e enviar</span></button>
      </div>`)}

    ${modal('cadastroModal', 'Cadastros', 'Equipamentos e locadoras da obra', `
      <div class="eq-abas">
        <button type="button" id="tabBtnEquip" onclick="EQ.trocarAba('equip')">Equipamentos</button>
        <button type="button" id="tabBtnLoc" onclick="EQ.trocarAba('loc')">Locadoras</button>
      </div>
      <div id="abaEquip">
        <form id="formEquip">
          <div class="field"><label for="eqNome">Nome do equipamento *</label>
            <input type="text" id="eqNome" required placeholder="ex: Escavadeira CAT 320"></div>
          <div class="field"><label for="eqTipo">Tipo / categoria</label>
            <input type="text" id="eqTipo" list="tiposList" placeholder="ex: Linha Amarela">
            <datalist id="tiposList"></datalist></div>
          <div class="field"><label>Vínculo</label>
            <div class="eq-radios">
              <label><input type="radio" name="eqVinculo" value="Locado" checked onchange="EQ.toggleLocadora()"> Locado</label>
              <label><input type="radio" name="eqVinculo" value="Próprio" onchange="EQ.toggleLocadora()"> Próprio</label>
            </div></div>
          <div class="field" id="locadoraWrap"><label for="eqLocadora">Empresa locadora</label>
            <select id="eqLocadora"><option value="">— selecione —</option></select></div>
          <button type="submit" class="btn btn-primary" style="width:100%;justify-content:center">Cadastrar equipamento</button>
        </form>
        <div class="card-title-sub" style="margin:14px 0 6px">Equipamentos ativos (<span id="countEquip">0</span>)</div>
        <div id="listaEquip" class="eq-lista"></div>
      </div>
      <div id="abaLoc" style="display:none">
        <form id="formLoc">
          <div class="field"><label for="locNome">Nome da locadora *</label>
            <input type="text" id="locNome" required placeholder="ex: Locarma Máquinas"></div>
          <div class="field"><label for="locObs">Observações</label>
            <textarea id="locObs" rows="2" placeholder="Contato, contrato, condições…"></textarea></div>
          <button type="submit" class="btn btn-primary" style="width:100%;justify-content:center">Cadastrar locadora</button>
        </form>
        <div class="card-title-sub" style="margin:14px 0 6px">Locadoras cadastradas (<span id="countLoc">0</span>)</div>
        <div id="listaLoc" class="eq-lista"></div>
      </div>`)}

    ${modal('ultimosModal', 'Últimos apontamentos', 'Confira e apague se algo saiu errado',
      '<div id="listaUltimos" class="eq-lista"></div>')}

    ${modal('painelModal', 'Painel de equipamentos', 'Horas, utilização e consumo no período', `
      <div class="eq-duo">
        <div class="field"><label for="relDe">De</label><input type="date" id="relDe"></div>
        <div class="field"><label for="relAte">Até</label><input type="date" id="relAte"></div>
      </div>
      <div class="field" style="margin:12px 0"><label for="relEquip">Equipamento</label>
        <select id="relEquip" onchange="EQ.aplicarFiltroEquip()"><option value="">Todos os equipamentos</option></select></div>
      <div class="eq-topo-acoes" style="margin-bottom:12px">
        <button type="button" class="btn btn-sm btn-primary" onclick="EQ.carregarRelatorio()">Aplicar</button>
        <button type="button" class="btn btn-sm btn-outline" onclick="EQ.periodoMes()">Este mês</button>
        <button type="button" class="btn btn-sm btn-outline" onclick="EQ.periodoTudo()">Tudo</button>
        <button type="button" class="btn btn-sm btn-ghost" onclick="EQ.exportarCSV()">${ic('baixar')} CSV</button>
      </div>
      <div class="eq-bloco">
        <div class="eq-bloco-topo">
          <div>
            <div class="card-title" style="font-size:13px">Medição mensal (Excel)</div>
            <div class="card-title-sub">Resumo geral da frota e uma aba por equipamento</div>
          </div>
        </div>
        <div class="eq-med-linha">
          <div class="field"><label for="medMes">Mês de referência</label><input type="month" id="medMes"></div>
          <button type="button" id="btnMedicao" class="btn btn-primary" onclick="EQ.gerarMedicaoMensal()">${ic('planilha')} Gerar medição</button>
        </div>
        <div id="medStatus" class="kpi-s"></div>
      </div>
      <div id="painelCorpo"></div>`, '820px')}
    `;
  }

  /* ==================================================================
     Inicialização — a tela existe só depois de render()
     ================================================================== */
  let ligado = false;
  // Cache mínimo lido pela Central de Campo do painel inicial e pela
  // apresentação. trocarObra() zera com este MESMO formato — dado de
  // equipamento é da obra que o lançou e não atravessa a troca.
  window.EQUIP = window.EQUIP || { carregado: false, apontamentos: [], equipamentos: [], locadoras: [] };

  function boot() {
    // modais que abrir() mudou para o body numa montagem anterior da tela
    document.querySelectorAll('body > .eq-modal').forEach(m => m.remove());
    /* A tela remonta a cada entrada (e a cada troca de obra). Uma correção
       aberta e abandonada não pode sobreviver a isso: o formulário volta em
       branco, e o próximo envio gravaria por cima de uma linha que ninguém
       mais está vendo — de outra obra, inclusive. */
    EDICAO = null;
    ULTIMOS = [];
    form = document.getElementById('apontamentoForm');
    submitBtn = document.getElementById('submitBtn');
    btnText = document.getElementById('btnText');
    if (!form) return;

    const hoje = document.getElementById('data');
    if (hoje && !hoje.value) hoje.valueAsDate = new Date();
    const mes = document.getElementById('medMes');
    if (mes && !mes.value) mes.value = new Date().toISOString().slice(0, 7);

    ligarFormApontamento();
    ligarFormLoc();
    ligarFormEquip();
    // initAssinatura() roda ao ABRIR o modal — canvas escondido mede 0 de
    // largura e sairia com a resolução errada (ver abrirAssinatura).
    mostrarEstadoAssinatura();
    marcarModoEdicao();
    atualizarParadasVazio();
    toggleLocadora();
    trocarAba('equip');

    // As listas vêm do mesmo motor de sempre; sem elas o <select> fica vazio.
    if (!ligado) { ligado = true; }
    carregarListas();
  }

  /* O `.page` roda uma animação de entrada com transform, e transform cria
     contexto de empilhamento: dentro dele nenhum z-index vence a barra de
     navegação do celular, que é fixa e ficava POR CIMA do modal — comendo o
     pé de Cadastros e do Painel. Movido para o body, o modal volta a mandar
     na tela. Os que sobram de uma montagem anterior são limpos no boot(). */
  function abrir(id) {
    const e = document.getElementById(id);
    if (!e) return;
    if (e.parentElement !== document.body) document.body.appendChild(e);
    e.style.display = 'flex';
  }
  function fechar(id) { const e = document.getElementById(id); if (e) e.style.display = 'none'; }

  window.EQ = {
    render: render,
    boot: boot,
    abrir: abrir,
    fechar: fechar,
    // ações chamadas pelos botões da tela
    aplicarTurno: aplicarTurno,
    calcularHoras: calcularHoras,
    adicionarParada: adicionarParada,
    limparAssinatura: limparAssinatura,
    cancelarEdicao: cancelarEdicao,
    abrirAssinatura: abrirAssinatura,
    confirmarAssinatura: confirmarAssinatura,
    confirmarEnvio: confirmarEnvio,
    abrirCadastros: function () { abrir('cadastroModal'); },
    abrirUltimos: function () { abrir('ultimosModal'); carregarUltimos(); },
    abrirPainel: function () { abrir('painelModal'); carregarRelatorio(); },
    trocarAba: trocarAba,
    toggleLocadora: toggleLocadora,
    carregarRelatorio: carregarRelatorio,
    aplicarFiltroEquip: aplicarFiltroEquip,
    periodoMes: periodoMes,
    periodoTudo: periodoTudo,
    exportarCSV: exportarCSV,
    gerarMedicaoMensal: gerarMedicaoMensal,
  };
})();
