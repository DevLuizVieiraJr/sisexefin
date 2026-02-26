// ==========================================
// CONFIGURAÇÃO FIREBASE E AUTENTICAÇÃO
// ==========================================
const firebaseConfig = {
    apiKey: "AIzaSyDXHpJFnVUR7YCh-3rXvx4yX6zo3a-mR7A",
    authDomain: "sisexefin.firebaseapp.com",
    projectId: "sisexefin",
    appId: "1:476004653478:web:45aecf0d547f57eee8d767"
};
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();

let usuarioLogadoEmail = "";

auth.onAuthStateChanged((user) => {
    if (user) {
        usuarioLogadoEmail = user.email;
        document.getElementById('corpo-sistema').style.display = 'block';
        document.getElementById('nomeUsuarioLogado').innerHTML = `👤 ${usuarioLogadoEmail}`;
        
        // Inicia a leitura dos dados do Firebase em tempo real
        escutarFirebase();
    } else {
        window.location.href = "index.html";
    }
});

function fazerLogout() { auth.signOut(); }

// ==========================================
// 1. VARIÁVEIS DE ESTADO E BASES DE DADOS
// ==========================================
let baseEmpenhos = [];
let baseContratos = [];
let baseDarf = [];
let baseTitulos = [];

// A sua paginação original intocada!
let paginaAtualEmpenhos = 1; let itensPorPaginaEmpenhos = 10; let itensExibidosAtualmenteEmpenhos = []; let termoBuscaEmpenhos = "";
let paginaAtualContratos = 1; let itensPorPaginaContratos = 10; let itensExibidosAtualmenteContratos = []; let termoBuscaContratos = "";
let paginaAtualDarf = 1; let itensPorPaginaDarf = 10; let itensExibidosAtualmenteDarf = []; let termoBuscaDarf = "";
let paginaAtual = 1; let itensPorPagina = 10; let itensExibidosAtualmente = []; let termoBuscaTitulos = "";

let empenhosDaNotaAtual = [];
let empenhoTemporarioSelecionado = null;
let darfsDoContratoAtual = []; 
let moduloAtualModal = ""; 

// ==========================================
// 1.5 SINCRONIZAÇÃO EM TEMPO REAL (FIREBASE)
// ==========================================
function escutarFirebase() {
    db.collection('empenhos').onSnapshot(snap => {
        baseEmpenhos = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        atualizarTabelaEmpenhos();
    });
    db.collection('contratos').onSnapshot(snap => {
        baseContratos = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        atualizarTabelaContratos();
    });
    db.collection('darf').onSnapshot(snap => {
        baseDarf = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        atualizarTabelaDarf();
    });
    db.collection('titulos').onSnapshot(snap => {
        baseTitulos = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        atualizarTabelaTitulos();
    });
}

// ==========================================
// 2. NAVEGAÇÃO PRINCIPAL
// ==========================================
function mostrarSecao(idSecao) {
    document.querySelectorAll('.secao').forEach(s => s.style.display = 'none');
    document.getElementById(idSecao).style.display = 'block';
    
    document.getElementById('tela-formulario-empenhos').style.display = 'none'; document.getElementById('tela-lista-empenhos').style.display = 'block';
    document.getElementById('tela-formulario-contratos').style.display = 'none'; document.getElementById('tela-lista-contratos').style.display = 'block';
    document.getElementById('tela-formulario-darf').style.display = 'none'; document.getElementById('tela-lista-darf').style.display = 'block';
    document.getElementById('tela-formulario-titulos').style.display = 'none'; document.getElementById('tela-lista-titulos').style.display = 'block';

    atualizarTabelaEmpenhos(); atualizarTabelaContratos(); atualizarTabelaDarf(); atualizarTabelaTitulos();
}

// ==========================================
// 3. MÓDULO: EMPENHOS
// ==========================================
const formEmpenho = document.getElementById('formEmpenho');
const tabelaEmpenhosBody = document.querySelector('#tabelaEmpenhos tbody');

document.getElementById('numEmpenho').addEventListener('input', function(e) {
    let numeros = e.target.value.replace(/\D/g, ''); let formatado = '';
    if (numeros.length > 0) formatado += numeros.substring(0, 4);
    if (numeros.length >= 4) { formatado += 'NE'; formatado += numeros.substring(4, 10); }
    e.target.value = formatado;
});
document.querySelectorAll('.somente-numeros').forEach(input => { input.addEventListener('input', function(e) { e.target.value = e.target.value.replace(/\D/g, ''); }); });

function abrirFormularioEmpenho() { formEmpenho.reset(); document.getElementById('editIndexEmpenho').value = -1; document.getElementById('tela-lista-empenhos').style.display = 'none'; document.getElementById('tela-formulario-empenhos').style.display = 'block'; }
function voltarParaListaEmpenhos() { document.getElementById('tela-formulario-empenhos').style.display = 'none'; document.getElementById('tela-lista-empenhos').style.display = 'block'; atualizarTabelaEmpenhos(); }
function filtrarTabelaEmpenhos() { termoBuscaEmpenhos = document.getElementById('buscaTabelaEmpenhos').value.toLowerCase(); paginaAtualEmpenhos = 1; atualizarTabelaEmpenhos(); }

