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
        escutarFirebase();
    } else {
        window.location.href = "index.html";
    }
});

function fazerLogout() { auth.signOut(); }

// ==========================================
// 1. VARIÁVEIS E ESTADO
// ==========================================
let baseEmpenhos = []; let baseContratos = []; let baseDarf = []; let baseTitulos = [];
let paginaAtualEmpenhos = 1; let itensPorPaginaEmpenhos = 10; let termoBuscaEmpenhos = "";
let paginaAtualContratos = 1; let itensPorPaginaContratos = 10; let termoBuscaContratos = "";
let paginaAtualDarf = 1; let itensPorPaginaDarf = 10; let termoBuscaDarf = "";
let darfsDoContratoAtual = []; 

// ORDENAÇÃO
let estadoOrdenacao = {
    empenhos: { coluna: 'numEmpenho', direcao: 'asc' },
    contratos: { coluna: 'fornecedor', direcao: 'asc' },
    darf: { coluna: 'codigo', direcao: 'asc' },
    titulos: { coluna: 'idProc', direcao: 'asc' }
};

function ordenarTabela(modulo, coluna) {
    if (estadoOrdenacao[modulo].coluna === coluna) { estadoOrdenacao[modulo].direcao = estadoOrdenacao[modulo].direcao === 'asc' ? 'desc' : 'asc'; } 
    else { estadoOrdenacao[modulo].coluna = coluna; estadoOrdenacao[modulo].direcao = 'asc'; }
    document.querySelectorAll(`[id^="sort-${modulo}-"]`).forEach(el => el.innerHTML = '');
    const iconEl = document.getElementById(`sort-${modulo}-${coluna}`);
    if(iconEl) iconEl.innerHTML = estadoOrdenacao[modulo].direcao === 'asc' ? '▲' : '▼';

    if (modulo === 'empenhos') { paginaAtualEmpenhos = 1; atualizarTabelaEmpenhos(); }
    if (modulo === 'contratos') { paginaAtualContratos = 1; atualizarTabelaContratos(); }
    if (modulo === 'darf') { paginaAtualDarf = 1; atualizarTabelaDarf(); }
}

function aplicarOrdenacao(array, modulo) {
    const { coluna, direcao } = estadoOrdenacao[modulo];
    return array.sort((a, b) => {
        let valA = a[coluna] !== undefined && a[coluna] !== null ? a[coluna] : '';
        let valB = b[coluna] !== undefined && b[coluna] !== null ? b[coluna] : '';
        if (!isNaN(valA) && !isNaN(valB) && valA !== '' && valB !== '') { valA = Number(valA); valB = Number(valB); } 
        else { valA = String(valA).toLowerCase(); valB = String(valB).toLowerCase(); }
        if (valA < valB) return direcao === 'asc' ? -1 : 1;
        if (valA > valB) return direcao === 'asc' ? 1 : -1;
        return 0;
    });
}
function inicializarSetasOrdenacao() {
    ['empenhos', 'contratos', 'darf'].forEach(modulo => {
        const col = estadoOrdenacao[modulo].coluna; const iconEl = document.getElementById(`sort-${modulo}-${col}`);
        if(iconEl) iconEl.innerHTML = estadoOrdenacao[modulo].direcao === 'asc' ? '▲' : '▼';
    });
}

// SINCRONIZAÇÃO FIREBASE
function escutarFirebase() {
    db.collection('empenhos').onSnapshot(snap => { baseEmpenhos = snap.docs.map(doc => ({ id: doc.id, ...doc.data() })); atualizarTabelaEmpenhos(); });
    db.collection('contratos').onSnapshot(snap => { baseContratos = snap.docs.map(doc => ({ id: doc.id, ...doc.data() })); atualizarTabelaContratos(); });
    db.collection('darf').onSnapshot(snap => { baseDarf = snap.docs.map(doc => ({ id: doc.id, ...doc.data() })); atualizarTabelaDarf(); });
}

function mostrarSecao(idSecao, botao) {
    document.querySelectorAll('.secao').forEach(s => s.style.display = 'none');
    document.getElementById(idSecao).style.display = 'block';
    document.querySelectorAll('.menu-btn').forEach(b => b.classList.remove('ativo')); if(botao) botao.classList.add('ativo');
    
    document.getElementById('tela-formulario-empenhos').style.display = 'none'; document.getElementById('tela-lista-empenhos').style.display = 'block';
    document.getElementById('tela-formulario-contratos').style.display = 'none'; document.getElementById('tela-lista-contratos').style.display = 'block';
    document.getElementById('tela-formulario-darf').style.display = 'none'; document.getElementById('tela-lista-darf').style.display = 'block';

    atualizarTabelaEmpenhos(); atualizarTabelaContratos(); atualizarTabelaDarf(); inicializarSetasOrdenacao();
}

