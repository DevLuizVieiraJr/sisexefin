import { db } from './firebase-config.js';
import { doc, setDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { protegerRotaRestrita } from './rbac.js';

// 1. Proteger a rota assim que o script carrega
// O utilizador TEM que ter 'acesso_admin', caso contrário é expulso para o index.html
protegerRotaRestrita('acesso_admin');

// 2. Lógica para salvar o Perfil
const formPerfil = document.getElementById('form-perfil');

formPerfil.addEventListener('submit', async (e) => {
    e.preventDefault();

    const nomePerfil = document.getElementById('nome-perfil').value.trim().toLowerCase();
    
    // Captura todas as checkboxes selecionadas
    const checkboxes = document.querySelectorAll('.permissao-cb:checked');
    const permissoesSelecionadas = Array.from(checkboxes).map(cb => cb.value);

    try {
        // Grava no Firestore na coleção 'perfis'
        const perfilRef = doc(db, 'perfis', nomePerfil);
        await setDoc(perfilRef, {
            permissoes: permissoesSelecionadas
        }, { merge: true }); // merge garante que não apague outros dados acidentalmente

        alert(`Perfil '${nomePerfil}' salvo com sucesso com ${permissoesSelecionadas.length} permissões!`);
        formPerfil.reset();
        
    } catch (error) {
        console.error("Erro ao salvar perfil:", error);
        alert("Erro ao salvar. Verifique se tens permissão de Admin.");
    }
});
