// ==========================================
// MENU LATERAL - Padrão AdminLTE 3 (adminlte.io)
// ==========================================
// Fonte única do menu. Páginas: dashboard.html, conta.html, sistema.html, titulos.html, liquidacao.html, admin.html
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
            <a href="#" class="nav-link" data-toggle="tree" title="Controle Orçamentário" aria-expanded="false">
                <i class="nav-icon fas fa-calculator"></i>
                <p>Controle Orçamentário <i class="right fas fa-angle-left"></i></p>
            </a>
            <ul class="nav nav-treeview">
                <li class="nav-item">
                    <a href="#" class="nav-link emdesevolvimento" title="Solicitação de Empenho — em desenvolvimento" aria-disabled="true">
                        <i class="far fa-circle nav-icon"></i>
                        <p>Solicitação de Empenho</p>
                    </a>
                </li>
                <li class="nav-item">
                    <a href="#" class="nav-link emdesevolvimento" title="Alteração de Crédito — em desenvolvimento" aria-disabled="true">
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
        <li class="nav-item" data-permission="liquidacao_ler">
            <a href="liquidacao.html" class="nav-link" data-menu-ativo="liquidacao" title="Liquidação e Pagamento">
                <i class="nav-icon fas fa-file-invoice-dollar"></i>
                <p>Liquidação e Pagamento</p>
            </a>
        </li>
        <li class="nav-item" data-permission="preliquidacao_ler">
            <a href="preliquidacao.html" class="nav-link" data-menu-ativo="preliquidacao" title="Pré-Liquidação (legado — em validação)">
                <i class="nav-icon fas fa-file-alt"></i>
                <p>Pré-Liquidação <small style="opacity:.6">[legado]</small></p>
            </a>
        </li>
        <li class="nav-item has-treeview" data-tree="tabelas">
            <a href="#" class="nav-link" data-toggle="tree" title="Tabelas de Apoio" aria-expanded="false">
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
                <li class="nav-item" data-permission="dedenc_ler">
                    <a href="sistema.html?secao=deducoesEncargos" class="nav-link menu-secao-sistema" data-secao="deducoesEncargos" title="Deduções e Encargos">
                        <i class="far fa-circle nav-icon"></i>
                        <p>Deduções e Encargos</p>
                    </a>
                </li>
                <li class="nav-item" data-permission="contratos_ler">
                    <a href="sistema.html?secao=contratos" class="nav-link menu-secao-sistema" data-secao="contratos" title="Gestão de Contratos e Atas">
                        <i class="far fa-circle nav-icon"></i>
                        <p>Contratos e Atas</p>
                    </a>
                </li>
                <li class="nav-item" data-permission="fornecedores_ler">
                    <a href="sistema.html?secao=fornecedores" class="nav-link menu-secao-sistema" data-secao="fornecedores" title="Cadastro de Fornecedores">
                        <i class="far fa-circle nav-icon"></i>
                        <p>Fornecedores</p>
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
        <li class="nav-item has-treeview" data-tree="relatorios">
            <a href="#" class="nav-link" data-toggle="tree" title="Relatórios" aria-expanded="false">
                <i class="nav-icon fas fa-chart-bar"></i>
                <p>Relatórios <i class="right fas fa-angle-left"></i></p>
            </a>
            <ul class="nav nav-treeview" id="sub-relatorios">
                <li class="nav-item">
                    <a href="#" class="nav-link emdesevolvimento" title="Relatório de Empenhos — em desenvolvimento" aria-disabled="true">
                        <i class="far fa-circle nav-icon"></i>
                        <p>Empenhos</p>
                    </a>
                </li>
                <li class="nav-item">
                    <a href="#" class="nav-link emdesevolvimento" title="Relatório de Título de Crédito — em desenvolvimento" aria-disabled="true">
                        <i class="far fa-circle nav-icon"></i>
                        <p>Título de Crédito</p>
                    </a>
                </li>
                <li class="nav-item">
                    <a href="#" class="nav-link emdesevolvimento" title="Relatório de Liquidação e Pagamento — em desenvolvimento" aria-disabled="true">
                        <i class="far fa-circle nav-icon"></i>
                        <p>Liquidação e Pagamento</p>
                    </a>
                </li>
                <li class="nav-item">
                    <a href="#" class="nav-link emdesevolvimento" title="Relatório de LF e PF — em desenvolvimento" aria-disabled="true">
                        <i class="far fa-circle nav-icon"></i>
                        <p>LF e PF</p>
                    </a>
                </li>
                <li class="nav-item" data-permission="relatorios_ler">
                    <a href="sistema.html?secao=relatoriosDeducoesImpostos" class="nav-link menu-secao-sistema" data-secao="relatoriosDeducoesImpostos" title="Relatório de Deduções e Impostos">
                        <i class="far fa-circle nav-icon"></i>
                        <p>Deduções e Impostos</p>
                    </a>
                </li>
            </ul>
        </li>
        <li class="nav-item has-treeview" data-tree="links">
            <a href="#" class="nav-link" data-toggle="tree" title="Links rápidos" aria-expanded="false">
                <i class="nav-icon fas fa-external-link-alt"></i>
                <p>Links rápidos <i class="right fas fa-angle-left"></i></p>
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
        <li class="nav-item">
            <a href="conta.html" class="nav-link" data-menu-ativo="conta" title="Minha conta — dados, tema e senha">
                <i class="nav-icon fas fa-user-cog"></i>
                <p>Minha conta</p>
            </a>
        </li>
        <li class="nav-item has-treeview" data-tree="admin">
            <a href="#" class="nav-link nav-link--admin" data-toggle="tree" title="Módulo Admin" aria-expanded="false">
                <i class="nav-icon fas fa-user-shield"></i>
                <p>Módulo Admin <i class="right fas fa-angle-left"></i></p>
            </a>
            <ul class="nav nav-treeview">
                <li class="nav-item" data-permission-any="acesso_admin,usuarios_ler">
                    <a href="admin.html?aba=usuarios" class="nav-link menu-secao-admin" data-menu-ativo="admin-usuarios" data-aba-admin="usuarios" title="Admin - Usuários">
                        <i class="far fa-circle nav-icon"></i>
                        <p>Usuários</p>
                    </a>
                </li>
                <li class="nav-item" data-permission-any="acesso_admin,admin_pendentes_ler">
                    <a href="admin.html?aba=pendentes" class="nav-link menu-secao-admin" data-menu-ativo="admin-pendentes" data-aba-admin="pendentes" title="Admin - Aguardando Aprovação">
                        <i class="far fa-circle nav-icon"></i>
                        <p>Aguardando Aprovação</p>
                    </a>
                </li>
                <li class="nav-item" data-permission-any="acesso_admin">
                    <a href="admin.html?aba=perfis" class="nav-link menu-secao-admin" data-menu-ativo="admin-perfis" data-aba-admin="perfis" title="Admin - Perfis">
                        <i class="far fa-circle nav-icon"></i>
                        <p>Perfis</p>
                    </a>
                </li>
                <li class="nav-item" data-permission-any="acesso_admin,oi_ler">
                    <a href="admin.html?aba=oi" class="nav-link menu-secao-admin" data-menu-ativo="admin-oi" data-aba-admin="oi" title="Admin - OI">
                        <i class="far fa-circle nav-icon"></i>
                        <p>OI</p>
                    </a>
                </li>
                <li class="nav-item" data-permission-any="acesso_admin,admin_cadastrar_usuario,usuarios_inserir,usuarios_editar">
                    <a href="admin.html?aba=cadastrar" class="nav-link menu-secao-admin" data-menu-ativo="admin-cadastrar" data-aba-admin="cadastrar" title="Admin - Cadastrar Usuário">
                        <i class="far fa-circle nav-icon"></i>
                        <p>Cadastrar Usuário</p>
                    </a>
                </li>
            </ul>
        </li>
    `;

    function textoRotuloSidebar(el) {
        if (!el) return '';
        var t = el.getAttribute('title');
        if (t) return t.trim();
        var p = el.querySelector(':scope > p');
        if (p) {
            var c = p.cloneNode(true);
            c.querySelectorAll('.right').forEach(function(n) { n.remove(); });
            return c.textContent.replace(/\s+/g, ' ').trim();
        }
        return String(el.textContent || '').replace(/\s+/g, ' ').trim();
    }

    function alvoFlyoutMenuRecolhido(sidebar, target) {
        if (!target || !sidebar.contains(target)) return null;
        var el = target.closest('.brand-link, .sidebar-toggle');
        if (el) return el;
        var a = target.closest('ul.nav-sidebar a.nav-link');
        if (!a || !sidebar.contains(a)) return null;
        if (a.closest('ul.nav-treeview')) return null;
        return a;
    }

    function initSidebarCollapsedFlyout(sidebar) {
        if (!sidebar || sidebar.dataset.sidebarFlyoutInit === '1') return;
        sidebar.dataset.sidebarFlyoutInit = '1';

        var tip = document.getElementById('sisexefin-sidebar-flyout');
        if (!tip) {
            tip = document.createElement('div');
            tip.id = 'sisexefin-sidebar-flyout';
            tip.className = 'sidebar-flyout-tooltip';
            tip.setAttribute('role', 'tooltip');
            document.body.appendChild(tip);
        }

        function hideFlyout() {
            tip.classList.remove('visivel');
        }

        function showFlyoutFromEventTarget(e) {
            if (!sidebar.classList.contains('colapsado')) {
                hideFlyout();
                return;
            }
            var alvo = alvoFlyoutMenuRecolhido(sidebar, e.target);
            if (!alvo) {
                hideFlyout();
                return;
            }
            if (alvo.classList.contains('sidebar-toggle')) {
                showFlyout(alvo, 'Mostrar menu');
                return;
            }
            showFlyout(alvo, textoRotuloSidebar(alvo));
        }

        function showFlyout(anchor, text) {
            if (!text) { hideFlyout(); return; }
            tip.textContent = text;
            tip.classList.add('visivel');
            var r = anchor.getBoundingClientRect();
            var pad = 8;
            tip.style.left = (r.right + pad) + 'px';
            tip.style.top = (r.top + r.height / 2) + 'px';
            requestAnimationFrame(function() {
                var tr = tip.getBoundingClientRect();
                var top = r.top + (r.height - tr.height) / 2;
                top = Math.max(6, Math.min(top, window.innerHeight - tr.height - 6));
                tip.style.top = top + 'px';
            });
        }

        sidebar.addEventListener('mouseover', showFlyoutFromEventTarget);

        sidebar.addEventListener('mouseleave', function() {
            hideFlyout();
        });

        sidebar.addEventListener('focusin', function(e) {
            showFlyoutFromEventTarget(e);
        });

        sidebar.addEventListener('focusout', function() {
            requestAnimationFrame(function() {
                if (!sidebar.contains(document.activeElement)) hideFlyout();
            });
        });

        new MutationObserver(function() {
            if (!sidebar.classList.contains('colapsado')) hideFlyout();
        }).observe(sidebar, { attributes: true, attributeFilter: ['class'] });
    }

    function mostrarAvisoItemEmDesenvolvimento(mensagem) {
        var texto = mensagem || 'Esta funcionalidade ainda está em desenvolvimento.';
        var el = document.getElementById('sisexefin-menu-toast');
        if (!el) {
            el = document.createElement('div');
            el.id = 'sisexefin-menu-toast';
            el.className = 'sisexefin-menu-toast';
            el.setAttribute('role', 'alert');
            el.setAttribute('aria-live', 'polite');
            document.body.appendChild(el);
        }
        el.textContent = texto;
        el.classList.add('visivel');
        clearTimeout(mostrarAvisoItemEmDesenvolvimento._t);
        mostrarAvisoItemEmDesenvolvimento._t = setTimeout(function() {
            el.classList.remove('visivel');
        }, 4500);
    }

    function fecharDrawerMobileSeAberto() {
        if (typeof window.matchMedia !== 'function' || !window.matchMedia('(max-width: 768px)').matches) return;
        document.body.classList.remove('sidebar-drawer-open');
        if (typeof window.updateSidebarChrome === 'function') window.updateSidebarChrome();
    }

    function detectarPaginaAtiva() {
        const path = window.location.pathname || '';
        const search = window.location.search || '';
        if (path.includes('admin.html')) {
            const aba = new URLSearchParams(search).get('aba');
            const abasValidas = ['usuarios', 'pendentes', 'perfis', 'oi', 'cadastrar'];
            if (aba && abasValidas.includes(aba)) return 'admin-' + aba;
            return 'admin-usuarios';
        }
        if (path.includes('titulos.html')) return 'titulos';
        if (path.includes('preliquidacao.html')) return 'preliquidacao';
        if (path.includes('liquidacao.html')) return 'liquidacao';
        if (path.includes('sistema.html')) {
            const secao = new URLSearchParams(search).get('secao');
            return secao || 'sistema';
        }
        if (path.includes('conta.html')) return 'conta';
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
            brandLink.title = 'Início — Dashboard';
            const toggle = sidebar.querySelector('.sidebar-toggle');
            sidebar.insertBefore(brandLink, toggle || sidebar.firstChild);
        } else {
            brandLink.title = 'Início — Dashboard';
        }

        const ul = sidebar.querySelector('ul');
        if (!ul) return;

        ul.className = 'nav nav-pills nav-sidebar flex-column';
        ul.id = 'sisexefin-nav-principal';
        ul.setAttribute('aria-label', 'Menu principal');
        ul.innerHTML = MENU_HTML;

        const ativo = detectarPaginaAtiva();
        const elAtivo = ul.querySelector('[data-menu-ativo="' + ativo + '"]');
        if (elAtivo) {
            elAtivo.classList.add('active');
        } else if (ativo === 'sistema' || ['empenhos','lf','op','deducoesEncargos','contratos','fornecedores','titulos','centrocustos','ug','backup','relatoriosDeducoesImpostos'].indexOf(ativo) >= 0) {
            const secao = ativo === 'sistema' ? (new URLSearchParams(window.location.search).get('secao') || 'empenhos') : ativo;
            const linkSecao = ul.querySelector('a[href*="secao=' + secao + '"]');
            if (linkSecao) linkSecao.classList.add('active');
        } else if (ativo.indexOf('admin-') === 0) {
            const aba = ativo.replace('admin-', '');
            const linkAba = ul.querySelector('a[data-aba-admin="' + aba + '"]');
            if (linkAba) linkAba.classList.add('active');
        }

        // Estado persistido dos trees + abre "Tabelas de Apoio" quando em sistema.html
        const STORAGE_KEY = 'sisexefin-menu-trees';
        let treeState = {};
        try { treeState = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch (e) {}

        ul.querySelectorAll('.nav-item.has-treeview[data-tree]').forEach(function(item) {
            const id = item.getAttribute('data-tree');
            if (id === 'tabelas' && (ativo === 'sistema' || ['empenhos','lf','op','deducoesEncargos','contratos','fornecedores','centrocustos','ug','backup'].indexOf(ativo) >= 0)) {
                item.classList.add('menu-open');
            } else if (id === 'relatorios' && ['relatoriosDeducoesImpostos'].indexOf(ativo) >= 0) {
                item.classList.add('menu-open');
            } else if (id === 'admin' && ativo.indexOf('admin-') === 0) {
                item.classList.add('menu-open');
            } else if (treeState[id] === true) {
                item.classList.add('menu-open');
            }
        });

        ul.querySelectorAll('.nav-link[data-toggle="tree"]').forEach(function(link) {
            const item = link.closest('.nav-item.has-treeview');
            link.setAttribute('aria-expanded', item && item.classList.contains('menu-open') ? 'true' : 'false');
        });

        ul.addEventListener('click', function(e) {
            var dev = e.target.closest('a.emdesevolvimento');
            if (dev) {
                e.preventDefault();
                mostrarAvisoItemEmDesenvolvimento(dev.getAttribute('title'));
            }
        });

        sidebar.addEventListener('click', function(e) {
            var a = e.target.closest('a.nav-link');
            if (!a || a.getAttribute('data-toggle') === 'tree') return;
            var href = a.getAttribute('href') || '';
            if (href === '#' || a.classList.contains('emdesevolvimento')) return;
            fecharDrawerMobileSeAberto();
        });

        // Toggle treeview ao clicar + persistir estado
        ul.querySelectorAll('.nav-link[data-toggle="tree"]').forEach(function(link) {
            link.addEventListener('click', function(e) {
                e.preventDefault();
                const item = this.closest('.nav-item.has-treeview');
                if (!item) return;
                const id = item.getAttribute('data-tree');
                item.classList.toggle('menu-open');
                this.setAttribute('aria-expanded', item.classList.contains('menu-open') ? 'true' : 'false');
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
                const mapPerm = { empenhos: 'empenhos_ler', lf: 'lf_ler', op: 'op_ler', deducoesEncargos: 'dedenc_ler', contratos: 'contratos_ler', fornecedores: 'fornecedores_ler', centrocustos: 'centrocustos_ler', ug: 'ug_ler', backup: 'backup_ler', relatoriosDeducoesImpostos: 'relatorios_ler' };
                const permsCarregadas = (typeof permissoesEmCache !== 'undefined' && Array.isArray(permissoesEmCache) && permissoesEmCache.length > 0);
                if (permsCarregadas && typeof temPermissaoUI === 'function' && !temPermissaoUI(mapPerm[secao])) return;
                if (typeof mostrarSecao === 'function') mostrarSecao(idSecao, link);
                if (typeof history.pushState === 'function') history.pushState({}, '', 'sistema.html?secao=' + secao);
            });
        }

        const corpoAdmin = document.getElementById('corpo-admin');
        if (corpoAdmin) {
            ul.addEventListener('click', function(e) {
                const link = e.target.closest('a.menu-secao-admin');
                if (!link) return;
                const aba = link.getAttribute('data-aba-admin');
                if (!aba) return;
                e.preventDefault();
                if (typeof window.abrirPainelAdminPorRota === 'function') {
                    window.abrirPainelAdminPorRota(aba, link);
                }
                if (typeof history.pushState === 'function') history.pushState({}, '', 'admin.html?aba=' + aba);
            });
        }

        initSidebarCollapsedFlyout(sidebar);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', injetarMenu);
    } else {
        injetarMenu();
    }
})();
