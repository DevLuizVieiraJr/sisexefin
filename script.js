//const db = firebase.firestore();
//const auth = firebase.auth();
let usuarioLogadoEmail = "";

// ==========================================
// UTILITÁRIOS GERAIS
// ==========================================
function escapeHTML(str) {
    if (str === null || str === undefined) return "";
    const p = document.createElement('p');
    p.textContent = str;
    return p.innerHTML;
}
// ============================================================
// LOADING GLOBAL (atraso 3s + prompt 60s com Interromper)
// ============================================================
let __loadingState = {
    active: false,
    showTimerId: null,
    promptTimerId: null,
    startedAt: 0,
    // Função chamada quando o usuário confirmar "Interromper"
    abortFn: null,
};

function __getLoadingOverlayEl() {
    return document.getElementById('loadingApp');
}

function __ensureOverlayProgressEl(overlay) {
    if (!overlay) return;
    if (overlay.querySelector('#loadingOverlayProgress')) return;
    const wrap = document.createElement('div');
    wrap.id = 'loadingOverlayProgress';
    wrap.className = 'loading-overlay-progress';
    wrap.innerHTML = '<div class="loading-overlay-progress-inner"></div>';
    overlay.appendChild(wrap);
}

function __setOverlayTexto(texto) {
    const overlay = __getLoadingOverlayEl();
    if (!overlay) return;
    const p = overlay.querySelector('p');
    if (p) p.textContent = texto || 'Carregando...';
}

function __hideLoadingOverlay() {
    const overlay = __getLoadingOverlayEl();
    if (overlay) overlay.style.display = 'none';
}

function __clearTimers() {
    if (__loadingState.showTimerId) clearTimeout(__loadingState.showTimerId);
    if (__loadingState.promptTimerId) clearTimeout(__loadingState.promptTimerId);
    __loadingState.showTimerId = null;
    __loadingState.promptTimerId = null;
}

function __schedule60sPrompt() {
    // Loop: se o usuário continuar aguardando, reprograma os próximos 60s.
    __loadingState.promptTimerId = setTimeout(function promptAgain() {
        if (!__loadingState.active) return;
        const continuar = window.confirm('O carregamento está lento demais, deseja continuar aguardando ou interromper?');
        if (continuar) {
            __schedule60sPrompt();
            return;
        }

        const confirmarInterromper = window.confirm(
            'Esta ação pode ocasionar em perdas de update e um novo import deverá ser feito. Deseja interromper?'
        );
        if (!confirmarInterromper) {
            __schedule60sPrompt();
            return;
        }

        // Interrompe: cancela a operação via abortFn e fecha o overlay.
        __loadingState.active = false;
        __clearTimers();
        __hideLoadingOverlay();
        if (typeof __loadingState.abortFn === 'function') {
            try { __loadingState.abortFn(); } catch (e) {}
        }
    }, 60000);
}

window.__setLoadingAbortFn = function(fn) {
    __loadingState.abortFn = typeof fn === 'function' ? fn : null;
};

// Regras:
// - o overlay só aparece se passar de 3s
// - se passar de 60s, pergunta se continua ou interrompe
function mostrarLoading(texto) {
    const overlay = __getLoadingOverlayEl();
    if (!overlay) return;

    __loadingState.active = true;
    __loadingState.startedAt = Date.now();
    __setOverlayTexto(texto || 'Carregando...');

    // Garante que o overlay comece escondido (só aparece após 3s)
    overlay.style.display = 'none';

    // Delay 3s: evita flicker e respeita a regra do usuário.
    __loadingState.showTimerId = setTimeout(function showOverlayAfterDelay() {
        if (!__loadingState.active) return;
        __ensureOverlayProgressEl(overlay);
        overlay.style.display = 'flex';
        __schedule60sPrompt();
    }, 3000);
}

function esconderLoading() {
    __loadingState.active = false;
    __clearTimers();
    __hideLoadingOverlay();
    // Mantém abortFn apontando só se outro fluxo decidir reutilizar; aqui limpamos.
    __loadingState.abortFn = null;
}

/** Barra de loading (Carregando / Processando / Salvando) - feedback visual para operações */
function criarBarraLoading() {
    if (document.getElementById('loadingBar')) return;
    const bar = document.createElement('div');
    bar.id = 'loadingBar';
    bar.className = 'loading-bar';
    bar.style.position = 'relative';
    bar.innerHTML = '<div class="loading-bar-spinner"></div><span class="loading-bar-text" id="loadingBarText">Processando...</span><div class="loading-bar-progress"></div>';
    document.body.appendChild(bar);
}
function mostrarBarraLoading(texto) {
    criarBarraLoading();
    const bar = document.getElementById('loadingBar');
    const txt = document.getElementById('loadingBarText');
    if (txt) txt.textContent = texto || 'Processando...';
    if (bar) bar.classList.add('visivel');
}
function esconderBarraLoading() {
    const bar = document.getElementById('loadingBar');
    if (bar) { bar.classList.remove('visivel'); bar.style.display = 'none'; }
}
window.mostrarBarraLoading = mostrarBarraLoading;
window.esconderBarraLoading = esconderBarraLoading;
function debounce(func, timeout = 300) { let timer; return (...args) => { clearTimeout(timer); timer = setTimeout(() => { func.apply(this, args); }, timeout); }; }

function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    if (!sidebar) return;
    const colapsado = sidebar.classList.toggle('colapsado');
    try { localStorage.setItem('sidebarColapsado', colapsado ? '1' : '0'); } catch (e) {}
    const toggle = sidebar.querySelector('.sidebar-toggle');
    if (toggle) {
        const icon = toggle.querySelector('.menu-btn-icon');
        const text = toggle.querySelector('.sidebar-toggle-text');
        if (icon) {
            if (icon.classList) {
                icon.classList.toggle('fa-chevron-left', !colapsado);
                icon.classList.toggle('fa-chevron-right', colapsado);
            } else {
                icon.textContent = colapsado ? '\u25B6' : '\u25C0';
            }
        }
        if (text) text.textContent = colapsado ? ' Mostrar menu' : ' Ocultar menu';
    }
}
window.toggleSidebar = toggleSidebar;

