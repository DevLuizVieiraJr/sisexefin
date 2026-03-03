// ==========================================
// MENU LATERAL - Fonte única para todas as páginas
// Atualize aqui e todas as páginas refletirão a mudança
// ==========================================
(function() {
    const MENU_HTML = `
        <li>
            <a href="dashboard.html" class="menu-btn menu-link-externo" data-menu-ativo="dashboard" style="width:100%;" title="Dashboard"><span class="menu-btn-icon">🏠</span><span class="menu-btn-text">Dashboard</span></a>
        </li>
        <li>
            <button type="button" class="menu-section-toggle" data-toggle="controle" title="Clique para expandir/recolher">Controle Orçamentário <span class="menu-section-chevron">▼</span></button>
            <ul class="menu-subgroup" id="sub-controle">
                <li><button type="button" class="menu-btn emdesevolvimento" onclick="alert('Em desenvolvimento.');" title="Em desenvolvimento"><span class="menu-btn-icon">📋</span><span class="menu-btn-text">Solicitação de Empenho</span></button></li>
                <li><button type="button" class="menu-btn emdesevolvimento" onclick="alert('Em desenvolvimento.');" title="Em desenvolvimento"><span class="menu-btn-icon">📝</span><span class="menu-btn-text">Alteração de Crédito</span></button></li>
            </ul>
        </li>
        <li data-permission="titulos_ler">
            <a href="titulos.html" class="menu-btn menu-link-externo" data-menu-ativo="titulos" style="width:100%;" title="Títulos de Crédito"><span class="menu-btn-icon">📥</span><span class="menu-btn-text">Títulos de Crédito</span></a>
        </li>
        <li>
            <button type="button" class="menu-section-toggle" data-toggle="tabelas" title="Clique para expandir/recolher">Tabelas de Apoio <span class="menu-section-chevron">▼</span></button>
            <ul class="menu-subgroup" id="sub-tabelas">
                <li data-permission="empenhos_ler"><a href="sistema.html?secao=empenhos" class="menu-btn menu-link-externo" style="width:100%;" title="Nota de Empenho"><span class="menu-btn-icon">📄</span><span class="menu-btn-text">Nota de Empenho (NE)</span></a></li>
                <li data-permission="lf_ler"><a href="sistema.html?secao=lf" class="menu-btn menu-link-externo" style="width:100%;" title="Liquidação Financeira"><span class="menu-btn-icon">💰</span><span class="menu-btn-text">Liquidação Financeira (LF)</span></a></li>
                <li data-permission="pf_ler"><a href="sistema.html?secao=pf" class="menu-btn menu-link-externo" style="width:100%;" title="Pedido Financeiro"><span class="menu-btn-icon">📋</span><span class="menu-btn-text">Pedido Financeiro (PF)</span></a></li>
                <li data-permission="op_ler"><a href="sistema.html?secao=op" class="menu-btn menu-link-externo" style="width:100%;" title="Operação de Pagamento"><span class="menu-btn-icon">💳</span><span class="menu-btn-text">Operação de Pagamento (OP)</span></a></li>
                <li><button type="button" class="menu-btn emdesevolvimento" onclick="alert('Em desenvolvimento.');" title="Em desenvolvimento"><span class="menu-btn-icon">🏦</span><span class="menu-btn-text">Ordem Bancária (OB)</span></button></li>
                <li data-permission="darf_ler"><a href="sistema.html?secao=darf" class="menu-btn menu-link-externo" style="width:100%;" title="DARF"><span class="menu-btn-icon">📊</span><span class="menu-btn-text">DARF</span></a></li>
                <li data-permission="contratos_ler"><a href="sistema.html?secao=contratos" class="menu-btn menu-link-externo" style="width:100%;" title="Gestão de Contratos"><span class="menu-btn-icon">🤝</span><span class="menu-btn-text">Contratos</span></a></li>
            </ul>
        </li>
        <li>
            <button type="button" class="menu-section-toggle" data-toggle="links" title="Clique para expandir/recolher">Links Rápido <span class="menu-section-chevron">▼</span></button>
            <ul class="menu-subgroup" id="sub-links">
                <li><a href="https://siplad.mb" target="_blank" rel="noopener" class="menu-btn menu-link-externo" style="width:100%;" title="SIPLAD"><span class="menu-btn-icon">🔗</span><span class="menu-btn-text">SIPLAD</span></a></li>
                <li><a href="https://safin.mb" target="_blank" rel="noopener" class="menu-btn menu-link-externo" style="width:100%;" title="SAFIN"><span class="menu-btn-icon">🔗</span><span class="menu-btn-text">SAFIN</span></a></li>
                <li><a href="https://siafi.tesouro.gov.br" target="_blank" rel="noopener" class="menu-btn menu-link-externo" style="width:100%;" title="SIAFI"><span class="menu-btn-icon">🔗</span><span class="menu-btn-text">SIAFI</span></a></li>
                <li><a href="https://contratos.sistema.gov.br" target="_blank" rel="noopener" class="menu-btn menu-link-externo" style="width:100%;" title="Contratos (Gov)"><span class="menu-btn-icon">🔗</span><span class="menu-btn-text">Contratos (Gov)</span></a></li>
                <li><a href="https://tesourogerencial.tesouro.gov.br" target="_blank" rel="noopener" class="menu-btn menu-link-externo" style="width:100%;" title="Tesouro Gerencial"><span class="menu-btn-icon">🔗</span><span class="menu-btn-text">Tesouro Gerencial</span></a></li>
            </ul>
        </li>
        <li data-permission="acesso_admin">
            <a href="admin.html" class="menu-btn menu-link-externo" data-menu-ativo="admin" style="width:100%; color:#f39c12;" title="Controle de Acesso"><span class="menu-btn-icon">🛡️</span><span class="menu-btn-text">Controle de Acesso</span></a>
        </li>
    `;

    function detectarPaginaAtiva() {
        const path = window.location.pathname || '';
        const search = window.location.search || '';
        if (path.includes('admin.html')) return 'admin';
        if (path.includes('titulos.html')) return 'titulos';
        if (path.includes('sistema.html')) {
            const secao = new URLSearchParams(search).get('secao');
            return secao || 'sistema';
        }
        if (path.includes('dashboard.html') || path === '/' || path.endsWith('/')) return 'dashboard';
        return 'dashboard';
    }

    function injetarMenu() {
        const ul = document.querySelector('#sidebar ul');
        if (!ul) return;
        ul.innerHTML = MENU_HTML;
        const ativo = detectarPaginaAtiva();
        const elAtivo = ul.querySelector('[data-menu-ativo="' + ativo + '"]');
        if (elAtivo) {
            elAtivo.classList.add('ativo');
        } else if (ativo === 'sistema' || ['empenhos','lf','pf','op','darf','contratos','titulos','backup'].indexOf(ativo) >= 0) {
            const secao = ativo === 'sistema' ? (new URLSearchParams(window.location.search).get('secao') || 'empenhos') : ativo;
            const linkSecao = ul.querySelector('a[href*="secao=' + secao + '"]');
            if (linkSecao) linkSecao.classList.add('ativo');
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', injetarMenu);
    } else {
        injetarMenu();
    }
})();