// ==========================================
// MÓDULO: EMPENHOS
// ==========================================
const formEmpenho = document.getElementById('formEmpenho');
const tabelaEmpenhosBody = document.querySelector('#tabelaEmpenhos tbody');

function abrirFormularioEmpenho(isEdit = false) { 
    if(!isEdit) { formEmpenho.reset(); document.getElementById('editIndexEmpenho').value = -1; }
    document.getElementById('tela-lista-empenhos').style.display = 'none'; document.getElementById('tela-formulario-empenhos').style.display = 'block'; 
}
function voltarParaListaEmpenhos() { document.getElementById('tela-formulario-empenhos').style.display = 'none'; document.getElementById('tela-lista-empenhos').style.display = 'block'; atualizarTabelaEmpenhos(); }
function filtrarTabelaEmpenhos() { termoBuscaEmpenhos = document.getElementById('buscaTabelaEmpenhos').value.toLowerCase(); paginaAtualEmpenhos = 1; atualizarTabelaEmpenhos(); }

function atualizarTabelaEmpenhos() {
    tabelaEmpenhosBody.innerHTML = '';
    let baseFiltrada = baseEmpenhos.map((emp, index) => ({ ...emp, indexOriginal: index }));
    if (termoBuscaEmpenhos.trim() !== "") { baseFiltrada = baseFiltrada.filter(emp => (emp.numEmpenho && emp.numEmpenho.toLowerCase().includes(termoBuscaEmpenhos)) || (emp.contrato && emp.contrato.toLowerCase().includes(termoBuscaEmpenhos))); }
    baseFiltrada = aplicarOrdenacao(baseFiltrada, 'empenhos');

    const inicio = (paginaAtualEmpenhos - 1) * itensPorPaginaEmpenhos; const fim = inicio + parseInt(itensPorPaginaEmpenhos);
    let itensExibidosAtualmenteEmpenhos = baseFiltrada.slice(inicio, fim);
    if (itensExibidosAtualmenteEmpenhos.length === 0) { tabelaEmpenhosBody.innerHTML = '<tr><td colspan="11" style="text-align:center;">Nenhum registo.</td></tr>'; }
    
    itensExibidosAtualmenteEmpenhos.forEach((emp) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td><strong>${emp.numEmpenho}</strong></td><td>${emp.nd || '-'}</td><td>${emp.subitem || '-'}</td><td>${emp.ptres || '-'}</td><td>${emp.fr || '-'}</td><td>${emp.docOrig || '-'}</td><td>${emp.oi || '-'}</td><td>${emp.contrato || '-'}</td><td>${emp.cap || '-'}</td><td>${emp.meio || '-'}</td><td><button type="button" class="btn-icon" onclick="editarEmpenho('${emp.id}')">✏️</button><button type="button" class="btn-icon" onclick="apagarEmpenho('${emp.id}')">🗑️</button></td>`;
        tabelaEmpenhosBody.appendChild(tr);
    });
    const total = Math.ceil(baseFiltrada.length / itensPorPaginaEmpenhos) || 1;
    document.getElementById('infoPaginaEmpenhos').innerText = `Página ${paginaAtualEmpenhos} de ${total}`;
    document.getElementById('btnAnteriorEmpenhos').disabled = paginaAtualEmpenhos === 1; document.getElementById('btnProximoEmpenhos').disabled = paginaAtualEmpenhos === total;
}

function mudarTamanhoPaginaEmpenhos() { itensPorPaginaEmpenhos = document.getElementById('itensPorPaginaEmpenhos').value; paginaAtualEmpenhos = 1; atualizarTabelaEmpenhos(); }
function mudarPaginaEmpenhos(direcao) { paginaAtualEmpenhos += direcao; atualizarTabelaEmpenhos(); }

function editarEmpenho(id) {
    const emp = baseEmpenhos.find(e => e.id === id);
    if(emp) {
        abrirFormularioEmpenho(true); document.getElementById('editIndexEmpenho').value = emp.id; 
        document.getElementById('numEmpenho').value = emp.numEmpenho || ''; document.getElementById('dataEmpenho').value = emp.dataEmpenho || ''; 
        document.getElementById('valorEmpenho').value = emp.valorEmpenho || ''; document.getElementById('ndEmpenho').value = emp.nd || ''; 
        document.getElementById('subitemEmpenho').value = emp.subitem || ''; document.getElementById('ptresEmpenho').value = emp.ptres || ''; 
        document.getElementById('frEmpenho').value = emp.fr || ''; document.getElementById('docOrigEmpenho').value = emp.docOrig || ''; 
        document.getElementById('oiEmpenho').value = emp.oi || ''; document.getElementById('contratoEmpenho').value = emp.contrato || ''; 
        document.getElementById('capEmpenho').value = emp.cap || ''; document.getElementById('altcredEmpenho').value = emp.altcred || ''; 
        document.getElementById('meioEmpenho').value = emp.meio || ''; document.getElementById('descricaoEmpenho').value = emp.descricao || '';
    }
}

function apagarEmpenho(id) { if (confirm("Apagar empenho?")) db.collection('empenhos').doc(id).delete(); }

formEmpenho.addEventListener('submit', function(e) {
    e.preventDefault(); const fbID = document.getElementById('editIndexEmpenho').value; 
    const dados = { numEmpenho: document.getElementById('numEmpenho').value, dataEmpenho: document.getElementById('dataEmpenho').value, valorEmpenho: document.getElementById('valorEmpenho').value, nd: document.getElementById('ndEmpenho').value, subitem: document.getElementById('subitemEmpenho').value, ptres: document.getElementById('ptresEmpenho').value, fr: document.getElementById('frEmpenho').value, docOrig: document.getElementById('docOrigEmpenho').value, oi: document.getElementById('oiEmpenho').value, contrato: document.getElementById('contratoEmpenho').value, cap: document.getElementById('capEmpenho').value, altcred: document.getElementById('altcredEmpenho').value, meio: document.getElementById('meioEmpenho').value, descricao: document.getElementById('descricaoEmpenho').value };
    if (fbID == -1 || fbID === "") { db.collection('empenhos').add(dados).then(() => voltarParaListaEmpenhos()); } else { db.collection('empenhos').doc(fbID).update(dados).then(() => voltarParaListaEmpenhos()); }
});

document.getElementById('fileImportEmpenhos').addEventListener('change', function(evento) {
    const ficheiro = evento.target.files[0]; if (!ficheiro) return; const leitor = new FileReader();
    leitor.onload = function(e) {
        try {
            const dados = new Uint8Array(e.target.result); const folha = XLSX.read(dados, {type: 'array'}).Sheets[XLSX.read(dados, {type: 'array'}).SheetNames[0]];
            const dadosImportados = XLSX.utils.sheet_to_json(folha, {raw: false, defval: ""});
            let contadorSucesso = 0;
            dadosImportados.forEach(linha => {
                const ne = linha['ne_completa'] || linha['NE']; if(!ne) return;
                const novo = { numEmpenho: String(ne).trim(), nd: linha['nd_naturezaDespesa'] || linha['ND'] || '', subitem: String(linha['subelemento'] || linha['SUBITEM'] || '').padStart(2, '0'), ptres: linha['ptres'] || linha['PTRES'] || '', fr: linha['fr_fonte_recurso'] || linha['FR'] || '', docOrig: linha['aes_solemp'] || linha['AES'] || '', oi: linha['org_interna'] || linha['OI'] || '', contrato: linha['contrato'] || linha['CONTRATO'] || '', cap: linha['cap'] || linha['CAP'] || '', altcred: linha['altcred'] || linha['ALTCRED'] || '', meio: linha['meio_om'] || linha['MEIO'] || '', descricao: linha['DESCRIÇÃO'] || '' };
                db.collection('empenhos').add(novo); contadorSucesso++;
            });
            if (contadorSucesso > 0) alert(`A enviar ${contadorSucesso} empenhos...`);
        } catch (erro) { alert("Erro: " + erro.message); }
        evento.target.value = ''; 
    }; leitor.readAsArrayBuffer(ficheiro);
});

function exportarEmpenhos(formato) { 
    if (baseEmpenhos.length === 0) return alert("Vazio."); 
    const exp = baseEmpenhos.map(emp => ({ "ne_completa": emp.numEmpenho, "nd_naturezaDespesa": emp.nd, "subelemento": emp.subitem, "ptres": emp.ptres, "fr_fonte_recurso": emp.fr, "aes_solemp": emp.docOrig, "org_interna": emp.oi, "contrato": emp.contrato, "cap": emp.cap, "altcred": emp.altcred, "meio_om": emp.meio, "descricao": emp.descricao }));
    const folha = XLSX.utils.json_to_sheet(exp); const livro = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(livro, folha, "Empenhos"); XLSX.writeFile(livro, `Empenhos_${new Date().toISOString().slice(0,10)}.${formato}`); 
}

// ==========================================
// MÓDULO: CONTRATOS E EMPRESAS
// ==========================================
const formContrato = document.getElementById('formContrato');
const tabelaContratosBody = document.querySelector('#tabelaContratos tbody');

function abrirFormularioContrato(isEdit = false) { 
    if(!isEdit) { formContrato.reset(); document.getElementById('editIndexContrato').value = -1; darfsDoContratoAtual = []; desenharDarfsContrato(); }
    document.getElementById('tela-lista-contratos').style.display = 'none'; document.getElementById('tela-formulario-contratos').style.display = 'block';
}
function voltarParaListaContratos() { document.getElementById('tela-formulario-contratos').style.display = 'none'; document.getElementById('tela-lista-contratos').style.display = 'block'; atualizarTabelaContratos(); }
function filtrarTabelaContratos() { termoBuscaContratos = document.getElementById('buscaTabelaContratos').value.toLowerCase(); paginaAtualContratos = 1; atualizarTabelaContratos(); }

function atualizarTabelaContratos() {
    tabelaContratosBody.innerHTML = ''; let baseFiltrada = baseContratos.map((c, index) => ({ ...c, indexOriginal: index }));
    if (termoBuscaContratos.trim() !== "") { baseFiltrada = baseFiltrada.filter(c => (c.fornecedor && c.fornecedor.toLowerCase().includes(termoBuscaContratos)) || (c.numContrato && c.numContrato.toLowerCase().includes(termoBuscaContratos))); }
    baseFiltrada = aplicarOrdenacao(baseFiltrada, 'contratos');

    const inicio = (paginaAtualContratos - 1) * itensPorPaginaContratos; const fim = inicio + parseInt(itensPorPaginaContratos);
    let itensExibidosAtualmenteContratos = baseFiltrada.slice(inicio, fim);
    if (itensExibidosAtualmenteContratos.length === 0) { tabelaContratosBody.innerHTML = '<tr><td colspan="8" style="text-align:center;">Nenhum contrato encontrado.</td></tr>'; }

    itensExibidosAtualmenteContratos.forEach((c) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${c.idContrato || '-'}</td><td><strong>${c.numContrato || '-'}</strong></td><td>${c.fornecedor || '-'}</td><td>${c.dataInicio || '-'}</td><td>${c.dataFim || '-'}</td><td>${c.valorContrato || '-'}</td><td>${c.situacao || '-'}</td>
            <td><button type="button" class="btn-icon" onclick="editarContrato('${c.id}')">✏️</button><button type="button" class="btn-icon" onclick="apagarContrato('${c.id}')">🗑️</button></td>`;
        tabelaContratosBody.appendChild(tr);
    });
    const total = Math.ceil(baseFiltrada.length / itensPorPaginaContratos) || 1;
    document.getElementById('infoPaginaContratos').innerText = `Página ${paginaAtualContratos} de ${total}`;
    document.getElementById('btnAnteriorContratos').disabled = paginaAtualContratos === 1; document.getElementById('btnProximoContratos').disabled = paginaAtualContratos === total;
}

