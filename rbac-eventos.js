/**
 * Catálogo central de eventos/ações de fluxo (RBAC camada 2).
 * Fonte única para Admin, guards de UI e referência para firestore.rules.
 */
(function(global) {
    'use strict';

    const MODULO_LABELS = {
        titulos: 'Títulos de Crédito',
        liquidacao: 'Liquidação e Pagamento'
    };

    /** Permissões transversais (fora da matriz CRUD e fora de fluxo por módulo). */
    const ADMIN_TRANSVERSAIS = [
        { id: 'acesso_admin', label: 'Acesso Admin', grupo: 'Administração' },
        { id: 'admin_pendentes_ler', label: 'Admin: acessar aba Aguardando Aprovação', grupo: 'Administração' },
        { id: 'admin_cadastrar_usuario', label: 'Admin: acessar aba Cadastrar Usuário', grupo: 'Administração' }
    ];

    /** Eventos de fluxo mapeáveis na matriz Admin. */
    const EVENTOS_FLUXO = [
        {
            id: 'titulos_encaminhar_processamento',
            modulo: 'titulos',
            label: 'Encaminhar para Processamento',
            grupo: 'Tramitação',
            tipo: 'transicao',
            statusOrigem: ['Rascunho'],
            statusDestino: 'Em Processamento',
            legado: ['tramitarTC']
        },
        {
            id: 'titulos_encaminhar_liquidacao',
            modulo: 'titulos',
            label: 'Encaminhar para Liquidação',
            grupo: 'Tramitação',
            tipo: 'transicao',
            statusOrigem: ['Em Processamento'],
            statusDestino: 'Em Liquidação',
            legado: ['tramitarTC']
        },
        {
            id: 'titulos_devolver',
            modulo: 'titulos',
            label: 'Devolver TC',
            grupo: 'Tramitação',
            tipo: 'transicao',
            statusOrigem: ['Rascunho', 'Em Processamento', 'Em Liquidação'],
            statusDestino: 'Devolvido',
            legado: ['tramitarTC']
        },
        {
            id: 'titulos_retornar_processamento',
            modulo: 'titulos',
            label: 'Retornar para Em Processamento',
            grupo: 'Tramitação',
            tipo: 'transicao',
            statusOrigem: ['Em Liquidação'],
            statusDestino: 'Em Processamento',
            legado: ['tramitarTC']
        },
        {
            id: 'titulos_retornar_liquidacao',
            modulo: 'titulos',
            label: 'Retornar para Em Liquidação',
            grupo: 'Tramitação',
            tipo: 'transicao',
            statusOrigem: ['Liquidado'],
            statusDestino: 'Em Liquidação',
            legado: ['tramitarTC']
        },
        {
            id: 'titulos_nova_entrada',
            modulo: 'titulos',
            label: 'Dar nova entrada',
            grupo: 'Tramitação',
            tipo: 'transicao',
            statusOrigem: ['Devolvido'],
            statusDestino: 'Rascunho',
            legado: []
        },
        {
            id: 'titulos_pdf',
            modulo: 'titulos',
            label: 'Gerar PDF de TC',
            grupo: 'Documentos',
            tipo: 'acao',
            statusOrigem: [],
            statusDestino: null,
            legado: []
        },
        {
            id: 'liquidacao_gerar_pdf',
            modulo: 'liquidacao',
            label: 'Gerar DAuLiq (PDF)',
            grupo: 'Documentos',
            tipo: 'acao',
            statusOrigem: [],
            statusDestino: null,
            legado: []
        },
        {
            id: 'liquidacao_fechar_np',
            modulo: 'liquidacao',
            label: 'Informar NP / fechar LP',
            grupo: 'Liquidação',
            tipo: 'transicao',
            statusOrigem: ['Em Liquidação'],
            statusDestino: 'Liquidado',
            legado: []
        },
        {
            id: 'liquidacao_informar_op',
            modulo: 'liquidacao',
            label: 'Informar OP / pagamento',
            grupo: 'Liquidação',
            tipo: 'acao',
            statusOrigem: [],
            statusDestino: null,
            legado: []
        },
        {
            id: 'liquidacao_restaurar',
            modulo: 'liquidacao',
            label: 'Restaurar LP cancelada',
            grupo: 'Liquidação',
            tipo: 'acao',
            statusOrigem: [],
            statusDestino: null,
            legado: []
        }
    ];

    const EVENTO_POR_ID = Object.create(null);
    EVENTOS_FLUXO.forEach(function(ev) {
        EVENTO_POR_ID[ev.id] = ev;
    });

    /** tramitarTC legado implica estes eventos (não inclui nova_entrada). */
    const TRAMITAR_TC_EXPANSION = [
        'titulos_encaminhar_processamento',
        'titulos_encaminhar_liquidacao',
        'titulos_devolver',
        'titulos_retornar_processamento',
        'titulos_retornar_liquidacao'
    ];

    function permissoesArray(permissoes) {
        return Array.isArray(permissoes) ? permissoes : [];
    }

    function permissoesIncluem(id, permissoes) {
        const perms = permissoesArray(permissoes);
        if (!id || !perms.length) return false;
        if (perms.includes(id)) return true;
        const ev = EVENTO_POR_ID[id];
        if (ev && Array.isArray(ev.legado)) {
            for (let i = 0; i < ev.legado.length; i += 1) {
                if (perms.includes(ev.legado[i])) return true;
            }
        }
        if (id === 'tramitarTC') {
            for (let j = 0; j < TRAMITAR_TC_EXPANSION.length; j += 1) {
                if (perms.includes(TRAMITAR_TC_EXPANSION[j])) return true;
            }
        }
        if (TRAMITAR_TC_EXPANSION.indexOf(id) >= 0 && perms.includes('tramitarTC')) return true;
        return false;
    }

    function adminConcedeEvento(permissoes) {
        return permissoesArray(permissoes).includes('acesso_admin');
    }

    function listarEventosPorModulo(modulo) {
        if (!modulo) return EVENTOS_FLUXO.slice();
        return EVENTOS_FLUXO.filter(function(ev) { return ev.modulo === modulo; });
    }

    function idsPermissaoEvento(modulo) {
        return listarEventosPorModulo(modulo).map(function(ev) { return ev.id; });
    }

    function eventoPorId(id) {
        return EVENTO_POR_ID[id] || null;
    }

    function tooltipEvento(ev) {
        if (!ev) return '';
        if (ev.tipo === 'acao' || !ev.statusDestino) return 'Ação sem mudança de status';
        const origens = (ev.statusOrigem || []).join(', ') || '—';
        return origens + ' → ' + ev.statusDestino;
    }

    /**
     * @param {string} eventoId
     * @param {string[]} permissoes
     * @param {function(string): boolean} [temPermissaoExtra] — aliases CRUD (script.js)
     */
    function temPermissaoEvento(eventoId, permissoes, temPermissaoExtra) {
        if (!eventoId) return false;
        if (adminConcedeEvento(permissoes)) return true;
        if (permissoesIncluem(eventoId, permissoes)) return true;
        if (typeof temPermissaoExtra === 'function' && temPermissaoExtra(eventoId)) return true;
        return false;
    }

    /**
     * @param {string} eventoId
     * @param {{ status?: string }} ctx
     * @param {string[]} permissoes
     * @param {function(string): boolean} [temPermissaoExtra]
     */
    function podeExecutarEvento(eventoId, ctx, permissoes, temPermissaoExtra) {
        if (!temPermissaoEvento(eventoId, permissoes, temPermissaoExtra)) return false;
        const ev = EVENTO_POR_ID[eventoId];
        if (!ev) return false;
        if (ev.tipo === 'acao' || !ev.statusOrigem || !ev.statusOrigem.length) return true;
        const status = (ctx && ctx.status) ? String(ctx.status) : '';
        return ev.statusOrigem.indexOf(status) >= 0;
    }

    function eventoIdPorTransicaoTitulo(de, para) {
        const found = EVENTOS_FLUXO.find(function(ev) {
            return ev.modulo === 'titulos'
                && ev.tipo === 'transicao'
                && ev.statusDestino === para
                && ev.statusOrigem.indexOf(de) >= 0;
        });
        return found ? found.id : null;
    }

    global.RBACEventos = {
        MODULO_LABELS: MODULO_LABELS,
        ADMIN_TRANSVERSAIS: ADMIN_TRANSVERSAIS,
        EVENTOS_FLUXO: EVENTOS_FLUXO,
        TRAMITAR_TC_EXPANSION: TRAMITAR_TC_EXPANSION,
        listarEventosPorModulo: listarEventosPorModulo,
        idsPermissaoEvento: idsPermissaoEvento,
        eventoPorId: eventoPorId,
        tooltipEvento: tooltipEvento,
        temPermissaoEvento: temPermissaoEvento,
        podeExecutarEvento: podeExecutarEvento,
        eventoIdPorTransicaoTitulo: eventoIdPorTransicaoTitulo,
        permissoesIncluem: permissoesIncluem
    };
})(typeof window !== 'undefined' ? window : globalThis);