function atualizarTabelaEmpenhos() {
    tabelaEmpenhosBody.innerHTML = '';
    let baseFiltrada = baseEmpenhos.map((emp, index) => ({ ...emp, indexOriginal: index }));
    if (termoBuscaEmpenhos.trim() !== "") { baseFiltrada = baseFiltrada.filter(emp => (emp.numEmpenho && emp.numEmpenho.toLowerCase().includes(termoBuscaEmpenhos)) || (emp.contrato && emp.contrato.toLowerCase().includes(termoBuscaEmpenhos))); }
    const inicio = (paginaAtualEmpenhos - 1) * itensPorPaginaEmpenhos; const fim = inicio + parseInt(itensPorPaginaEmpenhos);
    itensExibidosAtualmenteEmpenhos = baseFiltrada.slice(inicio, fim);
    if (itensExibidosAtualmenteEmpenhos.length === 0) { tabelaEmpenhosBody.innerHTML = '<tr><td colspan="7" style="text-align:center;">Nenhum registo.</td></tr>'; }
    itensExibidosAtualmenteEmpenhos.forEach((emp) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${emp.numEmpenho}</td><td>${emp.nd || '-'}</td><td>${emp.ptres || '-'}</td><td>${emp.fr || '-'}</td><td>${emp.contrato || '-'}</td><td>R$ ${emp.valorEmpenho || '0.00'}</td><td><button type="button" class="btn-icon" onclick="editarEmpenho(${emp.indexOriginal})">✏️</button><button type="button" class="btn-icon" onclick="apagarEmpenho(${emp.indexOriginal})">🗑️</button></td>`;
        tabelaEmpenhosBody.appendChild(tr);
    });
    atualizarControlesPaginacaoEmpenhos(baseFiltrada.length);
}

function mudarTamanhoPaginaEmpenhos() { itensPorPaginaEmpenhos = document.getElementById('itensPorPaginaEmpenhos').value; paginaAtualEmpenhos = 1; atualizarTabelaEmpenhos(); }
function mudarPaginaEmpenhos(direcao) { paginaAtualEmpenhos += direcao; atualizarTabelaEmpenhos(); }
function atualizarControlesPaginacaoEmpenhos(tamanho) {
    const total = Math.ceil(tamanho / itensPorPaginaEmpenhos) || 1;
    document.getElementById('infoPaginaEmpenhos').innerText = `Página ${paginaAtualEmpenhos} de ${total}`;
    document.getElementById('btnAnteriorEmpenhos').disabled = paginaAtualEmpenhos === 1; document.getElementById('btnProximoEmpenhos').disabled = paginaAtualEmpenhos === total;
}

function editarEmpenho(indexOriginal) {
    const emp = baseEmpenhos[indexOriginal]; 
    document.getElementById('editIndexEmpenho').value = emp.id; // Guarda o ID do Firebase!
    document.getElementById('numEmpenho').value = emp.numEmpenho || ''; document.getElementById('dataEmpenho').value = emp.dataEmpenho || ''; document.getElementById('valorEmpenho').value = emp.valorEmpenho || ''; document.getElementById('ndEmpenho').value = emp.nd || ''; document.getElementById('subitemEmpenho').value = emp.subitem || ''; document.getElementById('ptresEmpenho').value = emp.ptres || ''; document.getElementById('frEmpenho').value = emp.fr || ''; document.getElementById('docOrigEmpenho').value = emp.docOrig || ''; document.getElementById('oiEmpenho').value = emp.oi || ''; document.getElementById('contratoEmpenho').value = emp.contrato || ''; document.getElementById('capEmpenho').value = emp.cap || ''; document.getElementById('altcredEmpenho').value = emp.altcred || ''; document.getElementById('meioEmpenho').value = emp.meio || '';
    document.getElementById('tela-lista-empenhos').style.display = 'none'; document.getElementById('tela-formulario-empenhos').style.display = 'block';
}

function apagarEmpenho(indexOriginal) {
    const empenho = baseEmpenhos[indexOriginal];
    const estaVinculado = baseTitulos.some(titulo => titulo.empenhosVinculados && titulo.empenhosVinculados.some(vinc => vinc.numEmpenho === empenho.numEmpenho));
    if (estaVinculado) { alert(`Ação Bloqueada: Empenho associado a Notas Fiscais.`); return; }
    if (confirm(`Apagar o empenho ${empenho.numEmpenho}?`)) { 
        db.collection('empenhos').doc(empenho.id).delete(); // Firebase deleta!
        if (itensExibidosAtualmenteEmpenhos.length === 1 && paginaAtualEmpenhos > 1) paginaAtualEmpenhos--; 
    }
}

formEmpenho.addEventListener('submit', function(e) {
    e.preventDefault(); const fbID = document.getElementById('editIndexEmpenho').value; const numEmp = document.getElementById('numEmpenho').value;
    if(numEmp.length !== 12 || !numEmp.includes('NE')) { alert("Formato inválido (YYYYNENNNNNN)."); return; }
    const dados = { numEmpenho: numEmp, dataEmpenho: document.getElementById('dataEmpenho').value, valorEmpenho: document.getElementById('valorEmpenho').value, nd: document.getElementById('ndEmpenho').value, subitem: document.getElementById('subitemEmpenho').value, ptres: document.getElementById('ptresEmpenho').value, fr: document.getElementById('frEmpenho').value, docOrig: document.getElementById('docOrigEmpenho').value, oi: document.getElementById('oiEmpenho').value, contrato: document.getElementById('contratoEmpenho').value, cap: document.getElementById('capEmpenho').value, altcred: document.getElementById('altcredEmpenho').value, meio: document.getElementById('meioEmpenho').value };
    
    // Firebase Grava ou Atualiza!
    if (fbID == -1 || fbID === "") {
        db.collection('empenhos').add(dados).then(() => voltarParaListaEmpenhos());
    } else { 
        db.collection('empenhos').doc(fbID).update(dados).then(() => voltarParaListaEmpenhos());
    }
});

document.getElementById('fileImportEmpenhos').addEventListener('change', function(evento) {
    const ficheiro = evento.target.files[0]; if (!ficheiro) return; const leitor = new FileReader();
    leitor.onload = function(e) {
        try {
            const dados = new Uint8Array(e.target.result); const livro = XLSX.read(dados, {type: 'array'}); const folha = livro.Sheets[livro.SheetNames[0]];
            const dadosImportados = XLSX.utils.sheet_to_json(folha, {raw: false, defval: ""});
            if (dadosImportados.length === 0) return;
            let contadorSucesso = 0;
            dadosImportados.forEach(linha => {
                const chaves = Object.keys(linha); if (chaves.length === 0) return;
                let chaveEmpenho = chaves.find(c => c.toLowerCase().includes('empenho') || c.toLowerCase().includes('ne') || c.toLowerCase().includes('numero')); if(!chaveEmpenho) chaveEmpenho = chaves[0];
                const numBrutoExato = String(linha[chaveEmpenho]).trim(); if(!numBrutoExato) return;
                const novoEmpenho = { numEmpenho: numBrutoExato, dataEmpenho: linha['Data'] || '', valorEmpenho: parseFloat(linha['Valor']) || 0, nd: linha['ND'] || '', subitem: String(linha['Subitem'] || '').padStart(2, '0'), ptres: linha['PTRES'] || '', fr: linha['FR'] || '', docOrig: linha['doc_orig'] || '', oi: linha['OI'] || '', contrato: linha['contrato'] || '', cap: linha['cap'] || '', altcred: linha['altcred'] || '', meio: linha['meio'] || '' };
                db.collection('empenhos').add(novoEmpenho); // Manda para a nuvem
                contadorSucesso++;
            });
            if (contadorSucesso > 0) { alert(`A enviar ${contadorSucesso} empenhos para a nuvem...`); }
        } catch (erro) { alert("Erro: " + erro.message); }
        evento.target.value = ''; 
    }; leitor.readAsArrayBuffer(ficheiro);
});
function exportarEmpenhos(formato) { if (baseEmpenhos.length === 0) return alert("Vazio."); const folha = XLSX.utils.json_to_sheet(baseEmpenhos); const livro = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(livro, folha, "Empenhos"); XLSX.writeFile(livro, `Empenhos_${new Date().toISOString().slice(0,10)}.${formato}`); }

// ==========================================
// MÓDULO DARF
// ==========================================
const formDarf = document.getElementById('formDarf');
const tabelaDarfBody = document.querySelector('#tabelaDarf tbody');

function abrirFormularioDarf() { formDarf.reset(); document.getElementById('editIndexDarf').value = -1; document.getElementById('tela-lista-darf').style.display = 'none'; document.getElementById('tela-formulario-darf').style.display = 'block'; }
function voltarParaListaDarf() { document.getElementById('tela-formulario-darf').style.display = 'none'; document.getElementById('tela-lista-darf').style.display = 'block'; atualizarTabelaDarf(); }
function filtrarTabelaDarf() { termoBuscaDarf = document.getElementById('buscaTabelaDarf').value.toLowerCase(); paginaAtualDarf = 1; atualizarTabelaDarf(); }

function atualizarTabelaDarf() {
    tabelaDarfBody.innerHTML = '';
    let baseFiltrada = baseDarf.map((d, index) => ({ ...d, indexOriginal: index }));
    if (termoBuscaDarf.trim() !== "") { baseFiltrada = baseFiltrada.filter(d => (d.codigo && String(d.codigo).includes(termoBuscaDarf)) || (d.aplicacao && d.aplicacao.toLowerCase().includes(termoBuscaDarf))); }
    const inicio = (paginaAtualDarf - 1) * itensPorPaginaDarf; const fim = inicio + parseInt(itensPorPaginaDarf);
    itensExibidosAtualmenteDarf = baseFiltrada.slice(inicio, fim);
    if (itensExibidosAtualmenteDarf.length === 0) { tabelaDarfBody.innerHTML = '<tr><td colspan="4" style="text-align:center;">Nenhum DARF encontrado.</td></tr>'; }

    itensExibidosAtualmenteDarf.forEach((d) => {
        const tr = document.createElement('tr');
        const aplicacaoCurta = d.aplicacao && d.aplicacao.length > 50 ? d.aplicacao.substring(0, 50) + "..." : d.aplicacao;
        tr.innerHTML = `<td><strong>${d.codigo}</strong></td><td>${aplicacaoCurta || '-'}</td><td>${d.total || '-'}</td>
            <td><button type="button" class="btn-icon" onclick="editarDarf(${d.indexOriginal})">✏️</button><button type="button" class="btn-icon" onclick="apagarDarf(${d.indexOriginal})">🗑️</button></td>`;
        tabelaDarfBody.appendChild(tr);
    });
    atualizarControlesPaginacaoDarf(baseFiltrada.length);
}

function mudarTamanhoPaginaDarf() { itensPorPaginaDarf = document.getElementById('itensPorPaginaDarf').value; paginaAtualDarf = 1; atualizarTabelaDarf(); }
function mudarPaginaDarf(direcao) { paginaAtualDarf += direcao; atualizarTabelaDarf(); }
function atualizarControlesPaginacaoDarf(tamanho) {
    const total = Math.ceil(tamanho / itensPorPaginaDarf) || 1;
    document.getElementById('infoPaginaDarf').innerText = `Página ${paginaAtualDarf} de ${total}`;
    document.getElementById('btnAnteriorDarf').disabled = paginaAtualDarf === 1; document.getElementById('btnProximoDarf').disabled = paginaAtualDarf === total;
}

function editarDarf(indexOriginal) {
    const d = baseDarf[indexOriginal]; document.getElementById('editIndexDarf').value = d.id; // Firebase ID
    document.getElementById('codigoDarf').value = d.codigo || ''; document.getElementById('aplicacaoDarf').value = d.aplicacao || '';
    document.getElementById('irDarf').value = d.ir || ''; document.getElementById('csllDarf').value = d.csll || '';
    document.getElementById('cofinsDarf').value = d.cofins || ''; document.getElementById('pisDarf').value = d.pis || '';
    document.getElementById('totalDarf').value = d.total || '';
    document.getElementById('tela-lista-darf').style.display = 'none'; document.getElementById('tela-formulario-darf').style.display = 'block';
}

function apagarDarf(indexOriginal) {
    const d = baseDarf[indexOriginal];
    const estaVinculado = baseContratos.some(c => c.codigosReceita && c.codigosReceita.includes(d.codigo));
    if (estaVinculado) { alert(`Ação Bloqueada: O DARF ${d.codigo} está associado a Contratos.`); return; }
    if (confirm(`Apagar o DARF ${d.codigo}?`)) {
        db.collection('darf').doc(d.id).delete();
        if (itensExibidosAtualmenteDarf.length === 1 && paginaAtualDarf > 1) paginaAtualDarf--; 
    }
}

formDarf.addEventListener('submit', function(e) {
    e.preventDefault(); const fbID = document.getElementById('editIndexDarf').value;
    const dados = {
        codigo: document.getElementById('codigoDarf').value, aplicacao: document.getElementById('aplicacaoDarf').value,
        ir: document.getElementById('irDarf').value, csll: document.getElementById('csllDarf').value,
        cofins: document.getElementById('cofinsDarf').value, pis: document.getElementById('pisDarf').value, total: document.getElementById('totalDarf').value
    };
    if (fbID == -1 || fbID === "") {
        db.collection('darf').add(dados).then(() => voltarParaListaDarf());
    } else {
        db.collection('darf').doc(fbID).update(dados).then(() => voltarParaListaDarf());
    }
});

document.getElementById('fileImportDarf').addEventListener('change', function(evento) {
    const ficheiro = evento.target.files[0]; if (!ficheiro) return; const leitor = new FileReader();
    leitor.onload = function(e) {
        try {
            const dados = new Uint8Array(e.target.result); const livro = XLSX.read(dados, {type: 'array'}); const folha = livro.Sheets[livro.SheetNames[0]];
            const dadosImportados = XLSX.utils.sheet_to_json(folha, {raw: false, defval: ""});
            let contadorSucesso = 0;
            dadosImportados.forEach(linha => {
                let codigo = linha['codigo'] || linha['código'] || linha['Código'] || linha['CODIGO'] || '';
                codigo = String(codigo).replace(/\D/g, '').trim(); 
                if(!codigo) return;
                const novoDarf = {
                    codigo: codigo, aplicacao: linha['aplicacao'] || linha['aplicação'] || linha['Aplicação'] || '',
                    ir: linha['IR'] || linha['ir'] || '', csll: linha['CSLL'] || linha['csll'] || '',
                    cofins: linha['COFINS'] || linha['cofins'] || '', pis: linha['PIS'] || linha['pis'] || '', total: linha['%'] || linha['Total'] || linha['total'] || ''
                };
                db.collection('darf').add(novoDarf); contadorSucesso++;
            });
            if (contadorSucesso > 0) alert(`A enviar ${contadorSucesso} códigos DARF...`); 
        } catch (erro) { alert("Erro: " + erro.message); }
        evento.target.value = ''; 
    }; leitor.readAsArrayBuffer(ficheiro);
});
function exportarDarf(formato) { if (baseDarf.length === 0) return alert("Vazio."); const folha = XLSX.utils.json_to_sheet(baseDarf); const livro = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(livro, folha, "DARF"); XLSX.writeFile(livro, `DARF_${new Date().toISOString().slice(0,10)}.${formato}`); }

// ==========================================
// MÓDULO: CONTRATOS E EMPRESAS
// ==========================================
const formContrato = document.getElementById('formContrato');
const tabelaContratosBody = document.querySelector('#tabelaContratos tbody');

document.getElementById('cnpjEmpresa').addEventListener('input', function (e) {
    var x = e.target.value.replace(/\D/g, '').match(/(\d{0,2})(\d{0,3})(\d{0,3})(\d{0,4})(\d{0,2})/);
    e.target.value = !x[2] ? x[1] : x[1] + '.' + x[2] + (x[3] ? '.' : '') + x[3] + (x[4] ? '/' : '') + x[4] + (x[5] ? '-' + x[5] : '');
});

const inputBuscaDarfContrato = document.getElementById('buscaDarfContrato');
const listaResultadosDarf = document.getElementById('listaResultadosDarf');

inputBuscaDarfContrato.addEventListener('input', function() {
    const texto = this.value.toLowerCase(); listaResultadosDarf.innerHTML = '';
    if (texto.length >= 2) {
        const resultados = baseDarf.filter(d => d.codigo.includes(texto) || d.aplicacao.toLowerCase().includes(texto));
        if (resultados.length === 0) { listaResultadosDarf.innerHTML = '<li style="color:red; padding:10px;">Nenhum DARF encontrado.</li>'; }
        else {
            resultados.forEach(d => {
                const li = document.createElement('li');
                li.innerHTML = `<strong>${d.codigo}</strong> - ${d.aplicacao.substring(0, 40)}...`;
                li.onclick = () => selecionarDarfContrato(d);
                listaResultadosDarf.appendChild(li);
            });
        }
    }
});

function selecionarDarfContrato(d) {
    if (!darfsDoContratoAtual.includes(d.codigo)) { darfsDoContratoAtual.push(d.codigo); desenharDarfsContrato(); }
    inputBuscaDarfContrato.value = ''; listaResultadosDarf.innerHTML = '';
}

function desenharDarfsContrato() {
    const container = document.getElementById('containerDarfsContrato'); container.innerHTML = '';
    darfsDoContratoAtual.forEach((codigo, index) => {
        const span = document.createElement('span'); span.className = 'badge-tag';
        span.innerHTML = `${codigo} <button type="button" onclick="removerDarfContrato(${index})">&times;</button>`;
        container.appendChild(span);
    });
}
function removerDarfContrato(index) { darfsDoContratoAtual.splice(index, 1); desenharDarfsContrato(); }

function abrirFormularioContrato() {
    formContrato.reset(); document.getElementById('editIndexContrato').value = -1;
    darfsDoContratoAtual = []; desenharDarfsContrato();
    document.getElementById('tela-lista-contratos').style.display = 'none'; document.getElementById('tela-formulario-contratos').style.display = 'block';
}
function voltarParaListaContratos() { document.getElementById('tela-formulario-contratos').style.display = 'none'; document.getElementById('tela-lista-contratos').style.display = 'block'; atualizarTabelaContratos(); }
function filtrarTabelaContratos() { termoBuscaContratos = document.getElementById('buscaTabelaContratos').value.toLowerCase(); paginaAtualContratos = 1; atualizarTabelaContratos(); }

function atualizarTabelaContratos() {
    tabelaContratosBody.innerHTML = '';
    let baseFiltrada = baseContratos.map((c, index) => ({ ...c, indexOriginal: index }));

    if (termoBuscaContratos.trim() !== "") {
        baseFiltrada = baseFiltrada.filter(c => (c.empresa && c.empresa.toLowerCase().includes(termoBuscaContratos)) || (c.cnpj && c.cnpj.includes(termoBuscaContratos)) || (c.contrato && c.contrato.toLowerCase().includes(termoBuscaContratos)));
    }
    const inicio = (paginaAtualContratos - 1) * itensPorPaginaContratos; const fim = inicio + parseInt(itensPorPaginaContratos);
    itensExibidosAtualmenteContratos = baseFiltrada.slice(inicio, fim);
    if (itensExibidosAtualmenteContratos.length === 0) { tabelaContratosBody.innerHTML = '<tr><td colspan="6" style="text-align:center;">Nenhum contrato encontrado.</td></tr>'; }

    itensExibidosAtualmenteContratos.forEach((c) => {
        const tr = document.createElement('tr');
        let darfsString = (c.codigosReceita && Array.isArray(c.codigosReceita)) ? c.codigosReceita.join(', ') : (c.codReceita || '-');
        
        tr.innerHTML = `<td><strong>${c.empresa}</strong></td><td>${c.cnpj || '-'}</td><td>${c.contrato || '-'}</td><td>${darfsString}</td><td>${c.vigencia || '-'}</td>
            <td><button type="button" class="btn-icon" onclick="editarContrato(${c.indexOriginal})">✏️</button><button type="button" class="btn-icon" onclick="apagarContrato(${c.indexOriginal})">🗑️</button></td>`;
        tabelaContratosBody.appendChild(tr);
    });
    atualizarControlesPaginacaoContratos(baseFiltrada.length);
}

function mudarTamanhoPaginaContratos() { itensPorPaginaContratos = document.getElementById('itensPorPaginaContratos').value; paginaAtualContratos = 1; atualizarTabelaContratos(); }
function mudarPaginaContratos(direcao) { paginaAtualContratos += direcao; atualizarTabelaContratos(); }
function atualizarControlesPaginacaoContratos(tamanho) {
    const total = Math.ceil(tamanho / itensPorPaginaContratos) || 1;
    document.getElementById('infoPaginaContratos').innerText = `Página ${paginaAtualContratos} de ${total}`;
    document.getElementById('btnAnteriorContratos').disabled = paginaAtualContratos === 1; document.getElementById('btnProximoContratos').disabled = paginaAtualContratos === total;
}

function editarContrato(indexOriginal) {
    const c = baseContratos[indexOriginal]; document.getElementById('editIndexContrato').value = c.id; 
    document.getElementById('nomeEmpresa').value = c.empresa || ''; document.getElementById('cnpjEmpresa').value = c.cnpj || '';
    document.getElementById('numContrato').value = c.contrato || ''; document.getElementById('valorContrato').value = c.valor || '';
    document.getElementById('nupContrato').value = c.nup || ''; document.getElementById('afCpvContrato').value = c.afCpv || '';
    document.getElementById('licitacaoContrato').value = c.licitacao || ''; document.getElementById('vigenciaContrato').value = c.vigencia || '';
    document.getElementById('simplesContrato').value = c.simples || ''; 
    document.getElementById('fiscalContrato').value = c.fiscal || ''; document.getElementById('contatoFiscalContrato').value = c.contatoFiscal || '';
    
    if (c.codigosReceita && Array.isArray(c.codigosReceita)) { darfsDoContratoAtual = [...c.codigosReceita]; } 
    else if (c.codReceita) { darfsDoContratoAtual = [c.codReceita]; } else { darfsDoContratoAtual = []; }
    desenharDarfsContrato();

    document.getElementById('tela-lista-contratos').style.display = 'none'; document.getElementById('tela-formulario-contratos').style.display = 'block';
}

function apagarContrato(indexOriginal) {
    const c = baseContratos[indexOriginal];
    if (confirm("Apagar Contrato?")) {
        db.collection('contratos').doc(c.id).delete();
        if (itensExibidosAtualmenteContratos.length === 1 && paginaAtualContratos > 1) paginaAtualContratos--; 
    }
}

formContrato.addEventListener('submit', function(e) {
    e.preventDefault(); const fbID = document.getElementById('editIndexContrato').value;
    const dados = {
        empresa: document.getElementById('nomeEmpresa').value, cnpj: document.getElementById('cnpjEmpresa').value,
        contrato: document.getElementById('numContrato').value, valor: document.getElementById('valorContrato').value,
        nup: document.getElementById('nupContrato').value, afCpv: document.getElementById('afCpvContrato').value,
        licitacao: document.getElementById('licitacaoContrato').value, vigencia: document.getElementById('vigenciaContrato').value,
        simples: document.getElementById('simplesContrato').value, fiscal: document.getElementById('fiscalContrato').value, contatoFiscal: document.getElementById('contatoFiscalContrato').value,
        codigosReceita: darfsDoContratoAtual
    };
    if (fbID == -1 || fbID === "") {
        db.collection('contratos').add(dados).then(() => voltarParaListaContratos());
    } else {
        db.collection('contratos').doc(fbID).update(dados).then(() => voltarParaListaContratos());
    }
});

document.getElementById('fileImportContratos').addEventListener('change', function(evento) {
    const ficheiro = evento.target.files[0]; if (!ficheiro) return; const leitor = new FileReader();
    leitor.onload = function(e) {
        try {
            const dados = new Uint8Array(e.target.result); const livro = XLSX.read(dados, {type: 'array'}); const folha = livro.Sheets[livro.SheetNames[0]];
            const dadosImportados = XLSX.utils.sheet_to_json(folha, {raw: false, defval: ""});
            let contadorSucesso = 0;
            dadosImportados.forEach(linha => {
                const empresa = linha['FAVORECIDO'] || linha['favorecido'] || linha['Empresa'] || linha['empresa'];
                if(!empresa) return; 
                let darfsCSV = linha['COD. RECEITA'] || linha['cod. receita'] || linha['Cod Receita'] || '';
                let arrayDarfs = [];
                if (darfsCSV) { arrayDarfs = String(darfsCSV).split(',').map(s => String(s).trim()).filter(s => s); }

                const novoContrato = {
                    empresa: String(empresa).trim(), cnpj: linha['CNPJ'] || linha['cnpj'] || '', contrato: linha['CONTRATO'] || linha['contrato'] || '',
                    nup: linha['nup'] || linha['NUP'] || '', afCpv: linha['AF/CPV'] || linha['af/cpv'] || '', vigencia: linha['vigencia'] || linha['Vigência'] || '',
                    licitacao: linha['licitação'] || linha['Licitação'] || '', valor: parseFloat(linha['valor_global']) || parseFloat(linha['Valor Global']) || 0,
                    fiscal: linha['fiscal_contrato'] || linha['Fiscal Contrato'] || '', contatoFiscal: linha['contato_fiscal'] || linha['Contato Fiscal'] || '',
                    simples: linha['OPTANTE'] || linha['optante'] || linha['Simples'] || '',
                    codigosReceita: arrayDarfs
                };
                db.collection('contratos').add(novoContrato); contadorSucesso++;
            });
            if (contadorSucesso > 0) alert(`A enviar ${contadorSucesso} contratos...`); 
        } catch (erro) { alert("Erro ao importar: " + erro.message); }
        evento.target.value = ''; 
    }; leitor.readAsArrayBuffer(ficheiro);
});
function exportarContratos(formato) {
    if (baseContratos.length === 0) return alert("Não há contratos."); 
    const flat = baseContratos.map(c => { let copy = {...c}; copy.codigosReceita = (c.codigosReceita || []).join(', '); return copy; });
    const folha = XLSX.utils.json_to_sheet(flat); const livro = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(livro, folha, "Contratos"); XLSX.writeFile(livro, `Contratos_${new Date().toISOString().slice(0,10)}.${formato}`);
}

// ==========================================
// 4. MÓDULO: TÍTULOS / HUB (FORM-3)
// ==========================================
const formTitulo = document.getElementById('formTitulo');
const tabelaTitulosBody = document.querySelector('#tabelaTitulos tbody');

function abrirFormularioTitulo() {
    formTitulo.reset(); document.getElementById('editIndexTitulo').value = -1; document.getElementById('idProc').value = ""; 
    const badge = document.getElementById('badgeStatusProc'); badge.textContent = "Rascunho"; badge.className = "badge-status rascunho";
    empenhosDaNotaAtual = []; desenharMiniTabelaEmpenhos();
    document.getElementById('detalhesVinculoEmpenho').style.display = 'none'; document.getElementById('listaResultadosEmpenho').innerHTML = '';
    document.getElementById('listaResultadosContrato').innerHTML = ''; document.getElementById('dadosContratoSelecionado').style.display = 'none';
    document.getElementById('tela-lista-titulos').style.display = 'none'; document.getElementById('tela-formulario-titulos').style.display = 'block';
}

function voltarParaListaTitulos() { document.getElementById('tela-formulario-titulos').style.display = 'none'; document.getElementById('tela-lista-titulos').style.display = 'block'; atualizarTabelaTitulos(); }
function filtrarTabelaTitulos() { termoBuscaTitulos = document.getElementById('buscaTabelaTitulos').value.toLowerCase(); paginaAtual = 1; atualizarTabelaTitulos(); }

function atualizarTabelaTitulos() {
    tabelaTitulosBody.innerHTML = ''; let baseFiltrada = baseTitulos.map((tit, index) => ({ ...tit, indexOriginal: index }));
    if (termoBuscaTitulos.trim() !== "") {
        baseFiltrada = baseFiltrada.filter(tit => {
            let matchesEmpenhos = false;
            if (Array.isArray(tit.empenhosVinculados)) { matchesEmpenhos = tit.empenhosVinculados.some(e => e.numEmpenho.toLowerCase().includes(termoBuscaTitulos)); }
            return ((tit.idProc && tit.idProc.toLowerCase().includes(termoBuscaTitulos)) || (tit.numTC && tit.numTC.toLowerCase().includes(termoBuscaTitulos)) || (tit.empresa && tit.empresa.toLowerCase().includes(termoBuscaTitulos)) || matchesEmpenhos);
        });
    }
    const inicio = (paginaAtual - 1) * itensPorPagina; const fim = inicio + parseInt(itensPorPagina);
    itensExibidosAtualmente = baseFiltrada.slice(inicio, fim); 
    if (itensExibidosAtualmente.length === 0) { tabelaTitulosBody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Nenhum título encontrado.</td></tr>'; }
    itensExibidosAtualmente.forEach((titulo) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${titulo.idProc}</td><td>${titulo.numTC || '-'}</td><td>${titulo.empresa || '-'}</td><td>R$ ${titulo.valorNotaFiscal || '0.00'}</td><td><button type="button" class="btn-icon" onclick="editarTitulo(${titulo.indexOriginal})">✏️</button><button type="button" class="btn-icon" onclick="apagarTitulo(${titulo.indexOriginal})">🗑️</button></td>`;
        tabelaTitulosBody.appendChild(tr);
    });
    atualizarControlesPaginacao(baseFiltrada.length);
}

