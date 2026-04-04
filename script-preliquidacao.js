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
    let unsubTitulos = null;
    let unsubPL = null;

    let plIdAtual = null;
    let plDocAtual = null;
    let carrinhoIds = new Set();
    let fornecedorFiltroCnpj = '';
    let fornecedorFiltroNome = '';
    let modalMotivoResolver = null;

    function tem(perm) {
        return typeof temPermissaoUI === 'function' && temPermissaoUI(perm);
    }
    function ehAdmin() {
        return tem('acesso_admin');
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
        (titulos || []).forEach(t => {
            (t.empenhosVinculados || []).forEach(v => {
                const ne = ne12(v.numEmpenho);
                const sub = subel2(v.subelemento);
                const cc = labelCC(v.centroCustosId);
                const ug = labelUG(v.ugId);
                const k = ne + '|' + sub + '|' + cc + '|' + ug;
                const val = Number(v.valorVinculado) || 0;
                map.set(k, (map.get(k) || 0) + val);
            });
        });
        return Array.from(map.entries()).map(([k, valor]) => {
            const p = k.split('|');
            return { ne12: p[0], subelemento: p[1], centroCustos: p[2], ug: p[3], valor };
        });
    }

    function dataAtesteMaisAntiga(titulos) {
        let min = null;
        (titulos || []).forEach(t => {
            const s = t.dataAteste;
            if (!s) return;
            const d = new Date(s);
            if (isNaN(d.getTime())) return;
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
            const emis = String(t.dataEmissao || '');
            (t.empenhosVinculados || []).forEach(v => {
                const partes = [
                    tipoTC + '-' + numTC,
                    emis,
                    labelUG(v.ugId),
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
            for (const t of titulos || []) {
                const hit = (t.empenhosVinculados || []).find(v =>
                    ne12(v.numEmpenho) === row.ne12 && subel2(v.subelemento) === row.subelemento
                    && labelCC(v.centroCustosId) === row.centroCustos && labelUG(v.ugId) === row.ug
                );
                if (hit) {
                    neFull = hit.numEmpenho || row.ne12;
                    nd = hit.nd || '-';
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
                        break;
                    }
                }
            }
            return [neExibicaoPdf(neFull), nd, row.subelemento, moeda(row.valor), row.centroCustos, row.ug];
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

    async function gerarPDFDauliq(pl, titulos) {
        if (!window.jspdf || !window.jspdf.jsPDF) {
            alert('Biblioteca jsPDF indisponível.');
            return;
        }
        const { jsPDF } = window.jspdf;
        const docPDF = new jsPDF({ unit: 'mm', format: 'a4' });
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
                ['Nota de Empenho', 'Nat. de Despesa', 'Sub', 'Valor usado', 'Centro de Custos', 'UG Beneficiária'],
                rowsEmp,
                [34, 24, 12, 20, 44, 28]
            );
            const totalNE = consolidarEmpenhosPrincipal(titulos).reduce((s, e) => s + (Number(e.valor) || 0), 0);
            if (totalNE > 0) linhaTotalDireita('Valor total das NE (consolidado)', moeda(totalNE));
        }

        const itensISS = deducoesPorTipo(titulos, 'DDR001');
        const itensINSS = deducoesPorTipo(titulos, 'DDF021');
        const itensDARF = deducoesPorTipo(titulos, 'DDF025');

        if (itensISS.length) {
            tituloSecao('DEDUÇÕES — ISS');
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
            tituloSecao('DEDUÇÕES — INSS');
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
            tituloSecao('DEDUÇÕES — DARF');
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
                ['ID-PROC', 'Cod. Receita', 'Base', 'Alíq. tot.', 'IR', 'COFINS', 'CSLL', 'PIS/PASEP', 'Total'],
                rowsDarF,
                [16, 18, 20, 14, 14, 14, 14, 16, 18]
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

        const histRows = (pl.historico || []).slice().reverse().slice(0, 45).map(h => {
            const dt = h.data && h.data.toDate ? h.data.toDate().toLocaleString('pt-BR') : '-';
            return [dt, h.tipo || '-', h.usuario || '-', String(h.detalhe || '') + (h.motivo ? ' — ' + h.motivo : '')];
        });
        if (histRows.length) {
            tituloSecao('HISTÓRICO / AUDITORIA (PRÉ-LIQUIDAÇÃO)');
            tabela(['Data', 'Tipo', 'Utilizador', 'Detalhe'], histRows, [28, 22, 32, 72]);
        }

        const totalPages = docPDF.getNumberOfPages();
        for (let i = 1; i <= totalPages; i++) {
            docPDF.setPage(i);
            docPDF.setFontSize(8);
            docPDF.text(`Página ${i} de ${totalPages}`, 105, 290, { align: 'center' });
        }

        docPDF.save('DAuLiq_' + String(pl.codigo || 'lote').replace(/\//g, '-') + '.pdf');
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

    function desenharListaPL() {
        const tbody = document.getElementById('tbodyListaPL');
        if (!tbody) return;
        const mostrarInat = document.getElementById('filtroPLInativas')?.checked;
        tbody.innerHTML = '';
        const filtrada = listaPL.filter(p => {
            if (p.ativo === false && !mostrarInat && !ehAdmin()) return false;
            return true;
        });
        if (!filtrada.length) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">Nenhuma pré-liquidação.</td></tr>';
            return;
        }
        filtrada.sort((a, b) => String(b.codigo || '').localeCompare(String(a.codigo || '')));
        filtrada.forEach(p => {
            const tr = document.createElement('tr');
            const n = (p.tituloIds || []).length || (p.titulosParticiparamIds || []).length;
            const est = p.estado || 'Rascunho';
            let badge = '<span class="badge-pl-rascunho">Rascunho</span>';
            if (est === 'Fechado') badge = '<span class="badge-pl-fechado">Fechado</span>';
            if (est === 'Cancelado') badge = '<span class="badge-pl-cancel">Cancelado</span>';
            if (p.ativo === false) badge += ' <span class="badge-pl-inativo">Inativo</span>';
            tr.innerHTML = `
                <td>${escapeHTML(p.codigo || '-')}</td>
                <td>${badge}</td>
                <td>${escapeHTML(p.fornecedorNome || '-')}</td>
                <td>${n}</td>
                <td>${escapeHTML(p.np || '-')}</td>
                <td><button type="button" class="btn-default btn-small btn-abrir-pl" data-id="${escapeHTML(p.id)}">Abrir</button></td>
            `;
            tbody.appendChild(tr);
        });
        tbody.querySelectorAll('.btn-abrir-pl').forEach(btn => {
            btn.addEventListener('click', () => abrirEditorPL(btn.getAttribute('data-id')));
        });
    }

    function desenharCarrinho() {
        const ul = document.getElementById('plListaCarrinho');
        const empty = document.getElementById('plCarrinhoVazio');
        if (!ul || !empty) return;
        ul.innerHTML = '';
        const ts = titulosDoCarrinho();
        if (!ts.length) {
            empty.style.display = 'block';
            return;
        }
        empty.style.display = 'none';
        const podeRemover = plDocAtual && (plDocAtual.estado || '') === 'Rascunho' && tem('preliquidacao_editar');
        ts.forEach(t => {
            const li = document.createElement('li');
            li.style.cssText = 'padding:6px 0;border-bottom:1px solid #eee;display:flex;justify-content:space-between;align-items:center;gap:8px;';
            li.innerHTML = `<span>${escapeHTML(t.idProc || t.id)} — ${escapeHTML(moeda(t.valorNotaFiscal))}</span>` +
                (podeRemover ? `<button type="button" class="btn-default btn-small btn-pl-rem" data-id="${escapeHTML(t.id)}">Remover</button>` : '');
            ul.appendChild(li);
        });
        ul.querySelectorAll('.btn-pl-rem').forEach(btn => {
            btn.addEventListener('click', () => removerTcDoCarrinho(btn.getAttribute('data-id')));
        });
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
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#888;">Selecione um fornecedor.</td></tr>';
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
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Nenhum TC elegível.</td></tr>';
            return;
        }
        lista.forEach(t => {
            const outra = outraPLAberta(t);
            const tr = document.createElement('tr');
            const podeAdd = (plDocAtual && (plDocAtual.estado || '') === 'Rascunho' && tem('preliquidacao_editar'))
                || (!plIdAtual && tem('preliquidacao_inserir'));
            const disabled = !!outra || !podeAdd || (plDocAtual && (plDocAtual.estado || '') !== 'Rascunho');
            tr.innerHTML = `
                <td><input type="checkbox" class="pl-chk-tc" data-id="${escapeHTML(t.id)}" ${carrinhoIds.has(t.id) ? 'checked' : ''} ${disabled ? 'disabled' : ''}></td>
                <td>${escapeHTML(t.idProc || '')}</td>
                <td>${escapeHTML((t.tipoTC || '') + '-' + (t.numTC || ''))}</td>
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
                atualizarBotoesEditor();
            });
        });
    }

    function desenharHistoricoPL() {
        const tbody = document.getElementById('tbodyPLHistorico');
        if (!tbody) return;
        tbody.innerHTML = '';
        const h = (plDocAtual && plDocAtual.historico) ? plDocAtual.historico.slice().reverse() : [];
        if (!h.length) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">Sem registos.</td></tr>';
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
        const salvarVis = (rasc && (tem('preliquidacao_editar') || tem('preliquidacao_inserir'))) || (!plIdAtual && tem('preliquidacao_inserir'));
        document.getElementById('btnPLSalvar').style.display = salvarVis ? 'inline-block' : 'none';
        document.getElementById('btnPLPdf').style.display = (carrinhoIds.size > 0 && tem('preliquidacao_gerar_pdf')) ? 'inline-block' : 'none';
        document.getElementById('btnPLFecharNP').style.display = (rasc && plIdAtual && carrinhoIds.size > 0 && tem('preliquidacao_fechar_np')) ? 'inline-block' : 'none';
        document.getElementById('btnPLCorrigirNP').style.display = (fechado && tem('preliquidacao_fechar_np')) ? 'inline-block' : 'none';
        document.getElementById('btnPLCancelar').style.display = (!cancel && plIdAtual && tem('preliquidacao_cancelar')) ? 'inline-block' : 'none';
        document.getElementById('btnPLInativar').style.display = (plIdAtual && (tem('preliquidacao_status') || ehAdmin())) ? 'inline-block' : 'none';
        document.getElementById('btnPLExcluir').style.display = (plIdAtual && cancel && (tem('preliquidacao_excluir') || ehAdmin())) ? 'inline-block' : 'none';
        if (fechado) document.getElementById('btnPLFecharNP').style.display = 'none';
    }

    async function abrirEditorPL(id) {
        plIdAtual = id;
        const snap = await db.collection('preLiquidacoes').doc(id).get();
        if (!snap.exists) {
            alert('Pré-liquidação não encontrada.');
            return;
        }
        plDocAtual = { id: snap.id, ...snap.data() };
        carrinhoIds = new Set(plDocAtual.tituloIds || []);
        fornecedorFiltroCnpj = plDocAtual.fornecedorCnpj || '';
        fornecedorFiltroNome = plDocAtual.fornecedorNome || '';
        document.getElementById('plFornecedorSelecionado').textContent = fornecedorFiltroNome
            ? `${fornecedorFiltroNome} (${fornecedorFiltroCnpj})`
            : '';
        document.getElementById('tituloEditorPL').textContent = 'Pré-Liquidação ' + (plDocAtual.codigo || '');
        document.getElementById('resumoEditorPL').textContent =
            `Estado: ${plDocAtual.estado || 'Rascunho'} | NP: ${plDocAtual.np || '—'} | Inativo: ${plDocAtual.ativo === false ? 'sim' : 'não'}`;
        document.getElementById('tela-lista-pl').style.display = 'none';
        document.getElementById('tela-editor-pl').style.display = 'block';
        desenharCarrinho();
        desenharDisponiveis();
        desenharHistoricoPL();
        atualizarBotoesEditor();
        if (typeof aplicarPermissoesUI === 'function') aplicarPermissoesUI();
    }

    function novaPL() {
        plIdAtual = null;
        plDocAtual = null;
        carrinhoIds = new Set();
        fornecedorFiltroCnpj = '';
        fornecedorFiltroNome = '';
        document.getElementById('plBuscaFornecedor').value = '';
        document.getElementById('plFornecedorSelecionado').textContent = '';
        document.getElementById('tituloEditorPL').textContent = 'Nova pré-liquidação';
        document.getElementById('resumoEditorPL').textContent = 'Guarde para gerar o código PL-#####/AAAA.';
        document.getElementById('tela-lista-pl').style.display = 'none';
        document.getElementById('tela-editor-pl').style.display = 'block';
        desenharCarrinho();
        desenharDisponiveis();
        document.getElementById('tbodyPLHistorico').innerHTML = '<tr><td colspan="4" style="text-align:center;">Guarde para criar o histórico.</td></tr>';
        atualizarBotoesEditor();
        if (typeof aplicarPermissoesUI === 'function') aplicarPermissoesUI();
    }

    async function salvarPL() {
        if (!fornecedorFiltroCnpj) {
            alert('Selecione um fornecedor.');
            return;
        }
        if (carrinhoIds.size < 1) {
            alert('Adicione ao menos um TC ao carrinho.');
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
                let codigo = '';
                await db.runTransaction(async (tx) => {
                    const cSnap = await tx.get(counterRef);
                    const seq = (cSnap.exists ? (cSnap.data().seq || 0) : 0) + 1;
                    codigo = 'PL-' + String(seq).padStart(5, '0') + '/' + ano;
                    tx.set(counterRef, {
                        seq,
                        editado_em: firebase.firestore.FieldValue.serverTimestamp()
                    }, { merge: true });
                    tx.set(plRef, {
                        codigo,
                        estado: 'Rascunho',
                        ativo: true,
                        fornecedorCnpj: cnpj0,
                        fornecedorNome: fornecedorFiltroNome || ts[0].fornecedorNome || '',
                        tituloIds: Array.from(carrinhoIds),
                        np: '',
                        dataLiquidacao: '',
                        historico: [plHistoricoEntry('criacao', 'Pré-liquidação criada com código ' + codigo, '')],
                        criado_em: firebase.firestore.FieldValue.serverTimestamp(),
                        criado_por: typeof usuarioLogadoEmail === 'string' ? usuarioLogadoEmail : '',
                        editado_em: firebase.firestore.FieldValue.serverTimestamp()
                    });
                });
                const batch = db.batch();
                Array.from(carrinhoIds).forEach(tid => {
                    batch.update(db.collection('titulos').doc(tid), {
                        preLiquidacaoId: novoId,
                        preLiquidacaoCodigo: codigo,
                        editado_em: firebase.firestore.FieldValue.serverTimestamp()
                    });
                });
                await batch.commit();
                await abrirEditorPL(novoId);
                alert('Pré-liquidação criada: ' + codigo);
            } else {
                const plRef = db.collection('preLiquidacoes').doc(plIdAtual);
                const snap = await plRef.get();
                const d = snap.data() || {};
                if ((d.estado || '') !== 'Rascunho') {
                    alert('Só é possível alterar o carrinho em Rascunho.');
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
                const ev = plHistoricoEntry('salvar', 'Carrinho atualizado (' + novos.size + ' TCs)', '');
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
            const snap = await plRef.get();
            const d = snap.data() || {};
            const npAntiga = String(d.np || '').trim();
            if (correcao && npAntiga) {
                for (const tid of ids) {
                    await desvincularTituloDaNP(tid, npAntiga);
                }
            }
            const evTipo = correcao ? 'corrigir_np' : 'fechar_np';
            const ev = plHistoricoEntry(evTipo, 'NP: ' + np + ' | Data: ' + dataLiq, correcao ? (motivoCorrecao || '') : '');
            const hist = (d.historico || []).concat([ev]);
            await plRef.update({
                estado: 'Fechado',
                np,
                dataLiquidacao: dataLiq,
                historico: hist,
                editado_em: firebase.firestore.FieldValue.serverTimestamp()
            });
            for (const tid of ids) {
                const tRef = db.collection('titulos').doc(tid);
                const tSnap = await tRef.get();
                const td = tSnap.data() || {};
                const h = entradaHistoricoTC('Liquidado', correcao ? 'Correção NP (PL)' : 'NP via pré-liquidação', (correcao ? (motivoCorrecao || '') + ' | ' : '') + 'NP ' + np);
                const hists = Array.isArray(td.historicoStatus) ? td.historicoStatus.slice() : [];
                const histo = Array.isArray(td.historico) ? td.historico.slice() : [];
                hists.push(h);
                histo.push(h);
                await tRef.update({
                    np,
                    dataLiquidacao: dataLiq,
                    status: 'Liquidado',
                    historicoStatus: hists,
                    historico: histo,
                    editado_em: firebase.firestore.FieldValue.serverTimestamp()
                });
                await vincularTituloNaNP(tid, np, dataLiq);
            }
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
        if (!confirm('Eliminar permanentemente este registo?')) return;
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
                    document.getElementById('plFornecedorSelecionado').textContent = `${fornecedorFiltroNome} (${fornecedorFiltroCnpj})`;
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
            plIdAtual = null;
            plDocAtual = null;
        });
        document.getElementById('btnPLSalvar')?.addEventListener('click', () => salvarPL());
        document.getElementById('btnPLPdf')?.addEventListener('click', async () => {
            const ts = titulosDoCarrinho();
            if (!ts.length) { alert('Carrinho vazio.'); return; }
            if (!plDocAtual) { alert('Guarde a pré-liquidação antes de gerar o PDF (para histórico).'); return; }
            mostrarLoading();
            try {
                const meta = {
                    geradoEm: new Date().toISOString(),
                    usuario: typeof usuarioLogadoEmail === 'string' ? usuarioLogadoEmail : '',
                    nomeArquivoSugerido: 'DAuLiq_' + String(plDocAtual.codigo || '').replace(/\//g, '-') + '.pdf'
                };
                const plRef = db.collection('preLiquidacoes').doc(plIdAtual);
                const ev = plHistoricoEntry('pdf', 'DAuLiq gerado', '');
                const snap = await plRef.get();
                const d = snap.data() || {};
                await plRef.update({
                    auditoriaPdf: meta,
                    historico: (d.historico || []).concat([ev]),
                    editado_em: firebase.firestore.FieldValue.serverTimestamp()
                });
                const plMerged = { id: plIdAtual, ...d, auditoriaPdf: meta, historico: (d.historico || []).concat([ev]) };
                await gerarPDFDauliq(plMerged, ts);
                await abrirEditorPL(plIdAtual);
            } catch (e) {
                alert('Erro ao gerar PDF: ' + (e.message || e));
            } finally {
                esconderLoading();
            }
        });
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

        setupFornecedorAutocomplete();

        unsubTitulos = db.collection('titulos').onSnapshot(snap => {
            baseTitulos = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            if (document.getElementById('tela-editor-pl').style.display !== 'none') {
                desenharDisponiveis();
                desenharCarrinho();
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
                    atualizarBotoesEditor();
                    document.getElementById('resumoEditorPL').textContent =
                        `Estado: ${p.estado || 'Rascunho'} | NP: ${p.np || '—'} | Inativo: ${p.ativo === false ? 'sim' : 'não'}`;
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
