// ==========================================
// Informar OP — Liquidação e Pagamento
// Depende de: firebase-config, script-liquidacao-estado.js, script-liquidacao-np.js
// ==========================================
(function (global) {
    'use strict';

    function getUsuarioEmail() {
        if (global.LiquidacaoNp && typeof global.LiquidacaoNp.getUsuarioEmail === 'function') {
            return global.LiquidacaoNp.getUsuarioEmail();
        }
        return 'usuário';
    }

    function entradaHistoricoTC(status, evento, info) {
        if (global.LiquidacaoNp && global.LiquidacaoNp.entradaHistoricoTC) {
            return global.LiquidacaoNp.entradaHistoricoTC(status, evento, info);
        }
        return { status: status, evento: evento, motivoInfo: info };
    }

    function neExibicao(ne) {
        return String(ne || '').trim();
    }

    /**
     * Persiste OP por NE no lote, propaga para TCs e recalcula estado.
     * @param {object} opts - { lpId, tcsIds, orcamento, np, historicoAtual, codigoLp, correcao, motivoCorrecao }
     */
    async function executarInformarOP(opts) {
        opts = opts || {};
        var LE = global.LiquidacaoEstado;
        if (!LE) throw new Error('Módulo de estados indisponível.');

        var lpId = opts.lpId;
        var tcsIds = opts.tcsIds || [];
        var orcamento = (opts.orcamento || []).slice();
        var email = getUsuarioEmail();
        var hist = (opts.historicoAtual || []).slice();
        var correcao = !!opts.correcao;
        var motivo = String(opts.motivoCorrecao || '').trim();

        var novoEstado = LE.calcularEstadoLP({
            np: opts.np,
            orcamento: orcamento,
            estado: 'rascunho',
            tcsIds: tcsIds
        });

        var evTipo = correcao ? 'corrigir_op' : 'informar_op';
        hist.push({
            data: new Date().toISOString(),
            tipo: evTipo,
            usuario: email,
            detalhe: 'Estado: ' + novoEstado,
            motivo: correcao ? motivo : ''
        });

        await db.collection('liquidacoes').doc(lpId).update({
            orcamento: orcamento,
            estado: novoEstado,
            historico: hist,
            editadoEm: firebase.firestore.FieldValue.serverTimestamp(),
            editadoPor: email
        });

        for (var i = 0; i < tcsIds.length; i++) {
            var tid = tcsIds[i];
            var orcTC = orcamento.filter(function (o) { return o.tcId === tid; });
            var neMap = {};
            orcTC.forEach(function (o) {
                neMap[neExibicao(o.ne)] = {
                    op: o.op || '',
                    valorPago: o.valorPago != null ? o.valorPago : '',
                    dataPagamento: o.dataPagamento || ''
                };
            });

            var tRef = db.collection('titulos').doc(tid);
            var tSnap = await tRef.get();
            if (!tSnap.exists) continue;
            var td = tSnap.data() || {};
            var novosEmps = (td.empenhosVinculados || []).map(function (e) {
                var ne = neExibicao(e.numEmpenho || e.numNE);
                var m = neMap[ne];
                if (!m) return e;
                return Object.assign({}, e, {
                    op: m.op,
                    valorPago: m.valorPago,
                    dataPagamento: m.dataPagamento
                });
            });

            var novoStatus = LE.calcularStatusTCOrcamento(orcTC);
            var opsTC = orcTC.map(function (o) { return String(o.op || '').trim(); }).filter(Boolean);
            var opAgregada = opsTC.length === 1 ? opsTC[0] : (opsTC.length > 1 ? opsTC.join(', ') : (td.op || ''));

            var h = entradaHistoricoTC(
                novoStatus,
                correcao ? 'Correção OP (LP)' : 'OP via liquidação',
                (correcao ? motivo + ' | ' : '') + 'LP: ' + (opts.codigoLp || lpId)
            );
            var hists = Array.isArray(td.historicoStatus) ? td.historicoStatus.slice() : [];
            var histo = Array.isArray(td.historico) ? td.historico.slice() : [];
            hists.push(h);
            histo.push(h);

            await tRef.update({
                empenhosVinculados: novosEmps,
                op: opAgregada,
                status: novoStatus,
                historicoStatus: hists,
                historico: histo,
                editado_em: firebase.firestore.FieldValue.serverTimestamp()
            });

            if (opts.np && global.LiquidacaoNp && global.LiquidacaoNp.vincularTituloNaNP) {
                await global.LiquidacaoNp.vincularTituloNaNP(tid, opts.np, opts.dataLiquidacao || '');
            }
        }

        return { historico: hist, estado: novoEstado, orcamento: orcamento };
    }

    global.LiquidacaoOp = {
        executarInformarOP: executarInformarOP
    };
})(window);
