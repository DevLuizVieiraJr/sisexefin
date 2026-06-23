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
    bar.innerHTML = '<div class="loading-bar-spinner"></div>' +
        '<span class="loading-bar-text" id="loadingBarText">Processando...</span>' +
        '<span class="loading-bar-pct" id="loadingBarPct" style="display:none;"></span>' +
        '<div class="loading-bar-progress"><div class="loading-bar-progress-fill" id="loadingBarProgressFill"></div></div>';
    document.body.appendChild(bar);
}
function mostrarBarraLoading(texto, opts) {
    criarBarraLoading();
    const bar = document.getElementById('loadingBar');
    const txt = document.getElementById('loadingBarText');
    const pctEl = document.getElementById('loadingBarPct');
    const fill = document.getElementById('loadingBarProgressFill');
    if (txt) txt.textContent = texto || 'Processando...';
    const pct = opts && typeof opts.pct === 'number' ? Math.max(0, Math.min(100, opts.pct)) : null;
    if (bar) {
        if (pct == null) {
            bar.classList.remove('loading-bar-determinado');
            if (pctEl) pctEl.style.display = 'none';
            if (fill) fill.style.width = '';
        } else {
            bar.classList.add('loading-bar-determinado');
            if (pctEl) { pctEl.style.display = ''; pctEl.textContent = pct + '%'; }
            if (fill) fill.style.width = pct + '%';
        }
        // Limpa o display:none inline deixado por esconderBarraLoading() para que a classe .visivel volte a valer.
        bar.style.display = '';
        bar.classList.add('visivel');
    }
}
function esconderBarraLoading() {
    const bar = document.getElementById('loadingBar');
    if (bar) {
        bar.classList.remove('visivel');
        bar.classList.remove('loading-bar-determinado');
        bar.style.display = 'none';
    }
    const fill = document.getElementById('loadingBarProgressFill');
    if (fill) fill.style.width = '';
    const pctEl = document.getElementById('loadingBarPct');
    if (pctEl) pctEl.style.display = 'none';
}
window.mostrarBarraLoading = mostrarBarraLoading;
window.esconderBarraLoading = esconderBarraLoading;

// ============================================================
// LOADING IMPORTAÇÃO (overlay imediato + barra com % simulado/real)
// ============================================================
let __importBarraState = {
    timerId: null,
    pct: 0,
    maxSimulado: 90,
    step: 4,
    intervalMs: 180,
};

function __pararTimerBarraSimulada() {
    if (__importBarraState.timerId) clearInterval(__importBarraState.timerId);
    __importBarraState.timerId = null;
}

/** Overlay visível na hora (validação/importação CSV). */
function mostrarLoadingImportacao(texto) {
    const overlay = __getLoadingOverlayEl();
    if (!overlay) return;
    if (__loadingState.showTimerId) clearTimeout(__loadingState.showTimerId);
    __loadingState.showTimerId = null;
    __loadingState.active = true;
    __loadingState.startedAt = Date.now();
    __setOverlayTexto(texto || 'Processando importação...');
    __ensureOverlayProgressEl(overlay);
    overlay.style.display = 'flex';
    __schedule60sPrompt();
}

function esconderLoadingImportacao() {
    __pararTimerBarraSimulada();
    esconderLoading();
}

function iniciarBarraProgressoImport(texto, opts) {
    opts = opts || {};
    __pararTimerBarraSimulada();
    __importBarraState.pct = typeof opts.pctInicial === 'number' ? opts.pctInicial : (typeof opts.pct === 'number' ? opts.pct : 0);
    __importBarraState.maxSimulado = typeof opts.maxSimulado === 'number' ? opts.maxSimulado : 90;
    __importBarraState.step = typeof opts.step === 'number' ? opts.step : 4;
    __importBarraState.intervalMs = typeof opts.intervalMs === 'number' ? opts.intervalMs : 180;
    mostrarBarraLoading(texto || 'Processando...', { pct: __importBarraState.pct });
    if (opts.simulado) {
        __importBarraState.timerId = setInterval(function() {
            if (__importBarraState.pct < __importBarraState.maxSimulado) {
                __importBarraState.pct = Math.min(__importBarraState.maxSimulado, __importBarraState.pct + __importBarraState.step);
                mostrarBarraLoading(texto || 'Processando...', { pct: __importBarraState.pct });
            }
        }, __importBarraState.intervalMs);
    }
}

function atualizarBarraProgressoImport(texto, pct) {
    if (typeof pct === 'number') __importBarraState.pct = Math.max(0, Math.min(100, pct));
    mostrarBarraLoading(texto || 'Processando...', { pct: __importBarraState.pct });
}

