// ==========================================
// MENU LATERAL - Padrão AdminLTE 3 (adminlte.io)
// ==========================================
// Fonte única do menu. Páginas: dashboard.html, sistema.html, titulos.html, admin.html
// Qualquer alteração no menu deve ser feita SOMENTE aqui.
// ==========================================
(function() {
    const MENU_HTML = `
        <li class="nav-item">
            <a href="dashboard.html" class="nav-link" data-menu-ativo="dashboard" title="Dashboard">
                <i class="nav-icon fas fa-tachometer-alt"></i>
                <p>Dashboard</p>
            </a>
        </li>
        <li class="nav-item has-treeview" data-tree="controle">
            <a href="#" class="nav-link" data-toggle="tree">
                <i class="nav-icon fas fa-calculator"></i>
                <p>Controle Orçamentário <i class="right fas fa-angle-left"></i></p>
            </a>
            <ul class="nav nav-treeview">
                <li class="nav-item">
                    <a href="#" class="nav-link emdesevolvimento" onclick="alert('Em desenvolvimento.'); return false;" title="Em desenvolvimento">
                        <i class="far fa-circle nav-icon"></i>
                        <p>Solicitação de Empenho</p>
                    </a>
                </li>
                <li class="nav-item">
                    <a href="#" class="nav-link emdesevolvimento" onclick="alert('Em desenvolvimento.'); return false;" title="Em desenvolvimento">
                        <i class="far fa-circle nav-icon"></i>
                        <p>Alteração de Crédito</p>
                    </a>
                </li>
            </ul>
        </li>
        <li class="nav-item" data-permission="titulos_ler">
            <a href="titulos.html" class="nav-link" data-menu-ativo="titulos" title="Títulos de Crédito">
                <i class="nav-icon fas fa-file-invoice-dollar"></i>
                <p>Títulos de Crédito</p>
            </a>
        </li>
        <li class="nav-item has-treeview" data-tree="tabelas">
            <a href="#" class="nav-link" data-toggle="tree">
                <i class="nav-icon fas fa-table"></i>
                <p>Tabelas de Apoio <i class="right fas fa-angle-left"></i></p>
            </a>
            <ul class="nav nav-treeview" id="sub-tabelas">
                <li class="nav-item" data-permission="empenhos_ler">
                    <a href="sistema.html?secao=empenhos" class="nav-link menu-secao-sistema" data-secao="empenhos" title="Nota de Empenho">
                        <i class="far fa-circle nav-icon"></i>
                        <p>Nota de Empenho (NE)</p>
                    </a>
                </li>
                <li class="nav-item" data-permission="lf_ler">
                    <a href="sistema.html?secao=lf" class="nav-link menu-secao-sistema" data-secao="lf" title="Controle de LF x PF">
                        <i class="far fa-circle nav-icon"></i>
                        <p>Controle de LF x PF</p>
                    </a>
                </li>
                <li class="nav-item" data-permission="op_ler">
                    <a href="sistema.html?secao=op" class="nav-link menu-secao-sistema" data-secao="op" title="Controle de OP x OB">
                        <i class="far fa-circle nav-icon"></i>
                        <p>Controle de OP x OB</p>
                    </a>
                </li>
                <li class="nav-item" data-permission="darf_ler">
                    <a href="sistema.html?secao=darf" class="nav-link menu-secao-sistema" data-secao="darf" title="DARF">
                        <i class="far fa-circle nav-icon"></i>
                        <p>DARF</p>
                    </a>
                </li>
                <li class="nav-item" data-permission="contratos_ler">
                    <a href="sistema.html?secao=contratos" class="nav-link menu-secao-sistema" data-secao="contratos" title="Gestão de Contratos">
                        <i class="far fa-circle nav-icon"></i>
                        <p>Contratos</p>
                    </a>
                </li>
                <li class="nav-item" data-permission="centrocustos_ler">
                    <a href="sistema.html?secao=centrocustos" class="nav-link menu-secao-sistema" data-secao="centrocustos" title="Centro de Custos">
                        <i class="far fa-circle nav-icon"></i>
                        <p>Centro de Custos</p>
                    </a>
                </li>
                <li class="nav-item" data-permission="ug_ler">
                    <a href="sistema.html?secao=ug" class="nav-link menu-secao-sistema" data-secao="ug" title="Unidade Gestora">
                        <i class="far fa-circle nav-icon"></i>
                        <p>Unidade Gestora (UG)</p>
                    </a>
                </li>
                <li class="nav-item" data-permission="backup_ler">
                    <a href="sistema.html?secao=backup" class="nav-link menu-secao-sistema" data-secao="backup" title="Backup dos dados">
                        <i class="far fa-circle nav-icon"></i>
                        <p>Backup</p>
                    </a>
                </li>
            </ul>
        </li>
        <li class="nav-item has-treeview" data-tree="links">
            <a href="#" class="nav-link" data-toggle="tree">
                <i class="nav-icon fas fa-external-link-alt"></i>
                <p>Links Rápido <i class="right fas fa-angle-left"></i></p>
            </a>
            <ul class="nav nav-treeview">
                <li class="nav-item">
                    <a href="https://siplad.mb" target="_blank" rel="noopener" class="nav-link" title="SIPLAD">
                        <i class="far fa-circle nav-icon"></i>
                        <p>SIPLAD</p>
                    </a>
                </li>
                <li class="nav-item">
                    <a href="https://safin.mb" target="_blank" rel="noopener" class="nav-link" title="SAFIN">
                        <i class="far fa-circle nav-icon"></i>
                        <p>SAFIN</p>
                    </a>
                </li>
                <li class="nav-item">
                    <a href="https://siafi.tesouro.gov.br" target="_blank" rel="noopener" class="nav-link" title="SIAFI">
                        <i class="far fa-circle nav-icon"></i>
                        <p>SIAFI</p>
                    </a>
                </li>
                <li class="nav-item">
                    <a href="https://contratos.sistema.gov.br" target="_blank" rel="noopener" class="nav-link" title="Contratos (Gov)">
                        <i class="far fa-circle nav-icon"></i>
                        <p>Contratos (Gov)</p>
                    </a>
                </li>
                <li class="nav-item">
                    <a href="https://tesourogerencial.tesouro.gov.br" target="_blank" rel="noopener" class="nav-link" title="Tesouro Gerencial">
                        <i class="far fa-circle nav-icon"></i>
                        <p>Tesouro Gerencial</p>
                    </a>
                </li>
            </ul>
        </li>
        <li class="nav-item" data-permission="acesso_admin">
            <a href="admin.html" class="nav-link" data-menu-ativo="admin" title="Controle de Acesso" style="color: #f39c12;">
                <i class="nav-icon fas fa-user-shield"></i>
                <p>Controle de Acesso</p>
            </a>
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
        const sidebar = document.getElementById('sidebar');
        if (!sidebar) return;

        // Garante brand-link no início (padrão AdminLTE 3)
        let brandLink = sidebar.querySelector('.brand-link');
        if (!brandLink) {
            brandLink = document.createElement('a');
            brandLink.href = 'dashboard.html';
            brandLink.className = 'brand-link';
            brandLink.innerHTML = '<span class="brand-image">🌐</span><span class="brand-text">SisExeFin</span>';
            const toggle = sidebar.querySelector('.sidebar-toggle');
            sidebar.insertBefore(brandLink, toggle || sidebar.firstChild);
        }

        const ul = sidebar.querySelector('ul');
        if (!ul) return;

        ul.className = 'nav nav-pills nav-sidebar flex-column';
        ul.setAttribute('role', 'menu');
        ul.innerHTML = MENU_HTML;

        const ativo = detectarPaginaAtiva();
        const elAtivo = ul.querySelector('[data-menu-ativo="' + ativo + '"]');
        if (elAtivo) {
            elAtivo.classList.add('active');
        } else if (ativo === 'sistema' || ['empenhos','lf','op','darf','contratos','titulos','centrocustos','ug','backup'].indexOf(ativo) >= 0) {
            const secao = ativo === 'sistema' ? (new URLSearchParams(window.location.search).get('secao') || 'empenhos') : ativo;
            const linkSecao = ul.querySelector('a[href*="secao=' + secao + '"]');
            if (linkSecao) linkSecao.classList.add('active');
        }

        // Estado persistido dos trees + abre "Tabelas de Apoio" quando em sistema.html
        const STORAGE_KEY = 'sisexefin-menu-trees';
        let treeState = {};
        try { treeState = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch (e) {}

        ul.querySelectorAll('.nav-item.has-treeview[data-tree]').forEach(function(item) {
            const id = item.getAttribute('data-tree');
            if (id === 'tabelas' && (ativo === 'sistema' || ['empenhos','lf','op','darf','contratos','centrocustos','ug','backup'].indexOf(ativo) >= 0)) {
                item.classList.add('menu-open');
            } else if (treeState[id] === true) {
                item.classList.add('menu-open');
            }
        });

        // Toggle treeview ao clicar + persistir estado
        ul.querySelectorAll('.nav-link[data-toggle="tree"]').forEach(function(link) {
            link.addEventListener('click', function(e) {
                e.preventDefault();
                const item = this.closest('.nav-item.has-treeview');
                if (!item) return;
                const id = item.getAttribute('data-tree');
                item.classList.toggle('menu-open');
                if (id) {
                    treeState[id] = item.classList.contains('menu-open');
                    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(treeState)); } catch (e2) {}
                }
            });
        });

        // Navegação in-page: em sistema.html, evitar reload ao trocar seção
        const corpoSistema = document.getElementById('corpo-sistema');
        if (corpoSistema) {
            ul.addEventListener('click', function(e) {
                const link = e.target.closest('a.menu-secao-sistema');
                if (!link) return;
                const secao = link.getAttribute('data-secao');
                if (!secao) return;
                e.preventDefault();
                const idSecao = 'secao-' + secao;
                const mapPerm = { empenhos: 'empenhos_ler', lf: 'lf_ler', op: 'op_ler', darf: 'darf_ler', contratos: 'contratos_ler', centrocustos: 'centrocustos_ler', ug: 'ug_ler', backup: 'backup_ler' };
                const permsCarregadas = (typeof permissoesEmCache !== 'undefined' && Array.isArray(permissoesEmCache) && permissoesEmCache.length > 0);
                if (permsCarregadas && typeof temPermissaoUI === 'function' && !temPermissaoUI(mapPerm[secao])) return;
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
