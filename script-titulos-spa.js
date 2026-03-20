// ==========================================
// SPA TÍTULOS DE CRÉDITO (Workflow por Status)
// ==========================================
(function() {
    if (!document.getElementById('tbody-titulos')) return;

    const STATUS_ORDEM = ['Rascunho', 'Em Processamento', 'Em Liquidação', 'Liquidado', 'Aguardando Financeiro', 'Para Pagamento', 'Devolvido'];
    const STATUS_CSS = {
        'Rascunho': 'badge-rascunho',
        'Em Processamento': 'badge-processamento',
        'Em Liquidação': 'badge-liquidacao',
        'Liquidado': 'badge-liquidado',
        'Aguardando Financeiro': 'badge-aguardando',
        'Para Pagamento': 'badge-para-pagamento',
        'Devolvido': 'badge-devolvido'
    };

    let baseTitulos = [];
    let baseContratos = [];
    let baseEmpenhos = [];
    let listaOI = [];
    let listaCentroCustos = [];
    let listaUG = [];
    let baseLfPf = [];
    let statusFiltroAtual = null;
    let titulosSelecionados = new Set();
    let empenhosDaNotaAtual = [];
    let tributacoesAtual = [];
    let salvandoApenasAbaDadosBasicos = false;
    let enviandoParaProcessamento = false;
    let paginaAtual = 1;
    let itensPorPagina = 10;
    let termoBusca = '';
    let incluirInativos = false;
    let estadoOrdenacao = { coluna: 'idProc', direcao: 'asc' };

    window.baseTitulos = function() { return baseTitulos; };

    // Vincula o TC à NP (Nota de Pagamento) quando `np` é preenchida.
    // Modelo da coleção `np` (Firestore):
    // - docId = NP
    // - titulosVinculados: arrayUnion(tituloId)
    async function vincularTituloNaNP(tituloId, npValor, dataLiquidacao) {
        const npInput = String(npValor || '').trim();
        if (!npInput) return;

        // Tenta resolver o docId completo do NP.
        // Se o usuário informar apenas o sufixo de 12, reconstruímos pelo padrão do app.
        const UG_PADRAO = '741000';
        const GESTAO_PADRAO = '00001';
        const PREFIX11_PADRAO = UG_PADRAO + GESTAO_PADRAO; // 11 dígitos

        function completarNpDocIdParaTentativa(valor) {
            const s = String(valor || '').trim();
            if (!s) return '';
            if (s.length > 12) return s;
            // Sufixo esperado: AAAAxxNNNNNN (ex.: 2026NP000001)
            const m = s.match(/^(\d{4})([A-Za-z]{2})(\d{6})$/);
            if (!m) return '';
            const ano = m[1];
            const tipo = (m[2] || '').toUpperCase();
            const num = m[3];
            if (tipo !== 'NP') return '';
            return PREFIX11_PADRAO + ano + 'NP' + num;
        }

        const candidatos = [];
        if (npInput) candidatos.push(npInput);
        const completoTentativa = completarNpDocIdParaTentativa(npInput);
        if (completoTentativa && completoTentativa !== npInput) candidatos.push(completoTentativa);

        // Payload básico: preserva documentosHabeis (se já existir) via merge.
        const tituloIdStr = String(tituloId || '').trim();
        const dl = String(dataLiquidacao || '').trim();

        let didVincular = false;
        for (const npDocId of candidatos) {
            if (!npDocId) continue;

            const ref = db.collection('np').doc(npDocId);
            const snap = await ref.get();
            const payload = {
                np: npDocId,
                titulosVinculados: firebase.firestore.FieldValue.arrayUnion(tituloIdStr),
                editado_em: firebase.firestore.FieldValue.serverTimestamp()
            };
            if (dl) payload.dataLiquidacao = dl;
            if (typeof usuarioLogadoEmail === 'string' && usuarioLogadoEmail) payload.editado_por = usuarioLogadoEmail;

            if (snap.exists) {
                await ref.set(payload, { merge: true });
                didVincular = true;
                break;
            }
        }

        // Se o NP não existia, criamos um documento mínimo (sem documentosHabeis),
        // para ainda registrar a lista de TC; depois o módulo NP/OPxOB pode preencher.
        if (!didVincular) {
            const npDocIdCriar = candidatos[0];
            const payload = {
                np: npDocIdCriar,
                titulosVinculados: firebase.firestore.FieldValue.arrayUnion(tituloIdStr),
                documentosHabeis: [],
                ativo: true,
                editado_em: firebase.firestore.FieldValue.serverTimestamp()
            };
            if (dl) payload.dataLiquidacao = dl;
            if (typeof usuarioLogadoEmail === 'string' && usuarioLogadoEmail) payload.editado_por = usuarioLogadoEmail;
            await db.collection('np').doc(npDocIdCriar).set(payload, { merge: true });
        }
    }

    // Usa o loading global (script.js) para aplicar delay (3s) e prompt (60s)
    function mostrarLoading() { if (typeof window.mostrarLoading === 'function') window.mostrarLoading('Carregando...'); }
    function esconderLoading() { if (typeof window.esconderLoading === 'function') window.esconderLoading(); }

    function inicializarTitulosSPA() {
        mostrarLoading();
        let carregamentoFinalizado = false;
        let carregados = 0;
        const TOTAL_COLECOES = 7;
        const TIMEOUT_MS = 10000;
        const unsubscribers = [];

        // Se o usuário interromper após muitos segundos, desligar listeners onSnapshot.
        if (typeof window.__setLoadingAbortFn === 'function') {
            window.__setLoadingAbortFn(function abortarCarregamentoTitulos() {
                try {
                    unsubscribers.forEach(u => { try { u && u(); } catch (e) {} });
                } catch (e) {}
                // Mantém regra: pedir recarregar/verificar conexão (não confiar em dados parciais).
                alert('Carregamento interrompido. Verifique sua conexão ou recarregue a página.');
            });
        }

        const finalizarCarregamento = () => {
            if (carregamentoFinalizado) return;
            carregamentoFinalizado = true;
            clearTimeout(timeoutId);
            esconderLoading();
            if (typeof esconderBarraLoading === 'function') esconderBarraLoading();
        };

        const aoReceberSnapshot = () => {
            carregados++;
            if (carregados >= TOTAL_COLECOES) finalizarCarregamento();
        };

        const onErr = (err) => {
            console.error('Erro ao carregar dados:', err);
            finalizarCarregamento();
            const tbody = document.getElementById('tbody-titulos');
            if (tbody && !tbody.querySelector('tr')) {
                tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#e74c3c;">Erro ao carregar. Verifique a ligação e permissões.</td></tr>';
            }
        };

        const timeoutId = setTimeout(finalizarCarregamento, TIMEOUT_MS);

        unsubscribers.push(db.collection('titulos').onSnapshot(
            snap => {
                try {
                    baseTitulos = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                    atualizarTabelaTitulos();
                } catch (e) {
                    console.error('Erro ao atualizar tabela de títulos:', e);
                } finally {
                    aoReceberSnapshot();
                }
            },
            onErr
        ));
        unsubscribers.push(db.collection('contratos').onSnapshot(snap => {
            baseContratos = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            aoReceberSnapshot();
        }, onErr));
        unsubscribers.push(db.collection('empenhos').onSnapshot(snap => {
            baseEmpenhos = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            aoReceberSnapshot();
        }, onErr));
        unsubscribers.push(db.collection('oi').onSnapshot(snap => {
            listaOI = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            popularSelectOI();
            aoReceberSnapshot();
        }, onErr));
        unsubscribers.push(db.collection('centroCustos').onSnapshot(snap => {
            listaCentroCustos = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            popularSelectCentroCustos();
            aoReceberSnapshot();
        }, onErr));
        unsubscribers.push(db.collection('unidadesGestoras').onSnapshot(snap => {
            listaUG = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            popularSelectUG();
            aoReceberSnapshot();
        }, onErr));
        unsubscribers.push(db.collection('lfpf').onSnapshot(snap => {
            baseLfPf = snap.docs.map(doc => ({ id: doc.id, ...doc.data() })).filter(r => r.ativo !== false);
            aoReceberSnapshot();
        }, onErr));

        const urlParams = new URLSearchParams(window.location.search);
        const st = urlParams.get('status');
        if (st) filtrarPorStatus(st);
        desenharFiltrosStatus();
        ligarEventos();
    }
    window.inicializarTitulosSPA = inicializarTitulosSPA;

    function popularSelectOI() { /* OI agora é autocomplete; mantido para compatibilidade */ }

    function popularSelectCentroCustos() {
        const sel = document.getElementById('vinculoCentroCustos');
        if (!sel) return;
        const val = sel.value;
        sel.innerHTML = '<option value="">Selecione...</option>';
        (listaCentroCustos || []).forEach(c => {
            const opt = document.createElement('option');
            opt.value = c.id;
            opt.textContent = (c.codigo || '-') + ' - ' + (c.descricao || c.aplicacao || '-');
            sel.appendChild(opt);
        });
        if (val) sel.value = val;
    }

    function popularSelectUG() {
        const sel = document.getElementById('vinculoUG');
        if (!sel) return;
        const val = sel.value;
        sel.innerHTML = '<option value="">Selecione...</option>';
        (listaUG || []).forEach(u => {
            const opt = document.createElement('option');
            opt.value = u.id;
            opt.textContent = (u.codigo || '-') + ' - ' + (u.nome || '-');
            sel.appendChild(opt);
        });
        if (val) sel.value = val;
    }

    function removerAcentos(str) {
        if (!str) return '';
        return String(str).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    }
    function textoCorresponde(busca, alvo, minLen) {
        const b = removerAcentos(String(busca || '')).toLowerCase().trim();
        const a = removerAcentos(String(alvo || '')).toLowerCase().trim();
        const min = minLen != null ? minLen : 2;
        if (b.length < min) return false;
        if (a.includes(b)) return true;
        let bi = 0;
        for (let ai = 0; ai < a.length && bi < b.length; ai++) {
            if (a[ai] === b[bi]) bi++;
        }
        return bi >= b.length;
    }

    /** Primeiros 5 campos da coleção OI para filtro: numeroOI, nomeOI, contatoOI, telefoneOI, situacao */
    function camposOIParaBusca(o) {
        return [
            String(o.numeroOI || o.numero || '').trim(),
            String(o.nomeOI || o.nome || '').trim(),
            String(o.contatoOI || '').trim(),
            String(o.telefoneOI || '').trim(),
            String(o.situacao || '').trim()
        ];
    }
    /** Primeiros 5 campos da coleção Contratos: idContrato, numContrato, situacao, fornecedor, nup */
    function camposContratoParaBusca(c) {
        return [
            String(c.idContrato || '').trim(),
            String(c.numContrato || c.instrumento || '').trim(),
            String(c.situacao || '').trim(),
            String(c.fornecedor || c.razaoSocial || c.empresa || '').trim(),
            String(c.nup || '').trim()
        ];
    }
    /** Campos da coleção NE (Nota de Empenho) para busca */
    function camposEmpenhoParaBusca(e) {
        return [
            String(e.numEmpenho || e.numNE || '').trim(),
            String(e.ptres || '').trim(),
            String(e.fr || '').trim(),
            String(e.nd || '').trim(),
            String(e.favorecido || '').trim(),
            String(e.processo || '').trim(),
            String(e.tipoNE || '').trim(),
            String(e.contrato || '').trim(),
            String(e.cnpj || '').trim()
        ];
    }

    window.limparOISelecionada = function() {
        document.getElementById('oiEntregou').value = '';
        const el = document.getElementById('buscaOIT');
        if (el) { el.value = ''; el.readOnly = false; }
        const btn = document.getElementById('limparOIBtn');
        if (btn) btn.style.display = 'none';
    };

    function mostrarSugestoesOI() {
        const inputBuscaOIT = document.getElementById('buscaOIT');
        const listaOIT = document.getElementById('listaResultadosOIT');
        if (!inputBuscaOIT || !listaOIT || inputBuscaOIT.readOnly) return;
        const texto = (inputBuscaOIT.value || '').trim().toLowerCase();
        const textoSemAcento = removerAcentos(texto);
        listaOIT.innerHTML = '';
        listaOIT.style.display = '';
        if (texto.length < 2) return;
        const oisAtivas = listaOI.filter(o => (o.situacao || '').toLowerCase() !== 'inativo');
        const resultados = oisAtivas.filter(o => {
            const campos = camposOIParaBusca(o);
            return campos.some(campo => removerAcentos(campo).toLowerCase().includes(textoSemAcento));
        });
        if (resultados.length === 0) {
            listaOIT.innerHTML = '<li style="padding:10px; color:#777; font-size:12px;">' + (oisAtivas.length === 0 ? 'Nenhuma OI ativa cadastrada. Cadastre em Admin.' : 'Nenhuma OI ativa encontrada.') + '</li>';
        } else {
            resultados.forEach(o => {
                const li = document.createElement('li');
                li.textContent = (o.numeroOI || '-') + ' - ' + (o.nomeOI || '-');
                li.addEventListener('mousedown', (e) => {
                    e.preventDefault();
                    document.getElementById('oiEntregou').value = o.id;
                    const texto = (o.numeroOI || '-') + ' - ' + (o.nomeOI || '-');
                    inputBuscaOIT.value = texto;
                    inputBuscaOIT.readOnly = true;
                    listaOIT.innerHTML = '';
                    const btn = document.getElementById('limparOIBtn');
                    if (btn) btn.style.display = 'block';
                });
                listaOIT.appendChild(li);
            });
        }
    }
    function configurarAutocompleteOI() {
        const inputBuscaOIT = document.getElementById('buscaOIT');
        const listaOIT = document.getElementById('listaResultadosOIT');
        if (!inputBuscaOIT || !listaOIT || inputBuscaOIT.dataset.autocompleteBound === '1') return;
        inputBuscaOIT.dataset.autocompleteBound = '1';
        inputBuscaOIT.addEventListener('input', debounce(mostrarSugestoesOI, 300));
        inputBuscaOIT.addEventListener('focus', function() { if (!this.readOnly && (this.value || '').trim().length >= 2) mostrarSugestoesOI(); });
        inputBuscaOIT.addEventListener('blur', () => { setTimeout(() => { if (listaOIT) listaOIT.innerHTML = ''; }, 200); });
    }

    function configurarAutocompleteOIGenerico(inputId, listaId, hiddenId, clearBtnId) {
        const input = document.getElementById(inputId);
        const lista = document.getElementById(listaId);
        const clearBtn = clearBtnId ? document.getElementById(clearBtnId) : null;
        if (!input || !lista || input.dataset.autocompleteBound === '1') return;
        input.dataset.autocompleteBound = '1';
        const mostrar = () => {
            if (input.readOnly) return;
            const texto = (input.value || '').trim().toLowerCase();
            const textoSemAcento = removerAcentos(texto);
            lista.innerHTML = '';
            if (texto.length < 2) return;
            const oisAtivas = listaOI.filter(o => (o.situacao || '').toLowerCase() !== 'inativo');
            const resultados = oisAtivas.filter(o => {
                const campos = camposOIParaBusca(o);
                return campos.some(campo => removerAcentos(campo).toLowerCase().includes(textoSemAcento));
            });
            resultados.forEach(o => {
                const li = document.createElement('li');
                li.textContent = (o.numeroOI || '-') + ' - ' + (o.nomeOI || '-');
                li.addEventListener('mousedown', (e) => {
                    e.preventDefault();
                    document.getElementById(hiddenId).value = o.id;
                    input.value = (o.numeroOI || '-') + ' - ' + (o.nomeOI || '-');
                    input.readOnly = true;
                    lista.innerHTML = '';
                    if (clearBtn) clearBtn.style.display = 'block';
                });
                lista.appendChild(li);
            });
        };
        input.addEventListener('input', debounce(mostrar, 300));
        input.addEventListener('focus', function() { if (!this.readOnly && (this.value || '').trim().length >= 2) mostrar(); });
        input.addEventListener('blur', () => { setTimeout(() => { if (lista) lista.innerHTML = ''; }, 200); });
    }

    function desenharFiltrosStatus() {
        const container = document.getElementById('filtrosStatusTC');
        if (!container) return;
        const botoes = ['Todos', ...STATUS_ORDEM.filter(s => s !== 'Devolvido')];
        container.innerHTML = botoes.map(s => {
            const label = s === 'Todos' ? 'Todos' : s;
            const cls = (!statusFiltroAtual && s === 'Todos') || statusFiltroAtual === s ? 'ativo' : '';
            return `<button type="button" class="stepper-tc-btn ${cls}" data-status="${s === 'Todos' ? '' : s}">${escapeHTML(label)}</button>`;
        }).join('');
        container.querySelectorAll('.stepper-tc-btn').forEach(btn => {
            btn.addEventListener('click', () => filtrarPorStatus(btn.getAttribute('data-status') || null));
        });
    }

    window.filtrarPorStatus = function(status) {
        statusFiltroAtual = status || null;
        titulosSelecionados.clear();
        if (status && history.replaceState) history.replaceState({}, '', 'titulos.html?status=' + encodeURIComponent(status));
        else if (history.replaceState) history.replaceState({}, '', 'titulos.html');
        desenharFiltrosStatus();
        atualizarTabelaTitulos();
    };

    const filtroInativosChk = document.getElementById('filtroInativosTitulos');
    if (filtroInativosChk) {
        filtroInativosChk.addEventListener('change', function() {
            incluirInativos = !!this.checked;
            paginaAtual = 1;
            atualizarTabelaTitulos();
        });
    }

    function titulosFiltrados() {
        let lista = baseTitulos.map(t => ({ ...t, status: t.status || 'Rascunho' }));
        if (!incluirInativos) {
            lista = lista.filter(t => !t.inativo);
        }
        if (statusFiltroAtual) lista = lista.filter(t => t.status === statusFiltroAtual);
        if (termoBusca.trim()) {
            const q = termoBusca.toLowerCase();
            lista = lista.filter(t =>
                (t.idProc && t.idProc.toLowerCase().includes(q)) ||
                (t.fornecedor && t.fornecedor.toLowerCase().includes(q)) ||
                (t.numTC && t.numTC.toLowerCase().includes(q)) ||
                ((t.empenhosVinculados || []).some(v => (v.numEmpenho || '').toLowerCase().includes(q)))
            );
        }
        const { coluna, direcao } = estadoOrdenacao;
        lista.sort((a, b) => {
            let va = a[coluna] != null ? String(a[coluna]).toLowerCase() : '';
            let vb = b[coluna] != null ? String(b[coluna]).toLowerCase() : '';
            if (coluna === 'valorNotaFiscal') { va = Number(a.valorNotaFiscal) || 0; vb = Number(b.valorNotaFiscal) || 0; return direcao === 'asc' ? va - vb : vb - va; }
            const cmp = va.localeCompare(vb);
            return direcao === 'asc' ? cmp : -cmp;
        });
        return lista;
    }

    function atualizarTabelaTitulos() {
        const tbody = document.getElementById('tbody-titulos');
        if (!tbody) return;
        tbody.innerHTML = '';
        const lista = titulosFiltrados();
        const inicio = (paginaAtual - 1) * itensPorPagina;
        const fim = inicio + parseInt(itensPorPagina);
        const itens = lista.slice(inicio, fim);

        if (itens.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;">Nenhum título encontrado.</td></tr>';
        } else {
            itens.forEach(t => {
                const status = t.status || 'Rascunho';
                const badgeCls = STATUS_CSS[status] || 'badge-rascunho';
                const tr = document.createElement('tr');
                let acoes = gerarBotoesAcao(t.id, 'titulo');
                if (typeof permissoesEmCache !== 'undefined') {
                    if (permissoesEmCache.includes('titulos_ler')) {
                        acoes = `<button type="button" class="btn-icon btn-ver-titulo" data-id="${escapeHTML(t.id)}" title="Ver TC">👁️</button>` + acoes;
                    }
                    if (permissoesEmCache.includes('titulos_inativar')) {
                        const estaInativo = !!t.inativo;
                        const icon = estaInativo ? '✅' : '🚫';
                        const title = estaInativo ? 'Ativar TC' : 'Inativar TC';
                        acoes += `<button type="button" class="btn-icon btn-toggle-ativo-titulo" data-id="${escapeHTML(t.id)}" title="${title}">${icon}</button>`;
                    }
                    if (permissoesEmCache.includes('titulos_pdf')) {
                        acoes += `<button type="button" class="btn-icon btn-pdf-titulo" data-id="${escapeHTML(t.id)}" title="Gerar PDF">📄</button>`;
                    }
                    if (status === 'Devolvido') {
                        acoes += `<button type="button" class="btn-icon btn-nova-entrada-titulo" data-id="${escapeHTML(t.id)}" title="Dar nova entrada">↪</button>`;
                    }
                }
                const checked = titulosSelecionados.has(t.id) ? ' checked' : '';
                tr.innerHTML = `<td><input type="checkbox" class="check-tc check-titulo" data-id="${escapeHTML(t.id)}"${checked}></td>
                    <td><strong>${escapeHTML(t.idProc || '-')}</strong></td>
                    <td>${escapeHTML(t.numTC || '-')}</td>
                    <td>${escapeHTML((t.fornecedor || '').substring(0, 40))}${(t.fornecedor || '').length > 40 ? '...' : ''}</td>
                    <td>R$ ${escapeHTML(typeof formatarMoedaBR === 'function' ? formatarMoedaBR(t.valorNotaFiscal || 0) : String(t.valorNotaFiscal || '0.00'))}</td>
                    <td><span class="badge-status ${badgeCls}">${escapeHTML(status)}</span></td>
                    <td>${acoes}</td>`;
                tbody.appendChild(tr);
            });
        }

        const total = Math.ceil(lista.length / itensPorPagina) || 1;
        const info = document.getElementById('infoPagina');
        if (info) info.textContent = `${paginaAtual} de ${total}`;
        const mostrandoDe = document.getElementById('mostrandoDe');
        const mostrandoTotal = document.getElementById('mostrandoTotal');
        if (mostrandoDe) mostrandoDe.textContent = itens.length;
        if (mostrandoTotal) mostrandoTotal.textContent = lista.length;
        const btnPrimeira = document.getElementById('btnPrimeira');
        const btnAnt = document.getElementById('btnAnterior');
        const btnProx = document.getElementById('btnProximo');
        const btnUltima = document.getElementById('btnUltima');
        if (btnPrimeira) btnPrimeira.disabled = paginaAtual <= 1;
        if (btnAnt) btnAnt.disabled = paginaAtual <= 1;
        if (btnProx) btnProx.disabled = paginaAtual >= total;
        if (btnUltima) btnUltima.disabled = paginaAtual >= total;

        tbody.querySelectorAll('.btn-ver-titulo').forEach(btn => btn.addEventListener('click', () => visualizarTitulo(btn.getAttribute('data-id'))));
        tbody.querySelectorAll('.btn-editar-titulo').forEach(btn => btn.addEventListener('click', () => editarTitulo(btn.getAttribute('data-id'))));
        tbody.querySelectorAll('.btn-nova-entrada-titulo').forEach(btn => btn.addEventListener('click', () => { editarTitulo(btn.getAttribute('data-id')); }));
        tbody.querySelectorAll('.btn-apagar-titulo').forEach(btn => btn.addEventListener('click', () => apagarTitulo(btn.getAttribute('data-id'))));
        tbody.querySelectorAll('.btn-toggle-ativo-titulo').forEach(btn => btn.addEventListener('click', () => toggleInativoTitulo(btn.getAttribute('data-id'))));
        tbody.querySelectorAll('.btn-pdf-titulo').forEach(btn => btn.addEventListener('click', () => gerarPDFTitulo(btn.getAttribute('data-id'))));
        tbody.querySelectorAll('.check-titulo').forEach(cb => cb.addEventListener('change', function() {
            const id = this.getAttribute('data-id');
            if (this.checked) titulosSelecionados.add(id); else titulosSelecionados.delete(id);
            atualizarUIselecao();
        }));
    }

    document.getElementById('checkTodos')?.addEventListener('change', function() {
        const ids = titulosFiltrados().slice((paginaAtual - 1) * itensPorPagina, paginaAtual * itensPorPagina).map(t => t.id);
        if (this.checked) ids.forEach(id => titulosSelecionados.add(id));
        else ids.forEach(id => titulosSelecionados.delete(id));
        atualizarTabelaTitulos();
        atualizarUIselecao();
    });

    function atualizarUIselecao() {
        const container = document.getElementById('containerSelecaoMultipla');
        const count = document.getElementById('countSelecionados');
        if (container && count) {
            const n = titulosSelecionados.size;
            container.style.display = n > 0 ? 'block' : 'none';
            count.textContent = n;
        }
    }

    window.mudarTamanhoPagina = function() {
        itensPorPagina = parseInt(document.getElementById('itensPorPagina')?.value || 10);
        paginaAtual = 1;
        atualizarTabelaTitulos();
    };

    window.mudarPagina = function(dir) {
        paginaAtual += dir;
        atualizarTabelaTitulos();
    };

    window.irParaPrimeiraPagina = function() {
        paginaAtual = 1;
        atualizarTabelaTitulos();
    };

    window.irParaUltimaPagina = function() {
        const lista = titulosFiltrados();
        const total = Math.ceil(lista.length / itensPorPagina) || 1;
        paginaAtual = total;
        atualizarTabelaTitulos();
    };

    // Visualização simples (usa o mesmo fluxo de edição por enquanto)
    function visualizarTitulo(id) {
        editarTitulo(id);
    }

    document.getElementById('buscaTabelaTitulos')?.addEventListener('input', debounce(() => {
        termoBusca = document.getElementById('buscaTabelaTitulos').value || '';
        paginaAtual = 1;
        atualizarTabelaTitulos();
    }));

    function gerarNovoIDProc() {
        const numeros = baseTitulos.map(t => parseInt((t.idProc || '0').split('-')[1]) || 0);
        const max = numeros.length ? Math.max(...numeros) : 0;
        return 'PROC-' + String(max + 1).padStart(3, '0');
    }

    window.abrirFormularioTitulo = function() {
        document.getElementById('formTitulo')?.reset();
        document.getElementById('editIndexTitulo').value = '-1';
        document.getElementById('idProc').value = '';
        document.getElementById('anoTC').value = '2026';
        document.getElementById('ugTC').value = '741000';
        document.getElementById('tipoTC').value = '';
        limparOISelecionada();
        document.getElementById('oiEntregou').value = '';
        document.getElementById('fornecedorValor').value = '';
        document.getElementById('contratoIdSelecionado').value = '';
        limparFornecedorSelecionado();
        empenhosDaNotaAtual = [];
        tributacoesAtual = [];
        desenharEmpenhosNota();
        desenharTributacoes();
        mostrarStepper('Rascunho');
        ativarTab(0);
        bloquearTabsPorStatus('Rascunho');
        const tituloEl = document.getElementById('tituloFormTC');
        if (tituloEl) tituloEl.textContent = 'Entrada de Título de Crédito';
        setCamposDadosBasicosHabilitados(true);
        atualizarBotoesAbaDadosBasicos(false);
        atualizarBotoesFormulario('Rascunho', false);
        const dataExefinEl = document.getElementById('dataExefin');
        if (dataExefinEl && !dataExefinEl.value) dataExefinEl.value = new Date().toISOString().slice(0, 10);
        document.getElementById('tela-lista-titulos').style.display = 'none';
        document.getElementById('tela-formulario-titulos').style.display = 'block';
    };

    window.voltarParaListaTitulos = function() {
        document.getElementById('tela-formulario-titulos').style.display = 'none';
        document.getElementById('tela-lista-titulos').style.display = 'block';
    };

    /** Habilita ou desabilita os campos da aba Dados Básicos (exceto Observações, Ano, UG). */
    function setCamposDadosBasicosHabilitados(habilitado) {
        const ids = ['tipoTC', 'dataExefin', 'buscaOIT', 'buscaFornecedorT', 'contratoSelecionado', 'numTC', 'valorNotaFiscal', 'dataEmissao', 'dataAteste'];
        ids.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.disabled = !habilitado;
        });
        const limparOIBtn = document.getElementById('limparOIBtn');
        if (limparOIBtn) limparOIBtn.disabled = !habilitado;
        const limparFornecedorBtn = document.getElementById('limparFornecedorBtn');
        if (limparFornecedorBtn) limparFornecedorBtn.disabled = !habilitado;
    }

    /** Exibe/oculta botões Editar Aba e Salvar Aba na aba Dados Básicos (apenas quando TC já salvo). */
    function atualizarBotoesAbaDadosBasicos(emEdicao) {
        const container = document.getElementById('acoesAbaDadosBasicos');
        const btnEditar = document.getElementById('btnEditarAbaDadosBasicos');
        const btnSalvar = document.getElementById('btnSalvarAbaDadosBasicos');
        const fbID = document.getElementById('editIndexTitulo')?.value || '';
        const ehEdicao = (fbID !== '-1' && fbID !== '');
        if (!container || !btnEditar || !btnSalvar) return;
        if (!ehEdicao) {
            container.style.display = 'none';
            setCamposDadosBasicosHabilitados(true);
            return;
        }
        container.style.display = 'flex';
        if (emEdicao) {
            btnEditar.style.display = 'none';
            btnSalvar.style.display = 'inline-block';
            setCamposDadosBasicosHabilitados(true);
        } else {
            btnEditar.style.display = 'inline-block';
            btnSalvar.style.display = 'none';
            setCamposDadosBasicosHabilitados(false);
        }
    }

    function mostrarStepper(status) {
        const container = document.getElementById('stepperTC');
        if (!container) return;
        const idx = STATUS_ORDEM.indexOf(status);
        container.innerHTML = STATUS_ORDEM.filter(s => s !== 'Devolvido').map((s, i) => {
            let cls = 'bloqueado';
            if (s === status) cls = 'ativo';
            else if (i < idx) cls = 'concluido';
            return `<span class="${cls}">${s}</span>`;
        }).join('');
    }

    function bloquearTabsPorStatus(status) {
        const idx = STATUS_ORDEM.indexOf(status);
        if (idx < 0) return;
        document.querySelectorAll('.tab-tc').forEach((tab, i) => {
            const isBloqueado = (status === 'Devolvido' && i < 4) || (status !== 'Devolvido' && i > idx + 1);
            tab.classList.toggle('bloqueado', isBloqueado);
            tab.style.pointerEvents = isBloqueado ? 'none' : '';
        });
        const tcSalvo = (document.getElementById('editIndexTitulo')?.value || '') !== '-1' && (document.getElementById('editIndexTitulo')?.value || '') !== '';
        atualizarBotoesFormulario(status, tcSalvo);
    }

    /** Mostra/oculta Enviar para Processamento, Devolver, Dar nova entrada */
    function atualizarBotoesFormulario(status, tcSalvo) {
        const btnDevolver = document.getElementById('btnDevolver');
        const btnEnviar = document.getElementById('btnEnviarProcessamento');
        const btnNovaEntrada = document.getElementById('btnDarNovaEntrada');
        if (btnDevolver) btnDevolver.style.display = (tcSalvo && status !== 'Devolvido') ? 'inline-block' : 'none';
        if (btnEnviar) btnEnviar.style.display = (tcSalvo && status === 'Rascunho') ? 'inline-block' : 'none';
        if (btnNovaEntrada) btnNovaEntrada.style.display = (status === 'Devolvido') ? 'inline-block' : 'none';
    }

    function ativarTab(i) {
        document.querySelectorAll('.tab-tc').forEach((t, j) => t.classList.toggle('ativo', j === i));
        document.querySelectorAll('.tab-panel-tc').forEach((p, j) => p.classList.toggle('visivel', j === i));
    }

    document.querySelectorAll('.tab-tc').forEach(tab => {
        tab.addEventListener('click', function() {
            if (this.classList.contains('bloqueado')) return;
            ativarTab(parseInt(this.getAttribute('data-tab') || 0));
        });
    });

    function labelCentroCustos(id) {
        if (!id) return '-';
        const c = (listaCentroCustos || []).find(x => x.id === id);
        return c ? (c.codigo || '-') + ' - ' + (c.descricao || c.aplicacao || '') : id;
    }
    function labelUG(id) {
        if (!id) return '-';
        const u = (listaUG || []).find(x => x.id === id);
        return u ? (u.codigo || '-') + ' - ' + (u.nome || '') : id;
    }

    function desenharEmpenhosNota() {
        const tbody = document.getElementById('tbodyEmpenhosNota');
        if (!tbody) return;
        tbody.innerHTML = '';
        empenhosDaNotaAtual.forEach((v, i) => {
            const tr = document.createElement('tr');
            tr.innerHTML = `<td title="NE: ${escapeHTML(v.numEmpenho || '')} | PTRES: ${escapeHTML(v.ptres || '-')} | FR: ${escapeHTML(v.fr || '-')}">${escapeHTML(typeof formatarNumEmpenhoVisivel === 'function' ? formatarNumEmpenhoVisivel(v.numEmpenho) : (v.numEmpenho || '-'))}</td>
                <td>${escapeHTML(v.nd || '-')}</td>
                <td>${escapeHTML(v.subelemento || '-')}</td>
                <td>R$ ${escapeHTML(typeof formatarMoedaBR === 'function' ? formatarMoedaBR(v.valorVinculado || 0) : (v.valorVinculado || '0'))}</td>
                <td title="${escapeHTML(labelCentroCustos(v.centroCustosId))}">${escapeHTML((labelCentroCustos(v.centroCustosId) || '-').substring(0, 25))}${(labelCentroCustos(v.centroCustosId) || '').length > 25 ? '...' : ''}</td>
                <td title="${escapeHTML(labelUG(v.ugId))}">${escapeHTML((labelUG(v.ugId) || '-').substring(0, 25))}${(labelUG(v.ugId) || '').length > 25 ? '...' : ''}</td>
                <td>
                    <button type="button" class="btn-icon btn-editar-ne" data-index="${i}" title="Editar">✏️</button>
                    <button type="button" class="btn-icon btn-rm-ne" data-index="${i}" title="Remover">🗑️</button>
                </td>`;
            tbody.appendChild(tr);
        });

        tbody.querySelectorAll('.btn-editar-ne').forEach(btn => btn.addEventListener('click', function() {
            editarItemEmpenhoNaNota(parseInt(this.getAttribute('data-index'), 10));
        }));
        tbody.querySelectorAll('.btn-rm-ne').forEach(btn => btn.addEventListener('click', function() {
            empenhosDaNotaAtual.splice(parseInt(this.getAttribute('data-index'), 10), 1);
            podeCancelarUltimaInclusaoEmpenhoNota = false;
            const btnUndo = document.getElementById('btnCancelarUltimaInclusaoEmpenhoNota');
            if (btnUndo) btnUndo.style.display = 'none';
            desenharEmpenhosNota();
            atualizarTotaisEmpenhosNota();
        }));

        atualizarTotaisEmpenhosNota();
    }

    function desenharTributacoes() {
        const container = document.getElementById('containerTributacoes');
        if (!container) return;
        container.innerHTML = '';
        tributacoesAtual.forEach((t, i) => {
            const div = document.createElement('div');
            div.className = 'form-row';
            div.innerHTML = `<div class="form-group flex-1"><input type="text" placeholder="Tipo (DARF/INSS/ISS)" value="${escapeHTML(t.tipo || '')}" data-index="${i}" data-field="tipo"></div>
                <div class="form-group flex-1"><input type="number" step="0.01" placeholder="Valor" value="${escapeHTML(t.valor || '')}" data-index="${i}" data-field="valor"></div>
                <div class="form-group" style="flex:0;"><button type="button" class="btn-icon btn-rm-trib" data-index="${i}">🗑️</button></div>`;
            container.appendChild(div);
        });
        container.querySelectorAll('input[data-field]').forEach(inp => inp.addEventListener('change', function() {
            const i = parseInt(this.getAttribute('data-index'));
            const f = this.getAttribute('data-field');
            if (tributacoesAtual[i]) tributacoesAtual[i][f] = this.value;
        }));
        container.querySelectorAll('.btn-rm-trib').forEach(btn => btn.addEventListener('click', function() {
            tributacoesAtual.splice(parseInt(this.getAttribute('data-index')), 1);
            desenharTributacoes();
        }));
    }

    window.adicionarTributacao = function() {
        tributacoesAtual.push({ tipo: '', valor: '' });
        desenharTributacoes();
    };

    let empenhoTemporarioSelecionado = null;
    let indiceEmpenhoEditando = null; // quando != null, o botão "Adicionar" vira "Atualizar"
    let podeCancelarUltimaInclusaoEmpenhoNota = false;

    // Normaliza o modelo interno para persistir sempre `subelemento` (2 dígitos),
    // evitando misturar `subitem` (campo legado).
    function normalizarEmpenhosDaNotaAtualSubelemento() {
        empenhosDaNotaAtual = (empenhosDaNotaAtual || []).map(x => {
            const item = x || {};
            const subelemento = String(item.subelemento || item.subitem || '').trim();
            const { subitem, ...rest } = item; // remove legado se existir
            return { ...rest, subelemento };
        });
    }

    function obterTotalTC() {
        const el = document.getElementById('valorNotaFiscal');
        if (!el) return 0;
        const raw = el.value || '';
        if (typeof valorMoedaParaNumero === 'function') return valorMoedaParaNumero(raw);
        // fallback: 1.234,56 -> 1234.56
        const cleaned = String(raw).replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.');
        const n = parseFloat(cleaned);
        return isNaN(n) ? 0 : n;
    }

    function atualizarTotaisEmpenhosNota() {
        const elTotalVinculado = document.getElementById('totalVinculadoEmpenhos');
        const elTotalATvincular = document.getElementById('totalATvincularEmpenhos');
        if (!elTotalVinculado || !elTotalATvincular) return;

        const totalVinculado = (empenhosDaNotaAtual || []).reduce((acc, x) => acc + (Number(x.valorVinculado || 0) || 0), 0);
        const totalTC = obterTotalTC();
        const totalATvincular = totalTC - totalVinculado;

        if (typeof formatarMoedaBR === 'function') {
            elTotalVinculado.textContent = 'R$ ' + formatarMoedaBR(totalVinculado);
            elTotalATvincular.textContent = 'R$ ' + formatarMoedaBR(totalATvincular);
        } else {
            elTotalVinculado.textContent = 'R$ ' + totalVinculado.toFixed(2);
            elTotalATvincular.textContent = 'R$ ' + totalATvincular.toFixed(2);
        }
    }

    function atualizarBotaoAdicionarEmpenhoNaNota() {
        const btn = document.querySelector('#detalhesVinculoEmpenho button[onclick="adicionarEmpenhoNaNota()"]');
        if (!btn) return;
        btn.textContent = (indiceEmpenhoEditando !== null) ? 'Atualizar item' : 'Adicionar à Lista';
    }

    window.desfazerUltimaInclusaoEmpenhoNota = function() {
        if (!podeCancelarUltimaInclusaoEmpenhoNota) return;
        if (!Array.isArray(empenhosDaNotaAtual) || empenhosDaNotaAtual.length === 0) return;
        empenhosDaNotaAtual.pop();
        podeCancelarUltimaInclusaoEmpenhoNota = false;
        const btnUndo = document.getElementById('btnCancelarUltimaInclusaoEmpenhoNota');
        if (btnUndo) btnUndo.style.display = 'none';
        desenharEmpenhosNota();
        atualizarTotaisEmpenhosNota();
    };

    function editarItemEmpenhoNaNota(indice) {
        const i = Number(indice);
        if (isNaN(i) || i < 0 || i >= (empenhosDaNotaAtual || []).length) return;
        const v = empenhosDaNotaAtual[i];
        if (!v) return;

        indiceEmpenhoEditando = i;
        empenhoTemporarioSelecionado = null; // em modo edição não depende da seleção temporária

        const detalhes = document.getElementById('detalhesVinculoEmpenho');
        if (detalhes) detalhes.style.display = 'block';
        const txt = document.getElementById('empenhoSelecionadoTexto');
        if (txt) txt.textContent =
            'NE: ' + (typeof formatarNumEmpenhoVisivel === 'function' ? formatarNumEmpenhoVisivel(v.numEmpenho) : v.numEmpenho);

        const ndEl = document.getElementById('vinculoND');
        if (ndEl) ndEl.value = v.nd || '';

        const subEl = document.getElementById('vinculoSubelemento');
        if (subEl) {
            const subelemento = String(v.subelemento || v.subitem || '').trim();
            v.subelemento = subelemento;
            if (typeof v.subitem !== 'undefined') delete v.subitem; // evita persistir legado
            subEl.value = subelemento;
        }

        const valorEl = document.getElementById('vinculoValor');
        if (valorEl) {
            valorEl.value = typeof formatarMoedaBR === 'function' ? ('R$ ' + formatarMoedaBR(Number(v.valorVinculado || 0))) : String(v.valorVinculado || 0);
        }

        const cc = document.getElementById('vinculoCentroCustos');
        if (cc) cc.value = v.centroCustosId || '';

        const ug = document.getElementById('vinculoUG');
        if (ug) ug.value = v.ugId || '';

        podeCancelarUltimaInclusaoEmpenhoNota = false;
        const btnUndo = document.getElementById('btnCancelarUltimaInclusaoEmpenhoNota');
        if (btnUndo) btnUndo.style.display = 'none';
        atualizarBotaoAdicionarEmpenhoNaNota();
    }

    /** Fornecedores únicos da coleção contratos */
    function fornecedoresUnicos() {
        const set = new Set();
        baseContratos.forEach(c => {
            const f = (c.fornecedor || c.razaoSocial || c.empresa || '').trim();
            if (f) set.add(f);
        });
        return Array.from(set);
    }

    function mostrarSugestoesFornecedor() {
        const input = document.getElementById('buscaFornecedorT');
        const lista = document.getElementById('listaResultadosFornecedorT');
        if (!input || !lista || input.readOnly) return;
        const texto = (input.value || '').trim().toLowerCase();
        const textoSemAcento = removerAcentos(texto);
        lista.innerHTML = '';
        if (texto.length < 2) return;
        const fornecedores = fornecedoresUnicos().filter(f => removerAcentos(f).toLowerCase().includes(textoSemAcento));
        if (fornecedores.length === 0) {
            lista.innerHTML = '<li style="padding:10px; color:#777; font-size:12px;">Nenhum fornecedor encontrado.</li>';
        } else {
            fornecedores.forEach(forn => {
                const li = document.createElement('li');
                li.textContent = forn;
                li.addEventListener('mousedown', (e) => {
                    e.preventDefault();
                    selecionarFornecedor(forn);
                    input.value = '';
                    lista.innerHTML = '';
                });
                lista.appendChild(li);
            });
        }
    }

    function selecionarFornecedor(fornecedor) {
        document.getElementById('fornecedorValor').value = fornecedor || '';
        const input = document.getElementById('buscaFornecedorT');
        if (input) { input.value = fornecedor || ''; input.readOnly = true; }
        const btn = document.getElementById('limparFornecedorBtn');
        if (btn) btn.style.display = fornecedor ? 'block' : 'none';
        document.getElementById('contratoIdSelecionado').value = '';
        const sel = document.getElementById('contratoSelecionado');
        if (sel) {
            sel.disabled = !fornecedor;
            sel.innerHTML = '<option value="">Selecione o contrato</option>';
            if (fornecedor) {
                const contratosDoFornecedor = baseContratos.filter(c => (c.fornecedor || c.razaoSocial || c.empresa || '').trim() === fornecedor);
                contratosDoFornecedor.forEach(c => {
                    const opt = document.createElement('option');
                    opt.value = c.id;
                    opt.textContent = c.numContrato || c.instrumento || '-';
                    sel.appendChild(opt);
                });
            }
        }
        preencherDadosContrato(null);
    }

    window.limparFornecedorSelecionado = function() {
        document.getElementById('fornecedorValor').value = '';
        const input = document.getElementById('buscaFornecedorT');
        if (input) { input.value = ''; input.readOnly = false; }
        const btn = document.getElementById('limparFornecedorBtn');
        if (btn) btn.style.display = 'none';
        document.getElementById('contratoIdSelecionado').value = '';
        const sel = document.getElementById('contratoSelecionado');
        if (sel) {
            sel.innerHTML = '<option value="">Selecione o fornecedor primeiro</option>';
            sel.disabled = true;
        }
        preencherDadosContrato(null);
    };

    function preencherDadosContrato(contrato) {
        const fmtMoeda = (v) => typeof formatarMoedaBR === 'function' ? formatarMoedaBR(v || 0) : String(v || '');
        const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
        if (!contrato) {
            set('valorContrato', '');
            const rcS = document.getElementById('rcSelecionada');
            if (rcS) { rcS.innerHTML = '<option value="">Selecione o contrato</option>'; }
            set('inicioVigencia', '');
            set('fimVigencia', '');
            set('fiscalContrato', '');
            set('contatoFiscal', '');
            const av = document.getElementById('avisoVigenciaContrato');
            if (av) av.style.display = 'none';
            return;
        }
        set('valorContrato', contrato.valorContrato ? ('R$ ' + fmtMoeda(contrato.valorContrato)) : '');
        const rcs = Array.isArray(contrato.rcs) ? contrato.rcs : [];
        const rcS = document.getElementById('rcSelecionada');
        if (rcS) {
            rcS.innerHTML = rcs.length ? rcs.map(r => '<option value="' + escapeHTML(r) + '">' + escapeHTML(r) + '</option>').join('') : '<option value="">Sem RC</option>';
        }
        const toYYYYMMDD = (d) => {
            if (!d) return '';
            const s = String(d).trim();
            if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
            const m = s.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
            if (m) return m[3].length === 2 ? '20' + m[3] + '-' + m[2].padStart(2,'0') + '-' + m[1].padStart(2,'0') : m[3] + '-' + m[2].padStart(2,'0') + '-' + m[1].padStart(2,'0');
            return s;
        };
        set('inicioVigencia', toYYYYMMDD(contrato.dataInicio));
        set('fimVigencia', toYYYYMMDD(contrato.dataFim));
        set('fiscalContrato', contrato.fiscal || contrato.fiscalContrato || '');
        set('contatoFiscal', contrato.contatoFiscal || contrato.contato_fiscal || '');
        const aviso = document.getElementById('avisoVigenciaContrato');
        const dataEmissao = (document.getElementById('dataEmissao').value || document.getElementById('dataExefin').value || '').trim();
        if (aviso && dataEmissao && contrato.dataInicio && contrato.dataFim) {
            const base = new Date(dataEmissao);
            const dIni = new Date(contrato.dataInicio);
            const dFim = new Date(contrato.dataFim);
            aviso.style.display = (base < dIni || base > dFim) ? 'block' : 'none';
            aviso.textContent = (base < dIni || base > dFim) ? 'Atenção: este TC está fora da vigência do contrato.' : '';
        } else if (aviso) aviso.style.display = 'none';
    }

    function configurarSelectContrato() {
        const sel = document.getElementById('contratoSelecionado');
        if (!sel || sel.dataset.bound === '1') return;
        sel.dataset.bound = '1';
        sel.addEventListener('change', function() {
            const id = this.value;
            document.getElementById('contratoIdSelecionado').value = id || '';
            const c = id ? baseContratos.find(x => x.id === id) : null;
            preencherDadosContrato(c);
        });
    }

    function configurarAutocompleteFornecedor() {
        const input = document.getElementById('buscaFornecedorT');
        const lista = document.getElementById('listaResultadosFornecedorT');
        if (!input || !lista || input.dataset.autocompleteBound === '1') return;
        input.dataset.autocompleteBound = '1';
        input.addEventListener('input', debounce(mostrarSugestoesFornecedor, 300));
        input.addEventListener('focus', function() { if (!this.readOnly && (this.value || '').trim().length >= 2) mostrarSugestoesFornecedor(); });
        input.addEventListener('blur', () => { setTimeout(() => { if (lista) lista.innerHTML = ''; }, 200); });
    }

    function mostrarSugestoesEmpenho() {
        const inputBuscaEmpenhoT = document.getElementById('buscaEmpenhoT');
        const listaEmpenhosT = document.getElementById('listaResultadosEmpenhoT');
        if (!inputBuscaEmpenhoT || !listaEmpenhosT) return;
        const texto = (inputBuscaEmpenhoT.value || '').trim();
        const textoNorm = removerAcentos(texto).toLowerCase();

        listaEmpenhosT.innerHTML = '';
        listaEmpenhosT.style.display = '';

        // Filtro 1: mínimo de 4 caracteres (alfanuméricos) para aparecer resultados.
        if (textoNorm.length < 4) {
            listaEmpenhosT.innerHTML = '<li style="padding:10px; color:#777; font-size:12px;">Digite 4+ dígitos</li>';
            return;
        }

        const contratoId = (document.getElementById('contratoIdSelecionado')?.value || '').trim();
        const contratoSel = contratoId ? baseContratos.find(c => c.id === contratoId) : null;
        if (!contratoSel) {
            listaEmpenhosT.innerHTML = '<li style="padding:10px; color:#777; font-size:12px;">Selecione um Contrato para filtrar as NE.</li>';
            return;
        }

        const tipoTC = (document.getElementById('tipoTC')?.value || '').trim();
        if (!tipoTC) {
            listaEmpenhosT.innerHTML = '<li style="padding:10px; color:#777; font-size:12px;">Selecione o Tipo de TC para filtrar as NE.</li>';
            return;
        }

        // Filtro 2: CNPJ do contrato vem do campo "fornecedor" (CNPJ + Nome).
        const normalizarCNPJ = (v) => String(v || '').replace(/\D/g, '').trim();
        const cnpjContrato = normalizarCNPJ(contratoSel.fornecedor || contratoSel.razaoSocial || '');
        if (!cnpjContrato) {
            listaEmpenhosT.innerHTML = '<li style="padding:10px; color:#777; font-size:12px;">CNPJ do contrato inválido.</li>';
            return;
        }

        // Valida o ND: se estiver vazio/inválido, a NE deve sumir (mesmo em "Outro").
        const ndValido = (nd) => {
            const s = String(nd || '').trim();
            return s.length > 0 && /^\d+$/.test(s);
        };

        const devePassarND = (nd) => {
            if (!ndValido(nd)) return false;
            const s = String(nd).trim();
            const ult2 = s.slice(-2);
            if (tipoTC === 'NFE') return (ult2 === '30' || ult2 === '52');
            // NFS-e / FAT / BO
            if (tipoTC === 'NFSE' || tipoTC === 'FAT' || tipoTC === 'BO') return ult2 === '39';
            // OUT: ignora filtro do ND, mas ainda exige ND válido (já checado).
            if (tipoTC === 'OUT') return true;
            return false;
        };

        const visivelNE = (e) => {
            const num = String(e.numEmpenho || e.numNE || '').trim();
            if (typeof formatarNumEmpenhoVisivel === 'function') return String(formatarNumEmpenhoVisivel(num) || '').toLowerCase();
            return num.slice(-12).toLowerCase();
        };

        const resultados = (baseEmpenhos || [])
            .filter(e => {
                const cnpjNE = normalizarCNPJ(e.cnpj || '');
                if (!cnpjNE) return false;
                if (cnpjNE !== cnpjContrato) return false;
                if (!devePassarND(e.nd)) return false;
                // Filtro 1 baseado no sufixo visível da NE
                return visivelNE(e).includes(textoNorm);
            })
            .slice(0, 15);

        if (resultados.length === 0) {
            listaEmpenhosT.innerHTML = '<li style="padding:10px; color:#777; font-size:12px;">Nenhuma NE encontrada para os filtros atuais.</li>';
            return;
        }

        resultados.forEach(e => {
            const li = document.createElement('li');
            const numNE = e.numEmpenho || e.numNE || '-';
            li.innerHTML =
                '<strong>' + (typeof formatarNumEmpenhoVisivel === 'function' ? formatarNumEmpenhoVisivel(numNE) : escapeHTML(numNE)) + '</strong> | ' +
                escapeHTML(e.tipoNE || '-') + ' | ' +
                escapeHTML((e.favorecido || '').substring(0, 30)) + ((e.favorecido || '').length > 30 ? '...' : '') + ' | ' +
                'PTRES: ' + escapeHTML(e.ptres || '-') + ' | ' +
                'FR: ' + escapeHTML(e.fr || '-');

            li.addEventListener('mousedown', (ev) => {
                ev.preventDefault();
                empenhoTemporarioSelecionado = e;
                document.getElementById('detalhesVinculoEmpenho').style.display = 'block';
                document.getElementById('empenhoSelecionadoTexto').textContent =
                    'NE: ' + (typeof formatarNumEmpenhoVisivel === 'function' ? formatarNumEmpenhoVisivel(numNE) : numNE);
                const ndEl = document.getElementById('vinculoND');
                if (ndEl) ndEl.value = e.nd || '';
                const subEl = document.getElementById('vinculoSubelemento');
                if (subEl) subEl.value = (e.subitem || e.subelemento || '').trim();
                document.getElementById('vinculoValor').value = '';
                const cc = document.getElementById('vinculoCentroCustos');
                if (cc) cc.value = '';
                const ug = document.getElementById('vinculoUG');
                if (ug) ug.value = '';
                // Em modo de seleção/novo item: desfaz qualquer edição anterior e esconde "cancelar inclusão".
                indiceEmpenhoEditando = null;
                podeCancelarUltimaInclusaoEmpenhoNota = false;
                const btnUndo = document.getElementById('btnCancelarUltimaInclusaoEmpenhoNota');
                if (btnUndo) btnUndo.style.display = 'none';
                atualizarBotaoAdicionarEmpenhoNaNota();
                listaEmpenhosT.innerHTML = '';
                inputBuscaEmpenhoT.value = '';
            });
            listaEmpenhosT.appendChild(li);
        });
    }
    function configurarAutocompleteEmpenho() {
        const inputBuscaEmpenhoT = document.getElementById('buscaEmpenhoT');
        const listaEmpenhosT = document.getElementById('listaResultadosEmpenhoT');
        if (!inputBuscaEmpenhoT || !listaEmpenhosT || inputBuscaEmpenhoT.dataset.autocompleteBound === '1') return;
        inputBuscaEmpenhoT.dataset.autocompleteBound = '1';
        inputBuscaEmpenhoT.addEventListener('input', debounce(mostrarSugestoesEmpenho, 300));
        inputBuscaEmpenhoT.addEventListener('focus', function() { mostrarSugestoesEmpenho(); });
        inputBuscaEmpenhoT.addEventListener('blur', () => { setTimeout(() => { if (listaEmpenhosT) listaEmpenhosT.innerHTML = ''; }, 200); });
    }

    window.adicionarEmpenhoNaNota = function() {
        const editando = (indiceEmpenhoEditando !== null && indiceEmpenhoEditando !== undefined);
        const nd = (document.getElementById('vinculoND')?.value || '').trim();
        const subelemento = (document.getElementById('vinculoSubelemento')?.value || '').trim();
        const valorInput = document.getElementById('vinculoValor')?.value;
        const centroCustosId = (document.getElementById('vinculoCentroCustos')?.value || '').trim();
        const ugId = (document.getElementById('vinculoUG')?.value || '').trim();
        if (!/^\d{2}$/.test(subelemento)) return alert("Subelemento deve ter exatamente 2 dígitos numéricos.");
        if (!valorInput) return alert("Informe o valor utilizado.");
        const valorNum = typeof valorMoedaParaNumero === 'function' ? valorMoedaParaNumero(valorInput) : (parseFloat(String(valorInput).replace(/\./g,'').replace(',','.')) || 0);
        if (valorNum < 0.01) return alert("Valor utilizado deve ser no mínimo R$ 0,01.");
        const valorTC = typeof valorMoedaParaNumero === 'function' ? valorMoedaParaNumero(document.getElementById('valorNotaFiscal')?.value) : (parseFloat(document.getElementById('valorNotaFiscal')?.value) || 0);
        if (valorTC > 0 && valorNum > valorTC) return alert("Valor utilizado não pode ser maior que o valor do TC (R$ " + (typeof formatarMoedaBR === 'function' ? formatarMoedaBR(valorTC) : valorTC.toFixed(2)) + ").");
        if (!centroCustosId) return alert("Selecione o Centro de Custos.");
        if (!ugId) return alert("Selecione a UG Beneficiária.");

        // Modo edição: atualiza o item existente (valor, centro de custos, UG).
        if (editando) {
            const idx = indiceEmpenhoEditando;
            if (!empenhosDaNotaAtual[idx]) return;
            empenhosDaNotaAtual[idx].valorVinculado = valorNum;
            empenhosDaNotaAtual[idx].centroCustosId = centroCustosId;
            empenhosDaNotaAtual[idx].ugId = ugId;
            // nd e subelemento são derivados da NE (não mudam aqui).
            indiceEmpenhoEditando = null;
            podeCancelarUltimaInclusaoEmpenhoNota = false;
            const btnUndo = document.getElementById('btnCancelarUltimaInclusaoEmpenhoNota');
            if (btnUndo) btnUndo.style.display = 'none';
            desenharEmpenhosNota();
            document.getElementById('detalhesVinculoEmpenho').style.display = 'none';
            atualizarBotaoAdicionarEmpenhoNaNota();
            return;
        }

        if (!empenhoTemporarioSelecionado) return alert("Selecione uma NE na busca.");
        empenhosDaNotaAtual.push({
            numEmpenho: empenhoTemporarioSelecionado.numEmpenho || empenhoTemporarioSelecionado.numNE,
            ptres: empenhoTemporarioSelecionado.ptres || '',
            fr: empenhoTemporarioSelecionado.fr || '',
            nd: nd || empenhoTemporarioSelecionado.nd || '',
            subelemento: subelemento,
            valorVinculado: valorNum,
            centroCustosId: centroCustosId,
            ugId: ugId,
            // LF/PF são preenchidos em outro painel (após NP vinculada).
            lf: '',
            pf: ''
        });

        podeCancelarUltimaInclusaoEmpenhoNota = true;
        const btnUndo = document.getElementById('btnCancelarUltimaInclusaoEmpenhoNota');
        if (btnUndo) btnUndo.style.display = 'inline-block';
        indiceEmpenhoEditando = null;
        desenharEmpenhosNota();
        document.getElementById('detalhesVinculoEmpenho').style.display = 'none';
        atualizarBotaoAdicionarEmpenhoNaNota();
    };

    function editarTitulo(id) {
        const t = baseTitulos.find(x => x.id === id);
        if (!t) return;
        abrirFormularioTitulo();
        document.getElementById('editIndexTitulo').value = t.id;
        document.getElementById('idProc').value = t.idProc || '';
        const tituloEl = document.getElementById('tituloFormTC');
        if (tituloEl && t.idProc) tituloEl.textContent = t.idProc + ' - Entrada de Título de Crédito';
        document.getElementById('anoTC').value = t.ano || '2026';
        document.getElementById('ugTC').value = t.ug || '741000';
        const selTipoTC = document.getElementById('tipoTC');
        if (selTipoTC) {
            const tiposValidos = Array.from(selTipoTC.options || []).map(o => o.value);
            selTipoTC.value = (t.tipoTC && tiposValidos.includes(t.tipoTC)) ? t.tipoTC : '';
        }
        document.getElementById('dataExefin').value = t.dataExefin || '';
        document.getElementById('numTC').value = t.numTC || '';
        const valNF = parseFloat(t.valorNotaFiscal) || 0;
        document.getElementById('valorNotaFiscal').value = typeof formatarMoedaBR === 'function' ? ('R$ ' + formatarMoedaBR(valNF)) : (t.valorNotaFiscal || '');
        document.getElementById('dataEmissao').value = t.dataEmissao || '';
        document.getElementById('dataAteste').value = t.dataAteste || '';
        if (t.fornecedor) {
            selecionarFornecedor(t.fornecedor);
            const contratoLigado = baseContratos.find(c => (c.numContrato || c.instrumento || '') === (t.instrumento || '') && (c.fornecedor || c.razaoSocial || c.empresa || '').trim() === t.fornecedor);
            if (contratoLigado) {
                document.getElementById('contratoIdSelecionado').value = contratoLigado.id;
                const sel = document.getElementById('contratoSelecionado');
                if (sel) {
                    sel.value = contratoLigado.id;
                    preencherDadosContrato(contratoLigado);
                    const rcEl = document.getElementById('rcSelecionada');
                    if (rcEl && t.rc) rcEl.value = t.rc;
                }
            }
        }
        const obsEl = document.getElementById('observacoesTC');
        if (obsEl) obsEl.value = t.observacoes || '';
        document.getElementById('oiEntregou').value = t.oiEntregou || '';
        if (t.oiEntregou) {
            const o = listaOI.find(x => x.id === t.oiEntregou);
            if (o) {
                const txt = (o.numeroOI || '') + ' - ' + (o.nomeOI || '');
                const elOI = document.getElementById('buscaOIT');
                if (elOI) { elOI.value = txt; elOI.readOnly = true; }
                const btnOI = document.getElementById('limparOIBtn');
                if (btnOI) btnOI.style.display = 'block';
            }
        }
        document.getElementById('np').value = t.np || '';
        document.getElementById('dataLiquidacao').value = t.dataLiquidacao || '';
        document.getElementById('op').value = t.op || '';
        empenhosDaNotaAtual = (t.empenhosVinculados || []).map(x => ({ ...x }));
        normalizarEmpenhosDaNotaAtualSubelemento();
        tributacoesAtual = (t.tributacoes || []).map(x => ({ ...x }));
        const status = t.status || 'Rascunho';
        mostrarStepper(status);
        bloquearTabsPorStatus(status);
        desenharEmpenhosNota();
        desenharTributacoes();
        desenharAuditoria(t.historicoStatus || []);
        desenharLiquidacao();
        desenharFinanceiro();
        atualizarBotoesAbaDadosBasicos(false);
    }

    function desenharLiquidacao() {
        const tbody = document.getElementById('tbodyLiquidacao');
        if (!tbody) return;
        tbody.innerHTML = '';
        const lfAtivas = (baseLfPf || []).filter(r => r.ativo !== false);
        (empenhosDaNotaAtual || []).forEach((v, i) => {
            const tr = document.createElement('tr');
            const ccLabel = labelCentroCustos(v.centroCustosId);
            const ugLabel = labelUG(v.ugId);
            const opts = lfAtivas.map(r => {
                const lfVal = r.lf || '';
                const sel = (v.lf || '') === lfVal ? ' selected' : '';
                return '<option value="' + escapeHTML(lfVal) + '"' + sel + '>' + escapeHTML(lfVal) + '</option>';
            }).join('');
            const selectLf = '<select data-index="' + i + '" data-field="lf" class="select-lf-liquidacao"><option value="">Selecione LF...</option>' + opts + '</select>';
            const lfReg = lfAtivas.find(r => (r.lf || '') === (v.lf || ''));
            const pfExib = lfReg && lfReg.pf ? escapeHTML(lfReg.pf) : (v.pf || '-');
            tr.innerHTML = '<td>' + (typeof formatarNumEmpenhoVisivel === 'function' ? formatarNumEmpenhoVisivel(v.numEmpenho) : (v.numEmpenho || '-')) + '</td>' +
                '<td>' + escapeHTML(v.nd || '-') + '</td>' +
                '<td>R$ ' + (typeof formatarMoedaBR === 'function' ? formatarMoedaBR(v.valorVinculado || 0) : (v.valorVinculado || '0')) + '</td>' +
                '<td>' + escapeHTML(ccLabel) + '</td>' +
                '<td>' + escapeHTML(ugLabel) + '</td>' +
                '<td>' + selectLf + '</td>' +
                '<td class="pf-readonly">' + pfExib + '</td>';
            tbody.appendChild(tr);
        });
        tbody.querySelectorAll('select[data-field="lf"]').forEach(sel => sel.addEventListener('change', function() {
            const idx = parseInt(this.getAttribute('data-index'));
            if (empenhosDaNotaAtual[idx]) {
                empenhosDaNotaAtual[idx].lf = this.value;
                const lfReg = lfAtivas.find(r => (r.lf || '') === this.value);
                empenhosDaNotaAtual[idx].pf = (lfReg && lfReg.pf) ? lfReg.pf : '';
                desenharLiquidacao();
            }
        }));
    }

    function desenharFinanceiro() {
        const tbody = document.getElementById('tbodyLFPF');
        if (!tbody) return;
        tbody.innerHTML = '';
        (empenhosDaNotaAtual || []).forEach((v, i) => {
            const tr = document.createElement('tr');
            const lfExib = v.lf ? escapeHTML(v.lf) : '-';
            tr.innerHTML = '<td>' + (typeof formatarNumEmpenhoVisivel === 'function' ? formatarNumEmpenhoVisivel(v.numEmpenho) : (v.numEmpenho || '-')) + '</td>' +
                '<td>R$ ' + (typeof formatarMoedaBR === 'function' ? formatarMoedaBR(v.valorVinculado || 0) : (v.valorVinculado || '0')) + '</td>' +
                '<td class="lf-readonly">' + lfExib + '</td>' +
                '<td><input type="text" data-index="' + i + '" data-field="pf" value="' + escapeHTML(v.pf || '') + '" placeholder="PF"></td>';
            tbody.appendChild(tr);
        });
        tbody.querySelectorAll('input[data-field="pf"]').forEach(inp => inp.addEventListener('change', function() {
            const idx = parseInt(this.getAttribute('data-index'));
            if (empenhosDaNotaAtual[idx]) empenhosDaNotaAtual[idx].pf = this.value;
        }));
    }

    function desenharAuditoria(historico) {
        const tbody = document.getElementById('tbodyAuditoria');
        if (!tbody) return;
        tbody.innerHTML = '';
        (historico || []).forEach(h => {
            const tr = document.createElement('tr');
            const data = h.data && h.data.toDate ? h.data.toDate().toLocaleString('pt-BR') : (h.data || '-');
            tr.innerHTML = `<td>${escapeHTML(data)}</td><td>${escapeHTML(h.status || h.statusNovo || '-')}</td><td>${escapeHTML(h.usuario || '-')}</td><td>${escapeHTML(h.motivoDevolucao || '-')}</td>`;
            tbody.appendChild(tr);
        });
    }

    function registrarHistorico(tituloId, statusNovo, motivo) {
        return db.collection('titulos').doc(tituloId).get().then(doc => {
            const hist = (doc.data()?.historicoStatus || []);
            hist.push({
                status: statusNovo,
                data: firebase.firestore.Timestamp.now(),
                usuario: usuarioLogadoEmail || '',
                motivoDevolucao: motivo || null
            });
            return db.collection('titulos').doc(tituloId).update({ historicoStatus: hist });
        });
    }

    document.getElementById('formTitulo')?.addEventListener('submit', async function(e) {
        e.preventDefault();
        const fbID = document.getElementById('editIndexTitulo').value;
        const statusAtual = fbID !== '-1' ? (baseTitulos.find(x => x.id === fbID)?.status || 'Rascunho') : 'Rascunho';

        const dataExefin = (document.getElementById('dataExefin').value || '').trim();
        const numTC = (document.getElementById('numTC').value || '').trim();
        const fornecedor = (document.getElementById('fornecedorValor').value || document.getElementById('buscaFornecedorT')?.value || '').trim();
        const contratoId = document.getElementById('contratoIdSelecionado').value || '';
        const contratoSel = baseContratos.find(c => c.id === contratoId);
        const instrumento = contratoSel ? (contratoSel.numContrato || contratoSel.instrumento || '') : '';
        const oiEntregou = (document.getElementById('oiEntregou').value || '').trim();
        const valorVal = typeof valorMoedaParaNumero === 'function'
            ? valorMoedaParaNumero(document.getElementById('valorNotaFiscal').value)
            : (parseFloat(document.getElementById('valorNotaFiscal').value) || 0);
        const dataEmissao = (document.getElementById('dataEmissao').value || '').trim();
        const dataAteste = (document.getElementById('dataAteste').value || '').trim();

        if (!dataExefin) return alert("Preencha a Entrada na EXEFIN.");
        if (!numTC) return alert("Preencha o Número do TC.");
        if (!fornecedor || !instrumento) return alert("Selecione Fornecedor e Contrato.");
        if (!oiEntregou) return alert("Selecione a OI de Origem.");
        const tipoTCVal = (document.getElementById('tipoTC')?.value || '').trim();
        if (!tipoTCVal) return alert("Selecione o Tipo de TC.");
        if (!valorVal || valorVal <= 0) return alert("Preencha o Valor do TC (maior que zero).");
        if (!dataEmissao) return alert("Preencha a Data de Emissão do TC.");
        if (!dataAteste) return alert("Preencha a Data do Ateste.");
        if (dataEmissao && dataAteste) {
            const dEm = new Date(dataEmissao);
            const dAt = new Date(dataAteste);
            const hoje = new Date();
            hoje.setHours(23, 59, 59, 999);
            if (dAt < dEm) return alert("A Data do Ateste deve ser entre a Data de Emissão e hoje.");
            if (dAt > hoje) return alert("A Data do Ateste não pode ser futura.");
        }

        const valorContratoNum = contratoSel && contratoSel.valorContrato ? (parseFloat(contratoSel.valorContrato) || 0) : 0;

        if (statusAtual === 'Em Liquidação') {
            const npVal = (document.getElementById('np')?.value || '').trim();
            if (!npVal) {
                alert("NP (Nota de Pagamento) é obrigatória para salvar quando o TC está em Liquidação.");
                return;
            }
        }

        // Garanto que o modelo interno persista sempre `subelemento` (legado: subitem).
        normalizarEmpenhosDaNotaAtualSubelemento();

        const dados = {
            idProc: escapeHTML(document.getElementById('idProc').value || gerarNovoIDProc()),
            ano: '2026',
            ug: '741000',
            tipoTC: (document.getElementById('tipoTC')?.value || '').trim(),
            dataExefin: escapeHTML(dataExefin),
            numTC: escapeHTML(numTC),
            notaFiscal: escapeHTML(document.getElementById('notaFiscal').value),
            fornecedor: escapeHTML(fornecedor),
            instrumento: escapeHTML(instrumento),
            rc: escapeHTML((document.getElementById('rcSelecionada')?.value || '')),
            valorContrato: valorContratoNum,
            inicioVigencia: escapeHTML(document.getElementById('inicioVigencia')?.value || ''),
            fimVigencia: escapeHTML(document.getElementById('fimVigencia')?.value || ''),
            fiscalContrato: escapeHTML(document.getElementById('fiscalContrato')?.value || ''),
            contatoFiscal: escapeHTML(document.getElementById('contatoFiscal')?.value || ''),
            valorNotaFiscal: valorVal,
            dataEmissao: escapeHTML(dataEmissao),
            dataAteste: escapeHTML(dataAteste),
            observacoes: escapeHTML(document.getElementById('observacoesTC')?.value || ''),
            oiEntregou: oiEntregou || null,
            empenhosVinculados: empenhosDaNotaAtual,
            tributacoes: tributacoesAtual,
            np: escapeHTML(document.getElementById('np').value),
            dataLiquidacao: escapeHTML(document.getElementById('dataLiquidacao').value),
            op: escapeHTML(document.getElementById('op').value),
            criado_por: usuarioLogadoEmail
        };

        let novoStatus = statusAtual;
        const npPreenchida = !!dados.np?.trim();
        const eraNovo = (fbID === '-1' || !fbID);
        if (eraNovo) {
            dados.entradaSaida = [{ tipo: 'entrada', data: dataExefin, oiOrigem: oiEntregou }];
        }

        // Descobre qual aba está ativa (0 = Dados básicos / Rascunho)
        const abaAtivaEl = document.querySelector('.tab-tc.ativo');
        const indiceAbaAtiva = abaAtivaEl ? parseInt(abaAtivaEl.getAttribute('data-tab') || '0', 10) : 0;

        if (indiceAbaAtiva === 0) {
            // Na aba Dados básicos: apenas salva os dados, mantendo o status atual
            dados.status = statusAtual || 'Rascunho';
            novoStatus = dados.status;
        } else {
            // Nas demais abas, mantém o fluxo de status completo
            if (statusAtual === 'Rascunho') {
                dados.status = 'Rascunho';
                novoStatus = 'Rascunho';
            } else if (statusAtual === 'Em Processamento') {
                if (confirm("Deseja enviar para Liquidação?")) {
                    if (empenhosDaNotaAtual.length === 0) {
                        alert("Para enviar à Liquidação, vincule ao menos um empenho na aba Processamento.");
                        return;
                    }
                    novoStatus = 'Em Liquidação';
                    dados.status = novoStatus;
                } else {
                    dados.status = 'Em Processamento';
                }
            } else if (statusAtual === 'Em Liquidação' && npPreenchida) {
                novoStatus = 'Liquidado';
                dados.status = novoStatus;
            } else if (statusAtual === 'Liquidado' || statusAtual === 'Aguardando Financeiro') {
                if (empenhosDaNotaAtual.length === 0) {
                    alert("É necessário ter empenhos vinculados para avançar. Verifique a aba Processamento.");
                    return;
                }
                const todosLF = empenhosDaNotaAtual.every(v => !!(v.lf || '').trim());
                const todosPF = empenhosDaNotaAtual.every(v => !!(v.pf || '').trim());
                if (todosLF && todosPF) novoStatus = 'Para Pagamento';
                else if (todosLF) novoStatus = 'Aguardando Financeiro';
                dados.status = novoStatus;
            }
        }

        mostrarLoading();
        try {
            const histEntry = { status: novoStatus, data: firebase.firestore.Timestamp.now(), usuario: usuarioLogadoEmail || '' };
            const eraNovo = (fbID === '-1' || !fbID);
            let docId = fbID;
            if (eraNovo) {
                dados.status = dados.status || 'Rascunho';
                dados.historicoStatus = [histEntry];
                dados.criado_em = firebase.firestore.FieldValue.serverTimestamp();
                const ref = await db.collection('titulos').add(dados);
                docId = ref.id;
            } else {
                const doc = await db.collection('titulos').doc(fbID).get();
                const hist = (doc.data()?.historicoStatus || []);
                hist.push(histEntry);
                dados.historicoStatus = hist;
                dados.editado_em = firebase.firestore.FieldValue.serverTimestamp();
                await db.collection('titulos').doc(fbID).update(dados);
            }

            // Se o TC tem NP preenchida, atualiza a coleção "np" com o vínculo do TC.
            if (dados.np && String(dados.np).trim()) {
                try {
                    await vincularTituloNaNP(docId, dados.np, dados.dataLiquidacao);
                } catch (e) {
                    // Falha ao vincular NP não impede salvar o TC.
                    console.warn('Falha ao vincular TC na NP:', e);
                }
            }
            esconderLoading();

            if (salvandoApenasAbaDadosBasicos) {
                salvandoApenasAbaDadosBasicos = false;
                atualizarBotoesAbaDadosBasicos(false);
                alert("Dados da aba salvos com sucesso.");
                return;
            }

            if (typeof enviandoParaProcessamento !== 'undefined' && enviandoParaProcessamento) {
                enviandoParaProcessamento = false;
                try {
                    const doc = await db.collection('titulos').doc(docId).get();
                    const hist = (doc.data()?.historicoStatus || []);
                    hist.push({ status: 'Em Processamento', data: firebase.firestore.Timestamp.now(), usuario: usuarioLogadoEmail || '' });
                    await db.collection('titulos').doc(docId).update({
                        status: 'Em Processamento',
                        historicoStatus: hist,
                        editado_em: firebase.firestore.FieldValue.serverTimestamp()
                    });
                    alert("TC enviado para Processamento.");
                    voltarParaListaTitulos();
                } catch (err) {
                    alert("Erro ao enviar: " + (err.message || err));
                }
                return;
            }

            if (eraNovo && novoStatus === 'Rascunho') {
                document.getElementById('editIndexTitulo').value = docId;
                window._modalPrimeiroSalvoDocId = docId;
                document.getElementById('modalPrimeiroSalvo').style.display = 'flex';
                return;
            }
            alert("TC salvo com sucesso." + (dados.idProc ? ' Número: ' + dados.idProc : ''));
            voltarParaListaTitulos();
        } catch (err) {
            alert("Erro ao gravar: " + (err.message || err));
        } finally {
            esconderLoading();
        }
    });

    document.getElementById('modalPrimeiroSalvoContinuar')?.addEventListener('click', function() {
        document.getElementById('modalPrimeiroSalvo').style.display = 'none';
        atualizarBotoesFormulario('Rascunho', true);
        window._modalPrimeiroSalvoDocId = null;
    });
    document.getElementById('modalPrimeiroSalvoEnviar')?.addEventListener('click', async function() {
        const docId = window._modalPrimeiroSalvoDocId;
        document.getElementById('modalPrimeiroSalvo').style.display = 'none';
        window._modalPrimeiroSalvoDocId = null;
        if (!docId) return;
        mostrarLoading();
        try {
            const doc = await db.collection('titulos').doc(docId).get();
            const hist = (doc.data()?.historicoStatus || []);
            hist.push({ status: 'Em Processamento', data: firebase.firestore.Timestamp.now(), usuario: usuarioLogadoEmail || '' });
            // Garanta consistência do modelo interno antes de persistir.
            normalizarEmpenhosDaNotaAtualSubelemento();
            await db.collection('titulos').doc(docId).update({
                status: 'Em Processamento',
                empenhosVinculados: empenhosDaNotaAtual,
                historicoStatus: hist,
                editado_em: firebase.firestore.FieldValue.serverTimestamp()
            });
            baseTitulos = baseTitulos.map(t => t.id === docId ? { ...t, status: 'Em Processamento' } : t);
            alert("TC enviado para Processamento.");
            voltarParaListaTitulos();
        } catch (err) {
            alert("Erro ao enviar: " + (err.message || err));
        } finally {
            esconderLoading();
        }
    });

    document.getElementById('btnEnviarProcessamento')?.addEventListener('click', function() {
        const fbID = document.getElementById('editIndexTitulo').value;
        if (fbID === '-1' || !fbID) return alert("Salve o TC primeiro.");
        if (!confirm("Salvar alterações da aba Dados Básicos e enviar para Processamento?")) return;
        enviandoParaProcessamento = true;
        document.getElementById('formTitulo').requestSubmit();
    });

    document.getElementById('btnCancelarTitulo')?.addEventListener('click', function() {
        const fbID = document.getElementById('editIndexTitulo').value;
        if (fbID === '-1' || !fbID) {
            if (document.getElementById('numTC').value || document.getElementById('valorNotaFiscal').value) {
                if (!confirm("Há dados não salvos. Deseja realmente fechar? As alterações serão perdidas.")) return;
            }
        }
        voltarParaListaTitulos();
    });

    document.getElementById('btnDevolver')?.addEventListener('click', function() {
        const fbID = document.getElementById('editIndexTitulo').value;
        if (fbID === '-1') return alert("Salve o TC primeiro.");
        document.getElementById('devolverMotivo').value = '';
        document.getElementById('devolverNome').value = '';
        limparOIDestino();
        window._devolverTcId = fbID;
        document.getElementById('modalDevolver').style.display = 'flex';
    });

    window.limparOIDestino = function() {
        document.getElementById('oiDestinoId').value = '';
        const input = document.getElementById('buscaOIDestino');
        if (input) { input.value = ''; input.readOnly = false; }
        const btn = document.getElementById('limparOIDestinoBtn');
        if (btn) btn.style.display = 'none';
    };

    window.limparNovaEntradaOI = function() {
        document.getElementById('novaEntradaOIId').value = '';
        const input = document.getElementById('novaEntradaOI');
        if (input) { input.value = ''; input.readOnly = false; }
        const btn = document.getElementById('limparNovaEntradaOIBtn');
        if (btn) btn.style.display = 'none';
    };

    document.getElementById('modalDevolverCancelar')?.addEventListener('click', () => {
        document.getElementById('modalDevolver').style.display = 'none';
        window._devolverTcId = null;
    });

    document.getElementById('modalDevolverConfirmar')?.addEventListener('click', async function() {
        const fbID = window._devolverTcId;
        const motivo = (document.getElementById('devolverMotivo').value || '').trim();
        const nome = (document.getElementById('devolverNome').value || '').trim();
        const oiDestinoId = (document.getElementById('oiDestinoId').value || '').trim();
        if (!motivo) return alert("Informe o motivo da devolução (obrigatório).");
        if (!oiDestinoId) return alert("Selecione a OI de Destino.");
        document.getElementById('modalDevolver').style.display = 'none';
        window._devolverTcId = null;
        const dataDev = new Date().toISOString().slice(0, 10);
        mostrarLoading();
        try {
            const t = baseTitulos.find(x => x.id === fbID);
            const entradaSaida = Array.isArray(t?.entradaSaida) ? [...t.entradaSaida] : [];
            entradaSaida.push({ tipo: 'saida', nome: nome || null, oiDestino: oiDestinoId, dataDevolucao: dataDev });
            const hist = (t?.historicoStatus || []);
            hist.push({
                status: 'Devolvido',
                statusAnterior: t?.status,
                data: firebase.firestore.Timestamp.now(),
                usuario: usuarioLogadoEmail || '',
                motivoDevolucao: motivo,
                dataDevolucao: dataDev
            });
            await db.collection('titulos').doc(fbID).update({
                status: 'Devolvido',
                entradaSaida,
                historicoStatus: hist,
                editado_em: firebase.firestore.FieldValue.serverTimestamp()
            });
            alert("TC devolvido.");
            voltarParaListaTitulos();
        } catch (err) {
            alert("Erro: " + (err.message || err));
        } finally {
            esconderLoading();
        }
    });

    document.getElementById('btnDarNovaEntrada')?.addEventListener('click', function() {
        const fbID = document.getElementById('editIndexTitulo').value;
        if (fbID === '-1') return;
        document.getElementById('novaEntradaData').value = new Date().toISOString().slice(0, 10);
        limparNovaEntradaOI();
        window._novaEntradaTcId = fbID;
        document.getElementById('modalNovaEntrada').style.display = 'flex';
    });

    document.getElementById('modalNovaEntradaCancelar')?.addEventListener('click', () => {
        document.getElementById('modalNovaEntrada').style.display = 'none';
        window._novaEntradaTcId = null;
    });

    document.getElementById('modalNovaEntradaConfirmar')?.addEventListener('click', async function() {
        const fbID = window._novaEntradaTcId;
        const dataEntrada = (document.getElementById('novaEntradaData').value || '').trim();
        const oiOrigemId = (document.getElementById('novaEntradaOIId').value || '').trim();
        if (!dataEntrada) return alert("Informe a data de entrada.");
        if (!oiOrigemId) return alert("Selecione a OI de Origem.");
        document.getElementById('modalNovaEntrada').style.display = 'none';
        window._novaEntradaTcId = null;
        mostrarLoading();
        try {
            const t = baseTitulos.find(x => x.id === fbID);
            const entradaSaida = Array.isArray(t?.entradaSaida) ? [...t.entradaSaida] : [];
            entradaSaida.push({ tipo: 'entrada', data: dataEntrada, oiOrigem: oiOrigemId });
            const hist = (t?.historicoStatus || []);
            hist.push({ status: 'Rascunho', data: firebase.firestore.Timestamp.now(), usuario: usuarioLogadoEmail || '' });
            await db.collection('titulos').doc(fbID).update({
                status: 'Rascunho',
                dataExefin: dataEntrada,
                oiEntregou: oiOrigemId,
                entradaSaida,
                historicoStatus: hist,
                editado_em: firebase.firestore.FieldValue.serverTimestamp()
            });
            alert("Nova entrada registrada. TC em Rascunho.");
            editarTitulo(fbID);
        } catch (err) {
            alert("Erro: " + (err.message || err));
        } finally {
            esconderLoading();
        }
    });

    async function apagarTitulo(id) {
        if (!confirm("Apagar Título permanentemente?")) return;
        mostrarLoading();
        try {
            await db.collection('titulos').doc(id).delete();
            alert("Título excluído.");
        } catch (err) {
            alert("Acesso Negado.");
        } finally {
            esconderLoading();
        }
    }

    async function toggleInativoTitulo(id) {
        const t = baseTitulos.find(x => x.id === id);
        if (!t) return;
        const novoInativo = !t.inativo;
        const msg = novoInativo ? "Inativar este TC? Ele deixará de aparecer para perfis sem acesso a inativos." : "Reativar este TC?";
        if (!confirm(msg)) return;
        mostrarLoading();
        try {
            const histEntry = {
                status: novoInativo ? 'Inativado' : 'Reativado',
                data: firebase.firestore.Timestamp.now(),
                usuario: usuarioLogadoEmail || ''
            };
            await db.collection('titulos').doc(id).update({
                inativo: novoInativo,
                historicoStatus: firebase.firestore.FieldValue.arrayUnion(histEntry),
                editado_em: firebase.firestore.FieldValue.serverTimestamp()
            });
        } catch (err) {
            alert("Erro ao alterar ativo/inativo: " + (err.message || err));
        } finally {
            esconderLoading();
        }
    }

    async function gerarPDFTitulo(id) {
        const tLocal = baseTitulos.find(x => x.id === id);
        let t = tLocal;
        if (!t) {
            try {
                const doc = await db.collection('titulos').doc(id).get();
                if (!doc.exists) {
                    alert("TC não encontrado para gerar PDF.");
                    return;
                }
                t = { id: doc.id, ...doc.data() };
            } catch (err) {
                alert("Erro ao carregar TC para PDF: " + (err.message || err));
                return;
            }
        }
        if (!window.jspdf || !window.jspdf.jsPDF) {
            alert("Módulo de PDF indisponível. Verifique o carregamento da biblioteca jsPDF.");
            return;
        }
        const { jsPDF } = window.jspdf;
        const docPDF = new jsPDF({ unit: 'mm', format: 'a4' });
        const linha = (txt, x, y) => { docPDF.text(String(txt || ''), x, y); };
        let y = 15;

        // Cabeçalho
        docPDF.setFontSize(14);
        linha('SisExeFin - Título de Crédito', 10, y); y += 8;
        docPDF.setFontSize(10);
        linha(`ID-PROC: ${t.idProc || '-'}`, 10, y); y += 6;
        linha(`Nº TC: ${t.numTC || '-'}`, 10, y); y += 6;
        linha(`Status atual: ${t.status || 'Rascunho'}${t.inativo ? ' (INATIVO)' : ''}`, 10, y); y += 6;
        const agora = new Date().toLocaleString('pt-BR');
        linha(`Exportado em: ${agora}`, 10, y); y += 6;
        linha(`Gerado por: ${usuarioLogadoEmail || '-'}`, 10, y); y += 10;

        const addTituloSecao = (titulo) => {
            docPDF.setFontSize(11);
            docPDF.text(titulo, 10, y);
            y += 6;
            docPDF.setFontSize(9);
        };

        // Bloco Dados Básicos
        addTituloSecao('Dados Básicos');
        linha(`Data EXEFIN: ${t.dataExefin || '-'}`, 10, y); y += 5;
        linha(`OI de Origem: ${t.oiEntregou || '-'}`, 10, y); y += 5;
        linha(`Contrato/Empresa: ${t.instrumento || '-'} | ${t.fornecedor || '-'}`, 10, y); y += 5;
        linha(`RC: ${t.rc || '-'}`, 10, y); y += 5;
        linha(`Valor do TC: R$ ${(t.valorNotaFiscal || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, 10, y); y += 5;
        linha(`Data Emissão: ${t.dataEmissao || '-'}`, 10, y); y += 5;
        if (t.observacoes) {
            linha(`Observações: ${t.observacoes}`, 10, y); y += 5;
        }
        y += 3;

        // Bloco Processamento
        addTituloSecao('Processamento - Empenhos');
        (t.empenhosVinculados || []).forEach(v => {
            linha(`NE: ${v.numEmpenho || '-'} | Valor: R$ ${(v.valorVinculado || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} | LF: ${v.lf || '-'} | PF: ${v.pf || '-'}`, 10, y);
            y += 5;
            if (y > 270) { docPDF.addPage(); y = 15; }
        });
        y += 3;
        addTituloSecao('Processamento - Tributações');
        (t.tributacoes || []).forEach(tri => {
            linha(`Tipo: ${tri.tipo || '-'} | Valor: ${tri.valor || '-'}`, 10, y);
            y += 5;
            if (y > 270) { docPDF.addPage(); y = 15; }
        });
        y += 3;

        // Bloco Liquidação / Financeiro
        addTituloSecao('Liquidação / Financeiro');
        linha(`NP: ${t.np || '-'}`, 10, y); y += 5;
        linha(`Data Liquidação: ${t.dataLiquidacao || '-'}`, 10, y); y += 5;
        linha(`OP: ${t.op || '-'}`, 10, y); y += 5;
        y += 3;

        // Bloco Histórico
        addTituloSecao('Histórico');
        (t.historicoStatus || []).forEach(h => {
            const dataHist = h.data && h.data.toDate ? h.data.toDate().toLocaleString('pt-BR') : (h.data || '-');
            linha(`Data: ${dataHist} | Status: ${h.status || h.statusNovo || '-'} | Usuário: ${h.usuario || '-'}`, 10, y);
            y += 5;
            if (h.motivoDevolucao) {
                linha(`Motivo: ${h.motivoDevolucao}`, 12, y);
                y += 5;
            }
            if (y > 270) { docPDF.addPage(); y = 15; }
        });

        // Número de páginas no rodapé simples
        const totalPages = docPDF.getNumberOfPages();
        for (let i = 1; i <= totalPages; i++) {
            docPDF.setPage(i);
            docPDF.setFontSize(8);
            docPDF.text(`Página ${i} de ${totalPages}`, 105, 290, { align: 'center' });
        }

        docPDF.save(`TC_${t.idProc || t.numTC || id}.pdf`);

        // Registra ação na trilha de auditoria
        try {
            await db.collection('titulos').doc(id).update({
                historicoStatus: firebase.firestore.FieldValue.arrayUnion({
                    status: 'PDF Gerado',
                    data: firebase.firestore.Timestamp.now(),
                    usuario: usuarioLogadoEmail || ''
                }),
                editado_em: firebase.firestore.FieldValue.serverTimestamp()
            });
        } catch (e) {
            // falha silenciosa na auditoria não impede o PDF
            console.warn('Falha ao registrar auditoria de PDF:', e);
        }
    }

    function downloadModeloOP() {
        const csv = 'NP,OP\n741000000012026NP000001,2026OP000049';
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'modelo-op.csv';
        a.click();
        URL.revokeObjectURL(a.href);
    }
    window.downloadModeloOP = downloadModeloOP;

    document.getElementById('fileImportOP')?.addEventListener('change', async function(e) {
        const file = e.target.files[0];
        if (!file) return;
        if (typeof permissoesEmCache !== 'undefined' && !permissoesEmCache.includes('acesso_admin')) {
            alert("Acesso negado. Apenas administradores podem importar OP.");
            e.target.value = '';
            return;
        }
        mostrarLoading();
        try {
            const data = await new Promise((res, rej) => {
                const r = new FileReader();
                r.onload = ev => res(ev.target.result);
                r.onerror = rej;
                r.readAsArrayBuffer(file);
            });
            const wb = XLSX.read(data, { type: 'array' });
            const sh = wb.Sheets[wb.SheetNames[0]];
            const rows = XLSX.utils.sheet_to_json(sh, { defval: '' });
            let atualizados = 0;
            for (const row of rows) {
                const np = String(row.NP || row.np || '').trim();
                const op = String(row.OP || row.op || '').trim();
                if (!np || !op) continue;
                const titulosComNP = baseTitulos.filter(t => (t.np || '').trim() === np);
                for (const t of titulosComNP) {
                    await db.collection('titulos').doc(t.id).update({ op, editado_em: firebase.firestore.FieldValue.serverTimestamp() });
                    atualizados++;
                }
            }
            alert("Importação OP: " + atualizados + " título(s) atualizado(s).");
        } catch (err) {
            alert("Erro na importação: " + (err.message || err));
        } finally {
            esconderLoading();
            e.target.value = '';
        }
    });

    document.getElementById('btnAvancarNP')?.addEventListener('click', async function() {
        const ids = Array.from(titulosSelecionados);
        if (ids.length === 0) return alert("Selecione ao menos um TC.");
        const np = prompt("NP (Nota de Pagamento):");
        if (!np) return;
        const dataLiq = prompt("Data Liquidação (YYYY-MM-DD):", new Date().toISOString().slice(0, 10));
        mostrarLoading();
        try {
            for (const id of ids) {
                const t = baseTitulos.find(x => x.id === id);
                if (t && t.status === 'Em Liquidação') {
                    await db.collection('titulos').doc(id).update({
                        np, dataLiquidacao: dataLiq || '', status: 'Liquidado',
                        historicoStatus: firebase.firestore.FieldValue.arrayUnion({ status: 'Liquidado', data: firebase.firestore.Timestamp.now(), usuario: usuarioLogadoEmail || '' }),
                        editado_em: firebase.firestore.FieldValue.serverTimestamp()
                    });
                    try {
                        await vincularTituloNaNP(id, np, dataLiq || '');
                    } catch (err) {
                        console.warn('Falha ao vincular NP em bloco:', err);
                    }
                }
            }
            titulosSelecionados.clear();
            atualizarUIselecao();
            atualizarTabelaTitulos();
            alert("NP atribuída em bloco.");
        } catch (err) {
            alert("Erro: " + (err.message || err));
        } finally {
            esconderLoading();
        }
    });

    document.getElementById('btnAvancarLF')?.addEventListener('click', async function() {
        const ids = Array.from(titulosSelecionados);
        if (ids.length === 0) return alert("Selecione ao menos um TC.");
        const lf = prompt("LF (Liquidação Financeira):");
        if (!lf) return;
        mostrarLoading();
        try {
            for (const id of ids) {
                const t = baseTitulos.find(x => x.id === id);
                if (!t || !t.empenhosVinculados) continue;
                const emps = t.empenhosVinculados.map(v => ({ ...v, lf }));
                const todosLF = emps.every(v => !!(v.lf || '').trim());
                const todosPF = emps.every(v => !!(v.pf || '').trim());
                let novoStatus = t.status;
                if (todosLF && todosPF) novoStatus = 'Para Pagamento';
                else if (todosLF) novoStatus = 'Aguardando Financeiro';
                await db.collection('titulos').doc(id).update({
                    empenhosVinculados: emps,
                    status: novoStatus,
                    editado_em: firebase.firestore.FieldValue.serverTimestamp()
                });
            }
            titulosSelecionados.clear();
            atualizarUIselecao();
            atualizarTabelaTitulos();
            alert("LF atribuída em bloco.");
        } catch (err) {
            alert("Erro: " + (err.message || err));
        } finally {
            esconderLoading();
        }
    });

    document.getElementById('btnAvancarPF')?.addEventListener('click', async function() {
        const ids = Array.from(titulosSelecionados);
        if (ids.length === 0) return alert("Selecione ao menos um TC.");
        const pf = prompt("PF:");
        if (!pf) return;
        mostrarLoading();
        try {
            for (const id of ids) {
                const t = baseTitulos.find(x => x.id === id);
                if (!t || !t.empenhosVinculados) continue;
                const emps = t.empenhosVinculados.map(v => ({ ...v, pf }));
                const todosPF = emps.every(v => !!(v.pf || '').trim());
                const novoStatus = todosPF ? 'Para Pagamento' : t.status;
                await db.collection('titulos').doc(id).update({
                    empenhosVinculados: emps,
                    status: novoStatus,
                    editado_em: firebase.firestore.FieldValue.serverTimestamp()
                });
            }
            titulosSelecionados.clear();
            atualizarUIselecao();
            atualizarTabelaTitulos();
            alert("PF atribuída em bloco.");
        } catch (err) {
            alert("Erro: " + (err.message || err));
        } finally {
            esconderLoading();
        }
    });

    document.getElementById('btnEditarAbaDadosBasicos')?.addEventListener('click', function() {
        atualizarBotoesAbaDadosBasicos(true);
    });
    document.getElementById('btnSalvarAbaDadosBasicos')?.addEventListener('click', function() {
        salvandoApenasAbaDadosBasicos = true;
        document.getElementById('formTitulo')?.requestSubmit();
    });

    function ligarEventos() {
        configurarAutocompleteOI();
        configurarAutocompleteFornecedor();
        configurarSelectContrato();
        configurarAutocompleteEmpenho();
        configurarAutocompleteOIGenerico('buscaOIDestino', 'listaResultadosOIDestino', 'oiDestinoId', 'limparOIDestinoBtn');
        configurarAutocompleteOIGenerico('novaEntradaOI', 'listaResultadosNovaEntradaOI', 'novaEntradaOIId', 'limparNovaEntradaOIBtn');
    }

    window.atualizarTabelaTitulos = atualizarTabelaTitulos;
    window.listaOIDebug = function() { return listaOI; };
    window.baseContratosDebug = function() { return baseContratos; };

    if (document.getElementById('buscaOIT') && typeof debounce === 'function') {
        configurarAutocompleteOI();
        configurarAutocompleteFornecedor();
        configurarSelectContrato();
        configurarAutocompleteEmpenho();
    }
})();
