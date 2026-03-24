// ==========================================
// MÓDULO: DEDUÇÕES E ENCARGOS (DedEnc)
// Substitui o antigo módulo DARF
// Tipos: DDF021 (INSS), DDF025 (DARF), DDR001 (ISS)
// ==========================================
(function() {
    const tabelaEl = document.getElementById('tabelaDeducoesEncargos');
    if (!tabelaEl) return;

    const formEl = document.getElementById('formDeducoesEncargos');
    const tbodyEl = tabelaEl ? tabelaEl.querySelector('tbody') : null;
    const COL_DEDENC = 'deducoesEncargos';

    document.getElementById('buscaTabelaDeducoesEncargos').addEventListener('input', debounce(() => {
        termoBuscaDeducoesEncargos = (document.getElementById('buscaTabelaDeducoesEncargos').value || '').toLowerCase();
        paginaAtualDeducoesEncargos = 1;
        atualizarTabelaDeducoesEncargos();
    }));

    function labelTipo(tipo) {
        const m = { DDF021: 'INSS', DDF025: 'DARF', DDR001: 'ISS' };
        return m[tipo] || tipo;
    }

    function abrirFormularioDeducoesEncargos(isEdit) {
        if (!isEdit) {
            formEl.reset();
            document.getElementById('editIndexDeducoesEncargos').value = '-1';
            toggleCamposPorTipo(document.getElementById('tipoDeducoesEncargos').value);
        }
        document.getElementById('tela-lista-deducoes-encargos').style.display = 'none';
        document.getElementById('tela-formulario-deducoes-encargos').style.display = 'block';
    }

    function voltarParaListaDeducoesEncargos() {
        document.getElementById('tela-formulario-deducoes-encargos').style.display = 'none';
        document.getElementById('tela-lista-deducoes-encargos').style.display = 'block';
        atualizarTabelaDeducoesEncargos();
    }
    window.voltarParaListaDeducoesEncargos = voltarParaListaDeducoesEncargos;

    function toggleCamposPorTipo(tipo) {
        const grpDDF021 = document.getElementById('grupoDDF021');
        const grpDDF025 = document.getElementById('grupoDDF025');
        const grpDDF025_2 = document.getElementById('grupoDDF025_2');
        const grpDDR001 = document.getElementById('grupoDDR001');
        const vis = tipo === 'DDF025';
        if (grpDDF021) grpDDF021.style.display = tipo === 'DDF021' ? 'block' : 'none';
        if (grpDDF025) grpDDF025.style.display = vis ? 'block' : 'none';
        if (grpDDF025_2) grpDDF025_2.style.display = vis ? 'block' : 'none';
        if (grpDDR001) grpDDR001.style.display = tipo === 'DDR001' ? 'block' : 'none';
    }

    document.getElementById('tipoDeducoesEncargos').addEventListener('change', function() {
        toggleCamposPorTipo(this.value);
    });

    function atualizarTabelaDeducoesEncargos() {
        if (!tbodyEl) return;
        tbodyEl.innerHTML = '';
        const base = typeof baseDeducoesEncargos !== 'undefined' ? baseDeducoesEncargos : [];
        let baseFiltrada = base.map((d, i) => ({ ...d, indexOriginal: i }));
        const termo = (termoBuscaDeducoesEncargos || '').trim();
        if (termo) {
            baseFiltrada = baseFiltrada.filter(d =>
                (d.codigo && String(d.codigo).toLowerCase().includes(termo)) ||
                (d.descricao && String(d.descricao).toLowerCase().includes(termo)) ||
                (d.tipo && String(d.tipo).toLowerCase().includes(termo)) ||
                (d.natRendimento && String(d.natRendimento).toLowerCase().includes(termo)) ||
                (d.codReceita && String(d.codReceita).toLowerCase().includes(termo))
            );
        }
        baseFiltrada = aplicarOrdenacao(baseFiltrada, COL_DEDENC);
        const inicio = (paginaAtualDeducoesEncargos - 1) * itensPorPaginaDeducoesEncargos;
        const fim = inicio + parseInt(itensPorPaginaDeducoesEncargos, 10);
        const itens = baseFiltrada.slice(inicio, fim);
        if (itens.length === 0) {
            tbodyEl.innerHTML = '<tr><td colspan="6" style="text-align:center;">Nenhuma Dedução e Encargo encontrada.</td></tr>';
            const total = Math.ceil(baseFiltrada.length / itensPorPaginaDeducoesEncargos) || 1;
            document.getElementById('infoPaginaDeducoesEncargos').textContent = `Página ${paginaAtualDeducoesEncargos} de ${total}`;
            document.getElementById('btnAnteriorDeducoesEncargos').disabled = true;
            document.getElementById('btnProximoDeducoesEncargos').disabled = true;
            return;
        }
        itens.forEach(d => {
            const tr = document.createElement('tr');
            const nome = d.descricao || '-';
            const codReceita = d.codReceita || '-';
            let aliquota = '-';
            if (d.tipo === 'DDF025') aliquota = d.aliquotaTotal ?? '-';
            else if (d.tipo === 'DDR001') aliquota = d.aliquotaMaxima ?? d.aliquotaPadrao ?? '-';
            else aliquota = d.aliquotaPadrao ?? '-';
            const aplicacao = d.descRendimento || '-';
            tr.innerHTML = `
                <td><strong>${escapeHTML(d.codigo || '-')}</strong></td>
                <td>${escapeHTML(d.tipo || '-')}</td>
                <td title="${escapeHTML(nome)}">${escapeHTML(nome)}</td>
                <td>${escapeHTML(codReceita)}</td>
                <td>${escapeHTML(String(aliquota))}</td>
                <td>${escapeHTML(aplicacao)}</td>`;
            tbodyEl.appendChild(tr);
        });
        const total = Math.ceil(baseFiltrada.length / itensPorPaginaDeducoesEncargos) || 1;
        document.getElementById('infoPaginaDeducoesEncargos').textContent = `Página ${paginaAtualDeducoesEncargos} de ${total}`;
        document.getElementById('btnAnteriorDeducoesEncargos').disabled = paginaAtualDeducoesEncargos === 1;
        document.getElementById('btnProximoDeducoesEncargos').disabled = paginaAtualDeducoesEncargos >= total;
    }

    tbodyEl.addEventListener('click', function(e) {
        const btnEditar = e.target.closest('.btn-editar-deducoesEncargos');
        const btnApagar = e.target.closest('.btn-apagar-deducoesEncargos');
        if (btnEditar) editarDeducoesEncargos(btnEditar.getAttribute('data-id'));
        if (btnApagar) apagarDeducoesEncargos(btnApagar.getAttribute('data-id'));
    });

    window.mudarTamanhoPaginaDeducoesEncargos = function() {
        itensPorPaginaDeducoesEncargos = document.getElementById('itensPorPaginaDeducoesEncargos').value;
        paginaAtualDeducoesEncargos = 1;
        atualizarTabelaDeducoesEncargos();
    };
    window.mudarPaginaDeducoesEncargos = function(direcao) {
        paginaAtualDeducoesEncargos += direcao;
        atualizarTabelaDeducoesEncargos();
    };

    function numeroOuNull(val) {
        if (val === '' || val === null || val === undefined) return null;
        const n = typeof val === 'number' ? val : parseFloat(String(val).replace(',', '.').replace(/[^\d.-]/g, ''));
        return isNaN(n) ? null : n;
    }

    function editarDeducoesEncargos(id) {
        const base = typeof baseDeducoesEncargos !== 'undefined' ? baseDeducoesEncargos : [];
        const d = base.find(item => item.id === id);
        if (!d) return;
        abrirFormularioDeducoesEncargos(true);
        document.getElementById('editIndexDeducoesEncargos').value = d.id;
        document.getElementById('codigoDeducoesEncargos').value = d.codigo || '';
        document.getElementById('tipoDeducoesEncargos').value = d.tipo || 'DDF021';
        document.getElementById('descricaoDeducoesEncargos').value = d.descricao || '';
        document.getElementById('ativoDeducoesEncargos').checked = d.ativo !== false;
        toggleCamposPorTipo(d.tipo || 'DDF021');
        document.getElementById('aliquotaPadraoDDF021').value = d.aliquotaPadrao ?? '';
        document.getElementById('natRendimentoDDF025').value = d.natRendimento || '';
        document.getElementById('descRendimentoDDF025').value = d.descRendimento || '';
        document.getElementById('codReceitaDDF025').value = d.codReceita || '';
        document.getElementById('aliquotaTotalDDF025').value = d.aliquotaTotal ?? '';
        document.getElementById('irDDF025').value = d.ir ?? '';
        document.getElementById('csllDDF025').value = d.csll ?? '';
        document.getElementById('cofinsDDF025').value = d.cofins ?? '';
        document.getElementById('pisDDF025').value = d.pis ?? '';
        document.getElementById('aliquotaPadraoDDR001').value = d.aliquotaPadrao ?? '';
        document.getElementById('aliquotaMaximaDDR001').value = d.aliquotaMaxima ?? '';
    }

    async function apagarDeducoesEncargos(id) {
        const base = typeof baseDeducoesEncargos !== 'undefined' ? baseDeducoesEncargos : [];
        const d = base.find(item => item.id === id);
        if (!d) return;
        if (typeof baseContratos !== 'undefined') {
            const contratosVinculados = baseContratos.filter(c => {
                const permitidas = c.deducoesPermitidas || [];
                return permitidas.some(p => p.dedEncId === id || p.dedEncId === d.id);
            });
            if (contratosVinculados.length > 0) {
                alert('Não é possível excluir: existem ' + contratosVinculados.length + ' contrato(s) vinculado(s). Remova a dedução dos contratos primeiro.');
                return;
            }
        }
        if (!confirm('Excluir esta Dedução e Encargo permanentemente?')) return;
        mostrarLoading();
        try {
            await db.collection('deducoesEncargos').doc(id).delete();
            voltarParaListaDeducoesEncargos();
        } catch (err) { alert('Acesso Negado.'); }
        finally { esconderLoading(); }
    }

    formEl.addEventListener('submit', async function(e) {
        e.preventDefault();
        const tipo = document.getElementById('tipoDeducoesEncargos').value;
        const codigo = (document.getElementById('codigoDeducoesEncargos').value || '').trim();
        const descricao = (document.getElementById('descricaoDeducoesEncargos').value || '').trim();
        const ativo = document.getElementById('ativoDeducoesEncargos').checked;
        const dados = {
            codigo: escapeHTML(codigo),
            tipo,
            descricao: escapeHTML(descricao),
            ativo
        };
        if (tipo === 'DDF021') {
            dados.aliquotaPadrao = numeroOuNull(document.getElementById('aliquotaPadraoDDF021').value);
            // Para DDF021, Cod. Receita replica o Código e Alíquota Total replica Alíquota Padrão
            dados.codReceita = escapeHTML(codigo);
            dados.aliquotaTotal = dados.aliquotaPadrao;
        } else if (tipo === 'DDF025') {
            dados.natRendimento = escapeHTML(document.getElementById('natRendimentoDDF025').value || '');
            dados.descRendimento = escapeHTML(document.getElementById('descRendimentoDDF025').value || '');
            dados.codReceita = escapeHTML(document.getElementById('codReceitaDDF025').value || '');
            dados.aliquotaTotal = numeroOuNull(document.getElementById('aliquotaTotalDDF025').value);
            dados.ir = numeroOuNull(document.getElementById('irDDF025').value);
            dados.csll = numeroOuNull(document.getElementById('csllDDF025').value);
            dados.cofins = numeroOuNull(document.getElementById('cofinsDDF025').value);
            dados.pis = numeroOuNull(document.getElementById('pisDDF025').value);
        } else if (tipo === 'DDR001') {
            dados.aliquotaPadrao = numeroOuNull(document.getElementById('aliquotaPadraoDDR001').value);
            dados.aliquotaMaxima = numeroOuNull(document.getElementById('aliquotaMaximaDDR001').value);
            // Para DDR001, Cod. Receita replica o Código e Alíquota Total replica Alíquota Padrão
            dados.codReceita = escapeHTML(codigo);
            dados.aliquotaTotal = dados.aliquotaPadrao;
        }
        mostrarLoading();
        const fbID = document.getElementById('editIndexDeducoesEncargos').value;
        try {
            if (fbID === '-1' || fbID === '') {
                await db.collection('deducoesEncargos').add(dados);
            } else {
                await db.collection('deducoesEncargos').doc(fbID).update(dados);
            }
            voltarParaListaDeducoesEncargos();
        } catch (err) { alert('Erro ao guardar Dedução e Encargo.'); }
        finally { esconderLoading(); }
    });

    window.exportarDeducoesEncargos = function(formato) {
        if (typeof XLSX === 'undefined') return alert('Biblioteca XLSX não carregada.');
        try {
            const base = typeof baseDeducoesEncargos !== 'undefined' ? baseDeducoesEncargos : [];
            const dados = base.map(d => ({
                Codigo: d.codigo, Tipo: d.tipo, Descricao: d.descricao, Ativo: d.ativo !== false ? 'Sim' : 'Não',
                NatRendimento: d.natRendimento, DescRendimento: d.descRendimento, CodReceita: d.codReceita,
                AliquotaPadrao: d.aliquotaPadrao, AliquotaTotal: d.aliquotaTotal, AliquotaMaxima: d.aliquotaMaxima,
                IR: d.ir, CSLL: d.csll, COFINS: d.cofins, PIS: d.pis
            }));
            const ws = XLSX.utils.json_to_sheet(dados);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'DeducoesEncargos');
            XLSX.writeFile(wb, 'deducoes-encargos.' + (formato === 'csv' ? 'csv' : 'xlsx'));
        } catch (err) { alert('Erro ao exportar.'); }
    };

    window.atualizarTabelaDeducoesEncargos = atualizarTabelaDeducoesEncargos;
    window.abrirFormularioDeducoesEncargos = abrirFormularioDeducoesEncargos;
    window.labelTipoDedEnc = labelTipo;
})();
