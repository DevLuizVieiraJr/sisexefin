// ==========================================
// 1. CONFIGURAÇÃO E AUTENTICAÇÃO FIREBASE
// ==========================================
const firebaseConfig = {
    apiKey: "AIzaSyDXHpJFnVUR7YCh-3rXvx4yX6zo3a-mR7A",
    authDomain: "sisexefin.firebaseapp.com",
    projectId: "sisexefin",
    storageBucket: "sisexefin.firebasestorage.app",
    messagingSenderId: "476004653478",
    appId: "1:476004653478:web:45aecf0d547f57eee8d767"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();

let usuarioLogadoEmail = "";

// Variáveis para armazenar dados da nuvem
let baseEmpenhos = [];
let baseDarfs = [];
let baseContratos = [];

// Variáveis de Paginação (Mantendo sua estrutura)
let paginaAtualEmpenhos = 1;
let itensPorPaginaEmpenhos = 10;
let termoBuscaEmpenhos = "";

// ==========================================
// 2. CONTROLE DE ACESSO
// ==========================================
auth.onAuthStateChanged((user) => {
    if (user) {
        usuarioLogadoEmail = user.email;
        document.getElementById('corpo-sistema').style.display = 'block';
        document.getElementById('nomeUsuarioLogado').innerHTML = `👤 ${usuarioLogadoEmail}`;
        
        // Inicia escutas do Firebase
        escutarColecoes();
        
        mostrarSecao('secao-empenhos');
    } else {
        window.location.href = "index.html"; // Volta pro login se não autorizado
    }
});

function fazerLogout() { auth.signOut(); }

function mostrarSecao(idSecao) {
    document.querySelectorAll('.secao').forEach(s => s.style.display = 'none');
    document.getElementById(idSecao).style.display = 'block';
}

// ==========================================
// 3. SINCRONIZAÇÃO COM O BANCO DE DADOS
// ==========================================
function escutarColecoes() {
    db.collection('empenhos').orderBy('criado_em', 'desc').onSnapshot((snapshot) => {
        baseEmpenhos = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderizarTabelaEmpenhos(); // Atualiza a tabela respeitando paginação
    });
}

// ==========================================
// 4. MÓDULO EMPENHOS (COM SUA PAGINAÇÃO)
// ==========================================
function abrirFormularioEmpenho(isEdit = false) {
    document.getElementById('tela-lista-empenhos').style.display = 'none';
    document.getElementById('tela-formulario-empenhos').style.display = 'block';
    
    if(!isEdit) {
        document.getElementById('formEmpenho').reset();
        document.getElementById('editIndexEmpenho').value = "-1";
    }
}

function voltarParaListaEmpenhos() {
    document.getElementById('tela-formulario-empenhos').style.display = 'none';
    document.getElementById('tela-lista-empenhos').style.display = 'block';
}

// SALVAR NO FIREBASE
document.getElementById('formEmpenho').addEventListener('submit', function(e) {
    e.preventDefault();
    const idEdicao = document.getElementById('editIndexEmpenho').value;
    
    const dados = {
        numEmpenho: document.getElementById('numEmpenho').value,
        dataEmpenho: document.getElementById('dataEmpenho').value,
        valorEmpenho: parseFloat(document.getElementById('valorEmpenho').value) || 0,
        ndEmpenho: document.getElementById('ndEmpenho').value,
        subitemEmpenho: document.getElementById('subitemEmpenho').value,
        ptresEmpenho: document.getElementById('ptresEmpenho').value,
        frEmpenho: document.getElementById('frEmpenho').value,
        docOrigEmpenho: document.getElementById('docOrigEmpenho').value,
        oiEmpenho: document.getElementById('oiEmpenho').value,
        contratoEmpenho: document.getElementById('contratoEmpenho').value,
        capEmpenho: document.getElementById('capEmpenho').value,
        altcredEmpenho: document.getElementById('altcredEmpenho').value,
        meioEmpenho: document.getElementById('meioEmpenho').value,
        editado_por: usuarioLogadoEmail,
        editado_em: firebase.firestore.FieldValue.serverTimestamp()
    };

    if (idEdicao === "-1") {
        dados.criado_por = usuarioLogadoEmail;
        dados.criado_em = firebase.firestore.FieldValue.serverTimestamp();
        db.collection('empenhos').add(dados).then(() => {
            exibirModalSucesso("Minuta de Empenho salva com sucesso no banco de dados!");
        });
    } else {
        db.collection('empenhos').doc(idEdicao).update(dados).then(() => {
            exibirModalSucesso("Minuta de Empenho atualizada com sucesso!");
        });
    }
});

function editarEmpenho(id) {
    const emp = baseEmpenhos.find(e => e.id === id);
    if(emp) {
        abrirFormularioEmpenho(true);
        document.getElementById('editIndexEmpenho').value = id;
        document.getElementById('numEmpenho').value = emp.numEmpenho || '';
        document.getElementById('dataEmpenho').value = emp.dataEmpenho || '';
        document.getElementById('valorEmpenho').value = emp.valorEmpenho || '';
        document.getElementById('ndEmpenho').value = emp.ndEmpenho || '';
        document.getElementById('subitemEmpenho').value = emp.subitemEmpenho || '';
        document.getElementById('ptresEmpenho').value = emp.ptresEmpenho || '';
        document.getElementById('frEmpenho').value = emp.frEmpenho || '';
        document.getElementById('docOrigEmpenho').value = emp.docOrigEmpenho || '';
        document.getElementById('oiEmpenho').value = emp.oiEmpenho || '';
        document.getElementById('contratoEmpenho').value = emp.contratoEmpenho || '';
        document.getElementById('capEmpenho').value = emp.capEmpenho || '';
        document.getElementById('altcredEmpenho').value = emp.altcredEmpenho || '';
        document.getElementById('meioEmpenho').value = emp.meioEmpenho || '';
    }
}

function deletarEmpenho(id) {
    if(confirm("Deseja realmente excluir este empenho do Firebase?")) {
        db.collection('empenhos').doc(id).delete();
    }
}

// ==========================================
// 5. LÓGICA DE PAGINAÇÃO E FILTRO (Sua lógica original, operando nos dados da nuvem)
// ==========================================
function filtrarTabelaEmpenhos() {
    termoBuscaEmpenhos = document.getElementById('buscaTabelaEmpenhos').value.toLowerCase();
    paginaAtualEmpenhos = 1; // Reseta para a primeira página ao buscar
    renderizarTabelaEmpenhos();
}

function mudarTamanhoPaginaEmpenhos() {
    itensPorPaginaEmpenhos = parseInt(document.getElementById('itensPorPaginaEmpenhos').value);
    paginaAtualEmpenhos = 1;
    renderizarTabelaEmpenhos();
}

function mudarPaginaEmpenhos(direcao) {
    const arrayFiltrado = baseEmpenhos.filter(e => 
        (e.numEmpenho && e.numEmpenho.toLowerCase().includes(termoBuscaEmpenhos)) || 
        (e.contratoEmpenho && e.contratoEmpenho.toLowerCase().includes(termoBuscaEmpenhos))
    );
    const totalPaginas = Math.ceil(arrayFiltrado.length / itensPorPaginaEmpenhos);
    
    paginaAtualEmpenhos += direcao;
    
    if(paginaAtualEmpenhos < 1) paginaAtualEmpenhos = 1;
    if(paginaAtualEmpenhos > totalPaginas && totalPaginas > 0) paginaAtualEmpenhos = totalPaginas;
    
    renderizarTabelaEmpenhos();
}

function renderizarTabelaEmpenhos() {
    const tbody = document.getElementById('tbody-empenhos');
    tbody.innerHTML = '';

    // Aplica o filtro
    const arrayFiltrado = baseEmpenhos.filter(e => 
        (e.numEmpenho && e.numEmpenho.toLowerCase().includes(termoBuscaEmpenhos)) || 
        (e.contratoEmpenho && e.contratoEmpenho.toLowerCase().includes(termoBuscaEmpenhos))
    );

    // Cálculos da Paginação
    const inicio = (paginaAtualEmpenhos - 1) * itensPorPaginaEmpenhos;
    const fim = inicio + itensPorPaginaEmpenhos;
    const itensExibidos = arrayFiltrado.slice(inicio, fim);

    // Atualiza controles Visuais
    const totalPaginas = Math.ceil(arrayFiltrado.length / itensPorPaginaEmpenhos) || 1;
    document.getElementById('infoPaginaEmpenhos').innerText = `Página ${paginaAtualEmpenhos} de ${totalPaginas}`;
    document.getElementById('btnAnteriorEmpenhos').disabled = paginaAtualEmpenhos === 1;
    document.getElementById('btnProximoEmpenhos').disabled = paginaAtualEmpenhos === totalPaginas;

    if(itensExibidos.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align: center;">Nenhum registro encontrado.</td></tr>';
        return;
    }

    // Desenha a tabela com os itens da página atual
    itensExibidos.forEach(emp => {
        const valorFormatado = emp.valorEmpenho.toLocaleString('pt-BR', {style:'currency', currency:'BRL'});
        tbody.innerHTML += `
            <tr>
                <td>${emp.numEmpenho}</td>
                <td>${emp.ndEmpenho}</td>
                <td>${emp.ptresEmpenho}</td>
                <td>${emp.frEmpenho}</td>
                <td>${emp.contratoEmpenho}</td>
                <td>${valorFormatado}</td>
                <td>
                    <button onclick="editarEmpenho('${emp.id}')" class="btn-icon">✏️</button>
                    <button onclick="deletarEmpenho('${emp.id}')" class="btn-icon" style="color:red;">🗑️</button>
                </td>
            </tr>
        `;
    });
}

// ==========================================
// 6. MODAL DE SUCESSO (Seu Modal)
// ==========================================
function exibirModalSucesso(mensagem) {
    document.getElementById('msgSucessoTexto').innerText = mensagem;
    document.getElementById('modalSucessoGeral').style.display = 'flex';
}

function acaoModalSucesso(acao) {
    document.getElementById('modalSucessoGeral').style.display = 'none';
    if(acao === 'fechar') {
        voltarParaListaEmpenhos();
    } else if (acao === 'proximo') {
        voltarParaListaEmpenhos();
    } else if (acao === 'continuar') {
        // Apenas fecha o modal e mantém no formulário para continuar editando
    }
}

// ==========================================
// 7. IMPORTAÇÃO E EXPORTAÇÃO (Rascunho SheetJS)
// ==========================================
function exportarEmpenhos(formato) {
    // Pegamos a baseEmpenhos que veio do Firebase para exportar
    if(baseEmpenhos.length === 0) return alert("Nenhum dado para exportar.");
    
    const ws = XLSX.utils.json_to_sheet(baseEmpenhos);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Empenhos");
    
    if(formato === 'xlsx') {
        XLSX.writeFile(wb, "empenhos_export.xlsx");
    } else {
        XLSX.writeFile(wb, "empenhos_export.csv", { bookType: "csv" });
    }
}
