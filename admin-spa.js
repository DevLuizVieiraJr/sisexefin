// ==========================================
// ADMIN SPA - Listar, Editar e Bloquear Usuários e Perfis
// ==========================================
(function() {
    if (!document.getElementById('corpo-admin')) return;

    let listaUsuarios = [];
    let listaPerfis = [];

    function mostrarPainelAdmin(painel) {
        document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('ativo'));
        document.querySelectorAll('.admin-painel').forEach(p => p.classList.remove('visivel'));
        const tab = document.querySelector('.admin-tab:nth-child(' + (painel === 'usuarios' ? 1 : painel === 'perfis' ? 2 : 3) + ')');
        if (tab) tab.classList.add('ativo');
        const el = document.getElementById('painel-' + painel);
        if (el) el.classList.add('visivel');
    }

    window.mostrarPainelAdmin = mostrarPainelAdmin;

    async function carregarUsuarios() {
        const tbody = document.getElementById('tbodyUsuarios');
        if (!tbody) return;
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">A carregar...</td></tr>';
        try {
            const snap = await db.collection('usuarios').get();
            listaUsuarios = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            desenharTabelaUsuarios();
        } catch (err) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:red;">Erro ao carregar usuários.</td></tr>';
        }
    }

    async function carregarPerfis() {
        const tbody = document.getElementById('tbodyPerfis');
        if (!tbody) return;
        tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;">A carregar...</td></tr>';
        try {
            const snap = await db.collection('perfis').get();
            listaPerfis = snap.docs.map(doc => ({ id: doc.id, permissoes: doc.data().permissoes || [] }));
            desenharTabelaPerfis();
            popularSelectPerfis();
        } catch (err) {
            tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;color:red;">Erro ao carregar perfis.</td></tr>';
        }
    }

    function popularSelectPerfis() {
        const sel = document.getElementById('adminUsuarioPerfil');
        if (!sel) return;
        sel.innerHTML = '';
        const opt0 = document.createElement('option');
        opt0.value = '';
        opt0.textContent = '-- Selecionar perfil --';
        sel.appendChild(opt0);
        listaPerfis.forEach(p => {
            const opt = document.createElement('option');
            opt.value = p.id;
            opt.textContent = p.id;
            sel.appendChild(opt);
        });
    }

    function desenharTabelaUsuarios(filtrados) {
        const tbody = document.getElementById('tbodyUsuarios');
        if (!tbody) return;
        const dados = filtrados !== undefined ? filtrados : listaUsuarios;
        tbody.innerHTML = '';
        if (dados.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Nenhum usuário encontrado.</td></tr>';
            return;
        }
        dados.forEach(u => {
            const tr = document.createElement('tr');
            const status = u.bloqueado ? '<span class="status-bloqueado">Bloqueado</span>' : '<span class="status-ativo">Ativo</span>';
            tr.innerHTML = `
                <td><code style="font-size:11px;">${escapeHTML((u.id || '').substring(0, 12))}...</code></td>
                <td>${escapeHTML(u.email || '-')}</td>
                <td>${escapeHTML(u.perfil || '-')}</td>
                <td>${status}</td>
                <td>
                    <button type="button" class="btn-icon btn-editar-usuario" data-uid="${escapeHTML(u.id)}" title="Editar">✏️</button>
                    <button type="button" class="btn-outline btn-small btn-bloquear-usuario" data-uid="${escapeHTML(u.id)}" data-acao="${u.bloqueado ? 'desbloquear' : 'bloquear'}">${u.bloqueado ? 'Desbloquear' : 'Bloquear'}</button>
                </td>`;
            tbody.appendChild(tr);
        });
        tbody.querySelectorAll('.btn-editar-usuario').forEach(btn => btn.addEventListener('click', function() { adminEditarUsuario(this.getAttribute('data-uid')); }));
        tbody.querySelectorAll('.btn-bloquear-usuario').forEach(btn => btn.addEventListener('click', function() {
            const uid = this.getAttribute('data-uid');
            if (this.getAttribute('data-acao') === 'bloquear') adminBloquearUsuario(uid);
            else adminDesbloquearUsuario(uid);
        }));
    }

    window.filtrarListaUsuarios = function() {
        const q = (document.getElementById('buscaUsuarios') || {}).value.toLowerCase();
        if (!q.trim()) {
            desenharTabelaUsuarios();
            return;
        }
        const f = listaUsuarios.filter(u =>
            (u.email && u.email.toLowerCase().includes(q)) ||
            (u.perfil && u.perfil.toLowerCase().includes(q)) ||
            (u.id && u.id.toLowerCase().includes(q))
        );
        desenharTabelaUsuarios(f);
    };

    window.adminEditarUsuario = function(uid) {
        const u = listaUsuarios.find(x => x.id === uid);
        if (!u) return;
        document.getElementById('adminUsuarioUid').value = u.id;
        document.getElementById('adminUsuarioEmail').value = u.email || '';
        document.getElementById('adminUsuarioPerfil').value = u.perfil || '';
        mostrarPainelAdmin('cadastrar');
    };

    window.adminBloquearUsuario = async function(uid) {
        if (!confirm('Bloquear este usuário? Ele perderá o acesso ao sistema.')) return;
        try {
            await db.collection('usuarios').doc(uid).update({ bloqueado: true });
            alert('Usuário bloqueado.');
            carregarUsuarios();
        } catch (err) {
            alert('Erro ao bloquear: ' + (err.message || 'Acesso negado.'));
        }
    };

    window.adminDesbloquearUsuario = async function(uid) {
        try {
            await db.collection('usuarios').doc(uid).update({ bloqueado: false });
            alert('Usuário desbloqueado.');
            carregarUsuarios();
        } catch (err) {
            alert('Erro ao desbloquear: ' + (err.message || 'Acesso negado.'));
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
                <td><button type="button" class="btn-icon btn-editar-perfil" data-perfil="${escapeHTML(p.id)}" title="Editar">✏️</button></td>`;
            tbody.appendChild(tr);
        });
        tbody.querySelectorAll('.btn-editar-perfil').forEach(btn => btn.addEventListener('click', function() { adminEditarPerfil(this.getAttribute('data-perfil')); }));
    }

    window.adminEditarPerfil = function(perfilId) {
        const p = listaPerfis.find(x => x.id === perfilId);
        if (!p) return;
        document.getElementById('adminNomePerfil').value = p.id;
        document.querySelectorAll('.cb-perm').forEach(cb => {
            cb.checked = Array.isArray(p.permissoes) && p.permissoes.includes(cb.value);
        });
        mostrarPainelAdmin('cadastrar');
    };

    auth.onAuthStateChanged((user) => {
        if (user && document.getElementById('corpo-admin')) {
            carregarUsuarios();
            carregarPerfis();
        }
    });

    window.adminRecarregarDados = function() {
        carregarUsuarios();
        carregarPerfis();
    };
})();
