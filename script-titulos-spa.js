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
    let paginaAtual = 1;
    let itensPorPagina = 10;
    let termoBusca = '';
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
        db.collection('titulos').onSnapshot(snap => {
            baseTitulos = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            atualizarTabelaTitulos();
            esconderLoading();
        });
        db.collection('contratos').onSnapshot(snap => {
            baseContratos = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        });
        db.collection('empenhos').onSnapshot(snap => {
            baseEmpenhos = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        });
        db.collection('oi').onSnapshot(snap => {
            listaOI = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            popularSelectOI();
        });
        const urlParams = new URLSearchParams(window.location.search);
        const st = urlParams.get('status');
        if (st) filtrarPorStatus(st);
        ligarEventos();
    }
    window.inicializarTitulosSPA = inicializarTitulosSPA;

    function popularSelectOI() {
        const sel = document.getElementById('oiEntregou');
        if (!sel) return;
        const oisAtivas = listaOI.filter(o => o.situacao === 'Ativo');
        sel.innerHTML = '<option value="">-- Nenhum --</option>';
        oisAtivas.forEach(o => {
            const opt = document.createElement('option');
            opt.value = o.id;
            opt.textContent = (o.numeroOI || '') + ' - ' + (o.nomeOI || '');
            sel.appendChild(opt);
        });
    }

    window.filtrarPorStatus = function(status) {
        statusFiltroAtual = status || null;
        const subtitulo = document.getElementById('subtituloStatus');
        if (subtitulo) subtitulo.textContent = status ? `(${status})` : '(Todos)';
        document.querySelectorAll('.menu-btn-tc').forEach(btn => {
            const match = status && (btn.textContent.trim() === status || btn.textContent.includes(status));
            btn.classList.toggle('ativo', !!match);
        });
        titulosSelecionados.clear();
        if (status && history.replaceState) history.replaceState({}, '', 'titulos.html?status=' + encodeURIComponent(status));
        atualizarTabelaTitulos();
    };

    function titulosFiltrados() {
        let lista = baseTitulos.map(t => ({ ...t, status: t.status || 'Rascunho' }));
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
                const acoes = gerarBotoesAcao(t.id, 'titulo');
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
        if (info) info.textContent = `Página ${paginaAtual} de ${total}`;
        const btnAnt = document.getElementById('btnAnterior');
        const btnProx = document.getElementById('btnProximo');
        if (btnAnt) btnAnt.disabled = paginaAtual <= 1;
        if (btnProx) btnProx.disabled = paginaAtual >= total;

        tbody.querySelectorAll('.btn-editar-titulo').forEach(btn => btn.addEventListener('click', () => editarTitulo(btn.getAttribute('data-id'))));
        tbody.querySelectorAll('.btn-apagar-titulo').forEach(btn => btn.addEventListener('click', () => apagarTitulo(btn.getAttribute('data-id'))));
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
        empenhosDaNotaAtual = [];
        tributacoesAtual = [];
        desenharEmpenhosNota();
        desenharTributacoes();
        mostrarStepper('Rascunho');
        ativarTab(0);
        bloquearTabsPorStatus('Rascunho');
        document.getElementById('tela-lista-titulos').style.display = 'none';
        document.getElementById('tela-formulario-titulos').style.display = 'block';
    };

    window.voltarParaListaTitulos = function() {
        document.getElementById('tela-formulario-titulos').style.display = 'none';
        document.getElementById('tela-lista-titulos').style.display = 'block';
    };

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
        if (btnDevolver) btnDevolver.style.display = status !== 'Devolvido' && idx >= 0 ? 'inline-block' : 'none';
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
            tr.innerHTML = `<td title="${escapeHTML(v.numEmpenho || '')}">${escapeHTML(typeof formatarNumEmpenhoVisivel === 'function' ? formatarNumEmpenhoVisivel(v.numEmpenho) : (v.numEmpenho || '-'))}</td>
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
    const inputBuscaContratoT = document.getElementById('buscaContratoT');
    const listaContratosT = document.getElementById('listaResultadosContratoT');
    if (inputBuscaContratoT && listaContratosT) {
        inputBuscaContratoT.addEventListener('input', debounce(function() {
            const texto = (this.value || '').toLowerCase();
            listaContratosT.innerHTML = '';
            if (texto.length >= 2) {
                baseContratos.filter(c => (c.fornecedor && c.fornecedor.toLowerCase().includes(texto)) || (c.numContrato && c.numContrato.toLowerCase().includes(texto)))
                    .forEach(c => {
                        const li = document.createElement('li');
                        li.innerHTML = '<strong>' + escapeHTML(c.numContrato) + '</strong> - ' + escapeHTML(c.fornecedor);
                        li.onclick = () => {
                            document.getElementById('dadosContratoSelecionado').style.display = 'block';
                            document.getElementById('readFornecedor').value = c.fornecedor || '';
                            document.getElementById('readInstrumento').value = c.numContrato || '';
                            listaContratosT.innerHTML = '';
                            inputBuscaContratoT.value = '';
                        };
                        listaContratosT.appendChild(li);
                    });
            }
        }));
    }

    const inputBuscaEmpenhoT = document.getElementById('buscaEmpenhoT');
    const listaEmpenhosT = document.getElementById('listaResultadosEmpenhoT');
    if (inputBuscaEmpenhoT && listaEmpenhosT) {
        inputBuscaEmpenhoT.addEventListener('input', debounce(function() {
            const texto = (this.value || '').toUpperCase();
            listaEmpenhosT.innerHTML = '';
            if (texto.length >= 4) {
                baseEmpenhos.filter(e => (e.numEmpenho || '').includes(texto)).forEach(e => {
                    const li = document.createElement('li');
                    li.innerHTML = '<strong>' + (typeof formatarNumEmpenhoVisivel === 'function' ? formatarNumEmpenhoVisivel(e.numEmpenho) : e.numEmpenho) + '</strong> (FR: ' + escapeHTML(e.fr || '') + ')';
                    li.onclick = () => {
                        empenhoTemporarioSelecionado = e;
                        document.getElementById('detalhesVinculoEmpenho').style.display = 'block';
                        document.getElementById('empenhoSelecionadoTexto').textContent = 'NE: ' + (typeof formatarNumEmpenhoVisivel === 'function' ? formatarNumEmpenhoVisivel(e.numEmpenho) : e.numEmpenho);
                        listaEmpenhosT.innerHTML = '';
                        inputBuscaEmpenhoT.value = '';
                    };
                    listaEmpenhosT.appendChild(li);
                });
            }
        }));
    }

    window.adicionarEmpenhoNaNota = function() {
        const valorInput = document.getElementById('vinculoValor')?.value;
        if (!valorInput || !empenhoTemporarioSelecionado) return alert("Defina o valor a vincular!");
        const valorNum = typeof valorMoedaParaNumero === 'function' ? valorMoedaParaNumero(valorInput) : (parseFloat(valorInput) || 0);
        if (valorNum <= 0) return alert("Informe um valor válido!");
        empenhosDaNotaAtual.push({
            numEmpenho: empenhoTemporarioSelecionado.numEmpenho,
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
        document.getElementById('dataExefin').value = t.dataExefin || '';
        document.getElementById('numTC').value = t.numTC || '';
        document.getElementById('notaFiscal').value = t.notaFiscal || '';
        const valNF = parseFloat(t.valorNotaFiscal) || 0;
        document.getElementById('valorNotaFiscal').value = typeof formatarMoedaBR === 'function' ? ('R$ ' + formatarMoedaBR(valNF)) : (t.valorNotaFiscal || '');
        document.getElementById('dataEmissao').value = t.dataEmissao || '';
        document.getElementById('dataAteste').value = t.dataAteste || '';
        document.getElementById('readFornecedor').value = t.fornecedor || '';
        document.getElementById('readInstrumento').value = t.instrumento || '';
        document.getElementById('oiEntregou').value = t.oiEntregou || '';
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
                data: firebase.firestore.FieldValue.serverTimestamp(),
                usuario: usuarioLogadoEmail || '',
                motivoDevolucao: motivo || null
            });
            return db.collection('titulos').doc(tituloId).update({ historicoStatus: hist });
        });
    }

    document.getElementById('formTitulo')?.addEventListener('submit', async function(e) {
        e.preventDefault();
        if (empenhosDaNotaAtual.length === 0) return alert("Vincule ao menos um empenho!");
        const fbID = document.getElementById('editIndexTitulo').value;
        const statusAtual = fbID !== '-1' ? (baseTitulos.find(x => x.id === fbID)?.status || 'Rascunho') : 'Rascunho';

        const dados = {
            idProc: escapeHTML(document.getElementById('idProc').value || gerarNovoIDProc()),
            dataExefin: escapeHTML(document.getElementById('dataExefin').value),
            numTC: escapeHTML(document.getElementById('numTC').value),
            notaFiscal: escapeHTML(document.getElementById('notaFiscal').value),
            fornecedor: escapeHTML(document.getElementById('readFornecedor').value),
            instrumento: escapeHTML(document.getElementById('readInstrumento').value),
            valorNotaFiscal: typeof valorMoedaParaNumero === 'function' ? valorMoedaParaNumero(document.getElementById('valorNotaFiscal').value) : (parseFloat(document.getElementById('valorNotaFiscal').value) || 0),
            dataEmissao: escapeHTML(document.getElementById('dataEmissao').value),
            dataAteste: escapeHTML(document.getElementById('dataAteste').value),
            oiEntregou: document.getElementById('oiEntregou').value || null,
            empenhosVinculados: empenhosDaNotaAtual,
            tributacoes: tributacoesAtual,
            np: escapeHTML(document.getElementById('np').value),
            dataLiquidacao: escapeHTML(document.getElementById('dataLiquidacao').value),
            op: escapeHTML(document.getElementById('op').value),
            criado_por: usuarioLogadoEmail
        };

        let novoStatus = statusAtual;
        const npPreenchida = !!dados.np?.trim();

        if (statusAtual === 'Rascunho') {
            if (confirm("Deseja enviar para o processamento deste TC?")) {
                novoStatus = 'Em Processamento';
                dados.status = novoStatus;
            } else {
                dados.status = 'Rascunho';
            }
        } else if (statusAtual === 'Em Processamento') {
            if (confirm("Deseja enviar para Liquidação?")) {
                novoStatus = 'Em Liquidação';
                dados.status = novoStatus;
            } else {
                dados.status = 'Em Processamento';
            }
        } else if (statusAtual === 'Em Liquidação' && npPreenchida) {
            novoStatus = 'Liquidado';
            dados.status = novoStatus;
        } else if (statusAtual === 'Liquidado' || statusAtual === 'Aguardando Financeiro') {
            const todosLF = empenhosDaNotaAtual.every(v => !!(v.lf || '').trim());
            const todosPF = empenhosDaNotaAtual.every(v => !!(v.pf || '').trim());
            if (todosLF && todosPF) novoStatus = 'Para Pagamento';
            else if (todosLF) novoStatus = 'Aguardando Financeiro';
            dados.status = novoStatus;
        }

        dados.status = novoStatus;

        mostrarLoading();
        try {
            const histEntry = { status: novoStatus, data: firebase.firestore.FieldValue.serverTimestamp(), usuario: usuarioLogadoEmail || '' };
            if (fbID === '-1' || !fbID) {
                dados.status = dados.status || 'Rascunho';
                dados.historicoStatus = [histEntry];
                dados.criado_em = firebase.firestore.FieldValue.serverTimestamp();
                await db.collection('titulos').add(dados);
            } else {
                const doc = await db.collection('titulos').doc(fbID).get();
                const hist = (doc.data()?.historicoStatus || []);
                hist.push(histEntry);
                dados.historicoStatus = hist;
                dados.editado_em = firebase.firestore.FieldValue.serverTimestamp();
                await db.collection('titulos').doc(fbID).update(dados);
            }
            alert("TC salvo com sucesso.");
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
                data: firebase.firestore.FieldValue.serverTimestamp(),
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
                        historicoStatus: firebase.firestore.FieldValue.arrayUnion({ status: 'Liquidado', data: firebase.firestore.FieldValue.serverTimestamp(), usuario: usuarioLogadoEmail || '' }),
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

    function ligarEventos() {}

    window.atualizarTabelaTitulos = atualizarTabelaTitulos;
})();
