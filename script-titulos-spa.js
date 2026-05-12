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
    /** Ano do exercício na lista (`'todos'` ou `'2026'`). Padrão: ano corrente. */
    let filtroAnoExercicioTitulos = String(new Date().getFullYear());
    let filtroAnoTitulosListenerOk = false;
    let estadoOrdenacao = { coluna: 'criado_em', direcao: 'desc' };
    let unsubscribeTitulos = null;
    let estadoAutocompleteVinculo = {
        listaResultadosCentroCustosT: { itens: [], activeIndex: -1 },
        listaResultadosUGT: { itens: [], activeIndex: -1 }
    };

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
            if (window.sisAnoDocumento && typeof window.sisAnoDocumento.payloadAnosNp === 'function') {
                Object.assign(payload, window.sisAnoDocumento.payloadAnosNp(npDocId));
            }

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
            if (window.sisAnoDocumento && typeof window.sisAnoDocumento.payloadAnosNp === 'function') {
                Object.assign(payload, window.sisAnoDocumento.payloadAnosNp(npDocIdCriar));
            }
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
                tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#e74c3c;">Erro ao carregar. Verifique a conexão e as permissões.</td></tr>';
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
            try {
                const formTc = document.getElementById('tela-formulario-titulos');
                if (formTc && formTc.style.display !== 'none') {
                    desenharLiquidacao();
                    desenharFinanceiro();
                }
            } catch (e) { /* ignore */ }
        }, onErr));
        unsubscribers.push(db.collection('deducoesEncargos').onSnapshot(snap => {
            baseDeducoesEncargos = snap.docs.map(doc => ({ id: doc.id, ...doc.data() })).filter(d => d.ativo !== false);
            aoReceberSnapshot();
        }, onErr));
        unsubscribers.push(db.collection('fornecedores').onSnapshot(snap => {
            baseFornecedores = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            // Reidrata exibição do fornecedor quando o snapshot chegar após abrir a edição.
            try {
                const cnpjSel = normalizarCNPJ(document.getElementById('fornecedorValor')?.value || '');
                if (cnpjSel) selecionarFornecedorPorCnpj(cnpjSel);
            } catch (e) {}
            aoReceberSnapshot();
        }, onErr));

        const urlParams = new URLSearchParams(window.location.search);
        const st = (urlParams.get('status') || '').trim();
        statusFiltroAtual = st || 'Rascunho';
        const anoQ = (urlParams.get('ano') || '').trim().toLowerCase();
        if (anoQ === 'todos' || anoQ === 'all') filtroAnoExercicioTitulos = 'todos';
        else if (/^\d{4}$/.test(anoQ)) filtroAnoExercicioTitulos = anoQ;
        else filtroAnoExercicioTitulos = String(new Date().getFullYear());
        configurarFiltroAnoTitulos();
        assinarTitulosPorStatus(statusFiltroAtual);
        desenharFiltrosStatus();
        ligarEventos();
    }
    window.inicializarTitulosSPA = inicializarTitulosSPA;

    function popularSelectOI() { /* OI agora é autocomplete; mantido para compatibilidade */ }

    function popularSelectCentroCustos() {
        sincronizarCampoBuscaCentroCustos();
    }

    function popularSelectUG() {
        sincronizarCampoBuscaUG();
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
            String(e.cnpjCpf || e.cnpj_cpf || e.cnpj || '').trim()
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

    function resolverAnoExercicioTitulo(t) {
        if (!t) return null;
        if (typeof t.anoExercicio === 'number') {
            const n = t.anoExercicio;
            if (n >= 1900 && n <= 2100) return n;
        }
        const a = parseInt(String(t.ano || '').replace(/\D/g, '').slice(0, 4), 10);
        if (a >= 1900 && a <= 2100) return a;
        if (window.sisAnoDocumento && typeof window.sisAnoDocumento.anoDeData === 'function') {
            const d1 = window.sisAnoDocumento.anoDeData(t.dataEmissao);
            if (d1 != null) return d1;
            const d2 = window.sisAnoDocumento.anoDeData(t.dataExefin);
            if (d2 != null) return d2;
        }
        const s = String(t.dataEmissao || '').trim();
        let m = s.match(/^(\d{4})-\d{2}-\d{2}/);
        if (m) {
            const y = parseInt(m[1], 10);
            if (y >= 1900 && y <= 2100) return y;
        }
        m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
        if (m) {
            const y = parseInt(m[3], 10);
            if (y >= 1900 && y <= 2100) return y;
        }
        const s2 = String(t.dataExefin || '').trim();
        m = s2.match(/^(\d{4})-\d{2}-\d{2}/);
        if (m) {
            const y = parseInt(m[1], 10);
            if (y >= 1900 && y <= 2100) return y;
        }
        m = s2.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
        if (m) {
            const y = parseInt(m[3], 10);
            if (y >= 1900 && y <= 2100) return y;
        }
        return null;
    }

    function configurarFiltroAnoTitulos() {
        const sel = document.getElementById('filtroAnoExercicioTitulos');
        if (!sel) return;
        const cur = new Date().getFullYear();
        const antes = filtroAnoExercicioTitulos;
        sel.innerHTML = '';
        const opTodos = document.createElement('option');
        opTodos.value = 'todos';
        opTodos.textContent = 'Todos os anos';
        sel.appendChild(opTodos);
        for (let y = cur + 1; y >= cur - 20; y--) {
            const op = document.createElement('option');
            op.value = String(y);
            op.textContent = String(y);
            sel.appendChild(op);
        }
        if (antes === 'todos') sel.value = 'todos';
        else if (antes && [...sel.options].some(o => o.value === antes)) sel.value = antes;
        else sel.value = String(cur);
        filtroAnoExercicioTitulos = sel.value;
        if (!filtroAnoTitulosListenerOk) {
            filtroAnoTitulosListenerOk = true;
            sel.addEventListener('change', function() {
                filtroAnoExercicioTitulos = this.value;
                paginaAtual = 1;
                titulosSelecionados.clear();
                try {
                    const u = new URL(window.location.href);
                    u.searchParams.set('status', statusFiltroAtual);
                    if (filtroAnoExercicioTitulos === 'todos') u.searchParams.delete('ano');
                    else u.searchParams.set('ano', filtroAnoExercicioTitulos);
                    if (history.replaceState) history.replaceState({}, '', u.pathname + u.search);
                } catch (e) {}
                atualizarTabelaTitulos();
            });
        }
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
        try {
            const u = new URL(window.location.href);
            u.searchParams.set('status', statusFiltroAtual);
            if (filtroAnoExercicioTitulos && filtroAnoExercicioTitulos !== 'todos') u.searchParams.set('ano', filtroAnoExercicioTitulos);
            else u.searchParams.delete('ano');
            if (history.replaceState) history.replaceState({}, '', u.pathname + u.search);
        } catch (e) {
            if (history.replaceState) history.replaceState({}, '', 'titulos.html?status=' + encodeURIComponent(statusFiltroAtual));
        }
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

    function obterTimestampEmMs(valor) {
        if (!valor) return 0;
        if (typeof valor.toMillis === 'function') return Number(valor.toMillis()) || 0;
        if (typeof valor.seconds === 'number') {
            const nanos = typeof valor.nanoseconds === 'number' ? valor.nanoseconds : 0;
            return (valor.seconds * 1000) + Math.floor(nanos / 1000000);
        }
        if (valor instanceof Date) return Number(valor.getTime()) || 0;
        const parsed = Date.parse(valor);
        return Number.isNaN(parsed) ? 0 : parsed;
    }

    function extrairNumeroIdProc(idProc) {
        const match = String(idProc || '').match(/(\d+)$/);
        return match ? (parseInt(match[1], 10) || 0) : 0;
    }

    function titulosFiltrados() {
        let lista = baseTitulos.map(t => ({ ...t, status: t.status || 'Rascunho' }));
        if (!incluirInativos) {
            lista = lista.filter(t => !t.inativo);
        }
        if (filtroAnoExercicioTitulos && filtroAnoExercicioTitulos !== 'todos') {
            const want = parseInt(filtroAnoExercicioTitulos, 10);
            if (!isNaN(want)) {
                lista = lista.filter(t => resolverAnoExercicioTitulo(t) === want);
            }
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
            if (coluna === 'criado_em') {
                const tsA = obterTimestampEmMs(a.criado_em);
                const tsB = obterTimestampEmMs(b.criado_em);
                if (tsA !== tsB) return direcao === 'asc' ? tsA - tsB : tsB - tsA;

                // Fallback para itens legados sem timestamp de criação.
                const procA = extrairNumeroIdProc(a.idProc);
                const procB = extrairNumeroIdProc(b.idProc);
                if (procA !== procB) return direcao === 'asc' ? procA - procB : procB - procA;
            }
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
                    }
                    if (podeTramitar && status === 'Em Processamento') {
                        acoes += `<button type="button" class="btn-icon btn-encaminhar-liquidacao-titulo" data-id="${escapeHTML(t.id)}" title="Encaminhar para Liquidação">➡️</button>`;
                    }
                    if (podeTramitar && (status === 'Rascunho' || status === 'Em Processamento' || status === 'Em Liquidação')) {
                        acoes += `<button type="button" class="btn-icon btn-devolver-titulo" data-id="${escapeHTML(t.id)}" title="Devolver TC">↩</button>`;
                    }
                    if (podeTramitar && status === 'Em Liquidação') {
                        acoes += `<button type="button" class="btn-icon btn-retornar-processamento-titulo" data-id="${escapeHTML(t.id)}" title="Retornar para Em Processamento">⏪</button>`;
                    }
                    if (podeTramitar && status === 'Liquidado') {
                        acoes += `<button type="button" class="btn-icon btn-retornar-liquidacao-titulo" data-id="${escapeHTML(t.id)}" title="Retornar para Em Liquidação">⏪</button>`;
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
        tbody.querySelectorAll('.btn-encaminhar-processamento-titulo').forEach(btn => btn.addEventListener('click', () => {
            const id = btn.getAttribute('data-id');
            const destino = 'Em Processamento';
            modalEncaminharStatusPromessa({
                texto: 'Deseja enviar este título para "Em Processamento"? Ao confirmar, o sistema verifica se os dados básicos e a OI de origem estão completos.'
            }).then(async (sim) => {
                if (!sim) return;
                mostrarLoading();
                try {
                    await encaminharTC(id, destino, false);
                    atualizarTabelaTitulos();
                } catch (err) {
                    alert('Erro ao encaminhar: ' + (err.message || err));
                } finally {
                    esconderLoading();
                }
            });
        }));
        tbody.querySelectorAll('.btn-encaminhar-liquidacao-titulo').forEach(btn => btn.addEventListener('click', () => {
            const id = btn.getAttribute('data-id');
            const destino = 'Em Liquidação';
            const titulo = baseTitulos.find(x => x.id === id);
            modalEncaminharStatusPromessa({
                texto: montarResumoPreEncaminhamentoLiquidacao(titulo)
            }).then(async (sim) => {
                if (!sim) return;
                mostrarLoading();
                try {
                    await encaminharTC(id, destino, false);
                    atualizarTabelaTitulos();
                } catch (err) {
                    alert('Erro ao encaminhar: ' + (err.message || err));
                } finally {
                    esconderLoading();
                }
            });
        }));
        tbody.querySelectorAll('.btn-devolver-titulo').forEach(btn => btn.addEventListener('click', () => {
            const id = btn.getAttribute('data-id');
            if (!id) return;
            abrirModalDevolucao([id]);
        }));
        tbody.querySelectorAll('.btn-retornar-processamento-titulo').forEach(btn => btn.addEventListener('click', async () => {
            const id = btn.getAttribute('data-id');
            if (!id) return;
            await executarRetornoStatus([id], 'Em Liquidação', 'Em Processamento', false);
        }));
        tbody.querySelectorAll('.btn-retornar-liquidacao-titulo').forEach(btn => btn.addEventListener('click', async () => {
            const id = btn.getAttribute('data-id');
            if (!id) return;
            await executarRetornoStatus([id], 'Liquidado', 'Em Liquidação', false);
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
        const btnRetornarBloco = document.getElementById('btnRetornarBloco');
        const btnDevolverBloco = document.getElementById('btnDevolverBloco');
        if (container && count) {
            const n = titulosSelecionados.size;
            container.style.display = n > 0 ? 'block' : 'none';
            count.textContent = n;
            const selecionados = Array.from(titulosSelecionados).map(id => baseTitulos.find(t => t.id === id)).filter(Boolean);
            const todosDevolvidos = selecionados.length > 0 && selecionados.every(t => (t.status || 'Rascunho') === 'Devolvido');
            const todosRascunho = selecionados.length > 0 && selecionados.every(t => (t.status || 'Rascunho') === 'Rascunho');
            const todosEmProcessamento = selecionados.length > 0 && selecionados.every(t => (t.status || 'Rascunho') === 'Em Processamento');
            const todosEmLiquidacao = selecionados.length > 0 && selecionados.every(t => (t.status || 'Rascunho') === 'Em Liquidação');
            const todosLiquidados = selecionados.length > 0 && selecionados.every(t => (t.status || 'Rascunho') === 'Liquidado');
            const podeTramitar = usuarioPodeTramitarTC();
            if (btnNovaEntradaBloco) btnNovaEntradaBloco.style.display = (todosDevolvidos && selecionados.length > 1) ? 'inline-block' : 'none';
            if (btnEncaminharBloco) {
                btnEncaminharBloco.style.display = (podeTramitar && (todosRascunho || todosEmProcessamento)) ? 'inline-block' : 'none';
                btnEncaminharBloco.textContent = todosRascunho ? '➡️ Encaminhar para Processamento em Bloco' : '➡️ Enviar para Liquidação em Bloco';
            }
            if (btnRetornarBloco) {
                btnRetornarBloco.style.display = (podeTramitar && (todosEmLiquidacao || todosLiquidados)) ? 'inline-block' : 'none';
                btnRetornarBloco.textContent = todosEmLiquidacao
                    ? '↩ Retornar para Em Processamento em Bloco'
                    : (todosLiquidados ? '↩ Retornar para Em Liquidação em Bloco' : '↩ Retornar status em Bloco');
            }
            if (btnDevolverBloco) btnDevolverBloco.style.display = (podeTramitar && (todosRascunho || todosEmProcessamento || todosEmLiquidacao)) ? 'inline-block' : 'none';
            const btnImprimirBlocoTC = document.getElementById('btnImprimirBlocoTC');
            if (btnImprimirBlocoTC) {
                const podeGerarPdf = (typeof temPermissaoUI === 'function' ? temPermissaoUI('titulos_pdf') : false) ||
                    (typeof permissoesEmCache !== 'undefined' && permissoesEmCache.includes('acesso_admin'));
                if (n >= 1 && podeGerarPdf) {
                    btnImprimirBlocoTC.style.display = 'inline-block';
                    if (n > 10) {
                        btnImprimirBlocoTC.title = `Selecionados: ${n}. Limite de 10 TC por impressão em bloco.`;
                    } else {
                        btnImprimirBlocoTC.title = `Gerar PDF único com ${n} TC.`;
                    }
                } else {
                    btnImprimirBlocoTC.style.display = 'none';
                }
            }
        }
    }

    document.getElementById('btnImprimirBlocoTC')?.addEventListener('click', function() {
        const ids = Array.from(titulosSelecionados);
        if (!ids.length) return;
        if (ids.length > 10) {
            alert(`Limite de 10 TC por impressão em bloco. Você selecionou ${ids.length}.`);
            return;
        }
        gerarPDFTitulosEmBloco(ids);
    });

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

    async function gerarNovoIDProcGlobal(tx) {
        const seqRef = db.collection('contadores').doc('titulos_proc_global');
        const snap = await tx.get(seqRef);
        const numeroPersistido = snap.exists ? (parseInt(snap.data().ultimoNumero, 10) || 0) : 0;
        const proximoNumero = numeroPersistido + 1;
        tx.set(seqRef, { ultimoNumero: proximoNumero, atualizadoEmMs: Date.now() }, { merge: true });
        return 'PROC-' + String(proximoNumero).padStart(3, '0');
    }

    async function criarTituloComIdProcSequencial(dadosSanitizadosBase) {
        const docRef = db.collection('titulos').doc();
        const resultado = await db.runTransaction(async (tx) => {
            const idProcGerado = await gerarNovoIDProcGlobal(tx);
            const dadosParaCriar = {
                ...dadosSanitizadosBase,
                idProc: idProcGerado,
                criado_em: firebase.firestore.FieldValue.serverTimestamp()
            };
            tx.set(docRef, dadosParaCriar);
            return { docId: docRef.id, idProc: idProcGerado };
        });
        return resultado;
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
        aplicarModoSemContrato(false);
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
            Number(tc.valorNotaFiscal || 0) > 0 &&
            String(tc.dataEmissao || '').trim() &&
            String(tc.dataAteste || '').trim()
        );
    }

    /** Validação única para encaminhar (lista, bloco, botão do formulário) e espelhada no submit da aba Processamento. */
    function validarPreRequisitosEncaminharTC(t, destino) {
        const tc = t || {};
        if (destino === 'Em Processamento') {
            if (!dadosBasicosCompletos(tc)) {
                return { ok: false, mensagem: 'Dados básicos incompletos. Preencha tipo, entrada EXEFIN, nº TC, fornecedor, valor e datas (aba Dados Básicos) antes de encaminhar para Processamento. O contrato só é obrigatório quando o CNPJ possui contrato cadastrado.' };
            }
            if (!String(tc.oiEntregou || '').trim()) {
                return { ok: false, mensagem: 'É necessário informar a OI de Origem (aba Dados Básicos) antes de encaminhar para Processamento.' };
            }
            return { ok: true };
        }
        if (destino === 'Em Liquidação') {
            const emps = Array.isArray(tc.empenhosVinculados) ? tc.empenhosVinculados : [];
            if (emps.length < 1) {
                return { ok: false, mensagem: 'Para enviar à Liquidação, vincule ao menos 1 NE na aba Processamento.' };
            }
            for (let i = 0; i < emps.length; i++) {
                const v = emps[i] || {};
                const sub = String(v.subelemento || '').trim();
                if (!/^\d{2}$/.test(sub)) {
                    return { ok: false, mensagem: `NE ${i + 1}: subelemento deve ter exatamente 2 dígitos numéricos.` };
                }
                const val = Number(v.valorVinculado || 0);
                if (val < 0.01) {
                    return { ok: false, mensagem: `NE ${i + 1}: valor utilizado deve ser no mínimo R$ 0,01.` };
                }
                if (!String(v.centroCustosId || '').trim()) {
                    return { ok: false, mensagem: `NE ${i + 1}: Centro de Custos é obrigatório.` };
                }
                if (!String(v.ugId || '').trim()) {
                    return { ok: false, mensagem: `NE ${i + 1}: UG Beneficiária é obrigatória.` };
                }
            }
            return { ok: true };
        }
        return { ok: false, mensagem: 'Destino de tramitação não reconhecido.' };
    }

    function montarResumoPreEncaminhamentoLiquidacao(tc) {
        const emps = Array.isArray(tc?.empenhosVinculados) ? tc.empenhosVinculados : [];
        const total = emps.length;
        const pendencias = emps.filter(v => {
            const sub = String(v?.subelemento || '').trim();
            const val = Number(v?.valorVinculado || 0);
            const semCC = !String(v?.centroCustosId || '').trim();
            const semUG = !String(v?.ugId || '').trim();
            return !/^\d{2}$/.test(sub) || val < 0.01 || semCC || semUG;
        }).length;
        return `Deseja enviar este título para "Em Liquidação"? NE vinculadas: ${total}. Pendências detectadas: ${pendencias}. Ao confirmar, o sistema valida subelemento, valores, Centro de Custos e UG.`;
    }

    function configurarModalEncaminharStatus() {
        const overlay = document.getElementById('modalEncaminharStatus');
        const btnC = document.getElementById('modalEncaminharStatusCancelar');
        const btnO = document.getElementById('modalEncaminharStatusConfirmar');
        if (!overlay || !btnC || !btnO || overlay.dataset.bound === '1') return;
        overlay.dataset.bound = '1';
        const fechar = (res) => {
            overlay.style.display = 'none';
            const r = configurarModalEncaminharStatus._resolve;
            configurarModalEncaminharStatus._resolve = null;
            if (typeof r === 'function') r(res);
        };
        btnC.addEventListener('click', () => fechar(false));
        btnO.addEventListener('click', () => fechar(true));
    }

    /** @returns {Promise<boolean>} */
    function modalEncaminharStatusPromessa(opcoes) {
        configurarModalEncaminharStatus();
        const overlay = document.getElementById('modalEncaminharStatus');
        const h3 = document.getElementById('modalEncaminharStatusTitulo');
        const p = document.getElementById('modalEncaminharStatusTexto');
        const tituloModal = opcoes && opcoes.tituloModal;
        const texto = (opcoes && opcoes.texto) || 'Confirmar esta operação?';
        if (h3) h3.textContent = tituloModal || 'Confirmar encaminhamento';
        if (p) p.textContent = texto;
        return new Promise((resolve) => {
            configurarModalEncaminharStatus._resolve = resolve;
            overlay.style.display = 'flex';
        });
    }

    function modalExcluirVinculoEmpenhoPromessa(vinculo) {
        const overlay = document.getElementById('modalExcluirVinculoEmpenho');
        const btnCancelar = document.getElementById('btnModalExcluirVinculoEmpenhoCancelar');
        const btnConfirmar = document.getElementById('btnModalExcluirVinculoEmpenhoConfirmar');
        const resumo = document.getElementById('modalExcluirVinculoEmpenhoResumo');
        if (!overlay || !btnCancelar || !btnConfirmar || !resumo) return Promise.resolve(false);
        if (overlay.dataset.bound !== '1') {
            overlay.dataset.bound = '1';
            const fechar = (res) => {
                overlay.style.display = 'none';
                const fn = modalExcluirVinculoEmpenhoPromessa._resolve;
                modalExcluirVinculoEmpenhoPromessa._resolve = null;
                if (typeof fn === 'function') fn(res);
            };
            btnCancelar.addEventListener('click', () => fechar(false));
            btnConfirmar.addEventListener('click', () => fechar(true));
        }
        resumo.innerHTML = [
            '<div><strong>NE:</strong> ' + escapeHTML(typeof formatarNumEmpenhoVisivel === 'function' ? formatarNumEmpenhoVisivel(vinculo?.numEmpenho) : (vinculo?.numEmpenho || '-')) + '</div>',
            '<div><strong>Valor:</strong> R$ ' + escapeHTML(typeof formatarMoedaBR === 'function' ? formatarMoedaBR(vinculo?.valorVinculado || 0) : String(vinculo?.valorVinculado || 0)) + '</div>',
            '<div><strong>Centro de Custos:</strong> ' + escapeHTML(labelCentroCustos(vinculo?.centroCustosId)) + '</div>',
            '<div><strong>UG Beneficiária:</strong> ' + escapeHTML(labelUG(vinculo?.ugId)) + '</div>'
        ].join('');
        return new Promise((resolve) => {
            modalExcluirVinculoEmpenhoPromessa._resolve = resolve;
            overlay.style.display = 'flex';
        });
    }

    function modalTrocaEdicaoEmpenhoPromessa() {
        const overlay = document.getElementById('modalTrocaEdicaoEmpenho');
        const btnContinuar = document.getElementById('btnModalTrocaEdicaoEmpenhoContinuar');
        const btnDescartar = document.getElementById('btnModalTrocaEdicaoEmpenhoDescartar');
        if (!overlay || !btnContinuar || !btnDescartar) return Promise.resolve(true);
        if (overlay.dataset.bound !== '1') {
            overlay.dataset.bound = '1';
            const fechar = (res) => {
                overlay.style.display = 'none';
                const fn = modalTrocaEdicaoEmpenhoPromessa._resolve;
                modalTrocaEdicaoEmpenhoPromessa._resolve = null;
                if (typeof fn === 'function') fn(res);
            };
            btnContinuar.addEventListener('click', () => fechar(false));
            btnDescartar.addEventListener('click', () => fechar(true));
        }
        return new Promise((resolve) => {
            modalTrocaEdicaoEmpenhoPromessa._resolve = resolve;
            overlay.style.display = 'flex';
        });
    }

    /**
     * @param {boolean} emBloco
     * @param {{ silent?: boolean }} [opts] — silent: não usa alert; retorna { ok, mensagem? }
     * @returns {Promise<void|{ ok: boolean, mensagem?: string }>}
     */
    async function encaminharTC(id, destino, emBloco = false, opts) {
        const silent = !!(opts && opts.silent);
        const falhar = (msg) => {
            if (silent) return { ok: false, mensagem: msg };
            alert(msg);
            return null;
        };
        if (!usuarioPodeTramitarTC()) return falhar('Acesso negado para tramitação.');
        const snap = await db.collection('titulos').doc(id).get();
        if (!snap.exists) return falhar('Título não encontrado.');
        const dadosDoc = snap.data() || {};
        const statusAtual = dadosDoc.status || 'Rascunho';
        if (destino === 'Em Processamento' && statusAtual !== 'Rascunho') {
            return falhar('Status atual não permite encaminhar para Processamento.');
        }
        if (destino === 'Em Liquidação' && statusAtual !== 'Em Processamento') {
            return falhar('Status atual não permite encaminhar para Liquidação.');
        }
        const val = validarPreRequisitosEncaminharTC(dadosDoc, destino);
        if (!val.ok) return falhar(val.mensagem);
        const acaoTxt = destino === 'Em Processamento' ? 'Enc. p/ Processamento' : 'Enc. p/ Liquidação';
        const eventoTxt = destino === 'Em Processamento' ? 'Enc. p/ Processamento' : 'Enc. p/ Liquidação';
        const info = emBloco ? 'Operação em bloco' : '';
        const hist = obterHistorico(dadosDoc);
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
        return silent ? { ok: true } : undefined;
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
            } else if (el.getAttribute('data-tc-somente-leitura') === '1') {
                el.disabled = true;
                if ('readOnly' in el) el.readOnly = true;
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
        if (abaEmEdicao === 3) {
            abaEmEdicao = null;
            alteracoesPendentesAba = false;
        }
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
            // Aba Financeiro: LF/PF/OP somente leitura (RN); sem ciclo Editar/Salvar nesta aba.
            if (c.tab === 3) {
                acao.style.display = 'none';
                return;
            }
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

    /** Mostra/oculta ações principais do formulário */
    function atualizarBotoesFormulario(status, tcSalvo) {
        const btnRetornarProcessamento = document.getElementById('btnRetornarProcessamento');
        const btnRetornarLiquidacao = document.getElementById('btnRetornarLiquidacao');
        const btnDevolver = document.getElementById('btnDevolver');
        const btnEnviar = document.getElementById('btnEnviarProcessamento');
        const btnNovaEntrada = document.getElementById('btnDarNovaEntrada');
        const podeTramitar = usuarioPodeTramitarTC();
        if (btnRetornarProcessamento) btnRetornarProcessamento.style.display = (tcSalvo && podeTramitar && status === 'Em Liquidação') ? 'inline-block' : 'none';
        if (btnRetornarLiquidacao) btnRetornarLiquidacao.style.display = (tcSalvo && podeTramitar && status === 'Liquidado') ? 'inline-block' : 'none';
        if (btnDevolver) btnDevolver.style.display = (tcSalvo && podeTramitar && (status === 'Rascunho' || status === 'Em Processamento' || status === 'Em Liquidação')) ? 'inline-block' : 'none';
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

    function limparSugestoesAutocomplete(idLista) {
        const lista = document.getElementById(idLista);
        if (lista) lista.innerHTML = '';
        if (estadoAutocompleteVinculo[idLista]) {
            estadoAutocompleteVinculo[idLista].activeIndex = -1;
            estadoAutocompleteVinculo[idLista].itens = [];
        }
    }

    function atualizarResumoSelecaoVinculo() {
        const wrap = document.getElementById('resumoSelecaoVinculo');
        const ccTxt = document.getElementById('resumoCentroCustosSelecionado');
        const ugTxt = document.getElementById('resumoUGSelecionada');
        const ccId = (document.getElementById('vinculoCentroCustos')?.value || '').trim();
        const ugId = (document.getElementById('vinculoUG')?.value || '').trim();
        if (ccTxt) ccTxt.textContent = 'CC selecionado: ' + (ccId ? labelCentroCustos(ccId) : '-');
        if (ugTxt) ugTxt.textContent = 'UG selecionada: ' + (ugId ? labelUG(ugId) : '-');
        if (wrap) wrap.style.display = (ccId || ugId) ? 'block' : 'none';
    }

    function limparErroVinculoEmpenho() {
        const box = document.getElementById('mensagemErroVinculoEmpenho');
        if (!box) return;
        box.style.display = 'none';
        box.textContent = '';
    }

    function exibirErroVinculoEmpenho(mensagem, campoId) {
        const box = document.getElementById('mensagemErroVinculoEmpenho');
        if (box) {
            box.textContent = mensagem;
            box.style.display = 'block';
        }
        if (campoId) {
            const el = document.getElementById(campoId);
            if (el && typeof el.focus === 'function') el.focus();
        }
    }

    function escaparRegex(texto) {
        return String(texto || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    function destacarTrecho(texto, termo) {
        const base = String(texto || '');
        const t = String(termo || '').trim();
        if (!t) return escapeHTML(base);
        try {
            const re = new RegExp('(' + escaparRegex(t) + ')', 'ig');
            return escapeHTML(base).replace(re, '<strong>$1</strong>');
        } catch (_) {
            return escapeHTML(base);
        }
    }

    function atualizarSelecaoVisualLista(listaId) {
        const lista = document.getElementById(listaId);
        const estado = estadoAutocompleteVinculo[listaId];
        if (!lista || !estado) return;
        lista.querySelectorAll('li[data-opcao="1"]').forEach((li, idx) => {
            li.style.background = idx === estado.activeIndex ? '#e8f4f8' : '';
        });
    }

    function navegarSugestoesVinculo(evt, listaId, onSelect) {
        const estado = estadoAutocompleteVinculo[listaId];
        if (!estado || !Array.isArray(estado.itens) || estado.itens.length === 0) return;
        if (evt.key === 'ArrowDown') {
            evt.preventDefault();
            estado.activeIndex = Math.min(estado.activeIndex + 1, estado.itens.length - 1);
            atualizarSelecaoVisualLista(listaId);
            return;
        }
        if (evt.key === 'ArrowUp') {
            evt.preventDefault();
            estado.activeIndex = Math.max(estado.activeIndex - 1, 0);
            atualizarSelecaoVisualLista(listaId);
            return;
        }
        if (evt.key === 'Enter' && estado.activeIndex >= 0) {
            evt.preventDefault();
            const item = estado.itens[estado.activeIndex];
            if (item) onSelect(item.raw);
            return;
        }
        if (evt.key === 'Escape') {
            limparSugestoesAutocomplete(listaId);
        }
    }

    function sincronizarCampoBuscaCentroCustos() {
        const hidden = document.getElementById('vinculoCentroCustos');
        const input = document.getElementById('vinculoCentroCustosBusca');
        if (!hidden || !input) return;
        const idAtual = String(hidden.value || '').trim();
        input.value = idAtual ? labelCentroCustos(idAtual) : '';
        atualizarResumoSelecaoVinculo();
    }

    function sincronizarCampoBuscaUG() {
        const hidden = document.getElementById('vinculoUG');
        const input = document.getElementById('vinculoUGBusca');
        if (!hidden || !input) return;
        const idAtual = String(hidden.value || '').trim();
        input.value = idAtual ? labelUG(idAtual) : '';
        atualizarResumoSelecaoVinculo();
    }

    function selecionarCentroCustosVinculo(item) {
        const hidden = document.getElementById('vinculoCentroCustos');
        const input = document.getElementById('vinculoCentroCustosBusca');
        if (!hidden || !input || !item) return;
        hidden.value = item.id || '';
        input.value = labelCentroCustos(item.id || '');
        limparSugestoesAutocomplete('listaResultadosCentroCustosT');
        limparErroVinculoEmpenho();
        atualizarResumoSelecaoVinculo();
    }

    function selecionarUGVinculo(item) {
        const hidden = document.getElementById('vinculoUG');
        const input = document.getElementById('vinculoUGBusca');
        if (!hidden || !input || !item) return;
        hidden.value = item.id || '';
        input.value = labelUG(item.id || '');
        limparSugestoesAutocomplete('listaResultadosUGT');
        limparErroVinculoEmpenho();
        atualizarResumoSelecaoVinculo();
    }

    function renderizarSugestoesVinculo(listaId, itens, onSelect, mensagemVazio, termo, totalResultados) {
        const lista = document.getElementById(listaId);
        if (!lista) return;
        const estado = estadoAutocompleteVinculo[listaId];
        if (estado) {
            estado.itens = itens.slice();
            estado.activeIndex = -1;
        }
        lista.innerHTML = '';
        const info = document.createElement('li');
        info.style.padding = '8px 10px';
        info.style.color = '#666';
        info.style.fontSize = '11px';
        info.textContent = totalResultados > itens.length
            ? `Mostrando ${itens.length} de ${totalResultados} resultados. Refine para filtrar mais.`
            : `${itens.length} resultado(s).`;
        if (itens.length) lista.appendChild(info);
        if (!itens.length) {
            lista.innerHTML = '<li style="padding:10px; color:#777; font-size:12px;">' + mensagemVazio + '</li>';
            return;
        }
        itens.forEach(item => {
            const li = document.createElement('li');
            li.setAttribute('data-opcao', '1');
            li.innerHTML = destacarTrecho(item.label || '-', termo);
            li.addEventListener('mousedown', (e) => {
                e.preventDefault();
                onSelect(item.raw);
            });
            lista.appendChild(li);
        });
        atualizarSelecaoVisualLista(listaId);
    }

    function mostrarSugestoesCentroCustosVinculo() {
        const input = document.getElementById('vinculoCentroCustosBusca');
        const lista = document.getElementById('listaResultadosCentroCustosT');
        if (!input || !lista || input.readOnly) return;

        const termo = removerAcentos(String(input.value || '').toLowerCase()).trim();
        lista.innerHTML = '';
        if (termo.length < 3) {
            lista.innerHTML = '<li style="padding:10px; color:#777; font-size:12px;">Digite ao menos 3 caracteres. Dica: busque primeiro pelo código.</li>';
            return;
        }

        const filtrados = (listaCentroCustos || [])
            .map(c => ({
                raw: c,
                label: (c.codigo || '-') + ' - ' + (c.descricao || c.aplicacao || '-'),
                busca: removerAcentos(((c.codigo || '') + ' ' + (c.descricao || c.aplicacao || '')).toLowerCase())
            }))
            .filter(c => c.busca.includes(termo));
        const itens = filtrados.slice(0, 20);

        renderizarSugestoesVinculo('listaResultadosCentroCustosT', itens, selecionarCentroCustosVinculo, 'Nenhum Centro de Custos encontrado. Tente código parcial.', termo, filtrados.length);
    }

    function mostrarSugestoesUGVinculo() {
        const input = document.getElementById('vinculoUGBusca');
        const lista = document.getElementById('listaResultadosUGT');
        if (!input || !lista || input.readOnly) return;

        const termo = removerAcentos(String(input.value || '').toLowerCase()).trim();
        lista.innerHTML = '';
        if (termo.length < 3) {
            lista.innerHTML = '<li style="padding:10px; color:#777; font-size:12px;">Digite ao menos 3 caracteres. Dica: busque primeiro pelo código.</li>';
            return;
        }

        const filtrados = (listaUG || [])
            .map(u => ({
                raw: u,
                label: (u.codigo || '-') + ' - ' + (u.nome || '-'),
                busca: removerAcentos(((u.codigo || '') + ' ' + (u.nome || '')).toLowerCase())
            }))
            .filter(u => u.busca.includes(termo));
        const itens = filtrados.slice(0, 20);

        renderizarSugestoesVinculo('listaResultadosUGT', itens, selecionarUGVinculo, 'Nenhuma UG encontrada. Tente código parcial.', termo, filtrados.length);
    }

    function configurarAutocompleteCentroCustosEUG() {
        const ccInput = document.getElementById('vinculoCentroCustosBusca');
        const ugInput = document.getElementById('vinculoUGBusca');
        if (ccInput && ccInput.dataset.autocompleteBound !== '1') {
            ccInput.dataset.autocompleteBound = '1';
            ccInput.addEventListener('input', debounce(() => {
                const hidden = document.getElementById('vinculoCentroCustos');
                if (hidden) hidden.value = '';
                mostrarSugestoesCentroCustosVinculo();
            }, 350));
            ccInput.addEventListener('keydown', (evt) => navegarSugestoesVinculo(evt, 'listaResultadosCentroCustosT', selecionarCentroCustosVinculo));
            ccInput.addEventListener('focus', () => { if ((ccInput.value || '').trim().length >= 3) mostrarSugestoesCentroCustosVinculo(); });
            ccInput.addEventListener('blur', () => {
                setTimeout(() => {
                    const hidden = document.getElementById('vinculoCentroCustos');
                    if (hidden && !hidden.value) ccInput.value = '';
                    limparSugestoesAutocomplete('listaResultadosCentroCustosT');
                }, 200);
            });
        }
        if (ugInput && ugInput.dataset.autocompleteBound !== '1') {
            ugInput.dataset.autocompleteBound = '1';
            ugInput.addEventListener('input', debounce(() => {
                const hidden = document.getElementById('vinculoUG');
                if (hidden) hidden.value = '';
                mostrarSugestoesUGVinculo();
            }, 350));
            ugInput.addEventListener('keydown', (evt) => navegarSugestoesVinculo(evt, 'listaResultadosUGT', selecionarUGVinculo));
            ugInput.addEventListener('focus', () => { if ((ugInput.value || '').trim().length >= 3) mostrarSugestoesUGVinculo(); });
            ugInput.addEventListener('blur', () => {
                setTimeout(() => {
                    const hidden = document.getElementById('vinculoUG');
                    if (hidden && !hidden.value) ugInput.value = '';
                    limparSugestoesAutocomplete('listaResultadosUGT');
                }, 200);
            });
        }
        sincronizarCampoBuscaCentroCustos();
        sincronizarCampoBuscaUG();
    }

    function obterMotivoBloqueioEdicaoProcessamento() {
        if (!tcSalvo()) return '';
        if (!usuarioPodeEditarTC()) return 'Perfil sem permissão para editar vínculos ou TC em status não editável.';
        if (abaEmEdicao !== 1) return 'Clique em "Editar Processamento" para alterar vínculos.';
        if (salvandoApenasAba) return 'Aguarde o término da operação em andamento.';
        return '';
    }

    function existeEdicaoEmpenhoPendente() {
        const idx = indiceEmpenhoEditando;
        if (idx === null || idx === undefined) return false;
        const atual = empenhosDaNotaAtual[idx];
        if (!atual) return false;
        const valorInput = document.getElementById('vinculoValor')?.value || '';
        const valorNum = typeof valorMoedaParaNumero === 'function'
            ? valorMoedaParaNumero(valorInput)
            : (parseFloat(String(valorInput).replace(/\./g, '').replace(',', '.')) || 0);
        const ccId = (document.getElementById('vinculoCentroCustos')?.value || '').trim();
        const ugId = (document.getElementById('vinculoUG')?.value || '').trim();
        return (
            Number(atual.valorVinculado || 0) !== Number(valorNum || 0) ||
            String(atual.centroCustosId || '').trim() !== ccId ||
            String(atual.ugId || '').trim() !== ugId
        );
    }

    function desenharEmpenhosNota() {
        const tbody = document.getElementById('tbodyEmpenhosNota');
        if (!tbody) return;
        tbody.innerHTML = '';
        empenhosDaNotaAtual.forEach((v, i) => {
            const tr = document.createElement('tr');
            const processamentoEditavel = podeEditarAba(1);
            const motivoBloqueio = processamentoEditavel ? '' : obterMotivoBloqueioEdicaoProcessamento();
            tr.innerHTML = `<td title="NE: ${escapeHTML(v.numEmpenho || '')} | PTRES: ${escapeHTML(v.ptres || '-')} | FR: ${escapeHTML(v.fr || '-')}">${escapeHTML(typeof formatarNumEmpenhoVisivel === 'function' ? formatarNumEmpenhoVisivel(v.numEmpenho) : (v.numEmpenho || '-'))}</td>
                <td>${escapeHTML(v.nd || '-')}</td>
                <td>${escapeHTML(v.subelemento || '-')}</td>
                <td>R$ ${escapeHTML(typeof formatarMoedaBR === 'function' ? formatarMoedaBR(v.valorVinculado || 0) : (v.valorVinculado || '0'))}</td>
                <td title="${escapeHTML(labelCentroCustos(v.centroCustosId))}">${escapeHTML((labelCentroCustos(v.centroCustosId) || '-').substring(0, 25))}${(labelCentroCustos(v.centroCustosId) || '').length > 25 ? '...' : ''}</td>
                <td title="${escapeHTML(labelUG(v.ugId))}">${escapeHTML((labelUG(v.ugId) || '-').substring(0, 25))}${(labelUG(v.ugId) || '').length > 25 ? '...' : ''}</td>
                <td>
                    <button type="button" class="btn-icon btn-editar-ne ${processamentoEditavel ? '' : 'tc-btn-bloqueado'}" aria-label="Editar vínculo de NE" data-index="${i}" title="${escapeHTML(processamentoEditavel ? 'Editar vínculo' : motivoBloqueio)}" ${processamentoEditavel ? '' : 'disabled'}>✏️</button>
                    <button type="button" class="btn-icon btn-rm-ne ${processamentoEditavel ? '' : 'tc-btn-bloqueado'}" aria-label="Excluir vínculo de NE" data-index="${i}" title="${escapeHTML(processamentoEditavel ? 'Excluir vínculo' : motivoBloqueio)}" ${processamentoEditavel ? '' : 'disabled'}>🗑️</button>
                </td>`;
            tbody.appendChild(tr);
        });

        tbody.querySelectorAll('.btn-editar-ne').forEach(btn => btn.addEventListener('click', async function() {
            if (!podeEditarAba(1)) return;
            if (existeEdicaoEmpenhoPendente()) {
                const descartar = await modalTrocaEdicaoEmpenhoPromessa();
                if (!descartar) return;
            }
            editarItemEmpenhoNaNota(parseInt(this.getAttribute('data-index'), 10));
        }));
        tbody.querySelectorAll('.btn-rm-ne').forEach(btn => btn.addEventListener('click', async function() {
            if (!podeEditarAba(1)) return;
            const idx = parseInt(this.getAttribute('data-index'), 10);
            const item = empenhosDaNotaAtual[idx] || {};
            if (String(item.lf || '').trim() || String(item.pf || '').trim()) {
                exibirErroVinculoEmpenho('Não é possível excluir este vínculo porque já possui LF/PF associado. Remova o vínculo financeiro antes de excluir a NE.', 'vinculoValor');
                return;
            }
            const confirmado = await modalExcluirVinculoEmpenhoPromessa(item);
            if (!confirmado) return;
            empenhosDaNotaAtual.splice(idx, 1);
            podeCancelarUltimaInclusaoEmpenhoNota = false;
            const btnUndo = document.getElementById('btnCancelarUltimaInclusaoEmpenhoNota');
            if (btnUndo) btnUndo.style.display = 'none';
            limparErroVinculoEmpenho();
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
    function truncar2(n) {
        const v = Number(n || 0);
        if (!isFinite(v) || v <= 0) return 0;
        return Math.floor(v * 100) / 100;
    }
    function arredondar2HalfUp(n) {
        const v = Number(n || 0);
        if (!isFinite(v) || v <= 0) return 0;
        return Math.round(v * 100 + 1e-9) / 100;
    }
    function reconciliarComponentesDarf(base, aliqTotal, aliqIR, aliqCSLL, aliqCOFINS, aliqPIS) {
        const baseN = Math.max(0, Number(base) || 0);
        const aliqT = Math.max(0, Number(aliqTotal) || 0);
        const totalCentavos = Math.round(baseN * aliqT + 1e-9);
        const componentes = [
            { chave: 'IR', aliq: Math.max(0, Number(aliqIR) || 0) },
            { chave: 'CSLL', aliq: Math.max(0, Number(aliqCSLL) || 0) },
            { chave: 'COFINS', aliq: Math.max(0, Number(aliqCOFINS) || 0) },
            { chave: 'PIS', aliq: Math.max(0, Number(aliqPIS) || 0) }
        ].map(c => {
            const centavosBruto = baseN * c.aliq;
            const centavosArred = Math.round(centavosBruto + 1e-9);
            const piso = Math.floor(centavosBruto + 1e-9);
            const residuo = centavosBruto - piso;
            return { ...c, centavos: centavosArred, residuo };
        });
        const somaCentavos = componentes.reduce((s, c) => s + c.centavos, 0);
        let diff = totalCentavos - somaCentavos;
        if (diff !== 0) {
            const ajustaveis = componentes.filter(c => c.aliq > 0);
            if (ajustaveis.length > 0) {
                const fila = ajustaveis.slice().sort((a, b) => diff > 0 ? (b.residuo - a.residuo) : (a.residuo - b.residuo));
                const passo = diff > 0 ? 1 : -1;
                let restantes = Math.abs(diff);
                let i = 0;
                let guarda = 0;
                while (restantes > 0 && guarda < 10000) {
                    const cand = fila[i % fila.length];
                    if (passo > 0 || cand.centavos > 0) {
                        cand.centavos += passo;
                        restantes--;
                    }
                    i++;
                    guarda++;
                }
            }
        }
        const valorIR = componentes[0].centavos / 100;
        const valorCSLL = componentes[1].centavos / 100;
        const valorCOFINS = componentes[2].centavos / 100;
        const valorPISPASEP = componentes[3].centavos / 100;
        const total = (componentes[0].centavos + componentes[1].centavos + componentes[2].centavos + componentes[3].centavos) / 100;
        return { valorIR, valorCSLL, valorCOFINS, valorPISPASEP, total };
    }
    function obterDedEncDdf025PorItem(item = {}) {
        const dedEncId = item.dedEncId || '';
        if (dedEncId) {
            const porId = (baseDeducoesEncargos || []).find(d => d.id === dedEncId && d.tipo === 'DDF025');
            if (porId) return porId;
        }
        const codigo = String(item.codigo || '').trim();
        if (codigo) {
            const porCodigo = (baseDeducoesEncargos || []).find(d => String(d.codigo || '').trim() === codigo && d.tipo === 'DDF025');
            if (porCodigo) return porCodigo;
        }
        return null;
    }
    function obterAliquotasComponentesDarf(item = {}) {
        const dedEnc = obterDedEncDdf025PorItem(item);
        const aliqIR = Number(dedEnc?.ir);
        const aliqCOFINS = Number(dedEnc?.cofins);
        const aliqCSLL = Number(dedEnc?.csll);
        const aliqPIS = Number(dedEnc?.pis);
        const temAliqDoCadastro = [aliqIR, aliqCOFINS, aliqCSLL, aliqPIS].every(v => Number.isFinite(v) && v >= 0);
        if (temAliqDoCadastro) {
            return {
                aliqIR,
                aliqCOFINS,
                aliqCSLL,
                aliqPIS,
                fonte: 'cadastroDedEnc'
            };
        }
        const aliqTotal = Number(item.aliquotaTotal != null ? item.aliquotaTotal : item.aliquota || 0);
        const pesos = { ir: 1.5, cofins: 3.0, csll: 1.0, pis: 0.65 };
        const somaPesos = pesos.ir + pesos.cofins + pesos.csll + pesos.pis; // 5.65
        const fator = somaPesos > 0 ? (aliqTotal / somaPesos) : 0;
        return {
            aliqIR: pesos.ir * fator,
            aliqCOFINS: pesos.cofins * fator,
            aliqCSLL: pesos.csll * fator,
            aliqPIS: pesos.pis * fator,
            fonte: 'fallbackLegado'
        };
    }
    function calcularComponentesDarf(baseCalculo, aliquotaTotal, aliquotasDarf = null) {
        const base = Number(baseCalculo || 0);
        const aliq = aliquotasDarf || obterAliquotasComponentesDarf({ aliquotaTotal });
        const aliqIR = Number(aliq.aliqIR || 0);
        const aliqCOFINS = Number(aliq.aliqCOFINS || 0);
        const aliqCSLL = Number(aliq.aliqCSLL || 0);
        const aliqPIS = Number(aliq.aliqPIS || 0);
        const aliqTotalN = Number(aliquotaTotal || 0);
        const rec = reconciliarComponentesDarf(base, aliqTotalN, aliqIR, aliqCSLL, aliqCOFINS, aliqPIS);
        return {
            aliqIR,
            aliqCOFINS,
            aliqCSLL,
            aliqPIS,
            valorIR: rec.valorIR,
            valorCOFINS: rec.valorCOFINS,
            valorCSLL: rec.valorCSLL,
            valorPISPASEP: rec.valorPISPASEP,
            total: rec.total,
            fonteAliquota: aliq.fonte || 'indefinida'
        };
    }
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
        const aliquotasDarf = tipo === 'DDF025'
            ? obterAliquotasComponentesDarf({ dedEncId: permitida.dedEncId || dedEnc?.id, codigo: permitida.codigo || dedEnc?.codigo, aliquotaTotal: aliquota, aliquota })
            : null;
        const compsDarf = tipo === 'DDF025'
            ? calcularComponentesDarf(baseTC, aliquota, aliquotasDarf)
            : null;
        const valorCalc = tipo === 'DDF025' && compsDarf
            ? compsDarf.total
            : truncar2(baseTC * (aliquota / 100));
        campos.innerHTML = `
            <div class="form-group"><label>Base de cálculo (R$):</label><input type="text" id="dedModalBase" value="${typeof formatarMoedaBR === 'function' ? formatarMoedaBR(baseTC) : baseTC.toFixed(2)}" data-moeda></div>
            <div class="form-group"><label>Alíquota (%):</label><input type="number" id="dedModalAliquota" step="0.01" value="${aliquota}" ${tipo === 'DDF025' ? 'readonly' : ''}></div>
            <div class="form-group"><label>Valor calculado (R$):</label><input type="text" id="dedModalValor" readonly value="${typeof formatarMoedaBR === 'function' ? formatarMoedaBR(valorCalc) : valorCalc.toFixed(2)}"></div>
            <div class="form-group"><label>Data apuração:</label><input type="date" id="dedModalDataApuracao" value="${dataApuracao}" ${tipo === 'DDF021' || tipo === 'DDR001' ? 'readonly' : ''}></div>
            ${tipo === 'DDF025' ? `
                <fieldset class="gov-fieldset" style="margin-top:8px;">
                    <legend>Composição DARF (somente leitura)</legend>
                    <div class="form-row">
                        <div class="form-group flex-1"><label>IR (R$):</label><input type="text" id="dedModalIR" readonly value="${typeof formatarMoedaBR === 'function' ? formatarMoedaBR(compsDarf?.valorIR || 0) : (compsDarf?.valorIR || 0).toFixed(2)}"></div>
                        <div class="form-group flex-1"><label>COFINS (R$):</label><input type="text" id="dedModalCOFINS" readonly value="${typeof formatarMoedaBR === 'function' ? formatarMoedaBR(compsDarf?.valorCOFINS || 0) : (compsDarf?.valorCOFINS || 0).toFixed(2)}"></div>
                        <div class="form-group flex-1"><label>CSLL (R$):</label><input type="text" id="dedModalCSLL" readonly value="${typeof formatarMoedaBR === 'function' ? formatarMoedaBR(compsDarf?.valorCSLL || 0) : (compsDarf?.valorCSLL || 0).toFixed(2)}"></div>
                        <div class="form-group flex-1"><label>PIS/PASEP (R$):</label><input type="text" id="dedModalPISPASEP" readonly value="${typeof formatarMoedaBR === 'function' ? formatarMoedaBR(compsDarf?.valorPISPASEP || 0) : (compsDarf?.valorPISPASEP || 0).toFixed(2)}"></div>
                    </div>
                </fieldset>
            ` : ''}
        `;
        const baseInp = document.getElementById('dedModalBase');
        const aliqInp = document.getElementById('dedModalAliquota');
        const recalc = () => {
            const b = typeof valorMoedaParaNumero === 'function' ? valorMoedaParaNumero(baseInp?.value || 0) : parseFloat(String(baseInp?.value || 0).replace(/[^\d,.-]/g,'').replace(',','.')) || 0;
            const a = parseFloat(aliqInp?.value || 0) || 0;
            const valEl = document.getElementById('dedModalValor');
            if (tipo === 'DDF025') {
                const c = calcularComponentesDarf(b, a, aliquotasDarf);
                if (valEl) valEl.value = typeof formatarMoedaBR === 'function' ? formatarMoedaBR(c.total) : c.total.toFixed(2);
                const elIr = document.getElementById('dedModalIR');
                const elCof = document.getElementById('dedModalCOFINS');
                const elCsll = document.getElementById('dedModalCSLL');
                const elPis = document.getElementById('dedModalPISPASEP');
                if (elIr) elIr.value = typeof formatarMoedaBR === 'function' ? formatarMoedaBR(c.valorIR) : c.valorIR.toFixed(2);
                if (elCof) elCof.value = typeof formatarMoedaBR === 'function' ? formatarMoedaBR(c.valorCOFINS) : c.valorCOFINS.toFixed(2);
                if (elCsll) elCsll.value = typeof formatarMoedaBR === 'function' ? formatarMoedaBR(c.valorCSLL) : c.valorCSLL.toFixed(2);
                if (elPis) elPis.value = typeof formatarMoedaBR === 'function' ? formatarMoedaBR(c.valorPISPASEP) : c.valorPISPASEP.toFixed(2);
            } else {
                const v = truncar2(b * (a / 100));
                if (valEl) valEl.value = typeof formatarMoedaBR === 'function' ? formatarMoedaBR(v) : v.toFixed(2);
            }
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
        const aliquotasDarf = tipo === 'DDF025'
            ? obterAliquotasComponentesDarf({ dedEncId: permitida.dedEncId || dedEnc?.id, codigo: permitida.codigo || dedEnc?.codigo, aliquotaTotal: aliquotaVal, aliquota: aliquotaVal })
            : null;
        const compsDarf = tipo === 'DDF025' ? calcularComponentesDarf(baseVal, aliquotaVal, aliquotasDarf) : null;
        const valorCalc = tipo === 'DDF025' && compsDarf
            ? compsDarf.total
            : truncar2(baseVal * (aliquotaVal / 100));
        const dataApuracao = document.getElementById('dedModalDataApuracao')?.value || '';
        const jaExiste = (tipo === 'DDF021' || tipo === 'DDR001') && deducoesAplicadasAtual.some((d, idx) => d.tipo === tipo && idx !== editIndex);
        if (jaExiste) { alert('Já existe uma dedução ' + (tipo === 'DDF021' ? 'INSS' : 'ISS') + ' neste TC. Remova-a antes de adicionar outra.'); return; }
        const item = {
            dedEncId: permitida.dedEncId || dedEnc?.id,
            tipo, codigo: permitida.codigo || dedEnc?.codigo, descricao: permitida.descricao || dedEnc?.descricao,
            baseCalculo: baseVal, aliquota: aliquotaVal, valorCalculado: valorCalc, dataApuracao,
            natRendimento: dedEnc?.natRendimento, codReceita: dedEnc?.codReceita,
            valorIR: compsDarf?.valorIR || 0,
            valorCOFINS: compsDarf?.valorCOFINS || 0,
            valorCSLL: compsDarf?.valorCSLL || 0,
            valorPISPASEP: compsDarf?.valorPISPASEP || 0
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
        ['btnRetornarProcessamento', 'btnRetornarLiquidacao', 'btnDevolver', 'btnDarNovaEntrada', 'btnEnviarProcessamento', 'btnSalvarTitulo', 'btnCancelarTitulo'].forEach(id => {
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
        sincronizarCampoBuscaCentroCustos();
        const ug = document.getElementById('vinculoUG');
        if (ug) ug.value = '';
        sincronizarCampoBuscaUG();
        atualizarResumoSelecaoVinculo();
        limparErroVinculoEmpenho();
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
        sincronizarCampoBuscaCentroCustos();

        const ug = document.getElementById('vinculoUG');
        if (ug) ug.value = v.ugId || '';
        sincronizarCampoBuscaUG();
        limparErroVinculoEmpenho();

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

    function modoSemContratoAtivo() {
        const chk = document.getElementById('chkContinuarSemContrato');
        return !!(chk && chk.checked);
    }

    function atualizarPlaceholderBuscaNE() {
        const inputEmpenho = document.getElementById('buscaEmpenhoT');
        if (!inputEmpenho) return;
        inputEmpenho.placeholder = modoSemContratoAtivo()
            ? 'Ex: 741000... (filtro por CNPJ + Tipo de TC)'
            : 'Ex: 741000...';
    }

    function aplicarModoSemContrato(ativo) {
        const fieldset = document.getElementById('fieldsetContratoFornecedor');
        const chk = document.getElementById('chkContinuarSemContrato');
        if (chk && chk.checked !== !!ativo) chk.checked = !!ativo;
        if (fieldset) fieldset.classList.toggle('tc-sem-contrato', !!ativo);
        if (ativo) {
            document.getElementById('contratoIdSelecionado').value = '';
            const sel = document.getElementById('contratoSelecionado');
            if (sel) sel.value = '';
            preencherDadosContrato(null);
            if (typeof recalcularDeducoesContratoSubstituindo === 'function') recalcularDeducoesContratoSubstituindo();
            if (typeof desenharBotoesCalcularDed === 'function') desenharBotoesCalcularDed();
        }
        atualizarPlaceholderBuscaNE();
    }

    function configurarToggleSemContrato() {
        const chk = document.getElementById('chkContinuarSemContrato');
        if (!chk || chk.dataset.bound === '1') return;
        chk.dataset.bound = '1';
        chk.addEventListener('change', function() {
            aplicarModoSemContrato(this.checked);
        });
    }

    function atualizarAvisoSemContrato({ cnpjPreenchido, totalContratos }) {
        const aviso = document.getElementById('avisoSemContratoFornecedor');
        if (!aviso) return;
        const deveExibir = !!cnpjPreenchido && totalContratos === 0;
        aviso.style.display = deveExibir ? '' : 'none';
        if (!deveExibir) {
            aplicarModoSemContrato(false);
        }
    }

    async function selecionarFornecedorPorCnpj(cnpjSelecionado) {
        const cnpjN = normalizarCNPJ14(cnpjSelecionado);
        const fornecedorObj = obterFornecedorPorCnpj(cnpjN);

        document.getElementById('fornecedorValor').value = cnpjN || '';
        const input = document.getElementById('buscaFornecedorT');
        if (input) {
            input.value = fornecedorObj ? fornecedorDisplay(fornecedorObj) : (cnpjN ? cnpjN : '');
            input.readOnly = !!fornecedorObj;
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
                if (contratosFornecedorSelecionado.length === 0) {
                    sel.innerHTML = '<option value="">Nenhum contrato vinculado a este CNPJ</option>';
                    sel.disabled = true;
                } else {
                    sel.innerHTML = '<option value="">Selecione o contrato</option>';
                    sel.disabled = false;
                    contratosFornecedorSelecionado.forEach(c => {
                        const opt = document.createElement('option');
                        opt.value = c.id;
                        opt.textContent = c.numContrato || c.instrumento || '-';
                        sel.appendChild(opt);
                    });
                }
            } else {
                contratosFornecedorSelecionado = [];
            }
        }
        atualizarAvisoSemContrato({
            cnpjPreenchido: !!cnpjN,
            totalContratos: (contratosFornecedorSelecionado || []).length
        });
        preencherDadosContrato(null);
        atualizarPlaceholderBuscaNE();
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
        atualizarAvisoSemContrato({ cnpjPreenchido: false, totalContratos: 0 });
        preencherDadosContrato(null);
        atualizarPlaceholderBuscaNE();
    };

    function preencherDadosContrato(contrato) {
        const fmtMoeda = (v) => typeof formatarMoedaBR === 'function' ? formatarMoedaBR(v || 0) : String(v || '');
        const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
        const normalizarStatusRc = (status) => {
            const s = String(status || 'Ativo').trim().toLowerCase();
            return s === 'inativo' ? 'Inativo' : 'Ativo';
        };
        const normalizarTipoRc = (tipo) => {
            const t = String(tipo || '').trim();
            return (t === 'Material' || t === 'Serviço' || t === 'Locação') ? t : '';
        };
        const extrairOpcaoRc = (rc, idx) => {
            if (!rc) return null;
            if (typeof rc === 'string') {
                const txt = String(rc).trim();
                const m = txt.match(/^(\d+)\s*\/\s*(\d{4})\s*-\s*(Material|Serviço|Locação)$/i);
                if (!m) return null;
                const tipo = m[3].toLowerCase() === 'serviço' ? 'Serviço' : (m[3].toLowerCase() === 'locação' ? 'Locação' : 'Material');
                return {
                    ano: m[2],
                    numero: m[1],
                    tipo: tipo,
                    status: 'Ativo',
                    createdAt: idx
                };
            }
            const ano = String(rc.ano || rc.anoRC || '').replace(/\D/g, '').slice(0, 4);
            const numero = String(rc.numero || rc.numRC || rc.numeroRC || '').replace(/\D/g, '');
            const tipo = normalizarTipoRc(rc.tipo || rc.tipoRC || '');
            const status = normalizarStatusRc(rc.status || rc.statusRC || 'Ativo');
            if (!ano || !numero || !tipo) return null;
            let createdAt = rc.createdAt || rc.criadoEm || idx;
            if (typeof createdAt !== 'number') {
                const parsed = new Date(createdAt).getTime();
                createdAt = Number.isNaN(parsed) ? idx : parsed;
            }
            return { ano, numero, tipo, status, createdAt };
        };
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
            const anoAtual = String(new Date().getFullYear());
            const opcoes = rcs
                .map((rc, idx) => extrairOpcaoRc(rc, idx))
                .filter(Boolean)
                .filter(rc => rc.status === 'Ativo' && rc.ano === anoAtual)
                .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))
                .map(rc => {
                    const label = rc.numero + '/' + rc.ano + ' - ' + rc.tipo;
                    return '<option value="' + escapeHTML(label) + '">' + escapeHTML(label) + '</option>';
                });
            if (opcoes.length) {
                rcS.innerHTML = opcoes.join('');
                rcS.selectedIndex = opcoes.length - 1;
            } else {
                rcS.innerHTML = '<option value="">Nenhuma cadastrada para esse ano</option>';
            }
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
        const semContrato = !contratoSel && modoSemContratoAtivo();
        const fornecedorCnpjSelecionado = (document.getElementById('fornecedorValor')?.value || '').trim();

        if (!contratoSel && !semContrato) {
            listaEmpenhosT.innerHTML = '<li style="padding:10px; color:#777; font-size:12px;">Selecione um Contrato para filtrar as NE.</li>';
            return;
        }
        if (semContrato && !fornecedorCnpjSelecionado) {
            listaEmpenhosT.innerHTML = '<li style="padding:10px; color:#777; font-size:12px;">Selecione o Fornecedor para filtrar as NE.</li>';
            return;
        }

        const tipoTC = (document.getElementById('tipoTC')?.value || '').trim();
        if (!tipoTC) {
            listaEmpenhosT.innerHTML = '<li style="padding:10px; color:#777; font-size:12px;">Selecione o Tipo de TC para filtrar as NE.</li>';
            return;
        }

        // Filtro 2: tenta obter CNPJ por múltiplos campos do contrato (ou direto do fornecedor, se sem contrato).
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
        const cnpjContrato = semContrato
            ? normalizarCNPJ(fornecedorCnpjSelecionado)
            : extrairCnpjDoContrato(contratoSel);
        const fornecedorSemContratoObj = semContrato
            ? (typeof obterFornecedorPorCnpj === 'function' ? obterFornecedorPorCnpj(cnpjContrato) : null)
            : null;
        const nomeFornecedorContrato = semContrato
            ? normalizarNome((fornecedorSemContratoObj && (fornecedorSemContratoObj.nome || fornecedorSemContratoObj.nomeFornecedor)) || '')
            : normalizarNome(contratoSel.nomeFornecedor || contratoSel.fornecedor || contratoSel.razaoSocial || contratoSel.empresa || '');

        // Valida o ND: se estiver vazio/inválido, a NE deve sumir (mesmo em "NF Genérica").
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
            // NFG: ignora filtro do ND, mas ainda exige ND válido (já checado).
            if (tipoTC === 'NFG') return true;
            return false;
        };

        const visivelNE = (e) => {
            const num = String(e.numEmpenho || e.numNE || '').trim();
            if (typeof formatarNumEmpenhoVisivel === 'function') return String(formatarNumEmpenhoVisivel(num) || '').toLowerCase();
            return num.slice(-12).toLowerCase();
        };

        const resultados = (baseEmpenhos || [])
            .filter(e => {
                const cnpjNE = normalizarCNPJ(e.cnpjCpf || e.cnpj_cpf || e.cnpj || '');
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

            li.addEventListener('mousedown', async (ev) => {
                ev.preventDefault();
                if (existeEdicaoEmpenhoPendente()) {
                    const descartar = await modalTrocaEdicaoEmpenhoPromessa();
                    if (!descartar) return;
                }
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
                sincronizarCampoBuscaCentroCustos();
                const ug = document.getElementById('vinculoUG');
                if (ug) ug.value = '';
                sincronizarCampoBuscaUG();
                limparErroVinculoEmpenho();
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
        if (tipoTC === 'NFG') return 'numérico válido';
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
        limparErroVinculoEmpenho();
        const editando = (indiceEmpenhoEditando !== null && indiceEmpenhoEditando !== undefined);
        const nd = (document.getElementById('vinculoND')?.value || '').trim();
        const subelemento = (document.getElementById('vinculoSubelemento')?.value || '').trim();
        const valorInput = document.getElementById('vinculoValor')?.value;
        const centroCustosId = (document.getElementById('vinculoCentroCustos')?.value || '').trim();
        const ugId = (document.getElementById('vinculoUG')?.value || '').trim();
        if (!/^\d{2}$/.test(subelemento)) return exibirErroVinculoEmpenho("Subelemento deve ter exatamente 2 dígitos numéricos.", 'vinculoSubelemento');
        if (!valorInput) return exibirErroVinculoEmpenho("Informe o valor utilizado.", 'vinculoValor');
        const valorNum = typeof valorMoedaParaNumero === 'function' ? valorMoedaParaNumero(valorInput) : (parseFloat(String(valorInput).replace(/\./g,'').replace(',','.')) || 0);
        if (valorNum < 0.01) return exibirErroVinculoEmpenho("Valor utilizado deve ser no mínimo R$ 0,01.", 'vinculoValor');
        const valorTC = typeof valorMoedaParaNumero === 'function' ? valorMoedaParaNumero(document.getElementById('valorNotaFiscal')?.value) : (parseFloat(document.getElementById('valorNotaFiscal')?.value) || 0);
        if (valorTC > 0 && valorNum > valorTC) return exibirErroVinculoEmpenho("Valor utilizado não pode ser maior que o valor do TC (R$ " + (typeof formatarMoedaBR === 'function' ? formatarMoedaBR(valorTC) : valorTC.toFixed(2)) + ").", 'vinculoValor');
        if (!centroCustosId) return exibirErroVinculoEmpenho("Selecione o Centro de Custos.", 'vinculoCentroCustosBusca');
        if (!ugId) return exibirErroVinculoEmpenho("Selecione a UG Beneficiária.", 'vinculoUGBusca');

        // Modo edição: atualiza o item existente (valor, centro de custos, UG).
        if (editando) {
            const idx = indiceEmpenhoEditando;
            if (!empenhosDaNotaAtual[idx]) return;
            empenhosDaNotaAtual[idx].valorVinculado = valorNum;
            empenhosDaNotaAtual[idx].centroCustosId = centroCustosId;
            empenhosDaNotaAtual[idx].ugId = ugId;
            // Reforço de FR: se o vínculo (legado) estiver sem fr, tenta resgatar do cache local de empenhos
            if (!String(empenhosDaNotaAtual[idx].fr || '').trim()) {
                const numEmpAtual = String(empenhosDaNotaAtual[idx].numEmpenho || '').trim();
                const fonte = (baseEmpenhos || []).find(e => String(e?.numEmpenho || '').trim() === numEmpAtual);
                if (fonte && fonte.fr) empenhosDaNotaAtual[idx].fr = fonte.fr;
            }
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

        if (!empenhoTemporarioSelecionado) return exibirErroVinculoEmpenho("Selecione uma NE na busca.", 'buscaEmpenhoT');
        const numEmp = (empenhoTemporarioSelecionado.numEmpenho || empenhoTemporarioSelecionado.numNE || '').trim();
        if (!numEmp) return exibirErroVinculoEmpenho("NE inválida. Selecione novamente pela busca.", 'buscaEmpenhoT');
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
                const instrumentoSalvo = String(t.instrumento || '').trim();
                const contratoLigado = instrumentoSalvo
                    ? (contratosFornecedorSelecionado || []).find(c =>
                        (c.numContrato || c.instrumento || '') === instrumentoSalvo
                    )
                    : null;
                if (contratoLigado) {
                    document.getElementById('contratoIdSelecionado').value = contratoLigado.id;
                    const sel = document.getElementById('contratoSelecionado');
                    if (sel) {
                        sel.value = contratoLigado.id;
                        preencherDadosContrato(contratoLigado);
                        const rcEl = document.getElementById('rcSelecionada');
                        if (rcEl && t.rc) rcEl.value = t.rc;
                    }
                } else if (!instrumentoSalvo) {
                    // TC salvo sem contrato vinculado: ativa automaticamente o modo "sem contrato".
                    aplicarModoSemContrato(true);
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
        const plW = document.getElementById('plRastroWrap');
        const plTx = document.getElementById('plRastroTexto');
        const plLk = document.getElementById('plRastroLink');
        if (plW && plTx && plLk) {
            if (t.preLiquidacaoCodigo || t.preLiquidacaoId) {
                plW.style.display = 'flex';
                plTx.textContent = t.preLiquidacaoCodigo || t.preLiquidacaoId || '';
                if (t.preLiquidacaoId) {
                    plLk.href = 'preliquidacao.html?pl=' + encodeURIComponent(t.preLiquidacaoId);
                    plLk.style.display = 'inline';
                } else {
                    plLk.style.display = 'none';
                }
            } else {
                plW.style.display = 'none';
            }
        }
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
        (empenhosDaNotaAtual || []).forEach((v) => {
            const tr = document.createElement('tr');
            const ccLabel = labelCentroCustos(v.centroCustosId);
            const ugLabel = labelUG(v.ugId);
            const lfReg = lfAtivas.find(r => (r.lf || '') === (v.lf || ''));
            const lfExib = (v.lf || '').trim() ? escapeHTML(v.lf) : '-';
            const pfExib = lfReg && lfReg.pf ? escapeHTML(lfReg.pf) : escapeHTML((v.pf || '').trim() || '-');
            tr.innerHTML = '<td>' + (typeof formatarNumEmpenhoVisivel === 'function' ? formatarNumEmpenhoVisivel(v.numEmpenho) : (v.numEmpenho || '-')) + '</td>' +
                '<td>' + escapeHTML(v.nd || '-') + '</td>' +
                '<td>R$ ' + (typeof formatarMoedaBR === 'function' ? formatarMoedaBR(v.valorVinculado || 0) : (v.valorVinculado || '0')) + '</td>' +
                '<td>' + escapeHTML(ccLabel) + '</td>' +
                '<td>' + escapeHTML(ugLabel) + '</td>' +
                '<td class="lf-readonly">' + lfExib + '</td>' +
                '<td class="pf-readonly">' + pfExib + '</td>';
            tbody.appendChild(tr);
        });
    }

    function desenharFinanceiro() {
        const tbody = document.getElementById('tbodyLFPF');
        if (!tbody) return;
        tbody.innerHTML = '';
        const lfAtivas = (baseLfPf || []).filter(r => r.ativo !== false);
        (empenhosDaNotaAtual || []).forEach((v) => {
            const tr = document.createElement('tr');
            const lfReg = lfAtivas.find(r => (r.lf || '') === (v.lf || ''));
            const lfExib = (v.lf || '').trim() ? escapeHTML(v.lf) : '-';
            const pfExib = lfReg && lfReg.pf ? escapeHTML(lfReg.pf) : escapeHTML((v.pf || '').trim() || '-');
            tr.innerHTML = '<td>' + (typeof formatarNumEmpenhoVisivel === 'function' ? formatarNumEmpenhoVisivel(v.numEmpenho) : (v.numEmpenho || '-')) + '</td>' +
                '<td>R$ ' + (typeof formatarMoedaBR === 'function' ? formatarMoedaBR(v.valorVinculado || 0) : (v.valorVinculado || '0')) + '</td>' +
                '<td class="lf-readonly">' + lfExib + '</td>' +
                '<td class="pf-readonly">' + pfExib + '</td>';
            tbody.appendChild(tr);
        });
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
        const tituloAtual = fbID !== '-1' ? baseTitulos.find(x => x.id === fbID) : null;
        const statusAtual = tituloAtual?.status || 'Rascunho';

        const dataExefin = (document.getElementById('dataExefin').value || '').trim();
        const numTC = (document.getElementById('numTC').value || '').trim();
        const fornecedorCnpj = normalizarCNPJ((document.getElementById('fornecedorValor').value || document.getElementById('buscaFornecedorT')?.value || '').trim());
        const fornecedorObj = fornecedorCnpj ? obterFornecedorPorCnpj(fornecedorCnpj) : null;
        const fornecedorInputTexto = String(document.getElementById('buscaFornecedorT')?.value || '').trim();
        const fornecedorNomeInput = fornecedorInputTexto.includes(' - ')
            ? fornecedorInputTexto.split(' - ').slice(1).join(' - ').trim()
            : '';
        const fornecedorNome = fornecedorObj
            ? (fornecedorObj.nome || fornecedorObj.nomeFornecedor || '')
            : (String(tituloAtual?.fornecedorNome || '').trim() || fornecedorNomeInput);
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
        if (!fornecedorCnpj) return alert("Selecione o Fornecedor (CNPJ).");
        if (!instrumento && !modoSemContratoAtivo()) return alert('Selecione o Contrato ou marque "Continuar sem contrato vinculado".');
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

        // Garanto que o modelo interno persista sempre `subelemento` (legado: subitem).
        normalizarEmpenhosDaNotaAtualSubelemento();

        const anoTCVal = (document.getElementById('anoTC')?.value || '').trim() || String(new Date().getFullYear());
        const idProcInformado = (document.getElementById('idProc').value || '').trim();
        // Evita sobrescrever idProc no Firestore quando o hidden ficou vazio após o 1º salvamento (modal).
        const idProcParaPersistir = idProcInformado || String(tituloAtual?.idProc || '').trim();
        const dados = {
            idProc: escapeHTML(idProcParaPersistir),
            ano: escapeHTML(anoTCVal),
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

        if (window.sisAnoDocumento && typeof window.sisAnoDocumento.aplicarAnosTitulo === 'function') {
            window.sisAnoDocumento.aplicarAnosTitulo(dados);
        }

        let novoStatus = statusAtual;
        const npPreenchida = !!dados.np?.trim();
        const eraNovo = (fbID === '-1' || !fbID);
        if (eraNovo) {
            dados.entradaSaida = [{ tipo: 'entrada', data: dataExefin, oiOrigem: oiEntregou }];
        }

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
                const sim = await modalEncaminharStatusPromessa({
                    texto: montarResumoPreEncaminhamentoLiquidacao({ empenhosVinculados: empenhosDaNotaAtual })
                });
                if (sim) {
                    const vEmp = validarPreRequisitosEncaminharTC({ empenhosVinculados: empenhosDaNotaAtual }, 'Em Liquidação');
                    if (!vEmp.ok) {
                        alert(vEmp.mensagem);
                        return;
                    }
                    novoStatus = 'Em Liquidação';
                    dados.status = novoStatus;
                } else {
                    dados.status = 'Em Processamento';
                    novoStatus = dados.status;
                }
            } else if (statusAtual === 'Em Liquidação' && npPreenchida && indiceAbaAtiva === 2) {
                const sim = await modalEncaminharStatusPromessa({
                    texto: 'Deseja enviar este título para "Liquidado"? Ao confirmar, o sistema grava a NP e registra a liquidação concluída.'
                });
                if (sim) {
                    novoStatus = 'Liquidado';
                    dados.status = novoStatus;
                } else {
                    dados.status = 'Em Liquidação';
                    novoStatus = dados.status;
                }
            } else if (statusAtual === 'Liquidado' || statusAtual === 'Aguardando Financeiro') {
                if (empenhosDaNotaAtual.length === 0) {
                    alert('É necessário ter empenhos vinculados para avançar. Verifique a aba Processamento.');
                    return;
                }
                const todosLF = empenhosDaNotaAtual.every(v => !!(v.lf || '').trim());
                const todosPF = empenhosDaNotaAtual.every(v => !!(v.pf || '').trim());
                let candidato = statusAtual;
                if (todosLF && todosPF) candidato = 'Para Pagamento';
                else if (todosLF) candidato = 'Aguardando Financeiro';
                if (candidato !== statusAtual) {
                    const sim = await modalEncaminharStatusPromessa({
                        texto: `Deseja enviar este título para "${candidato}"? Ao confirmar, o sistema grava as alterações e registra a mudança de status.`
                    });
                    if (sim) {
                        novoStatus = candidato;
                        dados.status = candidato;
                    } else {
                        dados.status = statusAtual;
                        novoStatus = statusAtual;
                    }
                } else {
                    dados.status = statusAtual;
                    novoStatus = statusAtual;
                }
            } else {
                dados.status = statusAtual || 'Rascunho';
                novoStatus = dados.status;
            }
        }

        const dadosSanitizados = normalizarParaFirestore(dados);

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
                const criado = await criarTituloComIdProcSequencial(dadosSanitizados);
                docId = criado.docId;
                dadosSanitizados.idProc = criado.idProc;
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
                const idProcGerado = dadosSanitizados.idProc || '';
                const idProcEl = document.getElementById('idProc');
                if (idProcEl && idProcGerado) idProcEl.value = idProcGerado;
                const tituloEl = document.getElementById('tituloFormTC');
                if (tituloEl && idProcGerado) tituloEl.textContent = idProcGerado + ' - Entrada de Título de Crédito';
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
        const texto = destino === 'Em Liquidação'
            ? montarResumoPreEncaminhamentoLiquidacao(t)
            : 'Deseja enviar este título para "Em Processamento"? Ao confirmar, o sistema verifica os dados básicos e a OI de origem.';
        const sim = await modalEncaminharStatusPromessa({ texto });
        if (!sim) return;
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

    document.getElementById('btnRetornarProcessamento')?.addEventListener('click', async function() {
        const fbID = document.getElementById('editIndexTitulo').value;
        if (fbID === '-1' || !fbID) return alert("Salve o TC primeiro.");
        await executarRetornoStatus([fbID], 'Em Liquidação', 'Em Processamento', false);
    });

    document.getElementById('btnRetornarLiquidacao')?.addEventListener('click', async function() {
        const fbID = document.getElementById('editIndexTitulo').value;
        if (fbID === '-1' || !fbID) return alert("Salve o TC primeiro.");
        await executarRetornoStatus([fbID], 'Liquidado', 'Em Liquidação', false);
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

    async function executarRetornoStatus(ids, origemEsperada, destino, emBloco) {
        if (!usuarioPodeTramitarTC()) return alert('Acesso negado para tramitação.');
        const listaIds = Array.isArray(ids) ? ids.filter(Boolean) : [];
        if (!listaIds.length) return alert('Selecione ao menos um TC.');
        const n = listaIds.length;
        const texto = n > 1
            ? `Tem certeza que deseja retornar ${n} TC(s) de "${origemEsperada}" para "${destino}"?`
            : `Tem certeza que deseja retornar este TC de "${origemEsperada}" para "${destino}"?`;
        const confirmar = await modalEncaminharStatusPromessa({
            tituloModal: `Retornar para ${destino}`,
            texto
        });
        if (!confirmar) return;
        const motivo = (prompt('Informe o motivo do retorno (opcional):') || '').trim();
        mostrarLoading();
        const falhas = [];
        let okCount = 0;
        try {
            for (const id of listaIds) {
                const snap = await db.collection('titulos').doc(id).get();
                if (!snap.exists) {
                    falhas.push(`${id}: TC não encontrado.`);
                    continue;
                }
                const tc = snap.data() || {};
                const statusAtual = tc.status || 'Rascunho';
                if (statusAtual !== origemEsperada) {
                    falhas.push(`${tc.idProc || id}: status atual "${statusAtual}" não permite retorno para "${destino}".`);
                    continue;
                }
                const hist = obterHistorico(tc);
                const info = [
                    motivo ? `Motivo: ${motivo}` : '',
                    emBloco ? 'Operação em bloco' : ''
                ].filter(Boolean).join(' | ');
                hist.push(construirEntradaHistorico({
                    status: destino,
                    evento: `Retorno de status (${origemEsperada} -> ${destino})`,
                    acao: `Retornado para ${destino} por`,
                    info,
                    aba: null
                }));
                await db.collection('titulos').doc(id).update({
                    status: destino,
                    historico: hist,
                    historicoStatus: hist,
                    editado_em: firebase.firestore.FieldValue.serverTimestamp()
                });
                okCount++;
            }
            if (okCount > 0) {
                if (emBloco) {
                    titulosSelecionados.clear();
                    atualizarUIselecao();
                    atualizarTabelaTitulos();
                } else {
                    voltarParaListaTitulos();
                }
            }
            let msg = `${okCount} TC(s) retornado(s) para "${destino}".`;
            if (falhas.length) {
                msg += `\n\nNão retornados (${falhas.length}):\n- ` + falhas.slice(0, 12).join('\n- ');
                if (falhas.length > 12) msg += `\n- ... e mais ${falhas.length - 12}.`;
            }
            alert(msg);
        } catch (err) {
            alert('Erro ao retornar status: ' + (err.message || err));
        } finally {
            esconderLoading();
        }
    }

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
                if (!(statusAtual === 'Rascunho' || statusAtual === 'Em Processamento' || statusAtual === 'Em Liquidação')) continue;
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
                    evento: 'Devolução física para OI',
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
            alert(ids.length > 1 ? "TCs devolvidos fisicamente em bloco." : "TC devolvido fisicamente.");
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

    async function gerarPDFTitulo(id, opcoes = {}) {
        const salvar = opcoes.salvar !== false;
        const iniciarComNovaPagina = opcoes.iniciarComNovaPagina === true;
        let t = opcoes.tcCarregado || baseTitulos.find(x => x.id === id) || null;
        if (!t) {
            try {
                const doc = await db.collection('titulos').doc(id).get();
                if (!doc.exists) {
                    if (salvar) alert("TC não encontrado para gerar PDF.");
                    return { ok: false, erro: 'TC não encontrado' };
                }
                t = { id: doc.id, ...doc.data() };
            } catch (err) {
                if (salvar) alert("Erro ao carregar TC para PDF: " + (err.message || err));
                return { ok: false, erro: err && err.message || String(err) };
            }
        }
        if (!window.jspdf || !window.jspdf.jsPDF) {
            if (salvar) alert("Módulo de PDF indisponível. Verifique o carregamento da biblioteca jsPDF.");
            return { ok: false, erro: 'jsPDF indisponível' };
        }
        const { jsPDF } = window.jspdf;
        const docPDF = opcoes.docPDF || new jsPDF({ unit: 'mm', format: 'a4' });
        if (opcoes.docPDF && iniciarComNovaPagina) docPDF.addPage();
        const M = { l: 10, r: 10, t: 10, b: 12 };
        const W = 210 - M.l - M.r;
        const PAGE_H = 297;
        let y = M.t;
        const moeda = (n) => 'R$ ' + (Number(n || 0)).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        const normalizarDigitos = (v) => String(v || '').replace(/\D/g, '');
        const labelOI = (id) => {
            const chave = String(id || '').trim();
            if (!chave) return '-';
            const oi = (listaOI || []).find(x => String(x.id || '').trim() === chave);
            return oi ? String(oi.numeroOI || '-').trim() : chave;
        };
        const labelCC = (id) => {
            const chave = String(id || '').trim();
            if (!chave) return '-';
            const cc = (listaCentroCustos || []).find(x => String(x.id || '').trim() === chave);
            return cc ? String(cc.codigo || '-').trim() : chave;
        };
        const labelUGPdf = (id) => {
            const chave = String(id || '').trim();
            if (!chave) return '-';
            const ug = (listaUG || []).find(x => String(x.id || '').trim() === chave);
            return ug ? String(ug.codigo || '-').trim() : chave;
        };
        const toDateBr = (v) => {
            if (!v) return '-';
            if (v.toDate) {
                const d = v.toDate();
                return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
            }
            if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)) {
                const p = v.slice(0, 10).split('-');
                return `${p[2]}/${p[1]}/${p[0]}`;
            }
            const d = new Date(v);
            if (isNaN(d.getTime())) return String(v);
            return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
        };
        const toDateTimeBr = (v) => {
            if (!v) return '-';
            const d = v.toDate ? v.toDate() : new Date(v);
            if (isNaN(d.getTime())) return '-';
            const data = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
            const hora = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
            return `${data} às ${hora}`;
        };
        const garantirEspaco = (h) => {
            if (y + h > PAGE_H - M.b) { docPDF.addPage(); y = M.t; }
        };
        const tituloSecao = (txt) => {
            garantirEspaco(8);
            docPDF.setFont('helvetica', 'bold');
            docPDF.setFontSize(9.5);
            docPDF.setTextColor(0, 0, 0);
            docPDF.text(String(txt || ''), M.l, y + 4.8);
            docPDF.setDrawColor(155, 155, 155);
            docPDF.line(M.l, y + 5.8, M.l + W, y + 5.8);
            y += 8;
        };
        const campoAbaixo = (label, valor, x, largura) => {
            const h = 12;
            garantirEspaco(h + 1);
            docPDF.setDrawColor(170, 170, 170);
            docPDF.rect(x, y, largura, h);
            docPDF.setFont('helvetica', 'bold');
            docPDF.setFontSize(7.3);
            docPDF.setTextColor(0, 0, 0);
            docPDF.text(String(label || '-'), x + 1.5, y + 3.4);
            docPDF.setFont('helvetica', 'normal');
            docPDF.setFontSize(8.1);
            const linhas = docPDF.splitTextToSize(String(valor || '-'), largura - 3);
            docPDF.text(linhas, x + 1.5, y + 8);
        };
        const linhaCampos = (campos) => {
            const gap = 2;
            const largura = (W - gap * (campos.length - 1)) / campos.length;
            campos.forEach((c, i) => campoAbaixo(c.label, c.valor, M.l + i * (largura + gap), largura));
            y += 13;
        };
        const tabela = (headers, rows, larguras) => {
            if (!rows || rows.length === 0) return;
            const hCab = 6;
            const hRow = 5.4;
            garantirEspaco(hCab + hRow + 2);
            const totalLarg = (larguras || []).reduce((s, n) => s + Number(n || 0), 0) || 1;
            const fator = W / totalLarg;
            const largurasEsc = (larguras || []).map(n => Number(n || 0) * fator);
            let x = M.l;
            docPDF.setDrawColor(175, 175, 175);
            docPDF.setTextColor(0, 0, 0);
            headers.forEach((h, i) => {
                // Sem preenchimento para evitar cabeçalho preto em viewers específicos.
                docPDF.rect(x, y, largurasEsc[i], hCab);
                docPDF.setFont('helvetica', 'bold');
                docPDF.setFontSize(7.1);
                docPDF.text(String(h), x + 1.2, y + 4);
                x += largurasEsc[i];
            });
            y += hCab;
            rows.forEach(r => {
                garantirEspaco(hRow + 1);
                x = M.l;
                r.forEach((cell, i) => {
                    docPDF.rect(x, y, largurasEsc[i], hRow);
                    docPDF.setFont('helvetica', 'normal');
                    docPDF.setFontSize(7.0);
                    const txt = docPDF.splitTextToSize(String(cell ?? '-'), largurasEsc[i] - 2.2);
                    docPDF.text(txt.slice(0, 1), x + 1.1, y + 3.8);
                    x += largurasEsc[i];
                });
                y += hRow;
            });
            y += 2;
        };
        const linhaTotalDireita = (label, valor) => {
            garantirEspaco(6);
            docPDF.setFont('helvetica', 'bold');
            docPDF.setFontSize(8.2);
            docPDF.text(`${label}: ${valor}`, M.l + W, y + 4, { align: 'right' });
            y += 6;
        };
        const obterOptanteSimples = () => {
            const cnpj = normalizarDigitos(t.fornecedorCnpj || t.fornecedor || '');
            if (!cnpj) return '-';
            const f = (baseFornecedores || []).find(x => normalizarDigitos(x.codigo || x.cnpj || '') === cnpj);
            if (!f) return '-';
            return (f.optanteSimples === true || String(f.optanteSimples || '').toLowerCase() === 'sim') ? 'Sim' : 'Não';
        };
        async function carregarLogoDataUrl(pathRel) {
            try {
                const resp = await fetch(pathRel);
                if (!resp.ok) return null;
                const blob = await resp.blob();
                return await new Promise(resolve => {
                    const fr = new FileReader();
                    fr.onload = () => resolve(fr.result);
                    fr.onerror = () => resolve(null);
                    fr.readAsDataURL(blob);
                });
            } catch (_) { return null; }
        }

        // 1) Cabeçalho
        const logoData = await carregarLogoDataUrl('icons/logo-192.png');
        const topoY = y;
        if (logoData) {
            try { docPDF.addImage(logoData, 'PNG', M.l, topoY, 20, 20); } catch (_) {}
        }
        docPDF.setFont('helvetica', 'bold');
        docPDF.setFontSize(12);
        docPDF.text('Papeleta de Dados de Título de Crédito', M.l + W / 2, topoY + 24, { align: 'center' });
        docPDF.setFont('helvetica', 'normal');
        docPDF.setFontSize(8);
        docPDF.text(`Impressão: ${toDateTimeBr(new Date())}`, M.l + W, topoY + 6, { align: 'right' });
        docPDF.text(`Usuário: ${usuarioLogadoEmail || '-'}`, M.l + W, topoY + 11, { align: 'right' });
        y = topoY + 29;

        // 2) Identificação do TC
        tituloSecao('Identificação do TC');
        linhaCampos([
            { label: 'ID-PROC', valor: t.idProc || '-' },
            { label: 'Entrada na EXEFIN', valor: toDateBr(t.dataExefin) },
            { label: 'OI de Origem', valor: labelOI(t.oiEntregou) },
            { label: 'Status', valor: (t.status || 'Rascunho') + (t.inativo ? ' (INATIVO)' : '') },
            { label: 'Última alteração', valor: toDateTimeBr(t.editado_em || t.criado_em) }
        ]);
        linhaCampos([
            { label: 'Tipo de TC', valor: t.tipoTC || '-' },
            { label: 'Nº do TC', valor: t.numTC || '-' },
            { label: 'Data de Emissão TC', valor: toDateBr(t.dataEmissao) },
            { label: 'Valor R$', valor: moeda(t.valorNotaFiscal) },
            { label: 'Data do Ateste', valor: toDateBr(t.dataAteste) }
        ]);

        // 3) Fornecedor e contrato
        const fornecedorFmt = t.fornecedorCnpj ? (typeof formatarCNPJ === 'function' ? formatarCNPJ(t.fornecedorCnpj) : t.fornecedorCnpj) : (t.fornecedor || '-');
        const vigencia = `${toDateBr(t.inicioVigencia)} a ${toDateBr(t.fimVigencia)}`;
        tituloSecao('FORNECEDOR E CONTRATO');
        linhaCampos([
            { label: 'Fornecedor', valor: fornecedorFmt || '-' },
            { label: 'Nome do Fornecedor', valor: t.fornecedorNome || '-' },
            { label: 'Contrato (Instrumento)', valor: t.instrumento || '-' },
            { label: 'Vigência', valor: vigencia },
            { label: 'RC', valor: t.rc || '-' }
        ]);
        linhaCampos([{ label: 'Observações', valor: t.observacoes || '-' }]);

        // 4) Empenhos vinculados
        const empenhos = t.empenhosVinculados || [];
        const obterFRdoVinculo = (v) => {
            const direto = String(v?.fr || '').trim();
            if (direto) return direto;
            const cache = Array.isArray(baseEmpenhos) ? baseEmpenhos : [];
            const fonte = cache.find(e => String(e?.numEmpenho || '').trim() === String(v?.numEmpenho || '').trim());
            return String(fonte?.fr || '').trim() || '-';
        };
        if (empenhos.length) {
            tituloSecao('EMPENHOS VINCULADOS');
            tabela(
                ['Nota de Empenho', 'ND', 'Sub', 'FR', 'VINC', 'Valor usado', 'C. de Custos', 'UG Benf.', 'LF', 'PF'],
                empenhos.map(v => [
                    (typeof formatarNumEmpenhoVisivel === 'function'
                        ? formatarNumEmpenhoVisivel(v.numEmpenho)
                        : (v.numEmpenho || '-')),
                    v.nd || '-',
                    v.subelemento || '-',
                    obterFRdoVinculo(v),
                    '',
                    moeda(v.valorVinculado || 0),
                    labelCC(v.centroCustosId),
                    labelUGPdf(v.ugId),
                    '',
                    ''
                ]),
                [12, 6, 4, 10, 6, 12, 10, 6, 15, 15]
            );
            const totalNE = empenhos.reduce((s, e) => s + Number(e.valorVinculado || 0), 0);
            linhaTotalDireita('Valor total das NE Vinculadas', moeda(totalNE));
        }

        // 5,6,7) Deduções por tipo
        const deds = (t.deducoesAplicadas || t.tributacoes || []).map(d => ({ ...d, valorCalculado: Number(d.valorCalculado != null ? d.valorCalculado : d.valor || 0) }));
        const itensISS = deds.filter(d => d.tipo === 'DDR001');
        const itensINSS = deds.filter(d => d.tipo === 'DDF021');
        const itensDARF = deds.filter(d => d.tipo === 'DDF025');

        if (itensISS.length) {
            tituloSecao('Dedução - ISS - DDR001');
            tabela(
                ['Cod. Receita', 'Base de Cálculo', 'Alíquota', 'Valor a deduzir', 'Data da Apuração'],
                itensISS.map(d => [
                    d.codReceita || d.codigo || '-',
                    moeda(d.baseCalculo || 0),
                    `${Number(d.aliquota || 0).toFixed(2)}%`,
                    moeda(truncar2(d.valorCalculado || 0)),
                    toDateBr(d.dataApuracao)
                ]),
                [28, 34, 24, 30, 34]
            );
        }
        if (itensINSS.length) {
            tituloSecao('Dedução - INSS - DDF021');
            tabela(
                ['Cod. Receita', 'Base de Cálculo', 'Alíquota', 'Valor a deduzir', 'Data da Apuração'],
                itensINSS.map(d => [
                    d.codReceita || d.codigo || '-',
                    moeda(d.baseCalculo || 0),
                    `${Number(d.aliquota || 0).toFixed(2)}%`,
                    moeda(truncar2(d.valorCalculado || 0)),
                    toDateBr(t.dataEmissao)
                ]),
                [28, 34, 24, 30, 34]
            );
        }
        if (itensDARF.length) {
            tituloSecao('Dedução - DARF - DDF025');
            const obterNatRendDARF = (d) => {
                const direto = String(d?.natRendimento || '').trim();
                if (direto) return direto;
                const cache = Array.isArray(baseDeducoesEncargos) ? baseDeducoesEncargos : [];
                const codigo = String(d?.codigo || d?.codReceita || '').trim();
                const fonte = cache.find(x =>
                    (d?.dedEncId && x?.id === d.dedEncId) ||
                    (codigo && String(x?.codigo || '').trim() === codigo && x?.tipo === 'DDF025')
                );
                return String(fonte?.natRendimento || '').trim() || '-';
            };
            const rowsDarF = itensDARF.map(d => {
                const base = Number(d.baseCalculo || t.valorNotaFiscal || 0);
                const aliq = Number(d.aliquota || 0);
                const comps = (d.valorIR != null || d.valorCOFINS != null || d.valorCSLL != null || d.valorPISPASEP != null)
                    ? {
                        valorIR: Number(d.valorIR || 0),
                        valorCOFINS: Number(d.valorCOFINS || 0),
                        valorCSLL: Number(d.valorCSLL || 0),
                        valorPISPASEP: Number(d.valorPISPASEP || 0),
                        total: arredondar2HalfUp(Number(d.valorIR || 0) + Number(d.valorCOFINS || 0) + Number(d.valorCSLL || 0) + Number(d.valorPISPASEP || 0))
                    }
                    : calcularComponentesDarf(base, aliq, obterAliquotasComponentesDarf(d));
                return [
                    d.codReceita || d.codigo || '-',
                    obterNatRendDARF(d),
                    moeda(base),
                    `${aliq.toFixed(2)}%`,
                    moeda(comps.valorIR),
                    moeda(comps.valorCOFINS),
                    moeda(comps.valorCSLL),
                    moeda(comps.valorPISPASEP),
                    moeda(comps.total)
                ];
            });
            tabela(
                ['Cod. Receita', 'Nat. Red.', 'Base de Cálculo', 'Alíquota Total', 'IR', 'COFINS', 'CSLL', 'PIS/PASEP', 'Total a deduzir'],
                rowsDarF,
                [14, 14, 20, 15, 15, 15, 15, 18, 24]
            );
            if (itensDARF.length > 1) {
                const totalDarf = rowsDarF.reduce((s, r) => s + Number(String(r[8]).replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.')), 0);
                linhaTotalDireita('Valor total DARF', moeda(totalDarf));
            }
        }

        // 8) Liquidação e financeiro
        const totalDed = truncar2(deds.reduce((s, d) => s + truncar2(d.valorCalculado || 0), 0));
        const valorTC = Number(t.valorNotaFiscal || 0);
        const obBase = Math.max(0, valorTC - totalDed);
        let valorOB = Math.ceil(obBase * 100) / 100;
        if (truncar2(totalDed + valorOB) > truncar2(valorTC)) valorOB = truncar2(obBase);
        tituloSecao('LIQUIDAÇÃO E FINANCEIRO');
        linhaCampos([
            { label: 'Valor do TC', valor: moeda(valorTC) },
            { label: 'Total das Deduções', valor: moeda(totalDed) },
            { label: 'Valor Líquido (OB)', valor: moeda(valorOB) },
            { label: 'Optante pelo Simples', valor: obterOptanteSimples() }
        ]);
        linhaCampos([
            { label: 'NP', valor: t.np || '-' },
            { label: 'Data da Liquidação', valor: toDateBr(t.dataLiquidacao) },
            { label: 'OP', valor: t.op || '-' },
            { label: 'GEROP', valor: '-' }
        ]);

        if (!salvar) {
            // Modo batch: o chamador é responsável pela paginação final, save e auditoria.
            return { ok: true, tc: t };
        }

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
        return { ok: true, tc: t };
    }

    async function gerarPDFTitulosEmBloco(ids) {
        const LIMITE = 10;
        const listaIds = Array.isArray(ids) ? ids.filter(Boolean) : [];
        if (!listaIds.length) {
            alert('Nenhum TC selecionado para impressão em bloco.');
            return;
        }
        if (listaIds.length > LIMITE) {
            alert(`Limite de ${LIMITE} TC por impressão em bloco. Você selecionou ${listaIds.length}.`);
            return;
        }
        const podeGerar = (typeof temPermissaoUI === 'function' ? temPermissaoUI('titulos_pdf') : false) ||
            (typeof permissoesEmCache !== 'undefined' && permissoesEmCache.includes('acesso_admin'));
        if (!podeGerar) {
            alert('Você não tem permissão para gerar PDF de TC.');
            return;
        }
        if (!window.jspdf || !window.jspdf.jsPDF) {
            alert('Módulo de PDF indisponível. Verifique o carregamento da biblioteca jsPDF.');
            return;
        }

        const tcsCarregados = [];
        const falhas = [];
        for (const id of listaIds) {
            const local = baseTitulos.find(x => x.id === id);
            if (local) {
                tcsCarregados.push(local);
                continue;
            }
            try {
                const docSnap = await db.collection('titulos').doc(id).get();
                if (!docSnap.exists) {
                    falhas.push(`TC ${id}: não encontrado.`);
                    continue;
                }
                tcsCarregados.push({ id: docSnap.id, ...docSnap.data() });
            } catch (err) {
                falhas.push(`TC ${id}: ${err && err.message || err}.`);
            }
        }
        if (!tcsCarregados.length) {
            alert('Nenhum TC pôde ser carregado para impressão em bloco.\n\n' + falhas.join('\n'));
            return;
        }

        tcsCarregados.sort((a, b) => String(a.idProc || '').localeCompare(String(b.idProc || ''), 'pt-BR', { numeric: true }));

        const { jsPDF } = window.jspdf;
        const docPDF = new jsPDF({ unit: 'mm', format: 'a4' });
        const tcsRenderizados = [];
        for (let i = 0; i < tcsCarregados.length; i++) {
            const tc = tcsCarregados[i];
            try {
                const r = await gerarPDFTitulo(tc.id, {
                    docPDF,
                    tcCarregado: tc,
                    iniciarComNovaPagina: i > 0,
                    salvar: false
                });
                if (r && r.ok) tcsRenderizados.push(tc);
                else falhas.push(`TC ${tc.idProc || tc.id}: falha ao renderizar (${r && r.erro || 'desconhecido'}).`);
            } catch (err) {
                falhas.push(`TC ${tc.idProc || tc.id}: ${err && err.message || err}.`);
            }
        }

        const totalPages = docPDF.getNumberOfPages();
        for (let p = 1; p <= totalPages; p++) {
            docPDF.setPage(p);
            docPDF.setFontSize(8);
            docPDF.text(`Página ${p} de ${totalPages}`, 105, 290, { align: 'center' });
        }

        const stamp = (() => {
            const d = new Date();
            return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}_${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`;
        })();
        docPDF.save(`TCs_em_bloco_${tcsRenderizados.length}_${stamp}.pdf`);

        for (const tc of tcsRenderizados) {
            try {
                await db.collection('titulos').doc(tc.id).update({
                    historicoStatus: firebase.firestore.FieldValue.arrayUnion({
                        status: 'PDF Gerado (bloco)',
                        data: firebase.firestore.Timestamp.now(),
                        usuario: usuarioLogadoEmail || ''
                    }),
                    editado_em: firebase.firestore.FieldValue.serverTimestamp()
                });
            } catch (e) {
                console.warn('Falha ao registrar auditoria de PDF em bloco para TC', tc.id, e);
            }
        }

        if (falhas.length) {
            alert(`PDF em bloco gerado com ${tcsRenderizados.length} TC. Falharam ${falhas.length}:\n\n` + falhas.join('\n'));
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

        const instrumentoImport = valorTexto(row, ['instrumento', 'INSTRUMENTO', 'contrato']);
        const obrigatorios = {
            idProc: valorTexto(row, ['idProc', 'ID_PROC', 'id_proc']),
            tipoTC: valorTexto(row, ['tipoTC', 'TIPO_TC', 'tipo_tc']),
            dataExefin: valorDataISO(valorTexto(row, ['dataExefin', 'DATA_EXEFIN', 'data_exefin'])),
            numTC: valorTexto(row, ['numTC', 'NUM_TC', 'num_tc']),
            fornecedorCnpj: fornecedorCnpj,
            fornecedorNome: valorTexto(row, ['fornecedorNome', 'FORNECEDOR_NOME', 'fornecedor_nome', 'nomeFornecedor', 'NOME_FORNECEDOR', 'nome_fornecedor']) || fornecedorNome,
            valorNotaFiscal: valorNumerico(valorTexto(row, ['valorNotaFiscal', 'VALOR_NOTA_FISCAL', 'valor_nota_fiscal'])),
            dataEmissao: valorDataISO(valorTexto(row, ['dataEmissao', 'DATA_EMISSAO', 'data_emissao'])),
            dataAteste: valorDataISO(valorTexto(row, ['dataAteste', 'DATA_ATESTE', 'data_ateste'])),
            status: valorTexto(row, ['status', 'STATUS'])
        };
        const faltando = Object.entries(obrigatorios).filter(([, v]) => v === '' || v === 0).map(([k]) => k);
        if (faltando.length > 0) {
            return { erro: 'Campos obrigatórios ausentes: ' + faltando.join(', ') };
        }
        let anoImp = valorTexto(row, ['ano', 'ANO', 'anoTC', 'anoExercicio']);
        if (!anoImp && window.sisAnoDocumento && typeof window.sisAnoDocumento.anoDeData === 'function') {
            const y = window.sisAnoDocumento.anoDeData(obrigatorios.dataEmissao) || window.sisAnoDocumento.anoDeData(obrigatorios.dataExefin);
            if (y) anoImp = String(y);
        }
        if (!anoImp) anoImp = String(new Date().getFullYear());

        const update = {
            tipoTC: obrigatorios.tipoTC,
            dataExefin: obrigatorios.dataExefin,
            numTC: obrigatorios.numTC,
            ano: anoImp,
            fornecedorCnpj: obrigatorios.fornecedorCnpj,
            fornecedorNome: obrigatorios.fornecedorNome,
            instrumento: instrumentoImport,
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
        if (window.sisAnoDocumento && typeof window.sisAnoDocumento.aplicarAnosTitulo === 'function') {
            window.sisAnoDocumento.aplicarAnosTitulo(update);
        }
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
        const n = ids.length;
        const texto = destino === 'Em Processamento'
            ? `Deseja enviar ${n} título(s) selecionado(s) para "Em Processamento"? Ao confirmar, o sistema verifica dados básicos e OI de cada um. Os que não cumprirem requisitos serão ignorados e listados ao final.`
            : `Deseja enviar ${n} título(s) selecionado(s) para "Em Liquidação"? Ao confirmar, o sistema verifica NEs e vínculos de cada um. Os que não cumprirem requisitos serão ignorados e listados ao final.`;
        const sim = await modalEncaminharStatusPromessa({ texto });
        if (!sim) return;
        mostrarLoading();
        const falhas = [];
        let okCount = 0;
        try {
            for (const id of ids) {
                const tc = baseTitulos.find(t => t.id === id);
                const idProc = tc ? String(tc.idProc || id).trim() : id;
                try {
                    const r = await encaminharTC(id, destino, true, { silent: true });
                    if (r && r.ok) okCount++;
                    else falhas.push(`${idProc}: ${(r && r.mensagem) || 'Não foi possível encaminhar.'}`);
                } catch (err) {
                    falhas.push(`${idProc}: ${err.message || err}`);
                }
            }
            titulosSelecionados.clear();
            atualizarUIselecao();
            atualizarTabelaTitulos();
            let msg = destino === 'Em Processamento'
                ? `Processamento: ${okCount} TC(s) encaminhado(s) em bloco.`
                : `Liquidação: ${okCount} TC(s) enviado(s) em bloco.`;
            if (falhas.length) {
                msg += `\n\nNão encaminhados (${falhas.length}):\n- ` + falhas.slice(0, 12).join('\n- ');
                if (falhas.length > 12) msg += `\n- ... e mais ${falhas.length - 12}.`;
            }
            alert(msg);
        } catch (err) {
            alert("Erro: " + (err.message || err));
        } finally {
            esconderLoading();
        }
    });

    document.getElementById('btnRetornarBloco')?.addEventListener('click', async function() {
        if (!usuarioPodeTramitarTC()) return alert('Acesso negado para tramitação.');
        const ids = Array.from(titulosSelecionados);
        if (!ids.length) return alert("Selecione ao menos um TC.");
        const titulosSel = ids.map(id => baseTitulos.find(t => t.id === id)).filter(Boolean);
        const todosEmLiquidacao = titulosSel.length > 0 && titulosSel.every(t => (t.status || 'Rascunho') === 'Em Liquidação');
        const todosLiquidados = titulosSel.length > 0 && titulosSel.every(t => (t.status || 'Rascunho') === 'Liquidado');
        if (!todosEmLiquidacao && !todosLiquidados) {
            return alert('Para retorno em bloco, selecione apenas TCs em Em Liquidação ou apenas em Liquidado.');
        }
        if (todosEmLiquidacao) {
            await executarRetornoStatus(ids, 'Em Liquidação', 'Em Processamento', true);
            return;
        }
        await executarRetornoStatus(ids, 'Liquidado', 'Em Liquidação', true);
    });

    document.getElementById('btnDevolverBloco')?.addEventListener('click', function() {
        if (!usuarioPodeTramitarTC()) return alert('Acesso negado para tramitação.');
        const ids = Array.from(titulosSelecionados);
        if (!ids.length) return alert("Selecione ao menos um TC.");
        const titulosSel = ids.map(id => baseTitulos.find(t => t.id === id)).filter(Boolean);
        const todosPermitidosDevolucaoFisica = titulosSel.length > 0 && titulosSel.every(t => {
            const st = t.status || 'Rascunho';
            return st === 'Rascunho' || st === 'Em Processamento' || st === 'Em Liquidação';
        });
        if (!todosPermitidosDevolucaoFisica) {
            return alert('Para devolução física em bloco, selecione apenas TCs em Rascunho, Em Processamento ou Em Liquidação.');
        }
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
        configurarToggleSemContrato();
        configurarAutocompleteEmpenho();
        configurarAutocompleteCentroCustosEUG();
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
        configurarToggleSemContrato();
        configurarAutocompleteEmpenho();
        configurarAutocompleteCentroCustosEUG();
        configurarAvisoFiltroBuscaNE();
    }
})();
