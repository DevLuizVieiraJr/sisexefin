// ==========================================
// MÓDULO: ENTRADA DE TÍTULOS (FORM-3)
// ==========================================
(function() {
    if (!document.getElementById('tbody-titulos')) return;
    function normalizarCNPJ(v) {
        return String(v || '').replace(/\D/g, '').slice(0, 14);
    }

    function fornecedorLabel(cnpj, nome) {
        const cnpjFmt = cnpj ? (typeof formatarCNPJ === 'function' ? formatarCNPJ(cnpj) : cnpj) : '-';
        const n = nome ? String(nome).trim() : '';
        return n ? `${cnpjFmt} - ${n}` : cnpjFmt;
    }

    // Mantém o contrato selecionado no autocomplete para salvar fornecedor/contrato com precisão
    let contratoTemporarioSelecionado = null;

    document.getElementById('buscaTabelaTitulos').addEventListener('input', debounce(() => {
        termoBuscaTitulos = document.getElementById('buscaTabelaTitulos').value.toLowerCase();
        paginaAtualTitulos = 1;
        atualizarTabelaTitulos();
    }));

    function abrirFormularioTitulo() {
        document.getElementById('formTitulo').reset();
        document.getElementById('editIndexTitulo').value = -1;
        document.getElementById('idProc').value = "";
        contratoTemporarioSelecionado = null;
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
                (t.fornecedorNome && t.fornecedorNome.toLowerCase().includes(termoBuscaTitulos)) ||
                (t.fornecedorCnpj && t.fornecedorCnpj.toLowerCase().includes(termoBuscaTitulos)) ||
                // legado
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
            var valorExib = t.valorNotaFiscal;
            if (typeof formatarMoedaBR === 'function' && (typeof valorExib === 'number' || !isNaN(parseFloat(valorExib)))) valorExib = 'R$ ' + formatarMoedaBR(valorExib);
            else valorExib = valorExib != null && valorExib !== '' ? valorExib : '0,00';
            const nomeForn = t.fornecedorNome || t.fornecedor || '-';
            tr.innerHTML = '<td><strong>' + escapeHTML(t.idProc) + '</strong></td><td>' + (escapeHTML(t.numTC) || '-') + '</td><td title="' + escapeHTML(t.fornecedorCnpj ? fornecedorLabel(t.fornecedorCnpj, t.fornecedorNome) : '') + '">' + escapeHTML(nomeForn) + '</td><td>R$ ' + escapeHTML(String(valorExib)) + '</td><td>' + acoesHTML + '</td>';
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
            const textoCnpj = normalizarCNPJ(texto);
            listaContratosT.innerHTML = '';
            if (texto.length >= 3) {
                const resultados = baseContratos.filter(c => {
                    const nome = String(c.nomeFornecedor || '').toLowerCase();
                    const cnpj = String(c.cnpjFornecedor || '').toLowerCase();
                    const cnpjFmt = (c.cnpjFornecedor && typeof formatarCNPJ === 'function') ? String(formatarCNPJ(c.cnpjFornecedor)).toLowerCase() : '';
                    const cnpjMatch = textoCnpj ? cnpj.includes(textoCnpj) || cnpjFmt.includes(texto) : false;
                    return nome.includes(texto) || cnpjMatch || (c.numContrato && c.numContrato.toLowerCase().includes(texto));
                });
                resultados.forEach(c => {
                    const li = document.createElement('li');
                    li.innerHTML = '<strong>' + escapeHTML(c.numContrato) + '</strong> - ' + escapeHTML(fornecedorLabel(c.cnpjFornecedor, c.nomeFornecedor));
                    li.onclick = () => {
                        document.getElementById('dadosContratoSelecionado').style.display = 'block';
                        contratoTemporarioSelecionado = c;
                        document.getElementById('readFornecedor').value = fornecedorLabel(c.cnpjFornecedor, c.nomeFornecedor);
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
                    li.innerHTML = '<strong>' + escapeHTML(formatarNumEmpenhoVisivel(e.numEmpenho)) + '</strong> (FR: ' + escapeHTML(e.fr) + ')';
                    li.onclick = () => {
                        empenhoTemporarioSelecionado = e;
                        document.getElementById('detalhesVinculoEmpenho').style.display = 'block';
                        document.getElementById('empenhoSelecionadoTexto').textContent = 'NE Selecionada: ' + formatarNumEmpenhoVisivel(e.numEmpenho);
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
        const valorInput = document.getElementById('vinculoValor').value;
        if (!valorInput || !empenhoTemporarioSelecionado) return alert("Defina o valor a vincular!");
        const valorNum = typeof valorMoedaParaNumero === 'function' ? valorMoedaParaNumero(valorInput) : (parseFloat(valorInput) || 0);
        if (valorNum <= 0) return alert("Informe um valor válido!");
        empenhosDaNotaAtual.push({
            numEmpenho: escapeHTML(empenhoTemporarioSelecionado.numEmpenho),
            valorVinculado: valorNum,
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
            var valVinc = typeof formatarMoedaBR === 'function' ? formatarMoedaBR(v.valorVinculado || 0) : (v.valorVinculado || '0');
        tbody.innerHTML += '<tr><td title="' + escapeHTML(v.numEmpenho || '') + '">' + escapeHTML(formatarNumEmpenhoVisivel(v.numEmpenho)) + '</td><td>R$ ' + escapeHTML(valVinc) + '</td><td>' + escapeHTML(v.lf) + '</td><td>' + escapeHTML(v.pf) + '</td><td><button type="button" class="btn-icon btn-rm-empenhonota" data-index="' + i + '">🗑️</button></td></tr>';
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
        const instrumento = document.getElementById('readInstrumento').value;
        const contratoSel = contratoTemporarioSelecionado || (baseContratos || []).find(c => (c.numContrato || '') === (instrumento || ''));
        const fornecedorCnpj = normalizarCNPJ(contratoSel?.cnpjFornecedor || '');
        const fornecedorNome = contratoSel?.nomeFornecedor || '';
        const dados = {
            idProc: escapeHTML(idProcOriginal || gerarNovoIDProc()),
            dataExefin: escapeHTML(document.getElementById('dataExefin').value),
            numTC: escapeHTML(document.getElementById('numTC').value),
            notaFiscal: escapeHTML(document.getElementById('notaFiscal').value),
            fornecedorCnpj: escapeHTML(fornecedorCnpj),
            fornecedorNome: escapeHTML(fornecedorNome),
            instrumento: escapeHTML(document.getElementById('readInstrumento').value),
            valorNotaFiscal: typeof valorMoedaParaNumero === 'function' ? valorMoedaParaNumero(document.getElementById('valorNotaFiscal').value) : (parseFloat(document.getElementById('valorNotaFiscal').value) || 0),
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
            var valNF = parseFloat(t.valorNotaFiscal) || 0;
            document.getElementById('valorNotaFiscal').value = typeof formatarMoedaBR === 'function' ? ('R$ ' + formatarMoedaBR(valNF)) : (t.valorNotaFiscal || '');
            document.getElementById('dataEmissao').value = t.dataEmissao || '';
            document.getElementById('dataAteste').value = t.dataAteste || '';
            if (t.fornecedorCnpj || t.fornecedorNome || t.fornecedor) {
                document.getElementById('dadosContratoSelecionado').style.display = 'block';
                const fornTexto = (t.fornecedorCnpj || t.fornecedorNome)
                    ? fornecedorLabel(t.fornecedorCnpj, t.fornecedorNome)
                    : (t.fornecedor || '');
                document.getElementById('readFornecedor').value = fornTexto;
                document.getElementById('readInstrumento').value = t.instrumento || '';
                contratoTemporarioSelecionado = (baseContratos || []).find(c =>
                    (c.numContrato || '') === (t.instrumento || '') &&
                    (!t.fornecedorCnpj || normalizarCNPJ(c.cnpjFornecedor) === normalizarCNPJ(t.fornecedorCnpj))
                ) || null;
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
