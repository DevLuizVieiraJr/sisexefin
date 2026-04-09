# Verificação: Regras do Título de Crédito vs Código

Referência: `Titulo de Crédito - Regras.txt` (linhas 1-72).

---

## Escopo da validação

Esta verificação considera como fonte ativa do módulo TC a página `titulos.html` com `script-titulos-spa.js`.
A antiga seção de TC dentro de `sistema.html` foi descontinuada e não compõe mais o fluxo oficial.

### Alvo de produto (Pré-Liquidação × TC)

As regras oficiais em [Regras de Negócios - TC - Aba Liquidação.md](./Regras%20de%20Negócios%20-%20TC%20-%20Aba%20Liquidação.md) e [Regras de Negócios - TC - Aba Financeiro.md](./Regras%20de%20Negócios%20-%20TC%20-%20Aba%20Financeiro.md) definem que **LF, PF e OP** no TC são **somente leitura**, com **edição na Pré-Liquidação (PL)**. O `script-titulos-spa.js` exibe **LF e PF** nas abas Liquidação e Financeiro apenas como **consulta**; **OP** está `readonly`. O próximo **PROC** é gerado só via transação em **`contadores/titulos_proc_global`** (sem usar a lista local de títulos filtrada por status). A **lista** de pré-liquidações (`script-preliquidacao.js`) pode mostrar, para lotes **Fechados**, um selo derivado de LF/PF nos TCs (heurística até existir `itensNe[]`/status persistido na PL).

### Tipo de TC

O valor **NFG** (NF Genérica) substitui **OUT** (Outro) na UI; ver `titulos.html` e filtros de ND em `script-titulos-spa.js`.

---

## 1. Tela inicial – Lista de TC

| Regra | Situação no código | Observação |
|-------|-------------------|------------|
| Lista com paginação | ✅ Implementado | `titulosFiltrados()`, `paginaAtual`, `itensPorPagina` |
| 4 botões por linha (visualizar, editar, excluir, inativar/ativar, pdf) conforme permissões | ✅ Implementado | `gerarBotoesAcao` (editar, excluir) + script-titulos-spa (visualizar, inativar, pdf) por permissão |
| Paginação padrão 10; opções 10, 20, 50 | ✅ Implementado | `itensPorPagina`, select no HTML |
| Navegação: Primeiro \| Anterior \| x de y \| Próximo \| Último (ao centro) | ⚠️ Parcial | Botões existem; texto é "Primeira" (não "Primeiro"); layout com `space-between` (esquerda/direita) |
| "Mostrando X de Y registros" à esquerda | ✅ Implementado | `mostrandoDe`, `mostrandoTotal` |
| Botão para novo TC conforme permissões | ✅ Implementado | "+ Novo Título" com `data-permission="titulos_inserir"` |

---

## 2. Botão "Entrada" – Aba "Dados Básicos"

| Regra | Situação no código | Observação |
|-------|-------------------|------------|
| Aba "Dados Básicos" (demais ocultas no novo) | ⚠️ Nome diferente | Aba chamada "Rascunho"; demais ocultas/bloqueadas por status ✅ |
| Entrada Exefin (data, padrão hoje, obrigatório) | ✅ Implementado | `dataExefin` type=date, required; valor inicial não definido no HTML (pode ser hoje via JS) |
| OI de origem (busca coleção OI, obrigatório) | ✅ Implementado | Autocomplete OI, validação no submit |
| Contrato/Empresa (busca contratos, obrigatório) | ✅ Implementado | Autocomplete contratos; ao selecionar mostra dados + RC + vigência |
| Nº do Título de Crédito (texto, obrigatório) | ✅ Implementado | `numTC` required |
| Data da Emissão | ❌ Não conforme | Campo existe como **hidden**; regras pedem campo visível |
| Valor no TC (moeda R$, obrigatório) | ✅ Implementado | `valorNotaFiscal` data-moeda, required |
| Observações (texto) | ✅ Implementado | `observacoesTC` |
| Botão Salvar = rascunho, gera número TC, diálogo, pergunta continuar ou enviar Processamento | ✅ Implementado | Submit salva, mostra idProc, confirm "Deseja ENVIAR para Processamento?" |
| Botão Cancelar = aviso que perderá informações (diálogo) | ❌ Não conforme | `voltarParaListaTitulos()` é chamado sem `confirm` |

---