function initSidebarState() {
    const sidebar = document.getElementById('sidebar');
    if (!sidebar) return;
    try {
        if (localStorage.getItem('sidebarColapsado') === '1') {
            sidebar.classList.add('colapsado');
            const toggle = sidebar.querySelector('.sidebar-toggle');
            if (toggle) {
                const icon = toggle.querySelector('.menu-btn-icon');
                const text = toggle.querySelector('.sidebar-toggle-text');
                if (icon && icon.classList) {
                    icon.classList.remove('fa-chevron-left');
                    icon.classList.add('fa-chevron-right');
                } else if (icon) icon.textContent = '\u25B6';
                if (text) text.textContent = ' Mostrar menu';
            }
        }
    } catch (e) {}
}

/** Registra ação administrativa na coleção auditoria. Apenas admins podem criar. */
async function registrarAuditoria(acao, alvo, detalhes) {
    const user = auth.currentUser;
    if (!user) return;
    try {
        await db.collection('auditoria').add({
            acao,
            alvo: String(alvo || ''),
            detalhes: typeof detalhes === 'object' ? JSON.stringify(detalhes) : String(detalhes || ''),
            adminUid: user.uid,
            adminEmail: user.email || '',
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });
    } catch (err) {
        console.warn('Erro ao registrar auditoria:', err);
    }
}
window.registrarAuditoria = registrarAuditoria;

/** Valida senha forte: mínimo 8 caracteres, pelo menos 1 letra e 1 número. */
function validarSenhaForte(senha) {
    if (!senha || senha.length < 8) return false;
    const temLetra = /[a-zA-Z]/.test(senha);
    const temNumero = /\d/.test(senha);
    return temLetra && temNumero;
}

/** Exibe apenas os últimos 12 caracteres da NE (ex: 2024NE000001). O valor completo permanece no banco. */
function formatarNumEmpenhoVisivel(numEmpenho) {
    if (!numEmpenho) return '-';
    const s = String(numEmpenho).trim();
    if (s.length <= 12) return s;
    return s.slice(-12);
}

/** Formata CNPJ como 00.000.000/0000-00 */
function formatarCNPJ(val) {
    if (!val) return '-';
    const d = String(val).replace(/\D/g, '');
    if (d.length !== 14) return val;
    return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
}

// ==========================================
// MÓDULO RBAC - Multi-perfis + Role Switching (Princípio do Menor Privilégio)
// ==========================================
let permissoesEmCache = [];
let perfilAtualEmCache = null;   // Perfil ativo na sessão
let perfisDoUsuario = [];        // Perfis atribuídos ao utilizador (permite troca)

async function carregarPermissoes() {
    const user = auth.currentUser;
    if (!user) return [];
    try {
        const userDoc = await db.collection('usuarios').doc(user.uid).get();
        if (!userDoc.exists) return [];
        const data = userDoc.data();
        if (data.bloqueado === true) return []; // Usuário bloqueado perde todas as permissões

        // Migração: perfil (legado) -> perfis[] + perfil_ativo
        let perfis = Array.isArray(data.perfis) ? data.perfis : (data.perfil ? [data.perfil] : []);
        let perfilAtivo = data.perfil_ativo || data.perfilAtual || data.perfil || (perfis[0] || null);
        if (perfis.length === 0 && data.perfil) perfis = [data.perfil];
        if (!perfis.includes(perfilAtivo) && perfis.length > 0) perfilAtivo = perfis[0];

        perfilAtualEmCache = perfilAtivo;
        perfisDoUsuario = perfis;

        let perfilDoc = { exists: false };
        const idsParaTentar = [];
        if (perfilAtivo && typeof perfilAtivo === 'string') idsParaTentar.push(perfilAtivo.trim());
        perfis.forEach(p => { if (p && typeof p === 'string' && !idsParaTentar.includes(p.trim())) idsParaTentar.push(p.trim()); });
        for (const id of idsParaTentar) {
            if (!id) continue;
            perfilDoc = await db.collection('perfis').doc(id).get();
            if (perfilDoc.exists) break;
            if (id !== id.toLowerCase()) {
                perfilDoc = await db.collection('perfis').doc(id.toLowerCase()).get();
                if (perfilDoc.exists) break;
            }
        }
        permissoesEmCache = perfilDoc.exists ? (perfilDoc.data().permissoes || []) : [];
        return permissoesEmCache;
    } catch (error) { return []; }
}

async function trocarPerfil(perfilId) {
    const user = auth.currentUser;
    if (!user || !perfisDoUsuario.includes(perfilId)) return;
    if (!confirm("Deseja alternar a sua sessão para o perfil " + perfilId + "?")) return;
    try {
        await db.collection('usuarios').doc(user.uid).update({ perfil_ativo: perfilId });
        window.location.reload();
    } catch (err) { alert("Erro ao trocar perfil: " + (err.message || err.code || err)); }
}
window.trocarPerfil = trocarPerfil;


/**
 * Verifica se o utilizador tem permissão para UI (com fallback para admins).
 * Regra de salvação: acesso_admin implica dashboard_ler, backup_ler e acesso às Tabelas de Apoio.
 */
