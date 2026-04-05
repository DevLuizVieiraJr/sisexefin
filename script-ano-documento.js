// ==========================================
// Ano de exercício / emissão (divisão por exercício e rastreio SIAFI/SIPLAD)
// Expõe window.sisAnoDocumento — carregar antes dos script-* que persistem dados.
// ==========================================
(function (global) {
    'use strict';

    function anoValido(n) {
        const x = parseInt(String(n), 10);
        return (x >= 1900 && x <= 2100) ? x : null;
    }

    /** yyyy-mm-dd, dd/mm/yyyy ou timestamp string inicial. */
    function anoDeData(s) {
        if (!s) return null;
        const str = String(s).trim();
        const iso = str.match(/^(\d{4})-\d{2}-\d{2}/);
        if (iso) return anoValido(iso[1]);
        const br = str.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
        if (br) return anoValido(br[3]);
        return null;
    }

    /**
     * NE / NP / OP / OB (padrão SIAFI): sufixo de 12 (AAAATipNNNNNN) ou ID completo.
     */
    function anoDeSiafiDh(s) {
        const raw = String(s || '').trim();
        if (!raw) return null;
        const tail = raw.length >= 12 ? raw.slice(-12) : raw;
        const m = tail.match(/^(\d{4})([A-Za-z]{2})(\d{6})$/);
        return m ? anoValido(m[1]) : null;
    }

    function anoDeNe(numEmpenho) {
        const dh = anoDeSiafiDh(numEmpenho);
        if (dh) return dh;
        const u = String(numEmpenho || '').toUpperCase();
        const i = u.lastIndexOf('NE');
        if (i >= 4) return anoValido(u.slice(i - 4, i));
        return null;
    }

    function payloadAnosNp(npDocId) {
        const npY = anoDeSiafiDh(npDocId);
        if (npY == null) return {};
        return {
            anoExercicio: npY,
            anoEmissao: npY
        };
    }

    function aplicarAnosEmpenho(dados) {
        if (!dados || typeof dados !== 'object') return dados;
        const am = anoDeNe(dados.numEmpenho) || anoDeData(dados.dataEmissao);
        if (am != null) {
            dados.anoEmissao = am;
            dados.anoExercicio = am;
        }
        return dados;
    }

    /** TC (PROC): ano do formulário + fallback por datas. */
    function aplicarAnosTitulo(dados) {
        if (!dados || typeof dados !== 'object') return dados;
        const anoStr = (dados.ano != null && dados.ano !== '') ? String(dados.ano) : '';
        let ex = anoValido(anoStr.replace(/\D/g, '').slice(0, 4));
        if (ex == null) ex = anoDeData(dados.dataEmissao) || anoDeData(dados.dataExefin);
        if (ex != null) dados.anoExercicio = ex;
        const em = anoDeData(dados.dataEmissao) || ex;
        if (em != null) dados.anoEmissao = em;
        return dados;
    }

    function aplicarAnosLfPf(dados) {
        if (!dados || typeof dados !== 'object') return dados;
        const lfY = anoDeSiafiDh(dados.lf);
        const dataY = anoDeData(dados.dataCriacao);
        const pfY = anoDeSiafiDh(dados.pf);
        const em = lfY || dataY || pfY;
        if (em != null) {
            dados.anoEmissao = em;
            dados.anoExercicio = em;
        }
        if (pfY != null) dados.anoEmissaoPf = pfY;
        return dados;
    }

    function enriquecerItensOpOb(documentosHabeis) {
        if (!Array.isArray(documentosHabeis)) return documentosHabeis;
        return documentosHabeis.map(function (it) {
            if (!it || typeof it !== 'object') return it;
            const ao = anoDeSiafiDh(it.op);
            const ab = anoDeSiafiDh(it.ob);
            const out = Object.assign({}, it);
            if (ao != null) out.anoEmissaoOp = ao;
            if (ab != null) out.anoEmissaoOb = ab;
            return out;
        });
    }

    /** PL-#####/AAAA → ano do exercício do código. */
    function anoDeCodigoPL(codigo) {
        const m = String(codigo || '').match(/\/(\d{4})\s*$/);
        return m ? anoValido(m[1]) : null;
    }

    function aplicarAnosPreLiquidacao(dados, anoContador) {
        if (!dados || typeof dados !== 'object') return dados;
        const a = anoValido(anoContador) || anoDeCodigoPL(dados.codigo);
        if (a != null) dados.anoExercicio = a;
        const em = anoDeCodigoPL(dados.codigo) || a;
        if (em != null) dados.anoEmissao = em;
        return dados;
    }

    global.sisAnoDocumento = {
        anoValido: anoValido,
        anoDeData: anoDeData,
        anoDeSiafiDh: anoDeSiafiDh,
        anoDeNe: anoDeNe,
        payloadAnosNp: payloadAnosNp,
        aplicarAnosEmpenho: aplicarAnosEmpenho,
        aplicarAnosTitulo: aplicarAnosTitulo,
        aplicarAnosLfPf: aplicarAnosLfPf,
        enriquecerItensOpOb: enriquecerItensOpOb,
        anoDeCodigoPL: anoDeCodigoPL,
        aplicarAnosPreLiquidacao: aplicarAnosPreLiquidacao
    };
})(typeof window !== 'undefined' ? window : this);
