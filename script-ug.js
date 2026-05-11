// ==========================================
// MÓDULO: UNIDADE GESTORA (UG)
// ==========================================
(function() {
    if (!document.getElementById('tabelaUG')) return;

    const formUG = document.getElementById('formUG');
    const tabelaUGBody = document.querySelector('#tabelaUG tbody');
    const inputComimsup = document.getElementById('ugComimsup');
    const listaResultadosComimsup = document.getElementById('listaResultadosComimsupUG');
    let sugestoesComimsup = [];
    let requestBuscaComimsup = 0;

    document.getElementById('buscaTabelaUG').addEventListener('input', debounce(() => {
        termoBuscaUG = document.getElementById('buscaTabelaUG').value.toLowerCase();
        paginaAtualUG = 1;
        atualizarTabelaUG();
    }));

    const debouncedBuscarComimsup = debounce(function() {
        buscarSugestoesComimsup(inputComimsup.value || '');
    }, 300);

    function abrirFormularioUG(isEdit) {
        if (!isEdit) {
            formUG.reset();
            document.getElementById('editIndexUG').value = -1;
            limparSugestoesComimsup();
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
                (u.indicativoNaval && String(u.indicativoNaval).toLowerCase().includes(q)) ||
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
            tabelaUGBody.innerHTML = '<tr><td colspan="6" style="text-align:center;">Nenhum registro encontrado.</td></tr>';
        } else {
            itensExibidos.forEach((u) => {
                const tr = document.createElement('tr');
                const acoesHTML = typeof gerarBotoesAcao === 'function' ? gerarBotoesAcao(u.id, 'ug', u) : '';
                tr.innerHTML = `<td>${escapeHTML(u.codigo || '-')}</td><td>${escapeHTML((u.indicativoNaval || '-').substring(0, 25))}</td><td>${escapeHTML((u.nome || '-').substring(0, 40))}${(u.nome || '').length > 40 ? '...' : ''}</td><td>${escapeHTML((u.comimsup || '-').substring(0, 25))}</td><td>${escapeHTML((u.contato || '-').substring(0, 30))}</td><td>${acoesHTML}</td>`;
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
            document.getElementById('ugIndicativoNaval').value = u.indicativoNaval || '';
            document.getElementById('ugNome').value = u.nome || '';
            document.getElementById('ugComimsup').value = u.comimsup || '';
            document.getElementById('ugContato').value = u.contato || '';
            limparSugestoesComimsup();
        }
    }

    function limparSugestoesComimsup() {
        sugestoesComimsup = [];
        if (listaResultadosComimsup) listaResultadosComimsup.innerHTML = '';
    }

    function renderizarSugestoesComimsup() {
        if (!listaResultadosComimsup) return;
        if (!sugestoesComimsup.length) {
            listaResultadosComimsup.innerHTML = '';
            return;
        }
        listaResultadosComimsup.innerHTML = sugestoesComimsup.map((u, idx) => {
            const codigo = escapeHTML(String(u.codigo || ''));
            const nome = escapeHTML(String(u.nome || ''));
            return `<li class="autocomplete-item" data-index="${idx}" role="option">${codigo} - ${nome || '-'}</li>`;
        }).join('');
    }

    function filtrarResultadoBuscaComimsup(docs) {
        const codigoAtual = String(document.getElementById('ugCodigo').value || '').trim().toLowerCase();
        const map = {};
        (docs || []).forEach((doc) => {
            const data = doc && doc.data ? doc.data() : {};
            const codigo = String(data.codigo || '').trim();
            if (!codigo) return;
            if (String(data.ativo) === 'false' || data.ativo === false) return;
            if (codigoAtual && codigo.toLowerCase() === codigoAtual) return;
            const key = codigo.toLowerCase();
            if (!map[key]) map[key] = { codigo: codigo, nome: data.nome || '' };
        });
        return Object.keys(map).map(k => map[k]).sort((a, b) => String(a.codigo).localeCompare(String(b.codigo)));
    }

    async function buscarSugestoesComimsup(termoBruto) {
        const termo = String(termoBruto || '').trim();
        if (termo.length < 2) {
            limparSugestoesComimsup();
            return;
        }
        const token = ++requestBuscaComimsup;
        const limite = 10;
        try {
            const consultas = [];
            consultas.push(db.collection('unidadesGestoras')
                .where('codigo', '>=', termo)
                .where('codigo', '<=', termo + '\uf8ff')
                .limit(limite)
                .get());
            consultas.push(db.collection('unidadesGestoras')
                .where('nome', '>=', termo)
                .where('nome', '<=', termo + '\uf8ff')
                .limit(limite)
                .get());
            const snaps = await Promise.all(consultas);
            if (token !== requestBuscaComimsup) return;
            const docs = [];
            snaps.forEach(s => s.docs.forEach(d => docs.push(d)));
            sugestoesComimsup = filtrarResultadoBuscaComimsup(docs).slice(0, limite);
            renderizarSugestoesComimsup();
        } catch (err) {
            limparSugestoesComimsup();
        }
    }

    async function validarComimsup(codigoComimsup, codigoAtual) {
        const codigoPai = String(codigoComimsup || '').trim();
        if (!codigoPai) return true;
        if (codigoAtual && codigoPai.toLowerCase() === String(codigoAtual).trim().toLowerCase()) {
            alert('COMIMSUP deve referenciar outra UG, diferente do próprio código.');
            return false;
        }
        const snap = await db.collection('unidadesGestoras').where('codigo', '==', codigoPai).limit(1).get();
        if (snap.empty) {
            alert('COMIMSUP inválido: informe o código de uma UG já cadastrada.');
            return false;
        }
        const data = snap.docs[0].data() || {};
        if (data.ativo === false) {
            alert('COMIMSUP inválido: a UG superior selecionada está inativa.');
            return false;
        }
        return true;
    }

    if (inputComimsup) {
        inputComimsup.addEventListener('input', debouncedBuscarComimsup);
        inputComimsup.addEventListener('focus', function() {
            if (String(inputComimsup.value || '').trim().length >= 2) {
                debouncedBuscarComimsup();
            }
        });
    }
    if (listaResultadosComimsup) {
        listaResultadosComimsup.addEventListener('click', function(e) {
            const item = e.target.closest('li[data-index]');
            if (!item) return;
            const idx = parseInt(item.getAttribute('data-index'), 10);
            const selecionada = sugestoesComimsup[idx];
            if (!selecionada) return;
            inputComimsup.value = String(selecionada.codigo || '');
            limparSugestoesComimsup();
        });
    }
    document.addEventListener('click', function(e) {
        if (!listaResultadosComimsup || !inputComimsup) return;
        if (e.target === inputComimsup || listaResultadosComimsup.contains(e.target)) return;
        limparSugestoesComimsup();
    });

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
        const codigo = String(document.getElementById('ugCodigo').value || '').trim();
        const comimsup = String(document.getElementById('ugComimsup').value || '').trim();
        const comimsupOk = await validarComimsup(comimsup, codigo);
        if (!comimsupOk) return;
        const dados = {
            codigo: escapeHTML(codigo),
            indicativoNaval: escapeHTML(document.getElementById('ugIndicativoNaval').value),
            nome: escapeHTML(document.getElementById('ugNome').value),
            comimsup: escapeHTML(comimsup),
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
