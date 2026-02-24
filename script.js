// ==========================================
// 0. CONFIGURAÇÃO FIREBASE E CONEXÃO
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

// Variável global para sabermos quem está logado
let usuarioLogadoEmail = "";

// ==========================================
// 1. SEGURANÇA E LOGIN (O Porteiro)
// ==========================================
auth.onAuthStateChanged((user) => {
    if (user) {
        // Usuário válido! Liberar acesso.
        usuarioLogadoEmail = user.email;
        document.getElementById('corpo-sistema').style.display = 'block';
        document.getElementById('nomeUsuarioLogado').innerHTML = `👤 ${usuarioLogadoEmail}`;
        
        // Iniciar o sistema
        mostrarSecao('secao-titulos'); // Mostra a tela inicial
        carregarEmpenhos();            // Puxa os dados do banco
    } else {
        // Não está logado, volta para a tela de login
        window.location.href = "index.html";
    }
});

function fazerLogout() {
    auth.signOut().then(() => {
        window.location.href = "index.html";
    });
}

// ==========================================
// 2. NAVEGAÇÃO DO MENU LATERAL
// ==========================================
function mostrarSecao(idSecao) {
    // Esconde todas as secções
    document.querySelectorAll('.secao').forEach(el => el.style.display = 'none');
    // Mostra apenas a que foi clicada
    document.getElementById(idSecao).style.display = 'block';
}

// ==========================================
// 3. SALVAR DADOS NO FIREBASE (EMPENHOS)
// ==========================================
document.getElementById('form-empenho').addEventListener('submit', function(e) {
    e.preventDefault(); // Impede a página de recarregar
    
    // Captura os dados digitados
    const processo = document.getElementById('empenho-processo').value;
    const data = document.getElementById('empenho-data').value;
    const fornecedor = document.getElementById('empenho-fornecedor').value;
    const valor = parseFloat(document.getElementById('empenho-valor').value);
    const obs = document.getElementById('empenho-obs').value;

    // Salva no Banco de Dados (Firestore) COM AUDITORIA!
    db.collection('empenhos').add({
        processo: processo,
        data: data,
        fornecedor: fornecedor,
        valor: valor,
        obs: obs,
        status: "Ativo",
        // Campos de Auditoria
        criado_por: usuarioLogadoEmail,
        criado_em: firebase.firestore.FieldValue.serverTimestamp(),
        editado_por: "",
        editado_em: null
    }).then(() => {
        alert("Empenho salvo com sucesso no banco de dados!");
        document.getElementById('form-empenho').reset(); // Limpa o formulário
    }).catch((error) => {
        console.error("Erro ao salvar: ", error);
        alert("Erro ao salvar o empenho.");
    });
});

// ==========================================
// 4. LER E EXIBIR DADOS (EMPENHOS)
// ==========================================
function carregarEmpenhos() {
    // onSnapshot: Fica "escutando" o banco em tempo real
    db.collection('empenhos').orderBy('criado_em', 'desc').onSnapshot((snapshot) => {
        const tabela = document.getElementById('tabela-empenhos');
        tabela.innerHTML = ''; // Limpa a tabela antes de preencher
        
        if (snapshot.empty) {
            tabela.innerHTML = '<tr><td colspan="6" style="text-align: center;">Nenhum empenho cadastrado.</td></tr>';
            return;
        }

        snapshot.forEach((doc) => {
            const empenho = doc.data();
            
            // Formatar valor para R$
            const valorFormatado = empenho.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
            
            // Formatar Data (de AAAA-MM-DD para DD/MM/AAAA)
            let dataFormatada = empenho.data;
            if(dataFormatada && dataFormatada.includes('-')) {
                const partes = dataFormatada.split('-');
                dataFormatada = `${partes[2]}/${partes[1]}/${partes[0]}`;
            }

            // Cria a linha na tabela HTML
            tabela.innerHTML += `
                <tr>
                    <td>${empenho.processo}</td>
                    <td>${dataFormatada}</td>
                    <td>${empenho.fornecedor}</td>
                    <td>${valorFormatado}</td>
                    <td><span class="badge-status salvo">${empenho.status}</span></td>
                    <td>
                        <button class="btn-icon" title="Excluir" onclick="deletarEmpenho('${doc.id}')">🗑️</button>
                        <br>
                        <small style="font-size: 10px; color: #888;">Por: ${empenho.criado_por.split('@')[0]}</small>
                    </td>
                </tr>
            `;
        });
    });
}

// Função de exclusão rápida
function deletarEmpenho(id) {
    if(confirm("Tem certeza que deseja excluir este empenho permanentemente?")) {
        db.collection('empenhos').doc(id).delete();
    }
}