function mudarTamanhoPaginaContratos() { itensPorPaginaContratos = document.getElementById('itensPorPaginaContratos').value; paginaAtualContratos = 1; atualizarTabelaContratos(); }
function mudarPaginaContratos(direcao) { paginaAtualContratos += direcao; atualizarTabelaContratos(); }

function editarContrato(id) {
    const c = baseContratos.find(item => item.id === id);
    if(c) {
        abrirFormularioContrato(true); document.getElementById('editIndexContrato').value = c.id; 
        document.getElementById('idContrato').value = c.idContrato || ''; document.getElementById('numContrato').value = c.numContrato || '';
        document.getElementById('situacaoContrato').value = c.situacao || ''; document.getElementById('fornecedorContrato').value = c.fornecedor || '';
        document.getElementById('nupContrato').value = c.nup || ''; document.getElementById('dataInicio').value = c.dataInicio || '';
        document.getElementById('dataFim').value = c.dataFim || ''; 
        
        let valorTratado = c.valorContrato;
        if(typeof valorTratado === 'string' && valorTratado.includes('R$')) {
            valorTratado = valorTratado.replace('R$', '').replace(/\./g, '').replace(',', '.').trim();
        }
        document.getElementById('valorContrato').value = parseFloat(valorTratado) || '';

        if (c.codigosReceita && Array.isArray(c.codigosReceita)) { darfsDoContratoAtual = [...c.codigosReceita]; } else { darfsDoContratoAtual = []; }
        desenharDarfsContrato();
    }
}

