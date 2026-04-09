# Regras de Negócio – Aba Liquidação (TC)

Este documento descreve as regras de negócio da **Aba Liquidação** do módulo de Títulos de Crédito (TC) e a relação com o módulo **Pré-Liquidação** (`preliquidacao.html`).

---

## 1. Contexto e fluxo geral

1. O usuário realiza a liquidação no **SIAFI** (sistema externo).
2. O SIAFI gera o número da **NP (Nota de Pagamento)**.
3. O usuário informa a **NP** no TC (quando aplicável ao status), conforme regras abaixo.
4. As **LF (Liquidação Financeira)** e **PF (Pedido Financeiro)** associadas às NE do TC **não são editadas** nesta aba: são informadas e mantidas no módulo **Pré-Liquidação (PL)**, que consolida um ou mais TCs.
5. A Aba Liquidação do TC **exibe** (somente leitura) os dados de LF/PF já consolidados na PL para as NE que pertencem ao TC.

---

## 2. Posicionamento da Aba Liquidação

| Aba | Índice | Status que habilita acesso |
|-----|--------|----------------------------|
| Dados Básicos | 0 | Sempre |
| Processamento | 1 | Rascunho ou posterior |
| **Liquidação** | 2 | Em Processamento ou posterior |
| Financeiro | 3 | Em Liquidação ou posterior |
| Histórico | 4 | Qualquer status |

- A Aba Liquidação permanece acessível quando o TC está em **Em Processamento**, **Em Liquidação**, **Liquidado**, **Aguardando Financeiro**, **Para Pagamento** ou **Para Pagamento parcial** (conforme evolução do produto e `bloquearTabsPorStatus`).

---

## 3. Campos da Aba Liquidação

### 3.1 Cabeçalho (edição no TC, quando permitido)

| Campo | Tipo | Obrigatório | Origem | Observação |
|-------|------|-------------|--------|------------|
| **NP (Nota de Pagamento)** | Texto | Sim* | Entrada manual no TC | *Obrigatória para salvar quando o TC está em status **Em Liquidação**. Gerada pelo SIAFI. |
| **Data de Liquidação** | Data | Não | Entrada manual no TC | Opcional. |

### 3.2 Tabela de NEs (somente leitura)

Lista das NE vinculadas na **Aba Processamento**; colunas de identificação e valores do vínculo permanecem **somente leitura**.

| Coluna | Modo | Descrição |
|--------|------|-----------|
| NE, ND, Valor, Centro de Custos, UG | Somente leitura | Conforme `empenhosVinculados` e cadastros auxiliares. |
| **LF** | Somente leitura | Exibida a partir dos dados consolidados na **PL** (ver secção 4). |
| **PF** | Somente leitura | Exibida a partir dos dados consolidados na **PL**. |

**Não há** seleção de LF na coleção `lfpf` nem edição de LF/PF nesta aba.

---

## 4. Pré-Liquidação (PL) – fonte oficial de LF e PF

### 4.1 Papel da PL

- Uma **PL** pode conter **um ou mais TC**.
- Um **TC** pode ter **uma ou mais NE**.
- NEs podem ser **compartilhadas** entre TCs dentro da **mesma PL**.

### 4.2 Unificação de NE idênticas na PL

- Dentro de uma PL, NEs com o **mesmo identificador** (mesma NE) são tratadas como **uma única linha lógica** para fins de informação de LF/PF.
- O sistema **unifica** os valores quando a mesma NE aparece em mais de um TC da PL: o utilizador informa LF (e posteriormente PF) para essa NE de forma **única no âmbito da PL**; a alteração reflete em **todos os TC** que compartilham essa NE **nessa PL**.
- Se a PL listar 6 linhas de NE que correspondem a apenas **3 NE distintas**, o utilizador informa LF para cada **NE distinta** (mínimo uma LF por NE distinta, conforme regras operacionais da PL).

### 4.3 Cardinalidade de LF por NE (na PL)

- Cada NE (no âmbito unificado da PL) pode ter **uma ou mais LFs**.
- Cada LF pode ter um **valor** associado à liquidação; a soma dos valores das LFs daquela NE deve **fechar** o valor da NE na PL (ex.: valores *x* e *y* com *x + y* igual ao valor da NE).

### 4.4 Sincronização com o TC

- Após gravação na PL, a Aba Liquidação do TC **apresenta** as LF/PF aplicáveis às NE do TC (projeção somente leitura).
- O modelo físico em Firestore pode evoluir (ex.: estrutura em `empenhosVinculados` ou referência à PL); a regra de negócio é: **edição na PL, visualização no TC**.

---

## 5. NP (Nota de Pagamento) no TC

- **Origem**: número gerado pelo SIAFI após a liquidação.
- **Obrigatoriedade**: obrigatória para **salvar** quando o TC está em **Em Liquidação**.
- **Efeito no status**: ao salvar com NP preenchida e status **Em Liquidação**, o TC avança para **Liquidado** (conforme fluxo atual de persistência).
- **Persistência**: campo `np` no documento do TC (`titulos`); vínculo opcional na coleção `np` quando implementado.

---

## 6. Transição de status do TC (LF / PF)

Após **Liquidado**, a evolução passa a depender do **preenchimento na PL** (refletido no TC):

| Situação | Status do TC |
|----------|----------------|
| Nem todas as NE do TC possuem LF informadas na PL (projeção completa) | Permanece **Liquidado** |
| Todas as NE do TC com LF informadas na PL | **Aguardando Financeiro** |
| Todas as LFs (daquelas NE) com PF informadas na PL | **Para Pagamento** |

**Observação:** o detalhe de como o sistema detecta “todas as NE com LF” e “todas as LFs com PF” deve estar alinhado à implementação da PL e à projeção no documento do TC.

---

## 7. Transição de status da PL (referência cruzada)

Na PL, regra acordada para PF:

| Situação | Status da PL |
|----------|----------------|
| Nenhuma LF com PF | **Aguardando Financeiro** |
| Parte das LFs com PF e parte sem | **Para Pagamento parcial** |
| Todas as LFs com PF | **Para Pagamento** |

Outros estados possíveis da PL (fora deste detalhamento): Rascunho, Liquidada, Paga, Comprovação, Cancelada.

---

## 8. Dependências com outras abas e módulos

| Origem | Relação |
|--------|---------|
| Aba Processamento | Origem das NE em `empenhosVinculados`. |
| Módulo PL | Fonte oficial de edição de LF e PF por NE (unificação dentro da PL). |
| Aba Financeiro | Também somente leitura para LF, PF e OP; dados coerentes com a PL. |
| SIAFI | Geração da NP informada no TC. |

---

## 9. Validações no salvamento (TC)

1. Em status **Em Liquidação**: **NP obrigatória**; caso contrário, bloquear salvamento com mensagem clara.
2. **LF/PF**: não validadas como entrada nesta aba (somente leitura).
3. Envio para **Em Liquidação** (fluxo anterior): exige ao menos **uma NE** vinculada na Aba Processamento.

---

## 10. Resumo das regras principais

1. **NP** continua sendo informada no TC quando o status exige (ex.: **Em Liquidação**).
2. **LF e PF** são informados na **PL**, não na Aba Liquidação.
3. A Aba Liquidação é **informativa** para LF/PF, com **unificação de NE por PL** e **múltiplas LFs por NE** na PL, com soma de valores igual ao valor da NE.
4. Status do TC evolui de **Liquidado** para **Aguardando Financeiro** / **Para Pagamento** conforme completude de LF/PF projetada da PL.
