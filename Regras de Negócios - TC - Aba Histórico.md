# Regras de Negócio – Aba Histórico

Este documento descreve as regras de negócio da **Aba Histórico** (painel 4) do módulo de Títulos de Crédito (TC), no mesmo formato de [Regras de Negócios - TC - Aba Liquidação.md](./Regras%20de%20Negócios%20-%20TC%20-%20Aba%20Liquidação.md).

---

## 1. Contexto e fluxo geral

A Aba Histórico apresenta o **registro cronológico de mudanças de status** e informações associadas (utilizador, motivo em devoluções, etc.). Não há edição pelo utilizador: função **auditiva e de acompanhamento**.

---

## 2. Posicionamento da aba

| Aba           | Índice | Acesso |
|---------------|--------|--------|
| Dados Básicos | 0      | Sempre |
| Processamento | 1      | Conforme status |
| Liquidação    | 2      | Conforme status |
| Financeiro    | 3      | Conforme status |
| **Histórico** | 4      | **Tipicamente sempre** (aba não bloqueada pelo mesmo critério das demais em `bloquearTabsPorStatus`) |

- Na implementação atual, para status **Devolvido**, as abas 0–3 podem aparecer bloqueadas e a **Histórico** permanece utilizável para consulta.

---

## 3. Conteúdo exibido

### 3.1 Tabela de histórico

| Coluna           | Origem |
|------------------|--------|
| Data/hora        | `historicoStatus[].data` (Timestamp Firestore ou equivalente). |
| Status           | `historicoStatus[].status` ou `statusNovo`. |
| Utilizador       | Email ou identificador em `historicoStatus[].usuario`. |
| Motivo (Devolvido) | `historicoStatus[].motivoDevolucao` quando aplicável. |

### 3.2 Eventos típicos registados

- Criação / Rascunho.
- Em Processamento.
- Em Liquidação / Liquidado.
- Aguardando Financeiro / Para Pagamento / Para Pagamento parcial (quando aplicável ao TC e à PL).
- Devolvido (com motivo e metadados no modal de devolução).
- Dar nova entrada (reabertura após devolução, conforme fluxo).

---

## 4. Regras de negócio

1. **Somente leitura**: nenhum campo da aba altera o Firestore diretamente.
2. **Integridade**: cada transição de status relevante deve gerar **entrada** em `historicoStatus` no mesmo ato da `update` do documento (salvo casos técnicos documentados).
3. **Ordem**: exibição por ordem de inclusão no array (ou ordenação por data na UI, se implementada).

---

## 5. Dependências

| Origem do dado | Descrição |
|----------------|-----------|
| Todas as abas / ações globais | Qualquer operação que chame `update` no TC com novo `status` ou com push em `historicoStatus`. |
| Modal Devolver | Adiciona motivo e OI de destino no fluxo de devolução. |

---

## 6. Coleção Firestore

### `titulos.historicoStatus`

Estrutura de item (campos usados na prática):

- `status` (ou `statusNovo`)
- `data` (`Timestamp`)
- `usuario`
- `motivoDevolucao` (opcional)
- Outros campos opcionais conforme evolução (ex.: `statusAnterior`, `dataDevolucao` em fluxos específicos)

---

## 7. Resumo

1. A aba **não edita** dados; apenas **exibe** o histórico.
2. Deve refletir **todas** as transições de status significativas gravadas no documento.
3. Em TC **Devolvido**, continua a ser o ponto principal de **consulta** do motivo e da linha do tempo.
