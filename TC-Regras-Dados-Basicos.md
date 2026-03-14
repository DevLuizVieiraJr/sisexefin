# Especificação – Módulo Títulos de Crédito (TC)
## Aba Dados Básicos – Regras, Campos, Tipos e Ações

**Versão:** 1.0  
**Data:** 13/03/2026

---

## 1. Visão geral

O módulo TC possui múltiplas abas. Este documento descreve **exclusivamente a aba Dados Básicos**, incluindo campos, tipos, validações, botões e regras de fluxo.

As abas **Processamento**, **Liquidação**, **Financeiro** e **Auditoria** mantêm a implementação atual e serão especificadas posteriormente.

---

## 2. Ordem e estrutura dos campos

### Bloco A (sem título) – Linha 1

| Campo | Nome | Tipo | Opções/Regras | Padrão | Obrigatório | Editável |
|-------|------|------|---------------|--------|-------------|----------|
| 1 | Ano | texto (4 dígitos) | Fixo 2026 | 2026 | Sim | Não (somente leitura, salva em BD) |
| 2 | UG | texto (6 dígitos) | Fixo 741000 | 741000 | Sim | Não (somente leitura, salva em BD) |
| 3 | Tipo de TC | select | NF, FT, BO, OT | Nota Fiscal (NF) | Sim | Sim |
| 4 | Entrada na EXEFIN | data (dd/mm/yyyy) | Datas de hoje ou anteriores | Hoje | Sim | Sim |

**Layout responsivo:**
- Desktop: 4 campos em uma linha
- Mobile: 2 campos por linha (2 linhas de 2)

---

### Bloco B – Dados do Documento Origem (Linha 1)

| Campo | Nome | Tipo | Opções/Regras | Padrão | Obrigatório | Editável |
|-------|------|------|---------------|--------|-------------|----------|
| 5 | OI de Origem | coleção OI (autocomplete) | Busca por número, nome, contato, telefone (≥2 caracteres) | Vazio | Sim | Sim |
| 6 | Nº do TC | texto | Limite 50 caracteres | Vazio | Sim | Sim |
| 7 | Valor | moeda R$ | 2 dígitos decimais | Vazio | Sim | Sim |
| 8 | Data de Emissão do TC | data | Datas de hoje ou anteriores | Vazio | Sim | Sim |
| 9 | Data do Ateste (Certificação) | data | Entre data de emissão e hoje | Vazio | Sim | Sim |

**Layout responsivo:**
- Desktop: 5 campos em linha (3 + 2)
- Mobile: 2–3 campos por linha

**Validação Data Ateste:** Data deve estar entre a Data de Emissão do TC e a data atual.

---

### Bloco C – Dados do Contrato e Fornecedor

**Fluxo:** Selecionar Fornecedor primeiro → depois Contrato (instrumentos filtrados pelo fornecedor).

| Campo | Nome | Tipo | Opções/Regras | Padrão | Obrigatório | Editável |
|-------|------|------|---------------|--------|-------------|----------|
| 10 | Fornecedor | coleção Contratos (busca) | Lista de fornecedores distintos, sem repetir | Vazio | Sim | Sim |
| 11 | Contrato | select/list | Instrumentos do fornecedor selecionado. Desabilitado se campo 10 vazio | Vazio | Não | Sim |
| 12 | Valor do Contrato | moeda R$ | Preenchimento automático do valor global do contrato | Valor do contrato | Sim | Não |
| 13 | RC do Contrato | select | Um RC (contrato pode ter 1 ou mais RC) | Vazio | Sim | Não |
| 14 | Início da Vigência | data | Preenchimento automático do contrato | Vazio | Sim | Não |
| 15 | Fim da Vigência | data | Preenchimento automático do contrato | Vazio | Sim | Não |
| 16 | Fiscal do Contrato | texto | Preenchimento automático do contrato | Vazio | Não | Não |
| 17 | Contato do Fiscal | texto | Preenchimento automático do contrato | Vazio | Não | Não |

**Nota:** Fiscal e Contato do Fiscal devem existir na coleção Contratos. Se não existirem, implementar nessa coleção.

**Layout responsivo:**
- Linha 1: Fornecedor, Contrato, Valor do Contrato, RC
- Linha 2: Início Vigência, Fim Vigência, Fiscal, Contato Fiscal
- Mobile: 2 campos por linha

---

### Bloco D

| Campo | Nome | Tipo | Opções/Regras | Padrão | Obrigatório | Editável |
|-------|------|------|---------------|--------|-------------|----------|
| 18 | Observações | textarea | Livre | Vazio | Não | Sim |

---

## 3. Botões e ações

### 3.1 Botões na aba Dados Básicos

| Botão | Visibilidade | Condição | Ação |
|-------|--------------|----------|------|
| **Editar Aba** | Usuários com acesso, modo leitura | TC salvo, campos em modo visualização | Habilita campos para edição |
| **Salvar Aba** | Após clicar Editar Aba | TC em edição | Salva alterações da aba Dados Básicos, mantém status atual |
| **Devolver TC** | TC salvo, status ≠ Devolvido | - | Abre diálogo (Nome do Recebedor, OI de Destino). Registra em `entradaSaida`, muda status para Devolvido |
| **Salvar** | Novo TC ou edição | - | Salva dados. Se primeiro save: modal "Deseja continuar editando ou enviar para processamento?" |
| **Enviar para Processamento** | Apenas quando status = Rascunho **e** TC já salvo | - | Salva aba Dados Básicos, muda status para "Em Processamento", redireciona para aba Processamento |
| **Cancelar / Fechar** | Sempre | - | Volta para lista. Se dados não salvos: aviso de confirmação |

