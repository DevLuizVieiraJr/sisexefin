// ==========================================
// 1. CONEXÃO FIREBASE E SEGURANÇA
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

// O Porteiro
auth.onAuthStateChanged((user) => {
    if (user) {
        usuarioLogadoEmail = user.email;
        document.getElementById('corpo-sistema').style.display = 'block';
        document.getElementById('nomeUsuarioLogado').innerHTML = `👤 ${usuarioLogadoEmail}`;
        mostrarSecao('secao-empenhos'); // Inicia na tela de Empenhos
        carregarEmpenhosFirebase();     // Puxa os dados da nuvem
    } else {
        window.location.href = "index.html";
    }
});

function fazerLogout() { auth.signOut(); }

// ==========================================
// 2. NAVEGAÇÃO DE TELAS
// ==========================================
function mostrarSecao(idSecao) {
    document.querySelectorAll('.secao').forEach(el => el.style.display = 'none');
    document.getElementById(idSecao).style.display = 'block';
}

function abrirFormularioEmpenho() {
    document.getElementById('tela-lista-empenhos').style.display = 'none';
    document.getElementById('tela-formulario-empenhos').style.display = 'block';
    document.getElementById('formEmpenho').reset();
    document.getElementById('editIndexEmpenho').value = "-1"; // Modo Novo
}

function voltarParaListaEmpenhos() {
    document.getElementById('tela-formulario-empenhos').style.display = 'none';
    document.getElementById('tela-lista-empenhos').style.display = 'block';
}

// ==========================================
// 3. CRUD EMPENHOS (COM FIREBASE)
// ==========================================
document.getElementById('formEmpenho').addEventListener('submit', function(e) {
    e.preventDefault();
    
    const idEdicao = document.getElementById('editIndexEmpenho').value;
    
    // Captura TODOS os teus campos detalhados
    const dadosEmpenho = {
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
        // NOVO REGISTO: Adiciona campos de auditoria
        dadosEmpenho.criado_por = usuarioLogadoEmail;
        dadosEmpenho.criado_em = firebase.firestore.FieldValue.serverTimestamp();
        
        db.collection('empenhos').add(dadosEmpenho).then(() => {
            alert("Empenho salvo com sucesso no Firebase!");
            voltarParaListaEmpenhos();
        });
    } else {
        // EDIÇÃO: Atualiza apenas os dados e auditoria de edição
        dadosEmpenho.editado_por = usuarioLogadoEmail;
        dadosEmpenho.editado_em = firebase.firestore.FieldValue.serverTimestamp();
        
        db.collection('empenhos').doc(idEdicao).update(dadosEmpenho).then(() => {
            alert("Empenho atualizado com sucesso!");
            voltarParaListaEmpenhos();
        });
    }
});

function carregarEmpenhosFirebase() {
    // Escuta o banco em tempo real
    db.collection('empenhos').orderBy('criado_em', 'desc').onSnapshot((snapshot) => {
        const tbody = document.getElementById('tbody-empenhos'); // Alterei o id no HTML para tbody-empenhos
        tbody.innerHTML = '';
        
        snapshot.forEach((doc) => {
            const emp = doc.data();
            const id = doc.id;
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
                        <button onclick="editarEmpenho('${id}')" class="btn-icon">✏️</button>
                        <button onclick="deletarEmpenho('${id}')" class="btn-icon" style="color:red;">🗑️</button>
                    </td>
                </tr>
            `;
        });
    });
}

function editarEmpenho(id) {
    db.collection('empenhos').doc(id).get().then((doc) => {
        if (doc.exists) {
            const emp = doc.data();
            abrirFormularioEmpenho();
            
            // Preenche o formulário
            document.getElementById('editIndexEmpenho').value = id; // Guarda o ID do Firebase
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
    });
}

function deletarEmpenho(id) {
    if(confirm("Tem certeza que deseja excluir este empenho do banco de dados?")) {
        db.collection('empenhos').doc(id).delete();
    }
}