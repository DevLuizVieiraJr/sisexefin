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

Colunas identificadas no CSV:

- `N° do Pedido`
- `Data de Criação`
- `Valor (R$)`
- `Tipo de Liquidação`
- `Situação`
- `Última Atualização`
- `PF`
- `RP`
- `Categoria DFM`
- `FR`
- `Vinculação`
- `Origem`

Observação: no sistema, `N° do Pedido` deve ser tratado como **LF** ou **Liquidação Financeira**.

---

## Regras já alinhadas

## 1. Campos do formulário

Todos os campos do CSV serão campos do formulário:

- `LF`
- `Data de Criação`
- `Valor (R$)`
- `Tipo de Liquidação`
- `Situação`
- `Última Atualização`
- `PF`
- `RP`
- `Categoria DFM`
- `FR`
- `Vinculação`
- `Origem`

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

- `Categoria DFM`
  - Campo geralmente vazio ou `-`.

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

- Todos os campos podem vir por **upload de CSV**.
- O upload **não substitui toda a base**.
- O upload deve:
  - inserir novas LFs
  - atualizar registros existentes com a mesma LF
- Não pode haver **duas LFs idênticas**.

### Regra funcional importante

Fluxo esperado informado pelo usuário:

- O sistema externo (ex.: SIPLAD) gera um CSV inicial com a LF e parte dos dados.
- Em um momento posterior, outro CSV pode trazer:
  - novas LFs
  - atualização de LFs já existentes
  - inclusão do número de PF para LFs já atendidas/processadas

### Tratamento de erro no upload

- O sistema **não deve rejeitar o arquivo inteiro**.
- Deve:
  - importar o que for válido
  - ignorar linhas inválidas
  - gerar um relatório de erros das linhas não lidas

### Ponto ainda em aberto

Ainda falta o usuário definir **quais campos poderão ser atualizados via upload** em registros já existentes.

Exemplo citado na conversa:

- certamente devem ser considerados pelo menos:
  - `Situação`
  - `PF`

Mas a lista final de colunas atualizáveis ainda precisa ser confirmada.

---

## 3. Relação com outros módulos

- Cada registro de **LF** estará ligado a:
  - **um ou mais Empenhos (NE)**
  - **somente um PF**

### Observação importante

- O campo `PF` **não é chave estrangeira de outro cadastro com autocomplete**.
- Ele é um dado recebido/atualizado principalmente por upload.

---

## 4. Layout e usabilidade

O formulário deve ser **semelhante ao módulo Empenho**.

### Estrutura da tela de cadastro/edição

Haverá **2 abas**:

- `Dados Básicos`
- `Auditoria` (visível apenas para Admin)

### Organização interna

- A preferência do usuário é por **seções** dentro da aba, e não uma tela única sem organização.

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

## 7. Edição de campos

- O usuário informou explicitamente:
  - **todos os campos poderão ser editados pelo Admin**

### Ponto ainda em aberto

Ainda falta confirmar:

- se usuários não-admin poderão editar todos os campos livremente
- ou se haverá restrições por perfil/status

---

## 8. Dúvidas ainda pendentes para fechar antes da implementação

Estes pontos ainda precisam ser alinhados:

1. **Quais campos o upload pode atualizar**
   - Definir lista exata de colunas atualizáveis quando a LF já existir.

2. **Regras de transição de `Situação`**
   - Verificar se qualquer perfil pode trocar livremente entre todos os status
   - ou se haverá fluxo controlado entre etapas

3. **Regra de edição do campo `RP`**
   - Confirmar se:
     - é editável em tela por usuário comum
     - editável só por Admin
     - ou atualizado apenas por upload

4. **Vinculação com Empenhos (NE) na interface**
   - Confirmar se a vinculação LF x NE será feita também dentro do formulário LF
   - ou apenas em outro módulo relacionado

5. **Conteúdo da aba `Auditoria`**
   - Confirmar quais informações o Admin verá:
     - usuário criador
     - data de criação
     - usuário da última alteração
     - data da última alteração
     - histórico de mudanças
   - e se será somente leitura

6. **Restrições para edição por usuário não-admin**
   - Confirmar se existirão limitações por status ou perfil

---

## Próximo passo sugerido

Após esclarecer os pontos pendentes, o próximo passo é desenhar:

- tela inicial da lista LF/PF
- filtros e paginação
- botões visíveis por perfil
- formulário com abas `Dados Básicos` e `Auditoria`
- regras de CRUD
- fluxo detalhado de upload CSV

