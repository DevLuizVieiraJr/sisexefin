# Regras de Negócio – Aba Financeiro

Este documento descreve as regras de negócio da **Aba Financeiro** (painel 3) do módulo de Títulos de Crédito (TC), no mesmo formato de [Regras de Negócio - Aba Liquidação.md](./Regras%20de%20Negócio%20-%20Aba%20Liquidação.md).

---

## 1. Contexto e fluxo geral

A Aba Financeiro concentra o **complemento financeiro** após a liquidação: confirmação ou preenchimento do **Pedido Financeiro (PF)** por NE, uso da **LF** já definida na Liquidação e o campo **OP (Ordem de Pagamento)**, frequentemente alimentado por importação CSV.

Fluxo:

1. O TC encontra-se tipicamente em **Liquidado**, **Aguardando Financeiro** ou **Para Pagamento** (conforme regras de transição de status).
2. Para cada NE, a **LF** é exibida em modo **somente leitura** (definida na Aba Liquidação).
3. O usuário informa ou ajusta **PF** quando aplicável.
4. A **OP** pode ser preenchida manualmente ou via import em lote.

---

## 2. Posicionamento da aba

| Aba           | Índice | Status que habilita acesso (referência) |
|---------------|--------|----------------------------------------|
| Dados Básicos | 0      | Sempre                                 |
| Processamento | 1      | Rascunho ou posterior                  |
| Liquidação    | 2      | Em Processamento ou posterior          |
| **Financeiro** | 3     | Em Liquidação ou posterior             |
| Histórico     | 4      | Qualquer status                        |

- O bloqueio exato segue `bloquearTabsPorStatus` no front-end: abas “à frente” do status ficam bloqueadas até o TC avançar.

---

## 3. Campos da aba

### 3.1 Tabela NE × LF × PF

| Coluna   | Modo           | Regra |
|----------|----------------|--------|
| NE       | Leitura        | Identificação da NE vinculada. |
| Valor    | Leitura        | `valorVinculado` do vínculo. |
| LF       | Leitura        | Valor de `empenhosVinculados[].lf`; não editável nesta aba. |
| PF       | Editável       | Input por linha; pode vir preenchido pela LFxPF quando a LF está atendida (preenchimento na Liquidação). |

### 3.2 OP (Ordem de Pagamento)

| Campo | Tipo  | Obrigatório | Origem |
|-------|-------|-------------|--------|
| OP    | Texto | Conforme processo | Manual ou import CSV (rotina de import no sistema). |

---

## 4. Regras de negócio específicas

### 4.1 LF

- **Não é editável** na Aba Financeiro.
- Alteração de LF implica voltar à **Aba Liquidação** (e respeitar status/permissões).

### 4.2 PF

- Editável na tabela por NE.
- Quando a LF selecionada na Liquidação possui PF na coleção **lfpf**, o sistema pode **pré-preencher** PF ao salvar/atualizar a Liquidação; o usuário pode revisar na Aba Financeiro.

### 4.3 Transição de status (resumo)

- Com **todas** as NEs com LF preenchida: tende a **Aguardando Financeiro**.
- Com **todas** com LF e PF: tende a **Para Pagamento**.
- Detalhe exato no fluxo de `submit` do formulário TC (`script-titulos-spa.js`).

### 4.4 OP

- Persistida no documento do TC (`op`).
- Import em lote atualiza TCs conforme regras da funcionalidade de import (fora do escopo fino desta aba, mas referenciada na UI).

---

## 5. Dependências com outras abas

| Aba          | Relação |
|--------------|---------|
| Processamento | Origem das NE e valores na tabela. |
| Liquidação    | Define LF (e PF automático via LFxPF quando aplicável). |
| Histórico     | Registra evolução para Aguardando Financeiro / Para Pagamento. |

---

## 6. Coleções Firestore

### 6.1 `titulos`

| Campo                 | Uso na aba Financeiro |
|-----------------------|------------------------|
| `empenhosVinculados`  | Por item: `lf`, `pf`, `valorVinculado`, `numEmpenho`, … |
| `op`                  | Ordem de pagamento do TC. |
| `status`              | Liquidado, Aguardando Financeiro, Para Pagamento, … |

### 6.2 `lfpf` (LFxPF)

- Consultada na Liquidação; efeitos colaterais na PF exibida/editável aqui.

---

## 7. Validações no salvamento

- As validações globais do TC (dados básicos, NP em Liquidação, etc.) aplicam-se ao **mesmo** submit unificado do formulário.
- Regras específicas de PF/OP em branco para avançar status seguem a lógica de “todos com LF / todos com PF” no código de persistência.

---

## 8. Resumo das regras principais

1. **LF é somente leitura** na Aba Financeiro.
2. **PF é editável** por NE e pode ser autopreenchida pela LFxPF.
3. **OP** é atributo do TC, não por NE na modelagem atual.
4. **Status** pode avançar para Aguardando Financeiro / Para Pagamento quando LF/PF satisfazem as condições globais.

---

## 9. UX – navegação com edição pendente

Se o utilizador tiver o **painel de complementação de NE** aberto na aba Processamento (ou outro modo de edição inline futuro), as regras de confirmação antes de trocar de aba ou fechar o TC aplicam-se de forma transversal; ver [Regras de Negócio - Aba Processamento.md](./Regras%20de%20Negócio%20-%20Aba%20Processamento.md).
