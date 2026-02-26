import { auth, db } from './firebase-config.js';
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

let permissoesEmCache = null; // Otimização para não sobrecarregar o Firestore

// Busca as permissões do utilizador logado
async function carregarPermissoes() {
    if (permissoesEmCache !== null) return permissoesEmCache;
    
    const user = auth.currentUser;
    if (!user) return [];

    try {
        // 1. Consulta o perfil do utilizador
        const userRef = doc(db, 'usuarios', user.uid);
        const userSnap = await getDoc(userRef);
        if (!userSnap.exists()) return [];

        const perfilID = userSnap.data().perfil;

        // 2. Consulta as permissões atreladas a esse perfil
        const perfilRef = doc(db, 'perfis', perfilID);
        const perfilSnap = await getDoc(perfilRef);
        
        permissoesEmCache = perfilSnap.exists() ? (perfilSnap.data().permissoes || []) : [];
        return permissoesEmCache;
    } catch (error) {
        console.error("Erro ao carregar permissões:", error);
        return [];
    }
}

// A. O "Guarda de Acesso"
export async function checkPermission(permissaoNecessaria) {
    const permissoes = await carregarPermissoes();
    return permissoes.includes(permissaoNecessaria);
}

// B. Manipulação da UI (Remove do DOM, não usa display:none)
export async function renderizarAcessos() {
    const elementos = document.querySelectorAll('[data-permission]');
    const permissoesAtuais = await carregarPermissoes();

    elementos.forEach(el => {
        const permissaoRequerida = el.getAttribute('data-permission');
        if (!permissoesAtuais.includes(permissaoRequerida)) {
            // Segurança Crítica: Removemos o elemento da árvore DOM
            el.remove(); 
        }
    });
}

// Proteção de Rota Crítica (Verifica se pode estar na página atual)
export function protegerRotaRestrita(permissaoRequeridaDaPagina) {
    onAuthStateChanged(auth, async (user) => {
        if (!user) {
            window.location.replace('index.html');
            return;
        }
        
        const temAcesso = await checkPermission(permissaoRequeridaDaPagina);
        if (!temAcesso) {
            console.warn("Acesso negado: Redirecionando...");
            window.location.replace('index.html');
        } else {
            // Se tem acesso, processa os botões da página
            renderizarAcessos();
        }
    });
}
