# Especificação em andamento - Módulo LF x PF

## Objetivo

Construir um formulário para o módulo **Liquidação Financeira (LF) x Pedido Financeiro (PF)** com:

- layout e usabilidade semelhantes ao módulo **Empenho**
- **CRUD completo**
- **exclusão permanente apenas para Admin**
- paginação e filtros semelhantes ao módulo Empenho
- upload de arquivos **CSV**

Este arquivo resume a conversa para continuidade em outro computador.

---

## Base de referência

Arquivo CSV analisado:

- `C:\Users\87212374\Downloads\LF_PF.csv`

Colunas utilizadas no sistema (CSV de referência):

- `N° do Pedido` → no sistema: **LF** (Liquidação Financeira)
- `Data de Criação`
- `Valor (R$)`
- `Tipo de Liquidação`
- `Situação`
- `Última Atualização`
- `PF`
- `RP`
- `FR`
- `Vinculação`
- `Origem`

**Removido:** `Categoria DFM` (não será utilizada no formulário nem no upload).

**Adicionado no formulário:** lista/grade de **Empenhos vinculados (NE)** — Nº NE, Valor, PTRES, FR, ND, com botão "Vincular Empenhos".

---

## Regras já alinhadas

## 1. Campos do formulário

Campos do formulário (sem Categoria DFM):

- `LF`
- `Data de Criação`
- `Valor (R$)`
- `Tipo de Liquidação`
- `Situação`
- `Última Atualização`
- `PF`
- `RP`
- `FR`
- `Vinculação`
- `Origem`
- **Lista de Empenhos vinculados (NE)** — grade com colunas: Nº NE, Valor, PTRES, FR, ND; botão "Vincular Empenhos" para buscar e amarrar NEs a esta LF.

### Regras de cada campo

- `LF`
  - É o número da Liquidação Financeira.
  - Estrutura: `AAAALF000000`
  - `AAAA` = ano da liquidação
  - `LF` = identificador do tipo do documento hábil
  - `000000` = sequencial do ano
  - Pode ser inserido manualmente, mas normalmente virá por upload.

- `Data de Criação`
  - É a data da liquidação.

- `Valor (R$)`
  - Valor monetário da liquidação.

- `Tipo de Liquidação`
  - Valores aceitos:
    - `RP`
    - `Exercício`

- `Situação`
  - Valores aceitos:
    - `Aguardando Priorização`
    - `Aguardando Processamento`
    - `Atendido`
    - `Cancelado`
    - `Priorização Encerrada`
    - `Processamento Agendado`

- `Última Atualização`
  - Data de atualização.

- `PF`
  - Número do Processamento Financeiro.
  - Estrutura: `AAAAPF000000`
  - `AAAA` = ano do processamento
  - `PF` = identificador do tipo do documento hábil
  - `000000` = sequencial do ano
  - Pode ser inserido manualmente, mas normalmente virá por upload.

- `RP`
  - Valores aceitos:
    - `Não Processado`
    - `Processado`
  - Editável em tela por qualquer perfil (normal e Admin) e também pode ser atualizado por upload.

- `FR`
  - Fonte de Recurso.

- `Vinculação`
  - Aceita 3 dígitos numéricos.
  - Exemplos: `408`, `415`, `400`, `499`, `350`.

- `Origem`
  - Valores aceitos:
    - `LOA`
    - `Destaque`
    - `Emenda`

---

## 2. Origem dos dados e atualização por upload

- Os dados podem vir por **upload de CSV** (na inserção, todos os campos do CSV são considerados; **Categoria DFM não existe** no formulário nem no CSV de importação).
- O upload **não substitui toda a base**.
- Não pode haver **duas LFs idênticas** no BD (a LF é a chave de identificação).

### Fluxo do upload: verificação no BD

Para **cada linha** do arquivo CSV, o sistema deve:

1. **Verificar se a LF já existe no BD** (pelo número da LF).
2. **Se NÃO existir:** registrar **nova linha** com os dados da linha do CSV (todos os campos aceitos na inserção).
3. **Se JÁ existir:** **atualizar apenas** os campos permitidos no registro existente:
   - `Situação`
   - `PF`
   - `Última Atualização`  
   Os demais campos do registro **não são alterados** pelo upload.

Resumo: **não existe → insere; existe → atualiza só Situação, PF e Última Atualização.**

### Regra funcional importante

Fluxo esperado:

- O sistema externo (ex.: SIPLAD) gera um CSV inicial com a LF e parte dos dados.
- Em um momento posterior, outro CSV pode trazer:
  - novas LFs
  - atualização de LFs já existentes (Somente Situação, PF, Última Atualização)
  - inclusão do número de PF para LFs já atendidas/processadas

### Tratamento de erro no upload

- O sistema **não rejeita o arquivo inteiro**.
- Deve:
  - importar o que for válido
  - ignorar linhas inválidas
  - **gerar um relatório de erros** das linhas não lidas

