// ==========================================
// MÓDULO: LIQUIDAÇÃO FINANCEIRA (LF) x PEDIDO FINANCEIRO (PF)
// ==========================================
(function() {
    if (!document.getElementById('tabelaLfPf')) return;

    const formLfPf = document.getElementById('formLfPf');
    const tabelaLfPfBody = document.querySelector('#tabelaLfPf tbody');
    let empenhosVinculadosLfPf = []; // lista de { numNE, valor, ptres, fr, nd }
    let empenhoSelecionadoLfPf = null;

    function formatarHojeDdMmAaaa() {
        const hoje = new Date();
        const dia = String(hoje.getDate()).padStart(2, '0');
        const mes = String(hoje.getMonth() + 1).padStart(2, '0');
        const ano = hoje.getFullYear();
        return dia + '/' + mes + '/' + ano;
    }

    function abrirFormularioLfPf(isEdit) {
        if (!isEdit) {
            formLfPf.reset();
            document.getElementById('editIndexLfPf').value = '-1';
            empenhosVinculadosLfPf = [];
            document.getElementById('lfDataCriacao').value = formatarHojeDdMmAaaa();
            document.getElementById('lfUltimaAtualizacao').value = formatarHojeDdMmAaaa();
            desenharTabelaNeLfPf();
            limparAuditoria();
        }
        document.getElementById('tela-lista-lfpf').style.display = 'none';
        document.getElementById('tela-formulario-lfpf').style.display = 'block';
        ativarTabLfPf(0);
    }

    function ativarTabLfPf(i) {
        document.querySelectorAll('#tabsLfPf .tab-ne').forEach(function(t, j) { t.classList.toggle('ativo', j === i); });
        document.querySelectorAll('[id^="panelLfPf"]').forEach(function(p, j) { p.classList.toggle('visivel', j === i); });
    }

    document.querySelectorAll('#tabsLfPf .tab-ne').forEach(function(tab, i) {
        tab.addEventListener('click', function() { ativarTabLfPf(i); });
    });

    function voltarParaListaLfPf() {
        if (formLfPf.dataset.dirty === '1' && !confirm('Deseja sair? As alterações não salvas serão perdidas.')) return;
        document.getElementById('tela-formulario-lfpf').style.display = 'none';
        document.getElementById('tela-lista-lfpf').style.display = 'block';
        if (typeof atualizarTabelaLfPf === 'function') atualizarTabelaLfPf();
    }
    window.voltarParaListaLfPf = voltarParaListaLfPf;

    const buscaTabelaLfPfEl = document.getElementById('buscaTabelaLfPf');
    if (buscaTabelaLfPfEl) {
        buscaTabelaLfPfEl.addEventListener('input', typeof debounce === 'function' ? debounce(function() {
            termoBuscaLfPf = (buscaTabelaLfPfEl.value || '').toLowerCase().trim();
            if (typeof paginaAtualLfPf !== 'undefined') window.paginaAtualLfPf = 1;
            if (typeof atualizarTabelaLfPf === 'function') atualizarTabelaLfPf();
        }, 300) : function() {});
    }

    function dataParaComparacao(val) {
        if (!val) return '';
        const s = String(val).trim();
        const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
        if (m) return m[3] + '-' + m[2] + '-' + m[1];
        if (s.match(/^\d{4}-\d{2}-\d{2}/)) return s.substring(0, 10);
        return s;
    }

    function atualizarTabelaLfPf() {
        if (!tabelaLfPfBody) return;
        tabelaLfPfBody.innerHTML = '';
        let base = (typeof baseLfPf !== 'undefined' ? baseLfPf : []).filter(function(r) { return r.ativo !== false; });
        const q = (typeof termoBuscaLfPf !== 'undefined' ? termoBuscaLfPf : '').toLowerCase().trim();
        if (q) {
            base = base.filter(function(r) {
                return (r.lf || '').toLowerCase().indexOf(q) !== -1 ||
                    (r.pf || '').toLowerCase().indexOf(q) !== -1 ||
                    (r.situacao || '').toLowerCase().indexOf(q) !== -1 ||
                    (r.fr || '').toLowerCase().indexOf(q) !== -1 ||
                    (r.vinculacao || '').toLowerCase().indexOf(q) !== -1 ||
                    (r.origem || '').toLowerCase().indexOf(q) !== -1;
            });
        }

        base = base.map(function(r, i) { return Object.assign({}, r, { indexOriginal: i }); });
        if (typeof aplicarOrdenacao === 'function') base = aplicarOrdenacao(base, 'lfpf');
        const totalRegistros = base.length;
        const itensPorPagina = parseInt((document.getElementById('itensPorPaginaLfPf') || {}).value || 10, 10);
        const paginaAtual = typeof paginaAtualLfPf !== 'undefined' ? paginaAtualLfPf : 1;
        const totalPaginas = Math.max(1, Math.ceil(totalRegistros / itensPorPagina));
        const paginaAtualAjustada = Math.min(paginaAtual, totalPaginas);
        if (typeof window.paginaAtualLfPf !== 'undefined') window.paginaAtualLfPf = paginaAtualAjustada;
        const inicio = (paginaAtualAjustada - 1) * itensPorPagina;
        const itensExibidos = base.slice(inicio, inicio + itensPorPagina);

        if (itensExibidos.length === 0) {
            tabelaLfPfBody.innerHTML = '<tr><td colspan="11" style="text-align:center;">Nenhum registro encontrado.</td></tr>';
        } else {
            itensExibidos.forEach(function(r) {
                const tr = document.createElement('tr');
                const acoesHTML = typeof gerarBotoesAcao === 'function' ? gerarBotoesAcao(r.id, 'lfpf') : '';
                const valorExib = (typeof formatarMoedaBR === 'function' && (typeof r.valor === 'number' || !isNaN(parseFloat(r.valor)))) ? ('R$ ' + formatarMoedaBR(r.valor)) : (r.valor != null ? r.valor : '-');
                tr.innerHTML = '<td><strong>' + escapeHTML(r.lf || '-') + '</strong></td><td>' + escapeHTML(r.dataCriacao || '-') + '</td><td>' + escapeHTML(String(valorExib)) + '</td><td>' + escapeHTML(r.tipoLiquidacao || '-') + '</td><td>' + escapeHTML(r.situacao || '-') + '</td><td>' + escapeHTML(r.pf || '-') + '</td><td>' + escapeHTML(r.rp || '-') + '</td><td>' + escapeHTML(r.fr || '-') + '</td><td>' + escapeHTML(r.vinculacao || '-') + '</td><td>' + escapeHTML(r.origem || '-') + '</td><td>' + acoesHTML + '</td>';
                tabelaLfPfBody.appendChild(tr);
            });
        }

        const mostrando = document.getElementById('mostrandoLfPf');
        if (mostrando) mostrando.textContent = 'Mostrando ' + (totalRegistros === 0 ? 0 : (inicio + 1)) + ' de ' + totalRegistros + ' registros';
        const infoPagina = document.getElementById('infoPaginaLfPf');
        if (infoPagina) infoPagina.textContent = 'Página ' + paginaAtualAjustada + ' de ' + totalPaginas;
        const btnAnt = document.getElementById('btnAnteriorLfPf');
        const btnProx = document.getElementById('btnProximoLfPf');
        const btnPrimeiro = document.getElementById('btnPrimeiroLfPf');
        const btnUltimo = document.getElementById('btnUltimoLfPf');
        if (btnAnt) btnAnt.disabled = paginaAtualAjustada <= 1;
        if (btnProx) btnProx.disabled = paginaAtualAjustada >= totalPaginas;
        if (btnPrimeiro) btnPrimeiro.disabled = paginaAtualAjustada <= 1;
        if (btnUltimo) btnUltimo.disabled = paginaAtualAjustada >= totalPaginas;
    }

    tabelaLfPfBody.addEventListener('click', function(e) {
        const btnEditar = e.target.closest('.btn-editar-lfpf');
        const btnInativar = e.target.closest('.btn-inativar-lfpf');
        const btnApagar = e.target.closest('.btn-apagar-lfpf-permanente');
        if (btnEditar) editarLfPf(btnEditar.getAttribute('data-id'));
        if (btnInativar) inativarLfPf(btnInativar.getAttribute('data-id'));
        if (btnApagar) excluirPermanenteLfPf(btnApagar.getAttribute('data-id'));
    });

    window.mudarTamanhoPaginaLfPf = function() {
        if (typeof paginaAtualLfPf !== 'undefined') window.paginaAtualLfPf = 1;
        atualizarTabelaLfPf();
    };

    window.mudarPaginaLfPf = function(direcao) {
        const totalRegistros = (typeof baseLfPf !== 'undefined' ? baseLfPf : []).filter(function(r) { return r.ativo !== false; }).length;
        const itensPorPagina = parseInt((document.getElementById('itensPorPaginaLfPf') || {}).value || 10, 10);
        const totalPaginas = Math.max(1, Math.ceil(totalRegistros / itensPorPagina));
        if (direcao === 'primeiro') window.paginaAtualLfPf = 1;
        else if (direcao === 'ultimo') window.paginaAtualLfPf = totalPaginas;
        else window.paginaAtualLfPf = (paginaAtualLfPf || 1) + (direcao || 0);
        atualizarTabelaLfPf();
    };

    function normalizarDataParaCampo(val) {
        if (!val) return '';
        const s = String(val).trim();
        // Se já estiver em dd/mm/aaaa, mantém
        if (s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)) return s;
        // Se vier em yyyy-mm-dd (formato antigo ou padrão do Firestore/UI), converte para dd/mm/aaaa
        const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (m) return m[3] + '/' + m[2] + '/' + m[1];
        return s;
    }

    function limparAuditoria() {
        ['audDataCriacao', 'audUsuarioCriador', 'audDataAlteracao', 'audUsuarioAlteracao', 'audHistorico'].forEach(function(id) {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
    }

    function preencherAuditoria(r) {
        document.getElementById('audDataCriacao').value = r.createdAt ? (r.createdAt.toDate ? r.createdAt.toDate().toLocaleString('pt-BR') : r.createdAt) : '-';
        document.getElementById('audUsuarioCriador').value = r.createdBy || '-';
        document.getElementById('audDataAlteracao').value = r.updatedAt ? (r.updatedAt.toDate ? r.updatedAt.toDate().toLocaleString('pt-BR') : r.updatedAt) : '-';
        document.getElementById('audUsuarioAlteracao').value = r.updatedBy || '-';
        document.getElementById('audHistorico').value = Array.isArray(r.historico) ? r.historico.join('\n') : (r.historico || '-');
    }

    function editarLfPf(id) {
        const r = (typeof baseLfPf !== 'undefined' ? baseLfPf : []).find(function(item) { return item.id === id; });
        if (!r) return;
        abrirFormularioLfPf(true);
        document.getElementById('editIndexLfPf').value = r.id;
        document.getElementById('lfNum').value = r.lf || '';
        document.getElementById('lfDataCriacao').value = normalizarDataParaCampo(r.dataCriacao) || '';
        document.getElementById('lfValor').value = typeof formatarMoedaBR === 'function' ? ('R$ ' + formatarMoedaBR(parseFloat(r.valor) || 0)) : (r.valor || '');
        document.getElementById('lfTipoLiquidacao').value = (r.tipoLiquidacao === 'Exercício' ? 'Exercício' : 'RP');
        document.getElementById('lfSituacao').value = r.situacao || 'Aguardando Priorização';
        document.getElementById('lfUltimaAtualizacao').value = normalizarDataParaCampo(r.ultimaAtualizacao) || '';
        document.getElementById('lfPf').value = r.pf || '';
        document.getElementById('lfRp').value = (r.rp === 'Processado' ? 'Processado' : 'Não Processado');
        document.getElementById('lfFr').value = r.fr || '';
        document.getElementById('lfVinculacao').value = r.vinculacao || '';
        document.getElementById('lfOrigem').value = (['LOA', 'Destaque', 'Emenda'].indexOf(r.origem) >= 0 ? r.origem : 'LOA');
        empenhosVinculadosLfPf = Array.isArray(r.empenhosVinculados) ? r.empenhosVinculados.slice() : [];
        desenharTabelaNeLfPf();
        if (r.createdBy || r.updatedBy) preencherAuditoria(r);
        formLfPf.dataset.dirty = '0';
    }

    async function inativarLfPf(id) {
        if (!confirm('Deseja inativar/cancelar este registro? O registro permanecerá no sistema com situação Cancelado.')) return;
        mostrarLoading();
        try {
            await db.collection('lfpf').doc(id).update({
                ativo: false,
                situacao: 'Cancelado',
                updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                updatedBy: (auth.currentUser && auth.currentUser.email) ? auth.currentUser.email : ''
            });
            if (typeof atualizarTabelaLfPf === 'function') atualizarTabelaLfPf();
        } catch (err) { alert('Erro ao inativar.'); }
        finally { esconderLoading(); }
    }

    async function excluirPermanenteLfPf(id) {
        if (!confirm('Excluir PERMANENTEMENTE este registro? Esta ação não pode ser desfeita.')) return;
        mostrarLoading();
        try {
            await db.collection('lfpf').doc(id).delete();
            if (typeof atualizarTabelaLfPf === 'function') atualizarTabelaLfPf();
        } catch (err) { alert('Acesso negado ou erro ao excluir.'); }
        finally { esconderLoading(); }
    }

    function desenharTabelaNeLfPf() {
        const tbody = document.getElementById('tbodyNeLfPf');
        if (!tbody) return;
        tbody.innerHTML = '';
        empenhosVinculadosLfPf.forEach(function(ne, idx) {
            const tr = document.createElement('tr');
            const valorExib = typeof formatarMoedaBR === 'function' ? formatarMoedaBR(ne.valor || 0) : (ne.valor || '0');
            tr.innerHTML = '<td>' + escapeHTML(ne.numNE || '-') + '</td><td>R$ ' + escapeHTML(String(valorExib)) + '</td><td>' + escapeHTML(ne.ptres || '-') + '</td><td>' + escapeHTML(ne.fr || '-') + '</td><td>' + escapeHTML(ne.nd || '-') + '</td><td><button type="button" class="btn-icon btn-rm-ne-lfpf" data-index="' + idx + '">Remover</button></td>';
            tbody.appendChild(tr);
        });
    }

    document.getElementById('tbodyNeLfPf') && document.getElementById('tbodyNeLfPf').addEventListener('click', function(e) {
        const btn = e.target.closest('.btn-rm-ne-lfpf');
        if (btn) {
            const idx = parseInt(btn.getAttribute('data-index'), 10);
            empenhosVinculadosLfPf.splice(idx, 1);
            desenharTabelaNeLfPf();
        }
    });

    const buscaNeLfPf = document.getElementById('buscaNeLfPf');
    const listaResultadosNeLfPf = document.getElementById('listaResultadosNeLfPf');
    if (buscaNeLfPf && listaResultadosNeLfPf) {
        buscaNeLfPf.addEventListener('input', typeof debounce === 'function' ? debounce(function() {
            const texto = (buscaNeLfPf.value || '').toLowerCase().trim();
            listaResultadosNeLfPf.innerHTML = '';
            document.getElementById('detalhesNeLfPf').style.display = 'none';
            empenhoSelecionadoLfPf = null;
            if (texto.length < 2) return;
            const baseEmpenhos = typeof window.baseEmpenhos !== 'undefined' ? window.baseEmpenhos : [];
            const resultados = baseEmpenhos.filter(function(e) { return (e.numEmpenho || '').toLowerCase().indexOf(texto) !== -1; }).slice(0, 15);
            if (resultados.length === 0) { listaResultadosNeLfPf.innerHTML = '<li style="padding:8px;color:#777;">Nenhuma NE encontrada.</li>'; return; }
            resultados.forEach(function(e) {
                const li = document.createElement('li');
                li.textContent = (e.numEmpenho || '') + ' - ' + (e.favorecido || '').substring(0, 30);
                li.onclick = function() {
                    empenhoSelecionadoLfPf = e;
                    document.getElementById('empenhoSelecionadoLfPf').textContent = e.numEmpenho || '';
                    document.getElementById('nePtreLfPf').textContent = e.ptres || '-';
                    document.getElementById('neFrLfPf').textContent = e.fr || '-';
                    document.getElementById('neNdLfPf').textContent = e.nd || '-';
                    document.getElementById('neValorLfPf').textContent = typeof formatarMoedaBR === 'function' ? formatarMoedaBR(parseFloat(e.valorGlobal) || 0) : (e.valorGlobal || '0');
                    document.getElementById('detalhesNeLfPf').style.display = 'block';
                    listaResultadosNeLfPf.innerHTML = '';
                };
                listaResultadosNeLfPf.appendChild(li);
            });
        }, 300) : function() {});
    }

    window.adicionarNeNaLfPf = function() {
        if (!empenhoSelecionadoLfPf) return;
        const numNE = empenhoSelecionadoLfPf.numEmpenho || '';
        if (empenhosVinculadosLfPf.some(function(n) { return (n.numNE || '') === numNE; })) { alert('Esta NE já está na lista.'); return; }
        empenhosVinculadosLfPf.push({
            numNE: numNE,
            valor: parseFloat(empenhoSelecionadoLfPf.valorGlobal) || 0,
            ptres: empenhoSelecionadoLfPf.ptres || '',
            fr: empenhoSelecionadoLfPf.fr || '',
            nd: empenhoSelecionadoLfPf.nd || ''
        });
        desenharTabelaNeLfPf();
        document.getElementById('detalhesNeLfPf').style.display = 'none';
        empenhoSelecionadoLfPf = null;
        buscaNeLfPf.value = '';
    };

    formLfPf.addEventListener('submit', async function(e) {
        e.preventDefault();
        formLfPf.dataset.dirty = '0';
        const id = document.getElementById('editIndexLfPf').value;
        const valorNum = typeof valorMoedaParaNumero === 'function' ? valorMoedaParaNumero(document.getElementById('lfValor').value) : (parseFloat(document.getElementById('lfValor').value) || 0);
        const dados = {
            lf: escapeHTML((document.getElementById('lfNum') || {}).value),
            dataCriacao: (document.getElementById('lfDataCriacao') || {}).value || '',
            valor: valorNum,
            tipoLiquidacao: (document.getElementById('lfTipoLiquidacao') || {}).value || 'RP',
            situacao: (document.getElementById('lfSituacao') || {}).value || 'Aguardando Priorização',
            ultimaAtualizacao: (document.getElementById('lfUltimaAtualizacao') || {}).value || '',
            pf: escapeHTML((document.getElementById('lfPf') || {}).value),
            rp: (document.getElementById('lfRp') || {}).value || 'Não Processado',
            fr: escapeHTML((document.getElementById('lfFr') || {}).value),
            vinculacao: escapeHTML((document.getElementById('lfVinculacao') || {}).value),
            origem: (document.getElementById('lfOrigem') || {}).value || 'LOA',
            empenhosVinculados: empenhosVinculadosLfPf,
            ativo: true
        };
        const userEmail = (auth.currentUser && auth.currentUser.email) ? auth.currentUser.email : '';
        mostrarLoading();
        try {
            if (id === '-1' || !id) {
                dados.createdAt = firebase.firestore.FieldValue.serverTimestamp();
                dados.createdBy = userEmail;
                dados.updatedAt = firebase.firestore.FieldValue.serverTimestamp();
                dados.updatedBy = userEmail;
                dados.historico = ['Registro criado em ' + new Date().toLocaleString('pt-BR') + ' por ' + userEmail];
                await db.collection('lfpf').add(dados);
            } else {
                const docRef = db.collection('lfpf').doc(id);
                const snap = await docRef.get();
                const historicoAntigo = (snap.exists && snap.data().historico) ? snap.data().historico : [];
                const novoHist = historicoAntigo.concat(['Alterado em ' + new Date().toLocaleString('pt-BR') + ' por ' + userEmail]);
                dados.updatedAt = firebase.firestore.FieldValue.serverTimestamp();
                dados.updatedBy = userEmail;
                dados.historico = novoHist;
                await docRef.update(dados);
            }
            voltarParaListaLfPf();
        } catch (err) { alert('Erro ao salvar: ' + (err.message || err)); }
        finally { esconderLoading(); }
    });

    formLfPf.querySelectorAll('input, select').forEach(function(el) {
        el.addEventListener('change', function() { formLfPf.dataset.dirty = '1'; });
        el.addEventListener('input', function() { formLfPf.dataset.dirty = '1'; });
    });

    window.exportarLfPf = function(formato) {
        if (typeof XLSX === 'undefined') return alert('Biblioteca XLSX não carregada.');
        try {
            const base = (typeof baseLfPf !== 'undefined' ? baseLfPf : []).filter(function(r) { return r.ativo !== false; });
            const dados = base.map(function(r) {
                return {
                    'N° do Pedido': r.lf,
                    'Data de Criação': r.dataCriacao,
                    'Valor (R$)': typeof formatarMoedaBR === 'function' ? formatarMoedaBR(r.valor || 0) : r.valor,
                    'Tipo de Liquidação': r.tipoLiquidacao,
                    'Situação': r.situacao,
                    'Última Atualização': r.ultimaAtualizacao,
                    'PF': r.pf,
                    'RP': r.rp,
                    'FR': r.fr,
                    'Vinculação': r.vinculacao,
                    'Origem': r.origem
                };
            });
            const ws = XLSX.utils.json_to_sheet(dados);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'LF_PF');
            XLSX.writeFile(wb, 'lf_pf.' + (formato === 'csv' ? 'csv' : 'xlsx'));
        } catch (err) { alert('Erro ao exportar.'); }
    };

    window.atualizarTabelaLfPf = atualizarTabelaLfPf;
    window.abrirFormularioLfPf = abrirFormularioLfPf;
})();
