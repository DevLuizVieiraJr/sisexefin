// ==========================================
// SISTEMA (Tabelas de Apoio) - Inicialização por URL + Route Guards
// Executado APÓS carregarPermissoes() (chamado por script.js no fluxo corpoSistema)
// ==========================================
(function() {
    if (!document.getElementById('corpo-sistema')) return;
    const mapSecao = {
        empenhos: 'secao-empenhos',
        lf: 'secao-lf',
        op: 'secao-op',
        deducoesEncargos: 'secao-deducoes-encargos',
        contratos: 'secao-contratos',
        fornecedores: 'secao-fornecedores',
        titulos: 'secao-titulos',
        centrocustos: 'secao-centrocustos',
        ug: 'secao-ug',
        backup: 'secao-backup'
    };
    const mapSecaoPermissao = {
        'secao-empenhos': 'empenhos_ler',
        'secao-lf': 'lf_ler',
        'secao-op': 'op_ler',
        'secao-deducoes-encargos': 'dedenc_ler',
        'secao-contratos': 'contratos_ler',
        'secao-fornecedores': 'fornecedores_ler',
        'secao-titulos': 'titulos_ler',
        'secao-centrocustos': 'centrocustos_ler',
        'secao-ug': 'ug_ler',
        'secao-backup': 'backup_ler'
    };
    const params = new URLSearchParams(window.location.search);
    let secaoParam = params.get('secao');
    const ordemSecoes = ['empenhos', 'lf', 'op', 'deducoesEncargos', 'contratos', 'fornecedores', 'titulos', 'centrocustos', 'ug', 'backup'];

    function executarInicializacao() {
        let idSecao, permissaoRequerida;
        if (secaoParam && mapSecao[secaoParam]) {
            idSecao = mapSecao[secaoParam];
            permissaoRequerida = mapSecaoPermissao[idSecao];
        } else {
            const temPerm = typeof temPermissaoUI === 'function' ? temPermissaoUI : () => false;
            const primeiraComAcesso = ordemSecoes.find(s => temPerm(mapSecaoPermissao[mapSecao[s]]));
            if (primeiraComAcesso) {
                secaoParam = primeiraComAcesso;
                idSecao = mapSecao[secaoParam];
                permissaoRequerida = mapSecaoPermissao[idSecao];
            } else {
                idSecao = 'secao-empenhos';
                permissaoRequerida = 'empenhos_ler';
            }
        }
        const temPerm = typeof temPermissaoUI === 'function' ? temPermissaoUI(permissaoRequerida) : false;
        if (!temPerm) {
            alert("Acesso Negado à seção solicitada. Redirecionando...");
            window.location.replace('dashboard.html');
            return;
        }
        const secaoAlvo = document.getElementById(idSecao);
        if (!secaoAlvo) {
            alert("Seção não encontrada. Redirecionando...");
            window.location.replace('dashboard.html');
            return;
        }
        const elMenu = document.querySelector('a[href*="secao=' + secaoParam + '"]') || document.querySelector('button[onclick*="' + idSecao + '"]');
        if (typeof mostrarSecao === 'function') {
            mostrarSecao(idSecao, elMenu || null);
        }
        // Garante que o subgrupo "Tabelas de Apoio" esteja expandido (padrão AdminLTE 3)
        const itemTabelas = document.querySelector('.nav-item.has-treeview[data-tree="tabelas"]');
        if (itemTabelas) itemTabelas.classList.add('menu-open');
    }

    window.inicializarSecaoSistema = executarInicializacao;
})();
