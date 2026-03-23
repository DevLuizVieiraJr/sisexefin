// ==========================================
// MÓDULO: EMPENHOS
// ==========================================
(function() {
    if (!document.getElementById('tabelaEmpenhos')) return;

    const formEmpenho = document.getElementById('formEmpenho');
    const tabelaEmpenhosBody = document.querySelector('#tabelaEmpenhos tbody');

    const UG_PADRAO = '741000';
    const GESTAO_PADRAO = '00001';
    const PREFIX11_PADRAO = UG_PADRAO + GESTAO_PADRAO; // 11 dígitos

    // UI pode trabalhar com apenas o sufixo 12 (AAAA + NE + NNNNNN).
    // Se o banco já estiver em modo "completo" (>12 chars), reconstruímos o ID completo antes de salvar.
    function completarNumEmpenho(numEmpenho) {
        const s = String(numEmpenho || '').trim();
        if (!s) return '';
        if (s.length > 12) return s;

        const tipo = (s.match(/^(\d{4})([A-Za-z]{2})(\d{6})$/) || [])[2];
        if (!tipo) return '';
        const tipoUpper = tipo.toUpperCase();
        if (tipoUpper !== 'NE') return '';

        const m = s.match(/^(\d{4})([A-Za-z]{2})(\d{6})$/);
        if (!m) return '';
        const ano = m[1];
        const seq = m[3];
        return PREFIX11_PADRAO + ano + 'NE' + seq;
    }

    function modoCompletoNEAtual() {
        const baseAtual = (typeof baseEmpenhos !== 'undefined' ? baseEmpenhos : undefined);
        // Se o banco ainda não foi carregado (ou veio vazio), não inferimos o "modo"
        // para evitar reconstruções indevidas (sufixo 12 -> ID completo).
        if (!Array.isArray(baseAtual) || baseAtual.length === 0) return false;
        return baseAtual.some(e => String((e && e.numEmpenho) ? e.numEmpenho : '').trim().length > 12);
    }

    document.getElementById('buscaTabelaEmpenhos').addEventListener('input', debounce(() => {
        termoBuscaEmpenhos = document.getElementById('buscaTabelaEmpenhos').value.toLowerCase();
        paginaAtualEmpenhos = 1;
        atualizarTabelaEmpenhos();
    }));

    function abrirFormularioEmpenho(isEdit) {
        if (!isEdit) {
            formEmpenho.reset();
            document.getElementById('editIndexEmpenho').value = -1;
            document.getElementById('dataEmpenho').value = new Date().toISOString().slice(0, 10);
            document.getElementById('tipoNEEmpenho').value = 'GLOBAL';
            ativarTabNE(0);
        }
        document.getElementById('tela-lista-empenhos').style.display = 'none';
        document.getElementById('tela-formulario-empenhos').style.display = 'block';
    }
    function ativarTabNE(i) {
        document.querySelectorAll('.tab-ne').forEach(function(t, j) { t.classList.toggle('ativo', j === i); });
        document.querySelectorAll('.tab-panel-ne').forEach(function(p, j) { p.classList.toggle('visivel', j === i); });
    }
    function voltarParaListaEmpenhos() {
        document.getElementById('tela-formulario-empenhos').style.display = 'none';
        document.getElementById('tela-lista-empenhos').style.display = 'block';
        atualizarTabelaEmpenhos();
    }
    window.voltarParaListaEmpenhos = voltarParaListaEmpenhos;

    document.getElementById('btnCancelarEmpenho')?.addEventListener('click', function() { voltarParaListaEmpenhos(); });

    document.querySelectorAll('.tab-ne').forEach(function(tab, i) {
        tab.addEventListener('click', function() { ativarTabNE(i); });
    });

    function atualizarTabelaEmpenhos() {
        tabelaEmpenhosBody.innerHTML = '';
        let baseAtiva = baseEmpenhos.filter(e => e.ativo !== false);
        let baseFiltrada = baseAtiva.map((e, index) => ({ ...e, indexOriginal: index }));
        if (termoBuscaEmpenhos.trim() !== "") {
            const q = termoBuscaEmpenhos.toLowerCase();
            baseFiltrada = baseFiltrada.filter(e =>
                (e.numEmpenho && String(e.numEmpenho).toLowerCase().includes(q)) ||
                (e.contrato && String(e.contrato).toLowerCase().includes(q)) ||
                (e.favorecido && String(e.favorecido).toLowerCase().includes(q)) ||
                (e.processo && String(e.processo).toLowerCase().includes(q)) ||
                (e.cnpj && (String(e.cnpj).toLowerCase().includes(q) || String(e.cnpj).replace(/\D/g, '').includes(q.replace(/\D/g, ''))))
            );
        }
        baseFiltrada = aplicarOrdenacao(baseFiltrada, 'empenhos');

        const totalRegistros = baseFiltrada.length;
        const totalPaginas = Math.max(1, Math.ceil(totalRegistros / itensPorPaginaEmpenhos));
        const paginaAtualAjustada = Math.min(Math.max(1, paginaAtualEmpenhos), totalPaginas);
        paginaAtualEmpenhos = paginaAtualAjustada;
        const inicio = (paginaAtualAjustada - 1) * itensPorPaginaEmpenhos;
        let itensExibidos = baseFiltrada.slice(inicio, inicio + parseInt(itensPorPaginaEmpenhos));
        if (itensExibidos.length === 0) {
            tabelaEmpenhosBody.innerHTML = '<tr><td colspan="13" style="text-align:center;">Nenhum empenho encontrado.</td></tr>';
        } else {
            itensExibidos.forEach((e) => {
                const tr = document.createElement('tr');
                const acoesHTML = gerarBotoesAcao(e.id, 'empenho');
                const fav = (e.favorecido || '').substring(0, 35);
                const cnpjFmt = typeof formatarCNPJ === 'function' ? formatarCNPJ(e.cnpj) : (e.cnpj || '-');
                tr.innerHTML = `
                    <td title="${escapeHTML(e.numEmpenho) || ''}"><strong>${escapeHTML(formatarNumEmpenhoVisivel(e.numEmpenho)) || '-'}</strong></td>
                    <td>${escapeHTML(e.tipoNE) || '-'}</td>
                    <td title="${escapeHTML(e.cnpj || '')}">${escapeHTML(cnpjFmt)}</td>
                    <td title="${escapeHTML(e.favorecido || '')}">${escapeHTML(fav) || '-'}${(e.favorecido || '').length > 35 ? '...' : ''}</td>
                    <td>${escapeHTML(e.ptres) || '-'}</td>
                    <td>${escapeHTML(e.fr) || '-'}</td>
                    <td>${escapeHTML(e.pi) || '-'}</td>
                    <td>${escapeHTML(e.nd) || '-'}</td>
                    <td>${escapeHTML(e.docOrig) || '-'}</td>
                    <td>${escapeHTML(e.oi) || '-'}</td>
                    <td>${escapeHTML(e.contrato) || '-'}</td>
                    <td>${escapeHTML(e.processo) || '-'}</td>
                    <td>${acoesHTML}</td>`;
                tabelaEmpenhosBody.appendChild(tr);
            });
        }
        const mostrando = document.getElementById('mostrandoEmpenhos');
        if (mostrando) mostrando.textContent = 'Mostrando ' + (totalRegistros === 0 ? 0 : (inicio + 1)) + ' de ' + totalRegistros + ' registros';
        document.getElementById('infoPaginaEmpenhos').textContent = `Página ${paginaAtualAjustada} de ${totalPaginas}`;
        document.getElementById('btnAnteriorEmpenhos').disabled = paginaAtualAjustada <= 1;
        document.getElementById('btnProximoEmpenhos').disabled = paginaAtualAjustada >= totalPaginas;
        const btnPrimeiro = document.getElementById('btnPrimeiroEmpenhos');
        const btnUltimo = document.getElementById('btnUltimoEmpenhos');
        if (btnPrimeiro) btnPrimeiro.disabled = paginaAtualAjustada <= 1;
        if (btnUltimo) btnUltimo.disabled = paginaAtualAjustada >= totalPaginas;
    }

    tabelaEmpenhosBody.addEventListener('click', function(e) {
        const btnEditar = e.target.closest('.btn-editar-empenho');
        const btnInativar = e.target.closest('.btn-inativar-empenho');
        const btnApagar = e.target.closest('.btn-apagar-empenho-permanente');
        if (btnEditar) editarEmpenho(btnEditar.getAttribute('data-id'));
        if (btnInativar) inativarEmpenho(btnInativar.getAttribute('data-id'));
        if (btnApagar) apagarEmpenho(btnApagar.getAttribute('data-id'));
    });

    window.mudarTamanhoPaginaEmpenhos = function() { itensPorPaginaEmpenhos = document.getElementById('itensPorPaginaEmpenhos').value; paginaAtualEmpenhos = 1; atualizarTabelaEmpenhos(); };
    window.mudarPaginaEmpenhos = function(direcao) {
        const totalRegistros = baseEmpenhos.filter(e => e.ativo !== false).length;
        const totalPaginas = Math.max(1, Math.ceil(totalRegistros / itensPorPaginaEmpenhos));
        if (direcao === 'primeiro') paginaAtualEmpenhos = 1;
        else if (direcao === 'ultimo') paginaAtualEmpenhos = totalPaginas;
        else paginaAtualEmpenhos += (direcao || 0);
        atualizarTabelaEmpenhos();
    };

    function dataParaInputDate(val) {
        if (!val) return '';
        const m = String(val).match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
        if (m) return m[3] + '-' + m[2] + '-' + m[1];
        if (String(val).match(/^\d{4}-\d{2}-\d{2}/)) return String(val).substring(0, 10);
        return val;
    }
    function editarEmpenho(id) {
        const e = baseEmpenhos.find(item => item.id === id);
        if (e) {
            abrirFormularioEmpenho(true);
            ativarTabNE(0);
            document.getElementById('editIndexEmpenho').value = e.id;
            const elNum = document.getElementById('numEmpenho');
            if (elNum) {
                elNum.value = typeof formatarNumEmpenhoVisivel === 'function'
                    ? (formatarNumEmpenhoVisivel(e.numEmpenho) || '')
                    : (e.numEmpenho || '');
            }
            document.getElementById('dataEmpenho').value = dataParaInputDate(e.dataEmissao) || '';
            var valEmp = parseFloat(e.valorGlobal) || 0;
            document.getElementById('valorEmpenho').value = typeof formatarMoedaBR === 'function' ? ('R$ ' + formatarMoedaBR(valEmp)) : (e.valorGlobal || '');
            document.getElementById('piEmpenho').value = e.pi || '';
            var tipoSelect = document.getElementById('tipoNEEmpenho');
            var tipoVal = (e.tipoNE || '').toUpperCase().replace(/[ÁÀÂÃ]/g,'A').replace(/[ÍÌÎ]/g,'I').replace(/[ÓÒÔÕ]/g,'O').replace(/[ÉÈÊ]/g,'E');
            tipoSelect.value = (['GLOBAL','ORDINARIO','ESTIMATIVO'].indexOf(tipoVal) >= 0) ? tipoVal : 'GLOBAL';
            document.getElementById('ndEmpenho').value = e.nd || '';
            document.getElementById('subitemEmpenho').value = e.subitem || '';
            document.getElementById('ptresEmpenho').value = e.ptres || '';
            document.getElementById('frEmpenho').value = e.fr || '';
            document.getElementById('numModalEmpenho').value = e.numModal || '';
            document.getElementById('descModalEmpenho').value = e.descModal || '';
            document.getElementById('codAmpEmpenho').value = e.codAmp || '';
            document.getElementById('incisoEmpenho').value = e.inciso || '';
            document.getElementById('leiEmpenho').value = e.lei || '';
            document.getElementById('processoEmpenho').value = e.processo || '';
            document.getElementById('cnpjEmpenho').value = e.cnpj || '';
            document.getElementById('favorecidoEmpenho').value = e.favorecido || '';
            document.getElementById('pjPfEmpenho').value = e.pjPf || '';
            document.getElementById('telefoneEmpenho').value = e.telefone || '';
            document.getElementById('contatoEmpenho').value = e.contato || '';
            document.getElementById('gerenciaEmpenho').value = e.gerencia || '';
            document.getElementById('docOrigEmpenho').value = e.docOrig || '';
            document.getElementById('oiEmpenho').value = e.oi || '';
            document.getElementById('contratoEmpenho').value = e.contrato || '';
            document.getElementById('projetoEmpenho').value = e.projeto || '';
            document.getElementById('capEmpenho').value = e.cap || '';
            document.getElementById('altcredEmpenho').value = e.altcred || '';
            document.getElementById('meioEmpenho').value = e.meio || '';
            document.getElementById('descricaoEmpenho').value = e.descricao || '';
        }
    }

    async function inativarEmpenho(id) {
        const e = baseEmpenhos.find(item => item.id === id);
        if (!e) return;
        if (!confirm('Deseja inativar/cancelar este empenho? O registro permanecerá no sistema com situação Cancelado.')) return;
        mostrarLoading();
        try {
            await db.collection('empenhos').doc(id).update({
                ativo: false,
                situacao: 'Cancelado',
                updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                updatedBy: (typeof auth !== 'undefined' && auth.currentUser && auth.currentUser.email) ? auth.currentUser.email : ''
            });
            atualizarTabelaEmpenhos();
        } catch (err) { alert('Erro ao inativar.'); }
        finally { esconderLoading(); }
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
        if (!confirm('Excluir PERMANENTEMENTE este empenho? Esta ação não pode ser desfeita.')) return;
        mostrarLoading();
        try {
            await db.collection('empenhos').doc(id).delete();
            atualizarTabelaEmpenhos();
        } catch (err) { alert('Acesso negado ou erro ao excluir.'); }
        finally { esconderLoading(); }
    }

    formEmpenho.addEventListener('submit', async function(e) {
        e.preventDefault();
        mostrarLoading();
        const fbID = document.getElementById('editIndexEmpenho').value;

        const numEmpenhoRaw = (document.getElementById('numEmpenho') || {}).value || '';
        const numEmpenhoSalvavel = modoCompletoNEAtual()
            ? completarNumEmpenho(numEmpenhoRaw) || String(numEmpenhoRaw).trim()
            : String(numEmpenhoRaw).trim();

        const dados = {
            numEmpenho: escapeHTML(numEmpenhoSalvavel),
            dataEmissao: escapeHTML(document.getElementById('dataEmpenho').value),
            valorGlobal: typeof valorMoedaParaNumero === 'function' ? valorMoedaParaNumero(document.getElementById('valorEmpenho').value) : (parseFloat(document.getElementById('valorEmpenho').value) || 0),
            ativo: true,
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
            descricao: escapeHTML(document.getElementById('descricaoEmpenho').value),
            pi: escapeHTML(document.getElementById('piEmpenho')?.value || ''),
            tipoNE: escapeHTML(document.getElementById('tipoNEEmpenho')?.value || ''),
            numModal: escapeHTML(document.getElementById('numModalEmpenho')?.value || ''),
            descModal: escapeHTML(document.getElementById('descModalEmpenho')?.value || ''),
            codAmp: escapeHTML(document.getElementById('codAmpEmpenho')?.value || ''),
            inciso: escapeHTML(document.getElementById('incisoEmpenho')?.value || ''),
            lei: escapeHTML(document.getElementById('leiEmpenho')?.value || ''),
            processo: escapeHTML(document.getElementById('processoEmpenho')?.value || ''),
            cnpj: escapeHTML(document.getElementById('cnpjEmpenho')?.value || ''),
            favorecido: escapeHTML(document.getElementById('favorecidoEmpenho')?.value || ''),
            pjPf: escapeHTML(document.getElementById('pjPfEmpenho')?.value || ''),
            telefone: escapeHTML(document.getElementById('telefoneEmpenho')?.value || ''),
            contato: escapeHTML(document.getElementById('contatoEmpenho')?.value || ''),
            gerencia: escapeHTML(document.getElementById('gerenciaEmpenho')?.value || ''),
            projeto: escapeHTML(document.getElementById('projetoEmpenho')?.value || '')
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
            const dados = baseEmpenhos.map(e => ({
            NE: e.numEmpenho, DATA: e.dataEmissao, PI: e.pi, 'TIPO NE': e.tipoNE, PTRES: e.ptres, FR: e.fr, ND: e.nd, SUBITEM: e.subitem,
            'NUM MODAL': e.numModal, 'DESC MODAL': e.descModal, 'COD AMP': e.codAmp, INCISO: e.inciso, LEI: e.lei, PROCESSO: e.processo,
            CNPJ: e.cnpj, FAVORECIDO: e.favorecido, 'PJ/PF': e.pjPf, TELEFONE: e.telefone, CONTATO: e.contato, GERENCIA: e.gerencia, 'AES/SOLEMP': e.docOrig, OI: e.oi,
            CONTRATO: e.contrato, PROJETO: e.projeto, ALTCRED: e.altcred, MEIO: e.meio, OBS: e.descricao
        }));
            const ws = XLSX.utils.json_to_sheet(dados);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'Empenhos');
            XLSX.writeFile(wb, 'empenhos.' + (formato === 'csv' ? 'csv' : 'xlsx'));
        } catch (err) { alert("Erro ao exportar."); }
    };

    window.atualizarTabelaEmpenhos = atualizarTabelaEmpenhos;
    window.abrirFormularioEmpenho = abrirFormularioEmpenho;
})();