function apagarContrato(id) { if (confirm("Apagar Contrato?")) { db.collection('contratos').doc(id).delete(); } }

formContrato.addEventListener('submit', function(e) {
    e.preventDefault(); const fbID = document.getElementById('editIndexContrato').value;
    
    // Formata o valor de volta para string R$ no padrão do seu DB original
    let numVal = parseFloat(document.getElementById('valorContrato').value) || 0;
    let stringValor = numVal.toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'});

    const dados = { idContrato: document.getElementById('idContrato').value, numContrato: document.getElementById('numContrato').value, situacao: document.getElementById('situacaoContrato').value, fornecedor: document.getElementById('fornecedorContrato').value, nup: document.getElementById('nupContrato').value, dataInicio: document.getElementById('dataInicio').value, dataFim: document.getElementById('dataFim').value, valorContrato: stringValor, codigosReceita: darfsDoContratoAtual };
    
    if (fbID == -1 || fbID === "") { db.collection('contratos').add(dados).then(() => voltarParaListaContratos()); } else { db.collection('contratos').doc(fbID).update(dados).then(() => voltarParaListaContratos()); }
});

const inputBuscaDarfContrato = document.getElementById('buscaDarfContrato'); const listaResultadosDarf = document.getElementById('listaResultadosDarf');
inputBuscaDarfContrato.addEventListener('input', function() {
    const texto = this.value.toLowerCase(); listaResultadosDarf.innerHTML = '';
    if (texto.length >= 2) {
        const resultados = baseDarf.filter(d => d.codigo.includes(texto) || d.aplicacao.toLowerCase().includes(texto));
        if (resultados.length === 0) { listaResultadosDarf.innerHTML = '<li style="color:red; padding:10px;">Nenhum DARF encontrado.</li>'; }
        else { resultados.forEach(d => { const li = document.createElement('li'); li.innerHTML = `<strong>${d.codigo}</strong> - ${d.aplicacao.substring(0, 40)}...`; li.onclick = () => selecionarDarfContrato(d); listaResultadosDarf.appendChild(li); }); }
    }
});
function selecionarDarfContrato(d) { if (!darfsDoContratoAtual.includes(d.codigo)) { darfsDoContratoAtual.push(d.codigo); desenharDarfsContrato(); } inputBuscaDarfContrato.value = ''; listaResultadosDarf.innerHTML = ''; }
function desenharDarfsContrato() { const container = document.getElementById('containerDarfsContrato'); container.innerHTML = ''; darfsDoContratoAtual.forEach((codigo, index) => { const span = document.createElement('span'); span.className = 'badge-tag'; span.innerHTML = `${codigo} <button type="button" onclick="removerDarfContrato(${index})">&times;</button>`; container.appendChild(span); }); }
function removerDarfContrato(index) { darfsDoContratoAtual.splice(index, 1); desenharDarfsContrato(); }

