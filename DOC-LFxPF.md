# Documentação do Módulo LFxPF
## Liquidação Financeira (LF) x Pedido Financeiro (PF)

---

## 1. Visão geral

O módulo LFxPF gerencia registros de **Liquidação Financeira** e seu vínculo com o **Pedido Financeiro**, permitindo cadastro manual, edição, importação em lote (CSV/Excel) e exportação.

---

## 2. Campos do formulário – tipo de dados e formatação

| Campo | ID HTML | Tipo de dado | Formatação | Obrigatório |
|-------|---------|--------------|------------|-------------|
| **LF (Nº Liquidação)** | `lfNum` | string | Texto livre, até 20 caracteres. Ex: `2026LF033314` | Sim (para criar/editar) |
| **Data de Criação** | `lfDataCriacao` | string | `dd/mm/aaaa` | Não |
| **Valor (R$)** | `lfValor` | number | Moeda brasileira (vírgula decimal). Ex: `1.234,56` | Não |
| **Tipo de Liquidação** | `lfTipoLiquidacao` | string | Select: `RP` ou `Exercício` | Sim |
| **Situação** | `lfSituacao` | string | Select: `Aguardando Priorização`, `Aguardando Processamento`, `Atendido`, `Cancelado`, `Priorização Encerrada`, `Processamento Agendado` | Sim |
| **Última Atualização** | `lfUltimaAtualizacao` | string | `dd/mm/aaaa` | Não |
| **PF (Nº Processamento)** | `lfPf` | string | Texto livre, até 20 caracteres. Ex: `2026PF000001` ou número | Não |
| **RP** | `lfRp` | string | Select: `Não Processado` ou `Processado` | Sim |
| **FR (Fonte Recurso)** | `lfFr` | string | Código numérico, até 15 caracteres. Ex: `1000000000` | Não |
| **Vinculação** | `lfVinculacao` | string | Exatamente 3 dígitos. Ex: `400`, `415`, `499` | Não |
| **Origem** | `lfOrigem` | string | Select: `LOA`, `Destaque` ou `Emenda` | Sim |
| **Empenhos vinculados (NE)** | — | array | Lista de objetos `{ numNE, valor, ptres, fr, nd }` | Não |

---

## 3. Como criar novo registro

1. Na lista do módulo LFxPF, clique em **+ Nova LF**.
2. O formulário abre com Data de Criação e Última Atualização preenchidas com a data atual em `dd/mm/aaaa`.
3. Preencha os campos desejados (LF obrigatório).
4. (Opcional) Busque e adicione NEs em **Empenhos vinculados**.
5. Clique em **Salvar**.

**Quem pode criar:** usuários com permissão `lf_inserir`.

---

## 4. Como editar registro

1. Na tabela, clique no botão ✏️ **Editar** da linha.
2. O formulário abre com os dados atuais.
3. Altere os campos desejados.
4. Clique em **Salvar**.

**Quem pode editar:** usuários com permissão `lf_editar`.

---

## 5. Quem pode salvar (criar/editar)

| Ação | Permissão |
|------|-----------|
| Criar novo registro | `lf_inserir` |
| Editar registro | `lf_editar` |
| Inativar/cancelar | `lf_excluir` |
| Excluir permanentemente | `acesso_admin` |

As permissões são definidas no perfil do usuário (Admin).

---

## 6. Como salvar

- Clique em **Salvar** no formulário.
- Os dados são gravados no Firestore (coleção `lfpf`).
- Campos de auditoria (`createdAt`, `createdBy`, `updatedAt`, `updatedBy`, `historico`) são atualizados automaticamente.
- Após salvar, o sistema volta para a lista e exibe a mensagem de sucesso.

---

## 7. Quem pode importar

**Somente administradores** (`acesso_admin`). Usuários sem essa permissão recebem: *"Acesso negado. Apenas administradores podem importar."*

---

## 8. Verificações do sistema

### Ao salvar (formulário)
- Não há validação obrigatória explícita no front-end além dos campos de select (valores fixos).
- O campo **Vinculação** aceita qualquer texto; o HTML sugere 3 dígitos (`pattern="[0-9]{3}"`), mas a validação não é rígida.
- **Valor** é convertido de moeda BR (R$ 1.234,56) para número pelo `valorMoedaParaNumero`.

### Na importação
- **LF** não pode ser vazia; linhas sem LF são ignoradas e contabilizadas como erro.
- **Registro existente:** se a LF já existir (comparação case-insensitive), são atualizados apenas: `situacao`, `pf`, `ultimaAtualizacao`.
- **Registro novo:** todos os campos são mapeados do CSV/Excel; `empenhosVinculados` inicia vazio.

### Duplicidade
- A chave de unicidade é o número da LF. Se o arquivo tiver LF repetida, a primeira insere e as demais atualizam o mesmo documento.

---

## 9. Exportação CSV/Excel

- **Botões:** CSV e Excel na toolbar.
- **Com dados:** faz download dos dados atuais do banco (registros ativos) em `lf_pf.csv` ou `lf_pf.xlsx`.
- **Sem dados:** faz download de um arquivo modelo (`lf_pf_modelo.csv` ou `lf_pf_modelo.xlsx`) com as colunas corretas, pronto para preencher e importar.

### Nomes corretos das colunas (para importação)

```
N° do Pedido,Data de Criação,Valor (R$),Tipo de Liquidação,Situação,Última Atualização,PF,RP,FR,Vinculação,Origem
```

---

## 10. Arquivo CSV modelo (download)

Quando não há registros, o botão CSV/Excel faz o download de um arquivo modelo com as colunas:

| Coluna CSV | Tipo esperado |
|------------|---------------|
| N° do Pedido | string (ex: 2026LF033314) |
| Data de Criação | dd/mm/aaaa |
| Valor (R$) | número com vírgula decimal (ex: 1234,56) |
| Tipo de Liquidação | RP ou Exercício |
| Situação | Um dos valores do select |
| Última Atualização | dd/mm/aaaa |
| PF | string ou número |
| RP | Não Processado ou Processado |
| FR | string numérica |
| Vinculação | 3 dígitos (ex: 400) |
| Origem | LOA, Destaque ou Emenda |

---

## 11. Coleção Firestore

- **Nome:** `lfpf`
- **Documentos:** cada LF é um documento com ID gerado pelo Firestore (exceto no caso de importação em lote, onde o ID é gerado no `add`).
- **Campos principais:** `lf`, `dataCriacao`, `valor`, `tipoLiquidacao`, `situacao`, `ultimaAtualizacao`, `pf`, `rp`, `fr`, `vinculacao`, `origem`, `empenhosVinculados`, `ativo`, `createdAt`, `createdBy`, `updatedAt`, `updatedBy`, `historico`.
