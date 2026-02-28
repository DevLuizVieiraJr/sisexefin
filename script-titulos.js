// ==========================================
// MÓDULO: ENTRADA DE TÍTULOS (FORM-3)
// ==========================================
(function() {
    if (!document.getElementById('tbody-titulos')) return;

    document.getElementById('buscaTabelaTitulos').addEventListener('input', debounce(() => {
        termoBuscaTitulos = document.getElementById('buscaTabelaTitulos').value.toLowerCase();
        paginaAtualTitulos = 1;
        atualizarTabelaTitulos();
    }));

    function abrirFormularioTitulo() {
        document.getElementById('formTitulo').reset();
        document.getElementById('editIndexTitulo').value = -1;
        document.getElementById('idProc').value = "";
        const dadosContrato = document.getElementById('dadosContratoSelecionado');
        if (dadosContrato) dadosContrato.style.display = 'none';
        empenhosDaNotaAtual = [];
        desenharMiniTabelaEmpenhos();
        document.getElementById('tela-lista-titulos').style.display = 'none';
        document.getElementById('tela-formulario-titulos').style.display = 'block';
    }

    function voltarParaListaTitulos() {
        document.getElementById('tela-formulario-titulos').style.display = 'none';
        document.getElementById('tela-lista-titulos').style.display = 'block';
    }

    function atualizarTabelaTitulos() {
        const tbody = document.getElementById('tbody-titulos');
        tbody.innerHTML = '';
        let baseFiltrada = baseTitulos.map((t, index) => ({ ...t, indexOriginal: index }));

        if (termoBuscaTitulos.trim() !== "") {
            baseFiltrada = baseFiltrada.filter(t =>
                (t.idProc && t.idProc.toLowerCase().includes(termoBuscaTitulos)) ||
                (t.fornecedor && t.fornecedor.toLowerCase().includes(termoBuscaTitulos)) ||
                (t.numTC && t.numTC.toLowerCase().includes(termoBuscaTitulos))
            );
        }
        baseFiltrada = aplicarOrdenacao(baseFiltrada, 'titulos');

        const inicio = (paginaAtualTitulos - 1) * itensPorPaginaTitulos;
        const fim = inicio + parseInt(itensPorPaginaTitulos);
        let itensExibidos = baseFiltrada.slice(inicio, fim);

        if (itensExibidos.length === 0) { tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Nenhum título encontrado.</td></tr>'; return; }

        itensExibidos.forEach(t => {
            const tr = document.createElement('tr');
            const acoesHTML = gerarBotoesAcao(t.id, 'titulo');
            tr.innerHTML = '<td><strong>' + escapeHTML(t.idProc) + '</strong></td><td>' + (escapeHTML(t.numTC) || '-') + '</td><td>' + (escapeHTML(t.fornecedor) || '-') + '</td><td>R$ ' + (escapeHTML(t.valorNotaFiscal) || '0.00') + '</td><td>' + acoesHTML + '</td>';
            tbody.appendChild(tr);
        });
    }

    document.getElementById('tbody-titulos').addEventListener('click', function(e) {
        const btnEditar = e.target.closest('.btn-editar-titulo');
        const btnApagar = e.target.closest('.btn-apagar-titulo');
        if (btnEditar) editarTitulo(btnEditar.getAttribute('data-id'));
        if (btnApagar) apagarTitulo(btnApagar.getAttribute('data-id'));
    });

    window.mudarTamanhoPagina = function() { itensPorPaginaTitulos = document.getElementById('itensPorPagina').value; paginaAtualTitulos = 1; atualizarTabelaTitulos(); };

    const inputBuscaContratoT = document.getElementById('buscaContratoT');
    const listaContratosT = document.getElementById('listaResultadosContratoT');
    if (inputBuscaContratoT && listaContratosT) {
        inputBuscaContratoT.addEventListener('input', debounce(function() {
            const texto = this.value.toLowerCase();
            listaContratosT.innerHTML = '';
            if (texto.length >= 3) {
                const resultados = baseContratos.filter(c => (c.fornecedor && c.fornecedor.toLowerCase().includes(texto)) || (c.numContrato && c.numContrato.toLowerCase().includes(texto)));
                resultados.forEach(c => {
                    const li = document.createElement('li');
                    li.innerHTML = '<strong>' + escapeHTML(c.numContrato) + '</strong> - ' + escapeHTML(c.fornecedor);
                    li.onclick = () => {
                        document.getElementById('dadosContratoSelecionado').style.display = 'block';
                        document.getElementById('readFornecedor').value = c.fornecedor;
                        document.getElementById('readInstrumento').value = c.numContrato;
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
            const texto = this.value.toUpperCase();
            listaEmpenhosT.innerHTML = '';
            if (texto.length >= 4) {
                const resultados = baseEmpenhos.filter(e => e.numEmpenho.includes(texto));
                resultados.forEach(e => {
                    const li = document.createElement('li');
                    li.innerHTML = '<strong>' + escapeHTML(e.numEmpenho) + '</strong> (FR: ' + escapeHTML(e.fr) + ')';
                    li.onclick = () => {
                        empenhoTemporarioSelecionado = e;
                        document.getElementById('detalhesVinculoEmpenho').style.display = 'block';
                        document.getElementById('empenhoSelecionadoTexto').textContent = 'NE Selecionada: ' + e.numEmpenho;
                        listaEmpenhosT.innerHTML = '';
                        inputBuscaEmpenhoT.value = '';
                    };
                    listaEmpenhosT.appendChild(li);
                });
            }
        }));
    }

    const tabelaEmpenhosDaNota = document.querySelector('#tabelaEmpenhosDaNota tbody');
    if (tabelaEmpenhosDaNota) {
        tabelaEmpenhosDaNota.addEventListener('click', function(e) {
            const btnRm = e.target.closest('.btn-rm-empenhonota');
            if (btnRm) {
                const index = btnRm.getAttribute('data-index');
                empenhosDaNotaAtual.splice(index, 1);
                desenharMiniTabelaEmpenhos();
            }
        });
    }

    function adicionarEmpenhoNaNota() {
        const valor = document.getElementById('vinculoValor').value;
        if (!valor || !empenhoTemporarioSelecionado) return alert("Defina o valor a vincular!");
        empenhosDaNotaAtual.push({
            numEmpenho: escapeHTML(empenhoTemporarioSelecionado.numEmpenho),
            valorVinculado: escapeHTML(valor),
            lf: escapeHTML(document.getElementById('vinculoLF').value),
            pf: escapeHTML(document.getElementById('vinculoPF').value)
        });
        desenharMiniTabelaEmpenhos();
        document.getElementById('detalhesVinculoEmpenho').style.display = 'none';
    }
    window.adicionarEmpenhoNaNota = adicionarEmpenhoNaNota;

    function desenharMiniTabelaEmpenhos() {
        const tbody = document.querySelector('#tabelaEmpenhosDaNota tbody');
        if (!tbody) return;
        tbody.innerHTML = '';
        empenhosDaNotaAtual.forEach((v, i) => {
            tbody.innerHTML += '<tr><td>' + escapeHTML(v.numEmpenho) + '</td><td>R$ ' + escapeHTML(v.valorVinculado) + '</td><td>' + escapeHTML(v.lf) + '</td><td>' + escapeHTML(v.pf) + '</td><td><button type="button" class="btn-icon btn-rm-empenhonota" data-index="' + i + '">🗑️</button></td></tr>';
        });
    }

    function gerarNovoIDProc() {
        if (baseTitulos.length === 0) return "PROC-001";
        const numeros = baseTitulos.map(t => parseInt(t.idProc.split('-')[1]) || 0);
        const max = Math.max(...numeros);
        return "PROC-" + String(max + 1).padStart(3, '0');
    }

    document.getElementById('formTitulo').addEventListener('submit', async function(e) {
        e.preventDefault();
        if (empenhosDaNotaAtual.length === 0) return alert("Vincule ao menos um empenho!");
        mostrarLoading();
        const fbID = document.getElementById('editIndexTitulo').value;
        const idProcOriginal = document.getElementById('idProc').value;
        const dados = {
            idProc: escapeHTML(idProcOriginal || gerarNovoIDProc()),
            dataExefin: escapeHTML(document.getElementById('dataExefin').value),
            numTC: escapeHTML(document.getElementById('numTC').value),
            notaFiscal: escapeHTML(document.getElementById('notaFiscal').value),
            fornecedor: escapeHTML(document.getElementById('readFornecedor').value),
            instrumento: escapeHTML(document.getElementById('readInstrumento').value),
            valorNotaFiscal: parseFloat(document.getElementById('valorNotaFiscal').value) || 0,
            dataEmissao: escapeHTML(document.getElementById('dataEmissao').value),
            dataAteste: escapeHTML(document.getElementById('dataAteste').value),
            empenhosVinculados: empenhosDaNotaAtual,
            criado_por: escapeHTML(usuarioLogadoEmail)
        };
        try {
            if (fbID == -1 || fbID === "") {
                dados.criado_em = firebase.firestore.FieldValue.serverTimestamp();
                await db.collection('titulos').add(dados);
            } else {
                dados.editado_em = firebase.firestore.FieldValue.serverTimestamp();
                await db.collection('titulos').doc(fbID).update(dados);
            }
            alert("Processamento salvo com sucesso!");
            voltarParaListaTitulos();
        } catch (err) { alert("Erro ao gravar Processamento. Acesso Negado."); }
        finally { esconderLoading(); }
    });

    function editarTitulo(id) {
        const t = baseTitulos.find(item => item.id === id);
        if (t) {
            abrirFormularioTitulo();
            document.getElementById('editIndexTitulo').value = t.id;
            document.getElementById('idProc').value = t.idProc || '';
            const badge = document.getElementById('badgeStatusProc');
            if (badge) { badge.textContent = t.idProc; badge.className = "badge-status salvo"; }
            document.getElementById('dataExefin').value = t.dataExefin || '';
            document.getElementById('numTC').value = t.numTC || '';
            document.getElementById('notaFiscal').value = t.notaFiscal || '';
            document.getElementById('valorNotaFiscal').value = t.valorNotaFiscal || '';
            document.getElementById('dataEmissao').value = t.dataEmissao || '';
            document.getElementById('dataAteste').value = t.dataAteste || '';
            if (t.fornecedor) {
                document.getElementById('dadosContratoSelecionado').style.display = 'block';
                document.getElementById('readFornecedor').value = t.fornecedor;
                document.getElementById('readInstrumento').value = t.instrumento || '';
            }
            empenhosDaNotaAtual = t.empenhosVinculados ? JSON.parse(JSON.stringify(t.empenhosVinculados)) : [];
            desenharMiniTabelaEmpenhos();
        }
    }

    async function apagarTitulo(id) {
        if (confirm("Apagar Título permanentemente?")) {
            mostrarLoading();
            try { await db.collection('titulos').doc(id).delete(); }
            catch (err) { alert("Acesso Negado."); }
            finally { esconderLoading(); }
        }
    }

    window.atualizarTabelaTitulos = atualizarTabelaTitulos;
    window.abrirFormularioTitulo = abrirFormularioTitulo;
})();
