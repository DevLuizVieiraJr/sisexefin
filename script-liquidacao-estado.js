// ==========================================
// Estados LP — cálculo unificado (NP-first)
// Depende de: nenhum (IIFE global LiquidacaoEstado)
// ==========================================
(function (global) {
    'use strict';

    var ESTADOS_LP = [
        { valor: 'rascunho',              label: 'Rascunho' },
        { valor: 'liquidado',             label: 'Liquidado' },
        { valor: 'aguardandoFinanceiro',  label: 'Aguardando Financeiro' },
        { valor: 'paraPagamentoParcial',  label: 'Para Pagamento Parcial' },
        { valor: 'paraPagamento',         label: 'Para Pagamento' },
        { valor: 'pagoParcialmente',      label: 'Pago Parcialmente' },
        { valor: 'pago',                  label: 'Pago' },
        { valor: 'cancelado',             label: 'Cancelado' }
    ];

    var LEGADO_PARA_NOVO = {
        fechado: 'liquidado',
        aguardandoFinanceiroSemLF: 'liquidado',
        aguardandoFinanceiroComLF: 'aguardandoFinanceiro'
    };

    function neValida(ne) {
        var n = String(ne || '').trim();
        return n && n !== '—' && n !== '-';
    }

    function linhasValidas(orcamento) {
        return (orcamento || []).filter(function (o) { return neValida(o.ne); });
    }

    function contarNEDistintas(orcamento) {
        var set = Object.create(null);
        linhasValidas(orcamento).forEach(function (o) {
            set[String(o.ne).trim()] = true;
        });
        return Object.keys(set).length;
    }

    function linhaOPCompleta(o) {
        return !!(String(o.op || '').trim() && String(o.dataPagamento || '').trim());
    }

    function normalizarEstadoLegado(estado) {
        var e = String(estado || '').trim();
        if (LEGADO_PARA_NOVO[e]) return LEGADO_PARA_NOVO[e];
        return e;
    }

    function calcularEstadoPosOP(linhas) {
        var comPF = linhas.filter(function (o) { return String(o.pf || '').trim(); });
        if (!comPF.length) return null;
        var comOP = comPF.filter(linhaOPCompleta);
        if (!comOP.length) return null;
        if (comOP.length === comPF.length) return 'pago';
        return 'pagoParcialmente';
    }

    /**
     * Calcula liquidacoes.estado a partir de np, orcamento e estado atual.
     * @param {object} lp - { np, orcamento, estado, tcsIds }
     */
    function calcularEstadoLP(lp) {
        lp = lp || {};
        if (String(lp.estado || '').toLowerCase() === 'cancelado') return 'cancelado';

        var np = String(lp.np || '').trim();
        if (!np) return 'rascunho';

        var linhas = linhasValidas(lp.orcamento);
        if (!linhas.length) return 'liquidado';

        var total = linhas.length;
        var comLF = linhas.filter(function (o) { return String(o.lf || '').trim(); });
        var comPF = linhas.filter(function (o) { return String(o.pf || '').trim(); });

        var estadoOP = calcularEstadoPosOP(linhas);
        if (estadoOP) return estadoOP;

        if (!comLF.length || comLF.length < total) return 'liquidado';

        if (comPF.length === total) return 'paraPagamento';

        var nesDistintas = contarNEDistintas(linhas);
        if (nesDistintas >= 2 && comPF.length > 0) return 'paraPagamentoParcial';

        return 'aguardandoFinanceiro';
    }

    /** Status TC a partir das linhas de orçamento de um TC (pós-NP). */
    function calcularStatusTCOrcamento(orcTC) {
        var linhas = linhasValidas(orcTC);
        if (!linhas.length) return 'Liquidado';

        var total = linhas.length;
        var comLF = linhas.filter(function (o) { return String(o.lf || '').trim(); });
        var comPF = linhas.filter(function (o) { return String(o.pf || '').trim(); });

        var estadoOP = calcularEstadoPosOP(linhas);
        if (estadoOP === 'pago') return 'Pago';
        if (estadoOP === 'pagoParcialmente') return 'Pago Parcialmente';

        if (!comLF.length || comLF.length < total) return 'Liquidado';
        if (comPF.length === total) return 'Para Pagamento';

        var nesDistintas = contarNEDistintas(linhas);
        if (nesDistintas >= 2 && comPF.length > 0) return 'Para Pagamento parcial';

        return 'Aguardando Financeiro';
    }

    function statusTCFromEstadoLP(estado) {
        var mapa = {
            rascunho: 'Em Liquidação',
            liquidado: 'Liquidado',
            aguardandoFinanceiro: 'Aguardando Financeiro',
            paraPagamentoParcial: 'Para Pagamento parcial',
            paraPagamento: 'Para Pagamento',
            pagoParcialmente: 'Pago Parcialmente',
            pago: 'Pago',
            cancelado: 'Em Liquidação'
        };
        var e = normalizarEstadoLegado(estado);
        return mapa[e] || 'Liquidado';
    }

    function lpEstadoComNP(estado) {
        var e = String(estado || '').toLowerCase();
        return e !== 'rascunho' && e !== 'cancelado' && !!e;
    }

    function lpEstadoLiquidado(estado) {
        var e = String(estado || '').toLowerCase();
        return e === 'liquidado' || e === 'fechado';
    }

    function lpEstadoPosPagamento(estado) {
        var e = String(estado || '').toLowerCase();
        return e === 'parapagamento' || e === 'parapagamentoparcial';
    }

    function lpEstadoPosOP(estado) {
        var e = String(estado || '').toLowerCase();
        return e === 'pago' || e === 'pagoparcialmente';
    }

    function lpEstadoCancelado(estado) {
        return String(estado || '').toLowerCase() === 'cancelado';
    }

    function lpPodeEditarLote(estado) {
        if (lpEstadoCancelado(estado)) return false;
        if (String(estado || '').toLowerCase() === 'pago') return false;
        return true;
    }

    function migrarEstadoDocumento(doc) {
        doc = doc || {};
        var legado = String(doc.estado || '').trim();
        if (legado === 'cancelado') return 'cancelado';
        if (LEGADO_PARA_NOVO[legado]) {
            if (LEGADO_PARA_NOVO[legado] === 'liquidado' && !String(doc.np || '').trim()) {
                return 'rascunho';
            }
        }
        return calcularEstadoLP({
            np: doc.np,
            orcamento: doc.orcamento,
            estado: legado === 'cancelado' ? 'cancelado' : 'rascunho',
            tcsIds: doc.tcsIds
        });
    }

    function labelEstado(estado) {
        var e = normalizarEstadoLegado(estado);
        for (var i = 0; i < ESTADOS_LP.length; i++) {
            if (ESTADOS_LP[i].valor === e) return ESTADOS_LP[i].label;
        }
        if (estado === 'fechado') return 'Liquidado';
        if (estado === 'aguardandoFinanceiroSemLF' || estado === 'aguardandoFinanceiroComLF') {
            return 'Aguardando Financeiro';
        }
        return estado || '—';
    }

    global.LiquidacaoEstado = {
        ESTADOS_LP: ESTADOS_LP,
        LEGADO_PARA_NOVO: LEGADO_PARA_NOVO,
        calcularEstadoLP: calcularEstadoLP,
        calcularStatusTCOrcamento: calcularStatusTCOrcamento,
        statusTCFromEstadoLP: statusTCFromEstadoLP,
        lpEstadoComNP: lpEstadoComNP,
        lpEstadoLiquidado: lpEstadoLiquidado,
        lpEstadoPosPagamento: lpEstadoPosPagamento,
        lpEstadoPosOP: lpEstadoPosOP,
        lpEstadoCancelado: lpEstadoCancelado,
        lpPodeEditarLote: lpPodeEditarLote,
        normalizarEstadoLegado: normalizarEstadoLegado,
        migrarEstadoDocumento: migrarEstadoDocumento,
        labelEstado: labelEstado,
        linhasValidas: linhasValidas,
        linhaOPCompleta: linhaOPCompleta
    };
})(window);
