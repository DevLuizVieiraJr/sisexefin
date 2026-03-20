// ==========================================
// DASHBOARD - Página principal pós-login
// ==========================================
(function() {
    if (!document.getElementById('corpo-dashboard')) return;

    function marcarAtivoSimples() {
        const path = window.location.pathname;
        const search = (window.location.search || '').toLowerCase();
        document.querySelectorAll('.sidebar a.menu-btn[href]').forEach(function(a) {
            a.classList.remove('ativo');
            const h = (a.getAttribute('href') || '').toLowerCase();
            if (path.indexOf('titulos') !== -1 && h.indexOf('titulos.html') !== -1) {
                const paramH = (h.split('?')[1] || '');
                if ((paramH && search && h.indexOf(search.replace('?', '')) !== -1) || (paramH === '' && !search)) a.classList.add('ativo');
            } else if (path.indexOf('sistema') !== -1 && h.indexOf('sistema.html') !== -1 && h.indexOf('secao=') !== -1) {
                if (search && h.indexOf(search.replace('?', '')) !== -1) a.classList.add('ativo');
            } else if (path.indexOf('admin') !== -1 && h.indexOf('admin.html') !== -1) a.classList.add('ativo');
        });
    }

    document.addEventListener('DOMContentLoaded', function() {
        const loading = document.getElementById('loadingApp');
        if (typeof auth !== 'undefined' && auth.currentUser && loading) {
            loading.classList.add('hide');
            loading.style.display = 'none';
        }
        marcarAtivoSimples();
    });
})();
