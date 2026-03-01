// ==========================================
// ADMIN UTILS - Máscaras e Validações (Vanilla JS)
// ==========================================
(function() {
    'use strict';

    window.aplicarMascaraTelefone = function(input) {
        if (!input || input.value === undefined) return;
        let v = String(input.value || '').replace(/\D/g, '');
        if (v.length > 11) v = v.slice(0, 11);
        if (v.length > 6) input.value = '(' + v.slice(0, 2) + ') ' + v.slice(2, 7) + '-' + v.slice(7);
        else if (v.length > 2) input.value = '(' + v.slice(0, 2) + ') ' + v.slice(2);
        else if (v.length > 0) input.value = '(' + v;
        else input.value = '';
    };

    window.aplicarMascaraCPF = function(input) {
        if (!input || input.value === undefined) return;
        let v = String(input.value || '').replace(/\D/g, '');
        if (v.length > 11) v = v.slice(0, 11);
        if (v.length > 9) input.value = v.slice(0, 3) + '.' + v.slice(3, 6) + '.' + v.slice(6, 9) + '-' + v.slice(9);
        else if (v.length > 6) input.value = v.slice(0, 3) + '.' + v.slice(3, 6) + '.' + v.slice(6);
        else if (v.length > 3) input.value = v.slice(0, 3) + '.' + v.slice(3);
        else input.value = v;
    };

    window.validarCPF = function(cpf) {
        const v = String(cpf || '').replace(/\D/g, '');
        if (v.length !== 11) return false;
        if (/^(\d)\1{10}$/.test(v)) return false;
        let soma = 0;
        for (let i = 0; i < 9; i++) soma += parseInt(v[i]) * (10 - i);
        let d1 = (soma * 10) % 11;
        if (d1 === 10) d1 = 0;
        if (d1 !== parseInt(v[9])) return false;
        soma = 0;
        for (let i = 0; i < 10; i++) soma += parseInt(v[i]) * (11 - i);
        let d2 = (soma * 10) % 11;
        if (d2 === 10) d2 = 0;
        return d2 === parseInt(v[10]);
    };

    window.cpfSomenteDigitos = function(cpf) {
        return String(cpf || '').replace(/\D/g, '').slice(0, 11);
    };

    window.telefoneSomenteDigitos = function(tel) {
        return String(tel || '').replace(/\D/g, '').slice(0, 11);
    };

    window.aplicarMascaraMoedaBR = function(input) {
        if (!input || input.value === undefined) return;
        let v = String(input.value || '').replace(/\D/g, '');
        if (v.length > 15) v = v.slice(0, 15);
        if (v.length === 0) { input.value = ''; return; }
        const num = parseInt(v, 10) / 100;
        input.value = 'R$ ' + num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };

    window.valorMoedaParaNumero = function(str) {
        if (str === null || str === undefined || str === '') return 0;
        const v = String(str).replace(/[^\d]/g, '');
        if (v.length === 0) return 0;
        return parseInt(v, 10) / 100;
    };

    window.formatarMoedaBR = function(num) {
        const n = parseFloat(num);
        if (isNaN(n)) return '0,00';
        return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };

    function initMascarasMoeda() {
        document.querySelectorAll('[data-moeda]').forEach(function(inp) {
            if (inp.dataset.moedaInit) return;
            inp.dataset.moedaInit = '1';
            inp.addEventListener('input', function() { aplicarMascaraMoedaBR(this); });
            inp.addEventListener('blur', function() { aplicarMascaraMoedaBR(this); });
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initMascarasMoeda);
    } else {
        initMascarasMoeda();
    }
    window.initMascarasMoeda = initMascarasMoeda;
})();