function pararBarraProgressoImport() {
    __pararTimerBarraSimulada();
    esconderBarraLoading();
}

window.mostrarLoadingImportacao = mostrarLoadingImportacao;
window.esconderLoadingImportacao = esconderLoadingImportacao;
window.iniciarBarraProgressoImport = iniciarBarraProgressoImport;
window.atualizarBarraProgressoImport = atualizarBarraProgressoImport;
window.pararBarraProgressoImport = pararBarraProgressoImport;

// ============================================================
// VALIDAÇÃO DE IMPORTAÇÃO (helpers compartilhados entre módulos)
// Usados na etapa "Carregar arquivo" para classificar linhas antes
// de gravar no BD (obrigatoriedade, formato, duplicidade, esquema).
// ============================================================
window.sisImportValidacao = (function() {
    // Data opcional: aceita vazio, dd/mm/aaaa, d/m/aaaa ou aaaa-mm-dd.
    function dataValida(s) {
        const v = String(s == null ? '' : s).trim();
        if (!v) return true;
        if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(v)) return true;
        if (/^\d{4}-\d{1,2}-\d{1,2}/.test(v)) return true;
        return false;
    }
    // Número opcional: aceita vazio; aceita formatos BR (1.234,56) ou simples.
    // Retorna { ok, valor }.
    function numero(s) {
        const original = String(s == null ? '' : s).trim();
        if (!original) return { ok: true, valor: 0, vazio: true };
        let limpo = original.replace(/\s+/g, '').replace(/[Rr]\$/g, '').replace(/[^\d,.-]/g, '');
        if (limpo.indexOf(',') !== -1) limpo = limpo.replace(/\./g, '').replace(',', '.');
        const n = Number(limpo);
        if (limpo === '' || isNaN(n)) return { ok: false, valor: 0 };
        return { ok: true, valor: n };
    }
    // Cria a estrutura padrão de relatório de análise.
    function criarRelatorio() {
        return {
            schemaOk: true,
            schemaMsg: '',
            total: 0,
            validas: [],
            problemas: { obrigatorio: [], formato: [], duplicado: [], coluna: [] }
        };
    }
    // Conta problemas totais (linhas com pelo menos um problema + globais de coluna).
    function totalProblemas(rel) {
        return rel.problemas.obrigatorio.length +
            rel.problemas.formato.length +
            rel.problemas.duplicado.length +
            rel.problemas.coluna.length;
    }
    // Monta texto de status curto para a barra/área de status.
    function statusCurto(rel, nomeChave) {
        if (!rel.schemaOk) return rel.schemaMsg || 'Arquivo com colunas incompatíveis.';
        const validas = rel.validas.length;
        const probs = totalProblemas(rel);
        return 'Análise: ' + rel.total + ' linha(s), ' + validas + ' válida(s), ' + probs + ' com problema(s).' +
            (validas > 0 ? ' Clique em "Importar dados válidos".' : ' Nenhum ' + (nomeChave || 'registro') + ' válido para importar.');
    }
    // Monta relatório detalhado (texto multilinha) para alert/console.
    function detalhe(rel, limitePorCategoria) {
        const lim = limitePorCategoria || 15;
        const linhas = [];
        if (!rel.schemaOk) linhas.push('Esquema: ' + rel.schemaMsg);
        function bloco(titulo, arr) {
            if (!arr.length) return;
            linhas.push('');
            linhas.push(titulo + ' (' + arr.length + '):');
            arr.slice(0, lim).forEach(function(p) {
                linhas.push('  - ' + (p.linha != null ? 'Linha ' + p.linha + ': ' : '') + p.motivo);
            });
            if (arr.length > lim) linhas.push('  ... e mais ' + (arr.length - lim) + '.');
        }
        bloco('Obrigatórios faltando', rel.problemas.obrigatorio);
        bloco('Formato inválido', rel.problemas.formato);
        bloco('Duplicados no arquivo', rel.problemas.duplicado);
        bloco('Colunas incompatíveis', rel.problemas.coluna);
        return linhas.join('\n');
    }
    return {
        dataValida: dataValida,
        numero: numero,
        criarRelatorio: criarRelatorio,
        totalProblemas: totalProblemas,
        statusCurto: statusCurto,
        detalhe: detalhe
    };
})();

function debounce(func, timeout = 300) { let timer; return (...args) => { clearTimeout(timer); timer = setTimeout(() => { func.apply(this, args); }, timeout); }; }

function isMobileLayout() {
    return typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 768px)').matches;
}

