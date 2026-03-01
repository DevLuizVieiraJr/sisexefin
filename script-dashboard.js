// ==========================================
// DASHBOARD - Página principal pós-login
// ==========================================
(function() {
    if (!document.getElementById('corpo-dashboard')) return;
    document.addEventListener('DOMContentLoaded', function() {
        const loading = document.getElementById('loadingApp');
        if (auth.currentUser && loading) {
            loading.classList.add('hide');
            loading.style.display = 'none';
        }
    });
})();