function temPermissaoUI(perm) {
    if (!perm || typeof perm !== 'string') return false;
    if (permissoesEmCache.includes(perm)) return true;
    // Fallback: admins ganham implicitamente Dashboard, Backup e todas as seções de Tabelas de Apoio
    if (permissoesEmCache.includes('acesso_admin')) {
        if (perm === 'dashboard_ler' || perm === 'backup_ler') return true;
        const modulosSistema = ['empenhos', 'lf', 'pf', 'op', 'dedenc', 'contratos', 'fornecedores', 'titulos', 'centrocustos', 'ug'];
        if (modulosSistema.some(m => perm === m + '_ler')) return true;
    }
    return false;
}
window.temPermissaoUI = temPermissaoUI;

/**
 * Motor de ocultação de UI (RBAC). Remove elementos sem permissão do DOM (el.remove).
 * Deve ser chamada após carregarPermissoes().
 */
function aplicarPermissoesUI() {
    document.querySelectorAll('[data-permission]').forEach(el => {
        const req = el.getAttribute('data-permission');
        if (!temPermissaoUI(req)) el.remove();
    });
}
window.aplicarPermissoesUI = aplicarPermissoesUI;

/** @deprecated Use aplicarPermissoesUI */
function renderizarElementosRBAC() { aplicarPermissoesUI(); }

function atualizarSeletorPerfil() {
    const container = document.getElementById('containerSeletorPerfil');
    const select = document.getElementById('seletorPerfilAtivo');
    if (!container || !select) return;
    if (typeof perfisDoUsuario === 'undefined' || perfisDoUsuario.length <= 1) {
        container.style.display = 'none';
        return;
    }
    container.style.display = 'flex';
    select.innerHTML = '';
    perfisDoUsuario.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p;
        opt.textContent = p;
        if (p === perfilAtualEmCache) opt.selected = true;
        select.appendChild(opt);
    });
}
window.atualizarSeletorPerfil = atualizarSeletorPerfil;

function gerarBotoesAcao(id, modulo, itemOpt) {
    const safeId = escapeHTML(id);
    const modMap = { empenho: 'empenhos', contrato: 'contratos', fornecedor: 'fornecedores', titulo: 'titulos', darf: 'darf', deducoesEncargos: 'dedenc', lfpf: 'lf', centrocustos: 'centrocustos', ug: 'ug' };
    const mod = modMap[modulo] || modulo;
    let html = '';
    if (modulo === 'lfpf') {
        if (permissoesEmCache.includes('lf_editar')) html += `<button type="button" class="btn-icon btn-editar-lfpf" data-id="${safeId}" title="Editar">✏️</button>`;
        if (permissoesEmCache.includes('lf_excluir')) html += `<button type="button" class="btn-icon btn-inativar-lfpf" data-id="${safeId}" title="Inativar/Cancelar">🚫</button>`;
        if (permissoesEmCache.includes('acesso_admin')) html += `<button type="button" class="btn-icon btn-apagar-lfpf-permanente" data-id="${safeId}" title="Excluir permanentemente">🗑️</button>`;
        return html;
    }
    if (modulo === 'empenho') {
        if (permissoesEmCache.includes('empenhos_ler')) html += `<button type="button" class="btn-icon btn-visualizar-empenho" data-id="${safeId}" title="Visualizar">👁️</button>`;
        if (permissoesEmCache.includes('empenhos_editar')) html += `<button type="button" class="btn-icon btn-editar-empenho" data-id="${safeId}" title="Editar">✏️</button>`;
        if (permissoesEmCache.includes('empenhos_excluir')) html += `<button type="button" class="btn-icon btn-inativar-empenho" data-id="${safeId}" title="Inativar/Cancelar">🚫</button>`;
        if (permissoesEmCache.includes('acesso_admin')) html += `<button type="button" class="btn-icon btn-apagar-empenho-permanente" data-id="${safeId}" title="Excluir permanentemente">🗑️</button>`;
        return html;
    }
    // Centro de Custos e UG: editar; excluir = inativar (usuários); reativar e excluir permanente só ADMIN
    if (modulo === 'centrocustos' || modulo === 'ug' || modulo === 'fornecedor') {
        const ativo = itemOpt && itemOpt.ativo !== false;
        if (permissoesEmCache.includes(mod + '_editar')) html += `<button type="button" class="btn-icon btn-editar-${modulo}" data-id="${safeId}" title="Editar">✏️</button>`;
        if (ativo && permissoesEmCache.includes(mod + '_excluir')) html += `<button type="button" class="btn-icon btn-inativar-${modulo}" data-id="${safeId}" title="Inativar (excluir da lista)">🚫</button>`;
        if (!ativo && permissoesEmCache.includes('acesso_admin')) html += `<button type="button" class="btn-icon btn-reativar-${modulo}" data-id="${safeId}" title="Reativar">✓</button>`;
        if (permissoesEmCache.includes('acesso_admin')) html += `<button type="button" class="btn-icon btn-apagar-${modulo}-permanente" data-id="${safeId}" title="Excluir permanentemente">🗑️</button>`;
        return html;
    }
    if (modulo === 'deducoesEncargos') {
        if (permissoesEmCache.includes('dedenc_editar')) html += `<button type="button" class="btn-icon btn-editar-deducoesEncargos" data-id="${safeId}" title="Editar">✏️</button>`;
        if (permissoesEmCache.includes('dedenc_excluir')) html += `<button type="button" class="btn-icon btn-apagar-deducoesEncargos" data-id="${safeId}" title="Excluir">🗑️</button>`;
        return html;
    }
    if (permissoesEmCache.includes(mod + '_editar')) html += `<button type="button" class="btn-icon btn-editar-${modulo}" data-id="${safeId}">✏️</button>`;
    if (permissoesEmCache.includes(mod + '_excluir')) html += `<button type="button" class="btn-icon btn-apagar-${modulo}" data-id="${safeId}">🗑️</button>`;
    return html;
}

