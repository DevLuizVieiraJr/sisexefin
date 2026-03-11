# Verificação: Regras do Título de Crédito vs Código

Referência: `Titulo de Crédito - Regras.txt` (linhas 1-72).

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
| Lista de NE vinculadas ao TC | ⚠️ Parcial | Lista está na aba Processamento; Liquidação só tem NP e Data Liquidação |
| Botões Editar Aba / Salvar Aba / Cancelar | ❌ Não implementado | Sem botões por aba |

---

## 6. Abas "Aguardando Financeiro" e "Para Pagamento"

| Regra | Situação no código | Observação |
|-------|-------------------|------------|
| Regras dizem "a implementar" | ✅ Coerente | Aba "Financeiro" (panel3) existe com LF/PF e OP; fluxo por status cobre esses estados |

---

## Resumo de divergências a corrigir no código

1. **Nome da primeira aba**: trocar "Rascunho" por "Dados Básicos" (ou manter e documentar).
2. **Data da Emissão**: exibir como campo visível na aba Dados Básicos.
3. **Ao editar TC**: campos da aba Dados Básicos (exceto Observações) iniciarem **desabilitados**; incluir botões **"Editar Aba"** e **"Salvar Aba"** nessa aba.
4. **Cancelar**: exibir **confirm** ("Deseja sair? As alterações não salvas serão perdidas.") antes de voltar à lista.
5. (Opcional) Navegação: texto "Primeiro" em vez de "Primeira" e alinhar ao centro; lista de NEs na aba Liquidação (read-only).

Implementações opcionais ou futuras: botões Editar Aba / Salvar Aba nas abas Processamento e Liquidação; tributação vinculada ao contrato; campos subelemento e VINC explícitos.