document.getElementById('fileImportContratos').addEventListener('change', function(evento) {
    const ficheiro = evento.target.files[0]; if (!ficheiro) return; const leitor = new FileReader();
    leitor.onload = function(e) {
        try {
            const dados = new Uint8Array(e.target.result); const folha = XLSX.read(dados, {type: 'array'}).Sheets[XLSX.read(dados, {type: 'array'}).SheetNames[0]];
            const dadosImportados = XLSX.utils.sheet_to_json(folha, {raw: false, defval: ""});
            let contadorSucesso = 0;
            dadosImportados.forEach(linha => {
                const fornecedor = linha['fornecedor'] || linha['FORNECEDOR']; if(!fornecedor) return; 
                const novoContrato = { idContrato: linha['id_contrato'] || '', numContrato: linha['num_instrum'] || '', fornecedor: String(fornecedor).trim(), nup: linha['nup_processo'] || '', dataInicio: linha['data_inicio'] || '', dataFim: linha['data_fim'] || '', valorContrato: linha['valor_global'] || '', situacao: linha['situacao'] || '', codigosReceita: [] };
                db.collection('contratos').add(novoContrato); contadorSucesso++;
            });
            if (contadorSucesso > 0) alert(`A enviar ${contadorSucesso} contratos...`); 
        } catch (erro) { alert("Erro ao importar: " + erro.message); }
        evento.target.value = ''; 
    }; leitor.readAsArrayBuffer(ficheiro);
});
function exportarContratos(formato) { 
    if (baseContratos.length === 0) return alert("Não há contratos."); 
    const exp = baseContratos.map(c => ({ "id_contrato": c.idContrato, "num_instrum": c.numContrato, "fornecedor": c.fornecedor, "nup_processo": c.nup, "data_inicio": c.dataInicio, "data_fim": c.dataFim, "valor_global": c.valorContrato, "situacao": c.situacao }));
    const folha = XLSX.utils.json_to_sheet(exp); const livro = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(livro, folha, "Contratos"); XLSX.writeFile(livro, `Contratos_${new Date().toISOString().slice(0,10)}.${formato}`); 
}

