// MÓDULO: CONTRATOS E EMPRESAS
(function() {
    if (!document.getElementById('tabelaContratos')) return;
    const formContrato = document.getElementById('formContrato');
    const tabelaContratosBody = document.querySelector('#tabelaContratos tbody');
    document.getElementById('buscaTabelaContratos').addEventListener('input', debounce(function() {
        termoBuscaContratos = document.getElementById('buscaTabelaContratos').value.toLowerCase();
        paginaAtualContratos = 1;
        atualizarTabelaContratos();
    }));
    function abrirFormularioContrato(isEdit) {
        if (!isEdit) { formContrato.reset(); document.getElementById('editIndexContrato').value = -1; darfsDoContratoAtual = []; desenharDarfsContrato(); }
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
            baseFiltrada = baseFiltrada.filter(function(c) { return (c.fornecedor && c.fornecedor.toLowerCase().indexOf(termoBuscaContratos) !== -1) || (c.numContrato && c.numContrato.toLowerCase().indexOf(termoBuscaContratos) !== -1); });
        }
        baseFiltrada = aplicarOrdenacao(baseFiltrada, 'contratos');
        var inicio = (paginaAtualContratos - 1) * itensPorPaginaContratos;
        var fim = inicio + parseInt(itensPorPaginaContratos, 10);
        var itensExibidos = baseFiltrada.slice(inicio, fim);
        if (itensExibidos.length === 0) {
            tabelaContratosBody.innerHTML = '<tr><td colspan="8" style="text-align:center;">Nenhum contrato encontrado.</td></tr>';
            return;
        }
        itensExibidos.forEach(function(c) {
            var tr = document.createElement('tr');
            var acoesHTML = gerarBotoesAcao(c.id, 'contrato');
                        var valorExib = c.valorContrato;
            if (typeof formatarMoedaBR === 'function' && (typeof valorExib === 'number' || !isNaN(parseFloat(valorExib)))) valorExib = 'R$ ' + formatarMoedaBR(valorExib);
            else if (valorExib == null || valorExib === '') valorExib = '-';
            tr.innerHTML = '<td>' + (escapeHTML(c.idContrato) || '-') + '</td><td><strong>' + (escapeHTML(c.numContrato) || '-') + '</strong></td><td>' + (escapeHTML(c.fornecedor) || '-') + '</td><td>' + (escapeHTML(c.dataInicio) || '-') + '</td><td>' + (escapeHTML(c.dataFim) || '-') + '</td><td>' + (escapeHTML(String(valorExib))) + '</td><td>' + (escapeHTML(c.situacao) || '-') + '</td><td>' + acoesHTML + '</td>';
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
            document.getElementById('fornecedorContrato').value = c.fornecedor || '';
            document.getElementById('nupContrato').value = c.nup || '';
            document.getElementById('dataInicio').value = c.dataInicio || '';
            document.getElementById('dataFim').value = c.dataFim || '';
            var valorTratado = c.valorContrato;
            var numVal = 0;
            if (typeof valorMoedaParaNumero === 'function') numVal = valorMoedaParaNumero(valorTratado);
            else if (typeof valorTratado === 'string' && valorTratado.indexOf('R$') !== -1) { valorTratado = valorTratado.replace('R$', '').replace(/\./g, '').replace(',', '.').trim(); numVal = parseFloat(valorTratado) || 0; }
            else numVal = parseFloat(valorTratado) || 0;
            document.getElementById('valorContrato').value = typeof formatarMoedaBR === 'function' ? ('R$ ' + formatarMoedaBR(numVal)) : (numVal || '');
            darfsDoContratoAtual = (c.codigosReceita && Array.isArray(c.codigosReceita)) ? c.codigosReceita.slice() : [];
            desenharDarfsContrato();
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
        var dados = { idContrato: escapeHTML(document.getElementById('idContrato').value), numContrato: escapeHTML(document.getElementById('numContrato').value), situacao: escapeHTML(document.getElementById('situacaoContrato').value), fornecedor: escapeHTML(document.getElementById('fornecedorContrato').value), nup: escapeHTML(document.getElementById('nupContrato').value), dataInicio: escapeHTML(document.getElementById('dataInicio').value), dataFim: escapeHTML(document.getElementById('dataFim').value), valorContrato: numVal, codigosReceita: darfsDoContratoAtual };
        try {
            if (fbID == -1 || fbID === "") { await db.collection('contratos').add(dados); }
            else { await db.collection('contratos').doc(fbID).update(dados); }
            voltarParaListaContratos();
        } catch (err) { alert("Erro ao guardar contrato."); }
        finally { esconderLoading(); }
    });
    var inputBuscaDarfContrato = document.getElementById('buscaDarfContrato');
    var listaResultadosDarf = document.getElementById('listaResultadosDarf');
    if (inputBuscaDarfContrato && listaResultadosDarf) {
        inputBuscaDarfContrato.addEventListener('input', debounce(function() {
            var texto = this.value.toLowerCase();
            listaResultadosDarf.innerHTML = '';
            if (texto.length >= 2) {
                var resultados = baseDarf.filter(function(d) { return d.codigo.indexOf(texto) !== -1 || (d.aplicacao && d.aplicacao.toLowerCase().indexOf(texto) !== -1); });
                if (resultados.length === 0) { listaResultadosDarf.innerHTML = '<li style="color:red; padding:10px;">Nenhum DARF encontrado.</li>'; }
                else { resultados.forEach(function(d) { var li = document.createElement('li'); li.innerHTML = '<strong>' + escapeHTML(d.codigo) + '</strong> - ' + escapeHTML((d.aplicacao || '').substring(0, 40)) + '...'; li.onclick = function() { selecionarDarfContrato(d); }; listaResultadosDarf.appendChild(li); }); }
            }
        }));
    }
    function selecionarDarfContrato(d) { if (darfsDoContratoAtual.indexOf(d.codigo) === -1) { darfsDoContratoAtual.push(d.codigo); desenharDarfsContrato(); } inputBuscaDarfContrato.value = ''; listaResultadosDarf.innerHTML = ''; }
    function desenharDarfsContrato() {
        var container = document.getElementById('containerDarfsContrato');
        if (!container) return;
        container.innerHTML = '';
        darfsDoContratoAtual.forEach(function(codigo, index) {
            var span = document.createElement('span');
            span.className = 'badge-tag';
            span.innerHTML = escapeHTML(codigo) + ' <button type="button" data-index="' + index + '" class="btn-rm-darf">&times;</button>';
            container.appendChild(span);
        });
    }
    var containerDarfs = document.getElementById('containerDarfsContrato');
    if (containerDarfs) containerDarfs.addEventListener('click', function(e) { if (e.target.classList.contains('btn-rm-darf')) { darfsDoContratoAtual.splice(parseInt(e.target.getAttribute('data-index'), 10), 1); desenharDarfsContrato(); } });
    window.atualizarTabelaContratos = atualizarTabelaContratos;
    window.abrirFormularioContrato = abrirFormularioContrato;
})();
