# Análise de RBAC – Erros, Falhas e Inconsistências

## 1. Inconsistência crítica – TC com titulos_ver_X sem titulos_ler

**Problema:** Um perfil com APENAS `titulos_ver_rascunho` (sem `titulos_ler`) vê o link "Rascunho" no dashboard, mas ao clicar é redirecionado porque o `script.js` só checa `titulos_ler`.

**Cenário:**
1. Admin cria perfil "operador_rascunho" com `titulos_ver_rascunho` apenas.
2. Usuário vê "Rascunho" no dashboard.
3. Ao clicar em titulos.html?status=Rascunho, o guard verifica `titulos_ler` e redireciona.

**Ajuste:** O guard de rota deve permitir acesso à página TC quando:
- `titulos_ler` OU
- URL tem `?status=X` E o usuário possui `titulos_ver_X`.

---

## 2. Firestore – leitura de titulos com titulos_ver_X

**Problema:** As regras do Firestore exigem `titulos_ler` para ler a coleção `titulos`. Usuários com só `titulos_ver_rascunho` conseguiriam acessar a página, mas teriam "permission denied" ao carregar dados.

**Ajuste:** Permitir leitura em `titulos` se o usuário tem `titulos_ler` OU qualquer uma das permissões `titulos_ver_*`.

---

## 3. Status inválido na URL do TC

**Observação:** Em `titulos.html?status=StatusInvalido`, o guard não redireciona porque `STATUS_TO_PERM['StatusInvalido']` é `undefined`. A tela carrega com lista vazia. Comportamento aceitável.

---

## 4. Formulário de perfil (admin) – checkboxes TC

**Status:** Os checkboxes de `matrizPermissoesTC` usam a classe `cb-perm` e são coletados por `document.querySelectorAll('.cb-perm:checked')` no submit. Ao editar perfil, `document.querySelectorAll('.cb-perm')` define o `checked` corretamente. Sem erros identificados.

---

## 5. Ordem de scripts em titulos.html

**Status:** Ordem correta: `script.js` (define `temPermissaoUI`, `escapeHTML`, `debounce`) → `script-titulos-spa.js`. Sem erros.

---

## 6. script-sistema-init.js – seção removida

**Status:** Se `aplicarPermissoesUI` remove a seção, `getElementById(idSecao)` retorna `null`. O guard checa permissão antes de chamar `mostrarSecao`, então o fluxo está correto.
