# Painel de Administração (`admin.html`) — Documentação e regras de negócio

## 1. Finalidade da tela

Tela **SisExeFin - Administração de Acessos** para utilizadores com permissão **`acesso_admin`**. Permite:

- Gerir **utilizadores** (listar, pesquisar, editar dados e perfis, bloquear/desbloquear).
- Tratar **cadastros pendentes** (aprovação via fluxo de edição; rejeição com bloqueio).
- Definir **perfis** e a **matriz de permissões** (módulo × ação + flags especiais).
- Manter **Organizações Internas (OI)**.
- **Cadastrar utilizador** por email/senha (Firebase Auth) e associar perfis e OI.

A autorização de **rotas** está em `script.js` (`corpo-admin`): sem `acesso_admin`, o utilizador é alertado e redirecionado para `dashboard.html`. A **autoridade real** está nas **Firestore Security Rules** (`firestore.rules`).

---

## 2. Verificação de segurança

### 2.1 Pontos fortes

| Aspecto | Comportamento |
|--------|----------------|
| **Guard de página** | Após login e `carregarPermissoes()`, só exibe o corpo se existir `acesso_admin` no perfil ativo. |
| **Firestore – `usuarios`** | Leitura: próprio documento ou admin. Atualização completa: admin. Utilizador comum só pode alterar `perfil_ativo` no próprio doc. |
| **Firestore – `perfis`** | Escrita apenas com `acesso_admin`. |
| **Firestore – `auditoria`** | Criação/leitura com `acesso_admin` (ações como criar/atualizar utilizador, rejeitar, desbloquear). |
| **Criação de utilizador** | Uso de **app Firebase secundária** (`adminUserCreator`) para `createUserWithEmailAndPassword`, evitando trocar a sessão do administrador; rollback tenta apagar o utilizador Auth se falhar o `set` no Firestore. |
| **Senha inicial** | Validação de senha forte (`validarSenhaForte` em `script.js`): mínimo 8 caracteres, letras e números. |
| **XSS nas tabelas** | Conteúdo dinâmico em `admin-spa.js` usa `escapeHTML` para emails, nomes, IDs em atributos. |
| **Sessão** | Mesmo padrão das outras páginas: inatividade, logout; utilizador bloqueado/pendente é expulso para `index.html` antes de chegar ao admin. |

### 2.2 Riscos e limitações (aceites ou a melhorar)

| Risco | Detalhe |
|-------|---------|
| **UI não é fronteira de segurança** | Quem manipular o cliente ainda depende das Rules; está correto, mas convém monitorar erros `permission-denied` e auditoria. |
| **Leitura global de `perfis`** | `match /perfis/{perfilId}` permite **read** a **qualquer utilizador autenticado**. Facilita o cliente a resolver permissões, mas expõe nomes de perfis e listas de permissões a qualquer conta válida. |
| **Leitura de `oi`** | Qualquer utilizador autenticado pode ler a coleção `oi` (regras atuais). |
| **Listagem de `usuarios`** | Admins com `acesso_admin` obtêm a lista completa via `.get()` — coerente com o papel, mas implica **dados pessoais** (email, CPF se gravado, etc.): LGPD/retenção devem ser tratados ao nível de processo e política. |
| **CDN externa** | Font Awesome via cdnjs — dependência de terceiros (integridade/subresource em futuras melhorias). |
| **Sem exclusão de perfil na UI** | Reduz risco operacional acidental; perfis órfãos ou renomeação exigem manutenção manual (Console/Script) se necessário. |
| **Sem exclusão de utilizador Auth na UI** | Bloqueio altera Firestore; a conta Firebase Auth pode continuar a existir até limpeza manual — documentar como procedimento de offboarding. |

### 2.3 Conclusão de segurança

Para uma aplicação **estática + Firestore**, o desenho está **alinhado com o modelo RBAC** do projeto: operações sensíveis exigem **`acesso_admin`** nas Rules. Os principais pontos de endurecimento futuro seriam: restringir leitura de `perfis`/`oi` se o produto exigir menor exposição, e políticas explícitas para dados pessoais e contas Auth.

