// 1. CONFIGURAÇÃO FIREBASE
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
let baseContratos = [];

// 2. CONTROLE DE ACESSO
auth.onAuthStateChanged((user) => {
    if (user) {
        usuarioLogadoEmail = user.email;
        document.getElementById('corpo-sistema').style.display = 'block';
        document.getElementById('nomeUsuarioLogado').innerHTML = `👤 ${usuarioLogadoEmail}`;
        mostrarSecao('secao-empenhos', document.querySelector("button[onclick*='secao-empenhos']"));
        
        // Iniciar escuta em tempo real
        escutarEmpenhos();
        escutarContratos();
    } else {
        window.location.href = "index.html";
    }
});

function fazerLogout() { auth.signOut().then(() => { window.location.href = "index.html"; }); }

// 3. NAVEGAÇÃO
function mostrarSecao(idSecao, botaoClicado) {
    document.querySelectorAll('.secao').forEach(el => el.style.display = 'none');
    document.getElementById(idSecao).style.display = 'block';
    document.querySelectorAll('.menu-btn').forEach(btn => btn.classList.remove('ativo'));
    if(botaoClicado) botaoClicado.classList.add('ativo');
}

// 4. MÓDULO EMPENHOS
function escutarEmpenhos() {
    db.collection('empenhos').orderBy('criado_em', 'desc').onSnapshot((snapshot) => {
        baseEmpenhos = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderizarTabelaEmpenhos();
    });
}

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
        meio: document.getElementById('meioEmpenho').value,
        editado_em: firebase.firestore.FieldValue.serverTimestamp(),
        editado_por: usuarioLogadoEmail
    };

    if (idEdicao === "-1") {
        dados.criado_em = firebase.firestore.FieldValue.serverTimestamp();
        dados.criado_por = usuarioLogadoEmail;
        db.collection('empenhos').add(dados).then(() => { alert("Empenho Salvo!"); voltarParaListaEmpenhos(); });
    } else {
        db.collection('empenhos').doc(idEdicao).update(dados).then(() => { alert("Empenho Atualizado!"); voltarParaListaEmpenhos(); });
    }
});

function renderizarTabelaEmpenhos() {
    const tbody = document.getElementById('tbody-empenhos');
    tbody.innerHTML = '';
    baseEmpenhos.forEach(emp => {
        tbody.innerHTML += `<tr>
            <td>${emp.numero}</td><td>${emp.nd}</td><td>${emp.ptres}</td><td>${emp.fr}</td><td>${emp.contrato}</td>
            <td>${emp.valor.toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}</td>
            <td><button onclick="editarEmpenho('${emp.id}')" class="btn-icon">✏️</button><button onclick="deletarEmpenho('${emp.id}')" class="btn-icon">🗑️</button></td>
        </tr>`;
    });
}

function abrirFormularioEmpenho(isEdit) {
    document.getElementById('tela-lista-empenhos').style.display = 'none';
    document.getElementById('tela-formulario-empenhos').style.display = 'block';
    document.getElementById('tituloFormEmpenhos').innerHTML = isEdit ? "✏️ Editando Minuta de Empenho" : "📄 Cadastro de Minuta de Empenho";
    if(!isEdit) { document.getElementById('formEmpenho').reset(); document.getElementById('editIndexEmpenho').value = "-1"; }
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
        document.getElementById('numEmpenho').value = emp.numero;
        document.getElementById('dataEmpenho').value = emp.data;
        document.getElementById('valorEmpenho').value = emp.valor;
        document.getElementById('ndEmpenho').value = emp.nd;
        document.getElementById('subitemEmpenho').value = emp.subitem;
        document.getElementById('ptresEmpenho').value = emp.ptres;
        document.getElementById('frEmpenho').value = emp.fr;
        document.getElementById('docOrigem').value = emp.docOrigem; // Nota: Corrigir id se necessário
        document.getElementById('oiEmpenho').value = emp.oi;
        document.getElementById('contratoEmpenho').value = emp.contrato;
        document.getElementById('capEmpenho').value = emp.cap;
        document.getElementById('altcredEmpenho').value = emp.altcred;
        document.getElementById('meioEmpenho').value = emp.meio;
    }
}

function deletarEmpenho(id) { if(confirm("Excluir empenho?")) db.collection('empenhos').doc(id).delete(); }

// 5. MÓDULO CONTRATOS
function escutarContratos() {
    db.collection('contratos').orderBy('nomeEmpresa').onSnapshot((snapshot) => {
        baseContratos = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderizarTabelaContratos();
    });
}

document.getElementById('formContrato').addEventListener('submit', function(e) {
    e.preventDefault();
    const idEdicao = document.getElementById('editIndexContrato').value;
    const dados = {
        nomeEmpresa: document.getElementById('nomeEmpresa').value,
        cnpj: document.getElementById('cnpjEmpresa').value,
        numContrato: document.getElementById('numContrato').value,
        vigencia: document.getElementById('vigenciaContrato').value,
        valorGlobal: parseFloat(document.getElementById('valorContrato').value) || 0,
        editado_em: firebase.firestore.FieldValue.serverTimestamp(),
        editado_por: usuarioLogadoEmail
    };

    if (idEdicao === "-1") {
        dados.criado_em = firebase.firestore.FieldValue.serverTimestamp();
        dados.criado_por = usuarioLogadoEmail;
        db.collection('contratos').add(dados).then(() => { alert("Contrato Salvo!"); voltarParaListaContratos(); });
    } else {
        db.collection('contratos').doc(idEdicao).update(dados).then(() => { alert("Contrato Atualizado!"); voltarParaListaContratos(); });
    }
});

function renderizarTabelaContratos() {
    const tbody = document.getElementById('tbody-contratos');
    tbody.innerHTML = '';
    baseContratos.forEach(c => {
        tbody.innerHTML += `<tr>
            <td>${c.nomeEmpresa}</td><td>${c.cnpj}</td><td>${c.numContrato}</td><td>${c.vigencia}</td>
            <td>${c.valorGlobal.toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}</td>
            <td><button onclick="editarContrato('${c.id}')" class="btn-icon">✏️</button><button onclick="deletarContrato('${c.id}')" class="btn-icon">🗑️</button></td>
        </tr>`;
    });
}

function abrirFormularioContrato(isEdit) {
    document.getElementById('tela-lista-contratos').style.display = 'none';
    document.getElementById('tela-formulario-contratos').style.display = 'block';
    document.getElementById('tituloFormContratos').innerHTML = isEdit ? "✏️ Editando Contrato" : "🤝 Cadastro de Contrato";
    if(!isEdit) { document.getElementById('formContrato').reset(); document.getElementById('editIndexContrato').value = "-1"; }
}

function voltarParaListaContratos() {
    document.getElementById('tela-formulario-contratos').style.display = 'none';
    document.getElementById('tela-lista-contratos').style.display = 'block';
}

function editarContrato(id) {
    const c = baseContratos.find(item => item.id === id);
    if(c) {
        abrirFormularioContrato(true);
        document.getElementById('editIndexContrato').value = id;
        document.getElementById('nomeEmpresa').value = c.nomeEmpresa;
        document.getElementById('cnpjEmpresa').value = c.cnpj;
        document.getElementById('numContrato').value = c.numContrato;
        document.getElementById('vigenciaContrato').value = c.vigencia;
        document.getElementById('valorContrato').value = c.valorGlobal;
    }
}

function deletarContrato(id) { if(confirm("Excluir contrato?")) db.collection('contratos').doc(id).delete(); }
