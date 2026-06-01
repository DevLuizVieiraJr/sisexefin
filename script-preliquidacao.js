// ==========================================
// PRÉ-LIQUIDAÇÃO — lotes, DAuLiq PDF, NP (ver Regra de Negócios - PreLiquidação.md)
// ==========================================
(function() {
    if (!document.getElementById('corpo-preliquidacao')) return;

    const STATUS_TC_EM_LIQUIDACAO = 'Em Liquidação';

    let baseTitulos = [];
    let baseFornecedores = [];
    let listaCentroCustos = [];
    let listaUG = [];
    let listaPL = [];
    /** Lista de PL: ano do exercício ou `'todos'`. Padrão: ano corrente. */
    let filtroAnoExercicioPL = String(new Date().getFullYear());
    let filtroAnoPLListenerOk = false;
    let unsubTitulos = null;
    let unsubPL = null;

    let plIdAtual = null;
    let plDocAtual = null;
    let plSomenteLeitura = false;
    let carrinhoIds = new Set();
    let plSelecionados = new Set();
    let fornecedorFiltroCnpj = '';
    let fornecedorFiltroNome = '';
    let modalMotivoResolver = null;
    let modalDauliqVarianteResolver = null;

    let paginaAtualPL = 1;
    let itensPorPaginaPL = 10;
    let termoBuscaPL = '';
    let estadoOrdenacaoPL = { coluna: 'codigo', direcao: 'desc' };
    let plAbaAtiva = 'lote';

    function tem(perm) {
        return typeof temPermissaoUI === 'function' && temPermissaoUI(perm);
    }
    function ehAdmin() {
        return tem('acesso_admin');
    }
    function podeOperarPLLista() {
        return tem('preliquidacao_editar') || tem('preliquidacao_inserir') || tem('preliquidacao_fechar_np')
            || tem('preliquidacao_cancelar') || tem('preliquidacao_status') || tem('preliquidacao_excluir') || ehAdmin();
    }
    function formatarDataHoraLista(ts) {
        if (!ts) return '—';
        const d = ts.toDate ? ts.toDate() : new Date(ts);
        if (isNaN(d.getTime())) return '—';
        return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    }
    function formatarDataSimplesPL(v) {
        if (!v) return '—';
        if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)) {
            const p = v.slice(0, 10).split('-');
            return `${p[2]}/${p[1]}/${p[0]}`;
        }
        if (v.toDate) {
            const d = v.toDate();
            if (isNaN(d.getTime())) return '—';
            return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
        }
        return '—';
    }
    function valorTotalLoteNaLista(p) {
        const ids = new Set([...(p.tituloIds || []), ...(p.titulosParticiparamIds || [])]);
        if (!ids.size) return 0;
        let s = 0;
        baseTitulos.forEach(t => {
            if (ids.has(t.id)) s += Number(t.valorNotaFiscal) || 0;
        });
        return s;
    }
    function idsTitulosParaPdfPL(p) {
        const raw = [...(p.tituloIds || [])];
        if (!raw.length && (p.titulosParticiparamIds || []).length) {
            raw.push(...p.titulosParticiparamIds);
        }
        return [...new Set(raw)];
    }
    async function carregarTitulosParaPdfPL(pl) {
        const ids = idsTitulosParaPdfPL(pl);
        const out = [];
        for (const id of ids) {
            const s = await db.collection('titulos').doc(id).get();
            if (s.exists) out.push({ id: s.id, ...s.data() });
        }
        return out;
    }
    function pedirVariantePdfDauliq() {
        return new Promise((resolve) => {
            modalDauliqVarianteResolver = resolve;
            document.getElementById('modalPLVarianteDauliq').style.display = 'flex';
        });
    }
    function fecharModalDauliqVariante(val) {
        const el = document.getElementById('modalPLVarianteDauliq');
        if (el) el.style.display = 'none';
        if (modalDauliqVarianteResolver) {
            const fn = modalDauliqVarianteResolver;
            modalDauliqVarianteResolver = null;
            fn(val);
        }
    }

    async function gerarDauliqDaLista(plId) {
        if (!tem('preliquidacao_gerar_pdf') && !ehAdmin()) return;
        const variante = await pedirVariantePdfDauliq();
        if (variante == null) return;
        const incluirHistorico = variante === 'completo';
        mostrarLoading();
        try {
            const snap = await db.collection('preLiquidacoes').doc(plId).get();
            if (!snap.exists) {
                alert('Pré-liquidação não encontrada.');
                return;
            }
            const pl0 = { id: snap.id, ...snap.data() };
            const titulos = await carregarTitulosParaPdfPL(pl0);
            if (!titulos.length) {
                alert('Sem títulos associados a esta pré-liquidação (ou dados ainda não sincronizados).');
                return;
            }
            const meta = {
                geradoEm: new Date().toISOString(),
                usuario: typeof usuarioLogadoEmail === 'string' ? usuarioLogadoEmail : '',
                nomeArquivoSugerido: 'DAuLiq_' + String(pl0.codigo || '').replace(/\//g, '-') + (incluirHistorico ? '' : '_sem-historico') + '.pdf',
                origem: 'lista',
                variantePdf: incluirHistorico ? 'completo' : 'sem_historico'
            };
            const plRef = db.collection('preLiquidacoes').doc(plId);
            const evDet = incluirHistorico ? 'DAuLiq gerado (lista, completo)' : 'DAuLiq gerado (lista, sem histórico no PDF)';
            const ev = plHistoricoEntry('pdf', evDet, '');
            const d = pl0;
            const histNovo = (d.historico || []).concat([ev]);
            await plRef.update({
                auditoriaPdf: meta,
                historico: histNovo,
                editado_em: firebase.firestore.FieldValue.serverTimestamp()
            });
            const plMerged = { ...pl0, auditoriaPdf: meta, historico: histNovo };
            await gerarPDFDauliq(plMerged, titulos, { incluirHistorico });
        } catch (e) {
            alert('Erro ao gerar PDF: ' + (e.message || e));
        } finally {
            esconderLoading();
        }
    }

    async function gerarDauliqEmBloco(plIds) {
        const LIMITE = 10;
        const ids = Array.isArray(plIds) ? plIds.filter(Boolean) : [];
        if (!ids.length) { alert('Nenhuma pré-liquidação selecionada.'); return; }
        if (ids.length > LIMITE) {
            alert(`Limite de ${LIMITE} DAuLiq por impressão em bloco. Você selecionou ${ids.length}.`);
            return;
        }
        if (!tem('preliquidacao_gerar_pdf') && !ehAdmin()) {
            alert('Você não tem permissão para gerar PDF de DAuLiq.');
            return;
        }
        if (!window.jspdf || !window.jspdf.jsPDF) {
            alert('Biblioteca jsPDF indisponível.');
            return;
        }
        const variante = await pedirVariantePdfDauliq();
        if (variante == null) return;
        const incluirHistorico = variante === 'completo';

        mostrarLoading();
        const falhas = [];
        const plsRenderizados = [];
        try {
            const { jsPDF } = window.jspdf;
            const docPDF = new jsPDF({ unit: 'mm', format: 'a4' });

            const carregados = [];
            for (const plId of ids) {
                try {
                    const snap = await db.collection('preLiquidacoes').doc(plId).get();
                    if (!snap.exists) { falhas.push(`PL ${plId}: não encontrada.`); continue; }
                    const pl0 = { id: snap.id, ...snap.data() };
                    const titulos = await carregarTitulosParaPdfPL(pl0);
                    if (!titulos.length) { falhas.push(`PL ${pl0.codigo || plId}: sem títulos no lote.`); continue; }
                    carregados.push({ pl0, titulos });
                } catch (err) {
                    falhas.push(`PL ${plId}: ${err && err.message || err}.`);
                }
            }
            if (!carregados.length) {
                alert('Nenhuma PL pôde ser carregada para impressão em bloco.\n\n' + falhas.join('\n'));
                return;
            }

            carregados.sort((a, b) => String(a.pl0.codigo || '').localeCompare(String(b.pl0.codigo || ''), 'pt-BR', { numeric: true }));

            for (let i = 0; i < carregados.length; i++) {
                const { pl0, titulos } = carregados[i];
                try {
                    const meta = {
                        geradoEm: new Date().toISOString(),
                        usuario: typeof usuarioLogadoEmail === 'string' ? usuarioLogadoEmail : '',
                        nomeArquivoSugerido: 'DAuLiq_em_bloco_' + (incluirHistorico ? 'completo' : 'sem-historico') + '.pdf',
                        origem: 'lista_bloco',
                        variantePdf: incluirHistorico ? 'completo' : 'sem_historico'
                    };
                    const evDet = 'DAuLiq gerado em bloco (variante: ' + (incluirHistorico ? 'completo' : 'sem histórico') + ')';
                    const ev = plHistoricoEntry('pdf', evDet, '');
                    const histNovo = (pl0.historico || []).concat([ev]);
                    const plMerged = { ...pl0, auditoriaPdf: meta, historico: histNovo };
                    await gerarPDFDauliq(plMerged, titulos, {
                        incluirHistorico,
                        docPDF,
                        iniciarComNovaPagina: i > 0,
                        salvar: false
                    });
                    plsRenderizados.push({ id: pl0.id, meta, ev });
                } catch (err) {
                    falhas.push(`PL ${pl0.codigo || pl0.id}: ${err && err.message || err}.`);
                }
            }

            const totalPages = docPDF.getNumberOfPages();
            for (let p = 1; p <= totalPages; p++) {
                docPDF.setPage(p);
                docPDF.setFontSize(8);
                docPDF.text(`Página ${p} de ${totalPages}`, 105, 290, { align: 'center' });
            }

            const stamp = (() => {
                const d = new Date();
                return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}_${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`;
            })();
            const sufArq = incluirHistorico ? '' : '_sem-historico';
            docPDF.save(`DAuLiq_em_bloco_${plsRenderizados.length}${sufArq}_${stamp}.pdf`);

            for (const r of plsRenderizados) {
                try {
                    const plRef = db.collection('preLiquidacoes').doc(r.id);
                    const cur = await plRef.get();
                    const curHist = (cur.exists && cur.data().historico) || [];
                    await plRef.update({
                        auditoriaPdf: r.meta,
                        historico: curHist.concat([r.ev]),
                        editado_em: firebase.firestore.FieldValue.serverTimestamp()
                    });
                } catch (e) {
                    console.warn('Falha ao registrar auditoria de DAuLiq em bloco para PL', r.id, e);
                }
            }

            if (falhas.length) {
                alert(`PDF em bloco gerado com ${plsRenderizados.length} DAuLiq. Falharam ${falhas.length}:\n\n` + falhas.join('\n'));
            }
        } catch (e) {
            alert('Erro ao gerar DAuLiq em bloco: ' + (e.message || e));
        } finally {
            esconderLoading();
        }
    }

    function normalizarDigitos(v) {
        return String(v || '').replace(/\D/g, '');
    }

    function ne12(numEmpenho) {
        const d = normalizarDigitos(numEmpenho);
        return d.length <= 12 ? d : d.slice(-12);
    }

    /** PDF: "741000000012026NE000194" ou núcleo "012026000194" → "2026NE000194" */
    function neExibicaoPdf(numEmpenho) {
        const s = String(numEmpenho == null ? '' : numEmpenho).trim();
        if (!s) return '-';
        const mLiteral = s.match(/(\d{4})\s*NE\s*(\d{1,6})/i);
        if (mLiteral) {
            const ano = mLiteral[1];
            const seq = String(mLiteral[2] || '').replace(/\D/g, '').padStart(6, '0').slice(-6);
            return `${ano}NE${seq}`;
        }
        const core = ne12(s);
        if (core.length === 12) {
            const ano = core.slice(2, 6);
            const seq = core.slice(6, 12);
            if (/^(19|20)\d{2}$/.test(ano)) {
                return `${ano}NE${seq}`;
            }
        }
        return s;
    }

    function subel2(sub) {
        const d = normalizarDigitos(sub);
        if (!d) return '';
        return d.slice(-2).padStart(2, '0');
    }

    function moeda(n) {
        const x = Number(n || 0);
        if (typeof formatarMoedaBR === 'function') return 'R$ ' + formatarMoedaBR(x);
        return 'R$ ' + x.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    function labelCC(id) {
        const c = listaCentroCustos.find(x => String(x.id) === String(id));
        return c ? String(c.codigo || '-') : (id || '-');
    }
    function labelUG(id) {
        const u = listaUG.find(x => String(x.id) === String(id));
        return u ? String(u.codigo || '-') : (id || '-');
    }

    function formatarDataEmissaoBR(v) {
        const s = String(v || '').trim();
        if (!s) return '';
        const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (m) return `${m[3]}-${m[2]}-${m[1]}`;
        return s;
    }

    function labelUGComNaval(id) {
        const chave = String(id || '').trim();
        if (!chave) return '-';
        const u = (listaUG || []).find(x => String(x.id) === chave);
        if (!u) return chave;
        const cod = String(u.codigo || '').trim() || '-';
        const naval = String(u.indicativoNaval || '').trim();
        return naval ? `${cod}-${naval}` : cod;
    }

    function tituloElegivelPL(t) {
        if (!t || t.inativo) return false;
        if ((t.status || '') !== STATUS_TC_EM_LIQUIDACAO) return false;
        if (String(t.np || '').trim()) return false;
        return true;
    }

    function outraPLAberta(t) {
        const pid = String(t.preLiquidacaoId || '').trim();
        if (!pid) return '';
        if (plIdAtual && pid === plIdAtual) return '';
        const pl = listaPL.find(p => p.id === pid);
        const est = pl ? (pl.estado || '') : '';
        if (est === 'Cancelado') return '';
        return pl ? (pl.codigo || pid) : pid;
    }

    function candidatosNpDocId(npInput) {
        const npInputTrim = String(npInput || '').trim();
        const UG_PADRAO = '741000';
        const GESTAO_PADRAO = '00001';
        const PREFIX11 = UG_PADRAO + GESTAO_PADRAO;
        function completar(valor) {
            const s = String(valor || '').trim();
            if (!s || s.length > 12) return s.length > 12 ? s : '';
            const m = s.match(/^(\d{4})([A-Za-z]{2})(\d{6})$/);
            if (!m) return '';
            const ano = m[1];
            const tipo = (m[2] || '').toUpperCase();
            const num = m[3];
            if (tipo !== 'NP') return '';
            return PREFIX11 + ano + 'NP' + num;
        }
        const out = [];
        if (npInputTrim) out.push(npInputTrim);
        const c = completar(npInputTrim);
        if (c && c !== npInputTrim) out.push(c);
        return out;
    }

    async function vincularTituloNaNP(tituloId, npValor, dataLiquidacao) {
        const npInput = String(npValor || '').trim();
        if (!npInput) return;
        const tituloIdStr = String(tituloId || '').trim();
        const dl = String(dataLiquidacao || '').trim();
        let did = false;
        for (const npDocId of candidatosNpDocId(npInput)) {
            if (!npDocId) continue;
            const ref = db.collection('np').doc(npDocId);
            const snap = await ref.get();
            const payload = {
                np: npDocId,
                titulosVinculados: firebase.firestore.FieldValue.arrayUnion(tituloIdStr),
                editado_em: firebase.firestore.FieldValue.serverTimestamp()
            };
            if (dl) payload.dataLiquidacao = dl;
            if (typeof usuarioLogadoEmail === 'string' && usuarioLogadoEmail) payload.editado_por = usuarioLogadoEmail;
            if (window.sisAnoDocumento && typeof window.sisAnoDocumento.payloadAnosNp === 'function') {
                Object.assign(payload, window.sisAnoDocumento.payloadAnosNp(npDocId));
            }
            if (snap.exists) {
                await ref.set(payload, { merge: true });
                did = true;
                break;
            }
        }
        if (!did) {
            const npDocIdCriar = candidatosNpDocId(npInput)[0];
            const payload = {
                np: npDocIdCriar,
                titulosVinculados: firebase.firestore.FieldValue.arrayUnion(tituloIdStr),
                documentosHabeis: [],
                ativo: true,
                editado_em: firebase.firestore.FieldValue.serverTimestamp()
            };
            if (dl) payload.dataLiquidacao = dl;
            if (typeof usuarioLogadoEmail === 'string' && usuarioLogadoEmail) payload.editado_por = usuarioLogadoEmail;
            if (window.sisAnoDocumento && typeof window.sisAnoDocumento.payloadAnosNp === 'function') {
                Object.assign(payload, window.sisAnoDocumento.payloadAnosNp(npDocIdCriar));
            }
            await db.collection('np').doc(npDocIdCriar).set(payload, { merge: true });
        }
    }

    async function desvincularTituloDaNP(tituloId, npValor) {
        const npInput = String(npValor || '').trim();
        if (!npInput) return;
        const tituloIdStr = String(tituloId || '').trim();
        for (const npDocId of candidatosNpDocId(npInput)) {
            if (!npDocId) continue;
            const ref = db.collection('np').doc(npDocId);
            const snap = await ref.get();
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
            evento: evento || 'Pré-Liquidação',
            acao: 'Pré-Liquidação',
            usuario: typeof usuarioLogadoEmail === 'string' ? usuarioLogadoEmail : '',
            motivoInfo: info || '',
            aba: null
        };
    }

    async function pushHistoricoTitulo(tituloDocId, entry) {
        const ref = db.collection('titulos').doc(tituloDocId);
        const snap = await ref.get();
        const d = snap.data() || {};
        const h1 = Array.isArray(d.historicoStatus) ? d.historicoStatus.slice() : [];
        const h2 = Array.isArray(d.historico) ? d.historico.slice() : [];
        h1.push(entry);
        h2.push(entry);
        await ref.update({
            historicoStatus: h1,
            historico: h2,
            editado_em: firebase.firestore.FieldValue.serverTimestamp()
        });
    }

    function plHistoricoEntry(tipo, detalhe, motivo) {
        return {
            data: firebase.firestore.Timestamp.now(),
            tipo: tipo || 'evento',
            usuario: typeof usuarioLogadoEmail === 'string' ? usuarioLogadoEmail : '',
            detalhe: detalhe || '',
            motivo: motivo || ''
        };
    }

    function titulosDoCarrinho() {
        return baseTitulos.filter(t => carrinhoIds.has(t.id));
    }

    function consolidarEmpenhosPrincipal(titulos) {
        const map = new Map();
        (titulos || []).forEach(t => {
            (t.empenhosVinculados || []).forEach(v => {
                const k = ne12(v.numEmpenho) + '|' + subel2(v.subelemento);
                const val = Number(v.valorVinculado) || 0;
                map.set(k, (map.get(k) || 0) + val);
            });
        });
        return Array.from(map.entries()).map(([k, valor]) => {
            const [ne, sub] = k.split('|');
            return { ne12: ne, subelemento: sub, valor };
        });
    }

    function consolidarDetaCustos(titulos) {
        const map = new Map();
        const frMap = new Map();
        (titulos || []).forEach(t => {
            (t.empenhosVinculados || []).forEach(v => {
                const ne = ne12(v.numEmpenho);
                const sub = subel2(v.subelemento);
                const cc = labelCC(v.centroCustosId);
                const ug = labelUG(v.ugId);
                const k = ne + '|' + sub + '|' + cc + '|' + ug;
                const val = Number(v.valorVinculado) || 0;
                map.set(k, (map.get(k) || 0) + val);
                if (!frMap.has(k)) {
                    const fr = String(v.fr || '').trim();
                    if (fr) frMap.set(k, fr);
                }
            });
        });
        return Array.from(map.entries()).map(([k, valor]) => {
            const p = k.split('|');
            return { ne12: p[0], subelemento: p[1], centroCustos: p[2], ug: p[3], valor, fr: frMap.get(k) || '' };
        });
    }

    function dataAtesteMaisAntiga(titulos) {
        let min = null;
        (titulos || []).forEach(t => {
            const s = t.dataAteste;
            if (!s) return;
            let d;
            if (typeof s === 'string' && /^\d{4}-\d{2}-\d{2}/.test(s)) {
                const [ano, mes, dia] = s.slice(0, 10).split('-').map(Number);
                d = new Date(ano, mes - 1, dia);
            } else {
                d = s && s.toDate ? s.toDate() : new Date(s);
            }
            if (!d || isNaN(d.getTime())) return;
            if (!min || d < min) min = d;
        });
        return min;
    }

    function dataVencimento30(titulos) {
        const d = dataAtesteMaisAntiga(titulos);
        if (!d) return null;
        const x = new Date(d);
        x.setDate(x.getDate() + 30);
        return x;
    }

    function observacoesLinhas(titulos) {
        const linhas = [];
        (titulos || []).forEach(t => {
            const tipoTC = String(t.tipoTC || '');
            const numTC = String(t.numTC || '');
            const emis = formatarDataEmissaoBR(t.dataEmissao);
            (t.empenhosVinculados || []).forEach(v => {
                const partes = [
                    tipoTC + '-' + numTC,
                    emis,
                    labelUGComNaval(v.ugId),
                    labelCC(v.centroCustosId),
                    String(v.ptres || v.fr || '').trim() || '-'
                ];
                linhas.push(partes.join('_'));
            });
            if (!(t.empenhosVinculados || []).length) {
                linhas.push([tipoTC + '-' + numTC, emis, '-', '-', '-'].join('_'));
            }
        });
        return linhas;
    }

    function deducoesPorTipo(titulos, tipo) {
        const rows = [];
        (titulos || []).forEach(t => {
            const deds = t.deducoesAplicadas || t.tributacoes || [];
            deds.forEach(d => {
                if ((d.tipo || '') !== tipo) return;
                rows.push({
                    tituloIdProc: t.idProc || t.id,
                    dataEmissaoTitulo: t.dataEmissao || '',
                    recolhedor: normalizarDigitos(t.fornecedorCnpj || ''),
                    base: Number(d.baseCalculo) || 0,
                    aliq: Number(d.aliquota) || 0,
                    valor: Number(d.valorCalculado != null ? d.valorCalculado : d.valor) || 0,
                    codReceita: d.codReceita || d.codigo || '',
                    natRend: d.natRendimento || '',
                    dataApuracao: d.dataApuracao || '',
                    raw: d
                });
            });
        });
        return rows;
    }

    function truncar2Pdf(n) {
        const v = Number(n || 0);
        if (!isFinite(v) || v <= 0) return 0;
        return Math.floor(v * 100) / 100;
    }

    function calcularComponentesDarfPdf(baseCalculo, aliquotaTotal) {
        const base = Number(baseCalculo || 0);
        const aliqTotal = Number(aliquotaTotal || 0);
        const pesos = { ir: 1.5, cofins: 3.0, csll: 1.0, pis: 0.65 };
        const somaPesos = pesos.ir + pesos.cofins + pesos.csll + pesos.pis;
        const fator = somaPesos > 0 ? (aliqTotal / somaPesos) : 0;
        const valorIR = truncar2Pdf(base * ((pesos.ir * fator) / 100));
        const valorCOFINS = truncar2Pdf(base * ((pesos.cofins * fator) / 100));
        const valorCSLL = truncar2Pdf(base * ((pesos.csll * fator) / 100));
        const valorPISPASEP = truncar2Pdf(base * ((pesos.pis * fator) / 100));
        const total = truncar2Pdf(valorIR + valorCOFINS + valorCSLL + valorPISPASEP);
        return { valorIR, valorCOFINS, valorCSLL, valorPISPASEP, total };
    }

    function linhasEmpenhoConsolidadoPdtc(titulos) {
        const deta = consolidarDetaCustos(titulos);
        return deta.map(row => {
            let neFull = row.ne12;
            let nd = '-';
            let fr = String(row.fr || '').trim();
            for (const t of titulos || []) {
                const hit = (t.empenhosVinculados || []).find(v =>
                    ne12(v.numEmpenho) === row.ne12 && subel2(v.subelemento) === row.subelemento
                    && labelCC(v.centroCustosId) === row.centroCustos && labelUG(v.ugId) === row.ug
                );
                if (hit) {
                    neFull = hit.numEmpenho || row.ne12;
                    nd = hit.nd || '-';
                    if (!fr) fr = String(hit.fr || '').trim();
                    break;
                }
            }
            if (neFull === row.ne12) {
                for (const t of titulos || []) {
                    const hit = (t.empenhosVinculados || []).find(v =>
                        ne12(v.numEmpenho) === row.ne12 && subel2(v.subelemento) === row.subelemento
                    );
                    if (hit) {
                        neFull = hit.numEmpenho || row.ne12;
                        nd = hit.nd || '-';
                        if (!fr) fr = String(hit.fr || '').trim();
                        break;
                    }
                }
            }
            // Colunas VINC/LF/PF ficam vazias por design: serão preenchidas manualmente na impressão.
            return [neExibicaoPdf(neFull), nd, row.subelemento, fr || '-', '', moeda(row.valor), row.centroCustos, row.ug, '', ''];
        });
    }

    function agrupaDedDDF025(rows) {
        const m = new Map();
        rows.forEach(r => {
            const k = (r.codReceita || '') + '|' + (r.natRend || '');
            if (!m.has(k)) m.set(k, { codReceita: r.codReceita, natRend: r.natRend, linhas: [] });
            m.get(k).linhas.push(r);
        });
        return Array.from(m.values());
    }

    async function gerarPDFDauliq(pl, titulos, opcoesPdf) {
        if (!window.jspdf || !window.jspdf.jsPDF) {
            alert('Biblioteca jsPDF indisponível.');
            return;
        }
        const incluirHistorico = !(opcoesPdf && opcoesPdf.incluirHistorico === false);
        const salvar = !(opcoesPdf && opcoesPdf.salvar === false);
        const iniciarComNovaPagina = !!(opcoesPdf && opcoesPdf.iniciarComNovaPagina === true);
        const { jsPDF } = window.jspdf;
        const docPDF = (opcoesPdf && opcoesPdf.docPDF) || new jsPDF({ unit: 'mm', format: 'a4' });
        if (opcoesPdf && opcoesPdf.docPDF && iniciarComNovaPagina) docPDF.addPage();
        const M = { l: 10, r: 10, t: 10, b: 12 };
        const W = 210 - M.l - M.r;
        const PAGE_H = 297;
        let y = M.t;

        const toDateBr = (v) => {
            if (!v) return '-';
            if (v.toDate) {
                const d = v.toDate();
                return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
            }
            if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)) {
                const p = v.slice(0, 10).split('-');
                return `${p[2]}/${p[1]}/${p[0]}`;
            }
            if (v instanceof Date && !isNaN(v.getTime())) {
                return `${String(v.getDate()).padStart(2, '0')}/${String(v.getMonth() + 1).padStart(2, '0')}/${v.getFullYear()}`;
            }
            const d = new Date(v);
            if (isNaN(d.getTime())) return String(v);
            return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
        };
        const toDateTimeBr = (v) => {
            if (!v) return '-';
            const d = v.toDate ? v.toDate() : new Date(v);
            if (isNaN(d.getTime())) return '-';
            const data = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
            const hora = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
            return `${data} às ${hora}`;
        };

        const garantirEspaco = (h) => {
            if (y + h > PAGE_H - M.b) { docPDF.addPage(); y = M.t; }
        };
        const tituloSecao = (txt) => {
            garantirEspaco(8);
            docPDF.setFont('helvetica', 'bold');
            docPDF.setFontSize(9.5);
            docPDF.setTextColor(0, 0, 0);
            docPDF.text(String(txt || ''), M.l, y + 4.8);
            docPDF.setDrawColor(155, 155, 155);
            docPDF.line(M.l, y + 5.8, M.l + W, y + 5.8);
            y += 8;
        };
        const campoAbaixo = (label, valor, x, largura) => {
            const h = 12;
            garantirEspaco(h + 1);
            docPDF.setDrawColor(170, 170, 170);
            docPDF.rect(x, y, largura, h);
            docPDF.setFont('helvetica', 'bold');
            docPDF.setFontSize(7.3);
            docPDF.setTextColor(0, 0, 0);
            docPDF.text(String(label || '-'), x + 1.5, y + 3.4);
            docPDF.setFont('helvetica', 'normal');
            docPDF.setFontSize(8.1);
            const linhas = docPDF.splitTextToSize(String(valor || '-'), largura - 3);
            docPDF.text(linhas, x + 1.5, y + 8);
        };
        const linhaCampos = (campos) => {
            const gap = 2;
            const largura = (W - gap * (campos.length - 1)) / campos.length;
            campos.forEach((c, i) => campoAbaixo(c.label, c.valor, M.l + i * (largura + gap), largura));
            y += 13;
        };
        const tabela = (headers, rows, larguras) => {
            if (!rows || rows.length === 0) return;
            const hCab = 6;
            const hRow = 5.4;
            garantirEspaco(hCab + hRow + 2);
            const totalLarg = (larguras || []).reduce((s, n) => s + Number(n || 0), 0) || 1;
            const fator = W / totalLarg;
            const largurasEsc = (larguras || []).map(n => Number(n || 0) * fator);
            let x = M.l;
            docPDF.setDrawColor(175, 175, 175);
            docPDF.setTextColor(0, 0, 0);
            headers.forEach((h, i) => {
                docPDF.rect(x, y, largurasEsc[i], hCab);
                docPDF.setFont('helvetica', 'bold');
                docPDF.setFontSize(7.1);
                docPDF.text(String(h), x + 1.2, y + 4);
                x += largurasEsc[i];
            });
            y += hCab;
            rows.forEach(r => {
                garantirEspaco(hRow + 1);
                x = M.l;
                r.forEach((cell, i) => {
                    docPDF.rect(x, y, largurasEsc[i], hRow);
                    docPDF.setFont('helvetica', 'normal');
                    docPDF.setFontSize(7.0);
                    const txt = docPDF.splitTextToSize(String(cell ?? '-'), largurasEsc[i] - 2.2);
                    docPDF.text(txt.slice(0, 1), x + 1.1, y + 3.8);
                    x += largurasEsc[i];
                });
                y += hRow;
            });
            y += 2;
        };
        const linhaTotalDireita = (label, valor) => {
            garantirEspaco(6);
            docPDF.setFont('helvetica', 'bold');
            docPDF.setFontSize(8.2);
            docPDF.text(`${label}: ${valor}`, M.l + W, y + 4, { align: 'right' });
            y += 6;
        };

        const blocoTextoMultilinha = (titulo, linhasTexto) => {
            const texto = (linhasTexto || []).join('\n');
            if (!texto.trim()) return;
            const lineH = 3.6;
            const pad = 2;
            const split = docPDF.splitTextToSize(texto, W - 4);
            const boxH = Math.max(14, split.length * lineH + pad * 2 + 5);
            garantirEspaco(boxH + 4);
            docPDF.setDrawColor(170, 170, 170);
            docPDF.rect(M.l, y, W, boxH);
            docPDF.setFont('helvetica', 'bold');
            docPDF.setFontSize(7.3);
            docPDF.text(String(titulo || ''), M.l + 1.5, y + 3.8);
            docPDF.setFont('helvetica', 'normal');
            docPDF.setFontSize(7.0);
            let yy = y + 7.5;
            split.forEach(ln => {
                if (yy > y + boxH - 2) return;
                docPDF.text(ln, M.l + 1.5, yy);
                yy += lineH;
            });
            y += boxH + 2;
        };

        let logoData = null;
        try {
            const resp = await fetch('icons/logo-192.png');
            if (resp.ok) {
                const blob = await resp.blob();
                logoData = await new Promise((resolve) => {
                    const fr = new FileReader();
                    fr.onload = () => resolve(fr.result);
                    fr.onerror = () => resolve(null);
                    fr.readAsDataURL(blob);
                });
            }
        } catch (_) {}

        const topoY = y;
        if (logoData) {
            try { docPDF.addImage(logoData, 'PNG', M.l, topoY, 20, 20); } catch (_) {}
        }
        docPDF.setFont('helvetica', 'bold');
        docPDF.setFontSize(12);
        docPDF.text('Documento Auxiliar de Liquidação (DAuLiq)', M.l + W / 2, topoY + 24, { align: 'center' });
        docPDF.setFont('helvetica', 'normal');
        docPDF.setFontSize(8);
        docPDF.text(`Impressão: ${toDateTimeBr(new Date())}`, M.l + W, topoY + 6, { align: 'right' });
        docPDF.text(`Usuário: ${typeof usuarioLogadoEmail === 'string' ? usuarioLogadoEmail : '-'}`, M.l + W, topoY + 11, { align: 'right' });
        y = topoY + 29;

        const cnpjCred = normalizarDigitos(titulos[0]?.fornecedorCnpj || '');
        const nomeCred = titulos[0]?.fornecedorNome || titulos[0]?.fornecedor || '-';
        const venc = dataVencimento30(titulos);
        const ateste = dataAtesteMaisAntiga(titulos);
        const valorDoc = titulos.reduce((s, t) => s + (Number(t.valorNotaFiscal) || 0), 0);
        const dedsFlat = (titulos || []).flatMap(t =>
            (t.deducoesAplicadas || t.tributacoes || []).map(d => ({
                ...d,
                valorCalculado: truncar2Pdf(Number(d.valorCalculado != null ? d.valorCalculado : d.valor) || 0)
            }))
        );
        const totalDed = truncar2Pdf(dedsFlat.reduce((s, d) => s + truncar2Pdf(d.valorCalculado || 0), 0));
        const valorTCNum = valorDoc;
        const obBase = Math.max(0, valorTCNum - totalDed);
        let valorOB = Math.ceil(obBase * 100) / 100;
        if (truncar2Pdf(totalDed + valorOB) > truncar2Pdf(valorTCNum)) valorOB = truncar2Pdf(obBase);

        const hojeStr = toDateBr(new Date());
        const vencStr = toDateBr(venc);
        const atesteStr = toDateBr(ateste);

        tituloSecao('IDENTIFICAÇÃO DA PRÉ-LIQUIDAÇÃO');
        linhaCampos([
            { label: 'Código PL', valor: pl.codigo || '-' },
            { label: 'Estado', valor: pl.estado || '-' },
            { label: 'NP (se informada)', valor: pl.np || '-' },
            { label: 'Data liquidação (PL)', valor: toDateBr(pl.dataLiquidacao) }
        ]);

        tituloSecao('DADOS BÁSICOS');
        linhaCampos([
            { label: 'Data do ateste (bloco)', valor: atesteStr },
            { label: 'Data de vencimento (+30)', valor: vencStr },
            { label: 'Valor do documento', valor: moeda(valorDoc) },
            { label: 'Código do credor', valor: cnpjCred || '-' },
            { label: 'Nome do credor', valor: nomeCred }
        ]);

        tituloSecao('DOCUMENTOS DE ORIGEM');
        tabela(
            ['ID-PROC', 'Emitente (CNPJ)', 'Emissão TC', 'Documento (tipo-nº)', 'Valor R$'],
            titulos.map(t => [
                t.idProc || '-',
                normalizarDigitos(t.fornecedorCnpj || ''),
                toDateBr(t.dataEmissao),
                `${t.tipoTC || ''}-${t.numTC || ''}`,
                moeda(t.valorNotaFiscal)
            ]),
            [22, 28, 22, 42, 20]
        );

        tituloSecao('OBSERVAÇÕES (CONCATENADAS)');
        blocoTextoMultilinha('Uma linha por combinação (padrão auxiliar)', observacoesLinhas(titulos));

        tituloSecao('FORNECEDOR / FAVORECIDO E CONTRATO');
        const instrumentos = [...new Set(titulos.map(t => String(t.instrumento || '').trim()).filter(Boolean))].join('; ') || '-';
        linhaCampos([
            { label: 'Favorecido (CNPJ)', valor: cnpjCred || '-' },
            { label: 'Nome', valor: nomeCred },
            { label: 'RC / Conta contrato', valor: titulos[0]?.rc || '-' },
            { label: 'Contrato(s)', valor: instrumentos.length > 80 ? instrumentos.slice(0, 77) + '…' : instrumentos }
        ]);
        linhaCampos([{ label: 'Quantidade de TCs no lote', valor: String(titulos.length) }]);

        const rowsEmp = linhasEmpenhoConsolidadoPdtc(titulos);
        if (rowsEmp.length) {
            tituloSecao('PRINCIPAL COM ORÇAMENTO — EMPENHOS (CONSOLIDADO)');
            linhaCampos([
                { label: 'Data vencimento (ref. deduções)', valor: vencStr },
                { label: 'Data pagamento (ref.)', valor: hojeStr }
            ]);
            tabela(
                ['Nota de Empenho', 'ND', 'Sub', 'FR', 'VINC', 'Valor usado', 'C. de Custos', 'UG Benf.', 'LF', 'PF'],
                rowsEmp,
                [12, 6, 4, 10, 6, 12, 10, 6, 15, 15]
            );
            const totalNE = consolidarEmpenhosPrincipal(titulos).reduce((s, e) => s + (Number(e.valor) || 0), 0);
            if (totalNE > 0) linhaTotalDireita('Valor total das NE (consolidado)', moeda(totalNE));
        }

        const itensISS = deducoesPorTipo(titulos, 'DDR001');
        const itensINSS = deducoesPorTipo(titulos, 'DDF021');
        const itensDARF = deducoesPorTipo(titulos, 'DDF025');

        if (itensISS.length) {
            tituloSecao('Dedução - ISS - DDR001');
            linhaCampos([
                { label: 'Data vencimento (bloco)', valor: vencStr },
                { label: 'Data pagamento (ref.)', valor: hojeStr }
            ]);
            tabela(
                ['ID-PROC', 'Cod. Receita', 'Base de Cálculo', 'Alíquota', 'Valor a deduzir', 'Data apuração'],
                itensISS.map(d => [
                    d.tituloIdProc,
                    d.codReceita || '-',
                    moeda(d.base),
                    `${Number(d.aliq || 0).toFixed(2)}%`,
                    moeda(truncar2Pdf(d.valor)),
                    toDateBr(d.dataApuracao)
                ]),
                [18, 22, 28, 18, 28, 22]
            );
            if (itensISS.length > 1) {
                const sumIss = itensISS.reduce((s, d) => s + truncar2Pdf(Number(d.valor) || 0), 0);
                linhaTotalDireita('Valor total ISS', moeda(sumIss));
            }
        }
        if (itensINSS.length) {
            tituloSecao('Dedução - INSS - DDF021');
            linhaCampos([
                { label: 'Data vencimento (bloco)', valor: vencStr },
                { label: 'Data pagamento (ref.)', valor: hojeStr }
            ]);
            tabela(
                ['ID-PROC', 'Cod. Receita', 'Base de Cálculo', 'Alíquota', 'Valor a deduzir', 'Data (emissão TC)'],
                itensINSS.map(d => [
                    d.tituloIdProc,
                    d.codReceita || '-',
                    moeda(d.base),
                    `${Number(d.aliq || 0).toFixed(2)}%`,
                    moeda(truncar2Pdf(d.valor)),
                    toDateBr(d.dataEmissaoTitulo)
                ]),
                [18, 22, 28, 18, 28, 22]
            );
            if (itensINSS.length > 1) {
                const sumInss = itensINSS.reduce((s, d) => s + truncar2Pdf(Number(d.valor) || 0), 0);
                linhaTotalDireita('Valor total INSS', moeda(sumInss));
            }
        }
        if (itensDARF.length) {
            tituloSecao('Dedução - DARF - DDF025');
            linhaCampos([
                { label: 'Data vencimento (bloco)', valor: vencStr },
                { label: 'Data pagamento (ref.)', valor: hojeStr }
            ]);
            const rowsDarF = itensDARF.map(d => {
                const base = Number(d.base || titulos.find(t => (t.idProc || t.id) === d.tituloIdProc)?.valorNotaFiscal || 0);
                const aliq = Number(d.aliq || 0);
                const rd = d.raw || {};
                const comps = (rd.valorIR != null || rd.valorCOFINS != null || rd.valorCSLL != null || rd.valorPISPASEP != null)
                    ? {
                        valorIR: truncar2Pdf(rd.valorIR || 0),
                        valorCOFINS: truncar2Pdf(rd.valorCOFINS || 0),
                        valorCSLL: truncar2Pdf(rd.valorCSLL || 0),
                        valorPISPASEP: truncar2Pdf(rd.valorPISPASEP || 0),
                        total: truncar2Pdf((rd.valorIR || 0) + (rd.valorCOFINS || 0) + (rd.valorCSLL || 0) + (rd.valorPISPASEP || 0))
                    }
                    : calcularComponentesDarfPdf(base, aliq);
                return [
                    d.tituloIdProc,
                    d.codReceita || '-',
                    String(d.natRend || (d.raw && d.raw.natRendimento) || '').trim() || '-',
                    moeda(base),
                    `${aliq.toFixed(2)}%`,
                    moeda(comps.valorIR),
                    moeda(comps.valorCOFINS),
                    moeda(comps.valorCSLL),
                    moeda(comps.valorPISPASEP),
                    moeda(comps.total)
                ];
            });
            tabela(
                ['ID-PROC', 'Cod. Receita', 'Nat. Red.', 'Base', 'Alíq. tot.', 'IR', 'COFINS', 'CSLL', 'PIS/PASEP', 'Total'],
                rowsDarF,
                [14, 16, 14, 18, 12, 12, 12, 12, 14, 18]
            );
            if (itensDARF.length > 1) {
                let sumDarf = 0;
                itensDARF.forEach(d => {
                    const base = Number(d.base || titulos.find(t => (t.idProc || t.id) === d.tituloIdProc)?.valorNotaFiscal || 0);
                    const aliq = Number(d.aliq || 0);
                    const rd = d.raw || {};
                    const usarRaw = rd.valorIR != null || rd.valorCOFINS != null || rd.valorCSLL != null || rd.valorPISPASEP != null;
                    sumDarf += usarRaw
                        ? truncar2Pdf((rd.valorIR || 0) + (rd.valorCOFINS || 0) + (rd.valorCSLL || 0) + (rd.valorPISPASEP || 0))
                        : calcularComponentesDarfPdf(base, aliq).total;
                });
                linhaTotalDireita('Valor total DARF', moeda(sumDarf));
            }
        }

        tituloSecao('DADOS DE PAGAMENTO');
        linhaCampos([
            { label: 'Recolhedor (CNPJ)', valor: cnpjCred || '-' },
            { label: 'Valor total dos TCs', valor: moeda(valorTCNum) },
            { label: 'Total das deduções', valor: moeda(totalDed) },
            { label: 'Valor líquido (OB)', valor: moeda(valorOB) }
        ]);

        tituloSecao('DETA CUSTOS (AGRUPADO NE × SUB × CC × UG)');
        const detaRows = consolidarDetaCustos(titulos).map(l => [
            neExibicaoPdf(l.ne12), l.subelemento, l.centroCustos, l.ug, moeda(l.valor)
        ]);
        if (detaRows.length) {
            tabela(['Nota de Empenho', 'Sub', 'Centro custos', 'UG', 'Valor'], detaRows, [28, 14, 40, 28, 22]);
        }

        if (incluirHistorico) {
            const histRows = (pl.historico || []).slice().reverse().slice(0, 45).map(h => {
                const dt = h.data && h.data.toDate ? h.data.toDate().toLocaleString('pt-BR') : '-';
                return [dt, h.tipo || '-', h.usuario || '-', String(h.detalhe || '') + (h.motivo ? ' — ' + h.motivo : '')];
            });
            if (histRows.length) {
                tituloSecao('HISTÓRICO / AUDITORIA (PRÉ-LIQUIDAÇÃO)');
                tabela(['Data', 'Tipo', 'Usuário', 'Detalhe'], histRows, [28, 22, 32, 72]);
            }
        }

        if (!salvar) {
            // Modo batch: o chamador é responsável pela paginação final e pelo save.
            return { ok: true };
        }

        const totalPages = docPDF.getNumberOfPages();
        for (let i = 1; i <= totalPages; i++) {
            docPDF.setPage(i);
            docPDF.setFontSize(8);
            docPDF.text(`Página ${i} de ${totalPages}`, 105, 290, { align: 'center' });
        }

        const sufArq = incluirHistorico ? '' : '_sem-historico';
        docPDF.save('DAuLiq_' + String(pl.codigo || 'lote').replace(/\//g, '-') + sufArq + '.pdf');
        return { ok: true };
    }

    function pedirMotivo(tituloModal) {
        return new Promise((resolve) => {
            document.getElementById('modalPLMotivoTitulo').textContent = tituloModal || 'Motivo';
            document.getElementById('modalPLMotivoTexto').value = '';
            document.getElementById('modalPLMotivo').style.display = 'flex';
            modalMotivoResolver = resolve;
        });
    }

    function fecharModalMotivo(ok) {
        document.getElementById('modalPLMotivo').style.display = 'none';
        const txt = document.getElementById('modalPLMotivoTexto').value.trim();
        if (modalMotivoResolver) {
            const fn = modalMotivoResolver;
            modalMotivoResolver = null;
            fn(ok ? txt : null);
        }
    }

    async function algumTituloComOP(ids) {
        for (const id of ids) {
            const snap = await db.collection('titulos').doc(id).get();
            const d = snap.data() || {};
            if (String(d.op || '').trim()) return true;
        }
        return false;
    }

    function fornecedoresUnicosDosTitulos() {
        const m = new Map();
        baseTitulos.forEach(t => {
            const c = normalizarDigitos(t.fornecedorCnpj || '');
            if (!c) return;
            if (!m.has(c)) m.set(c, t.fornecedorNome || t.fornecedor || c);
        });
        return Array.from(m.entries()).map(([codigo, razaoSocial]) => ({ codigo, razaoSocial, nome: razaoSocial }));
    }

    function resolverAnoExercicioPL(p) {
        if (!p) return null;
        if (typeof p.anoExercicio === 'number') {
            const n = p.anoExercicio;
            if (n >= 1900 && n <= 2100) return n;
        }
        if (window.sisAnoDocumento && typeof window.sisAnoDocumento.anoDeCodigoPL === 'function') {
            const y = window.sisAnoDocumento.anoDeCodigoPL(p.codigo);
            if (y != null) return y;
        }
        const m = String(p.codigo || '').match(/\/(\d{4})\s*$/);
        return m ? parseInt(m[1], 10) : null;
    }

    function popularSelectFiltroAnoPL() {
        const sel = document.getElementById('filtroAnoExercicioPL');
        if (!sel) return;
        const cur = new Date().getFullYear();
        const antes = filtroAnoExercicioPL;
        sel.innerHTML = '';
        const opTodos = document.createElement('option');
        opTodos.value = 'todos';
        opTodos.textContent = 'Todos os anos';
        sel.appendChild(opTodos);
        for (let y = cur + 1; y >= cur - 20; y--) {
            const op = document.createElement('option');
            op.value = String(y);
            op.textContent = String(y);
            sel.appendChild(op);
        }
        if (antes === 'todos') sel.value = 'todos';
        else if (antes && [...sel.options].some(o => o.value === antes)) sel.value = antes;
        else sel.value = String(cur);
        filtroAnoExercicioPL = sel.value;
        if (!filtroAnoPLListenerOk) {
            filtroAnoPLListenerOk = true;
            sel.addEventListener('change', function() {
                filtroAnoExercicioPL = this.value;
                try {
                    const u = new URL(window.location.href);
                    if (filtroAnoExercicioPL === 'todos') u.searchParams.delete('ano');
                    else u.searchParams.set('ano', filtroAnoExercicioPL);
                    if (history.replaceState) history.replaceState({}, '', u.pathname + u.search);
                } catch (e) {}
                desenharListaPL();
            });
        }
    }

    function titulosDoLoteParaResumoFin(p) {
        const raw = [...new Set([...(p.tituloIds || []), ...(p.titulosParticiparamIds || [])])];
        const out = [];
        raw.forEach(id => {
            const t = baseTitulos.find(x => x.id === id);
            if (t) out.push(t);
        });
        return out;
    }

    /**
     * Lista PL: acompanhamento pós-NP a partir de empenhosVinculados dos TCs do lote
     * (heurística até existir itensNe[] / status persistido na PL).
     */
    function resumoFinanceiroLotePL(p) {
        if (!p || (p.estado || '') !== 'Fechado') return null;
        const titulos = titulosDoLoteParaResumoFin(p);
        if (!titulos.length) return null;
        const linhas = [];
        titulos.forEach(t => {
            (t.empenhosVinculados || []).forEach(v => {
                if ((v.numEmpenho || '').trim() || Number(v.valorVinculado) > 0) linhas.push(v);
            });
        });
        if (!linhas.length) return null;
        const total = linhas.length;
        const comLf = linhas.filter(v => String(v.lf || '').trim());
        if (comLf.length < total) return { cls: 'badge-pl-pendente-lf', label: 'Pendente LF' };
        const comPf = linhas.filter(v => String(v.pf || '').trim());
        if (comPf.length === 0) return { cls: 'badge-pl-aguardando-fin', label: 'Aguardando Fin.' };
        if (comPf.length === total) return { cls: 'badge-pl-para-pg', label: 'Para pagamento' };
        return { cls: 'badge-pl-pgto-parcial', label: 'Pgto parcial' };
    }

    function obterTimestampEmMsPL(ts) {
        if (!ts) return 0;
        const d = ts.toDate ? ts.toDate() : new Date(ts);
        return isNaN(d.getTime()) ? 0 : d.getTime();
    }

    function plListaFiltrada() {
        const mostrarInat = document.getElementById('filtroPLInativas')?.checked;
        let lista = listaPL.filter(p => {
            if (p.ativo === false && !mostrarInat && !ehAdmin()) return false;
            if (filtroAnoExercicioPL && filtroAnoExercicioPL !== 'todos') {
                const want = parseInt(filtroAnoExercicioPL, 10);
                if (!isNaN(want) && resolverAnoExercicioPL(p) !== want) return false;
            }
            return true;
        });
        if (termoBuscaPL.trim()) {
            const q = termoBuscaPL.toLowerCase();
            lista = lista.filter(p =>
                String(p.codigo || '').toLowerCase().includes(q) ||
                String(p.fornecedorNome || '').toLowerCase().includes(q) ||
                String(p.np || '').toLowerCase().includes(q) ||
                String(p.fornecedorCnpj || '').toLowerCase().includes(q)
            );
        }
        const { coluna, direcao } = estadoOrdenacaoPL;
        lista.sort((a, b) => {
            if (coluna === 'valorTotal') {
                const va = valorTotalLoteNaLista(a);
                const vb = valorTotalLoteNaLista(b);
                return direcao === 'asc' ? va - vb : vb - va;
            }
            if (coluna === 'qtdTcs') {
                const va = (a.tituloIds || []).length || (a.titulosParticiparamIds || []).length;
                const vb = (b.tituloIds || []).length || (b.titulosParticiparamIds || []).length;
                return direcao === 'asc' ? va - vb : vb - va;
            }
            if (coluna === 'editado_em') {
                const ta = obterTimestampEmMsPL(a.editado_em);
                const tb = obterTimestampEmMsPL(b.editado_em);
                return direcao === 'asc' ? ta - tb : tb - ta;
            }
            let va = a[coluna] != null ? String(a[coluna]).toLowerCase() : '';
            let vb = b[coluna] != null ? String(b[coluna]).toLowerCase() : '';
            const cmp = va.localeCompare(vb);
            return direcao === 'asc' ? cmp : -cmp;
        });
        return lista;
    }

    function atualizarIconesOrdenacaoPL() {
        document.querySelectorAll('#tabelaPreLiquidacoes .sort-icon').forEach(el => { el.textContent = ''; });
        const icon = document.getElementById('sort-pl-' + estadoOrdenacaoPL.coluna);
        if (icon) icon.textContent = estadoOrdenacaoPL.direcao === 'asc' ? '▲' : '▼';
    }

    window.ordenarListaPL = function(coluna) {
        if (estadoOrdenacaoPL.coluna === coluna) {
            estadoOrdenacaoPL.direcao = estadoOrdenacaoPL.direcao === 'asc' ? 'desc' : 'asc';
        } else {
            estadoOrdenacaoPL.coluna = coluna;
            estadoOrdenacaoPL.direcao = coluna === 'codigo' ? 'desc' : 'asc';
        }
        paginaAtualPL = 1;
        atualizarIconesOrdenacaoPL();
        desenharListaPL();
    };

    window.mudarTamanhoPaginaPL = function() {
        itensPorPaginaPL = parseInt(document.getElementById('itensPorPaginaPL')?.value || 10, 10);
        paginaAtualPL = 1;
        desenharListaPL();
    };
    window.mudarPaginaPL = function(dir) {
        paginaAtualPL += dir;
        desenharListaPL();
    };
    window.irParaPrimeiraPaginaPL = function() {
        paginaAtualPL = 1;
        desenharListaPL();
    };
    window.irParaUltimaPaginaPL = function() {
        const lista = plListaFiltrada();
        paginaAtualPL = Math.ceil(lista.length / itensPorPaginaPL) || 1;
        desenharListaPL();
    };

    function desenharListaPL() {
        const tbody = document.getElementById('tbodyListaPL');
        if (!tbody) return;
        tbody.innerHTML = '';
        const filtrada = plListaFiltrada();
        const idsExibidos = new Set(filtrada.map(p => p.id));
        plSelecionados.forEach(id => { if (!idsExibidos.has(id)) plSelecionados.delete(id); });
        const totalPaginas = Math.ceil(filtrada.length / itensPorPaginaPL) || 1;
        if (paginaAtualPL > totalPaginas) paginaAtualPL = totalPaginas;
        if (paginaAtualPL < 1) paginaAtualPL = 1;
        const inicio = (paginaAtualPL - 1) * itensPorPaginaPL;
        const pagina = filtrada.slice(inicio, inicio + itensPorPaginaPL);
        if (!filtrada.length) {
            tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;">Nenhuma pré-liquidação encontrada.</td></tr>';
            plSelecionados.clear();
            atualizarUIselecaoPL();
        } else {
        const podePdf = tem('preliquidacao_gerar_pdf') || ehAdmin();
        const podeEditarLista = podeOperarPLLista();
        pagina.forEach(p => {
            const tr = document.createElement('tr');
            const n = (p.tituloIds || []).length || (p.titulosParticiparamIds || []).length;
            const nPdf = idsTitulosParaPdfPL(p).length;
            const est = p.estado || 'Rascunho';
            let badge = '<span class="badge-pl-rascunho">Rascunho</span>';
            if (est === 'Fechado') {
                badge = '<span class="badge-pl-fechado">Fechado</span>';
                const fin = resumoFinanceiroLotePL(p);
                if (fin) {
                    badge += ' <span class="' + fin.cls + '" title="Derivado das NE/LF/PF nos TCs do lote">' + escapeHTML(fin.label) + '</span>';
                }
            }
            if (est === 'Cancelado') badge = '<span class="badge-pl-cancel">Cancelado</span>';
            if (p.ativo === false) badge += ' <span class="badge-pl-inativo">Inativo</span>';
            const vTot = valorTotalLoteNaLista(p);
            const btnEditar = podeEditarLista
                ? `<button type="button" class="btn-icon btn-pl-editar" data-id="${escapeHTML(p.id)}" title="Editar">✏️</button>`
                : '';
            const btnPdf = podePdf
                ? `<button type="button" class="btn-icon btn-pl-pdf" data-id="${escapeHTML(p.id)}" title="Gerar DAuLiq"${nPdf ? '' : ' disabled'}>📄</button>`
                : '';
            const podeSelecionar = podePdf && nPdf > 0;
            const checked = podeSelecionar && plSelecionados.has(p.id) ? ' checked' : '';
            const disabledChk = podeSelecionar ? '' : ' disabled title="Sem títulos no lote ou sem permissão"';
            const cnpjListaDigitos = normalizarDigitos(p.fornecedorCnpj || '');
            const linkProcLista = cnpjListaDigitos
                ? `<a href="titulos.html?cnpj=${encodeURIComponent(cnpjListaDigitos)}&status=Em%20Liquida%C3%A7%C3%A3o" target="_blank" rel="noopener" title="Ver PROCs deste CNPJ em nova aba" style="margin-left:5px;font-size:11px;white-space:nowrap;">↗ PROCs</a>`
                : '';
            tr.innerHTML = `
                <td><input type="checkbox" class="check-pl check-pl-row" data-id="${escapeHTML(p.id)}"${checked}${disabledChk}></td>
                <td>${escapeHTML(p.codigo || '-')}</td>
                <td>${badge}</td>
                <td>${escapeHTML(p.fornecedorNome || '-')}${linkProcLista}</td>
                <td style="text-align:right;white-space:nowrap;">${escapeHTML(moeda(vTot))}</td>
                <td style="text-align:center;">${n}</td>
                <td style="white-space:nowrap;">${escapeHTML(formatarDataSimplesPL(p.dataLiquidacao))}</td>
                <td style="font-size:12px;white-space:nowrap;">${escapeHTML(formatarDataHoraLista(p.editado_em))}</td>
                <td style="font-size:12px;">${escapeHTML(p.np || '—')}</td>
                <td class="pl-acoes" style="white-space:nowrap;">
                    <button type="button" class="btn-icon btn-pl-ver" data-id="${escapeHTML(p.id)}" title="Visualizar">👁️</button>
                    ${btnEditar}
                    ${btnPdf}
                </td>
            `;
            tbody.appendChild(tr);
        });
        }
        const info = document.getElementById('infoPaginaPL');
        if (info) info.textContent = `Página ${paginaAtualPL} de ${totalPaginas}`;
        const mostrandoDe = document.getElementById('mostrandoDePL');
        const mostrandoTotal = document.getElementById('mostrandoTotalPL');
        if (mostrandoDe) mostrandoDe.textContent = pagina.length;
        if (mostrandoTotal) mostrandoTotal.textContent = filtrada.length;
        const btnPrimeira = document.getElementById('btnPrimeiraPL');
        const btnAnt = document.getElementById('btnAnteriorPL');
        const btnProx = document.getElementById('btnProximoPL');
        const btnUltima = document.getElementById('btnUltimaPL');
        if (btnPrimeira) btnPrimeira.disabled = paginaAtualPL <= 1;
        if (btnAnt) btnAnt.disabled = paginaAtualPL <= 1;
        if (btnProx) btnProx.disabled = paginaAtualPL >= totalPaginas;
        if (btnUltima) btnUltima.disabled = paginaAtualPL >= totalPaginas;
        atualizarIconesOrdenacaoPL();
        tbody.querySelectorAll('.btn-pl-ver').forEach(btn => {
            btn.addEventListener('click', () => abrirEditorPL(btn.getAttribute('data-id'), { somenteLeitura: true }));
        });
        tbody.querySelectorAll('.btn-pl-editar').forEach(btn => {
            btn.addEventListener('click', () => abrirEditorPL(btn.getAttribute('data-id'), { somenteLeitura: false }));
        });
        tbody.querySelectorAll('.btn-pl-pdf').forEach(btn => {
            btn.addEventListener('click', () => {
                if (btn.disabled) return;
                gerarDauliqDaLista(btn.getAttribute('data-id'));
            });
        });
        tbody.querySelectorAll('.check-pl-row').forEach(chk => {
            chk.addEventListener('change', function() {
                const id = this.getAttribute('data-id');
                if (this.checked) plSelecionados.add(id); else plSelecionados.delete(id);
                atualizarUIselecaoPL();
                sincronizarCheckTodosPL();
            });
        });
        sincronizarCheckTodosPL();
        atualizarUIselecaoPL();
    }

    function sincronizarCheckTodosPL() {
        const chkTodos = document.getElementById('checkTodosPL');
        if (!chkTodos) return;
        const checks = document.querySelectorAll('#tbodyListaPL .check-pl-row:not(:disabled)');
        if (!checks.length) { chkTodos.checked = false; chkTodos.indeterminate = false; return; }
        const marcados = Array.from(checks).filter(c => c.checked).length;
        chkTodos.checked = marcados === checks.length;
        chkTodos.indeterminate = marcados > 0 && marcados < checks.length;
    }

    function atualizarUIselecaoPL() {
        const container = document.getElementById('containerSelecaoMultiplaPL');
        const count = document.getElementById('countSelecionadosPL');
        const btn = document.getElementById('btnImprimirBlocoPL');
        if (!container || !count) return;
        const n = plSelecionados.size;
        container.style.display = n > 0 ? 'block' : 'none';
        count.textContent = n;
        if (btn) {
            if (n > 10) {
                btn.title = `Selecionados: ${n}. Limite de 10 DAuLiq por impressão em bloco.`;
            } else {
                btn.title = `Gerar PDF único com ${n} DAuLiq.`;
            }
        }
    }

    function fmtDataLocalPL(d) {
        if (!d || isNaN(d.getTime())) return '—';
        return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
    }

    function fornecedorBloqueadoPL() {
        if (plSomenteLeitura) return true;
        if (carrinhoIds.size > 0) return true;
        if (plIdAtual && plDocAtual && (plDocAtual.estado || '') !== 'Rascunho') return true;
        return false;
    }

    function atualizarUiFornecedorPL() {
        const buscaWrap = document.getElementById('plFornecedorBusca');
        const chipWrap = document.getElementById('plFornecedorChipWrap');
        const chipTexto = document.getElementById('plChipTexto');
        const linkProcs = document.getElementById('plLinkProcs');
        const chipAcoes = document.getElementById('plChipAcoes');
        const hintSemCnpj = document.getElementById('plHintSemCnpj');
        const blocoTitulos = document.getElementById('plBlocoTitulosComCnpj');
        const hintAbas = document.getElementById('plHintAbas');
        const inpBusca = document.getElementById('plBuscaFornecedor');
        const cnpjDigitos = normalizarDigitos(fornecedorFiltroCnpj || '');

        if (hintSemCnpj) hintSemCnpj.style.display = cnpjDigitos ? 'none' : 'block';
        if (blocoTitulos) blocoTitulos.style.display = cnpjDigitos ? 'block' : 'none';

        if (!cnpjDigitos) {
            if (buscaWrap) buscaWrap.classList.add('visivel');
            if (chipWrap) chipWrap.classList.remove('visivel');
            if (inpBusca) { inpBusca.disabled = plSomenteLeitura; inpBusca.value = ''; }
            return;
        }

        const nomeExib = fornecedorFiltroNome
            ? escapeHTML(fornecedorFiltroNome) + ' (' + escapeHTML(cnpjDigitos) + ')'
            : escapeHTML(cnpjDigitos);
        if (chipTexto) chipTexto.innerHTML = nomeExib;
        if (linkProcs) {
            linkProcs.href = 'titulos.html?cnpj=' + encodeURIComponent(cnpjDigitos) + '&status=Em%20Liquida%C3%A7%C3%A3o';
        }

        const bloqueado = fornecedorBloqueadoPL();
        if (bloqueado) {
            if (buscaWrap) buscaWrap.classList.remove('visivel');
            if (chipWrap) chipWrap.classList.add('visivel');
            if (chipAcoes) {
                chipAcoes.innerHTML = carrinhoIds.size > 0
                    ? '<span class="pl-hint" style="margin:0;padding:6px 8px;">Para trocar o CNPJ, remova todos os TCs do lote.</span>'
                    : '';
            }
            if (hintAbas && carrinhoIds.size > 0) {
                hintAbas.textContent = 'Com TCs no lote, o fornecedor fica fixo. Para trocar o CNPJ, remova todos os TCs do lote.';
            }
        } else {
            if (buscaWrap) buscaWrap.classList.remove('visivel');
            if (chipWrap) chipWrap.classList.add('visivel');
            if (chipAcoes) {
                chipAcoes.innerHTML = '<button type="button" class="pl-btn-link" id="plBtnAlterarFornecedor">Alterar fornecedor</button>';
                document.getElementById('plBtnAlterarFornecedor')?.addEventListener('click', () => {
                    fornecedorFiltroCnpj = '';
                    fornecedorFiltroNome = '';
                    if (inpBusca) inpBusca.value = '';
                    atualizarUiFornecedorPL();
                    desenharDisponiveis();
                });
            }
            if (hintAbas) {
                hintAbas.textContent = 'Status Em Liquidação e sem NP. Use a aba Disponíveis para incluir TCs no lote.';
            }
        }
    }

    function atualizarExibicaoFornecedorPL(cnpj, nome) {
        fornecedorFiltroCnpj = cnpj || '';
        fornecedorFiltroNome = nome || '';
        atualizarUiFornecedorPL();
    }

    function alternarAbaPL(aba) {
        plAbaAtiva = aba;
        const tabDisp = document.getElementById('plTabDisp');
        const tabLote = document.getElementById('plTabLote');
        const painelDisp = document.getElementById('plPainelDisp');
        const painelLote = document.getElementById('plPainelLote');
        const ativaDisp = aba === 'disp';
        tabDisp?.classList.toggle('ativa', ativaDisp);
        tabLote?.classList.toggle('ativa', !ativaDisp);
        tabDisp?.setAttribute('aria-selected', ativaDisp ? 'true' : 'false');
        tabLote?.setAttribute('aria-selected', !ativaDisp ? 'true' : 'false');
        painelDisp?.classList.toggle('ativa', ativaDisp);
        painelLote?.classList.toggle('ativa', !ativaDisp);
    }

    function atualizarCabecalhoEditorPL() {
        const ts = titulosDoCarrinho();
        const totalLote = ts.reduce((s, t) => s + (Number(t.valorNotaFiscal) || 0), 0);
        const atesteMin = dataAtesteMaisAntiga(ts);
        const kpiTcs = document.getElementById('plKpiTcs');
        const kpiValor = document.getElementById('plKpiValor');
        const kpiAteste = document.getElementById('plKpiAteste');
        const kpiVenc = document.getElementById('plKpiVenc');
        if (kpiTcs) kpiTcs.textContent = String(ts.length);
        if (kpiValor) kpiValor.textContent = moeda(totalLote);
        if (kpiAteste) kpiAteste.textContent = atesteMin ? fmtDataLocalPL(atesteMin) : '—';
        if (kpiVenc) {
            if (atesteMin) {
                const venc30 = new Date(atesteMin.getFullYear(), atesteMin.getMonth(), atesteMin.getDate() + 30);
                kpiVenc.textContent = fmtDataLocalPL(venc30);
            } else kpiVenc.textContent = '—';
        }
        const badge = document.getElementById('plBadgeEstado');
        if (badge) {
            const est = plDocAtual ? (plDocAtual.estado || 'Rascunho') : 'Novo';
            let html = '';
            if (est === 'Fechado') html = '<span class="badge-pl-fechado">Fechado</span>';
            else if (est === 'Cancelado') html = '<span class="badge-pl-cancel">Cancelado</span>';
            else if (est === 'Novo') html = '<span class="badge-pl-rascunho">Novo</span>';
            else html = '<span class="badge-pl-rascunho">Rascunho</span>';
            if (plDocAtual && plDocAtual.ativo === false) html += ' <span class="badge-pl-inativo">Inativo</span>';
            badge.innerHTML = html;
        }
        const cntDisp = document.getElementById('plCntDisp');
        const cntLote = document.getElementById('plCntLote');
        if (cntLote) cntLote.textContent = String(ts.length);
        if (cntDisp) {
            const cnpjAlvo = normalizarDigitos(fornecedorFiltroCnpj);
            let nDisp = 0;
            if (cnpjAlvo) {
                nDisp = baseTitulos.filter(t => {
                    if (!tituloElegivelPL(t)) return false;
                    if (normalizarDigitos(t.fornecedorCnpj || '') !== cnpjAlvo) return false;
                    const outra = outraPLAberta(t);
                    return !outra || carrinhoIds.has(t.id);
                }).length;
            }
            cntDisp.textContent = String(nDisp);
        }
    }

    function atualizarResumoEditorPL() {
        const ts = titulosDoCarrinho();
        const resumoValor = document.getElementById('plResumoValor');
        const resumoMeta = document.getElementById('plResumoMeta');
        const resumoItens = document.getElementById('plResumoItens');
        const resumoVazio = document.getElementById('plResumoVazio');
        const totalLote = ts.reduce((s, t) => s + (Number(t.valorNotaFiscal) || 0), 0);
        const atesteMin = dataAtesteMaisAntiga(ts);
        if (resumoValor) resumoValor.textContent = moeda(totalLote);
        if (!ts.length) {
            if (resumoMeta) resumoMeta.textContent = 'Nenhum TC selecionado';
            if (resumoItens) resumoItens.innerHTML = '';
            if (resumoVazio) resumoVazio.style.display = 'block';
            return;
        }
        if (resumoVazio) resumoVazio.style.display = 'none';
        if (resumoMeta) {
            let meta = `${ts.length} TC${ts.length > 1 ? 's' : ''} no lote`;
            if (atesteMin) meta += ` · Ateste: ${fmtDataLocalPL(atesteMin)}`;
            resumoMeta.textContent = meta;
        }
        if (resumoItens) {
            resumoItens.innerHTML = ts.map(t =>
                '<div class="pl-resumo-item"><span>' + escapeHTML(t.idProc || t.id) + '</span><span>' + escapeHTML(moeda(t.valorNotaFiscal)) + '</span></div>'
            ).join('');
        }
    }

    function desenharLotePL() {
        const tbody = document.getElementById('tbodyPLLote');
        const vazio = document.getElementById('plLoteVazio');
        if (!tbody) return;
        tbody.innerHTML = '';
        const ts = titulosDoCarrinho();
        if (!ts.length) {
            if (vazio) vazio.style.display = 'block';
            return;
        }
        if (vazio) vazio.style.display = 'none';
        const podeRemover = plDocAtual && !plSomenteLeitura && (plDocAtual.estado || '') === 'Rascunho' && tem('preliquidacao_editar');
        const podeRemoverNova = !plIdAtual && !plSomenteLeitura && tem('preliquidacao_inserir');
        ts.forEach(t => {
            const tr = document.createElement('tr');
            tr.className = 'pl-row-lote';
            tr.innerHTML = `
                <td>${escapeHTML(t.idProc || '')}</td>
                <td>${escapeHTML((t.tipoTC || '') + '-' + (t.numTC || ''))}</td>
                <td style="white-space:nowrap;">${escapeHTML(formatarDataSimplesPL(t.dataAteste))}</td>
                <td style="text-align:right;">${escapeHTML(moeda(t.valorNotaFiscal))}</td>
                <td>${(podeRemover || podeRemoverNova)
                    ? `<button type="button" class="btn-default btn-small btn-pl-rem" data-id="${escapeHTML(t.id)}" title="Remover do lote">✕</button>`
                    : ''}</td>
            `;
            tbody.appendChild(tr);
        });
        tbody.querySelectorAll('.btn-pl-rem').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.getAttribute('data-id');
                if (plIdAtual && (plDocAtual.estado || '') === 'Rascunho') removerTcDoCarrinho(id);
                else {
                    carrinhoIds.delete(id);
                    desenharLotePL();
                    desenharDisponiveis();
                    atualizarCabecalhoEditorPL();
                    atualizarResumoEditorPL();
                    atualizarUiFornecedorPL();
                    atualizarBotoesEditor();
                }
            });
        });
    }

    function desenharCarrinho() {
        desenharLotePL();
        atualizarResumoEditorPL();
        atualizarCabecalhoEditorPL();
    }

    async function removerTcDoCarrinho(tituloId) {
        if (!plIdAtual || !plDocAtual || (plDocAtual.estado || '') !== 'Rascunho') return;
        const motivo = await pedirMotivo('Motivo da remoção do TC');
        if (!motivo) return;
        mostrarLoading();
        try {
            const plRef = db.collection('preLiquidacoes').doc(plIdAtual);
            const tRef = db.collection('titulos').doc(tituloId);
            const tSnap = await tRef.get();
            const td = tSnap.data() || {};
            const npPl = String(plDocAtual.np || '').trim();
            const updatesTitulo = {
                preLiquidacaoId: firebase.firestore.FieldValue.delete(),
                preLiquidacaoCodigo: firebase.firestore.FieldValue.delete(),
                editado_em: firebase.firestore.FieldValue.serverTimestamp()
            };
            if (npPl && String(td.np || '').trim() && String(td.preLiquidacaoId || '') === plIdAtual) {
                updatesTitulo.np = '';
                updatesTitulo.dataLiquidacao = '';
                updatesTitulo.status = STATUS_TC_EM_LIQUIDACAO;
                await desvincularTituloDaNP(tituloId, npPl);
            }
            await tRef.update(updatesTitulo);
            await pushHistoricoTitulo(tituloId, entradaHistoricoTC(
                updatesTitulo.status || td.status || STATUS_TC_EM_LIQUIDACAO,
                'Removido da pré-liquidação',
                motivo + ' | PL: ' + (plDocAtual.codigo || plIdAtual)
            ));
            carrinhoIds.delete(tituloId);
            const novosIds = Array.from(carrinhoIds);
            const ev = plHistoricoEntry('remover_tc', 'TC removido: ' + tituloId, motivo);
            const hist = (plDocAtual.historico || []).concat([ev]);
            await plRef.update({
                tituloIds: novosIds,
                historico: hist,
                editado_em: firebase.firestore.FieldValue.serverTimestamp()
            });
            plDocAtual.tituloIds = novosIds;
            plDocAtual.historico = hist;
            desenharCarrinho();
            desenharDisponiveis();
            desenharHistoricoPL();
            atualizarUiFornecedorPL();
        } catch (e) {
            alert('Erro: ' + (e.message || e));
        } finally {
            esconderLoading();
        }
    }

    function desenharDisponiveis() {
        const tbody = document.getElementById('tbodyPLDisponiveis');
        if (!tbody) return;
        const q = (document.getElementById('plBuscaTC')?.value || '').toLowerCase().trim();
        tbody.innerHTML = '';
        const cnpjAlvo = normalizarDigitos(fornecedorFiltroCnpj);
        if (!cnpjAlvo) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#888;">Selecione um fornecedor.</td></tr>';
            return;
        }
        const lista = baseTitulos.filter(t => {
            if (!tituloElegivelPL(t)) return false;
            const c = normalizarDigitos(t.fornecedorCnpj || '');
            if (c !== cnpjAlvo) return false;
            const outra = outraPLAberta(t);
            if (outra && !carrinhoIds.has(t.id)) return false;
            if (q && !(String(t.idProc || '').toLowerCase().includes(q))) {
                const nes = (t.empenhosVinculados || []).some(v => String(v.numEmpenho || '').toLowerCase().includes(q));
                if (!nes) return false;
            }
            return true;
        });
        if (!lista.length) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">Nenhum TC elegível.</td></tr>';
            return;
        }
        lista.forEach(t => {
            const outra = outraPLAberta(t);
            const tr = document.createElement('tr');
            const podeAdd = !plSomenteLeitura && ((plDocAtual && (plDocAtual.estado || '') === 'Rascunho' && tem('preliquidacao_editar'))
                || (!plIdAtual && tem('preliquidacao_inserir')));
            const disabled = !!outra || !podeAdd || (plDocAtual && (plDocAtual.estado || '') !== 'Rascunho');
            tr.innerHTML = `
                <td><input type="checkbox" class="pl-chk-tc" data-id="${escapeHTML(t.id)}" ${carrinhoIds.has(t.id) ? 'checked' : ''} ${disabled ? 'disabled' : ''}></td>
                <td>${escapeHTML(t.idProc || '')}</td>
                <td>${escapeHTML((t.tipoTC || '') + '-' + (t.numTC || ''))}</td>
                <td style="white-space:nowrap;">${escapeHTML(formatarDataSimplesPL(t.dataAteste))}</td>
                <td>${escapeHTML(moeda(t.valorNotaFiscal))}</td>
                <td>${outra ? escapeHTML(outra) : '-'}</td>
            `;
            tbody.appendChild(tr);
        });
        tbody.querySelectorAll('.pl-chk-tc').forEach(chk => {
            if (chk.disabled) return;
            chk.addEventListener('change', () => {
                const id = chk.getAttribute('data-id');
                if (chk.checked) carrinhoIds.add(id);
                else carrinhoIds.delete(id);
                desenharCarrinho();
                desenharDisponiveis();
                atualizarUiFornecedorPL();
                atualizarBotoesEditor();
            });
        });
        atualizarCabecalhoEditorPL();
    }

    function desenharHistoricoPL() {
        const tbody = document.getElementById('tbodyPLHistorico');
        if (!tbody) return;
        tbody.innerHTML = '';
        const h = (plDocAtual && plDocAtual.historico) ? plDocAtual.historico.slice().reverse() : [];
        if (!h.length) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">Sem registros.</td></tr>';
            return;
        }
        h.forEach(ev => {
            const tr = document.createElement('tr');
            const dt = ev.data && ev.data.toDate ? ev.data.toDate().toLocaleString('pt-BR') : '-';
            tr.innerHTML = `<td>${escapeHTML(dt)}</td><td>${escapeHTML(ev.tipo || '')}</td><td>${escapeHTML(ev.usuario || '')}</td><td>${escapeHTML((ev.detalhe || '') + (ev.motivo ? ' — ' + ev.motivo : ''))}</td>`;
            tbody.appendChild(tr);
        });
    }

    function atualizarBotoesEditor() {
        const est = plDocAtual ? (plDocAtual.estado || 'Rascunho') : 'Novo';
        const fechado = est === 'Fechado';
        const cancel = est === 'Cancelado';
        const rasc = est === 'Rascunho' || est === 'Novo';
        const setVis = (id, vis) => {
            const el = document.getElementById(id);
            if (el) el.style.display = vis ? '' : 'none';
        };
        const hint = document.getElementById('plHintAcoes');
        const btnNpResumo = document.getElementById('btnPLFecharNPResumo');
        if (plSomenteLeitura && plIdAtual) {
            setVis('btnPLSalvar', false);
            setVis('btnPLFecharNP', false);
            setVis('btnPLCorrigirNP', false);
            setVis('btnPLCancelar', false);
            setVis('btnPLInativar', false);
            setVis('btnPLExcluir', false);
            const pdfVis = carrinhoIds.size > 0 && (tem('preliquidacao_gerar_pdf') || ehAdmin());
            setVis('btnPLPdf', pdfVis);
            setVis('btnPLPdfTopo', pdfVis);
            if (hint) hint.textContent = 'Modo somente leitura.';
            if (btnNpResumo) btnNpResumo.disabled = true;
            return;
        }
        const salvarVis = (rasc && (tem('preliquidacao_editar') || tem('preliquidacao_inserir'))) || (!plIdAtual && tem('preliquidacao_inserir'));
        const pdfVis = carrinhoIds.size > 0 && (tem('preliquidacao_gerar_pdf') || ehAdmin());
        const npVis = rasc && plIdAtual && carrinhoIds.size > 0 && tem('preliquidacao_fechar_np');
        setVis('btnPLSalvar', salvarVis);
        setVis('btnPLPdf', pdfVis);
        setVis('btnPLPdfTopo', pdfVis);
        setVis('btnPLFecharNP', npVis);
        setVis('btnPLCorrigirNP', fechado && tem('preliquidacao_fechar_np'));
        setVis('btnPLCancelar', !cancel && plIdAtual && tem('preliquidacao_cancelar'));
        setVis('btnPLInativar', plIdAtual && (tem('preliquidacao_status') || ehAdmin()));
        setVis('btnPLExcluir', plIdAtual && cancel && (tem('preliquidacao_excluir') || ehAdmin()));
        if (fechado) setVis('btnPLFecharNP', false);
        if (btnNpResumo) {
            btnNpResumo.disabled = !npVis;
            btnNpResumo.style.display = fechado && plDocAtual?.np ? '' : (npVis ? '' : 'none');
            if (fechado && plDocAtual?.np) btnNpResumo.textContent = 'NP: ' + (plDocAtual.np || '');
        }
        if (hint) {
            if (!plIdAtual) hint.textContent = 'Salve o lote com ao menos um TC.';
            else if (!carrinhoIds.size) hint.textContent = 'Inclua TCs no lote para gerar DAuLiq ou informar NP.';
            else if (rasc && !plDocAtual?.np) hint.textContent = 'Rascunho — informe NP após registro no SIAFI.';
            else hint.textContent = '';
        }
    }

    function aplicarEstadoCamposEditorLeitura() {
        const buscaForn = document.getElementById('plBuscaFornecedor');
        const buscaTc = document.getElementById('plBuscaTC');
        if (buscaForn) {
            buscaForn.disabled = !!plSomenteLeitura;
            buscaForn.style.opacity = plSomenteLeitura ? '0.75' : '';
        }
        if (buscaTc) {
            buscaTc.disabled = !!plSomenteLeitura;
            buscaTc.style.opacity = plSomenteLeitura ? '0.75' : '';
        }
    }

    async function abrirEditorPL(id, opts) {
        plSomenteLeitura = !!(opts && opts.somenteLeitura);
        plIdAtual = id;
        const snap = await db.collection('preLiquidacoes').doc(id).get();
        if (!snap.exists) {
            plSomenteLeitura = false;
            alert('Pré-liquidação não encontrada.');
            return;
        }
        plDocAtual = { id: snap.id, ...snap.data() };
        carrinhoIds = new Set(plDocAtual.tituloIds || []);
        fornecedorFiltroCnpj = plDocAtual.fornecedorCnpj || '';
        fornecedorFiltroNome = plDocAtual.fornecedorNome || '';
        if (plSomenteLeitura) document.getElementById('plBuscaFornecedor').value = '';
        atualizarExibicaoFornecedorPL(fornecedorFiltroCnpj, fornecedorFiltroNome);
        const sufLeitura = plSomenteLeitura ? ' — visualização' : '';
        document.getElementById('tituloEditorPL').textContent = (plDocAtual.codigo || 'Pré-Liquidação') + sufLeitura;
        let resumo = `NP: ${plDocAtual.np || '—'} · Atualizado: ${formatarDataHoraLista(plDocAtual.editado_em)}`;
        if (plDocAtual.ativo === false) resumo += ' · Inativo';
        if (plSomenteLeitura) resumo += ' · Somente leitura';
        document.getElementById('resumoEditorPL').textContent = resumo;
        document.getElementById('tela-lista-pl').style.display = 'none';
        document.getElementById('tela-editor-pl').style.display = 'block';
        alternarAbaPL(carrinhoIds.size ? 'lote' : 'disp');
        aplicarEstadoCamposEditorLeitura();
        desenharCarrinho();
        desenharDisponiveis();
        desenharHistoricoPL();
        atualizarUiFornecedorPL();
        atualizarBotoesEditor();
        if (typeof aplicarPermissoesUI === 'function') aplicarPermissoesUI();
    }

    function novaPL() {
        plSomenteLeitura = false;
        aplicarEstadoCamposEditorLeitura();
        plIdAtual = null;
        plDocAtual = null;
        carrinhoIds = new Set();
        fornecedorFiltroCnpj = '';
        fornecedorFiltroNome = '';
        document.getElementById('plBuscaFornecedor').value = '';
        atualizarExibicaoFornecedorPL('', '');
        document.getElementById('tituloEditorPL').textContent = 'Nova pré-liquidação';
        document.getElementById('resumoEditorPL').textContent = 'Salve para gerar o código PL-#####/AAAA.';
        document.getElementById('tela-lista-pl').style.display = 'none';
        document.getElementById('tela-editor-pl').style.display = 'block';
        alternarAbaPL('disp');
        desenharCarrinho();
        desenharDisponiveis();
        atualizarUiFornecedorPL();
        document.getElementById('tbodyPLHistorico').innerHTML = '<tr><td colspan="4" style="text-align:center;">Salve para criar o histórico.</td></tr>';
        atualizarBotoesEditor();
        if (typeof aplicarPermissoesUI === 'function') aplicarPermissoesUI();
    }

    async function salvarPL() {
        if (!fornecedorFiltroCnpj) {
            alert('Selecione um fornecedor.');
            return;
        }
        if (carrinhoIds.size < 1) {
            alert('Adicione ao menos um TC ao lote.');
            return;
        }
        const ts = titulosDoCarrinho();
        const cnpj0 = normalizarDigitos(ts[0].fornecedorCnpj || '');
        if (ts.some(t => normalizarDigitos(t.fornecedorCnpj || '') !== cnpj0)) {
            alert('Todos os TCs devem ser do mesmo fornecedor.');
            return;
        }
        mostrarLoading();
        try {
            const ano = new Date().getFullYear();
            const counterRef = db.collection('contadores').doc('preLiquidacao_' + ano);
            if (!plIdAtual) {
                const plRef = db.collection('preLiquidacoes').doc();
                const novoId = plRef.id;
                const idsCarrinho = Array.from(carrinhoIds);
                let codigo = '';
                await db.runTransaction(async (tx) => {
                    const cSnap = await tx.get(counterRef);
                    const seq = (cSnap.exists ? (cSnap.data().seq || 0) : 0) + 1;
                    codigo = 'PL-' + String(seq).padStart(5, '0') + '/' + ano;
                    tx.set(counterRef, {
                        seq,
                        editado_em: firebase.firestore.FieldValue.serverTimestamp()
                    }, { merge: true });
                    const plPayload = {
                        codigo,
                        estado: 'Rascunho',
                        ativo: true,
                        fornecedorCnpj: cnpj0,
                        fornecedorNome: fornecedorFiltroNome || ts[0].fornecedorNome || '',
                        tituloIds: idsCarrinho,
                        np: '',
                        dataLiquidacao: '',
                        historico: [plHistoricoEntry('criacao', 'Pré-liquidação criada com código ' + codigo, '')],
                        criado_em: firebase.firestore.FieldValue.serverTimestamp(),
                        criado_por: typeof usuarioLogadoEmail === 'string' ? usuarioLogadoEmail : '',
                        editado_em: firebase.firestore.FieldValue.serverTimestamp()
                    };
                    if (window.sisAnoDocumento && typeof window.sisAnoDocumento.aplicarAnosPreLiquidacao === 'function') {
                        window.sisAnoDocumento.aplicarAnosPreLiquidacao(plPayload, ano);
                    } else {
                        plPayload.anoExercicio = ano;
                        plPayload.anoEmissao = ano;
                    }
                    tx.set(plRef, plPayload);
                    idsCarrinho.forEach(tid => {
                        tx.update(db.collection('titulos').doc(tid), {
                            preLiquidacaoId: novoId,
                            preLiquidacaoCodigo: codigo,
                            editado_em: firebase.firestore.FieldValue.serverTimestamp()
                        });
                    });
                });
                await abrirEditorPL(novoId);
                alert('Pré-liquidação criada: ' + codigo);
            } else {
                const plRef = db.collection('preLiquidacoes').doc(plIdAtual);
                const snap = await plRef.get();
                const d = snap.data() || {};
                if ((d.estado || '') !== 'Rascunho') {
                    alert('Só é possível alterar o lote em Rascunho.');
                    return;
                }
                const antigos = new Set(d.tituloIds || []);
                const novos = new Set(carrinhoIds);
                const batch = db.batch();
                antigos.forEach(tid => {
                    if (!novos.has(tid)) {
                        batch.update(db.collection('titulos').doc(tid), {
                            preLiquidacaoId: firebase.firestore.FieldValue.delete(),
                            preLiquidacaoCodigo: firebase.firestore.FieldValue.delete(),
                            editado_em: firebase.firestore.FieldValue.serverTimestamp()
                        });
                    }
                });
                novos.forEach(tid => {
                    batch.update(db.collection('titulos').doc(tid), {
                        preLiquidacaoId: plIdAtual,
                        preLiquidacaoCodigo: d.codigo || '',
                        editado_em: firebase.firestore.FieldValue.serverTimestamp()
                    });
                });
                const ev = plHistoricoEntry('salvar', 'Lote atualizado (' + novos.size + ' TCs)', '');
                const hist = (d.historico || []).concat([ev]);
                batch.update(plRef, {
                    tituloIds: Array.from(carrinhoIds),
                    fornecedorCnpj: cnpj0,
                    fornecedorNome: fornecedorFiltroNome || d.fornecedorNome,
                    historico: hist,
                    editado_em: firebase.firestore.FieldValue.serverTimestamp()
                });
                await batch.commit();
                await abrirEditorPL(plIdAtual);
                alert('Pré-liquidação guardada.');
            }
        } catch (e) {
            alert('Erro ao guardar: ' + (e.message || e));
        } finally {
            esconderLoading();
        }
    }

    async function executarFecharNP(np, dataLiq, correcao, motivoCorrecao) {
        if (!plIdAtual || !plDocAtual) return;
        const ids = Array.from(carrinhoIds.size ? carrinhoIds : new Set(plDocAtual.tituloIds || []));
        if (!ids.length) {
            alert('Sem TCs no lote.');
            return;
        }
        if (correcao && await algumTituloComOP(ids)) {
            alert('Não é possível corrigir NP: existe TC com OP informada.');
            return;
        }
        mostrarLoading();
        try {
            const plRef = db.collection('preLiquidacoes').doc(plIdAtual);
            const tituloRefs = ids.map(tid => db.collection('titulos').doc(tid));
            const novaNpRefs = candidatosNpDocId(np).filter(Boolean).map(id => db.collection('np').doc(id));
            if (!novaNpRefs.length) throw new Error('NP inválida.');

            await db.runTransaction(async (tx) => {
                const snap = await tx.get(plRef);
                if (!snap.exists) throw new Error('Pré-liquidação não encontrada.');
                const d = snap.data() || {};
                const npAntiga = String(d.np || '').trim();
                const antigaNpRefs = (correcao && npAntiga)
                    ? candidatosNpDocId(npAntiga).filter(Boolean).map(id => db.collection('np').doc(id))
                    : [];

                const tituloSnaps = [];
                for (const ref of tituloRefs) {
                    tituloSnaps.push(await tx.get(ref));
                }
                const antigaNpSnaps = [];
                for (const ref of antigaNpRefs) {
                    antigaNpSnaps.push(await tx.get(ref));
                }
                const novaNpSnaps = [];
                for (const ref of novaNpRefs) {
                    novaNpSnaps.push(await tx.get(ref));
                }

                let antigaNpAlvo = null;
                for (let i = 0; i < antigaNpRefs.length; i++) {
                    if (antigaNpSnaps[i].exists) {
                        antigaNpAlvo = antigaNpRefs[i];
                        break;
                    }
                }

                let novaNpAlvo = novaNpRefs[0];
                let novaNpExiste = false;
                for (let i = 0; i < novaNpRefs.length; i++) {
                    if (novaNpSnaps[i].exists) {
                        novaNpAlvo = novaNpRefs[i];
                        novaNpExiste = true;
                        break;
                    }
                }

                const evTipo = correcao ? 'corrigir_np' : 'fechar_np';
                const ev = plHistoricoEntry(evTipo, 'NP: ' + np + ' | Data: ' + dataLiq, correcao ? (motivoCorrecao || '') : '');
                const hist = (d.historico || []).concat([ev]);
                tx.update(plRef, {
                    estado: 'Fechado',
                    np,
                    dataLiquidacao: dataLiq,
                    historico: hist,
                    editado_em: firebase.firestore.FieldValue.serverTimestamp()
                });

                for (let i = 0; i < tituloRefs.length; i++) {
                    const tSnap = tituloSnaps[i];
                    if (!tSnap.exists) throw new Error('TC não encontrado: ' + ids[i]);
                    const td = tSnap.data() || {};
                    const h = entradaHistoricoTC('Liquidado', correcao ? 'Correção NP (PL)' : 'NP via pré-liquidação', (correcao ? (motivoCorrecao || '') + ' | ' : '') + 'NP ' + np);
                    const hists = Array.isArray(td.historicoStatus) ? td.historicoStatus.slice() : [];
                    const histo = Array.isArray(td.historico) ? td.historico.slice() : [];
                    hists.push(h);
                    histo.push(h);
                    tx.update(tituloRefs[i], {
                        np,
                        dataLiquidacao: dataLiq,
                        status: 'Liquidado',
                        historicoStatus: hists,
                        historico: histo,
                        editado_em: firebase.firestore.FieldValue.serverTimestamp()
                    });
                }

                const idsStr = ids.map(tid => String(tid || '').trim()).filter(Boolean);
                if (antigaNpAlvo && antigaNpAlvo.id !== novaNpAlvo.id) {
                    tx.set(antigaNpAlvo, {
                        titulosVinculados: firebase.firestore.FieldValue.arrayRemove.apply(null, idsStr),
                        editado_em: firebase.firestore.FieldValue.serverTimestamp()
                    }, { merge: true });
                }
                const payloadNp = {
                    np: novaNpAlvo.id,
                    titulosVinculados: firebase.firestore.FieldValue.arrayUnion.apply(null, idsStr),
                    editado_em: firebase.firestore.FieldValue.serverTimestamp()
                };
                if (dataLiq) payloadNp.dataLiquidacao = dataLiq;
                if (typeof usuarioLogadoEmail === 'string' && usuarioLogadoEmail) payloadNp.editado_por = usuarioLogadoEmail;
                if (!novaNpExiste) {
                    payloadNp.documentosHabeis = [];
                    payloadNp.ativo = true;
                }
                if (window.sisAnoDocumento && typeof window.sisAnoDocumento.payloadAnosNp === 'function') {
                    Object.assign(payloadNp, window.sisAnoDocumento.payloadAnosNp(novaNpAlvo.id));
                }
                tx.set(novaNpAlvo, payloadNp, { merge: true });
            });
            document.getElementById('overlayPLFecharNP').style.display = 'none';
            await abrirEditorPL(plIdAtual);
            alert(correcao ? 'NP corrigida.' : 'Lote fechado com NP.');
        } catch (e) {
            alert('Erro: ' + (e.message || e));
        } finally {
            esconderLoading();
        }
    }

    async function cancelarPLCompleto() {
        if (!plIdAtual || !plDocAtual) return;
        if (!confirm('Cancelar esta pré-liquidação? Os TCs voltam para "Em Liquidação", NP e vínculos serão removidos dos títulos deste lote quando aplicável.')) return;
        const motivo = await pedirMotivo('Motivo do cancelamento');
        if (!motivo) return;
        mostrarLoading();
        try {
            const ids = (plDocAtual.tituloIds || []).slice();
            const npVal = String(plDocAtual.np || '').trim();
            const plRef = db.collection('preLiquidacoes').doc(plIdAtual);
            for (const tid of ids) {
                const tRef = db.collection('titulos').doc(tid);
                const tSnap = await tRef.get();
                if (!tSnap.exists) continue;
                const td = tSnap.data() || {};
                if (String(td.preLiquidacaoId || '') !== plIdAtual) continue;
                await tRef.update({
                    preLiquidacaoId: firebase.firestore.FieldValue.delete(),
                    preLiquidacaoCodigo: firebase.firestore.FieldValue.delete(),
                    np: '',
                    dataLiquidacao: '',
                    status: STATUS_TC_EM_LIQUIDACAO,
                    editado_em: firebase.firestore.FieldValue.serverTimestamp()
                });
                if (npVal) await desvincularTituloDaNP(tid, npVal);
                await pushHistoricoTitulo(tid, entradaHistoricoTC(
                    STATUS_TC_EM_LIQUIDACAO,
                    'Cancelamento da pré-liquidação',
                    motivo + ' | PL: ' + (plDocAtual.codigo || plIdAtual)
                ));
            }
            const ev = plHistoricoEntry('cancelar', 'Pré-liquidação cancelada', motivo);
            await plRef.update({
                estado: 'Cancelado',
                titulosParticiparamIds: ids,
                tituloIds: [],
                historico: (plDocAtual.historico || []).concat([ev]),
                editado_em: firebase.firestore.FieldValue.serverTimestamp()
            });
            carrinhoIds = new Set();
            await abrirEditorPL(plIdAtual);
            alert('Pré-liquidação cancelada.');
        } catch (e) {
            alert('Erro: ' + (e.message || e));
        } finally {
            esconderLoading();
        }
    }

    async function toggleInativarPL() {
        if (!plIdAtual || !(tem('preliquidacao_status') || ehAdmin())) return;
        const ativoAtual = plDocAtual.ativo !== false;
        mostrarLoading();
        try {
            await db.collection('preLiquidacoes').doc(plIdAtual).update({
                ativo: !ativoAtual,
                historico: (plDocAtual.historico || []).concat([plHistoricoEntry('inativar', ativoAtual ? 'Inativada' : 'Reativada', '')]),
                editado_em: firebase.firestore.FieldValue.serverTimestamp()
            });
            await abrirEditorPL(plIdAtual);
        } catch (e) {
            alert('Erro: ' + (e.message || e));
        } finally {
            esconderLoading();
        }
    }

    async function excluirPLPermanente() {
        if (!plIdAtual || !(tem('preliquidacao_excluir') || ehAdmin())) return;
        if ((plDocAtual.estado || '') !== 'Cancelado') {
            alert('Só é permitido excluir permanentemente uma pré-liquidação já cancelada.');
            return;
        }
        if (!confirm('Excluir permanentemente este registro?')) return;
        mostrarLoading();
        try {
            await db.collection('preLiquidacoes').doc(plIdAtual).delete();
            plIdAtual = null;
            plDocAtual = null;
            document.getElementById('tela-editor-pl').style.display = 'none';
            document.getElementById('tela-lista-pl').style.display = 'block';
            alert('Registo eliminado.');
        } catch (e) {
            alert('Erro: ' + (e.message || e));
        } finally {
            esconderLoading();
        }
    }

    function setupFornecedorAutocomplete() {
        const inp = document.getElementById('plBuscaFornecedor');
        const ul = document.getElementById('plListaFornecedores');
        if (!inp || !ul) return;
        inp.addEventListener('input', () => {
            const q = inp.value.trim().toLowerCase();
            ul.innerHTML = '';
            if (q.length < 2) return;
            const lista = fornecedoresUnicosDosTitulos().filter(f => {
                const c = normalizarDigitos(f.codigo || '');
                const nome = String(f.razaoSocial || '').toLowerCase();
                return c.includes(normalizarDigitos(q)) || nome.includes(q);
            }).slice(0, 15);
            lista.forEach(f => {
                const li = document.createElement('li');
                li.textContent = (f.razaoSocial || f.nome || '') + ' — ' + (f.codigo || '');
                li.addEventListener('click', () => {
                    fornecedorFiltroCnpj = normalizarDigitos(f.codigo || '');
                    fornecedorFiltroNome = f.razaoSocial || f.nome || '';
                    inp.value = fornecedorFiltroNome;
                    ul.innerHTML = '';
                    atualizarExibicaoFornecedorPL(fornecedorFiltroCnpj, fornecedorFiltroNome);
                    desenharDisponiveis();
                });
                ul.appendChild(li);
            });
        });
    }

    window.inicializarPreLiquidacaoSPA = function inicializarPreLiquidacaoSPA() {
        document.getElementById('modalPLMotivoConfirmar')?.addEventListener('click', () => {
            const t = document.getElementById('modalPLMotivoTexto').value.trim();
            if (!t) { alert('Informe o motivo.'); return; }
            fecharModalMotivo(true);
        });
        document.getElementById('modalPLMotivoCancelar')?.addEventListener('click', () => fecharModalMotivo(false));

        document.getElementById('btnNovaPL')?.addEventListener('click', () => {
            if (!tem('preliquidacao_inserir') && !ehAdmin()) return;
            novaPL();
        });
        document.getElementById('btnVoltarListaPL')?.addEventListener('click', () => {
            document.getElementById('tela-editor-pl').style.display = 'none';
            document.getElementById('tela-lista-pl').style.display = 'block';
            plSomenteLeitura = false;
            aplicarEstadoCamposEditorLeitura();
            plIdAtual = null;
            plDocAtual = null;
        });
        document.getElementById('btnPLSalvar')?.addEventListener('click', () => salvarPL());
        document.getElementById('plTabDisp')?.addEventListener('click', () => alternarAbaPL('disp'));
        document.getElementById('plTabLote')?.addEventListener('click', () => alternarAbaPL('lote'));
        const acionarPdfPL = async () => {
            document.getElementById('btnPLPdf')?.click();
        };
        document.getElementById('btnPLPdfTopo')?.addEventListener('click', acionarPdfPL);
        document.getElementById('btnPLFecharNPResumo')?.addEventListener('click', () => {
            document.getElementById('btnPLFecharNP')?.click();
        });
        document.getElementById('btnPLPdf')?.addEventListener('click', async () => {
            const ts = titulosDoCarrinho();
            if (!ts.length) { alert('Lote vazio.'); return; }
            if (!plDocAtual) { alert('Salve a pré-liquidação antes de gerar o PDF (para histórico).'); return; }
            const eraSomenteLeitura = plSomenteLeitura;
            const variante = await pedirVariantePdfDauliq();
            if (variante == null) return;
            const incluirHistorico = variante === 'completo';
            mostrarLoading();
            try {
                const meta = {
                    geradoEm: new Date().toISOString(),
                    usuario: typeof usuarioLogadoEmail === 'string' ? usuarioLogadoEmail : '',
                    nomeArquivoSugerido: 'DAuLiq_' + String(plDocAtual.codigo || '').replace(/\//g, '-') + (incluirHistorico ? '' : '_sem-historico') + '.pdf',
                    variantePdf: incluirHistorico ? 'completo' : 'sem_historico'
                };
                const plRef = db.collection('preLiquidacoes').doc(plIdAtual);
                const evDet = incluirHistorico ? 'DAuLiq gerado (completo)' : 'DAuLiq gerado (sem histórico no PDF)';
                const ev = plHistoricoEntry('pdf', evDet, '');
                const snap = await plRef.get();
                const d = snap.data() || {};
                await plRef.update({
                    auditoriaPdf: meta,
                    historico: (d.historico || []).concat([ev]),
                    editado_em: firebase.firestore.FieldValue.serverTimestamp()
                });
                const plMerged = { id: plIdAtual, ...d, auditoriaPdf: meta, historico: (d.historico || []).concat([ev]) };
                await gerarPDFDauliq(plMerged, ts, { incluirHistorico });
                await abrirEditorPL(plIdAtual, { somenteLeitura: eraSomenteLeitura });
            } catch (e) {
                alert('Erro ao gerar PDF: ' + (e.message || e));
            } finally {
                esconderLoading();
            }
        });
        document.getElementById('btnModalDauliqSemHist')?.addEventListener('click', () => fecharModalDauliqVariante('sem_historico'));
        document.getElementById('btnModalDauliqCompleto')?.addEventListener('click', () => fecharModalDauliqVariante('completo'));
        document.getElementById('btnModalDauliqCancel')?.addEventListener('click', () => fecharModalDauliqVariante(null));
        document.getElementById('btnPLFecharNP')?.addEventListener('click', () => {
            document.getElementById('modalPLFecharNPTitulo').textContent = 'Informar NP (SIAFI)';
            document.getElementById('grpModalPLmotivoNP').style.display = 'none';
            document.getElementById('modalPLnp').value = '';
            document.getElementById('modalPLdataLiq').value = '';
            document.getElementById('overlayPLFecharNP').style.display = 'flex';
        });
        document.getElementById('btnPLCorrigirNP')?.addEventListener('click', () => {
            document.getElementById('modalPLFecharNPTitulo').textContent = 'Corrigir NP / data';
            document.getElementById('grpModalPLmotivoNP').style.display = 'block';
            document.getElementById('modalPLnp').value = plDocAtual.np || '';
            document.getElementById('modalPLdataLiq').value = plDocAtual.dataLiquidacao || '';
            document.getElementById('overlayPLFecharNP').style.display = 'flex';
        });
        document.getElementById('modalPLFecharNPCancelar')?.addEventListener('click', () => {
            document.getElementById('overlayPLFecharNP').style.display = 'none';
        });
        document.getElementById('modalPLFecharNPConfirmar')?.addEventListener('click', async () => {
            const np = document.getElementById('modalPLnp').value.trim();
            const dl = document.getElementById('modalPLdataLiq').value.trim();
            const correcao = document.getElementById('grpModalPLmotivoNP').style.display !== 'none';
            const motivo = correcao ? document.getElementById('modalPLmotivoNP').value.trim() : '';
            if (!np || !dl) {
                alert('Preencha NP e data.');
                return;
            }
            if (correcao && !motivo) {
                alert('Motivo obrigatório para correção.');
                return;
            }
            await executarFecharNP(np, dl, correcao, motivo);
        });
        document.getElementById('btnPLCancelar')?.addEventListener('click', () => cancelarPLCompleto());
        document.getElementById('btnPLInativar')?.addEventListener('click', () => toggleInativarPL());
        document.getElementById('btnPLExcluir')?.addEventListener('click', () => excluirPLPermanente());
        document.getElementById('plBuscaTC')?.addEventListener('input', () => desenharDisponiveis());
        document.getElementById('filtroPLInativas')?.addEventListener('change', () => desenharListaPL());
        document.getElementById('checkTodosPL')?.addEventListener('change', function() {
            const marcar = this.checked;
            const filtradaChk = plListaFiltrada();
            const inicioChk = (paginaAtualPL - 1) * itensPorPaginaPL;
            const idsPagina = filtradaChk.slice(inicioChk, inicioChk + itensPorPaginaPL).map(p => p.id);
            if (marcar) idsPagina.forEach(id => plSelecionados.add(id));
            else idsPagina.forEach(id => plSelecionados.delete(id));
            desenharListaPL();
            atualizarUIselecaoPL();
        });
        document.getElementById('buscaTabelaPL')?.addEventListener('input', typeof debounce === 'function' ? debounce(() => {
            termoBuscaPL = document.getElementById('buscaTabelaPL')?.value || '';
            paginaAtualPL = 1;
            desenharListaPL();
        }) : function() {
            termoBuscaPL = document.getElementById('buscaTabelaPL')?.value || '';
            paginaAtualPL = 1;
            desenharListaPL();
        });
        document.getElementById('btnImprimirBlocoPL')?.addEventListener('click', function() {
            const ids = Array.from(plSelecionados);
            if (!ids.length) return;
            if (ids.length > 10) {
                alert(`Limite de 10 DAuLiq por impressão em bloco. Você selecionou ${ids.length}.`);
                return;
            }
            gerarDauliqEmBloco(ids);
        });

        const paramsAno = new URLSearchParams(window.location.search);
        const anoPlQ = (paramsAno.get('ano') || '').trim().toLowerCase();
        if (anoPlQ === 'todos' || anoPlQ === 'all') filtroAnoExercicioPL = 'todos';
        else if (/^\d{4}$/.test(anoPlQ)) filtroAnoExercicioPL = anoPlQ;
        else filtroAnoExercicioPL = String(new Date().getFullYear());
        popularSelectFiltroAnoPL();

        setupFornecedorAutocomplete();

        unsubTitulos = db.collection('titulos').onSnapshot(snap => {
            baseTitulos = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            if (document.getElementById('tela-lista-pl').style.display !== 'none') {
                desenharListaPL();
            }
            if (document.getElementById('tela-editor-pl').style.display !== 'none') {
                desenharDisponiveis();
                desenharCarrinho();
                atualizarUiFornecedorPL();
            }
        });
        unsubPL = db.collection('preLiquidacoes').onSnapshot(snap => {
            listaPL = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            desenharListaPL();
            if (plIdAtual) {
                const p = listaPL.find(x => x.id === plIdAtual);
                if (p) {
                    plDocAtual = p;
                    desenharHistoricoPL();
                    atualizarCabecalhoEditorPL();
                    atualizarUiFornecedorPL();
                    atualizarBotoesEditor();
                    let resumo = `NP: ${p.np || '—'} · Atualizado: ${formatarDataHoraLista(p.editado_em)}`;
                    if (p.ativo === false) resumo += ' · Inativo';
                    document.getElementById('resumoEditorPL').textContent = resumo;
                }
            }
        });

        db.collection('centroCustos').get().then(snap => {
            listaCentroCustos = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        }).catch(() => {});
        db.collection('unidadesGestoras').get().then(snap => {
            listaUG = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        }).catch(() => {});

        const params = new URLSearchParams(window.location.search);
        const plq = params.get('pl');
        if (plq) setTimeout(() => abrirEditorPL(plq), 800);

        if (typeof aplicarPermissoesUI === 'function') aplicarPermissoesUI();
    };
})();
