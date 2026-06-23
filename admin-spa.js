// ==========================================
// ADMIN SPA - Usuários, Perfis, OI (usa admin-utils.js para máscaras/validações)
// ==========================================
(function() {
    if (!document.getElementById('corpo-admin')) return;
    if (window.__adminSpaLoaded) return;
    window.__adminSpaLoaded = true;

    const COLUNAS_ACOES = ['ler', 'inserir', 'editar', 'status', 'cancelar', 'excluir'];
    const ACOES_CRUD_COMPLETO = ['ler', 'inserir', 'editar', 'status', 'cancelar', 'excluir'];
    const ACOES_SOMENTE_LER = ['ler'];
    const MATRIZ_MODULOS = [
        { modulo: 'dashboard', label: 'Dashboard', acoes: ACOES_SOMENTE_LER },
        { modulo: 'titulos', label: 'Titulos de Credito', acoes: ACOES_CRUD_COMPLETO },
        { modulo: 'liquidacao', label: 'Liquidação e Pag. (Beta)', acoes: ACOES_CRUD_COMPLETO },
        { modulo: 'empenhos', label: 'Empenhos (NE)', acoes: ACOES_CRUD_COMPLETO },
        { modulo: 'lf', label: 'LF x PF', acoes: ACOES_CRUD_COMPLETO },
        { modulo: 'op', label: 'Pagamento (OP)', acoes: ACOES_CRUD_COMPLETO },
        { modulo: 'dedenc', label: 'Deducoes e Encargos', acoes: ACOES_CRUD_COMPLETO },
        { modulo: 'contratos', label: 'Contratos', acoes: ACOES_CRUD_COMPLETO },
        { modulo: 'fornecedores', label: 'Fornecedores', acoes: ACOES_CRUD_COMPLETO },
        { modulo: 'usuarios', label: 'Admin - Usuarios', acoes: ACOES_CRUD_COMPLETO },
        { modulo: 'perfis', label: 'Admin - Perfis', acoes: ACOES_CRUD_COMPLETO },
        { modulo: 'oi', label: 'Admin - OI', acoes: ACOES_CRUD_COMPLETO },
        { modulo: 'centrocustos', label: 'Centro de Custos', acoes: ACOES_CRUD_COMPLETO },
        { modulo: 'ug', label: 'Unidade Gestora (UG)', acoes: ACOES_CRUD_COMPLETO },
        { modulo: 'backup', label: 'Backup Global', acoes: ACOES_SOMENTE_LER },
        { modulo: 'relatorios', label: 'Relatórios', acoes: ACOES_SOMENTE_LER }
    ];
    const ORDEM_PAINEIS = ['usuarios', 'pendentes', 'perfis', 'oi', 'cadastrar'];
    const PERMISSOES_PAINEL = {
        usuarios: ['acesso_admin', 'usuarios_ler'],
        pendentes: ['acesso_admin', 'admin_pendentes_ler'],
        perfis: ['acesso_admin'],
        oi: ['acesso_admin', 'oi_ler'],
        cadastrar: ['acesso_admin', 'admin_cadastrar_usuario', 'usuarios_inserir', 'usuarios_editar']
    };

    let listaUsuarios = [];
    let listaPendentes = [];
    let listaPerfis = [];
    let listaOI = [];

    const estadoGrid = {
        usuarios: { pagina: 1, itensPorPagina: 10, termo: '', status: 'todos' },
        pendentes: { pagina: 1, itensPorPagina: 10, termo: '' },
        perfis: { pagina: 1, itensPorPagina: 10, termo: '' },
        oi: { pagina: 1, itensPorPagina: 10, termo: '', situacao: 'todas' }
    };

    function adminLoading(mostrar) {
        if (typeof window.mostrarLoading !== 'function' || typeof window.esconderLoading !== 'function') {
            const el = document.getElementById('adminLoading');
            if (el) el.classList.toggle('visivel', !!mostrar);
            return;
        }
        if (mostrar) window.mostrarLoading('Carregando...');
        else window.esconderLoading();
    }

    function btnLoading(btn, mostrar, textoLoading) {
        if (!btn) return;
        const txt = textoLoading || 'Processando...';
        if (mostrar) {
            btn.disabled = true;
            btn.classList.add('btn-loading');
            btn.dataset.origText = btn.textContent;
            btn.textContent = txt;
        } else {
            btn.disabled = false;
            btn.classList.remove('btn-loading');
            if (btn.dataset.origText) btn.textContent = btn.dataset.origText;
        }
    }
    window.adminLoading = adminLoading;
    window.btnLoading = btnLoading;

    function possuiAlgumaPermissao(permissoes) {
        if (!Array.isArray(permissoes) || permissoes.length === 0) return false;
        if (typeof window.temAlgumaPermissaoUI === 'function') return window.temAlgumaPermissaoUI(permissoes);
        if (typeof window.temPermissaoUI !== 'function') return false;
        return permissoes.some(p => window.temPermissaoUI(p));
    }

    function podeAcessarPainel(painel) {
        const req = PERMISSOES_PAINEL[painel] || [];
        return possuiAlgumaPermissao(req);
    }

    function primeiraAbaPermitida() {
        for (let i = 0; i < ORDEM_PAINEIS.length; i += 1) {
            if (podeAcessarPainel(ORDEM_PAINEIS[i])) return ORDEM_PAINEIS[i];
        }
        return null;
    }

    function normalizarAbaDesejada(aba) {
        if (aba && ORDEM_PAINEIS.includes(aba) && podeAcessarPainel(aba)) return aba;
        return primeiraAbaPermitida();
    }

    function atualizarTabsAdminVisiveis() {
        document.querySelectorAll('.admin-tab[data-painel]').forEach(tab => {
            const painel = tab.getAttribute('data-painel');
            const permitido = podeAcessarPainel(painel);
            tab.style.display = permitido ? '' : 'none';
            tab.disabled = !permitido;
        });
    }

    function atualizarMenuAdminAtivo(painel) {
        document.querySelectorAll('a.menu-secao-admin').forEach(link => {
            const alvo = link.getAttribute('data-aba-admin');
            link.classList.toggle('active', alvo === painel);
        });
    }

    function atualizarFeedbackUsuario(msg, tipo) {
        const el = document.getElementById('adminUsuarioFluxoAviso');
        if (!el) return;
        if (!msg) {
            el.style.display = 'none';
            el.textContent = '';
            el.className = 'admin-feedback';
            return;
        }
        el.textContent = msg;
        el.className = 'admin-feedback ' + (tipo ? ('admin-feedback-' + tipo) : 'admin-feedback-info');
        el.style.display = 'block';
    }
    window.mostrarFeedbackAdminUsuario = atualizarFeedbackUsuario;

    function atualizarAvisoPerfilPadrao(msg) {
        const el = document.getElementById('adminPerfilPadraoAviso');
        if (!el) return;
        if (!msg) {
            el.style.display = 'none';
            el.textContent = '';
            return;
        }
        el.textContent = msg;
        el.style.display = 'block';
    }
    window.mostrarAvisoPerfilPadrao = atualizarAvisoPerfilPadrao;

    function sincronizarSelectPerfilAtual(preferido, exibirAviso) {
        const select = document.getElementById('adminUsuarioPerfilAtual');
        if (!select) return;
        const checkboxes = Array.from(document.querySelectorAll('.cb-perfil-usuario'));
        const marcados = checkboxes.filter(cb => cb.checked).map(cb => cb.value);
        const atual = preferido || select.value || '';

        select.innerHTML = '';
        if (marcados.length === 0) {
            const opt = document.createElement('option');
            opt.value = '';
            opt.textContent = '-- Selecione um perfil --';
            select.appendChild(opt);
            atualizarAvisoPerfilPadrao('');
            return;
        }

        marcados.forEach(p => {
            const opt = document.createElement('option');
            opt.value = p;
            const perfilObj = listaPerfis.find(x => x.id === p);
            opt.textContent = typeof window.labelPerfil === 'function' ? window.labelPerfil(perfilObj || p) : p;
            select.appendChild(opt);
        });

        if (marcados.includes(atual)) {
            select.value = atual;
            atualizarAvisoPerfilPadrao('');
            return;
        }

        select.value = marcados[0];
        if (exibirAviso) {
            atualizarAvisoPerfilPadrao('Perfil padrao ajustado automaticamente para um dos perfis atribuidos.');
        }
    }

    function prepararFormularioUsuarioParaNovo() {
        const form = document.getElementById('formUsuarioAdmin');
        if (form) form.reset();
        const uidInput = document.getElementById('adminUsuarioUid');
        if (uidInput) uidInput.value = '';
        document.querySelectorAll('.cb-perfil-usuario').forEach(cb => { cb.checked = false; });
        sincronizarSelectPerfilAtual('', false);
        atualizarAvisoPerfilPadrao('');
    }

    function mostrarPainelAdmin(painel, opcoes) {
        const opts = opcoes || {};
        const painelSeguro = normalizarAbaDesejada(painel);
        if (!painelSeguro) {
            alert('Acesso negado ao modulo Admin.');
            window.location.replace('dashboard.html');
            return;
        }
        if (painel !== painelSeguro && !opts.silent) {
            alert('Sem permissao para esta aba. Exibindo a primeira aba permitida.');
        }

        document.querySelectorAll('.admin-tab[data-painel]').forEach(t => {
            const id = t.getAttribute('data-painel');
            const sel = id === painelSeguro;
            t.classList.toggle('ativo', sel);
            t.setAttribute('aria-selected', sel ? 'true' : 'false');
            t.setAttribute('tabindex', sel ? '0' : '-1');
        });
        document.querySelectorAll('.admin-painel').forEach(p => {
            const match = p.id === ('painel-' + painelSeguro);
            p.classList.toggle('visivel', match);
            p.setAttribute('aria-hidden', match ? 'false' : 'true');
        });

        if (painelSeguro === 'cadastrar') {
            const uidInput = document.getElementById('adminUsuarioUid');
            const senhaInicialGroup = document.getElementById('formGroupSenhaInicial');
            const senhaAdminGroup = document.getElementById('formGroupSenhaAdmin');
            const ehNovo = !(uidInput && uidInput.value && uidInput.value.trim());
            if (senhaInicialGroup) senhaInicialGroup.style.display = ehNovo ? 'block' : 'none';
            if (senhaAdminGroup) senhaAdminGroup.style.display = ehNovo ? 'block' : 'none';
            const senhaInicial = document.getElementById('adminUsuarioSenhaInicial');
            if (senhaInicial) {
                senhaInicial.required = !!ehNovo;
                if (!ehNovo) senhaInicial.value = '';
            }
        }

        atualizarMenuAdminAtivo(painelSeguro);
        if (!opts.skipHistory && typeof history.pushState === 'function') {
            history.pushState({}, '', 'admin.html?aba=' + painelSeguro);
        }
    }

    window.mostrarPainelAdmin = mostrarPainelAdmin;
    window.abrirPainelAdminPorRota = function(aba) {
        mostrarPainelAdmin(aba, { skipHistory: true, silent: true });
    };

    function statusUsuario(u) {
        if (u.bloqueado === true || u.status === 'bloqueado') return 'bloqueado';
        if (u.status === 'pendente' || (!(u.perfis && u.perfis.length) && !u.perfil)) return 'pendente';
        return 'ativo';
    }

    function paginar(lista, estado) {
        const totalPaginas = Math.max(1, Math.ceil(lista.length / estado.itensPorPagina));
        estado.pagina = Math.min(Math.max(1, estado.pagina), totalPaginas);
        const inicio = (estado.pagina - 1) * estado.itensPorPagina;
        const fim = inicio + estado.itensPorPagina;
        return { itens: lista.slice(inicio, fim), totalPaginas };
    }

    function desenharPaginacao(containerId, tipo, totalItens) {
        const el = document.getElementById(containerId);
        if (!el) return;
        const estado = estadoGrid[tipo];
        const totalPaginas = Math.max(1, Math.ceil(totalItens / estado.itensPorPagina));
        if (totalItens === 0) {
            el.innerHTML = '';
            return;
        }
        el.innerHTML = '';
        const info = document.createElement('span');
        info.textContent = 'Pagina ' + estado.pagina + ' de ' + totalPaginas + ' (' + totalItens + ' registro(s))';
        const btnPrev = document.createElement('button');
        btnPrev.type = 'button';
        btnPrev.textContent = 'Anterior';
        btnPrev.disabled = estado.pagina <= 1;
        btnPrev.addEventListener('click', () => window.mudarPaginaAdmin(tipo, estado.pagina - 1));
        const btnNext = document.createElement('button');
        btnNext.type = 'button';
        btnNext.textContent = 'Proxima';
        btnNext.disabled = estado.pagina >= totalPaginas;
        btnNext.addEventListener('click', () => window.mudarPaginaAdmin(tipo, estado.pagina + 1));
        el.appendChild(btnPrev);
        el.appendChild(info);
        el.appendChild(btnNext);
    }

    function getUsuariosFiltrados() {
        const est = estadoGrid.usuarios;
        const termo = est.termo.toLowerCase();
        return listaUsuarios.filter(u => {
            const perfis = Array.isArray(u.perfis) ? u.perfis : (u.perfil ? [u.perfil] : []);
            const st = statusUsuario(u);
            const bateTermo = !termo
                || ((u.email || '').toLowerCase().includes(termo))
                || ((u.id || '').toLowerCase().includes(termo))
                || perfis.some(p => (p || '').toLowerCase().includes(termo))
                || ((u.nomeCompleto || '').toLowerCase().includes(termo));
            const bateStatus = est.status === 'todos' || st === est.status;
            return bateTermo && bateStatus;
        });
    }

    function getPendentesFiltrados() {
        const termo = estadoGrid.pendentes.termo.toLowerCase();
        return listaPendentes.filter(u => {
            if (!termo) return true;
            return ((u.email || '').toLowerCase().includes(termo))
                || ((u.nomeCompleto || u.displayName || '').toLowerCase().includes(termo))
                || ((u.origem || '').toLowerCase().includes(termo));
        });
    }

    function getPerfisFiltrados() {
        const termo = estadoGrid.perfis.termo.toLowerCase();
        return listaPerfis.filter(p => {
            if (!termo) return true;
            const perms = Array.isArray(p.permissoes) ? p.permissoes.join(' ') : '';
            const nomeExib = (p.nomeExibicao || '').toLowerCase();
            return p.id.toLowerCase().includes(termo) || nomeExib.includes(termo) || perms.toLowerCase().includes(termo);
        });
    }

    function getOIFiltrados() {
        const est = estadoGrid.oi;
        const termo = est.termo.toLowerCase();
        return listaOI.filter(o => {
            const bateSituacao = est.situacao === 'todas' || (o.situacao || '') === est.situacao;
            const bateTermo = !termo
                || ((o.numeroOI || '').toLowerCase().includes(termo))
                || ((o.nomeOI || '').toLowerCase().includes(termo))
                || ((o.contatoOI || '').toLowerCase().includes(termo))
                || ((o.telefoneOI || '').toLowerCase().includes(termo));
            return bateSituacao && bateTermo;
        });
    }

    function desenharTabelaUsuarios() {
        const tbody = document.getElementById('tbodyUsuarios');
        if (!tbody) return;
        const filtrados = getUsuariosFiltrados();
        const pag = paginar(filtrados, estadoGrid.usuarios);
        tbody.innerHTML = '';
        if (pag.itens.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">Nenhum usuario encontrado.</td></tr>';
            desenharPaginacao('paginacaoUsuarios', 'usuarios', 0);
            return;
        }
        pag.itens.forEach(u => {
            const tr = document.createElement('tr');
            const perfis = Array.isArray(u.perfis) ? u.perfis : (u.perfil ? [u.perfil] : []);
            const perfilAtual = u.perfil_ativo || u.perfilAtual || u.perfil || (perfis[0] || '-');
            const st = statusUsuario(u);
            const statusHtml = st === 'bloqueado' ? '<span class="status-bloqueado">Bloqueado</span>'
                : st === 'pendente' ? '<span class="status-pendente">Pendente</span>'
                    : '<span class="status-ativo">Ativo</span>';
            const podeStatusUsuario = (typeof window.temPermissaoUI === 'function' && window.temPermissaoUI('usuarios_status'))
                || (typeof window.temPermissaoUI === 'function' && window.temPermissaoUI('usuarios_editar'))
                || (typeof window.temPermissaoUI === 'function' && window.temPermissaoUI('acesso_admin'));
            const btnBloquear = podeStatusUsuario
                ? `<button type="button" class="btn-outline btn-small btn-bloquear-usuario" data-uid="${escapeHTML(u.id)}" data-acao="${st === 'bloqueado' ? 'desbloquear' : 'bloquear'}">${st === 'bloqueado' ? 'Desbloquear' : 'Bloquear'}</button>`
                : '';
            const perfisLabels = perfis.map(pid => {
                const po = listaPerfis.find(x => x.id === pid);
                return typeof window.labelPerfil === 'function' ? window.labelPerfil(po || pid) : pid;
            });
            const perfilAtualLabel = (() => {
                const po = listaPerfis.find(x => x.id === perfilAtual);
                return typeof window.labelPerfil === 'function' ? window.labelPerfil(po || perfilAtual) : perfilAtual;
            })();
            tr.innerHTML = `
                <td><code class="uid-preview">${escapeHTML((u.id || '').substring(0, 12))}...</code></td>
                <td>${escapeHTML(u.email || '-')}</td>
                <td style="font-size:12px;">${escapeHTML(perfisLabels.join(', ') || '-')}</td>
                <td><strong>${escapeHTML(perfilAtualLabel)}</strong></td>
                <td>${statusHtml}</td>
                <td>
                    <button type="button" class="btn-icon btn-editar-usuario" data-uid="${escapeHTML(u.id)}" title="Editar" aria-label="Editar usuario">✏️</button>
                    ${btnBloquear}
                </td>`;
            tbody.appendChild(tr);
        });
        tbody.querySelectorAll('.btn-editar-usuario').forEach(btn => btn.addEventListener('click', function() { adminEditarUsuario(this.getAttribute('data-uid')); }));
        tbody.querySelectorAll('.btn-bloquear-usuario').forEach(btn => btn.addEventListener('click', function() {
            const uid = this.getAttribute('data-uid');
            if (this.getAttribute('data-acao') === 'bloquear') adminBloquearUsuario(uid, this);
            else adminDesbloquearUsuario(uid, this);
        }));
        desenharPaginacao('paginacaoUsuarios', 'usuarios', filtrados.length);
    }

    function desenharTabelaPendentes() {
        const tbody = document.getElementById('tbodyPendentes');
        if (!tbody) return;
        const filtrados = getPendentesFiltrados();
        const pag = paginar(filtrados, estadoGrid.pendentes);
        tbody.innerHTML = '';
        if (pag.itens.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Nenhum usuario aguardando aprovacao.</td></tr>';
            desenharPaginacao('paginacaoPendentes', 'pendentes', 0);
            return;
        }
        pag.itens.forEach(u => {
            const tr = document.createElement('tr');
            const criado = u.criadoEm && u.criadoEm.toDate ? u.criadoEm.toDate().toLocaleString('pt-BR') : '-';
            tr.innerHTML = `
                <td>${escapeHTML(u.email || '-')}</td>
                <td>${escapeHTML(u.nomeCompleto || u.displayName || '-')}</td>
                <td><span class="status-ativo">${escapeHTML(u.origem || '-')}</span></td>
                <td>${criado}</td>
                <td>
                    <button type="button" class="btn-icon btn-aprovar-usuario" data-uid="${escapeHTML(u.id)}" title="Aprovar" aria-label="Aprovar cadastro e atribuir perfis">✓</button>
                    <button type="button" class="btn-icon btn-rejeitar-usuario" data-uid="${escapeHTML(u.id)}" title="Rejeitar" aria-label="Rejeitar cadastro e bloquear usuario">✗</button>
                </td>`;
            tbody.appendChild(tr);
        });
        tbody.querySelectorAll('.btn-aprovar-usuario').forEach(btn => btn.addEventListener('click', function() { adminAprovarUsuario(this.getAttribute('data-uid')); }));
        tbody.querySelectorAll('.btn-rejeitar-usuario').forEach(btn => btn.addEventListener('click', function() { adminRejeitarUsuario(this.getAttribute('data-uid')); }));
        desenharPaginacao('paginacaoPendentes', 'pendentes', filtrados.length);
    }

    function desenharTabelaPerfis() {
        const tbody = document.getElementById('tbodyPerfis');
        if (!tbody) return;
        const filtrados = getPerfisFiltrados();
        const pag = paginar(filtrados, estadoGrid.perfis);
        tbody.innerHTML = '';
        if (pag.itens.length === 0) {
            tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;">Nenhum perfil encontrado.</td></tr>';
            desenharPaginacao('paginacaoPerfis', 'perfis', 0);
            return;
        }
        pag.itens.forEach(p => {
            const tr = document.createElement('tr');
            const perms = Array.isArray(p.permissoes) ? p.permissoes.join(', ') : '-';
            const nomeLbl = typeof window.labelPerfil === 'function' ? window.labelPerfil(p) : (p.nomeExibicao || p.id);
            tr.innerHTML = `
                <td><strong>${escapeHTML(nomeLbl)}</strong><br><code class="perfil-id-code">${escapeHTML(p.id)}</code></td>
                <td style="font-size:12px;">${escapeHTML(perms)}</td>
                <td><button type="button" class="btn-icon btn-editar-perfil" data-perfil="${escapeHTML(p.id)}" title="Editar" aria-label="Editar perfil de acesso">✏️</button></td>`;
            tbody.appendChild(tr);
        });
        tbody.querySelectorAll('.btn-editar-perfil').forEach(btn => btn.addEventListener('click', function() { adminEditarPerfil(this.getAttribute('data-perfil')); }));
        desenharPaginacao('paginacaoPerfis', 'perfis', filtrados.length);
    }

    function desenharTabelaOI() {
        const tbody = document.getElementById('tbodyOI');
        if (!tbody) return;
        const filtrados = getOIFiltrados();
        const pag = paginar(filtrados, estadoGrid.oi);
        tbody.innerHTML = '';
        if (pag.itens.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">Nenhuma OI encontrada.</td></tr>';
            desenharPaginacao('paginacaoOI', 'oi', 0);
            return;
        }
        pag.itens.forEach(o => {
            const tr = document.createElement('tr');
            const status = o.situacao === 'Ativo' ? '<span class="status-ativo">Ativo</span>' : '<span class="status-bloqueado">Inativo</span>';
            tr.innerHTML = `<td><strong>${escapeHTML(o.numeroOI || '-')}</strong></td>
                <td>${escapeHTML(o.nomeOI || '-')}</td>
                <td>${escapeHTML(o.contatoOI || '-')}</td>
                <td>${escapeHTML(o.telefoneOI || '-')}</td>
                <td>${status}</td>
                <td>
                    <button type="button" class="btn-icon btn-editar-oi" data-id="${escapeHTML(o.id)}" title="Editar" aria-label="Editar organizacao interna">✏️</button>
                    <button type="button" class="btn-icon btn-apagar-oi" data-id="${escapeHTML(o.id)}" title="Excluir" aria-label="Excluir organizacao interna">🗑️</button>
                </td>`;
            tbody.appendChild(tr);
        });
        tbody.querySelectorAll('.btn-editar-oi').forEach(btn => btn.addEventListener('click', function() { editarOI(this.getAttribute('data-id')); }));
        tbody.querySelectorAll('.btn-apagar-oi').forEach(btn => btn.addEventListener('click', function() { excluirOI(this.getAttribute('data-id')); }));
        desenharPaginacao('paginacaoOI', 'oi', filtrados.length);
    }

    function popularSelectOI() {
        const sel = document.getElementById('adminUsuarioOI');
        if (!sel) return;
        const oisAtivas = listaOI.filter(o => o.situacao === 'Ativo');
        const selecionado = sel.value || '';
        sel.innerHTML = '<option value="">-- Nenhum --</option>';
        oisAtivas.forEach(o => {
            const opt = document.createElement('option');
            opt.value = o.id;
            opt.textContent = (o.numeroOI || '') + ' - ' + (o.nomeOI || '');
            sel.appendChild(opt);
        });
        if (selecionado && oisAtivas.some(o => o.id === selecionado)) sel.value = selecionado;
    }

    function popularCheckboxesPerfis() {
        const container = document.getElementById('containerCheckboxesPerfis');
        if (!container) return;
        container.innerHTML = '';
        listaPerfis.forEach(p => {
            const lbl = document.createElement('label');
            lbl.style.display = 'block';
            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.className = 'cb-perfil-usuario';
            cb.value = p.id;
            const nomeLbl = typeof window.labelPerfil === 'function' ? window.labelPerfil(p) : (p.nomeExibicao || p.id);
            lbl.appendChild(cb);
            lbl.appendChild(document.createTextNode(' ' + nomeLbl));
            container.appendChild(lbl);
        });
        container.querySelectorAll('.cb-perfil-usuario').forEach(cb => {
            cb.addEventListener('change', () => sincronizarSelectPerfilAtual('', true));
        });
        sincronizarSelectPerfilAtual('', false);
    }

    function desenharMatrizPermissoes() {
        const tbody = document.getElementById('matrizPermissoes');
        if (!tbody) return;
        tbody.innerHTML = '';
        MATRIZ_MODULOS.forEach(m => {
            const tr = document.createElement('tr');
            let cells = '<td class="matriz-modulo"><strong>' + escapeHTML(m.label) + '</strong></td>';
            COLUNAS_ACOES.forEach(acao => {
                if (m.acoes.includes(acao)) {
                    const val = m.modulo + '_' + acao;
                    cells += '<td class="matriz-cb"><label class="matriz-cb-label"><input type="checkbox" class="cb-perm" value="' + escapeHTML(val) + '"></label></td>';
                } else {
                    cells += '<td class="matriz-vazio">-</td>';
                }
            });
            tr.innerHTML = cells;
            tbody.appendChild(tr);
        });
        desenharMatrizEventosFluxo();
        desenharPermissoesTransversais();
    }

    function desenharMatrizEventosFluxo() {
        const container = document.getElementById('matrizEventosFluxo');
        if (!container || typeof window.RBACEventos === 'undefined') return;
        const catalogo = window.RBACEventos;
        const eventos = catalogo.EVENTOS_FLUXO || [];
        if (!eventos.length) { container.innerHTML = ''; return; }

        const porModulo = {};
        eventos.forEach(function(ev) {
            if (!porModulo[ev.modulo]) porModulo[ev.modulo] = {};
            const g = ev.grupo || 'Outros';
            if (!porModulo[ev.modulo][g]) porModulo[ev.modulo][g] = [];
            porModulo[ev.modulo][g].push(ev);
        });

        let html = '<div class="matriz-eventos-intro"><strong>Ações de fluxo</strong> <span class="matriz-eventos-hint">(catálogo central de transições e ações especiais)</span></div>';
        Object.keys(porModulo).sort().forEach(function(mod) {
            const modLabel = (catalogo.MODULO_LABELS && catalogo.MODULO_LABELS[mod]) || mod;
            html += '<fieldset class="gov-fieldset matriz-eventos-modulo"><legend>' + escapeHTML(modLabel) + '</legend>';
            const grupos = porModulo[mod];
            Object.keys(grupos).sort().forEach(function(grupo) {
                html += '<div class="matriz-eventos-grupo"><span class="matriz-eventos-grupo-label">' + escapeHTML(grupo) + '</span>';
                html += '<div class="matriz-eventos-lista">';
                grupos[grupo].forEach(function(ev) {
                    const tip = catalogo.tooltipEvento(ev);
                    const transicaoHtml = (ev.tipo === 'transicao' && ev.statusDestino)
                        ? '<span class="matriz-evento-transicao">' + escapeHTML(tip) + '</span>'
                        : '';
                    // Dois filhos diretos do grid: [checkbox] [bloco-texto]
                    html += '<input type="checkbox" class="cb-perm" value="' + escapeHTML(ev.id) + '" id="cb_ev_' + escapeHTML(ev.id) + '">';
                    html += '<label class="matriz-evento-texto" for="cb_ev_' + escapeHTML(ev.id) + '" title="' + escapeHTML(tip) + '">';
                    html += escapeHTML(ev.label);
                    html += transicaoHtml;
                    html += '</label>';
                });
                html += '</div></div>';
            });
            html += '</fieldset>';
        });
        container.innerHTML = html;
    }

    function desenharPermissoesTransversais() {
        const container = document.getElementById('adminPermissoesTransversais');
        if (!container || typeof window.RBACEventos === 'undefined') return;
        const itens = window.RBACEventos.ADMIN_TRANSVERSAIS || [];
        if (!itens.length) { container.innerHTML = ''; return; }

        let html = '<div class="matriz-eventos-intro"><strong>Permissões transversais</strong></div>';
        html += '<div class="matriz-eventos-lista">';
        itens.forEach(function(item) {
            html += '<input type="checkbox" class="cb-perm" value="' + escapeHTML(item.id) + '" id="cb_tr_' + escapeHTML(item.id) + '">';
            html += '<label class="matriz-evento-texto" for="cb_tr_' + escapeHTML(item.id) + '">' + escapeHTML(item.label) + '</label>';
        });
        html += '</div>';
        container.innerHTML = html;
    }

    async function carregarUsuarios() {
        if (!podeAcessarPainel('usuarios') && !podeAcessarPainel('pendentes') && !podeAcessarPainel('cadastrar')) return;
        const tbody = document.getElementById('tbodyUsuarios');
        if (tbody) tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">Carregando...</td></tr>';
        try {
            const snap = await db.collection('usuarios').get();
            listaUsuarios = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            listaPendentes = listaUsuarios.filter(u => u.status === 'pendente');
            desenharTabelaUsuarios();
            desenharTabelaPendentes();
        } catch (err) {
            if (tbody) tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:red;">Erro ao carregar usuarios.</td></tr>';
            const tPend = document.getElementById('tbodyPendentes');
            if (tPend) tPend.innerHTML = '<tr><td colspan="5" style="text-align:center;color:red;">Erro ao carregar pendentes.</td></tr>';
        }
    }

    async function carregarPerfis() {
        if (!podeAcessarPainel('perfis') && !podeAcessarPainel('cadastrar') && !podeAcessarPainel('usuarios') && !podeAcessarPainel('pendentes')) return;
        const tbody = document.getElementById('tbodyPerfis');
        if (tbody) tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;">Carregando...</td></tr>';
        try {
            const snap = await db.collection('perfis').get();
            listaPerfis = snap.docs.map(doc => ({ id: doc.id, nomeExibicao: doc.data().nomeExibicao || '', permissoes: doc.data().permissoes || [] }));
            desenharTabelaPerfis();
            popularCheckboxesPerfis();
            desenharMatrizPermissoes();
        } catch (err) {
            if (tbody) tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;color:red;">Erro ao carregar perfis.</td></tr>';
        }
    }

    async function carregarOI() {
        if (!podeAcessarPainel('oi') && !podeAcessarPainel('cadastrar')) return;
        const tbody = document.getElementById('tbodyOI');
        if (tbody) tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">Carregando...</td></tr>';
        try {
            const snap = await db.collection('oi').get();
            listaOI = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            desenharTabelaOI();
            popularSelectOI();
        } catch (err) {
            if (tbody) tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:red;">Erro ao carregar OI.</td></tr>';
        }
    }

    window.abrirFormularioOI = function() {
        const form = document.getElementById('formOI');
        const listEl = document.getElementById('tela-lista-oi');
        const formEl = document.getElementById('tela-formulario-oi');
        if (!form || !listEl || !formEl) return;
        form.reset();
        document.getElementById('editIndexOI').value = '-1';
        listEl.style.display = 'none';
        formEl.style.display = 'block';
    };

    window.voltarListaOI = function() {
        document.getElementById('tela-formulario-oi').style.display = 'none';
        document.getElementById('tela-lista-oi').style.display = 'block';
        carregarOI();
    };

    function editarOI(id) {
        const o = listaOI.find(x => x.id === id);
        if (!o) return;
        document.getElementById('editIndexOI').value = o.id;
        document.getElementById('numeroOI').value = o.numeroOI || '';
        document.getElementById('nomeOI').value = o.nomeOI || '';
        document.getElementById('contatoOI').value = o.contatoOI || '';
        document.getElementById('telefoneOI').value = o.telefoneOI || '';
        document.getElementById('situacaoOI').value = o.situacao || 'Ativo';
        document.getElementById('tela-lista-oi').style.display = 'none';
        document.getElementById('tela-formulario-oi').style.display = 'block';
    }

    async function excluirOI(id) {
        const usuariosVinculados = listaUsuarios.filter(u => u.oi === id);
        if (usuariosVinculados.length > 0) {
            alert('Nao e possivel excluir esta OI: existem ' + usuariosVinculados.length + ' usuario(s) vinculado(s).');
            return;
        }
        if (!confirm('Excluir esta OI permanentemente?')) return;
        adminLoading(true);
        try {
            await db.collection('oi').doc(id).delete();
            alert('OI excluida.');
            voltarListaOI();
        } catch (err) {
            alert('Erro ao excluir: ' + (err.message || 'Acesso negado.'));
        } finally {
            if (typeof esconderBarraLoading === 'function') esconderBarraLoading();
            adminLoading(false);
        }
    }

    const formOI = document.getElementById('formOI');
    if (formOI) {
        formOI.addEventListener('submit', async function(e) {
            e.preventDefault();
            const numeroOI = (document.getElementById('numeroOI').value || '').trim();
            const telefoneRaw = typeof telefoneSomenteDigitos === 'function'
                ? telefoneSomenteDigitos(document.getElementById('telefoneOI').value)
                : (document.getElementById('telefoneOI').value || '').replace(/\D/g, '');
            if (telefoneRaw.length > 0 && telefoneRaw.length < 10) {
                alert('Telefone invalido. Informe pelo menos 10 digitos.');
                return;
            }
            const fbID = (document.getElementById('editIndexOI') || {}).value || '-1';
            const duplicado = listaOI.find(o => (o.numeroOI || '').toLowerCase() === numeroOI.toLowerCase() && o.id !== fbID);
            if (duplicado) {
                alert('Ja existe uma OI com este numero. Escolha outro.');
                return;
            }
            const dados = {
                numeroOI,
                nomeOI: (document.getElementById('nomeOI') || {}).value || '',
                contatoOI: (document.getElementById('contatoOI') || {}).value || '',
                telefoneOI: (document.getElementById('telefoneOI') || {}).value || '',
                situacao: (document.getElementById('situacaoOI') || {}).value || 'Ativo'
            };
            const btn = formOI.querySelector('button[type="submit"]');
            btnLoading(btn, true, 'Salvando...');
            adminLoading(true);
            if (typeof mostrarBarraLoading === 'function') mostrarBarraLoading('Salvando...');
            try {
                if (fbID === '-1' || fbID === '') await db.collection('oi').add(dados);
                else await db.collection('oi').doc(fbID).update(dados);
                alert('OI salva com sucesso.');
                voltarListaOI();
            } catch (err) {
                const msg = err.code === 'permission-denied'
                    ? 'Sem permissao para salvar OI.'
                    : (err.code ? (err.code + ': ' + (err.message || '')) : (err.message || String(err)));
                alert('Erro ao salvar OI: ' + msg);
            } finally {
                if (typeof esconderBarraLoading === 'function') esconderBarraLoading();
                btnLoading(btn, false);
                adminLoading(false);
            }
        });
    }

    window.abrirFormularioPerfil = function() {
        const form = document.getElementById('formPerfilAdmin');
        if (form) form.reset();
        const inputNome = document.getElementById('adminNomeExibicaoPerfil');
        const inputCodigo = document.getElementById('adminCodigoPerfil');
        const inputLegado = document.getElementById('adminNomePerfil');
        if (inputNome) inputNome.value = '';
        if (inputCodigo) { inputCodigo.value = ''; delete inputCodigo.dataset.editando; }
        if (inputLegado) inputLegado.value = '';
        desenharMatrizPermissoes();
        const cbs = form ? form.querySelectorAll('.cb-perm') : document.querySelectorAll('.cb-perm');
        cbs.forEach(cb => { cb.checked = false; });
        document.getElementById('tela-lista-perfis').style.display = 'none';
        document.getElementById('tela-formulario-perfis').style.display = 'block';
    };

    window.voltarListaPerfis = function() {
        document.getElementById('tela-formulario-perfis').style.display = 'none';
        document.getElementById('tela-lista-perfis').style.display = 'block';
        carregarPerfis();
    };

    window.adminEditarPerfil = function(perfilId) {
        const p = listaPerfis.find(x => x.id === perfilId);
        if (!p) return;
        // Preenche nome exibição e código técnico (readonly em edição)
        const inputNome = document.getElementById('adminNomeExibicaoPerfil');
        const inputCodigo = document.getElementById('adminCodigoPerfil');
        const inputLegado = document.getElementById('adminNomePerfil');
        if (inputNome) inputNome.value = p.nomeExibicao || (typeof window.humanizarIdPerfil === 'function' ? window.humanizarIdPerfil(p.id) : p.id);
        if (inputCodigo) { inputCodigo.value = p.id; inputCodigo.dataset.editando = '1'; }
        if (inputLegado) inputLegado.value = p.id;
        desenharMatrizPermissoes();
        const perms = Array.isArray(p.permissoes) ? p.permissoes : [];
        const form = document.getElementById('formPerfilAdmin');
        const cbs = form ? form.querySelectorAll('.cb-perm') : document.querySelectorAll('.cb-perm');
        cbs.forEach(cb => { cb.checked = perms.includes(cb.value); });
        if (perms.includes('tramitarTC') && typeof window.RBACEventos !== 'undefined') {
            (window.RBACEventos.TRAMITAR_TC_EXPANSION || []).forEach(function(evId) {
                const el = form ? form.querySelector('.cb-perm[value="' + evId + '"]') : null;
                if (el) el.checked = true;
            });
        }
        document.getElementById('tela-lista-perfis').style.display = 'none';
        document.getElementById('tela-formulario-perfis').style.display = 'block';
    };

    window.adminEditarUsuario = function(uid) {
        const u = listaUsuarios.find(x => x.id === uid);
        if (!u) return;
        document.getElementById('adminUsuarioUid').value = u.id;
        document.getElementById('adminUsuarioEmail').value = u.email || '';
        const cpfRaw = (u.cpf || '').replace(/\D/g, '');
        document.getElementById('adminUsuarioCPF').value = cpfRaw.length === 11
            ? (cpfRaw.slice(0, 3) + '.' + cpfRaw.slice(3, 6) + '.' + cpfRaw.slice(6, 9) + '-' + cpfRaw.slice(9))
            : (u.cpf || '');
        document.getElementById('adminUsuarioNome').value = u.nomeCompleto || '';
        document.getElementById('adminUsuarioNomeGuerra').value = u.nomeGuerra || '';
        document.getElementById('adminUsuarioOI').value = u.oi || '';
        const perfis = Array.isArray(u.perfis) ? u.perfis : (u.perfil ? [u.perfil] : []);
        document.querySelectorAll('.cb-perfil-usuario').forEach(cb => { cb.checked = perfis.includes(cb.value); });
        sincronizarSelectPerfilAtual(u.perfil_ativo || u.perfilAtual || u.perfil || (perfis[0] || ''), true);
        atualizarFeedbackUsuario('Edicao carregada. Salve para confirmar alteracoes.', 'info');
        mostrarPainelAdmin('cadastrar');
    };

    window.adminNovoUsuario = function() {
        prepararFormularioUsuarioParaNovo();
        atualizarFeedbackUsuario('Formulario pronto para novo cadastro.', 'info');
        mostrarPainelAdmin('cadastrar');
    };

    window.adminCancelarEdicaoUsuario = function() {
        prepararFormularioUsuarioParaNovo();
        atualizarFeedbackUsuario('Edicao cancelada. Voce voltou para a lista de usuarios.', 'info');
        mostrarPainelAdmin('usuarios');
    };

    window.adminAprovarUsuario = function(uid) {
        adminEditarUsuario(uid);
        atualizarFeedbackUsuario('Cadastro pendente carregado. Defina os perfis e clique em Salvar usuario.', 'warning');
    };

    window.adminBloquearUsuario = async function(uid, btn) {
        if (typeof window.temPermissaoUI === 'function' && !window.temPermissaoUI('usuarios_status') && !window.temPermissaoUI('usuarios_editar') && !window.temPermissaoUI('acesso_admin')) {
            alert('Sem permissao para bloquear usuarios.');
            return;
        }
        if (!confirm('Bloquear este usuario? Ele perdera o acesso ao sistema.')) return;
        adminLoading(true);
        if (btn) btnLoading(btn, true);
        if (typeof mostrarBarraLoading === 'function') mostrarBarraLoading('Salvando...');
        try {
            await db.collection('usuarios').doc(uid).update({ bloqueado: true });
            alert('Usuario bloqueado.');
            carregarUsuarios();
        } catch (err) {
            alert('Erro ao bloquear: ' + (err.message || 'Acesso negado.'));
        } finally {
            if (typeof esconderBarraLoading === 'function') esconderBarraLoading();
            adminLoading(false);
            if (btn) btnLoading(btn, false);
        }
    };

    window.adminDesbloquearUsuario = async function(uid, btn) {
        if (typeof window.temPermissaoUI === 'function' && !window.temPermissaoUI('usuarios_status') && !window.temPermissaoUI('usuarios_editar') && !window.temPermissaoUI('acesso_admin')) {
            alert('Sem permissao para desbloquear usuarios.');
            return;
        }
        adminLoading(true);
        if (btn) btnLoading(btn, true);
        if (typeof mostrarBarraLoading === 'function') mostrarBarraLoading('Salvando...');
        try {
            await db.collection('usuarios').doc(uid).update({ bloqueado: false, status: 'ativo' });
            alert('Usuario desbloqueado.');
            carregarUsuarios();
        } catch (err) {
            alert('Erro ao desbloquear: ' + (err.message || 'Acesso negado.'));
        } finally {
            if (typeof esconderBarraLoading === 'function') esconderBarraLoading();
            adminLoading(false);
            if (btn) btnLoading(btn, false);
        }
    };

    window.adminRejeitarUsuario = async function(uid) {
        if (!confirm('Rejeitar este cadastro? O usuario ficara bloqueado e nao podera acessar o sistema.')) return;
        adminLoading(true);
        if (typeof mostrarBarraLoading === 'function') mostrarBarraLoading('Salvando...');
        try {
            await db.collection('usuarios').doc(uid).update({ status: 'bloqueado', bloqueado: true });
            alert('Cadastro rejeitado.');
            carregarUsuarios();
        } catch (err) {
            alert('Erro ao rejeitar: ' + (err.message || 'Acesso negado.'));
        } finally {
            if (typeof esconderBarraLoading === 'function') esconderBarraLoading();
            adminLoading(false);
        }
    };

    function montarDadosExportacao(tipo) {
        if (tipo === 'usuarios') {
            return getUsuariosFiltrados().map(u => {
                const perfis = Array.isArray(u.perfis) ? u.perfis : (u.perfil ? [u.perfil] : []);
                return {
                    UID: u.id || '',
                    Email: u.email || '',
                    Perfis: perfis.join(', '),
                    PerfilAtivo: u.perfil_ativo || u.perfilAtual || u.perfil || '',
                    Status: statusUsuario(u)
                };
            });
        }
        if (tipo === 'pendentes') {
            return getPendentesFiltrados().map(u => ({
                UID: u.id || '',
                Email: u.email || '',
                Nome: u.nomeCompleto || u.displayName || '',
                Origem: u.origem || '',
                CadastradoEm: u.criadoEm && u.criadoEm.toDate ? u.criadoEm.toDate().toLocaleString('pt-BR') : ''
            }));
        }
        if (tipo === 'perfis') {
            return getPerfisFiltrados().map(p => ({
                Nome: typeof window.labelPerfil === 'function' ? window.labelPerfil(p) : (p.nomeExibicao || p.id),
                Codigo: p.id || '',
                Permissoes: Array.isArray(p.permissoes) ? p.permissoes.join(', ') : ''
            }));
        }
        if (tipo === 'oi') {
            return getOIFiltrados().map(o => ({
                NumeroOI: o.numeroOI || '',
                Nome: o.nomeOI || '',
                Contato: o.contatoOI || '',
                Telefone: o.telefoneOI || '',
                Situacao: o.situacao || ''
            }));
        }
        return [];
    }

    function exportarCsv(nomeArquivo, dados) {
        const chaves = Object.keys(dados[0] || {});
        const linhas = [chaves.join(';')];
        dados.forEach(item => {
            const linha = chaves.map(ch => {
                const valor = item[ch] == null ? '' : String(item[ch]).replace(/"/g, '""');
                return '"' + valor + '"';
            }).join(';');
            linhas.push(linha);
        });
        const blob = new Blob(['\uFEFF' + linhas.join('\n')], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = nomeArquivo;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    function exportarGrid(tipo, formato) {
        const dados = montarDadosExportacao(tipo);
        if (!dados.length) {
            alert('Nao ha dados para exportar na grade atual.');
            return;
        }
        const nomeBase = 'admin-' + tipo + '-' + new Date().toISOString().slice(0, 10);
        if (formato === 'csv') {
            exportarCsv(nomeBase + '.csv', dados);
            return;
        }
        if (typeof XLSX === 'undefined') {
            alert('Biblioteca de exportacao nao carregada.');
            return;
        }
        const ws = XLSX.utils.json_to_sheet(dados);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, tipo.toUpperCase());
        XLSX.writeFile(wb, nomeBase + '.xlsx');
    }

    function registrarEventosExportacao() {
        const binds = [
            ['exportUsuariosCsv', () => exportarGrid('usuarios', 'csv')],
            ['exportUsuariosXlsx', () => exportarGrid('usuarios', 'xlsx')],
            ['exportPendentesCsv', () => exportarGrid('pendentes', 'csv')],
            ['exportPendentesXlsx', () => exportarGrid('pendentes', 'xlsx')],
            ['exportPerfisCsv', () => exportarGrid('perfis', 'csv')],
            ['exportPerfisXlsx', () => exportarGrid('perfis', 'xlsx')],
            ['exportOICsv', () => exportarGrid('oi', 'csv')],
            ['exportOIXlsx', () => exportarGrid('oi', 'xlsx')]
        ];
        binds.forEach(([id, fn]) => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('click', fn);
        });
    }

    window.filtrarListaUsuarios = function() {
        const busca = document.getElementById('buscaUsuarios');
        const filtroStatus = document.getElementById('filtroStatusUsuarios');
        estadoGrid.usuarios.termo = (busca && busca.value ? busca.value : '').trim();
        estadoGrid.usuarios.status = (filtroStatus && filtroStatus.value) || 'todos';
        estadoGrid.usuarios.pagina = 1;
        desenharTabelaUsuarios();
    };

    window.filtrarPendentesAdmin = function() {
        const busca = document.getElementById('buscaPendentes');
        estadoGrid.pendentes.termo = (busca && busca.value ? busca.value : '').trim();
        estadoGrid.pendentes.pagina = 1;
        desenharTabelaPendentes();
    };

    window.filtrarPerfisAdmin = function() {
        const busca = document.getElementById('buscaPerfis');
        estadoGrid.perfis.termo = (busca && busca.value ? busca.value : '').trim();
        estadoGrid.perfis.pagina = 1;
        desenharTabelaPerfis();
    };

    window.filtrarOIAdmin = function() {
        const busca = document.getElementById('buscaOI');
        const situacao = document.getElementById('filtroSituacaoOI');
        estadoGrid.oi.termo = (busca && busca.value ? busca.value : '').trim();
        estadoGrid.oi.situacao = (situacao && situacao.value) || 'todas';
        estadoGrid.oi.pagina = 1;
        desenharTabelaOI();
    };

    window.mudarItensPaginaAdmin = function(tipo, valor) {
        const est = estadoGrid[tipo];
        if (!est) return;
        const novo = parseInt(valor, 10);
        est.itensPorPagina = Number.isFinite(novo) && novo > 0 ? novo : 10;
        est.pagina = 1;
        if (tipo === 'usuarios') desenharTabelaUsuarios();
        if (tipo === 'pendentes') desenharTabelaPendentes();
        if (tipo === 'perfis') desenharTabelaPerfis();
        if (tipo === 'oi') desenharTabelaOI();
    };

    window.mudarPaginaAdmin = function(tipo, pagina) {
        const est = estadoGrid[tipo];
        if (!est) return;
        est.pagina = Math.max(1, parseInt(pagina, 10) || 1);
        if (tipo === 'usuarios') desenharTabelaUsuarios();
        if (tipo === 'pendentes') desenharTabelaPendentes();
        if (tipo === 'perfis') desenharTabelaPerfis();
        if (tipo === 'oi') desenharTabelaOI();
    };

    window.adminRecarregarDados = function() {
        carregarUsuarios();
        carregarPerfis();
        carregarOI();
    };

    window.adminPosSalvarUsuario = function(payload) {
        prepararFormularioUsuarioParaNovo();
        const mensagem = payload && payload.mensagem ? payload.mensagem : 'Usuario salvo com sucesso.';
        atualizarFeedbackUsuario(mensagem + ' Voce foi redirecionado para a lista.', 'success');
        mostrarPainelAdmin('usuarios');
        carregarUsuarios();
        if (payload && payload.perfilAjustado) {
            atualizarAvisoPerfilPadrao('Perfil padrao ajustado automaticamente para manter coerencia com os perfis atribuidos.');
        } else {
            atualizarAvisoPerfilPadrao('');
        }
    };

    function registrarEventosFormularioUsuario() {
        const btnNovoUsuario = document.getElementById('btnNovoUsuario');
        if (btnNovoUsuario) btnNovoUsuario.addEventListener('click', window.adminNovoUsuario);
        const btnCancelar = document.getElementById('btnCancelarEdicaoUsuario');
        if (btnCancelar) btnCancelar.addEventListener('click', window.adminCancelarEdicaoUsuario);
        const selectPerfil = document.getElementById('adminUsuarioPerfilAtual');
        if (selectPerfil) {
            selectPerfil.addEventListener('change', function() {
                atualizarAvisoPerfilPadrao('');
            });
        }
    }

    window.addEventListener('popstate', function() {
        const aba = new URLSearchParams(window.location.search).get('aba') || 'usuarios';
        mostrarPainelAdmin(aba, { skipHistory: true, silent: true });
    });

    auth.onAuthStateChanged(async (user) => {
        if (!user || !document.getElementById('corpo-admin')) return;
        if (typeof carregarPermissoes === 'function') {
            try { await carregarPermissoes(); } catch (e) { /* noop */ }
        }
        atualizarTabsAdminVisiveis();
        registrarEventosFormularioUsuario();
        registrarEventosExportacao();
        const abaDaRota = new URLSearchParams(window.location.search).get('aba') || 'usuarios';
        mostrarPainelAdmin(abaDaRota, { skipHistory: true, silent: true });
        carregarUsuarios();
        carregarPerfis();
        carregarOI();
    });
})();
