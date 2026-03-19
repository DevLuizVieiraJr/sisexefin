# Regras de Negócio – Aba Liquidação

Este documento descreve as regras de negócio da **Aba Liquidação** do módulo de Títulos de Crédito (TC) e suas conexões com outras abas, coleções e sistemas externos.

---

## 1. Contexto e fluxo geral

A Aba Liquidação apoia o usuário na realização da liquidação no **SIAFI**. O fluxo operacional é:

1. O usuário realiza a liquidação no SIAFI (sistema externo).
2. O SIAFI gera o número da **NP (Nota de Pagamento)**.
3. O usuário informa a NP na Aba Liquidação do SISEXEFIN.
4. No dia seguinte, as **LF (Liquidação Financeira)** são geradas no **SIPLAD**.
5. O usuário importa um arquivo CSV com as LFs do SIPLAD, atualizando a coleção **lfpf**.
6. Na Aba Liquidação, o usuário vincula cada LF à respectiva NE do TC.
7. Posteriormente, o sistema verifica se a LF foi atendida com uma **PF** (informação da LF atendida na LFxPF).

---

## 2. Posicionamento da Aba Liquidação

| Aba          | Índice | Status que habilita acesso                      |
|--------------|--------|-------------------------------------------------|
| Dados Básicos| 0      | Sempre                                          |
| Processamento| 1      | Rascunho ou posterior                           |
| **Liquidação** | 2    | Em Processamento ou posterior                   |
| Financeiro   | 3      | Em Liquidação ou posterior                      |
| Histórico    | 4      | Qualquer status                                 |

- A Aba Liquidação fica acessível quando o TC está em **Em Processamento**, **Em Liquidação**, **Liquidado**, **Aguardando Financeiro** ou **Para Pagamento**.
- Abas posteriores ficam bloqueadas até o TC chegar ao status correspondente.

---

## 3. Campos da Aba Liquidação

### 3.1 Campos de cabeçalho

| Campo                 | Tipo   | Obrigatório | Origem          | Observação                                                                 |
|-----------------------|--------|-------------|-----------------|-----------------------------------------------------------------------------|
| **NP (Nota de Pagamento)** | Texto  | Sim*        | Entrada manual  | *Obrigatória quando o TC está em status "Em Liquidação". Gerada pelo SIAFI. |
| **Data de Liquidação**     | Data   | Não         | Entrada manual  | Data em que a liquidação foi realizada.                                     |

### 3.2 Tabela de NEs (somente leitura + LF)

Lista de Notas de Empenho (NEs) vinculadas na Aba Processamento:

| Coluna          | Modo       | Descrição                                                                 |
|-----------------|------------|---------------------------------------------------------------------------|
| NE              | Somente leitura | Número da Nota de Empenho.                                                |
| ND              | Somente leitura | Natureza de Despesa (derivada da NE).                                     |
| Valor           | Somente leitura | Valor vinculado ao TC (definido na Aba Processamento).                    |
| Centro Custos   | Somente leitura | Centro de Custos (resolvido via `centroCustos`).                          |
| UG              | Somente leitura | Unidade Gestora Beneficiária (resolvida via `unidadesGestoras`).          |
| LF (LFxPF)      | Editável   | Select com opções da coleção **lfpf**. Vinculação LF ↔ NE.                |
| PF              | Somente leitura | PF é preenchida automaticamente quando a LF selecionada possui PF na LFxPF (LF atendida). |

---

## 4. Regras de negócio específicas

### 4.1 NP (Nota de Pagamento)

- **Origem**: Número gerado pelo SIAFI após a liquidação.
- **Obrigatoriedade**: Obrigatória para salvar quando o TC está em status **Em Liquidação**.
- **Efeito no status**: Ao salvar com NP preenchida e status "Em Liquidação", o TC avança para **Liquidado**.
- **Persistência**: O valor é armazenado no documento do TC na coleção `titulos` (campo `np`).

### 4.2 Data de Liquidação

- Opcional.
- Armazenada em `titulos.dataLiquidacao`.
- Pode ser gravada também na coleção `np` quando o TC é vinculado à NP.

### 4.3 LF (Liquidação Financeira)

- **Origem das opções**: Coleção **lfpf** (LFxPF).
- **Forma de entrada**: Select/lista suspensa, não texto livre.
- **Preenchimento**: Opcional para salvar; pode salvar sem LF preenchida em todas as NEs.
- **Atualização da coleção lfpf**: Via importação CSV (LFs geradas no SIPLAD).
- **Armazenamento**: Campo `lf` em cada item de `empenhosVinculados` do TC.
- **Auto-preenchimento de PF**: Ao selecionar uma LF que possui PF na LFxPF (LF atendida), o campo PF é preenchido automaticamente no empenho.

### 4.4 PF (Pedido Financeiro)

- **Origem**: Informação associada a uma LF atendida na coleção LFxPF.
- **Na Aba Liquidação**: Somente leitura; exibida quando a LF selecionada tem PF.
- **Edição**: Possível na Aba Financeiro (panel3), quando a PF não vem automaticamente da LFxPF.

---

## 5. Dependências e relações com outras abas

### 5.1 Aba Processamento (panel1)

