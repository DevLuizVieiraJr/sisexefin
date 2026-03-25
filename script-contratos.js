// MÓDULO: CONTRATOS E EMPRESAS
(function() {
    // Define o exportador global antes de qualquer "return" antecipado
    // para evitar "exportarContratos is not defined" caso a seção ainda não esteja no DOM no momento do load.
    window.exportarContratos = window.exportarContratos || function(formato) {
        if (typeof XLSX === 'undefined') return alert("Biblioteca XLSX não carregada (SheetJS).");
        try {
            const contratos = (typeof baseContratos !== 'undefined' && Array.isArray(baseContratos)) ? baseContratos : [];
            if (contratos.length === 0) return alert("Nenhum contrato carregado para exportar.");

            const normalizarCNPJ = (v) => String(v || '').replace(/\D/g, '').slice(0, 14);
            const label = (cnpj, nome) => {
                const cnpjN = normalizarCNPJ(cnpj);
                const cnpjFmt = cnpjN ? (typeof formatarCNPJ === 'function' ? formatarCNPJ(cnpjN) : cnpjN) : '-';
                const n = nome ? String(nome).trim() : '';
                return n ? `${cnpjFmt} - ${n}` : cnpjFmt;
            };

            const dados = contratos.map(c => ({
                'ID': c.idContrato || '',
                'Instrumento': c.numContrato || c.instrumento || '',
                'Situação': c.situacao || '',
                'Fornecedor CNPJ': c.cnpjFornecedor || '',
                'Fornecedor Nome': c.nomeFornecedor || '',
                'Fornecedor': label(c.cnpjFornecedor, c.nomeFornecedor),
                'NUP': c.nup || '',
                'Data Início': c.dataInicio || '',
                'Data Fim': c.dataFim || '',
                'Valor Global': c.valorContrato || '',
                'Deduções Permitidas': Array.isArray(c.deducoesPermitidas) ? JSON.stringify(c.deducoesPermitidas) : ''
            }));

            const ws = XLSX.utils.json_to_sheet(dados);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'Contratos');
            XLSX.writeFile(wb, 'contratos.' + (formato === 'csv' ? 'csv' : 'xlsx'));
        } catch (err) {
            console.error('Erro ao exportar contratos:', err);
            alert("Erro ao exportar contratos: " + (err && err.message ? err.message : String(err)));
        }
    };

    if (!document.getElementById('tabelaContratos')) return;
    function normalizarCNPJ(v) {
        return String(v || '').replace(/\D/g, '').slice(0, 14);
    }

    function labelFornecedorContrato(cnpjFornecedor, nomeFornecedor) {
        const cnpjFmt = cnpjFornecedor ? (typeof formatarCNPJ === 'function' ? formatarCNPJ(cnpjFornecedor) : cnpjFornecedor) : '-';
        const nome = nomeFornecedor ? String(nomeFornecedor).trim() : '';
        return nome ? `${cnpjFmt} - ${nome}` : cnpjFmt;
    }

    const formContrato = document.getElementById('formContrato');
    const tabelaContratosBody = document.querySelector('#tabelaContratos tbody');
    document.getElementById('buscaTabelaContratos').addEventListener('input', debounce(function() {
        termoBuscaContratos = document.getElementById('buscaTabelaContratos').value.toLowerCase();
        paginaAtualContratos = 1;
        atualizarTabelaContratos();
    }));
    function abrirFormularioContrato(isEdit) {
        if (!isEdit) { formContrato.reset(); document.getElementById('editIndexContrato').value = -1; deducoesPermitidasContratoAtual = []; desenharDedEncContrato(); }
        document.getElementById('tela-lista-contratos').style.display = 'none';
        document.getElementById('tela-formulario-contratos').style.display = 'block';
    }
    function voltarParaListaContratos() {
        document.getElementById('tela-formulario-contratos').style.display = 'none';
        document.getElementById('tela-lista-contratos').style.display = 'block';
        atualizarTabelaContratos();
    }
    window.voltarParaListaContratos = voltarParaListaContratos;
    function atualizarTabelaContratos() {
        tabelaContratosBody.innerHTML = '';
        var baseFiltrada = baseContratos.map(function(c, index) { return Object.assign({}, c, { indexOriginal: index }); });
        if (termoBuscaContratos.trim() !== "") {
            baseFiltrada = baseFiltrada.filter(function(c) {
                const termo = termoBuscaContratos;
                const nome = String(c.nomeFornecedor || '').toLowerCase();
                const cnpjDig = String(c.cnpjFornecedor || '').toLowerCase();
                const cnpjFmt = (typeof formatarCNPJ === 'function' && c.cnpjFornecedor) ? String(formatarCNPJ(c.cnpjFornecedor)).toLowerCase() : '';
                const txtFornecedor = (nome + ' ' + cnpjDig + ' ' + cnpjFmt).toLowerCase();
                return txtFornecedor.indexOf(termo) !== -1 || (c.numContrato && c.numContrato.toLowerCase().indexOf(termo) !== -1);
            });
        }
        baseFiltrada = aplicarOrdenacao(baseFiltrada, 'contratos');
        var inicio = (paginaAtualContratos - 1) * itensPorPaginaContratos;
        var fim = inicio + parseInt(itensPorPaginaContratos, 10);
        var itensExibidos = baseFiltrada.slice(inicio, fim);
        if (itensExibidos.length === 0) {
            tabelaContratosBody.innerHTML = '<tr><td colspan="10" style="text-align:center;">Nenhum contrato encontrado.</td></tr>';
            return;
        }
        itensExibidos.forEach(function(c) {
            var tr = document.createElement('tr');
            var acoesHTML = gerarBotoesAcao(c.id, 'contrato');
            var cnpjFmt = c.cnpjFornecedor ? (typeof formatarCNPJ === 'function' ? formatarCNPJ(c.cnpjFornecedor) : c.cnpjFornecedor) : '-';
            var valorExib = c.valorContrato;
            if (typeof formatarMoedaBR === 'function' && (typeof valorExib === 'number' || !isNaN(parseFloat(valorExib)))) valorExib = 'R$ ' + formatarMoedaBR(valorExib);
            else if (valorExib == null || valorExib === '') valorExib = '-';
            tr.innerHTML = '<td>' + (escapeHTML(c.idContrato) || '-') + '</td><td><strong>' + (escapeHTML(c.numContrato) || '-') + '</strong></td><td>' + escapeHTML(cnpjFmt) + '</td><td>' + (escapeHTML(c.nomeFornecedor) || '-') + '</td><td>' + (escapeHTML(c.nup) || '-') + '</td><td>' + (escapeHTML(c.dataInicio) || '-') + '</td><td>' + (escapeHTML(c.dataFim) || '-') + '</td><td>' + (escapeHTML(String(valorExib))) + '</td><td>' + (escapeHTML(c.situacao) || '-') + '</td><td>' + acoesHTML + '</td>';
            tabelaContratosBody.appendChild(tr);
        });
        var total = Math.ceil(baseFiltrada.length / itensPorPaginaContratos) || 1;
        document.getElementById('infoPaginaContratos').textContent = 'Página ' + paginaAtualContratos + ' de ' + total;
        document.getElementById('btnAnteriorContratos').disabled = paginaAtualContratos === 1;
        document.getElementById('btnProximoContratos').disabled = paginaAtualContratos === total;
    }
    tabelaContratosBody.addEventListener('click', function(e) {
        var btnEditar = e.target.closest('.btn-editar-contrato');
        var btnApagar = e.target.closest('.btn-apagar-contrato');
        if (btnEditar) editarContrato(btnEditar.getAttribute('data-id'));
        if (btnApagar) apagarContrato(btnApagar.getAttribute('data-id'));
    });
    window.mudarTamanhoPaginaContratos = function() { itensPorPaginaContratos = document.getElementById('itensPorPaginaContratos').value; paginaAtualContratos = 1; atualizarTabelaContratos(); };
    window.mudarPaginaContratos = function(direcao) { paginaAtualContratos += direcao; atualizarTabelaContratos(); };
    function editarContrato(id) {
        var c = baseContratos.find(function(item) { return item.id === id; });
        if (c) {
            abrirFormularioContrato(true);
            document.getElementById('editIndexContrato').value = c.id;
            document.getElementById('idContrato').value = c.idContrato || '';
            document.getElementById('numContrato').value = c.numContrato || '';
            document.getElementById('situacaoContrato').value = c.situacao || '';
            document.getElementById('cnpjFornecedorContrato').value = c.cnpjFornecedor ? (typeof formatarCNPJ === 'function' ? formatarCNPJ(c.cnpjFornecedor) : c.cnpjFornecedor) : '';
            document.getElementById('nomeFornecedorContrato').value = c.nomeFornecedor || '';
            document.getElementById('nupContrato').value = c.nup || '';
            document.getElementById('dataInicio').value = c.dataInicio || '';
            document.getElementById('dataFim').value = c.dataFim || '';
            var valorTratado = c.valorContrato;
            var numVal = 0;
            if (typeof valorMoedaParaNumero === 'function') numVal = valorMoedaParaNumero(valorTratado);
            else if (typeof valorTratado === 'string' && valorTratado.indexOf('R$') !== -1) { valorTratado = valorTratado.replace('R$', '').replace(/\./g, '').replace(',', '.').trim(); numVal = parseFloat(valorTratado) || 0; }
            else numVal = parseFloat(valorTratado) || 0;
            document.getElementById('valorContrato').value = typeof formatarMoedaBR === 'function' ? ('R$ ' + formatarMoedaBR(numVal)) : (numVal || '');
            deducoesPermitidasContratoAtual = (c.deducoesPermitidas && Array.isArray(c.deducoesPermitidas)) ? c.deducoesPermitidas.map(function(x) { return { dedEncId: x.dedEncId, tipo: x.tipo, codigo: x.codigo, descricao: x.descricao }; }) : (c.codigosReceita && Array.isArray(c.codigosReceita)) ? c.codigosReceita.map(function(cod) { return { codigo: cod, tipo: 'DDF025' }; }) : [];
            desenharDedEncContrato();
        }
    }
    async function apagarContrato(id) {
        var c = baseContratos.find(function(item) { return item.id === id; });
        if (c && typeof baseTitulos !== 'undefined') {
            var titulosVinculados = baseTitulos.filter(function(t) { return (t.instrumento || '') === (c.numContrato || ''); });
            if (titulosVinculados.length > 0) {
                alert('Não é possível excluir este Contrato: existem ' + titulosVinculados.length + ' título(s) vinculado(s). Remova o vínculo nos títulos primeiro.');
                return;
            }
        }
        if (confirm("Apagar Contrato permanentemente?")) {
            mostrarLoading();
            try { await db.collection('contratos').doc(id).delete(); }
            catch (err) { alert("Acesso Negado ou falha de rede."); }
            finally { esconderLoading(); }
        }
    }
    formContrato.addEventListener('submit', async function(e) {
        e.preventDefault();
        mostrarLoading();
        var fbID = document.getElementById('editIndexContrato').value;
        var numVal = typeof valorMoedaParaNumero === 'function' ? valorMoedaParaNumero(document.getElementById('valorContrato').value) : (parseFloat(document.getElementById('valorContrato').value) || 0);
        const cnpjFornecedor = normalizarCNPJ(document.getElementById('cnpjFornecedorContrato').value);
        const nomeFornecedor = document.getElementById('nomeFornecedorContrato').value;
        var dados = {
            idContrato: escapeHTML(document.getElementById('idContrato').value),
            numContrato: escapeHTML(document.getElementById('numContrato').value),
            situacao: escapeHTML(document.getElementById('situacaoContrato').value),
            cnpjFornecedor: escapeHTML(normalizarCNPJ(cnpjFornecedor)),
            nomeFornecedor: escapeHTML(nomeFornecedor),
            nup: escapeHTML(document.getElementById('nupContrato').value),
            dataInicio: escapeHTML(document.getElementById('dataInicio').value),
            dataFim: escapeHTML(document.getElementById('dataFim').value),
            valorContrato: numVal,
            deducoesPermitidas: deducoesPermitidasContratoAtual
        };
        try {
            if (fbID == -1 || fbID === "") { await db.collection('contratos').add(dados); }
            else { await db.collection('contratos').doc(fbID).update(dados); }
            voltarParaListaContratos();
        } catch (err) { alert("Erro ao guardar contrato."); }
        finally { esconderLoading(); }
    });
    var inputBuscaDedEncContrato = document.getElementById('buscaDedEncContrato');
    var listaResultadosDedEnc = document.getElementById('listaResultadosDedEnc');
    if (inputBuscaDedEncContrato && listaResultadosDedEnc) {
        inputBuscaDedEncContrato.addEventListener('input', debounce(function() {
            // Não usar `this.value` aqui: o debounce global não preserva o contexto do input.
            var texto = (inputBuscaDedEncContrato.value || '').toLowerCase();
            listaResultadosDedEnc.innerHTML = '';
            if (texto.length >= 2) {
                var base = typeof baseDeducoesEncargos !== 'undefined' ? baseDeducoesEncargos : [];
                var resultados = base.filter(function(d) {
                    if (d.ativo === false) return false;
                    var codigo = String(d.codigo || '').toLowerCase();
                    var tipo = String(d.tipo || '').toLowerCase();
                    var codReceita = String(d.codReceita || '').toLowerCase();
                    var natRendimento = String(d.natRendimento || '').toLowerCase();
                    var descRendimento = String(d.descRendimento || '').toLowerCase();
                    var descricao = String(d.descricao || '').toLowerCase();
                    return codigo.indexOf(texto) !== -1 ||
                        tipo.indexOf(texto) !== -1 ||
                        codReceita.indexOf(texto) !== -1 ||
                        natRendimento.indexOf(texto) !== -1 ||
                        descRendimento.indexOf(texto) !== -1 ||
                        descricao.indexOf(texto) !== -1;
                });
                resultados.sort(function(a, b) {
                    var codA = String(a.codigo || '');
                    var codB = String(b.codigo || '');
                    var cmpCodigo = codA.localeCompare(codB, 'pt-BR', { numeric: true, sensitivity: 'base' });
                    if (cmpCodigo !== 0) return cmpCodigo;
                    var tipoA = String(a.tipo || '');
                    var tipoB = String(b.tipo || '');
                    return tipoA.localeCompare(tipoB, 'pt-BR', { numeric: true, sensitivity: 'base' });
                });
                if (resultados.length === 0) {
                    listaResultadosDedEnc.innerHTML = '<li style="color:red; padding:10px;">Nenhuma dedução encontrada.</li>';
                } else {
                    resultados.forEach(function(d) {
                        var li = document.createElement('li');
                        li.innerHTML = '<strong>' + escapeHTML(d.codigo || '-') + '</strong> | ' +
                            escapeHTML(d.tipo || '-') + ' | ' +
                            'CodReceita ' + escapeHTML(d.codReceita || '-') + ' | ' +
                            'Nat ' + escapeHTML(d.natRendimento || '-') + ' | ' +
                            escapeHTML((d.descRendimento || d.descricao || ''));
                        li.onclick = function() { selecionarDedEncContrato(d); };
                        listaResultadosDedEnc.appendChild(li);
                    });
                }
            }
        }));
    }
    function jaIncluida(d) { return deducoesPermitidasContratoAtual.some(function(p) { return p.dedEncId === d.id || (p.codigo === d.codigo && p.tipo === d.tipo); }); }
    function selecionarDedEncContrato(d) { if (!jaIncluida(d)) { deducoesPermitidasContratoAtual.push({ dedEncId: d.id, tipo: d.tipo, codigo: d.codigo, descricao: d.descricao }); desenharDedEncContrato(); } inputBuscaDedEncContrato.value = ''; listaResultadosDedEnc.innerHTML = ''; }
    function desenharDedEncContrato() {
        var container = document.getElementById('containerDedEncContrato');
        if (!container) return;
        container.innerHTML = '';
        deducoesPermitidasContratoAtual.forEach(function(p, index) {
            var span = document.createElement('span');
            span.className = 'badge-tag';
            span.innerHTML = escapeHTML(p.codigo || p.tipo) + ' <button type="button" data-index="' + index + '" class="btn-rm-dedenc">&times;</button>';
            container.appendChild(span);
        });
    }
    var containerDedEnc = document.getElementById('containerDedEncContrato');
    if (containerDedEnc) containerDedEnc.addEventListener('click', function(e) { if (e.target.classList.contains('btn-rm-dedenc')) { deducoesPermitidasContratoAtual.splice(parseInt(e.target.getAttribute('data-index'), 10), 1); desenharDedEncContrato(); } });

    // Exporta a coleção "contratos" (CSV e Excel) via XLSX.
    window.exportarContratos = function(formato) {
        if (typeof XLSX === 'undefined') return alert("Biblioteca XLSX não carregada (SheetJS).");
        try {
            const contratos = (typeof baseContratos !== 'undefined' && Array.isArray(baseContratos)) ? baseContratos : [];
            if (contratos.length === 0) return alert("Nenhum contrato carregado para exportar.");

            const dados = contratos.map(c => ({
                'ID': c.idContrato || '',
                'Instrumento': c.numContrato || c.instrumento || '',
                'Situação': c.situacao || '',
                'Fornecedor CNPJ': c.cnpjFornecedor || '',
                'Fornecedor Nome': c.nomeFornecedor || '',
                'Fornecedor': labelFornecedorContrato(c.cnpjFornecedor, c.nomeFornecedor),
                'NUP': c.nup || '',
                'Data Início': c.dataInicio || '',
                'Data Fim': c.dataFim || '',
                'Valor Global': c.valorContrato || '',
                'Deduções Permitidas': Array.isArray(c.deducoesPermitidas) ? JSON.stringify(c.deducoesPermitidas) : ''
            }));
            const ws = XLSX.utils.json_to_sheet(dados);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'Contratos');
            XLSX.writeFile(wb, 'contratos.' + (formato === 'csv' ? 'csv' : 'xlsx'));
        } catch (err) {
            console.error('Erro ao exportar contratos:', err);
            alert("Erro ao exportar contratos: " + (err && err.message ? err.message : String(err)));
        }
    };

    window.atualizarTabelaContratos = atualizarTabelaContratos;
    window.abrirFormularioContrato = abrirFormularioContrato;
})();