// ==========================================
// INICIALIZAÇÃO DA SESSÃO (Resolve null & Race Conditions)
// ==========================================
function usuarioPodeAcessarSistema(data) {
    if (!data) return false;
    if (data.bloqueado === true || data.status === 'bloqueado') return false;
    if (data.status === 'pendente') return false;
    const perfis = Array.isArray(data.perfis) ? data.perfis : (data.perfil ? [data.perfil] : []);
    const perfilAtivo = data.perfil_ativo || data.perfilAtual || data.perfil || (perfis[0] || null);
    return perfis.length > 0 && perfilAtivo && perfis.includes(perfilAtivo);
}

auth.onAuthStateChanged(async (user) => {
    if (user) {
        const userDoc = await db.collection('usuarios').doc(user.uid).get();
        const data = userDoc.exists ? userDoc.data() : null;
        if (!usuarioPodeAcessarSistema(data)) {
            window.location.replace('index.html');
            return;
        }
        usuarioLogadoEmail = user.email;
        const elUser = document.getElementById('nomeUsuarioLogado');
        if (elUser) elUser.textContent = `👤 ${usuarioLogadoEmail}`;
        
        // Espera SINCRONAMENTE pelas permissões antes de exibir qualquer tela
        await carregarPermissoes();
        
        const corpoSistema = document.getElementById('corpo-sistema');
        const corpoAdmin = document.getElementById('corpo-admin');
        const corpoTitulos = document.getElementById('corpo-titulos');
        const corpoDashboard = document.getElementById('corpo-dashboard');

        // Lógica de Rota: Estamos no Admin?
        if (corpoAdmin) {
            if (!permissoesEmCache.includes('acesso_admin')) {
                alert("Acesso Negado! Redirecionando...");
                window.location.replace('dashboard.html');
                return;
            }
            corpoAdmin.style.display = 'flex';
        }
        // Lógica de Rota: Estamos na SPA Títulos?
        else if (corpoTitulos) {
            if (!permissoesEmCache.includes('titulos_ler')) {
                alert("Acesso Negado ao módulo TC. Redirecionando...");
                window.location.replace('dashboard.html');
                return;
            }
            aplicarPermissoesUI();
            atualizarSeletorPerfil();
            corpoTitulos.style.display = 'flex';
            if (typeof inicializarTitulosSPA === 'function') inicializarTitulosSPA();
        }
        // Lógica de Rota: Estamos no Sistema (Tabelas de Apoio)?
        else if (corpoSistema) {
            aplicarPermissoesUI();
            atualizarSeletorPerfil();
            corpoSistema.style.display = 'flex';
            if (typeof window.inicializarSecaoSistema === 'function') window.inicializarSecaoSistema();
        }
        // Lógica de Rota: Estamos no Dashboard?
        else if (corpoDashboard) {
            aplicarPermissoesUI();
            atualizarSeletorPerfil();
            corpoDashboard.style.display = 'flex';
            esconderLoading();
        }
        if (typeof iniciarWatcherInatividade === 'function') iniciarWatcherInatividade();
    } else {
        window.location.href = "index.html";
    }
});
function fazerLogout() { auth.signOut(); }

// ==========================================
// TIMEOUT POR INATIVIDADE (30 min + aviso 2 min)
// ==========================================
const INATIVIDADE_MS = 30 * 60 * 1000; // 30 minutos
const AVISO_MS = 2 * 60 * 1000;

function iniciarWatcherInatividade() {
    if (!auth.currentUser) return;
    let timerPrincipal = null;
    let timerAviso = null;
    let modalEl = null;

    function fazerLogoutPorInatividade() {
        if (timerPrincipal) clearTimeout(timerPrincipal);
        if (timerAviso) clearTimeout(timerAviso);
        if (modalEl && modalEl.parentNode) modalEl.remove();
        auth.signOut();
        window.location.replace('index.html');
    }

    const eventos = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart', 'click'];
    const debouncedReset = debounce(reiniciarTimer, 1000);

    function pausarListeners() {
        eventos.forEach(ev => document.removeEventListener(ev, debouncedReset));
    }
    function retomarListeners() {
        eventos.forEach(ev => document.addEventListener(ev, debouncedReset));
    }

    function mostrarModalAviso() {
        if (modalEl) return;
        pausarListeners();
        modalEl = document.createElement('div');
        modalEl.id = 'modal-inatividade';
        modalEl.innerHTML = `
            <div style="position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:99999;display:flex;align-items:center;justify-content:center;">
                <div style="background:white;padding:30px;border-radius:8px;box-shadow:0 4px 20px rgba(0,0,0,0.3);max-width:400px;text-align:center;">
                    <p style="font-size:16px;margin-bottom:20px;color:#333;">Sessão expirando por inatividade em 2 minutos.<br>Clique em Continuar para permanecer conectado.</p>
                    <div style="display:flex;gap:10px;justify-content:center;">
                        <button type="button" id="btn-continuar-sessao" class="btn-primary" style="padding:10px 20px;">Continuar</button>
                        <button type="button" id="btn-sair-sessao" class="btn-default" style="padding:10px 20px;">Sair</button>
                    </div>
                </div>
            </div>`;
        document.body.appendChild(modalEl);
        document.getElementById('btn-continuar-sessao').addEventListener('click', fecharModalEResetar);
        document.getElementById('btn-sair-sessao').addEventListener('click', fazerLogoutPorInatividade);
        timerAviso = setTimeout(fazerLogoutPorInatividade, AVISO_MS);
    }

    function reiniciarTimer() {
        if (timerPrincipal) clearTimeout(timerPrincipal);
        timerPrincipal = setTimeout(mostrarModalAviso, INATIVIDADE_MS);
    }

    function fecharModalEResetar() {
        if (modalEl && modalEl.parentNode) modalEl.remove();
        modalEl = null;
        if (timerAviso) { clearTimeout(timerAviso); timerAviso = null; }
        retomarListeners();
        reiniciarTimer();
    }

    eventos.forEach(ev => document.addEventListener(ev, debouncedReset));
    reiniciarTimer();
}
window.iniciarWatcherInatividade = iniciarWatcherInatividade;

