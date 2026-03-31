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
    let statusFiltroAtual = 'Rascunho';
    let titulosSelecionados = new Set();
    let empenhosDaNotaAtual = [];
    let deducoesAplicadasAtual = [];
    let baseDeducoesEncargos = [];
    let baseFornecedores = [];
    let contratosFornecedorSelecionado = [];
    let salvandoApenasAba = false;
    let informacaoHistoricoPendente = '';
    let abaEmEdicao = null;
    let alteracoesPendentesAba = false;
    let acaoPendenteDeSaida = null;
    let paginaAtual = 1;
    let itensPorPagina = 10;
    let termoBusca = '';
    let incluirInativos = false;
    let estadoOrdenacao = { coluna: 'idProc', direcao: 'asc' };
    let unsubscribeTitulos = null;

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

    function normalizarParaFirestore(valor) {
        if (valor === undefined) return null;
        if (valor === null) return null;
        if (Array.isArray(valor)) return valor.map(item => normalizarParaFirestore(item));
        if (Object.prototype.toString.call(valor) === '[object Object]') {
            const out = {};
            Object.keys(valor).forEach(k => {
                const v = normalizarParaFirestore(valor[k]);
                if (v !== undefined) out[k] = v;
            });
            return out;
        }
        return valor;
    }

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
        unsubscribers.push(() => { try { if (unsubscribeTitulos) unsubscribeTitulos(); } catch (e) {} });

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

        let primeiroSnapshotTitulosRecebido = false;
        function assinarTitulosPorStatus(status) {
            try { if (unsubscribeTitulos) unsubscribeTitulos(); } catch (e) {}
            let query = db.collection('titulos');
            if (status && status !== 'Todos') {
                query = query.where('status', '==', status);
            }
            unsubscribeTitulos = query.onSnapshot(
                snap => {
                    try {
                        baseTitulos = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                        atualizarTabelaTitulos();
                    } catch (e) {
                        console.error('Erro ao atualizar tabela de títulos:', e);
                    } finally {
                        if (!primeiroSnapshotTitulosRecebido) {
                            primeiroSnapshotTitulosRecebido = true;
                            aoReceberSnapshot();
                        }
                    }
                },
                onErr
            );
        }
        unsubscribers.push(db.collection('contratos').onSnapshot(snap => {
            baseContratos = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            // Se já houver fornecedor selecionado, rehidrata a lista de contratos
            // para cobrir cenários em que o snapshot de contratos chega depois.
            try {
                const cnpjSel = normalizarCNPJ(document.getElementById('fornecedorValor')?.value || '');
                if (cnpjSel) selecionarFornecedorPorCnpj(cnpjSel);
            } catch (e) {}
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
        unsubscribers.push(db.collection('deducoesEncargos').onSnapshot(snap => {
            baseDeducoesEncargos = snap.docs.map(doc => ({ id: doc.id, ...doc.data() })).filter(d => d.ativo !== false);
            aoReceberSnapshot();
        }, onErr));
        unsubscribers.push(db.collection('fornecedores').onSnapshot(snap => {
            baseFornecedores = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            aoReceberSnapshot();
        }, onErr));

        const urlParams = new URLSearchParams(window.location.search);
        const st = (urlParams.get('status') || '').trim();
        statusFiltroAtual = st || 'Rascunho';
        assinarTitulosPorStatus(statusFiltroAtual);
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
            String(c.nomeFornecedor || c.fornecedor || c.razaoSocial || c.empresa || '').trim(),
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
        const botoes = [...STATUS_ORDEM, 'Todos'];
        container.innerHTML = botoes.map(s => {
            const cls = statusFiltroAtual === s ? 'ativo' : '';
            const label = s === 'Devolvido' ? 'Devolvidos' : s;
            return `<button type="button" class="stepper-tc-btn ${cls}" data-status="${s}">${escapeHTML(label)}</button>`;
        }).join('');
        container.querySelectorAll('.stepper-tc-btn').forEach(btn => {
            btn.addEventListener('click', () => filtrarPorStatus(btn.getAttribute('data-status') || 'Rascunho'));
        });
    }

    window.filtrarPorStatus = function(status) {
        statusFiltroAtual = status || 'Rascunho';
        titulosSelecionados.clear();
        paginaAtual = 1;
        if (history.replaceState) history.replaceState({}, '', 'titulos.html?status=' + encodeURIComponent(statusFiltroAtual));
        try { if (unsubscribeTitulos) unsubscribeTitulos(); } catch (e) {}
        let query = db.collection('titulos');
        if (statusFiltroAtual !== 'Todos') query = query.where('status', '==', statusFiltroAtual);
        unsubscribeTitulos = query.onSnapshot(
            snap => {
                baseTitulos = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                atualizarTabelaTitulos();
            },
            err => {
                console.error('Erro ao filtrar títulos por status:', err);
                const tbody = document.getElementById('tbody-titulos');
                if (tbody) tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#e74c3c;">Erro ao carregar títulos para o status selecionado.</td></tr>';
            }
        );
        desenharFiltrosStatus();
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
        if (statusFiltroAtual && statusFiltroAtual !== 'Todos') lista = lista.filter(t => t.status === statusFiltroAtual);
        if (termoBusca.trim()) {
            const q = termoBusca.toLowerCase();
            lista = lista.filter(t =>
                (t.idProc && t.idProc.toLowerCase().includes(q)) ||
                (t.fornecedorNome && t.fornecedorNome.toLowerCase().includes(q)) ||
                (t.fornecedorCnpj && t.fornecedorCnpj.toLowerCase().includes(q)) ||
                // legado
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
                    const podeGerarPdf = (typeof temPermissaoUI === 'function' ? temPermissaoUI('titulos_pdf') : false) ||
                        (typeof permissoesEmCache !== 'undefined' && permissoesEmCache.includes('acesso_admin'));
                    if (podeGerarPdf) {
                        acoes += `<button type="button" class="btn-icon btn-pdf-titulo" data-id="${escapeHTML(t.id)}" title="Gerar PDF">📄</button>`;
                    }
                    const podeTramitar = typeof temPermissaoUI === 'function' ? temPermissaoUI('tramitarTC') : false;
                    if (podeTramitar && status === 'Rascunho') {
                        acoes += `<button type="button" class="btn-icon btn-encaminhar-processamento-titulo" data-id="${escapeHTML(t.id)}" title="Encaminhar para Processamento">➡️</button>`;
                        acoes += `<button type="button" class="btn-icon btn-devolver-titulo" data-id="${escapeHTML(t.id)}" title="Devolver TC">↩</button>`;
                    }
                    if (podeTramitar && status === 'Em Processamento') {
                        acoes += `<button type="button" class="btn-icon btn-encaminhar-liquidacao-titulo" data-id="${escapeHTML(t.id)}" title="Encaminhar para Liquidação">➡️</button>`;
                        acoes += `<button type="button" class="btn-icon btn-devolver-titulo" data-id="${escapeHTML(t.id)}" title="Devolver TC">↩</button>`;
                    }
                    if (status === 'Devolvido') {
                        acoes += `<button type="button" class="btn-icon btn-nova-entrada-titulo" data-id="${escapeHTML(t.id)}" title="Dar nova entrada">↪</button>`;
                    }
                }
                const checked = titulosSelecionados.has(t.id) ? ' checked' : '';
                tr.innerHTML = `<td><input type="checkbox" class="check-tc check-titulo" data-id="${escapeHTML(t.id)}"${checked}></td>
                    <td><strong>${escapeHTML(t.idProc || '-')}</strong></td>
                    <td>${escapeHTML(t.numTC || '-')}</td>
                    <td title="${escapeHTML(t.fornecedorCnpj ? formatarCNPJ(t.fornecedorCnpj) : '')}">
                        ${escapeHTML((t.fornecedorNome || t.fornecedor || '').substring(0, 40))}${(t.fornecedorNome || t.fornecedor || '').length > 40 ? '...' : ''}
                    </td>
                    <td>R$ ${escapeHTML(typeof formatarMoedaBR === 'function' ? formatarMoedaBR(t.valorNotaFiscal || 0) : String(t.valorNotaFiscal || '0.00'))}</td>
                    <td><span class="badge-status ${badgeCls}">${escapeHTML(status)}</span></td>
                    <td>${acoes}</td>`;
                tbody.appendChild(tr);
            });
        }

        const total = Math.ceil(lista.length / itensPorPagina) || 1;
        const info = document.getElementById('infoPagina');
        if (info) info.textContent = `Página ${paginaAtual} de ${total}`;
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
        tbody.querySelectorAll('.btn-encaminhar-processamento-titulo').forEach(btn => btn.addEventListener('click', () => encaminharTC(btn.getAttribute('data-id'), 'Em Processamento')));
        tbody.querySelectorAll('.btn-encaminhar-liquidacao-titulo').forEach(btn => btn.addEventListener('click', () => encaminharTC(btn.getAttribute('data-id'), 'Em Liquidação')));
        tbody.querySelectorAll('.btn-devolver-titulo').forEach(btn => btn.addEventListener('click', () => {
            const id = btn.getAttribute('data-id');
            if (!id) return;
            abrirModalDevolucao([id]);
        }));
        tbody.querySelectorAll('.btn-nova-entrada-titulo').forEach(btn => btn.addEventListener('click', () => {
            const id = btn.getAttribute('data-id');
            if (!id) return;
            abrirModalNovaEntrada([id]);
        }));
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
        const btnNovaEntradaBloco = document.getElementById('btnNovaEntradaBloco');
        const btnEncaminharBloco = document.getElementById('btnEncaminharBloco');
        const btnDevolverBloco = document.getElementById('btnDevolverBloco');
        if (container && count) {
            const n = titulosSelecionados.size;
            container.style.display = n > 0 ? 'block' : 'none';
            count.textContent = n;
            const selecionados = Array.from(titulosSelecionados).map(id => baseTitulos.find(t => t.id === id)).filter(Boolean);
            const todosDevolvidos = selecionados.length > 0 && selecionados.every(t => (t.status || 'Rascunho') === 'Devolvido');
            const todosRascunho = selecionados.length > 0 && selecionados.every(t => (t.status || 'Rascunho') === 'Rascunho');
            const todosEmProcessamento = selecionados.length > 0 && selecionados.every(t => (t.status || 'Rascunho') === 'Em Processamento');
            const podeTramitar = usuarioPodeTramitarTC();
            if (btnNovaEntradaBloco) btnNovaEntradaBloco.style.display = (todosDevolvidos && selecionados.length > 1) ? 'inline-block' : 'none';
            if (btnEncaminharBloco) {
                btnEncaminharBloco.style.display = (podeTramitar && (todosRascunho || todosEmProcessamento)) ? 'inline-block' : 'none';
                btnEncaminharBloco.textContent = todosRascunho ? '➡️ Encaminhar para Processamento em Bloco' : '➡️ Enviar para Liquidação em Bloco';
            }
            if (btnDevolverBloco) btnDevolverBloco.style.display = (podeTramitar && (todosRascunho || todosEmProcessamento)) ? 'inline-block' : 'none';
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
        informacaoHistoricoPendente = '';
        document.getElementById('formTitulo')?.reset();
        document.getElementById('editIndexTitulo').value = '-1';
        document.getElementById('idProc').value = '';
        document.getElementById('anoTC').value = '2026';
        document.getElementById('ugTC').value = '741000';
        document.getElementById('tipoTC').value = '';
        atualizarAvisoFiltroBuscaNE();
        limparOISelecionada();
        document.getElementById('oiEntregou').value = '';
        document.getElementById('fornecedorValor').value = '';
        document.getElementById('contratoIdSelecionado').value = '';
        limparFornecedorSelecionado();
        empenhosDaNotaAtual = [];
        deducoesAplicadasAtual = [];
        desenharEmpenhosNota();
        desenharDeducoesAplicadas();
        desenharBotoesCalcularDed();
        mostrarStepper('Rascunho');
        ativarTab(0);
        bloquearTabsPorStatus('Rascunho');
        const tituloEl = document.getElementById('tituloFormTC');
        if (tituloEl) tituloEl.textContent = 'Entrada de Título de Crédito';
        abaEmEdicao = 0;
        alteracoesPendentesAba = false;
        atualizarRotuloBotaoSalvarPrincipal();
        atualizarModoEdicaoAbas();
        atualizarBotoesEdicaoPorAba();
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

    function tcSalvo() {
        const fbID = document.getElementById('editIndexTitulo')?.value || '';
        return fbID !== '-1' && fbID !== '';
    }

    function usuarioPodeEditarTC() {
        const pode = typeof temPermissaoUI === 'function' ? temPermissaoUI('titulos_editar') : false;
        if (!pode) return false;
        const fbID = document.getElementById('editIndexTitulo')?.value || '';
        if (!fbID || fbID === '-1') return true;
        const t = baseTitulos.find(x => x.id === fbID);
        return (t?.status || 'Rascunho') !== 'Devolvido';
    }

    function usuarioPodeTramitarTC() {
        return typeof temPermissaoUI === 'function' ? temPermissaoUI('tramitarTC') : false;
    }

    function dadosBasicosCompletos(t) {
        const tc = t || {};
        return !!(
            String(tc.tipoTC || '').trim() &&
            String(tc.dataExefin || '').trim() &&
            String(tc.numTC || '').trim() &&
            String(tc.fornecedorCnpj || '').trim() &&
            String(tc.fornecedorNome || tc.fornecedor || '').trim() &&
            String(tc.instrumento || '').trim() &&
            Number(tc.valorNotaFiscal || 0) > 0 &&
            String(tc.dataEmissao || '').trim() &&
            String(tc.dataAteste || '').trim()
        );
    }

    async function encaminharTC(id, destino, emBloco = false) {
        if (!usuarioPodeTramitarTC()) return alert('Acesso negado para tramitação.');
        const t = baseTitulos.find(x => x.id === id);
        if (!t) return;
        const statusAtual = t.status || 'Rascunho';
        if (destino === 'Em Processamento' && statusAtual !== 'Rascunho') return;
        if (destino === 'Em Liquidação' && statusAtual !== 'Em Processamento') return;
        if (destino === 'Em Processamento' && !dadosBasicosCompletos(t)) {
            return alert('Dados Básicos incompletos. Complete a aba Dados Básicos antes de encaminhar para Processamento.');
        }
        if (destino === 'Em Liquidação' && (!Array.isArray(t.empenhosVinculados) || t.empenhosVinculados.length < 1)) {
            return alert('Para enviar à Liquidação, vincule ao menos 1 NE na aba Processamento.');
        }
        const acaoTxt = destino === 'Em Processamento' ? 'Enc. p/ Processamento' : 'Enc. p/ Liquidação';
        const eventoTxt = destino === 'Em Processamento' ? 'Enc. p/ Processamento' : 'Enc. p/ Liquidação';
        const info = emBloco ? 'Operação em bloco' : '';
        const hist = obterHistorico(t || {});
        hist.push(construirEntradaHistorico({
            status: destino,
            evento: eventoTxt,
            acao: `${acaoTxt} por`,
            info,
            aba: null
        }));
        await db.collection('titulos').doc(id).update({
            status: destino,
            historico: hist,
            historicoStatus: hist,
            editado_em: firebase.firestore.FieldValue.serverTimestamp()
        });
    }

    function podeEditarAba(tabIndex) {
        if (!tcSalvo()) return true;
        return usuarioPodeEditarTC() && abaEmEdicao === tabIndex;
    }

    function abaTemDados(tabIndex) {
        if (tabIndex === 0) {
            return !!((document.getElementById('numTC')?.value || '').trim());
        }
        if (tabIndex === 1) {
            return (empenhosDaNotaAtual || []).length > 0 || (deducoesAplicadasAtual || []).length > 0;
        }
        if (tabIndex === 2) {
            return !!((document.getElementById('np')?.value || '').trim() || (document.getElementById('dataLiquidacao')?.value || '').trim()) ||
                (empenhosDaNotaAtual || []).some(v => !!(v.lf || '').trim());
        }
        if (tabIndex === 3) {
            return !!((document.getElementById('op')?.value || '').trim()) ||
                (empenhosDaNotaAtual || []).some(v => !!(v.pf || '').trim());
        }
        return true;
    }

    function atualizarEstadoControlesAba(tabIndex, habilitado) {
        const painel = document.getElementById('panel' + tabIndex);
        if (!painel) return;
        painel.classList.toggle('tc-panel-bloqueado', !habilitado);
        const controles = painel.querySelectorAll('input, select, textarea, button');
        controles.forEach(el => {
            if (el.classList.contains('tc-tab-edit-control')) return;
            if (el.closest('.tc-acao-aba')) return;
            if (!el.dataset.tcOrigDisabled) {
                el.dataset.tcOrigDisabled = String(!!el.disabled);
                el.dataset.tcOrigReadonly = String(!!el.readOnly);
            }
            const origDisabled = el.dataset.tcOrigDisabled === 'true';
            const origReadonly = el.dataset.tcOrigReadonly === 'true';
            if (!habilitado) {
                el.disabled = true;
            } else {
                el.disabled = origDisabled;
                if ('readOnly' in el) el.readOnly = origReadonly;
            }
        });
    }

    function atualizarModoEdicaoAbas() {
        const salvo = tcSalvo();
        const podeEditar = usuarioPodeEditarTC();
        [0, 1, 2, 3].forEach(tab => {
            const deveHabilitar = !salvo ? true : (podeEditar && abaEmEdicao === tab);
            atualizarEstadoControlesAba(tab, deveHabilitar);
        });
        atualizarBloqueioBotoesPrincipais();
    }

    function atualizarBotoesEdicaoPorAba() {
        const config = [
            { tab: 0, acao: 'acoesAbaDadosBasicos', editar: 'btnEditarAbaDadosBasicos', salvar: 'btnSalvarAbaDadosBasicos', desistir: 'btnDesistirAbaDadosBasicos' },
            { tab: 1, acao: 'acoesAbaProcessamento', editar: 'btnEditarAbaProcessamento', salvar: 'btnSalvarAbaProcessamento', desistir: 'btnDesistirAbaProcessamento' },
            { tab: 2, acao: 'acoesAbaLiquidacao', editar: 'btnEditarAbaLiquidacao', salvar: 'btnSalvarAbaLiquidacao', desistir: 'btnDesistirAbaLiquidacao' },
            { tab: 3, acao: 'acoesAbaFinanceiro', editar: 'btnEditarAbaFinanceiro', salvar: 'btnSalvarAbaFinanceiro', desistir: 'btnDesistirAbaFinanceiro' }
        ];
        const salvo = tcSalvo();
        const podeEditar = usuarioPodeEditarTC();
        config.forEach(c => {
            const acao = document.getElementById(c.acao);
            const btnEditar = document.getElementById(c.editar);
            const btnSalvar = document.getElementById(c.salvar);
            const btnDesistir = document.getElementById(c.desistir);
            if (!acao || !btnEditar || !btnSalvar || !btnDesistir) return;
            const emEdicaoDestaAba = abaEmEdicao === c.tab;
            const exibirAcoes = (salvo && podeEditar) || (!salvo && c.tab === 0);
            acao.style.display = exibirAcoes ? 'flex' : 'none';
            if (!exibirAcoes) return;
            const mostrarEditar = salvo ? !emEdicaoDestaAba : false;
            const mostrarSalvar = emEdicaoDestaAba;
            const mostrarDesistir = emEdicaoDestaAba;
            btnEditar.style.display = mostrarEditar ? 'inline-block' : 'none';
            btnSalvar.style.display = mostrarSalvar ? 'inline-block' : 'none';
            btnDesistir.style.display = mostrarDesistir ? 'inline-block' : 'none';
            btnEditar.classList.add('tc-tab-edit-control');
            btnSalvar.classList.add('tc-tab-edit-control');
            btnDesistir.classList.add('tc-tab-edit-control');
        });
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
            // Histórico (aba 4) deve permanecer sempre acessível para consulta.
            if (i === 4) {
                tab.classList.remove('bloqueado');
                tab.style.pointerEvents = '';
                return;
            }
            const isBloqueado = (status === 'Devolvido')
                ? !abaTemDados(i)
                : (i > idx + 1);
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
        const podeTramitar = usuarioPodeTramitarTC();
        if (btnDevolver) btnDevolver.style.display = (tcSalvo && podeTramitar && (status === 'Rascunho' || status === 'Em Processamento')) ? 'inline-block' : 'none';
        if (btnEnviar) {
            btnEnviar.style.display = (tcSalvo && podeTramitar && (status === 'Rascunho' || status === 'Em Processamento')) ? 'inline-block' : 'none';
            btnEnviar.textContent = status === 'Em Processamento' ? '➡️ Encaminhar para Liquidação' : '➡️ Encaminhar para Processamento';
        }
        if (btnNovaEntrada) btnNovaEntrada.style.display = (status === 'Devolvido') ? 'inline-block' : 'none';
    }

    function nomeAbaPorIndice(tabIndex) {
        const mapa = { 0: 'Dados Básicos', 1: 'Processamento', 2: 'Liquidação', 3: 'Financeiro' };
        return mapa[tabIndex] || 'TC';
    }

    function obterHistorico(docData) {
        return (docData?.historico || docData?.historicoStatus || []);
    }

    function formatarDataHistoricoBr(dataVal) {
        const d = (dataVal && dataVal.toDate) ? dataVal.toDate() : (dataVal ? new Date(dataVal) : null);
        if (!d || isNaN(d.getTime())) return '-';
        const dd = String(d.getDate()).padStart(2, '0');
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const yy = String(d.getFullYear()).slice(-2);
        const hh = String(d.getHours()).padStart(2, '0');
        const mi = String(d.getMinutes()).padStart(2, '0');
        return `${dd}/${mm}/${yy} às ${hh}:${mi}`;
    }

    function construirEntradaHistorico({ status, evento, acao, info, aba }) {
        return {
            data: firebase.firestore.Timestamp.now(),
            status: status || '-',
            evento: evento || 'Edição',
            acao: acao || '-',
            usuario: usuarioLogadoEmail || '',
            motivoInfo: info || '',
            aba: (aba != null ? aba : null)
        };
    }

    function atualizarResumoHistoricoTC(titulo) {
        const el = document.getElementById('resumoHistoricoTC');
        if (!el) return;
        const statusAtual = titulo?.status || 'Rascunho';
        let dias = '-';
        const editado = (titulo?.editado_em && titulo.editado_em.toDate) ? titulo.editado_em.toDate() : null;
        if (editado) {
            const diffMs = Date.now() - editado.getTime();
            dias = String(Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24))));
        }
        el.textContent = `Status atual: ${statusAtual}. Dias: ${dias} dias sem edição.`;
    }

    function ativarTab(i) {
        document.querySelectorAll('.tab-tc').forEach((t, j) => t.classList.toggle('ativo', j === i));
        document.querySelectorAll('.tab-panel-tc').forEach((p, j) => p.classList.toggle('visivel', j === i));
        atualizarBotoesEdicaoPorAba();
        if (i === 1) {
            desenharBotoesCalcularDed();
            if ((deducoesAplicadasAtual || []).length === 0 && obterDeducoesPermitidasContrato().length > 0) {
                recalcularDeducoesContratoSubstituindo();
            } else {
                desenharDeducoesAplicadas();
                desenharResumoDeducoesLiquidacao();
            }
        }
    }

    document.querySelectorAll('.tab-tc').forEach(tab => {
        tab.addEventListener('click', function() {
            if (this.classList.contains('bloqueado')) return;
            const destino = parseInt(this.getAttribute('data-tab') || 0);
            const ativa = parseInt((document.querySelector('.tab-tc.ativo')?.getAttribute('data-tab') || '0'), 10);
            if (abaEmEdicao !== null && destino !== ativa) {
                alert('Salve a aba atual antes.');
                return;
            }
            ativarTab(destino);
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
            const processamentoEditavel = podeEditarAba(1);
            tr.innerHTML = `<td title="NE: ${escapeHTML(v.numEmpenho || '')} | PTRES: ${escapeHTML(v.ptres || '-')} | FR: ${escapeHTML(v.fr || '-')}">${escapeHTML(typeof formatarNumEmpenhoVisivel === 'function' ? formatarNumEmpenhoVisivel(v.numEmpenho) : (v.numEmpenho || '-'))}</td>
                <td>${escapeHTML(v.nd || '-')}</td>
                <td>${escapeHTML(v.subelemento || '-')}</td>
                <td>R$ ${escapeHTML(typeof formatarMoedaBR === 'function' ? formatarMoedaBR(v.valorVinculado || 0) : (v.valorVinculado || '0'))}</td>
                <td title="${escapeHTML(labelCentroCustos(v.centroCustosId))}">${escapeHTML((labelCentroCustos(v.centroCustosId) || '-').substring(0, 25))}${(labelCentroCustos(v.centroCustosId) || '').length > 25 ? '...' : ''}</td>
                <td title="${escapeHTML(labelUG(v.ugId))}">${escapeHTML((labelUG(v.ugId) || '-').substring(0, 25))}${(labelUG(v.ugId) || '').length > 25 ? '...' : ''}</td>
                <td>
                    <button type="button" class="btn-icon btn-editar-ne" data-index="${i}" title="Editar" ${processamentoEditavel ? '' : 'disabled'}>✏️</button>
                    <button type="button" class="btn-icon btn-rm-ne" data-index="${i}" title="Remover" ${processamentoEditavel ? '' : 'disabled'}>🗑️</button>
                </td>`;
            tbody.appendChild(tr);
        });

        tbody.querySelectorAll('.btn-editar-ne').forEach(btn => btn.addEventListener('click', function() {
            if (!podeEditarAba(1)) return;
            editarItemEmpenhoNaNota(parseInt(this.getAttribute('data-index'), 10));
        }));
        tbody.querySelectorAll('.btn-rm-ne').forEach(btn => btn.addEventListener('click', function() {
            if (!podeEditarAba(1)) return;
            empenhosDaNotaAtual.splice(parseInt(this.getAttribute('data-index'), 10), 1);
            podeCancelarUltimaInclusaoEmpenhoNota = false;
            const btnUndo = document.getElementById('btnCancelarUltimaInclusaoEmpenhoNota');
            if (btnUndo) btnUndo.style.display = 'none';
            desenharEmpenhosNota();
            atualizarTotaisEmpenhosNota();
        }));

        atualizarTotaisEmpenhosNota();
    }

    const LABEL_TIPO = { DDF021: 'INSS', DDF025: 'DARF', DDR001: 'ISS' };

    function obterDeducoesPermitidasContrato() {
        const contratoId = document.getElementById('contratoIdSelecionado')?.value || '';
        const c = baseContratos.find(x => x.id === contratoId);
        return (c && c.deducoesPermitidas) ? c.deducoesPermitidas : [];
    }

    function ehOptanteSimples() {
        const forn = (document.getElementById('fornecedorValor')?.value || document.getElementById('buscaFornecedorT')?.value || '').trim();
        if (!forn) return false;
        const digForn = (forn || '').replace(/\D/g, '');
        const f = (baseFornecedores || []).find(x => {
            const cod = String(x.codigo || '').replace(/\D/g, '');
            const nome = (x.nome || '').toLowerCase();
            return (cod && digForn && cod === digForn) || (nome && forn.toLowerCase().includes(nome)) || (forn && nome.includes(forn.toLowerCase()));
        });
        return f && (f.optanteSimples === true || (f.optanteSimples + '').toLowerCase() === 'sim');
    }

    function temAlgumaNE39() {
        return (empenhosDaNotaAtual || []).some(e => String(e.nd || '').endsWith('39'));
    }

    function desenharBotoesCalcularDed() {
        const container = document.getElementById('containerBotoesCalcularDed');
        const aviso = document.getElementById('avisoDeducoesContrato');
        const infoOptante = document.getElementById('infoOptanteSimples');
        const btnOutras = document.getElementById('btnInserirOutrasDeducoes');
        if (!container) return;
        const permitidas = obterDeducoesPermitidasContrato();
        const optante = ehOptanteSimples();
        if (aviso) aviso.textContent = permitidas.length === 0 ? 'Nenhuma dedução vinculada ao contrato. Você pode incluir deduções diversas.' : (optante ? 'Clique para calcular cada dedução permitida pelo contrato.' : 'Clique para calcular cada dedução permitida pelo contrato.');
        if (infoOptante) infoOptante.textContent = optante ? 'Optante pelo Simples' : 'Não Optante';
        if (btnOutras) btnOutras.style.display = 'inline-block';
        container.innerHTML = '';
        const processamentoEditavel = podeEditarAba(1);
        if (btnOutras) btnOutras.disabled = !processamentoEditavel;
        permitidas.forEach(p => {
            const tipo = p.tipo || 'DDF025';
            const label = LABEL_TIPO[tipo] || tipo;
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'btn-default btn-small';
            btn.textContent = 'Calcular ' + (p.codigo || tipo) + ' - ' + label;
            btn.disabled = !processamentoEditavel;
            btn.onclick = () => abrirModalCalcularDeducao(p);
            container.appendChild(btn);
        });
    }

    function calcularDeducaoAutomaticamente(permitida, opcoes = {}) {
        const dedEnc = baseDeducoesEncargos.find(d => d.id === permitida.dedEncId || (d.codigo === permitida.codigo && d.tipo === permitida.tipo));
        const tipo = (dedEnc && dedEnc.tipo) || permitida.tipo || 'DDF025';
        if (tipo === 'DDF021' && !temAlgumaNE39()) return null;
        const baseVal = obterTotalTC();
        let aliquota = 11;
        if (dedEnc) {
            if (tipo === 'DDF021') aliquota = Number(dedEnc.aliquotaPadrao) || 11;
            else if (tipo === 'DDF025') aliquota = Number(dedEnc.aliquotaTotal) || 0;
            else if (tipo === 'DDR001') aliquota = Math.min(Number(dedEnc.aliquotaPadrao) || 5, Number(dedEnc.aliquotaMaxima) || 5);
        }
        const dataApuracao = (tipo === 'DDF021' || tipo === 'DDR001')
            ? (document.getElementById('dataEmissao')?.value || new Date().toISOString().slice(0, 10))
            : (document.getElementById('dataLiquidacao')?.value || new Date().toISOString().slice(0, 10));
        const valorCalculado = Math.round(baseVal * (aliquota / 100) * 100) / 100;
        return {
            dedEncId: permitida.dedEncId || dedEnc?.id,
            tipo,
            codigo: permitida.codigo || dedEnc?.codigo,
            descricao: permitida.descricao || dedEnc?.descricao,
            baseCalculo: baseVal,
            aliquota,
            valorCalculado,
            dataApuracao,
            natRendimento: dedEnc?.natRendimento,
            codReceita: dedEnc?.codReceita || permitida.codigo,
            _origemContrato: !!opcoes.origemContrato
        };
    }

    function recalcularDeducoesContratoSubstituindo() {
        const permitidas = obterDeducoesPermitidasContrato();
        const novas = [];
        (permitidas || []).forEach(p => {
            const calc = calcularDeducaoAutomaticamente(p, { origemContrato: true });
            if (!calc) return;
            const unico = (calc.tipo === 'DDF021' || calc.tipo === 'DDR001');
            if (unico && novas.some(x => x.tipo === calc.tipo)) return;
            novas.push(calc);
        });
        deducoesAplicadasAtual = novas;
        desenharDeducoesAplicadas();
        desenharResumoDeducoesLiquidacao();
    }

    let deducaoModalContexto = null;
    function abrirModalCalcularDeducao(permitida, editIndex = null) {
        if (!podeEditarAba(1)) {
            alert('Clique em "Editar Processamento" para alterar deduções.');
            return;
        }
        const contratoId = document.getElementById('contratoIdSelecionado')?.value || '';
        const dedEnc = baseDeducoesEncargos.find(d => d.id === permitida.dedEncId || (d.codigo === permitida.codigo && d.tipo === permitida.tipo));
        const tipo = (dedEnc && dedEnc.tipo) || permitida.tipo || 'DDF025';
        if (tipo === 'DDF021' && !temAlgumaNE39()) {
            alert('DDF021 (INSS) só se aplica a serviços (NE com ND terminando em 39). Nenhuma NE com ND 39 encontrada.');
            return;
        }
        const optante = ehOptanteSimples();
        if ((tipo === 'DDF025' || tipo === 'DDR001') && optante) {
            if (!confirm('Fornecedor é optante do Simples. Deseja mesmo incluir esta dedução?')) return;
        }
        deducaoModalContexto = { permitida, dedEnc, tipo, editIndex };
        const titulo = document.getElementById('modalCalcularDeducaoTitulo');
        const campos = document.getElementById('modalCalcularDeducaoCampos');
        if (titulo) titulo.textContent = 'Calcular ' + (LABEL_TIPO[tipo] || tipo);
        const edicao = (editIndex !== null && editIndex >= 0) ? (deducoesAplicadasAtual[editIndex] || null) : null;
        const baseTC = edicao ? (Number(edicao.baseCalculo) || 0) : obterTotalTC();
        let aliquota = 11;
        if (edicao) {
            aliquota = Number(edicao.aliquota) || 0;
        } else if (dedEnc) {
            if (tipo === 'DDF021') aliquota = Number(dedEnc.aliquotaPadrao) || 11;
            else if (tipo === 'DDF025') aliquota = Number(dedEnc.aliquotaTotal) || 0;
            else if (tipo === 'DDR001') aliquota = Math.min(Number(dedEnc.aliquotaPadrao) || 5, Number(dedEnc.aliquotaMaxima) || 5);
        }
        const dataApuracao = edicao?.dataApuracao || ((tipo === 'DDF021' || tipo === 'DDR001') ? (document.getElementById('dataEmissao')?.value || new Date().toISOString().slice(0,10)) : (document.getElementById('dataLiquidacao')?.value || new Date().toISOString().slice(0,10)));
        const valorCalc = Math.round(baseTC * (aliquota / 100) * 100) / 100;
        campos.innerHTML = `
            <div class="form-group"><label>Base de cálculo (R$):</label><input type="text" id="dedModalBase" value="${typeof formatarMoedaBR === 'function' ? formatarMoedaBR(baseTC) : baseTC.toFixed(2)}" data-moeda></div>
            <div class="form-group"><label>Alíquota (%):</label><input type="number" id="dedModalAliquota" step="0.01" value="${aliquota}" ${tipo === 'DDF025' ? 'readonly' : ''}></div>
            <div class="form-group"><label>Valor calculado (R$):</label><input type="text" id="dedModalValor" readonly value="${typeof formatarMoedaBR === 'function' ? formatarMoedaBR(valorCalc) : valorCalc.toFixed(2)}"></div>
            <div class="form-group"><label>Data apuração:</label><input type="date" id="dedModalDataApuracao" value="${dataApuracao}" ${tipo === 'DDF021' || tipo === 'DDR001' ? 'readonly' : ''}></div>
        `;
        const baseInp = document.getElementById('dedModalBase');
        const aliqInp = document.getElementById('dedModalAliquota');
        const recalc = () => {
            const b = typeof valorMoedaParaNumero === 'function' ? valorMoedaParaNumero(baseInp?.value || 0) : parseFloat(String(baseInp?.value || 0).replace(/[^\d,.-]/g,'').replace(',','.')) || 0;
            const a = parseFloat(aliqInp?.value || 0) || 0;
            const v = Math.round(b * (a / 100) * 100) / 100;
            const valEl = document.getElementById('dedModalValor');
            if (valEl) valEl.value = typeof formatarMoedaBR === 'function' ? formatarMoedaBR(v) : v.toFixed(2);
        };
        if (baseInp) baseInp.addEventListener('input', recalc);
        if (aliqInp) aliqInp.addEventListener('input', recalc);
        if (typeof aplicarMascaraMoedaBR === 'function') document.querySelectorAll('#modalCalcularDeducaoCampos [data-moeda]').forEach(el => { aplicarMascaraMoedaBR(el); el.addEventListener('input', function() { aplicarMascaraMoedaBR(this); }); el.addEventListener('blur', function() { aplicarMascaraMoedaBR(this); }); });
        document.getElementById('modalCalcularDeducao').style.display = 'flex';
    }

    document.getElementById('modalCalcularDeducaoDesistir')?.addEventListener('click', () => { document.getElementById('modalCalcularDeducao').style.display = 'none'; deducaoModalContexto = null; });
    document.getElementById('modalCalcularDeducaoAdicionar')?.addEventListener('click', function() {
        if (!deducaoModalContexto) return;
        const { permitida, dedEnc, tipo, editIndex } = deducaoModalContexto;
        const baseVal = typeof valorMoedaParaNumero === 'function' ? valorMoedaParaNumero(document.getElementById('dedModalBase')?.value || 0) : parseFloat(String(document.getElementById('dedModalBase')?.value || 0).replace(/[^\d,.-]/g,'').replace(',','.')) || 0;
        const aliquotaVal = parseFloat(document.getElementById('dedModalAliquota')?.value || 0) || 0;
        const valorCalc = Math.round(baseVal * (aliquotaVal / 100) * 100) / 100;
        const dataApuracao = document.getElementById('dedModalDataApuracao')?.value || '';
        const jaExiste = (tipo === 'DDF021' || tipo === 'DDR001') && deducoesAplicadasAtual.some((d, idx) => d.tipo === tipo && idx !== editIndex);
        if (jaExiste) { alert('Já existe uma dedução ' + (tipo === 'DDF021' ? 'INSS' : 'ISS') + ' neste TC. Remova-a antes de adicionar outra.'); return; }
        const item = {
            dedEncId: permitida.dedEncId || dedEnc?.id,
            tipo, codigo: permitida.codigo || dedEnc?.codigo, descricao: permitida.descricao || dedEnc?.descricao,
            baseCalculo: baseVal, aliquota: aliquotaVal, valorCalculado: valorCalc, dataApuracao,
            natRendimento: dedEnc?.natRendimento, codReceita: dedEnc?.codReceita
        };
        if (editIndex !== null && editIndex >= 0 && deducoesAplicadasAtual[editIndex]) deducoesAplicadasAtual[editIndex] = { ...deducoesAplicadasAtual[editIndex], ...item };
        else deducoesAplicadasAtual.push(item);
        document.getElementById('modalCalcularDeducao').style.display = 'none';
        deducaoModalContexto = null;
        desenharDeducoesAplicadas();
        desenharResumoDeducoesLiquidacao();
    });

    document.getElementById('btnInserirOutrasDeducoes')?.addEventListener('click', function() {
        if (!podeEditarAba(1)) {
            alert('Clique em "Editar Processamento" para alterar deduções.');
            return;
        }
        const permitidas = obterDeducoesPermitidasContrato();
        const idsPermitidos = new Set((permitidas || []).map(p => p.dedEncId || p.codigo + '|' + p.tipo));
        const outras = (baseDeducoesEncargos || []).filter(d => !idsPermitidos.has(d.id) && !idsPermitidos.has((d.codigo || '') + '|' + (d.tipo || '')));
        if (outras.length === 0) { alert('Não há outras deduções disponíveis no cadastro.'); return; }
        const opts = outras.map((d, i) => `${i + 1}. ${d.codigo} - ${LABEL_TIPO[d.tipo] || d.tipo} - ${(d.descricao || '').substring(0, 30)}`).join('\n');
        const idx = prompt('Escolha o número da dedução (1 a ' + outras.length + '):\n\n' + opts);
        const i = parseInt(idx, 10) - 1;
        if (isNaN(i) || i < 0 || i >= outras.length) return;
        abrirModalCalcularDeducao({ dedEncId: outras[i].id, tipo: outras[i].tipo, codigo: outras[i].codigo, descricao: outras[i].descricao });
    });

    function desenharDeducoesAplicadas() {
        const tbody = document.getElementById('tbodyDeducoesProcessamento');
        if (!tbody) return;
        tbody.innerHTML = '';
        const processamentoEditavel = podeEditarAba(1);
        (deducoesAplicadasAtual || []).forEach((d, i) => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${escapeHTML(LABEL_TIPO[d.tipo] || d.tipo)}</td>
                <td>${escapeHTML(d.codReceita || d.codigo || '-')}</td>
                <td>${typeof formatarMoedaBR === 'function' ? formatarMoedaBR(d.baseCalculo || 0) : (d.baseCalculo || 0).toFixed(2)}</td>
                <td>${escapeHTML(String(d.aliquota || 0))}%</td>
                <td>${typeof formatarMoedaBR === 'function' ? formatarMoedaBR(d.valorCalculado || 0) : (d.valorCalculado || 0).toFixed(2)}</td>
                <td>
                    <button type="button" class="btn-icon btn-edit-ded" data-index="${i}" title="Editar" ${processamentoEditavel ? '' : 'disabled'}>✏️</button>
                    <button type="button" class="btn-icon btn-rm-ded" data-index="${i}" title="Excluir" ${processamentoEditavel ? '' : 'disabled'}>🗑️</button>
                </td>`;
            tbody.appendChild(tr);
        });
        tbody.querySelectorAll('.btn-edit-ded').forEach(btn => btn.addEventListener('click', function() {
            if (!podeEditarAba(1)) return;
            const idx = parseInt(this.getAttribute('data-index'), 10);
            const d = deducoesAplicadasAtual[idx];
            if (!d) return;
            abrirModalCalcularDeducao({ dedEncId: d.dedEncId, tipo: d.tipo, codigo: d.codigo, descricao: d.descricao }, idx);
        }));
        tbody.querySelectorAll('.btn-rm-ded').forEach(btn => btn.addEventListener('click', function() {
            if (!podeEditarAba(1)) return;
            const idx = parseInt(this.getAttribute('data-index'), 10);
            if (!confirm('Confirma a exclusão desta dedução?')) return;
            deducoesAplicadasAtual.splice(idx, 1);
            desenharDeducoesAplicadas();
            desenharResumoDeducoesLiquidacao();
        }));
    }

    function desenharResumoDeducoesLiquidacao() {
        const tbody = document.getElementById('tbodyDeducoesLiquidacao');
        const elValorTC = document.getElementById('valorTCLiquidacao');
        const elTotalDed = document.getElementById('totalDeducoesLiquidacao');
        const elValorLiq = document.getElementById('valorLiquidoOB');
        if (!tbody) return;
        tbody.innerHTML = '';
        const valorTC = obterTotalTC();
        const totalDed = (deducoesAplicadasAtual || []).reduce((s, d) => s + (Number(d.valorCalculado) || 0), 0);
        const valorLiq = Math.max(0, valorTC - totalDed);
        (deducoesAplicadasAtual || []).forEach(d => {
            const tr = document.createElement('tr');
            tr.innerHTML = `<td>${escapeHTML(LABEL_TIPO[d.tipo] || d.tipo)}</td><td>${escapeHTML(d.codReceita || d.codigo || '-')}</td><td>${typeof formatarMoedaBR === 'function' ? formatarMoedaBR(d.baseCalculo || 0) : (d.baseCalculo || 0).toFixed(2)}</td><td>${d.aliquota || 0}%</td><td>${typeof formatarMoedaBR === 'function' ? formatarMoedaBR(d.valorCalculado || 0) : (d.valorCalculado || 0).toFixed(2)}</td><td>${escapeHTML(d.dataApuracao || '-')}</td>`;
            tbody.appendChild(tr);
        });
        if (elValorTC) elValorTC.textContent = 'R$ ' + (typeof formatarMoedaBR === 'function' ? formatarMoedaBR(valorTC) : valorTC.toFixed(2));
        if (elTotalDed) elTotalDed.textContent = 'R$ ' + (typeof formatarMoedaBR === 'function' ? formatarMoedaBR(totalDed) : totalDed.toFixed(2));
        if (elValorLiq) elValorLiq.textContent = 'R$ ' + (typeof formatarMoedaBR === 'function' ? formatarMoedaBR(valorLiq) : valorLiq.toFixed(2));
    }

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
        const btn = document.getElementById('btnAcaoEmpenhoNota');
        if (!btn) return;
        btn.textContent = (indiceEmpenhoEditando !== null) ? 'Salvar' : 'Adicionar';
    }

    function caixaVinculoEmpenhoAberta() {
        const box = document.getElementById('detalhesVinculoEmpenho');
        return !!(box && box.style.display !== 'none');
    }

    function atualizarBloqueioBotoesPrincipais() {
        const bloqueado = (tcSalvo() && abaEmEdicao !== null) || caixaVinculoEmpenhoAberta();
        ['btnDevolver', 'btnDarNovaEntrada', 'btnEnviarProcessamento', 'btnSalvarTitulo', 'btnCancelarTitulo'].forEach(id => {
            const btn = document.getElementById(id);
            if (!btn) return;
            btn.disabled = bloqueado;
            btn.classList.toggle('tc-btn-bloqueado', bloqueado);
        });
        atualizarEstadoSalvarAbaProcessamento();
    }

    function atualizarEstadoSalvarAbaProcessamento() {
        const btnSalvarProc = document.getElementById('btnSalvarAbaProcessamento');
        if (!btnSalvarProc) return;
        const bloquear = caixaVinculoEmpenhoAberta();
        btnSalvarProc.disabled = bloquear;
        btnSalvarProc.classList.toggle('tc-btn-bloqueado', bloquear);
    }

    function atualizarRotuloBotaoSalvarPrincipal() {
        const btn = document.getElementById('btnSalvarTitulo');
        if (!btn) return;
        btn.textContent = tcSalvo() ? '💾 Registrar Alterações' : '💾 Registrar TC';
    }

    function fecharCaixaVinculoEmpenho() {
        const box = document.getElementById('detalhesVinculoEmpenho');
        if (box) box.style.display = 'none';
        indiceEmpenhoEditando = null;
        empenhoTemporarioSelecionado = null;
        const nd = document.getElementById('vinculoND');
        if (nd) nd.value = '';
        const sub = document.getElementById('vinculoSubelemento');
        if (sub) sub.value = '';
        const val = document.getElementById('vinculoValor');
        if (val) val.value = '';
        const cc = document.getElementById('vinculoCentroCustos');
        if (cc) cc.value = '';
        const ug = document.getElementById('vinculoUG');
        if (ug) ug.value = '';
        atualizarBotaoAdicionarEmpenhoNaNota();
        atualizarBloqueioBotoesPrincipais();
    }

    window.desistirVinculoEmpenhoNota = function() {
        fecharCaixaVinculoEmpenho();
    };

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

        // Na edição, o subelemento deve ser recalculado pela NE selecionada (sobrescreve salvo).
        const neEdicao = obterEmpenhoPorNumero(v.numEmpenho);
        const opcoesSub = obterOpcoesSubelementoDaNE(neEdicao || v);
        configurarCampoSubelemento(opcoesSub, true);

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
        atualizarBloqueioBotoesPrincipais();
    }

    function obterEmpenhoPorNumero(numEmpenho) {
        const alvo = String(numEmpenho || '').trim();
        if (!alvo) return null;
        const alvo12 = alvo.slice(-12);
        return (baseEmpenhos || []).find(e => {
            const ne = String(e.numEmpenho || e.numNE || '').trim();
            return ne === alvo || ne.slice(-12) === alvo12;
        }) || null;
    }

    function obterOpcoesSubelementoDaNE(e) {
        if (!e) return [];
        const candidatos = [];
        const pushValor = (v) => {
            const s = String(v || '').trim();
            if (!s) return;
            // Aceita lista no mesmo campo: "01,02" / "01;02" / "01|02"
            s.split(/[;,|]/).forEach(p => {
                const limpo = String(p || '').trim().replace(/\D/g, '');
                if (!limpo) return;
                candidatos.push(limpo.padStart(2, '0').slice(-2));
            });
        };
        if (Array.isArray(e.subelementos)) e.subelementos.forEach(pushValor);
        pushValor(e.subelemento);
        pushValor(e.subitem);
        const unicos = Array.from(new Set(candidatos));
        return unicos.filter(v => /^\d{2}$/.test(v));
    }

    function configurarCampoSubelemento(opcoes, permitirManualSemOpcao) {
        const atual = document.getElementById('vinculoSubelemento');
        if (!atual) return;
        const parent = atual.parentNode;
        if (!parent) return;
        const valorAtual = String(atual.value || '').trim();

        let novoEl;
        if (opcoes.length > 1) {
            novoEl = document.createElement('select');
            novoEl.id = 'vinculoSubelemento';
            novoEl.maxLength = 2;
            novoEl.title = 'Selecione um subelemento disponível na NE';
            opcoes.forEach(op => {
                const o = document.createElement('option');
                o.value = op;
                o.textContent = op;
                novoEl.appendChild(o);
            });
            novoEl.value = opcoes.includes(valorAtual) ? valorAtual : opcoes[0];
        } else {
            novoEl = document.createElement('input');
            novoEl.type = 'text';
            novoEl.id = 'vinculoSubelemento';
            novoEl.maxLength = 2;
            novoEl.pattern = '[0-9]*';
            novoEl.placeholder = 'Ex: 01';
            novoEl.title = 'Apenas números, 2 dígitos';
            if (opcoes.length === 1) {
                novoEl.readOnly = true;
                novoEl.value = opcoes[0];
            } else {
                // Sem subelemento na NE: permite inclusão manual.
                novoEl.readOnly = !permitirManualSemOpcao ? true : false;
                novoEl.value = '';
            }
        }

        if (atual.nextSibling) parent.insertBefore(novoEl, atual.nextSibling);
        else parent.appendChild(novoEl);
        parent.removeChild(atual);
    }

    function normalizarCNPJ(v) {
        return String(v || '').replace(/\D/g, '').slice(0, 14);
    }

    function normalizarCNPJ14(v) {
        const dig = normalizarCNPJ(v);
        if (!dig) return '';
        return dig.length < 14 ? dig.padStart(14, '0') : dig;
    }

    function fornecedorDisplay(f) {
        const cnpj = normalizarCNPJ(f?.codigoNumerico || f?.codigo || '');
        const nome = String(f?.nome || f?.nomeFornecedor || '').trim();
        const cnpjFmt = cnpj ? (typeof formatarCNPJ === 'function' ? formatarCNPJ(cnpj) : cnpj) : '-';
        return nome ? `${cnpjFmt} - ${nome}` : cnpjFmt;
    }

    function obterFornecedorPorCnpj(cnpj) {
        const cnpjN = normalizarCNPJ(cnpj);
        if (!cnpjN) return null;
        return (baseFornecedores || []).find(f => normalizarCNPJ(f?.codigoNumerico || f?.codigo || '') === cnpjN) || null;
    }

    function extrairCnpjDoContrato(c) {
        if (!c) return '';
        const candidatos = [
            c.cnpjFornecedor,
            c.cnpj_fornecedor,
            c.cnpj,
            c.documentoFornecedor,
            c.documento_fornecedor,
            c.fornecedor,
            c.razaoSocial,
            c.empresa
        ];
        for (const cand of candidatos) {
            const cnpj = normalizarCNPJ(cand);
            if (cnpj.length === 14) return cnpj;
        }
        return '';
    }

    function cnpjEquivalente(a, b) {
        const na = normalizarCNPJ14(a);
        const nb = normalizarCNPJ14(b);
        if (!na || !nb) return false;
        if (na === nb) return true;
        const sa = na.replace(/^0+/, '');
        const sb = nb.replace(/^0+/, '');
        return !!sa && !!sb && sa === sb;
    }

    async function carregarContratosPorCnpj(cnpjN) {
        const cnpjCanon = normalizarCNPJ14(cnpjN);
        if (!cnpjCanon) return [];
        const cnpjSemZeroEsq = cnpjCanon.replace(/^0+/, '');
        const cnpjFmt = (typeof formatarCNPJ === 'function') ? formatarCNPJ(cnpjCanon) : cnpjCanon;
        const candidatos = Array.from(new Set([cnpjCanon, cnpjSemZeroEsq, cnpjFmt].filter(Boolean)));
        const campos = ['cnpjFornecedor', 'cnpj', 'cnpj_fornecedor'];

        try {
            const consultas = [];
            campos.forEach((campo) => candidatos.forEach((val) => consultas.push(db.collection('contratos').where(campo, '==', val).get())));
            const snaps = await Promise.allSettled(consultas);
            const porId = new Map();
            snaps.forEach((res) => {
                if (res.status !== 'fulfilled' || !res.value) return;
                res.value.docs.forEach((doc) => {
                    if (!porId.has(doc.id)) porId.set(doc.id, { id: doc.id, ...doc.data() });
                });
            });
            return Array.from(porId.values()).filter(c => cnpjEquivalente(extrairCnpjDoContrato(c), cnpjCanon));
        } catch (err) {
            // Fallback para base já carregada em memória quando houver restrição de query/regras.
            return (baseContratos || []).filter(c => cnpjEquivalente(extrairCnpjDoContrato(c), cnpjCanon));
        }
    }

    function mostrarSugestoesFornecedor() {
        const input = document.getElementById('buscaFornecedorT');
        const lista = document.getElementById('listaResultadosFornecedorT');
        if (!input || !lista || input.readOnly) return;

        const texto = (input.value || '').trim();
        const textoSemAcento = removerAcentos(texto.toLowerCase());
        const textoCnpj = normalizarCNPJ(texto);

        lista.innerHTML = '';
        if (textoSemAcento.length < 2 && textoCnpj.length < 2) return;

        const fornecedores = (baseFornecedores || [])
            .filter(f => f && f.ativo !== false)
            .filter(f => {
                const nome = removerAcentos(String(f.nome || '').toLowerCase());
                const cnpj = normalizarCNPJ(f.codigoNumerico || f.codigo);
                const codigoFmt = cnpj ? (typeof formatarCNPJ === 'function' ? removerAcentos(String(formatarCNPJ(cnpj)).toLowerCase()) : '') : '';
                const codigoTxt = String(f.codigo || '').toLowerCase();
                const cnpjMatch = textoCnpj ? cnpj.includes(textoCnpj) : false;
                const nomeMatch = nome.includes(textoSemAcento);
                const codigoMatch = codigoFmt.includes(textoSemAcento) || codigoTxt.includes(textoSemAcento);
                return nomeMatch || cnpjMatch || codigoMatch;
            })
            .slice(0, 20);

        if (fornecedores.length === 0) {
            lista.innerHTML = '<li style="padding:10px; color:#777; font-size:12px;">Nenhum fornecedor encontrado.</li>';
        } else {
            fornecedores.forEach(forn => {
                const li = document.createElement('li');
                li.textContent = fornecedorDisplay(forn);
                li.addEventListener('mousedown', (e) => {
                    e.preventDefault();
                    selecionarFornecedorPorCnpj(forn?.codigoNumerico || forn?.codigo || '');
                    lista.innerHTML = '';
                });
                lista.appendChild(li);
            });
        }
    }

    async function selecionarFornecedorPorCnpj(cnpjSelecionado) {
        const cnpjN = normalizarCNPJ14(cnpjSelecionado);
        const fornecedorObj = obterFornecedorPorCnpj(cnpjN);

        document.getElementById('fornecedorValor').value = cnpjN || '';
        const input = document.getElementById('buscaFornecedorT');
        if (input) {
            input.value = fornecedorObj ? fornecedorDisplay(fornecedorObj) : (cnpjN ? cnpjN : '');
            input.readOnly = true;
        }

        const btn = document.getElementById('limparFornecedorBtn');
        if (btn) btn.style.display = cnpjN ? 'block' : 'none';

        document.getElementById('contratoIdSelecionado').value = '';
        const sel = document.getElementById('contratoSelecionado');
        if (sel) {
            sel.disabled = !cnpjN;
            sel.innerHTML = '<option value="">Selecione o contrato</option>';
            if (cnpjN) {
                sel.innerHTML = '<option value="">Carregando contratos...</option>';
                try {
                    contratosFornecedorSelecionado = await carregarContratosPorCnpj(cnpjN);
                } catch (err) {
                    contratosFornecedorSelecionado = [];
                }
                sel.innerHTML = '<option value="">Selecione o contrato</option>';
                if (contratosFornecedorSelecionado.length === 0) {
                    sel.innerHTML = '<option value="">Nenhum contrato encontrado para o CNPJ selecionado</option>';
                }
                contratosFornecedorSelecionado.forEach(c => {
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
        contratosFornecedorSelecionado = [];
        const sel = document.getElementById('contratoSelecionado');
        if (sel) {
            sel.innerHTML = '<option value="">Selecione o fornecedor (CNPJ) primeiro</option>';
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
            const c = id ? ((contratosFornecedorSelecionado || []).find(x => x.id === id) || baseContratos.find(x => x.id === id)) : null;
            preencherDadosContrato(c);
            if (typeof desenharBotoesCalcularDed === 'function') desenharBotoesCalcularDed();
            if (typeof recalcularDeducoesContratoSubstituindo === 'function') recalcularDeducoesContratoSubstituindo();
        });
    }

    function configurarAutocompleteFornecedor() {
        const input = document.getElementById('buscaFornecedorT');
        const lista = document.getElementById('listaResultadosFornecedorT');
        if (!input || !lista || input.dataset.autocompleteBound === '1') return;
        input.dataset.autocompleteBound = '1';
        input.addEventListener('input', debounce(mostrarSugestoesFornecedor, 300));
        input.addEventListener('focus', function() { if (!this.readOnly && (this.value || '').trim().length >= 2) mostrarSugestoesFornecedor(); });
        const aplicarFornecedorDigitado = () => {
            if (input.readOnly) return;
            const cnpjDigitado = normalizarCNPJ(input.value || '');
            if (cnpjDigitado.length === 14) {
                selecionarFornecedorPorCnpj(cnpjDigitado);
            }
        };
        input.addEventListener('keydown', (ev) => {
            if (ev.key === 'Enter') {
                ev.preventDefault();
                aplicarFornecedorDigitado();
            }
        });
        input.addEventListener('blur', () => {
            aplicarFornecedorDigitado();
            setTimeout(() => { if (lista) lista.innerHTML = ''; }, 200);
        });
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

        // Filtro 2: tenta obter CNPJ por múltiplos campos do contrato.
        const normalizarCNPJ = (v) => String(v || '').replace(/\D/g, '').trim();
        const normalizarNome = (v) => removerAcentos(String(v || '').toLowerCase())
            .replace(/\d+/g, ' ')
            .replace(/[^\w\s]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        const extrairCnpjDoContrato = (c) => {
            if (!c) return '';
            const candidatos = [
                c.cnpj,
                c.cnpjFornecedor,
                c.cnpj_fornecedor,
                c.documentoFornecedor,
                c.documento_fornecedor,
                c.fornecedor,
                c.razaoSocial,
                c.empresa
            ];
            for (const cand of candidatos) {
                const cnpj = normalizarCNPJ(cand);
                if (cnpj.length === 14) return cnpj;
            }
            return '';
        };
        const cnpjContrato = extrairCnpjDoContrato(contratoSel);
        const nomeFornecedorContrato = normalizarNome(contratoSel.nomeFornecedor || contratoSel.fornecedor || contratoSel.razaoSocial || contratoSel.empresa || '');

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
                const nomeFavorecido = normalizarNome(e.favorecido || '');
                // Preferência: casar por CNPJ quando disponível; fallback: nome do favorecido.
                if (cnpjContrato && cnpjNE) {
                    if (cnpjNE !== cnpjContrato) return false;
                } else if (cnpjContrato && !cnpjNE) {
                    return false;
                } else if (!cnpjContrato) {
                    if (!nomeFornecedorContrato || !nomeFavorecido) return false;
                    const nomeCasa = nomeFavorecido.includes(nomeFornecedorContrato) || nomeFornecedorContrato.includes(nomeFavorecido);
                    if (!nomeCasa) return false;
                }
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
                const opcoesSub = obterOpcoesSubelementoDaNE(e);
                configurarCampoSubelemento(opcoesSub, true);
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
                atualizarBloqueioBotoesPrincipais();
                listaEmpenhosT.innerHTML = '';
                inputBuscaEmpenhoT.value = '';
            });
            listaEmpenhosT.appendChild(li);
        });
    }
    function obterSufixoNDPorTipoTC(tipoTC) {
        if (tipoTC === 'NFE') return '30 ou 52';
        if (tipoTC === 'NFSE' || tipoTC === 'FAT' || tipoTC === 'BO') return '39';
        if (tipoTC === 'OUT') return 'numérico válido';
        return '--';
    }
    function atualizarAvisoFiltroBuscaNE() {
        const el = document.getElementById('avisoFiltroNDTipoTC');
        if (!el) return;
        const tipoTC = (document.getElementById('tipoTC')?.value || '').trim();
        const yy = tipoTC || 'não selecionado';
        const xx = obterSufixoNDPorTipoTC(tipoTC);
        el.textContent = "(serão listadas apenas NE com ND final '" + xx + "' em coerência com o tipo de TC '" + yy + "')";
    }
    function configurarAvisoFiltroBuscaNE() {
        const selTipoTC = document.getElementById('tipoTC');
        if (!selTipoTC) {
            atualizarAvisoFiltroBuscaNE();
            return;
        }
        if (selTipoTC.dataset.ndHintBound !== '1') {
            selTipoTC.dataset.ndHintBound = '1';
            selTipoTC.addEventListener('change', atualizarAvisoFiltroBuscaNE);
        }
        atualizarAvisoFiltroBuscaNE();
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
            fecharCaixaVinculoEmpenho();
            atualizarBotaoAdicionarEmpenhoNaNota();
            return;
        }

        if (!empenhoTemporarioSelecionado) return alert("Selecione uma NE na busca.");
        const numEmp = (empenhoTemporarioSelecionado.numEmpenho || empenhoTemporarioSelecionado.numNE || '').trim();
        if (!numEmp) return alert("NE inválida. Selecione novamente pela busca.");
        empenhosDaNotaAtual.push({
            numEmpenho: numEmp,
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
        fecharCaixaVinculoEmpenho();
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
        atualizarAvisoFiltroBuscaNE();
        document.getElementById('dataExefin').value = t.dataExefin || '';
        document.getElementById('numTC').value = t.numTC || '';
        const valNF = parseFloat(t.valorNotaFiscal) || 0;
        document.getElementById('valorNotaFiscal').value = typeof formatarMoedaBR === 'function' ? ('R$ ' + formatarMoedaBR(valNF)) : (t.valorNotaFiscal || '');
        document.getElementById('dataEmissao').value = t.dataEmissao || '';
        document.getElementById('dataAteste').value = t.dataAteste || '';
        const fornecedorCnpj = t.fornecedorCnpj ? normalizarCNPJ(t.fornecedorCnpj) : '';
        if (fornecedorCnpj) {
            selecionarFornecedorPorCnpj(fornecedorCnpj).then(() => {
                const contratoLigado = (contratosFornecedorSelecionado || []).find(c =>
                    (c.numContrato || c.instrumento || '') === (t.instrumento || '')
                );
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
            });
        } else if (t.fornecedor) {
            // legado: tenta extrair CNPJ do texto concatenado "CNPJ - Nome"
            const legadoCnpj = normalizarCNPJ(t.fornecedor);
            if (legadoCnpj) {
                selecionarFornecedorPorCnpj(legadoCnpj);
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
        deducoesAplicadasAtual = (t.deducoesAplicadas || []).map(x => ({ ...x }));
        if (deducoesAplicadasAtual.length === 0 && (t.tributacoes || []).length > 0) {
            deducoesAplicadasAtual = (t.tributacoes || []).map(x => ({ tipo: x.tipo || 'DDF025', valorCalculado: parseFloat(x.valor) || 0, baseCalculo: 0, aliquota: 0 }));
        }
        const status = t.status || 'Rascunho';
        mostrarStepper(status);
        bloquearTabsPorStatus(status);
        desenharEmpenhosNota();
        desenharDeducoesAplicadas();
        desenharBotoesCalcularDed();
        desenharAuditoria(t);
        atualizarResumoHistoricoTC(t);
        desenharLiquidacao();
        desenharResumoDeducoesLiquidacao();
        desenharFinanceiro();
        abaEmEdicao = null;
        alteracoesPendentesAba = false;
        atualizarRotuloBotaoSalvarPrincipal();
        atualizarModoEdicaoAbas();
        atualizarBotoesEdicaoPorAba();
    }

    function desenharLiquidacao() {
        const tbody = document.getElementById('tbodyLiquidacao');
        if (!tbody) return;
        tbody.innerHTML = '';
        const lfAtivas = (baseLfPf || []).filter(r => r.ativo !== false);
        const liquidacaoEditavel = podeEditarAba(2);
        (empenhosDaNotaAtual || []).forEach((v, i) => {
            const tr = document.createElement('tr');
            const ccLabel = labelCentroCustos(v.centroCustosId);
            const ugLabel = labelUG(v.ugId);
            const opts = lfAtivas.map(r => {
                const lfVal = r.lf || '';
                const sel = (v.lf || '') === lfVal ? ' selected' : '';
                return '<option value="' + escapeHTML(lfVal) + '"' + sel + '>' + escapeHTML(lfVal) + '</option>';
            }).join('');
            const selectLf = '<select data-index="' + i + '" data-field="lf" class="select-lf-liquidacao" ' + (liquidacaoEditavel ? '' : 'disabled') + '><option value="">Selecione LF...</option>' + opts + '</select>';
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
            if (!podeEditarAba(2)) return;
            const idx = parseInt(this.getAttribute('data-index'));
            if (empenhosDaNotaAtual[idx]) {
                empenhosDaNotaAtual[idx].lf = this.value;
                const lfReg = lfAtivas.find(r => (r.lf || '') === this.value);
                empenhosDaNotaAtual[idx].pf = (lfReg && lfReg.pf) ? lfReg.pf : '';
                desenharLiquidacao();
                desenharResumoDeducoesLiquidacao();
            }
        }));
    }

    function desenharFinanceiro() {
        const tbody = document.getElementById('tbodyLFPF');
        if (!tbody) return;
        tbody.innerHTML = '';
        const financeiroEditavel = podeEditarAba(3);
        (empenhosDaNotaAtual || []).forEach((v, i) => {
            const tr = document.createElement('tr');
            const lfExib = v.lf ? escapeHTML(v.lf) : '-';
            tr.innerHTML = '<td>' + (typeof formatarNumEmpenhoVisivel === 'function' ? formatarNumEmpenhoVisivel(v.numEmpenho) : (v.numEmpenho || '-')) + '</td>' +
                '<td>R$ ' + (typeof formatarMoedaBR === 'function' ? formatarMoedaBR(v.valorVinculado || 0) : (v.valorVinculado || '0')) + '</td>' +
                '<td class="lf-readonly">' + lfExib + '</td>' +
                '<td><input type="text" data-index="' + i + '" data-field="pf" value="' + escapeHTML(v.pf || '') + '" placeholder="PF" ' + (financeiroEditavel ? '' : 'disabled') + '></td>';
            tbody.appendChild(tr);
        });
        tbody.querySelectorAll('input[data-field="pf"]').forEach(inp => inp.addEventListener('change', function() {
            if (!podeEditarAba(3)) return;
            const idx = parseInt(this.getAttribute('data-index'));
            if (empenhosDaNotaAtual[idx]) empenhosDaNotaAtual[idx].pf = this.value;
        }));
    }

    function desenharAuditoria(titulo) {
        const tbody = document.getElementById('tbodyAuditoria');
        if (!tbody) return;
        tbody.innerHTML = '';
        const historico = (obterHistorico(titulo || {}) || []).slice().sort((a, b) => {
            const da = (a?.data && a.data.toDate) ? a.data.toDate().getTime() : (a?.data ? new Date(a.data).getTime() : 0);
            const db = (b?.data && b.data.toDate) ? b.data.toDate().getTime() : (b?.data ? new Date(b.data).getTime() : 0);
            return db - da;
        });
        (historico || []).forEach(h => {
            const tr = document.createElement('tr');
            const data = formatarDataHistoricoBr(h.data || h.dataHora);
            const status = h.status || h.statusNovo || '-';
            const evento = h.evento || '-';
            const acao = h.acao || '-';
            const usuario = h.usuario || '-';
            const info = h.motivoInfo || h.motivoDevolucao || h.informacao || '-';
            tr.innerHTML = `<td>${escapeHTML(data)}</td><td>${escapeHTML(status)}</td><td>${escapeHTML(evento)}</td><td>${escapeHTML(acao)}</td><td>${escapeHTML(usuario)}</td><td>${escapeHTML(info)}</td>`;
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
        const fornecedorCnpj = normalizarCNPJ((document.getElementById('fornecedorValor').value || document.getElementById('buscaFornecedorT')?.value || '').trim());
        const fornecedorObj = fornecedorCnpj ? obterFornecedorPorCnpj(fornecedorCnpj) : null;
        const fornecedorNome = fornecedorObj ? (fornecedorObj.nome || fornecedorObj.nomeFornecedor || '') : '';
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
        if (!fornecedorCnpj || !instrumento) return alert("Selecione o Fornecedor (CNPJ) e o Contrato.");
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
            fornecedorCnpj: escapeHTML(fornecedorCnpj),
            fornecedorNome: escapeHTML(fornecedorNome),
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
            deducoesAplicadas: deducoesAplicadasAtual,
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
        const dadosSanitizados = normalizarParaFirestore(dados);

        // Descobre qual aba está ativa (0 = Dados básicos / Rascunho)
        const abaAtivaEl = document.querySelector('.tab-tc.ativo');
        const indiceAbaAtiva = abaAtivaEl ? parseInt(abaAtivaEl.getAttribute('data-tab') || '0', 10) : 0;

        if (salvandoApenasAba) {
            dados.status = statusAtual || 'Rascunho';
            novoStatus = dados.status;
        } else if (indiceAbaAtiva === 0) {
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
            const eraNovo = (fbID === '-1' || !fbID);
            const evento = eraNovo ? 'Criação' : (salvandoApenasAba ? 'Salvar Aba' : 'Salvar TC');
            const acao = eraNovo ? 'Criado por' : `${nomeAbaPorIndice(indiceAbaAtiva)}/Editado por`;
            const infoHistorico = informacaoHistoricoPendente || ((statusAtual !== novoStatus) ? (`Mudança de status: ${statusAtual} -> ${novoStatus}`) : '');
            const histEntry = construirEntradaHistorico({
                status: novoStatus,
                evento: evento,
                acao: acao,
                info: infoHistorico,
                aba: indiceAbaAtiva
            });
            let docId = fbID;
            if (eraNovo) {
                dadosSanitizados.status = dadosSanitizados.status || 'Rascunho';
                dadosSanitizados.historico = [histEntry];
                dadosSanitizados.historicoStatus = [histEntry];
                dadosSanitizados.criado_em = firebase.firestore.FieldValue.serverTimestamp();
                const ref = await db.collection('titulos').add(dadosSanitizados);
                docId = ref.id;
            } else {
                const doc = await db.collection('titulos').doc(fbID).get();
                const hist = obterHistorico(doc.data() || {});
                hist.push(histEntry);
                dadosSanitizados.historico = hist;
                dadosSanitizados.historicoStatus = hist;
                dadosSanitizados.editado_em = firebase.firestore.FieldValue.serverTimestamp();
                await db.collection('titulos').doc(fbID).update(dadosSanitizados);
            }

            // Se o TC tem NP preenchida, atualiza a coleção "np" com o vínculo do TC.
            if (dadosSanitizados.np && String(dadosSanitizados.np).trim()) {
                try {
                    await vincularTituloNaNP(docId, dadosSanitizados.np, dadosSanitizados.dataLiquidacao);
                } catch (e) {
                    // Falha ao vincular NP não impede salvar o TC.
                    console.warn('Falha ao vincular TC na NP:', e);
                }
            }
            esconderLoading();

            if (salvandoApenasAba) {
                // No primeiro "Salvar Aba", o documento já é criado no BD.
                // Atualiza o formulário com o docId para evitar criar outro TC ao clicar em "Registrar TC".
                if (eraNovo && docId) {
                    document.getElementById('editIndexTitulo').value = docId;
                    if (!document.getElementById('idProc').value) {
                        document.getElementById('idProc').value = dadosSanitizados.idProc || '';
                    }
                    atualizarRotuloBotaoSalvarPrincipal();
                }
                salvandoApenasAba = false;
                informacaoHistoricoPendente = '';
                abaEmEdicao = null;
                alteracoesPendentesAba = false;
                atualizarModoEdicaoAbas();
                atualizarBotoesEdicaoPorAba();
                const form = document.getElementById('formTitulo');
                const fecharAposSalvar = form && form.dataset.tcFecharAposSalvar === '1';
                if (form) delete form.dataset.tcFecharAposSalvar;
                if (fecharAposSalvar) {
                    if (typeof acaoPendenteDeSaida === 'function') {
                        const acao = acaoPendenteDeSaida;
                        acaoPendenteDeSaida = null;
                        acao();
                    } else {
                        voltarParaListaTitulos();
                    }
                    return;
                }
                alert("Dados da aba salvos com sucesso.");
                return;
            }

            if (eraNovo && novoStatus === 'Rascunho') {
                document.getElementById('editIndexTitulo').value = docId;
                atualizarRotuloBotaoSalvarPrincipal();
                window._modalPrimeiroSalvoDocId = docId;
                document.getElementById('modalPrimeiroSalvo').style.display = 'flex';
                return;
            }
            alert("TC salvo com sucesso." + (dadosSanitizados.idProc ? ' Número: ' + dadosSanitizados.idProc : ''));
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
        if (!usuarioPodeTramitarTC()) return alert('Acesso negado para tramitação.');
        mostrarLoading();
        try {
            await encaminharTC(docId, 'Em Processamento', false);
            alert("TC encaminhado para Processamento.");
            voltarParaListaTitulos();
        } catch (err) {
            alert("Erro ao enviar: " + (err.message || err));
        } finally {
            esconderLoading();
        }
    });

    document.getElementById('btnEnviarProcessamento')?.addEventListener('click', async function() {
        const fbID = document.getElementById('editIndexTitulo').value;
        if (fbID === '-1' || !fbID) return alert("Salve o TC primeiro.");
        const t = baseTitulos.find(x => x.id === fbID);
        const statusAtual = t?.status || 'Rascunho';
        const destino = statusAtual === 'Em Processamento' ? 'Em Liquidação' : 'Em Processamento';
        const pergunta = destino === 'Em Liquidação'
            ? 'Confirmar envio para Liquidação?'
            : 'Confirmar encaminhamento para Processamento?';
        if (!confirm(pergunta)) return;
        mostrarLoading();
        try {
            await encaminharTC(fbID, destino, false);
            alert(destino === 'Em Liquidação' ? 'TC enviado para Liquidação.' : 'TC encaminhado para Processamento.');
            voltarParaListaTitulos();
        } catch (err) {
            alert("Erro ao encaminhar: " + (err.message || err));
        } finally {
            esconderLoading();
        }
    });

    document.getElementById('btnCancelarTitulo')?.addEventListener('click', function() {
        if (tentarSairComPendencia(() => voltarParaListaTitulos())) return;
        const fbID = document.getElementById('editIndexTitulo').value;
        if (fbID === '-1' || !fbID) {
            if (document.getElementById('numTC').value || document.getElementById('valorNotaFiscal').value) {
                if (!confirm("Há dados não salvos. Deseja realmente fechar? As alterações serão perdidas.")) return;
            }
        }
        voltarParaListaTitulos();
    });

    window.addEventListener('beforeunload', function(e) {
        if (abaEmEdicao !== null && alteracoesPendentesAba) {
            e.preventDefault();
            e.returnValue = '';
        }
    });

    function abrirModalDevolucao(idsSelecionados) {
        if (!usuarioPodeTramitarTC()) return alert('Acesso negado para tramitação.');
        if (!Array.isArray(idsSelecionados) || idsSelecionados.length === 0) return;
        document.getElementById('devolverMotivo').value = '';
        document.getElementById('devolverNome').value = '';
        const dataHoraEl = document.getElementById('devolverDataHora');
        if (dataHoraEl) dataHoraEl.value = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);
        limparOIDestino();
        window._devolverTcIds = idsSelecionados;
        document.getElementById('modalDevolver').style.display = 'flex';
    }

    document.getElementById('btnDevolver')?.addEventListener('click', function() {
        const fbID = document.getElementById('editIndexTitulo').value;
        if (fbID === '-1') return alert("Salve o TC primeiro.");
        abrirModalDevolucao([fbID]);
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
        window._devolverTcIds = null;
    });

    document.getElementById('modalDevolverConfirmar')?.addEventListener('click', async function() {
        const ids = Array.isArray(window._devolverTcIds) ? window._devolverTcIds : [];
        const motivo = (document.getElementById('devolverMotivo').value || '').trim();
        const nome = (document.getElementById('devolverNome').value || '').trim();
        const dataHoraDev = (document.getElementById('devolverDataHora')?.value || '').trim();
        const oiDestinoId = (document.getElementById('oiDestinoId').value || '').trim();
        if (!motivo) return alert("Informe o motivo da devolução (obrigatório).");
        if (!dataHoraDev) return alert("Informe a data/hora da devolução.");
        if (!oiDestinoId) return alert("Selecione a OI de Destino.");
        if (!ids.length) return;
        document.getElementById('modalDevolver').style.display = 'none';
        window._devolverTcIds = null;
        const dataDev = dataHoraDev.slice(0, 10);
        mostrarLoading();
        try {
            for (const fbID of ids) {
                const t = baseTitulos.find(x => x.id === fbID);
                if (!t) continue;
                const statusAtual = t.status || 'Rascunho';
                if (!(statusAtual === 'Rascunho' || statusAtual === 'Em Processamento')) continue;
                const entradaSaida = Array.isArray(t?.entradaSaida) ? [...t.entradaSaida] : [];
                entradaSaida.push({ tipo: 'saida', nome: nome || null, oiDestino: oiDestinoId, dataDevolucao: dataDev, dataHoraDevolucao: dataHoraDev });
                const hist = obterHistorico(t || {});
                const info = [
                    `Motivo: ${motivo}`,
                    nome ? `Recebedor: ${nome}` : '',
                    `OI destino: ${oiDestinoId}`,
                    `Data/Hora: ${dataHoraDev}`,
                    ids.length > 1 ? 'Operação em bloco' : ''
                ].filter(Boolean).join(' | ');
                hist.push(construirEntradaHistorico({
                    status: 'Devolvido',
                    evento: 'Devolução de TC',
                    acao: 'Devolvido por',
                    info,
                    aba: null
                }));
                await db.collection('titulos').doc(fbID).update({
                    status: 'Devolvido',
                    entradaSaida,
                    historico: hist,
                    historicoStatus: hist,
                    editado_em: firebase.firestore.FieldValue.serverTimestamp()
                });
            }
            alert(ids.length > 1 ? "TCs devolvidos em bloco." : "TC devolvido.");
            if (ids.length === 1) voltarParaListaTitulos();
            else {
                titulosSelecionados.clear();
                atualizarTabelaTitulos();
                atualizarUIselecao();
            }
        } catch (err) {
            alert("Erro: " + (err.message || err));
        } finally {
            esconderLoading();
        }
    });

    function abrirModalNovaEntrada(idsSelecionados) {
        if (!Array.isArray(idsSelecionados) || idsSelecionados.length === 0) return;
        document.getElementById('novaEntradaData').value = new Date().toISOString().slice(0, 10);
        limparNovaEntradaOI();
        const entregadorEl = document.getElementById('novaEntradaEntregador');
        if (entregadorEl) entregadorEl.value = '';
        const obsEl = document.getElementById('novaEntradaObservacao');
        if (obsEl) obsEl.value = '';
        window._novaEntradaTcIds = idsSelecionados;
        document.getElementById('modalNovaEntrada').style.display = 'flex';
    }

    document.getElementById('btnDarNovaEntrada')?.addEventListener('click', function() {
        const fbID = document.getElementById('editIndexTitulo').value;
        if (fbID === '-1') return;
        abrirModalNovaEntrada([fbID]);
    });

    document.getElementById('modalNovaEntradaCancelar')?.addEventListener('click', () => {
        document.getElementById('modalNovaEntrada').style.display = 'none';
        window._novaEntradaTcIds = null;
    });

    document.getElementById('modalNovaEntradaConfirmar')?.addEventListener('click', async function() {
        const ids = Array.isArray(window._novaEntradaTcIds) ? window._novaEntradaTcIds : [];
        const dataEntrada = (document.getElementById('novaEntradaData').value || '').trim();
        const oiOrigemId = (document.getElementById('novaEntradaOIId').value || '').trim();
        const entregador = (document.getElementById('novaEntradaEntregador')?.value || '').trim();
        const observacao = (document.getElementById('novaEntradaObservacao')?.value || '').trim();
        if (!dataEntrada) return alert("Informe a data de entrada.");
        if (!oiOrigemId) return alert("Selecione a OI de Origem.");
        if (!ids.length) return;
        document.getElementById('modalNovaEntrada').style.display = 'none';
        window._novaEntradaTcIds = null;
        mostrarLoading();
        try {
            for (const fbID of ids) {
                const t = baseTitulos.find(x => x.id === fbID);
                const entradaSaida = Array.isArray(t?.entradaSaida) ? [...t.entradaSaida] : [];
                entradaSaida.push({ tipo: 'entrada', data: dataEntrada, oiOrigem: oiOrigemId, entregador: entregador || null, observacao: observacao || null });

                const hist = obterHistorico(t || {});
                const info = [
                    'Nova entrada registrada',
                    `Data: ${dataEntrada}`,
                    `OI origem: ${oiOrigemId}`,
                    entregador ? `Entregador: ${entregador}` : '',
                    observacao ? `Obs: ${observacao}` : ''
                ].filter(Boolean).join(' | ');
                const histEntry = construirEntradaHistorico({
                    status: 'Rascunho',
                    evento: 'Nova Entrada',
                    acao: 'Nova entrada registrada por',
                    info: info,
                    aba: null
                });
                hist.push(histEntry);

                await db.collection('titulos').doc(fbID).update({
                    status: 'Rascunho',
                    dataExefin: dataEntrada,
                    oiEntregou: oiOrigemId,
                    observacoes: observacao ? observacao : (t?.observacoes || ''),
                    entradaSaida,
                    historico: hist,
                    historicoStatus: hist,
                    editado_em: firebase.firestore.FieldValue.serverTimestamp()
                });
            }
            alert(ids.length > 1 ? "Nova entrada registrada em bloco." : "Nova entrada registrada. TC em Rascunho.");
            if (ids.length === 1) {
                editarTitulo(ids[0]);
            } else {
                titulosSelecionados.clear();
                atualizarTabelaTitulos();
                atualizarUIselecao();
            }
        } catch (err) {
            alert("Erro: " + (err.message || err));
        } finally {
            esconderLoading();
        }
    });

    document.getElementById('btnNovaEntradaBloco')?.addEventListener('click', function() {
        const ids = Array.from(titulosSelecionados);
        if (!ids.length) return alert("Selecione ao menos um TC.");
        const titulosSel = ids.map(id => baseTitulos.find(t => t.id === id)).filter(Boolean);
        const ois = Array.from(new Set(titulosSel.map(t => String(t?.oiEntregou || '').trim()).filter(Boolean)));
        if (ois.length > 1) {
            const ok = confirm("Há OI diferentes entre os TC selecionados. Deseja continuar?");
            if (!ok) return;
        }
        abrirModalNovaEntrada(ids);
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
        const M = { l: 10, r: 10, t: 12, b: 12 };
        const W = 210 - M.l - M.r;
        let y = M.t;
        const now = new Date().toLocaleString('pt-BR');
        const moeda = (n) => 'R$ ' + (Number(n || 0)).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        const dataHist = (v) => (v && v.toDate) ? v.toDate().toLocaleString('pt-BR') : (v || '-');
        const garantirEspaco = (h) => { if (y + h > 297 - M.b) { docPDF.addPage(); y = M.t; } };
        const textoMulti = (txt, x, yy, maxW, fs = 8.5) => {
            docPDF.setFontSize(fs);
            const linhas = docPDF.splitTextToSize(String(txt || '-'), maxW);
            docPDF.text(linhas, x, yy);
            return linhas.length;
        };

        function cabecalhoPagina() {
            docPDF.setDrawColor(120);
            docPDF.rect(M.l, y, W, 12);
            docPDF.setFont('helvetica', 'bold');
            docPDF.setFontSize(11);
            docPDF.text('SIS EXE FIN - TITULO DE CREDITO', M.l + 3, y + 5);
            docPDF.setFont('helvetica', 'normal');
            docPDF.setFontSize(8.5);
            docPDF.text(`Gerado em: ${now}`, M.l + 3, y + 10);
            docPDF.text(`Usuario: ${usuarioLogadoEmail || '-'}`, M.l + 75, y + 10);
            y += 15;
        }

        function bloco(titulo, linhas) {
            const headerH = 6;
            let corpoH = 4;
            linhas.forEach(l => {
                const label = String(l.label || '-');
                const value = String(l.value || '-');
                const linhasTxt = Math.max(
                    docPDF.splitTextToSize(label, 42).length,
                    docPDF.splitTextToSize(value, W - 52).length
                );
                corpoH += Math.max(4.5, linhasTxt * 3.8);
            });
            const totalH = headerH + corpoH + 2;
            garantirEspaco(totalH + 2);

            docPDF.setDrawColor(120);
            docPDF.rect(M.l, y, W, totalH);
            docPDF.setFillColor(238, 242, 247);
            docPDF.rect(M.l, y, W, headerH, 'F');
            docPDF.setFont('helvetica', 'bold');
            docPDF.setFontSize(9);
            docPDF.text(titulo.toUpperCase(), M.l + 2, y + 4.2);
            y += headerH + 2;

            linhas.forEach(l => {
                const labelX = M.l + 2;
                const valueX = M.l + 44;
                docPDF.setFont('helvetica', 'bold');
                const nLab = textoMulti(l.label, labelX, y + 3.2, 40, 8.2);
                docPDF.setFont('helvetica', 'normal');
                const nVal = textoMulti(l.value, valueX, y + 3.2, W - 48, 8.4);
                const salto = Math.max(nLab, nVal) * 3.8 + 1.2;
                y += salto;
            });
            y += 2;
        }

        cabecalhoPagina();
        const fornecedorFmt = t.fornecedorCnpj ? (typeof formatarCNPJ === 'function' ? formatarCNPJ(t.fornecedorCnpj) : t.fornecedorCnpj) : (t.fornecedor || '-');
        const fornecedorNome = t.fornecedorNome || '-';
        bloco('Identificacao do TC', [
            { label: 'ID-PROC', value: t.idProc || '-' },
            { label: 'Numero TC', value: t.numTC || '-' },
            { label: 'Status', value: (t.status || 'Rascunho') + (t.inativo ? ' (INATIVO)' : '') },
            { label: 'Data EXEFIN', value: t.dataExefin || '-' },
            { label: 'OI de Origem', value: t.oiEntregou || '-' }
        ]);

        bloco('Dados do fornecedor e contrato', [
            { label: 'Fornecedor', value: `${fornecedorFmt} - ${fornecedorNome}` },
            { label: 'Contrato', value: t.instrumento || '-' },
            { label: 'RC', value: t.rc || '-' },
            { label: 'Valor TC', value: moeda(t.valorNotaFiscal) },
            { label: 'Data Emissao', value: t.dataEmissao || '-' },
            { label: 'Data Ateste', value: t.dataAteste || '-' },
            { label: 'Observacoes', value: t.observacoes || '-' }
        ]);

        const empTxt = (t.empenhosVinculados || []).length
            ? (t.empenhosVinculados || []).map((v, i) =>
                `${i + 1}. NE ${v.numEmpenho || '-'} | ND ${v.nd || '-'} | Subel ${v.subelemento || '-'} | ${moeda(v.valorVinculado)} | LF ${v.lf || '-'} | PF ${v.pf || '-'}`
            ).join('\n')
            : 'Nenhum empenho vinculado.';
        bloco('Processamento - Empenhos', [{ label: 'Lista', value: empTxt }]);

        const deds = t.deducoesAplicadas || t.tributacoes || [];
        const dedTxt = deds.length
            ? deds.map((d, i) => {
                const val = d.valorCalculado != null ? d.valorCalculado : d.valor;
                return `${i + 1}. ${d.tipo || '-'} | Base ${moeda(d.baseCalculo)} | Aliq ${d.aliquota || 0}% | Valor ${moeda(val)}`;
            }).join('\n')
            : 'Nenhuma deducao/encargo aplicado.';
        bloco('Processamento - Deducoes e encargos', [{ label: 'Lista', value: dedTxt }]);

        bloco('Liquidacao e financeiro', [
            { label: 'NP', value: t.np || '-' },
            { label: 'Data Liquidacao', value: t.dataLiquidacao || '-' },
            { label: 'OP', value: t.op || '-' }
        ]);

        const hist = (t.historicoStatus || []).slice().sort((a, b) => {
            const da = a?.data?.toDate ? a.data.toDate().getTime() : new Date(a?.data || 0).getTime();
            const db = b?.data?.toDate ? b.data.toDate().getTime() : new Date(b?.data || 0).getTime();
            return db - da;
        });
        const histTxt = hist.length
            ? hist.map((h, i) => `${i + 1}. ${dataHist(h.data)} | ${h.status || h.statusNovo || '-'} | ${h.evento || '-'} | ${h.usuario || '-'}${h.motivoInfo ? ' | ' + h.motivoInfo : ''}${h.motivoDevolucao ? ' | ' + h.motivoDevolucao : ''}`).join('\n')
            : 'Sem historico.';
        bloco('Historico', [{ label: 'Eventos', value: histTxt }]);

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

    function downloadModeloTC() {
        const headers = [
            'idProc', 'tipoTC', 'dataExefin', 'numTC', 'fornecedorCnpj', 'fornecedorNome', 'instrumento',
            'valorNotaFiscal', 'dataEmissao', 'dataAteste', 'status', 'np', 'dataLiquidacao', 'op',
            'ne1', 'nd1', 'subelemento1', 'valor1', 'centroCustosId1', 'ugId1', 'lf1', 'pf1',
            'dedTipo1', 'dedCodigo1', 'dedBase1', 'dedAliquota1', 'dedValor1', 'dedDataApuracao1'
        ];
        const exemplo = [
            'PROC-001', 'NFSE', '2026-03-23', '1234', '00.064.702/0003-09', 'SKM ELETRO ELETRONICA LTDA',
            '00069/2024', '4564,44', '2026-03-23', '2026-03-23', 'Em Processamento',
            '741000000012026NP000001', '2026-03-23', '2026OP000049',
            '2026NE000079', '339039', '17', '1245,00', 'CC-001', '741000', 'LF-001', 'PF-001',
            'DDR001', '1160', '4564,44', '5', '228,22', '2026-03-23'
        ];
        const csv = headers.join(',') + '\n' + exemplo.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'modelo-tc.csv';
        a.click();
        URL.revokeObjectURL(a.href);
    }
    window.downloadModeloTC = downloadModeloTC;

    function valorNumerico(v) {
        if (v === null || v === undefined) return 0;
        const s = String(v).trim();
        if (!s) return 0;
        if (typeof valorMoedaParaNumero === 'function') return valorMoedaParaNumero(s);
        return parseFloat(s.replace(/\./g, '').replace(',', '.')) || 0;
    }

    function valorTexto(row, aliases) {
        for (const k of aliases) {
            if (Object.prototype.hasOwnProperty.call(row, k)) {
                const v = String(row[k] ?? '').trim();
                if (v) return v;
            }
        }
        return '';
    }

    function valorDataISO(raw) {
        const s = String(raw || '').trim();
        if (!s) return '';
        if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
        const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
        if (m) return `${m[3]}-${m[2]}-${m[1]}`;
        return s;
    }

    function parseEmpenhosAchatados(row) {
        const empenhos = [];
        for (let i = 1; i <= 99; i++) {
            const ne = valorTexto(row, [`ne${i}`, `NE${i}`, `numEmpenho${i}`, `num_empenho_${i}`]);
            if (!ne) continue;
            empenhos.push({
                numEmpenho: ne,
                nd: valorTexto(row, [`nd${i}`, `ND${i}`]),
                subelemento: valorTexto(row, [`subelemento${i}`, `subel${i}`, `subelemento_${i}`]),
                valorVinculado: valorNumerico(valorTexto(row, [`valor${i}`, `valorEmpenho${i}`, `valor_empenho_${i}`])),
                centroCustosId: valorTexto(row, [`centroCustosId${i}`, `centroCustos${i}`, `cc${i}`]),
                ugId: valorTexto(row, [`ugId${i}`, `ug${i}`]),
                lf: valorTexto(row, [`lf${i}`, `LF${i}`]),
                pf: valorTexto(row, [`pf${i}`, `PF${i}`])
            });
        }
        return empenhos;
    }

    function parseDeducoesAchatadas(row) {
        const deducoes = [];
        for (let i = 1; i <= 99; i++) {
            const tipo = valorTexto(row, [`dedTipo${i}`, `ded_tipo${i}`, `tipoDed${i}`]);
            if (!tipo) continue;
            deducoes.push({
                tipo,
                codigo: valorTexto(row, [`dedCodigo${i}`, `ded_codigo${i}`, `codDed${i}`]),
                codReceita: valorTexto(row, [`dedCodigo${i}`, `ded_codigo${i}`, `codReceita${i}`]),
                baseCalculo: valorNumerico(valorTexto(row, [`dedBase${i}`, `ded_base${i}`, `baseDed${i}`])),
                aliquota: valorNumerico(valorTexto(row, [`dedAliquota${i}`, `ded_aliquota${i}`, `aliquotaDed${i}`])),
                valorCalculado: valorNumerico(valorTexto(row, [`dedValor${i}`, `ded_valor${i}`, `valorDed${i}`])),
                dataApuracao: valorDataISO(valorTexto(row, [`dedDataApuracao${i}`, `ded_data_apuracao${i}`, `dataApuracaoDed${i}`]))
            });
        }
        return deducoes;
    }

    function montarAtualizacaoTC(row) {
        // Aceita legado: coluna "fornecedor" no formato "CNPJ - Nome"
        const fornecedorTexto = valorTexto(row, ['fornecedor', 'FORNECEDOR']);
        const fornecedorCnpjRaw = valorTexto(row, [
            'fornecedorCnpj', 'FORNECEDOR_CNPJ', 'fornecedor_cnpj', 'cnpjFornecedor', 'CNPJ_FORNECEDOR', 'cnpj_fornecedor'
        ]);
        const fornecedorNomeRaw = valorTexto(row, [
            'fornecedorNome', 'FORNECEDOR_NOME', 'fornecedor_nome', 'nomeFornecedor', 'NOME_FORNECEDOR', 'nome_fornecedor'
        ]);

        const fornecedorCnpjLegado = fornecedorTexto ? normalizarCNPJ(fornecedorTexto) : '';
        let fornecedorCnpj = normalizarCNPJ(fornecedorCnpjRaw) || fornecedorCnpjLegado || '';
        let fornecedorNome = fornecedorNomeRaw || '';

        if ((!fornecedorNome || fornecedorNome === '') && fornecedorTexto) {
            const m = String(fornecedorTexto).trim().match(/-\s*(.+)$/);
            fornecedorNome = (m && m[1]) ? m[1].trim() : String(fornecedorTexto).trim().replace(/\d+/g, ' ').replace(/[-./\\]/g, ' ').replace(/\s+/g, ' ').trim();
        }

        const obrigatorios = {
            idProc: valorTexto(row, ['idProc', 'ID_PROC', 'id_proc']),
            tipoTC: valorTexto(row, ['tipoTC', 'TIPO_TC', 'tipo_tc']),
            dataExefin: valorDataISO(valorTexto(row, ['dataExefin', 'DATA_EXEFIN', 'data_exefin'])),
            numTC: valorTexto(row, ['numTC', 'NUM_TC', 'num_tc']),
            fornecedorCnpj: fornecedorCnpj,
            fornecedorNome: valorTexto(row, ['fornecedorNome', 'FORNECEDOR_NOME', 'fornecedor_nome', 'nomeFornecedor', 'NOME_FORNECEDOR', 'nome_fornecedor']) || fornecedorNome,
            instrumento: valorTexto(row, ['instrumento', 'INSTRUMENTO', 'contrato']),
            valorNotaFiscal: valorNumerico(valorTexto(row, ['valorNotaFiscal', 'VALOR_NOTA_FISCAL', 'valor_nota_fiscal'])),
            dataEmissao: valorDataISO(valorTexto(row, ['dataEmissao', 'DATA_EMISSAO', 'data_emissao'])),
            dataAteste: valorDataISO(valorTexto(row, ['dataAteste', 'DATA_ATESTE', 'data_ateste'])),
            status: valorTexto(row, ['status', 'STATUS'])
        };
        const faltando = Object.entries(obrigatorios).filter(([, v]) => v === '' || v === 0).map(([k]) => k);
        if (faltando.length > 0) {
            return { erro: 'Campos obrigatórios ausentes: ' + faltando.join(', ') };
        }
        const update = {
            tipoTC: obrigatorios.tipoTC,
            dataExefin: obrigatorios.dataExefin,
            numTC: obrigatorios.numTC,
            fornecedorCnpj: obrigatorios.fornecedorCnpj,
            fornecedorNome: obrigatorios.fornecedorNome,
            instrumento: obrigatorios.instrumento,
            valorNotaFiscal: obrigatorios.valorNotaFiscal,
            dataEmissao: obrigatorios.dataEmissao,
            dataAteste: obrigatorios.dataAteste,
            status: obrigatorios.status,
            np: valorTexto(row, ['np', 'NP']),
            dataLiquidacao: valorDataISO(valorTexto(row, ['dataLiquidacao', 'DATA_LIQUIDACAO', 'data_liquidacao'])),
            op: valorTexto(row, ['op', 'OP']),
            empenhosVinculados: parseEmpenhosAchatados(row),
            deducoesAplicadas: parseDeducoesAchatadas(row),
            editado_em: firebase.firestore.FieldValue.serverTimestamp(),
            editado_por: usuarioLogadoEmail || ''
        };
        return { idProc: obrigatorios.idProc, update };
    }

    document.getElementById('fileImportOP')?.addEventListener('change', async function(e) {
        const file = e.target.files[0];
        if (!file) return;
        if (typeof permissoesEmCache !== 'undefined' && !permissoesEmCache.includes('acesso_admin')) {
            alert("Acesso negado. Apenas administradores podem importar TC.");
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
            const rejeitadas = [];
            for (let i = 0; i < rows.length; i++) {
                const row = rows[i] || {};
                const parsed = montarAtualizacaoTC(row);
                if (parsed.erro) {
                    rejeitadas.push(`Linha ${i + 2}: ${parsed.erro}`);
                    continue;
                }
                const tc = baseTitulos.find(t => String(t.idProc || '').trim() === parsed.idProc);
                if (!tc) {
                    rejeitadas.push(`Linha ${i + 2}: idProc ${parsed.idProc} não encontrado.`);
                    continue;
                }
                try {
                    await db.collection('titulos').doc(tc.id).update(normalizarParaFirestore(parsed.update));
                    atualizados++;
                } catch (errLinha) {
                    rejeitadas.push(`Linha ${i + 2}: erro ao atualizar ${parsed.idProc} (${errLinha.message || errLinha}).`);
                }
            }
            let msg = `Importação TC concluída. Atualizados: ${atualizados}. Rejeitados: ${rejeitadas.length}.`;
            if (rejeitadas.length > 0) {
                msg += '\n\nResumo das rejeições:\n- ' + rejeitadas.slice(0, 15).join('\n- ');
                if (rejeitadas.length > 15) msg += `\n- ... e mais ${rejeitadas.length - 15} linha(s).`;
            }
            alert(msg);
        } catch (err) {
            alert("Erro na importação: " + (err.message || err));
        } finally {
            esconderLoading();
            e.target.value = '';
        }
    });

    document.getElementById('btnEncaminharBloco')?.addEventListener('click', async function() {
        if (!usuarioPodeTramitarTC()) return alert('Acesso negado para tramitação.');
        const ids = Array.from(titulosSelecionados);
        if (ids.length === 0) return alert("Selecione ao menos um TC.");
        const titulosSel = ids.map(id => baseTitulos.find(t => t.id === id)).filter(Boolean);
        const todosRascunho = titulosSel.length > 0 && titulosSel.every(t => (t.status || 'Rascunho') === 'Rascunho');
        const todosEmProcessamento = titulosSel.length > 0 && titulosSel.every(t => (t.status || 'Rascunho') === 'Em Processamento');
        if (!todosRascunho && !todosEmProcessamento) return alert('Selecione TCs do mesmo status (Rascunho ou Em Processamento).');
        const destino = todosRascunho ? 'Em Processamento' : 'Em Liquidação';
        const pergunta = destino === 'Em Processamento'
            ? 'Confirmar encaminhamento em bloco para Processamento?'
            : 'Confirmar envio em bloco para Liquidação?';
        if (!confirm(pergunta)) return;
        mostrarLoading();
        try {
            for (const id of ids) {
                await encaminharTC(id, destino, true);
            }
            titulosSelecionados.clear();
            atualizarUIselecao();
            atualizarTabelaTitulos();
            alert(destino === 'Em Processamento' ? 'TCs encaminhados em bloco para Processamento.' : 'TCs enviados em bloco para Liquidação.');
        } catch (err) {
            alert("Erro: " + (err.message || err));
        } finally {
            esconderLoading();
        }
    });

    document.getElementById('btnDevolverBloco')?.addEventListener('click', function() {
        if (!usuarioPodeTramitarTC()) return alert('Acesso negado para tramitação.');
        const ids = Array.from(titulosSelecionados);
        if (!ids.length) return alert("Selecione ao menos um TC.");
        const titulosSel = ids.map(id => baseTitulos.find(t => t.id === id)).filter(Boolean);
        const todosRascunho = titulosSel.length > 0 && titulosSel.every(t => (t.status || 'Rascunho') === 'Rascunho');
        const todosEmProcessamento = titulosSel.length > 0 && titulosSel.every(t => (t.status || 'Rascunho') === 'Em Processamento');
        if (!todosRascunho && !todosEmProcessamento) return alert('Para devolução em bloco, selecione apenas TCs em Rascunho ou apenas em Em Processamento.');
        abrirModalDevolucao(ids);
    });

    function iniciarEdicaoDaAba(tabIndex) {
        abaEmEdicao = tabIndex;
        alteracoesPendentesAba = false;
        ativarTab(tabIndex);
        atualizarModoEdicaoAbas();
        atualizarBotoesEdicaoPorAba();
    }

    function desistirEdicaoAba(tabIndex) {
        const fbID = document.getElementById('editIndexTitulo')?.value || '-1';
        if (fbID && fbID !== '-1') {
            editarTitulo(fbID);
            ativarTab(tabIndex);
            return;
        }
        abaEmEdicao = null;
        alteracoesPendentesAba = false;
        ativarTab(tabIndex);
        atualizarModoEdicaoAbas();
        atualizarBotoesEdicaoPorAba();
    }

    function salvarAba(tabIndex) {
        if (tabIndex === 1 && caixaVinculoEmpenhoAberta()) {
            alert('Caixa de vínculo de empenho aberta, salve o vínculo ou cancele antes de salvar Aba de Processamento.');
            return;
        }
        informacaoHistoricoPendente = '';
        if (alteracoesPendentesAba) {
            const info = prompt('Deseja adicionar uma informação ao histórico desta alteração? (opcional)');
            informacaoHistoricoPendente = (info || '').trim();
        }
        salvandoApenasAba = true;
        ativarTab(tabIndex);
        document.getElementById('formTitulo')?.requestSubmit();
    }

    [
        ['btnEditarAbaDadosBasicos', 0, true],
        ['btnEditarAbaProcessamento', 1, true],
        ['btnEditarAbaLiquidacao', 2, true],
        ['btnEditarAbaFinanceiro', 3, true],
        ['btnSalvarAbaDadosBasicos', 0, false],
        ['btnSalvarAbaProcessamento', 1, false],
        ['btnSalvarAbaLiquidacao', 2, false],
        ['btnSalvarAbaFinanceiro', 3, false]
    ].forEach(([id, tabIndex, editar]) => {
        document.getElementById(id)?.addEventListener('click', function() {
            if (editar) iniciarEdicaoDaAba(tabIndex);
            else salvarAba(tabIndex);
        });
    });

    [
        ['btnDesistirAbaDadosBasicos', 0],
        ['btnDesistirAbaProcessamento', 1],
        ['btnDesistirAbaLiquidacao', 2],
        ['btnDesistirAbaFinanceiro', 3]
    ].forEach(([id, tabIndex]) => {
        document.getElementById(id)?.addEventListener('click', function() {
            if (abaEmEdicao === tabIndex && alteracoesPendentesAba) {
                const ok = confirm('Descartar alterações desta aba?');
                if (!ok) return;
            }
            if (tabIndex === 1 && caixaVinculoEmpenhoAberta()) fecharCaixaVinculoEmpenho();
            desistirEdicaoAba(tabIndex);
        });
    });

    document.getElementById('btnModalSaidaContinuarEditando')?.addEventListener('click', function() {
        document.getElementById('modalSaidaComAlteracoes').style.display = 'none';
        acaoPendenteDeSaida = null;
    });
    document.getElementById('btnModalSaidaSalvarESair')?.addEventListener('click', function() {
        document.getElementById('modalSaidaComAlteracoes').style.display = 'none';
        if (abaEmEdicao !== null) {
            const abaAtual = abaEmEdicao;
            const form = document.getElementById('formTitulo');
            if (form) form.dataset.tcFecharAposSalvar = '1';
            salvarAba(abaAtual);
        }
    });
    document.getElementById('btnModalSaidaSairSemSalvar')?.addEventListener('click', function() {
        document.getElementById('modalSaidaComAlteracoes').style.display = 'none';
        abaEmEdicao = null;
        alteracoesPendentesAba = false;
        if (typeof acaoPendenteDeSaida === 'function') {
            const acao = acaoPendenteDeSaida;
            acaoPendenteDeSaida = null;
            acao();
        } else {
            voltarParaListaTitulos();
        }
    });

    document.getElementById('btnExemploLayoutImportTC')?.addEventListener('click', function() {
        const modal = document.getElementById('modalExemploLayoutImportTC');
        if (modal) modal.style.display = 'flex';
    });
    document.getElementById('btnFecharModalExemploLayoutImportTC')?.addEventListener('click', function() {
        const modal = document.getElementById('modalExemploLayoutImportTC');
        if (modal) modal.style.display = 'none';
    });

    document.getElementById('formTitulo')?.addEventListener('input', function() {
        if (abaEmEdicao !== null) alteracoesPendentesAba = true;
    });
    document.getElementById('formTitulo')?.addEventListener('change', function() {
        if (abaEmEdicao !== null) alteracoesPendentesAba = true;
    });

    function tentarSairComPendencia(acaoSaida) {
        if (abaEmEdicao !== null && alteracoesPendentesAba) {
            acaoPendenteDeSaida = typeof acaoSaida === 'function' ? acaoSaida : null;
            const modal = document.getElementById('modalSaidaComAlteracoes');
            if (modal) modal.style.display = 'flex';
            return true;
        }
        return false;
    }

    document.querySelector('.topbar-voltar')?.addEventListener('click', function(e) {
        if (tentarSairComPendencia(() => { location.href = 'dashboard.html'; })) {
            e.preventDefault();
            e.stopImmediatePropagation();
        }
    }, true);

    document.querySelector('.topbar-sair')?.addEventListener('click', function(e) {
        if (tentarSairComPendencia(() => {
            if (typeof fazerLogout === 'function') fazerLogout();
        })) {
            e.preventDefault();
            e.stopImmediatePropagation();
        }
    }, true);

    function ligarEventos() {
        configurarAutocompleteOI();
        configurarAutocompleteFornecedor();
        configurarSelectContrato();
        configurarAutocompleteEmpenho();
        configurarAvisoFiltroBuscaNE();
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
        configurarAvisoFiltroBuscaNE();
    }
})();
