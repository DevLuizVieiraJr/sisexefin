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
                const data = await readFileAsArrayBuffer(file);
                const wb = XLSX.read(data, { type: 'array' });
                const firstSheet = wb.Sheets[wb.SheetNames[0]];
                const rows = XLSX.utils.sheet_to_json(firstSheet, { defval: '', raw: false });
                const base = typeof baseDeducoesEncargos !== 'undefined' ? baseDeducoesEncargos : [];
                const mapDedEncPorChave = {};
                base.forEach(function(d) {
                    const chaveBase = String((d.codigo || '') + '|' + (d.tipo || '')).toLowerCase().trim();
                    if (chaveBase && d.id) mapDedEncPorChave[chaveBase] = d.id;
                });
                let inseridos = 0, atualizados = 0, erros = 0;
                for (const row of rows) {
                    if (importAbort.aborted) break;
                    const codigo = getVal(row, ['codigo', 'Codigo', 'Código', 'CODIGO', 'cod']);
                    const tipo = getVal(row, ['tipo', 'Tipo', 'TIPO']) || 'DDF025';
                    if (!codigo) { erros++; continue; }
                    const chave = (codigo + '|' + tipo).toLowerCase();
                    const parseNum = v => { const n = parseFloat(String(v || '0').replace(',', '.').replace(/[^\d.-]/g, '')); return isNaN(n) ? null : n; };
                    const dados = {
                        codigo: escapeHTML(codigo),
                        tipo: ['DDF021','DDF025','DDR001'].includes(tipo) ? tipo : 'DDF025',
                        descricao: escapeHTML(getVal(row, ['descricao', 'Descricao', 'desc'])),
                        ativo: (getVal(row, ['ativo', 'Ativo']) || '1').toLowerCase() !== '0' && (getVal(row, ['ativo', 'Ativo']) || '1').toLowerCase() !== 'nao'
                    };
                    if (dados.tipo === 'DDF021') {
                        dados.aliquotaPadrao = parseNum(getVal(row, ['aliquotaPadrao', 'AliquotaPadrao', 'aliquota']));
                        // Para DDF021 importado, replica no BD
                        dados.codReceita = dados.codigo;
                        dados.aliquotaTotal = dados.aliquotaPadrao;
                    } else if (dados.tipo === 'DDF025') {
                        dados.natRendimento = escapeHTML(getVal(row, ['natRendimento', 'NatRendimento']));
                        dados.descRendimento = escapeHTML(getVal(row, ['descRendimento', 'DescRendimento']));
                        dados.codReceita = escapeHTML(getVal(row, ['codReceita', 'CodReceita']));
                        dados.aliquotaTotal = parseNum(getVal(row, ['aliquotaTotal', 'AliquotaTotal', 'total']));
                        dados.ir = parseNum(getVal(row, ['ir', 'IR']));
                        dados.csll = parseNum(getVal(row, ['csll', 'CSLL']));
                        dados.cofins = parseNum(getVal(row, ['cofins', 'COFINS']));
                        dados.pis = parseNum(getVal(row, ['pis', 'PIS']));
                    } else if (dados.tipo === 'DDR001') {
                        dados.aliquotaPadrao = parseNum(getVal(row, ['aliquotaPadrao', 'AliquotaPadrao']));
                        dados.aliquotaMaxima = parseNum(getVal(row, ['aliquotaMaxima', 'AliquotaMaxima']));
                        // Para DDR001 importado, replica no BD
                        dados.codReceita = dados.codigo;
                        dados.aliquotaTotal = dados.aliquotaPadrao;
                    }
                    const docIdExistente = mapDedEncPorChave[chave];
                    if (docIdExistente) {
                        await db.collection('deducoesEncargos').doc(docIdExistente).update(dados);
                        atualizados++;
                    } else {
                        const ref = await db.collection('deducoesEncargos').add(dados);
                        mapDedEncPorChave[chave] = ref.id;
                        inseridos++;
                    }
                }
                alert((importAbort.aborted ? 'Interrompido. ' : '') + 'Importados ' + inseridos + '; Atualizados ' + atualizados + '; Erros ' + erros);
                await salvarUltimoImport('deducoesEncargos');
            } catch (err) { alert('Erro ao tentar carregar dados.'); }
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
                const data = await readFileAsArrayBuffer(file);
                const wb = XLSX.read(data, { type: 'array' });
                const firstSheet = wb.Sheets[wb.SheetNames[0]];
                const rows = XLSX.utils.sheet_to_json(firstSheet, { defval: '', raw: false });
                const mapaContratosPorNumero = {};
                (typeof baseContratos !== 'undefined' ? baseContratos : []).forEach(function(c) {
                    const chave = String((c.numContrato || '')).toLowerCase().trim();
                    if (chave && c.id) mapaContratosPorNumero[chave] = c.id;
                });
                let inseridos = 0, atualizados = 0, duplicados = 0, erros = 0;
                for (const row of rows) {
                    if (importAbort.aborted) break;
                    const numContrato = getVal(row, ['numContrato', 'NumContrato', 'Instrumento', 'instrumento', 'numero', 'Numero']);
                    if (!numContrato) { erros++; continue; }
                    const numNorm = numContrato.toLowerCase();
                    const valorRaw = getVal(row, ['valorContrato', 'ValorContrato', 'valor', 'Valor', 'valorGlobal']);
                    const numVal = parseValorMonetarioBR(valorRaw);
                    const cnpjFornecedorRaw = getVal(row, [
                        'cnpjFornecedor', 'cnpj_fornecedor', 'CNPJ_FORNECEDOR', 'CNPJFornecedor', 'cnpjFornecedor'
                    ]);
                    const nomeFornecedorRaw = getVal(row, [
                        'nomeFornecedor', 'nome_fornecedor', 'NOME_FORNECEDOR', 'NomeFornecedor', 'nomeFornecedor',
                        'nome', 'Nome', 'FornecedorNome'
                    ]);

                    let cnpjFornecedor = normalizarCNPJ(cnpjFornecedorRaw);
                    let nomeFornecedor = nomeFornecedorRaw || '';

                    // legado: coluna única "fornecedor" (CNPJ - Nome)
                    if (!cnpjFornecedor || !nomeFornecedor) {
                        const fornecedorRaw = getVal(row, ['fornecedor', 'Fornecedor']);
                        const parsed = extrairCnpjNomeFornecedor(fornecedorRaw);
                        cnpjFornecedor = normalizarCNPJ(parsed.cnpjFornecedor);
                        nomeFornecedor = parsed.nomeFornecedor;
                    }
                    const dados = {
                        idContrato: escapeHTML(getVal(row, ['idContrato', 'IdContrato', 'ID', 'id'])),
                        numContrato: escapeHTML(numContrato),
                        situacao: escapeHTML(getVal(row, ['situacao', 'Situacao', 'situação'])),
                        cnpjFornecedor: escapeHTML(normalizarCNPJ(cnpjFornecedor)),
                        nomeFornecedor: escapeHTML(nomeFornecedor),
                        nup: escapeHTML(getVal(row, ['nup', 'NUP', 'Nup'])),
                        dataInicio: escapeHTML(getVal(row, ['dataInicio', 'DataInicio', 'data_inicio', 'Inicio', 'inicio'])),
                        dataFim: escapeHTML(getVal(row, ['dataFim', 'DataFim', 'data_fim', 'Fim', 'fim'])),
                        valorContrato: numVal,
                        deducoesPermitidas: []
                    };
                    const docIdExistente = mapaContratosPorNumero[numNorm];
                    if (docIdExistente) {
                        await db.collection('contratos').doc(docIdExistente).update(dados);
                        atualizados++;
                        duplicados++;
                    } else {
                        const ref = await db.collection('contratos').add(dados);
                        mapaContratosPorNumero[numNorm] = ref.id;
                        inseridos++;
                    }
                }
                alert((importAbort.aborted ? 'Interrompido. ' : '') + 'Importados ' + inseridos + '; Atualizados ' + atualizados + '; Duplicados ' + duplicados + '; Erros ' + erros);
                await salvarUltimoImport('contratos');
            } catch (err) { alert('Erro ao tentar carregar dados.'); }
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
                const data = await readFileAsArrayBuffer(file);
                const wb = XLSX.read(data, { type: 'array' });
                const firstSheet = wb.Sheets[wb.SheetNames[0]];
                const rows = XLSX.utils.sheet_to_json(firstSheet, { defval: '', raw: false });
                const codigosExistentes = new Set((typeof baseFornecedores !== 'undefined' ? baseFornecedores : [])
                    .map(function(f) { return String((f.codigoNumerico || '')).toLowerCase().trim(); }));

                let inseridos = 0, duplicados = 0, erros = 0;
                for (const row of rows) {
                    if (importAbort.aborted) break;
                    var rowNorm = {};
                    Object.keys(row).forEach(function(k) {
                        var kNorm = (k.replace(/^\ufeff/, '').trim() || k);
                        rowNorm[kNorm] = row[k];
                    });

                    var codigo = getVal(rowNorm, ['codigo', 'Código', 'CPF/CNPJ', 'CpfCnpj', 'cpf_cnpj', 'cnpj_cpf', 'cpf', 'cnpj']);
                    var codigoNumerico = String(codigo || '').replace(/\D/g, '').trim();
                    if (!codigoNumerico) { erros++; continue; }

                    const codigoNorm = codigoNumerico.toLowerCase();
                    if (codigosExistentes.has(codigoNorm)) { duplicados++; erros++; continue; }

                    var tipoPessoa = getVal(rowNorm, ['tipoPessoa', 'Tipo Pessoa', 'Tipo de Pessoa', 'tipopessoa', 'pj/pf']);
                    tipoPessoa = String(tipoPessoa || '').toUpperCase();
                    if (tipoPessoa.indexOf('FIS') >= 0 || tipoPessoa === 'CPF') tipoPessoa = 'FISICA';
                    else if (tipoPessoa.indexOf('JUR') >= 0 || tipoPessoa === 'CNPJ') tipoPessoa = 'JURIDICA';
                    else tipoPessoa = (codigoNumerico.length === 11 ? 'FISICA' : 'JURIDICA');

                    var optanteSimplesRaw = getVal(rowNorm, ['optanteSimples', 'Optante de Simples', 'Optante Simples', 'simplesNacional', 'Simples Nacional']);
                    var optanteSimplesNorm = String(optanteSimplesRaw || '').trim().toLowerCase();
                    var optanteSimples = false;
                    if (optanteSimplesNorm) {
                        optanteSimples = ['sim', 's', 'true', '1', 'yes', 'y'].indexOf(optanteSimplesNorm) >= 0;
                    }

                    const dados = {
                        tipoPessoa: escapeHTML(tipoPessoa),
                        codigo: escapeHTML(codigo),
                        codigoNumerico: escapeHTML(codigoNumerico),
                        nome: escapeHTML(getVal(rowNorm, ['nome', 'Nome', 'razaoSocial', 'Razao Social', 'Fornecedor'])),
                        matrizFilial: escapeHTML(getVal(rowNorm, ['matrizFilial', 'Matriz ou Filial', 'Matriz/Filial'])),
                        contato: escapeHTML(getVal(rowNorm, ['contato', 'Contato'])),
                        telefone: escapeHTML(getVal(rowNorm, ['telefone', 'Telefone', 'fone', 'Fone'])),
                        email: escapeHTML(getVal(rowNorm, ['email', 'E-mail', 'Email'])),
                        situacaoCadastral: escapeHTML(getVal(rowNorm, ['situacaoCadastral', 'Situação Cadastral', 'Situacao Cadastral', 'situacao']) || 'ATIVO'),
                        optanteSimples: optanteSimples,
                        endereco: escapeHTML(getVal(rowNorm, ['endereco', 'Endereço', 'Endereco'])),
                        ativo: true
                    };

                    await db.collection('fornecedores').add(dados);
                    codigosExistentes.add(codigoNorm);
                    inseridos++;
                }
                const atualizados = 0;
                alert((importAbort.aborted ? 'Interrompido. ' : '') + 'Importados ' + inseridos + '; Atualizados ' + atualizados + '; Erros ' + erros);
                await salvarUltimoImport('fornecedores');
            } catch (err) { alert('Erro ao tentar carregar dados.'); }
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
        const UG_PADRAO = '741000';
        const GESTAO_PADRAO = '00001';
        const PREFIX11_PADRAO = UG_PADRAO + GESTAO_PADRAO;
        function modoCompletoNEAtual() {
            const baseAtual = (typeof baseEmpenhos !== 'undefined' ? baseEmpenhos : undefined);
            if (!Array.isArray(baseAtual) || baseAtual.length === 0) return false;
            return baseAtual.some(e => String((e && e.numEmpenho) ? e.numEmpenho : '').trim().length > 12);
        }
        function completarNumEmpenho(numEmpenho) {
            const s = String(numEmpenho || '').trim();
            if (!s) return '';
            if (s.length > 12) return s;
            const m = s.match(/^(\d{4})([A-Za-z]{2})(\d{6})$/);
            if (!m) return '';
            const ano = m[1];
            const tipoUpper = (m[2] || '').toUpperCase();
            const seq = m[3];
            if (tipoUpper !== 'NE') return '';
            return PREFIX11_PADRAO + ano + 'NE' + seq;
        }
        const modoCompleto = modoCompletoNEAtual();
        const baseEmp = (typeof baseEmpenhos !== 'undefined' ? baseEmpenhos : []);
        const mapEmpenhosPorNumero = {};
        baseEmp.forEach(function(e) {
            const neBase = String((e && (e.numEmpenho || e.numNE)) ? (e.numEmpenho || e.numNE) : '').toLowerCase().trim();
            if (neBase && e && e.id) mapEmpenhosPorNumero[neBase] = e.id;
        });

        let inseridos = 0, atualizados = 0, erros = 0, processados = 0;
        let pendentes = [];
        const LIMITE_LOTE = 350;
        const totalLinhas = rowsNorm.length || 0;
        const flushPendentes = async function() {
            if (pendentes.length === 0) return;
            const batch = db.batch();
            for (let i = 0; i < pendentes.length; i++) {
                const op = pendentes[i];
                if (op.tipo === 'set') batch.set(op.ref, op.data);
                else batch.update(op.ref, op.data);
            }
            await batch.commit();
            for (let i = 0; i < pendentes.length; i++) {
                if (pendentes[i].tipo === 'set') inseridos++;
                else atualizados++;
            }
            pendentes = [];
        };

        window.__suspenderAtualizacaoEmpenhos = true;
        window.__empenhosRefreshPendente = false;
        if (typeof mostrarBarraLoading === 'function') mostrarBarraLoading('Importando empenhos... 0/' + totalLinhas);

        try {
            for (const rowNorm of rowsNorm) {
                if (importAbort.aborted) break;
                processados++;
                if (processados % 25 === 0) await new Promise(resolve => setTimeout(resolve, 0));
                if (processados % 100 === 0 || processados === totalLinhas) {
                    if (typeof mostrarBarraLoading === 'function') mostrarBarraLoading('Importando empenhos... ' + processados + '/' + totalLinhas);
                }

                let numEmpenho = valorPorAliasesImportEmpenho(rowNorm, ['NE', 'ne', 'NumEmpenho', 'numEmpenho', 'numeroEmpenho', 'NumeroEmpenho', 'numNE', 'NUMNE']);
                if (!numEmpenho) { erros++; continue; }
                if (modoCompleto) {
                    const completo = completarNumEmpenho(numEmpenho);
                    if (completo) numEmpenho = completo;
                }
                const neNorm = String(numEmpenho).toLowerCase().trim();
                const docIdExistente = mapEmpenhosPorNumero[neNorm];
                if (docIdExistente) {
                    const updateData = {};
                    const subitemImport = valorPorAliasesImportEmpenho(rowNorm, ['SUBITEM', 'subitem', 'Subitem', 'SubEl', 'subel', 'subelemento', 'Subelemento']);
                    const descricaoImportUpd = valorPorAliasesImportEmpenho(rowNorm, ['descricao', 'Descricao', 'DESCRICAO']);
                    const observacoesImportUpd = valorPorAliasesImportEmpenho(rowNorm, ['OBS', 'obs', 'observacoes', 'Observacoes', 'OBSERVACOES']);
                    const cnpjCpfImportUpd = valorPorAliasesImportEmpenho(rowNorm, ['cnpjCpf', 'cnpjcpf', 'CNPJCPF', 'cnpj_cpf', 'cpf_cnpj', 'cpfcnpj', 'cnpj', 'CNPJ', 'cpf', 'CPF']);
                    const pjPfImport = valorPorAliasesImportEmpenho(rowNorm, ['PJ/PF', 'pjPf', 'PjPf', 'pj/pf', 'pjpf']);
                    const ugeImportUpd = valorPorAliasesImportEmpenho(rowNorm, ['UGE', 'uge', 'ugEmitente', 'UGEMITENTE']);
                    if (String(subitemImport || '').trim() !== '') updateData.subitem = escapeHTML(String(subitemImport).trim());
                    if (String(descricaoImportUpd || '').trim() !== '') updateData.descricao = escapeHTML(String(descricaoImportUpd).trim());
                    if (String(observacoesImportUpd || '').trim() !== '') updateData.observacoes = escapeHTML(String(observacoesImportUpd).trim());
                    if (String(cnpjCpfImportUpd || '').trim() !== '') {
                        const cnpjCpfEsc = escapeHTML(String(cnpjCpfImportUpd).trim());
                        updateData.cnpjCpf = cnpjCpfEsc;
                        updateData.cnpj = cnpjCpfEsc;
                    }
                    if (String(pjPfImport || '').trim() !== '') updateData.pjPf = escapeHTML(String(pjPfImport).trim());
                    if (String(ugeImportUpd || '').trim() !== '') {
                        const ugeEsc = escapeHTML(String(ugeImportUpd).trim());
                        updateData.uge = ugeEsc;
                        updateData.ugEmitente = ugeEsc;
                    }
                    if (Object.keys(updateData).length > 0) {
                        pendentes.push({ tipo: 'update', ref: db.collection('empenhos').doc(docIdExistente), data: updateData });
                        if (pendentes.length >= LIMITE_LOTE) await flushPendentes();
                    }
                    continue;
                }

                const valorRaw = valorPorAliasesImportEmpenho(rowNorm, ['valorGlobal', 'ValorGlobal', 'valor', 'Valor']);
                const cnpjCpfImport = valorPorAliasesImportEmpenho(rowNorm, ['cnpjCpf', 'cnpjcpf', 'CNPJCPF', 'cnpj_cpf', 'cpf_cnpj', 'cpfcnpj', 'cnpj', 'CNPJ', 'cpf', 'CPF']);
                const observacoesImport = valorPorAliasesImportEmpenho(rowNorm, ['OBS', 'obs', 'observacoes', 'Observacoes', 'OBSERVACOES']);
                const descricaoImport = valorPorAliasesImportEmpenho(rowNorm, ['descricao', 'Descricao', 'DESCRICAO']) || observacoesImport;
                const ugeImport = valorPorAliasesImportEmpenho(rowNorm, ['UGE', 'uge', 'ugEmitente', 'UGEMITENTE']);
                const dados = {
                    numEmpenho: escapeHTML(numEmpenho),
                    numNE: escapeHTML(numEmpenho),
                    dataEmissao: escapeHTML(valorPorAliasesImportEmpenho(rowNorm, ['DATA', 'data', 'Data', 'dataEmissao', 'DataEmissao'])),
                    valorGlobal: parseValorMonetarioBR(valorRaw),
                    nd: escapeHTML(valorPorAliasesImportEmpenho(rowNorm, ['ND', 'nd'])),
                    subitem: escapeHTML(valorPorAliasesImportEmpenho(rowNorm, ['SUBITEM', 'subitem', 'Subitem', 'SubEl', 'subel', 'subelemento', 'Subelemento'])),
                    ptres: escapeHTML(valorPorAliasesImportEmpenho(rowNorm, ['PTRES', 'ptres'])),
                    fr: escapeHTML(valorPorAliasesImportEmpenho(rowNorm, ['FR', 'fr'])),
                    docOrig: escapeHTML(valorPorAliasesImportEmpenho(rowNorm, ['AES/SOLEMP', 'docOrig', 'DocOrig', 'AES', 'aes', 'solemp', 'aessolemp', 'solempaes', 'aes_solemp', 'solemp_aes'])),
                    oi: escapeHTML(valorPorAliasesImportEmpenho(rowNorm, ['OI', 'oi'])),
                    contrato: escapeHTML(valorPorAliasesImportEmpenho(rowNorm, ['CONTRATO', 'contrato', 'Contrato'])),
                    cap: escapeHTML(valorPorAliasesImportEmpenho(rowNorm, ['CAP', 'cap'])),
                    altcred: escapeHTML(valorPorAliasesImportEmpenho(rowNorm, ['ALTCRED', 'altcred', 'Altcred'])),
                    meio: escapeHTML(valorPorAliasesImportEmpenho(rowNorm, ['MEIO', 'meio', 'Meio'])),
                    descricao: escapeHTML(descricaoImport),
                    observacoes: escapeHTML(observacoesImport),
                    pi: escapeHTML(valorPorAliasesImportEmpenho(rowNorm, ['PI', 'pi'])),
                    tipoNE: escapeHTML(valorPorAliasesImportEmpenho(rowNorm, ['TIPO NE', 'tipoNE', 'TipoNE', 'tipo ne'])),
                    numModal: escapeHTML(valorPorAliasesImportEmpenho(rowNorm, ['NUM MODAL', 'numModal', 'NumModal', 'num modal'])),
                    descModal: escapeHTML(valorPorAliasesImportEmpenho(rowNorm, ['DESC MODAL', 'descModal', 'DescModal', 'desc modal'])),
                    codAmp: escapeHTML(valorPorAliasesImportEmpenho(rowNorm, ['COD AMP', 'codAmp', 'CodAmp', 'cod amp'])),
                    inciso: escapeHTML(valorPorAliasesImportEmpenho(rowNorm, ['INCISO', 'inciso', 'Inciso'])),
                    lei: escapeHTML(valorPorAliasesImportEmpenho(rowNorm, ['LEI', 'lei', 'Lei'])),
                    processo: escapeHTML(valorPorAliasesImportEmpenho(rowNorm, ['PROCESSO', 'processo', 'Processo'])),
                    cnpjCpf: escapeHTML(cnpjCpfImport),
                    cnpj: escapeHTML(cnpjCpfImport),
                    favorecido: escapeHTML(valorPorAliasesImportEmpenho(rowNorm, ['FAVORECIDO', 'favorecido', 'Favorecido'])),
                    pjPf: escapeHTML(valorPorAliasesImportEmpenho(rowNorm, ['PJ/PF', 'pjPf', 'PjPf', 'pj/pf'])),
                    gerencia: escapeHTML(valorPorAliasesImportEmpenho(rowNorm, ['GERÊNCIA', 'GERENCIA', 'gerencia', 'Gerencia'])),
                    projeto: escapeHTML(valorPorAliasesImportEmpenho(rowNorm, ['PROJETO', 'projeto', 'Projeto'])),
                    uge: escapeHTML(ugeImport),
                    ugEmitente: escapeHTML(ugeImport)
                };
                if (window.sisAnoDocumento && typeof window.sisAnoDocumento.aplicarAnosEmpenho === 'function') {
                    window.sisAnoDocumento.aplicarAnosEmpenho(dados);
                }
                const anoEmImp = valorPorAliasesImportEmpenho(rowNorm, ['ANO_EMISSAO', 'AnoEmissao', 'anoEmissao', 'ano_emissao']);
                const anoExImp = valorPorAliasesImportEmpenho(rowNorm, ['ANO_EXERCICIO', 'AnoExercicio', 'anoExercicio', 'ano_exercicio']);
                if (window.sisAnoDocumento && anoEmImp) {
                    const ae = window.sisAnoDocumento.anoValido(anoEmImp);
                    if (ae != null) dados.anoEmissao = ae;
                }
                if (window.sisAnoDocumento && anoExImp) {
                    const ax = window.sisAnoDocumento.anoValido(anoExImp);
                    if (ax != null) dados.anoExercicio = ax;
                }
                const refEmp = db.collection('empenhos').doc();
                pendentes.push({ tipo: 'set', ref: refEmp, data: dados });
                mapEmpenhosPorNumero[neNorm] = refEmp.id;
                if (pendentes.length >= LIMITE_LOTE) await flushPendentes();
            }
            await flushPendentes();
            return { inseridos, atualizados, erros, interrompido: importAbort.aborted };
        } finally {
            window.__suspenderAtualizacaoEmpenhos = false;
            if (window.__empenhosRefreshPendente && typeof atualizarTabelaEmpenhos === 'function') {
                atualizarTabelaEmpenhos();
                window.__empenhosRefreshPendente = false;
            }
        }
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
            mostrarLoading('Validando arquivo de empenhos...');
            try {
                const validacao = await validarArquivoEmpenhos(file);
                estadoImportEmpenhos = { fileName: file.name, rowsNorm: validacao.rowsNorm };
                if (btnImportarEmpenhos) btnImportarEmpenhos.disabled = false;
                setStatusImportEmpenhos(
                    'Arquivo validado: ' + validacao.total + ' linha(s), ' + validacao.validas + ' válida(s), ' + validacao.invalidas + ' inválida(s). Pronto para importar.',
                    'ok'
                );
            } catch (err) {
                console.error('Falha na validação do arquivo de empenhos:', err);
                setStatusImportEmpenhos('Erro ao validar arquivo: ' + (err && err.message ? err.message : err), 'erro');
                resetEstadoImportEmpenhos();
            } finally {
                esconderLoading();
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
            mostrarLoading('Importando empenhos...');
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
                esconderBarraLoading();
                esconderLoading();
            }
        });
    }

    // --- IMPORT CENTRO DE CUSTOS (chave única: codigo) ---
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
                const data = await readFileAsArrayBuffer(file);
                const wb = XLSX.read(data, { type: 'array' });
                const firstSheet = wb.Sheets[wb.SheetNames[0]];
                const rows = XLSX.utils.sheet_to_json(firstSheet, { defval: '', raw: false });
                const baseCC = typeof baseCentroCustos !== 'undefined' ? baseCentroCustos : [];
                const mapCentroCustosPorCodigo = {};

                baseCC.forEach(function(item) {
                    var codigoBase = String(item.codigo || '').trim().toLowerCase();
                    if (codigoBase && item.id) mapCentroCustosPorCodigo[codigoBase] = item.id;
                });

                var inseridos = 0, atualizados = 0, erros = 0;
                for (var i = 0; i < rows.length; i++) {
                    if (importAbort.aborted) break;
                    var row = rows[i];
                    var rowNorm = {};
                    Object.keys(row).forEach(function(k) {
                        rowNorm[(k.replace(/^\ufeff/, '') || k).trim()] = row[k];
                    });

                    var codigo = getVal(rowNorm, ['Código', 'Codigo', 'codigo', 'CODIGO']);
                    if (!codigo) { erros++; continue; }

                    var aplicacao = getVal(rowNorm, ['Aplicação', 'Aplicacao', 'aplicacao', 'APLICACAO']);
                    var descricao = getVal(rowNorm, ['Descrição', 'Descricao', 'descricao', 'DESCRICAO']);
                    var codigoNorm = String(codigo).trim().toLowerCase();
                    var dados = {
                        codigo: escapeHTML(String(codigo).trim()),
                        aplicacao: escapeHTML(aplicacao),
                        descricao: escapeHTML(descricao),
                        ativo: true
                    };

                    var docId = mapCentroCustosPorCodigo[codigoNorm];
                    if (docId) {
                        await db.collection('centroCustos').doc(docId).update(dados);
                        atualizados++;
                    } else {
                        var refCC = await db.collection('centroCustos').add(dados);
                        mapCentroCustosPorCodigo[codigoNorm] = refCC.id;
                        inseridos++;
                    }
                }

                alert((importAbort.aborted ? 'Interrompido. ' : '') + 'Importados ' + inseridos + '; Atualizados ' + atualizados + '; Erros ' + erros);
                await salvarUltimoImport('centroCustos');
            } catch (err) {
                alert('Erro ao tentar carregar dados.');
            } finally {
                esconderLoading();
                e.target.value = '';
            }
        });
    }

    // --- IMPORT LF/PF (Liquidação Financeira): se LF não existe insere; se existe atualiza apenas Situação, PF, Última Atualização
    const fileImportLfPf = document.getElementById('fileImportLfPf');
    if (fileImportLfPf) {
        fileImportLfPf.addEventListener('change', async function(e) {
            const file = e.target.files[0];
            if (!file) return;
            if (!verificarAdmin()) { e.target.value = ''; return; }
            mostrarLoading();

            const importAbort = { aborted: false };
            if (typeof window.__setLoadingAbortFn === 'function') {
                window.__setLoadingAbortFn(function() { importAbort.aborted = true; });
            }
            try {
                const data = await readFileAsArrayBuffer(file);
                const wb = XLSX.read(data, { type: 'array' });
                const firstSheet = wb.Sheets[wb.SheetNames[0]];
                const rows = XLSX.utils.sheet_to_json(firstSheet, { defval: '', raw: false });
                const baseLf = typeof baseLfPf !== 'undefined' ? baseLfPf : [];
                const mapLfPorNumero = {};
                baseLf.forEach(function(d) {
                    var num = String(d.lf || '').trim().toLowerCase();
                    if (num) mapLfPorNumero[num] = d.id;
                });
                var inseridos = 0, atualizados = 0, erros = [];
                var userEmail = (typeof auth !== 'undefined' && auth.currentUser && auth.currentUser.email) ? auth.currentUser.email : '';
                for (var i = 0; i < rows.length; i++) {
                    if (importAbort.aborted) break;
                    var row = rows[i];
                    var keys = Object.keys(row);
                    var rowNorm = {};
                    keys.forEach(function(k) { rowNorm[(k.replace(/^\ufeff/, '') || k).trim()] = row[k]; });
                    var lfNum = getVal(rowNorm, ['N° do Pedido', 'Nº do Pedido', 'LF', 'lf', 'Numero', 'numero']);
                    if (!lfNum || String(lfNum).trim() === '') { erros.push('Linha ' + (i + 2) + ': LF vazia'); continue; }
                    var lfNorm = String(lfNum).trim().toLowerCase();
                    var valorRaw = getVal(rowNorm, ['Valor (R$)', 'Valor', 'valor']);
                    var numVal = parseFloat((valorRaw || '0').replace(/[^\d,.-]/g, '').replace(',', '.')) || 0;
                    var dataCriacao = getVal(rowNorm, ['Data de Criação', 'Data de Criacao', 'Data Criacao', 'dataCriacao', 'DT_CRIACAO', 'DtCriacao', 'dt_criacao']);
                    var ultimaAtual = getVal(rowNorm, ['Última Atualização', 'Ultima Atualizacao', 'ultimaAtualizacao', 'ULTIMA_DT', 'UltimaDt', 'ultima_dt']);
                    var situacao = getVal(rowNorm, ['Situação', 'Situacao', 'situacao']);
                    var pf = getVal(rowNorm, ['PF', 'pf']);
                    var docId = mapLfPorNumero[lfNorm];
                    if (docId) {
                        try {
                            var updateData = { updatedAt: firebase.firestore.FieldValue.serverTimestamp(), updatedBy: userEmail };
                            if (situacao) updateData.situacao = situacao;
                            if (pf !== undefined && pf !== null && String(pf).trim() !== '') updateData.pf = escapeHTML(String(pf).trim());
                            if (ultimaAtual) updateData.ultimaAtualizacao = ultimaAtual;
                            var anoLfUp = getVal(rowNorm, ['ANO_EMISSAO', 'AnoEmissao', 'anoEmissao', 'ANO_EXERCICIO', 'AnoExercicio', 'anoExercicio']);
                            if (anoLfUp && window.sisAnoDocumento && window.sisAnoDocumento.anoValido(anoLfUp) != null) {
                                var yLf = window.sisAnoDocumento.anoValido(anoLfUp);
                                updateData.anoEmissao = yLf;
                                updateData.anoExercicio = yLf;
                            }
                            await db.collection('lfpf').doc(docId).update(updateData);
                            atualizados++;
                        } catch (err) { erros.push('Linha ' + (i + 2) + ': ' + (err.message || err)); }
                    } else {
                        try {
                            var dados = {
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
                            var anoLfNovo = getVal(rowNorm, ['ANO_EMISSAO', 'AnoEmissao', 'anoEmissao', 'ANO_EXERCICIO', 'AnoExercicio', 'anoExercicio']);
                            if (anoLfNovo && window.sisAnoDocumento && window.sisAnoDocumento.anoValido(anoLfNovo) != null) {
                                var yN = window.sisAnoDocumento.anoValido(anoLfNovo);
                                dados.anoEmissao = yN;
                                dados.anoExercicio = yN;
                            }
                            var ref = await db.collection('lfpf').add(dados);
                            mapLfPorNumero[lfNorm] = ref.id;
                            inseridos++;
                        } catch (err) { erros.push('Linha ' + (i + 2) + ': ' + (err.message || err)); }
                    }
                }

                var msg = (importAbort.aborted ? 'Interrompido. ' : '') + 'Importados ' + inseridos + '; Atualizados ' + atualizados + '; Erros ' + erros.length;
                if (erros.length > 0) {
                    msg += '\n\nErros (' + erros.length + '):\n' + erros.slice(0, 20).join('\n') + (erros.length > 20 ? '\n...' : '');
                }
                alert(msg);
                await salvarUltimoImport('lfpf');
            } catch (err) { alert('Erro ao tentar carregar dados.'); }
            finally { esconderLoading(); e.target.value = ''; }
        });
    }
})();
