// ==========================================
// ADMIN SPA - Modal e ações de edição (baseUsuarios, basePerfis em script.js)
// ==========================================

// Abrir modal de edição
function abrirModalEditarUsuario(uid, email, perfilAtual) {
    document.getElementById('modalUsuarioUid').value = uid;
    document.getElementById('modalUsuarioEmail').textContent = email || uid;
    document.getElementById('modalEditarUsuario').style.display = 'flex';

    // Limpar checkboxes
    document.querySelectorAll('.cb-modal-perm').forEach(cb => cb.checked = false);
    const selectPerfil = document.getElementById('modalSelectPerfil');
    selectPerfil.value = perfilAtual || '';

    function preencherPermissoes(perms) {
        if (perms && perms.length) {
            perms.forEach(p => {
                const cb = document.querySelector(`.cb-modal-perm[value="${p}"]`);
                if (cb) cb.checked = true;
            });
        }
    }

    if (basePerfis.length === 0) {
        db.collection('perfis').get().then(snap => {
            basePerfis = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            const perfilDoc = basePerfis.find(p => p.id === perfilAtual);
            preencherPermissoes(perfilDoc ? perfilDoc.permissoes : null);
            selectPerfil.innerHTML = '<option value="">— Selecionar perfil —</option>';
            basePerfis.forEach(p => {
                const opt = document.createElement('option');
                opt.value = p.id;
                opt.textContent = p.id;
                selectPerfil.appendChild(opt);
            });
            selectPerfil.value = perfilAtual || '';
        });
    } else {
        const perfilDoc = basePerfis.find(p => p.id === perfilAtual);
        preencherPermissoes(perfilDoc ? perfilDoc.permissoes : null);
    }
}

function fecharModalUsuario() {
    document.getElementById('modalEditarUsuario').style.display = 'none';
}

// Ao selecionar perfil pré-definido, marcar checkboxes correspondentes
document.addEventListener('DOMContentLoaded', function() {
    const selectPerfil = document.getElementById('modalSelectPerfil');
    if (selectPerfil) {
        selectPerfil.addEventListener('change', function() {
            const perfilId = this.value;
            if (!perfilId) return;
            const perfilDoc = basePerfis.find(p => p.id === perfilId);
            document.querySelectorAll('.cb-modal-perm').forEach(cb => cb.checked = false);
            if (perfilDoc && perfilDoc.permissoes) {
                perfilDoc.permissoes.forEach(perm => {
                    const cb = document.querySelector(`.cb-modal-perm[value="${perm}"]`);
                    if (cb) cb.checked = true;
                });
            }
        });
    }
});

// Guardar perfil do utilizador
function salvarPerfilUsuario() {
    const uid = document.getElementById('modalUsuarioUid').value;
    const perfilSelect = document.getElementById('modalSelectPerfil').value;
    const checkboxes = document.querySelectorAll('.cb-modal-perm:checked');
    const permissoesCustom = Array.from(checkboxes).map(cb => cb.value);

    if (!uid) return;

    let perfilId = perfilSelect;
    if (!perfilId && permissoesCustom.length > 0) {
        perfilId = 'custom_' + uid;
        db.collection('perfis').doc(perfilId).set({ permissoes: permissoesCustom }, { merge: true })
            .then(() => atualizarUsuarioPerfil(uid, perfilId));
    } else if (perfilId) {
        if (permissoesCustom.length > 0 && perfilId.startsWith('custom_')) {
            db.collection('perfis').doc(perfilId).set({ permissoes: permissoesCustom }, { merge: true })
                .then(() => atualizarUsuarioPerfil(uid, perfilId));
        } else {
            atualizarUsuarioPerfil(uid, perfilId);
        }
    } else {
        alert('Selecione um perfil ou marque pelo menos uma permissão.');
        return;
    }
}

function atualizarUsuarioPerfil(uid, perfilId) {
    const userDoc = baseUsuarios.find(u => u.id === uid);
    const email = userDoc ? userDoc.email : '';

    db.collection('usuarios').doc(uid).set({ email: email, perfil: perfilId }, { merge: true })
        .then(() => {
            alert('Perfil atualizado com sucesso!');
            fecharModalUsuario();
            recarregarUsuarios();
        })
        .catch(err => {
            alert('Erro ao guardar: ' + (err.message || 'Acesso negado.'));
        });
}

// Inicialização (o form Perfis é tratado pelo script.js)
document.addEventListener('DOMContentLoaded', function() {
    // Carregar perfis para o select do modal ao entrar na secção Perfis
    const btnPerfis = document.querySelector('[onclick*="secao-perfis"]');
    if (btnPerfis) {
        btnPerfis.addEventListener('click', function() {
            setTimeout(carregarPerfisNoSelect, 100);
        });
    }

    // Carregar usuários ao carregar a página (se estiver na secção Usuários)
    if (document.getElementById('secao-usuarios') && document.getElementById('secao-usuarios').style.display !== 'none') {
        recarregarUsuarios();
    }
});