// ==========================================
// LÓGICA DO PAINEL ADMIN (Agora integrada de forma segura)
// ==========================================
const formPerfilAdmin = document.getElementById('formPerfilAdmin');
if (formPerfilAdmin) {
    formPerfilAdmin.addEventListener('submit', async function(e) {
        e.preventDefault();
        const nomePerfil = document.getElementById('adminNomePerfil').value.trim().toLowerCase();
        const form = document.getElementById('formPerfilAdmin');
        const checkboxes = form ? form.querySelectorAll('.cb-perm:checked') : document.querySelectorAll('.cb-perm:checked');
        const permissoesSelecionadas = Array.from(checkboxes).map(cb => cb.value);
        const btn = formPerfilAdmin.querySelector('button[type="submit"]');
        if (typeof window.adminLoading === 'function') window.adminLoading(true);
        if (typeof window.btnLoading === 'function' && btn) window.btnLoading(btn, true);
        mostrarBarraLoading('Salvando...');
        try {
            await db.collection('perfis').doc(nomePerfil).set({ permissoes: permissoesSelecionadas }, { merge: true });
            alert(`Perfil '${nomePerfil}' salvo com sucesso!`);
            formPerfilAdmin.reset();
            if (typeof window.adminRecarregarDados === 'function') window.adminRecarregarDados();
            if (typeof window.voltarListaPerfis === 'function') window.voltarListaPerfis();
        } catch (err) { alert("Acesso Negado: Apenas o Admin pode gravar."); }
        finally {
            esconderBarraLoading();
            if (typeof window.adminLoading === 'function') window.adminLoading(false);
            if (typeof window.btnLoading === 'function' && btn) window.btnLoading(btn, false);
        }
    });
}

const formUsuarioAdmin = document.getElementById('formUsuarioAdmin');
if (formUsuarioAdmin) {
    formUsuarioAdmin.addEventListener('submit', async function(e) {
        e.preventDefault();
        const uid = (document.getElementById('adminUsuarioUid') || {}).value ? document.getElementById('adminUsuarioUid').value.trim() : '';
        const email = document.getElementById('adminUsuarioEmail').value.trim();
        const cpfEl = document.getElementById('adminUsuarioCPF');
        const cpfRaw = (cpfEl && cpfEl.value) ? cpfEl.value.replace(/\D/g, '') : '';
        if (cpfRaw.length > 0 && cpfRaw.length !== 11) { alert("CPF inválido. Digite 11 números."); return; }
        if (cpfRaw.length === 11 && typeof validarCPF === 'function' && !validarCPF(cpfEl.value)) { alert("CPF inválido. Verifique os dígitos."); return; }
        const nomeCompleto = (document.getElementById('adminUsuarioNome') || {}).value ? document.getElementById('adminUsuarioNome').value.trim() : '';
        const nomeGuerra = (document.getElementById('adminUsuarioNomeGuerra') || {}).value ? document.getElementById('adminUsuarioNomeGuerra').value.trim() : '';
        const oiEl = document.getElementById('adminUsuarioOI');
        const oi = (oiEl && oiEl.value) ? oiEl.value : null;
        const checkboxes = document.querySelectorAll('.cb-perfil-usuario:checked');
        const perfis = Array.from(checkboxes).map(cb => cb.value.trim().toLowerCase());
        const perfilAtualEl = document.getElementById('adminUsuarioPerfilAtual');
        let perfilAtual = (perfilAtualEl && perfilAtualEl.value) ? perfilAtualEl.value.trim().toLowerCase() : null;
        if (perfis.length === 0) { alert("Selecione pelo menos um perfil."); return; }
        if (!perfilAtual || !perfis.includes(perfilAtual)) perfilAtual = perfis[0];

        const dados = { email, perfis, perfil_ativo: perfilAtual, status: 'ativo' };
        if (cpfRaw.length === 11) dados.cpf = cpfRaw;
        if (nomeCompleto) dados.nomeCompleto = nomeCompleto;
        if (nomeGuerra) dados.nomeGuerra = nomeGuerra;
        if (oi) dados.oi = oi;

        const btn = formUsuarioAdmin.querySelector('button[type="submit"]');
        if (typeof window.adminLoading === 'function') window.adminLoading(true);
        if (typeof window.btnLoading === 'function' && btn) window.btnLoading(btn, true);
        mostrarBarraLoading('Salvando...');
        try {
            let uidFinal = uid;
            if (!uid) {
                const senhaInicial = (document.getElementById('adminUsuarioSenhaInicial') || {}).value || '';
                if (!validarSenhaForte(senhaInicial)) {
                    alert("Para novo usuário, informe senha forte: mínimo 8 caracteres, incluindo letras e números.");
                    return;
                }
                const secondaryAppName = 'adminUserCreator';
                const secondaryApp = firebase.apps.find(app => app.name === secondaryAppName) ||
                    firebase.initializeApp(firebaseConfig, secondaryAppName);
                const secondaryAuth = secondaryApp.auth();
                const userCred = await secondaryAuth.createUserWithEmailAndPassword(email, senhaInicial);
                uidFinal = userCred.user.uid;
                try {
                    await db.collection('usuarios').doc(uidFinal).set(dados, { merge: true });
                } catch (saveErr) {
                    try {
                        if (secondaryAuth.currentUser) await secondaryAuth.currentUser.delete();
                    } catch (rollbackErr) {
                        console.error('Falha no rollback de usuário criado no Auth:', rollbackErr);
                    }
                    throw saveErr;
                } finally {
                    try { await secondaryAuth.signOut(); } catch (e) { /* ignorar */ }
                }
                if (typeof registrarAuditoria === 'function') registrarAuditoria('criar_usuario', email, { perfis, perfil_ativo: perfilAtual });
                alert(`Usuário criado com sucesso. UID gerado automaticamente pelo Firebase Auth. Perfis: ${perfis.join(', ')}.`);
                formUsuarioAdmin.reset();
                const uidInput = document.getElementById('adminUsuarioUid');
                if (uidInput) uidInput.value = '';
                if (typeof window.adminRecarregarDados === 'function') window.adminRecarregarDados();
                return;
            }
            await db.collection('usuarios').doc(uidFinal).set(dados, { merge: true });
            if (typeof registrarAuditoria === 'function') registrarAuditoria('atualizar_usuario', email, { perfis, perfil_ativo: perfilAtual });
            alert(`Usuário atualizado com perfis: ${perfis.join(', ')}. Perfil ativo: ${perfilAtual}.`);
            formUsuarioAdmin.reset();
            const uidInputEdit = document.getElementById('adminUsuarioUid');
            if (uidInputEdit) uidInputEdit.value = '';
            if (typeof window.adminRecarregarDados === 'function') window.adminRecarregarDados();
        } catch (err) {
            const msg = err.code === 'auth/email-already-in-use' ? 'Este email já está em uso.' :
                err.code === 'auth/invalid-email' ? 'Email inválido.' :
                err.code === 'auth/weak-password' ? 'Senha muito fraca. Use mínimo 8 caracteres, incluindo letras e números.' :
                err.message || 'Erro ao salvar.';
            alert(msg);
        } finally {
            esconderBarraLoading();
            if (typeof window.adminLoading === 'function') window.adminLoading(false);
            if (typeof window.btnLoading === 'function' && btn) window.btnLoading(btn, false);
        }
    });
}

