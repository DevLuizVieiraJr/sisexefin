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

// Bases de dados locais sincronizadas com a nuvem
let baseEmpenhos = [];
let baseContratos = [];
let baseDarfs = [];
let baseTitulos = [];

// ==========================================
// 2. CONTROLE DE ACESSO (O PORTEIRO)
// ==========================================
auth.onAuthStateChanged((user) => {
    if (user) {
        usuarioLogadoEmail = user.email;
        document.getElementById('corpo-sistema').style.display = 'block';
        document.getElementById('nomeUsuarioLogado').innerHTML = `👤 ${usuarioLogadoEmail}`;
        
        // Inicia escuta de todas as coleções em tempo real
        escutarColecao('empenhos', (dados) => { baseEmpenhos = dados; renderizarEmpenhos(); });
        escutarColecao('contratos', (dados) => { baseContratos = dados; renderizarContratos(); });
        
        mostrarSecao('secao-empenhos', document.querySelector("button[onclick*='secao-empenhos']"));
    } else {
        window.location.href = "index.html";
    }
});

function fazerLogout() { auth.signOut(); }

// ==========================================
// 3. MOTOR DE SINCRONIZAÇÃO (FIREBASE)
// ==========================================
function escutarColecao(colecao, callback) {
    db.collection(colecao).orderBy('criado_em', 'desc').onSnapshot((snapshot) => {
        const dados = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        callback(dados);
    });
}

// ==========================================
// 4. MÓDULO EMPENHOS (CRUD COMPLETO)
// ==========================================

function abrirFormularioEmpenho(isEdit) {
    document.getElementById('tela-lista-empenhos').style.display = 'none';
    document.getElementById('tela-formulario-empenhos').style.display = 'block';
    document.getElementById('tituloFormEmpenhos').innerHTML = isEdit ? "✏️ Editando Empenho" : "📄 Cadastro de Empenho";
    if(!isEdit) {
        document.getElementById('formEmpenho').reset();
        document.getElementById('editIndexEmpenho').value = "-1";
    }
}

function voltarParaListaEmpenhos() {
    document.getElementById('tela-formulario-empenhos').style.display = 'none';
    document.getElementById('tela-lista-empenhos').style.display = 'block';
}

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
            alert("Empenho Cadastrado!");
            voltarParaListaEmpenhos();
        });
    } else {
        db.collection('empenhos').doc(idEdicao).update(dados).then(() => {
            alert("Empenho Atualizado!");
            voltarParaListaEmpenhos();
        });
    }
});

function renderizarEmpenhos() {
    const tbody = document.getElementById('tbody-empenhos');
    tbody.innerHTML = '';
    baseEmpenhos.forEach(emp => {
        tbody.innerHTML += `
            <tr>
                <td>${emp.numEmpenho}</td>
                <td>${emp.ndEmpenho}</td>
                <td>${emp.ptresEmpenho}</td>
                <td>${emp.frEmpenho}</td>
                <td>${emp.contratoEmpenho}</td>
                <td>${emp.valorEmpenho.toLocaleString('pt-BR', {style:'currency', currency:'BRL'})}</td>
                <td>
                    <button onclick="editarEmpenho('${emp.id}')" class="btn-icon">✏️</button>
                    <button onclick="deletarItem('empenhos', '${emp.id}')" class="btn-icon" style="color:red;">🗑️</button>
                </td>
            </tr>
        `;
    });
}

function editarEmpenho(id) {
    const emp = baseEmpenhos.find(e => e.id === id);
    if(emp) {
        abrirFormularioEmpenho(true);
        document.getElementById('editIndexEmpenho').value = id;
        document.getElementById('numEmpenho').value = emp.numEmpenho;
        document.getElementById('dataEmpenho').value = emp.dataEmpenho;
        document.getElementById('valorEmpenho').value = emp.valorEmpenho;
        document.getElementById('ndEmpenho').value = emp.ndEmpenho;
        document.getElementById('subitemEmpenho').value = emp.subitemEmpenho;
        document.getElementById('ptresEmpenho').value = emp.ptresEmpenho;
        document.getElementById('frEmpenho').value = emp.frEmpenho;
        document.getElementById('docOrigEmpenho').value = emp.docOrigEmpenho;
        document.getElementById('oiEmpenho').value = emp.oiEmpenho;
        document.getElementById('contratoEmpenho').value = emp.contratoEmpenho;
        document.getElementById('capEmpenho').value = emp.capEmpenho;
        document.getElementById('altcredEmpenho').value = emp.altcredEmpenho;
        document.getElementById('meioEmpenho').value = emp.meioEmpenho;
    }
}

// ==========================================
// 5. FUNÇÕES GENÉRICAS (BUSCA, DELETE, NAVEGAÇÃO)
// ==========================================

function deletarItem(colecao, id) {
    if(confirm("Deseja excluir permanentemente do Banco de Dados?")) {
        db.collection(colecao).doc(id).delete();
    }
}

function mostrarSecao(idSecao, botao) {
    document.querySelectorAll('.secao').forEach(s => s.style.display = 'none');
    document.getElementById(idSecao).style.display = 'block';
    document.querySelectorAll('.menu-btn').forEach(b => b.classList.remove('ativo'));
    if(botao) botao.classList.add('ativo');
}

function fazerLogout() { auth.signOut(); }
