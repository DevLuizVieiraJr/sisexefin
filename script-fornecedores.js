// ==========================================
// MODULO: FORNECEDORES
// ==========================================
(function() {
    if (!document.getElementById('tabelaFornecedores')) return;

    const formFornecedor = document.getElementById('formFornecedor');
    const tabelaBody = document.querySelector('#tabelaFornecedores tbody');
    const inputCodigo = document.getElementById('fornecedorCodigo');
    const selectTipo = document.getElementById('fornecedorTipoPessoa');
    const inputTelefone = document.getElementById('fornecedorTelefone');
    const selectOptanteSimples = document.getElementById('fornecedorOptanteSimples');

    function apenasDigitos(v) { return String(v || '').replace(/\D/g, ''); }

    function formatarCPF(v) {
        const d = apenasDigitos(v).slice(0, 11);
        return d
            .replace(/^(\d{3})(\d)/, '$1.$2')
            .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
            .replace(/^(\d{3})\.(\d{3})\.(\d{3})(\d)/, '$1.$2.$3-$4');
    }

    function formatarCNPJ(v) {
        const d = apenasDigitos(v).slice(0, 14);
        return d
            .replace(/^(\d{2})(\d)/, '$1.$2')
            .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
            .replace(/\.(\d{3})(\d)/, '.$1/$2')
            .replace(/(\d{4})(\d)/, '$1-$2');
    }

    function validarCPF(cpf) {
        const d = apenasDigitos(cpf);
        if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
        let soma = 0;
        for (let i = 0; i < 9; i++) soma += Number(d.charAt(i)) * (10 - i);
        let resto = (soma * 10) % 11;
        if (resto === 10) resto = 0;
        if (resto !== Number(d.charAt(9))) return false;
        soma = 0;
        for (let j = 0; j < 10; j++) soma += Number(d.charAt(j)) * (11 - j);
        resto = (soma * 10) % 11;
        if (resto === 10) resto = 0;
        return resto === Number(d.charAt(10));
    }

    function validarCNPJ(cnpj) {
        const d = apenasDigitos(cnpj);
        if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false;
        const pesos1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
        const pesos2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
        let soma = 0;
        for (let i = 0; i < 12; i++) soma += Number(d.charAt(i)) * pesos1[i];
        let resto = soma % 11;
        const dig1 = resto < 2 ? 0 : 11 - resto;
        if (dig1 !== Number(d.charAt(12))) return false;
        soma = 0;
        for (let j = 0; j < 13; j++) soma += Number(d.charAt(j)) * pesos2[j];
        resto = soma % 11;
        const dig2 = resto < 2 ? 0 : 11 - resto;
        return dig2 === Number(d.charAt(13));
    }

    function formatarTelefone(v) {
        const d = apenasDigitos(v).slice(0, 11);
        if (d.length <= 10) {
            return d
                .replace(/^(\d{2})(\d)/, '($1) $2')
                .replace(/(\d{4})(\d)/, '$1-$2');
        }
        return d
            .replace(/^(\d{2})(\d)/, '($1) $2')
            .replace(/(\d{5})(\d)/, '$1-$2');
    }

    function atualizarMascaraCodigo() {
        const tipo = (selectTipo.value || '').trim();
        const atual = inputCodigo.value || '';
        if (tipo === 'FISICA') {
            inputCodigo.placeholder = '000.000.000-00';
            inputCodigo.maxLength = 14;
            inputCodigo.value = formatarCPF(atual);
        } else if (tipo === 'JURIDICA') {
            inputCodigo.placeholder = '00.000.000/0000-00';
            inputCodigo.maxLength = 18;
            inputCodigo.value = formatarCNPJ(atual);
        } else {
            inputCodigo.placeholder = 'Selecione o tipo de pessoa';
            inputCodigo.maxLength = 18;
        }
    }

    selectTipo.addEventListener('change', atualizarMascaraCodigo);
    inputCodigo.addEventListener('input', function() {
        if (selectTipo.value === 'FISICA') this.value = formatarCPF(this.value);
        else if (selectTipo.value === 'JURIDICA') this.value = formatarCNPJ(this.value);
    });
    inputTelefone.addEventListener('input', function() {
        this.value = formatarTelefone(this.value);
    });

    document.getElementById('buscaTabelaFornecedores').addEventListener('input', debounce(() => {
        termoBuscaFornecedores = document.getElementById('buscaTabelaFornecedores').value.toLowerCase();
        paginaAtualFornecedores = 1;
        atualizarTabelaFornecedores();
    }));

    function abrirFormularioFornecedor(isEdit) {
        if (!isEdit) {
            formFornecedor.reset();
            document.getElementById('editIndexFornecedor').value = -1;
            atualizarMascaraCodigo();
        }
        document.getElementById('tela-lista-fornecedores').style.display = 'none';
        document.getElementById('tela-formulario-fornecedores').style.display = 'block';
    }
    window.abrirFormularioFornecedor = abrirFormularioFornecedor;

    function voltarParaListaFornecedores() {
        document.getElementById('tela-formulario-fornecedores').style.display = 'none';
        document.getElementById('tela-lista-fornecedores').style.display = 'block';
        atualizarTabelaFornecedores();
    }
    window.voltarParaListaFornecedores = voltarParaListaFornecedores;

    function atualizarTabelaFornecedores() {
        tabelaBody.innerHTML = '';
        let base = (baseFornecedores || []).slice();
        if (termoBuscaFornecedores.trim() !== '') {
            const q = termoBuscaFornecedores;
            base = base.filter(function(f) {
                return (f.codigo && String(f.codigo).toLowerCase().includes(q)) ||
                    (f.nome && String(f.nome).toLowerCase().includes(q)) ||
                    (f.contato && String(f.contato).toLowerCase().includes(q)) ||
                    (f.telefone && String(f.telefone).toLowerCase().includes(q)) ||
                    (f.email && String(f.email).toLowerCase().includes(q));
            });
        }
        base = aplicarOrdenacao(base, 'fornecedores');
        const totalRegistros = base.length;
        const totalPaginas = Math.max(1, Math.ceil(totalRegistros / itensPorPaginaFornecedores));
        const paginaAtualAjustada = Math.min(Math.max(1, paginaAtualFornecedores), totalPaginas);
        paginaAtualFornecedores = paginaAtualAjustada;
        const inicio = (paginaAtualAjustada - 1) * itensPorPaginaFornecedores;
        const itensExibidos = base.slice(inicio, inicio + parseInt(itensPorPaginaFornecedores, 10));

        if (itensExibidos.length === 0) {
            tabelaBody.innerHTML = '<tr><td colspan="10" style="text-align:center;">Nenhum registro encontrado.</td></tr>';
        } else {
            itensExibidos.forEach(function(f) {
                const tr = document.createElement('tr');
                const acoes = typeof gerarBotoesAcao === 'function' ? gerarBotoesAcao(f.id, 'fornecedor', f) : '';
                tr.innerHTML = '<td>' + escapeHTML(f.tipoPessoa || '-') + '</td>' +
                    '<td>' + escapeHTML(f.codigo || '-') + '</td>' +
                    '<td title="' + escapeHTML(f.nome || '') + '">' + escapeHTML((f.nome || '-').substring(0, 40)) + ((f.nome || '').length > 40 ? '...' : '') + '</td>' +
                    '<td>' + escapeHTML(f.matrizFilial || '-') + '</td>' +
                    '<td>' + escapeHTML(f.contato || '-') + '</td>' +
                    '<td>' + escapeHTML(f.telefone || '-') + '</td>' +
                    '<td>' + escapeHTML(f.email || '-') + '</td>' +
                    '<td>' + escapeHTML(f.situacaoCadastral || 'ATIVO') + '</td>' +
                    '<td>' + (f.optanteSimples === true ? 'Sim' : 'Não') + '</td>' +
                    '<td>' + acoes + '</td>';
                tabelaBody.appendChild(tr);
            });
        }

        const mostrando = document.getElementById('mostrandoFornecedores');
        if (mostrando) mostrando.textContent = 'Mostrando ' + (totalRegistros === 0 ? 0 : (inicio + 1)) + ' de ' + totalRegistros + ' registros';
        document.getElementById('infoPaginaFornecedores').textContent = 'Página ' + paginaAtualAjustada + ' de ' + totalPaginas;
        document.getElementById('btnAnteriorFornecedores').disabled = paginaAtualAjustada <= 1;
        document.getElementById('btnProximoFornecedores').disabled = paginaAtualAjustada >= totalPaginas;
        const btnPrimeiro = document.getElementById('btnPrimeiroFornecedores');
        const btnUltimo = document.getElementById('btnUltimoFornecedores');
        if (btnPrimeiro) btnPrimeiro.disabled = paginaAtualAjustada <= 1;
        if (btnUltimo) btnUltimo.disabled = paginaAtualAjustada >= totalPaginas;
    }

    tabelaBody.addEventListener('click', function(e) {
        const btnEditar = e.target.closest('.btn-editar-fornecedor');
        const btnInativar = e.target.closest('.btn-inativar-fornecedor');
        const btnReativar = e.target.closest('.btn-reativar-fornecedor');
        const btnApagar = e.target.closest('.btn-apagar-fornecedor-permanente');
        if (btnEditar) editarFornecedor(btnEditar.getAttribute('data-id'));
        if (btnInativar) inativarFornecedor(btnInativar.getAttribute('data-id'));
        if (btnReativar) reativarFornecedor(btnReativar.getAttribute('data-id'));
        if (btnApagar) excluirPermanenteFornecedor(btnApagar.getAttribute('data-id'));
    });

    window.mudarTamanhoPaginaFornecedores = function() {
        itensPorPaginaFornecedores = document.getElementById('itensPorPaginaFornecedores').value;
        paginaAtualFornecedores = 1;
        atualizarTabelaFornecedores();
    };

    window.mudarPaginaFornecedores = function(direcao) {
        const totalRegistros = (baseFornecedores || []).length;
        const totalPaginas = Math.max(1, Math.ceil(totalRegistros / itensPorPaginaFornecedores));
        if (direcao === 'primeiro') paginaAtualFornecedores = 1;
        else if (direcao === 'ultimo') paginaAtualFornecedores = totalPaginas;
        else paginaAtualFornecedores += (direcao || 0);
        atualizarTabelaFornecedores();
    };

    function editarFornecedor(id) {
        const f = (baseFornecedores || []).find(function(item) { return item.id === id; });
        if (!f) return;
        abrirFormularioFornecedor(true);
        document.getElementById('editIndexFornecedor').value = f.id;
        selectTipo.value = f.tipoPessoa || '';
        atualizarMascaraCodigo();
        inputCodigo.value = f.codigo || '';
        document.getElementById('fornecedorNome').value = f.nome || '';
        document.getElementById('fornecedorMatrizFilial').value = f.matrizFilial || '';
        document.getElementById('fornecedorContato').value = f.contato || '';
        document.getElementById('fornecedorTelefone').value = f.telefone || '';
        document.getElementById('fornecedorEmail').value = f.email || '';
        document.getElementById('fornecedorSituacao').value = f.situacaoCadastral || 'ATIVO';
        if (selectOptanteSimples) {
            selectOptanteSimples.value = f.optanteSimples === true ? 'true' : 'false';
        }
        document.getElementById('fornecedorEndereco').value = f.endereco || '';
    }

    async function inativarFornecedor(id) {
        if (!confirm('Inativar este fornecedor?')) return;
        mostrarLoading();
        try {
            await db.collection('fornecedores').doc(id).update({ ativo: false });
            atualizarTabelaFornecedores();
        } catch (err) { alert('Erro ao inativar.'); }
        finally { esconderLoading(); }
    }

    async function reativarFornecedor(id) {
        if (!confirm('Reativar este fornecedor?')) return;
        mostrarLoading();
        try {
            await db.collection('fornecedores').doc(id).update({ ativo: true });
            atualizarTabelaFornecedores();
        } catch (err) { alert('Erro ao reativar.'); }
        finally { esconderLoading(); }
    }

    async function excluirPermanenteFornecedor(id) {
        if (!confirm('Excluir PERMANENTEMENTE este fornecedor? Esta ação não pode ser desfeita.')) return;
        mostrarLoading();
        try {
            await db.collection('fornecedores').doc(id).delete();
            atualizarTabelaFornecedores();
        } catch (err) { alert('Erro ao excluir.'); }
        finally { esconderLoading(); }
    }

    formFornecedor.addEventListener('submit', async function(e) {
        e.preventDefault();
        const fbID = document.getElementById('editIndexFornecedor').value;
        const tipoPessoa = (selectTipo.value || '').trim();
        const codigo = (inputCodigo.value || '').trim();
        const nome = (document.getElementById('fornecedorNome').value || '').trim();
        if (!tipoPessoa) return alert('Selecione o Tipo de Pessoa.');
        if (!codigo) return alert('Informe o Código (CPF/CNPJ).');
        if (!nome) return alert('Informe o Nome.');
        if (tipoPessoa === 'FISICA' && !validarCPF(codigo)) return alert('CPF inválido.');
        if (tipoPessoa === 'JURIDICA' && !validarCNPJ(codigo)) return alert('CNPJ inválido.');

        const dados = {
            tipoPessoa: tipoPessoa,
            codigo: escapeHTML(codigo),
            codigoNumerico: apenasDigitos(codigo),
            nome: escapeHTML(nome),
            matrizFilial: escapeHTML(document.getElementById('fornecedorMatrizFilial').value || ''),
            contato: escapeHTML(document.getElementById('fornecedorContato').value || ''),
            telefone: escapeHTML(document.getElementById('fornecedorTelefone').value || ''),
            email: escapeHTML(document.getElementById('fornecedorEmail').value || ''),
            situacaoCadastral: escapeHTML(document.getElementById('fornecedorSituacao').value || 'ATIVO'),
            optanteSimples: selectOptanteSimples ? selectOptanteSimples.value === 'true' : false,
            endereco: escapeHTML(document.getElementById('fornecedorEndereco').value || ''),
            ativo: true
        };

        mostrarLoading();
        try {
            if (fbID == -1 || fbID === '') await db.collection('fornecedores').add(dados);
            else await db.collection('fornecedores').doc(fbID).update(dados);
            voltarParaListaFornecedores();
        } catch (err) { alert('Erro ao salvar fornecedor.'); }
        finally { esconderLoading(); }
    });

    atualizarMascaraCodigo();
    window.atualizarTabelaFornecedores = atualizarTabelaFornecedores;
})();
