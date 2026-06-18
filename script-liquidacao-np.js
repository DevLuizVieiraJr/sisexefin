// ==========================================
// Utilitários NP / TC — compartilhados (Liquidação e Pagamento)
// Depende de: firebase-config (db, auth), opcional script-ano-documento
// ==========================================
(function (global) {
    'use strict';

    var STATUS_TC_EM_LIQUIDACAO = 'Em Liquidação';

    function getUsuarioEmail() {
        if (typeof auth !== 'undefined' && auth.currentUser && auth.currentUser.email) {
            return auth.currentUser.email;
        }
        if (typeof usuarioLogadoEmail === 'string' && usuarioLogadoEmail) {
            return usuarioLogadoEmail;
        }
        return 'usuário';
    }

    function candidatosNpDocId(npInput) {
        var npInputTrim = String(npInput || '').trim();
        var PREFIX11 = '74100000001';
        function completar(valor) {
            var s = String(valor || '').trim();
            if (!s || s.length > 12) return s.length > 12 ? s : '';
            var m = s.match(/^(\d{4})([A-Za-z]{2})(\d{6})$/);
            if (!m) return '';
            var ano = m[1];
            var tipo = (m[2] || '').toUpperCase();
            var num = m[3];
            if (tipo !== 'NP') return '';
            return PREFIX11 + ano + 'NP' + num;
        }
        var out = [];
        if (npInputTrim) out.push(npInputTrim);
        var c = completar(npInputTrim);
        if (c && c !== npInputTrim) out.push(c);
        return out;
    }

    async function vincularTituloNaNP(tituloId, npValor, dataLiquidacao) {
        var npInput = String(npValor || '').trim();
        if (!npInput) return;
        var tituloIdStr = String(tituloId || '').trim();
        var dl = String(dataLiquidacao || '').trim();
        var email = getUsuarioEmail();
        var did = false;
        for (var i = 0; i < candidatosNpDocId(npInput).length; i++) {
            var npDocId = candidatosNpDocId(npInput)[i];
            if (!npDocId) continue;
            var ref = db.collection('np').doc(npDocId);
            var snap = await ref.get();
            var payload = {
                np: npDocId,
                titulosVinculados: firebase.firestore.FieldValue.arrayUnion(tituloIdStr),
                editado_em: firebase.firestore.FieldValue.serverTimestamp()
            };
            if (dl) payload.dataLiquidacao = dl;
            if (email) payload.editado_por = email;
            if (global.sisAnoDocumento && typeof global.sisAnoDocumento.payloadAnosNp === 'function') {
                Object.assign(payload, global.sisAnoDocumento.payloadAnosNp(npDocId));
            }
            if (snap.exists) {
                await ref.set(payload, { merge: true });
                did = true;
                break;
            }
        }
        if (!did) {
            var npDocIdCriar = candidatosNpDocId(npInput)[0];
            var payloadNew = {
                np: npDocIdCriar,
                titulosVinculados: firebase.firestore.FieldValue.arrayUnion(tituloIdStr),
                documentosHabeis: [],
                ativo: true,
                editado_em: firebase.firestore.FieldValue.serverTimestamp()
            };
            if (dl) payloadNew.dataLiquidacao = dl;
            if (email) payloadNew.editado_por = email;
            if (global.sisAnoDocumento && typeof global.sisAnoDocumento.payloadAnosNp === 'function') {
                Object.assign(payloadNew, global.sisAnoDocumento.payloadAnosNp(npDocIdCriar));
            }
            await db.collection('np').doc(npDocIdCriar).set(payloadNew, { merge: true });
        }
    }

    async function desvincularTituloDaNP(tituloId, npValor) {
        var npInput = String(npValor || '').trim();
        if (!npInput) return;
        var tituloIdStr = String(tituloId || '').trim();
        var candidatos = candidatosNpDocId(npInput);
        for (var i = 0; i < candidatos.length; i++) {
            var npDocId = candidatos[i];
            if (!npDocId) continue;
            var ref = db.collection('np').doc(npDocId);
            var snap = await ref.get();
            if (snap.exists) {
                await ref.set({
                    titulosVinculados: firebase.firestore.FieldValue.arrayRemove(tituloIdStr),
                    editado_em: firebase.firestore.FieldValue.serverTimestamp()
                }, { merge: true });
                return;
            }
        }
    }

    function entradaHistoricoTC(status, evento, info) {
        return {
            data: firebase.firestore.Timestamp.now(),
            status: status || '-',
            evento: evento || 'Liquidação',
            acao: 'Liquidação e Pagamento',
            usuario: getUsuarioEmail(),
            motivoInfo: info || '',
            aba: null
        };
    }

    async function pushHistoricoTitulo(tituloDocId, entry) {
        var ref = db.collection('titulos').doc(tituloDocId);
        var snap = await ref.get();
        var d = snap.data() || {};
        var h1 = Array.isArray(d.historicoStatus) ? d.historicoStatus.slice() : [];
        var h2 = Array.isArray(d.historico) ? d.historico.slice() : [];
        h1.push(entry);
        h2.push(entry);
        await ref.update({
            historicoStatus: h1,
            historico: h2,
            editado_em: firebase.firestore.FieldValue.serverTimestamp()
        });
    }

    async function algumTituloComOP(ids) {
        for (var i = 0; i < (ids || []).length; i++) {
            var snap = await db.collection('titulos').doc(ids[i]).get();
            var d = snap.data() || {};
            if (String(d.op || '').trim()) return true;
        }
        return false;
    }

    /**
     * Fecha LP com NP: atualiza liquidacoes, cada titulo (Liquidado) e coleção np.
     * @param {object} opts - { lpId, tcsIds, np, dataLiq, correcao, motivoCorrecao, npAntiga, historicoAtual, codigoLp }
     * @returns {object} historico atualizado
     */
    async function executarFecharNP(opts) {
        opts = opts || {};
        var lpId = opts.lpId;
        var tcsIds = opts.tcsIds || [];
        var np = String(opts.np || '').trim();
        var dataLiq = String(opts.dataLiq || '').trim();
        var correcao = !!opts.correcao;
        var motivoCorrecao = opts.motivoCorrecao || '';
        var npAntiga = String(opts.npAntiga || '').trim();
        var email = getUsuarioEmail();
        var hist = (opts.historicoAtual || []).slice();

        if (correcao && npAntiga) {
            for (var i = 0; i < tcsIds.length; i++) {
                await desvincularTituloDaNP(tcsIds[i], npAntiga);
            }
        }

        var evTipo = correcao ? 'corrigir_np' : 'fechar_np';
        var evDetalhe = 'NP: ' + np + ' | Data: ' + dataLiq;
        hist.push({
            data: new Date().toISOString(),
            tipo: evTipo,
            usuario: email,
            detalhe: evDetalhe,
            motivo: correcao ? motivoCorrecao : ''
        });

        var orcamento = opts.orcamento || [];
        var LE = global.LiquidacaoEstado;
        var novoEstado = LE
            ? LE.calcularEstadoLP({ np: np, orcamento: orcamento, estado: 'rascunho', tcsIds: tcsIds })
            : 'liquidado';

        await db.collection('liquidacoes').doc(lpId).update({
            estado: novoEstado,
            np: np,
            dataLiquidacao: dataLiq,
            historico: hist,
            editadoEm: firebase.firestore.FieldValue.serverTimestamp(),
            editadoPor: email
        });

        for (var j = 0; j < tcsIds.length; j++) {
            var tid = tcsIds[j];
            var tRef = db.collection('titulos').doc(tid);
            var tSnap = await tRef.get();
            var td = tSnap.data() || {};
            var orcTC = orcamento.filter(function (o) { return o.tcId === tid; });
            var novoStatus = LE && orcTC.length
                ? LE.calcularStatusTCOrcamento(orcTC)
                : 'Liquidado';
            var h = entradaHistoricoTC(
                novoStatus,
                correcao ? 'Correção NP (LP)' : 'NP via liquidação',
                (correcao ? motivoCorrecao + ' | ' : '') + 'NP ' + np + (opts.codigoLp ? ' | LP: ' + opts.codigoLp : '')
            );
            var hists = Array.isArray(td.historicoStatus) ? td.historicoStatus.slice() : [];
            var histo = Array.isArray(td.historico) ? td.historico.slice() : [];
            hists.push(h);
            histo.push(h);
            await tRef.update({
                np: np,
                dataLiquidacao: dataLiq,
                status: novoStatus,
                historicoStatus: hists,
                historico: histo,
                editado_em: firebase.firestore.FieldValue.serverTimestamp()
            });
            await vincularTituloNaNP(tid, np, dataLiq);
        }

        return { historico: hist, estado: novoEstado };
    }

    global.LiquidacaoNp = {
        STATUS_TC_EM_LIQUIDACAO: STATUS_TC_EM_LIQUIDACAO,
        getUsuarioEmail: getUsuarioEmail,
        candidatosNpDocId: candidatosNpDocId,
        vincularTituloNaNP: vincularTituloNaNP,
        desvincularTituloDaNP: desvincularTituloDaNP,
        entradaHistoricoTC: entradaHistoricoTC,
        pushHistoricoTitulo: pushHistoricoTitulo,
        algumTituloComOP: algumTituloComOP,
        executarFecharNP: executarFecharNP
    };
})(window);