## 3. Botão "Editar" – Abre na aba "Dados Básicos"

| Regra | Situação no código | Observação |
|-------|-------------------|------------|
| Abre TC na aba "Dados Básicos" | ✅ Implementado | `editarTitulo()` chama `abrirFormularioTitulo()` e preenche; aba 0 ativa |
| Entrada Exefin, OI, Contrato/Empresa, Nº TC, Valor = **não habilitados inicialmente** | ❌ Não conforme | No código todos ficam editáveis ao abrir; regras pedem somente leitura até "Editar Aba" |
| Observações = texto salvo (editável) | ✅ Implementado | Campo preenchido e sempre editável |
| Botão "Editar Aba" = habilita todos os campos | ❌ Não implementado | Não existe botão por aba; só "Salvar" e "Cancelar" globais |
| Botão "Salvar Aba" = salva e desabilita campos | ❌ Não implementado | Salvar é global; não há "Salvar Aba" por aba |
| Botão "Cancelar" = avisa perda de informações (diálogo) | ❌ Não conforme | Sem confirm ao sair |

---

## 4. Aba "Processamento"

| Regra | Situação no código | Observação |
|-------|-------------------|------------|
| Vincular Empenhos (busca coleção NE) | ✅ Implementado | `buscaEmpenhoT`, lista empenhos |
| Lista de empenhos vinculados (carrinho; adicionar/excluir/editar) | ✅ Implementado | `empenhosDaNotaAtual`, tabela com LF/PF e remover |
| NE com dados da coleção (num NE, PTRES, FR, ND) e usuário completa subelemento, valor usado, VINC | ⚠️ Parcial | Valor usado (valorVinculado), LF, PF existem; PTRES/FR/ND vêm do empenho; "subelemento" e "VINC" não como campos nomeados |
| Vincular Tributação (busca códigos do contrato) | ⚠️ Parcial | Tributações manuais (tipo DARF/INSS/ISS + valor); não busca automática do contrato |
| Botões Editar Aba / Salvar Aba / Cancelar | ❌ Não implementado | Sem botões por aba |

---

## 5. Aba "Liquidação"

| Regra | Situação no código | Observação |
|-------|-------------------|------------|
| NP (Nota de Pagamento) | ✅ Implementado | Campo `np` |
| Lista de NE vinculadas ao TC | ✅ Implementado | NE + valores + LF/PF em modo consulta (dados gravados no TC / espelho da PL quando aplicável) |
| LF/PF somente leitura; edição na PL | ✅ Implementado | Sem seleção manual de LF nem edição de PF no TC; NP ainda editável na aba com fluxo “Editar/Salvar aba” |
| Botões Editar Aba / Salvar Aba / Cancelar | ⚠️ Parcial | Há ciclo Editar/Salvar na Liquidação para NP (e demais campos da aba); ver divergências globais no resumo |

---

## 6. Abas "Aguardando Financeiro" e "Para Pagamento"

| Regra | Situação no código | Observação |
|-------|-------------------|------------|
| Regras dizem "a implementar" | ✅ Parcial | Aba Financeiro: LF, PF e OP **somente leitura**; na **lista** da PL, lote **Fechado** pode exibir selo **Aguardando Fin.** / **Pgto parcial** / **Para pagamento** (heurística nos TCs; persistência na PL ainda evolutiva) |

---

## Resumo de divergências a corrigir no código

1. **Nome da primeira aba**: trocar "Rascunho" por "Dados Básicos" (ou manter e documentar).
2. **Data da Emissão**: exibir como campo visível na aba Dados Básicos.
3. **Ao editar TC**: campos da aba Dados Básicos (exceto Observações) iniciarem **desabilitados**; incluir botões **"Editar Aba"** e **"Salvar Aba"** nessa aba.
4. **Cancelar**: exibir **confirm** ("Deseja sair? As alterações não salvas serão perdidas.") antes de voltar à lista.
5. (Opcional) Navegação: texto "Primeiro" em vez de "Primeira" e alinhar ao centro; lista de NEs na aba Liquidação (read-only).

Implementações opcionais ou futuras: botões Editar Aba / Salvar Aba na aba Processamento; tributação vinculada ao contrato; campos subelemento e VINC explícitos; **UI na PL** para associar várias LFs por NE (`itensNe[]`) e gravar status financeiro do lote no Firestore em vez da heurística da lista.
