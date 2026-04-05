/**
 * Tema da interface (claro / escuro / seguir o sistema).
 * Executar no <head>, antes de style.css, para reduzir flash de tema incorreto.
 */
(function () {
    var KEY = 'sisexefin-tema';
    var VALID = { claro: 1, escuro: 1, sistema: 1 };

    function lerPreferencia() {
        try {
            var v = localStorage.getItem(KEY);
            if (v && VALID[v]) return v;
        } catch (e) { /* ignorar */ }
        return 'claro';
    }

    function escuroPeloSistema() {
        return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    }

    function usarEscuro() {
        var p = lerPreferencia();
        if (p === 'escuro') return true;
        if (p === 'claro') return false;
        return escuroPeloSistema();
    }

    function aplicar() {
        var dark = usarEscuro();
        document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
        var meta = document.querySelector('meta[name="theme-color"]');
        if (meta) meta.setAttribute('content', dark ? '#1a1d23' : '#1a2f4a');
    }

    aplicar();

    if (window.matchMedia) {
        try {
            window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function () {
                if (lerPreferencia() === 'sistema') aplicar();
            });
        } catch (e) {
            window.matchMedia('(prefers-color-scheme: dark)').addListener(function () {
                if (lerPreferencia() === 'sistema') aplicar();
            });
        }
    }

    window.sisExeFinTema = {
        preferencia: lerPreferencia,
        definir: function (valor) {
            if (!VALID[valor]) return;
            try { localStorage.setItem(KEY, valor); } catch (e2) { /* ignorar */ }
            aplicar();
        },
        aplicar: aplicar
    };
})();
