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
    let statusFiltroAtual = null;
    let titulosSelecionados = new Set();
    let empenhosDaNotaAtual = [];
    let tributacoesAtual = [];
    let salvandoApenasAbaDadosBasicos = false;
    let paginaAtual = 1;
    let itensPorPagina = 10;
    let termoBusca = '';
    let incluirInativos = false;
    let estadoOrdenacao = { coluna: 'idProc', direcao: 'asc' };

    window.baseTitulos = function() { return baseTitulos; };

    function mostrarLoading() {
        const el = document.getElementById('loadingApp');
        if (el) { el.classList.remove('hide'); el.style.display = 'flex'; }
    }
    function esconderLoading() {
        const el = document.getElementById('loadingApp');
        if (el) { el.classList.add('hide'); el.style.display = 'none'; }
    }

    function inicializarTitulosSPA() {
        mostrarLoading();
        let carregamentoFinalizado = false;
        let carregados = 0;
        const TOTAL_COLECOES = 4;
        const TIMEOUT_MS = 10000;

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

        db.collection('titulos').onSnapshot(
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
        );
        db.collection('contratos').onSnapshot(snap => {
            baseContratos = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            aoReceberSnapshot();
        }, onErr);
        db.collection('empenhos').onSnapshot(snap => {
            baseEmpenhos = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            aoReceberSnapshot();
        }, onErr);
        db.collection('oi').onSnapshot(snap => {
            listaOI = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            popularSelectOI();
            aoReceberSnapshot();
        }, onErr);

        const urlParams = new URLSearchParams(window.location.search);
        const st = urlParams.get('status');
        if (st) filtrarPorStatus(st);
        desenharFiltrosStatus();
        ligarEventos();
    }
    window.inicializarTitulosSPA = inicializarTitulosSPA;

    function popularSelectOI() { /* OI agora é autocomplete; mantido para compatibilidade */ }

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
        if (el) el.value = '';
        const d = document.getElementById('dadosOISelecionado');
        if (d) d.style.display = 'none';
    };

    function mostrarSugestoesOI() {
        const inputBuscaOIT = document.getElementById('buscaOIT');
        const listaOIT = document.getElementById('listaResultadosOIT');
        if (!inputBuscaOIT || !listaOIT) return;
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
                    inputBuscaOIT.value = '';
                    listaOIT.innerHTML = '';
                    const divDados = document.getElementById('dadosOISelecionado');
                    const spanRead = document.getElementById('readOISelecionada');
                    if (divDados && spanRead) {
                        spanRead.textContent = (o.numeroOI || '') + ' - ' + (o.nomeOI || '');
                        divDados.style.display = 'block';
                    }
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
        inputBuscaOIT.addEventListener('focus', function() { if ((this.value || '').trim().length >= 2) mostrarSugestoesOI(); });
        inputBuscaOIT.addEventListener('blur', () => { setTimeout(() => { if (listaOIT) listaOIT.innerHTML = ''; }, 200); });
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
        document.getElementById('dadosContratoSelecionado').style.display = 'none';
        document.getElementById('dadosOISelecionado').style.display = 'none';
        document.getElementById('oiEntregou').value = '';
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
        const dataExefinEl = document.getElementById('dataExefin');
        if (dataExefinEl && !dataExefinEl.value) dataExefinEl.value = new Date().toISOString().slice(0, 10);
        document.getElementById('tela-lista-titulos').style.display = 'none';
        document.getElementById('tela-formulario-titulos').style.display = 'block';
    };

    window.voltarParaListaTitulos = function() {
        document.getElementById('tela-formulario-titulos').style.display = 'none';
        document.getElementById('tela-lista-titulos').style.display = 'block';
    };

    /** Habilita ou desabilita os campos da aba Dados Básicos (exceto Observações). */
    function setCamposDadosBasicosHabilitados(habilitado) {
        const ids = ['dataExefin', 'buscaOIT', 'buscaContratoT', 'numTC', 'valorNotaFiscal', 'dataEmissao'];
        ids.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.disabled = !habilitado;
        });
        const limparOI = document.querySelector('#dadosOISelecionado button');
        if (limparOI) limparOI.disabled = !habilitado;
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
        const btnDevolver = document.getElementById('btnDevolver');
        const tcSalvo = (document.getElementById('editIndexTitulo')?.value || '') !== '-1';
        if (btnDevolver) btnDevolver.style.display = tcSalvo && status !== 'Devolvido' && idx >= 0 ? 'inline-block' : 'none';
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

    function desenharEmpenhosNota() {
        const tbody = document.getElementById('tbodyEmpenhosNota');
        if (!tbody) return;
        tbody.innerHTML = '';
        empenhosDaNotaAtual.forEach((v, i) => {
            const tr = document.createElement('tr');
            tr.innerHTML = `<td title="NE: ${escapeHTML(v.numEmpenho || '')} | PTRES: ${escapeHTML(v.ptres || '-')} | FR: ${escapeHTML(v.fr || '-')} | ND: ${escapeHTML(v.nd || '-')}">${escapeHTML(typeof formatarNumEmpenhoVisivel === 'function' ? formatarNumEmpenhoVisivel(v.numEmpenho) : (v.numEmpenho || '-'))}</td>
                <td>R$ ${escapeHTML(typeof formatarMoedaBR === 'function' ? formatarMoedaBR(v.valorVinculado || 0) : (v.valorVinculado || '0'))}</td>
                <td><input type="text" data-index="${i}" data-field="lf" value="${escapeHTML(v.lf || '')}" placeholder="LF"></td>
                <td><input type="text" data-index="${i}" data-field="pf" value="${escapeHTML(v.pf || '')}" placeholder="PF"></td>
                <td><button type="button" class="btn-icon btn-rm-ne" data-index="${i}">🗑️</button></td>`;
            tbody.appendChild(tr);
        });
        tbody.querySelectorAll('input[data-field]').forEach(inp => inp.addEventListener('change', function() {
            const i = parseInt(this.getAttribute('data-index'));
            const f = this.getAttribute('data-field');
            if (empenhosDaNotaAtual[i]) empenhosDaNotaAtual[i][f] = this.value;
        }));
        tbody.querySelectorAll('.btn-rm-ne').forEach(btn => btn.addEventListener('click', function() {
            empenhosDaNotaAtual.splice(parseInt(this.getAttribute('data-index')), 1);
            desenharEmpenhosNota();
        }));
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

    function mostrarSugestoesContrato() {
        const inputBuscaContratoT = document.getElementById('buscaContratoT');
        const listaContratosT = document.getElementById('listaResultadosContratoT');
        if (!inputBuscaContratoT || !listaContratosT) return;
        const texto = (inputBuscaContratoT.value || '').trim().toLowerCase();
        const textoSemAcento = removerAcentos(texto);
        const textoApenasNumeros = texto.replace(/\D/g, '');
        listaContratosT.innerHTML = '';
        listaContratosT.style.display = '';
        if (texto.length < 4) return;
        const resultados = baseContratos.filter(c => {
            const campos = camposContratoParaBusca(c);
            const matchCampos = campos.some(campo => removerAcentos(campo).toLowerCase().includes(textoSemAcento));
            const forn = campos[3];
            const cnpjApenasNumeros = forn.replace(/\D/g, '');
            const matchCNPJ = textoApenasNumeros.length >= 4 && cnpjApenasNumeros.includes(textoApenasNumeros);
            return matchCampos || matchCNPJ;
        });
        if (resultados.length === 0) {
            listaContratosT.innerHTML = '<li style="padding:10px; color:#777; font-size:12px;">' + (baseContratos.length === 0 ? 'Nenhum contrato cadastrado. Cadastre em Sistema > Contratos.' : 'Nenhum contrato/empresa encontrado.') + '</li>';
        } else {
            resultados.forEach(c => {
                const li = document.createElement('li');
                const nomeForn = c.fornecedor || 'Fornecedor não informado';
                li.innerHTML = '<strong>Inst:</strong> ' + escapeHTML(c.numContrato || '-') + ' | <strong>Empresa:</strong> ' + escapeHTML(nomeForn);
                li.addEventListener('mousedown', (e) => {
                    e.preventDefault();
                    const painel = document.getElementById('dadosContratoSelecionado');
                    const readF = document.getElementById('readFornecedor');
                    const readI = document.getElementById('readInstrumento');
                    const rcSelect = document.getElementById('rcSelecionada');
                    const rcTexto = document.getElementById('rcSelecionadaTexto');
                    const vigInput = document.getElementById('vigenciaContrato');
                    const avisoVig = document.getElementById('avisoVigenciaContrato');

                    if (painel) painel.style.display = 'block';
                    if (readF) readF.value = c.fornecedor || '';
                    if (readI) readI.value = c.numContrato || '';

                    // RCs do contrato (se houver)
                    const rcs = Array.isArray(c.rcs) ? c.rcs : [];
                    if (rcSelect && rcTexto) {
                        rcSelect.innerHTML = '';
                        if (rcs.length > 1) {
                            rcSelect.style.display = '';
                            rcTexto.style.display = 'none';
                            rcs.forEach(rc => {
                                const opt = document.createElement('option');
                                opt.value = rc;
                                opt.textContent = rc;
                                rcSelect.appendChild(opt);
                            });
                        } else if (rcs.length === 1) {
                            rcSelect.style.display = 'none';
                            rcTexto.style.display = '';
                            rcTexto.value = rcs[0];
                        } else {
                            rcSelect.style.display = 'none';
                            rcTexto.style.display = 'none';
                            rcTexto.value = '';
                        }
                    }

                    // Vigência informativa
                    if (vigInput && avisoVig) {
                        const ini = c.dataInicio || '';
                        const fim = c.dataFim || '';
                        if (ini || fim) {
                            const fmt = (d) => {
                                if (!d) return '';
                                // assume formato YYYY-MM-DD
                                const [y, m, dia] = String(d).split('-');
                                return dia && m && y ? `${dia}/${m}/${y}` : d;
                            };
                            vigInput.value = `${fmt(ini)} ${ini && fim ? 'até' : ''} ${fmt(fim)}`.trim();

                            const dataEmissao = (document.getElementById('dataEmissao').value || document.getElementById('dataExefin').value || '').trim();
                            if (dataEmissao && ini && fim) {
                                const base = new Date(dataEmissao);
                                const dIni = new Date(ini);
                                const dFim = new Date(fim);
                                if (base < dIni || base > dFim) {
                                    avisoVig.style.display = 'block';
                                    avisoVig.textContent = 'Atenção: este TC está fora da vigência do contrato.';
                                } else {
                                    avisoVig.style.display = 'none';
                                    avisoVig.textContent = '';
                                }
                            } else {
                                avisoVig.style.display = 'none';
                                avisoVig.textContent = '';
                            }
                        } else {
                            vigInput.value = '';
                            avisoVig.style.display = 'none';
                            avisoVig.textContent = '';
                        }
                    }

                    listaContratosT.innerHTML = '';
                    inputBuscaContratoT.value = '';
                });
                listaContratosT.appendChild(li);
            });
        }
    }
    function configurarAutocompleteContrato() {
        const inputBuscaContratoT = document.getElementById('buscaContratoT');
        const listaContratosT = document.getElementById('listaResultadosContratoT');
        if (!inputBuscaContratoT || !listaContratosT || inputBuscaContratoT.dataset.autocompleteBound === '1') return;
        inputBuscaContratoT.dataset.autocompleteBound = '1';
        inputBuscaContratoT.addEventListener('input', debounce(mostrarSugestoesContrato, 300));
        inputBuscaContratoT.addEventListener('focus', function() { if ((this.value || '').trim().length >= 4) mostrarSugestoesContrato(); });
        inputBuscaContratoT.addEventListener('blur', () => { setTimeout(() => { if (listaContratosT) listaContratosT.innerHTML = ''; }, 200); });
    }

    function mostrarSugestoesEmpenho() {
        const inputBuscaEmpenhoT = document.getElementById('buscaEmpenhoT');
        const listaEmpenhosT = document.getElementById('listaResultadosEmpenhoT');
        if (!inputBuscaEmpenhoT || !listaEmpenhosT) return;
        const texto = (inputBuscaEmpenhoT.value || '').trim();
        const textoSemAcento = removerAcentos(texto).toLowerCase();
        listaEmpenhosT.innerHTML = '';
        listaEmpenhosT.style.display = '';
        let resultados;
        if (texto.length < 2) {
            resultados = baseEmpenhos.slice(0, 15);
            if (resultados.length === 0) {
                listaEmpenhosT.innerHTML = '<li style="padding:10px; color:#777; font-size:12px;">Nenhuma NE cadastrada. Cadastre em Sistema > Empenhos.</li>';
                return;
            }
        } else {
            resultados = baseEmpenhos.filter(e => {
                const campos = camposEmpenhoParaBusca(e);
                return campos.some(campo => removerAcentos(campo).toLowerCase().includes(textoSemAcento));
            }).slice(0, 15);
        }
        if (resultados.length === 0) {
            listaEmpenhosT.innerHTML = '<li style="padding:10px; color:#777; font-size:12px;">Nenhuma NE encontrada. Digite num NE, PTRES, FR ou ND.</li>';
        } else {
            resultados.forEach(e => {
                const li = document.createElement('li');
                const numNE = e.numEmpenho || e.numNE || '-';
                li.innerHTML = '<strong>' + (typeof formatarNumEmpenhoVisivel === 'function' ? formatarNumEmpenhoVisivel(numNE) : escapeHTML(numNE)) + '</strong> | ' + escapeHTML(e.tipoNE || '-') + ' | ' + escapeHTML((e.favorecido || '').substring(0, 30)) + ((e.favorecido || '').length > 30 ? '...' : '') + ' | PTRES: ' + escapeHTML(e.ptres || '-') + ' | FR: ' + escapeHTML(e.fr || '-');
                li.addEventListener('mousedown', (ev) => {
                    ev.preventDefault();
                    empenhoTemporarioSelecionado = e;
                    document.getElementById('detalhesVinculoEmpenho').style.display = 'block';
                    document.getElementById('empenhoSelecionadoTexto').textContent = 'NE: ' + (typeof formatarNumEmpenhoVisivel === 'function' ? formatarNumEmpenhoVisivel(numNE) : numNE);
                    listaEmpenhosT.innerHTML = '';
                    inputBuscaEmpenhoT.value = '';
                });
                listaEmpenhosT.appendChild(li);
            });
        }
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
        const valorInput = document.getElementById('vinculoValor')?.value;
        if (!valorInput || !empenhoTemporarioSelecionado) return alert("Defina o valor a vincular!");
        const valorNum = typeof valorMoedaParaNumero === 'function' ? valorMoedaParaNumero(valorInput) : (parseFloat(valorInput) || 0);
        if (valorNum <= 0) return alert("Informe um valor válido!");
        empenhosDaNotaAtual.push({
            numEmpenho: empenhoTemporarioSelecionado.numEmpenho || empenhoTemporarioSelecionado.numNE,
            ptres: empenhoTemporarioSelecionado.ptres || '',
            fr: empenhoTemporarioSelecionado.fr || '',
            nd: empenhoTemporarioSelecionado.nd || '',
            valorVinculado: valorNum,
            lf: document.getElementById('vinculoLF')?.value || '',
            pf: document.getElementById('vinculoPF')?.value || ''
        });
        desenharEmpenhosNota();
        document.getElementById('detalhesVinculoEmpenho').style.display = 'none';
    };

    function editarTitulo(id) {
        const t = baseTitulos.find(x => x.id === id);
        if (!t) return;
        abrirFormularioTitulo();
        document.getElementById('editIndexTitulo').value = t.id;
        document.getElementById('idProc').value = t.idProc || '';
        const tituloEl = document.getElementById('tituloFormTC');
        if (tituloEl && t.idProc) tituloEl.textContent = t.idProc + ' - Entrada de Título de Crédito';
        document.getElementById('dataExefin').value = t.dataExefin || '';
        document.getElementById('numTC').value = t.numTC || '';
        const valNF = parseFloat(t.valorNotaFiscal) || 0;
        document.getElementById('valorNotaFiscal').value = typeof formatarMoedaBR === 'function' ? ('R$ ' + formatarMoedaBR(valNF)) : (t.valorNotaFiscal || '');
        document.getElementById('dataEmissao').value = t.dataEmissao || '';
        document.getElementById('dataAteste').value = t.dataAteste || '';
        document.getElementById('readFornecedor').value = t.fornecedor || '';
        document.getElementById('readInstrumento').value = t.instrumento || '';
        // RC e vigência ao reabrir TC
        const painelContrato = document.getElementById('dadosContratoSelecionado');
        const rcSelect = document.getElementById('rcSelecionada');
        const rcTexto = document.getElementById('rcSelecionadaTexto');
        const vigInput = document.getElementById('vigenciaContrato');
        const avisoVig = document.getElementById('avisoVigenciaContrato');
        if (painelContrato && t.fornecedor) painelContrato.style.display = 'block';
        const contratoLigado = baseContratos.find(c => (c.numContrato || '') === (t.instrumento || '')) || null;
        if (rcSelect && rcTexto) {
            const rcs = contratoLigado && Array.isArray(contratoLigado.rcs) ? contratoLigado.rcs : [];
            rcSelect.innerHTML = '';
            const rcAtual = t.rc || '';
            if (rcs.length > 1) {
                rcSelect.style.display = '';
                rcTexto.style.display = 'none';
                rcs.forEach(rc => {
                    const opt = document.createElement('option');
                    opt.value = rc;
                    opt.textContent = rc;
                    if (rc === rcAtual) opt.selected = true;
                    rcSelect.appendChild(opt);
                });
            } else if (rcs.length === 1 || rcAtual) {
                rcSelect.style.display = 'none';
                rcTexto.style.display = '';
                rcTexto.value = rcAtual || rcs[0];
            } else {
                rcSelect.style.display = 'none';
                rcTexto.style.display = 'none';
                rcTexto.value = '';
            }
        }
        if (vigInput && avisoVig) {
            if (contratoLigado && (contratoLigado.dataInicio || contratoLigado.dataFim)) {
                const fmt = (d) => {
                    if (!d) return '';
                    const [y, m, dia] = String(d).split('-');
                    return dia && m && y ? `${dia}/${m}/${y}` : d;
                };
                const ini = contratoLigado.dataInicio || '';
                const fim = contratoLigado.dataFim || '';
                vigInput.value = `${fmt(ini)} ${ini && fim ? 'até' : ''} ${fmt(fim)}`.trim();
                const dataEmissao = (t.dataEmissao || t.dataExefin || '').trim();
                if (dataEmissao && ini && fim) {
                    const base = new Date(dataEmissao);
                    const dIni = new Date(ini);
                    const dFim = new Date(fim);
                    if (base < dIni || base > dFim) {
                        avisoVig.style.display = 'block';
                        avisoVig.textContent = 'Atenção: este TC está fora da vigência do contrato.';
                    } else {
                        avisoVig.style.display = 'none';
                        avisoVig.textContent = '';
                    }
                } else {
                    avisoVig.style.display = 'none';
                    avisoVig.textContent = '';
                }
            } else {
                vigInput.value = '';
                avisoVig.style.display = 'none';
                avisoVig.textContent = '';
            }
        }
        const obsEl = document.getElementById('observacoesTC');
        if (obsEl) obsEl.value = t.observacoes || '';
        document.getElementById('oiEntregou').value = t.oiEntregou || '';
        if (t.oiEntregou) {
            const o = listaOI.find(x => x.id === t.oiEntregou);
            if (o) {
                document.getElementById('readOISelecionada').textContent = (o.numeroOI || '') + ' - ' + (o.nomeOI || '');
                document.getElementById('dadosOISelecionado').style.display = 'block';
            }
        }
        document.getElementById('np').value = t.np || '';
        document.getElementById('dataLiquidacao').value = t.dataLiquidacao || '';
        document.getElementById('op').value = t.op || '';
        if (t.fornecedor) document.getElementById('dadosContratoSelecionado').style.display = 'block';
        empenhosDaNotaAtual = (t.empenhosVinculados || []).map(x => ({ ...x }));
        tributacoesAtual = (t.tributacoes || []).map(x => ({ ...x }));
        const status = t.status || 'Rascunho';
        mostrarStepper(status);
        bloquearTabsPorStatus(status);
        desenharEmpenhosNota();
        desenharTributacoes();
        desenharAuditoria(t.historicoStatus || []);
        const tbodyLFPF = document.getElementById('tbodyLFPF');
        if (tbodyLFPF) {
            tbodyLFPF.innerHTML = '';
            (empenhosDaNotaAtual || []).forEach((v, i) => {
                const tr = document.createElement('tr');
                tr.innerHTML = `<td>${typeof formatarNumEmpenhoVisivel === 'function' ? formatarNumEmpenhoVisivel(v.numEmpenho) : v.numEmpenho}</td>
                    <td>R$ ${typeof formatarMoedaBR === 'function' ? formatarMoedaBR(v.valorVinculado || 0) : (v.valorVinculado || '0')}</td>
                    <td><input type="text" data-index="${i}" data-field="lf" value="${escapeHTML(v.lf || '')}"></td>
                    <td><input type="text" data-index="${i}" data-field="pf" value="${escapeHTML(v.pf || '')}"></td>`;
                tbodyLFPF.appendChild(tr);
            });
            tbodyLFPF.querySelectorAll('input[data-field]').forEach(inp => inp.addEventListener('change', function() {
                const i = parseInt(this.getAttribute('data-index'));
                const f = this.getAttribute('data-field');
                if (empenhosDaNotaAtual[i]) empenhosDaNotaAtual[i][f] = this.value;
            }));
        }
        atualizarBotoesAbaDadosBasicos(false);
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
        const fornecedor = (document.getElementById('readFornecedor').value || '').trim();
        const instrumento = (document.getElementById('readInstrumento').value || '').trim();
        const oiEntregou = (document.getElementById('oiEntregou').value || '').trim();
        const valorVal = typeof valorMoedaParaNumero === 'function'
            ? valorMoedaParaNumero(document.getElementById('valorNotaFiscal').value)
            : (parseFloat(document.getElementById('valorNotaFiscal').value) || 0);

        if (!dataExefin) return alert("Preencha a Data da EXEFIN.");
        if (!numTC) return alert("Preencha o Número do TC.");
        if (!fornecedor || !instrumento) return alert("Selecione um Contrato/Empresa.");
        if (!oiEntregou) return alert("Selecione a OI de Origem.");
        if (!valorVal || valorVal <= 0) return alert("Preencha o Valor do TC (maior que zero).");

        const dados = {
            idProc: escapeHTML(document.getElementById('idProc').value || gerarNovoIDProc()),
            dataExefin: escapeHTML(dataExefin),
            numTC: escapeHTML(numTC),
            notaFiscal: escapeHTML(document.getElementById('notaFiscal').value),
            fornecedor: escapeHTML(fornecedor),
            instrumento: escapeHTML(instrumento),
            rc: escapeHTML((document.getElementById('rcSelecionada')?.value || document.getElementById('rcSelecionadaTexto')?.value || '')),
            valorNotaFiscal: valorVal,
            dataEmissao: escapeHTML(document.getElementById('dataEmissao').value),
            dataAteste: escapeHTML(document.getElementById('dataAteste').value),
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
            esconderLoading();

            if (salvandoApenasAbaDadosBasicos) {
                salvandoApenasAbaDadosBasicos = false;
                atualizarBotoesAbaDadosBasicos(false);
                alert("Dados da aba salvos com sucesso.");
                return;
            }

            if (eraNovo && novoStatus === 'Rascunho') {
                document.getElementById('editIndexTitulo').value = docId;
                const idProcMostrar = dados.idProc || docId;
                const enviar = confirm(
                    "TC salvo como rascunho. Número: " + idProcMostrar + "\n\n" +
                    "Deseja ENVIAR para Processamento? (Cancelar = continuar editando)"
                );
                if (enviar) {
                    if (empenhosDaNotaAtual.length === 0) {
                        alert("Para enviar ao processamento, vincule ao menos um empenho na aba Processamento e salve novamente.");
                        bloquearTabsPorStatus('Rascunho');
                        return;
                    }
                    mostrarLoading();
                    try {
                        const doc = await db.collection('titulos').doc(docId).get();
                        const hist = (doc.data()?.historicoStatus || []);
                        hist.push({ status: 'Em Processamento', data: firebase.firestore.Timestamp.now(), usuario: usuarioLogadoEmail || '' });
                        await db.collection('titulos').doc(docId).update({
                            status: 'Em Processamento',
                            empenhosVinculados: empenhosDaNotaAtual,
                            historicoStatus: hist,
                            editado_em: firebase.firestore.FieldValue.serverTimestamp()
                        });
                        alert("TC enviado para Processamento.");
                        voltarParaListaTitulos();
                    } catch (err) {
                        alert("Erro ao enviar: " + (err.message || err));
                    } finally {
                        esconderLoading();
                    }
                }
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

    document.getElementById('btnDevolver')?.addEventListener('click', async function() {
        const fbID = document.getElementById('editIndexTitulo').value;
        if (fbID === '-1') return alert("Salve o TC primeiro.");
        const motivo = prompt("Motivo da devolução:");
        if (motivo === null) return;
        const dataDev = new Date().toISOString().slice(0, 10);
        const manterDados = confirm("Manter os dados do status atual? (Cancelar = apagar em cascata)");
        mostrarLoading();
        try {
            const hist = (baseTitulos.find(x => x.id === fbID)?.historicoStatus || []);
            hist.push({
                status: 'Devolvido',
                statusAnterior: baseTitulos.find(x => x.id === fbID)?.status,
                data: firebase.firestore.Timestamp.now(),
                usuario: usuarioLogadoEmail || '',
                motivoDevolucao: motivo,
                dataDevolucao: dataDev
            });
            const update = {
                status: 'Devolvido',
                motivoDevolucao: motivo,
                dataDevolucao: dataDev,
                historicoStatus: hist
            };
            if (!manterDados) {
                update.np = null;
                update.dataLiquidacao = null;
                update.empenhosVinculados = (empenhosDaNotaAtual || []).map(v => ({ ...v, lf: '', pf: '' }));
            }
            update.editado_em = firebase.firestore.FieldValue.serverTimestamp();
            await db.collection('titulos').doc(fbID).update(update);
            alert("TC devolvido.");
            voltarParaListaTitulos();
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

        // Bloco Auditoria
        addTituloSecao('Trilha de Auditoria');
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
    document.getElementById('btnCancelarTitulo')?.addEventListener('click', function() {
        if (confirm('Deseja sair? As alterações não salvas serão perdidas.')) {
            voltarParaListaTitulos();
        }
    });

    function ligarEventos() {
        configurarAutocompleteOI();
        configurarAutocompleteContrato();
        configurarAutocompleteEmpenho();
    }

    window.atualizarTabelaTitulos = atualizarTabelaTitulos;
    window.listaOIDebug = function() { return listaOI; };
    window.baseContratosDebug = function() { return baseContratos; };

    if (document.getElementById('buscaOIT') && typeof debounce === 'function') {
        configurarAutocompleteOI();
        configurarAutocompleteContrato();
        configurarAutocompleteEmpenho();
    }
})();
