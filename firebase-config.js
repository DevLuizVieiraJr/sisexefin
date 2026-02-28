// ==========================================
// CONFIGURAÇÃO CENTRALIZADA DO FIREBASE
// ==========================================
// SEGURANÇA: Restrinja a API key no Google Cloud Console (APIs & Services > Credentials)
// para permitir apenas os domínios/aplicações autorizados do SisExeFin.
const firebaseConfig = {
    apiKey: "AIzaSyDXHpJFnVUR7YCh-3rXvx4yX6zo3a-mR7A",
    authDomain: "sisexefin.firebaseapp.com",
    projectId: "sisexefin",
    appId: "1:476004653478:web:45aecf0d547f57eee8d767"
};

// Verifica se o Firebase já foi inicializado para evitar erros
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}

// Exporta as instâncias globalmente para o padrão Compat
const db = firebase.firestore();
const auth = firebase.auth();