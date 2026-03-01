// ==========================================
// Menu lateral - Toggle colapsável por seção
// ==========================================
(function() {
    function initMenuColapsavel() {
        const toggles = document.querySelectorAll('.menu-section-toggle');
        const STORAGE_KEY = 'sisexefin-menu-sections';
        let estado = {};
        try { estado = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch (e) {}

        toggles.forEach(function(btn) {
            const id = btn.getAttribute('data-toggle');
            const sub = document.getElementById('sub-' + id);
            if (!sub) return;
            if (estado[id] === false) {
                sub.classList.add('oculto');
                btn.classList.add('colapsado');
            }
            btn.addEventListener('click', function() {
                const oculto = sub.classList.toggle('oculto');
                btn.classList.toggle('colapsado', oculto);
                estado[id] = !oculto;
                try { localStorage.setItem(STORAGE_KEY, JSON.stringify(estado)); } catch (e) {}
            });
        });
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initMenuColapsavel);
    } else {
        initMenuColapsavel();
    }
})();
