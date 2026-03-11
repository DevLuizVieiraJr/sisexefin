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

    function verificarAdmin() {
        if (typeof permissoesEmCache !== 'undefined' && !permissoesEmCache.includes('acesso_admin')) {
            alert('Acesso negado. Apenas administradores podem importar.');
            return false;
        }
        return true;
    }

    // --- IMPORT DARF (chave única: codigo) ---
    const fileImportDarf = document.getElementById('fileImportDarf');
    if (fileImportDarf) {
        fileImportDarf.addEventListener('change', async function(e) {
            const file = e.target.files[0];
            if (!file) return;
            if (!verificarAdmin()) { e.target.value = ''; return; }
            mostrarLoading();
            if (typeof mostrarBarraLoading === 'function') mostrarBarraLoading('Processando...');
            try {
                const data = await readFileAsArrayBuffer(file);
                const wb = XLSX.read(data, { type: 'array' });
                const firstSheet = wb.Sheets[wb.SheetNames[0]];
                const rows = XLSX.utils.sheet_to_json(firstSheet, { defval: '', raw: false });
                const codigosExistentes = new Set((typeof baseDarf !== 'undefined' ? baseDarf : []).map(d => String((d.codigo || '')).toLowerCase().trim()));
                let inseridos = 0, duplicados = 0;
                for (const row of rows) {
                    const codigo = getVal(row, ['codigo', 'Codigo', 'Código', 'CODIGO', 'cod']);
                    if (!codigo) continue;
                    const codigoNorm = codigo.toLowerCase();
                    if (codigosExistentes.has(codigoNorm)) { duplicados++; continue; }
                    const dados = {
                        codigo: escapeHTML(codigo),
                        natRendimento: escapeHTML(getVal(row, ['natRendimento', 'NatRendimento', 'Nat.Rend', 'nat_rend'])),
                        sitSiafi: escapeHTML(getVal(row, ['sitSiafi', 'SitSiafi', 'situacao', 'Situacao'])),
                        aplicacao: escapeHTML(getVal(row, ['aplicacao', 'Aplicacao', 'Aplicação', 'descricao', 'Descricao'])),
                        ir: escapeHTML(getVal(row, ['ir', 'IR', 'ir_pct'])),
                        csll: escapeHTML(getVal(row, ['csll', 'CSLL', 'csll_pct'])),
                        cofins: escapeHTML(getVal(row, ['cofins', 'COFINS', 'cofins_pct'])),
                        pis: escapeHTML(getVal(row, ['pis', 'PIS', 'pis_pct'])),
                        total: escapeHTML(getVal(row, ['total', 'Total', 'aliquota', 'Aliquota']))
                    };
                    await db.collection('darf').add(dados);
                    codigosExistentes.add(codigoNorm);
                    inseridos++;
                }
                alert('Importação DARF: ' + inseridos + ' inseridos, ' + duplicados + ' duplicados ignorados.');
            } catch (err) { alert('Erro na importação DARF: ' + (err.message || err)); }
            finally { esconderLoading(); if (typeof esconderBarraLoading === 'function') esconderBarraLoading(); e.target.value = ''; }
        });
    }

    // --- IMPORT CONTRATOS (chave única: numContrato) ---
    const fileImportContratos = document.getElementById('fileImportContratos');
    if (fileImportContratos) {
        fileImportContratos.addEventListener('change', async function(e) {
            const file = e.target.files[0];
            if (!file) return;
            if (!verificarAdmin()) { e.target.value = ''; return; }
            mostrarLoading();
            if (typeof mostrarBarraLoading === 'function') mostrarBarraLoading('Processando...');
            try {
                const data = await readFileAsArrayBuffer(file);
                const wb = XLSX.read(data, { type: 'array' });
                const firstSheet = wb.Sheets[wb.SheetNames[0]];
                const rows = XLSX.utils.sheet_to_json(firstSheet, { defval: '', raw: false });
                const numerosExistentes = new Set((typeof baseContratos !== 'undefined' ? baseContratos : []).map(c => String((c.numContrato || '')).toLowerCase().trim()));
                let inseridos = 0, duplicados = 0;
                for (const row of rows) {
                    const numContrato = getVal(row, ['numContrato', 'NumContrato', 'Instrumento', 'instrumento', 'numero', 'Numero']);
                    if (!numContrato) continue;
                    const numNorm = numContrato.toLowerCase();
                    if (numerosExistentes.has(numNorm)) { duplicados++; continue; }
                    const valorRaw = getVal(row, ['valorContrato', 'ValorContrato', 'valor', 'Valor', 'valorGlobal']);
                    const numVal = parseFloat((valorRaw || '0').replace(/[^\d,.-]/g, '').replace(',', '.')) || 0;
                    const dados = {
                        idContrato: escapeHTML(getVal(row, ['idContrato', 'IdContrato', 'ID', 'id'])),
                        numContrato: escapeHTML(numContrato),
                        situacao: escapeHTML(getVal(row, ['situacao', 'Situacao', 'situação'])),
                        fornecedor: escapeHTML(getVal(row, ['fornecedor', 'Fornecedor'])),
                        nup: escapeHTML(getVal(row, ['nup', 'NUP', 'Nup'])),
                        dataInicio: escapeHTML(getVal(row, ['dataInicio', 'DataInicio', 'data_inicio', 'Inicio', 'inicio'])),
                        dataFim: escapeHTML(getVal(row, ['dataFim', 'DataFim', 'data_fim', 'Fim', 'fim'])),
                        valorContrato: numVal,
                        codigosReceita: []
                    };
                    await db.collection('contratos').add(dados);
                    numerosExistentes.add(numNorm);
                    inseridos++;
                }
                alert('Importação Contratos: ' + inseridos + ' inseridos, ' + duplicados + ' duplicados ignorados.');
            } catch (err) { alert('Erro na importação Contratos: ' + (err.message || err)); }
            finally { esconderLoading(); if (typeof esconderBarraLoading === 'function') esconderBarraLoading(); e.target.value = ''; }
        });
    }

    // --- IMPORT EMPENHOS (chave única: numEmpenho) ---
    const fileImportEmpenhos = document.getElementById('fileImportEmpenhos');
    if (fileImportEmpenhos) {
        fileImportEmpenhos.addEventListener('change', async function(e) {
            const file = e.target.files[0];
            if (!file) return;
            if (!verificarAdmin()) { e.target.value = ''; return; }
            mostrarLoading();
            if (typeof mostrarBarraLoading === 'function') mostrarBarraLoading('Processando...');
            try {
                const data = await readFileAsArrayBuffer(file);
                const wb = XLSX.read(data, { type: 'array' });
                const firstSheet = wb.Sheets[wb.SheetNames[0]];
                const rows = XLSX.utils.sheet_to_json(firstSheet, { defval: '', raw: false });
                const nesExistentes = new Set((typeof baseEmpenhos !== 'undefined' ? baseEmpenhos : []).map(e => String((e.numEmpenho || '')).toLowerCase().trim()));
                let inseridos = 0, duplicados = 0;
                for (const row of rows) {
                    var rowNorm = {};
                    Object.keys(row).forEach(function(k) {
                        var kNorm = (k.replace(/^\ufeff/, '').trim() || k);
                        rowNorm[kNorm] = row[k];
                    });
                    var numEmpenho = getVal(rowNorm, ['NE', 'numEmpenho', 'NumEmpenho', 'ne', 'numeroEmpenho', 'NumeroEmpenho']);
                    if (!numEmpenho) continue;
                    var neNorm = numEmpenho.toLowerCase().trim();
                    if (nesExistentes.has(neNorm)) { duplicados++; continue; }
                    var dados = {
                        numEmpenho: escapeHTML(numEmpenho),
                        dataEmissao: escapeHTML(getVal(rowNorm, ['DATA', 'dataEmissao', 'DataEmissao', 'data', 'Data'])),
                        valorGlobal: parseFloat((getVal(rowNorm, ['valorGlobal', 'ValorGlobal', 'valor', 'Valor']) || '0').replace(/[^\d,.-]/g, '').replace(',', '.')) || 0,
                        nd: escapeHTML(getVal(rowNorm, ['ND', 'nd'])),
                        subitem: escapeHTML(getVal(rowNorm, ['SUBITEM', 'subitem', 'Subitem', 'SubEl', 'subel'])),
                        ptres: escapeHTML(getVal(rowNorm, ['PTRES', 'ptres'])),
                        fr: escapeHTML(getVal(rowNorm, ['FR', 'fr'])),
                        docOrig: escapeHTML(getVal(rowNorm, ['AES/SOLEMP', 'docOrig', 'DocOrig', 'AES', 'aes'])),
                        oi: escapeHTML(getVal(rowNorm, ['OI', 'oi'])),
                        contrato: escapeHTML(getVal(rowNorm, ['CONTRATO', 'contrato', 'Contrato'])),
                        cap: escapeHTML(getVal(rowNorm, ['CAP', 'cap'])),
                        altcred: escapeHTML(getVal(rowNorm, ['ALTCRED', 'altcred', 'Altcred'])),
                        meio: escapeHTML(getVal(rowNorm, ['MEIO', 'meio', 'Meio'])),
                        descricao: escapeHTML(getVal(rowNorm, ['OBS', 'descricao', 'Descricao', 'obs'])),
                        pi: escapeHTML(getVal(rowNorm, ['PI', 'pi'])),
                        tipoNE: escapeHTML(getVal(rowNorm, ['TIPO NE', 'tipoNE', 'TipoNE', 'tipo ne'])),
                        numModal: escapeHTML(getVal(rowNorm, ['NUM MODAL', 'numModal', 'NumModal', 'num modal'])),
                        descModal: escapeHTML(getVal(rowNorm, ['DESC MODAL', 'descModal', 'DescModal', 'desc modal'])),
                        codAmp: escapeHTML(getVal(rowNorm, ['COD AMP', 'codAmp', 'CodAmp', 'cod amp'])),
                        inciso: escapeHTML(getVal(rowNorm, ['INCISO', 'inciso', 'Inciso'])),
                        lei: escapeHTML(getVal(rowNorm, ['LEI', 'lei', 'Lei'])),
                        processo: escapeHTML(getVal(rowNorm, ['PROCESSO', 'processo', 'Processo'])),
                        cnpj: escapeHTML(getVal(rowNorm, ['CNPJ', 'cnpj'])),
                        favorecido: escapeHTML(getVal(rowNorm, ['FAVORECIDO', 'favorecido', 'Favorecido'])),
                        pjPf: escapeHTML(getVal(rowNorm, ['PJ/PF', 'pjPf', 'PjPf', 'pj/pf'])),
                        gerencia: escapeHTML(getVal(rowNorm, ['GERÊNCIA', 'GERENCIA', 'gerencia', 'Gerencia'])),
                        projeto: escapeHTML(getVal(rowNorm, ['PROJETO', 'projeto', 'Projeto']))
                    };
                    await db.collection('empenhos').add(dados);
                    nesExistentes.add(neNorm);
                    inseridos++;
                }
                alert('Importação Empenhos: ' + inseridos + ' inseridos, ' + duplicados + ' duplicados ignorados.');
            } catch (err) { alert('Erro na importação Empenhos: ' + (err.message || err)); }
            finally { esconderLoading(); if (typeof esconderBarraLoading === 'function') esconderBarraLoading(); e.target.value = ''; }
        });
    }
})();