// ==========================================
// MÓDULO: DARF
// ==========================================
const formDarf = document.getElementById('formDarf');
const tabelaDarfBody = document.querySelector('#tabelaDarf tbody');

function abrirFormularioDarf(isEdit = false) { 
    if(!isEdit) { document.getElementById('formDarf').reset(); document.getElementById('editIndexDarf').value = -1; }
    document.getElementById('tela-lista-darf').style.display = 'none'; document.getElementById('tela-formulario-darf').style.display = 'block'; 
}
function voltarParaListaDarf() { document.getElementById('tela-formulario-darf').style.display = 'none'; document.getElementById('tela-lista-darf').style.display = 'block'; atualizarTabelaDarf(); }
function filtrarTabelaDarf() { termoBuscaDarf = document.getElementById('buscaTabelaDarf').value.toLowerCase(); paginaAtualDarf = 1; atualizarTabelaDarf(); }

function atualizarTabelaDarf() {
    tabelaDarfBody.innerHTML = ''; let baseFiltrada = baseDarf.map((d, index) => ({ ...d, indexOriginal: index }));
    if (termoBuscaDarf.trim() !== "") { baseFiltrada = baseFiltrada.filter(d => (d.codigo && String(d.codigo).includes(termoBuscaDarf)) || (d.natRendimento && String(d.natRendimento).includes(termoBuscaDarf))); }
    baseFiltrada = aplicarOrdenacao(baseFiltrada, 'darf');

    const inicio = (paginaAtualDarf - 1) * itensPorPaginaDarf; const fim = inicio + parseInt(itensPorPaginaDarf);
    let itensExibidosAtualmenteDarf = baseFiltrada.slice(inicio, fim);
    if (itensExibidosAtualmenteDarf.length === 0) { tabelaDarfBody.innerHTML = '<tr><td colspan="6" style="text-align:center;">Nenhum DARF encontrado.</td></tr>'; }

    itensExibidosAtualmenteDarf.forEach((d) => {
        const tr = document.createElement('tr');
        const aplicacaoCurta = d.aplicacao && d.aplicacao.length > 40 ? d.aplicacao.substring(0, 40) + "..." : d.aplicacao;
        tr.innerHTML = `<td><strong>${d.codigo}</strong></td><td>${d.natRendimento || '-'}</td><td title="${d.aplicacao}">${aplicacaoCurta || '-'}</td><td>${d.sitSiafi || '-'}</td><td>${d.total || '-'}</td>
            <td><button type="button" class="btn-icon" onclick="editarDarf('${d.id}')">✏️</button><button type="button" class="btn-icon" onclick="apagarDarf('${d.id}')">🗑️</button></td>`;
        tabelaDarfBody.appendChild(tr);
    });
    const total = Math.ceil(baseFiltrada.length / itensPorPaginaDarf) || 1;
    document.getElementById('infoPaginaDarf').innerText = `Página ${paginaAtualDarf} de ${total}`;
    document.getElementById('btnAnteriorDarf').disabled = paginaAtualDarf === 1; document.getElementById('btnProximoDarf').disabled = paginaAtualDarf === total;
}

