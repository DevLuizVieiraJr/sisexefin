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
// MÓDULO RBAC
// ==========================================
let permissoesEmCache = []; 

async function carregarPermissoes() {
    const user = auth.currentUser;
    if (!user) return [];
    try {
        const userDoc = await db.collection('usuarios').doc(user.uid).get();
        if (!userDoc.exists) return [];
        const data = userDoc.data();
        // Suporta perfis (array) ou perfil (singular) para retrocompatibilidade
        const idsPerfis = Array.isArray(data.perfis) ? data.perfis : (data.perfil ? [data.perfil] : []);
        const todasPermissoes = [];
        for (const perfilId of idsPerfis) {
            const perfilDoc = await db.collection('perfis').doc(perfilId).get();
            if (perfilDoc.exists && perfilDoc.data().permissoes) {
                todasPermissoes.push(...perfilDoc.data().permissoes);
            }
        }
        permissoesEmCache = [...new Set(todasPermissoes)];
        return permissoesEmCache;
    } catch (error) { return []; }
}

function renderizarElementosRBAC() {
    document.querySelectorAll('[data-permission]').forEach(el => {
        const req = el.getAttribute('data-permission');
        if (!permissoesEmCache.includes(req)) el.remove();
    });
}

function gerarBotoesAcao(id, modulo) {
    const safeId = escapeHTML(id);
    let html = '';
    if (permissoesEmCache.includes('editar_dados')) html += `<button type="button" class="btn-icon btn-editar-${modulo}" data-id="${safeId}">✏️</button>`;
    if (permissoesEmCache.includes('excluir_dados')) html += `<button type="button" class="btn-icon btn-apagar-${modulo}" data-id="${safeId}">🗑️</button>`;
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

        // Sincronizar utilizador Auth -> Firestore (permite listar no menu de acesso)
        try {
            const userRef = db.collection('usuarios').doc(user.uid);
            const snap = await userRef.get();
            if (!snap.exists) {
                await userRef.set({ email: user.email || '' }, { merge: true });
            }
        } catch (e) { /* ignora erro de rede ou permissão */ }

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
            corpoSistema.style.display = 'block';
            escutarFirebase();
        }
    } else {
        window.location.href = "index.html";
    }
});
function fazerLogout() { auth.signOut(); }

// ==========================================
// LÓGICA DO PAINEL ADMIN (SPA - Usuários e Perfis)
// ==========================================
let baseUsuarios = [];
let basePerfis = [];
let paginaAtualUsuarios = 1;
let itensPorPaginaUsuarios = 10;
let termoBuscaUsuarios = "";
let paginaAtualPerfis = 1;
let itensPorPaginaPerfis = 10;
let termoBuscaPerfis = "";

// Alternar entre abas Usuários e Perfis
function mostrarSecaoAdmin(idSecao, botao) {
    const secUsuarios = document.getElementById('secao-usuarios');
    const secPerfis = document.getElementById('secao-perfis');
    if (secUsuarios) secUsuarios.style.display = idSecao === 'secao-usuarios' ? 'block' : 'none';
    if (secPerfis) secPerfis.style.display = idSecao === 'secao-perfis' ? 'block' : 'none';
    document.querySelectorAll('.admin-sidebar .menu-btn').forEach(b => b.classList.remove('ativo'));
    if (botao) botao.classList.add('ativo');
    if (idSecao === 'secao-usuarios') carregarUsuariosTabela();
    else if (idSecao === 'secao-perfis') { carregarPerfisTabela(); carregarPerfisNoSelect(); }
}

// Busca coleção perfis e preenche a tabela de Perfis
async function carregarPerfisTabela() {
    try {
        const snap = await db.collection('perfis').get();
        basePerfis = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        atualizarTabelaPerfis();
    } catch (err) {
        console.error('Erro ao carregar perfis:', err);
        const tbody = document.getElementById('tbody-perfis');
        if (tbody) tbody.innerHTML = '<tr><td colspan="2" style="text-align:center;">Erro ao carregar. Verifique as permissões.</td></tr>';
    }
}

function atualizarTabelaPerfis() {
    const tbody = document.getElementById('tbody-perfis');
    if (!tbody) return;
    const sel = document.getElementById('itensPorPaginaPerfis');
    if (sel) itensPorPaginaPerfis = parseInt(sel.value) || 10;
    termoBuscaPerfis = (document.getElementById('buscaPerfis')?.value || '').toLowerCase();
    let baseFiltrada = basePerfis.filter(p =>
        (p.id && p.id.toLowerCase().includes(termoBuscaPerfis))
    );
    const totalPaginas = Math.max(1, Math.ceil(baseFiltrada.length / itensPorPaginaPerfis));
    const inicio = (paginaAtualPerfis - 1) * itensPorPaginaPerfis;
    const itensExibidos = baseFiltrada.slice(inicio, inicio + itensPorPaginaPerfis);
    tbody.innerHTML = '';
    if (itensExibidos.length === 0) {
        tbody.innerHTML = '<tr><td colspan="2" style="text-align:center;">Nenhum perfil encontrado.</td></tr>';
    } else {
        itensExibidos.forEach(p => {
            const tr = document.createElement('tr');
            const perms = Array.isArray(p.permissoes) ? p.permissoes.join(', ') : '-';
            tr.innerHTML = `<td><strong>${escapeHTML(p.id)}</strong></td><td>${escapeHTML(perms)}</td>`;
            tbody.appendChild(tr);
        });
    }
    const info = document.getElementById('infoPaginaPerfis');
    const btnAnt = document.getElementById('btnAnteriorPerfis');
    const btnProx = document.getElementById('btnProximoPerfis');
    if (info) info.textContent = `Página ${paginaAtualPerfis} de ${totalPaginas}`;
    if (btnAnt) btnAnt.disabled = paginaAtualPerfis <= 1;
    if (btnProx) btnProx.disabled = paginaAtualPerfis >= totalPaginas;
}

