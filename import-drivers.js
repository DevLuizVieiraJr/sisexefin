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

    window.ImportDrivers = {
        centroCustos: {
            acceptedHeaders: ['codigo', 'descricao', 'aplicacao'],
            run: runCentroCustosImport
        }
    };
})();
