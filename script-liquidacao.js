// ==========================================
// LIQUIDAÇÃO E PAGAMENTO — 6 abas, integração Firebase/Firestore
// ==========================================

// Helpers globais de loading (acessíveis pelo script.js antes do IIFE carregar)
function mostrarLoading() {
    var el = document.getElementById('loadingApp');
    if (el) el.style.display = 'flex';
}
function esconderLoading() {
    var el = document.getElementById('loadingApp');
    if (el) el.style.display = 'none';
}

(function () {
    if (!document.getElementById('corpo-liquidacao')) return;

    // ===== FIREBASE DATA (substituem todos os mocks) =====
    var baseTitulosLP  = [];   // onSnapshot 'titulos'
    var baseLfPfLP     = [];   // onSnapshot 'lfpf'
    var unsubTitulosLP, unsubLfPfLP, unsubLiquidacoes;

    // ===== STATE =====
    var lpLista            = [];   // populado via onSnapshot 'liquidacoes'
    var lpEditorState      = null;
    var lpAbaAtiva         = 'A';
    var termoBuscaLP       = '';
    var tcsSelecionadosModal = new Set();
    var _poolDisponivel    = [];
    var itensPorPaginaLP   = 10;
    var paginaAtualLP      = 1;
    var estadoOrdenacaoLP  = { coluna: 'codigo', direcao: 'desc' };
    var modalMotivoResolver = null;
    var modoCorrecaoNP     = false;
    var lpSomenteLeitura   = false;
    var lpSelecionados     = new Set();
    var filtroAnoExercicioLP = '';
    var filtroAnoLPListenerOk = false;
    var modalDauliqVarianteResolver = null;

    function tem(perm) {
        return typeof temPermissaoUI === 'function' && temPermissaoUI(perm);
    }

    function ehAdmin() {
        return tem('acesso_admin');
    }

    function podeOperarLPLista() {
        return tem('liquidacao_editar') || tem('liquidacao_inserir') || tem('liquidacao_fechar_np')
            || tem('liquidacao_cancelar') || tem('liquidacao_status') || tem('liquidacao_excluir') || ehAdmin();
    }

    function resolverAnoExercicioLP(lp) {
        if (!lp) return null;
        if (typeof lp.anoExercicio === 'number') {
            var n = lp.anoExercicio;
            if (n >= 1900 && n <= 2100) return n;
        }
        if (window.sisAnoDocumento && typeof window.sisAnoDocumento.anoDeCodigoPL === 'function') {
            var y = window.sisAnoDocumento.anoDeCodigoPL(lp.codigo);
            if (y != null) return y;
        }
        var m = String(lp.codigo || '').match(/\/(\d{4})\s*$/);
        return m ? parseInt(m[1], 10) : null;
    }

    function idsTitulosParaPdfLP(lp) {
        var raw = (lp.tcsIds || []).slice();
        if (!raw.length && (lp.tcsParticiparamIds || []).length) {
            raw = lp.tcsParticiparamIds.slice();
        }
        var out = [];
        raw.forEach(function (id) {
            if (id && out.indexOf(id) < 0) out.push(id);
        });
        return out;
    }

    async function carregarTitulosParaPdfLP(lp) {
        var ids = idsTitulosParaPdfLP(lp);
        var out = [];
        for (var i = 0; i < ids.length; i++) {
            var s = await db.collection('titulos').doc(ids[i]).get();
            if (s.exists) out.push(Object.assign({ id: s.id }, s.data()));
        }
        return out;
    }

    function pedirVariantePdfDauliq() {
        return new Promise(function (resolve) {
            modalDauliqVarianteResolver = resolve;
            var modal = qs('modalLPVarianteDauliq');
            if (modal) modal.style.display = 'flex';
        });
    }

    function fecharModalDauliqVarianteRes(val) {
        var modal = qs('modalLPVarianteDauliq');
        if (modal) modal.style.display = 'none';
        if (modalDauliqVarianteResolver) {
            var fn = modalDauliqVarianteResolver;
            modalDauliqVarianteResolver = null;
            fn(val);
        }
    }

    function popularSelectFiltroAnoLP() {
        var sel = qs('filtroAnoExercicioLP');
        if (!sel) return;
        var cur = new Date().getFullYear();
        var antes = filtroAnoExercicioLP;
        sel.innerHTML = '';
        var opTodos = document.createElement('option');
        opTodos.value = 'todos';
        opTodos.textContent = 'Todos os anos';
        sel.appendChild(opTodos);
        for (var y = cur + 1; y >= cur - 20; y--) {
            var op = document.createElement('option');
            op.value = String(y);
            op.textContent = String(y);
            sel.appendChild(op);
        }
        if (antes === 'todos') sel.value = 'todos';
        else if (antes && Array.from(sel.options).some(function (o) { return o.value === antes; })) sel.value = antes;
        else sel.value = String(cur);
        filtroAnoExercicioLP = sel.value;
        if (!filtroAnoLPListenerOk) {
            filtroAnoLPListenerOk = true;
            sel.addEventListener('change', function () {
                filtroAnoExercicioLP = sel.value;
                try {
                    var u = new URL(window.location.href);
                    if (filtroAnoExercicioLP === 'todos') u.searchParams.delete('ano');
                    else u.searchParams.set('ano', filtroAnoExercicioLP);
                    if (history.replaceState) history.replaceState({}, '', u.pathname + u.search);
                } catch (e) { /* ignore */ }
                paginaAtualLP = 1;
                renderizarLista();
            });
        }
    }

    function sincronizarCheckTodosLP() {
        var chk = qs('checkTodosLP');
        if (!chk) return;
        var cbs = document.querySelectorAll('.check-lp-row');
        var todos = cbs.length > 0;
        cbs.forEach(function (cb) { if (!cb.checked) todos = false; });
        chk.checked = todos;
    }

    function atualizarUISelecaoLP() {
        var n = lpSelecionados.size;
        var cont = qs('containerSelecaoMultiplaLP');
        var cnt = qs('countSelecionadosLP');
        if (cnt) cnt.textContent = String(n);
        if (cont) cont.style.display = n > 0 ? 'block' : 'none';
    }

    function lpEstadoFechado(estado) {
        return String(estado || '').toLowerCase() === 'fechado';
    }

    function lpEstadoCancelado(estado) {
        return String(estado || '').toLowerCase() === 'cancelado';
    }

    function lpPodeEditarLote(estado) {
        return !lpEstadoFechado(estado) && !lpEstadoCancelado(estado);
    }

    // ===== HELPERS FIREBASE: normalização e acesso a dados =====

    // Normaliza um documento 'titulos' do Firestore para a estrutura esperada pela UI
    function normalizarTCParaUI(t) {
        var docStr = '';
        if (t.tipoDocumento && t.numeroDocumento) docStr = t.tipoDocumento + '-' + t.numeroDocumento;
        else docStr = t.doc || t.numeroDocumento || '';
        return {
            id:      t.id,
            proc:    t.idProc   || t.proc   || t.id,
            cnpj:    t.fornecedorCnpj || t.cnpj || '',
            emissao: t.emissao  || '',
            ateste:  t.ateste   || '',
            doc:     docStr,
            valor:   Number(t.valorNotaFiscal || t.valor || 0),
            status:  t.status   || '',
        };
    }

    // Retorna fornecedores únicos derivados dos títulos carregados
    function getFornecedoresUnicosLP() {
        var mapa = {};
        baseTitulosLP.forEach(function (t) {
            var cnpj = t.fornecedorCnpj || t.cnpj || '';
            var nome = t.fornecedorNome || t.fornecedor || t.razaoSocial || cnpj;
            if (cnpj && !mapa[cnpj]) mapa[cnpj] = { cnpj: cnpj, nome: nome };
        });
        return Object.values(mapa);
    }

    // Retorna deduções de um TC por tipo: 'DDF025' (DARF), 'DDF021' (INSS), 'DDR001' (ISS)
    function getDeducoesTipo(tcId, tipo) {
        var t = baseTitulosLP.find(function (tc) { return tc.id === tcId; });
        if (!t) return [];
        return (t.deducoesAplicadas || t.tributacoes || []).filter(function (d) { return d.tipo === tipo; });
    }

    // ===== HELPERS =====
    function moeda(n) {
        var x = Number(n || 0);
        return 'R$\u00a0' + x.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    function fmtData(v) {
        if (!v) return '—';
        if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)) {
            var p = v.slice(0, 10).split('-');
            return p[2] + '/' + p[1] + '/' + p[0];
        }
        if (v instanceof Date && !isNaN(v.getTime())) {
            return String(v.getDate()).padStart(2, '0') + '/' +
                   String(v.getMonth() + 1).padStart(2, '0') + '/' + v.getFullYear();
        }
        return String(v);
    }

    function fmtDataHora(v) {
        if (!v) return '—';
        var d = new Date(v);
        if (isNaN(d.getTime())) return String(v);
        return fmtData(d) + ', ' +
               String(d.getHours()).padStart(2, '0') + ':' +
               String(d.getMinutes()).padStart(2, '0');
    }

    function toDateBrPdf(v) {
        if (!v) return '-';
        var r = fmtData(v);
        return r === '—' ? '-' : r;
    }

    function addDias(dateStr, dias) {
        if (!dateStr) return null;
        var d = new Date(dateStr + 'T00:00:00');
        if (isNaN(d.getTime())) return null;
        d.setDate(d.getDate() + dias);
        return d.toISOString().slice(0, 10);
    }

    function getTCsPorIds(ids) {
        return (ids || []).map(function (id) {
            var t = baseTitulosLP.find(function (tc) { return tc.id === id; });
            return t ? normalizarTCParaUI(t) : null;
        }).filter(Boolean);
    }

    function atesteMinimo(ids) {
        var datas = getTCsPorIds(ids).map(function (t) { return t.ateste; }).filter(Boolean).sort();
        return datas[0] || null;
    }

    function valorTotalBruto(ids) {
        return getTCsPorIds(ids).reduce(function (s, t) { return s + (Number(t.valor) || 0); }, 0);
    }

    function totalDARF(ids) {
        return (ids || []).reduce(function (s, id) {
            return s + getDeducoesTipo(id, 'DDF025').reduce(function (ss, d) {
                return ss + (Number(d.total || d.valor) || 0);
            }, 0);
        }, 0);
    }

    function totalINSS(ids) {
        return (ids || []).reduce(function (s, id) {
            return s + getDeducoesTipo(id, 'DDF021').reduce(function (ss, d) {
                return ss + (Number(d.valor) || 0);
            }, 0);
        }, 0);
    }

    function totalISS(ids) {
        return (ids || []).reduce(function (s, id) {
            return s + getDeducoesTipo(id, 'DDR001').reduce(function (ss, d) {
                return ss + (Number(d.valor) || 0);
            }, 0);
        }, 0);
    }

    function totalImpostos(ids) {
        return totalDARF(ids) + totalINSS(ids) + totalISS(ids);
    }

    function totalImpostosPorTC(tcId) {
        var darf = getDeducoesTipo(tcId, 'DDF025').reduce(function (s, d) { return s + (Number(d.total || d.valor) || 0); }, 0);
        var inss = getDeducoesTipo(tcId, 'DDF021').reduce(function (s, d) { return s + (Number(d.valor) || 0); }, 0);
        var iss  = getDeducoesTipo(tcId, 'DDR001').reduce(function (s, d) { return s + (Number(d.valor) || 0); }, 0);
        return darf + inss + iss;
    }

    // ===== HELPERS LFxPF =====
    function normalizarLF(entrada) {
        if (!entrada) return '';
        var v = String(entrada).trim().toUpperCase();
        if (/^\d{4}LF\d{6}$/.test(v)) return v;
        if (/^\d{1,6}$/.test(v)) {
            var ano = new Date().getFullYear();
            return ano + 'LF' + v.padStart(6, '0');
        }
        return String(entrada).trim();
    }

    function buscarPFporLF(lfNorm) {
        if (!lfNorm) return null;
        var upper = String(lfNorm).toUpperCase();
        return baseLfPfLP.find(function (r) {
            return (r.lf || '').toUpperCase() === upper;
        }) || null;
    }

    function calcularStatusFinanceiro(orcamento) {
        var lfsCount = (orcamento || []).filter(function (o) { return !!(o.lf || '').trim(); }).length;
        var pfsCount = (orcamento || []).filter(function (o) { return !!(o.pf || '').trim(); }).length;
        if (lfsCount === 0)                      return 'aguardandoFinanceiroSemLF';
        if (lfsCount > 0 && pfsCount === 0)      return 'aguardandoFinanceiroComLF';
        if (pfsCount > 0 && pfsCount < lfsCount) return 'paraPagamentoParcial';
        return 'paraPagamento';
    }

    function gerarOrcamentoParaIds(ids, anterior) {
        var resultado = [];
        (ids || []).forEach(function (id) {
            var t    = baseTitulosLP.find(function (tc) { return tc.id === id; }) || {};
            var emps = (t.empenhosVinculados || []);
            if (!emps.length) {
                var ant = (anterior || []).find(function (o) { return o.tcId === id; }) || {};
                resultado.push({
                    tcId: id, ne: '—', nd: '—', sub: '—', fr: '—',
                    valor: Number(t.valorNotaFiscal || t.valor || 0),
                    cc: '—', ug: '—',
                    vinc: ant.vinc || '', lf: ant.lf || '', pf: ant.pf || '',
                });
            } else {
                emps.forEach(function (v) {
                    var neVal = v.numEmpenho || v.numNE || '—';
                    var ant = (anterior || []).find(function (o) {
                        return o.tcId === id && o.ne === neVal;
                    }) || {};
                    resultado.push({
                        tcId:  id,
                        ne:    neVal,
                        nd:    v.nd          || '—',
                        sub:   v.subelemento || '—',
                        fr:    v.fr          || '—',
                        valor: Number(v.valorVinculado || 0),
                        cc:    v.centroCustosId || '—',
                        ug:    v.ugId           || '—',
                        vinc:  ant.vinc || '',
                        lf:    ant.lf   || v.lf  || '',
                        pf:    ant.pf   || v.pf  || '',
                    });
                });
            }
        });
        return resultado;
    }

    function badgeEstado(estado) {
        var mapa = {
            rascunho:                   '<span class="badge-lp-rascunho">Rascunho</span>',
            orcamento:                  '<span class="badge-lp-orcamento">Em Orçamento</span>',
            impostos:                   '<span class="badge-lp-impostos">Em Impostos</span>',
            pagamento:                  '<span class="badge-lp-pagamento">Em Pagamento</span>',
            fechado:                    '<span class="badge-lp-fechado">Fechado</span>',
            cancelado:                  '<span class="badge-lp-cancelado">Cancelado</span>',
            aguardandoFinanceiroSemLF:  '<span class="badge-lp-ag-sem-lf">Ag. Financeiro s/ LF</span>',
            aguardandoFinanceiroComLF:  '<span class="badge-lp-ag-com-lf">Ag. Financeiro c/ LF</span>',
            paraPagamentoParcial:       '<span class="badge-lp-pparcial">Para Pag. Parcial</span>',
            paraPagamento:              '<span class="badge-lp-para-pag">Para Pagamento</span>',
        };
        return mapa[estado] || '<span class="badge-lp-rascunho">' + estado + '</span>';
    }

    function proximoCodigo() {
        var anoAtual = new Date().getFullYear();
        var maxSeq = lpLista.reduce(function (mx, l) {
            var m = String(l.codigo || '').match(/LP-(\d{5})\/(\d{4})/);
            if (m && parseInt(m[2]) === anoAtual) return Math.max(mx, parseInt(m[1]));
            return mx;
        }, 0);
        return 'LP-' + String(maxSeq + 1).padStart(5, '0') + '/' + anoAtual;
    }

    function qs(id) { return document.getElementById(id); }

    function obterTimestampEmMsLP(v) {
        if (!v) return 0;
        if (v.toDate) return v.toDate().getTime();
        if (v instanceof Date) return v.getTime();
        var d = new Date(v);
        return isNaN(d.getTime()) ? 0 : d.getTime();
    }

    function valorTotalLoteNaLista(lp) {
        return valorTotalBruto(lp.tcsIds || []);
    }

    function lpListaFiltrada() {
        var termo = termoBuscaLP.toLowerCase().trim();
        var mostrarInat = qs('filtroLPInativas') && qs('filtroLPInativas').checked;
        var lista = lpLista.filter(function (lp) {
            if (lp.ativo === false && !mostrarInat && !ehAdmin()) return false;
            if (filtroAnoExercicioLP && filtroAnoExercicioLP !== 'todos') {
                var want = parseInt(filtroAnoExercicioLP, 10);
                if (!isNaN(want) && resolverAnoExercicioLP(lp) !== want) return false;
            }
            return !termo ||
                String(lp.codigo || '').toLowerCase().includes(termo) ||
                String((lp.fornecedor && lp.fornecedor.nome) || '').toLowerCase().includes(termo) ||
                String(lp.np || '').toLowerCase().includes(termo);
        });
        var col = estadoOrdenacaoLP.coluna;
        var dir = estadoOrdenacaoLP.direcao;
        lista.sort(function (a, b) {
            if (col === 'valorTotal') {
                var va = valorTotalLoteNaLista(a);
                var vb = valorTotalLoteNaLista(b);
                return dir === 'asc' ? va - vb : vb - va;
            }
            if (col === 'qtdTcs') {
                var qa = (a.tcsIds || []).length || (a.tcsParticiparamIds || []).length;
                var qb = (b.tcsIds || []).length || (b.tcsParticiparamIds || []).length;
                return dir === 'asc' ? qa - qb : qb - qa;
            }
            if (col === 'editadoEm') {
                var ta = obterTimestampEmMsLP(a.editadoEm || a.editado_em);
                var tb = obterTimestampEmMsLP(b.editadoEm || b.editado_em);
                return dir === 'asc' ? ta - tb : tb - ta;
            }
            if (col === 'fornecedor') {
                var fa = String((a.fornecedor && a.fornecedor.nome) || '').toLowerCase();
                var fb = String((b.fornecedor && b.fornecedor.nome) || '').toLowerCase();
                var cmpF = fa.localeCompare(fb);
                return dir === 'asc' ? cmpF : -cmpF;
            }
            var va = a[col] != null ? String(a[col]).toLowerCase() : '';
            var vb = b[col] != null ? String(b[col]).toLowerCase() : '';
            var cmp = va.localeCompare(vb);
            return dir === 'asc' ? cmp : -cmp;
        });
        return lista;
    }

    function atualizarIconesOrdenacaoLP() {
        document.querySelectorAll('#tabelaLiquidacoes .sort-icon').forEach(function (el) { el.textContent = ''; });
        var icon = document.getElementById('sort-lp-' + estadoOrdenacaoLP.coluna);
        if (icon) icon.textContent = estadoOrdenacaoLP.direcao === 'asc' ? '▲' : '▼';
    }

    window.ordenarListaLP = function (coluna) {
        if (estadoOrdenacaoLP.coluna === coluna) {
            estadoOrdenacaoLP.direcao = estadoOrdenacaoLP.direcao === 'asc' ? 'desc' : 'asc';
        } else {
            estadoOrdenacaoLP.coluna = coluna;
            estadoOrdenacaoLP.direcao = coluna === 'codigo' ? 'desc' : 'asc';
        }
        paginaAtualLP = 1;
        atualizarIconesOrdenacaoLP();
        renderizarLista();
    };

    window.mudarTamanhoPaginaLP = function () {
        itensPorPaginaLP = parseInt(qs('itensPorPaginaLP') && qs('itensPorPaginaLP').value || 10, 10);
        paginaAtualLP = 1;
        renderizarLista();
    };
    window.mudarPaginaLP = function (dir) {
        paginaAtualLP += dir;
        renderizarLista();
    };
    window.irParaPrimeiraPaginaLP = function () {
        paginaAtualLP = 1;
        renderizarLista();
    };
    window.irParaUltimaPaginaLP = function () {
        var lista = lpListaFiltrada();
        paginaAtualLP = Math.ceil(lista.length / itensPorPaginaLP) || 1;
        renderizarLista();
    };

    function aplicarPermissoesBotoesLP() {
        document.querySelectorAll('[data-permission]').forEach(function (el) {
            var perm = el.getAttribute('data-permission');
            var ok = !perm || tem(perm);
            el.style.display = ok ? '' : 'none';
            el.disabled = !ok;
        });
    }

    function aplicarEstadoCamposEditorLeitura() {
        var ro = !!lpSomenteLeitura;
        var buscaForn = qs('lpBuscaFornecedor');
        var buscaTc = qs('lpBuscaTCModal');
        if (buscaForn) { buscaForn.disabled = ro; buscaForn.style.opacity = ro ? '0.75' : ''; }
        if (buscaTc) { buscaTc.disabled = ro; buscaTc.style.opacity = ro ? '0.75' : ''; }
        document.querySelectorAll('#lpOrcamentoContainer input, #lpOrcamentoContainer select').forEach(function (el) {
            el.disabled = ro;
        });
        ['btnLPTrocarFornecedor', 'btnLPAdicionarTC', 'btnLPRemoverTC', 'btnBuscarLFs'].forEach(function (id) {
            var b = qs(id);
            if (b) b.style.display = ro ? 'none' : '';
        });
    }

    function atualizarBotoesEditor() {
        if (!lpEditorState) return;
        aplicarPermissoesBotoesLP();
        var fechado = lpEstadoFechado(lpEditorState.estado);
        var cancelado = lpEstadoCancelado(lpEditorState.estado);
        var idsPdf = idsTitulosParaPdfLP(lpEditorState);
        var hint = qs('lpHintAcoes');
        var setVis = function (id, vis) {
            var el = qs(id);
            if (el) el.style.display = vis ? '' : 'none';
        };

        if (lpSomenteLeitura && lpEditorState.id) {
            setVis('btnLPSalvar', false);
            setVis('btnLPInformarNP', false);
            setVis('btnLPCorrigirNP', false);
            setVis('btnLPCancelar', false);
            setVis('btnLPInativar', false);
            setVis('btnLPExcluir', false);
            setVis('btnLPGerarPdf', idsPdf.length && tem('liquidacao_gerar_pdf'));
            if (hint) hint.textContent = 'Modo somente leitura.';
            aplicarEstadoCamposEditorLeitura();
            return;
        }

        var podeEditar = lpPodeEditarLote(lpEditorState.estado) && tem('liquidacao_editar');
        var btnSalvar = qs('btnLPSalvar');
        var btnNp = qs('btnLPInformarNP');
        var btnCorr = qs('btnLPCorrigirNP');
        var btnCanc = qs('btnLPCancelar');
        var btnPdf = qs('btnLPGerarPdf');
        if (btnSalvar) { btnSalvar.style.display = ''; btnSalvar.disabled = !podeEditar; }
        if (btnNp) btnNp.style.display = (!fechado && !cancelado && tem('liquidacao_fechar_np')) ? '' : 'none';
        if (btnCorr) btnCorr.style.display = (fechado && !cancelado && tem('liquidacao_fechar_np')) ? '' : 'none';
        if (btnCanc) btnCanc.style.display = (!cancelado && lpEditorState.id && tem('liquidacao_cancelar')) ? '' : 'none';
        if (btnPdf) {
            btnPdf.style.display = '';
            btnPdf.disabled = !idsPdf.length || !tem('liquidacao_gerar_pdf');
        }
        setVis('btnLPInativar', lpEditorState.id && (tem('liquidacao_status') || ehAdmin()));
        setVis('btnLPExcluir', lpEditorState.id && cancelado && (tem('liquidacao_excluir') || ehAdmin()));
        if (hint) {
            if (!lpEditorState.id) hint.textContent = 'Salve o lote com ao menos um TC.';
            else if (!idsPdf.length) hint.textContent = 'Inclua TCs no lote para gerar DAuLiq ou informar NP.';
            else if (!fechado && !lpEditorState.np) hint.textContent = 'Informe NP após registro no SIAFI.';
            else hint.textContent = '';
        }
        aplicarEstadoCamposEditorLeitura();
    }

    // ===== LISTA =====
    function renderizarLista() {
        var tbody = qs('tbodyListaLP');
        if (!tbody) return;
        var filtrado = lpListaFiltrada();
        var totalPaginas = Math.ceil(filtrado.length / itensPorPaginaLP) || 1;
        if (paginaAtualLP > totalPaginas) paginaAtualLP = totalPaginas;
        if (paginaAtualLP < 1) paginaAtualLP = 1;
        var inicio = (paginaAtualLP - 1) * itensPorPaginaLP;
        var pagina = filtrado.slice(inicio, inicio + itensPorPaginaLP);

        var elDe = qs('mostrandoDeLP');
        var elTot = qs('mostrandoTotalLP');
        var elInfo = qs('infoPaginaLP');
        if (elDe) elDe.textContent = String(pagina.length);
        if (elTot) elTot.textContent = String(filtrado.length);
        if (elInfo) elInfo.textContent = 'Página ' + paginaAtualLP + ' de ' + totalPaginas;

        var btnAnt = qs('btnAnteriorLP');
        var btnProx = qs('btnProximoLP');
        var btnPrim = qs('btnPrimeiraLP');
        var btnUlt = qs('btnUltimaLP');
        if (btnAnt) btnAnt.disabled = paginaAtualLP <= 1;
        if (btnProx) btnProx.disabled = paginaAtualLP >= totalPaginas;
        if (btnPrim) btnPrim.disabled = paginaAtualLP <= 1;
        if (btnUlt) btnUlt.disabled = paginaAtualLP >= totalPaginas;

        atualizarIconesOrdenacaoLP();
        aplicarPermissoesBotoesLP();

        var idsExibidos = new Set(filtrado.map(function (p) { return p.id; }));
        lpSelecionados.forEach(function (id) {
            if (!idsExibidos.has(id)) lpSelecionados.delete(id);
        });

        if (!filtrado.length) {
            tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;padding:20px;color:#999;">Nenhum registro encontrado.</td></tr>';
            lpSelecionados.clear();
            atualizarUISelecaoLP();
            return;
        }

        var podePdfLista = tem('liquidacao_gerar_pdf') || ehAdmin();
        var podeEditarLista = podeOperarLPLista();

        tbody.innerHTML = pagina.map(function (lp) {
            var badgeInativo = lp.ativo === false ? ' <span class="badge-lp-cancelado" style="font-size:10px;">Inativa</span>' : '';
            var bruto = valorTotalBruto(idsTitulosParaPdfLP(lp));
            var nTcs = idsTitulosParaPdfLP(lp).length;
            var chk = lpSelecionados.has(lp.id) ? 'checked' : '';
            var editado = lp.editadoEm || lp.editado_em;
            var acoes = '';
            if (tem('liquidacao_ler')) {
                acoes += '<button type="button" class="btn-icon btn-lp-ver" data-id="' + lp.id + '" title="Visualizar">👁</button> ';
            }
            if (podeEditarLista) {
                acoes += '<button type="button" class="btn-icon btn-lp-editar" data-id="' + lp.id + '" title="Editar">✏️</button> ';
            }
            if (podePdfLista && nTcs > 0) {
                acoes += '<button type="button" class="btn-icon btn-lp-pdf" data-id="' + lp.id + '" title="DAuLiq">📄</button>';
            }
            return '<tr' + (lp.ativo === false ? ' style="opacity:0.72;"' : '') + '>' +
                '<td><input type="checkbox" class="check-lp-row" data-id="' + lp.id + '" ' + chk + '></td>' +
                '<td><strong>' + lp.codigo + '</strong>' + (lp.ativo === false ? badgeInativo : '') + '</td>' +
                '<td>' + badgeEstado(lp.estado) + '</td>' +
                '<td style="font-size:12.5px;">' + ((lp.fornecedor && lp.fornecedor.nome) || '—') + '</td>' +
                '<td style="text-align:right;">' + moeda(bruto) + '</td>' +
                '<td style="text-align:center;">' + nTcs + '</td>' +
                '<td>' + fmtData(lp.dataLiquidacao) + '</td>' +
                '<td style="font-size:12px;white-space:nowrap;">' + fmtDataHora(editado) + '</td>' +
                '<td style="font-size:11.5px;font-family:monospace;white-space:nowrap;">' + (lp.np || '—') + '</td>' +
                '<td style="white-space:nowrap;">' + acoes + '</td>' +
                '</tr>';
        }).join('');

        tbody.querySelectorAll('.check-lp-row').forEach(function (cb) {
            cb.addEventListener('change', function () {
                var id = cb.getAttribute('data-id');
                if (cb.checked) lpSelecionados.add(id);
                else lpSelecionados.delete(id);
                sincronizarCheckTodosLP();
                atualizarUISelecaoLP();
            });
        });
        tbody.querySelectorAll('.btn-lp-ver').forEach(function (btn) {
            btn.addEventListener('click', function () { abrirEditarLP(btn.dataset.id, { somenteLeitura: true }); });
        });
        tbody.querySelectorAll('.btn-lp-editar').forEach(function (btn) {
            btn.addEventListener('click', function () { abrirEditarLP(btn.dataset.id, { somenteLeitura: false }); });
        });
        tbody.querySelectorAll('.btn-lp-pdf').forEach(function (btn) {
            btn.addEventListener('click', function () { gerarDauliqDaLista(btn.dataset.id); });
        });

        var chkTodos = qs('checkTodosLP');
        if (chkTodos) {
            chkTodos.onchange = function () {
                var marcado = chkTodos.checked;
                pagina.forEach(function (lp) {
                    if (marcado) lpSelecionados.add(lp.id);
                    else lpSelecionados.delete(lp.id);
                });
                tbody.querySelectorAll('.check-lp-row').forEach(function (cb) { cb.checked = marcado; });
                atualizarUISelecaoLP();
            };
        }
        sincronizarCheckTodosLP();
        atualizarUISelecaoLP();
    }

    // ===== EDITOR =====
    function abrirNovaLP() {
        if (!tem('liquidacao_inserir')) {
            alert('Sem permissão para criar liquidação.');
            return;
        }
        lpSomenteLeitura = false;
        var email = (auth.currentUser && auth.currentUser.email) || 'usuário';
        lpEditorState = {
            id: null, codigo: proximoCodigo(), estado: 'rascunho',
            fornecedor: null, tcsIds: [], orcamento: [], np: '', dataLiquidacao: '',
            historico: [{ data: new Date().toISOString(), tipo: 'criação', usuario: email, detalhe: 'Nova LP iniciada.' }],
        };
        mostrarEditor();
    }

    function abrirEditarLP(lpId, opts) {
        lpSomenteLeitura = !!(opts && opts.somenteLeitura);
        var lp = lpLista.find(function (l) { return l.id === lpId; });
        if (!lp) return;
        lpEditorState = JSON.parse(JSON.stringify(lp));
        lpEditorState.orcamento = gerarOrcamentoParaIds(lpEditorState.tcsIds, lp.orcamento || []);
        mostrarEditor();
    }

    function mostrarEditor() {
        lpAbaAtiva = 'A';
        qs('tela-lista-lp').style.display  = 'none';
        qs('tela-editor-lp').style.display = 'block';
        qs('tituloEditorLP').textContent   = lpEditorState.codigo;
        qs('lpBadgeEstado').innerHTML      = badgeEstado(lpEditorState.estado);
        atualizarMetaEditor();
        ativarAba('A');
        renderizarAbaAtiva();
        atualizarKPIs();
        atualizarBadgesAbas();
        atualizarBotoesEditor();
    }

    function atualizarMetaEditor() {
        var el = qs('resumoEditorLP');
        if (!el) return;
        el.textContent = lpEditorState.fornecedor
            ? 'Fornecedor: ' + lpEditorState.fornecedor.nome + ' (' + lpEditorState.fornecedor.cnpj + ')'
            : 'Fornecedor não selecionado';
    }

    function fecharEditor() {
        lpSomenteLeitura = false;
        qs('tela-editor-lp').style.display = 'none';
        qs('tela-lista-lp').style.display  = 'block';
        renderizarLista();
    }

    async function salvarLP() {
        if (!lpEditorState) return;
        if (!tem('liquidacao_editar') || !lpPodeEditarLote(lpEditorState.estado)) {
            alert('Não é possível salvar este lote no estado atual ou sem permissão.');
            return;
        }
        sincronizarCamposEditorAbaB();
        mostrarLoading();
        try {
            var email = (auth.currentUser && auth.currentUser.email) || 'usuário';
            var agora = new Date().toISOString();
            var hist  = JSON.parse(JSON.stringify(lpEditorState.historico || []));
            hist.push({ data: agora, tipo: 'edição', usuario: email,
                detalhe: 'LP salva. TCs: ' + lpEditorState.tcsIds.length + '. Estado: ' + lpEditorState.estado + '.' });

            var payload = {
                estado:         lpEditorState.estado,
                fornecedor:     lpEditorState.fornecedor || null,
                tcsIds:         lpEditorState.tcsIds,
                orcamento:      lpEditorState.orcamento,
                np:             lpEditorState.np || '',
                dataLiquidacao: lpEditorState.dataLiquidacao || '',
                historico:      hist,
                editadoEm:      firebase.firestore.FieldValue.serverTimestamp(),
                editadoPor:     email,
            };

            if (lpEditorState.id) {
                var lpId = lpEditorState.id;
                var snapAnt = await db.collection('liquidacoes').doc(lpId).get();
                var antigos = new Set((snapAnt.data() && snapAnt.data().tcsIds) || []);
                var novos = new Set(lpEditorState.tcsIds || []);
                var batchEdit = db.batch();
                antigos.forEach(function (tid) {
                    if (!novos.has(tid)) {
                        batchEdit.update(db.collection('titulos').doc(tid), {
                            liquidacaoId: firebase.firestore.FieldValue.delete(),
                            liquidacaoCodigo: firebase.firestore.FieldValue.delete(),
                            editado_em: firebase.firestore.FieldValue.serverTimestamp(),
                        });
                    }
                });
                novos.forEach(function (tid) {
                    batchEdit.update(db.collection('titulos').doc(tid), {
                        liquidacaoId: lpId,
                        liquidacaoCodigo: lpEditorState.codigo,
                        editado_em: firebase.firestore.FieldValue.serverTimestamp(),
                    });
                });
                batchEdit.update(db.collection('liquidacoes').doc(lpId), payload);
                await batchEdit.commit();
            } else {
                var ano        = new Date().getFullYear();
                var counterRef = db.collection('contadores').doc('liquidacao_' + ano);
                var lpRef      = db.collection('liquidacoes').doc();
                var novoId     = lpRef.id;
                var novoCodigo;

                await db.runTransaction(async function (tx) {
                    var counterDoc = await tx.get(counterRef);
                    var seq = (counterDoc.exists ? (counterDoc.data().seq || 0) : 0) + 1;
                    novoCodigo = 'LP-' + String(seq).padStart(5, '0') + '/' + ano;
                    tx.set(counterRef, { seq: seq, editado_em: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
                    tx.set(lpRef, Object.assign({}, payload, {
                        codigo:    novoCodigo,
                        criadoEm:  firebase.firestore.FieldValue.serverTimestamp(),
                        criadoPor: email,
                    }));
                });

                if (lpEditorState.tcsIds.length) {
                    var batch = db.batch();
                    lpEditorState.tcsIds.forEach(function (tid) {
                        batch.update(db.collection('titulos').doc(tid), {
                            liquidacaoId:     novoId,
                            liquidacaoCodigo: novoCodigo,
                            editado_em:       firebase.firestore.FieldValue.serverTimestamp(),
                        });
                    });
                    await batch.commit();
                }

                lpEditorState.id     = novoId;
                lpEditorState.codigo = novoCodigo;
                qs('tituloEditorLP').textContent = novoCodigo;
            }

            lpEditorState.historico = hist;
            await propagarLFParaTitulos(lpEditorState);
            atualizarKPIs();
            atualizarBadgesAbas();
            if (lpAbaAtiva === 'E') renderizarAbaE();
            else if (lpAbaAtiva === 'F') renderizarAbaF();
        } catch (err) {
            alert('Erro ao salvar LP: ' + (err.message || err));
        } finally {
            esconderLoading();
        }
    }

    // Propaga lf/pf do orçamento da LP de volta para empenhosVinculados de cada TC,
    // recalculando o status do TC com base na completude de LF/PF (só para TCs já Liquidados+).
    async function propagarLFParaTitulos(lpState) {
        if (!lpState || !lpState.tcsIds || !lpState.tcsIds.length) return;
        var STATUS_POS_NP = ['Liquidado', 'Aguardando Financeiro', 'Para Pagamento', 'Para Pagamento parcial'];
        var batch = db.batch();
        var operacoes = 0;

        for (var i = 0; i < lpState.tcsIds.length; i++) {
            var tcId = lpState.tcsIds[i];
            var orcTC = (lpState.orcamento || []).filter(function (o) { return o.tcId === tcId; });
            var neMap = {};
            orcTC.forEach(function (o) {
                neMap[o.ne] = { lf: o.lf || '', pf: o.pf || '' };
            });

            var snap = await db.collection('titulos').doc(tcId).get();
            if (!snap.exists) continue;
            var tc = snap.data();
            if (!STATUS_POS_NP.includes(tc.status)) continue;

            var novosEmps = (tc.empenhosVinculados || []).map(function (e) {
                var m = neMap[e.numEmpenho];
                return m ? Object.assign({}, e, { lf: m.lf, pf: m.pf }) : e;
            });

            var allLF = novosEmps.every(function (e) { return (e.lf || '').trim(); });
            var allPF = novosEmps.every(function (e) { return (e.pf || '').trim(); });
            var anyPF = novosEmps.some(function (e)  { return (e.pf || '').trim(); });
            var novoStatus = tc.status;
            if (allLF && allPF)      novoStatus = 'Para Pagamento';
            else if (allLF && anyPF) novoStatus = 'Para Pagamento parcial';
            else if (allLF)          novoStatus = 'Aguardando Financeiro';
            else                     novoStatus = 'Liquidado';

            var payload = {
                empenhosVinculados: novosEmps,
                editado_em: firebase.firestore.FieldValue.serverTimestamp()
            };
            if (novoStatus !== tc.status) {
                var emailSync = (auth.currentUser && auth.currentUser.email) || 'sistema';
                var hist = (tc.historicoStatus || []).slice();
                hist.push({ status: novoStatus, data: new Date().toISOString(), usuario: emailSync, origem: 'LP' });
                payload.status = novoStatus;
                payload.historicoStatus = hist;
            }
            batch.update(db.collection('titulos').doc(tcId), payload);
            operacoes++;
        }

        if (operacoes > 0) await batch.commit();
    }

    function sincronizarCamposEditorAbaB() {
        document.querySelectorAll('#lpOrcamentoContainer tr[data-tcid]').forEach(function (tr) {
            var entry = lpEditorState.orcamento.find(function (o) {
                return o.tcId === tr.dataset.tcid && o.ne === tr.dataset.ne;
            });
            if (!entry) return;
            var iV = tr.querySelector('.inp-vinc'); if (iV) entry.vinc = iV.value;
            var iL = tr.querySelector('.inp-lf');   if (iL) entry.lf   = iL.value;
            var iP = tr.querySelector('.inp-pf');   if (iP) entry.pf   = iP.value;
        });
    }

    // ===== ABAS =====
    function ativarAba(aba) {
        lpAbaAtiva = aba;
        document.querySelectorAll('.lp-tab-btn[data-aba]').forEach(function (btn) {
            var isAtiva = btn.dataset.aba === aba;
            btn.classList.toggle('ativa', isAtiva);
            btn.setAttribute('aria-selected', isAtiva ? 'true' : 'false');
        });
        document.querySelectorAll('.lp-painel').forEach(function (p) {
            p.classList.toggle('ativa', p.id === 'lpPainel' + aba);
        });
    }

    function renderizarAbaAtiva() {
        if (!lpEditorState) return;
        var fns = { A: renderizarAbaA, B: renderizarAbaB, C: renderizarAbaC, D: renderizarAbaD, E: renderizarAbaE, F: renderizarAbaF };
        if (fns[lpAbaAtiva]) fns[lpAbaAtiva]();
    }

    function abrirAba(aba) {
        ativarAba(aba);
        renderizarAbaAtiva();
    }

    // ===== ABA A: DADOS BÁSICOS =====
    function renderizarAbaA() {
        if (!lpEditorState) return;
        var temForn = !!lpEditorState.fornecedor;
        var busca   = qs('lpFornecedorBusca');
        var chip    = qs('lpFornecedorChip');
        if (temForn) {
            if (busca) busca.classList.remove('visivel');
            if (chip)  chip.style.display = 'block';
            var texto = qs('lpChipTexto');
            if (texto) texto.textContent = lpEditorState.fornecedor.nome + ' — CNPJ: ' + lpEditorState.fornecedor.cnpj;
        } else {
            if (busca) busca.classList.add('visivel');
            if (chip)  chip.style.display = 'none';
        }
        qs('lpHintSemFornecedor').style.display = temForn ? 'none' : 'block';
        qs('lpBlocoTcs').style.display          = temForn ? 'block' : 'none';
        if (temForn) renderizarGridTCs();
    }

    function renderizarGridTCs() {
        var tbody = qs('tbodyTCsLote');
        var vazio = qs('lpLoteVazio');
        var ids   = lpEditorState.tcsIds;
        var tcs   = getTCsPorIds(ids);
        if (!tcs.length) {
            tbody.innerHTML = '';
            vazio.style.display = 'block';
            qs('totalTCsLote').textContent = moeda(0);
        } else {
            vazio.style.display = 'none';
            tbody.innerHTML = tcs.map(function (tc) {
                return '<tr>' +
                    '<td><input type="checkbox" class="check-tc-lote" data-id="' + tc.id + '" aria-label="Selecionar ' + tc.proc + '"></td>' +
                    '<td>' + tc.proc + '</td>' +
                    '<td style="font-size:11.5px;font-family:monospace;">' + tc.cnpj + '</td>' +
                    '<td>' + fmtData(tc.emissao) + '</td>' +
                    '<td><strong>' + tc.doc + '</strong></td>' +
                    '<td style="text-align:right;">' + moeda(tc.valor) + '</td>' +
                    '</tr>';
            }).join('');
            qs('totalTCsLote').textContent = moeda(valorTotalBruto(ids));
            tbody.querySelectorAll('.check-tc-lote').forEach(function (cb) {
                cb.addEventListener('change', atualizarBotaoRemover);
            });
        }
        var checkTodos = qs('checkTodosTCs');
        if (checkTodos) {
            checkTodos.checked = false;
            checkTodos.onchange = function () {
                tbody.querySelectorAll('.check-tc-lote').forEach(function (cb) { cb.checked = checkTodos.checked; });
                atualizarBotaoRemover();
            };
        }
        atualizarBotaoRemover();
    }

    function atualizarBotaoRemover() {
        var algum = !!document.querySelector('.check-tc-lote:checked');
        var btn   = qs('btnLPRemoverTC');
        if (btn) btn.disabled = !algum;
    }

    function inicializarAutocompleteFornecedor() {
        var input = qs('lpBuscaFornecedor');
        var lista = qs('lpListaFornecedores');
        if (!input || !lista) return;
        input.addEventListener('input', function () {
            var t = input.value.toLowerCase().trim();
            lista.innerHTML = '';
            if (!t) { lista.style.display = 'none'; return; }
            var matches = getFornecedoresUnicosLP().filter(function (f) {
                return f.cnpj.includes(t) || f.nome.toLowerCase().includes(t);
            });
            if (!matches.length) { lista.style.display = 'none'; return; }
            matches.forEach(function (f) {
                var li = document.createElement('li');
                li.setAttribute('role', 'option');
                li.textContent = f.nome + ' — ' + f.cnpj;
                li.addEventListener('click', function () { selecionarFornecedor(f); });
                lista.appendChild(li);
            });
            lista.style.display = 'block';
        });
        document.addEventListener('click', function (e) {
            if (!input.contains(e.target) && !lista.contains(e.target)) lista.style.display = 'none';
        });
    }

    function selecionarFornecedor(f) {
        lpEditorState.fornecedor = { cnpj: f.cnpj, nome: f.nome };
        var lista = qs('lpListaFornecedores');
        var input = qs('lpBuscaFornecedor');
        if (lista) lista.style.display = 'none';
        if (input) input.value = '';
        renderizarAbaA();
        atualizarKPIs();
        atualizarMetaEditor();
    }

    function trocarFornecedor() {
        if (lpEditorState.tcsIds.length > 0 && !confirm('Ao trocar o fornecedor os TCs do lote serão removidos. Confirma?')) return;
        lpEditorState.fornecedor = null;
        lpEditorState.tcsIds     = [];
        lpEditorState.orcamento  = [];
        renderizarAbaA();
        atualizarKPIs();
        atualizarBadgesAbas();
        atualizarMetaEditor();
    }

    function removerTCsSelecionados() {
        var selecionados = Array.from(document.querySelectorAll('.check-tc-lote:checked')).map(function (cb) { return cb.dataset.id; });
        if (!selecionados.length) return;
        lpEditorState.tcsIds    = lpEditorState.tcsIds.filter(function (id) { return !selecionados.includes(id); });
        lpEditorState.orcamento = lpEditorState.orcamento.filter(function (o) { return !selecionados.includes(o.tcId); });
        renderizarGridTCs();
        atualizarKPIs();
        atualizarBadgesAbas();
    }

    // ===== MODAL: ADICIONAR TC =====
    function abrirModalAdicionarTC() {
        if (!lpEditorState || !lpEditorState.fornecedor) return;
        var cnpj         = lpEditorState.fornecedor.cnpj;
        var idsNaLP      = new Set(lpEditorState.tcsIds);
        var idsOutrasLP  = new Set();
        lpLista.forEach(function (lp) {
            if (lp.id !== lpEditorState.id) (lp.tcsIds || []).forEach(function (id) { idsOutrasLP.add(id); });
        });
        _poolDisponivel = baseTitulosLP.filter(function (tc) {
            var cnpjTc = tc.fornecedorCnpj || tc.cnpj || '';
            return cnpjTc === cnpj &&
                   tc.status === 'Em Liquidação' &&
                   !String(tc.np || '').trim() &&
                   !tc.liquidacaoId &&
                   !idsNaLP.has(tc.id) &&
                   !idsOutrasLP.has(tc.id);
        }).map(normalizarTCParaUI);
        tcsSelecionadosModal = new Set();
        renderizarTCsDisponiveis('');
        var modal    = qs('modalLPAdicionarTC');
        var busca    = qs('lpBuscaTCModal');
        var checkAll = qs('checkTodosTCsModal');
        if (busca)    busca.value = '';
        if (checkAll) { checkAll.checked = false; checkAll.onchange = toggleTodosModal; }
        if (modal)    modal.style.display = 'flex';
        if (busca)    busca.focus();
    }

    function toggleTodosModal() {
        var marcado = qs('checkTodosTCsModal') && qs('checkTodosTCsModal').checked;
        document.querySelectorAll('.check-tc-disp').forEach(function (cb) {
            cb.checked = marcado;
            if (marcado) tcsSelecionadosModal.add(cb.dataset.id);
            else         tcsSelecionadosModal.delete(cb.dataset.id);
        });
        atualizarContadorModalTC();
    }

    function renderizarTCsDisponiveis(termo) {
        var tbody = qs('tbodyTCsDisponiveis');
        var vazio = qs('lpModalTCsVazio');
        var t     = String(termo || '').toLowerCase();
        var pool  = _poolDisponivel.filter(function (tc) {
            return !t || tc.proc.toLowerCase().includes(t) || tc.doc.toLowerCase().includes(t);
        });
        if (!pool.length) {
            tbody.innerHTML = '';
            vazio.style.display = 'block';
        } else {
            vazio.style.display = 'none';
            tbody.innerHTML = pool.map(function (tc) {
                var checked = tcsSelecionadosModal.has(tc.id) ? 'checked' : '';
                return '<tr>' +
                    '<td><input type="checkbox" class="check-tc-disp" data-id="' + tc.id + '" ' + checked + ' aria-label="Selecionar ' + tc.proc + '"></td>' +
                    '<td>' + tc.proc + '</td>' +
                    '<td><strong>' + tc.doc + '</strong></td>' +
                    '<td>' + fmtData(tc.emissao) + '</td>' +
                    '<td>' + fmtData(tc.ateste) + '</td>' +
                    '<td style="text-align:right;">' + moeda(tc.valor) + '</td>' +
                    '</tr>';
            }).join('');
            tbody.querySelectorAll('.check-tc-disp').forEach(function (cb) {
                cb.addEventListener('change', function () {
                    if (cb.checked) tcsSelecionadosModal.add(cb.dataset.id);
                    else            tcsSelecionadosModal.delete(cb.dataset.id);
                    atualizarContadorModalTC();
                });
            });
        }
        atualizarContadorModalTC();
    }

    function atualizarContadorModalTC() {
        var n    = tcsSelecionadosModal.size;
        var span = qs('lpContadorTCsSelecionados');
        var btn  = qs('btnModalTCConfirmar');
        if (span) span.textContent = n === 0 ? 'Nenhum TC selecionado' : n + ' TC' + (n > 1 ? 's' : '') + ' selecionado' + (n > 1 ? 's' : '');
        if (btn)  btn.disabled = n === 0;
    }

    function confirmarAdicionarTCs() {
        var novosIds = Array.from(tcsSelecionadosModal);
        lpEditorState.tcsIds    = lpEditorState.tcsIds.concat(novosIds);
        lpEditorState.orcamento = gerarOrcamentoParaIds(lpEditorState.tcsIds, lpEditorState.orcamento);
        fecharModalTC();
        renderizarGridTCs();
        atualizarKPIs();
        atualizarBadgesAbas();
    }

    function fecharModalTC() {
        var modal = qs('modalLPAdicionarTC');
        if (modal) modal.style.display = 'none';
        tcsSelecionadosModal = new Set();
    }

    // ===== ABA B: ORÇAMENTO =====
    function renderizarAbaB() {
        if (!lpEditorState) return;
        var ids       = lpEditorState.tcsIds;
        var container = qs('lpOrcamentoContainer');
        var vazio     = qs('lpOrcamentoVazio');
        var metaEl    = qs('lpOrcamentoMeta');
        var toolbar = qs('lpOrcamentoToolbar');
        if (!ids.length) {
            if (container) container.innerHTML = '';
            if (vazio)     vazio.style.display = 'block';
            if (metaEl)    metaEl.innerHTML    = '';
            if (toolbar)   toolbar.style.display = 'none';
            return;
        }
        if (vazio)   vazio.style.display   = 'none';
        if (toolbar) toolbar.style.display = 'flex';
        var hoje   = new Date().toISOString().slice(0, 10);
        var ateste = atesteMinimo(ids);
        var venc   = ateste ? addDias(ateste, 30) : null;
        if (metaEl) metaEl.innerHTML =
            '<span><strong>Data venc. (ref. deduções):</strong> ' + fmtData(venc) + '</span>' +
            '<span><strong>Data pagamento (ref.):</strong> ' + fmtData(hoje) + '</span>';

        // Agrupar por ND preservando ordem de aparição
        var grupos = [];
        var ndIndex = {};
        lpEditorState.orcamento.forEach(function (o) {
            if (ndIndex[o.nd] === undefined) {
                ndIndex[o.nd] = grupos.length;
                grupos.push({ nd: o.nd, linhas: [] });
            }
            grupos[ndIndex[o.nd]].linhas.push(o);
        });

        function cabecalhoTabela() {
            return '<thead><tr>' +
                '<th>Nota de Empenho</th>' +
                '<th>ND</th>' +
                '<th>Sub</th>' +
                '<th>FR</th>' +
                '<th>VINC <span class="lp-editavel-hint" title="Campo edit\u00e1vel">\u270f</span></th>' +
                '<th style="text-align:right;">Valor Usado</th>' +
                '<th>C. de Custos</th>' +
                '<th>UG Benef.</th>' +
                '<th>LF <span class="lp-editavel-hint" title="Campo edit\u00e1vel">\u270f</span></th>' +
                '<th>PF <span class="lp-editavel-hint" title="Campo edit\u00e1vel">\u270f</span></th>' +
                '</tr></thead>';
        }

        var totalGeral = 0;
        var html = grupos.map(function (g) {
            var subTotal = g.linhas.reduce(function (s, o) { return s + o.valor; }, 0);
            totalGeral += subTotal;
            var linhasHtml = g.linhas.map(function (o) {
                return '<tr data-tcid="' + o.tcId + '" data-ne="' + o.ne + '">' +
                    '<td style="font-family:monospace;font-size:11.5px;white-space:nowrap;">' + o.ne + '</td>' +
                    '<td>' + o.nd + '</td>' +
                    '<td style="text-align:center;">' + o.sub + '</td>' +
                    '<td style="font-size:11.5px;">' + o.fr + '</td>' +
                    '<td class="lp-cell-edit"><input type="text" class="inp-vinc" value="' + o.vinc + '" placeholder="\u2014" title="VINC" aria-label="VINC para ' + o.ne + '"></td>' +
                    '<td style="text-align:right;">' + moeda(o.valor) + '</td>' +
                    '<td>' + o.cc + '</td>' +
                    '<td style="text-align:center;">' + o.ug + '</td>' +
                    '<td class="lp-cell-edit"><input type="text" class="inp-lf" value="' + o.lf + '" placeholder="Ex.: 2026LF000123 ou 123" title="LF \u2014 formato completo (2026LF123456) ou apenas a sequ\u00eancia (123456)" aria-label="LF para ' + o.ne + '"></td>' +
                    '<td class="lp-cell-edit"><input type="text" class="inp-pf" value="' + o.pf + '" placeholder="\u2014" title="PF \u2014 preenchido automaticamente pela LF" aria-label="PF para ' + o.ne + '"></td>' +
                    '</tr>';
            }).join('');
            return '<div class="lp-nd-bloco">' +
                '<div class="lp-nd-bloco-titulo">ND: ' + g.nd + '</div>' +
                '<div class="lp-table-wrapper">' +
                '<table class="tabela-gov">' +
                cabecalhoTabela() +
                '<tbody class="lp-orc-tbody">' + linhasHtml + '</tbody>' +
                '<tfoot><tr class="lp-tfoot-total">' +
                '<td colspan="5" style="text-align:right;font-weight:600;font-size:12.5px;">Subtotal ND ' + g.nd + ':</td>' +
                '<td style="text-align:right;font-weight:700;">' + moeda(subTotal) + '</td>' +
                '<td colspan="4"></td>' +
                '</tr></tfoot>' +
                '</table></div></div>';
        }).join('');

        // Bloco de total geral
        html += '<div class="lp-nd-total-geral">' +
            '<span>Valor total NE (consolidado):</span>' +
            '<span id="totalNEs" style="font-weight:700;">' + moeda(totalGeral) + '</span>' +
            '</div>';

        if (container) {
            container.innerHTML = html;

            // Blur genérico para VINC e PF
            container.querySelectorAll('.inp-vinc, .inp-pf').forEach(function (inp) {
                inp.addEventListener('blur', sincronizarCamposEditorAbaB);
            });

            // Blur especializado para LF: normaliza, busca PF e VINC automaticamente na coleção LFxPF
            container.querySelectorAll('.inp-lf').forEach(function (inp) {
                inp.addEventListener('blur', function () {
                    var norm = normalizarLF(inp.value);
                    if (norm !== inp.value) inp.value = norm;
                    if (norm) {
                        var reg = buscarPFporLF(norm);
                        if (reg) {
                            var tr        = inp.closest('tr');
                            var pfInput   = tr ? tr.querySelector('.inp-pf')   : null;
                            var vincInput = tr ? tr.querySelector('.inp-vinc') : null;
                            if (pfInput && !pfInput.value && reg.pf) {
                                pfInput.value = reg.pf;
                                pfInput.classList.add('lp-pf-autopreenchido');
                                setTimeout(function () { pfInput.classList.remove('lp-pf-autopreenchido'); }, 2500);
                            }
                            if (vincInput && !vincInput.value && reg.vinculacao) {
                                vincInput.value = reg.vinculacao;
                                vincInput.classList.add('lp-pf-autopreenchido');
                                setTimeout(function () { vincInput.classList.remove('lp-pf-autopreenchido'); }, 2500);
                            }
                        }
                    }
                    sincronizarCamposEditorAbaB();
                });
            });
        }
    }

    // ===== ABA C: IMPOSTOS =====
    function renderizarAbaC() {
        if (!lpEditorState) return;
        var ids    = lpEditorState.tcsIds;
        var metaEl = qs('lpImpostosMeta');
        var vazioG = qs('lpImpostosVazioGeral');
        var totalG = qs('lpImpostosTotalGeral');

        if (!ids.length) {
            ['tbodyINSS','tbodyISS','tbodyImpostos'].forEach(function(id){ var el=qs(id); if(el) el.innerHTML=''; });
            ['totalINSS','totalISS','totalDarf','totalImpostosGeral'].forEach(function(id){ var el=qs(id); if(el) el.textContent=moeda(0); });
            ['lpSecaoINSS','lpSecaoISS','lpSecaoDARF'].forEach(function(id){ var el=qs(id); if(el) el.style.display='none'; });
            if (vazioG) vazioG.style.display = 'block';
            if (totalG) totalG.style.display = 'none';
            if (metaEl) metaEl.innerHTML = '';
            return;
        }

        if (vazioG) vazioG.style.display = 'none';
        if (totalG) totalG.style.display = 'flex';

        var hoje   = new Date().toISOString().slice(0, 10);
        var ateste = atesteMinimo(ids);
        var venc   = ateste ? addDias(ateste, 30) : null;
        if (metaEl) metaEl.innerHTML =
            '<span><strong>Data vencimento (bloco):</strong> ' + fmtData(venc) + '</span>' +
            '<span><strong>Data pagamento (ref.):</strong> ' + fmtData(hoje) + '</span>';

        var tcs = getTCsPorIds(ids);

        // --- INSS (DDF021) ---
        var tbodyINSS  = qs('tbodyINSS');
        var secaoINSS  = qs('lpSecaoINSS');
        var totalINSSv = 0;
        var rowsINSS   = tcs.filter(function(tc){ return getDeducoesTipo(tc.id, 'DDF021').length > 0; });
        if (secaoINSS) secaoINSS.style.display = rowsINSS.length ? 'block' : 'none';
        if (rowsINSS.length && tbodyINSS) {
            tbodyINSS.innerHTML = rowsINSS.map(function(tc){
                return getDeducoesTipo(tc.id, 'DDF021').map(function(n){
                    totalINSSv += Number(n.valor) || 0;
                    return '<tr>' +
                        '<td>' + tc.proc + '</td>' +
                        '<td style="text-align:center;">' + (n.codReceita || '-') + '</td>' +
                        '<td style="text-align:right;">' + moeda(Number(n.base) || 0) + '</td>' +
                        '<td style="text-align:right;">' + (Number(n.aliq) || 0).toFixed(2) + '%</td>' +
                        '<td style="text-align:right;font-weight:600;color:#c0392b;">' + moeda(Number(n.valor) || 0) + '</td>' +
                        '<td>' + fmtData(n.dataEmissao || n.dataApuracao) + '</td>' +
                        '</tr>';
                }).join('');
            }).join('');
        }
        var elTotalINSS = qs('totalINSS');
        if (elTotalINSS) elTotalINSS.textContent = moeda(totalINSSv);

        // --- ISS (DDR001) ---
        var tbodyISS  = qs('tbodyISS');
        var secaoISS  = qs('lpSecaoISS');
        var totalISSv = 0;
        var rowsISS   = tcs.filter(function(tc){ return getDeducoesTipo(tc.id, 'DDR001').length > 0; });
        if (secaoISS) secaoISS.style.display = rowsISS.length ? 'block' : 'none';
        if (rowsISS.length && tbodyISS) {
            tbodyISS.innerHTML = rowsISS.map(function(tc){
                return getDeducoesTipo(tc.id, 'DDR001').map(function(i){
                    totalISSv += Number(i.valor) || 0;
                    return '<tr>' +
                        '<td>' + tc.proc + '</td>' +
                        '<td style="text-align:center;">' + (i.codReceita || '-') + '</td>' +
                        '<td style="text-align:right;">' + moeda(Number(i.base) || 0) + '</td>' +
                        '<td style="text-align:right;">' + (Number(i.aliq) || 0).toFixed(2) + '%</td>' +
                        '<td style="text-align:right;font-weight:600;color:#c0392b;">' + moeda(Number(i.valor) || 0) + '</td>' +
                        '<td>' + fmtData(i.dataApuracao || i.dataEmissao) + '</td>' +
                        '</tr>';
                }).join('');
            }).join('');
        }
        var elTotalISS = qs('totalISS');
        if (elTotalISS) elTotalISS.textContent = moeda(totalISSv);

        // --- DARF (DDF025) ---
        var tbody      = qs('tbodyImpostos');
        var secaoDARF  = qs('lpSecaoDARF');
        var totalDARFv = 0;
        var rowsDARF   = tcs.filter(function(tc){ return getDeducoesTipo(tc.id, 'DDF025').length > 0; });
        if (secaoDARF) secaoDARF.style.display = rowsDARF.length ? 'block' : 'none';
        if (rowsDARF.length && tbody) {
            tbody.innerHTML = rowsDARF.map(function(tc){
                return getDeducoesTipo(tc.id, 'DDF025').map(function(d){
                    var tot = Number(d.total || d.valor) || 0;
                    totalDARFv += tot;
                    return '<tr>' +
                        '<td>' + tc.proc + '</td>' +
                        '<td style="text-align:center;">' + (d.codReceita || '-') + '</td>' +
                        '<td style="text-align:center;">' + (d.natRed || '-') + '</td>' +
                        '<td style="text-align:right;">' + moeda(Number(d.base) || 0) + '</td>' +
                        '<td style="text-align:right;">' + (Number(d.aliq) || 0).toFixed(2) + '%</td>' +
                        '<td style="text-align:right;font-weight:600;color:#c0392b;">' + moeda(tot) + '</td>' +
                        '</tr>';
                }).join('');
            }).join('');
        }
        var elTotalDarf = qs('totalDarf');
        if (elTotalDarf) elTotalDarf.textContent = moeda(totalDARFv);

        // Total geral
        var elTotalG = qs('totalImpostosGeral');
        if (elTotalG) elTotalG.textContent = moeda(totalINSSv + totalISSv + totalDARFv);
    }

    // ===== ABA D: PAGAMENTO =====
    function renderizarAbaD() {
        if (!lpEditorState) return;
        var ids       = lpEditorState.tcsIds;
        var tbody     = qs('tbodyPagamento');
        var vazio     = qs('lpPagamentoVazio');
        var resumoBlk = qs('lpPagamentoResumo');
        if (!ids.length) {
            tbody.innerHTML = '';
            ['pgTotalBruto','pgTotalDeduc','pgTotalLiquido'].forEach(function (id) { qs(id).textContent = moeda(0); });
            vazio.style.display     = 'block';
            resumoBlk.style.display = 'none';
            return;
        }
        vazio.style.display     = 'none';
        resumoBlk.style.display = 'block';
        var totBruto = 0, totDeduc = 0;
        tbody.innerHTML = getTCsPorIds(ids).map(function (tc) {
            var bruto = tc.valor;
            var deduc = totalImpostosPorTC(tc.id);
            var liq   = bruto - deduc;
            totBruto += bruto; totDeduc += deduc;
            return '<tr>' +
                '<td>' + tc.proc + '</td>' +
                '<td><strong>' + tc.doc + '</strong></td>' +
                '<td style="text-align:right;">' + moeda(bruto) + '</td>' +
                '<td style="text-align:right;color:#c0392b;">' + moeda(deduc) + '</td>' +
                '<td style="text-align:right;font-weight:600;color:#1e8449;">' + moeda(liq) + '</td>' +
                '</tr>';
        }).join('');
        var totLiq = totBruto - totDeduc;
        qs('pgTotalBruto').textContent   = moeda(totBruto);
        qs('pgTotalDeduc').textContent   = moeda(totDeduc);
        qs('pgTotalLiquido').textContent = moeda(totLiq);
        var forn = lpEditorState.fornecedor;
        qs('lpRbCnpj').textContent    = forn ? forn.cnpj : '—';
        qs('lpRbNome').textContent    = forn ? forn.nome : '—';
        qs('lpRbBruto').textContent   = moeda(totBruto);
        qs('lpRbDeduc').textContent   = moeda(totDeduc);
        qs('lpRbLiquido').textContent = moeda(totLiq);
    }

    // ===== ABA E: DETA CUSTOS =====
    function renderizarAbaE() {
        if (!lpEditorState) return;
        var ids   = lpEditorState.tcsIds;
        var tbody = qs('tbodyDetaCustos');
        var vazio = qs('lpDetaCustosVazio');
        if (!ids.length) {
            if (tbody) tbody.innerHTML = '';
            var tt = qs('totalDetaCustos'); if (tt) tt.textContent = moeda(0);
            if (vazio) vazio.style.display = 'block';
            return;
        }
        if (vazio) vazio.style.display = 'none';

        // Agrupa NE × Sub × CC × UG, somando valores
        var grupos = [];
        var chaveMap = {};
        lpEditorState.orcamento.forEach(function (o) {
            var chave = o.ne + '|' + o.sub + '|' + o.cc + '|' + o.ug;
            if (chaveMap[chave] !== undefined) {
                grupos[chaveMap[chave]].valor += o.valor;
            } else {
                chaveMap[chave] = grupos.length;
                grupos.push({ ne: o.ne, sub: o.sub, cc: o.cc, ug: o.ug, valor: o.valor });
            }
        });

        var total = 0;
        if (tbody) tbody.innerHTML = grupos.map(function (g) {
            total += g.valor;
            return '<tr>' +
                '<td style="font-family:monospace;font-size:11.5px;white-space:nowrap;">' + g.ne + '</td>' +
                '<td style="text-align:center;">' + g.sub + '</td>' +
                '<td>' + g.cc + '</td>' +
                '<td style="text-align:center;">' + g.ug + '</td>' +
                '<td style="text-align:right;font-weight:600;">' + moeda(g.valor) + '</td>' +
                '</tr>';
        }).join('');
        var elTotal = qs('totalDetaCustos');
        if (elTotal) elTotal.textContent = moeda(total);
    }

    // ===== ABA F: HISTÓRICO =====
    function renderizarAbaF() {
        if (!lpEditorState) return;
        var tbody = qs('tbodyHistorico');
        var vazio = qs('lpHistoricoVazio');
        var hist  = (lpEditorState.historico || []).slice().reverse();
        if (!hist.length) { tbody.innerHTML = ''; vazio.style.display = 'block'; return; }
        vazio.style.display = 'none';
        var ics = { 'criação': '🆕', 'edição': '✏️', 'pdf': '📄', 'np': '🔢', 'cancelamento': '❌' };
        tbody.innerHTML = hist.map(function (h) {
            return '<tr>' +
                '<td style="white-space:nowrap;">' + fmtDataHora(h.data) + '</td>' +
                '<td>' + (ics[h.tipo] || '•') + ' ' + h.tipo + '</td>' +
                '<td style="font-size:12px;">' + h.usuario + '</td>' +
                '<td style="font-size:12px;">' + h.detalhe + '</td>' +
                '</tr>';
        }).join('');
    }

    // ===== KPIs =====
    function atualizarKPIs() {
        if (!lpEditorState) return;
        var ids    = lpEditorState.tcsIds;
        var bruto  = valorTotalBruto(ids);
        var impost = totalImpostos(ids);
        var liq    = bruto - impost;
        var ateste = atesteMinimo(ids);
        var venc   = ateste ? addDias(ateste, 30) : null;
        qs('lpKpiTcs').textContent     = ids.length;
        qs('lpKpiValor').textContent   = moeda(bruto);
        qs('lpKpiDarf').textContent    = moeda(impost);
        qs('lpKpiLiquido').textContent = moeda(liq);
        qs('lpKpiAteste').textContent  = fmtData(ateste);
        qs('lpKpiVenc').textContent    = fmtData(venc);
    }

    function atualizarBadgesAbas() {
        if (!lpEditorState) return;
        var ids    = lpEditorState.tcsIds;
        var bruto  = valorTotalBruto(ids);
        var impost = totalImpostos(ids);
        var liq    = bruto - impost;
        var bB = qs('lpBadgeAbaB'); if (bB) bB.textContent = ids.length ? moeda(bruto)  : '—';
        var bC = qs('lpBadgeAbaC'); if (bC) bC.textContent = ids.length ? moeda(impost) : '—';
        var bD = qs('lpBadgeAbaD'); if (bD) bD.textContent = ids.length ? moeda(liq)    : '—';
    }

    function pedirMotivoLP(tituloModal) {
        return new Promise(function (resolve) {
            var tit = qs('modalLPMotivoTitulo');
            var txt = qs('modalLPMotivoTexto');
            var modal = qs('modalLPMotivo');
            if (tit) tit.textContent = tituloModal || 'Motivo';
            if (txt) txt.value = '';
            if (modal) modal.style.display = 'flex';
            modalMotivoResolver = resolve;
        });
    }

    function fecharModalMotivoLP(ok) {
        var modal = qs('modalLPMotivo');
        var txt = qs('modalLPMotivoTexto');
        if (modal) modal.style.display = 'none';
        var valor = txt ? txt.value.trim() : '';
        if (modalMotivoResolver) {
            var fn = modalMotivoResolver;
            modalMotivoResolver = null;
            fn(ok ? valor : null);
        }
    }

    // ===== MODAL NP =====
    function abrirModalNP(correcao) {
        if (!lpEditorState) return;
        if (!tem('liquidacao_fechar_np')) {
            alert('Sem permissão para informar ou corrigir NP.');
            return;
        }
        modoCorrecaoNP = !!correcao;
        var modal = qs('modalLPNP');
        var npEl  = qs('modalLPnp');
        var dtEl  = qs('modalLPdataLiq');
        var grpMot = qs('grpModalLPmotivoNP');
        var motEl = qs('modalLPmotivoNP');
        var tit = qs('modalNPTitulo');
        if (tit) tit.textContent = correcao ? 'Corrigir NP / data' : 'Informar NP (SIAFI)';
        if (npEl) npEl.value = lpEditorState.np || '';
        if (dtEl) dtEl.value = lpEditorState.dataLiquidacao || '';
        if (grpMot) grpMot.style.display = correcao ? 'block' : 'none';
        if (motEl) motEl.value = '';
        if (modal) modal.style.display = 'flex';
    }

    function fecharModalNP() {
        var modal = qs('modalLPNP');
        if (modal) modal.style.display = 'none';
        modoCorrecaoNP = false;
    }

    async function confirmarNP() {
        if (!lpEditorState || !window.LiquidacaoNp) {
            alert('Módulo de NP indisponível.');
            return;
        }
        if (!tem('liquidacao_fechar_np')) {
            alert('Sem permissão para fechar NP.');
            return;
        }
        var npEl = qs('modalLPnp');
        var dtEl = qs('modalLPdataLiq');
        var motEl = qs('modalLPmotivoNP');
        var np   = npEl ? npEl.value.trim() : '';
        var dt   = dtEl ? dtEl.value : '';
        var motivo = motEl ? motEl.value.trim() : '';
        if (!np) { alert('Informe o número da NP.'); return; }
        if (!dt) { alert('Informe a data de liquidação.'); return; }
        if (modoCorrecaoNP && !motivo) { alert('Informe o motivo da correção.'); return; }

        var ids = (lpEditorState.tcsIds || []).slice();
        if (!ids.length) { alert('Sem TCs no lote.'); return; }

        if (modoCorrecaoNP && await window.LiquidacaoNp.algumTituloComOP(ids)) {
            alert('Não é possível corrigir NP: existe TC com OP informada.');
            return;
        }

        if (!lpEditorState.id) {
            alert('Salve a liquidação antes de informar a NP.');
            return;
        }

        mostrarLoading();
        try {
            var hist = await window.LiquidacaoNp.executarFecharNP({
                lpId: lpEditorState.id,
                tcsIds: ids,
                np: np,
                dataLiq: dt,
                correcao: modoCorrecaoNP,
                motivoCorrecao: motivo,
                npAntiga: lpEditorState.np || '',
                historicoAtual: lpEditorState.historico || [],
                codigoLp: lpEditorState.codigo,
            });
            lpEditorState.np = np;
            lpEditorState.dataLiquidacao = dt;
            lpEditorState.estado = 'fechado';
            lpEditorState.historico = hist;
            fecharModalNP();
            qs('lpBadgeEstado').innerHTML = badgeEstado('fechado');
            atualizarMetaEditor();
            atualizarBotoesEditor();
            alert(modoCorrecaoNP ? 'NP corrigida.' : 'Lote fechado com NP.');
        } catch (err) {
            alert('Erro ao fechar NP: ' + (err.message || err));
        } finally {
            esconderLoading();
        }
    }

    async function cancelarLPCompleto() {
        if (!lpEditorState || !lpEditorState.id || !window.LiquidacaoNp) return;
        if (!tem('liquidacao_cancelar')) {
            alert('Sem permissão para cancelar.');
            return;
        }
        if (lpEstadoCancelado(lpEditorState.estado)) return;
        if (!confirm('Cancelar esta liquidação? Os TCs voltam para "Em Liquidação" e vínculos/NP deste lote serão removidos quando aplicável.')) return;
        var motivo = await pedirMotivoLP('Motivo do cancelamento');
        if (!motivo) return;

        mostrarLoading();
        try {
            var lpId = lpEditorState.id;
            var ids = (lpEditorState.tcsIds || []).slice();
            var npVal = String(lpEditorState.np || '').trim();
            var email = (auth.currentUser && auth.currentUser.email) || 'usuário';
            var STATUS_EM_LIQ = window.LiquidacaoNp.STATUS_TC_EM_LIQUIDACAO;

            for (var i = 0; i < ids.length; i++) {
                var tid = ids[i];
                var tSnap = await db.collection('titulos').doc(tid).get();
                if (!tSnap.exists) continue;
                var td = tSnap.data() || {};
                if (String(td.liquidacaoId || '') !== lpId) continue;
                await db.collection('titulos').doc(tid).update({
                    liquidacaoId: firebase.firestore.FieldValue.delete(),
                    liquidacaoCodigo: firebase.firestore.FieldValue.delete(),
                    np: '',
                    dataLiquidacao: '',
                    status: STATUS_EM_LIQ,
                    editado_em: firebase.firestore.FieldValue.serverTimestamp(),
                });
                if (npVal) await window.LiquidacaoNp.desvincularTituloDaNP(tid, npVal);
                await window.LiquidacaoNp.pushHistoricoTitulo(tid, window.LiquidacaoNp.entradaHistoricoTC(
                    STATUS_EM_LIQ,
                    'Cancelamento da liquidação',
                    motivo + ' | LP: ' + (lpEditorState.codigo || lpId)
                ));
            }

            var hist = (lpEditorState.historico || []).slice();
            hist.push({
                data: new Date().toISOString(),
                tipo: 'cancelar',
                usuario: email,
                detalhe: 'Liquidação cancelada',
                motivo: motivo,
            });

            await db.collection('liquidacoes').doc(lpId).update({
                estado: 'cancelado',
                tcsIds: [],
                tcsParticiparamIds: ids,
                historico: hist,
                editadoEm: firebase.firestore.FieldValue.serverTimestamp(),
                editadoPor: email,
            });

            lpEditorState.estado = 'cancelado';
            lpEditorState.tcsIds = [];
            lpEditorState.historico = hist;
            qs('lpBadgeEstado').innerHTML = badgeEstado('cancelado');
            atualizarBotoesEditor();
            renderizarAbaAtiva();
            alert('Liquidação cancelada.');
        } catch (err) {
            alert('Erro ao cancelar: ' + (err.message || err));
        } finally {
            esconderLoading();
        }
    }

    function abrirModalPdfVariante() {
        if (!tem('liquidacao_gerar_pdf')) {
            alert('Sem permissão para gerar PDF.');
            return;
        }
        var modal = qs('modalLPVarianteDauliq');
        if (modal) modal.style.display = 'flex';
    }

    function fecharModalPdfVariante() {
        fecharModalDauliqVarianteRes(null);
    }

    async function gerarDauliqDaLista(lpId) {
        if (!tem('liquidacao_gerar_pdf') && !ehAdmin()) return;
        var variante = await pedirVariantePdfDauliq();
        if (variante == null) return;
        var incluirHistorico = variante === 'completo';
        mostrarLoading();
        try {
            var snap = await db.collection('liquidacoes').doc(lpId).get();
            if (!snap.exists) { alert('Liquidação não encontrada.'); return; }
            var lp0 = Object.assign({ id: snap.id }, snap.data());
            if (!lp0.orcamento || !lp0.orcamento.length) {
                lp0.orcamento = gerarOrcamentoParaIds(idsTitulosParaPdfLP(lp0), []);
            }
            var emailUsr = (auth.currentUser && auth.currentUser.email) || 'usuário';
            var meta = {
                geradoEm: new Date().toISOString(),
                usuario: emailUsr,
                nomeArquivoSugerido: 'DAuLiq_' + String(lp0.codigo || '').replace(/\//g, '-') + (incluirHistorico ? '' : '_sem-historico') + '.pdf',
                origem: 'lista',
                variantePdf: incluirHistorico ? 'completo' : 'sem_historico',
            };
            var histNovo = (lp0.historico || []).slice();
            histNovo.push({ data: new Date().toISOString(), tipo: 'pdf',
                usuario: emailUsr,
                detalhe: incluirHistorico ? 'DAuLiq gerado (lista, completo)' : 'DAuLiq gerado (lista, sem histórico no PDF)' });
            await db.collection('liquidacoes').doc(lpId).update({
                auditoriaPdf: meta,
                historico: histNovo,
                editadoEm: firebase.firestore.FieldValue.serverTimestamp(),
                editadoPor: emailUsr,
            });
            var lpMerged = Object.assign({}, lp0, { auditoriaPdf: meta, historico: histNovo });
            await gerarDAuLiq(incluirHistorico, lpMerged, { persistirFirestore: false });
        } catch (e) {
            alert('Erro ao gerar PDF: ' + (e.message || e));
        } finally {
            esconderLoading();
        }
    }

    async function gerarDauliqEmBloco(lpIds) {
        var LIMITE = 10;
        var ids = Array.isArray(lpIds) ? lpIds.filter(Boolean) : [];
        if (!ids.length) { alert('Nenhuma liquidação selecionada.'); return; }
        if (ids.length > LIMITE) {
            alert('Limite de ' + LIMITE + ' DAuLiq por impressão em bloco. Você selecionou ' + ids.length + '.');
            return;
        }
        if (!tem('liquidacao_gerar_pdf') && !ehAdmin()) {
            alert('Sem permissão para gerar PDF.');
            return;
        }
        if (!window.jspdf || !window.jspdf.jsPDF) { alert('Biblioteca jsPDF indisponível.'); return; }
        var variante = await pedirVariantePdfDauliq();
        if (variante == null) return;
        var incluirHistorico = variante === 'completo';
        mostrarLoading();
        var falhas = [];
        var lpsRenderizados = [];
        try {
            var jsPDF = window.jspdf.jsPDF;
            var docPDF = new jsPDF({ unit: 'mm', format: 'a4' });
            var carregados = [];
            for (var i = 0; i < ids.length; i++) {
                try {
                    var snap = await db.collection('liquidacoes').doc(ids[i]).get();
                    if (!snap.exists) { falhas.push('LP ' + ids[i] + ': não encontrada.'); continue; }
                    var lp0 = Object.assign({ id: snap.id }, snap.data());
                    if (!lp0.orcamento || !lp0.orcamento.length) {
                        lp0.orcamento = gerarOrcamentoParaIds(idsTitulosParaPdfLP(lp0), []);
                    }
                    if (!idsTitulosParaPdfLP(lp0).length) {
                        falhas.push((lp0.codigo || ids[i]) + ': sem TCs no lote.');
                        continue;
                    }
                    carregados.push({ lp0: lp0 });
                } catch (err) {
                    falhas.push('LP ' + ids[i] + ': ' + (err.message || err));
                }
            }
            if (!carregados.length) {
                alert('Nenhuma LP pôde ser carregada.\n\n' + falhas.join('\n'));
                return;
            }
            carregados.sort(function (a, b) {
                return String(a.lp0.codigo || '').localeCompare(String(b.lp0.codigo || ''), 'pt-BR', { numeric: true });
            });
            var emailUsr = (auth.currentUser && auth.currentUser.email) || 'usuário';
            for (var j = 0; j < carregados.length; j++) {
                var lp0 = carregados[j].lp0;
                try {
                    var meta = {
                        geradoEm: new Date().toISOString(),
                        usuario: emailUsr,
                        nomeArquivoSugerido: 'DAuLiq_em_bloco_' + (incluirHistorico ? 'completo' : 'sem-historico') + '.pdf',
                        origem: 'lista_bloco',
                        variantePdf: incluirHistorico ? 'completo' : 'sem_historico',
                    };
                    var ev = { data: new Date().toISOString(), tipo: 'pdf', usuario: emailUsr,
                        detalhe: 'DAuLiq gerado em bloco (' + (incluirHistorico ? 'completo' : 'sem histórico') + ')' };
                    var histNovo = (lp0.historico || []).slice();
                    histNovo.push(ev);
                    var lpMerged = Object.assign({}, lp0, { auditoriaPdf: meta, historico: histNovo });
                    await gerarDAuLiq(incluirHistorico, lpMerged, {
                        docPDF: docPDF,
                        iniciarComNovaPagina: j > 0,
                        salvar: false,
                        persistirFirestore: false,
                    });
                    lpsRenderizados.push({ id: lp0.id, meta: meta, ev: ev });
                } catch (err) {
                    falhas.push((lp0.codigo || lp0.id) + ': ' + (err.message || err));
                }
            }
            var totalPages = docPDF.getNumberOfPages();
            for (var p = 1; p <= totalPages; p++) {
                docPDF.setPage(p);
                docPDF.setFontSize(8);
                docPDF.text('Página ' + p + ' de ' + totalPages, 105, 290, { align: 'center' });
            }
            var stamp = new Date();
            var stampStr = stamp.getFullYear() + String(stamp.getMonth() + 1).padStart(2, '0') +
                String(stamp.getDate()).padStart(2, '0') + '_' +
                String(stamp.getHours()).padStart(2, '0') + String(stamp.getMinutes()).padStart(2, '0');
            var sufArq = incluirHistorico ? '' : '_sem-historico';
            docPDF.save('DAuLiq_em_bloco_' + lpsRenderizados.length + sufArq + '_' + stampStr + '.pdf');

            for (var k = 0; k < lpsRenderizados.length; k++) {
                var r = lpsRenderizados[k];
                try {
                    var ref = db.collection('liquidacoes').doc(r.id);
                    var cur = await ref.get();
                    var curHist = (cur.exists && cur.data().historico) || [];
                    await ref.update({
                        auditoriaPdf: r.meta,
                        historico: curHist.concat([r.ev]),
                        editadoEm: firebase.firestore.FieldValue.serverTimestamp(),
                        editadoPor: emailUsr,
                    });
                } catch (e) {
                    console.warn('Falha auditoria bloco LP', r.id, e);
                }
            }
            if (falhas.length) {
                alert('PDF em bloco gerado com ' + lpsRenderizados.length + ' DAuLiq. Falharam ' + falhas.length + ':\n\n' + falhas.join('\n'));
            }
        } catch (e) {
            alert('Erro ao gerar DAuLiq em bloco: ' + (e.message || e));
        } finally {
            esconderLoading();
        }
    }

    async function toggleInativarLP() {
        if (!lpEditorState || !lpEditorState.id || !(tem('liquidacao_status') || ehAdmin())) return;
        var ativoAtual = lpEditorState.ativo !== false;
        var email = (auth.currentUser && auth.currentUser.email) || 'usuário';
        var hist = (lpEditorState.historico || []).slice();
        hist.push({ data: new Date().toISOString(), tipo: 'inativar', usuario: email,
            detalhe: ativoAtual ? 'Liquidação inativada' : 'Liquidação reativada' });
        mostrarLoading();
        try {
            await db.collection('liquidacoes').doc(lpEditorState.id).update({
                ativo: !ativoAtual,
                historico: hist,
                editadoEm: firebase.firestore.FieldValue.serverTimestamp(),
                editadoPor: email,
            });
            lpEditorState.ativo = !ativoAtual;
            lpEditorState.historico = hist;
            alert(ativoAtual ? 'Liquidação inativada.' : 'Liquidação reativada.');
        } catch (e) {
            alert('Erro: ' + (e.message || e));
        } finally {
            esconderLoading();
        }
    }

    async function excluirLPPermanente() {
        if (!lpEditorState || !lpEditorState.id || !(tem('liquidacao_excluir') || ehAdmin())) return;
        if (!lpEstadoCancelado(lpEditorState.estado)) {
            alert('Só é permitido excluir permanentemente uma liquidação já cancelada.');
            return;
        }
        if (!confirm('Excluir permanentemente este registro?')) return;
        mostrarLoading();
        try {
            await db.collection('liquidacoes').doc(lpEditorState.id).delete();
            lpEditorState = null;
            fecharEditor();
            alert('Registro excluído.');
        } catch (e) {
            alert('Erro: ' + (e.message || e));
        } finally {
            esconderLoading();
        }
    }

    // ===== PDF: DAuLiq =====
    async function gerarDAuLiq(incluirHistorico, lpAlvo, opts) {
        opts = opts || {};
        var lp = lpAlvo || lpEditorState;
        if (!lp) return;
        if (!window.jspdf || !window.jspdf.jsPDF) { alert('Biblioteca jsPDF indisponível.'); return; }
        var ids = idsTitulosParaPdfLP(lp);
        if (!ids.length) { alert('Sem TCs no lote para gerar o DAuLiq.'); return; }
        mostrarLoading();
        try {
            var jsPDF = window.jspdf.jsPDF;
            var doc   = opts.docPDF || new jsPDF({ unit: 'mm', format: 'a4' });
            if (opts.iniciarComNovaPagina) doc.addPage();
            var M  = { l: 10, r: 10, t: 10, b: 12 };
            var W  = 190;
            var PH = 297;
            var y  = M.t;

            function garantir(h) { if (y + h > PH - M.b) { doc.addPage(); y = M.t; } }

            function tituloSecao(txt) {
                garantir(8);
                doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); doc.setTextColor(0, 0, 0);
                doc.text(String(txt), M.l, y + 4.8);
                doc.setDrawColor(155, 155, 155); doc.line(M.l, y + 5.8, M.l + W, y + 5.8);
                y += 8;
            }

            function campo(label, valor, x, larg) {
                var h = 12;
                garantir(h + 1);
                doc.setDrawColor(170, 170, 170); doc.rect(x, y, larg, h);
                doc.setFont('helvetica', 'bold'); doc.setFontSize(7.3); doc.setTextColor(0, 0, 0);
                doc.text(String(label || '-'), x + 1.5, y + 3.4);
                doc.setFont('helvetica', 'normal'); doc.setFontSize(8.1);
                var lns = doc.splitTextToSize(String(valor || '-'), larg - 3);
                doc.text(lns, x + 1.5, y + 8);
            }

            function linhaCampos(campos) {
                var gap  = 2;
                var larg = (W - gap * (campos.length - 1)) / campos.length;
                campos.forEach(function (c, i) { campo(c.label, c.valor, M.l + i * (larg + gap), larg); });
                y += 13;
            }

            function tabela(headers, rows, larguras) {
                if (!rows || !rows.length) return;
                var hC = 6, hR = 5.4;
                garantir(hC + hR + 2);
                var tot   = larguras.reduce(function (s, n) { return s + n; }, 0) || 1;
                var fator = W / tot;
                var largs = larguras.map(function (n) { return n * fator; });
                var x = M.l;
                doc.setDrawColor(175, 175, 175); doc.setTextColor(0, 0, 0);
                headers.forEach(function (h, i) {
                    doc.rect(x, y, largs[i], hC);
                    doc.setFont('helvetica', 'bold'); doc.setFontSize(7.1);
                    doc.text(String(h), x + 1.2, y + 4);
                    x += largs[i];
                });
                y += hC;
                rows.forEach(function (r) {
                    garantir(hR + 1);
                    x = M.l;
                    r.forEach(function (cell, i) {
                        doc.rect(x, y, largs[i], hR);
                        doc.setFont('helvetica', 'normal'); doc.setFontSize(7.0);
                        var txt = doc.splitTextToSize(String(cell == null ? '-' : cell), largs[i] - 2.2);
                        doc.text(txt.slice(0, 1), x + 1.1, y + 3.8);
                        x += largs[i];
                    });
                    y += hR;
                });
                y += 2;
            }

            function rodapeTotal(label, valor) {
                garantir(6); doc.setFont('helvetica', 'bold'); doc.setFontSize(8.2);
                doc.text(label + ': ' + valor, M.l + W, y + 4, { align: 'right' }); y += 6;
            }

            // Logo
            var logoData = null;
            try {
                var resp = await fetch('icons/logo-192.png');
                if (resp.ok) {
                    var blob = await resp.blob();
                    logoData = await new Promise(function (res) {
                        var fr = new FileReader();
                        fr.onload  = function () { res(fr.result); };
                        fr.onerror = function () { res(null); };
                        fr.readAsDataURL(blob);
                    });
                }
            } catch (_) {}

            var topoY = y;
            if (logoData) { try { doc.addImage(logoData, 'PNG', M.l, topoY, 18, 18); } catch (_) {} }
            doc.setFont('helvetica', 'bold'); doc.setFontSize(12);
            doc.text('Documento Auxiliar de Liquidação (DAuLiq)', M.l + W / 2, topoY + 22, { align: 'center' });
            doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
            var agora   = new Date();
            var hojeStr = toDateBrPdf(agora);
            var horaStr = String(agora.getHours()).padStart(2, '0') + ':' + String(agora.getMinutes()).padStart(2, '0');
            var emailUsr = (auth.currentUser && auth.currentUser.email) || 'usuário';
            doc.text('Impressão: ' + hojeStr + ' às ' + horaStr, M.l + W, topoY + 6,  { align: 'right' });
            doc.text('Usuário: ' + emailUsr,                     M.l + W, topoY + 11, { align: 'right' });
            y = topoY + 27;

            var tcs      = getTCsPorIds(ids);
            var forn     = lp.fornecedor;
            var bruto    = valorTotalBruto(ids);
            var inssTotal = totalINSS(ids);
            var issTotal  = totalISS(ids);
            var darfTt   = totalDARF(ids);
            var impostosTt = inssTotal + issTotal + darfTt;
            var liq      = bruto - impostosTt;
            var ateste   = atesteMinimo(ids);
            var venc     = ateste ? addDias(ateste, 30) : null;
            var orc      = lp.orcamento || gerarOrcamentoParaIds(ids, []);
            var m        = function (v) { return moeda(v).replace('\u00a0', ' '); };

            tituloSecao('IDENTIFICAÇÃO DA LIQUIDAÇÃO');
            linhaCampos([
                { label: 'Código LP',            valor: lp.codigo },
                { label: 'Estado',               valor: lp.estado },
                { label: 'NP (se informada)',     valor: lp.np || '-' },
                { label: 'Data liquidação (LP)', valor: toDateBrPdf(lp.dataLiquidacao) },
            ]);

            tituloSecao('DADOS BÁSICOS');
            linhaCampos([
                { label: 'Data do ateste (bloco)',    valor: toDateBrPdf(ateste) },
                { label: 'Data de vencimento (+30)', valor: toDateBrPdf(venc) },
                { label: 'Valor do documento',        valor: m(bruto) },
                { label: 'Código do credor',          valor: forn ? forn.cnpj : '-' },
                { label: 'Nome do credor',            valor: forn ? forn.nome  : '-' },
            ]);

            tituloSecao('DOCUMENTOS DE ORIGEM');
            tabela(
                ['ID-PROC', 'Emitente (CNPJ)', 'Emissão TC', 'Documento (tipo-nº)', 'Valor R$'],
                tcs.map(function (tc) { return [tc.proc, tc.cnpj, toDateBrPdf(tc.emissao), tc.doc, m(tc.valor)]; }),
                [22, 28, 22, 42, 20]
            );

            tituloSecao('FORNECEDOR / FAVORECIDO');
            linhaCampos([
                { label: 'Favorecido (CNPJ)',          valor: forn ? forn.cnpj : '-' },
                { label: 'Nome',                       valor: forn ? forn.nome  : '-' },
                { label: 'Quantidade de TCs no lote', valor: String(tcs.length) },
            ]);

            tituloSecao('PRINCIPAL COM ORÇAMENTO — EMPENHOS (CONSOLIDADO)');
            linhaCampos([
                { label: 'Data vencimento (ref. deduções)', valor: toDateBrPdf(venc) },
                { label: 'Data pagamento (ref.)',           valor: hojeStr },
            ]);
            tabela(
                ['Nota de Empenho', 'ND', 'Sub', 'FR', 'VINC', 'Valor usado', 'C. de Custos', 'UG Benf.', 'LF', 'PF'],
                orc.map(function (o) { return [o.ne, o.nd, o.sub, o.fr, o.vinc || '-', m(o.valor), o.cc, o.ug, o.lf || '-', o.pf || '-']; }),
                [12, 6, 4, 10, 6, 12, 10, 6, 15, 15]
            );
            rodapeTotal('Valor total das NE (consolidado)', m(bruto));

            // INSS (DDF021) — exibe só se houver TCs com INSS no lote
            var tcsComINSS = tcs.filter(function(tc){ return getDeducoesTipo(tc.id, 'DDF021').length > 0; });
            if (tcsComINSS.length) {
                tituloSecao('Dedução — INSS — DDF021');
                linhaCampos([
                    { label: 'Data vencimento (bloco)', valor: toDateBrPdf(venc) },
                    { label: 'Data pagamento (ref.)',   valor: hojeStr },
                ]);
                var rowsINSSPdf = [];
                tcsComINSS.forEach(function(tc){
                    getDeducoesTipo(tc.id, 'DDF021').forEach(function(n){
                        rowsINSSPdf.push([tc.proc, n.codReceita || '-', m(Number(n.base) || 0),
                            (Number(n.aliq) || 0).toFixed(2) + '%', m(Number(n.valor) || 0),
                            toDateBrPdf(n.dataEmissao || n.dataApuracao)]);
                    });
                });
                tabela(['ID-PROC', 'Cod. Receita', 'Base de Cálculo', 'Alíquota', 'Valor a deduzir', 'Data (emissão TC)'],
                    rowsINSSPdf, [20, 18, 26, 14, 22, 22]);
                rodapeTotal('Valor total INSS', m(inssTotal));
            }

            // ISS (DDR001) — exibe só se houver TCs com ISS no lote
            var tcsComISS = tcs.filter(function(tc){ return getDeducoesTipo(tc.id, 'DDR001').length > 0; });
            if (tcsComISS.length) {
                tituloSecao('Dedução — ISS — DDR001');
                linhaCampos([
                    { label: 'Data vencimento (bloco)', valor: toDateBrPdf(venc) },
                    { label: 'Data pagamento (ref.)',   valor: hojeStr },
                ]);
                var rowsISSPdf = [];
                tcsComISS.forEach(function(tc){
                    getDeducoesTipo(tc.id, 'DDR001').forEach(function(i){
                        rowsISSPdf.push([tc.proc, i.codReceita || '-', m(Number(i.base) || 0),
                            (Number(i.aliq) || 0).toFixed(2) + '%', m(Number(i.valor) || 0),
                            toDateBrPdf(i.dataApuracao || i.dataEmissao)]);
                    });
                });
                tabela(['ID-PROC', 'Cod. Receita', 'Base de Cálculo', 'Alíquota', 'Valor a deduzir', 'Data apuração'],
                    rowsISSPdf, [20, 18, 26, 14, 22, 22]);
                rodapeTotal('Valor total ISS', m(issTotal));
            }

            // DARF (DDF025) — exibe só se houver TCs com DARF no lote
            var tcsComDARF = tcs.filter(function(tc){ return getDeducoesTipo(tc.id, 'DDF025').length > 0; });
            if (tcsComDARF.length) {
                tituloSecao('Dedução — DARF — DDF025');
                linhaCampos([
                    { label: 'Data vencimento (bloco)', valor: toDateBrPdf(venc) },
                    { label: 'Data pagamento (ref.)',   valor: hojeStr },
                ]);
                var rowsDARFPdf = [];
                tcsComDARF.forEach(function(tc){
                    getDeducoesTipo(tc.id, 'DDF025').forEach(function(d){
                        rowsDARFPdf.push([tc.proc, d.codReceita || '-', d.natRed || '-',
                            m(Number(d.base) || 0), (Number(d.aliq) || 0).toFixed(2) + '%',
                            m(Number(d.total || d.valor) || 0)]);
                    });
                });
                tabela(['ID-PROC', 'Cod. Receita', 'Nat. Red.', 'Base', 'Alíq. tot.', 'Total'],
                    rowsDARFPdf, [20, 22, 18, 30, 18, 26]);
                rodapeTotal('Valor total DARF', m(darfTt));
            }

            tituloSecao('DADOS DE PAGAMENTO');
            linhaCampos([
                { label: 'Recolhedor (CNPJ)',    valor: forn ? forn.cnpj : '-' },
                { label: 'Valor total dos TCs',  valor: m(bruto) },
                { label: 'Total das deduções',   valor: m(impostosTt) },
                { label: 'Valor líquido (OB)',   valor: m(liq) },
            ]);

            // DETA CUSTOS — agrupa NE × Sub × CC × UG
            var grupos = [];
            var chaveMap = {};
            orc.forEach(function(o){
                var chave = o.ne + '|' + o.sub + '|' + o.cc + '|' + o.ug;
                if (chaveMap[chave] !== undefined) { grupos[chaveMap[chave]].valor += o.valor; }
                else { chaveMap[chave] = grupos.length; grupos.push({ ne: o.ne, sub: o.sub, cc: o.cc, ug: o.ug, valor: o.valor }); }
            });
            tituloSecao('DETA CUSTOS (AGRUPADO NE \u00d7 SUB \u00d7 CC \u00d7 UG)');
            tabela(
                ['Nota de Empenho', 'Sub', 'Centro custos', 'UG', 'Valor'],
                grupos.map(function(g){ return [g.ne, g.sub, g.cc, g.ug, m(g.valor)]; }),
                [36, 10, 20, 12, 20]
            );

            if (incluirHistorico) {
                var histRows = (lp.historico || []).slice().reverse().slice(0, 45).map(function (h) {
                    var dt = h.data && h.data.toDate ? h.data.toDate().toLocaleString('pt-BR') : fmtDataHora(h.data);
                    return [dt, h.tipo || '-', h.usuario || '-',
                        String(h.detalhe || '') + (h.motivo ? ' — ' + h.motivo : '')];
                });
                if (histRows.length) {
                    tituloSecao('HISTÓRICO / AUDITORIA (LIQUIDAÇÃO)');
                    tabela(['Data', 'Tipo', 'Usuário', 'Detalhe'], histRows, [28, 22, 32, 72]);
                }
            }

            if (opts.salvar !== false) {
                var totalPag = doc.getNumberOfPages();
                for (var p = 1; p <= totalPag; p++) {
                    doc.setPage(p); doc.setFontSize(8);
                    doc.text('Página ' + p + ' de ' + totalPag, 105, 290, { align: 'center' });
                }
                var sufArq = incluirHistorico ? '' : '_sem-historico';
                var nomeArq = 'DAuLiq_' + String(lp.codigo || 'lote').replace(/\//g, '-') + sufArq + '.pdf';
                doc.save(nomeArq);
            }

            if (opts.persistirFirestore !== false && lp.id) {
                var metaPdf = {
                    geradoEm: new Date().toISOString(),
                    usuario: emailUsr,
                    nomeArquivoSugerido: 'DAuLiq_' + String(lp.codigo || '').replace(/\//g, '-') + (incluirHistorico ? '' : '_sem-historico') + '.pdf',
                    variantePdf: incluirHistorico ? 'completo' : 'sem_historico',
                    origem: opts.origem || 'editor',
                };
                var histPdf = (lp.historico || []).slice();
                histPdf.push({ data: new Date().toISOString(), tipo: 'pdf', usuario: emailUsr,
                    detalhe: 'DAuLiq gerado: ' + metaPdf.nomeArquivoSugerido + '.' });
                if (lpEditorState && lpEditorState.id === lp.id) {
                    lpEditorState.historico = histPdf;
                    lpEditorState.auditoriaPdf = metaPdf;
                }
                await db.collection('liquidacoes').doc(lp.id).set({
                    auditoriaPdf: metaPdf,
                    historico: histPdf,
                    editadoEm: firebase.firestore.FieldValue.serverTimestamp(),
                    editadoPor: emailUsr,
                }, { merge: true });
            }
            if (lpEditorState && lpAbaAtiva === 'F') renderizarAbaF();
            fecharModalPdfVariante();

        } catch (e) {
            alert('Erro ao gerar PDF: ' + (e.message || e));
        } finally {
            esconderLoading();
        }
    }

    // ===== BUSCA LFxPF EM LOTE =====
    // Para cada linha que já possui LF preenchida, busca na coleção LFxPF e preenche PF e VINC.
    async function buscarLFsParaLP() {
        if (!lpEditorState) return;
        var pfEncontradas = 0;
        var lfsAnalisadas = 0;

        lpEditorState.orcamento.forEach(function (o) {
            var lfNorm = normalizarLF(o.lf);
            if (!lfNorm) return;
            lfsAnalisadas++;
            var reg = buscarPFporLF(lfNorm);
            if (!reg) return;
            if (reg.pf)         { o.pf   = reg.pf;         pfEncontradas++; }
            if (reg.vinculacao) { o.vinc  = reg.vinculacao; }
        });

        var novoStatus = calcularStatusFinanceiro(lpEditorState.orcamento);
        lpEditorState.estado = novoStatus;
        var badgeEl = document.getElementById('lpBadgeEstado');
        if (badgeEl) badgeEl.innerHTML = badgeEstado(novoStatus);

        renderizarAbaB();
        await propagarLFParaTitulos(lpEditorState);

        var msg;
        if (lfsAnalisadas === 0) {
            msg = 'Nenhuma LF preenchida nas linhas de orçamento. Preencha ao menos uma LF para buscar na coleção.';
        } else if (pfEncontradas === 0) {
            msg = lfsAnalisadas + ' LF(s) analisada(s). Nenhuma PF encontrada na coleção LFxPF (financeiro ainda não processou).';
        } else {
            msg = pfEncontradas + ' PF(s) preenchida(s) de ' + lfsAnalisadas + ' LF(s) analisada(s).';
        }
        alert(msg);
    }

    // ===== EVENT LISTENERS =====
    function inicializarEventos() {
        qs('btnNovaLP') && qs('btnNovaLP').addEventListener('click', abrirNovaLP);
        qs('buscaTabelaLP') && qs('buscaTabelaLP').addEventListener('input', function (e) {
            termoBuscaLP = e.target.value; renderizarLista();
        });

        document.querySelectorAll('.lp-tab-btn[data-aba]').forEach(function (btn) {
            btn.addEventListener('click', function () { abrirAba(btn.dataset.aba); });
        });

        qs('btnVoltarListaLP')  && qs('btnVoltarListaLP').addEventListener('click', fecharEditor);
        qs('btnLPSalvar')       && qs('btnLPSalvar').addEventListener('click', salvarLP);
        qs('btnLPGerarPdf')     && qs('btnLPGerarPdf').addEventListener('click', abrirModalPdfVariante);
        qs('btnLPInformarNP')   && qs('btnLPInformarNP').addEventListener('click', function () { abrirModalNP(false); });
        qs('btnLPCorrigirNP')   && qs('btnLPCorrigirNP').addEventListener('click', function () { abrirModalNP(true); });
        qs('btnLPCancelar')     && qs('btnLPCancelar').addEventListener('click', cancelarLPCompleto);

        qs('modalLPMotivoCancelar') && qs('modalLPMotivoCancelar').addEventListener('click', function () { fecharModalMotivoLP(false); });
        qs('modalLPMotivoConfirmar') && qs('modalLPMotivoConfirmar').addEventListener('click', function () { fecharModalMotivoLP(true); });
        qs('btnModalDauliqCancel') && qs('btnModalDauliqCancel').addEventListener('click', fecharModalPdfVariante);
        qs('btnModalDauliqSemHist') && qs('btnModalDauliqSemHist').addEventListener('click', function () { gerarDAuLiq(false, null, {}); });
        qs('btnModalDauliqCompleto') && qs('btnModalDauliqCompleto').addEventListener('click', function () { gerarDAuLiq(true, null, {}); });
        qs('btnImprimirBlocoLP') && qs('btnImprimirBlocoLP').addEventListener('click', function () {
            gerarDauliqEmBloco(Array.from(lpSelecionados));
        });
        qs('filtroLPInativas') && qs('filtroLPInativas').addEventListener('change', function () {
            paginaAtualLP = 1;
            renderizarLista();
        });
        qs('btnLPInativar') && qs('btnLPInativar').addEventListener('click', toggleInativarLP);
        qs('btnLPExcluir') && qs('btnLPExcluir').addEventListener('click', excluirLPPermanente);

        qs('btnLPTrocarFornecedor') && qs('btnLPTrocarFornecedor').addEventListener('click', trocarFornecedor);
        inicializarAutocompleteFornecedor();

        qs('btnLPAdicionarTC') && qs('btnLPAdicionarTC').addEventListener('click', abrirModalAdicionarTC);
        qs('btnLPRemoverTC')   && qs('btnLPRemoverTC').addEventListener('click', removerTCsSelecionados);
        qs('btnBuscarLFs')     && qs('btnBuscarLFs').addEventListener('click', buscarLFsParaLP);

        qs('lpBuscaTCModal')     && qs('lpBuscaTCModal').addEventListener('input', function (e) { renderizarTCsDisponiveis(e.target.value); });
        qs('btnModalTCCancelar') && qs('btnModalTCCancelar').addEventListener('click', fecharModalTC);
        qs('btnModalTCConfirmar') && qs('btnModalTCConfirmar').addEventListener('click', confirmarAdicionarTCs);
        qs('modalLPAdicionarTC') && qs('modalLPAdicionarTC').addEventListener('click', function (e) { if (e.target.id === 'modalLPAdicionarTC') fecharModalTC(); });

        qs('modalNPCancelar')  && qs('modalNPCancelar').addEventListener('click', fecharModalNP);
        qs('modalNPConfirmar') && qs('modalNPConfirmar').addEventListener('click', confirmarNP);
        qs('modalLPNP')        && qs('modalLPNP').addEventListener('click', function (e) { if (e.target.id === 'modalLPNP') fecharModalNP(); });

        document.addEventListener('keydown', function (e) {
            if (e.key !== 'Escape') return;
            var mTC = qs('modalLPAdicionarTC');
            var mNP = qs('modalLPNP');
            if (mTC && mTC.style.display !== 'none') fecharModalTC();
            else if (mNP && mNP.style.display !== 'none') fecharModalNP();
        });
    }

    // ===== INIT LOCAL =====
    function inicializar() {
        itensPorPaginaLP = parseInt(qs('itensPorPaginaLP') && qs('itensPorPaginaLP').value || 10, 10);
        try {
            var params = new URLSearchParams(window.location.search);
            var ano = params.get('ano');
            if (ano) filtroAnoExercicioLP = ano;
            var lpParam = params.get('lp');
            if (lpParam) window._lpAbrirAposInit = lpParam;
        } catch (e) { /* ignore */ }
        popularSelectFiltroAnoLP();
        renderizarLista();
        inicializarEventos();
        aplicarPermissoesBotoesLP();
        if (window._lpAbrirAposInit) {
            var idAbrir = window._lpAbrirAposInit;
            delete window._lpAbrirAposInit;
            setTimeout(function () {
                var found = lpLista.find(function (l) { return l.id === idAbrir; });
                if (found) abrirEditarLP(idAbrir, { somenteLeitura: true });
            }, 300);
        }
    }

    // ===== INIT FIREBASE (chamado por script.js após auth) =====
    function inicializarModuloLiquidacao() {
        var prontos = { titulos: false, lfpf: false, liquidacoes: false };

        function verificarPronto() {
            if (prontos.titulos && prontos.lfpf && prontos.liquidacoes) {
                inicializar();
                esconderLoading();
            }
        }

        unsubTitulosLP = db.collection('titulos').onSnapshot(function (snap) {
            baseTitulosLP = snap.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); });
            if (!prontos.titulos) { prontos.titulos = true; verificarPronto(); }
            else { renderizarLista(); if (lpEditorState) renderizarAbaAtiva(); }
        }, function (err) {
            console.error('[liquidacao] titulos onSnapshot:', err);
            prontos.titulos = true; verificarPronto();
        });

        unsubLfPfLP = db.collection('lfpf').onSnapshot(function (snap) {
            baseLfPfLP = snap.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); });
            if (!prontos.lfpf) { prontos.lfpf = true; verificarPronto(); }
        }, function (err) {
            console.error('[liquidacao] lfpf onSnapshot:', err);
            prontos.lfpf = true; verificarPronto();
        });

        unsubLiquidacoes = db.collection('liquidacoes').onSnapshot(function (snap) {
            lpLista = snap.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); });
            if (!prontos.liquidacoes) { prontos.liquidacoes = true; verificarPronto(); }
            else renderizarLista();
        }, function (err) {
            console.error('[liquidacao] liquidacoes onSnapshot:', err);
            prontos.liquidacoes = true; verificarPronto();
        });
    }

    window.inicializarModuloLiquidacao = inicializarModuloLiquidacao;

}());