function syncMobileTopbarTrigger() {
    const btn = document.getElementById('sisexefin-topbar-menu-trigger');
    if (!btn) return;
    const open = document.body.classList.contains('sidebar-drawer-open');
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    btn.setAttribute('aria-label', open ? 'Fechar menu de navegação' : 'Abrir menu de navegação');
}

function syncSidebarToggleAria(sidebar) {
    if (!sidebar) return;
    const toggle = sidebar.querySelector('.sidebar-toggle');
    if (!toggle) return;
    const textEl = toggle.querySelector('.sidebar-toggle-text');
    if (isMobileLayout()) {
        const open = document.body.classList.contains('sidebar-drawer-open');
        toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
        toggle.setAttribute('aria-label', open ? 'Fechar menu de navegação' : 'Abrir menu de navegação');
        if (textEl) textEl.textContent = open ? ' Ocultar menu' : ' Mostrar menu';
        return;
    }
    const colapsado = sidebar.classList.contains('colapsado');
    toggle.setAttribute('aria-expanded', colapsado ? 'false' : 'true');
    toggle.setAttribute('aria-label', colapsado ? 'Expandir menu lateral' : 'Recolher menu lateral');
    if (textEl) textEl.textContent = colapsado ? ' Mostrar menu' : ' Ocultar menu';
}

window.updateSidebarChrome = function () {
    syncSidebarToggleAria(document.getElementById('sidebar'));
    syncMobileTopbarTrigger();
};

let __mobileNavControlsBound = false;
function ensureMobileNavControls() {
    if (__mobileNavControlsBound) return;
    const topbar = document.querySelector('.topbar');
    const sidebar = document.getElementById('sidebar');
    if (!topbar || !sidebar) return;
    __mobileNavControlsBound = true;

    if (!document.getElementById('sisexefin-topbar-menu-trigger')) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.id = 'sisexefin-topbar-menu-trigger';
        btn.className = 'topbar-menu-trigger';
        btn.setAttribute('aria-controls', 'sidebar');
        btn.setAttribute('aria-expanded', 'false');
        btn.setAttribute('aria-label', 'Abrir menu de navegação');
        btn.innerHTML = '<i class="fas fa-bars" aria-hidden="true"></i>';
        btn.addEventListener('click', function () {
            toggleSidebar();
        });
        topbar.insertBefore(btn, topbar.firstChild);
    }

    if (!document.getElementById('sidebar-drawer-backdrop')) {
        const backdrop = document.createElement('div');
        backdrop.id = 'sidebar-drawer-backdrop';
        backdrop.className = 'sidebar-drawer-backdrop';
        backdrop.setAttribute('aria-hidden', 'true');
        backdrop.addEventListener('click', function () {
            document.body.classList.remove('sidebar-drawer-open');
            syncSidebarToggleAria(sidebar);
            syncMobileTopbarTrigger();
        });
        document.body.appendChild(backdrop);
    }

    document.addEventListener('keydown', function (e) {
        if (e.key !== 'Escape') return;
        if (!document.body.classList.contains('sidebar-drawer-open')) return;
        document.body.classList.remove('sidebar-drawer-open');
        syncSidebarToggleAria(sidebar);
        syncMobileTopbarTrigger();
    });

    window.addEventListener('resize', debounce(function () {
        if (!isMobileLayout()) {
            document.body.classList.remove('sidebar-drawer-open');
        }
        syncSidebarToggleAria(sidebar);
        syncMobileTopbarTrigger();
    }, 200));
}

function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    if (!sidebar) return;
    if (isMobileLayout()) {
        document.body.classList.toggle('sidebar-drawer-open');
        syncSidebarToggleAria(sidebar);
        syncMobileTopbarTrigger();
        return;
    }
    const colapsado = sidebar.classList.toggle('colapsado');
    try { localStorage.setItem('sidebarColapsado', colapsado ? '1' : '0'); } catch (e) {}
    syncSidebarToggleAria(sidebar);
}
window.toggleSidebar = toggleSidebar;