---

## 3. Layout e experiência do utilizador

### 3.1 O que funciona bem

- **Padrão visual** alinhado ao restante (`style.css`, topbar, sidebar, tabelas `tabela-gov`, cards).
- **Abas** claras: Usuários, Pendentes, Perfis, OI, Cadastrar.
- **Formulários** com fieldsets, máscaras (CPF, telefone) e validações em `admin-utils.js` / `script.js`.
- **Estados de carregamento** (overlay global / `adminLoading`, botões em loading).
- **Responsividade parcial**: `overflow-x: auto` nas tabelas e na matriz de permissões evita quebra em ecrãs estreitos.

### 3.2 Melhorias aplicadas (layout / UX / a11y)

- Estilos do admin concentrados em `style.css` sob o seletor `#corpo-admin` (sem duplicação de `.admin-tab`).
- Barra de abas com **scroll horizontal** em ecrãs estreitos (`.admin-tabs-wrap` + `flex-wrap: nowrap`).
- Abas com **papéis ARIA** (`tablist` / `tab` / `tabpanel`), `aria-selected`, `aria-controls`, `aria-labelledby`, `aria-hidden` atualizados em `mostrarPainelAdmin` (`admin-spa.js`).
- Botões só com ícone com **`aria-label`** (aprovar, rejeitar, editar utilizador/perfil/OI, excluir OI).
- **Voltar** como ligação (`<a href="dashboard.html">`); **Sair** como `<button type="button">`.
- Ordem dos **painéis no DOM** alinhada à ordem das abas (Usuários → Pendentes → …).
- Rótulos associados com `for`/`id` onde faltava; pesquisa de utilizadores com `aria-label`.

### 3.3 Melhorias opcionais futuras

| Item | Observação |
|------|----------------|
| **Abas em mobile** | Se o scroll horizontal não for suficiente, considerar menu select ou acordeão. |
| **Navegação por teclado entre abas** | Setas ←/→ no `tablist` (roving tabindex já parcialmente preparado com `tabindex` 0/-1). |
| **Coluna UID** | Mantém prefixo + `...`; UID completo no modo edição. |

### 3.4 Conclusão de layout

O layout permanece **adequado para utilizador administrativo** e consistente com o SisExeFin, com melhorias de **CSS centralizado**, **abas em ecrã pequeno** e **acessibilidade** aplicadas no código.

---

## 4. Regras de negócio (por área)

### 4.1 Acesso à tela

- **RN-ADM-001**: Só utilizadores com permissão **`acesso_admin`** no **perfil ativo** podem permanecer em `admin.html`; caso contrário, redirecionamento para o dashboard.
- **RN-ADM-002**: Utilizador **bloqueado**, **pendente** ou **sem perfil ativo válido** não acede ao sistema (`index.html`), logo não utiliza o painel admin.

### 4.2 Utilizadores cadastrados

- **RN-ADM-010**: Lista todos os documentos da coleção `usuarios` (operação de admin).
- **RN-ADM-011**: **Pesquisa** filtra por email, perfil(es), ou prefixo de UID (client-side).
- **RN-ADM-012**: **Estado apresentado**: Bloqueado (`bloqueado` ou `status === 'bloqueado'`); Pendente (`status === 'pendente'` ou sem perfis); caso contrário Ativo.
- **RN-ADM-013**: **Bloquear**: confirmação; grava `bloqueado: true` no Firestore (sessão e regras impedem uso normal).
- **RN-ADM-014**: **Desbloquear**: grava `bloqueado: false` e `status: 'ativo'`; regista auditoria se `registrarAuditoria` existir.
- **RN-ADM-015**: **Editar** abre o formulário “Cadastrar/Atribuir” com UID preenchido (modo edição).

### 4.3 Aguardando aprovação

