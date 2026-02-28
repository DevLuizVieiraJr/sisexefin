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
function mostrarLoading() { const l = document.getElementById('loadingApp'); if(l) l.style.display = 'flex'; }
function esconderLoading() { const l = document.getElementById('loadingApp'); if(l) l.style.display = 'none'; }
function debounce(func, timeout = 300) { let timer; return (...args) => { clearTimeout(timer); timer = setTimeout(() => { func.apply(this, args); }, timeout); }; }

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

        const perfilDoc = await db.collection('perfis').doc(perfilAtivo).get();
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
    } catch (err) { alert("Erro ao trocar perfil."); }
}
window.trocarPerfil = trocarPerfil;


function renderizarElementosRBAC() {
    document.querySelectorAll('[data-permission]').forEach(el => {
        const req = el.getAttribute('data-permission');
        if (!permissoesEmCache.includes(req)) el.remove();
    });
}

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

function gerarBotoesAcao(id, modulo) {
    const safeId = escapeHTML(id);
    const modMap = { empenho: 'empenhos', contrato: 'contratos', titulo: 'titulos', darf: 'darf' };
    const mod = modMap[modulo] || modulo;
    let html = '';
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

        // Lógica de Rota: Estamos no Admin?
        if (corpoAdmin) {
            if (!permissoesEmCache.includes('acesso_admin')) {
                alert("Acesso Negado! Redirecionando...");
                window.location.replace('sistema.html');
                return;
            }
            corpoAdmin.style.display = 'block';
        }
        // Lógica de Rota: Estamos na SPA Títulos?
        else if (corpoTitulos) {
            if (!permissoesEmCache.includes('titulos_ler')) {
                alert("Acesso Negado ao módulo TC. Redirecionando...");
                window.location.replace('sistema.html');
                return;
            }
            renderizarElementosRBAC();
            atualizarSeletorPerfil();
            corpoTitulos.style.display = 'block';
            if (typeof inicializarTitulosSPA === 'function') inicializarTitulosSPA();
        }
        // Lógica de Rota: Estamos no Sistema?
        else if (corpoSistema) {
            renderizarElementosRBAC();
            atualizarSeletorPerfil();
            corpoSistema.style.display = 'block';
            escutarFirebase();
        }
        if (typeof iniciarWatcherInatividade === 'function') iniciarWatcherInatividade();
    } else {
        window.location.href = "index.html";
    }
});
function fazerLogout() { auth.signOut(); }