function initSidebarState() {
    const sidebar = document.getElementById('sidebar');
    if (!sidebar) return;
    ensureMobileNavControls();
    if (isMobileLayout()) {
        document.body.classList.remove('sidebar-drawer-open');
        syncSidebarToggleAria(sidebar);
        syncMobileTopbarTrigger();
        return;
    }
    try {
        if (localStorage.getItem('sidebarColapsado') === '1') {
            sidebar.classList.add('colapsado');
        }
    } catch (e) {}
    syncSidebarToggleAria(sidebar);
    syncMobileTopbarTrigger();
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
let perfisDoUsuario = [];        // Perfis atribuídos ao usuário (permite troca)
let cacheNomesPerfis = {};       // id → nomeExibicao (carregado após login)

/** Busca o nomeExibicao dos perfis do usuário e armazena em cacheNomesPerfis. */
async function carregarCacheNomesPerfis(ids) {
    if (!Array.isArray(ids) || !ids.length) return;
    const novos = ids.filter(id => id && !(id in cacheNomesPerfis));
    for (const id of novos) {
        try {
            const snap = await db.collection('perfis').doc(id).get();
            if (snap.exists) {
                const data = snap.data() || {};
                cacheNomesPerfis[id] = (data.nomeExibicao && data.nomeExibicao.trim()) || '';
            } else {
                cacheNomesPerfis[id] = '';
            }
        } catch (e) {
            cacheNomesPerfis[id] = '';
        }
    }
}

/** Retorna o nome de exibição de um perfil pelo ID (usa cache ou fallback). */
function nomeExibicaoPerfil(id) {
    if (!id) return '';
    if (id in cacheNomesPerfis && cacheNomesPerfis[id]) return cacheNomesPerfis[id];
    return typeof window.humanizarIdPerfil === 'function' ? window.humanizarIdPerfil(id) : id;
}
window.nomeExibicaoPerfil = nomeExibicaoPerfil;

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
        carregarCacheNomesPerfis(perfis).catch(() => {});
        return permissoesEmCache;
    } catch (error) { return []; }
}

async function trocarPerfil(perfilId) {
    const user = auth.currentUser;
    if (!user || !perfisDoUsuario.includes(perfilId)) return;
    const nomeAmigavel = nomeExibicaoPerfil(perfilId);
    const label = nomeAmigavel !== perfilId ? nomeAmigavel + ' (' + perfilId + ')' : perfilId;
    if (!confirm("Deseja alternar a sua sessão para o perfil " + label + "?")) return;
    try {
        await db.collection('usuarios').doc(user.uid).update({ perfil_ativo: perfilId });
        window.location.reload();
    } catch (err) { alert("Erro ao trocar perfil: " + (err.message || err.code || err)); }
}
window.trocarPerfil = trocarPerfil;


/**
 * Aliases legados: permissão canônica da matriz → códigos antigos ainda presentes em perfis.
 * Remover quando todos os perfis forem migrados (ver RN Admin RN-ADM-038).
 */
const ALIASES_PERMISSAO = {
    titulos_status: ['titulos_inativar'],
    titulos_ver_inativos: ['titulos_inativar', 'titulos_status'],
    empenhos_cancelar: ['empenhos_excluir'],
    empenhos_status: ['empenhos_excluir'],
    lf_cancelar: ['lf_excluir'],
    lf_status: ['lf_excluir'],
    fornecedores_cancelar: ['fornecedores_excluir'],
    fornecedores_status: ['fornecedores_excluir'],
    centrocustos_cancelar: ['centrocustos_excluir'],
    centrocustos_status: ['centrocustos_excluir'],
    ug_cancelar: ['ug_excluir'],
    ug_status: ['ug_excluir'],
    contratos_cancelar: ['contratos_excluir'],
    contratos_status: ['contratos_excluir'],
    dedenc_cancelar: ['dedenc_excluir'],
    op_inserir: ['titulos_inserir'],
    op_editar: ['titulos_editar'],
    op_cancelar: ['titulos_inserir', 'titulos_editar'],
    op_status: ['titulos_inserir', 'titulos_editar'],
    usuarios_status: ['usuarios_editar'],
    titulos_encaminhar_processamento: ['tramitarTC'],
    titulos_encaminhar_liquidacao: ['tramitarTC'],
    titulos_devolver: ['tramitarTC'],
    titulos_retornar_processamento: ['tramitarTC'],
    titulos_retornar_liquidacao: ['tramitarTC'],
    tramitarTC: [
        'titulos_encaminhar_processamento',
        'titulos_encaminhar_liquidacao',
        'titulos_devolver',
        'titulos_retornar_processamento',
        'titulos_retornar_liquidacao'
    ]
};

function permissoesIncluemDireto(perm) {
    return permissoesEmCache.includes(perm);
}

function permissoesIncluemComAlias(perm) {
    if (permissoesIncluemDireto(perm)) return true;
    const legados = ALIASES_PERMISSAO[perm];
    if (legados && legados.some(l => permissoesIncluemDireto(l))) return true;
    return false;
}

/** Ativar/inativar ou cancelar (soft) — usa matriz _status / _cancelar + aliases legados. */
function podeStatusOuCancelar(mod) {
    return temPermissaoUI(mod + '_status') || temPermissaoUI(mod + '_cancelar');
}