function mudarPaginaPerfis(direcao) {
    paginaAtualPerfis = Math.max(1, paginaAtualPerfis + direcao);
    atualizarTabelaPerfis();
}

// Busca coleção usuarios e preenche a tabela de Usuários
async function carregarUsuariosTabela() {
    try {
        const snap = await db.collection('usuarios').get();
        baseUsuarios = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        atualizarTabelaUsuarios();
    } catch (err) {
        console.error('Erro ao carregar usuários:', err);
        const tbody = document.getElementById('tbody-usuarios');
        if (tbody) tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">Erro ao carregar. Verifique as permissões.</td></tr>';
    }
}

function atualizarTabelaUsuarios() {
    const tbody = document.getElementById('tbody-usuarios');
    if (!tbody) return;
    const sel = document.getElementById('itensPorPaginaUsuarios');
    if (sel) itensPorPaginaUsuarios = parseInt(sel.value) || 10;
    termoBuscaUsuarios = (document.getElementById('buscaUsuarios')?.value || '').toLowerCase();
    let baseFiltrada = baseUsuarios.filter(u =>
        (u.email && u.email.toLowerCase().includes(termoBuscaUsuarios)) ||
        (u.id && u.id.toLowerCase().includes(termoBuscaUsuarios))
    );
    const totalPaginas = Math.max(1, Math.ceil(baseFiltrada.length / itensPorPaginaUsuarios));
    const inicio = (paginaAtualUsuarios - 1) * itensPorPaginaUsuarios;
    const itensExibidos = baseFiltrada.slice(inicio, inicio + itensPorPaginaUsuarios);
    tbody.innerHTML = '';
    if (itensExibidos.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">Nenhum utilizador encontrado.</td></tr>';
    } else {
        itensExibidos.forEach(u => {
            const tr = document.createElement('tr');
            const perfisStr = Array.isArray(u.perfis) ? u.perfis.join(', ') : (u.perfil || '-');
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'btn-icon';
            btn.title = 'Editar perfil';
            btn.textContent = '✏️';
            btn.dataset.uid = u.id;
            btn.dataset.email = u.email || '';
            btn.dataset.perfil = Array.isArray(u.perfis) ? u.perfis[0] || '' : (u.perfil || '');
            btn.onclick = () => { if (typeof abrirModalEditarUsuario === 'function') abrirModalEditarUsuario(btn.dataset.uid, btn.dataset.email, btn.dataset.perfil); };
            tr.innerHTML = `
                <td style="font-size:11px; max-width:150px; overflow:hidden; text-overflow:ellipsis;" title="${escapeHTML(u.id)}">${escapeHTML(u.id)}</td>
                <td>${escapeHTML(u.email || '-')}</td>
                <td><span class="badge-tag">${escapeHTML(perfisStr)}</span></td>
                <td></td>`;
            tr.querySelector('td:last-child').appendChild(btn);
            tbody.appendChild(tr);
        });
    }
    const info = document.getElementById('infoPaginaUsuarios');
    const btnAnt = document.getElementById('btnAnteriorUsuarios');
    const btnProx = document.getElementById('btnProximoUsuarios');
    if (info) info.textContent = `Página ${paginaAtualUsuarios} de ${totalPaginas}`;
    if (btnAnt) btnAnt.disabled = paginaAtualUsuarios <= 1;
    if (btnProx) btnProx.disabled = paginaAtualUsuarios >= totalPaginas;
}

function mudarPaginaUsuarios(direcao) {
    paginaAtualUsuarios = Math.max(1, paginaAtualUsuarios + direcao);
    atualizarTabelaUsuarios();
}

// Alias para o botão Atualizar na secção Usuários
function recarregarUsuarios() { carregarUsuariosTabela(); }

// Carregar perfis para o select do modal (Admin)
function carregarPerfisNoSelect() {
    if (basePerfis.length === 0) {
        db.collection('perfis').get().then(snap => {
            basePerfis = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            preencherSelectPerfis();
        });
    } else preencherSelectPerfis();
}
function preencherSelectPerfis() {
    const select = document.getElementById('modalSelectPerfil');
    if (!select) return;
    const atual = select.value;
    select.innerHTML = '<option value="">— Selecionar perfil —</option>';
    basePerfis.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = p.id;
        select.appendChild(opt);
    });
    if (atual) select.value = atual;
}

// ==========================================
// FORMULÁRIOS DO PAINEL ADMIN
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
            if (typeof carregarPerfisTabela === 'function') carregarPerfisTabela();
            if (typeof carregarPerfisNoSelect === 'function') carregarPerfisNoSelect();
        } catch (err) { alert("Acesso Negado: Apenas o Admin pode gravar."); }
    });
}

