// ==========================================
// RELATÓRIO DE DEDUÇÕES E IMPOSTOS
// Seção: secao-relatorios-deducoes-impostos (sistema.html)
// ==========================================
(function () {
    if (!document.getElementById('corpo-sistema')) return;

    // ===== Constantes de domínio =====
    var TIPO_LABEL = { DDF021: 'INSS', DDF025: 'DARF', DDR001: 'ISS' };

    var TIPOS_DISPONIVEIS = [
        { valor: 'DDF021', label: 'INSS (DDF021)' },
        { valor: 'DDF025', label: 'DARF (DDF025)' },
        { valor: 'DDR001', label: 'ISS (DDR001)' }
    ];

    var ESTADOS_DISPONIVEIS = [
        { valor: 'rascunho',              label: 'Rascunho' },
        { valor: 'liquidado',             label: 'Liquidado' },
        { valor: 'aguardandoFinanceiro',  label: 'Aguardando Financeiro' },
        { valor: 'paraPagamentoParcial',  label: 'Para Pagamento Parcial' },
        { valor: 'paraPagamento',         label: 'Para Pagamento' },
        { valor: 'pagoParcialmente',      label: 'Pago Parcialmente' },
        { valor: 'pago',                  label: 'Pago' },
        { valor: 'cancelado',             label: 'Cancelado' },
        { valor: 'fechado',               label: 'Liquidado (legado fechado)' },
        { valor: 'aguardandoFinanceiroSemLF', label: 'Liquidado (legado s/ LF)' },
        { valor: 'aguardandoFinanceiroComLF', label: 'Aguard. Financeiro (legado)' }
    ];

    var COLUNAS_RELATORIO = [
        'LP', 'NP', 'Data da Liquidação', 'Valor Bruto da LP', 'CNPJ do Fornecedor',
        'Nome do Fornecedor', 'PROC', 'Doc Origem', 'Valor do PROC', 'Base de Cálculo',
        'Alíquota', 'Valor da Dedução', 'Natureza de Rendimento', 'Código da Receita',
        'Situação', 'Nome do Imposto', 'Status LP'
    ];

    var COLUNAS_NUMERICAS_SORT = {
        valorBruto: true, valorProc: true, baseCalculo: true, aliquota: true, valorDeducao: true,
        docOrigem: true
    };

    var MAP_ESTADO_LP = {};
    ESTADOS_DISPONIVEIS.forEach(function (e) { MAP_ESTADO_LP[e.valor] = e.label; });

    // ===== Estado interno =====
    var _st = {
        fornecedoresSel:       [],
        tiposSel:              [],
        codigosSel:            [],
        estadosSel:            [],
        resultados:            [],
        codigosDisponiveis:    [],
        fornecedoresDisponiveis: [],
        paginaAtual:           1,
        itensPorPagina:        10,
        ordenacao:             { coluna: 'dataLiquidacaoIso', direcao: 'desc' },
        _carregandoCodigos:    false,
        _carregandoFornecedores: false,
        _modalConfirmarCb:     null
    };

    // ===== Modal genérico: estado =====
    var _modalItens = [];
    var _modalItensSelecionados = [];

    // ===== Helpers =====
    function qs(id) { return document.getElementById(id); }

    function _esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function soDigitos(s) {
        return String(s || '').replace(/\D/g, '');
    }

    function fmtDataISO(v) {
        if (!v) return '—';
        var s = (v && typeof v.toDate === 'function') ? fmtDataISO(v.toDate()) : String(v);
        if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
            var p = s.slice(0, 10).split('-');
            return p[2] + '/' + p[1] + '/' + p[0];
        }
        if (v instanceof Date && !isNaN(v.getTime())) {
            return String(v.getDate()).padStart(2, '0') + '/' +
                   String(v.getMonth() + 1).padStart(2, '0') + '/' + v.getFullYear();
        }
        return String(v);
    }

    function moedaBR(n) {
        var x = Number(n == null ? 0 : n);
        if (isNaN(x)) return String(n);
        return 'R$\u00a0' + x.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    function fmtAliquota(n) {
        if (n == null || n === '') return '—';
        var x = Number(n);
        if (isNaN(x)) return String(n);
        return x.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 }) + '%';
    }

    function isoDate(d) {
        return d.getFullYear() + '-' +
               String(d.getMonth() + 1).padStart(2, '0') + '-' +
               String(d.getDate()).padStart(2, '0');
    }

    function extrairDocOrigem(tc) {
        if (!tc) return '—';
        var num = String(tc.numTC || tc.numeroDocumento || '').trim();
        if (num) {
            var soNum = num.replace(/\D/g, '');
            return soNum || num;
        }
        var tipo = String(tc.tipoTC || tc.tipoDocumento || '').trim();
        var docStr = (tipo && tc.numTC) ? (tipo + '-' + tc.numTC) : (tc.doc || '');
        if (!docStr) return '—';
        var m = String(docStr).match(/-(\d+)\s*$/);
        if (m) return m[1];
        var dig = String(docStr).replace(/\D/g, '');
        return dig || '—';
    }

    function labelStatusLp(estado) {
        if (!estado) return '—';
        var legado = {
            fechado: 'Liquidado',
            aguardandoFinanceiroSemLF: 'Liquidado',
            aguardandoFinanceiroComLF: 'Aguardando Financeiro'
        };
        return MAP_ESTADO_LP[estado] || legado[estado] || String(estado);
    }

    function estadoLpCompatFiltro(estado, selecionados) {
        if (!selecionados.length) return true;
        if (selecionados.indexOf(estado) >= 0) return true;
        if (selecionados.indexOf('liquidado') >= 0 && (estado === 'fechado' || estado === 'aguardandoFinanceiroSemLF')) return true;
        if (selecionados.indexOf('aguardandoFinanceiro') >= 0 && estado === 'aguardandoFinanceiroComLF') return true;
        return false;
    }

    function toIsoSortData(v) {
        if (!v) return '';
        if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
        if (v instanceof Date && !isNaN(v.getTime())) return isoDate(v);
        if (v && typeof v.toDate === 'function') {
            var d = v.toDate();
            if (!isNaN(d.getTime())) return isoDate(d);
        }
        return String(v);
    }

    function valorDeducaoDe(d, base, aliq) {
        var val = Number(
            d.valorCalculado != null ? d.valorCalculado :
            d.valor          != null ? d.valor          :
            d.total          != null ? d.total          : NaN
        );
        if (!isNaN(val) && val !== 0) return val;
        if (base && aliq) return base * aliq / 100;
        return 0;
    }

    function linhaParaExportacao(r) {
        return [
            r.lp, r.np, r.dataLiquidacao, moedaBR(r.valorBruto), r.cnpj, r.nomeFornecedor,
            r.proc, r.docOrigem, moedaBR(r.valorProc), moedaBR(r.baseCalculo),
            fmtAliquota(r.aliquota), moedaBR(r.valorDeducao), r.natRendimento, r.codReceita,
            r.situacao, r.nomeImposto, r.statusLp
        ];
    }

    function calcIntervalo(periodo) {
        var hoje = new Date();
        hoje.setHours(0, 0, 0, 0);
        if (periodo === 'hoje')   return { inicio: isoDate(hoje), fim: isoDate(hoje) };
        if (periodo === 'ontem') {
            var d = new Date(hoje); d.setDate(d.getDate() - 1);
            return { inicio: isoDate(d), fim: isoDate(d) };
        }
        if (periodo === 'personalizado') return null;
        var dias = parseInt(periodo, 10);
        if (!isNaN(dias)) {
            var ini = new Date(hoje); ini.setDate(hoje.getDate() - dias + 1);
            return { inicio: isoDate(ini), fim: isoDate(hoje) };
        }
        return null;
    }

    // ===== Controles de filtro UI =====

    window.relDedAtualizarCamposPersonalizado = function () {
        var v = (qs('relDedPeriodo') || {}).value;
        var show = v === 'personalizado';
        var g1 = qs('relDedGrupoDataInicio'), g2 = qs('relDedGrupoDataFim');
        if (g1) g1.style.display = show ? '' : 'none';
        if (g2) g2.style.display = show ? '' : 'none';
    };

    window.relDedLimparFiltros = function () {
        var p = qs('relDedPeriodo');
        if (p) p.value = '30';
        var di = qs('relDedDataInicio'), df = qs('relDedDataFim');
        if (di) di.value = ''; if (df) df.value = '';
        window.relDedAtualizarCamposPersonalizado();
        _st.fornecedoresSel = [];
        _st.tiposSel = [];
        _st.codigosSel = [];
        _st.estadosSel = [];
        _atualizarResumos();
        var card = qs('relDedResultadosCard');
        if (card) card.style.display = 'none';
    };

    function _atualizarResumos() {
        _setResumo('relDedFornecedorResumo',
            _st.fornecedoresSel.map(function (f) { return f.nome || f.cnpj; }), 'Todos');
        _setResumo('relDedTipoResumo',
            _st.tiposSel.map(function (t) { return TIPO_LABEL[t] || t; }), 'Todos');
        _setResumo('relDedCodigoResumo', _st.codigosSel, 'Todos');
        _setResumo('relDedEstadoResumo', _st.estadosSel.map(function (e) {
            var found = ESTADOS_DISPONIVEIS.find(function (x) { return x.valor === e; });
            return found ? found.label : e;
        }), 'Todos');
    }

    function _setResumo(id, arr, textoVazio) {
        var el = qs(id);
        if (!el) return;
        if (!arr || !arr.length) { el.textContent = textoVazio; return; }
        el.textContent = arr.length === 1 ? arr[0] : arr.length + ' selecionado(s)';
    }

    // ===== Modal genérico multi-seleção =====

    function _abrirModal(titulo, itens, preSelSels, confirmCb, carregando) {
        _modalItens = itens || [];
        _modalItensSelecionados = (preSelSels || []).slice();
        _st._modalConfirmarCb = confirmCb;

        var tit = qs('modalRelDedTitulo');
        if (tit) tit.textContent = titulo;

        var busca = qs('modalRelDedBusca');
        if (busca) busca.value = '';

        var loader = qs('modalRelDedCarregando');
        var lista = qs('modalRelDedListaWrapper');
        if (loader) loader.style.display = carregando ? '' : 'none';
        if (lista)  lista.style.display  = carregando ? 'none' : '';

        if (!carregando) _renderizarListaModal('');

        var modal = qs('modalRelDedSelecao');
        if (modal) {
            modal.style.display = 'flex';
            setTimeout(function () {
                var buscaEl = qs('modalRelDedBusca');
                if (buscaEl) buscaEl.focus();
            }, 50);
        }
    }

    function _finalizarCarregamentoModal() {
        var loader = qs('modalRelDedCarregando');
        var lista = qs('modalRelDedListaWrapper');
        if (loader) loader.style.display = 'none';
        if (lista)  lista.style.display  = '';
        _renderizarListaModal('');
    }

    function _renderizarListaModal(filtro) {
        var lista = qs('modalRelDedLista');
        if (!lista) return;
        var f = filtro.trim().toLowerCase();
        var html = '';
        _modalItens.forEach(function (item) {
            if (f && item.label.toLowerCase().indexOf(f) < 0) return;
            var chk = _modalItensSelecionados.indexOf(item.valor) >= 0 ? ' checked' : '';
            html += '<label style="display:flex;align-items:center;gap:8px;padding:5px 0;cursor:pointer;">' +
                '<input type="checkbox" value="' + _esc(item.valor) + '"' + chk +
                ' onchange="relDedToggleItemModal(this)" style="flex-shrink:0;">' +
                '<span>' + _esc(item.label) + '</span></label>';
        });
        if (!html) html = '<p style="color:#888;font-size:13px;margin:8px 0;">Nenhum item encontrado.</p>';
        lista.innerHTML = html;
    }

    window.relDedToggleItemModal = function (chk) {
        var v = chk.value;
        var idx = _modalItensSelecionados.indexOf(v);
        if (chk.checked && idx < 0) _modalItensSelecionados.push(v);
        else if (!chk.checked && idx >= 0) _modalItensSelecionados.splice(idx, 1);
    };

    window.relDedFiltrarModal = function () {
        var busca = qs('modalRelDedBusca');
        _renderizarListaModal(busca ? busca.value : '');
    };

    window.relDedConfirmarModal = function () {
        if (_st._modalConfirmarCb) _st._modalConfirmarCb(_modalItensSelecionados.slice());
        window.relDedFecharModal();
    };

    window.relDedFecharModal = function () {
        var modal = qs('modalRelDedSelecao');
        if (modal) modal.style.display = 'none';
        _st._modalConfirmarCb = null;
    };

    // Fecha modal ao clicar no overlay
    var modalEl = qs('modalRelDedSelecao');
    if (modalEl) {
        modalEl.addEventListener('click', function (e) {
            if (e.target === modalEl) window.relDedFecharModal();
        });
    }

    // ===== Abrir modais específicos =====

    window.relDedAbrirModalFornecedor = function () {
        if (_st.fornecedoresDisponiveis.length) {
            _abrirModalFornecedorComDados();
            return;
        }
        if (_st._carregandoFornecedores) return;
        _st._carregandoFornecedores = true;
        _abrirModal('Selecionar Fornecedores', [], _st.fornecedoresSel.map(function (f) { return f.cnpj; }), null, true);

        db.collection('liquidacoes').get().then(function (snap) {
            var mapa = {};
            snap.docs.forEach(function (d) {
                var f = d.data().fornecedor;
                if (f && f.cnpj) {
                    var cnpj = soDigitos(f.cnpj);
                    if (cnpj && !mapa[cnpj]) mapa[cnpj] = { cnpj: cnpj, nome: f.nome || '' };
                }
            });
            _st.fornecedoresDisponiveis = Object.values(mapa).sort(function (a, b) {
                return String(a.nome || a.cnpj).localeCompare(String(b.nome || b.cnpj), 'pt-BR');
            });
            _st._carregandoFornecedores = false;
            _abrirModalFornecedorComDados();
        }).catch(function (e) {
            _st._carregandoFornecedores = false;
            console.error('Erro ao carregar fornecedores:', e);
            window.relDedFecharModal();
            alert('Não foi possível carregar a lista de fornecedores.');
        });
    };

    function _abrirModalFornecedorComDados() {
        var itens = _st.fornecedoresDisponiveis.map(function (f) {
            return { valor: f.cnpj, label: (f.nome || '(sem nome)') + ' — ' + f.cnpj };
        });
        _abrirModal('Selecionar Fornecedores', itens,
            _st.fornecedoresSel.map(function (f) { return f.cnpj; }),
            function (sels) {
                _st.fornecedoresSel = sels.map(function (cnpj) {
                    var found = _st.fornecedoresDisponiveis.find(function (f) { return f.cnpj === cnpj; });
                    return found || { cnpj: cnpj, nome: cnpj };
                });
                _atualizarResumos();
            }
        );
    }

    window.relDedAbrirModalTipo = function () {
        _abrirModal('Selecionar Tipos de Imposto',
            TIPOS_DISPONIVEIS.map(function (t) { return { valor: t.valor, label: t.label }; }),
            _st.tiposSel.slice(),
            function (sels) { _st.tiposSel = sels; _atualizarResumos(); }
        );
    };

    window.relDedAbrirModalCodigo = function () {
        if (_st.codigosDisponiveis.length) {
            _abrirModalCodigoComDados();
            return;
        }
        if (_st._carregandoCodigos) return;
        _st._carregandoCodigos = true;
        _abrirModal('Selecionar Códigos de Imposto', [], _st.codigosSel.slice(), null, true);

        db.collection('deducoesEncargos').orderBy('codigo').get().then(function (snap) {
            var vistos = {};
            _st.codigosDisponiveis = snap.docs.map(function (d) {
                var data = d.data();
                return { codigo: data.codigo || d.id, descricao: data.descricao || '' };
            }).filter(function (c) {
                if (!c.codigo || vistos[c.codigo]) return false;
                vistos[c.codigo] = true;
                return true;
            });
            _st._carregandoCodigos = false;
            _abrirModalCodigoComDados();
        }).catch(function (e) {
            _st._carregandoCodigos = false;
            console.error('Erro ao carregar códigos:', e);
            window.relDedFecharModal();
            alert('Não foi possível carregar a lista de códigos de imposto.');
        });
    };

    function _abrirModalCodigoComDados() {
        var itens = _st.codigosDisponiveis.map(function (c) {
            return { valor: c.codigo, label: c.codigo + (c.descricao ? ' — ' + c.descricao : '') };
        });
        _abrirModal('Selecionar Códigos de Imposto', itens, _st.codigosSel.slice(),
            function (sels) { _st.codigosSel = sels; _atualizarResumos(); }
        );
    }

    window.relDedAbrirModalEstado = function () {
        _abrirModal('Selecionar Estados da LP',
            ESTADOS_DISPONIVEIS.map(function (e) { return { valor: e.valor, label: e.label }; }),
            _st.estadosSel.slice(),
            function (sels) { _st.estadosSel = sels; _atualizarResumos(); }
        );
    };

    // ===== Carregamento de TCs em lote =====

    function _carregarTCsEmLote(ids) {
        if (!ids || !ids.length) return Promise.resolve({});
        var chunks = [];
        for (var i = 0; i < ids.length; i += 30) chunks.push(ids.slice(i, i + 30));
        return Promise.all(chunks.map(function (chunk) {
            return db.collection('titulos')
                .where(firebase.firestore.FieldPath.documentId(), 'in', chunk)
                .get();
        })).then(function (snaps) {
            var map = {};
            snaps.forEach(function (snap) {
                snap.docs.forEach(function (d) {
                    map[d.id] = Object.assign({ id: d.id }, d.data());
                });
            });
            return map;
        });
    }

    // ===== Geração do relatório =====

    window.relDedGerarRelatorio = function () {
        var btn = qs('btnGerarRelDed');
        if (btn) { btn.disabled = true; btn.textContent = 'Gerando...'; }

        var periodo = (qs('relDedPeriodo') || {}).value || '30';
        var dataIni = '', dataFim = '';

        if (periodo === 'personalizado') {
            dataIni = (qs('relDedDataInicio') || {}).value || '';
            dataFim  = (qs('relDedDataFim')   || {}).value || '';
        } else {
            var iv = calcIntervalo(periodo);
            if (iv) { dataIni = iv.inicio; dataFim = iv.fim; }
        }

        var query = db.collection('liquidacoes');
        if (dataIni) query = query.where('dataLiquidacao', '>=', dataIni);
        if (dataFim)  query = query.where('dataLiquidacao', '<=', dataFim);

        query.get().then(function (snap) {
            var lps = snap.docs.map(function (d) { return Object.assign({ _id: d.id }, d.data()); });

            // Filtro por estado
            if (_st.estadosSel.length) {
                lps = lps.filter(function (lp) { return estadoLpCompatFiltro(lp.estado, _st.estadosSel); });
            }

            // Filtro por fornecedor
            if (_st.fornecedoresSel.length) {
                var cnpjsSel = _st.fornecedoresSel.map(function (f) { return f.cnpj; });
                lps = lps.filter(function (lp) {
                    return lp.fornecedor && cnpjsSel.indexOf(soDigitos(lp.fornecedor.cnpj)) >= 0;
                });
            }

            // Coletar IDs de TCs únicos
            var allTcIds = [];
            lps.forEach(function (lp) {
                (lp.tcsIds || []).forEach(function (id) {
                    if (id && allTcIds.indexOf(id) < 0) allTcIds.push(id);
                });
            });

            return _carregarTCsEmLote(allTcIds).then(function (tcMap) {
                return { lps: lps, tcMap: tcMap };
            });
        }).then(function (res) {
            _st.resultados = _construirLinhas(res.lps, res.tcMap);
            _st.paginaAtual = 1;
            _renderizarTabela();
            if (btn) { btn.disabled = false; btn.textContent = 'Gerar Relatório'; }
        }).catch(function (e) {
            console.error('Erro ao gerar relatório:', e);
            if (btn) { btn.disabled = false; btn.textContent = 'Gerar Relatório'; }
            alert('Erro ao carregar dados: ' + (e.message || e));
        });
    };

    function _construirLinhas(lps, tcMap) {
        var linhas = [];

        lps.forEach(function (lp) {
            var tcIds = lp.tcsIds || [];
            var tcs   = tcIds.map(function (id) { return tcMap[id]; }).filter(Boolean);
            var valorBruto = tcs.reduce(function (s, t) {
                return s + (Number(t.valorNotaFiscal != null ? t.valorNotaFiscal : (t.valor != null ? t.valor : 0)) || 0);
            }, 0);
            var lpCnpj = soDigitos((lp.fornecedor || {}).cnpj || '');
            var lpNome = (lp.fornecedor || {}).nome || '—';

            var statusLp = labelStatusLp(lp.estado);
            var dataIso  = toIsoSortData(lp.dataLiquidacao);

            tcs.forEach(function (tc) {
                var proc      = tc.idProc || tc.proc || tc.id || '—';
                var docOrigem = extrairDocOrigem(tc);
                var valorProc = Number(tc.valorNotaFiscal != null ? tc.valorNotaFiscal : (tc.valor != null ? tc.valor : 0)) || 0;
                var deducoes  = (tc.deducoesAplicadas || tc.tributacoes || []).slice();

                if (_st.tiposSel.length) {
                    deducoes = deducoes.filter(function (d) { return _st.tiposSel.indexOf(d.tipo) >= 0; });
                }
                if (_st.codigosSel.length) {
                    deducoes = deducoes.filter(function (d) {
                        return _st.codigosSel.indexOf(d.codigo) >= 0 ||
                               _st.codigosSel.indexOf(d.codReceita) >= 0;
                    });
                }

                deducoes.forEach(function (d) {
                    var base = Number(d.baseCalculo != null ? d.baseCalculo : (d.base != null ? d.base : 0)) || 0;
                    var aliq = Number(d.aliquota   != null ? d.aliquota   : (d.aliq  != null ? d.aliq  : 0)) || 0;
                    var val  = valorDeducaoDe(d, base, aliq);
                    var natRend     = d.natRendimento || d.natRed || '—';
                    var codRec      = d.codReceita    || d.codigo || '—';
                    var situacao    = d.tipo || '—';
                    var nomeImposto = d.descricao || TIPO_LABEL[d.tipo] || d.tipo || '—';

                    linhas.push({
                        lp:                 lp.codigo || '—',
                        np:                 lp.np || '—',
                        dataLiquidacao:     fmtDataISO(lp.dataLiquidacao),
                        dataLiquidacaoIso:  dataIso,
                        valorBruto:         valorBruto,
                        cnpj:               lpCnpj || '—',
                        nomeFornecedor:     lpNome,
                        proc:               proc,
                        docOrigem:          docOrigem,
                        valorProc:          valorProc,
                        baseCalculo:        base,
                        aliquota:           aliq,
                        valorDeducao:       val,
                        natRendimento:      natRend,
                        codReceita:         codRec,
                        situacao:           situacao,
                        nomeImposto:        nomeImposto,
                        statusLp:           statusLp
                    });
                });
            });
        });

        return linhas;
    }

    // ===== Ordenação e paginação =====

    function _atualizarIconesOrdenacao() {
        document.querySelectorAll('[id^="sort-relDed-"]').forEach(function (el) { el.textContent = ''; });
        var col = _st.ordenacao.coluna;
        var iconEl = document.getElementById('sort-relDed-' + col);
        if (iconEl) iconEl.textContent = _st.ordenacao.direcao === 'asc' ? '▲' : '▼';
    }

    function _ordenarResultados(arr) {
        var col = _st.ordenacao.coluna;
        var dir = _st.ordenacao.direcao;
        var num = !!COLUNAS_NUMERICAS_SORT[col];
        return arr.slice().sort(function (a, b) {
            var valA = a[col];
            var valB = b[col];
            if (num) {
                valA = Number(valA);
                valB = Number(valB);
                if (isNaN(valA)) valA = 0;
                if (isNaN(valB)) valB = 0;
            } else {
                valA = String(valA == null ? '' : valA).toLowerCase();
                valB = String(valB == null ? '' : valB).toLowerCase();
            }
            if (valA < valB) return dir === 'asc' ? -1 : 1;
            if (valA > valB) return dir === 'asc' ? 1 : -1;
            return 0;
        });
    }

    window.relDedOrdenar = function (coluna) {
        if (_st.ordenacao.coluna === coluna) {
            _st.ordenacao.direcao = _st.ordenacao.direcao === 'asc' ? 'desc' : 'asc';
        } else {
            _st.ordenacao.coluna = coluna;
            _st.ordenacao.direcao = 'asc';
        }
        _st.paginaAtual = 1;
        _atualizarIconesOrdenacao();
        _renderizarTabela();
    };

    window.relDedMudarTamanhoPagina = function () {
        var sel = qs('itensPorPaginaRelDed');
        _st.itensPorPagina = sel ? parseInt(sel.value, 10) || 10 : 10;
        _st.paginaAtual = 1;
        _renderizarTabela();
    };

    window.relDedMudarPagina = function (direcao) {
        var total = _st.resultados.length;
        var totalPaginas = Math.max(1, Math.ceil(total / _st.itensPorPagina));
        if (direcao === 'primeiro') _st.paginaAtual = 1;
        else if (direcao === 'ultimo') _st.paginaAtual = totalPaginas;
        else _st.paginaAtual += (direcao || 0);
        _renderizarTabela();
    };

    // ===== Renderização da grade =====

    function _renderizarTabela() {
        var card     = qs('relDedResultadosCard');
        var tbody    = qs('tbodyRelDed');
        var msgVazio = qs('relDedMsgVazio');
        if (!card || !tbody) return;

        card.style.display = '';
        var totalRegistros = _st.resultados.length;

        if (!totalRegistros) {
            if (msgVazio) msgVazio.style.display = '';
            tbody.innerHTML = '';
            _atualizarControlesPaginacao(0, 0, 1, 1);
            return;
        }

        if (msgVazio) msgVazio.style.display = 'none';

        var ordenados = _ordenarResultados(_st.resultados);
        var totalPaginas = Math.max(1, Math.ceil(totalRegistros / _st.itensPorPagina));
        var pagina = Math.min(Math.max(1, _st.paginaAtual), totalPaginas);
        _st.paginaAtual = pagina;
        var inicio = (pagina - 1) * _st.itensPorPagina;
        var paginaItens = ordenados.slice(inicio, inicio + _st.itensPorPagina);

        tbody.innerHTML = paginaItens.map(function (r) {
            return '<tr>' +
                '<td>' + _esc(r.lp) + '</td>' +
                '<td>' + _esc(r.np) + '</td>' +
                '<td>' + _esc(r.dataLiquidacao) + '</td>' +
                '<td style="text-align:right;">' + moedaBR(r.valorBruto) + '</td>' +
                '<td>' + _esc(r.cnpj) + '</td>' +
                '<td>' + _esc(r.nomeFornecedor) + '</td>' +
                '<td>' + _esc(r.proc) + '</td>' +
                '<td>' + _esc(r.docOrigem) + '</td>' +
                '<td style="text-align:right;">' + moedaBR(r.valorProc) + '</td>' +
                '<td style="text-align:right;">' + moedaBR(r.baseCalculo) + '</td>' +
                '<td style="text-align:right;">' + fmtAliquota(r.aliquota) + '</td>' +
                '<td style="text-align:right;">' + moedaBR(r.valorDeducao) + '</td>' +
                '<td>' + _esc(r.natRendimento) + '</td>' +
                '<td>' + _esc(r.codReceita) + '</td>' +
                '<td>' + _esc(r.situacao) + '</td>' +
                '<td>' + _esc(r.nomeImposto) + '</td>' +
                '<td>' + _esc(r.statusLp) + '</td>' +
                '</tr>';
        }).join('');

        _atualizarControlesPaginacao(totalRegistros, inicio, pagina, totalPaginas);
        _atualizarIconesOrdenacao();
    }

    function _atualizarControlesPaginacao(total, inicio, pagina, totalPaginas) {
        var mostrando = qs('mostrandoRelDed');
        var info = qs('infoPaginaRelDed');
        var btnAnt = qs('btnAnteriorRelDed');
        var btnProx = qs('btnProximoRelDed');
        var btnPrim = qs('btnPrimeiroRelDed');
        var btnUlt = qs('btnUltimoRelDed');
        if (mostrando) {
            mostrando.textContent = total === 0
                ? 'Mostrando 0 de 0 registros'
                : 'Mostrando ' + (inicio + 1) + ' de ' + total + ' registros';
        }
        if (info) info.textContent = 'Página ' + pagina + ' de ' + totalPaginas;
        if (btnAnt) btnAnt.disabled = pagina <= 1;
        if (btnProx) btnProx.disabled = pagina >= totalPaginas;
        if (btnPrim) btnPrim.disabled = pagina <= 1;
        if (btnUlt) btnUlt.disabled = pagina >= totalPaginas;
    }

    // ===== Exportação =====

    window.relDedExportar = function (formato) {
        if (!_st.resultados.length) {
            alert('Nenhum dado para exportar. Gere o relatório primeiro.');
            return;
        }

        var cabecalhos = COLUNAS_RELATORIO;
        var dados = _ordenarResultados(_st.resultados).map(linhaParaExportacao);

        var nome = 'relatorio-deducoes-impostos-' + new Date().toISOString().slice(0, 10);

        if (formato === 'csv') {
            _exportarCSV(cabecalhos, dados, nome + '.csv');
        } else if (formato === 'xlsx') {
            _exportarXLSX(cabecalhos, dados, nome + '.xlsx');
        } else if (formato === 'pdf') {
            _exportarPDF(cabecalhos, dados, nome + '.pdf');
        }
    };

    function _downloadBlob(blob, filename) {
        var url = URL.createObjectURL(blob);
        var a   = document.createElement('a');
        a.href  = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
    }

    // CSV (separador ;, BOM UTF-8)
    function _exportarCSV(cabecalhos, dados, filename) {
        function escaparCampo(v) {
            var s = String(v == null ? '' : v).replace(/"/g, '""');
            return (s.indexOf(';') >= 0 || s.indexOf('"') >= 0 || s.indexOf('\n') >= 0)
                ? '"' + s + '"' : s;
        }
        var linhas = [cabecalhos.map(escaparCampo).join(';')];
        dados.forEach(function (row) {
            linhas.push(row.map(escaparCampo).join(';'));
        });
        var blob = new Blob(['\uFEFF' + linhas.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
        _downloadBlob(blob, filename);
    }

    // Excel (SheetJS)
    function _exportarXLSX(cabecalhos, dados, filename) {
        if (typeof XLSX === 'undefined') {
            alert('Biblioteca Excel (SheetJS) não disponível.');
            return;
        }
        var aoa = [cabecalhos].concat(dados);
        var ws  = XLSX.utils.aoa_to_sheet(aoa);
        var wb  = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Deduções e Impostos');
        XLSX.writeFile(wb, filename);
    }

    // PDF (jsPDF) — layout paisagem A4
    function _exportarPDF(cabecalhos, dados, filename) {
        if (!window.jspdf || !window.jspdf.jsPDF) {
            alert('Biblioteca PDF (jsPDF) não disponível.');
            return;
        }
        var jsPDF = window.jspdf.jsPDF;
        var doc   = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

        var pageW = doc.internal.pageSize.getWidth();
        var pageH = doc.internal.pageSize.getHeight();
        var margin = 8;
        var y = margin + 8;

        // Cabeçalho do documento
        doc.setFontSize(11);
        doc.setFont(undefined, 'bold');
        doc.text('Relatório de Deduções e Impostos', margin, y);
        y += 5;
        doc.setFontSize(8);
        doc.setFont(undefined, 'normal');
        doc.text('Emitido em: ' + new Date().toLocaleDateString('pt-BR') + ' ' +
            new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }), margin, y);
        y += 7;

        // Proporções de colunas (17 colunas, soma = 1)
        var proporcoes = [
            0.055, 0.04, 0.055, 0.06, 0.065, 0.08, 0.055, 0.04, 0.055,
            0.055, 0.04, 0.055, 0.055, 0.05, 0.05, 0.07, 0.06
        ];
        var usavel    = pageW - 2 * margin;
        var colWidths = proporcoes.map(function (p) { return p * usavel; });
        var rowH      = 5.5;
        var headerH   = 7;

        function desenharCabecalhoTabela(yPos) {
            doc.setFillColor(52, 100, 160);
            doc.rect(margin, yPos, usavel, headerH, 'F');
            doc.setTextColor(255, 255, 255);
            doc.setFontSize(6);
            doc.setFont(undefined, 'bold');
            var x = margin;
            cabecalhos.forEach(function (h, i) {
                doc.text(h, x + 1, yPos + 4.8, { maxWidth: colWidths[i] - 2 });
                x += colWidths[i];
            });
            doc.setTextColor(0, 0, 0);
            return yPos + headerH;
        }

        y = desenharCabecalhoTabela(y);

        dados.forEach(function (row, ridx) {
            if (y + rowH > pageH - margin) {
                doc.addPage();
                y = margin + 4;
                y = desenharCabecalhoTabela(y);
            }

            if (ridx % 2 === 1) {
                doc.setFillColor(243, 247, 255);
                doc.rect(margin, y, usavel, rowH, 'F');
            }

            var x = margin;
            doc.setFontSize(6);
            doc.setFont(undefined, 'normal');

            row.forEach(function (cell, i) {
                var w = colWidths[i];
                var texto = String(cell == null ? '' : cell);
                doc.text(texto, x + 1, y + 3.8, { maxWidth: w - 2 });
                x += w;
            });

            doc.setDrawColor(210, 215, 220);
            doc.line(margin, y + rowH, margin + usavel, y + rowH);
            doc.setDrawColor(0, 0, 0);
            y += rowH;
        });

        // Numeração de páginas
        var totalPages = doc.internal.getNumberOfPages();
        for (var p = 1; p <= totalPages; p++) {
            doc.setPage(p);
            doc.setFontSize(7);
            doc.setTextColor(130);
            doc.text('Página ' + p + ' de ' + totalPages, pageW - margin - 22, pageH - 4);
            doc.setTextColor(0);
        }

        doc.save(filename);
    }

    // ===== Inicialização =====
    _atualizarResumos();
    var selPag = qs('itensPorPaginaRelDed');
    if (selPag) _st.itensPorPagina = parseInt(selPag.value, 10) || 10;
    _atualizarIconesOrdenacao();
})();