// ... DAQUI PARA BAIXO O CÓDIGO CONTINUA IGUAL (VÁRIAVEIS DE ESTADO, ETC.) ...
// ==========================================
// VARIÁVEIS DE ESTADO (Paginação e Busca)
// ==========================================
let baseEmpenhos = []; let baseContratos = []; let baseFornecedores = []; let baseDeducoesEncargos = []; let baseTitulos = []; let baseLfPf = []; let baseNp = [];
let baseCentroCustos = []; let baseUnidadesGestoras = [];
let paginaAtualEmpenhos = 1; let itensPorPaginaEmpenhos = 10; let termoBuscaEmpenhos = "";
let paginaAtualContratos = 1; let itensPorPaginaContratos = 10; let termoBuscaContratos = "";
let paginaAtualFornecedores = 1; let itensPorPaginaFornecedores = 10; let termoBuscaFornecedores = "";
let paginaAtualDeducoesEncargos = 1; let itensPorPaginaDeducoesEncargos = 10; let termoBuscaDeducoesEncargos = "";
let paginaAtualTitulos = 1; let itensPorPaginaTitulos = 10; let termoBuscaTitulos = "";
let paginaAtualLfPf = 1; let itensPorPaginaLfPf = 10; let termoBuscaLfPf = "";
let paginaAtualCentroCustos = 1; let itensPorPaginaCentroCustos = 10; let termoBuscaCentroCustos = "";
let paginaAtualUG = 1; let itensPorPaginaUG = 10; let termoBuscaUG = "";
let deducoesPermitidasContratoAtual = []; 
let empenhosDaNotaAtual = []; 
let empenhoTemporarioSelecionado = null;

// ==========================================
// MOTOR DE ORDENAÇÃO
// ==========================================
let estadoOrdenacao = {
    empenhos: { coluna: 'numEmpenho', direcao: 'asc' },
    contratos: { coluna: 'nomeFornecedor', direcao: 'asc' },
    fornecedores: { coluna: 'nome', direcao: 'asc' },
    deducoesEncargos: { coluna: 'codigo', direcao: 'asc' },
    titulos: { coluna: 'idProc', direcao: 'asc' },
    lfpf: { coluna: 'lf', direcao: 'asc' },
    centrocustos: { coluna: 'codigo', direcao: 'asc' },
    ug: { coluna: 'codigo', direcao: 'asc' }
};

function ordenarTabela(modulo, coluna) {
    if (estadoOrdenacao[modulo].coluna === coluna) { estadoOrdenacao[modulo].direcao = estadoOrdenacao[modulo].direcao === 'asc' ? 'desc' : 'asc'; } 
    else { estadoOrdenacao[modulo].coluna = coluna; estadoOrdenacao[modulo].direcao = 'asc'; }
    document.querySelectorAll(`[id^="sort-${modulo}-"]`).forEach(el => el.textContent = '');
    const iconEl = document.getElementById(`sort-${modulo}-${coluna}`);
    if(iconEl) iconEl.textContent = estadoOrdenacao[modulo].direcao === 'asc' ? '▲' : '▼';

    if (modulo === 'empenhos') { paginaAtualEmpenhos = 1; atualizarTabelaEmpenhos(); }
    if (modulo === 'contratos') { paginaAtualContratos = 1; atualizarTabelaContratos(); }
    if (modulo === 'fornecedores' && typeof atualizarTabelaFornecedores === 'function') { paginaAtualFornecedores = 1; atualizarTabelaFornecedores(); }
    if (modulo === 'deducoesEncargos') { paginaAtualDeducoesEncargos = 1; atualizarTabelaDeducoesEncargos(); }
    if (modulo === 'titulos') { paginaAtualTitulos = 1; atualizarTabelaTitulos(); }
    if (modulo === 'lfpf' && typeof atualizarTabelaLfPf === 'function') { window.paginaAtualLfPf = 1; atualizarTabelaLfPf(); }
    if (modulo === 'centrocustos' && typeof atualizarTabelaCentroCustos === 'function') { paginaAtualCentroCustos = 1; atualizarTabelaCentroCustos(); }
    if (modulo === 'ug' && typeof atualizarTabelaUG === 'function') { paginaAtualUG = 1; atualizarTabelaUG(); }
}