- **RN-ADM-020**: Utilizadores com **`status === 'pendente'`** (ex.: registo Google) aparecem nesta lista.
- **RN-ADM-021**: **Aprovar** redireciona o fluxo para **edição** do mesmo utilizador (atribuição de perfis no painel Cadastrar); não altera o estado sozinho até o admin gravar com perfis.
- **RN-ADM-022**: **Rejeitar**: confirmação; atualiza para `status: 'bloqueado'` e `bloqueado: true`; regista auditoria `rejeitar_usuario`.

### 4.4 Perfis e permissões

- **RN-ADM-030**: Identificador do perfil = **nome normalizado em minúsculas** (campo usado como ID do documento em `perfis/{nome}`).
- **RN-ADM-031**: Permissões são um **array de strings** gravado em `permissoes`, composto por:
  - Checkboxes da **matriz** `modulo_acao` (ex.: `titulos_ler`, `empenhos_editar`), conforme módulos definidos em `admin-spa.js` (`MATRIZ_MODULOS` / `COLUNAS_ACOES`).
  - Flags adicionais: `acesso_admin`, `tramitarTC`, `titulos_pdf`, `preliquidacao_gerar_pdf`, `preliquidacao_fechar_np`, `preliquidacao_cancelar`, `preliquidacao_associar_lf` (esta última marcada como futura na UI).
- **RN-ADM-032**: **Salvar perfil** faz `set` com **merge**, preservando o documento se já existir.
- **RN-ADM-033**: **Implicação de produto**: perfil com `acesso_admin` recebe na UI implicitamente acesso ampliado (dashboard, backup, tabelas de apoio) conforme lógica em `script.js` — ver `ANALISE_RBAC.md` para outras interações RBAC no resto do sistema.

### 4.5 Organizações Internas (OI)

- **RN-ADM-040**: Campos: número OI, nome, contato, telefone (máscara BR), situação Ativo/Inativo.
- **RN-ADM-041**: **Telefone**: se preenchido, mínimo **10 dígitos** (validação cliente).
- **RN-ADM-042**: **Número OI** único (case-insensitive) entre registos carregados.
- **RN-ADM-043**: **Exclusão** impedida se existir **pelo menos um utilizador** com `oi` igual ao ID do documento da OI.
- **RN-ADM-044**: No formulário de utilizador, o select de OI lista apenas OIs com **situação Ativo**.

### 4.6 Cadastrar / atribuir utilizador

- **RN-ADM-050**: **Email** obrigatório; **pelo menos um perfil** selecionado.
- **RN-ADM-051**: **Perfil ativo** deve pertencer à lista de perfis selecionados; se vazio ou inválido, usa-se o primeiro da lista.
- **RN-ADM-052**: **CPF**: opcional; se informado, 11 dígitos e dígitos verificadores válidos (`validarCPF`).
- **RN-ADM-053**: **Novo utilizador** (sem UID): obrigatória **senha inicial** forte; criação em Auth + gravação em `usuarios/{uid}` com `status: 'ativo'`; auditoria `criar_usuario`.
- **RN-ADM-054**: **Edição** (com UID): `set` com merge no documento existente; não recria Auth; auditoria `atualizar_usuario`.
- **RN-ADM-055**: Campos gravados tipicamente: `email`, `perfis`, `perfil_ativo`, `status`, e opcionalmente `cpf`, `nomeCompleto`, `nomeGuerra`, `oi`.

---

## 5. Referências no código

| Ficheiro | Papel |
|----------|--------|
| `admin.html` | Estrutura, abas, formulários, estilos locais |
| `admin-spa.js` | Carga de dados, tabelas, OI, matriz de módulos, integração com Auth state |
| `admin-utils.js` | Máscaras CPF/telefone e validação de CPF |
| `script.js` | Guard `corpo-admin`, submit perfil/utilizador, criação Auth secundária, permissões em cache |
| `firestore.rules` | `acesso_admin`, `usuarios`, `perfis`, `oi`, `auditoria` |

---

*Documento gerado com base no estado do repositório; se o código mudar, atualize as regras e esta página em conjunto.*
