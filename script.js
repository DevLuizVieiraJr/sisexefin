// ==========================================
// 1. CONFIGURAÇÃO E CONEXÃO FIREBASE
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
let baseEmpenhos = []; 

// ==========================================
// 2. CONTROLE DE ACESSO (O PORTEIRO)
// ==========================================
auth.onAuthStateChanged((user) => {
    if (user) {
        usuarioLogadoEmail = user.email;
        document.getElementById('corpo-sistema').style.display = 'block';
        document.getElementById('nomeUsuarioLogado').innerHTML = `👤 ${usuarioLogadoEmail}`;
        
        // Ativa o menu inicial
        const btnInicial = document.querySelector("button[onclick*='secao-empenhos']");
        mostrarSecao('secao-empenhos', btnInicial);
        
        // Inicia a escuta do Banco de Dados
        escutarEmpenhos();
    } else {
        window.location.href = "index.html";
    }
});

function fazerLogout() {
    auth.signOut().then(() => { window.location.href = "index.html"; });
}

// ==========================================
// 3. NAVEGAÇÃO E INTERFACE
// ==========================================
function mostrarSecao(idSecao, botaoClicado) {
    document.querySelectorAll('.secao').forEach(el => el.style.display = 'none');
    const secao = document.getElementById(idSecao);
    if(secao) secao.style.display = 'block';

    document.querySelectorAll('.menu-btn').forEach(btn => btn.classList.remove('ativo'));
    if(botaoClicado) botaoClicado.classList.add('ativo');
}

// ==========================================
// 4. MÓDULO EMPENHOS: LÓGICA DE BANCO DE DADOS
// ==========================================

// ESCUTAR (READ) - Tempo Real
function escutarEmpenhos() {
    db.collection('empenhos').orderBy('criado_em', 'desc').onSnapshot((snapshot) => {
        baseEmpenhos = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
        renderizarTabelaEmpenhos();
    }, (error) => {
        console.error("Erro ao ler empenhos:", error);
    });
}

// SALVAR (CREATE / UPDATE)
document.getElementById('formEmpenho').addEventListener('submit', function(e) {
    e.preventDefault();
    const idEdicao = document.getElementById('editIndexEmpenho').value;

    const dados = {
        numero: document.getElementById('numEmpenho').value,
        data: document.getElementById('dataEmpenho').value,
        valor: parseFloat(document.getElementById('valorEmpenho').value) || 0,
        nd: document.getElementById('ndEmpenho').value,
        subitem: document.getElementById('subitemEmpenho').value,
        ptres: document.getElementById('ptresEmpenho').value,
        fr: document.getElementById('frEmpenho').value,
        docOrigem: document.getElementById('docOrigEmpenho').value,
        oi: document.getElementById('oiEmpenho').value,
        contrato: document.getElementById('contratoEmpenho').value,
        cap: document.getElementById('capEmpenho').value,
        altcred: document.getElementById('altcredEmpenho').value,
        meio: document.getElementById('meioEmpenho').value
    };

    if (idEdicao === "-1") {
        // Novo Registro + Auditoria
        dados.criado_por = usuarioLogadoEmail;
        dados.criado_em = firebase.firestore.FieldValue.serverTimestamp();
        
        db.collection('empenhos').add(dados).then(() => {
            alert("Empenho cadastrado com sucesso!");
            voltarParaListaEmpenhos();
        });
    } else {
        // Edição + Auditoria
        dados.editado_por = usuarioLogadoEmail;
        dados.editado_em = firebase.firestore.FieldValue.serverTimestamp();
        
        db.collection('empenhos').doc(idEdicao).update(dados).then(() => {
            alert("Empenho atualizado!");
            voltarParaListaEmpenhos();
        });
    }
});

// EXCLUIR (DELETE)
function deletarEmpenho(id) {
    if(confirm("Deseja excluir este empenho permanentemente?")) {
        db.collection('empenhos').doc(id).delete().then(() => {
            console.log("Removido do Firebase");
        });
    }
}

// RENDERIZAÇÃO DA TABELA
function renderizarTabelaEmpenhos() {
    const tbody = document.getElementById('tbody-empenhos');
    tbody.innerHTML = '';

    if(baseEmpenhos.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align: center;">Nenhum empenho encontrado.</td></tr>';
        return;
    }

    baseEmpenhos.forEach(emp => {
        const valorFormatado = emp.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        tbody.innerHTML += `
            <tr>
                <td>${emp.numero}</td>
                <td>${emp.nd}</td>
                <td>${emp.ptres}</td>
                <td>${emp.fr}</td>
                <td>${emp.contrato}</td>
                <td>${valorFormatado}</td>
                <td>
                    <button onclick="editarEmpenho('${emp.id}')" class="btn-icon">✏️</button>
                    <button onclick="deletarEmpenho('${emp.id}')" class="btn-icon" style="color:red;">🗑️</button>
                </td>
            </tr>
        `;
    });
}

// AUXILIARES DE FORMULÁRIO
function abrirFormularioEmpenho(isEdit = false) {
    document.getElementById('tela-lista-empenhos').style.display = 'none';
    document.getElementById('tela-formulario-empenhos').style.display = 'block';
    const titulo = document.getElementById('tituloFormEmpenhos');
    
    if (isEdit) {
        titulo.innerHTML = "✏️ Editando Minuta de Empenho";
    } else {
        titulo.innerHTML = "📄 Cadastro de Minuta de Empenho";
        document.getElementById('formEmpenho').reset();
        document.getElementById('editIndexEmpenho').value = "-1";
    }
}

function voltarParaListaEmpenhos() {
    document.getElementById('tela-formulario-empenhos').style.display = 'none';
    document.getElementById('tela-lista-empenhos').style.display = 'block';
}

function editarEmpenho(id) {
    const emp = baseEmpenhos.find(e => e.id === id);
    if(emp) {
        abrirFormularioEmpenho(true);
        document.getElementById('editIndexEmpenho').value = id;
        document.getElementById('numEmpenho').value = emp.numero || '';
        document.getElementById('dataEmpenho').value = emp.data || '';
        document.getElementById('valorEmpenho').value = emp.valor || '';
        document.getElementById('ndEmpenho').value = emp.nd || '';
        document.getElementById('subitemEmpenho').value = emp.subitem || '';
        document.getElementById('ptresEmpenho').value = emp.ptres || '';
        document.getElementById('frEmpenho').value = emp.fr || '';
        document.getElementById('docOrigEmpenho').value = emp.docOrigem || '';
        document.getElementById('oiEmpenho').value = emp.oi || '';
        document.getElementById('contratoEmpenho').value = emp.contrato || '';
        document.getElementById('capEmpenho').value = emp.cap || '';
        document.getElementById('altcredEmpenho').value = emp.altcred || '';
        document.getElementById('meioEmpenho').value = emp.meio || '';
    }
}