function aplicarOrdenacao(array, modulo) {
    const { coluna, direcao } = estadoOrdenacao[modulo];
    return array.sort((a, b) => {
        let valA = a[coluna] !== undefined && a[coluna] !== null ? a[coluna] : '';
        let valB = b[coluna] !== undefined && b[coluna] !== null ? b[coluna] : '';
        if (!isNaN(valA) && !isNaN(valB) && valA !== '' && valB !== '') { valA = Number(valA); valB = Number(valB); } 
        else { valA = String(valA).toLowerCase(); valB = String(valB).toLowerCase(); }
        if (valA < valB) return direcao === 'asc' ? -1 : 1;
        if (valA > valB) return direcao === 'asc' ? 1 : -1;
        return 0;
    });
}

function inicializarSetasOrdenacao() {
    ['empenhos', 'contratos', 'fornecedores', 'deducoesEncargos', 'titulos', 'lfpf', 'centrocustos', 'ug'].forEach(modulo => {
        if (!estadoOrdenacao[modulo]) return;
        const col = estadoOrdenacao[modulo].coluna; 
        const iconEl = document.getElementById(`sort-${modulo}-${col}`);
        if(iconEl) iconEl.textContent = estadoOrdenacao[modulo].direcao === 'asc' ? '▲' : '▼';
    });
}

// ==========================================
// NAVEGAÇÃO PRINCIPAL E SINCRONIZAÇÃO
// ==========================================
function mostrarSecao(idSecao, botao) {
    window.secaoAtualSistema = idSecao;
    if (typeof escutarColecaoSecao === 'function') escutarColecaoSecao(idSecao);

    document.querySelectorAll('.secao').forEach(s => s.classList.remove('secao-ativa'));
    const secaoAlvo = document.getElementById(idSecao);
    if(secaoAlvo) {
        secaoAlvo.classList.add('secao-ativa');
        const content = document.querySelector('main.content');
        if (content && secaoAlvo.parentElement === content) {
            content.insertBefore(secaoAlvo, content.firstChild);
        }
        if (content) content.scrollTop = 0;
    }

    document.querySelectorAll('.menu-btn, .nav-link').forEach(b => { b.classList.remove('ativo'); b.classList.remove('active'); }); 
    if(botao) { botao.classList.add('ativo'); botao.classList.add('active'); }
    
    document.querySelectorAll('[id^="tela-formulario"]').forEach(f => f.style.display = 'none');
    document.querySelectorAll('[id^="tela-lista"]').forEach(l => l.style.display = 'block');

    if (typeof atualizarTabelaEmpenhos === 'function') atualizarTabelaEmpenhos();
    if (typeof atualizarTabelaContratos === 'function') atualizarTabelaContratos();
    if (typeof atualizarTabelaFornecedores === 'function') atualizarTabelaFornecedores();
    if (typeof atualizarTabelaDeducoesEncargos === 'function') atualizarTabelaDeducoesEncargos();
    if (typeof atualizarTabelaTitulos === 'function') atualizarTabelaTitulos();
    if (typeof atualizarTabelaLfPf === 'function') atualizarTabelaLfPf();
    if (typeof atualizarTabelaNp === 'function') atualizarTabelaNp();
    if (typeof atualizarTabelaCentroCustos === 'function') atualizarTabelaCentroCustos();
    if (typeof atualizarTabelaUG === 'function') atualizarTabelaUG();
    inicializarSetasOrdenacao();
}

// Unsubscribes ativos (Fase 2 - assinar só coleção da seção ativa)
let escutaUnsubs = [];

