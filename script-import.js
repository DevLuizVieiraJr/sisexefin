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

    const NE_ALIASES = ['NE', 'ne', 'NumEmpenho', 'numEmpenho', 'numeroEmpenho', 'NumeroEmpenho', 'numNE', 'NUMNE'];
    const EMPENHO_VALOR_ALIASES = ['Valor', 'valor', 'Valor (R$)', 'ValorGlobal', 'valorGlobal', 'Valor Global', 'VALOR', 'valorEmpenho'];

    // Etapa 1: análise sem gravar. Classifica esquema, obrigatoriedade (NE), formato e duplicidade.
    async function analisarArquivoEmpenhos(file) {
        const V = window.sisImportValidacao;
        const rel = V.criarRelatorio();
        const data = await readFileAsArrayBuffer(file);
        const wb = XLSX.read(data, { type: 'array' });
        const firstSheet = wb.Sheets[wb.SheetNames[0]];
        const rowsRaw = XLSX.utils.sheet_to_json(firstSheet, { defval: '', raw: false });
        const header = XLSX.utils.sheet_to_json(firstSheet, { header: 1 })[0] || [];
        rel.total = rowsRaw.length;

        const headerNorm = (header || []).map(function(h) { return normalizarCabecalhoImportEmpenho(h); });
        const temNe = NE_ALIASES.some(function(a) { return headerNorm.indexOf(normalizarCabecalhoImportEmpenho(a)) !== -1; });
        if (!temNe) {
            rel.schemaOk = false;
            rel.schemaMsg = 'Coluna de NE (Número do Empenho) não encontrada no cabeçalho.';
            return rel;
        }

        const vistosNoArquivo = {};
        for (let i = 0; i < rowsRaw.length; i++) {
            const linha = i + 2;
            const rowNorm = {};
            Object.keys(rowsRaw[i] || {}).forEach(function(k) {
                rowNorm[normalizarCabecalhoImportEmpenho(k)] = rowsRaw[i][k];
            });
            const ne = valorPorAliasesImportEmpenho(rowNorm, NE_ALIASES);
            if (!ne) {
                rel.problemas.obrigatorio.push({ linha: linha, motivo: 'NE (Número do Empenho) é obrigatória.' });
                continue;
            }
            const valorRaw = valorPorAliasesImportEmpenho(rowNorm, EMPENHO_VALOR_ALIASES);
            if (valorRaw) {
                const valorChk = V.numero(valorRaw);
                if (!valorChk.ok) {
                    rel.problemas.formato.push({ linha: linha, motivo: 'Valor do empenho inválido: "' + valorRaw + '".' });
                    continue;
                }
            }
            const neNorm = String(ne).trim().toLowerCase();
            if (vistosNoArquivo[neNorm]) {
                rel.problemas.duplicado.push({ linha: linha, motivo: 'NE "' + ne + '" repetida no arquivo (já vista na linha ' + vistosNoArquivo[neNorm] + ').' });
                continue;
            }
            vistosNoArquivo[neNorm] = linha;
            rel.validas.push(rowNorm);
        }
        return rel;
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
            const V = window.sisImportValidacao;
            if (typeof mostrarLoadingImportacao === 'function') mostrarLoadingImportacao('Analisando arquivo de empenhos...');
            if (typeof iniciarBarraProgressoImport === 'function') iniciarBarraProgressoImport('Analisando arquivo de empenhos...', { simulado: true });
            try {
                const rel = await analisarArquivoEmpenhos(file);
                if (!rel.schemaOk) {
                    setStatusImportEmpenhos(V.statusCurto(rel, 'NE'), 'erro');
                    alert('Não foi possível analisar o arquivo.\n\n' + V.detalhe(rel));
                    resetEstadoImportEmpenhos();
                    e.target.value = '';
                    return;
                }
                estadoImportEmpenhos = { fileName: file.name, rowsNorm: rel.validas, relatorio: rel };
                if (btnImportarEmpenhos) btnImportarEmpenhos.disabled = rel.validas.length === 0;
                setStatusImportEmpenhos(V.statusCurto(rel, 'NE'), rel.validas.length === 0 ? 'erro' : 'ok');
                if (V.totalProblemas(rel) > 0) {
                    alert('Análise do arquivo de empenhos concluída.\n\n' + V.statusCurto(rel, 'NE') + '\n' + V.detalhe(rel));
                }
            } catch (err) {
                console.error('Falha na análise do arquivo de empenhos:', err);
                setStatusImportEmpenhos('Erro ao analisar arquivo: ' + (err && err.message ? err.message : err), 'erro');
                resetEstadoImportEmpenhos();
                e.target.value = '';
            } finally {
                if (typeof pararBarraProgressoImport === 'function') pararBarraProgressoImport();
                if (typeof esconderLoadingImportacao === 'function') esconderLoadingImportacao();
            }
        });
    }

    if (btnImportarEmpenhos) {
        btnImportarEmpenhos.addEventListener('click', async function() {
            if (importEmpenhosEmExecucao) return;
            if (!estadoImportEmpenhos || !Array.isArray(estadoImportEmpenhos.rowsNorm) || estadoImportEmpenhos.rowsNorm.length === 0) {
                setStatusImportEmpenhos('Carregue e analise um arquivo com dados válidos antes de importar.', 'erro');
                return;
            }
            if (!verificarAdmin()) return;

            importEmpenhosEmExecucao = true;
            btnImportarEmpenhos.disabled = true;
            const importAbort = { aborted: false };
            if (typeof window.__setLoadingAbortFn === 'function') {
                window.__setLoadingAbortFn(function() { importAbort.aborted = true; });
            }
            const rel = estadoImportEmpenhos.relatorio;
            const problemasAnalise = rel ? window.sisImportValidacao.totalProblemas(rel) : 0;
            if (typeof mostrarLoadingImportacao === 'function') mostrarLoadingImportacao('Importando empenhos...');
            const totalLinhasImport = estadoImportEmpenhos.rowsNorm.length;
            if (typeof iniciarBarraProgressoImport === 'function') {
                iniciarBarraProgressoImport('Importando empenhos... 0/' + totalLinhasImport, { pct: 0, simulado: false });
            }
            try {
                const res = await executarImportacaoEmpenhos(estadoImportEmpenhos.rowsNorm, importAbort);
                await salvarUltimoImport('empenhos');
                const msgResumo = (res.interrompido ? 'Interrompido. ' : '') +
                    'Importados ' + res.inseridos + '; Atualizados ' + res.atualizados +
                    '; Ignorados na análise ' + problemasAnalise + '; Erros de gravação ' + res.erros + '.';
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

    // --- IMPORT LF/PF (2 fases: carregar/analisar arquivo -> importar dados válidos) ---
    const fileImportLfPf = document.getElementById('fileImportLfPf');
    const btnImportarLfPf = document.getElementById('btnImportarLfPf');
    const statusImportLfPf = document.getElementById('statusImportLfPf');
    let estadoImportLfPf = null;
    let importLfPfEmExecucao = false;

    const LF_ALIASES = ['N° do Pedido', 'Nº do Pedido', 'LF', 'lf', 'Numero', 'numero'];

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
    function lerLinhasArquivo(data) {
        const wb = XLSX.read(data, { type: 'array' });
        const firstSheet = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(firstSheet, { defval: '', raw: false });
        const header = XLSX.utils.sheet_to_json(firstSheet, { header: 1 })[0] || [];
        return { rows: rows, header: header };
    }
    function cabecalhoContemAlias(header, aliases) {
        const hs = (header || []).map(function(h) { return String(h || '').replace(/^\ufeff/, '').trim().toLowerCase(); });
        return aliases.some(function(a) { return hs.indexOf(String(a).trim().toLowerCase()) !== -1; });
    }
    // Etapa 1: análise sem gravar no BD. Classifica obrigatoriedade, formato e duplicidade.
    async function analisarArquivoLfPf(file) {
        const V = window.sisImportValidacao;
        const rel = V.criarRelatorio();
        const data = await readFileAsArrayBuffer(file);
        const parsed = lerLinhasArquivo(data);
        const rows = parsed.rows;
        rel.total = rows.length;

        if (!cabecalhoContemAlias(parsed.header, LF_ALIASES)) {
            rel.schemaOk = false;
            rel.schemaMsg = 'Coluna de LF (ex.: "N° do Pedido" ou "LF") não encontrada no cabeçalho.';
            return rel;
        }

        const vistosNoArquivo = {};
        for (let i = 0; i < rows.length; i++) {
            const linha = i + 2;
            const rowNorm = normalizarRowLfPf(rows[i]);
            const lfNum = getVal(rowNorm, LF_ALIASES);
            if (!lfNum || String(lfNum).trim() === '') {
                rel.problemas.obrigatorio.push({ linha: linha, motivo: 'LF (N° do Pedido) é obrigatória.' });
                continue;
            }
            const lfNorm = String(lfNum).trim().toLowerCase();

            // Formato: valor monetário e datas (quando preenchidos).
            const valorRaw = getVal(rowNorm, ['Valor (R$)', 'Valor', 'valor']);
            const valorChk = V.numero(valorRaw);
            if (!valorChk.ok) {
                rel.problemas.formato.push({ linha: linha, motivo: 'Valor inválido: "' + valorRaw + '".' });
                continue;
            }
            const dataCriacao = getVal(rowNorm, ['Data de Criação', 'Data de Criacao', 'Data Criacao', 'dataCriacao', 'DT_CRIACAO', 'DtCriacao', 'dt_criacao']);
            if (!V.dataValida(dataCriacao)) {
                rel.problemas.formato.push({ linha: linha, motivo: 'Data de Criação inválida: "' + dataCriacao + '" (use dd/mm/aaaa).' });
                continue;
            }
            const ultimaAtual = getVal(rowNorm, ['Última Atualização', 'Ultima Atualizacao', 'ultimaAtualizacao', 'ULTIMA_DT', 'UltimaDt', 'ultima_dt']);
            if (!V.dataValida(ultimaAtual)) {
                rel.problemas.formato.push({ linha: linha, motivo: 'Última Atualização inválida: "' + ultimaAtual + '" (use dd/mm/aaaa).' });
                continue;
            }

            // Duplicidade no próprio arquivo (mesma LF): mantém a primeira, reporta as demais.
            if (vistosNoArquivo[lfNorm]) {
                rel.problemas.duplicado.push({ linha: linha, motivo: 'LF "' + lfNum + '" repetida no arquivo (já vista na linha ' + vistosNoArquivo[lfNorm] + ').' });
                continue;
            }
            vistosNoArquivo[lfNorm] = linha;
            rel.validas.push({ rowNorm: rowNorm, lineIndex: linha, lfNorm: lfNorm });
        }
        return rel;
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
                setStatusImportLfPf('Selecione um arquivo para análise.', 'info');
                return;
            }
            if (!verificarAdmin()) { e.target.value = ''; return; }
            const V = window.sisImportValidacao;
            if (typeof mostrarLoadingImportacao === 'function') mostrarLoadingImportacao('Analisando arquivo LFxPF...');
            if (typeof iniciarBarraProgressoImport === 'function') iniciarBarraProgressoImport('Analisando arquivo LFxPF...', { simulado: true });
            try {
                const rel = await analisarArquivoLfPf(file);
                if (!rel.schemaOk) {
                    setStatusImportLfPf(V.statusCurto(rel, 'LF'), 'erro');
                    alert('Não foi possível analisar o arquivo.\n\n' + V.detalhe(rel));
                    resetEstadoImportLfPf();
                    e.target.value = '';
                    return;
                }
                const baseLf = typeof baseLfPf !== 'undefined' ? baseLfPf : [];
                const mapLfPorNumero = {};
                baseLf.forEach(function(d) {
                    const num = String(d.lf || '').trim().toLowerCase();
                    if (num) mapLfPorNumero[num] = d.id;
                });
                estadoImportLfPf = {
                    fileName: file.name,
                    rowsValidas: rel.validas,
                    mapLfPorNumero: mapLfPorNumero,
                    relatorio: rel
                };
                if (btnImportarLfPf) btnImportarLfPf.disabled = rel.validas.length === 0;
                setStatusImportLfPf(V.statusCurto(rel, 'LF'), rel.validas.length === 0 ? 'erro' : 'ok');
                if (V.totalProblemas(rel) > 0) {
                    alert('Análise do arquivo LFxPF concluída.\n\n' + V.statusCurto(rel, 'LF') + '\n' + V.detalhe(rel));
                }
            } catch (err) {
                console.error('Falha na análise LFxPF:', err);
                setStatusImportLfPf('Erro ao analisar arquivo: ' + (err && err.message ? err.message : err), 'erro');
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
            if (!estadoImportLfPf || !Array.isArray(estadoImportLfPf.rowsValidas) || estadoImportLfPf.rowsValidas.length === 0) {
                setStatusImportLfPf('Carregue e analise um arquivo com dados válidos antes de importar.', 'erro');
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
            const rel = estadoImportLfPf.relatorio;
            const problemasAnalise = rel ? window.sisImportValidacao.totalProblemas(rel) : 0;
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
                let msg = (res.interrompido ? 'Interrompido. ' : '') +
                    'Importados ' + res.inseridos + '; Atualizados ' + res.atualizados +
                    '; Ignorados na análise ' + problemasAnalise + '; Erros de gravação ' + errosPersist + '.';
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