// ==========================================
// TIMEOUT POR INATIVIDADE (15 min + aviso 2 min)
// ==========================================
const INATIVIDADE_MS = 15 * 60 * 1000;
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

    function fecharModalEResetar() {
        if (modalEl && modalEl.parentNode) modalEl.remove();
        modalEl = null;
        if (timerAviso) { clearTimeout(timerAviso); timerAviso = null; }
        reiniciarTimer();
    }

    function mostrarModalAviso() {
        if (modalEl) return;
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

    const eventos = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart', 'click'];
    const debouncedReset = debounce(reiniciarTimer, 1000);
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
        const checkboxes = document.querySelectorAll('.cb-perm:checked');
        const permissoesSelecionadas = Array.from(checkboxes).map(cb => cb.value);
        const btn = formPerfilAdmin.querySelector('button[type="submit"]');
        if (typeof window.adminLoading === 'function') window.adminLoading(true);
        if (typeof window.btnLoading === 'function' && btn) window.btnLoading(btn, true);
        try {
            await db.collection('perfis').doc(nomePerfil).set({ permissoes: permissoesSelecionadas }, { merge: true });
            alert(`Perfil '${nomePerfil}' salvo com sucesso!`);
            formPerfilAdmin.reset();
            if (typeof window.adminRecarregarDados === 'function') window.adminRecarregarDados();
            if (typeof window.voltarListaPerfis === 'function') window.voltarListaPerfis();
        } catch (err) { alert("Acesso Negado: Apenas o Admin pode gravar."); }
        finally {
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

        try {
            let uidFinal = uid;
            if (!uid) {
                const senhaInicial = (document.getElementById('adminUsuarioSenhaInicial') || {}).value || '';
                if (!validarSenhaForte(senhaInicial)) {
                    alert("Para novo usuário, informe senha forte: mínimo 8 caracteres, incluindo letras e números.");
                    return;
                }
                const adminEmail = auth.currentUser ? auth.currentUser.email : '';
                const adminSenha = (document.getElementById('adminUsuarioSenhaAdmin') || {}).value || '';
                const userCred = await auth.createUserWithEmailAndPassword(email, senhaInicial);
                uidFinal = userCred.user.uid;
                await db.collection('usuarios').doc(uidFinal).set(dados, { merge: true });
                await auth.signOut();
                if (adminSenha && adminEmail) {
                    await auth.signInWithEmailAndPassword(adminEmail, adminSenha);
                }
                if (typeof registrarAuditoria === 'function') registrarAuditoria('criar_usuario', email, { perfis, perfil_ativo: perfilAtual });
                alert(`Usuário criado com sucesso. UID gerado automaticamente pelo Firebase Auth. Perfis: ${perfis.join(', ')}.`);
                formUsuarioAdmin.reset();
                const uidInput = document.getElementById('adminUsuarioUid');
                if (uidInput) uidInput.value = '';
                if (typeof window.adminRecarregarDados === 'function') window.adminRecarregarDados();
                if (!adminSenha && adminEmail) {
                    window.location.href = (window.location.pathname.replace(/admin\.html?$/, '') || '/') + 'index.html';
                }
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
            if (typeof window.adminLoading === 'function') window.adminLoading(false);
            if (typeof window.btnLoading === 'function' && btn) window.btnLoading(btn, false);
        }
    });
}

// ... DAQUI PARA BAIXO O CÓDIGO CONTINUA IGUAL (VÁRIAVEIS DE ESTADO, ETC.) ...
// ==========================================
// VARIÁVEIS DE ESTADO (Paginação e Busca)
// ==========================================
let baseEmpenhos = []; let baseContratos = []; let baseDarf = []; let baseTitulos = [];
let paginaAtualEmpenhos = 1; let itensPorPaginaEmpenhos = 10; let termoBuscaEmpenhos = "";
let paginaAtualContratos = 1; let itensPorPaginaContratos = 10; let termoBuscaContratos = "";
let paginaAtualDarf = 1; let itensPorPaginaDarf = 10; let termoBuscaDarf = "";
let paginaAtualTitulos = 1; let itensPorPaginaTitulos = 10; let termoBuscaTitulos = "";
let darfsDoContratoAtual = []; 
let empenhosDaNotaAtual = []; 
let empenhoTemporarioSelecionado = null;

// ==========================================
// MOTOR DE ORDENAÇÃO
// ==========================================
let estadoOrdenacao = {
    empenhos: { coluna: 'numEmpenho', direcao: 'asc' },
    contratos: { coluna: 'fornecedor', direcao: 'asc' },
    darf: { coluna: 'codigo', direcao: 'asc' },
    titulos: { coluna: 'idProc', direcao: 'asc' }
};

