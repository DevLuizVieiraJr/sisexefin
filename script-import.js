// ==========================================
// MÓDULO: IMPORT CSV/EXCEL COM VERIFICAÇÃO DE DUPLICADOS
// ==========================================
(function() {
    if (typeof XLSX === 'undefined') return;

    function readFileAsArrayBuffer(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = e => resolve(e.target.result);
            reader.onerror = () => reject(new Error('Erro ao ler ficheiro'));
            reader.readAsArrayBuffer(file);
        });
    }

    function getVal(row, keys) {
        for (var i = 0; i < keys.length; i++) {
            var v = row[keys[i]];
            if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim();
        }
        return '';
    }

    // Converte formatos BR (ex.: "R$ 1.234.567,89" ou "R$ 1.2346,00") para número.
    function parseValorMonetarioBR(valor) {
        var s = String(valor || '').trim();
        if (!s) return 0;
        s = s.replace(/\s+/g, '').replace(/[Rr]\$/g, '').replace(/[^\d,.-]/g, '');

        // Quando houver vírgula, considera vírgula como decimal e remove separadores de milhar.
        if (s.indexOf(',') !== -1) {
            s = s.replace(/\./g, '').replace(',', '.');
        }

        var n = Number(s);
        return isNaN(n) ? 0 : n;
    }

    function verificarAdmin() {
        if (typeof permissoesEmCache !== 'undefined' && !permissoesEmCache.includes('acesso_admin')) {
            alert('Acesso negado. Apenas administradores podem importar.');
            return false;
        }
        return true;
    }

    function normalizarCNPJ(v) {
        return String(v || '').replace(/\D/g, '').slice(0, 14);
    }

    // Espera campo fornecedor geralmente em formato: "CNPJ - Nome"
    function extrairCnpjNomeFornecedor(valor) {
        const s = String(valor || '').trim();
        const dig = s.replace(/\D/g, '');
        const cnpjFornecedor = dig.length >= 14 ? dig.slice(0, 14) : dig;
        let nomeFornecedor = '';
        const m = s.match(/-\s*(.+)$/);
        if (m && m[1]) nomeFornecedor = m[1].trim();
        else nomeFornecedor = s.replace(/\d+/g, ' ').replace(/[-./\\]/g, ' ').replace(/\s+/g, ' ').trim();
        return { cnpjFornecedor, nomeFornecedor };
    }

    async function salvarUltimoImport(modulo) {
        try {
            await db.collection('config').doc('imports').set({ [modulo]: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
            var snap = await db.collection('config').doc('imports').get();
            if (snap.exists && typeof atualizarUltimoImportUI === 'function') atualizarUltimoImportUI(snap.data());
        } catch (e) { console.warn('Erro ao salvar último import:', e); }
    }

    // --- IMPORT DEDUÇÕES E ENCARGOS (chave única: codigo + tipo) ---
    const fileImportDeducoesEncargos = document.getElementById('fileImportDeducoesEncargos');
    if (fileImportDeducoesEncargos) {
        fileImportDeducoesEncargos.addEventListener('change', async function(e) {
            const file = e.target.files[0];
            if (!file) return;
            if (!verificarAdmin()) { e.target.value = ''; return; }

            const importAbort = { aborted: false };
            if (typeof window.__setLoadingAbortFn === 'function') {
                window.__setLoadingAbortFn(function() { importAbort.aborted = true; });
            }
            mostrarLoading();
            try {
                const engine = window.ImportEngine;
                const driver = window.ImportDrivers && window.ImportDrivers.deducoesEncargos;
                if (!engine || !driver || typeof driver.run !== 'function') {
                    throw new Error('Nucleo de importacao indisponivel para Deducoes/Encargos.');
                }
                const rows = await engine.parseWorkbookRows(file);
                const detectado = engine.detectLikelyModule(rows, window.ImportDrivers || {});
                if (detectado && detectado !== 'deducoesEncargos') {
                    const ok = confirm('O arquivo parece pertencer ao modulo "' + detectado + '". Deseja continuar a importacao em Deducoes/Encargos mesmo assim?');
                    if (!ok) {
                        alert('Importacao cancelada pelo usuario.');
                        return;
                    }
                }
                const report = engine.createReport();
                await driver.run({ rows, report, importAbort });
                const msg = (importAbort.aborted ? 'Interrompido. ' : '') + engine.formatSummary(report, {
                    title: 'Importacao de Deducoes/Encargos concluida',
                    maxErrors: 20
                });
                alert(msg);
                await salvarUltimoImport('deducoesEncargos');
            } catch (err) { alert('Erro ao tentar carregar dados: ' + (err.message || err)); }
            finally { esconderLoading(); e.target.value = ''; }
        });
    }

    // --- IMPORT CONTRATOS (chave única: numContrato) ---
    const fileImportContratos = document.getElementById('fileImportContratos');
    if (fileImportContratos) {
        fileImportContratos.addEventListener('change', async function(e) {
            const file = e.target.files[0];
            if (!file) return;
            if (!verificarAdmin()) { e.target.value = ''; return; }

            const importAbort = { aborted: false };
            if (typeof window.__setLoadingAbortFn === 'function') {
                window.__setLoadingAbortFn(function() { importAbort.aborted = true; });
            }
            mostrarLoading();
            try {
                const engine = window.ImportEngine;
                const driver = window.ImportDrivers && window.ImportDrivers.contratos;
                if (!engine || !driver || typeof driver.run !== 'function') {
                    throw new Error('Nucleo de importacao indisponivel para Contratos.');
                }
                const rows = await engine.parseWorkbookRows(file);
                const detectado = engine.detectLikelyModule(rows, window.ImportDrivers || {});
                if (detectado && detectado !== 'contratos') {
                    const ok = confirm('O arquivo parece pertencer ao modulo "' + detectado + '". Deseja continuar a importacao em Contratos mesmo assim?');
                    if (!ok) {
                        alert('Importacao cancelada pelo usuario.');
                        return;
                    }
                }
                const report = engine.createReport();
                await driver.run({ rows, report, importAbort });
                const msg = (importAbort.aborted ? 'Interrompido. ' : '') + engine.formatSummary(report, {
                    title: 'Importacao de Contratos concluida',
                    maxErrors: 20
                });
                alert(msg);
                await salvarUltimoImport('contratos');
            } catch (err) { alert('Erro ao tentar carregar dados: ' + (err.message || err)); }
            finally { esconderLoading(); e.target.value = ''; }
        });
    }

    // Modelo CSV para importação de Contratos
    window.downloadModeloContratos = function() {
        try {
            var link = document.createElement('a');
            link.href = 'contratos-modelo-import.csv';
            link.download = 'contratos-modelo-import.csv';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        } catch (err) {
            alert('Não foi possível baixar o modelo CSV de contratos.');
        }
    };

    // --- IMPORT FORNECEDORES (chave única: codigoNumerico) ---
    const fileImportFornecedores = document.getElementById('fileImportFornecedores');
    if (fileImportFornecedores) {
        fileImportFornecedores.addEventListener('change', async function(e) {
            const file = e.target.files[0];
            if (!file) return;
            if (!verificarAdmin()) { e.target.value = ''; return; }

            const importAbort = { aborted: false };
            if (typeof window.__setLoadingAbortFn === 'function') {
                window.__setLoadingAbortFn(function() { importAbort.aborted = true; });
            }
            mostrarLoading();
            try {
                const engine = window.ImportEngine;
                const driver = window.ImportDrivers && window.ImportDrivers.fornecedores;
                if (!engine || !driver || typeof driver.run !== 'function') {
                    throw new Error('Nucleo de importacao indisponivel para Fornecedores.');
                }
                const rows = await engine.parseWorkbookRows(file);
                const detectado = engine.detectLikelyModule(rows, window.ImportDrivers || {});
                if (detectado && detectado !== 'fornecedores') {
                    const ok = confirm('O arquivo parece pertencer ao modulo "' + detectado + '". Deseja continuar a importacao em Fornecedores mesmo assim?');
                    if (!ok) {
                        alert('Importacao cancelada pelo usuario.');
                        return;
                    }
                }
                const report = engine.createReport();
                await driver.run({ rows, report, importAbort });
                const msg = (importAbort.aborted ? 'Interrompido. ' : '') + engine.formatSummary(report, {
                    title: 'Importacao de Fornecedores concluida',
                    maxErrors: 20
                });
                alert(msg);
                await salvarUltimoImport('fornecedores');
            } catch (err) { alert('Erro ao tentar carregar dados: ' + (err.message || err)); }
            finally { esconderLoading(); e.target.value = ''; }
        });
    }

    // --- IMPORT EMPENHOS (2 fases: validar arquivo -> importar) ---
    const fileImportEmpenhos = document.getElementById('fileImportEmpenhos');
    const btnImportarEmpenhos = document.getElementById('btnImportarEmpenhos');
    const statusImportEmpenhos = document.getElementById('statusImportEmpenhos');
    let estadoImportEmpenhos = null;
    let importEmpenhosEmExecucao = false;

    function setStatusImportEmpenhos(msg, tipo) {
        if (!statusImportEmpenhos) return;
        statusImportEmpenhos.textContent = msg || '';
        statusImportEmpenhos.style.color = tipo === 'erro' ? '#e74c3c' : (tipo === 'ok' ? '#27ae60' : '#666');
    }
    function resetEstadoImportEmpenhos() {
        estadoImportEmpenhos = null;
        if (btnImportarEmpenhos) btnImportarEmpenhos.disabled = true;
    }
    function normalizarCabecalhoImportEmpenho(k) {
        return String(k || '')
            .replace(/^\ufeff/, '')
            .trim()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/\s+/g, '')
            .toLowerCase();
    }
    function valorPorAliasesImportEmpenho(rowNorm, aliases) {
        for (let i = 0; i < aliases.length; i++) {
            const key = normalizarCabecalhoImportEmpenho(aliases[i]);
            const val = rowNorm[key];
            if (val !== undefined && val !== null && String(val).trim() !== '') return String(val).trim();
        }
        return '';
    }

    async function validarArquivoEmpenhos(file) {
        const data = await readFileAsArrayBuffer(file);
        const wb = XLSX.read(data, { type: 'array' });
        const firstSheet = wb.Sheets[wb.SheetNames[0]];
        const rowsRaw = XLSX.utils.sheet_to_json(firstSheet, { defval: '', raw: false });
        const rowsNorm = rowsRaw.map(function(row) {
            const rowNorm = {};
            Object.keys(row || {}).forEach(function(k) {
                rowNorm[normalizarCabecalhoImportEmpenho(k)] = row[k];
            });
            return rowNorm;
        });
        const validas = rowsNorm.reduce((acc, rowNorm) => {
            const ne = valorPorAliasesImportEmpenho(rowNorm, ['NE', 'ne', 'NumEmpenho', 'numEmpenho', 'numeroEmpenho', 'NumeroEmpenho', 'numNE', 'NUMNE']);
            return acc + (ne ? 1 : 0);
        }, 0);
        const invalidas = rowsNorm.length - validas;
        return { rowsNorm, validas, invalidas, total: rowsNorm.length };
    }

    async function executarImportacaoEmpenhos(rowsNorm, importAbort) {
        const engine = window.ImportEngine;
        const driver = window.ImportDrivers && window.ImportDrivers.empenhos;
        if (!engine || !driver || typeof driver.run !== 'function') {
            throw new Error('Nucleo de importacao indisponivel para Empenhos.');
        }
        const report = engine.createReport();
        await driver.run({ rows: rowsNorm, report, importAbort });
        return {
            inseridos:    report.inserted,
            atualizados:  report.updated,
            erros:        report.errors.length,
            interrompido: !!(importAbort && importAbort.aborted)
        };
    }

    if (fileImportEmpenhos) {
        fileImportEmpenhos.addEventListener('change', async function(e) {
            const file = e.target.files[0];
            resetEstadoImportEmpenhos();
            if (!file) {
                setStatusImportEmpenhos('Nenhum arquivo selecionado.', 'info');
                return;
            }
            if (!verificarAdmin()) { e.target.value = ''; return; }
            if (typeof mostrarLoadingImportacao === 'function') mostrarLoadingImportacao('Validando arquivo de empenhos...');
            if (typeof iniciarBarraProgressoImport === 'function') iniciarBarraProgressoImport('Validando arquivo de empenhos...', { simulado: true });
            try {
                const validacao = await validarArquivoEmpenhos(file);
                estadoImportEmpenhos = { fileName: file.name, rowsNorm: validacao.rowsNorm };
                if (btnImportarEmpenhos) btnImportarEmpenhos.disabled = validacao.validas === 0;
                setStatusImportEmpenhos(
                    validacao.validas === 0
                        ? 'Nenhuma linha válida (NE obrigatória). Selecione outro arquivo.'
                        : 'Arquivo validado: ' + validacao.total + ' linha(s), ' + validacao.validas + ' válida(s), ' + validacao.invalidas + ' inválida(s). Pronto para importar.',
                    validacao.validas === 0 ? 'erro' : 'ok'
                );
            } catch (err) {
                console.error('Falha na validação do arquivo de empenhos:', err);
                setStatusImportEmpenhos('Erro ao validar arquivo: ' + (err && err.message ? err.message : err), 'erro');
                resetEstadoImportEmpenhos();
            } finally {
                if (typeof pararBarraProgressoImport === 'function') pararBarraProgressoImport();
                if (typeof esconderLoadingImportacao === 'function') esconderLoadingImportacao();
            }
        });
    }

    if (btnImportarEmpenhos) {
        btnImportarEmpenhos.addEventListener('click', async function() {
            if (importEmpenhosEmExecucao) return;
            if (!estadoImportEmpenhos || !Array.isArray(estadoImportEmpenhos.rowsNorm)) {
                setStatusImportEmpenhos('Selecione e valide um arquivo antes de importar.', 'erro');
                return;
            }
            if (!verificarAdmin()) return;

            importEmpenhosEmExecucao = true;
            btnImportarEmpenhos.disabled = true;
            const importAbort = { aborted: false };
            if (typeof window.__setLoadingAbortFn === 'function') {
                window.__setLoadingAbortFn(function() { importAbort.aborted = true; });
            }
            if (typeof mostrarLoadingImportacao === 'function') mostrarLoadingImportacao('Importando empenhos...');
            const totalLinhasImport = estadoImportEmpenhos.rowsNorm.length;
            if (typeof iniciarBarraProgressoImport === 'function') {
                iniciarBarraProgressoImport('Importando empenhos... 0/' + totalLinhasImport, { pct: 0, simulado: false });
            }
            try {
                const res = await executarImportacaoEmpenhos(estadoImportEmpenhos.rowsNorm, importAbort);
                await salvarUltimoImport('empenhos');
                const msgResumo = (res.interrompido ? 'Interrompido. ' : '') +
                    'Importados ' + res.inseridos + '; Atualizados ' + res.atualizados + '; Erros ' + res.erros + '.';
                setStatusImportEmpenhos('Importação concluída. ' + msgResumo, res.erros > 0 ? 'info' : 'ok');
                alert(msgResumo);
                estadoImportEmpenhos = null;
                if (fileImportEmpenhos) fileImportEmpenhos.value = '';
            } catch (err) {
                console.error('Falha na importação de empenhos:', err);
                setStatusImportEmpenhos('Erro ao importar: ' + (err && err.message ? err.message : err), 'erro');
                alert('Erro ao tentar importar dados: ' + (err && err.message ? err.message : err));
            } finally {
                importEmpenhosEmExecucao = false;
                if (btnImportarEmpenhos) btnImportarEmpenhos.disabled = !estadoImportEmpenhos;
                if (typeof pararBarraProgressoImport === 'function') pararBarraProgressoImport();
                if (typeof esconderLoadingImportacao === 'function') esconderLoadingImportacao();
            }
        });
    }

    // --- IMPORT CENTRO DE CUSTOS (novo fluxo com nucleo + driver) ---
    const fileImportCentroCustos = document.getElementById('fileImportCentroCustos');
    if (fileImportCentroCustos) {
        fileImportCentroCustos.addEventListener('change', async function(e) {
            const file = e.target.files[0];
            if (!file) return;
            if (!verificarAdmin()) { e.target.value = ''; return; }
            mostrarLoading();

            const importAbort = { aborted: false };
            if (typeof window.__setLoadingAbortFn === 'function') {
                window.__setLoadingAbortFn(function() { importAbort.aborted = true; });
            }
            try {
                const engine = window.ImportEngine;
                const driver = window.ImportDrivers && window.ImportDrivers.centroCustos;
                if (!engine || !driver || typeof driver.run !== 'function') {
                    throw new Error('Nucleo de importacao indisponivel para Centro de Custos.');
                }
                const rows = await engine.parseWorkbookRows(file);
                const detectado = engine.detectLikelyModule(rows, window.ImportDrivers || {});
                if (detectado && detectado !== 'centroCustos') {
                    const ok = confirm('O arquivo parece pertencer ao modulo "' + detectado + '". Deseja continuar a importacao em Centro de Custos mesmo assim?');
                    if (!ok) {
                        alert('Importacao cancelada pelo usuario.');
                        return;
                    }
                }
                const report = engine.createReport();
                await driver.run({ rows, report, importAbort });

                const msg = (importAbort.aborted ? 'Interrompido. ' : '') + engine.formatSummary(report, {
                    title: 'Importacao de Centro de Custos concluida',
                    maxErrors: 20
                });
                alert(msg);
                await salvarUltimoImport('centroCustos');
            } catch (err) {
                alert('Erro ao tentar carregar dados: ' + (err.message || err));
            } finally {
                esconderLoading();
                e.target.value = '';
            }
        });
    }

    // --- IMPORT UNIDADES GESTORAS (novo fluxo com nucleo + driver) ---
    const fileImportUg = document.getElementById('fileImportUg');
    if (fileImportUg) {
        fileImportUg.addEventListener('change', async function(e) {
            const file = e.target.files[0];
            if (!file) return;
            if (!verificarAdmin()) { e.target.value = ''; return; }
            mostrarLoading();

            const importAbort = { aborted: false };
            if (typeof window.__setLoadingAbortFn === 'function') {
                window.__setLoadingAbortFn(function() { importAbort.aborted = true; });
            }
            try {
                const engine = window.ImportEngine;
                const driver = window.ImportDrivers && window.ImportDrivers.unidadesGestoras;
                if (!engine || !driver || typeof driver.run !== 'function') {
                    throw new Error('Nucleo de importacao indisponivel para Unidade Gestora.');
                }
                const rows = await engine.parseWorkbookRows(file);
                const detectado = engine.detectLikelyModule(rows, window.ImportDrivers || {});
                if (detectado && detectado !== 'unidadesGestoras') {
                    const ok = confirm('O arquivo parece pertencer ao modulo "' + detectado + '". Deseja continuar a importacao em Unidade Gestora mesmo assim?');
                    if (!ok) {
                        alert('Importacao cancelada pelo usuario.');
                        return;
                    }
                }
                const report = engine.createReport();
                await driver.run({ rows, report, importAbort });

                const msg = (importAbort.aborted ? 'Interrompido. ' : '') + engine.formatSummary(report, {
                    title: 'Importacao de Unidade Gestora concluida',
                    maxErrors: 20
                });
                alert(msg);
                await salvarUltimoImport('unidadesGestoras');
            } catch (err) {
                alert('Erro ao tentar carregar dados: ' + (err.message || err));
            } finally {
                esconderLoading();
                e.target.value = '';
            }
        });
    }

    // --- IMPORT LF/PF (2 fases: validar arquivo -> importar) ---
    const fileImportLfPf = document.getElementById('fileImportLfPf');
    const btnImportarLfPf = document.getElementById('btnImportarLfPf');
    const statusImportLfPf = document.getElementById('statusImportLfPf');
    let estadoImportLfPf = null;
    let importLfPfEmExecucao = false;

    function setStatusImportLfPf(msg, tipo) {
        if (!statusImportLfPf) return;
        statusImportLfPf.textContent = msg || '';
        statusImportLfPf.style.color = tipo === 'erro' ? '#e74c3c' : (tipo === 'ok' ? '#27ae60' : '#666');
    }
    function resetEstadoImportLfPf() {
        estadoImportLfPf = null;
        if (btnImportarLfPf) btnImportarLfPf.disabled = true;
    }
    function normalizarRowLfPf(row) {
        const rowNorm = {};
        Object.keys(row || {}).forEach(function(k) {
            rowNorm[(k.replace(/^\ufeff/, '') || k).trim()] = row[k];
        });
        return rowNorm;
    }
    async function validarArquivoLfPf(file) {
        const data = await readFileAsArrayBuffer(file);
        const wb = XLSX.read(data, { type: 'array' });
        const firstSheet = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(firstSheet, { defval: '', raw: false });
        const rowsValidas = [];
        let invalidas = 0;
        for (let i = 0; i < rows.length; i++) {
            const rowNorm = normalizarRowLfPf(rows[i]);
            const lfNum = getVal(rowNorm, ['N° do Pedido', 'Nº do Pedido', 'LF', 'lf', 'Numero', 'numero']);
            if (!lfNum || String(lfNum).trim() === '') {
                invalidas++;
                continue;
            }
            rowsValidas.push({ rowNorm: rowNorm, lineIndex: i + 2 });
        }
        return { rowsValidas: rowsValidas, invalidas: invalidas, total: rows.length };
    }
    async function executarImportacaoLfPf(rowsValidas, mapLfPorNumeroInicial, importAbort) {
        const mapLfPorNumero = Object.assign({}, mapLfPorNumeroInicial || {});
        let inseridos = 0;
        let atualizados = 0;
        const erros = [];
        const userEmail = (typeof auth !== 'undefined' && auth.currentUser && auth.currentUser.email) ? auth.currentUser.email : '';
        const total = rowsValidas.length;
        for (let idx = 0; idx < rowsValidas.length; idx++) {
            if (importAbort && importAbort.aborted) break;
            const item = rowsValidas[idx];
            const rowNorm = item.rowNorm;
            const lineNo = item.lineIndex;
            const lfNum = getVal(rowNorm, ['N° do Pedido', 'Nº do Pedido', 'LF', 'lf', 'Numero', 'numero']);
            const lfNorm = String(lfNum).trim().toLowerCase();
            const valorRaw = getVal(rowNorm, ['Valor (R$)', 'Valor', 'valor']);
            const numVal = parseFloat((valorRaw || '0').replace(/[^\d,.-]/g, '').replace(',', '.')) || 0;
            const dataCriacao = getVal(rowNorm, ['Data de Criação', 'Data de Criacao', 'Data Criacao', 'dataCriacao', 'DT_CRIACAO', 'DtCriacao', 'dt_criacao']);
            const ultimaAtual = getVal(rowNorm, ['Última Atualização', 'Ultima Atualizacao', 'ultimaAtualizacao', 'ULTIMA_DT', 'UltimaDt', 'ultima_dt']);
            const situacao = getVal(rowNorm, ['Situação', 'Situacao', 'situacao']);
            const pf = getVal(rowNorm, ['PF', 'pf']);
            const docId = mapLfPorNumero[lfNorm];
            if (idx % 10 === 0 && typeof atualizarBarraProgressoImport === 'function') {
                const pct = total > 0 ? Math.round(((idx + 1) / total) * 100) : 0;
                atualizarBarraProgressoImport('Gravando LFxPF no banco... ' + (idx + 1) + '/' + total, pct);
            }
            if (docId) {
                try {
                    const updateData = { updatedAt: firebase.firestore.FieldValue.serverTimestamp(), updatedBy: userEmail };
                    if (situacao) updateData.situacao = situacao;
                    if (pf !== undefined && pf !== null && String(pf).trim() !== '') updateData.pf = escapeHTML(String(pf).trim());
                    if (ultimaAtual) updateData.ultimaAtualizacao = ultimaAtual;
                    const anoLfUp = getVal(rowNorm, ['ANO_EMISSAO', 'AnoEmissao', 'anoEmissao', 'ANO_EXERCICIO', 'AnoExercicio', 'anoExercicio']);
                    if (anoLfUp && window.sisAnoDocumento && window.sisAnoDocumento.anoValido(anoLfUp) != null) {
                        const yLf = window.sisAnoDocumento.anoValido(anoLfUp);
                        updateData.anoEmissao = yLf;
                        updateData.anoExercicio = yLf;
                    }
                    await db.collection('lfpf').doc(docId).update(updateData);
                    atualizados++;
                } catch (err) { erros.push('Linha ' + lineNo + ': ' + (err.message || err)); }
            } else {
                try {
                    const dados = {
                        lf: escapeHTML(lfNum),
                        dataCriacao: dataCriacao || '',
                        valor: numVal,
                        tipoLiquidacao: getVal(rowNorm, ['Tipo de Liquidação', 'Tipo de Liquidacao', 'tipoLiquidacao']) === 'Exercício' ? 'Exercício' : 'RP',
                        situacao: situacao || 'Aguardando Priorização',
                        ultimaAtualizacao: ultimaAtual || '',
                        pf: escapeHTML(pf),
                        rp: getVal(rowNorm, ['RP', 'rp']) === 'Processado' ? 'Processado' : 'Não Processado',
                        fr: escapeHTML(getVal(rowNorm, ['FR', 'fr'])),
                        vinculacao: escapeHTML(getVal(rowNorm, ['Vinculação', 'Vinculacao', 'vinculacao'])),
                        origem: (['LOA', 'Destaque', 'Emenda'].indexOf(getVal(rowNorm, ['Origem', 'origem'])) >= 0 ? getVal(rowNorm, ['Origem', 'origem']) : 'LOA'),
                        empenhosVinculados: [],
                        ativo: true,
                        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                        createdBy: userEmail,
                        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                        updatedBy: userEmail,
                        historico: ['Importado em ' + new Date().toLocaleString('pt-BR') + ' por ' + userEmail]
                    };
                    if (window.sisAnoDocumento && typeof window.sisAnoDocumento.aplicarAnosLfPf === 'function') {
                        window.sisAnoDocumento.aplicarAnosLfPf(dados);
                    }
                    const anoLfNovo = getVal(rowNorm, ['ANO_EMISSAO', 'AnoEmissao', 'anoEmissao', 'ANO_EXERCICIO', 'AnoExercicio', 'anoExercicio']);
                    if (anoLfNovo && window.sisAnoDocumento && window.sisAnoDocumento.anoValido(anoLfNovo) != null) {
                        const yN = window.sisAnoDocumento.anoValido(anoLfNovo);
                        dados.anoEmissao = yN;
                        dados.anoExercicio = yN;
                    }
                    const ref = await db.collection('lfpf').add(dados);
                    mapLfPorNumero[lfNorm] = ref.id;
                    inseridos++;
                } catch (err) { erros.push('Linha ' + lineNo + ': ' + (err.message || err)); }
            }
        }
        return {
            inseridos: inseridos,
            atualizados: atualizados,
            erros: erros,
            mapLfPorNumero: mapLfPorNumero,
            interrompido: !!(importAbort && importAbort.aborted)
        };
    }

    if (fileImportLfPf) {
        fileImportLfPf.addEventListener('change', async function(e) {
            const file = e.target.files[0];
            resetEstadoImportLfPf();
            if (!file) {
                setStatusImportLfPf('Nenhum arquivo selecionado.', 'info');
                return;
            }
            if (!verificarAdmin()) { e.target.value = ''; return; }
            if (typeof mostrarLoadingImportacao === 'function') mostrarLoadingImportacao('Validando arquivo LFxPF...');
            if (typeof iniciarBarraProgressoImport === 'function') iniciarBarraProgressoImport('Validando arquivo LFxPF...', { simulado: true });
            try {
                const validacao = await validarArquivoLfPf(file);
                const baseLf = typeof baseLfPf !== 'undefined' ? baseLfPf : [];
                const mapLfPorNumero = {};
                baseLf.forEach(function(d) {
                    const num = String(d.lf || '').trim().toLowerCase();
                    if (num) mapLfPorNumero[num] = d.id;
                });
                estadoImportLfPf = {
                    fileName: file.name,
                    rowsValidas: validacao.rowsValidas,
                    mapLfPorNumero: mapLfPorNumero,
                    invalidasPrevia: validacao.invalidas
                };
                if (btnImportarLfPf) btnImportarLfPf.disabled = validacao.rowsValidas.length === 0;
                setStatusImportLfPf(
                    validacao.rowsValidas.length === 0
                        ? 'Nenhuma linha válida (LF obrigatória). Selecione outro arquivo.'
                        : 'Arquivo validado: ' + validacao.total + ' linha(s), ' + validacao.rowsValidas.length + ' válida(s), ' + validacao.invalidas + ' inválida(s). Pronto para importar.',
                    validacao.rowsValidas.length === 0 ? 'erro' : 'ok'
                );
            } catch (err) {
                console.error('Falha na validação LFxPF:', err);
                setStatusImportLfPf('Erro ao validar arquivo: ' + (err && err.message ? err.message : err), 'erro');
                resetEstadoImportLfPf();
                e.target.value = '';
            } finally {
                if (typeof pararBarraProgressoImport === 'function') pararBarraProgressoImport();
                if (typeof esconderLoadingImportacao === 'function') esconderLoadingImportacao();
            }
        });
    }

    if (btnImportarLfPf) {
        btnImportarLfPf.addEventListener('click', async function() {
            if (importLfPfEmExecucao) return;
            if (!estadoImportLfPf || !Array.isArray(estadoImportLfPf.rowsValidas)) {
                setStatusImportLfPf('Selecione e valide um arquivo antes de importar.', 'erro');
                return;
            }
            if (!verificarAdmin()) return;

            importLfPfEmExecucao = true;
            btnImportarLfPf.disabled = true;
            const importAbort = { aborted: false };
            if (typeof window.__setLoadingAbortFn === 'function') {
                window.__setLoadingAbortFn(function() { importAbort.aborted = true; });
            }
            const total = estadoImportLfPf.rowsValidas.length;
            if (typeof mostrarLoadingImportacao === 'function') mostrarLoadingImportacao('Importando LFxPF...');
            if (typeof iniciarBarraProgressoImport === 'function') {
                iniciarBarraProgressoImport('Gravando LFxPF no banco... 0/' + total, { pct: 0, simulado: false });
            }
            try {
                const res = await executarImportacaoLfPf(
                    estadoImportLfPf.rowsValidas,
                    estadoImportLfPf.mapLfPorNumero,
                    importAbort
                );
                await salvarUltimoImport('lfpf');
                const errosPersist = res.erros.length;
                const invalidasTotais = (estadoImportLfPf.invalidasPrevia || 0) + errosPersist;
                let msg = (res.interrompido ? 'Interrompido. ' : '') +
                    'Importados ' + res.inseridos + '; Atualizados ' + res.atualizados + '; Erros ' + invalidasTotais;
                if (res.erros.length > 0) {
                    msg += '\n\nErros na gravação (' + res.erros.length + '):\n' + res.erros.slice(0, 20).join('\n') + (res.erros.length > 20 ? '\n...' : '');
                }
                setStatusImportLfPf('Importação concluída. ' + msg.split('\n')[0], errosPersist > 0 ? 'info' : 'ok');
                alert(msg);
                estadoImportLfPf = null;
                if (fileImportLfPf) fileImportLfPf.value = '';
            } catch (err) {
                console.error('Falha na importação LFxPF:', err);
                setStatusImportLfPf('Erro ao importar: ' + (err && err.message ? err.message : err), 'erro');
                alert('Erro ao tentar importar dados: ' + (err && err.message ? err.message : err));
            } finally {
                importLfPfEmExecucao = false;
                if (btnImportarLfPf) btnImportarLfPf.disabled = !estadoImportLfPf;
                if (typeof pararBarraProgressoImport === 'function') pararBarraProgressoImport();
                if (typeof esconderLoadingImportacao === 'function') esconderLoadingImportacao();
            }
        });
    }
})();
