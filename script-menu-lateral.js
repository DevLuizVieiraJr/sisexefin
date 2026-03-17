// ==========================================
// MENU LATERAL - FONTE ÚNICA (não duplique em outras páginas)
// ==========================================
// Este arquivo é a ÚNICA fonte do menu. As páginas dashboard.html, sistema.html,
// titulos.html e admin.html possuem apenas <ul><!-- Menu injetado por script-menu-lateral.js --></ul>
// e carregam este script. Qualquer alteração no menu deve ser feita SOMENTE aqui;
// assim todas as telas são atualizadas de uma só vez, sem risco de esquecer alguma.
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
                <li data-permission="empenhos_ler"><a href="sistema.html?secao=empenhos" class="menu-btn menu-link-externo menu-secao-sistema" data-secao="empenhos" style="width:100%;" title="Nota de Empenho"><span class="menu-btn-icon">📄</span><span class="menu-btn-text">Nota de Empenho (NE)</span></a></li>
                <li data-permission="lf_ler"><a href="sistema.html?secao=lf" class="menu-btn menu-link-externo menu-secao-sistema" data-secao="lf" style="width:100%;" title="Controle de LF x PF"><span class="menu-btn-icon">💰</span><span class="menu-btn-text">Controle de LF x PF</span></a></li>
                <li data-permission="op_ler"><a href="sistema.html?secao=op" class="menu-btn menu-link-externo menu-secao-sistema" data-secao="op" style="width:100%;" title="Controle de OP x OB"><span class="menu-btn-icon">💳</span><span class="menu-btn-text">Controle de OP x OB</span></a></li>
                <li data-permission="darf_ler"><a href="sistema.html?secao=darf" class="menu-btn menu-link-externo menu-secao-sistema" data-secao="darf" style="width:100%;" title="DARF"><span class="menu-btn-icon">📊</span><span class="menu-btn-text">DARF</span></a></li>
                <li data-permission="contratos_ler"><a href="sistema.html?secao=contratos" class="menu-btn menu-link-externo menu-secao-sistema" data-secao="contratos" style="width:100%;" title="Gestão de Contratos"><span class="menu-btn-icon">🤝</span><span class="menu-btn-text">Contratos</span></a></li>
                <li data-permission="backup_ler"><a href="sistema.html?secao=backup" class="menu-btn menu-link-externo menu-secao-sistema" data-secao="backup" style="width:100%;" title="Backup dos dados"><span class="menu-btn-icon">💾</span><span class="menu-btn-text">Backup</span></a></li>
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
        } else if (ativo === 'sistema' || ['empenhos','lf','op','darf','contratos','titulos','backup'].indexOf(ativo) >= 0) {
            const secao = ativo === 'sistema' ? (new URLSearchParams(window.location.search).get('secao') || 'empenhos') : ativo;
            const linkSecao = ul.querySelector('a[href*="secao=' + secao + '"]');
            if (linkSecao) linkSecao.classList.add('ativo');
        }
        // Navegação in-page: em sistema.html, evitar reload ao trocar seção (otimização Firebase)
        const corpoSistema = document.getElementById('corpo-sistema');
        if (corpoSistema) {
            ul.addEventListener('click', function(e) {
                const link = e.target.closest('a.menu-secao-sistema');
                if (!link) return;
                const secao = link.getAttribute('data-secao');
                if (!secao) return;
                e.preventDefault();
                const idSecao = 'secao-' + secao;
                const mapPerm = { empenhos: 'empenhos_ler', lf: 'lf_ler', op: 'op_ler', darf: 'darf_ler', contratos: 'contratos_ler', backup: 'backup_ler' };
                if (typeof temPermissaoUI === 'function' && !temPermissaoUI(mapPerm[secao])) return;
                if (typeof mostrarSecao === 'function') mostrarSecao(idSecao, link);
                if (typeof history.pushState === 'function') history.pushState({}, '', 'sistema.html?secao=' + secao);
            });
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', injetarMenu);
    } else {
        injetarMenu();
    }
})();