function ordenarTabela(modulo, coluna) {
    if (estadoOrdenacao[modulo].coluna === coluna) { estadoOrdenacao[modulo].direcao = estadoOrdenacao[modulo].direcao === 'asc' ? 'desc' : 'asc'; } 
    else { estadoOrdenacao[modulo].coluna = coluna; estadoOrdenacao[modulo].direcao = 'asc'; }
    document.querySelectorAll(`[id^="sort-${modulo}-"]`).forEach(el => el.textContent = '');
    const iconEl = document.getElementById(`sort-${modulo}-${coluna}`);
    if(iconEl) iconEl.textContent = estadoOrdenacao[modulo].direcao === 'asc' ? '▲' : '▼';

    if (modulo === 'empenhos') { paginaAtualEmpenhos = 1; atualizarTabelaEmpenhos(); }
    if (modulo === 'contratos') { paginaAtualContratos = 1; atualizarTabelaContratos(); }
    if (modulo === 'darf') { paginaAtualDarf = 1; atualizarTabelaDarf(); }
    if (modulo === 'titulos') { paginaAtualTitulos = 1; atualizarTabelaTitulos(); }
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
    ['empenhos', 'contratos', 'darf', 'titulos'].forEach(modulo => {
        const col = estadoOrdenacao[modulo].coluna; 
        const iconEl = document.getElementById(`sort-${modulo}-${col}`);
        if(iconEl) iconEl.textContent = estadoOrdenacao[modulo].direcao === 'asc' ? '▲' : '▼';
    });
}

// ==========================================
// NAVEGAÇÃO PRINCIPAL E SINCRONIZAÇÃO
// ==========================================
function mostrarSecao(idSecao, botao) {
    document.querySelectorAll('.secao').forEach(s => s.style.display = 'none');
    const secaoAlvo = document.getElementById(idSecao);
    if(secaoAlvo) secaoAlvo.style.display = 'block';

    document.querySelectorAll('.menu-btn').forEach(b => b.classList.remove('ativo')); 
    if(botao) botao.classList.add('ativo');
    
    document.querySelectorAll('[id^="tela-formulario"]').forEach(f => f.style.display = 'none');
    document.querySelectorAll('[id^="tela-lista"]').forEach(l => l.style.display = 'block');

    if (typeof atualizarTabelaEmpenhos === 'function') atualizarTabelaEmpenhos();
    if (typeof atualizarTabelaContratos === 'function') atualizarTabelaContratos();
    if (typeof atualizarTabelaDarf === 'function') atualizarTabelaDarf();
    if (typeof atualizarTabelaTitulos === 'function') atualizarTabelaTitulos();
    inicializarSetasOrdenacao();
}

function escutarFirebase() {
    const onError = () => esconderLoading();
    db.collection('empenhos').onSnapshot(
        snap => { baseEmpenhos = snap.docs.map(doc => ({ id: doc.id, ...doc.data() })); if (typeof atualizarTabelaEmpenhos === 'function') atualizarTabelaEmpenhos(); esconderLoading(); },
        onError
    );
    db.collection('contratos').onSnapshot(
        snap => { baseContratos = snap.docs.map(doc => ({ id: doc.id, ...doc.data() })); if (typeof atualizarTabelaContratos === 'function') atualizarTabelaContratos(); esconderLoading(); },
        onError
    );
    db.collection('darf').onSnapshot(
        snap => { baseDarf = snap.docs.map(doc => ({ id: doc.id, ...doc.data() })); if (typeof atualizarTabelaDarf === 'function') atualizarTabelaDarf(); esconderLoading(); },
        onError
    );
    db.collection('titulos').onSnapshot(
        snap => { baseTitulos = snap.docs.map(doc => ({ id: doc.id, ...doc.data() })); if (typeof atualizarTabelaTitulos === 'function') atualizarTabelaTitulos(); esconderLoading(); },
        onError
    );
}

// ==========================================
// MÓDULOS (script-empenhos.js, script-contratos.js, script-darf.js, script-titulos.js)
// ==========================================
// Funções atualizarTabela* são definidas pelos módulos. mostrarSecao chama-as.

// Stub - DARF e Títulos definidos em script-darf.js e script-titulos.js

// 6. FUNÇÃO DE BACKUP GLOBAL (Implementada)
function exportarBancoDeDados() {
    try {
        const backupData = {
            data_exportacao: new Date().toISOString(),
            usuario: usuarioLogadoEmail,
            empenhos: baseEmpenhos,
            contratos: baseContratos,
            darf: baseDarf,
            titulos: baseTitulos
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