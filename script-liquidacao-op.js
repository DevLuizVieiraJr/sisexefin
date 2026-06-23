// ==========================================
// Informar OP — Liquidação e Pagamento (nível LP)
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

    function normalizarOpObItem(op, ob, valor, dataPagamento, prefix11) {
        var opFull = op;
        var obFull = ob;
        if (global.sisAnoDocumento) {
            if (typeof global.sisAnoDocumento.completarOpDocId === 'function') {
                opFull = global.sisAnoDocumento.completarOpDocId(op, prefix11);
            }
            if (typeof global.sisAnoDocumento.completarObDocId === 'function') {
                obFull = global.sisAnoDocumento.completarObDocId(ob, prefix11);
            }
        }
        return {
            op: String(opFull || op || '').trim(),
            ob: String(obFull || ob || '').trim(),
            valorOb: Number(valor) || 0,
            valorNp: Number(valor) || 0,
            dataPagamento: String(dataPagamento || '').trim()
        };
    }

    async function sincronizarDocumentosHabeisNP(npValor, ops, prefix11) {
        var npInput = String(npValor || '').trim();
        if (!npInput || !global.LiquidacaoNp) return;
        var candidatos = global.LiquidacaoNp.candidatosNpDocId(npInput);
        var npDocId = candidatos[0];
        if (!npDocId) return;

        var documentosHabeisRaw = (ops || []).map(function (o) {
            return normalizarOpObItem(o.op, o.ob, o.valor, o.dataPagamento, prefix11);
        }).filter(function (d) { return d.op && d.ob; });

        var documentosHabeis = (global.sisAnoDocumento && typeof global.sisAnoDocumento.enriquecerItensOpOb === 'function')
            ? global.sisAnoDocumento.enriquecerItensOpOb(documentosHabeisRaw)
            : documentosHabeisRaw;

        await db.collection('np').doc(npDocId).set({
            documentosHabeis: documentosHabeis,
            editado_em: firebase.firestore.FieldValue.serverTimestamp(),
            editado_por: getUsuarioEmail()
        }, { merge: true });
    }

    /**
     * Persiste ops[] no lote, totais financeiros, propaga TCs e sync NP.
     */
    async function executarInformarOP(opts) {
        opts = opts || {};
        var LE = global.LiquidacaoEstado;
        if (!LE) throw new Error('Módulo de estados indisponível.');

        var lpId = opts.lpId;
        var tcsIds = opts.tcsIds || [];
        var ops = (opts.ops || []).slice();
        var orcamento = opts.orcamento || [];
        var email = getUsuarioEmail();
        var hist = (opts.historicoAtual || []).slice();
        var correcao = !!opts.correcao;
        var motivo = String(opts.motivoCorrecao || '').trim();
        var valorLiquido = Number(opts.valorLiquido) || 0;
        var totais = LE.calcularTotaisFinanceiros(valorLiquido, ops);

        var lpPayload = {
            ops: ops,
            orcamento: orcamento,
            valorLiquido: totais.valorLiquido,
            valorLiquidoPago: totais.valorLiquidoPago,
            valorLiquidoAPagar: totais.valorLiquidoAPagar,
            historico: hist,
            editadoEm: firebase.firestore.FieldValue.serverTimestamp(),
            editadoPor: email
        };
        lpPayload.estado = LE.calcularEstadoLP({
            np: opts.np,
            orcamento: orcamento,
            ops: ops,
            valorLiquido: totais.valorLiquido,
            estado: 'rascunho',
            tcsIds: tcsIds
        });

        var evTipo = correcao ? 'corrigir_op' : 'informar_op';
        hist.push({
            data: new Date().toISOString(),
            tipo: evTipo,
            usuario: email,
            detalhe: 'Estado: ' + lpPayload.estado + ' | Pago: ' + totais.valorLiquidoPago,
            motivo: correcao ? motivo : ''
        });
        lpPayload.historico = hist;

        await db.collection('liquidacoes').doc(lpId).update(lpPayload);

        var opsAgregadas = ops.map(function (o) { return String(o.op || '').trim(); }).filter(Boolean).join(', ');
        var lpContext = {
            ops: ops,
            valorLiquido: totais.valorLiquido,
            estado: lpPayload.estado
        };

        for (var i = 0; i < tcsIds.length; i++) {
            var tid = tcsIds[i];
            var orcTC = LE.orcamentoParaTC(orcamento, tid);
            var tRef = db.collection('titulos').doc(tid);
            var tSnap = await tRef.get();
            if (!tSnap.exists) continue;
            var td = tSnap.data() || {};

            var novosEmps = (td.empenhosVinculados || []).map(function (e) {
                var ne = String(e.numEmpenho || e.numNE || '').trim();
                var neItem = orcTC.find(function (n) { return String(n.ne).trim() === ne; });
                if (!neItem) return e;
                var agg = LE.agregarLfs(neItem.lfs);
                return Object.assign({}, e, agg);
            });

            var novoStatus = LE.calcularStatusTCOrcamento(orcTC, lpContext);
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
                op: opsAgregadas || td.op || '',
                status: novoStatus,
                historicoStatus: hists,
                historico: histo,
                editado_em: firebase.firestore.FieldValue.serverTimestamp()
            });
        }

        if (opts.np) {
            var npDocId = (global.LiquidacaoNp.candidatosNpDocId(opts.np) || [])[0] || opts.np;
            var prefix11 = (String(npDocId).length >= 23) ? String(npDocId).slice(0, 11) : '74100000001';
            await sincronizarDocumentosHabeisNP(opts.np, ops, prefix11);
        }

        return {
            historico: hist,
            estado: lpPayload.estado,
            ops: ops,
            valorLiquido: totais.valorLiquido,
            valorLiquidoPago: totais.valorLiquidoPago,
            valorLiquidoAPagar: totais.valorLiquidoAPagar
        };
    }

    global.LiquidacaoOp = {
        executarInformarOP: executarInformarOP
    };
})(window);
