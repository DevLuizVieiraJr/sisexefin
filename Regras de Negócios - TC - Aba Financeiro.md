# Regras de Negócio – Aba Financeiro (TC)

Este documento descreve as regras de negócio da **Aba Financeiro** (painel 3) do módulo de Títulos de Crédito (TC), alinhado a [Regras de Negócios - TC - Aba Liquidação.md](./Regras%20de%20Negócios%20-%20TC%20-%20Aba%20Liquidação.md).

---

## 1. Contexto e fluxo geral

A Aba Financeiro é **exclusivamente informativa** em relação a **LF**, **PF** e **OP**: o utilizador **não edita** esses dados nesta aba. A origem oficial das informações de liquidação e pagamento é o módulo **Pré-Liquidação (PL)** (`preliquidacao.html`), que projeta para o TC o que foi consolidado na PL.

Fluxo conceitual:

1. O TC encontra-se tipicamente em **Liquidado**, **Aguardando Financeiro**, **Para Pagamento** ou **Para Pagamento parcial** (conforme regras da PL e projeção no TC).
2. Para cada NE, **LF** e **PF** são exibidos em **somente leitura** (valores vindos da PL / projeção no documento do TC).
3. **OP (Ordem de Pagamento)** é exibida em **somente leitura**; quando preenchida, origina-se do mesmo conjunto de regras integrado à PL (não edição livre nesta aba).

---

## 2. Posicionamento da aba

| Aba | Índice | Status que habilita acesso (referência) |
|-----|--------|----------------------------------------|
| Dados Básicos | 0 | Sempre |
| Processamento | 1 | Rascunho ou posterior |
| Liquidação | 2 | Em Processamento ou posterior |
| **Financeiro** | 3 | Em Liquidação ou posterior |
| Histórico | 4 | Qualquer status |

O bloqueio exato segue `bloquearTabsPorStatus` no front-end.

---

## 3. Campos da aba (todos somente leitura)

### 3.1 Tabela NE × valor × LF × PF

| Coluna | Modo | Regra |
|--------|------|--------|
| NE | Somente leitura | Identificação da NE vinculada. |
| Valor | Somente leitura | Valor vinculado ao TC (`valorVinculado` ou equivalente). |
| LF | Somente leitura | Projeção a partir da **PL** (pode refletir uma ou mais LFs consolidadas por NE na PL). |
| PF | Somente leitura | Projeção a partir da **PL**. |

### 3.2 OP (Ordem de Pagamento)

| Campo | Modo | Regra |
|-------|------|--------|
| OP | Somente leitura | Exibida no TC quando disponível; não editável nesta aba. |

---

## 4. Transição de status (resumo)

A evolução para **Aguardando Financeiro**, **Para Pagamento** e **Para Pagamento parcial** no TC segue a mesma lógica descrita na Aba Liquidação e na **PL**:

- **Aguardando Financeiro** (PL / reflexo no TC): nenhuma LF com PF (conforme regra acordada na PL).
- **Para Pagamento parcial**: parte das LFs com PF e parte sem.
- **Para Pagamento**: todas as LFs com PF.

---

## 5. Dependências

| Origem | Relação |
|--------|---------|
| Aba Processamento | NE e valores vinculados ao TC. |
| Módulo PL | Fonte oficial de LF, PF e integração com OP quando aplicável. |
| Aba Liquidação | Mesma linha de exibição somente leitura para LF/PF. |

---

## 6. Coleções Firestore (referência)

- `titulos`: campos e estrutura em `empenhosVinculados` devem refletir a projeção acordada a partir da PL (evolução de modelo documentada junto à PL).
- Integração com `preLiquidacoes` (ou coleção equivalente da PL): detalhar no documento de RN da Pré-Liquidação.

---

## 7. Validações no salvamento

- Não há campos editáveis nesta aba para LF/PF/OP; o **submit** global do TC não deve tratar esta aba como ponto de entrada desses dados.
- Validações globais do TC (dados básicos, NP em Liquidação, etc.) aplicam-se ao formulário conforme implementação.

---

## 8. Resumo das regras principais

1. **LF, PF e OP são somente leitura** na Aba Financeiro.
2. **Edição** ocorre no módulo **Pré-Liquidação**, com unificação de NE por PL e múltiplas LFs por NE na PL.
3. **Status** do TC alinha-se à completude de LF/PF projetada da PL.

---

## 9. UX – navegação com edição pendente

Se existir edição pendente noutros painéis (ex.: painel de NE na Aba Processamento), aplicam-se as regras de [Regras de Negócios - TC - Aba Processamento.md](./Regras%20de%20Negócios%20-%20TC%20-%20Aba%20Processamento.md).