function mudarTamanhoPagina() { itensPorPagina = document.getElementById('itensPorPagina').value; paginaAtual = 1; atualizarTabelaTitulos(); }
function mudarPagina(direcao) { paginaAtual += direcao; atualizarTabelaTitulos(); }
function atualizarControlesPaginacao(tamanho) {
    const totalPaginas = Math.ceil(tamanho / itensPorPagina) || 1;
    document.getElementById('infoPagina').innerText = `Página ${paginaAtual} de ${totalPaginas}`;
    document.getElementById('btnAnterior').disabled = paginaAtual === 1; document.getElementById('btnProximo').disabled = paginaAtual === totalPaginas;
}

// Busca Empresa (FORM-3) - Agora busca na base do Firebase
const inputBuscaContratoT = document.getElementById('buscaContrato');
const listaResultadosContratoT = document.getElementById('listaResultadosContrato');
inputBuscaContratoT.addEventListener('input', function() {
    const texto = this.value.toLowerCase(); listaResultadosContratoT.innerHTML = '';
    if (texto.length >= 3) {
        const resultados = baseContratos.filter(c => c.empresa.toLowerCase().includes(texto) || c.cnpj.includes(texto) || (c.contrato && c.contrato.toLowerCase().includes(texto)));
        if (resultados.length === 0) { listaResultadosContratoT.innerHTML = '<li style="color:red; padding:10px;">Nenhum contrato encontrado.</li>'; } 
        else { resultados.forEach(c => { const li = document.createElement('li'); li.innerHTML = `<strong>${c.empresa}</strong> - CNPJ: ${c.cnpj} (Contrato: ${c.contrato})`; li.onclick = () => selecionarContratoT(c); listaResultadosContratoT.appendChild(li); }); }
    }
});
function selecionarContratoT(c) {
    inputBuscaContratoT.value = ''; listaResultadosContratoT.innerHTML = '';
    document.getElementById('dadosContratoSelecionado').style.display = 'block';
    document.getElementById('readEmpresa').value = c.empresa || ''; document.getElementById('readCnpj').value = c.cnpj || '';
    document.getElementById('readContrato').value = c.contrato || ''; document.getElementById('readValorContrato').value = c.valor || '';
    document.getElementById('readNup').value = c.nup || ''; document.getElementById('readAfCpv').value = c.afCpv || '';
    document.getElementById('readLicitacao').value = c.licitacao || ''; document.getElementById('readVigencia').value = c.vigencia || '';
    document.getElementById('readSimples').value = c.simples || ''; 
    document.getElementById('readCodReceita').value = (c.codigosReceita && Array.isArray(c.codigosReceita)) ? c.codigosReceita.join(', ') : '';
}

