// MÓDULO: CONTRATOS E EMPRESAS
(function() {
    // Define o exportador global antes de qualquer "return" antecipado
    // para evitar "exportarContratos is not defined" caso a seção ainda não esteja no DOM no momento do load.
    window.exportarContratos = window.exportarContratos || function(formato) {
        if (typeof XLSX === 'undefined') return alert("Biblioteca XLSX não carregada (SheetJS).");
        try {
            const contratos = (typeof baseContratos !== 'undefined' && Array.isArray(baseContratos)) ? baseContratos : [];
            if (contratos.length === 0) return alert("Nenhum contrato carregado para exportar.");

            const normalizarCNPJ = (v) => String(v || '').replace(/\D/g, '').slice(0, 14);
            const label = (cnpj, nome) => {
                const cnpjN = normalizarCNPJ(cnpj);
                const cnpjFmt = cnpjN ? (typeof formatarCNPJ === 'function' ? formatarCNPJ(cnpjN) : cnpjN) : '-';
                const n = nome ? String(nome).trim() : '';
                return n ? `${cnpjFmt} - ${n}` : cnpjFmt;
            };

            const dados = contratos.map(c => ({
                'ID': c.idContrato || '',
                'Instrumento': c.numContrato || c.instrumento || '',
                'Situação': c.situacao || '',
                'Fornecedor CNPJ': c.cnpjFornecedor || '',
                'Fornecedor Nome': c.nomeFornecedor || '',
                'Fornecedor': label(c.cnpjFornecedor, c.nomeFornecedor),
                'NUP': c.nup || '',
                'Data Início': c.dataInicio || '',
                'Data Fim': c.dataFim || '',
                'Valor Global': c.valorContrato || '',
                'Deduções Permitidas': Array.isArray(c.deducoesPermitidas) ? JSON.stringify(c.deducoesPermitidas) : ''
            }));

            const ws = XLSX.utils.json_to_sheet(dados);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'Contratos');
            XLSX.writeFile(wb, 'contratos.' + (formato === 'csv' ? 'csv' : 'xlsx'));
        } catch (err) {
            console.error('Erro ao exportar contratos:', err);
            alert("Erro ao exportar contratos: " + (err && err.message ? err.message : String(err)));
        }
    };

    if (!document.getElementById('tabelaContratos')) return;
    function normalizarCNPJ(v) {
        return String(v || '').replace(/\D/g, '').slice(0, 14);
    }

    function labelFornecedorContrato(cnpjFornecedor, nomeFornecedor) {
        const cnpjFmt = cnpjFornecedor ? (typeof formatarCNPJ === 'function' ? formatarCNPJ(cnpjFornecedor) : cnpjFornecedor) : '-';
        const nome = nomeFornecedor ? String(nomeFornecedor).trim() : '';
        return nome ? `${cnpjFmt} - ${nome}` : cnpjFmt;
    }

    const formContrato = document.getElementById('formContrato');
    const tabelaContratosBody = document.querySelector('#tabelaContratos tbody');
    document.getElementById('buscaTabelaContratos').addEventListener('input', debounce(function() {
        termoBuscaContratos = document.getElementById('buscaTabelaContratos').value.toLowerCase();
        paginaAtualContratos = 1;
        atualizarTabelaContratos();
    }));
    let indicesDedEncSelecionados = new Set();
    let rcsContratoAtual = [];
    let editIndexRcContrato = -1;
    function abrirFormularioContrato(isEdit) {
        if (!isEdit) {
            formContrato.reset();
            document.getElementById('editIndexContrato').value = -1;
            deducoesPermitidasContratoAtual = [];
            indicesDedEncSelecionados = new Set();
            desenharDedEncContrato();
            rcsContratoAtual = [];
            editIndexRcContrato = -1;
            limparCamposRcContrato();
            desenharRcContrato();
        }
        document.getElementById('tela-lista-contratos').style.display = 'none';
        document.getElementById('tela-formulario-contratos').style.display = 'block';
    }
    function voltarParaListaContratos() {
        document.getElementById('tela-formulario-contratos').style.display = 'none';
        document.getElementById('tela-lista-contratos').style.display = 'block';
        atualizarTabelaContratos();
    }
    window.voltarParaListaContratos = voltarParaListaContratos;
    function atualizarTabelaContratos() {
        tabelaContratosBody.innerHTML = '';
        var baseFiltrada = baseContratos.map(function(c, index) { return Object.assign({}, c, { indexOriginal: index }); });
        if (termoBuscaContratos.trim() !== "") {
            baseFiltrada = baseFiltrada.filter(function(c) {
                const termo = termoBuscaContratos;
                const nome = String(c.nomeFornecedor || '').toLowerCase();
                const cnpjDig = String(c.cnpjFornecedor || '').toLowerCase();
                const cnpjFmt = (typeof formatarCNPJ === 'function' && c.cnpjFornecedor) ? String(formatarCNPJ(c.cnpjFornecedor)).toLowerCase() : '';
                const txtFornecedor = (nome + ' ' + cnpjDig + ' ' + cnpjFmt).toLowerCase();
                return txtFornecedor.indexOf(termo) !== -1 || (c.numContrato && c.numContrato.toLowerCase().indexOf(termo) !== -1);
            });
        }
        baseFiltrada = aplicarOrdenacao(baseFiltrada, 'contratos');
        var inicio = (paginaAtualContratos - 1) * itensPorPaginaContratos;
        var fim = inicio + parseInt(itensPorPaginaContratos, 10);
        var itensExibidos = baseFiltrada.slice(inicio, fim);
        if (itensExibidos.length === 0) {
            tabelaContratosBody.innerHTML = '<tr><td colspan="10" style="text-align:center;">Nenhum contrato encontrado.</td></tr>';
            return;
        }
        itensExibidos.forEach(function(c) {
            var tr = document.createElement('tr');
            var acoesHTML = gerarBotoesAcao(c.id, 'contrato');
            var cnpjFmt = c.cnpjFornecedor ? (typeof formatarCNPJ === 'function' ? formatarCNPJ(c.cnpjFornecedor) : c.cnpjFornecedor) : '-';
            var valorExib = c.valorContrato;
            if (typeof formatarMoedaBR === 'function' && (typeof valorExib === 'number' || !isNaN(parseFloat(valorExib)))) valorExib = 'R$ ' + formatarMoedaBR(valorExib);
            else if (valorExib == null || valorExib === '') valorExib = '-';
            tr.innerHTML = '<td>' + (escapeHTML(c.idContrato) || '-') + '</td><td><strong>' + (escapeHTML(c.numContrato) || '-') + '</strong></td><td>' + escapeHTML(cnpjFmt) + '</td><td>' + (escapeHTML(c.nomeFornecedor) || '-') + '</td><td>' + (escapeHTML(c.nup) || '-') + '</td><td>' + (escapeHTML(c.dataInicio) || '-') + '</td><td>' + (escapeHTML(c.dataFim) || '-') + '</td><td>' + (escapeHTML(String(valorExib))) + '</td><td>' + (escapeHTML(c.situacao) || '-') + '</td><td>' + acoesHTML + '</td>';
            tabelaContratosBody.appendChild(tr);
        });
        var total = Math.ceil(baseFiltrada.length / itensPorPaginaContratos) || 1;
        document.getElementById('infoPaginaContratos').textContent = 'Página ' + paginaAtualContratos + ' de ' + total;
        document.getElementById('btnAnteriorContratos').disabled = paginaAtualContratos === 1;
        document.getElementById('btnProximoContratos').disabled = paginaAtualContratos === total;
    }
    tabelaContratosBody.addEventListener('click', function(e) {
        var btnEditar = e.target.closest('.btn-editar-contrato');
        var btnApagar = e.target.closest('.btn-apagar-contrato');
        if (btnEditar) editarContrato(btnEditar.getAttribute('data-id'));
        if (btnApagar) apagarContrato(btnApagar.getAttribute('data-id'));
    });
    window.mudarTamanhoPaginaContratos = function() { itensPorPaginaContratos = document.getElementById('itensPorPaginaContratos').value; paginaAtualContratos = 1; atualizarTabelaContratos(); };
    window.mudarPaginaContratos = function(direcao) { paginaAtualContratos += direcao; atualizarTabelaContratos(); };
    function editarContrato(id) {
        var c = baseContratos.find(function(item) { return item.id === id; });
        if (c) {
            abrirFormularioContrato(true);
            document.getElementById('editIndexContrato').value = c.id;
            document.getElementById('idContrato').value = c.idContrato || '';
            document.getElementById('numContrato').value = c.numContrato || '';
            document.getElementById('situacaoContrato').value = c.situacao || '';
            document.getElementById('cnpjFornecedorContrato').value = c.cnpjFornecedor ? (typeof formatarCNPJ === 'function' ? formatarCNPJ(c.cnpjFornecedor) : c.cnpjFornecedor) : '';
            document.getElementById('nomeFornecedorContrato').value = c.nomeFornecedor || '';
            document.getElementById('nupContrato').value = c.nup || '';
            document.getElementById('dataInicio').value = c.dataInicio || '';
            document.getElementById('dataFim').value = c.dataFim || '';
            var valorTratado = c.valorContrato;
            var numVal = 0;
            if (typeof valorMoedaParaNumero === 'function') numVal = valorMoedaParaNumero(valorTratado);
            else if (typeof valorTratado === 'string' && valorTratado.indexOf('R$') !== -1) { valorTratado = valorTratado.replace('R$', '').replace(/\./g, '').replace(',', '.').trim(); numVal = parseFloat(valorTratado) || 0; }
            else numVal = parseFloat(valorTratado) || 0;
            document.getElementById('valorContrato').value = typeof formatarMoedaBR === 'function' ? ('R$ ' + formatarMoedaBR(numVal)) : (numVal || '');
            deducoesPermitidasContratoAtual = (c.deducoesPermitidas && Array.isArray(c.deducoesPermitidas)) ? c.deducoesPermitidas.map(function(x) { return { dedEncId: x.dedEncId, tipo: x.tipo, codigo: x.codigo, descricao: x.descricao }; }) : (c.codigosReceita && Array.isArray(c.codigosReceita)) ? c.codigosReceita.map(function(cod) { return { codigo: cod, tipo: 'DDF025' }; }) : [];
            indicesDedEncSelecionados = new Set();
            desenharDedEncContrato();
            rcsContratoAtual = normalizarListaRcContrato(c.rcs);
            editIndexRcContrato = -1;
            limparCamposRcContrato();
            desenharRcContrato();
        }
    }
    async function apagarContrato(id) {
        var c = baseContratos.find(function(item) { return item.id === id; });
        if (c && typeof baseTitulos !== 'undefined') {
            var titulosVinculados = baseTitulos.filter(function(t) { return (t.instrumento || '') === (c.numContrato || ''); });
            if (titulosVinculados.length > 0) {
                alert('Não é possível excluir este Contrato: existem ' + titulosVinculados.length + ' título(s) vinculado(s). Remova o vínculo nos títulos primeiro.');
                return;
            }
        }
        if (confirm("Apagar Contrato permanentemente?")) {
            mostrarLoading();
            try { await db.collection('contratos').doc(id).delete(); }
            catch (err) { alert("Acesso Negado ou falha de rede."); }
            finally { esconderLoading(); }
        }
    }
    formContrato.addEventListener('submit', async function(e) {
        e.preventDefault();
        mostrarLoading();
        var fbID = document.getElementById('editIndexContrato').value;
        var numVal = typeof valorMoedaParaNumero === 'function' ? valorMoedaParaNumero(document.getElementById('valorContrato').value) : (parseFloat(document.getElementById('valorContrato').value) || 0);
        const cnpjFornecedor = normalizarCNPJ(document.getElementById('cnpjFornecedorContrato').value);
        const nomeFornecedor = document.getElementById('nomeFornecedorContrato').value;
        var dados = {
            idContrato: escapeHTML(document.getElementById('idContrato').value),
            numContrato: escapeHTML(document.getElementById('numContrato').value),
            situacao: escapeHTML(document.getElementById('situacaoContrato').value),
            cnpjFornecedor: escapeHTML(normalizarCNPJ(cnpjFornecedor)),
            nomeFornecedor: escapeHTML(nomeFornecedor),
            nup: escapeHTML(document.getElementById('nupContrato').value),
            dataInicio: escapeHTML(document.getElementById('dataInicio').value),
            dataFim: escapeHTML(document.getElementById('dataFim').value),
            valorContrato: numVal,
            deducoesPermitidas: deducoesPermitidasContratoAtual,
            rcs: rcsContratoAtual
        };
        try {
            if (fbID == -1 || fbID === "") { await db.collection('contratos').add(dados); }
            else { await db.collection('contratos').doc(fbID).update(dados); }
            voltarParaListaContratos();
        } catch (err) { alert("Erro ao guardar contrato."); }
        finally { esconderLoading(); }
    });
    var inputBuscaDedEncContrato = document.getElementById('buscaDedEncContrato');
    var listaResultadosDedEnc = document.getElementById('listaResultadosDedEnc');
    if (inputBuscaDedEncContrato && listaResultadosDedEnc) {
        inputBuscaDedEncContrato.addEventListener('input', debounce(function() {
            // Não usar `this.value` aqui: o debounce global não preserva o contexto do input.
            var texto = (inputBuscaDedEncContrato.value || '').toLowerCase();
            listaResultadosDedEnc.innerHTML = '';
            if (texto.length >= 2) {
                var base = typeof baseDeducoesEncargos !== 'undefined' ? baseDeducoesEncargos : [];
                var resultados = base.filter(function(d) {
                    if (d.ativo === false) return false;
                    var codigo = String(d.codigo || '').toLowerCase();
                    var tipo = String(d.tipo || '').toLowerCase();
                    var codReceita = String(d.codReceita || '').toLowerCase();
                    var natRendimento = String(d.natRendimento || '').toLowerCase();
                    var descRendimento = String(d.descRendimento || '').toLowerCase();
                    var descricao = String(d.descricao || '').toLowerCase();
                    return codigo.indexOf(texto) !== -1 ||
                        tipo.indexOf(texto) !== -1 ||
                        codReceita.indexOf(texto) !== -1 ||
                        natRendimento.indexOf(texto) !== -1 ||
                        descRendimento.indexOf(texto) !== -1 ||
                        descricao.indexOf(texto) !== -1;
                });
                resultados.sort(function(a, b) {
                    var codA = String(a.codigo || '');
                    var codB = String(b.codigo || '');
                    var cmpCodigo = codA.localeCompare(codB, 'pt-BR', { numeric: true, sensitivity: 'base' });
                    if (cmpCodigo !== 0) return cmpCodigo;
                    var tipoA = String(a.tipo || '');
                    var tipoB = String(b.tipo || '');
                    return tipoA.localeCompare(tipoB, 'pt-BR', { numeric: true, sensitivity: 'base' });
                });
                if (resultados.length === 0) {
                    listaResultadosDedEnc.innerHTML = '<li style="color:red; padding:10px;">Nenhuma dedução encontrada.</li>';
                } else {
                    resultados.forEach(function(d) {
                        var li = document.createElement('li');
                        li.innerHTML = '<strong>' + escapeHTML(d.codigo || '-') + '</strong> | ' +
                            escapeHTML(d.tipo || '-') + ' | ' +
                            'CodReceita ' + escapeHTML(d.codReceita || '-') + ' | ' +
                            'Nat ' + escapeHTML(d.natRendimento || '-') + ' | ' +
                            escapeHTML((d.descRendimento || d.descricao || ''));
                        li.onclick = function() { selecionarDedEncContrato(d); };
                        listaResultadosDedEnc.appendChild(li);
                    });
                }
            }
        }));
    }
    function jaIncluida(d) { return deducoesPermitidasContratoAtual.some(function(p) { return p.dedEncId === d.id || (p.codigo === d.codigo && p.tipo === d.tipo); }); }
    function selecionarDedEncContrato(d) {
        if (jaIncluida(d)) {
            alert('Dedução já incluída');
            inputBuscaDedEncContrato.value = '';
            listaResultadosDedEnc.innerHTML = '';
            return;
        }
        deducoesPermitidasContratoAtual.push({ dedEncId: d.id, tipo: d.tipo, codigo: d.codigo, descricao: d.descricao });
        indicesDedEncSelecionados = new Set();
        desenharDedEncContrato();
        inputBuscaDedEncContrato.value = '';
        listaResultadosDedEnc.innerHTML = '';
    }
    function resumirDescricaoDedEnc(v) {
        var txt = String(v || '').trim();
        if (txt.length <= 30) return txt;
        return txt.slice(0, 30) + '...';
    }
    function atualizarResumoDedEncContrato() {
        var el = document.getElementById('resumoDedEncContrato');
        if (!el) return;
        var total = deducoesPermitidasContratoAtual.length;
        var sel = indicesDedEncSelecionados.size;
        var txtTotal = total + ' ' + (total === 1 ? 'dedução adicionada' : 'deduções adicionadas');
        var txtSel = sel + ' ' + (sel === 1 ? 'selecionada' : 'selecionadas');
        el.textContent = txtTotal + ' | ' + txtSel;
    }
    function desenharDedEncContrato() {
        var tbody = document.getElementById('tbodyDedEncContrato');
        var checkAll = document.getElementById('checkAllDedEncContrato');
        if (!tbody) return;
        tbody.innerHTML = '';
        if (checkAll) checkAll.checked = false;
        if (!deducoesPermitidasContratoAtual.length) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:#666;">Nenhuma dedução adicionada.</td></tr>';
            atualizarResumoDedEncContrato();
            return;
        }
        deducoesPermitidasContratoAtual.forEach(function(p, index) {
            var tr = document.createElement('tr');
            var descCompleta = String(p.descricao || '').trim();
            var descExib = resumirDescricaoDedEnc(descCompleta);
            var marcado = indicesDedEncSelecionados.has(index) ? ' checked' : '';
            tr.innerHTML =
                '<td style="text-align:center;"><input type="checkbox" class="check-dedenc-contrato" data-index="' + index + '"' + marcado + '></td>' +
                '<td>' + escapeHTML(p.codigo || '-') + '</td>' +
                '<td>' + escapeHTML(p.tipo || '-') + '</td>' +
                '<td title="' + escapeHTML(descCompleta || '-') + '">' + escapeHTML(descExib || '-') + '</td>' +
                '<td><button type="button" class="btn-icon btn-rm-dedenc-linha" data-index="' + index + '" title="Remover">🗑️</button></td>';
            tbody.appendChild(tr);
        });
        atualizarResumoDedEncContrato();
    }
    var tbodyDedEnc = document.getElementById('tbodyDedEncContrato');
    if (tbodyDedEnc) {
        tbodyDedEnc.addEventListener('click', function(e) {
            var btn = e.target.closest('.btn-rm-dedenc-linha');
            if (!btn) return;
            var idx = parseInt(btn.getAttribute('data-index'), 10);
            if (isNaN(idx) || idx < 0 || idx >= deducoesPermitidasContratoAtual.length) return;
            deducoesPermitidasContratoAtual.splice(idx, 1);
            indicesDedEncSelecionados = new Set();
            desenharDedEncContrato();
        });
        tbodyDedEnc.addEventListener('change', function(e) {
            if (!e.target.classList.contains('check-dedenc-contrato')) return;
            var idx = parseInt(e.target.getAttribute('data-index'), 10);
            if (isNaN(idx)) return;
            if (e.target.checked) indicesDedEncSelecionados.add(idx);
            else indicesDedEncSelecionados.delete(idx);
            var checkAll = document.getElementById('checkAllDedEncContrato');
            if (checkAll) checkAll.checked = deducoesPermitidasContratoAtual.length > 0 && indicesDedEncSelecionados.size === deducoesPermitidasContratoAtual.length;
            atualizarResumoDedEncContrato();
        });
    }
    var checkAllDedEnc = document.getElementById('checkAllDedEncContrato');
    if (checkAllDedEnc) {
        checkAllDedEnc.addEventListener('change', function() {
            indicesDedEncSelecionados = new Set();
            if (this.checked) {
                deducoesPermitidasContratoAtual.forEach(function(_, idx) { indicesDedEncSelecionados.add(idx); });
            }
            desenharDedEncContrato();
            this.checked = deducoesPermitidasContratoAtual.length > 0 && indicesDedEncSelecionados.size === deducoesPermitidasContratoAtual.length;
        });
    }
    var btnLimparBloco = document.getElementById('btnLimparDedEncContratoBloco');
    if (btnLimparBloco) {
        btnLimparBloco.addEventListener('click', function() {
            if (!indicesDedEncSelecionados.size) {
                alert('Selecione ao menos uma dedução para remover em bloco.');
                return;
            }
            var restantes = [];
            deducoesPermitidasContratoAtual.forEach(function(item, idx) {
                if (!indicesDedEncSelecionados.has(idx)) restantes.push(item);
            });
            deducoesPermitidasContratoAtual = restantes;
            indicesDedEncSelecionados = new Set();
            desenharDedEncContrato();
        });
    }

    function anoAtualRC() {
        return String(new Date().getFullYear());
    }

    function gerarLabelRC(rc) {
        const numero = String(rc.numero || '').trim();
        const ano = String(rc.ano || '').trim();
        const tipo = String(rc.tipo || '').trim();
        if (!numero || !ano || !tipo) return '';
        return numero + '/' + ano + ' - ' + tipo;
    }

    function normalizarRcItem(item, idx) {
        if (!item) return null;
        if (typeof item === 'string') {
            const txt = String(item).trim();
            const m = txt.match(/^(\d+)\s*\/\s*(\d{4})\s*-\s*(Material|Serviço|Locação)$/i);
            if (!m) return null;
            const tipoNormalizado = (m[3].toLowerCase() === 'serviço') ? 'Serviço' : (m[3].toLowerCase() === 'locação' ? 'Locação' : 'Material');
            return {
                ano: m[2],
                numero: m[1],
                valor: 0,
                tipo: tipoNormalizado,
                status: 'Ativo',
                createdAt: Date.now() + idx
            };
        }
        const ano = String(item.ano || item.anoRC || '').replace(/\D/g, '').slice(0, 4);
        const numero = String(item.numero || item.numRC || item.numeroRC || '').replace(/\D/g, '');
        const tipoRaw = String(item.tipo || item.tipoRC || '').trim();
        const tipo = (tipoRaw === 'Material' || tipoRaw === 'Serviço' || tipoRaw === 'Locação') ? tipoRaw : '';
        const statusRaw = String(item.status || item.statusRC || '').toLowerCase();
        const status = statusRaw === 'inativo' ? 'Inativo' : 'Ativo';
        const valor = typeof valorMoedaParaNumero === 'function' ? valorMoedaParaNumero(item.valor || item.valorRC || 0) : (parseFloat(item.valor || item.valorRC || 0) || 0);
        if (!ano || !numero || !tipo) return null;
        return {
            ano: ano,
            numero: numero,
            valor: valor,
            tipo: tipo,
            status: status,
            createdAt: item.createdAt || item.criadoEm || (Date.now() + idx)
        };
    }

    function normalizarListaRcContrato(lista) {
        if (!Array.isArray(lista)) return [];
        return lista.map(function(rc, idx) { return normalizarRcItem(rc, idx); }).filter(Boolean);
    }

    function limparCamposRcContrato() {
        const anoEl = document.getElementById('rcAnoContrato');
        const numEl = document.getElementById('rcNumeroContrato');
        const valorEl = document.getElementById('rcValorContrato');
        const tipoEl = document.getElementById('rcTipoContrato');
        const statusEl = document.getElementById('rcStatusContrato');
        if (anoEl) anoEl.value = anoAtualRC();
        if (numEl) numEl.value = '';
        if (valorEl) valorEl.value = '';
        if (tipoEl) tipoEl.value = '';
        if (statusEl) statusEl.value = 'Ativo';
        const btnAdd = document.getElementById('btnAdicionarRcContrato');
        const btnCancel = document.getElementById('btnCancelarEdicaoRcContrato');
        if (btnAdd) btnAdd.textContent = '+ Adicionar RC';
        if (btnCancel) btnCancel.style.display = 'none';
    }

    function desenharRcContrato() {
        const tbody = document.getElementById('tbodyRcContrato');
        if (!tbody) return;
        tbody.innerHTML = '';
        if (!rcsContratoAtual.length) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:#666;">Nenhuma RC adicionada.</td></tr>';
            return;
        }
        rcsContratoAtual.forEach(function(rc, idx) {
            const valorFmt = (typeof formatarMoedaBR === 'function') ? ('R$ ' + formatarMoedaBR(rc.valor || 0)) : String(rc.valor || '0');
            const tr = document.createElement('tr');
            tr.innerHTML =
                '<td>' + escapeHTML(rc.ano || '-') + '</td>' +
                '<td>' + escapeHTML(rc.numero || '-') + '</td>' +
                '<td>' + escapeHTML(valorFmt) + '</td>' +
                '<td>' + escapeHTML(rc.tipo || '-') + '</td>' +
                '<td>' + escapeHTML(rc.status || '-') + '</td>' +
                '<td>' +
                    '<button type="button" class="btn-default btn-small btn-editar-rc-contrato" data-index="' + idx + '">Editar</button> ' +
                    '<button type="button" class="btn-default btn-small btn-remover-rc-contrato" data-index="' + idx + '" style="color:#e74c3c;">Remover</button>' +
                '</td>';
            tbody.appendChild(tr);
        });
    }

    function preencherCamposRcContrato(rc, idx) {
        const anoEl = document.getElementById('rcAnoContrato');
        const numEl = document.getElementById('rcNumeroContrato');
        const valorEl = document.getElementById('rcValorContrato');
        const tipoEl = document.getElementById('rcTipoContrato');
        const statusEl = document.getElementById('rcStatusContrato');
        if (anoEl) anoEl.value = rc.ano || '';
        if (numEl) numEl.value = rc.numero || '';
        if (valorEl) valorEl.value = (typeof formatarMoedaBR === 'function') ? ('R$ ' + formatarMoedaBR(rc.valor || 0)) : String(rc.valor || '');
        if (tipoEl) tipoEl.value = rc.tipo || '';
        if (statusEl) statusEl.value = rc.status || 'Ativo';
        editIndexRcContrato = idx;
        const btnAdd = document.getElementById('btnAdicionarRcContrato');
        const btnCancel = document.getElementById('btnCancelarEdicaoRcContrato');
        if (btnAdd) btnAdd.textContent = 'Salvar edição RC';
        if (btnCancel) btnCancel.style.display = 'inline-block';
    }

    function obterInstrumentosDoContratoEmEdicao() {
        const instrumentos = new Set();
        const atual = String(document.getElementById('numContrato')?.value || '').trim();
        if (atual) instrumentos.add(atual);
        const fbID = String(document.getElementById('editIndexContrato')?.value || '').trim();
        if (fbID && fbID !== '-1') {
            const contratoBase = (baseContratos || []).find(function(c) { return c.id === fbID; });
            const antigo = String(contratoBase?.numContrato || contratoBase?.instrumento || '').trim();
            if (antigo) instrumentos.add(antigo);
        }
        return Array.from(instrumentos);
    }

    function rcEstaEmUso(rc) {
        if (typeof baseTitulos === 'undefined' || !Array.isArray(baseTitulos) || !baseTitulos.length) return false;
        const label = gerarLabelRC(rc);
        if (!label) return false;
        const instrumentos = obterInstrumentosDoContratoEmEdicao();
        if (!instrumentos.length) return baseTitulos.some(function(t) { return String(t.rc || '').trim() === label; });
        return baseTitulos.some(function(t) {
            const rcMatch = String(t.rc || '').trim() === label;
            const instrumento = String(t.instrumento || '').trim();
            return rcMatch && instrumentos.indexOf(instrumento) !== -1;
        });
    }

    function adicionarOuAtualizarRcContrato() {
        const ano = String(document.getElementById('rcAnoContrato')?.value || '').replace(/\D/g, '').slice(0, 4);
        const numero = String(document.getElementById('rcNumeroContrato')?.value || '').replace(/\D/g, '');
        const tipo = String(document.getElementById('rcTipoContrato')?.value || '').trim();
        const status = String(document.getElementById('rcStatusContrato')?.value || 'Ativo').trim();
        const valorRaw = document.getElementById('rcValorContrato')?.value || '';
        const valor = typeof valorMoedaParaNumero === 'function' ? valorMoedaParaNumero(valorRaw) : (parseFloat(valorRaw) || 0);

        if (!ano || ano.length !== 4) return alert('Informe o ano da RC com 4 dígitos.');
        if (!numero) return alert('Informe o número da RC (apenas numérico).');
        if (!tipo || ['Material', 'Serviço', 'Locação'].indexOf(tipo) === -1) return alert('Selecione um tipo de RC válido.');
        if (['Ativo', 'Inativo'].indexOf(status) === -1) return alert('Selecione um status de RC válido.');

        const idxDuplicado = rcsContratoAtual.findIndex(function(rc, idx) {
            if (editIndexRcContrato === idx) return false;
            return String(rc.ano) === ano && String(rc.numero) === numero;
        });
        if (idxDuplicado !== -1) return alert('Já existe RC com esse Ano + Número neste contrato.');

        const base = {
            ano: ano,
            numero: numero,
            valor: valor,
            tipo: tipo,
            status: status
        };
        if (editIndexRcContrato >= 0 && editIndexRcContrato < rcsContratoAtual.length) {
            const atual = rcsContratoAtual[editIndexRcContrato];
            rcsContratoAtual[editIndexRcContrato] = Object.assign({}, atual, base);
        } else {
            rcsContratoAtual.push(Object.assign({}, base, { createdAt: Date.now() }));
        }
        editIndexRcContrato = -1;
        limparCamposRcContrato();
        desenharRcContrato();
    }

    function removerRcContrato(idx) {
        if (isNaN(idx) || idx < 0 || idx >= rcsContratoAtual.length) return;
        const rc = rcsContratoAtual[idx];
        if (rcEstaEmUso(rc)) {
            alert('Não é possível remover esta RC: há TC vinculado utilizando esta RC.');
            return;
        }
        rcsContratoAtual.splice(idx, 1);
        if (editIndexRcContrato === idx) {
            editIndexRcContrato = -1;
            limparCamposRcContrato();
        }
        desenharRcContrato();
    }

    const btnAddRc = document.getElementById('btnAdicionarRcContrato');
    if (btnAddRc) btnAddRc.addEventListener('click', adicionarOuAtualizarRcContrato);
    const btnCancelRc = document.getElementById('btnCancelarEdicaoRcContrato');
    if (btnCancelRc) {
        btnCancelRc.addEventListener('click', function() {
            editIndexRcContrato = -1;
            limparCamposRcContrato();
        });
    }
    const tbodyRc = document.getElementById('tbodyRcContrato');
    if (tbodyRc) {
        tbodyRc.addEventListener('click', function(e) {
            const btnEd = e.target.closest('.btn-editar-rc-contrato');
            if (btnEd) {
                const idx = parseInt(btnEd.getAttribute('data-index'), 10);
                if (isNaN(idx) || idx < 0 || idx >= rcsContratoAtual.length) return;
                preencherCamposRcContrato(rcsContratoAtual[idx], idx);
                return;
            }
            const btnRm = e.target.closest('.btn-remover-rc-contrato');
            if (btnRm) {
                const idx = parseInt(btnRm.getAttribute('data-index'), 10);
                removerRcContrato(idx);
            }
        });
    }
    limparCamposRcContrato();
    desenharRcContrato();

    // Exporta a coleção "contratos" (CSV e Excel) via XLSX.
    window.exportarContratos = function(formato) {
        if (typeof XLSX === 'undefined') return alert("Biblioteca XLSX não carregada (SheetJS).");
        try {
            const contratos = (typeof baseContratos !== 'undefined' && Array.isArray(baseContratos)) ? baseContratos : [];
            if (contratos.length === 0) return alert("Nenhum contrato carregado para exportar.");

            const dados = contratos.map(c => ({
                'ID': c.idContrato || '',
                'Instrumento': c.numContrato || c.instrumento || '',
                'Situação': c.situacao || '',
                'Fornecedor CNPJ': c.cnpjFornecedor || '',
                'Fornecedor Nome': c.nomeFornecedor || '',
                'Fornecedor': labelFornecedorContrato(c.cnpjFornecedor, c.nomeFornecedor),
                'NUP': c.nup || '',
                'Data Início': c.dataInicio || '',
                'Data Fim': c.dataFim || '',
                'Valor Global': c.valorContrato || '',
                'Deduções Permitidas': Array.isArray(c.deducoesPermitidas) ? JSON.stringify(c.deducoesPermitidas) : ''
            }));
            const ws = XLSX.utils.json_to_sheet(dados);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'Contratos');
            XLSX.writeFile(wb, 'contratos.' + (formato === 'csv' ? 'csv' : 'xlsx'));
        } catch (err) {
            console.error('Erro ao exportar contratos:', err);
            alert("Erro ao exportar contratos: " + (err && err.message ? err.message : String(err)));
        }
    };

    window.atualizarTabelaContratos = atualizarTabelaContratos;
    window.abrirFormularioContrato = abrirFormularioContrato;
})();
