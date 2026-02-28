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
auth.onAuthStateChanged(async (user) => {
    if (user) {
        usuarioLogadoEmail = user.email;
        const elUser = document.getElementById('nomeUsuarioLogado');
        if (elUser) elUser.textContent = `👤 ${usuarioLogadoEmail}`;
        
        // Espera SINCRONAMENTE pelas permissões antes de exibir qualquer tela
        await carregarPermissoes();
        
        const corpoSistema = document.getElementById('corpo-sistema');
        const corpoAdmin = document.getElementById('corpo-admin');

        // Lógica de Rota: Estamos no Admin?
        if (corpoAdmin) {
            if (!permissoesEmCache.includes('acesso_admin')) {
                alert("Acesso Negado! Redirecionando...");
                window.location.replace('sistema.html');
                return; // Bloqueia execução imediata
            }
            corpoAdmin.style.display = 'block';
        } 
        // Lógica de Rota: Estamos no Sistema?
        else if (corpoSistema) {
            renderizarElementosRBAC();
            atualizarSeletorPerfil();
            corpoSistema.style.display = 'block';
            escutarFirebase();
        }
    } else {
        window.location.href = "index.html";
    }
});
function fazerLogout() { auth.signOut(); }

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

        try {
            await db.collection('perfis').doc(nomePerfil).set({ permissoes: permissoesSelecionadas }, { merge: true });
            alert(`Perfil '${nomePerfil}' salvo com sucesso!`);
            formPerfilAdmin.reset();
            if (typeof window.adminRecarregarDados === 'function') window.adminRecarregarDados();
        } catch (err) { alert("Acesso Negado: Apenas o Admin pode gravar."); }
    });
}

const formUsuarioAdmin = document.getElementById('formUsuarioAdmin');
if (formUsuarioAdmin) {
    formUsuarioAdmin.addEventListener('submit', async function(e) {
        e.preventDefault();
        const uid = document.getElementById('adminUsuarioUid').value.trim();
        const email = document.getElementById('adminUsuarioEmail').value.trim();
        const checkboxes = document.querySelectorAll('.cb-perfil-usuario:checked');
        const perfis = Array.from(checkboxes).map(cb => cb.value.trim().toLowerCase());
        const perfilAtualEl = document.getElementById('adminUsuarioPerfilAtual');
        let perfilAtual = (perfilAtualEl && perfilAtualEl.value) ? perfilAtualEl.value.trim().toLowerCase() : null;
        if (perfis.length === 0) { alert("Selecione pelo menos um perfil."); return; }
        if (!perfilAtual || !perfis.includes(perfilAtual)) perfilAtual = perfis[0];

        try {
            await db.collection('usuarios').doc(uid).set({ email: email, perfis: perfis, perfil_ativo: perfilAtual }, { merge: true });
            alert(`Usuário atualizado com perfis: ${perfis.join(', ')}. Perfil ativo: ${perfilAtual}.`);
            formUsuarioAdmin.reset();
            if (typeof window.adminRecarregarDados === 'function') window.adminRecarregarDados();
        } catch (err) { alert("Acesso Negado: Apenas o Admin pode atribuir cargos."); }
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

    atualizarTabelaEmpenhos(); atualizarTabelaContratos(); atualizarTabelaDarf(); atualizarTabelaTitulos();
    inicializarSetasOrdenacao();
}

function escutarFirebase() {
    db.collection('empenhos').onSnapshot(snap => { baseEmpenhos = snap.docs.map(doc => ({ id: doc.id, ...doc.data() })); atualizarTabelaEmpenhos(); esconderLoading(); });
    db.collection('contratos').onSnapshot(snap => { baseContratos = snap.docs.map(doc => ({ id: doc.id, ...doc.data() })); atualizarTabelaContratos(); });
    db.collection('darf').onSnapshot(snap => { baseDarf = snap.docs.map(doc => ({ id: doc.id, ...doc.data() })); atualizarTabelaDarf(); });
    db.collection('titulos').onSnapshot(snap => { baseTitulos = snap.docs.map(doc => ({ id: doc.id, ...doc.data() })); atualizarTabelaTitulos(); });
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