---

## 3. Relação com outros módulos

- Cada registro de **LF** estará ligado a:
  - **um ou mais Empenhos (NE)** — vinculação feita no formulário da LF e também no módulo Título de Crédito / Empenho
  - **somente um PF**

### Vinculação com Empenhos (NE) na interface

- **No formulário da LF:** grade "Empenhos vinculados" com colunas: **Nº NE, Valor, PTRES, FR, ND** (semelhante ao TC), com botão **"Vincular Empenhos"** para buscar NEs e amarrar à LF.
- **No módulo Título de Crédito / Empenho:** a vinculação NE ↔ LF também poderá ser feita (ambos os lados).

### Observação sobre PF

- O campo `PF` **não é chave estrangeira de outro cadastro com autocomplete**.
- É um dado recebido/atualizado principalmente por upload.

---

## 4. Layout e usabilidade

O formulário deve ser **semelhante ao módulo Empenho**.

### Estrutura da tela de cadastro/edição

Haverá **2 abas**:

- **Dados Básicos** — com seções; inclui a grade de Empenhos vinculados (NE) e o botão "Vincular Empenhos".
- **Auditoria** — visível **apenas para Admin**, **somente leitura**.

### Conteúdo da aba Auditoria

- Data de criação do registro
- Usuário criador
- Data da última alteração
- Usuário da última alteração
- Histórico de alterações (mantido pelo sistema)

### Organização interna

- Uso de **seções** dentro da aba Dados Básicos.

---

## 5. Tela inicial (lista)

### Filtros essenciais

Filtros informados pelo usuário:

- `Situação`
- `LF` / `Liq. Financeira`
- `PF`
- `FR`
- `Vinculação`
- `Origem`
- `Data de Criação` (período)
- `Tipo de Liquidação`

### Paginação

Deve copiar o comportamento do módulo Empenho:

- paginação padrão com opções:
  - `10`
  - `20`
  - `50`
- navegação:
  - `Primeiro`
  - `Anterior`
  - `x de y`
  - `Próximo`
  - `Último`

---

## 6. Permissões e CRUD

### Usuário com acesso ao módulo

Pode:

- criar
- editar
- excluir logicamente (inativar/cancelar)

### Admin

Pode:

- criar
- editar
- excluir logicamente
- excluir permanentemente

### Exclusão permanente

- Apenas **Admin** pode excluir definitivamente.
- O Admin poderá excluir permanentemente **qualquer registro**, independentemente do status.

### Exclusão lógica para usuário comum

- Para usuários não-admin, a exclusão será por **inativação**.
- O registro permanece na lista.
- A ideia funcional indicada é algo como:
  - `ativo = false`
  - e/ou `Situação = Cancelado`

---

## 7. Edição de campos e transição de Situação/RP

- **Admin:** pode editar todos os campos.
- **Usuário não-admin:** pode editar todos os campos; **não há restrição** por status ou perfil além da regra de exclusão (apenas Admin exclui permanentemente).
- **Situação:** qualquer usuário (normal ou Admin) pode mudar **livremente** entre os 6 valores.
- **RP:** editável em tela por perfis normais e Admin; também pode ser atualizado por upload (conforme definido no item 2).

---

## 8. Data/hora do último upload (Importar CSV)

- **Requisito:** ao lado do botão **Importar CSV**, exibir a **data e hora do último upload** realizada naquela tela.
- **Escopo:** replicar essa funcionalidade em todas as telas que possuem importação CSV:
  - **LF/PF** (Liquidação Financeira x Pedido Financeiro)
  - **NE** (Nota de Empenho)
  - **Contratos**
  - **TC** (Título de Crédito)

(O sistema deve armazenar e exibir a data/hora do último import por módulo/tela.)

---

## 9. Resumo — pontos alinhados (sem dúvidas pendentes)

- Campos do formulário definidos; Categoria DFM removida; lista de NE adicionada.
- Upload: apenas Situação, PF e Última Atualização atualizam registro existente.
- Situação e RP: edição livre em tela; RP também pode ser atualizado por upload.
- Vinculação NE: grade no formulário LF + botão "Vincular Empenhos"; também no módulo TC/Empenho.
- Auditoria: Data criação, Usuário criador, Data última alteração, Usuário última alteração, Histórico — somente leitura, só Admin.
- Não há restrição de edição para usuário não-admin (apenas perfil e regra de exclusão).
- Exibir data/hora do último upload ao lado do botão Importar CSV (LF, NE, Contratos, TC).

---

## Próximo passo sugerido

Com os detalhes fechados, o próximo passo é implementar ou desenhar em detalhe:

- tela inicial da lista LF/PF
- filtros e paginação
- botões visíveis por perfil
- formulário com abas Dados Básicos e Auditoria
- grade de Empenhos vinculados + Vincular Empenhos
- regras de CRUD e upload CSV
- exibição da data/hora do último upload nas telas de importação (LF, NE, Contratos, TC)