/**
 * Exclusão permanente: admin, ou _excluir explícito junto com granularidade nova (_cancelar/_status no perfil).
 * Perfis legados só com _excluir (soft-delete) não ganham botão de exclusão permanente.
 */
function podeExcluirPermanente(mod) {
    if (permissoesIncluemDireto('acesso_admin')) return true;
    if (!permissoesIncluemDireto(mod + '_excluir')) return false;
    return permissoesIncluemDireto(mod + '_cancelar') || permissoesIncluemDireto(mod + '_status');
}
window.podeStatusOuCancelar = podeStatusOuCancelar;
window.podeExcluirPermanente = podeExcluirPermanente;

/**
 * Verifica se o usuário tem permissão para UI (com fallback para admins).
 * Regra de salvação: acesso_admin implica dashboard_ler, backup_ler e acesso às Tabelas de Apoio.
 */
function temPermissaoUI(perm) {
    if (!perm || typeof perm !== 'string') return false;
    if (permissoesIncluemComAlias(perm)) return true;
    if (permissoesEmCache.includes('acesso_admin')) {
        if (perm === 'dashboard_ler' || perm === 'backup_ler') return true;
        const modulosSistema = ['empenhos', 'lf', 'pf', 'op', 'dedenc', 'contratos', 'fornecedores', 'titulos', 'centrocustos', 'ug', 'usuarios', 'perfis', 'oi'];
        if (modulosSistema.some(m => perm === m + '_ler')) return true;
    }
    return false;
}
window.temPermissaoUI = temPermissaoUI;

/** Evento/ação de fluxo (catálogo rbac-eventos.js). acesso_admin concede todos os eventos. */
function temPermissaoEvento(eventoId) {
    if (!eventoId || typeof eventoId !== 'string') return false;
    if (typeof window.RBACEventos !== 'undefined' && typeof window.RBACEventos.temPermissaoEvento === 'function') {
        return window.RBACEventos.temPermissaoEvento(eventoId, permissoesEmCache, temPermissaoUI);
    }
    return temPermissaoUI(eventoId);
}
window.temPermissaoEvento = temPermissaoEvento;

/** Permissão de evento + status de origem válido (quando aplicável). */
function podeExecutarEvento(eventoId, ctx) {
    if (typeof window.RBACEventos !== 'undefined' && typeof window.RBACEventos.podeExecutarEvento === 'function') {
        return window.RBACEventos.podeExecutarEvento(eventoId, ctx || {}, permissoesEmCache, temPermissaoUI);
    }
    return temPermissaoEvento(eventoId);
}
window.podeExecutarEvento = podeExecutarEvento;

function temAlgumaPermissaoUI(perms) {
    if (!Array.isArray(perms)) return false;
    for (let i = 0; i < perms.length; i += 1) {
        if (temPermissaoUI(perms[i])) return true;
    }
    return false;
}
window.temAlgumaPermissaoUI = temAlgumaPermissaoUI;

/**
 * Motor de ocultação de UI (RBAC). Remove elementos sem permissão do DOM (el.remove).
 * Deve ser chamada após carregarPermissoes().
 */
