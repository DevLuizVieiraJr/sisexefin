# Regras de Negócio – Aba Dados Básicos

Este documento descreve as regras de negócio da **Aba Dados Básicos** (painel 0) do módulo de Títulos de Crédito (TC), alinhado ao modelo de [Regras de Negócios - TC - Aba Liquidação.md](./Regras%20de%20Negócios%20-%20TC%20-%20Aba%20Liquidação.md).

---

## 1. Contexto e fluxo geral

A Aba Dados Básicos concentra a **identificação do TC**, o **vínculo com OI, fornecedor e contrato** e os **valores e datas** necessários para registrar o título. É a primeira aba do fluxo e o ponto de partida para **Rascunho** e envio posterior a **Processamento**.

Fluxo resumido:

1. O usuário cria um novo TC ou abre um TC existente para edição.
2. Preenche ou revisa os campos obrigatórios (entrada EXEFIN, OI, tipo de TC, fornecedor, contrato, nº TC, valor, datas).
3. Salva o formulário; o status permanece em **Rascunho** (ou o status atual, se já avançado) quando o salvamento é feito **com esta aba ativa** (ver código: `indiceAbaAtiva === 0`).
4. Pode enviar para **Processamento** via ação específica (“Enviar para Processamento”), quando aplicável.

---

## 2. Posicionamento da aba

| Aba            | Índice | Status que habilita acesso (referência)     |
|----------------|--------|---------------------------------------------|
| **Dados Básicos** | 0   | Sempre (demais abas seguem regra de status) |
| Processamento  | 1      | Conforme `bloquearTabsPorStatus`            |
| Liquidação     | 2      | Em Processamento ou posterior               |
| Financeiro     | 3      | Em Liquidação ou posterior                  |
| Histórico      | 4      | Qualquer status                             |

- A aba **Dados Básicos** está sempre acessível na navegação por abas (salvo bloqueios globais por perfil/permissão, se existirem).
- O **stepper** de status na tela do TC reflete o ciclo: Rascunho → Em Processamento → Em Liquidação → …

---

## 3. Campos da aba

### 3.1 Identificação e parâmetros fixos

| Campo        | Tipo   | Obrigatório | Observação                                      |
|-------------|--------|-------------|-------------------------------------------------|
| Ano         | Texto  | Sim (UI)    | Preenchido com valor padrão (ex.: ano corrente). |
| UG          | Texto  | Sim (UI)    | Unidade gestora padrão do sistema.              |
| Tipo de TC  | Select | Sim         | NFE, NFSE, FAT, BO, NFG — filtra NE na busca (`NFG` = NF Genérica).   |

### 3.2 Dados principais do TC

| Campo                 | Tipo   | Obrigatório | Origem / regra |
|-----------------------|--------|-------------|----------------|
| Entrada na EXEFIN     | Data   | Sim         | Data de entrada no fluxo EXEFIN.               |
| OI de origem          | Busca  | Sim         | Coleção OI; armazena ID em `oiEntregou`.       |
| Nº do TC              | Texto  | Sim         | Identificação do título.                       |
| Valor (R$)            | Moeda  | Sim         | Valor do TC; usado para teto de valor por NE.  |
| Data de emissão do TC | Data   | Sim         |                                                |
| Data do ateste        | Data   | Sim         | Entre emissão e data atual (validação).         |

### 3.3 Contrato e fornecedor

| Campo              | Tipo   | Obrigatório | Regra |
|--------------------|--------|-------------|--------|
| Fornecedor         | Busca  | Sim         | Filtra contratos disponíveis. |
| Contrato           | Select | Sim         | Após fornecedor; preenche vigência, fiscal, RC. |
| RC do contrato     | Select | Condicional | **Obrigatório** se o contrato tiver RC cadastrado; se o contrato **não** tiver RC, pode salvar **sem** RC. |
| Vigência / fiscal  | Leitura | —          | Derivados do contrato. |

### 3.4 Observações

| Campo        | Tipo     | Obrigatório |
|-------------|----------|-------------|
| Observações | Textarea | Não         |

### 3.5 Ações específicas da aba (quando TC já salvo)

- **Editar Aba** / **Salvar Aba** (Dados Básicos): habilitam ou persistem apenas o bloco de dados básicos, conforme implementação em `atualizarBotoesAbaDadosBasicos` / fluxo de submit com flag `salvandoApenasAbaDadosBasicos`.

---

## 4. Regras de negócio específicas

### 4.1 Salvamento com aba Dados Básicos ativa

- Não deve alterar o status do TC apenas por salvar nesta aba: mantém **Rascunho** ou o status já existente.
- Validações mínimas: OI, fornecedor, contrato, tipo TC, valor &gt; 0, datas obrigatórias e coerência ateste × emissão.

### 4.2 Primeiro salvamento (TC novo)

- Gera `idProc` e documento na coleção `titulos`.
- Pode exibir modal perguntando se continua em Rascunho ou envia para Processamento (conforme fluxo atual).

### 4.3 Envio para Processamento

- Ação dedicada (botão), não confundir com “Salvar” genérico.
- Exige TC já persistido com ID válido.

---

## 5. Dependências com outras abas

| Aba           | Relação com Dados Básicos |
|---------------|---------------------------|
| Processamento | Tipo de TC e contrato/fornecedor filtram **NE** elegíveis; valor do TC limita soma dos valores vinculados por NE. |
| Liquidação    | NP no TC quando o status exige; **LF/PF** exibidos em somente leitura, vindos da **Pré-Liquidação (PL)**. |
| Financeiro    | **LF, PF e OP** somente leitura; dados projetados da **PL**. |
| Histórico     | Registra mudanças de status iniciadas após avanço do fluxo. |

---

## 6. Coleções Firestore (campos relevantes no TC)

| Campo / grupo        | Uso na aba |
|----------------------|------------|
| `tipoTC`, `dataExefin`, `numTC`, `valorNotaFiscal`, `dataEmissao`, `dataAteste` | Núcleo do TC. |
| `fornecedorNome`, `fornecedorCnpj`, `instrumento`, `rc`, dados de vigência/fiscal | Contrato. Campo `fornecedor` (texto único) é **legado**; preferir `fornecedorNome` + `fornecedorCnpj` na documentação e novos desenvolvimentos. |
| `oiEntregou`         | OI de origem. |
| `observacoes`        | Texto livre. |
| `status`, `historicoStatus` | Atualizados em outros fluxos; salvamento só aba 0 preserva status. |

---

## 7. Resumo das regras principais

1. **Todos os campos obrigatórios** da aba devem estar válidos antes do submit.
2. **Salvar com Dados Básicos ativo** não deve promover o status sozinho.
3. **Tipo de TC** é obrigatório e impacta a **busca de NE** na aba Processamento.
4. **Valor do TC** é teto para o **valor utilizado** por cada NE vinculada.

---

## 8. Regras de UX – consistência com o painel de NE (referência)

Quando existir **edição em curso** noutros painéis do mesmo formulário (ex.: painel de complementação de NE na aba Processamento), a navegação para outra aba ou o fecho do TC deve seguir as regras documentadas em [Regras de Negócios - TC - Aba Processamento.md](./Regras%20de%20Negócios%20-%20TC%20-%20Aba%20Processamento.md) (secção sobre painel NE e navegação).
