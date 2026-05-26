// ==========================================
// NUCLEO DE IMPORTACAO (CSV/XLS/XLSX)
// ==========================================
(function() {
    if (window.ImportEngine) return;

    function readFileAsArrayBuffer(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = e => resolve(e.target.result);
            reader.onerror = () => reject(new Error('Erro ao ler ficheiro'));
            reader.readAsArrayBuffer(file);
        });
    }

    async function parseWorkbookRows(file) {
        if (typeof XLSX === 'undefined') throw new Error('Biblioteca XLSX indisponivel.');
        const data = await readFileAsArrayBuffer(file);
        const wb = XLSX.read(data, { type: 'array' });
        const firstSheet = wb.Sheets[wb.SheetNames[0]];
        return XLSX.utils.sheet_to_json(firstSheet, { defval: '', raw: false });
    }

    function normalizeRowKeys(row) {
        const normalized = {};
        Object.keys(row || {}).forEach((k) => {
            const clean = String(k || '').replace(/^\ufeff/, '').trim();
            normalized[clean || k] = row[k];
        });
        return normalized;
    }

    function normalizeHeaderToken(v) {
        return String(v || '')
            .trim()
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '');
    }

    function detectLikelyModule(rows, driversMap) {
        const first = rows && rows.length ? normalizeRowKeys(rows[0]) : {};
        const keys = Object.keys(first).map(k => normalizeHeaderToken(k));
        let best = { moduleKey: null, score: 0 };
        Object.keys(driversMap || {}).forEach((moduleKey) => {
            const driver = driversMap[moduleKey];
            const accepted = Array.isArray(driver?.acceptedHeaders) ? driver.acceptedHeaders : [];
            if (!accepted.length) return;
            const score = accepted.reduce((acc, h) => acc + (keys.includes(normalizeHeaderToken(h)) ? 1 : 0), 0);
            if (score > best.score) best = { moduleKey, score };
        });
        return best.moduleKey;
    }

    function createReport() {
        return {
            inserted: 0,
            updated: 0,
            ignored: 0,
            errors: []
        };
    }

    function formatSummary(report, options) {
        const opts = options || {};
        const maxErrors = Number(opts.maxErrors || 20);
        const titulo = opts.title || 'Importacao concluida';
        let msg = `${titulo}. Inseridos: ${report.inserted}; Atualizados: ${report.updated}; Ignorados: ${report.ignored}; Erros: ${report.errors.length}.`;
        if (report.errors.length > 0) {
            msg += '\n\nErros (amostra):\n- ' + report.errors.slice(0, maxErrors).join('\n- ');
            if (report.errors.length > maxErrors) msg += `\n- ... e mais ${report.errors.length - maxErrors}.`;
        }
        return msg;
    }

    // Extrai o texto de todas as paginas de um PDF usando PDF.js (carregado via CDN).
    // Usado pelo modulo de Empenhos para preencher o formulario a partir da Nota de Empenho.
    async function extractPdfText(file) {
        if (typeof pdfjsLib === 'undefined') {
            throw new Error('Biblioteca PDF.js indisponivel.');
        }
        const data = await readFileAsArrayBuffer(file);
        const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(data) });
        const pdf = await loadingTask.promise;
        const partes = [];
        for (let p = 1; p <= pdf.numPages; p++) {
            const page = await pdf.getPage(p);
            const content = await page.getTextContent();
            const textoPagina = content.items.map(function(item) { return item.str; }).join(' ');
            partes.push(textoPagina);
        }
        return partes.join('\n');
    }

    window.ImportEngine = {
        readFileAsArrayBuffer,
        parseWorkbookRows,
        normalizeRowKeys,
        detectLikelyModule,
        createReport,
        formatSummary,
        normalizeHeaderToken,
        extractPdfText
    };
})();
