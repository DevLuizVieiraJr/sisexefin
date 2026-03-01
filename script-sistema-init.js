// ==========================================
// SISTEMA (Tabelas de Apoio) - Inicialização por URL
// ==========================================
(function() {
    if (!document.getElementById('corpo-sistema')) return;
    const mapSecao = {
        empenhos: 'secao-empenhos',
        lf: 'secao-lf',
        pf: 'secao-pf',
        op: 'secao-op',
        darf: 'secao-darf',
        contratos: 'secao-contratos',
        backup: 'secao-backup'
    };
    const params = new URLSearchParams(window.location.search);
    const secaoParam = params.get('secao');
    const idSecao = secaoParam && mapSecao[secaoParam] ? mapSecao[secaoParam] : 'secao-empenhos';
    const botao = document.querySelector('button[onclick*="' + idSecao + '"]');
    setTimeout(function() {
        if (typeof mostrarSecao === 'function') {
            mostrarSecao(idSecao, botao || null);
        }
    }, 100);
})();
