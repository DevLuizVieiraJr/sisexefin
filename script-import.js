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

    async function salvarUltimoImport(modulo) {
        try {
            await db.collection('config').doc('imports').set({ [modulo]: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
            var snap = await db.collection('config').doc('imports').get();
            if (snap.exists && typeof atualizarUltimoImportUI === 'function') atualizarUltimoImportUI(snap.data());
        } catch (e) { console.warn('Erro ao salvar último import:', e); }
    }

    // --- IMPORT DARF (chave única: codigo) ---
    const fileImportDarf = document.getElementById('fileImportDarf');
    if (fileImportDarf) {
        fileImportDarf.addEventListener('change', async function(e) {
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
                const codigosExistentes = new Set((typeof baseDarf !== 'undefined' ? baseDarf : []).map(d => String((d.codigo || '')).toLowerCase().trim()));
                let inseridos = 0, duplicados = 0, erros = 0;
                for (const row of rows) {
                    if (importAbort.aborted) break;
                    const codigo = getVal(row, ['codigo', 'Codigo', 'Código', 'CODIGO', 'cod']);
                    if (!codigo) { erros++; continue; }
                    const codigoNorm = codigo.toLowerCase();
                    if (codigosExistentes.has(codigoNorm)) { duplicados++; erros++; continue; }
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
                const atualizados = 0;
                alert((importAbort.aborted ? 'Interrompido. ' : '') + 'Importados ' + inseridos + '; Atualizados ' + atualizados + '; Erros ' + erros);
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
                const numerosExistentes = new Set((typeof baseContratos !== 'undefined' ? baseContratos : []).map(c => String((c.numContrato || '')).toLowerCase().trim()));
                let inseridos = 0, duplicados = 0, erros = 0;
                for (const row of rows) {
                    if (importAbort.aborted) break;
                    const numContrato = getVal(row, ['numContrato', 'NumContrato', 'Instrumento', 'instrumento', 'numero', 'Numero']);
                    if (!numContrato) { erros++; continue; }
                    const numNorm = numContrato.toLowerCase();
                    if (numerosExistentes.has(numNorm)) { duplicados++; erros++; continue; }
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
                const atualizados = 0;
                alert((importAbort.aborted ? 'Interrompido. ' : '') + 'Importados ' + inseridos + '; Atualizados ' + atualizados + '; Erros ' + erros);
                await salvarUltimoImport('contratos');
            } catch (err) { alert('Erro ao tentar carregar dados.'); }
            finally { esconderLoading(); e.target.value = ''; }
        });
    }

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

    // --- IMPORT EMPENHOS (chave única: numEmpenho) ---
    const fileImportEmpenhos = document.getElementById('fileImportEmpenhos');
    if (fileImportEmpenhos) {
        fileImportEmpenhos.addEventListener('change', async function(e) {
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
                const UG_PADRAO = '741000';
                const GESTAO_PADRAO = '00001';
                const PREFIX11_PADRAO = UG_PADRAO + GESTAO_PADRAO;

                function modoCompletoNEAtual() {
                    const baseAtual = (typeof baseEmpenhos !== 'undefined' ? baseEmpenhos : undefined);
                    // Se o banco ainda não foi carregado (ou está vazio), não inferimos o "modo".
                    // Assim evitamos reconstruir de sufixo 12 para ID completo indevidamente.
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
                    var neBase = String((e && e.numEmpenho) ? e.numEmpenho : '').toLowerCase().trim();
                    if (neBase && e && e.id) mapEmpenhosPorNumero[neBase] = e.id;
                });
                let inseridos = 0, atualizados = 0, erros = 0;
                for (const row of rows) {
                    if (importAbort.aborted) break;
                    var rowNorm = {};
                    Object.keys(row).forEach(function(k) {
                        var kNorm = (k.replace(/^\ufeff/, '').trim() || k);
                        rowNorm[kNorm] = row[k];
                    });
                    var numEmpenho = getVal(rowNorm, ['NE', 'numEmpenho', 'NumEmpenho', 'ne', 'numeroEmpenho', 'NumeroEmpenho']);
                    if (!numEmpenho) { erros++; continue; }
                    if (modoCompleto) {
                        const completo = completarNumEmpenho(numEmpenho);
                        if (completo) numEmpenho = completo;
                    }
                    var neNorm = String(numEmpenho).toLowerCase().trim();
                    var docIdExistente = mapEmpenhosPorNumero[neNorm];
                    if (docIdExistente) {
                        var updateData = {};
                        var subitemImport = getVal(rowNorm, ['SUBITEM', 'subitem', 'Subitem', 'SubEl', 'subel', 'subelemento', 'Subelemento']);
                        var descricaoImport = getVal(rowNorm, ['OBS', 'descricao', 'Descricao', 'obs']);
                        // Campos vazios no CSV não sobrescrevem valores existentes.
                        if (String(subitemImport || '').trim() !== '') updateData.subitem = escapeHTML(String(subitemImport).trim());
                        if (String(descricaoImport || '').trim() !== '') updateData.descricao = escapeHTML(String(descricaoImport).trim());
                        if (Object.keys(updateData).length > 0) {
                            await db.collection('empenhos').doc(docIdExistente).update(updateData);
                            atualizados++;
                        }
                        continue;
                    }
                    var dados = {
                        numEmpenho: escapeHTML(numEmpenho),
                        dataEmissao: escapeHTML(getVal(rowNorm, ['DATA', 'dataEmissao', 'DataEmissao', 'data', 'Data'])),
                        valorGlobal: parseFloat((getVal(rowNorm, ['valorGlobal', 'ValorGlobal', 'valor', 'Valor']) || '0').replace(/[^\d,.-]/g, '').replace(',', '.')) || 0,
                        nd: escapeHTML(getVal(rowNorm, ['ND', 'nd'])),
                        subitem: escapeHTML(getVal(rowNorm, ['SUBITEM', 'subitem', 'Subitem', 'SubEl', 'subel', 'subelemento', 'Subelemento'])),
                        ptres: escapeHTML(getVal(rowNorm, ['PTRES', 'ptres'])),
                        fr: escapeHTML(getVal(rowNorm, ['FR', 'fr'])),
                        docOrig: escapeHTML(getVal(rowNorm, ['AES/SOLEMP', 'docOrig', 'DocOrig', 'AES', 'aes', 'solemp', 'aessolemp', 'solempaes', 'aes_solemp', 'solemp_aes'])),
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
                        cnpj: escapeHTML(getVal(rowNorm, ['CNPJ', 'cnpj', 'cpf', 'cpfcnpj', 'cnpjcpf', 'cpf_cnpj', 'cnpj_cpf'])),
                        favorecido: escapeHTML(getVal(rowNorm, ['FAVORECIDO', 'favorecido', 'Favorecido'])),
                        pjPf: escapeHTML(getVal(rowNorm, ['PJ/PF', 'pjPf', 'PjPf', 'pj/pf'])),
                        gerencia: escapeHTML(getVal(rowNorm, ['GERÊNCIA', 'GERENCIA', 'gerencia', 'Gerencia'])),
                        projeto: escapeHTML(getVal(rowNorm, ['PROJETO', 'projeto', 'Projeto']))
                    };
                    var refEmp = await db.collection('empenhos').add(dados);
                    mapEmpenhosPorNumero[neNorm] = refEmp.id;
                    inseridos++;
                }
                alert((importAbort.aborted ? 'Interrompido. ' : '') + 'Importados ' + inseridos + '; Atualizados ' + atualizados + '; Erros ' + erros);
                await salvarUltimoImport('empenhos');
            } catch (err) { alert('Erro ao tentar carregar dados.'); }
            finally { esconderLoading(); e.target.value = ''; }
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