function escutarColecaoSecao(idSecao) {
    const mapa = {
        'secao-empenhos': ['empenhos'],
        'secao-lf': ['lfpf'],
        'secao-op': ['np'],
        'secao-deducoes-encargos': ['deducoesEncargos'],
        'secao-contratos': ['contratos'],
        'secao-fornecedores': ['fornecedores'],
        'secao-titulos': ['titulos'],
        'secao-centrocustos': ['centroCustos'],
        'secao-ug': ['unidadesGestoras'],
        'secao-backup': ['empenhos', 'contratos', 'fornecedores', 'deducoesEncargos', 'titulos', 'lfpf', 'centroCustos', 'unidadesGestoras']
    };
    const colecoes = mapa[idSecao] || ['empenhos'];
    const incluiConfig = true;
    const total = colecoes.length + (incluiConfig ? 1 : 0);
    if (total === 0) { esconderLoading(); esconderBarraLoading(); return; }

    // Cancela listeners anteriores
    escutaUnsubs.forEach(fn => { try { fn(); } catch (e) {} });
    escutaUnsubs = [];

    // Overlay global (delay 3s + prompt 60s) para carregamentos Firestore lentos.
    mostrarLoading('Carregando...');
    let carregados = 0;
    const aoCarregar = () => { carregados++; if (carregados >= total) { esconderLoading(); esconderBarraLoading(); } };
    const onError = () => { esconderLoading(); esconderBarraLoading(); };

    const handlers = {
        empenhos: snap => { baseEmpenhos = snap.docs.map(doc => ({ id: doc.id, ...doc.data() })); if (typeof atualizarTabelaEmpenhos === 'function') atualizarTabelaEmpenhos(); aoCarregar(); },
        contratos: snap => { baseContratos = snap.docs.map(doc => ({ id: doc.id, ...doc.data() })); if (typeof atualizarTabelaContratos === 'function') atualizarTabelaContratos(); aoCarregar(); },
        fornecedores: snap => { baseFornecedores = snap.docs.map(doc => ({ id: doc.id, ...doc.data() })); if (typeof atualizarTabelaFornecedores === 'function') atualizarTabelaFornecedores(); aoCarregar(); },
        deducoesEncargos: snap => { baseDeducoesEncargos = snap.docs.map(doc => ({ id: doc.id, ...doc.data() })); if (typeof atualizarTabelaDeducoesEncargos === 'function') atualizarTabelaDeducoesEncargos(); aoCarregar(); },
        titulos: snap => { baseTitulos = snap.docs.map(doc => ({ id: doc.id, ...doc.data() })); if (typeof atualizarTabelaTitulos === 'function') atualizarTabelaTitulos(); aoCarregar(); },
        lfpf: snap => { baseLfPf = snap.docs.map(doc => ({ id: doc.id, ...doc.data() })); if (typeof atualizarTabelaLfPf === 'function') atualizarTabelaLfPf(); aoCarregar(); },
        np: snap => { baseNp = snap.docs.map(doc => ({ id: doc.id, ...doc.data() })); if (typeof atualizarTabelaNp === 'function') atualizarTabelaNp(); aoCarregar(); },
        centroCustos: snap => { baseCentroCustos = snap.docs.map(doc => ({ id: doc.id, ...doc.data() })); if (typeof atualizarTabelaCentroCustos === 'function') atualizarTabelaCentroCustos(); aoCarregar(); },
        unidadesGestoras: snap => { baseUnidadesGestoras = snap.docs.map(doc => ({ id: doc.id, ...doc.data() })); if (typeof atualizarTabelaUG === 'function') atualizarTabelaUG(); aoCarregar(); }
    };

    colecoes.forEach(col => {
        const unsub = db.collection(col).onSnapshot(handlers[col], onError);
        escutaUnsubs.push(unsub);
    });

    // Se o usuário interromper, cancela os listeners onSnapshot.
    if (typeof window.__setLoadingAbortFn === 'function') {
        window.__setLoadingAbortFn(function abortarListenersSistema() {
            try { escutaUnsubs.forEach(fn => { try { fn && fn(); } catch (e) {} }); } catch (e) {}
            escutaUnsubs = [];
            alert('Carregamento interrompido. Verifique sua conexão ou recarregue a página.');
        });
    }

    if (incluiConfig) {
        const unsub = db.collection('config').doc('imports').onSnapshot(
            snap => { if (snap.exists && typeof atualizarUltimoImportUI === 'function') atualizarUltimoImportUI(snap.data()); aoCarregar(); },
            onError
        );
        escutaUnsubs.push(unsub);
    }
}
window.escutarColecaoSecao = escutarColecaoSecao;

function escutarFirebase() {
    escutarColecaoSecao(window.secaoAtualSistema || 'secao-empenhos');
}

// ==========================================
// MÓDULOS (script-empenhos.js, script-contratos.js, script-deducoes-encargos.js, script-titulos.js)
// ==========================================
// Funções atualizarTabela* são definidas pelos módulos. mostrarSecao chama-as.

/** Atualiza os spans de "Último upload" nas telas de importação (LF, NE, Contratos). */
function atualizarUltimoImportUI(data) {
    if (!data || typeof data !== 'object') return;
    function formatarData(ts) {
        if (!ts) return '';
        if (ts.toDate && typeof ts.toDate === 'function') return ts.toDate().toLocaleString('pt-BR');
        if (ts instanceof Date) return ts.toLocaleString('pt-BR');
        return String(ts);
    }
    const elLf = document.getElementById('ultimoImportLfPf');
    const elNe = document.getElementById('ultimoImportEmpenhos');
    const elContratos = document.getElementById('ultimoImportContratos');
    const elFornecedores = document.getElementById('ultimoImportFornecedores');
    const elNp = document.getElementById('ultimoImportNp');
    const elDedEnc = document.getElementById('ultimoImportDeducoesEncargos');
    if (elLf && data.lfpf) elLf.textContent = 'Último upload: ' + formatarData(data.lfpf);
    if (elNe && data.empenhos) elNe.textContent = 'Último upload: ' + formatarData(data.empenhos);
    if (elContratos && data.contratos) elContratos.textContent = 'Último upload: ' + formatarData(data.contratos);
    if (elFornecedores && data.fornecedores) elFornecedores.textContent = 'Último upload: ' + formatarData(data.fornecedores);
    if (elNp && data.np) elNp.textContent = 'Último upload: ' + formatarData(data.np);
    if (elDedEnc && data.deducoesEncargos) elDedEnc.textContent = 'Último upload: ' + formatarData(data.deducoesEncargos);
}
window.atualizarUltimoImportUI = atualizarUltimoImportUI;

// Deduções e Encargos em script-deducoes-encargos.js; Títulos em script-titulos.js

// 6. FUNÇÃO DE BACKUP GLOBAL (Implementada)
function exportarBancoDeDados() {
    try {
        const backupData = {
            data_exportacao: new Date().toISOString(),
            usuario: usuarioLogadoEmail,
            empenhos: baseEmpenhos,
            contratos: baseContratos,
            fornecedores: baseFornecedores,
            deducoesEncargos: baseDeducoesEncargos,
            titulos: baseTitulos,
            lfpf: baseLfPf
        };

        const dataStr = JSON.stringify(backupData, null, 2);
        const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
        const exportFileName = `SisExeFin_Backup_${new Date().toISOString().slice(0,10)}.json`;
        
        const linkElement = document.createElement('a');
        linkElement.setAttribute('href', dataUri);
        linkElement.setAttribute('download', exportFileName);
        linkElement.click();
        
        console.log("Backup gerado com sucesso.");
    } catch (error) {
        console.error("Erro ao gerar backup:", error);
        alert("Erro ao gerar o ficheiro de backup.");
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSidebarState);
} else {
    initSidebarState();
}