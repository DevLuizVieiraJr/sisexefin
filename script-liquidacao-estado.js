// ==========================================
// Estados LP — cálculo unificado (NE consolidada, multi-LF, OPs)
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

    function gerarIdInterno(prefixo) {
        return prefixo + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
    }

    function orcamentoEhLegado(orcamento) {
        return (orcamento || []).some(function (o) {
            return o && o.tcId != null && String(o.tcId).trim() !== '';
        });
    }

    function normalizarLfItem(lf, vinc, pf, id) {
        return {
            id: id || gerarIdInterno('lf'),
            lf: String(lf || '').trim(),
            vinc: String(vinc || '').trim(),
            pf: String(pf || '').trim()
        };
    }

    /**
     * Converte orçamento plano (tcId × NE) para NE consolidada com lfs[].
     * Extrai ops[] legadas de linhas com op/valorPago.
     */
    function migrarOrcamentoLegado(orcamento, opsExistentes) {
        orcamento = orcamento || [];
        opsExistentes = opsExistentes || [];
        if (!orcamentoEhLegado(orcamento)) {
            return {
                orcamento: (orcamento || []).map(function (ne) {
                    var item = Object.assign({}, ne);
                    item.lfs = Array.isArray(item.lfs) ? item.lfs.slice() : [];
                    if (!item.lfs.length && (item.lf || item.pf || item.vinc)) {
                        item.lfs = [normalizarLfItem(item.lf, item.vinc, item.pf)];
                    }
                    item.detalheTCs = Array.isArray(item.detalheTCs) ? item.detalheTCs : [];
                    delete item.tcId;
                    delete item.lf;
                    delete item.pf;
                    delete item.vinc;
                    delete item.op;
                    delete item.valorPago;
                    delete item.dataPagamento;
                    return item;
                }),
                ops: opsExistentes.slice()
            };
        }

        var mapaNE = Object.create(null);
        var opsMap = Object.create(null);
        var opsOut = opsExistentes.slice();

        orcamento.forEach(function (linha) {
            var ne = String(linha.ne || '').trim();
            if (!neValida(ne)) return;

            if (!mapaNE[ne]) {
                mapaNE[ne] = {
                    ne: ne,
                    nd: linha.nd || '—',
                    sub: linha.sub || '—',
                    fr: linha.fr || '—',
                    cc: linha.cc || '—',
                    ug: linha.ug || '—',
                    valor: 0,
                    detalheTCs: [],
                    lfs: []
                };
            }
            var item = mapaNE[ne];
            var tcId = linha.tcId || '';
            var val = Number(linha.valor || 0);
            var proc = linha.proc || tcId;
            var existente = item.detalheTCs.find(function (d) { return d.tcId === tcId; });
            if (!existente && tcId) {
                item.detalheTCs.push({ tcId: tcId, proc: proc, valor: val });
                item.valor += val;
            } else if (existente) {
                existente.valor = val;
            }

            if (linha.lf || linha.pf || linha.vinc) {
                var dup = item.lfs.some(function (x) {
                    return x.lf === String(linha.lf || '').trim() && x.pf === String(linha.pf || '').trim();
                });
                if (!dup) item.lfs.push(normalizarLfItem(linha.lf, linha.vinc, linha.pf));
            }

            var opKey = String(linha.op || '').trim();
            if (opKey && linha.dataPagamento) {
                var vOp = parseFloat(linha.valorPago);
                if (!isNaN(vOp) && vOp > 0 && !opsMap[opKey]) {
                    opsMap[opKey] = true;
                    opsOut.push({
                        id: gerarIdInterno('op'),
                        op: opKey,
                        ob: '',
                        dataPagamento: String(linha.dataPagamento || '').trim(),
                        valor: vOp
                    });
                }
            }
        });

        return { orcamento: Object.keys(mapaNE).map(function (k) { return mapaNE[k]; }), ops: opsOut };
    }

    function linhasValidas(orcamento) {
        return (orcamento || []).filter(function (o) { return neValida(o.ne); });
    }

    function todasLFsDoOrcamento(orcamento) {
        var out = [];
        linhasValidas(orcamento).forEach(function (ne) {
            (ne.lfs || []).forEach(function (lf) { out.push(lf); });
        });
        return out;
    }

    function neTemLF(neItem) {
        return Array.isArray(neItem.lfs) && neItem.lfs.length > 0;
    }

    function agregarLfs(lfs) {
        lfs = lfs || [];
        return {
            lf: lfs.map(function (x) { return x.lf; }).filter(Boolean).join(', '),
            pf: lfs.map(function (x) { return x.pf; }).filter(Boolean).join(', '),
            vinc: lfs.map(function (x) { return x.vinc; }).filter(Boolean).join(', ')
        };
    }

    function somaOps(ops) {
        return (ops || []).reduce(function (s, o) {
            return s + (Number(o.valor) || 0);
        }, 0);
    }

    function calcularTotaisFinanceiros(valorLiquido, ops) {
        var liq = Number(valorLiquido) || 0;
        var pago = somaOps(ops);
        return {
            valorLiquido: liq,
            valorLiquidoPago: pago,
            valorLiquidoAPagar: Math.max(0, liq - pago)
        };
    }

    function calcularEstadoPosOP(valorLiquido, ops) {
        var pago = somaOps(ops);
        if (pago <= 0) return null;
        var liq = Number(valorLiquido) || 0;
        if (liq > 0 && pago >= liq - 0.005) return 'pago';
        return 'pagoParcialmente';
    }

    function calcularEstadoPosPF(orcamento) {
        var nes = linhasValidas(orcamento);
        if (!nes.length) return 'liquidado';

        var allNesHaveLF = nes.every(neTemLF);
        if (!allNesHaveLF) return 'liquidado';

        var allLfs = todasLFsDoOrcamento(orcamento);
        if (!allLfs.length) return 'liquidado';

        var comPF = allLfs.filter(function (lf) { return String(lf.pf || '').trim(); });
        if (!comPF.length) return 'aguardandoFinanceiro';
        if (comPF.length === allLfs.length) return 'paraPagamento';
        return 'paraPagamentoParcial';
    }

    function normalizarEstadoLegado(estado) {
        var e = String(estado || '').trim();
        if (LEGADO_PARA_NOVO[e]) return LEGADO_PARA_NOVO[e];
        return e;
    }

    /**
     * @param {object} lp - { np, orcamento, ops, valorLiquido, estado, tcsIds }
     */
    function calcularEstadoLP(lp) {
        lp = lp || {};
        if (String(lp.estado || '').toLowerCase() === 'cancelado') return 'cancelado';

        var np = String(lp.np || '').trim();
        if (!np) return 'rascunho';

        var orc = linhasValidas(lp.orcamento);
        if (!orc.length) return 'liquidado';

        var estadoOP = calcularEstadoPosOP(lp.valorLiquido, lp.ops);
        if (estadoOP) return estadoOP;

        return calcularEstadoPosPF(lp.orcamento);
    }

    /** NEs do orçamento consolidado em que o TC participa */
    function orcamentoParaTC(orcamento, tcId) {
        return linhasValidas(orcamento).filter(function (ne) {
            if (Array.isArray(ne.detalheTCs) && ne.detalheTCs.length) {
                return ne.detalheTCs.some(function (d) { return d.tcId === tcId; });
            }
            return false;
        });
    }

    /**
     * Status TC a partir das NEs do TC no orçamento consolidado + contexto LP (OP).
     */
    function calcularStatusTCOrcamento(orcTC, lpContext) {
        lpContext = lpContext || {};
        var ops = lpContext.ops || [];
        var valorLiquido = lpContext.valorLiquido;

        if (ops.length && somaOps(ops) > 0) {
            var estOP = calcularEstadoPosOP(valorLiquido, ops);
            if (estOP === 'pago') return 'Pago';
            if (estOP === 'pagoParcialmente') return 'Pago Parcialmente';
        }

        if (!orcTC || !orcTC.length) return 'Liquidado';
        return calcularEstadoPosPF(orcTC) === 'liquidado' ? 'Liquidado'
            : calcularEstadoPosPF(orcTC) === 'aguardandoFinanceiro' ? 'Aguardando Financeiro'
            : calcularEstadoPosPF(orcTC) === 'paraPagamento' ? 'Para Pagamento'
            : calcularEstadoPosPF(orcTC) === 'paraPagamentoParcial' ? 'Para Pagamento parcial'
            : 'Liquidado';
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
        var mig = migrarOrcamentoLegado(doc.orcamento, doc.ops);
        var legado = String(doc.estado || '').trim();
        if (legado === 'cancelado') return 'cancelado';
        var bruto = Number(doc.valorLiquido);
        return calcularEstadoLP({
            np: doc.np,
            orcamento: mig.orcamento,
            ops: mig.ops,
            valorLiquido: bruto,
            estado: legado,
            tcsIds: doc.tcsIds
        });
    }

    function labelEstado(estado) {
        var e = normalizarEstadoLegado(estado);
        for (var i = 0; i < ESTADOS_LP.length; i++) {
            if (ESTADOS_LP[i].valor === e) return ESTADOS_LP[i].label;
        }
        if (estado === 'fechado') return 'Liquidado';
        return estado || '—';
    }

    global.LiquidacaoEstado = {
        ESTADOS_LP: ESTADOS_LP,
        LEGADO_PARA_NOVO: LEGADO_PARA_NOVO,
        gerarIdInterno: gerarIdInterno,
        orcamentoEhLegado: orcamentoEhLegado,
        migrarOrcamentoLegado: migrarOrcamentoLegado,
        calcularEstadoLP: calcularEstadoLP,
        calcularStatusTCOrcamento: calcularStatusTCOrcamento,
        orcamentoParaTC: orcamentoParaTC,
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
        todasLFsDoOrcamento: todasLFsDoOrcamento,
        neTemLF: neTemLF,
        agregarLfs: agregarLfs,
        somaOps: somaOps,
        calcularTotaisFinanceiros: calcularTotaisFinanceiros,
        normalizarLfItem: normalizarLfItem
    };
})(window);
