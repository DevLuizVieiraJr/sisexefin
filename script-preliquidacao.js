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
                    recolhedor: normalizarDigitos(t.fornecedorCnpj || ''),
                    base: Number(d.baseCalculo) || 0,
                    aliq: Number(d.aliquota) || 0,
                    valor: Number(d.valorCalculado != null ? d.valorCalculado : d.valor) || 0,
                    codReceita: d.codReceita || d.codigo || '',
                    natRend: d.natRendimento || ''
                });
            });
        });
        return rows;
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
        const toBr = (d) => {
            if (!d) return '-';
            if (d instanceof Date && !isNaN(d.getTime())) {
                return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
            }
            return String(d);
        };
        const garantirEspaco = (h) => {
            if (y + h > PAGE_H - M.b) { docPDF.addPage(); y = M.t; }
        };
        const tituloSecao = (txt) => {
            garantirEspaco(8);
            docPDF.setFont('helvetica', 'bold');
            docPDF.setFontSize(9.5);
            docPDF.text(String(txt || ''), M.l, y + 4.8);
            docPDF.setDrawColor(155, 155, 155);
            docPDF.line(M.l, y + 5.8, M.l + W, y + 5.8);
            y += 8;
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
        if (logoData) {
            try { docPDF.addImage(logoData, 'PNG', M.l, y, 18, 18); } catch (_) {}
        }
        docPDF.setFont('helvetica', 'bold');
        docPDF.setFontSize(12);
        docPDF.text('Documento Auxiliar de Liquidação', M.l + (logoData ? 22 : 0), y + 8);
        docPDF.setFont('helvetica', 'normal');
        docPDF.setFontSize(8.5);
        const agora = new Date();
        docPDF.text('Impresso em: ' + agora.toLocaleString('pt-BR'), M.l + W, y + 5, { align: 'right' });
        docPDF.text('Gerado por: ' + (typeof usuarioLogadoEmail === 'string' ? usuarioLogadoEmail : '-'), M.l + W, y + 10, { align: 'right' });
        y += 22;

        const cnpjCred = normalizarDigitos(titulos[0]?.fornecedorCnpj || '');
        const nomeCred = titulos[0]?.fornecedorNome || titulos[0]?.fornecedor || '-';
        const venc = dataVencimento30(titulos);
        const ateste = dataAtesteMaisAntiga(titulos);
        const valorDoc = titulos.reduce((s, t) => s + (Number(t.valorNotaFiscal) || 0), 0);
        const totalDed = titulos.reduce((s, t) => {
            const deds = t.deducoesAplicadas || t.tributacoes || [];
            return s + deds.reduce((a, d) => a + (Number(d.valorCalculado != null ? d.valorCalculado : d.valor) || 0), 0);
        }, 0);

        tituloSecao('2. Dados básicos');
        docPDF.setFontSize(8);
        docPDF.text('Data do ateste (bloco): ' + toBr(ateste), M.l, y); y += 5;
        docPDF.text('Data de vencimento (ateste + 30): ' + toBr(venc), M.l, y); y += 5;
        docPDF.text('Valor do documento: ' + moeda(valorDoc), M.l, y); y += 5;
        docPDF.text('Código do credor: ' + (cnpjCred || '-'), M.l, y); y += 5;
        docPDF.text('Nome do credor: ' + nomeCred, M.l, y); y += 7;
        docPDF.setFont('helvetica', 'bold');
        docPDF.text('Documentos de origem', M.l, y); y += 5;
        docPDF.setFont('helvetica', 'normal');
        titulos.forEach(t => {
            garantirEspaco(6);
            const linha = `${normalizarDigitos(t.fornecedorCnpj || '')} | Emissão: ${t.dataEmissao || '-'} | ${t.tipoTC || ''}-${t.numTC || ''} | ${moeda(t.valorNotaFiscal)}`;
            docPDF.text(linha.slice(0, 120), M.l, y);
            y += 5;
        });
        y += 3;
        docPDF.setFont('helvetica', 'bold');
        docPDF.text('Observações (concatenadas)', M.l, y); y += 5;
        docPDF.setFont('helvetica', 'normal');
        observacoesLinhas(titulos).forEach(line => {
            garantirEspaco(5);
            docPDF.splitTextToSize(line, W).forEach(ln => { docPDF.text(ln, M.l, y); y += 4; });
        });
        y += 3;

        tituloSecao('3. Principal com orçamento');
        docPDF.setFontSize(8);
        docPDF.text('Favorecido (credor): ' + cnpjCred, M.l, y); y += 5;
        docPDF.text('Conta de contrato (RC): ' + (titulos[0]?.rc || '-'), M.l, y); y += 6;
        const emps = consolidarEmpenhosPrincipal(titulos);
        docPDF.setFont('helvetica', 'bold');
        docPDF.text('NE (12 últ.)', M.l, y);
        docPDF.text('Subel.', M.l + 35, y);
        docPDF.text('Valor', M.l + 55, y);
        y += 5;
        docPDF.setFont('helvetica', 'normal');
        emps.forEach(e => {
            garantirEspaco(5);
            docPDF.text(e.ne12 || '-', M.l, y);
            docPDF.text(e.subelemento || '-', M.l + 35, y);
            docPDF.text(moeda(e.valor), M.l + 55, y);
            y += 5;
        });
        y += 4;

        tituloSecao('4. Deduções');
        const hoje = toBr(new Date());
        const d025 = deducoesPorTipo(titulos, 'DDF025');
        const d021 = deducoesPorTipo(titulos, 'DDF021');
        const dddr = deducoesPorTipo(titulos, 'DDR001');
        function blocoDedSec(titSec, rows, comTotal) {
            if (!rows.length) return;
            tituloSecao(titSec);
            docPDF.setFontSize(7.5);
            docPDF.text('Data vencimento (bloco): ' + toBr(venc) + '  |  Data pagamento: ' + hoje, M.l, y); y += 5;
            let tb = 0;
            let tv = 0;
            rows.forEach(r => {
                garantirEspaco(5);
                docPDF.text(`${r.tituloIdProc} | Rec: ${r.recolhedor} | Base ${moeda(r.base)} | Alíq ${r.aliq}% | Val ${moeda(r.valor)}`, M.l, y);
                y += 4;
                tb += r.base;
                tv += r.valor;
            });
            if (comTotal) {
                docPDF.setFont('helvetica', 'bold');
                docPDF.text('Base total: ' + moeda(tb) + '   |   Valor total dedução: ' + moeda(tv), M.l, y);
                y += 5;
                docPDF.setFont('helvetica', 'normal');
            }
            y += 2;
        }
        agrupaDedDDF025(d025).forEach(grupo => {
            tituloSecao('4.1 DDF025 — Receita ' + (grupo.codReceita || '-'));
            docPDF.setFontSize(7.5);
            docPDF.text('Natureza rend.: ' + (grupo.natRend || '-') + '  |  Venc.: ' + toBr(venc) + '  |  Pag.: ' + hoje, M.l, y); y += 5;
            let tb = 0;
            let tv = 0;
            grupo.linhas.forEach(r => {
                garantirEspaco(5);
                docPDF.text(`${r.tituloIdProc} | Base ${moeda(r.base)} | Alíq ${r.aliq}% | ${moeda(r.valor)}`, M.l, y);
                y += 4;
                tb += r.base;
                tv += r.valor;
            });
            docPDF.setFont('helvetica', 'bold');
            docPDF.text('Base total: ' + moeda(tb) + '  |  Total: ' + moeda(tv), M.l, y); y += 6;
            docPDF.setFont('helvetica', 'normal');
        });
        blocoDedSec('4.2 DDF021 — INSS', d021, false);
        blocoDedSec('4.3 DDR001 — ISS', dddr, false);

        tituloSecao('5. Dados de pagamento');
        docPDF.setFontSize(8);
        docPDF.text('Recolhedor (credor): ' + cnpjCred, M.l, y); y += 5;
        docPDF.text('Valor líquido: ' + moeda(valorDoc - totalDed), M.l, y); y += 7;

        tituloSecao('6. DetaCustos (NE × subelemento × CC × UG)');
        consolidarDetaCustos(titulos).forEach(l => {
            garantirEspaco(5);
            docPDF.text(`${l.ne12} sub ${l.subelemento} | CC ${l.centroCustos} | UG ${l.ug} | ${moeda(l.valor)}`, M.l, y);
            y += 5;
        });

        tituloSecao('7. Histórico / Auditoria (pré-liquidação)');
        (pl.historico || []).slice().reverse().slice(0, 40).forEach(h => {
            garantirEspaco(5);
            const dt = h.data && h.data.toDate ? h.data.toDate().toLocaleString('pt-BR') : '-';
            docPDF.setFontSize(7.5);
            docPDF.text(`${dt} | ${h.tipo || ''} | ${h.usuario || ''} | ${String(h.detalhe || '').slice(0, 100)}`, M.l, y);
            y += 4;
        });

        const totalPag = docPDF.internal.getNumberOfPages();
        for (let i = 1; i <= totalPag; i++) {
            docPDF.setPage(i);
            docPDF.setFontSize(8);
            docPDF.text('Página ' + i + ' / ' + totalPag + ' | ' + (pl.codigo || ''), M.l + W / 2, PAGE_H - 6, { align: 'center' });
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
