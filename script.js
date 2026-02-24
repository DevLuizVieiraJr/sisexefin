// ==========================================
// 0. CONEXÃO E SEGURANÇA (FIREBASE)
// ==========================================
// ⚠️ ATENÇÃO: COLA AQUI AS TUAS CHAVES REAIS!
const firebaseConfig = {
    apiKey: "COLA_AQUI_A_TUA_CHAVE",
    authDomain: "sisexefin.firebaseapp.com",
    projectId: "sisexefin",
    storageBucket: "sisexefin.appspot.com",
    messagingSenderId: "123456789",
    appId: "1:123456789:web:abcdefg"
};

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
        // Hacker detetado (ou não logado)! Volta para o Login!
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
// DAQUI PARA BAIXO CONTINUA O TEU CÓDIGO NORMAL DE TABELAS E SALVAR!
// let baseEmpenhos = [];
// ...