- **Dependência obrigatória**: O TC precisa ter ao menos uma NE vinculada para avançar para Liquidação.
- **Dados consumidos pela Liquidação**:
  - `empenhosVinculados`: NE, ND, valor, Centro de Custos, UG.
  - Esses dados alimentam a tabela da Aba Liquidação em modo somente leitura.
- **Fluxo**: Em Processamento → (confirmar envio) → Em Liquidação.

### 5.2 Aba Financeiro (panel3)

- **LF**: Exibida em somente leitura; definida na Aba Liquidação.
- **PF**: Editável na Aba Financeiro; pode ser preenchida manualmente ou vir da LFxPF quando a LF está atendida.
- **OP**: Campo específico da Aba Financeiro; preenchido via import CSV.

### 5.3 Aba Dados Básicos (panel0)

- Campos básicos do TC (contrato, fornecedor, valor, etc.).
- Sem dependência direta com a Aba Liquidação; o formulário é único e salva todos os dados juntos.

### 5.4 Aba Histórico (panel4)

- Exibe o histórico de alterações de status do TC (incluindo "Em Liquidação" e "Liquidado").
- Somente leitura.

---

## 6. Conexões com coleções Firestore

### 6.1 Coleção `titulos`

| Campo                | Uso na Liquidação                                           |
|----------------------|-------------------------------------------------------------|
| `empenhosVinculados` | Array de NEs; cada item pode ter `lf` e `pf` definidos.     |
| `np`                 | NP informada na Aba Liquidação.                             |
| `dataLiquidacao`     | Data de liquidação.                                         |
| `status`             | "Em Liquidação", "Liquidado", "Aguardando Financeiro", etc. |
| `historicoStatus`    | Registro de mudanças de status.                             |

### 6.2 Coleção `lfpf` (LFxPF)

- **Função**: Fonte das opções de LF para o select na Aba Liquidação.
- **Carregamento**: A página de TC escuta `lfpf` via `onSnapshot`.
- **Filtro**: Apenas registros com `ativo !== false`.
- **Campos relevantes**:
  - `lf`: Número da Liquidação Financeira (valor exibido e armazenado).
  - `pf`: Pedido Financeiro (quando a LF está atendida).
  - `situacao`: Ex.: "Atendido", "Aguardando Priorização", etc.
- **Atualização**: Principalmente via importação de CSV do SIPLAD.

### 6.3 Coleção `np`

- **Função**: Registro de vínculo TC ↔ NP.
- **Modelo**:
  - `docId`: valor da NP.
  - `np`: valor da NP.
  - `titulosVinculados`: array com IDs dos TCs vinculados.
  - `dataLiquidacao`: data de liquidação (opcional).
  - `editado_em`, `editado_por`: auditoria.
- **Atualização**: Quando o TC é salvo com NP preenchida, a função `vincularTituloNaNP()` grava ou atualiza o documento da NP na coleção `np`.

### 6.4 Coleções auxiliares

| Coleção             | Uso na Aba Liquidação                                      |
|---------------------|------------------------------------------------------------|
| `centroCustos`      | Resolução do Centro de Custos para exibição na tabela.     |
| `unidadesGestoras`  | Resolução da UG para exibição na tabela.                   |
| `empenhos`          | Origem dos dados da NE (via Processamento).                |

---

## 7. Fluxo de status relacionado à Liquidação

```
Em Processamento
      │
      │ Usuário confirma "Enviar para Liquidação"
      │ (requer ao menos 1 NE vinculada)
      ▼
Em Liquidação
      │
      │ NP obrigatória para salvar
      │ Ao salvar com NP preenchida
      ▼
Liquidado
      │
      │ Todas as NEs com LF → Aguardando Financeiro
      │ Todas as NEs com LF e PF → Para Pagamento
      ▼
Aguardando Financeiro / Para Pagamento
```

---

## 8. Validações no salvamento

1. **Status "Em Liquidação"**: NP é obrigatória; se vazia, o salvamento é bloqueado com mensagem de alerta.
2. **Salvar sem LF**: Permitido; não é exigido que todas as NEs tenham LF preenchida para salvar.
3. **Envio para Liquidação**: Requer ao menos uma NE vinculada na Aba Processamento.

---

## 9. Sistemas externos

| Sistema  | Papel no fluxo da Liquidação                                      |
|----------|-------------------------------------------------------------------|
| **SIAFI**  | Gera a NP após a liquidação; o usuário informa esse número no SISEXEFIN. |
| **SIPLAD** | Gera as LFs; o usuário importa CSV que atualiza a coleção `lfpf`. |

---

## 10. Resumo das regras principais

1. **NP obrigatória** quando o TC está em "Em Liquidação" e o usuário tenta salvar.
2. **LF** deve ser escolhida entre as opções da coleção LFxPF, nunca digitada livremente.
3. **PF** na Liquidação é somente leitura; pode ser preenchida automaticamente pela LFxPF ou editada na Aba Financeiro.
4. **NEs** são exibidas em modo somente leitura; apenas LF é editável na tabela.
5. Ao salvar com NP preenchida e status "Em Liquidação", o status muda para **Liquidado**.
6. O TC é vinculado à NP na coleção `np` sempre que salvo com NP preenchida.
