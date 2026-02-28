// ==========================================
// MÓDULO: EMPENHOS
// ==========================================
(function() {
    if (!document.getElementById('tabelaEmpenhos')) return;

    const formEmpenho = document.getElementById('formEmpenho');
    const tabelaEmpenhosBody = document.querySelector('#tabelaEmpenhos tbody');

    document.getElementById('buscaTabelaEmpenhos').addEventListener('input', debounce(() => {
        termoBuscaEmpenhos = document.getElementById('buscaTabelaEmpenhos').value.toLowerCase();
        paginaAtualEmpenhos = 1;
        atualizarTabelaEmpenhos();
    }));

    function abrirFormularioEmpenho(isEdit) {
        if (!isEdit) { formEmpenho.reset(); document.getElementById('editIndexEmpenho').value = -1; }
        document.getElementById('tela-lista-empenhos').style.display = 'none';
        document.getElementById('tela-formulario-empenhos').style.display = 'block';
    }
    function voltarParaListaEmpenhos() {
        document.getElementById('tela-formulario-empenhos').style.display = 'none';
        document.getElementById('tela-lista-empenhos').style.display = 'block';
        atualizarTabelaEmpenhos();
    }

    function atualizarTabelaEmpenhos() {
        tabelaEmpenhosBody.innerHTML = '';
        let baseFiltrada = baseEmpenhos.map((e, index) => ({ ...e, indexOriginal: index }));
        if (termoBuscaEmpenhos.trim() !== "") {
            baseFiltrada = baseFiltrada.filter(e =>
                (e.numEmpenho && String(e.numEmpenho).toLowerCase().includes(termoBuscaEmpenhos)) ||
                (e.contrato && String(e.contrato).toLowerCase().includes(termoBuscaEmpenhos))
            );
        }
        baseFiltrada = aplicarOrdenacao(baseFiltrada, 'empenhos');

        const inicio = (paginaAtualEmpenhos - 1) * itensPorPaginaEmpenhos;
        const fim = inicio + parseInt(itensPorPaginaEmpenhos);
        let itensExibidos = baseFiltrada.slice(inicio, fim);
        if (itensExibidos.length === 0) {
            tabelaEmpenhosBody.innerHTML = '<tr><td colspan="11" style="text-align:center;">Nenhum empenho encontrado.</td></tr>';
            return;
        }

        itensExibidos.forEach((e) => {
            const tr = document.createElement('tr');
            const acoesHTML = gerarBotoesAcao(e.id, 'empenho');
            tr.innerHTML = `
                <td title="${escapeHTML(e.numEmpenho) || ''}"><strong>${escapeHTML(formatarNumEmpenhoVisivel(e.numEmpenho)) || '-'}</strong></td>
                <td>${escapeHTML(e.nd) || '-'}</td>
                <td>${escapeHTML(e.subitem) || '-'}</td>
                <td>${escapeHTML(e.ptres) || '-'}</td>
                <td>${escapeHTML(e.fr) || '-'}</td>
                <td>${escapeHTML(e.docOrig) || '-'}</td>
                <td>${escapeHTML(e.oi) || '-'}</td>
                <td>${escapeHTML(e.contrato) || '-'}</td>
                <td>${escapeHTML(e.cap) || '-'}</td>
                <td>${escapeHTML(e.meio) || '-'}</td>
                <td>${acoesHTML}</td>`;
            tabelaEmpenhosBody.appendChild(tr);
        });
        const total = Math.ceil(baseFiltrada.length / itensPorPaginaEmpenhos) || 1;
        document.getElementById('infoPaginaEmpenhos').textContent = `Página ${paginaAtualEmpenhos} de ${total}`;
        document.getElementById('btnAnteriorEmpenhos').disabled = paginaAtualEmpenhos === 1;
        document.getElementById('btnProximoEmpenhos').disabled = paginaAtualEmpenhos === total;
    }

    tabelaEmpenhosBody.addEventListener('click', function(e) {
        const btnEditar = e.target.closest('.btn-editar-empenho');
        const btnApagar = e.target.closest('.btn-apagar-empenho');
        if (btnEditar) editarEmpenho(btnEditar.getAttribute('data-id'));
        if (btnApagar) apagarEmpenho(btnApagar.getAttribute('data-id'));
    });

    window.mudarTamanhoPaginaEmpenhos = function() { itensPorPaginaEmpenhos = document.getElementById('itensPorPaginaEmpenhos').value; paginaAtualEmpenhos = 1; atualizarTabelaEmpenhos(); };
    window.mudarPaginaEmpenhos = function(direcao) { paginaAtualEmpenhos += direcao; atualizarTabelaEmpenhos(); };

    function editarEmpenho(id) {
        const e = baseEmpenhos.find(item => item.id === id);
        if (e) {
            abrirFormularioEmpenho(true);
            document.getElementById('editIndexEmpenho').value = e.id;
            document.getElementById('numEmpenho').value = e.numEmpenho || '';
            document.getElementById('dataEmpenho').value = e.dataEmissao || '';
            document.getElementById('valorEmpenho').value = e.valorGlobal || '';
            document.getElementById('ndEmpenho').value = e.nd || '';
            document.getElementById('subitemEmpenho').value = e.subitem || '';
            document.getElementById('ptresEmpenho').value = e.ptres || '';
            document.getElementById('frEmpenho').value = e.fr || '';
            document.getElementById('docOrigEmpenho').value = e.docOrig || '';
            document.getElementById('oiEmpenho').value = e.oi || '';
            document.getElementById('contratoEmpenho').value = e.contrato || '';
            document.getElementById('capEmpenho').value = e.cap || '';
            document.getElementById('altcredEmpenho').value = e.altcred || '';
            document.getElementById('meioEmpenho').value = e.meio || '';
            document.getElementById('descricaoEmpenho').value = e.descricao || '';
        }
    }

    async function apagarEmpenho(id) {
        const e = baseEmpenhos.find(item => item.id === id);
        if (e && (typeof baseTitulos !== 'undefined')) {
            const titulosVinculados = baseTitulos.filter(t => (t.empenhosVinculados || []).some(v => v.numEmpenho === e.numEmpenho));
            if (titulosVinculados.length > 0) {
                alert('Não é possível excluir este Empenho: existem ' + titulosVinculados.length + ' título(s) vinculado(s). Remova o empenho dos títulos primeiro.');
                return;
            }
        }
        if (confirm("Apagar o Empenho permanentemente?")) {
            mostrarLoading();
            try { await db.collection('empenhos').doc(id).delete(); }
            catch (err) { alert("Acesso Negado."); }
            finally { esconderLoading(); }
        }
    }

    formEmpenho.addEventListener('submit', async function(e) {
        e.preventDefault();
        mostrarLoading();
        const fbID = document.getElementById('editIndexEmpenho').value;
        const dados = {
            numEmpenho: escapeHTML(document.getElementById('numEmpenho').value),
            dataEmissao: escapeHTML(document.getElementById('dataEmpenho').value),
            valorGlobal: escapeHTML(document.getElementById('valorEmpenho').value),
            nd: escapeHTML(document.getElementById('ndEmpenho').value),
            subitem: escapeHTML(document.getElementById('subitemEmpenho').value),
            ptres: escapeHTML(document.getElementById('ptresEmpenho').value),
            fr: escapeHTML(document.getElementById('frEmpenho').value),
            docOrig: escapeHTML(document.getElementById('docOrigEmpenho').value),
            oi: escapeHTML(document.getElementById('oiEmpenho').value),
            contrato: escapeHTML(document.getElementById('contratoEmpenho').value),
            cap: escapeHTML(document.getElementById('capEmpenho').value),
            altcred: escapeHTML(document.getElementById('altcredEmpenho').value),
            meio: escapeHTML(document.getElementById('meioEmpenho').value),
            descricao: escapeHTML(document.getElementById('descricaoEmpenho').value)
        };
        try {
            if (fbID == -1 || fbID === "") { await db.collection('empenhos').add(dados); }
            else { await db.collection('empenhos').doc(fbID).update(dados); }
            voltarParaListaEmpenhos();
        } catch (err) { alert("Erro ao guardar Empenho."); }
        finally { esconderLoading(); }
    });

    window.exportarEmpenhos = function(formato) {
        if (typeof XLSX === 'undefined') return alert("Biblioteca XLSX não carregada.");
        try {
            const dados = baseEmpenhos.map(e => ({ NE: e.numEmpenho, ND: e.nd, SubEl: e.subitem, PTRES: e.ptres, FR: e.fr, AES: e.docOrig, OI: e.oi, Contrato: e.contrato, CAP: e.cap, Meio: e.meio }));
            const ws = XLSX.utils.json_to_sheet(dados);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'Empenhos');
            XLSX.writeFile(wb, 'empenhos.' + (formato === 'csv' ? 'csv' : 'xlsx'));
        } catch (err) { alert("Erro ao exportar."); }
    };

    window.atualizarTabelaEmpenhos = atualizarTabelaEmpenhos;
    window.abrirFormularioEmpenho = abrirFormularioEmpenho;
})();
