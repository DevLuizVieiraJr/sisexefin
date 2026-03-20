// ==========================================
// MÓDULO: DARF
// ==========================================
(function() {
    if (!document.getElementById('tabelaDarf')) return;

    const formDarf = document.getElementById('formDarf');
    const tabelaDarfBody = document.querySelector('#tabelaDarf tbody');

    document.getElementById('buscaTabelaDarf').addEventListener('input', debounce(() => {
        termoBuscaDarf = document.getElementById('buscaTabelaDarf').value.toLowerCase();
        paginaAtualDarf = 1;
        atualizarTabelaDarf();
    }));

    function abrirFormularioDarf(isEdit) {
        if (!isEdit) { document.getElementById('formDarf').reset(); document.getElementById('editIndexDarf').value = -1; }
        document.getElementById('tela-lista-darf').style.display = 'none';
        document.getElementById('tela-formulario-darf').style.display = 'block';
    }
    function voltarParaListaDarf() {
        document.getElementById('tela-formulario-darf').style.display = 'none';
        document.getElementById('tela-lista-darf').style.display = 'block';
        atualizarTabelaDarf();
    }
    window.voltarParaListaDarf = voltarParaListaDarf;

    function atualizarTabelaDarf() {
        tabelaDarfBody.innerHTML = '';
        let baseFiltrada = baseDarf.map((d, index) => ({ ...d, indexOriginal: index }));
        if (termoBuscaDarf.trim() !== "") { baseFiltrada = baseFiltrada.filter(d => (d.codigo && String(d.codigo).includes(termoBuscaDarf)) || (d.natRendimento && String(d.natRendimento).includes(termoBuscaDarf))); }
        baseFiltrada = aplicarOrdenacao(baseFiltrada, 'darf');

        const inicio = (paginaAtualDarf - 1) * itensPorPaginaDarf;
        const fim = inicio + parseInt(itensPorPaginaDarf);
        let itensExibidos = baseFiltrada.slice(inicio, fim);
        if (itensExibidos.length === 0) { tabelaDarfBody.innerHTML = '<tr><td colspan="6" style="text-align:center;">Nenhum DARF encontrado.</td></tr>'; return; }

        itensExibidos.forEach((d) => {
            const tr = document.createElement('tr');
            const aplicacaoCurta = d.aplicacao && d.aplicacao.length > 40 ? d.aplicacao.substring(0, 40) + "..." : (d.aplicacao || '');
            const acoesHTML = gerarBotoesAcao(d.id, 'darf');
            tr.innerHTML = `
                <td><strong>${escapeHTML(d.codigo)}</strong></td>
                <td>${escapeHTML(d.natRendimento) || '-'}</td>
                <td title="${escapeHTML(d.aplicacao)}">${escapeHTML(aplicacaoCurta) || '-'}</td>
                <td>${escapeHTML(d.sitSiafi) || '-'}</td>
                <td>${escapeHTML(d.total) || '-'}</td>
                <td>${acoesHTML}</td>`;
            tabelaDarfBody.appendChild(tr);
        });
        const total = Math.ceil(baseFiltrada.length / itensPorPaginaDarf) || 1;
        document.getElementById('infoPaginaDarf').textContent = `Página ${paginaAtualDarf} de ${total}`;
        document.getElementById('btnAnteriorDarf').disabled = paginaAtualDarf === 1;
        document.getElementById('btnProximoDarf').disabled = paginaAtualDarf === total;
    }

    tabelaDarfBody.addEventListener('click', function(e) {
        const btnEditar = e.target.closest('.btn-editar-darf');
        const btnApagar = e.target.closest('.btn-apagar-darf');
        if (btnEditar) editarDarf(btnEditar.getAttribute('data-id'));
        if (btnApagar) apagarDarf(btnApagar.getAttribute('data-id'));
    });

    window.mudarTamanhoPaginaDarf = function() { itensPorPaginaDarf = document.getElementById('itensPorPaginaDarf').value; paginaAtualDarf = 1; atualizarTabelaDarf(); };
    window.mudarPaginaDarf = function(direcao) { paginaAtualDarf += direcao; atualizarTabelaDarf(); };

    function editarDarf(id) {
        const d = baseDarf.find(item => item.id === id);
        if (d) {
            abrirFormularioDarf(true);
            document.getElementById('editIndexDarf').value = d.id;
            document.getElementById('codigoDarf').value = d.codigo || '';
            document.getElementById('natRendimentoDarf').value = d.natRendimento || '';
            document.getElementById('sitSiafiDarf').value = d.sitSiafi || '';
            document.getElementById('aplicacaoDarf').value = d.aplicacao || '';
            document.getElementById('irDarf').value = d.ir || '';
            document.getElementById('csllDarf').value = d.csll || '';
            document.getElementById('cofinsDarf').value = d.cofins || '';
            document.getElementById('pisDarf').value = d.pis || '';
            document.getElementById('totalDarf').value = d.total || '';
        }
    }

    async function apagarDarf(id) {
        const d = baseDarf.find(item => item.id === id);
        if (d && (typeof baseContratos !== 'undefined')) {
            const contratosVinculados = baseContratos.filter(c => (c.codigosReceita || []).includes(d.codigo));
            if (contratosVinculados.length > 0) {
                alert('Não é possível excluir este DARF: existem ' + contratosVinculados.length + ' contrato(s) vinculado(s). Remova o código DARF dos contratos primeiro.');
                return;
            }
        }
        if (confirm("Apagar o DARF permanentemente?")) {
            mostrarLoading();
            try { await db.collection('darf').doc(id).delete(); }
            catch (err) { alert("Acesso Negado."); }
            finally { esconderLoading(); }
        }
    }

    formDarf.addEventListener('submit', async function(e) {
        e.preventDefault();
        mostrarLoading();
        const fbID = document.getElementById('editIndexDarf').value;
        const dados = { codigo: escapeHTML(document.getElementById('codigoDarf').value), natRendimento: escapeHTML(document.getElementById('natRendimentoDarf').value), sitSiafi: escapeHTML(document.getElementById('sitSiafiDarf').value), aplicacao: escapeHTML(document.getElementById('aplicacaoDarf').value), ir: escapeHTML(document.getElementById('irDarf').value), csll: escapeHTML(document.getElementById('csllDarf').value), cofins: escapeHTML(document.getElementById('cofinsDarf').value), pis: escapeHTML(document.getElementById('pisDarf').value), total: escapeHTML(document.getElementById('totalDarf').value) };
        try {
            if (fbID == -1 || fbID === "") { await db.collection('darf').add(dados); }
            else { await db.collection('darf').doc(fbID).update(dados); }
            voltarParaListaDarf();
        } catch (err) { alert("Erro ao guardar DARF."); }
        finally { esconderLoading(); }
    });

    window.atualizarTabelaDarf = atualizarTabelaDarf;
    window.abrirFormularioDarf = abrirFormularioDarf;
})();
