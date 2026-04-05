// ==========================================
// ADMIN SPA - Usuários, Perfis, OI (usa admin-utils.js para máscaras/validações)
// ==========================================
(function() {
    if (!document.getElementById('corpo-admin')) return;

    const COLUNAS_ACOES = ['ler', 'inserir', 'editar', 'excluir', 'status'];
    const MATRIZ_MODULOS = [
        { modulo: 'dashboard', label: 'Dashboard', acoes: ['ler'] },
        { modulo: 'titulos', label: 'Títulos de Crédito', acoes: ['ler', 'inserir', 'editar', 'excluir'] },
        { modulo: 'preliquidacao', label: 'Pré-Liquidação', acoes: ['ler', 'inserir', 'editar', 'excluir', 'status'] },
        { modulo: 'empenhos', label: 'Empenhos (NE)', acoes: ['ler', 'inserir', 'editar', 'excluir'] },
        { modulo: 'lf', label: 'LF x PF', acoes: ['ler', 'inserir', 'editar', 'excluir'] },
        { modulo: 'op', label: 'Pagamento (OP)', acoes: ['ler'] },
        { modulo: 'dedenc', label: 'Deduções e Encargos', acoes: ['ler', 'inserir', 'editar', 'excluir'] },
        { modulo: 'contratos', label: 'Contratos', acoes: ['ler', 'inserir', 'editar', 'excluir', 'status'] },
        { modulo: 'fornecedores', label: 'Fornecedores', acoes: ['ler', 'inserir', 'editar', 'excluir', 'status'] },
        { modulo: 'usuarios', label: 'Admin - Usuários', acoes: ['ler', 'inserir', 'editar', 'excluir'] },
        { modulo: 'perfis', label: 'Admin - Perfis', acoes: ['ler', 'inserir', 'editar', 'excluir'] },
        { modulo: 'oi', label: 'Admin - OI', acoes: ['ler', 'inserir', 'editar', 'excluir', 'status'] },
        { modulo: 'centrocustos', label: 'Centro de Custos', acoes: ['ler', 'inserir', 'editar', 'excluir'] },
        { modulo: 'ug', label: 'Unidade Gestora (UG)', acoes: ['ler', 'inserir', 'editar', 'excluir'] },
        { modulo: 'backup', label: 'Backup Global', acoes: ['ler'] }
    ];

    let listaUsuarios = [];
    let listaPerfis = [];
    let listaOI = [];

    function adminLoading(mostrar) {
        // Direciona para o overlay global (script.js) para respeitar delay (3s) e prompt (60s)
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
        if (mostrar) { btn.disabled = true; btn.classList.add('btn-loading'); btn.dataset.origText = btn.textContent; btn.textContent = txt; }
        else { btn.disabled = false; btn.classList.remove('btn-loading'); if (btn.dataset.origText) btn.textContent = btn.dataset.origText; }
    }
    window.adminLoading = adminLoading;
    window.btnLoading = btnLoading;

    function mostrarPainelAdmin(painel) {
        document.querySelectorAll('.admin-tab[data-painel]').forEach(t => {
            const id = t.getAttribute('data-painel');
            const sel = id === painel;
            t.classList.toggle('ativo', sel);
            t.setAttribute('aria-selected', sel ? 'true' : 'false');
            t.setAttribute('tabindex', sel ? '0' : '-1');
        });
        document.querySelectorAll('.admin-painel').forEach(p => {
            const match = p.id === 'painel-' + painel;
            p.classList.toggle('visivel', match);
            p.setAttribute('aria-hidden', match ? 'false' : 'true');
        });
        if (painel === 'cadastrar') {
            const uidInput = document.getElementById('adminUsuarioUid');
            const senhaInicialGroup = document.getElementById('formGroupSenhaInicial');
            const senhaAdminGroup = document.getElementById('formGroupSenhaAdmin');
            const ehNovo = !(uidInput && uidInput.value && uidInput.value.trim());
            if (senhaInicialGroup) senhaInicialGroup.style.display = ehNovo ? 'block' : 'none';
            if (senhaAdminGroup) senhaAdminGroup.style.display = ehNovo ? 'block' : 'none';
            if (ehNovo) {
                const senhaInicial = document.getElementById('adminUsuarioSenhaInicial');
                const senhaAdmin = document.getElementById('adminUsuarioSenhaAdmin');
                if (senhaInicial) senhaInicial.required = true;
                if (senhaAdmin) senhaAdmin.required = false;
            } else {
                const senhaInicial = document.getElementById('adminUsuarioSenhaInicial');
                if (senhaInicial) { senhaInicial.required = false; senhaInicial.value = ''; }
            }
        }
    }

    window.mostrarPainelAdmin = mostrarPainelAdmin;

    async function carregarUsuarios() {
        const tbody = document.getElementById('tbodyUsuarios');
        if (!tbody) return;
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">Carregando...</td></tr>';
        try {
            const snap = await db.collection('usuarios').get();
            listaUsuarios = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            desenharTabelaUsuarios();
            carregarPendentes();
        } catch (err) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:red;">Erro ao carregar usuários.</td></tr>';
        }
    }

    async function carregarPendentes() {
        const tbody = document.getElementById('tbodyPendentes');
        if (!tbody) return;
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Carregando...</td></tr>';
        try {
            const snap = await db.collection('usuarios').get();
            const pendentes = snap.docs
                .map(doc => ({ id: doc.id, ...doc.data() }))
                .filter(u => u.status === 'pendente');
            desenharTabelaPendentes(pendentes);
        } catch (err) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:red;">Erro ao carregar.</td></tr>';
        }
    }

    function desenharTabelaPendentes(pendentes) {
        const tbody = document.getElementById('tbodyPendentes');
        if (!tbody) return;
        tbody.innerHTML = '';
        if (!pendentes || pendentes.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Nenhum usuário aguardando aprovação.</td></tr>';
            return;
        }
        pendentes.forEach(u => {
            const tr = document.createElement('tr');
            const criado = u.criadoEm && u.criadoEm.toDate ? u.criadoEm.toDate().toLocaleString('pt-BR') : '-';
            tr.innerHTML = `
                <td>${escapeHTML(u.email || '-')}</td>
                <td>${escapeHTML(u.nomeCompleto || u.displayName || '-')}</td>
                <td><span class="status-ativo">${escapeHTML(u.origem || '-')}</span></td>
                <td>${criado}</td>
                <td>
                    <button type="button" class="btn-icon btn-aprovar-usuario" data-uid="${escapeHTML(u.id)}" title="Aprovar" aria-label="Aprovar cadastro e atribuir perfis">✓</button>
                    <button type="button" class="btn-icon btn-rejeitar-usuario" data-uid="${escapeHTML(u.id)}" title="Rejeitar" aria-label="Rejeitar cadastro e bloquear usuário">✗</button>
                </td>`;
            tbody.appendChild(tr);
        });
        tbody.querySelectorAll('.btn-aprovar-usuario').forEach(btn => btn.addEventListener('click', function() { adminAprovarUsuario(this.getAttribute('data-uid')); }));
        tbody.querySelectorAll('.btn-rejeitar-usuario').forEach(btn => btn.addEventListener('click', function() { adminRejeitarUsuario(this.getAttribute('data-uid')); }));
    }

    async function carregarPerfis() {
        const tbody = document.getElementById('tbodyPerfis');
        if (!tbody) return;
        tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;">Carregando...</td></tr>';
        try {
            const snap = await db.collection('perfis').get();
            listaPerfis = snap.docs.map(doc => ({ id: doc.id, permissoes: doc.data().permissoes || [] }));
            desenharTabelaPerfis();
            popularCheckboxesPerfis();
            desenharMatrizPermissoes();
        } catch (err) {
            tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;color:red;">Erro ao carregar perfis.</td></tr>';
        }
    }

    async function carregarOI() {
        const tbody = document.getElementById('tbodyOI');
        if (!tbody) return;
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">Carregando...</td></tr>';
        try {
            const snap = await db.collection('oi').get();
            listaOI = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            desenharTabelaOI();
            popularSelectOI();
        } catch (err) {
            if (tbody) tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:red;">Erro ao carregar OI.</td></tr>';
        }
    }

    function desenharTabelaOI() {
        const tbody = document.getElementById('tbodyOI');
        if (!tbody) return;
        tbody.innerHTML = '';
        if (listaOI.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">Nenhuma OI encontrada.</td></tr>';
            return;
        }
        listaOI.forEach(o => {
            const tr = document.createElement('tr');
            const status = o.situacao === 'Ativo' ? '<span class="status-ativo">Ativo</span>' : '<span class="status-bloqueado">Inativo</span>';
            tr.innerHTML = `<td><strong>${escapeHTML(o.numeroOI || '-')}</strong></td>
                <td>${escapeHTML(o.nomeOI || '-')}</td>
                <td>${escapeHTML(o.contatoOI || '-')}</td>
                <td>${escapeHTML(o.telefoneOI || '-')}</td>
                <td>${status}</td>
                <td>
                    <button type="button" class="btn-icon btn-editar-oi" data-id="${escapeHTML(o.id)}" title="Editar" aria-label="Editar organização interna">✏️</button>
                    <button type="button" class="btn-icon btn-apagar-oi" data-id="${escapeHTML(o.id)}" title="Excluir" aria-label="Excluir organização interna">🗑️</button>
                </td>`;
            tbody.appendChild(tr);
        });
        tbody.querySelectorAll('.btn-editar-oi').forEach(btn => btn.addEventListener('click', function() { editarOI(this.getAttribute('data-id')); }));
        tbody.querySelectorAll('.btn-apagar-oi').forEach(btn => btn.addEventListener('click', function() { excluirOI(this.getAttribute('data-id')); }));
    }

    function popularSelectOI() {
        const sel = document.getElementById('adminUsuarioOI');
        if (!sel) return;
        const oisAtivas = listaOI.filter(o => o.situacao === 'Ativo');
        sel.innerHTML = '<option value="">-- Nenhum --</option>';
        oisAtivas.forEach(o => {
            const opt = document.createElement('option');
            opt.value = o.id;
            opt.textContent = (o.numeroOI || '') + ' - ' + (o.nomeOI || '');
            sel.appendChild(opt);
        });
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
            alert('Não é possível excluir esta OI: existem ' + usuariosVinculados.length + ' usuário(s) vinculado(s). Remova a OI dos usuários primeiro.');
            return;
        }
        if (!confirm('Excluir esta OI permanentemente?')) return;
        adminLoading(true);
        try {
            await db.collection('oi').doc(id).delete();
            alert('OI excluída.');
            voltarListaOI();
        } catch (err) { alert('Erro ao excluir: ' + (err.message || 'Acesso negado.')); }
        finally { if (typeof esconderBarraLoading === 'function') esconderBarraLoading(); adminLoading(false); }
    }

    const formOI = document.getElementById('formOI');
    if (formOI) {
        formOI.addEventListener('submit', async function(e) {
            e.preventDefault();
            const numeroOI = (document.getElementById('numeroOI').value || '').trim();
            const telefoneRaw = typeof telefoneSomenteDigitos === 'function' ? telefoneSomenteDigitos(document.getElementById('telefoneOI').value) : (document.getElementById('telefoneOI').value || '').replace(/\D/g, '');
            if (telefoneRaw.length > 0 && telefoneRaw.length < 10) {
                alert('Telefone inválido. Informe pelo menos 10 dígitos.');
                return;
            }
            const fbID = (document.getElementById('editIndexOI') || {}).value || '-1';
            const duplicado = listaOI.find(o => (o.numeroOI || '').toLowerCase() === numeroOI.toLowerCase() && o.id !== fbID);
            if (duplicado) {
                alert('Já existe uma OI com este número. Escolha outro.');
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
                console.error('Erro ao salvar OI:', err);
                const msg = err.code === 'permission-denied' ? 'Sem permissão (acesso_admin necessário).' :
                    err.code ? (err.code + ': ' + (err.message || '')) : (err.message || String(err));
                alert('Erro ao salvar OI: ' + msg);
            }
            finally { if (typeof esconderBarraLoading === 'function') esconderBarraLoading(); btnLoading(btn, false); adminLoading(false); }
        });
    }

    window.abrirFormularioPerfil = function() {
        const form = document.getElementById('formPerfilAdmin');
        if (form) form.reset();
        document.getElementById('adminNomePerfil').value = '';
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
                    cells += '<td class="matriz-vazio">—</td>';
                }
            });
            tr.innerHTML = cells;
            tbody.appendChild(tr);
        });
    }

    function popularCheckboxesPerfis() {
        const container = document.getElementById('containerCheckboxesPerfis');
        const selAtual = document.getElementById('adminUsuarioPerfilAtual');
        if (!container || !selAtual) return;
        container.innerHTML = '';
        selAtual.innerHTML = '<option value="">-- Nenhum --</option>';
        listaPerfis.forEach(p => {
            const lbl = document.createElement('label');
            lbl.style.display = 'block';
            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.className = 'cb-perfil-usuario';
            cb.value = p.id;
            lbl.appendChild(cb);
            lbl.appendChild(document.createTextNode(' ' + p.id));
            container.appendChild(lbl);
            const opt = document.createElement('option');
            opt.value = p.id;
            opt.textContent = p.id;
            selAtual.appendChild(opt);
        });
    }

    function desenharTabelaUsuarios(filtrados) {
        const tbody = document.getElementById('tbodyUsuarios');
        if (!tbody) return;
        const dados = filtrados !== undefined ? filtrados : listaUsuarios;
        tbody.innerHTML = '';
        if (dados.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">Nenhum usuário encontrado.</td></tr>';
            return;
        }
        dados.forEach(u => {
            const tr = document.createElement('tr');
            const perfis = Array.isArray(u.perfis) ? u.perfis : (u.perfil ? [u.perfil] : []);
            const perfilAtual = u.perfil_ativo || u.perfilAtual || u.perfil || (perfis[0] || '-');
            const status = u.bloqueado || u.status === 'bloqueado' ? '<span class="status-bloqueado">Bloqueado</span>' :
                u.status === 'pendente' || (!(u.perfis && u.perfis.length) && !u.perfil) ? '<span class="status-pendente">Pendente</span>' :
                '<span class="status-ativo">Ativo</span>';
            tr.innerHTML = `
                <td><code class="uid-preview">${escapeHTML((u.id || '').substring(0, 12))}...</code></td>
                <td>${escapeHTML(u.email || '-')}</td>
                <td style="font-size:12px;">${escapeHTML(perfis.join(', ') || '-')}</td>
                <td><strong>${escapeHTML(perfilAtual)}</strong></td>
                <td>${status}</td>
                <td>
                    <button type="button" class="btn-icon btn-editar-usuario" data-uid="${escapeHTML(u.id)}" title="Editar" aria-label="Editar usuário">✏️</button>
                    <button type="button" class="btn-outline btn-small btn-bloquear-usuario" data-uid="${escapeHTML(u.id)}" data-acao="${u.bloqueado ? 'desbloquear' : 'bloquear'}">${u.bloqueado ? 'Desbloquear' : 'Bloquear'}</button>
                </td>`;
            tbody.appendChild(tr);
        });
        tbody.querySelectorAll('.btn-editar-usuario').forEach(btn => btn.addEventListener('click', function() { adminEditarUsuario(this.getAttribute('data-uid')); }));
        tbody.querySelectorAll('.btn-bloquear-usuario').forEach(btn => btn.addEventListener('click', function() {
            const uid = this.getAttribute('data-uid');
            if (this.getAttribute('data-acao') === 'bloquear') adminBloquearUsuario(uid, this);
            else adminDesbloquearUsuario(uid, this);
        }));
    }

    window.filtrarListaUsuarios = function() {
        const q = (document.getElementById('buscaUsuarios') || {}).value.toLowerCase();
        if (!q.trim()) {
            desenharTabelaUsuarios();
            return;
        }
        const f = listaUsuarios.filter(u => {
            const perfis = Array.isArray(u.perfis) ? u.perfis : (u.perfil ? [u.perfil] : []);
            return (u.email && u.email.toLowerCase().includes(q)) ||
                (u.perfil && u.perfil.toLowerCase().includes(q)) ||
                perfis.some(p => p && p.toLowerCase().includes(q)) ||
                (u.id && u.id.toLowerCase().includes(q));
        });
        desenharTabelaUsuarios(f);
    };

    window.adminEditarUsuario = function(uid) {
        const u = listaUsuarios.find(x => x.id === uid);
        if (!u) return;
        document.getElementById('adminUsuarioUid').value = u.id;
        document.getElementById('adminUsuarioEmail').value = u.email || '';
        const cpfRaw = (u.cpf || '').replace(/\D/g, '');
        if (cpfRaw.length === 11) {
            document.getElementById('adminUsuarioCPF').value = cpfRaw.slice(0,3) + '.' + cpfRaw.slice(3,6) + '.' + cpfRaw.slice(6,9) + '-' + cpfRaw.slice(9);
        } else document.getElementById('adminUsuarioCPF').value = u.cpf || '';
        document.getElementById('adminUsuarioNome').value = u.nomeCompleto || '';
        document.getElementById('adminUsuarioNomeGuerra').value = u.nomeGuerra || '';
        document.getElementById('adminUsuarioOI').value = u.oi || '';
        const perfis = Array.isArray(u.perfis) ? u.perfis : (u.perfil ? [u.perfil] : []);
        document.querySelectorAll('.cb-perfil-usuario').forEach(cb => {
            cb.checked = perfis.includes(cb.value);
        });
        document.getElementById('adminUsuarioPerfilAtual').value = u.perfil_ativo || u.perfilAtual || u.perfil || (perfis[0] || '');
        mostrarPainelAdmin('cadastrar');
    };

    window.adminNovoUsuario = function() {
        document.getElementById('formUsuarioAdmin').reset();
        document.getElementById('adminUsuarioUid').value = '';
        mostrarPainelAdmin('cadastrar');
    };

    const btnNovoUsuario = document.getElementById('btnNovoUsuario');
    if (btnNovoUsuario) btnNovoUsuario.addEventListener('click', adminNovoUsuario);

    window.adminBloquearUsuario = async function(uid, btn) {
        if (!confirm('Bloquear este usuário? Ele perderá o acesso ao sistema.')) return;
        adminLoading(true);
        if (btn) btnLoading(btn, true);
        if (typeof mostrarBarraLoading === 'function') mostrarBarraLoading('Salvando...');
        try {
            await db.collection('usuarios').doc(uid).update({ bloqueado: true });
            alert('Usuário bloqueado.');
            carregarUsuarios();
        } catch (err) {
            alert('Erro ao bloquear: ' + (err.message || 'Acesso negado.'));
        } finally {
            if (typeof esconderBarraLoading === 'function') esconderBarraLoading();
            adminLoading(false);
            if (btn) btnLoading(btn, false);
        }
    };

    window.adminAprovarUsuario = function(uid) {
        adminEditarUsuario(uid);
    };

    window.adminRejeitarUsuario = async function(uid) {
        if (!confirm('Rejeitar este cadastro? O usuário ficará bloqueado e não poderá acessar o sistema.')) return;
        adminLoading(true);
        if (typeof mostrarBarraLoading === 'function') mostrarBarraLoading('Salvando...');
        try {
            await db.collection('usuarios').doc(uid).update({ status: 'bloqueado', bloqueado: true });
            const u = listaUsuarios.find(x => x.id === uid);
            const email = (u && u.email) || uid;
            if (typeof window.registrarAuditoria === 'function') window.registrarAuditoria('rejeitar_usuario', email, { uid });
            alert('Cadastro rejeitado.');
            carregarUsuarios();
            carregarPendentes();
        } catch (err) {
            alert('Erro ao rejeitar: ' + (err.message || 'Acesso negado.'));
        } finally {
            if (typeof esconderBarraLoading === 'function') esconderBarraLoading();
            adminLoading(false);
        }
    };

    window.adminDesbloquearUsuario = async function(uid, btn) {
        adminLoading(true);
        if (btn) btnLoading(btn, true);
        if (typeof mostrarBarraLoading === 'function') mostrarBarraLoading('Salvando...');
        try {
            await db.collection('usuarios').doc(uid).update({ bloqueado: false, status: 'ativo' });
            const u = listaUsuarios.find(x => x.id === uid);
            if (typeof window.registrarAuditoria === 'function') window.registrarAuditoria('desbloquear_usuario', u ? u.email : uid, { uid });
            alert('Usuário desbloqueado.');
            carregarUsuarios();
        } catch (err) {
            alert('Erro ao desbloquear: ' + (err.message || 'Acesso negado.'));
        } finally {
            if (typeof esconderBarraLoading === 'function') esconderBarraLoading();
            adminLoading(false);
            if (btn) btnLoading(btn, false);
        }
    };

    function desenharTabelaPerfis() {
        const tbody = document.getElementById('tbodyPerfis');
        if (!tbody) return;
        tbody.innerHTML = '';
        if (listaPerfis.length === 0) {
            tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;">Nenhum perfil encontrado.</td></tr>';
            return;
        }
        listaPerfis.forEach(p => {
            const tr = document.createElement('tr');
            const perms = Array.isArray(p.permissoes) ? p.permissoes.join(', ') : '-';
            tr.innerHTML = `
                <td><strong>${escapeHTML(p.id)}</strong></td>
                <td style="font-size:12px;">${escapeHTML(perms)}</td>
                <td><button type="button" class="btn-icon btn-editar-perfil" data-perfil="${escapeHTML(p.id)}" title="Editar" aria-label="Editar perfil de acesso">✏️</button></td>`;
            tbody.appendChild(tr);
        });
        tbody.querySelectorAll('.btn-editar-perfil').forEach(btn => btn.addEventListener('click', function() { adminEditarPerfil(this.getAttribute('data-perfil')); }));
    }

    window.adminEditarPerfil = function(perfilId) {
        const p = listaPerfis.find(x => x.id === perfilId);
        if (!p) return;
        document.getElementById('adminNomePerfil').value = p.id;
        desenharMatrizPermissoes();
        const perms = Array.isArray(p.permissoes) ? p.permissoes : [];
        const form = document.getElementById('formPerfilAdmin');
        const cbs = form ? form.querySelectorAll('.cb-perm') : document.querySelectorAll('.cb-perm');
        cbs.forEach(cb => { cb.checked = perms.includes(cb.value); });
        document.getElementById('tela-lista-perfis').style.display = 'none';
        document.getElementById('tela-formulario-perfis').style.display = 'block';
    };

    auth.onAuthStateChanged((user) => {
        if (user && document.getElementById('corpo-admin')) {
            carregarUsuarios();
            carregarPerfis();
            carregarOI();
        }
    });

    window.adminRecarregarDados = function() {
        carregarUsuarios();
        carregarPerfis();
        carregarOI();
    };
})();