### 3.2 Fluxo de primeiro salvamento

1. Usuário clica **Salvar**
2. Sistema salva o TC (status Rascunho)
3. Registra primeira entrada em `entradaSaida`: `{ tipo: 'entrada', data, oiOrigem }`
4. Exibe modal: "TC salvo. Deseja continuar editando como Rascunho ou Enviar para Processamento?"
5. Se "Enviar" → status = Em Processamento, vai para aba Processamento
6. Se "Continuar" → permanece no formulário em Rascunho

### 3.3 Devolver TC

1. Diálogo pede: **Nome** (opcional) e **OI de Destino** (busca na coleção OI)
2. Registra em `entradaSaida`: `{ tipo: 'saida', nome?, oiDestino, dataDevolucao }`
3. Atualiza status para "Devolvido"
4. Fecha diálogo

### 3.4 Dar nova entrada (TC Devolvido)

1. TC com status "Devolvido" exibe botão **"Dar nova entrada"** (lista e formulário)
2. Ao clicar: sistema pede **nova data de entrada**
3. Confirmação: registra `{ tipo: 'entrada', data, oiOrigem }` em `entradaSaida`
4. Atualiza data de entrada atual e OI de origem
5. Muda status para "Rascunho"

---

## 4. Estrutura de dados – Coleção TC (Firestore)

### 4.1 Campos principais (aba Dados Básicos)

| Campo BD | Tipo | Descrição |
|----------|------|-----------|
| idProc | string | Identificador do processamento (ex: PROC-001) |
| ano | string | 2026 |
| ug | string | 741000 |
| tipoTC | string | NF, FT, BO ou OT |
| dataExefin | string | Data de entrada na EXEFIN |
| oiEntregou | string | ID do doc OI de origem |
| numTC | string | Número do TC |
| valorNotaFiscal | number | Valor do TC (R$) |
| dataEmissao | string | Data de emissão do TC |
| dataAteste | string | Data do ateste |
| fornecedor | string | Nome do fornecedor |
| instrumento | string | Número do instrumento (contrato) |
| valorContrato | number | Valor global do contrato |
| rc | string | RC do contrato |
| inicioVigencia | string | Data início vigência |
| fimVigencia | string | Data fim vigência |
| fiscalContrato | string | Fiscal do contrato |
| contatoFiscal | string | Contato do fiscal |
| observacoes | string | Observações |
| entradaSaida | array | Histórico de entradas e saídas |
| status | string | Rascunho, Em Processamento, ... |
| historicoStatus | array | Trilha de auditoria de status |

### 4.2 Estrutura `entradaSaida`

```javascript
entradaSaida: [
  { tipo: 'entrada', data: 'YYYY-MM-DD', oiOrigem: 'idDocOI' },
  { tipo: 'saida', nome?: string, oiDestino: 'idDocOI', dataDevolucao: 'YYYY-MM-DD' },
  { tipo: 'entrada', data: 'YYYY-MM-DD', oiOrigem: 'idDocOI' }  // nova entrada após devolução
]
```

- **tipo:** `'entrada'` ou `'saida'`
- **nome:** Opcional (obrigatório no diálogo Devolver para identificação, mas o campo no objeto pode ser vazio)
- **oiOrigem / oiDestino:** ID do documento na coleção OI

---

## 5. Validações obrigatórias

- Ano: sempre 2026
- UG: sempre 741000
- Tipo de TC: uma das opções NF, FT, BO, OT
- Entrada EXEFIN: obrigatória, data ≤ hoje
- OI de Origem: obrigatória
- Nº TC: obrigatório, até 50 caracteres
- Valor: obrigatório, > 0
- Data Emissão: obrigatória, ≤ hoje
- Data Ateste: obrigatória, entre Data Emissão e hoje
- Fornecedor: obrigatório
- RC: obrigatório (quando contrato possui RC)
- Valor do Contrato: obrigatório (preenchido ao selecionar contrato)

---

## 6. Responsividade

- **Desktop:** 3–4 campos por linha
- **Mobile:** 2 campos por linha
- Classes CSS: `form-row`, `form-group`, `flex-1`, `flex-2`
- Considerar `flex-wrap` para quebra adequada

---

## 7. Permissões

- **Editar Aba:** conforme perfil (titulos_editar)
- **Salvar:** titulos_inserir (novo) / titulos_editar (existente)
- **Devolver:** conforme perfil
- **Enviar para Processamento:** conforme perfil

---

## 8. Integração com coleções

- **Contratos:** fornecedor, instrumento (numContrato), valorContrato, rcs, dataInicio, dataFim, fiscal, contatoFiscal
- **OI:** autocomplete para OI de Origem e OI de Destino
- **Titulos:** documento principal do TC