function aplicarPermissoesUI() {
    document.querySelectorAll('[data-permission]').forEach(el => {
        const req = el.getAttribute('data-permission');
        if (!temPermissaoUI(req)) el.remove();
    });
    document.querySelectorAll('[data-permission-event]').forEach(el => {
        const req = el.getAttribute('data-permission-event');
        if (!temPermissaoEvento(req)) el.remove();
    });
    document.querySelectorAll('[data-permission-any]').forEach(el => {
        const req = (el.getAttribute('data-permission-any') || '')
            .split(',')
            .map(p => p.trim())
            .filter(Boolean);
        if (!temAlgumaPermissaoUI(req)) el.remove();
    });
    const sidebar = document.getElementById('sidebar');
    if (sidebar) {
        sidebar.querySelectorAll('.nav-item.has-treeview').forEach(function(item) {
            const sub = item.querySelector(':scope > ul.nav-treeview');
            if (!sub) return;
            if (sub.querySelectorAll(':scope > li').length === 0) item.remove();
        });
    }
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
        opt.textContent = nomeExibicaoPerfil(p);
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
        if (temPermissaoUI('lf_editar')) html += `<button type="button" class="btn-icon btn-editar-lfpf" data-id="${safeId}" title="Editar">✏️</button>`;
        if (podeStatusOuCancelar('lf')) html += `<button type="button" class="btn-icon btn-inativar-lfpf" data-id="${safeId}" title="Inativar/Cancelar">🚫</button>`;
        if (podeExcluirPermanente('lf')) html += `<button type="button" class="btn-icon btn-apagar-lfpf-permanente" data-id="${safeId}" title="Excluir permanentemente">🗑️</button>`;
        return html;
    }
    if (modulo === 'empenho') {
        if (temPermissaoUI('empenhos_ler')) html += `<button type="button" class="btn-icon btn-visualizar-empenho" data-id="${safeId}" title="Visualizar">👁️</button>`;
        if (temPermissaoUI('empenhos_editar')) html += `<button type="button" class="btn-icon btn-editar-empenho" data-id="${safeId}" title="Editar">✏️</button>`;
        if (podeStatusOuCancelar('empenhos')) html += `<button type="button" class="btn-icon btn-inativar-empenho" data-id="${safeId}" title="Inativar/Cancelar">🚫</button>`;
        if (podeExcluirPermanente('empenhos')) html += `<button type="button" class="btn-icon btn-apagar-empenho-permanente" data-id="${safeId}" title="Excluir permanentemente">🗑️</button>`;
        return html;
    }
    if (modulo === 'centrocustos' || modulo === 'ug' || modulo === 'fornecedor') {
        const ativo = itemOpt && itemOpt.ativo !== false;
        if (temPermissaoUI(mod + '_editar')) html += `<button type="button" class="btn-icon btn-editar-${modulo}" data-id="${safeId}" title="Editar">✏️</button>`;
        if (ativo && podeStatusOuCancelar(mod)) html += `<button type="button" class="btn-icon btn-inativar-${modulo}" data-id="${safeId}" title="Inativar">🚫</button>`;
        if (!ativo && podeStatusOuCancelar(mod)) html += `<button type="button" class="btn-icon btn-reativar-${modulo}" data-id="${safeId}" title="Reativar">✓</button>`;
        if (podeExcluirPermanente(mod)) html += `<button type="button" class="btn-icon btn-apagar-${modulo}-permanente" data-id="${safeId}" title="Excluir permanentemente">🗑️</button>`;
        return html;
    }
    if (modulo === 'deducoesEncargos') {
        const ativo = itemOpt && itemOpt.ativo !== false;
        const podeSt = podeStatusOuCancelar('dedenc') || permissoesIncluemDireto('acesso_admin');
        if (temPermissaoUI('dedenc_ler')) html += `<button type="button" class="btn-icon btn-visualizar-deducoesEncargos" data-id="${safeId}" title="Visualizar">👁️</button>`;
        if (temPermissaoUI('dedenc_editar')) html += `<button type="button" class="btn-icon btn-editar-deducoesEncargos" data-id="${safeId}" title="Editar">✏️</button>`;
        if (ativo && podeSt) html += `<button type="button" class="btn-icon btn-inativar-deducoesEncargos" data-id="${safeId}" title="Inativar/Cancelar">🚫</button>`;
        if (!ativo && podeSt) html += `<button type="button" class="btn-icon btn-reativar-deducoesEncargos" data-id="${safeId}" title="Reativar">✓</button>`;
        if (podeExcluirPermanente('dedenc') || permissoesIncluemDireto('acesso_admin')) html += `<button type="button" class="btn-icon btn-apagar-deducoesEncargos-permanente" data-id="${safeId}" title="Excluir permanentemente">🗑️</button>`;
        return html;
    }
    if (modulo === 'contrato') {
        if (temPermissaoUI('contratos_editar')) html += `<button type="button" class="btn-icon btn-editar-contrato" data-id="${safeId}" title="Editar">✏️</button>`;
        if (temPermissaoUI('contratos_excluir') || podeExcluirPermanente('contratos')) html += `<button type="button" class="btn-icon btn-apagar-contrato" data-id="${safeId}" title="Excluir">🗑️</button>`;
        return html;
    }
    if (temPermissaoUI(mod + '_editar')) html += `<button type="button" class="btn-icon btn-editar-${modulo}" data-id="${safeId}">✏️</button>`;
    if (podeExcluirPermanente(mod) || temPermissaoUI(mod + '_cancelar')) html += `<button type="button" class="btn-icon btn-apagar-${modulo}" data-id="${safeId}">🗑️</button>`;
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
        const corpoPreLiquidacao = document.getElementById('corpo-preliquidacao');
        const corpoLiquidacao = document.getElementById('corpo-liquidacao');
        const corpoDashboard = document.getElementById('corpo-dashboard');
        const corpoConta = document.getElementById('corpo-conta');

        // Lógica de Rota: Estamos no Admin?
        if (corpoAdmin) {
            const podeEntrarAdmin = temAlgumaPermissaoUI([
                'acesso_admin',
                'usuarios_ler',
                'admin_pendentes_ler',
                'oi_ler',
                'admin_cadastrar_usuario',
                'usuarios_inserir',
                'usuarios_editar'
            ]);
            if (!podeEntrarAdmin) {
                alert("Acesso Negado! Redirecionando...");
                window.location.replace('dashboard.html');
                return;
            }
            aplicarPermissoesUI();
            atualizarSeletorPerfil();
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
        else if (corpoPreLiquidacao) {
            if (!permissoesEmCache.includes('preliquidacao_ler') && !permissoesEmCache.includes('acesso_admin')) {
                alert('Acesso negado ao módulo Pré-Liquidação.');
                window.location.replace('dashboard.html');
                return;
            }
            aplicarPermissoesUI();
            atualizarSeletorPerfil();
            corpoPreLiquidacao.style.display = 'flex';
            if (typeof inicializarPreLiquidacaoSPA === 'function') inicializarPreLiquidacaoSPA();
            if (typeof esconderLoading === 'function') esconderLoading();
        }
        // Lógica de Rota: Estamos na Liquidação e Pagamento (Beta)?
        else if (corpoLiquidacao) {
            if (!permissoesEmCache.includes('liquidacao_ler') && !permissoesEmCache.includes('acesso_admin')) {
                alert('Acesso negado ao módulo Liquidação e Pagamento.');
                window.location.replace('dashboard.html');
                return;
            }
            aplicarPermissoesUI();
            atualizarSeletorPerfil();
            corpoLiquidacao.style.display = 'flex';
            if (typeof inicializarModuloLiquidacao === 'function') inicializarModuloLiquidacao();
            if (typeof esconderLoading === 'function') esconderLoading();
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
        else if (corpoConta) {
            aplicarPermissoesUI();
            atualizarSeletorPerfil();
            corpoConta.style.display = 'flex';
            esconderLoading();
            if (typeof window.inicializarPaginaConta === 'function') window.inicializarPaginaConta();
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
    // Atualiza preview do código técnico ao digitar o nome de exibição
    const inputNomeExibicao = document.getElementById('adminNomeExibicaoPerfil');
    const inputCodigo = document.getElementById('adminCodigoPerfil');
    const inputNomeLegado = document.getElementById('adminNomePerfil');
    if (inputNomeExibicao && inputCodigo) {
        inputNomeExibicao.addEventListener('input', function() {
            // Só atualiza o código durante criação (campo não estava em modo edição)
            if (!inputCodigo.dataset.editando) {
                const slug = typeof window.slugPerfilId === 'function' ? window.slugPerfilId(this.value) : this.value.trim().toLowerCase();
                inputCodigo.value = slug;
                if (inputNomeLegado) inputNomeLegado.value = slug;
            }
        });
    }

    formPerfilAdmin.addEventListener('submit', async function(e) {
        e.preventDefault();
        const nomeExibicao = (document.getElementById('adminNomeExibicaoPerfil') || {}).value || '';
        const codigoEl = document.getElementById('adminCodigoPerfil');
        const codigoTecnico = codigoEl ? codigoEl.value.trim() : '';
        if (!codigoTecnico) { alert('Informe um nome de exibição válido para gerar o código técnico.'); return; }
        const form = document.getElementById('formPerfilAdmin');
        const checkboxes = form ? form.querySelectorAll('.cb-perm:checked') : document.querySelectorAll('.cb-perm:checked');
        const permissoesSelecionadas = Array.from(checkboxes).map(cb => cb.value);
        const btn = formPerfilAdmin.querySelector('button[type="submit"]');
        if (typeof window.adminLoading === 'function') window.adminLoading(true);
        if (typeof window.btnLoading === 'function' && btn) window.btnLoading(btn, true);
        mostrarBarraLoading('Salvando...');
        try {
            await db.collection('perfis').doc(codigoTecnico).set({
                nomeExibicao: nomeExibicao.trim(),
                permissoes: permissoesSelecionadas
            }, { merge: true });
            // Atualiza cache local para refletir imediatamente
            cacheNomesPerfis[codigoTecnico] = nomeExibicao.trim();
            alert(`Perfil '${nomeExibicao.trim() || codigoTecnico}' (${codigoTecnico}) salvo com sucesso!`);
            formPerfilAdmin.reset();
            if (inputCodigo) { inputCodigo.value = ''; delete inputCodigo.dataset.editando; }
            if (inputNomeLegado) inputNomeLegado.value = '';
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
        let perfilAjustado = false;
        if (typeof window.mostrarAvisoPerfilPadrao === 'function') window.mostrarAvisoPerfilPadrao('');
        if (perfis.length === 0) { alert("Selecione pelo menos um perfil."); return; }
        if (!perfilAtual || !perfis.includes(perfilAtual)) {
            perfilAtual = perfis[0];
            perfilAjustado = true;
            if (perfilAtualEl) perfilAtualEl.value = perfilAtual;
            if (typeof window.mostrarAvisoPerfilPadrao === 'function') {
                window.mostrarAvisoPerfilPadrao('Perfil padrao ajustado automaticamente para um perfil atribuido.');
            }
        }

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
                const mensagemCriacao = `Usuario criado com sucesso. Perfis: ${perfis.join(', ')}. Perfil ativo: ${perfilAtual}.`;
                if (typeof window.adminPosSalvarUsuario === 'function') {
                    window.adminPosSalvarUsuario({ mensagem: mensagemCriacao, perfilAjustado: perfilAjustado, uid: uidFinal });
                } else {
                    alert(mensagemCriacao);
                    formUsuarioAdmin.reset();
                    const uidInput = document.getElementById('adminUsuarioUid');
                    if (uidInput) uidInput.value = '';
                    if (typeof window.adminRecarregarDados === 'function') window.adminRecarregarDados();
                }
                return;
            }
            await db.collection('usuarios').doc(uidFinal).set(dados, { merge: true });
            if (typeof registrarAuditoria === 'function') registrarAuditoria('atualizar_usuario', email, { perfis, perfil_ativo: perfilAtual });
            const mensagemAtualizacao = `Usuario atualizado com perfis: ${perfis.join(', ')}. Perfil ativo: ${perfilAtual}.`;
            if (typeof window.adminPosSalvarUsuario === 'function') {
                window.adminPosSalvarUsuario({ mensagem: mensagemAtualizacao, perfilAjustado: perfilAjustado, uid: uidFinal });
            } else {
                alert(mensagemAtualizacao);
                formUsuarioAdmin.reset();
                const uidInputEdit = document.getElementById('adminUsuarioUid');
                if (uidInputEdit) uidInputEdit.value = '';
                if (typeof window.adminRecarregarDados === 'function') window.adminRecarregarDados();
            }
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
window.__suspenderAtualizacaoEmpenhos = window.__suspenderAtualizacaoEmpenhos === true;
window.__empenhosRefreshPendente = false;
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
    ['empenhos', 'contratos', 'fornecedores', 'deducoesEncargos', 'lfpf', 'centrocustos', 'ug'].forEach(modulo => {
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
        'secao-contratos': ['contratos', 'deducoesEncargos'],
        'secao-fornecedores': ['fornecedores'],
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
        empenhos: snap => {
            baseEmpenhos = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            if (window.__suspenderAtualizacaoEmpenhos) {
                window.__empenhosRefreshPendente = true;
            } else if (typeof atualizarTabelaEmpenhos === 'function') {
                atualizarTabelaEmpenhos();
            }
            aoCarregar();
        },
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
// MÓDULOS (script-empenhos.js, script-contratos.js, script-deducoes-encargos.js)
// ==========================================
// Funções atualizarTabela* são definidas pelos módulos. mostrarSecao chama-as.

/** Atualiza os spans de "Último upload" nas telas de importação. */
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
    const elCentroCustos = document.getElementById('ultimoImportCentroCustos');
    const elUg = document.getElementById('ultimoImportUg');
    if (elLf && data.lfpf) elLf.textContent = 'Último upload: ' + formatarData(data.lfpf);
    if (elNe && data.empenhos) elNe.textContent = 'Último upload: ' + formatarData(data.empenhos);
    if (elContratos && data.contratos) elContratos.textContent = 'Último upload: ' + formatarData(data.contratos);
    if (elFornecedores && data.fornecedores) elFornecedores.textContent = 'Último upload: ' + formatarData(data.fornecedores);
    if (elNp && data.np) elNp.textContent = 'Último upload: ' + formatarData(data.np);
    if (elDedEnc && data.deducoesEncargos) elDedEnc.textContent = 'Último upload: ' + formatarData(data.deducoesEncargos);
    if (elCentroCustos && data.centroCustos) elCentroCustos.textContent = 'Último upload: ' + formatarData(data.centroCustos);
    if (elUg && data.unidadesGestoras) elUg.textContent = 'Último upload: ' + formatarData(data.unidadesGestoras);
}
window.atualizarUltimoImportUI = atualizarUltimoImportUI;

// Deduções e Encargos em script-deducoes-encargos.js.

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