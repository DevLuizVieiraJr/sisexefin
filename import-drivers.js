// ==========================================
// DRIVERS DE IMPORTACAO POR MODULO
// ==========================================
(function() {
    if (window.ImportDrivers) return;

    function pick(row, aliases) {
        for (let i = 0; i < aliases.length; i++) {
            const key = aliases[i];
            const val = row[key];
            if (val !== undefined && val !== null && String(val).trim() !== '') return String(val).trim();
        }
        const normalizar = window.ImportEngine && typeof window.ImportEngine.normalizeHeaderToken === 'function'
            ? window.ImportEngine.normalizeHeaderToken
            : function(v) {
                return String(v || '')
                    .trim()
                    .toLowerCase()
                    .normalize('NFD')
                    .replace(/[\u0300-\u036f]/g, '');
            };
        const normRow = {};
        Object.keys(row || {}).forEach(function(k) {
            normRow[normalizar(k)] = row[k];
        });
        for (let i = 0; i < aliases.length; i++) {
            const val = normRow[normalizar(aliases[i])];
            if (val !== undefined && val !== null && String(val).trim() !== '') return String(val).trim();
        }
        return '';
    }

    function incluirSeValor(destino, campo, valor, transform) {
        if (valor === undefined || valor === null || String(valor).trim() === '') return;
        destino[campo] = transform ? transform(valor) : valor;
    }

    function normalizeCentroCustosRow(row) {
        const r = window.ImportEngine ? window.ImportEngine.normalizeRowKeys(row) : (row || {});
        const codigo = pick(r, ['Codigo', 'Código', 'codigo', 'CODIGO']).trim();
        const aplicacao = pick(r, ['Aplicacao', 'Aplicação', 'aplicacao', 'APLICACAO']).trim();
        const descricao = pick(r, ['Descricao', 'Descrição', 'descricao', 'DESCRICAO']).trim();
        return { codigo, aplicacao, descricao };
    }

    function normalizeUnidadesGestorasRow(row) {
        const r = window.ImportEngine ? window.ImportEngine.normalizeRowKeys(row) : (row || {});
        const codigo = pick(r, ['Codigo', 'Código', 'codigo', 'CODIGO']).trim();
        const indicativoNaval = pick(r, ['Indicativo Naval', 'indicativoNaval', 'indicativo_naval', 'INDICATIVO_NAVAL']).trim();
        const nome = pick(r, ['Nome', 'nome', 'NOME']).trim();
        const comimsup = pick(r, ['Comimsup', 'COMIMSUP', 'comimsup']).trim();
        const contato = pick(r, ['Contato', 'contato', 'CONTATO']).trim();
        return { codigo, indicativoNaval, nome, comimsup, contato };
    }

    function normalizarCNPJ(v) {
        return String(v || '').replace(/\D/g, '').slice(0, 14);
    }

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

    function parseNum(v) {
        const n = parseFloat(String(v || '0').replace(',', '.').replace(/[^\d.-]/g, ''));
        return isNaN(n) ? null : n;
    }

    function parseValorMonetarioBR(valor) {
        var s = String(valor || '').trim();
        if (!s) return 0;
        s = s.replace(/\s+/g, '').replace(/[Rr]\$/g, '').replace(/[^\d,.-]/g, '');
        if (s.indexOf(',') !== -1) s = s.replace(/\./g, '').replace(',', '.');
        var n = Number(s);
        return isNaN(n) ? 0 : n;
    }

    function normalizeDeducaoRow(row) {
        const r = window.ImportEngine ? window.ImportEngine.normalizeRowKeys(row) : (row || {});
        const codigo = pick(r, ['codigo', 'Codigo', 'Código', 'CODIGO', 'cod']);
        const tipoRaw = pick(r, ['tipo', 'Tipo', 'TIPO']) || 'DDF025';
        const tipo = ['DDF021', 'DDF025', 'DDR001'].includes(tipoRaw) ? tipoRaw : 'DDF025';
        const dados = {
            codigo: escapeHTML(codigo),
            tipo: tipo,
            descricao: escapeHTML(pick(r, ['descricao', 'Descricao', 'desc'])),
            ativo: (pick(r, ['ativo', 'Ativo']) || '1').toLowerCase() !== '0' && (pick(r, ['ativo', 'Ativo']) || '1').toLowerCase() !== 'nao'
        };
        if (tipo === 'DDF021') {
            dados.aliquotaPadrao = parseNum(pick(r, ['aliquotaPadrao', 'AliquotaPadrao', 'aliquota']));
            dados.codReceita = dados.codigo;
            dados.aliquotaTotal = dados.aliquotaPadrao;
        } else if (tipo === 'DDF025') {
            dados.natRendimento = escapeHTML(pick(r, ['natRendimento', 'NatRendimento']));
            dados.descRendimento = escapeHTML(pick(r, ['descRendimento', 'DescRendimento']));
            dados.codReceita = escapeHTML(pick(r, ['codReceita', 'CodReceita']));
            dados.aliquotaTotal = parseNum(pick(r, ['aliquotaTotal', 'AliquotaTotal', 'total']));
            dados.ir = parseNum(pick(r, ['ir', 'IR']));
            dados.csll = parseNum(pick(r, ['csll', 'CSLL']));
            dados.cofins = parseNum(pick(r, ['cofins', 'COFINS']));
            dados.pis = parseNum(pick(r, ['pis', 'PIS']));
        } else if (tipo === 'DDR001') {
            dados.aliquotaPadrao = parseNum(pick(r, ['aliquotaPadrao', 'AliquotaPadrao']));
            dados.aliquotaMaxima = parseNum(pick(r, ['aliquotaMaxima', 'AliquotaMaxima']));
            dados.codReceita = dados.codigo;
            dados.aliquotaTotal = dados.aliquotaPadrao;
        }
        return { codigo, tipo, dados };
    }

    function normalizarTipoRegistroImport(val) {
        const t = String(val || '').trim().toLowerCase();
        if (t === 'ata' || t === 'arp' || t.indexOf('ata') === 0) return 'Ata';
        return 'Contrato';
    }

    function normalizeContratoRow(row) {
        const r = window.ImportEngine ? window.ImportEngine.normalizeRowKeys(row) : (row || {});
        const numContrato = pick(r, ['numContrato', 'NumContrato', 'Instrumento', 'instrumento', 'numero', 'Numero']);
        const tipoRegistroRaw = pick(r, ['tipoRegistro', 'TipoRegistro', 'Tipo de Registro', 'tipo de registro', 'Tipo', 'tipo']);
        const valorRaw = pick(r, ['valorContrato', 'ValorContrato', 'valor', 'Valor', 'valorGlobal']);
        const idContratoRaw = pick(r, ['idContrato', 'IdContrato', 'ID', 'id']);
        const situacaoRaw = pick(r, ['situacao', 'Situacao', 'situação', 'Situação']);
        const nupRaw = pick(r, ['nup', 'NUP', 'Nup']);
        const dataInicioRaw = pick(r, ['dataInicio', 'DataInicio', 'data_inicio', 'Inicio', 'inicio', 'Data Início', 'Data Inicio']);
        const dataFimRaw = pick(r, ['dataFim', 'DataFim', 'data_fim', 'Fim', 'fim', 'Data Fim']);
        const cnpjFornecedorRaw = pick(r, ['cnpjFornecedor', 'cnpj_fornecedor', 'CNPJ_FORNECEDOR', 'CNPJFornecedor', 'Fornecedor CNPJ', 'CNPJ Fornecedor']);
        const nomeFornecedorRaw = pick(r, ['nomeFornecedor', 'nome_fornecedor', 'NOME_FORNECEDOR', 'NomeFornecedor', 'nome', 'Nome', 'FornecedorNome', 'Fornecedor Nome', 'Nome Fornecedor']);
        const fornecedorRaw = pick(r, ['fornecedor', 'Fornecedor']);
        let cnpjFornecedor = normalizarCNPJ(cnpjFornecedorRaw);
        let nomeFornecedor = nomeFornecedorRaw || '';
        if (!cnpjFornecedor || !nomeFornecedor) {
            const parsed = extrairCnpjNomeFornecedor(fornecedorRaw);
            if (!cnpjFornecedor) cnpjFornecedor = normalizarCNPJ(parsed.cnpjFornecedor);
            if (!nomeFornecedor) nomeFornecedor = parsed.nomeFornecedor;
        }
        const dados = {
            tipoRegistro: escapeHTML(normalizarTipoRegistroImport(tipoRegistroRaw)),
            idContrato: escapeHTML(idContratoRaw),
            numContrato: escapeHTML(numContrato),
            situacao: escapeHTML(situacaoRaw),
            cnpjFornecedor: escapeHTML(normalizarCNPJ(cnpjFornecedor)),
            nomeFornecedor: escapeHTML(nomeFornecedor),
            nup: escapeHTML(nupRaw),
            dataInicio: escapeHTML(dataInicioRaw),
            dataFim: escapeHTML(dataFimRaw),
            valorContrato: parseValorMonetarioBR(valorRaw),
            deducoesPermitidas: []
        };
        const dadosUpdate = {};
        incluirSeValor(dadosUpdate, 'tipoRegistro', tipoRegistroRaw, function(v) { return escapeHTML(normalizarTipoRegistroImport(v)); });
        incluirSeValor(dadosUpdate, 'idContrato', idContratoRaw, escapeHTML);
        incluirSeValor(dadosUpdate, 'numContrato', numContrato, escapeHTML);
        incluirSeValor(dadosUpdate, 'situacao', situacaoRaw, escapeHTML);
        incluirSeValor(dadosUpdate, 'cnpjFornecedor', cnpjFornecedor, function(v) { return escapeHTML(normalizarCNPJ(v)); });
        incluirSeValor(dadosUpdate, 'nomeFornecedor', nomeFornecedor, escapeHTML);
        incluirSeValor(dadosUpdate, 'nup', nupRaw, escapeHTML);
        incluirSeValor(dadosUpdate, 'dataInicio', dataInicioRaw, escapeHTML);
        incluirSeValor(dadosUpdate, 'dataFim', dataFimRaw, escapeHTML);
        if (valorRaw !== undefined && valorRaw !== null && String(valorRaw).trim() !== '') {
            dadosUpdate.valorContrato = parseValorMonetarioBR(valorRaw);
        }
        return {
            numContrato,
            dados,
            dadosUpdate
        };
    }

    function normalizeFornecedorRow(row) {
        const r = window.ImportEngine ? window.ImportEngine.normalizeRowKeys(row) : (row || {});
        const codigo = pick(r, ['codigo', 'Código', 'CPF/CNPJ', 'CpfCnpj', 'cpf_cnpj', 'cnpj_cpf', 'cpf', 'cnpj']);
        const codigoNumerico = String(codigo || '').replace(/\D/g, '').trim();
        let tipoPessoa = pick(r, ['tipoPessoa', 'Tipo Pessoa', 'Tipo de Pessoa', 'tipopessoa', 'pj/pf']);
        tipoPessoa = String(tipoPessoa || '').toUpperCase();
        if (tipoPessoa.indexOf('FIS') >= 0 || tipoPessoa === 'CPF') tipoPessoa = 'FISICA';
        else if (tipoPessoa.indexOf('JUR') >= 0 || tipoPessoa === 'CNPJ') tipoPessoa = 'JURIDICA';
        else tipoPessoa = (codigoNumerico.length === 11 ? 'FISICA' : 'JURIDICA');
        var optanteSimplesRaw = pick(r, ['optanteSimples', 'Optante de Simples', 'Optante Simples', 'simplesNacional', 'Simples Nacional']);
        var optanteSimplesNorm = String(optanteSimplesRaw || '').trim().toLowerCase();
        var optanteSimples = false;
        if (optanteSimplesNorm) optanteSimples = ['sim', 's', 'true', '1', 'yes', 'y'].indexOf(optanteSimplesNorm) >= 0;
        return {
            codigoNumerico,
            dados: {
                tipoPessoa: escapeHTML(tipoPessoa),
                codigo: escapeHTML(codigo),
                codigoNumerico: escapeHTML(codigoNumerico),
                nome: escapeHTML(pick(r, ['nome', 'Nome', 'razaoSocial', 'Razao Social', 'Fornecedor'])),
                matrizFilial: escapeHTML(pick(r, ['matrizFilial', 'Matriz ou Filial', 'Matriz/Filial'])),
                contato: escapeHTML(pick(r, ['contato', 'Contato'])),
                telefone: escapeHTML(pick(r, ['telefone', 'Telefone', 'fone', 'Fone'])),
                email: escapeHTML(pick(r, ['email', 'E-mail', 'Email'])),
                situacaoCadastral: escapeHTML(pick(r, ['situacaoCadastral', 'Situação Cadastral', 'Situacao Cadastral', 'situacao']) || 'ATIVO'),
                optanteSimples: optanteSimples,
                endereco: escapeHTML(pick(r, ['endereco', 'Endereço', 'Endereco'])),
                ativo: true
            }
        };
    }

    async function runCentroCustosImport(ctx) {
        const report = ctx.report;
        const rows = ctx.rows;
        const importAbort = ctx.importAbort;
        const baseCC = typeof baseCentroCustos !== 'undefined' ? baseCentroCustos : [];
        const mapByCodigo = {};
        baseCC.forEach((item) => {
            const code = String(item.codigo || '').trim().toLowerCase();
            if (code && item.id) mapByCodigo[code] = item.id;
        });

        for (let i = 0; i < rows.length; i++) {
            if (importAbort?.aborted) break;
            const line = i + 2;
            const n = normalizeCentroCustosRow(rows[i] || {});
            if (!n.codigo) {
                report.ignored++;
                report.errors.push(`Linha ${line}: campo obrigatorio "codigo" ausente.`);
                continue;
            }
            const codeNorm = n.codigo.toLowerCase();
            const dados = {
                codigo: escapeHTML(n.codigo),
                aplicacao: escapeHTML(n.aplicacao),
                descricao: escapeHTML(n.descricao),
                ativo: true
            };
            const docId = mapByCodigo[codeNorm];
            if (docId) {
                await db.collection('centroCustos').doc(docId).update(dados);
                report.updated++;
            } else {
                const ref = await db.collection('centroCustos').add(dados);
                mapByCodigo[codeNorm] = ref.id;
                report.inserted++;
            }
        }
    }

    async function runDeducoesEncargosImport(ctx) {
        const report = ctx.report;
        const rows = ctx.rows;
        const importAbort = ctx.importAbort;
        const base = typeof baseDeducoesEncargos !== 'undefined' ? baseDeducoesEncargos : [];
        const mapByKey = {};
        base.forEach((d) => {
            const key = String((d.codigo || '') + '|' + (d.tipo || '')).toLowerCase().trim();
            if (key && d.id) mapByKey[key] = d.id;
        });
        for (let i = 0; i < rows.length; i++) {
            if (importAbort?.aborted) break;
            const line = i + 2;
            const n = normalizeDeducaoRow(rows[i] || {});
            if (!n.codigo) {
                report.ignored++;
                report.errors.push(`Linha ${line}: campo obrigatorio "codigo" ausente.`);
                continue;
            }
            const key = (n.codigo + '|' + n.tipo).toLowerCase();
            const docId = mapByKey[key];
            if (docId) {
                await db.collection('deducoesEncargos').doc(docId).update(n.dados);
                report.updated++;
            } else {
                const ref = await db.collection('deducoesEncargos').add(n.dados);
                mapByKey[key] = ref.id;
                report.inserted++;
            }
        }
    }

    async function runUnidadesGestorasImport(ctx) {
        const report = ctx.report;
        const rows = ctx.rows;
        const importAbort = ctx.importAbort;
        const baseUG = typeof baseUnidadesGestoras !== 'undefined' ? baseUnidadesGestoras : [];
        const mapByCodigo = {};
        baseUG.forEach((item) => {
            const code = String(item.codigo || '').trim().toLowerCase();
            if (code && item.id) mapByCodigo[code] = item.id;
        });

        const codigosNoArquivo = new Set();
        rows.forEach((row) => {
            const n = normalizeUnidadesGestorasRow(row || {});
            const code = String(n.codigo || '').trim().toLowerCase();
            if (code) codigosNoArquivo.add(code);
        });

        for (let i = 0; i < rows.length; i++) {
            if (importAbort?.aborted) break;
            const line = i + 2;
            const n = normalizeUnidadesGestorasRow(rows[i] || {});
            if (!n.codigo) {
                report.ignored++;
                report.errors.push(`Linha ${line}: campo obrigatorio "codigo" ausente.`);
                continue;
            }
            const codeNorm = n.codigo.toLowerCase();
            const comimsupNorm = String(n.comimsup || '').trim().toLowerCase();
            if (comimsupNorm && comimsupNorm === codeNorm) {
                report.ignored++;
                report.errors.push(`Linha ${line}: COMIMSUP nao pode ser igual ao proprio codigo da UG.`);
                continue;
            }
            if (comimsupNorm && !mapByCodigo[comimsupNorm] && !codigosNoArquivo.has(comimsupNorm)) {
                report.ignored++;
                report.errors.push(`Linha ${line}: COMIMSUP "${n.comimsup}" nao existe na base nem no arquivo.`);
                continue;
            }
            if (!String(n.indicativoNaval || '').trim() || !String(n.nome || '').trim()) {
                report.ignored++;
                report.errors.push(`Linha ${line}: campos obrigatorios "indicativoNaval" e "nome" nao podem estar vazios.`);
                continue;
            }

            const dadosInsert = {
                codigo: escapeHTML(n.codigo),
                indicativoNaval: escapeHTML(n.indicativoNaval),
                nome: escapeHTML(n.nome),
                comimsup: escapeHTML(n.comimsup),
                contato: escapeHTML(n.contato),
                ativo: true
            };
            const dadosUpdate = {
                indicativoNaval: escapeHTML(n.indicativoNaval),
                nome: escapeHTML(n.nome),
                comimsup: escapeHTML(n.comimsup),
                contato: escapeHTML(n.contato),
                ativo: true
            };
            let docId = mapByCodigo[codeNorm];
            if (!docId) {
                try {
                    const dupSnap = await db.collection('unidadesGestoras').where('codigo', '==', n.codigo.trim()).limit(1).get();
                    if (!dupSnap.empty) {
                        docId = dupSnap.docs[0].id;
                        mapByCodigo[codeNorm] = docId;
                    }
                } catch (err) {
                    report.ignored++;
                    report.errors.push(`Linha ${line}: erro ao verificar codigo existente: ${err.message || err}`);
                    continue;
                }
            }
            if (docId) {
                await db.collection('unidadesGestoras').doc(docId).update(dadosUpdate);
                report.updated++;
            } else {
                const ref = await db.collection('unidadesGestoras').add(dadosInsert);
                mapByCodigo[codeNorm] = ref.id;
                report.inserted++;
            }
        }
    }

    async function runContratosImport(ctx) {
        const report = ctx.report;
        const rows = ctx.rows;
        const importAbort = ctx.importAbort;
        const mapByNumero = {};
        (typeof baseContratos !== 'undefined' ? baseContratos : []).forEach((c) => {
            const key = String((c.numContrato || '')).toLowerCase().trim();
            if (key && c.id) mapByNumero[key] = c.id;
        });
        for (let i = 0; i < rows.length; i++) {
            if (importAbort?.aborted) break;
            const line = i + 2;
            const n = normalizeContratoRow(rows[i] || {});
            if (!n.numContrato) {
                report.ignored++;
                report.errors.push(`Linha ${line}: campo obrigatorio "numContrato" ausente.`);
                continue;
            }
            const key = n.numContrato.toLowerCase();
            const docId = mapByNumero[key];
            if (docId) {
                if (Object.keys(n.dadosUpdate || {}).length > 0) {
                    await db.collection('contratos').doc(docId).update(n.dadosUpdate);
                    report.updated++;
                } else {
                    report.ignored++;
                }
            } else {
                const ref = await db.collection('contratos').add(n.dados);
                mapByNumero[key] = ref.id;
                report.inserted++;
            }
        }
    }

    async function runFornecedoresImport(ctx) {
        const report = ctx.report;
        const rows = ctx.rows;
        const importAbort = ctx.importAbort;
        const codigosExistentes = new Set((typeof baseFornecedores !== 'undefined' ? baseFornecedores : [])
            .map((f) => String((f.codigoNumerico || '')).toLowerCase().trim()));
        for (let i = 0; i < rows.length; i++) {
            if (importAbort?.aborted) break;
            const line = i + 2;
            const n = normalizeFornecedorRow(rows[i] || {});
            if (!n.codigoNumerico) {
                report.ignored++;
                report.errors.push(`Linha ${line}: codigo/cpf/cnpj invalido ou ausente.`);
                continue;
            }
            const key = n.codigoNumerico.toLowerCase();
            if (codigosExistentes.has(key)) {
                report.ignored++;
                report.errors.push(`Linha ${line}: fornecedor com codigoNumerico ${n.codigoNumerico} ja existe (duplicado).`);
                continue;
            }
            await db.collection('fornecedores').add(n.dados);
            codigosExistentes.add(key);
            report.inserted++;
        }
    }

    // ==========================================
    // EMPENHOS (NE) - mapper, payload e driver
    // Compartilhado entre import Excel/CSV e parser PDF (Nota de Empenho).
    // ==========================================

    const EMPENHO_UG_PADRAO = '741000';
    const EMPENHO_GESTAO_PADRAO = '00001';
    const EMPENHO_PREFIX11_PADRAO = EMPENHO_UG_PADRAO + EMPENHO_GESTAO_PADRAO;

    function empenhoHeaderToken(k) {
        return String(k || '')
            .replace(/^\ufeff/, '')
            .trim()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/\s+/g, '')
            .toLowerCase();
    }

    function normalizeEmpenhoRowKeys(row) {
        const norm = {};
        Object.keys(row || {}).forEach(function(k) {
            norm[empenhoHeaderToken(k)] = row[k];
        });
        return norm;
    }

    function isEmpenhoRowAlreadyNormalized(row) {
        const keys = Object.keys(row || {});
        if (!keys.length) return true;
        for (let i = 0; i < keys.length; i++) {
            const k = keys[i];
            if (k !== empenhoHeaderToken(k)) return false;
        }
        return true;
    }

    function pickEmpenho(rowNorm, aliases) {
        for (let i = 0; i < aliases.length; i++) {
            const key = empenhoHeaderToken(aliases[i]);
            const val = rowNorm[key];
            if (val !== undefined && val !== null && String(val).trim() !== '') return String(val).trim();
        }
        return '';
    }

    // Alias por campo do formulario/Firestore. Inclui cabecalho canonico, variacoes legadas
    // e nomes por extenso aceitos no Excel/CSV (ex.: "Fonte de Recurso", "Natureza de Despesa").
    const EMPENHO_FIELD_ALIASES = {
        numEmpenho:  ['numEmpenho', 'NE', 'ne', 'NumEmpenho', 'numeroEmpenho', 'NumeroEmpenho', 'numNE', 'NUMNE', 'Nota de Empenho'],
        tipoNE:      ['tipoNE', 'TIPO NE', 'TipoNE', 'tipo ne', 'Tipo de Empenho', 'Tipo Empenho'],
        dataEmissao: ['dataEmissao', 'DATA', 'data', 'Data', 'DataEmissao', 'Data de Emissao', 'Data de Emissão', 'Emissao', 'Emissão'],
        uge:         ['uge', 'UGE', 'ugEmitente', 'UGEMITENTE', 'UG Emitente', 'ugemitente', 'UG'],
        ptres:       ['ptres', 'PTRES', 'Programa de Trabalho', 'programa', 'Programa'],
        pi:          ['pi', 'PI', 'Plano Interno', 'plano interno'],
        fr:          ['fr', 'FR', 'Fonte de Recurso', 'Fonte de Recursos', 'Fonte', 'fonte'],
        nd:          ['nd', 'ND', 'Natureza de Despesa', 'Natureza Despesa', 'Natureza', 'natureza'],
        subitem:     ['subitem', 'SUBITEM', 'Subitem', 'SubEl', 'subel', 'subelemento', 'Subelemento', 'sub elemento', 'Sub Elemento'],
        codAmp:      ['codAmp', 'COD AMP', 'CodAmp', 'cod amp', 'codamp', 'Codigo Amparo', 'Código Amparo', 'Codigo do Amparo'],
        numModal:    ['numModal', 'NUM MODAL', 'NumModal', 'num modal', 'nummodal', 'Numero Modalidade', 'Número Modalidade'],
        lei:         ['lei', 'LEI', 'Lei', 'Ato Normativo'],
        descModal:   ['descModal', 'DESC MODAL', 'DescModal', 'desc modal', 'descmodal', 'Modalidade', 'Modalidade de Licitacao', 'Modalidade de Licitação'],
        inciso:      ['inciso', 'INCISO', 'Inciso'],
        processo:    ['processo', 'PROCESSO', 'Processo', 'NUP', 'Numero do Processo', 'Número do Processo'],
        cnpjCpf:     ['cnpjCpf', 'cnpjcpf', 'CNPJCPF', 'cnpj_cpf', 'cpf_cnpj', 'cpfcnpj', 'cnpj', 'CNPJ', 'cpf', 'CPF', 'CNPJ/CPF', 'CPF/CNPJ'],
        favorecido:  ['favorecido', 'FAVORECIDO', 'Favorecido', 'Nome do Favorecido'],
        pjPf:        ['pjPf', 'PJ/PF', 'PjPf', 'pj/pf', 'pjpf', 'Tipo de Pessoa', 'Tipo Pessoa'],
        telefone:    ['telefone', 'TELEFONE', 'Telefone', 'fone', 'Fone'],
        contato:     ['contato', 'CONTATO', 'Contato'],
        gerencia:    ['gerencia', 'GERENCIA', 'GERÊNCIA', 'Gerencia', 'Gerência'],
        descricao:   ['descricao', 'Descricao', 'DESCRICAO', 'descrição', 'Descrição', 'Historico', 'Histórico'],
        docOrig:     ['docOrig', 'AES/SOLEMP', 'DocOrig', 'AES', 'aes', 'solemp', 'aessolemp', 'solempaes', 'aes_solemp', 'solemp_aes', 'Documento de Origem', 'Doc Origem'],
        oi:          ['oi', 'OI', 'Org Interna', 'Organizacao Interna', 'Organização Interna'],
        contrato:    ['contrato', 'CONTRATO', 'Contrato', 'Numero do Contrato', 'Número do Contrato'],
        projeto:     ['projeto', 'PROJETO', 'Projeto'],
        altcred:     ['altcred', 'ALTCRED', 'Altcred', 'Alteracao de Credito', 'Alteração de Crédito'],
        meio:        ['meio', 'MEIO', 'Meio', 'Meio Naval'],
        observacoes: ['observacoes', 'OBS', 'obs', 'Observacoes', 'OBSERVACOES', 'Observações'],
        cap:         ['cap', 'CAP', 'Cap'],
        valorGlobal: ['valorGlobal', 'ValorGlobal', 'valor', 'Valor', 'Valor do Empenho', 'Valor Global', 'Valor Total'],
        anoEmissao:   ['anoEmissao', 'ANO_EMISSAO', 'AnoEmissao', 'ano_emissao', 'Ano Emissao', 'Ano de Emissao', 'Ano de Emissão'],
        anoExercicio: ['anoExercicio', 'ANO_EXERCICIO', 'AnoExercicio', 'ano_exercicio', 'Ano Exercicio', 'Ano do Exercicio', 'Ano do Exercício']
    };

    // Gera todas as chaves equivalentes para localizar uma NE no mapa (cobre formato
    // completo, sufixo 12 e qualquer string crua salva no Firestore). Mantem alinhamento
    // com formatarNumEmpenhoVisivel() em script.js, que exibe apenas os ultimos 12 chars.
    function neChavesLookup(numEmpenho) {
        const out = [];
        const s = String(numEmpenho || '').trim().toLowerCase();
        if (!s) return out;
        const seen = {};
        const push = function(v) {
            const k = String(v || '').trim().toLowerCase();
            if (k && !seen[k]) { seen[k] = true; out.push(k); }
        };
        push(s);
        if (s.length > 12) push(s.slice(-12));
        // Reconstrucao para o formato completo (UG + Gestao + AAAA + NE + ######)
        const completo = completarNumEmpenhoIfNeeded(s, { modoCompleto: true });
        if (completo) push(String(completo).toLowerCase());
        // Captura padrao AAAAne###### embutido em string maior
        const m = s.match(/(\d{4}ne\d{6})/);
        if (m && m[1]) push(m[1]);
        return out;
    }

    // Le todos os campos canonicos do empenho a partir de uma linha (normalizada ou nao).
    // Retorna objeto plano com strings (sem escape) e valorGlobal numerico.
    function mapEmpenhoRow(row) {
        const rowNorm = isEmpenhoRowAlreadyNormalized(row) ? (row || {}) : normalizeEmpenhoRowKeys(row);
        const out = {};
        Object.keys(EMPENHO_FIELD_ALIASES).forEach(function(field) {
            out[field] = pickEmpenho(rowNorm, EMPENHO_FIELD_ALIASES[field]);
        });
        // valorGlobal numerico
        out.valorGlobal = parseValorMonetarioBR(out.valorGlobal);
        // observacoes/descricao: replicar regra antiga (descricao usa observacoes se vazio)
        if (!out.descricao && out.observacoes) out.descricao = out.observacoes;
        return out;
    }

    // Reconstroi numEmpenho completo (com prefixo de UG/Gestao) quando a base atual estiver
    // em modo "completo" (algum registro > 12 chars). Caso contrario, mantem o valor original.
    function completarNumEmpenhoIfNeeded(numEmpenho, opts) {
        const modoCompleto = !!(opts && opts.modoCompleto);
        const s = String(numEmpenho || '').trim();
        if (!s || !modoCompleto || s.length > 12) return s;
        const m = s.match(/^(\d{4})([A-Za-z]{2})(\d{6})$/);
        if (!m) return s;
        const tipoUpper = (m[2] || '').toUpperCase();
        if (tipoUpper !== 'NE') return s;
        return EMPENHO_PREFIX11_PADRAO + m[1] + 'NE' + m[3];
    }

    function modoCompletoNEAtual() {
        const baseAtual = (typeof baseEmpenhos !== 'undefined' ? baseEmpenhos : undefined);
        if (!Array.isArray(baseAtual) || baseAtual.length === 0) return false;
        return baseAtual.some(function(e) {
            return String((e && e.numEmpenho) ? e.numEmpenho : '').trim().length > 12;
        });
    }

    // Monta payload para insercao no Firestore. Aplica escapeHTML em textos e anos.
    function buildEmpenhoPayloadFromRow(row, opts) {
        const dados = mapEmpenhoRow(row);
        const options = opts || {};
        const modoCompleto = options.modoCompleto != null ? options.modoCompleto : modoCompletoNEAtual();
        const numCompleto = completarNumEmpenhoIfNeeded(dados.numEmpenho, { modoCompleto });
        const payload = {
            numEmpenho:  escapeHTML(numCompleto),
            numNE:       escapeHTML(numCompleto),
            tipoNE:      escapeHTML(dados.tipoNE),
            dataEmissao: escapeHTML(dados.dataEmissao),
            valorGlobal: dados.valorGlobal,
            uge:         escapeHTML(dados.uge),
            ugEmitente:  escapeHTML(dados.uge),
            ptres:       escapeHTML(dados.ptres),
            pi:          escapeHTML(dados.pi),
            fr:          escapeHTML(dados.fr),
            nd:          escapeHTML(dados.nd),
            subitem:     escapeHTML(dados.subitem),
            codAmp:      escapeHTML(dados.codAmp),
            numModal:    escapeHTML(dados.numModal),
            lei:         escapeHTML(dados.lei),
            descModal:   escapeHTML(dados.descModal),
            inciso:      escapeHTML(dados.inciso),
            processo:    escapeHTML(dados.processo),
            cnpjCpf:     escapeHTML(dados.cnpjCpf),
            cnpj:        escapeHTML(dados.cnpjCpf),
            favorecido:  escapeHTML(dados.favorecido),
            pjPf:        escapeHTML(dados.pjPf),
            telefone:    escapeHTML(dados.telefone),
            contato:     escapeHTML(dados.contato),
            gerencia:    escapeHTML(dados.gerencia),
            descricao:   escapeHTML(dados.descricao),
            observacoes: escapeHTML(dados.observacoes),
            docOrig:     escapeHTML(dados.docOrig),
            oi:          escapeHTML(dados.oi),
            contrato:    escapeHTML(dados.contrato),
            projeto:     escapeHTML(dados.projeto),
            cap:         escapeHTML(dados.cap),
            altcred:     escapeHTML(dados.altcred),
            meio:        escapeHTML(dados.meio)
        };
        if (window.sisAnoDocumento && typeof window.sisAnoDocumento.aplicarAnosEmpenho === 'function') {
            window.sisAnoDocumento.aplicarAnosEmpenho(payload);
        }
        if (window.sisAnoDocumento && dados.anoEmissao) {
            const ae = window.sisAnoDocumento.anoValido(dados.anoEmissao);
            if (ae != null) payload.anoEmissao = ae;
        }
        if (window.sisAnoDocumento && dados.anoExercicio) {
            const ax = window.sisAnoDocumento.anoValido(dados.anoExercicio);
            if (ax != null) payload.anoExercicio = ax;
        }
        return payload;
    }

    // Update parcial: preserva dados existentes quando a planilha nao traz valor
    // explicito para um campo importavel. Isso evita limpar NE ja cadastrada ao
    // reimportar arquivos parciais ou validacoes com poucas colunas.
    function buildEmpenhoUpdateFromRow(row) {
        const rowNorm = isEmpenhoRowAlreadyNormalized(row) ? (row || {}) : normalizeEmpenhoRowKeys(row);
        const updateData = {};
        const setText = function(field, aliases, targetFields) {
            const raw = pickEmpenho(rowNorm, aliases);
            if (raw === undefined || raw === null || String(raw).trim() === '') return;
            const valor = escapeHTML(String(raw).trim());
            (targetFields || [field]).forEach(function(target) {
                updateData[target] = valor;
            });
        };
        setText('tipoNE', EMPENHO_FIELD_ALIASES.tipoNE);
        setText('dataEmissao', EMPENHO_FIELD_ALIASES.dataEmissao);
        setText('uge', EMPENHO_FIELD_ALIASES.uge, ['uge', 'ugEmitente']);
        setText('ptres', EMPENHO_FIELD_ALIASES.ptres);
        setText('pi', EMPENHO_FIELD_ALIASES.pi);
        setText('fr', EMPENHO_FIELD_ALIASES.fr);
        setText('nd', EMPENHO_FIELD_ALIASES.nd);
        setText('subitem', EMPENHO_FIELD_ALIASES.subitem);
        setText('codAmp', EMPENHO_FIELD_ALIASES.codAmp);
        setText('numModal', EMPENHO_FIELD_ALIASES.numModal);
        setText('lei', EMPENHO_FIELD_ALIASES.lei);
        setText('descModal', EMPENHO_FIELD_ALIASES.descModal);
        setText('inciso', EMPENHO_FIELD_ALIASES.inciso);
        setText('processo', EMPENHO_FIELD_ALIASES.processo);
        setText('cnpjCpf', EMPENHO_FIELD_ALIASES.cnpjCpf, ['cnpjCpf', 'cnpj']);
        setText('favorecido', EMPENHO_FIELD_ALIASES.favorecido);
        setText('pjPf', EMPENHO_FIELD_ALIASES.pjPf);
        setText('telefone', EMPENHO_FIELD_ALIASES.telefone);
        setText('contato', EMPENHO_FIELD_ALIASES.contato);
        setText('gerencia', EMPENHO_FIELD_ALIASES.gerencia);
        setText('descricao', EMPENHO_FIELD_ALIASES.descricao);
        setText('observacoes', EMPENHO_FIELD_ALIASES.observacoes);
        setText('docOrig', EMPENHO_FIELD_ALIASES.docOrig);
        setText('oi', EMPENHO_FIELD_ALIASES.oi);
        setText('contrato', EMPENHO_FIELD_ALIASES.contrato);
        setText('projeto', EMPENHO_FIELD_ALIASES.projeto);
        setText('cap', EMPENHO_FIELD_ALIASES.cap);
        setText('altcred', EMPENHO_FIELD_ALIASES.altcred);
        setText('meio', EMPENHO_FIELD_ALIASES.meio);

        const valorRaw = pickEmpenho(rowNorm, EMPENHO_FIELD_ALIASES.valorGlobal);
        if (valorRaw !== undefined && valorRaw !== null && String(valorRaw).trim() !== '') {
            updateData.valorGlobal = parseValorMonetarioBR(valorRaw);
        }
        if (window.sisAnoDocumento) {
            const anoEmissaoRaw = pickEmpenho(rowNorm, EMPENHO_FIELD_ALIASES.anoEmissao);
            if (anoEmissaoRaw && typeof window.sisAnoDocumento.anoValido === 'function') {
                const ae = window.sisAnoDocumento.anoValido(anoEmissaoRaw);
                if (ae != null) updateData.anoEmissao = ae;
            }
            const anoExercicioRaw = pickEmpenho(rowNorm, EMPENHO_FIELD_ALIASES.anoExercicio);
            if (anoExercicioRaw && typeof window.sisAnoDocumento.anoValido === 'function') {
                const ax = window.sisAnoDocumento.anoValido(anoExercicioRaw);
                if (ax != null) updateData.anoExercicio = ax;
            }
        }
        return updateData;
    }

    async function runEmpenhosImport(ctx) {
        const report = ctx.report;
        const rows = ctx.rows || [];
        const importAbort = ctx.importAbort || { aborted: false };
        const modoCompleto = modoCompletoNEAtual();
        const baseEmp = (typeof baseEmpenhos !== 'undefined' ? baseEmpenhos : []);

        // Mapa multi-chave: cada NE da base registra todas as variantes (completo,
        // sufixo 12, etc.). Chaves compartilhadas por documentos diferentes ficam
        // marcadas como ambiguas para impedir update no documento errado.
        const mapEmpenhosPorNumero = {};
        const chavesEmpenhoAmbiguas = {};
        const registrarNoMapa = function(numero, docId) {
            const chaves = neChavesLookup(numero);
            chaves.forEach(function(k) {
                if (!mapEmpenhosPorNumero[k]) {
                    mapEmpenhosPorNumero[k] = docId;
                    return;
                }
                if (mapEmpenhosPorNumero[k] !== docId) {
                    chavesEmpenhoAmbiguas[k] = true;
                }
            });
        };
        baseEmp.forEach(function(e) {
            if (!e || !e.id) return;
            registrarNoMapa(e.numEmpenho || e.numNE || '', e.id);
        });

        const localizarDocId = function(numero) {
            const chaves = neChavesLookup(numero);
            for (let i = 0; i < chaves.length; i++) {
                if (chavesEmpenhoAmbiguas[chaves[i]]) return { ambiguousKey: chaves[i] };
                if (mapEmpenhosPorNumero[chaves[i]]) return { docId: mapEmpenhosPorNumero[chaves[i]] };
            }
            return { docId: null };
        };

        let pendentes = [];
        const LIMITE_LOTE = 350;
        const totalLinhas = rows.length;
        let processados = 0;

        const reportarProgresso = function() {
            if (typeof mostrarBarraLoading !== 'function') return;
            const pct = totalLinhas > 0 ? Math.round((processados / totalLinhas) * 100) : 0;
            mostrarBarraLoading('Importando empenhos... ' + processados + '/' + totalLinhas, { pct: pct });
        };

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
                if (pendentes[i].tipo === 'set') report.inserted++;
                else report.updated++;
            }
            pendentes = [];
        };

        window.__suspenderAtualizacaoEmpenhos = true;
        window.__empenhosRefreshPendente = false;
        reportarProgresso();

        try {
            for (let i = 0; i < rows.length; i++) {
                if (importAbort.aborted) break;
                processados++;
                if (processados % 25 === 0) await new Promise(function(resolve) { setTimeout(resolve, 0); });
                if (processados % 50 === 0 || processados === totalLinhas) reportarProgresso();

                const rowNorm = isEmpenhoRowAlreadyNormalized(rows[i]) ? rows[i] : normalizeEmpenhoRowKeys(rows[i] || {});
                const numEmpenhoRaw = pickEmpenho(rowNorm, EMPENHO_FIELD_ALIASES.numEmpenho);
                if (!numEmpenhoRaw) {
                    report.ignored++;
                    report.errors.push('Linha ' + (i + 2) + ': numEmpenho ausente.');
                    continue;
                }
                const numEmpenho = completarNumEmpenhoIfNeeded(numEmpenhoRaw, { modoCompleto });
                const localizacao = localizarDocId(numEmpenho);
                const localizacaoRaw = localizacao.docId || localizacao.ambiguousKey ? localizacao : localizarDocId(numEmpenhoRaw);
                if (localizacaoRaw.ambiguousKey) {
                    report.ignored++;
                    report.errors.push('Linha ' + (i + 2) + ': NE "' + numEmpenhoRaw + '" corresponde a mais de um empenho existente (chave ' + localizacaoRaw.ambiguousKey + '). Informe o numero completo para atualizar.');
                    continue;
                }
                const docIdExistente = localizacaoRaw.docId;

                if (docIdExistente) {
                    const updateData = buildEmpenhoUpdateFromRow(rowNorm);
                    if (Object.keys(updateData).length > 0) {
                        pendentes.push({ tipo: 'update', ref: db.collection('empenhos').doc(docIdExistente), data: updateData });
                    } else {
                        report.ignored++;
                    }
                } else {
                    const dados = buildEmpenhoPayloadFromRow(rowNorm, { modoCompleto });
                    const refEmp = db.collection('empenhos').doc();
                    pendentes.push({ tipo: 'set', ref: refEmp, data: dados });
                    registrarNoMapa(numEmpenho, refEmp.id);
                    registrarNoMapa(numEmpenhoRaw, refEmp.id);
                }
                if (pendentes.length >= LIMITE_LOTE) await flushPendentes();
            }
            await flushPendentes();
        } finally {
            window.__suspenderAtualizacaoEmpenhos = false;
            // Refresh garantido: sempre repinta a tabela apos importar, mesmo que o
            // snapshot do Firestore ainda nao tenha disparado.
            if (typeof atualizarTabelaEmpenhos === 'function') {
                try { atualizarTabelaEmpenhos(); } catch (e) {}
            }
            window.__empenhosRefreshPendente = false;
        }
    }

    // ===== PDF: parse de Nota de Empenho (SIAFI) =====
    // Recebe o texto extraido do PDF e retorna { row, camposExtraidos, camposNaoEncontrados }.
    // row segue o mesmo formato esperado por mapEmpenhoRow/buildEmpenhoPayloadFromRow.
    function parseEmpenhoPdfToRow(textoPdf) {
        const texto = String(textoPdf || '').replace(/\r/g, '').replace(/\u00a0/g, ' ');
        const linhas = texto.split('\n').map(function(l) { return l.trim(); }).filter(Boolean);
        const textoCorrido = linhas.join(' ');

        function matchValor(rxList) {
            for (let i = 0; i < rxList.length; i++) {
                const m = textoCorrido.match(rxList[i]);
                if (m && m[1]) return m[1].trim();
            }
            return '';
        }

        const row = {};
        // Numero da NE: aceita formato completo (27 chars) ou compacto AAAANE######
        const neFull = textoCorrido.match(/(\d{11}\d{4}NE\d{6})/);
        const neShort = textoCorrido.match(/(\d{4}NE\d{6})/);
        if (neFull) row.numEmpenho = neFull[1];
        else if (neShort) row.numEmpenho = neShort[1];

        row.dataEmissao  = matchValor([/Emiss[aã]o[:\s]+(\d{2}\/\d{2}\/\d{4})/i, /Data\s+de\s+Emiss[aã]o[:\s]+(\d{2}\/\d{2}\/\d{4})/i]);
        row.tipoNE       = matchValor([/Tipo\s+(?:da\s+NE|de\s+Empenho|NE)[:\s]+(GLOBAL|ORDIN[AÁ]RIO|ESTIMATIVO)/i]);
        row.uge          = matchValor([/UG\s+Emitente[:\s]+(\d{6})/i, /(?:^|\s)UGE[:\s]+(\d{6})/i]);
        row.ptres        = matchValor([/PTRES[:\s]+(\d{4,6})/i]);
        row.pi           = matchValor([/(?:Plano\s+Interno|PI)[:\s]+([A-Z0-9]{4,20})/i]);
        row.fr           = matchValor([/(?:Fonte\s+de\s+Recurso|FR)[:\s]+([\d.]{6,15})/i]);
        row.nd           = matchValor([/(?:Natureza\s+(?:de\s+)?Despesa|ND)[:\s]+(\d{6})/i]);
        row.subitem      = matchValor([/(?:Subelemento|Subitem|Sub\.\s*Item)[:\s]+(\d{2,4})/i]);
        row.codAmp       = matchValor([/(?:C[oó]digo\s+(?:do\s+)?Amparo|Cod\.?\s*Amparo|COD\s*AMP)[:\s]+([A-Z0-9-]+)/i]);
        row.numModal     = matchValor([/(?:N[uú]m(?:ero)?\.?\s*Modalidade|Num\s*Modal)[:\s]+(\d{1,6})/i]);
        row.lei          = matchValor([/(?:Lei|Ato\s+Normativo)[:\s]+(LEI[^\n]+?\d{4})/i, /(LEI\s+\d{1,3}\.\d{3}\/\d{4})/i]);
        row.descModal    = matchValor([/(?:Modalidade(?:\s+de\s+Licita[cç][aã]o)?|Desc\s*Modal)[:\s]+([A-Z][A-Z0-9 \/.-]{2,40})/]);
        row.inciso       = matchValor([/Inciso[:\s]+([IVXLCDM]+|\d+)/i]);
        row.processo     = matchValor([/(?:Processo|NUP)[:\s]+([\d.\/-]{14,30})/i]);
        row.cnpjCpf      = matchValor([/(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})/, /(\d{3}\.\d{3}\.\d{3}-\d{2})/, /CNPJ[:\s]+(\d{14})/i, /CPF[:\s]+(\d{11})/i]);
        row.favorecido   = matchValor([/Favorecido[:\s]+(.+?)\s+(?:CNPJ|CPF|UG|PTRES|Endere[cç]o|$)/i]);
        row.pjPf         = matchValor([/(?:PJ\/PF|Tipo\s+de\s+Pessoa)[:\s]+(PESSOA\s+(?:F[IÍ]SICA|JUR[IÍ]DICA))/i]);
        row.telefone     = matchValor([/(?:Telefone|Fone)[:\s]+([\d() -]{8,20})/i]);
        row.contato      = matchValor([/Contato[:\s]+([^\n]{3,80})/i]);
        row.gerencia     = matchValor([/Ger[eê]ncia[:\s]+([^\n]{2,50})/i]);
        row.docOrig      = matchValor([/(?:Documento\s+de\s+Origem|Doc\.?\s*Origem|AES\/SOLEMP|AES|SOLEMP)[:\s]+([A-Z0-9-]{3,30})/i]);
        row.oi           = matchValor([/(?:Org\.?\s*Interna|OI)[:\s]+([A-Z0-9 -]{2,30})/i]);
        row.contrato     = matchValor([/Contrato[:\s]+([A-Z0-9\/.-]{3,30})/i]);
        row.projeto      = matchValor([/Projeto[:\s]+([^\n]{2,50})/i]);
        row.cap          = matchValor([/CAP[:\s]+([A-Z0-9]{2,10})/i]);
        row.altcred      = matchValor([/(?:Alt(?:era[cç][aã]o)?\s*Cred(?:ito)?|ALTCRED)[:\s]+([^\n]{2,80})/i]);
        row.meio         = matchValor([/(?:Meio\s+Naval|Meio)[:\s]+([^\n]{2,80})/i]);
        row.descricao    = matchValor([/(?:Hist[oó]rico|Descri[cç][aã]o)[:\s]+([\s\S]+?)(?:\n\s*(?:Observa[cç][oõ]es|OBS|Valor\s+Total|$))/i]);
        row.observacoes  = matchValor([/(?:Observa[cç][oõ]es|OBS)[:\s]+([\s\S]+?)(?:\n\s*(?:Valor|Total|Assinatura|$))/i]);
        row.valorGlobal  = matchValor([/Valor\s+(?:Total|do\s+Empenho|Global)[:\s]+R?\$?\s*([\d.,]+)/i, /\bR\$\s*([\d.,]+)/]);

        const camposExtraidos = [];
        const camposNaoEncontrados = [];
        Object.keys(row).forEach(function(k) {
            if (row[k] && String(row[k]).trim() !== '') camposExtraidos.push(k);
            else camposNaoEncontrados.push(k);
        });
        return { row: row, camposExtraidos: camposExtraidos, camposNaoEncontrados: camposNaoEncontrados };
    }

    window.ImportDrivers = {
        centroCustos: {
            acceptedHeaders: ['codigo', 'descricao', 'aplicacao'],
            run: runCentroCustosImport
        },
        unidadesGestoras: {
            acceptedHeaders: ['codigo', 'nome', 'indicativoNaval', 'comimsup', 'contato'],
            run: runUnidadesGestorasImport
        },
        deducoesEncargos: {
            acceptedHeaders: ['codigo', 'tipo', 'descricao', 'aliquotaPadrao', 'aliquotaTotal'],
            run: runDeducoesEncargosImport
        },
        contratos: {
            acceptedHeaders: ['numContrato', 'tipoRegistro', 'cnpjFornecedor', 'nomeFornecedor', 'valorContrato'],
            run: runContratosImport
        },
        fornecedores: {
            acceptedHeaders: ['codigo', 'nome', 'tipoPessoa', 'email'],
            run: runFornecedoresImport
        },
        empenhos: {
            acceptedHeaders: ['numEmpenho', 'tipoNE', 'dataEmissao', 'uge', 'ptres', 'pi', 'fr', 'nd', 'subitem', 'favorecido', 'cnpjCpf'],
            run: runEmpenhosImport
        }
    };

    // API publica para fluxo PDF (formulario de NE) e reuso pelo script-import.js
    window.EmpenhoDriver = {
        mapEmpenhoRow: mapEmpenhoRow,
        buildEmpenhoPayloadFromRow: buildEmpenhoPayloadFromRow,
        buildEmpenhoUpdateFromRow: buildEmpenhoUpdateFromRow,
        parseEmpenhoPdfToRow: parseEmpenhoPdfToRow,
        normalizeEmpenhoRowKeys: normalizeEmpenhoRowKeys,
        completarNumEmpenho: function(ne) {
            return completarNumEmpenhoIfNeeded(ne, { modoCompleto: modoCompletoNEAtual() });
        },
        FIELD_ALIASES: EMPENHO_FIELD_ALIASES
    };
})();
