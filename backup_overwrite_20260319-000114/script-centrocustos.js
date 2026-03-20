// ==========================================
// MÓDULO: CENTRO DE CUSTOS
// ==========================================
(function() {
    if (!document.getElementById('tabelaCentroCustos')) return;

    const formCC = document.getElementById('formCentroCustos');
    const tabelaCCBody = document.querySelector('#tabelaCentroCustos tbody');

    document.getElementById('buscaTabelaCentroCustos').addEventListener('input', debounce(() => {
        termoBuscaCentroCustos = document.getElementById('buscaTabelaCentroCustos').value.toLowerCase();
        paginaAtualCentroCustos = 1;
        atualizarTabelaCentroCustos();
    }));

    function abrirFormularioCentroCustos(isEdit) {
        if (!isEdit) {
            formCC.reset();
            document.getElementById('editIndexCentroCustos').value = -1;
        }
        document.getElementById('tela-lista-centrocustos').style.display = 'none';
        document.getElementById('tela-formulario-centrocustos').style.display = 'block';
    }
    window.abrirFormularioCentroCustos = abrirFormularioCentroCustos;

    function voltarParaListaCentroCustos() {
        document.getElementById('tela-formulario-centrocustos').style.display = 'none';
        document.getElementById('tela-lista-centrocustos').style.display = 'block';
        atualizarTabelaCentroCustos();
    }
    window.voltarParaListaCentroCustos = voltarParaListaCentroCustos;

    document.getElementById('btnCancelarCentroCustos')?.addEventListener('click', voltarParaListaCentroCustos);

    function atualizarTabelaCentroCustos() {
        tabelaCCBody.innerHTML = '';
        let baseFiltrada = (baseCentroCustos || []).slice();
        if (termoBuscaCentroCustos.trim() !== '') {
            const q = termoBuscaCentroCustos;
            baseFiltrada = baseFiltrada.filter(c =>
                (c.codigo && String(c.codigo).toLowerCase().includes(q)) ||
                (c.aplicacao && String(c.aplicacao).toLowerCase().includes(q)) ||
                (c.descricao && String(c.descricao).toLowerCase().includes(q))
            );
        }
        baseFiltrada = aplicarOrdenacao(baseFiltrada, 'centrocustos');

        const totalRegistros = baseFiltrada.length;
        const totalPaginas = Math.max(1, Math.ceil(totalRegistros / itensPorPaginaCentroCustos));
        const paginaAtualAjustada = Math.min(Math.max(1, paginaAtualCentroCustos), totalPaginas);
        paginaAtualCentroCustos = paginaAtualAjustada;
        const inicio = (paginaAtualAjustada - 1) * itensPorPaginaCentroCustos;
        const itensExibidos = baseFiltrada.slice(inicio, inicio + parseInt(itensPorPaginaCentroCustos));
        if (itensExibidos.length === 0) {
            tabelaCCBody.innerHTML = '<tr><td colspan="4" style="text-align:center;">Nenhum registro encontrado.</td></tr>';
        } else {
            itensExibidos.forEach((c) => {
                const tr = document.createElement('tr');
                const acoesHTML = typeof gerarBotoesAcao === 'function' ? gerarBotoesAcao(c.id, 'centrocustos', c) : '';
                tr.innerHTML = `<td>${escapeHTML(c.codigo || '-')}</td><td>${escapeHTML((c.aplicacao || '-').substring(0, 40))}${(c.aplicacao || '').length > 40 ? '...' : ''}</td><td>${escapeHTML((c.descricao || '-').substring(0, 50))}${(c.descricao || '').length > 50 ? '...' : ''}</td><td>${acoesHTML}</td>`;
                tabelaCCBody.appendChild(tr);
            });
        }
        const mostrando = document.getElementById('mostrandoCentroCustos');
        if (mostrando) mostrando.textContent = 'Mostrando ' + (totalRegistros === 0 ? 0 : (inicio + 1)) + ' de ' + totalRegistros + ' registros';
        document.getElementById('infoPaginaCentroCustos').textContent = 'Página ' + paginaAtualAjustada + ' de ' + totalPaginas;
        document.getElementById('btnAnteriorCentroCustos').disabled = paginaAtualAjustada <= 1;
        document.getElementById('btnProximoCentroCustos').disabled = paginaAtualAjustada >= totalPaginas;
        const btnPrimeiro = document.getElementById('btnPrimeiroCentroCustos');
        const btnUltimo = document.getElementById('btnUltimoCentroCustos');
        if (btnPrimeiro) btnPrimeiro.disabled = paginaAtualAjustada <= 1;
        if (btnUltimo) btnUltimo.disabled = paginaAtualAjustada >= totalPaginas;
    }

    tabelaCCBody.addEventListener('click', function(e) {
        const btnEditar = e.target.closest('.btn-editar-centrocustos');
        const btnInativar = e.target.closest('.btn-inativar-centrocustos');
        const btnReativar = e.target.closest('.btn-reativar-centrocustos');
        const btnApagarPermanente = e.target.closest('.btn-apagar-centrocustos-permanente');
        if (btnEditar) editarCentroCustos(btnEditar.getAttribute('data-id'));
        if (btnInativar) inativarCentroCustos(btnInativar.getAttribute('data-id'));
        if (btnReativar) reativarCentroCustos(btnReativar.getAttribute('data-id'));
        if (btnApagarPermanente) excluirPermanenteCentroCustos(btnApagarPermanente.getAttribute('data-id'));
    });

    window.mudarTamanhoPaginaCentroCustos = function() { itensPorPaginaCentroCustos = document.getElementById('itensPorPaginaCentroCustos').value; paginaAtualCentroCustos = 1; atualizarTabelaCentroCustos(); };
    window.mudarPaginaCentroCustos = function(direcao) {
        const totalRegistros = (baseCentroCustos || []).length;
        const totalPaginas = Math.max(1, Math.ceil(totalRegistros / itensPorPaginaCentroCustos));
        if (direcao === 'primeiro') paginaAtualCentroCustos = 1;
        else if (direcao === 'ultimo') paginaAtualCentroCustos = totalPaginas;
        else paginaAtualCentroCustos += (direcao || 0);
        atualizarTabelaCentroCustos();
    };

    function editarCentroCustos(id) {
        const c = (baseCentroCustos || []).find(item => item.id === id);
        if (c) {
            abrirFormularioCentroCustos(true);
            document.getElementById('editIndexCentroCustos').value = c.id;
            document.getElementById('centrocustosCodigo').value = c.codigo || '';
            document.getElementById('centrocustosAplicacao').value = c.aplicacao || '';
            document.getElementById('centrocustosDescricao').value = c.descricao || '';
        }
    }

    async function inativarCentroCustos(id) {
        if (!confirm('Inativar este Centro de Custos? Ele deixará de aparecer na lista (apenas Admin poderá ver e reativar).')) return;
        mostrarLoading();
        try {
            await db.collection('centroCustos').doc(id).update({ ativo: false });
            atualizarTabelaCentroCustos();
        } catch (err) { alert('Erro ao inativar.'); }
        finally { esconderLoading(); }
    }

    async function reativarCentroCustos(id) {
        if (!confirm('Reativar este Centro de Custos?')) return;
        mostrarLoading();
        try {
            await db.collection('centroCustos').doc(id).update({ ativo: true });
            atualizarTabelaCentroCustos();
        } catch (err) { alert('Erro ao reativar.'); }
        finally { esconderLoading(); }
    }

    async function excluirPermanenteCentroCustos(id) {
        if (!confirm('Excluir PERMANENTEMENTE este Centro de Custos? Esta ação não pode ser desfeita.')) return;
        mostrarLoading();
        try {
            await db.collection('centroCustos').doc(id).delete();
            atualizarTabelaCentroCustos();
        } catch (err) { alert('Erro ao excluir.'); }
        finally { esconderLoading(); }
    }

    formCC.addEventListener('submit', async function(e) {
        e.preventDefault();
        const fbID = document.getElementById('editIndexCentroCustos').value;
        const dados = {
            codigo: escapeHTML(document.getElementById('centrocustosCodigo').value),
            aplicacao: escapeHTML(document.getElementById('centrocustosAplicacao').value),
            descricao: escapeHTML(document.getElementById('centrocustosDescricao').value),
            ativo: true
        };
        mostrarLoading();
        try {
            if (fbID == -1 || fbID === '') await db.collection('centroCustos').add(dados);
            else await db.collection('centroCustos').doc(fbID).update(dados);
            voltarParaListaCentroCustos();
        } catch (err) { alert('Erro ao guardar.'); }
        finally { esconderLoading(); }
    });

    window.atualizarTabelaCentroCustos = atualizarTabelaCentroCustos;
})();
