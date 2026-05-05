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
        return '';
    }

    function normalizeCentroCustosRow(row) {
        const r = window.ImportEngine ? window.ImportEngine.normalizeRowKeys(row) : (row || {});
        const codigo = pick(r, ['Codigo', 'Código', 'codigo', 'CODIGO']).trim();
        const aplicacao = pick(r, ['Aplicacao', 'Aplicação', 'aplicacao', 'APLICACAO']).trim();
        const descricao = pick(r, ['Descricao', 'Descrição', 'descricao', 'DESCRICAO']).trim();
        return { codigo, aplicacao, descricao };
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

    function normalizeContratoRow(row) {
        const r = window.ImportEngine ? window.ImportEngine.normalizeRowKeys(row) : (row || {});
        const numContrato = pick(r, ['numContrato', 'NumContrato', 'Instrumento', 'instrumento', 'numero', 'Numero']);
        const valorRaw = pick(r, ['valorContrato', 'ValorContrato', 'valor', 'Valor', 'valorGlobal']);
        const cnpjFornecedorRaw = pick(r, ['cnpjFornecedor', 'cnpj_fornecedor', 'CNPJ_FORNECEDOR', 'CNPJFornecedor']);
        const nomeFornecedorRaw = pick(r, ['nomeFornecedor', 'nome_fornecedor', 'NOME_FORNECEDOR', 'NomeFornecedor', 'nome', 'Nome', 'FornecedorNome']);
        let cnpjFornecedor = normalizarCNPJ(cnpjFornecedorRaw);
        let nomeFornecedor = nomeFornecedorRaw || '';
        if (!cnpjFornecedor || !nomeFornecedor) {
            const fornecedorRaw = pick(r, ['fornecedor', 'Fornecedor']);
            const parsed = extrairCnpjNomeFornecedor(fornecedorRaw);
            cnpjFornecedor = normalizarCNPJ(parsed.cnpjFornecedor);
            nomeFornecedor = parsed.nomeFornecedor;
        }
        return {
            numContrato,
            dados: {
                idContrato: escapeHTML(pick(r, ['idContrato', 'IdContrato', 'ID', 'id'])),
                numContrato: escapeHTML(numContrato),
                situacao: escapeHTML(pick(r, ['situacao', 'Situacao', 'situação'])),
                cnpjFornecedor: escapeHTML(normalizarCNPJ(cnpjFornecedor)),
                nomeFornecedor: escapeHTML(nomeFornecedor),
                nup: escapeHTML(pick(r, ['nup', 'NUP', 'Nup'])),
                dataInicio: escapeHTML(pick(r, ['dataInicio', 'DataInicio', 'data_inicio', 'Inicio', 'inicio'])),
                dataFim: escapeHTML(pick(r, ['dataFim', 'DataFim', 'data_fim', 'Fim', 'fim'])),
                valorContrato: parseValorMonetarioBR(valorRaw),
                deducoesPermitidas: []
            }
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
                await db.collection('contratos').doc(docId).update(n.dados);
                report.updated++;
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

    window.ImportDrivers = {
        centroCustos: {
            acceptedHeaders: ['codigo', 'descricao', 'aplicacao'],
            run: runCentroCustosImport
        },
        deducoesEncargos: {
            acceptedHeaders: ['codigo', 'tipo', 'descricao', 'aliquotaPadrao', 'aliquotaTotal'],
            run: runDeducoesEncargosImport
        },
        contratos: {
            acceptedHeaders: ['numContrato', 'cnpjFornecedor', 'nomeFornecedor', 'valorContrato'],
            run: runContratosImport
        },
        fornecedores: {
            acceptedHeaders: ['codigo', 'nome', 'tipoPessoa', 'email'],
            run: runFornecedoresImport
        }
    };
})();