function mudarTamanhoPaginaDarf() { itensPorPaginaDarf = document.getElementById('itensPorPaginaDarf').value; paginaAtualDarf = 1; atualizarTabelaDarf(); }
function mudarPaginaDarf(direcao) { paginaAtualDarf += direcao; atualizarTabelaDarf(); }

function editarDarf(id) {
    const d = baseDarf.find(item => item.id === id);
    if(d) {
        abrirFormularioDarf(true); document.getElementById('editIndexDarf').value = d.id;
        document.getElementById('codigoDarf').value = d.codigo || ''; document.getElementById('natRendimentoDarf').value = d.natRendimento || '';
        document.getElementById('sitSiafiDarf').value = d.sitSiafi || ''; document.getElementById('aplicacaoDarf').value = d.aplicacao || '';
        document.getElementById('irDarf').value = d.ir || ''; document.getElementById('csllDarf').value = d.csll || '';
        document.getElementById('cofinsDarf').value = d.cofins || ''; document.getElementById('pisDarf').value = d.pis || '';
        document.getElementById('totalDarf').value = d.total || '';
    }
}

function apagarDarf(id) { if (confirm(`Apagar o DARF?`)) { db.collection('darf').doc(id).delete(); } }

formDarf.addEventListener('submit', function(e) {
    e.preventDefault(); const fbID = document.getElementById('editIndexDarf').value;
    const dados = { codigo: document.getElementById('codigoDarf').value, natRendimento: document.getElementById('natRendimentoDarf').value, sitSiafi: document.getElementById('sitSiafiDarf').value, aplicacao: document.getElementById('aplicacaoDarf').value, ir: document.getElementById('irDarf').value, csll: document.getElementById('csllDarf').value, cofins: document.getElementById('cofinsDarf').value, pis: document.getElementById('pisDarf').value, total: document.getElementById('totalDarf').value };
    if (fbID == -1 || fbID === "") { db.collection('darf').add(dados).then(() => voltarParaListaDarf()); } else { db.collection('darf').doc(fbID).update(dados).then(() => voltarParaListaDarf()); }
});

document.getElementById('fileImportDarf').addEventListener('change', function(evento) {
    const ficheiro = evento.target.files[0]; if (!ficheiro) return; const leitor = new FileReader();
    leitor.onload = function(e) {
        try {
            const dados = new Uint8Array(e.target.result); const folha = XLSX.read(dados, {type: 'array'}).Sheets[XLSX.read(dados, {type: 'array'}).SheetNames[0]];
            const dadosImportados = XLSX.utils.sheet_to_json(folha, {raw: false, defval: ""});
            let contadorSucesso = 0;
            dadosImportados.forEach(linha => {
                let codigo = linha['cod_receita']; if(!codigo) return;
                const novoDarf = { codigo: String(codigo), natRendimento: linha['nat_rendimento'] || '', aplicacao: linha['aplicacao'] || '', ir: linha['perc_ir'] || '', csll: linha['perc_csll'] || '', cofins: linha['perc_cofins'] || '', pis: linha['perc_pis'] || '', total: linha['aliq_total'] || '', sitSiafi: linha['sit_siafi'] || '' };
                db.collection('darf').add(novoDarf); contadorSucesso++;
            });
            if (contadorSucesso > 0) alert(`A enviar ${contadorSucesso} códigos DARF...`); 
        } catch (erro) { alert("Erro: " + erro.message); }
        evento.target.value = ''; 
    }; leitor.readAsArrayBuffer(ficheiro);
});
function exportarDarf(formato) { 
    if (baseDarf.length === 0) return alert("Vazio."); 
    const exp = baseDarf.map(d => ({ "cod_receita": d.codigo, "nat_rendimento": d.natRendimento, "aplicacao": d.aplicacao, "perc_ir": d.ir, "perc_csll": d.csll, "perc_cofins": d.cofins, "perc_pis": d.pis, "aliq_total": d.total, "sit_siafi": d.sitSiafi }));
    const folha = XLSX.utils.json_to_sheet(exp); const livro = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(livro, folha, "DARF"); XLSX.writeFile(livro, `DARF_${new Date().toISOString().slice(0,10)}.${formato}`); 
}