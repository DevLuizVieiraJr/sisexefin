/**
 * Página conta.html — dados do usuário, tema e alteração de senha.
 */
(function () {
    function formatarCPFVisivel(d) {
        if (!d || String(d).length !== 11) return d || '—';
        var s = String(d).replace(/\D/g, '');
        if (s.length !== 11) return d;
        return s.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
    }

    function formatarDataFirestore(val) {
        if (!val) return '—';
        if (typeof val.toDate === 'function') {
            try {
                return val.toDate().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
            } catch (e) { return '—'; }
        }
        if (val instanceof Date) return val.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
        return String(val);
    }

    function labelOrigem(o) {
        if (o === 'google') return 'Google';
        if (o === 'email') return 'E-mail e senha';
        return o || '—';
    }

    function temProvedorSenha(user) {
        if (!user || !user.providerData) return false;
        return user.providerData.some(function (p) { return p && p.providerId === 'password'; });
    }

    function listaProvedores(user) {
        if (!user || !user.providerData || !user.providerData.length) return '—';
        var map = {
            'password': 'E-mail/senha',
            'google.com': 'Google'
        };
        return user.providerData.map(function (p) {
            return map[p.providerId] || p.providerId || '?';
        }).join(', ');
    }

    function mensagemErroAuth(code) {
        var m = {
            'auth/wrong-password': 'Senha atual incorreta.',
            'auth/weak-password': 'A nova senha é fraca. Use pelo menos 8 caracteres com letras e números.',
            'auth/requires-recent-login': 'Por segurança, termine a sessão e entre novamente antes de alterar a senha.',
            'auth/too-many-requests': 'Muitas tentativas. Aguarde um momento e tente de novo.',
            'auth/network-request-failed': 'Falha de rede. Verifique a conexão.'
        };
        return m[code] || 'Não foi possível concluir a operação.';
    }

    async function preencherDadosUtilizador() {
        var el = document.getElementById('conta-dados-corpo');
        var user = auth.currentUser;
        if (!el || !user) return;
        el.innerHTML = '<p class="conta-msg-loading">Carregando…</p>';
        try {
            var snap = await db.collection('usuarios').doc(user.uid).get();
            var d = snap.exists ? snap.data() : {};
            var perfis = Array.isArray(d.perfis) ? d.perfis : (d.perfil ? [d.perfil] : []);
            var linhas = [
                ['E-mail (sessão)', escapeHTML(user.email || d.email || '—')],
                ['Nome completo', escapeHTML(d.nomeCompleto || user.displayName || '—')],
                ['Nome de guerra', escapeHTML(d.nomeGuerra || '—')],
                ['CPF', escapeHTML(formatarCPFVisivel(d.cpf) || '—')],
                ['Estado', escapeHTML(d.status || (d.bloqueado ? 'bloqueado' : '—'))],
                ['Perfis', escapeHTML(perfis.length ? perfis.join(', ') : '—')],
                ['Perfil ativo', escapeHTML(d.perfil_ativo || d.perfil || '—')],
                ['OI', escapeHTML(d.oi || '—')],
                ['Origem (cadastro)', escapeHTML(labelOrigem(d.origem))],
                ['Provedores de login', escapeHTML(listaProvedores(user))],
                ['Registo no sistema', escapeHTML(formatarDataFirestore(d.criadoEm))]
            ];
            var html = '<dl class="conta-grid-dl">';
            linhas.forEach(function (pair) {
                html += '<dt>' + pair[0] + '</dt><dd>' + pair[1] + '</dd>';
            });
            html += '</dl>';
            el.innerHTML = html;
        } catch (err) {
            el.innerHTML = '<p class="conta-msg-erro">Não foi possível carregar os dados. ' + escapeHTML(err.message || String(err)) + '</p>';
        }
    }

    function configurarTema() {
        var sel = document.getElementById('conta-select-tema');
        if (!sel || !window.sisExeFinTema) return;
        sel.value = window.sisExeFinTema.preferencia();
        sel.addEventListener('change', function () {
            window.sisExeFinTema.definir(sel.value);
        });
    }

    function configurarSenha() {
        var bloco = document.getElementById('conta-bloco-senha');
        var aviso = document.getElementById('conta-senha-google');
        var form = document.getElementById('conta-form-senha');
        var user = auth.currentUser;
        if (!bloco || !user) return;

        if (!temProvedorSenha(user)) {
            if (aviso) aviso.style.display = 'block';
            if (form) form.style.display = 'none';
            return;
        }
        if (aviso) aviso.style.display = 'none';
        if (form) form.style.display = 'block';

        form.addEventListener('submit', async function (e) {
            e.preventDefault();
            var atual = (document.getElementById('conta-senha-atual') || {}).value || '';
            var nova = (document.getElementById('conta-senha-nova') || {}).value || '';
            var conf = (document.getElementById('conta-senha-conf') || {}).value || '';
            var msg = document.getElementById('conta-senha-msg');
            var btn = form.querySelector('button[type="submit"]');

            if (msg) { msg.textContent = ''; msg.className = 'conta-form-msg'; }
            if (!atual) {
                if (msg) { msg.textContent = 'Informe a senha atual.'; msg.className = 'conta-form-msg conta-form-msg-erro'; }
                return;
            }
            if (!validarSenhaForte(nova)) {
                if (msg) {
                    msg.textContent = 'Nova senha: mínimo 8 caracteres, incluindo letras e números.';
                    msg.className = 'conta-form-msg conta-form-msg-erro';
                }
                return;
            }
            if (nova !== conf) {
                if (msg) { msg.textContent = 'A confirmação não coincide com a nova senha.'; msg.className = 'conta-form-msg conta-form-msg-erro'; }
                return;
            }

            if (btn) { btn.disabled = true; btn.textContent = 'Salvando…'; }
            try {
                var cred = firebase.auth.EmailAuthProvider.credential(user.email, atual);
                await user.reauthenticateWithCredential(cred);
                await user.updatePassword(nova);
                form.reset();
                if (msg) { msg.textContent = 'Senha alterada com sucesso.'; msg.className = 'conta-form-msg conta-form-msg-ok'; }
            } catch (err) {
                var texto = err.code ? mensagemErroAuth(err.code) : (err.message || 'Erro desconhecido.');
                if (msg) { msg.textContent = texto; msg.className = 'conta-form-msg conta-form-msg-erro'; }
            } finally {
                if (btn) { btn.disabled = false; btn.textContent = 'Alterar senha'; }
            }
        });
    }

    window.inicializarPaginaConta = function () {
        preencherDadosUtilizador();
        configurarTema();
        configurarSenha();
    };
})();