// Busca Empenho (FORM-3) - Agora busca na base do Firebase
const inputBuscaEmpenho = document.getElementById('buscaEmpenho');
const listaResultadosEmpenho = document.getElementById('listaResultadosEmpenho');
inputBuscaEmpenho.addEventListener('input', function() {
    const texto = this.value.toUpperCase(); listaResultadosEmpenho.innerHTML = ''; 
    if (texto.length >= 4) {
        const resultados = baseEmpenhos.filter(emp => emp.numEmpenho.toUpperCase().includes(texto));
        if (resultados.length === 0) { listaResultadosEmpenho.innerHTML = '<li style="color:red; padding:10px;">Nenhum encontrado.</li>'; } 
        else { resultados.forEach(emp => { const li = document.createElement('li'); li.innerHTML = `<strong>${emp.numEmpenho}</strong> (R$ ${emp.valorEmpenho})`; li.onclick = () => selecionarEmpenhoDaBusca(emp); listaResultadosEmpenho.appendChild(li); }); }
    }
});
function selecionarEmpenhoDaBusca(emp) {
    empenhoTemporarioSelecionado = emp; document.getElementById('editIndexVinculo').value = -1;
    inputBuscaEmpenho.value = ''; listaResultadosEmpenho.innerHTML = ''; 
    document.getElementById('detalhesVinculoEmpenho').style.display = 'block'; document.getElementById('empenhoSelecionadoTexto').textContent = emp.numEmpenho;
    document.getElementById('btnAdicionarVinculo').textContent = "+ Adicionar";
    document.getElementById('vinculoND').value = emp.nd || ''; document.getElementById('vinculoFR').value = emp.fr || '';
    document.getElementById('vinculoValor').value = ''; document.getElementById('vinculoLF').value = ''; document.getElementById('vinculoPF').value = '';
}
function editarEmpenhoDaNota(index) {
    const vinculo = empenhosDaNotaAtual[index]; empenhoTemporarioSelecionado = { numEmpenho: vinculo.numEmpenho, nd: vinculo.nd, fr: vinculo.fr };
    document.getElementById('editIndexVinculo').value = index; document.getElementById('detalhesVinculoEmpenho').style.display = 'block';
    document.getElementById('empenhoSelecionadoTexto').textContent = vinculo.numEmpenho + " (Editando...)"; document.getElementById('btnAdicionarVinculo').textContent = "💾 Atualizar";
    document.getElementById('vinculoND').value = vinculo.nd || ''; document.getElementById('vinculoFR').value = vinculo.fr || '';
    document.getElementById('vinculoValor').value = vinculo.valorVinculado || ''; document.getElementById('vinculoLF').value = vinculo.lf || ''; document.getElementById('vinculoPF').value = vinculo.pf || '';
}
function cancelarEdicaoVinculo() { empenhoTemporarioSelecionado = null; document.getElementById('editIndexVinculo').value = -1; document.getElementById('detalhesVinculoEmpenho').style.display = 'none'; }
function adicionarEmpenhoNaNota() {
    if (!empenhoTemporarioSelecionado) return;
    const editIndex = document.getElementById('editIndexVinculo').value;
    if (editIndex == -1 && empenhosDaNotaAtual.find(e => e.numEmpenho === empenhoTemporarioSelecionado.numEmpenho)) { alert("Este empenho já foi adicionado!"); return; }
    const novoVinculo = { numEmpenho: empenhoTemporarioSelecionado.numEmpenho, nd: document.getElementById('vinculoND').value, fr: document.getElementById('vinculoFR').value, valorVinculado: document.getElementById('vinculoValor').value, lf: document.getElementById('vinculoLF').value, pf: document.getElementById('vinculoPF').value };
    if (editIndex == -1) { empenhosDaNotaAtual.push(novoVinculo); } else { empenhosDaNotaAtual[editIndex] = novoVinculo; }
    cancelarEdicaoVinculo(); desenharMiniTabelaEmpenhos(); 
}
function desenharMiniTabelaEmpenhos() {
    const tbody = document.querySelector('#tabelaEmpenhosDaNota tbody'); tbody.innerHTML = '';
    if (empenhosDaNotaAtual.length === 0) { tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;">Nenhum empenho.</td></tr>'; return; }
    empenhosDaNotaAtual.forEach((vinculo, index) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${vinculo.numEmpenho}</td><td>R$ ${vinculo.valorVinculado || '0'}</td><td>${vinculo.nd || ''}</td><td>${vinculo.fr || ''}</td><td>${vinculo.lf || ''}</td><td>${vinculo.pf || ''}</td><td><button type="button" onclick="editarEmpenhoDaNota(${index})" class="btn-icon">✏️</button><button type="button" onclick="removerEmpenhoDaNota(${index})" class="btn-icon">🗑️</button></td>`;
        tbody.appendChild(tr);
    });
}
function removerEmpenhoDaNota(index) { empenhosDaNotaAtual.splice(index, 1); desenharMiniTabelaEmpenhos(); }

// --- SALVAR TÍTULO ---
formTitulo.addEventListener('submit', function(e) {
    e.preventDefault(); 
    
    if (empenhosDaNotaAtual.length === 0) { alert("ATENÇÃO: É obrigatório vincular pelo menos um Empenho a esta nota!"); return; }
    
    let idGerado = document.getElementById('idProc').value; let fbID = document.getElementById('editIndexTitulo').value;
    if ((fbID == -1 || fbID === "") && !idGerado) { idGerado = gerarProximoId(); document.getElementById('idProc').value = idGerado; }

    const dados = { 
        idProc: idGerado || document.getElementById('idProc').value, dataExefin: document.getElementById('dataExefin').value, numTC: document.getElementById('numTC').value,
        empresa: document.getElementById('readEmpresa').value, cnpj: document.getElementById('readCnpj').value, contrato: document.getElementById('readContrato').value,
        nup: document.getElementById('readNup').value, afCpv: document.getElementById('readAfCpv').value, licitacao: document.getElementById('readLicitacao').value,
        vigencia: document.getElementById('readVigencia').value, simples: document.getElementById('readSimples').value, codReceita: document.getElementById('readCodReceita').value,
        valorContrato: document.getElementById('readValorContrato').value, valorNotaFiscal: document.getElementById('valorNotaFiscal').value, dataEmissao: document.getElementById('dataEmissao').value,
        dataAteste: document.getElementById('dataAteste').value, empenhosVinculados: empenhosDaNotaAtual, notaFiscal: document.getElementById('notaFiscal').value 
    };
    
    if (fbID == -1 || fbID === "") { 
        db.collection('titulos').add(dados).then(() => { moduloAtualModal = "titulos"; abrirModalGenérico(`Processamento ${dados.idProc} salvo com sucesso!`); });
    } else { 
        db.collection('titulos').doc(fbID).update(dados).then(() => { moduloAtualModal = "titulos"; abrirModalGenérico(`Processamento ${dados.idProc} atualizado!`); });
    }
});

function editarTitulo(indexOriginal) {
    const titulo = baseTitulos[indexOriginal]; document.getElementById('editIndexTitulo').value = titulo.id; document.getElementById('idProc').value = titulo.idProc; 
    const badge = document.getElementById('badgeStatusProc'); badge.textContent = titulo.idProc; badge.className = "badge-status salvo";
    document.getElementById('dataExefin').value = titulo.dataExefin || ''; document.getElementById('numTC').value = titulo.numTC || '';
    document.getElementById('valorNotaFiscal').value = titulo.valorNotaFiscal || ''; document.getElementById('dataEmissao').value = titulo.dataEmissao || '';
    document.getElementById('dataAteste').value = titulo.dataAteste || ''; document.getElementById('notaFiscal').value = titulo.notaFiscal || '';

    if (titulo.empresa) {
        document.getElementById('dadosContratoSelecionado').style.display = 'block'; document.getElementById('readEmpresa').value = titulo.empresa;
        document.getElementById('readCnpj').value = titulo.cnpj || ''; document.getElementById('readContrato').value = titulo.contrato || '';
        document.getElementById('readNup').value = titulo.nup || ''; document.getElementById('readAfCpv').value = titulo.afCpv || '';
        document.getElementById('readLicitacao').value = titulo.licitacao || ''; document.getElementById('readVigencia').value = titulo.vigencia || '';
        document.getElementById('readSimples').value = titulo.simples || ''; document.getElementById('readCodReceita').value = titulo.codReceita || '';
        document.getElementById('readValorContrato').value = titulo.valorContrato || '';
    } else { document.getElementById('dadosContratoSelecionado').style.display = 'none'; }

    empenhosDaNotaAtual = titulo.empenhosVinculados ? JSON.parse(JSON.stringify(titulo.empenhosVinculados)) : [];
    desenharMiniTabelaEmpenhos(); document.getElementById('detalhesVinculoEmpenho').style.display = 'none';
    document.getElementById('tela-lista-titulos').style.display = 'none'; document.getElementById('tela-formulario-titulos').style.display = 'block';
}

function apagarTitulo(indexOriginal) { 
    const t = baseTitulos[indexOriginal];
    if (confirm("Apagar Título?")) { 
        db.collection('titulos').doc(t.id).delete();
        if (itensExibidosAtualmente.length === 1 && paginaAtual > 1) paginaAtual--; 
    } 
}
function gerarProximoId() { if (baseTitulos.length === 0) return "PROC-001"; const num = Math.max(...baseTitulos.map(r => parseInt(r.idProc.split('-')[1]))) + 1; return "PROC-" + num.toString().padStart(3, '0'); }
function exportarDadosTitulos(formato) {
    const tipo = document.getElementById('tipoExportacaoTitulos').value; let dados = tipo === 'visiveis' ? itensExibidosAtualmente : baseTitulos;
    if (dados.length === 0) return alert("Vazio.");
    const flat = dados.map(t => {
        let empTxt = Array.isArray(t.empenhosVinculados) ? t.empenhosVinculados.map(e => `${e.numEmpenho}`).join(" | ") : "";
        return { "ID_PROC": t.idProc, "EXEFIN": t.dataExefin, "TC": t.numTC, "EMPRESA": t.empresa, "VALOR_NF": t.valorNotaFiscal, "NOTA_FISCAL": t.notaFiscal, "EMPENHOS": empTxt };
    });
    const arquivo = `Titulos_${tipo}_${new Date().toISOString().slice(0,10)}`;
    if (formato === 'json') { fazerDownload(new Blob([JSON.stringify(dados, null, 2)], { type: "application/json" }), `${arquivo}.json`); } 
    else { const folha = XLSX.utils.json_to_sheet(flat); const livro = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(livro, folha, "Titulos"); XLSX.writeFile(livro, `${arquivo}.${formato}`); }
}
function fazerDownload(blob, nomeArquivo) { const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = nomeArquivo; document.body.appendChild(link); link.click(); document.body.removeChild(link); }

// ==========================================
// 5. BACKUP GLOBAL
// ==========================================
function exportarBancoDeDados() { fazerDownload(new Blob([JSON.stringify({ empenhos: baseEmpenhos, contratos: baseContratos, darf: baseDarf, titulos: baseTitulos }, null, 2)], { type: "application/json" }), `Backup_${new Date().toISOString().slice(0,10)}.json`); }
document.getElementById('fileImportGlobal').addEventListener('change', function(e) {
    const f = e.target.files[0]; if (!f) return; const l = new FileReader();
    l.onload = function(ev) {
        try {
            const d = JSON.parse(ev.target.result);
            if(d.empenhos && d.titulos) {
                // Ao invés de salvar no LocalStorage, no futuro criaremos uma rotina de importação total para a nuvem.
                alert("O restauro via JSON sobrepõe apenas arquivos locais nesta versão Firebase. Por favor, importe módulo a módulo via Excel para maior segurança.");
            } else alert("Inválido.");
        } catch (er) { alert("Erro."); }
        e.target.value = ''; 
    }; l.readAsText(f);
});

// ==========================================
// 6. MODAL GENÉRICO
// ==========================================
function abrirModalGenérico(mensagem) { document.getElementById('msgSucessoTexto').textContent = mensagem; document.getElementById('modalSucessoGeral').style.display = 'flex'; }
function acaoModalSucesso(acao) {
    document.getElementById('modalSucessoGeral').style.display = 'none';
    if (moduloAtualModal === "titulos") {
        if (acao === 'continuar') { const badge = document.getElementById('badgeStatusProc'); badge.textContent = document.getElementById('idProc').value; badge.className = "badge-status salvo"; } 
        else if (acao === 'proximo') { abrirFormularioTitulo(); } 
        else if (acao === 'fechar') { voltarParaListaTitulos(); }
    }
}