const formUsuarioAdmin = document.getElementById('formUsuarioAdmin');
if (formUsuarioAdmin) {
    formUsuarioAdmin.addEventListener('submit', async function(e) {
        e.preventDefault();
        const uid = document.getElementById('adminUsuarioUid').value.trim();
        const email = document.getElementById('adminUsuarioEmail').value.trim();
        const perfil = document.getElementById('adminUsuarioPerfil').value.trim().toLowerCase();

        try {
            await db.collection('usuarios').doc(uid).set({ email: email, perfil: perfil }, { merge: true });
            alert(`Usuário atualizado com o cargo de '${perfil}'!`);
            formUsuarioAdmin.reset();
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
// MÓDULO: EMPENHOS
// ==========================================
const formEmpenho = document.getElementById('formEmpenho');
const tabelaEmpenhosBody = document.querySelector('#tabelaEmpenhos tbody');

document.getElementById('buscaTabelaEmpenhos').addEventListener('input', debounce(() => {
    termoBuscaEmpenhos = document.getElementById('buscaTabelaEmpenhos').value.toLowerCase();
    paginaAtualEmpenhos = 1; atualizarTabelaEmpenhos();
}));

function abrirFormularioEmpenho(isEdit = false) { 
    if(!isEdit) { formEmpenho.reset(); document.getElementById('editIndexEmpenho').value = -1; }
    document.getElementById('tela-lista-empenhos').style.display = 'none'; document.getElementById('tela-formulario-empenhos').style.display = 'block'; 
}
function voltarParaListaEmpenhos() { document.getElementById('tela-formulario-empenhos').style.display = 'none'; document.getElementById('tela-lista-empenhos').style.display = 'block'; atualizarTabelaEmpenhos(); }

// 2. CORREÇÃO DE ESCOPO (ReferenceError corrigido)
function atualizarTabelaEmpenhos() {
    tabelaEmpenhosBody.innerHTML = '';
    let baseFiltrada = baseEmpenhos.map((emp, index) => ({ ...emp, indexOriginal: index }));
    
    if (termoBuscaEmpenhos.trim() !== "") { 
        baseFiltrada = baseFiltrada.filter(emp => 
            (emp.numEmpenho && emp.numEmpenho.toLowerCase().includes(termoBuscaEmpenhos)) || 
            (emp.contrato && emp.contrato.toLowerCase().includes(termoBuscaEmpenhos))
        ); 
    }
    
    baseFiltrada = aplicarOrdenacao(baseFiltrada, 'empenhos');
    const inicio = (paginaAtualEmpenhos - 1) * itensPorPaginaEmpenhos; 
    const fim = inicio + parseInt(itensPorPaginaEmpenhos);
    let itensExibidos = baseFiltrada.slice(inicio, fim);
    
    if (itensExibidos.length === 0) { 
        tabelaEmpenhosBody.innerHTML = '<tr><td colspan="11" style="text-align:center;">Nenhum registo encontrado.</td></tr>'; 
        return;
    }
    
    itensExibidos.forEach((emp) => {
        const tr = document.createElement('tr');
        const acoesHTML = gerarBotoesAcao(emp.id, 'empenho');
        tr.innerHTML = `
            <td><strong>${escapeHTML(emp.numEmpenho)}</strong></td>
            <td>${escapeHTML(emp.nd) || '-'}</td>
            <td>${escapeHTML(emp.subitem) || '-'}</td>
            <td>${escapeHTML(emp.ptres) || '-'}</td>
            <td>${escapeHTML(emp.fr) || '-'}</td>
            <td>${escapeHTML(emp.docOrig) || '-'}</td>
            <td>${escapeHTML(emp.oi) || '-'}</td>
            <td>${escapeHTML(emp.contrato) || '-'}</td>
            <td>${escapeHTML(emp.cap) || '-'}</td>
            <td>${escapeHTML(emp.meio) || '-'}</td>
            <td>${acoesHTML}</td>`;
        tabelaEmpenhosBody.appendChild(tr);
    });
    
    const total = Math.ceil(baseFiltrada.length / itensPorPaginaEmpenhos) || 1;
    document.getElementById('infoPaginaEmpenhos').textContent = `Página ${paginaAtualEmpenhos} de ${total}`;
    document.getElementById('btnAnteriorEmpenhos').disabled = paginaAtualEmpenhos === 1; 
    document.getElementById('btnProximoEmpenhos').disabled = paginaAtualEmpenhos === total;
}

// 5. EVENT DELEGATION: Listener único para a tabela de Empenhos
tabelaEmpenhosBody.addEventListener('click', function(e) {
    const btnEditar = e.target.closest('.btn-editar-empenho');
    const btnApagar = e.target.closest('.btn-apagar-empenho');
    if (btnEditar) editarEmpenho(btnEditar.getAttribute('data-id'));
    if (btnApagar) apagarEmpenho(btnApagar.getAttribute('data-id'));
});

function mudarTamanhoPaginaEmpenhos() { itensPorPaginaEmpenhos = document.getElementById('itensPorPaginaEmpenhos').value; paginaAtualEmpenhos = 1; atualizarTabelaEmpenhos(); }
function mudarPaginaEmpenhos(direcao) { paginaAtualEmpenhos += direcao; atualizarTabelaEmpenhos(); }

function editarEmpenho(id) {
    const emp = baseEmpenhos.find(e => e.id === id);
    if(emp) {
        abrirFormularioEmpenho(true); document.getElementById('editIndexEmpenho').value = emp.id; 
        document.getElementById('numEmpenho').value = emp.numEmpenho || ''; document.getElementById('dataEmpenho').value = emp.dataEmpenho || ''; 
        document.getElementById('valorEmpenho').value = emp.valorEmpenho || ''; document.getElementById('ndEmpenho').value = emp.nd || ''; 
        document.getElementById('subitemEmpenho').value = emp.subitem || ''; document.getElementById('ptresEmpenho').value = emp.ptres || ''; 
        document.getElementById('frEmpenho').value = emp.fr || ''; document.getElementById('docOrigEmpenho').value = emp.docOrig || ''; 
        document.getElementById('oiEmpenho').value = emp.oi || ''; document.getElementById('contratoEmpenho').value = emp.contrato || ''; 
        document.getElementById('capEmpenho').value = emp.cap || ''; document.getElementById('altcredEmpenho').value = emp.altcred || ''; 
        document.getElementById('meioEmpenho').value = emp.meio || ''; document.getElementById('descricaoEmpenho').value = emp.descricao || '';
    }
}

async function apagarEmpenho(id) { 
    if (confirm("Apagar empenho permanentemente?")) {
        mostrarLoading();
        try { await db.collection('empenhos').doc(id).delete(); } 
        catch (error) { alert("Acesso Negado: Não tem permissão para apagar ou ocorreu um erro."); } 
        finally { esconderLoading(); }
    } 
}

formEmpenho.addEventListener('submit', async function(e) {
    e.preventDefault(); mostrarLoading();
    const fbID = document.getElementById('editIndexEmpenho').value; 
    const dados = { 
        numEmpenho: escapeHTML(document.getElementById('numEmpenho').value.trim()), 
        dataEmpenho: escapeHTML(document.getElementById('dataEmpenho').value), 
        valorEmpenho: parseFloat(document.getElementById('valorEmpenho').value) || 0, 
        nd: escapeHTML(document.getElementById('ndEmpenho').value), subitem: escapeHTML(document.getElementById('subitemEmpenho').value), 
        ptres: escapeHTML(document.getElementById('ptresEmpenho').value), fr: escapeHTML(document.getElementById('frEmpenho').value), 
        docOrig: escapeHTML(document.getElementById('docOrigEmpenho').value), oi: escapeHTML(document.getElementById('oiEmpenho').value), 
        contrato: escapeHTML(document.getElementById('contratoEmpenho').value), cap: escapeHTML(document.getElementById('capEmpenho').value), 
        altcred: escapeHTML(document.getElementById('altcredEmpenho').value), meio: escapeHTML(document.getElementById('meioEmpenho').value), 
        descricao: escapeHTML(document.getElementById('descricaoEmpenho').value) 
    };
    try {
        if (fbID == -1 || fbID === "") { await db.collection('empenhos').add(dados); } 
        else { await db.collection('empenhos').doc(fbID).update(dados); }
        voltarParaListaEmpenhos();
    } catch (error) { alert("Erro ao guardar o registo. Verifique as suas permissões."); } 
    finally { esconderLoading(); }
});

// ==========================================
// MÓDULO: CONTRATOS E EMPRESAS
// ==========================================
const formContrato = document.getElementById('formContrato');
const tabelaContratosBody = document.querySelector('#tabelaContratos tbody');

document.getElementById('buscaTabelaContratos').addEventListener('input', debounce(() => {
    termoBuscaContratos = document.getElementById('buscaTabelaContratos').value.toLowerCase();
    paginaAtualContratos = 1; atualizarTabelaContratos();
}));

function abrirFormularioContrato(isEdit = false) { 
    if(!isEdit) { formContrato.reset(); document.getElementById('editIndexContrato').value = -1; darfsDoContratoAtual = []; desenharDarfsContrato(); }
    document.getElementById('tela-lista-contratos').style.display = 'none'; document.getElementById('tela-formulario-contratos').style.display = 'block';
}
function voltarParaListaContratos() { document.getElementById('tela-formulario-contratos').style.display = 'none'; document.getElementById('tela-lista-contratos').style.display = 'block'; atualizarTabelaContratos(); }

function atualizarTabelaContratos() {
    tabelaContratosBody.innerHTML = ''; 
    let baseFiltrada = baseContratos.map((c, index) => ({ ...c, indexOriginal: index }));
    if (termoBuscaContratos.trim() !== "") { 
        baseFiltrada = baseFiltrada.filter(c => (c.fornecedor && c.fornecedor.toLowerCase().includes(termoBuscaContratos)) || (c.numContrato && c.numContrato.toLowerCase().includes(termoBuscaContratos))); 
    }
    baseFiltrada = aplicarOrdenacao(baseFiltrada, 'contratos');
    const inicio = (paginaAtualContratos - 1) * itensPorPaginaContratos; const fim = inicio + parseInt(itensPorPaginaContratos);
    let itensExibidos = baseFiltrada.slice(inicio, fim);
    
    if (itensExibidos.length === 0) { tabelaContratosBody.innerHTML = '<tr><td colspan="8" style="text-align:center;">Nenhum contrato encontrado.</td></tr>'; return;}

    itensExibidos.forEach((c) => {
        const tr = document.createElement('tr');
        const acoesHTML = gerarBotoesAcao(c.id, 'contrato');
        tr.innerHTML = `
            <td>${escapeHTML(c.idContrato) || '-'}</td>
            <td><strong>${escapeHTML(c.numContrato) || '-'}</strong></td>
            <td>${escapeHTML(c.fornecedor) || '-'}</td>
            <td>${escapeHTML(c.dataInicio) || '-'}</td>
            <td>${escapeHTML(c.dataFim) || '-'}</td>
            <td>${escapeHTML(c.valorContrato) || '-'}</td>
            <td>${escapeHTML(c.situacao) || '-'}</td>
            <td>${acoesHTML}</td>`;
        tabelaContratosBody.appendChild(tr);
    });
    const total = Math.ceil(baseFiltrada.length / itensPorPaginaContratos) || 1;
    document.getElementById('infoPaginaContratos').textContent = `Página ${paginaAtualContratos} de ${total}`;
    document.getElementById('btnAnteriorContratos').disabled = paginaAtualContratos === 1; 
    document.getElementById('btnProximoContratos').disabled = paginaAtualContratos === total;
}

// EVENT DELEGATION: Contratos
tabelaContratosBody.addEventListener('click', function(e) {
    const btnEditar = e.target.closest('.btn-editar-contrato');
    const btnApagar = e.target.closest('.btn-apagar-contrato');
    if (btnEditar) editarContrato(btnEditar.getAttribute('data-id'));
    if (btnApagar) apagarContrato(btnApagar.getAttribute('data-id'));
});

function mudarTamanhoPaginaContratos() { itensPorPaginaContratos = document.getElementById('itensPorPaginaContratos').value; paginaAtualContratos = 1; atualizarTabelaContratos(); }
function mudarPaginaContratos(direcao) { paginaAtualContratos += direcao; atualizarTabelaContratos(); }

function editarContrato(id) {
    const c = baseContratos.find(item => item.id === id);
    if(c) {
        abrirFormularioContrato(true); document.getElementById('editIndexContrato').value = c.id; 
        document.getElementById('idContrato').value = c.idContrato || ''; document.getElementById('numContrato').value = c.numContrato || '';
        document.getElementById('situacaoContrato').value = c.situacao || ''; document.getElementById('fornecedorContrato').value = c.fornecedor || '';
        document.getElementById('nupContrato').value = c.nup || ''; document.getElementById('dataInicio').value = c.dataInicio || '';
        document.getElementById('dataFim').value = c.dataFim || ''; 
        let valorTratado = c.valorContrato;
        if(typeof valorTratado === 'string' && valorTratado.includes('R$')) { valorTratado = valorTratado.replace('R$', '').replace(/\./g, '').replace(',', '.').trim(); }
        document.getElementById('valorContrato').value = parseFloat(valorTratado) || '';
        if (c.codigosReceita && Array.isArray(c.codigosReceita)) { darfsDoContratoAtual = [...c.codigosReceita]; } else { darfsDoContratoAtual = []; }
        desenharDarfsContrato();
    }
}
async function apagarContrato(id) { 
    if (confirm("Apagar Contrato permanentemente?")) { 
        mostrarLoading();
        try { await db.collection('contratos').doc(id).delete(); } 
        catch (err) { alert("Acesso Negado ou falha de rede."); } 
        finally { esconderLoading(); }
    } 
}

formContrato.addEventListener('submit', async function(e) {
    e.preventDefault(); mostrarLoading();
    const fbID = document.getElementById('editIndexContrato').value;
    let numVal = parseFloat(document.getElementById('valorContrato').value) || 0;
    let stringValor = numVal.toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'});
    const dados = { idContrato: escapeHTML(document.getElementById('idContrato').value), numContrato: escapeHTML(document.getElementById('numContrato').value), situacao: escapeHTML(document.getElementById('situacaoContrato').value), fornecedor: escapeHTML(document.getElementById('fornecedorContrato').value), nup: escapeHTML(document.getElementById('nupContrato').value), dataInicio: escapeHTML(document.getElementById('dataInicio').value), dataFim: escapeHTML(document.getElementById('dataFim').value), valorContrato: stringValor, codigosReceita: darfsDoContratoAtual };
    try {
        if (fbID == -1 || fbID === "") { await db.collection('contratos').add(dados); } 
        else { await db.collection('contratos').doc(fbID).update(dados); }
        voltarParaListaContratos();
    } catch(err) { alert("Erro ao guardar contrato."); }
    finally { esconderLoading(); }
});

// Autocomplete DARF
const inputBuscaDarfContrato = document.getElementById('buscaDarfContrato'); const listaResultadosDarf = document.getElementById('listaResultadosDarf');
inputBuscaDarfContrato.addEventListener('input', debounce(function() {
    const texto = this.value.toLowerCase(); listaResultadosDarf.innerHTML = '';
    if (texto.length >= 2) {
        const resultados = baseDarf.filter(d => d.codigo.includes(texto) || d.aplicacao.toLowerCase().includes(texto));
        if (resultados.length === 0) { listaResultadosDarf.innerHTML = '<li style="color:red; padding:10px;">Nenhum DARF encontrado.</li>'; }
        else { resultados.forEach(d => { const li = document.createElement('li'); li.innerHTML = `<strong>${escapeHTML(d.codigo)}</strong> - ${escapeHTML(d.aplicacao.substring(0, 40))}...`; li.onclick = () => selecionarDarfContrato(d); listaResultadosDarf.appendChild(li); }); }
    }
}));
function selecionarDarfContrato(d) { if (!darfsDoContratoAtual.includes(d.codigo)) { darfsDoContratoAtual.push(d.codigo); desenharDarfsContrato(); } inputBuscaDarfContrato.value = ''; listaResultadosDarf.innerHTML = ''; }
function desenharDarfsContrato() { const container = document.getElementById('containerDarfsContrato'); container.innerHTML = ''; darfsDoContratoAtual.forEach((codigo, index) => { const span = document.createElement('span'); span.className = 'badge-tag'; span.innerHTML = `${escapeHTML(codigo)} <button type="button" data-index="${index}" class="btn-rm-darf">&times;</button>`; container.appendChild(span); }); }
document.getElementById('containerDarfsContrato').addEventListener('click', (e) => { if(e.target.classList.contains('btn-rm-darf')) removerDarfContrato(e.target.getAttribute('data-index')); });
function removerDarfContrato(index) { darfsDoContratoAtual.splice(index, 1); desenharDarfsContrato(); }

// ==========================================
// MÓDULO: DARF
// ==========================================
const formDarf = document.getElementById('formDarf');
const tabelaDarfBody = document.querySelector('#tabelaDarf tbody');

document.getElementById('buscaTabelaDarf').addEventListener('input', debounce(() => {
    termoBuscaDarf = document.getElementById('buscaTabelaDarf').value.toLowerCase();
    paginaAtualDarf = 1; atualizarTabelaDarf();
}));

function abrirFormularioDarf(isEdit = false) { 
    if(!isEdit) { document.getElementById('formDarf').reset(); document.getElementById('editIndexDarf').value = -1; }
    document.getElementById('tela-lista-darf').style.display = 'none'; document.getElementById('tela-formulario-darf').style.display = 'block'; 
}
function voltarParaListaDarf() { document.getElementById('tela-formulario-darf').style.display = 'none'; document.getElementById('tela-lista-darf').style.display = 'block'; atualizarTabelaDarf(); }

function atualizarTabelaDarf() {
    tabelaDarfBody.innerHTML = ''; 
    let baseFiltrada = baseDarf.map((d, index) => ({ ...d, indexOriginal: index }));
    if (termoBuscaDarf.trim() !== "") { baseFiltrada = baseFiltrada.filter(d => (d.codigo && String(d.codigo).includes(termoBuscaDarf)) || (d.natRendimento && String(d.natRendimento).includes(termoBuscaDarf))); }
    baseFiltrada = aplicarOrdenacao(baseFiltrada, 'darf');

    const inicio = (paginaAtualDarf - 1) * itensPorPaginaDarf; const fim = inicio + parseInt(itensPorPaginaDarf);
    let itensExibidos = baseFiltrada.slice(inicio, fim);
    if (itensExibidos.length === 0) { tabelaDarfBody.innerHTML = '<tr><td colspan=\"6\" style=\"text-align:center;\">Nenhum DARF encontrado.</td></tr>'; return; }

    itensExibidos.forEach((d) => {
        const tr = document.createElement('tr');
        const aplicacaoCurta = d.aplicacao && d.aplicacao.length > 40 ? d.aplicacao.substring(0, 40) + "..." : d.aplicacao;
        const acoesHTML = gerarBotoesAcao(d.id, 'darf');
        tr.innerHTML = `
            <td><strong>${escapeHTML(d.codigo)}</strong></td>
            <td>${escapeHTML(d.natRendimento) || '-'}</td>
            <td title="${escapeHTML(d.aplicacao)}">${escapeHTML(aplicacaoCurta) || '-'}</td>
            <td>${escapeHTML(d.sitSiafi) || '-'}</td>
            <td>${escapeHTML(d.total) || '-'}</td>
            <td>${acoesHTML}</td>`;
        tabelaDarfBody.appendChild(tr);
    });
    const total = Math.ceil(baseFiltrada.length / itensPorPaginaDarf) || 1;
    document.getElementById('infoPaginaDarf').textContent = `Página ${paginaAtualDarf} de ${total}`;
    document.getElementById('btnAnteriorDarf').disabled = paginaAtualDarf === 1; document.getElementById('btnProximoDarf').disabled = paginaAtualDarf === total;
}

// EVENT DELEGATION: DARF
tabelaDarfBody.addEventListener('click', function(e) {
    const btnEditar = e.target.closest('.btn-editar-darf');
    const btnApagar = e.target.closest('.btn-apagar-darf');
    if (btnEditar) editarDarf(btnEditar.getAttribute('data-id'));
    if (btnApagar) apagarDarf(btnApagar.getAttribute('data-id'));
});

function mudarTamanhoPaginaDarf() { itensPorPaginaDarf = document.getElementById('itensPorPaginaDarf').value; paginaAtualDarf = 1; atualizarTabelaDarf(); }
function mudarPaginaDarf(direcao) { paginaAtualDarf += direcao; atualizarTabelaDarf(); }

function editarDarf(id) {
    const d = baseDarf.find(item => item.id === id);
    if(d) {
        abrirFormularioDarf(true); document.getElementById('editIndexDarf').value = d.id;
        document.getElementById('codigoDarf').value = d.codigo || ''; document.getElementById('natRendimentoDarf').value = d.natRendimento || '';
        document.getElementById('sitSiafiDarf').value = d.sitSiafi || ''; document.getElementById('aplicacaoDarf').value = d.aplicacao || '';
        document.getElementById('irDarf').value = d.ir || ''; document.getElementById('csllDarf').value = d.csll || '';
        document.getElementById('cofinsDarf').value = d.cofins || ''; document.getElementById('pisDarf').value = d.pis || '';
        document.getElementById('totalDarf').value = d.total || '';
    }
}
async function apagarDarf(id) { 
    if (confirm(`Apagar o DARF permanentemente?`)) { 
        mostrarLoading();
        try { await db.collection('darf').doc(id).delete(); } 
        catch(err) { alert("Acesso Negado."); } 
        finally { esconderLoading(); } 
    } 
}

formDarf.addEventListener('submit', async function(e) {
    e.preventDefault(); mostrarLoading();
    const fbID = document.getElementById('editIndexDarf').value;
    const dados = { codigo: escapeHTML(document.getElementById('codigoDarf').value), natRendimento: escapeHTML(document.getElementById('natRendimentoDarf').value), sitSiafi: escapeHTML(document.getElementById('sitSiafiDarf').value), aplicacao: escapeHTML(document.getElementById('aplicacaoDarf').value), ir: escapeHTML(document.getElementById('irDarf').value), csll: escapeHTML(document.getElementById('csllDarf').value), cofins: escapeHTML(document.getElementById('cofinsDarf').value), pis: escapeHTML(document.getElementById('pisDarf').value), total: escapeHTML(document.getElementById('totalDarf').value) };
    try {
        if (fbID == -1 || fbID === "") { await db.collection('darf').add(dados); } 
        else { await db.collection('darf').doc(fbID).update(dados); }
        voltarParaListaDarf();
    } catch(err) { alert("Erro ao guardar DARF."); }
    finally { esconderLoading(); }
});

// ==========================================
// MÓDULO: ENTRADA DE TÍTULOS (FORM-3)
// ==========================================
document.getElementById('buscaTabelaTitulos').addEventListener('input', debounce(() => {
    termoBuscaTitulos = document.getElementById('buscaTabelaTitulos').value.toLowerCase();
    paginaAtualTitulos = 1; atualizarTabelaTitulos();
}));

function abrirFormularioTitulo() {
    document.getElementById('formTitulo').reset();
    document.getElementById('editIndexTitulo').value = -1;
    document.getElementById('idProc').value = "";
    document.getElementById('dadosContratoSelecionado').style.display = 'none';
    empenhosDaNotaAtual = [];
    desenharMiniTabelaEmpenhos();
    document.getElementById('tela-lista-titulos').style.display = 'none';
    document.getElementById('tela-formulario-titulos').style.display = 'block';
}

function voltarParaListaTitulos() {
    document.getElementById('tela-formulario-titulos').style.display = 'none';
    document.getElementById('tela-lista-titulos').style.display = 'block';
}

function atualizarTabelaTitulos() {
    const tbody = document.getElementById('tbody-titulos');
    tbody.innerHTML = '';
    let baseFiltrada = baseTitulos.map((t, index) => ({ ...t, indexOriginal: index }));
    
    if (termoBuscaTitulos.trim() !== "") { 
        baseFiltrada = baseFiltrada.filter(t => 
            (t.idProc && t.idProc.toLowerCase().includes(termoBuscaTitulos)) || 
            (t.fornecedor && t.fornecedor.toLowerCase().includes(termoBuscaTitulos)) ||
            (t.numTC && t.numTC.toLowerCase().includes(termoBuscaTitulos))
        ); 
    }
    baseFiltrada = aplicarOrdenacao(baseFiltrada, 'titulos');

    const inicio = (paginaAtualTitulos - 1) * itensPorPaginaTitulos; const fim = inicio + parseInt(itensPorPaginaTitulos);
    let itensExibidos = baseFiltrada.slice(inicio, fim);
    
    if (itensExibidos.length === 0) { tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Nenhum título encontrado.</td></tr>'; return;}

    itensExibidos.forEach(t => {
        const tr = document.createElement('tr');
        const acoesHTML = gerarBotoesAcao(t.id, 'titulo');
        tr.innerHTML = `
            <td><strong>${escapeHTML(t.idProc)}</strong></td>
            <td>${escapeHTML(t.numTC) || '-'}</td>
            <td>${escapeHTML(t.fornecedor) || '-'}</td>
            <td>R$ ${escapeHTML(t.valorNotaFiscal) || '0.00'}</td>
            <td>${acoesHTML}</td>`;
        tbody.appendChild(tr);
    });
}

// EVENT DELEGATION: Titulos
document.getElementById('tbody-titulos').addEventListener('click', function(e) {
    const btnEditar = e.target.closest('.btn-editar-titulo');
    const btnApagar = e.target.closest('.btn-apagar-titulo');
    if (btnEditar) editarTitulo(btnEditar.getAttribute('data-id'));
    if (btnApagar) apagarTitulo(btnApagar.getAttribute('data-id'));
});

function mudarTamanhoPagina() { itensPorPaginaTitulos = document.getElementById('itensPorPagina').value; paginaAtualTitulos = 1; atualizarTabelaTitulos(); }

// Autocomplete CONTRATO no FORM-3
const inputBuscaContratoT = document.getElementById('buscaContratoT');
const listaContratosT = document.getElementById('listaResultadosContratoT');

inputBuscaContratoT.addEventListener('input', debounce(function() {
    const texto = this.value.toLowerCase();
    listaContratosT.innerHTML = '';
    if (texto.length >= 3) {
        const resultados = baseContratos.filter(c => (c.fornecedor && c.fornecedor.toLowerCase().includes(texto)) || (c.numContrato && c.numContrato.toLowerCase().includes(texto)));
        resultados.forEach(c => {
            const li = document.createElement('li');
            li.innerHTML = `<strong>${escapeHTML(c.numContrato)}</strong> - ${escapeHTML(c.fornecedor)}`;
            li.onclick = () => {
                document.getElementById('dadosContratoSelecionado').style.display = 'block';
                document.getElementById('readFornecedor').value = c.fornecedor;
                document.getElementById('readInstrumento').value = c.numContrato;
                listaContratosT.innerHTML = ''; inputBuscaContratoT.value = '';
            };
            listaContratosT.appendChild(li);
        });
    }
}));

// Autocomplete EMPENHO no FORM-3
const inputBuscaEmpenhoT = document.getElementById('buscaEmpenhoT');
const listaEmpenhosT = document.getElementById('listaResultadosEmpenhoT');

inputBuscaEmpenhoT.addEventListener('input', debounce(function() {
    const texto = this.value.toUpperCase();
    listaEmpenhosT.innerHTML = '';
    if (texto.length >= 4) {
        const resultados = baseEmpenhos.filter(e => e.numEmpenho.includes(texto));
        resultados.forEach(e => {
            const li = document.createElement('li');
            li.innerHTML = `<strong>${escapeHTML(e.numEmpenho)}</strong> (FR: ${escapeHTML(e.fr)})`;
            li.onclick = () => {
                empenhoTemporarioSelecionado = e;
                document.getElementById('detalhesVinculoEmpenho').style.display = 'block';
                document.getElementById('empenhoSelecionadoTexto').textContent = `NE Selecionada: ${e.numEmpenho}`;
                listaEmpenhosT.innerHTML = ''; inputBuscaEmpenhoT.value = '';
            };
            listaEmpenhosT.appendChild(li);
        });
    }
}));

// Delegação de eventos para apagar itens da Mini Tabela
document.querySelector('#tabelaEmpenhosDaNota tbody').addEventListener('click', function(e) {
    const btnRm = e.target.closest('.btn-rm-empenhonota');
    if(btnRm) {
        const index = btnRm.getAttribute('data-index');
        empenhosDaNotaAtual.splice(index, 1);
        desenharMiniTabelaEmpenhos();
    }
});

function adicionarEmpenhoNaNota() {
    const valor = document.getElementById('vinculoValor').value;
    if(!valor || !empenhoTemporarioSelecionado) return alert("Defina o valor a vincular!");
    
    empenhosDaNotaAtual.push({
        numEmpenho: escapeHTML(empenhoTemporarioSelecionado.numEmpenho),
        valorVinculado: escapeHTML(valor),
        lf: escapeHTML(document.getElementById('vinculoLF').value),
        pf: escapeHTML(document.getElementById('vinculoPF').value)
    });
    desenharMiniTabelaEmpenhos();
    document.getElementById('detalhesVinculoEmpenho').style.display = 'none';
}

function desenharMiniTabelaEmpenhos() {
    const tbody = document.querySelector('#tabelaEmpenhosDaNota tbody');
    tbody.innerHTML = '';
    empenhosDaNotaAtual.forEach((v, i) => {
        tbody.innerHTML += `<tr>
            <td>${escapeHTML(v.numEmpenho)}</td>
            <td>R$ ${escapeHTML(v.valorVinculado)}</td>
            <td>${escapeHTML(v.lf)}</td>
            <td>${escapeHTML(v.pf)}</td>
            <td><button type="button" class="btn-icon btn-rm-empenhonota" data-index="${i}">🗑️</button></td>
        </tr>`;
    });
}

function gerarNovoIDProc() {
    if (baseTitulos.length === 0) return "PROC-001";
    const numeros = baseTitulos.map(t => parseInt(t.idProc.split('-')[1]) || 0);
    const max = Math.max(...numeros);
    return "PROC-" + String(max + 1).padStart(3, '0');
}

document.getElementById('formTitulo').addEventListener('submit', async function(e) {
    e.preventDefault();
    if (empenhosDaNotaAtual.length === 0) return alert("Vincule ao menos um empenho!");

    mostrarLoading();
    const fbID = document.getElementById('editIndexTitulo').value;
    const idProcOriginal = document.getElementById('idProc').value;
    
    const dados = {
        idProc: escapeHTML(idProcOriginal || gerarNovoIDProc()),
        dataExefin: escapeHTML(document.getElementById('dataExefin').value),
        numTC: escapeHTML(document.getElementById('numTC').value),
        notaFiscal: escapeHTML(document.getElementById('notaFiscal').value),
        fornecedor: escapeHTML(document.getElementById('readFornecedor').value),
        instrumento: escapeHTML(document.getElementById('readInstrumento').value),
        valorNotaFiscal: parseFloat(document.getElementById('valorNotaFiscal').value) || 0,
        dataEmissao: escapeHTML(document.getElementById('dataEmissao').value),
        dataAteste: escapeHTML(document.getElementById('dataAteste').value),
        empenhosVinculados: empenhosDaNotaAtual,
        criado_por: escapeHTML(usuarioLogadoEmail)
    };

    try {
        if (fbID == -1 || fbID === "") {
            dados.criado_em = firebase.firestore.FieldValue.serverTimestamp();
            await db.collection('titulos').add(dados);
        } else {
            dados.editado_em = firebase.firestore.FieldValue.serverTimestamp();
            await db.collection('titulos').doc(fbID).update(dados);
        }
        alert(`Processamento salvo com sucesso!`);
        voltarParaListaTitulos();
    } catch(err) {
        alert("Erro ao gravar Processamento. Acesso Negado.");
    } finally {
        esconderLoading();
    }
});

function editarTitulo(id) {
    const t = baseTitulos.find(item => item.id === id);
    if(t) {
        abrirFormularioTitulo(); document.getElementById('editIndexTitulo').value = t.id;
        document.getElementById('idProc').value = t.idProc || '';
        document.getElementById('badgeStatusProc').textContent = t.idProc;
        document.getElementById('badgeStatusProc').className = "badge-status salvo";
        
        document.getElementById('dataExefin').value = t.dataExefin || '';
        document.getElementById('numTC').value = t.numTC || '';
        document.getElementById('notaFiscal').value = t.notaFiscal || '';
        document.getElementById('valorNotaFiscal').value = t.valorNotaFiscal || '';
        document.getElementById('dataEmissao').value = t.dataEmissao || '';
        document.getElementById('dataAteste').value = t.dataAteste || '';

        if(t.fornecedor) {
            document.getElementById('dadosContratoSelecionado').style.display = 'block';
            document.getElementById('readFornecedor').value = t.fornecedor;
            document.getElementById('readInstrumento').value = t.instrumento || '';
        }
        
        empenhosDaNotaAtual = t.empenhosVinculados ? JSON.parse(JSON.stringify(t.empenhosVinculados)) : [];
        desenharMiniTabelaEmpenhos();
    }
}

async function apagarTitulo(id) { 
    if (confirm("Apagar Título permanentemente?")) { 
        mostrarLoading();
        try { await db.collection('titulos').doc(id).delete(); } 
        catch(err) { alert("Acesso Negado."); } 
        finally { esconderLoading(); } 
    } 
}

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