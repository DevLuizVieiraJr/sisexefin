// ==========================================
// MÓDULO: UNIDADE GESTORA (UG)
// ==========================================
(function() {
    if (!document.getElementById('tabelaUG')) return;

    const formUG = document.getElementById('formUG');
    const tabelaUGBody = document.querySelector('#tabelaUG tbody');

    document.getElementById('buscaTabelaUG').addEventListener('input', debounce(() => {
        termoBuscaUG = document.getElementById('buscaTabelaUG').value.toLowerCase();
        paginaAtualUG = 1;
        atualizarTabelaUG();
    }));

    function abrirFormularioUG(isEdit) {
        if (!isEdit) {
            formUG.reset();
            document.getElementById('editIndexUG').value = -1;
        }
        document.getElementById('tela-lista-ug').style.display = 'none';
        document.getElementById('tela-formulario-ug').style.display = 'block';
    }
    window.abrirFormularioUG = abrirFormularioUG;

    function voltarParaListaUG() {
        document.getElementById('tela-formulario-ug').style.display = 'none';
        document.getElementById('tela-lista-ug').style.display = 'block';
        atualizarTabelaUG();
    }
    window.voltarParaListaUG = voltarParaListaUG;

    document.getElementById('btnCancelarUG')?.addEventListener('click', voltarParaListaUG);

    function atualizarTabelaUG() {
        tabelaUGBody.innerHTML = '';
        let baseFiltrada = (baseUnidadesGestoras || []).slice();
        if (termoBuscaUG.trim() !== '') {
            const q = termoBuscaUG;
            baseFiltrada = baseFiltrada.filter(u =>
                (u.codigo && String(u.codigo).toLowerCase().includes(q)) ||
                (u.nome && String(u.nome).toLowerCase().includes(q)) ||
                (u.comimsup && String(u.comimsup).toLowerCase().includes(q)) ||
                (u.contato && String(u.contato).toLowerCase().includes(q))
            );
        }
        baseFiltrada = aplicarOrdenacao(baseFiltrada, 'ug');

        const totalRegistros = baseFiltrada.length;
        const totalPaginas = Math.max(1, Math.ceil(totalRegistros / itensPorPaginaUG));
        const paginaAtualAjustada = Math.min(Math.max(1, paginaAtualUG), totalPaginas);
        paginaAtualUG = paginaAtualAjustada;
        const inicio = (paginaAtualAjustada - 1) * itensPorPaginaUG;
        const itensExibidos = baseFiltrada.slice(inicio, inicio + parseInt(itensPorPaginaUG));
        if (itensExibidos.length === 0) {
            tabelaUGBody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Nenhum registro encontrado.</td></tr>';
        } else {
            itensExibidos.forEach((u) => {
                const tr = document.createElement('tr');
                const acoesHTML = typeof gerarBotoesAcao === 'function' ? gerarBotoesAcao(u.id, 'ug', u) : '';
                tr.innerHTML = `<td>${escapeHTML(u.codigo || '-')}</td><td>${escapeHTML((u.nome || '-').substring(0, 40))}${(u.nome || '').length > 40 ? '...' : ''}</td><td>${escapeHTML((u.comimsup || '-').substring(0, 25))}</td><td>${escapeHTML((u.contato || '-').substring(0, 30))}</td><td>${acoesHTML}</td>`;
                tabelaUGBody.appendChild(tr);
            });
        }
        const mostrando = document.getElementById('mostrandoUG');
        if (mostrando) mostrando.textContent = 'Mostrando ' + (totalRegistros === 0 ? 0 : (inicio + 1)) + ' de ' + totalRegistros + ' registros';
        document.getElementById('infoPaginaUG').textContent = 'Página ' + paginaAtualAjustada + ' de ' + totalPaginas;
        document.getElementById('btnAnteriorUG').disabled = paginaAtualAjustada <= 1;
        document.getElementById('btnProximoUG').disabled = paginaAtualAjustada >= totalPaginas;
        const btnPrimeiro = document.getElementById('btnPrimeiroUG');
        const btnUltimo = document.getElementById('btnUltimoUG');
        if (btnPrimeiro) btnPrimeiro.disabled = paginaAtualAjustada <= 1;
        if (btnUltimo) btnUltimo.disabled = paginaAtualAjustada >= totalPaginas;
    }

    tabelaUGBody.addEventListener('click', function(e) {
        const btnEditar = e.target.closest('.btn-editar-ug');
        const btnInativar = e.target.closest('.btn-inativar-ug');
        const btnReativar = e.target.closest('.btn-reativar-ug');
        const btnApagarPermanente = e.target.closest('.btn-apagar-ug-permanente');
        if (btnEditar) editarUG(btnEditar.getAttribute('data-id'));
        if (btnInativar) inativarUG(btnInativar.getAttribute('data-id'));
        if (btnReativar) reativarUG(btnReativar.getAttribute('data-id'));
        if (btnApagarPermanente) excluirPermanenteUG(btnApagarPermanente.getAttribute('data-id'));
    });

    window.mudarTamanhoPaginaUG = function() { itensPorPaginaUG = document.getElementById('itensPorPaginaUG').value; paginaAtualUG = 1; atualizarTabelaUG(); };
    window.mudarPaginaUG = function(direcao) {
        const totalRegistros = (baseUnidadesGestoras || []).length;
        const totalPaginas = Math.max(1, Math.ceil(totalRegistros / itensPorPaginaUG));
        if (direcao === 'primeiro') paginaAtualUG = 1;
        else if (direcao === 'ultimo') paginaAtualUG = totalPaginas;
        else paginaAtualUG += (direcao || 0);
        atualizarTabelaUG();
    };

    function editarUG(id) {
        const u = (baseUnidadesGestoras || []).find(item => item.id === id);
        if (u) {
            abrirFormularioUG(true);
            document.getElementById('editIndexUG').value = u.id;
            document.getElementById('ugCodigo').value = u.codigo || '';
            document.getElementById('ugNome').value = u.nome || '';
            document.getElementById('ugComimsup').value = u.comimsup || '';
            document.getElementById('ugContato').value = u.contato || '';
        }
    }

    async function inativarUG(id) {
        if (!confirm('Inativar esta Unidade Gestora? Ela deixará de aparecer na lista (apenas Admin poderá ver e reativar).')) return;
        mostrarLoading();
        try {
            await db.collection('unidadesGestoras').doc(id).update({ ativo: false });
            atualizarTabelaUG();
        } catch (err) { alert('Erro ao inativar.'); }
        finally { esconderLoading(); }
    }

    async function reativarUG(id) {
        if (!confirm('Reativar esta Unidade Gestora?')) return;
        mostrarLoading();
        try {
            await db.collection('unidadesGestoras').doc(id).update({ ativo: true });
            atualizarTabelaUG();
        } catch (err) { alert('Erro ao reativar.'); }
        finally { esconderLoading(); }
    }

    async function excluirPermanenteUG(id) {
        if (!confirm('Excluir PERMANENTEMENTE esta Unidade Gestora? Esta ação não pode ser desfeita.')) return;
        mostrarLoading();
        try {
            await db.collection('unidadesGestoras').doc(id).delete();
            atualizarTabelaUG();
        } catch (err) { alert('Erro ao excluir.'); }
        finally { esconderLoading(); }
    }

    formUG.addEventListener('submit', async function(e) {
        e.preventDefault();
        const fbID = document.getElementById('editIndexUG').value;
        const dados = {
            codigo: escapeHTML(document.getElementById('ugCodigo').value),
            nome: escapeHTML(document.getElementById('ugNome').value),
            comimsup: escapeHTML(document.getElementById('ugComimsup').value),
            contato: escapeHTML(document.getElementById('ugContato').value),
            ativo: true
        };
        mostrarLoading();
        try {
            if (fbID == -1 || fbID === '') await db.collection('unidadesGestoras').add(dados);
            else await db.collection('unidadesGestoras').doc(fbID).update(dados);
            voltarParaListaUG();
        } catch (err) { alert('Erro ao guardar.'); }
        finally { esconderLoading(); }
    });

    window.atualizarTabelaUG = atualizarTabelaUG;
})();
