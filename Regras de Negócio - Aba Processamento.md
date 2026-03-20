# Regras de Negócio – Aba Processamento

Este documento descreve as regras de negócio da **Aba Processamento** (painel 1) do módulo de Títulos de Crédito (TC), no mesmo formato de [Regras de Negócio - Aba Liquidação.md](./Regras%20de%20Negócio%20-%20Aba%20Liquidação.md).

---

## 1. Contexto e fluxo geral

A Aba Processamento permite **vincular Notas de Empenho (NE)** ao TC e **completar** para cada vínculo: subelemento (2 dígitos), valor utilizado, centro de custos e UG beneficiária. Também comporta **tributações** (DARF/INSS/ISS) em lista editável.

Fluxo operacional:

1. O TC está em **Rascunho** ou **Em Processamento** (e abas desbloqueadas conforme status).
2. O usuário busca NE na coleção `empenhos`, respeitando filtros (contrato/CNPJ, tipo de TC, ND).
3. Para cada NE, preenche o painel de **informações complementares** e adiciona à lista.
4. Pode **editar** ou **remover** itens da lista.
5. Ao **enviar para Liquidação** (confirmação + salvar a partir de outra aba ou fluxo definido), exige **pelo menos uma NE** vinculada.

---

## 2. Posicionamento da aba

| Aba            | Índice | Relação com status                          |
|----------------|--------|---------------------------------------------|
| Dados Básicos  | 0      | Sempre                                      |
| **Processamento** | 1   | Disponível quando não bloqueada por status  |
| Liquidação     | 2      | Depende de avanço do TC                     |
| Financeiro     | 3      | …                                           |
| Histórico      | 4      | …                                           |

- O envio do TC para **Em Liquidação** exige **≥ 1** empenho em `empenhosVinculados` (validação no submit).

---

## 3. Campos e componentes

### 3.1 Busca de NE

| Elemento     | Regra |
|--------------|--------|
| Campo de busca | Mínimo de caracteres e filtros por contrato selecionado, tipo TC e sufixo de ND conforme implementação (`mostrarSugestoesEmpenho`). |
| Resultado    | Lista autocomplete; ao selecionar, abre o **painel de complementação**. |

### 3.2 Painel de informações complementares da NE (`detalhesVinculoEmpenho`)

| Campo            | Modo        | Regra de negócio |
|------------------|------------|------------------|
| ND               | Somente leitura | Preenchido a partir da NE selecionada. |
| Subelemento      | Ver RN-UX abaixo | Dois dígitos numéricos; origem ideal: dado da NE ou escolha entre subelementos da NE. |
| Valor utilizado  | Editável   | Mínimo R$ 0,01; não superior ao valor do TC. |
| Centro de custos | Select     | Obrigatório ao confirmar inclusão/atualização. |
| UG beneficiária  | Select     | Obrigatório ao confirmar inclusão/atualização. |
| Botão principal  | “Adicionar à Lista” / “Atualizar item” | Inclusão nova vs. edição de linha existente. |

**Regras desejadas de UX (alinhamento com pedido de produto):**

1. **Cancelar / fechar edição do painel**: deve existir ação explícita para sair do modo complementação **sem** gravar no array `empenhosDaNotaAtual`, com **confirmação** se houver alterações não aplicadas (“Desistir?” e aviso de perda de dados digitados).
2. **Mudança de aba (tabs TC)**: se o painel estiver aberto com alterações não salvas (nem aplicadas com “Atualizar item”), o sistema deve **perguntar** se deseja salvar/aplicar antes de trocar de aba, ou confirmar perda — ver implementação alvo na análise de bugs.
3. **Fechar formulário do TC ou abrir outro TC**: o painel deve **fechar e o estado de edição resetar**; se houver risco de perda de dados, aplicar o mesmo padrão de confirmação.
4. **Consistência de contexto**: ao trocar de TC, não deve permanecer visível NE ou valores do TC anterior no painel.

### 3.3 Tabela de NEs vinculadas

| Coluna        | Descrição |
|---------------|-----------|
| NE            | Número (formato visível conforme `formatarNumEmpenhoVisivel`). |
| ND            | Da NE / vínculo. |
| Subelemento   | Armazenado no item do TC. |
| Valor         | `valorVinculado`. |
| Centro custos / UG | Resolvidos para exibição. |
| Ações         | Editar, Remover. |

### 3.4 Totais

- **Total vinculado**: soma dos `valorVinculado`.
- **Total a vincular**: valor do TC − total vinculado (referência para o usuário).

### 3.5 Tributações

- Lista de itens com tipo (DARF/INSS/ISS) e valor; adicionar/remover linhas.
- Persistência em `tributacoes` no documento do TC.

---

## 4. Regras ao editar um vínculo existente

- Ao clicar em **Editar** na linha: o painel abre com dados da linha; o botão passa a **Atualizar item**.
- **ND e subelemento**: na implementação atual, no modo atualização o código indica que ND e subelemento são “derivados da NE” e **não são alterados** pelo fluxo de atualização — apenas valor, centro de custos e UG. Qualquer mudança de regra de negócio (permitir trocar subelemento) deve ser explicitada antes de alterar código.
- Após **Atualizar item**, o painel deve fechar e a tabela atualizar.

---

## 5. Dependências com outras abas

| Aba        | Dependência |
|------------|-------------|
| Dados Básicos | Contrato, fornecedor, tipo TC, valor do TC. |
| Liquidação | Consome `empenhosVinculados` (NE, ND, valor, CC, UG) em modo leitura na tabela de LF. |
| Financeiro | Mesmo array; LF/PF por linha. |

---

## 6. Coleções Firestore

### 6.1 `titulos`

| Campo                 | Uso |
|-----------------------|-----|
| `empenhosVinculados`  | Array de objetos: `numEmpenho`, `ptres`, `fr`, `nd`, `subelemento`, `valorVinculado`, `centroCustosId`, `ugId`, `lf`, `pf`, … |
| `tributacoes`         | Array de tributos. |

### 6.2 `empenhos`

- Fonte da busca de NE; campos típicos: `numEmpenho`, `nd`, `ptres`, `fr`, `cnpj`, `subitem` (ou `subelemento`, conforme importação).

---

## 7. Validações

1. Subelemento: **exatamente 2 dígitos** numéricos.
2. Valor utilizado: positivo, mínimo 0,01; não maior que valor do TC.
3. Centro de custos e UG: obrigatórios ao adicionar ou atualizar.
4. Envio para Liquidação: pelo menos uma NE na lista.

---

## 8. Resumo das regras principais

1. NE elegíveis dependem de **contrato**, **CNPJ** e **tipo de TC** (e ND válido).
2. Cada vínculo armazena **subelemento + valor + CC + UG** (e depois LF/PF nas abas seguintes).
3. O painel de complementação deve ter **fluxo de cancelamento** e **proteção na navegação** (abas / fecho / troca de TC), conforme secção 3.2.
4. Remoção de linha é imediata na lista em memória até o **Salvar** global do TC persistir no Firestore.
