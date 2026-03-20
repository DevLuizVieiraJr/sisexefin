# Análise técnica – Painel de NE vinculada e navegação no TC

Documento de apoio às regras em [Regras de Negócio - Aba Processamento.md](./Regras%20de%20Negócio%20-%20Aba%20Processamento.md).  
Código de referência: `script-titulos-spa.js`, `titulos.html`.

---

## 1. Comportamento observado vs. esperado

| # | Problema | Comportamento esperado (RN) |
|---|----------|----------------------------|
| A | Subelemento ao **editar** NE já vinculada não reflete o esperado | Campo deve mostrar o subelemento correto (e, se houver lista na NE, as opções vindas do empenho). |
| B | Só existe ação tipo **Salvar/Atualizar** no painel | Incluir **Cancelar / Fechar edição** com confirmação se houver alterações não aplicadas. |
| C | Ao mudar de **aba** do TC, o painel continua aberto | Antes de trocar de aba, confirmar se há edição pendente; opcões: aplicar, descartar com aviso, ou permanecer. |
| D | Ao **fechar** o TC ou **abrir outro** TC, o painel mantém estado da NE anterior | Resetar painel e `indiceEmpenhoEditando` ao sair do formulário ou ao carregar outro documento; com confirmação se pendente. |

---

## 2. Causas prováveis no código (análise)

### 2.1 Subelemento (problema A)

1. **Inconsistência de nome de campo**  
   - Na seleção de NE pelo autocomplete, o valor é preenchido com `(e.subitem \|\| e.subelemento)`.  
   - Em `editarItemEmpenhoNaNota`, apenas `v.subelemento` é atribuído ao input.  
   - Itens antigos ou importados podem ter só `subitem` no objeto persistido → o campo aparece **vazio** na edição.

2. **Campo HTML `readonly`**  
   - `vinculoSubelemento` está `readonly` em `titulos.html`. O valor atribuído por JS **deve** aparecer; o `readonly` não apaga o valor, mas pode confundir o utilizador (“não apresenta” no sentido de não poder escolher outro).  
   - Se a regra de negócio for **lista de subelementos** por NE, o controlo atual é um `<input>` de texto, não um `<select>` populado a partir de `empenhos` — isso exigiria novo desenho de dados/UI.

3. **Falta de reidratação a partir de `baseEmpenhos`**  
   - Ao editar, não há lookup do documento da NE em `baseEmpenhos` para preencher subelemento quando o vínculo no TC está vazio mas a NE na base tem `subitem`.

### 2.2 Cancelar edição (problema B)

- O bloco `#detalhesVinculoEmpenho` só tem o botão que chama `adicionarEmpenhoNaNota()` (Adicionar / Atualizar).  
- Não há botão que: feche o painel, limpe `indiceEmpenhoEditando`, e restaure ou descarte alterações com `confirm`.

### 2.3 Navegação entre abas (problema C)

- O listener das `.tab-tc` chama apenas `ativarTab(...)` sem verificar `indiceEmpenhoEditando` nem `display` do painel nem “dirty state”.

### 2.4 Fechar / trocar TC (problema D)

- `voltarParaListaTitulos()` apenas alterna `display` das telas; **não** esconde `#detalhesVinculoEmpenho`, **não** repõe `indiceEmpenhoEditando`, `empenhoTemporarioSelecionado`.  
- `abrirFormularioTitulo()` (novo TC) também **não** reset explícito desses estados do painel.  
- `editarTitulo()` carrega `empenhosDaNotaAtual` e redesenha a tabela, mas **não** fecha o painel nem limpa o modo edição — se o painel estava visível noutro TC, o conteúdo pode ficar **desalinhado** até nova interação.

---

## 3. Dúvidas a fechar **antes** de implementar

1. **Subelemento**  
   - Deve ser sempre um **único código de 2 dígitos** escolhido na inclusão, ou existe **vários subelementos por NE** na coleção `empenhos` que devam aparecer num **select**?  
   - Em caso de vários, onde vivem no Firestore (array no documento NE, subcoleção, outro)?

2. **Edição de vínculo existente**  
   - Deve ser permitido **alterar o subelemento** na edição, ou continua **fixo** após o primeiro vínculo (como sugere o comentário no código sobre ND/subelemento)?

3. **“Alterações não salvas” no painel**  
   - Considera-se pendente apenas quando `indiceEmpenhoEditando !== null` **e** o utilizador mudou valor/CC/UG **sem** clicar em “Atualizar item”?  
   - Na **inclusão nova** (NE selecionada mas ainda não adicionada à lista), ao cancelar, basta fechar o painel e limpar `empenhoTemporarioSelecionado`?

4. **Salvar antes de mudar de aba**  
   - A pergunta deve referir-se a **aplicar “Atualizar item”** (gravar na lista em memória) ou a **persistir o TC no Firestore** (botão Salvar global)?  
   - Se o utilizador escolher “Salvar”, deve disparar o **submit completo** do formulário ou apenas aplicar o painel e deixar o Firestore para o utilizador?

5. **Fechar lista / outro TC**  
   - Para TC **já salvo** com `editIndexTitulo` válido, ao fechar sem alterações globais, mantém-se o comportamento atual de **não** pedir confirmação (só quando há dados não salvos em novo TC)?  
   - Deve o painel NE acionar confirmação **independentemente** de haver alteração no resto do formulário?

---

## 4. Próximos passos sugeridos (após respostas)

- Unificar leitura `subitem` / `subelemento` na edição; opcional: lookup em `baseEmpenhos`.  
- Introduzir `fecharPainelVinculoNE(opcao)` + estado **dirty** do painel.  
- Interceptar clique em `.tab-tc`, `voltarParaListaTitulos`, `abrirFormularioTitulo`, `editarTitulo` com os mesmos guardas.  
- Ajustar HTML: botão Cancelar e, se aplicável, `<select>` de subelementos.
