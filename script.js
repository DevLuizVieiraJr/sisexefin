// ==========================================
// 0. CONEXÃO E SEGURANÇA (FIREBASE)
// ==========================================
const firebaseConfig = {
    apiKey: "AIzaSyDXHpJFnVUR7YCh-3rXvx4yX6zo3a-mR7A",
    authDomain: "sisexefin.firebaseapp.com",
    projectId: "sisexefin",
    storageBucket: "sisexefin.firebasestorage.app",
    messagingSenderId: "476004653478",
    appId: "1:476004653478:web:45aecf0d547f57eee8d767"
};

// Inicializa o Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();

// VERIFICAÇÃO DE SEGURANÇA IMEDIATA (O Porteiro)
auth.onAuthStateChanged((user) => {
    if (user) {
        // Tudo certo! Mostra o sistema e atualiza o nome
        document.getElementById('corpo-sistema').style.display = 'block';
        document.getElementById('nomeUsuarioLogado').innerHTML = `👤 ${user.email}`;
    } else {
        // Não logado! Volta para o Login!
        window.location.href = "index.html";
    }
});

// Ação do Botão Sair
function fazerLogout() {
    auth.signOut().then(() => {
        window.location.href = "index.html";
    });
}

// ==========================================
// 1. VARIÁVEIS DE ESTADO (O RESTO DO TEU CÓDIGO CONTINUA AQUI PARA BAIXO)
// ==========================================
let baseEmpenhos = [];
// ... código das tabelas, Firestore onSnapshot, etc.
