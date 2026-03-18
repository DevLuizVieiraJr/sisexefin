// ==========================================
// NP (Nota de Pagamento) - NP x OP/OB
// ==========================================
(function() {
    const tabelaNp = document.getElementById('tabelaNp');
    if (!tabelaNp) return;

    const tbodyNp = document.getElementById('tbody-np');
    const tbodyNpItens = document.getElementById('tbodyNpItens');
    const buscaTabelaNpEl = document.getElementById('buscaTabelaNp');
    const editIndexNpEl = document.getElementById('editIndexNp');
    const formNp = document.getElementById('formNp');

    let paginaAtualNp = 1;
    let itensPorPaginaNp = parseInt((document.getElementById('itensPorPaginaNp') || {}).value || '10', 10);
    let termoBuscaNp = '';

    // Estado do formulário (itens OP/OB dentro da NP)
    let npItensAtual = []; // { op, ob, valorNp:number, valorOb:number, observacao:string }

    function normalizarTexto(s) {
        return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    }

    function formatarDataParaISO(val) {
        const s = String(val || '').trim();
        if (!s) return '';
        // dd/mm/yyyy
        const m1 = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
        if (m1) return m1[3] + '-' + m1[2] + '-' + m1[1];
        // yyyy-mm-dd
        const m2 = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (m2) return m2[1] + '-' + m2[2] + '-' + m2[3];
        return s;
    }

    function normalizarDataParaCampo(val) {
        const s = String(val || '').trim();
        if (!s) return '';
        const m1 = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (m1) return m1[3] + '/' + m1[2] + '/' + m1[1];
        // dd/mm/yyyy -> mantém
        if (s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)) return s;
        return s;
    }

    function valorParaNumero(val) {
        const s = String(val || '').trim();
        if (!s) return 0;
        // Remove qualquer coisa que não seja dígito, vírgula, ponto ou sinal.
        const cleaned = s.replace(/[^\d,.-]/g, '').replace(',', '.');
        const n = parseFloat(cleaned);
        return isNaN(n) ? 0 : n;
    }

    function getVal(row, keys) {
        for (let i = 0; i < keys.length; i++) {
            const v = row[keys[i]];
            if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim();
        }
        return '';
    }

    function opObResumo(doc) {
        const itens = Array.isArray(doc.documentosHabeis) ? doc.documentosHabeis : [];
        if (itens.length === 0) return '-';
        const primeiros = itens.slice(0, 3).map(it => (formatarFinal12(it.op) || '-') + '/' + (formatarFinal12(it.ob) || '-'));
        const extra = itens.length > 3 ? ' +' + (itens.length - 3) + '...' : '';
        return primeiros.join(', ') + extra;
    }

    function qtdTC(doc) {
        const arr = Array.isArray(doc.titulosVinculados) ? doc.titulosVinculados : [];
        return arr.length;
    }

    // UI: mostra apenas os últimos 12 caracteres (sem alterar o valor real salvo).
    function formatarFinal12(s) {
        const v = String(s || '').trim();
        if (!v) return '';
        return v.length > 12 ? v.slice(-12) : v;
    }

    // DH (Documento Habil) tem estrutura completa:
    // UG (6) + Gestao (5) + Ano (4) + Tipo (2: NP/OP/OB/...) + Numero (6)  => 23 chars
    // No UI você digita/visualiza somente o sufixo de 12 (Ano+Tipo+Numero).
    const UG_PADRAO = '741000';
    const GESTAO_PADRAO = '00001';
    const PREFIX_DH_11_PADRAO = UG_PADRAO + GESTAO_PADRAO;

    function completarDHId(valor, tipoEsperado, prefix11) {
        const s = String(valor || '').trim();
        if (!s) return '';
        // Já é completo (ou vem de base/BD): preserva.
        if (s.length > 12) return s;

        // Se o BD (np) já estiver usando apenas o sufixo (12 chars) como docId/valores,
        // não completamos para não quebrar compatibilidade.
        const base = (typeof baseNp !== 'undefined' ? baseNp : []);
        const modoCompleto = base.length === 0 ? true : base.some(d => {
            const v = (d && (d.id || d.np)) ? String(d.id || d.np) : '';
            return v.trim().length > 12;
        });
        if (!modoCompleto) return s;

        const prefixFromBase = base.length
            ? String((base[0] && (base[0].id || base[0].np)) || '').trim().slice(0, 11)
            : '';

        const p = String(prefix11 || prefixFromBase || PREFIX_DH_11_PADRAO).trim();
        if (p.length < 11) return '';

        const m = s.match(/^(\d{4})([A-Za-z]{2})(\d{6})$/);
        if (!m) return '';
        const ano = m[1];
        const tipo = m[2].toUpperCase();
        const num = m[3];
        if (tipoEsperado && tipo !== tipoEsperado) return '';
        return p + ano + tipo + num;
    }

    function completarNpDocId(npValor, prefix11) {
        return completarDHId(npValor, 'NP', prefix11);
    }

    function completarOpDocId(opValor, prefix11) {
        return completarDHId(opValor, 'OP', prefix11);
    }

    function completarObDocId(obValor, prefix11) {
        return completarDHId(obValor, 'OB', prefix11);
    }

    function permissoesAdmin() {
        return typeof permissoesEmCache !== 'undefined' && permissoesEmCache.includes('acesso_admin');
    }

    // Matriz de permissões (igual Firestore):
    // - Create/Update: titulos_inserir ou titulos_editar (ou acesso_admin)
    // - Delete permanente: apenas acesso_admin
    function podeNPAlterar() {
        if (permissoesAdmin()) return true;
        return (typeof permissoesEmCache !== 'undefined') && (
            permissoesEmCache.includes('titulos_inserir') || permissoesEmCache.includes('titulos_editar')
        );
    }

    function gerarBotoesAcoesNp(doc) {
        const podeAlterar = podeNPAlterar();
        const podeExcluirPerm = permissoesAdmin();
        if (!podeAlterar && !podeExcluirPerm) return '';
        const id = doc && (doc.id || doc.np) ? String(doc.id || doc.np) : '';
        if (!id) return '';
        const safeId = escapeHTML(id);
        let html = '';
        if (podeAlterar) {
            html += '<button type="button" class="btn-icon btn-editar-np" data-id="' + safeId + '" title="Editar">✏️</button>';
            html += '<button type="button" class="btn-icon btn-inativar-np" data-id="' + safeId + '" title="Inativar/Cancelar">🚫</button>';
        }
        if (podeExcluirPerm) {
            html += '<button type="button" class="btn-icon btn-apagar-np-permanente" data-id="' + safeId + '" title="Excluir permanentemente">🗑️</button>';
        }
        return html;
    }

    function atualizarTabelaNp() {
        if (!tbodyNp) return;
        tbodyNp.innerHTML = '';

        const base = (typeof baseNp !== 'undefined' ? baseNp : []).filter(d => d && d.ativo !== false);
        const q = normalizarTexto(termoBuscaNp);

        let lista = base;
        if (q) {
            lista = base.filter(d => {
                const npTxt = normalizarTexto(formatarFinal12(d.np || d.id || ''));
                const resumo = normalizarTexto(opObResumo(d));
                return npTxt.includes(q) || resumo.includes(q);
            });
        }

        const totalReg = lista.length;
        const totalPag = Math.max(1, Math.ceil(totalReg / itensPorPaginaNp));
        paginaAtualNp = Math.min(Math.max(1, paginaAtualNp), totalPag);

        const inicio = (paginaAtualNp - 1) * itensPorPaginaNp;
        const itens = lista.slice(inicio, inicio + itensPorPaginaNp);

        if (itens.length === 0) {
            tbodyNp.innerHTML = '<tr><td colspan="6" style="text-align:center;">Nenhum registro encontrado.</td></tr>';
        } else {
            itens.forEach(doc => {
                const itensH = Array.isArray(doc.documentosHabeis) ? doc.documentosHabeis : [];
                const tr = document.createElement('tr');
                tr.innerHTML =
                    '<td><strong>' + escapeHTML(formatarFinal12(doc.np || doc.id || '-')) + '</strong></td>' +
                    '<td>' + escapeHTML(doc.dataLiquidacao || '-') + '</td>' +
                    '<td>' + escapeHTML(String(itensH.length)) + '</td>' +
                    '<td>' + escapeHTML(opObResumo(doc)) + '</td>' +
                    '<td>' + escapeHTML(String(qtdTC(doc))) + '</td>' +
                    '<td>' + gerarBotoesAcoesNp(doc) + '</td>';
                tbodyNp.appendChild(tr);
            });
        }

        const mostrando = document.getElementById('mostrandoNp');
        if (mostrando) {
            const mostrandoDe = totalReg === 0 ? 0 : (inicio + 1);
            const mostrando = totalReg === 0 ? 0 : Math.min(totalReg, inicio + itensPorPaginaNp);
            mostrando.textContent = 'Mostrando ' + mostrando + ' de ' + totalReg + ' registros';
        }
        const infoPagina = document.getElementById('infoPaginaNp');
        if (infoPagina) infoPagina.textContent = 'Página ' + paginaAtualNp + ' de ' + totalPag;
    }

    window.atualizarTabelaNp = atualizarTabelaNp;
    window.mudarTamanhoPaginaNp = function() {
        itensPorPaginaNp = parseInt(document.getElementById('itensPorPaginaNp')?.value || '10', 10);
        paginaAtualNp = 1;
        atualizarTabelaNp();
    };
    window.mudarPaginaNp = function(direcao) {
        const base = (typeof baseNp !== 'undefined' ? baseNp : []).filter(d => d && d.ativo !== false);
        const totalReg = base.length;
        const totalPag = Math.max(1, Math.ceil(totalReg / itensPorPaginaNp));
        if (direcao === -1) paginaAtualNp = Math.max(1, paginaAtualNp - 1);
        else if (direcao === 1) paginaAtualNp = Math.min(totalPag, paginaAtualNp + 1);
        else if (typeof direcao === 'number') paginaAtualNp = Math.max(1, Math.min(totalPag, paginaAtualNp + direcao));
        atualizarTabelaNp();
    };

    buscaTabelaNpEl?.addEventListener('input', function() {
        termoBuscaNp = this.value || '';
        paginaAtualNp = 1;
        atualizarTabelaNp();
    });

    // =========================
    // CRUD: Ações na listagem
    // =========================
    tbodyNp?.addEventListener('click', function(e) {
        const btnEditar = e.target.closest('.btn-editar-np');
        const btnInativar = e.target.closest('.btn-inativar-np');
        const btnApagar = e.target.closest('.btn-apagar-np-permanente');
        if (btnEditar) editarNp(btnEditar.getAttribute('data-id'));
        if (btnInativar) inativarNp(btnInativar.getAttribute('data-id'));
        if (btnApagar) excluirPermanenteNp(btnApagar.getAttribute('data-id'));
    });

    // =========================
    // CRUD: Formulário
    // =========================
    function ativarTabNp(i) {
        document.querySelectorAll('#tabsNp .tab-ne').forEach(function(t, j) { t.classList.toggle('ativo', j === i); });
        document.querySelectorAll('[id^="panelNp"]').forEach(function(p, j) { p.classList.toggle('visivel', j === i); });
    }

    function limparAuditoriaNp() {
        const ids = ['audNpDataCriacao', 'audNpUsuarioCriador', 'audNpDataAlteracao', 'audNpUsuarioAlteracao', 'audNpHistorico'];
        ids.forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    }

    function preencherAuditoriaNp(r) {
        const v = (x) => {
            if (!x) return '-';
            if (x.toDate) return x.toDate().toLocaleString('pt-BR');
            return x;
        };
        const audCriacao = document.getElementById('audNpDataCriacao');
        const audUsuarioCriador = document.getElementById('audNpUsuarioCriador');
        const audAlteracao = document.getElementById('audNpDataAlteracao');
        const audUsuarioAlteracao = document.getElementById('audNpUsuarioAlteracao');
        const audHistorico = document.getElementById('audNpHistorico');
        if (audCriacao) audCriacao.value = v(r.createdAt);
        if (audUsuarioCriador) audUsuarioCriador.value = r.createdBy || '-';
        if (audAlteracao) audAlteracao.value = v(r.updatedAt);
        if (audUsuarioAlteracao) audUsuarioAlteracao.value = r.updatedBy || '-';
        if (audHistorico) audHistorico.value = Array.isArray(r.historico) ? r.historico.join('\n') : (r.historico || '-');
    }

    function desenharTabelaNpItens() {
        if (!tbodyNpItens) return;
        tbodyNpItens.innerHTML = '';
        npItensAtual.forEach((it, idx) => {
            const valorNpTxt = typeof formatarMoedaBR === 'function' ? formatarMoedaBR(Number(it.valorNp || 0)) : String(it.valorNp || 0);
            const valorObTxt = typeof formatarMoedaBR === 'function' ? formatarMoedaBR(Number(it.valorOb || 0)) : String(it.valorOb || 0);
            const tr = document.createElement('tr');
            tr.innerHTML =
                '<td>' + escapeHTML(formatarFinal12(it.op) || '-') + '</td>' +
                '<td>' + escapeHTML(formatarFinal12(it.ob) || '-') + '</td>' +
                '<td>R$ ' + escapeHTML(valorNpTxt || '0') + '</td>' +
                '<td>R$ ' + escapeHTML(valorObTxt || '0') + '</td>' +
                '<td>' + escapeHTML(it.observacao || '') + '</td>' +
                '<td><button type="button" class="btn-icon btn-rm-np-item" data-index="' + idx + '" title="Remover">✕</button></td>';
            tbodyNpItens.appendChild(tr);
        });
    }

    tbodyNpItens?.addEventListener('click', function(e) {
        const btnRm = e.target.closest('.btn-rm-np-item');
        if (!btnRm) return;
        const idx = parseInt(btnRm.getAttribute('data-index') || '-1', 10);
        if (idx >= 0 && idx < npItensAtual.length) {
            npItensAtual.splice(idx, 1);
            desenharTabelaNpItens();
            if (formNp) formNp.dataset.dirty = '1';
        }
    });

    function limparFormNp() {
        npItensAtual = [];
        if (editIndexNpEl) editIndexNpEl.value = '-1';
        const npNumFullEl = document.getElementById('npNumFull');
        if (npNumFullEl) npNumFullEl.value = '';
        const npNumEl = document.getElementById('npNum');
        if (npNumEl) {
            npNumEl.value = '';
            npNumEl.disabled = false;
            npNumEl.readOnly = false;
        }
        const dataEl = document.getElementById('npDataLiquidacao');
        if (dataEl) dataEl.value = '';

        const itemFields = ['npItemOp', 'npItemOb', 'npItemValorNp', 'npItemValorOb', 'npItemObs'];
        itemFields.forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });

        desenharTabelaNpItens();
        limparAuditoriaNp();
        if (formNp) formNp.dataset.dirty = '0';
    }

    function voltarParaListaNp() {
        if (formNp && formNp.dataset.dirty === '1' && !confirm('Deseja sair? As alterações não salvas serão perdidas.')) return;
        const telaLista = document.getElementById('tela-lista-np');
        const telaForm = document.getElementById('tela-formulario-np');
        if (telaForm) telaForm.style.display = 'none';
        if (telaLista) telaLista.style.display = 'block';
        if (typeof atualizarTabelaNp === 'function') atualizarTabelaNp();
    }
    window.voltarParaListaNp = voltarParaListaNp;

    function abrirFormularioNp(isEdit) {
        const telaLista = document.getElementById('tela-lista-np');
        const telaForm = document.getElementById('tela-formulario-np');
        if (telaLista) telaLista.style.display = 'none';
        if (telaForm) telaForm.style.display = 'block';

        if (!isEdit && !podeNPAlterar()) {
            alert('Acesso negado. Sem permissão para cadastrar NP.');
            return;
        }
        if (!isEdit) {
            limparFormNp();
            ativarTabNp(0);
        } else {
            ativarTabNp(0);
        }
    }
    window.abrirFormularioNp = abrirFormularioNp;

    function editarNp(id) {
        if (!podeNPAlterar()) return alert('Acesso negado. Sem permissão para editar NP.');
        if (!id) return;
        const r = (typeof baseNp !== 'undefined' ? baseNp : []).find(item => item && String(item.id) === String(id));
        if (!r) {
            alert('Registro NP não encontrado.');
            return;
        }
        abrirFormularioNp(true);
        if (editIndexNpEl) editIndexNpEl.value = r.id || r.np || '';

        const npNumEl = document.getElementById('npNum');
        const npNumFullEl = document.getElementById('npNumFull');
        if (npNumEl) {
            const full = r.np || r.id || '';
            if (npNumFullEl) npNumFullEl.value = full;
            npNumEl.value = formatarFinal12(full);
            npNumEl.disabled = true; // evita que o docId seja desassociado
            npNumEl.readOnly = true;
        }
        const dataEl = document.getElementById('npDataLiquidacao');
        if (dataEl) dataEl.value = normalizarDataParaCampo(r.dataLiquidacao || '');

        npItensAtual = Array.isArray(r.documentosHabeis) ? r.documentosHabeis.map(it => ({
            op: String(it.op || '').trim(),
            ob: String(it.ob || '').trim(),
            valorNp: typeof it.valorNp === 'number' ? it.valorNp : valorParaNumero(it.valorNp || ''),
            valorOb: typeof it.valorOb === 'number' ? it.valorOb : valorParaNumero(it.valorOb || ''),
            observacao: String(it.observacao || it.Observacao || '').trim()
        })) : [];

        desenharTabelaNpItens();
        preencherAuditoriaNp(r);
        if (formNp) formNp.dataset.dirty = '0';
    }
    window.editarNp = editarNp;

    async function inativarNp(id) {
        if (!podeNPAlterar()) return alert('Acesso negado. Sem permissão para inativar NP.');
        if (!id) return;
        if (!confirm('Deseja inativar/cancelar este registro? O registro permanecerá no sistema com situação Cancelado.')) return;
        mostrarLoading('Carregando...');
        try {
            const userEmail = (auth.currentUser && auth.currentUser.email) ? auth.currentUser.email : '';
            const r = (typeof baseNp !== 'undefined' ? baseNp : []).find(item => item && String(item.id) === String(id));
            const historicoAntigo = (r && Array.isArray(r.historico)) ? r.historico : [];
            const novoHist = historicoAntigo.concat(['Alterado em ' + new Date().toLocaleString('pt-BR') + ' por ' + userEmail]);

            await db.collection('np').doc(id).update({
                ativo: false,
                situacao: 'Cancelado',
                updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                updatedBy: userEmail,
                historico: novoHist
            });
        } catch (err) {
            alert('Erro ao inativar.');
        } finally {
            esconderLoading();
            atualizarTabelaNp();
        }
    }
    window.inativarNp = inativarNp;

    async function excluirPermanenteNp(id) {
        if (!permissoesAdmin()) return alert('Acesso negado. Apenas administradores podem excluir.');
        if (!id) return;
        if (!confirm('Excluir PERMANENTEMENTE este registro? Esta ação não pode ser desfeita.')) return;
        mostrarLoading('Carregando...');
        try {
            await db.collection('np').doc(id).delete();
        } catch (err) {
            alert('Acesso negado ou erro ao excluir.');
        } finally {
            esconderLoading();
            atualizarTabelaNp();
        }
    }
    window.excluirPermanenteNp = excluirPermanenteNp;

    window.adicionarItemNp = function adicionarItemNp() {
        const opEl = document.getElementById('npItemOp');
        const obEl = document.getElementById('npItemOb');
        const valorNpEl = document.getElementById('npItemValorNp');
        const valorObEl = document.getElementById('npItemValorOb');
        const obsEl = document.getElementById('npItemObs');
        if (!opEl || !obEl) return;

        const op = (opEl.value || '').trim();
        const ob = (obEl.value || '').trim();
        if (!op || !ob) {
            alert('Informe OP e OB para adicionar o item.');
            return;
        }

        const valorNp = valorParaNumero(valorNpEl?.value || 0);
        const valorOb = valorParaNumero(valorObEl?.value || 0);
        const observacao = (obsEl?.value || '').trim();

        npItensAtual.push({ op, ob, valorNp, valorOb, observacao });
        if (formNp) formNp.dataset.dirty = '1';

        opEl.value = '';
        obEl.value = '';
        if (valorNpEl) valorNpEl.value = '';
        if (valorObEl) valorObEl.value = '';
        if (obsEl) obsEl.value = '';

        desenharTabelaNpItens();
    };

    // Eventos de tab e dirty-state
    document.querySelectorAll('#tabsNp .tab-ne')?.forEach(function(tab) {
        tab.addEventListener('click', function() {
            const i = parseInt(tab.getAttribute('data-tab') || '0', 10);
            if (!isNaN(i)) ativarTabNp(i);
        });
    });

    formNp?.querySelectorAll('input, select, textarea')?.forEach(function(el) {
        el.addEventListener('change', function() { if (formNp) formNp.dataset.dirty = '1'; });
        el.addEventListener('input', function() { if (formNp) formNp.dataset.dirty = '1'; });
    });

    // Exibe apenas o sufixo de 12 no campo NP, mas preserva o valor completo no hidden `npNumFull`.
    const npNumInput = document.getElementById('npNum');
    const npNumFullInput = document.getElementById('npNumFull');
    if (npNumInput && npNumFullInput) {
        npNumInput.addEventListener('blur', function() {
            if (npNumInput.disabled || npNumInput.readOnly) return;
            const raw = String(npNumInput.value || '').trim();
            if (!raw) return;
            npNumFullInput.value = raw;
            npNumInput.value = formatarFinal12(raw);
            if (formNp) formNp.dataset.dirty = '1';
        });
    }

    // Alinha a UI com a matriz de permissões do Firestore.
    // (Mesmo que os botões fiquem visíveis via `op_ler`, bloqueamos/desabilitamos se não puder alterar NP.)
    const btnNovaNp = document.getElementById('btnNovaNp');
    const btnSalvarNp = document.getElementById('btnSalvarNp');
    const fileImportNpUi = document.getElementById('fileImportNp');
    if (btnNovaNp && !podeNPAlterar()) btnNovaNp.style.display = 'none';
    if (btnSalvarNp && !podeNPAlterar()) btnSalvarNp.style.display = 'none';
    if (fileImportNpUi && !podeNPAlterar()) fileImportNpUi.disabled = true;

    formNp?.addEventListener('submit', async function(e) {
        e.preventDefault();
        if (!podeNPAlterar()) return alert('Acesso negado. Sem permissão para salvar NP.');

        const idEdit = editIndexNpEl ? editIndexNpEl.value : '-1';
        const npNumVisible = (document.getElementById('npNum') || {}).value ? String((document.getElementById('npNum') || {}).value).trim() : '';
        const npNumFullEl = document.getElementById('npNumFull');
        const npNumFull = npNumFullEl && npNumFullEl.value ? String(npNumFullEl.value).trim() : '';
        // Para edição, usamos sempre o ID completo (hidden). Para criação, usamos o hidden se preenchido.
        const npDocIdRaw = (idEdit && idEdit !== '-1') ? String(idEdit).trim() : (npNumFull || npNumVisible);
        if (!npDocIdRaw) { alert('Informe o NP.'); return; }

        const npDocId = completarNpDocId(npDocIdRaw);
        if (!npDocId) { alert('NP inválido. Formato esperado: AAAAxxNNNNNN (sufixo de 12).'); return; }

        const prefix11 = (npDocId.length >= 23) ? npDocId.slice(0, 11) : PREFIX_DH_11_PADRAO;

        const dataLiqCampo = document.getElementById('npDataLiquidacao');
        const isoDataLiq = formatarDataParaISO(dataLiqCampo ? dataLiqCampo.value : '');

        if (!Array.isArray(npItensAtual) || npItensAtual.length === 0) {
            alert('Adicione pelo menos 1 item (OP/OB).');
            return;
        }

        const userEmail = (auth.currentUser && auth.currentUser.email) ? auth.currentUser.email : '';
        mostrarLoading('Carregando...');
        try {
            const documentosHabeis = npItensAtual.map(it => {
                const opFull = completarOpDocId(it.op, prefix11);
                const obFull = completarObDocId(it.ob, prefix11);
                return {
                    op: opFull,
                    ob: obFull,
                    valorNp: Number(it.valorNp || 0),
                    valorOb: Number(it.valorOb || 0),
                    observacao: String(it.observacao || '').trim()
                };
            });

            const itensInvalidos = documentosHabeis.some(d =>
                !d.op || !d.ob
            );
            if (itensInvalidos) {
                alert('OP/OB inválidos. Formato esperado: AAAAxxNNNNNN (sufixo de 12).');
                return;
            }

            const docRef = db.collection('np').doc(npDocId);
            const rBase = (typeof baseNp !== 'undefined' ? baseNp : []).find(item => item && String(item.id) === String(npDocId));
            // Se já existe registro para aquele NP, tratamos como edição para evitar sobrescrita indevida.
            const isEdit = (idEdit && idEdit !== '-1') || !!rBase;

            let historicoAntigo = Array.isArray(rBase && rBase.historico) ? rBase.historico.slice() : [];
            if (!isEdit) historicoAntigo = [];
            const histEntry = (new Date().toLocaleString('pt-BR'));

            const dadosBase = {
                np: npDocId,
                dataLiquidacao: isoDataLiq || '',
                documentosHabeis: documentosHabeis,
                ativo: true,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                updatedBy: userEmail
            };

            if (!isEdit) {
                dadosBase.createdAt = firebase.firestore.FieldValue.serverTimestamp();
                dadosBase.createdBy = userEmail;
                dadosBase.historico = ['Registro criado em ' + histEntry + ' por ' + userEmail];
                await docRef.set(dadosBase, { merge: false });
            } else {
                dadosBase.historico = historicoAntigo.concat(['Alterado em ' + histEntry + ' por ' + userEmail]);
                await docRef.set(dadosBase, { merge: true });
            }

            voltarParaListaNp();
        } catch (err) {
            alert('Erro ao tentar salvar dados.');
        } finally {
            esconderLoading();
            if (formNp) formNp.dataset.dirty = '0';
        }
    });

    // Modelo CSV de importação
    window.downloadModeloNP = function() {
        const csv = 'NP,DATA LIQUIDAÇÃO,OP,OB,VALOR_NP,VALOR_OB,LISTA_TC_VINCULADOS,OBSERVACAO\n' +
            '2026NP000001,2026-01-08,2026OP000049,2026OB000050,,,,' ;
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'modelo-np-op-ob.csv';
        a.click();
        URL.revokeObjectURL(a.href);
    };

    // Importador NP
    const fileImportNp = document.getElementById('fileImportNp');
    if (fileImportNp) {
        function verificarAdmin() {
            if (!podeNPAlterar()) {
                alert('Acesso negado. Sem permissão para importar NP.');
                return false;
            }
            return true;
        }

        function readFileAsArrayBuffer(file) {
            return new Promise(function(resolve, reject) {
                const reader = new FileReader();
                reader.onload = e => resolve(e.target.result);
                reader.onerror = () => reject(new Error('Erro ao ler ficheiro'));
                reader.readAsArrayBuffer(file);
            });
        }

        async function salvarUltimoImport(modulo) {
            try {
                await db.collection('config').doc('imports').set(
                    { [modulo]: firebase.firestore.FieldValue.serverTimestamp() },
                    { merge: true }
                );
                const snap = await db.collection('config').doc('imports').get();
                if (snap.exists && typeof atualizarUltimoImportUI === 'function') atualizarUltimoImportUI(snap.data());
            } catch (e) { console.warn('Erro ao salvar último import:', e); }
        }

        fileImportNp.addEventListener('change', async function(e) {
            const file = e.target.files[0];
            if (!file) return;
            if (!verificarAdmin()) { e.target.value = ''; return; }
            if (typeof XLSX === 'undefined') { e.target.value = ''; return alert('Biblioteca XLSX não carregada.'); }

            const importAbort = { aborted: false };
            if (typeof window.__setLoadingAbortFn === 'function') {
                window.__setLoadingAbortFn(function() { importAbort.aborted = true; });
            }

            mostrarLoading('Carregando...');
            try {
                const data = await readFileAsArrayBuffer(file);
                const wb = XLSX.read(data, { type: 'array' });
                const firstSheet = wb.Sheets[wb.SheetNames[0]];
                const rows = XLSX.utils.sheet_to_json(firstSheet, { defval: '', raw: false });

                // Deduplica itens do CSV para contar/atualizar por NP+OP+OB
                const itensImportadosPorChave = new Map(); // chave -> itemImport
                const isoPorNp = new Map(); // npNorm -> isoData (primeiro não-vazio)
                const npKeysCsv = new Set(); // registra NP mesmo se vier sem OP/OB (somente NP é obrigatório)

                let erros = 0;

                for (let i = 0; i < rows.length; i++) {
                    if (importAbort.aborted) break;
                    const row = rows[i];

                    const npRaw = getVal(row, ['NP', 'np']);
                    const npNormRaw = String(npRaw || '').trim();
                    if (!npNormRaw) { erros++; continue; }
                    const npNorm = completarNpDocId(npNormRaw);
                    if (!npNorm) { erros++; continue; }
                    npKeysCsv.add(npNorm);

                    const dataLiq = getVal(row, ['DATA LIQUIDAÇÃO', 'DATA LIQUIDACAO', 'Data Liquidação', 'dataLiquidacao', 'Dt Liquidação', 'DT_LIQ']);
                    const iso = formatarDataParaISO(dataLiq);
                    if (iso && !isoPorNp.has(npNorm)) isoPorNp.set(npNorm, iso);

                    const op = getVal(row, ['OP', 'op']);
                    const ob = getVal(row, ['OB', 'ob']);
                    const valorNp = valorParaNumero(getVal(row, ['VALOR_NP', 'valorNp', 'VALOR NP', 'Valor NP', 'VALOR']));
                    const valorOb = valorParaNumero(getVal(row, ['VALOR_OB', 'valorOb', 'VALOR OB', 'Valor OB']));
                    const observacao = getVal(row, ['OBSERVACAO', 'OBSERVAÇÃO', 'observacao', 'observação']);

                    // Somente NP é obrigatório, então se OP/OB vier vazio, não criamos item.
                    if (!op || !ob) continue;

                    const prefix11 = (npNorm.length >= 23) ? npNorm.slice(0, 11) : PREFIX_DH_11_PADRAO;
                    const opFull = completarOpDocId(op, prefix11);
                    const obFull = completarObDocId(ob, prefix11);
                    if (!opFull || !obFull) { erros++; continue; }

                    const chave = npNorm + '|' + opFull + '|' + obFull;
                    itensImportadosPorChave.set(chave, {
                        npNorm: npNorm,
                        op: opFull,
                        ob: obFull,
                        valorNp: valorNp || 0,
                        valorOb: valorOb || 0,
                        observacao: observacao || ''
                    });
                }

                // Base atual (para identificar repetidos) - vem do onSnapshot
                const baseAll = (typeof baseNp !== 'undefined' ? baseNp : []);
                const mapBasePorNp = new Map();
                baseAll.forEach(doc => {
                    const k = String((doc && (doc.np || doc.id)) || '').trim();
                    if (k) mapBasePorNp.set(k, doc);
                });

                // Mudanças por NP (aplica regra: em repetidos, atualiza só OP, OB, Valor_NP, Valor_OB)
                const docsChanges = new Map(); // npNorm -> { isNew, docBase, documentosHabeis:Array }
                function ensureDocChange(npNorm) {
                    if (docsChanges.has(npNorm)) return docsChanges.get(npNorm);
                    const docBase = mapBasePorNp.get(npNorm) || null;
                    const documentosHabeis = docBase && Array.isArray(docBase.documentosHabeis)
                        ? docBase.documentosHabeis.slice()
                        : [];
                    const c = { npNorm, isNew: !docBase, docBase, documentosHabeis, changed: false };
                    docsChanges.set(npNorm, c);
                    return c;
                }

                let importados = 0;
                let atualizados = 0;
                const userEmail = (auth.currentUser && auth.currentUser.email) ? auth.currentUser.email : '';
                const histMsg = 'Importação em ' + new Date().toLocaleString('pt-BR') + ' por ' + userEmail;

                // Garante que uma NP nova será criada mesmo sem itens (quando somente NP veio preenchido).
                for (const npNorm of npKeysCsv.values()) {
                    ensureDocChange(npNorm);
                }

                for (const item of itensImportadosPorChave.values()) {
                    if (importAbort.aborted) break;
                    const change = ensureDocChange(item.npNorm);
                    const documentos = change.documentosHabeis;

                    const idx = documentos.findIndex(it =>
                        String(it.op || '').trim() === item.op &&
                        String(it.ob || '').trim() === item.ob
                    );

                    if (idx >= 0) {
                        // Atualiza SOMENTE os campos pedidos em repetidos
                        documentos[idx].op = item.op;
                        documentos[idx].ob = item.ob;
                        documentos[idx].valorNp = item.valorNp;
                        documentos[idx].valorOb = item.valorOb;
                        change.changed = true;
                        atualizados++;
                    } else {
                        documentos.push({
                            op: item.op,
                            ob: item.ob,
                            valorNp: item.valorNp,
                            valorOb: item.valorOb,
                            observacao: item.observacao || ''
                        });
                        change.changed = true;
                        importados++;
                    }
                }

                // Persistência (parcial se houver interrupção)
                for (const change of docsChanges.values()) {
                    if (importAbort.aborted) break;
                    if (!change.isNew && !change.changed) continue;

                    const docRef = db.collection('np').doc(change.npNorm);
                    if (change.isNew) {
                        await docRef.set({
                            np: change.npNorm,
                            dataLiquidacao: isoPorNp.get(change.npNorm) || '',
                            documentosHabeis: change.documentosHabeis,
                            ativo: true,
                            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                            createdBy: userEmail,
                            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                            updatedBy: userEmail,
                            historico: ['Registro criado em ' + new Date().toLocaleString('pt-BR') + ' por ' + userEmail]
                        });
                    } else {
                        const historicoAntigo = (change.docBase && Array.isArray(change.docBase.historico)) ? change.docBase.historico : [];
                        const novoHist = historicoAntigo.concat([histMsg]);
                        await docRef.set({
                            documentosHabeis: change.documentosHabeis,
                            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                            updatedBy: userEmail,
                            historico: novoHist
                        }, { merge: true });
                    }
                }

                const resumo = (importAbort.aborted ? 'Interrompido. ' : '') +
                    'Importados ' + importados + '; Atualizados ' + atualizados + '; Erros ' + erros;
                alert(resumo);
                await salvarUltimoImport('np');
            } catch (err) {
                alert('Erro ao tentar carregar dados.');
            } finally {
                esconderLoading();
                e.target.value = '';
            }
        });
    }

    // Coloca os valores monetários já no padrão visual do app (caso o admin/utils já faça isso)
    // Obs.: se a máscara não estiver disponível, o valor é salvo via `valorParaNumero` mesmo assim.
})();

