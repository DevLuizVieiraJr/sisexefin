### Manual do Usuário – Módulo Empenhos

#### 1. Visão geral

O módulo **Empenhos** é utilizado para registrar, consultar e manter os compromissos de despesa (Notas de Empenho) do sistema.  
Este manual descreve:

- **Funcionalidades disponíveis**
- **Tipos de dados para cada campo**
- **Botões visíveis e em quais situações ficam desabilitados ou ocultos**

---

#### 2. Tela inicial – Lista de Empenhos

##### 2.1 Funcionalidades principais

- **Listagem de empenhos**: mostra todos os empenhos cadastrados conforme filtros e paginação.
- **Filtros de pesquisa**:
  - **Exercício**
  - **Número do Empenho**
  - **Fornecedor**
  - **Data de emissão (início/fim)**
  - **Situação/Status** (Rascunho, Empenhado, Anulado, Liquidado, etc.)
- **Paginação**:
  - Exibição padrão (por exemplo, 10 registros por página)
  - Opções de quantidade por página (10, 20, 50)
  - Navegação: `Primeiro | Anterior | x de y | Próximo | Último`
- **Ações por linha de empenho** (conforme permissões):
  - Visualizar
  - Editar
  - Anular/Estornar
  - Imprimir
  - Histórico
  - Anexos (se houver)

##### 2.2 Campos de filtro – tipos de dados

- **Exercício**: número inteiro (ex.: 2026)
- **Número do Empenho**: texto/numérico curto
- **Fornecedor**: texto com busca/autocomplete
- **Data de emissão (De / Até)**: data
- **Situação/Status**: lista de seleção (combo box) com valores pré-definidos

##### 2.3 Botões da tela inicial

- **`Novo Empenho`**  
  - **Função**: abre a tela de cadastro de um novo empenho.  
  - **Visível quando**: usuário tem permissão de inclusão de empenhos.  
  - **Desabilitado/oculto quando**: o perfil não tem permissão de inserir ou o sistema está em modo somente leitura (ex.: fechamento de exercício).

- **`Pesquisar` / `Filtrar`**  
  - **Função**: aplica os filtros preenchidos e atualiza a lista.  
  - **Disponibilidade**: normalmente sempre disponível para quem tem acesso ao módulo.

- **`Limpar filtros`**  
  - **Função**: limpa todos os campos de filtro e volta à condição padrão.  
  - **Desabilitado** se nenhum filtro tiver sido alterado.

##### 2.4 Botões por linha (ações sobre o empenho)

- **`Visualizar`**  
  - **Função**: abre o empenho em modo somente leitura.  
  - **Visível quando**: o usuário tem permissão de consulta.  
  - **Nunca desabilitado** (apenas oculto se o usuário não tiver acesso ao módulo).

- **`Editar`**  
  - **Função**: abre o empenho para alteração.  
  - **Visível quando**: o usuário tem permissão de edição.  
  - **Desabilitado/oculto quando**: o empenho está em status que não permite alteração (por exemplo, totalmente liquidado ou anulado) ou o usuário não tem permissão.

- **`Anular` / `Estornar`**  
  - **Função**: registra a anulação total ou parcial do empenho.  
  - **Visível quando**: o empenho está empenhado e ainda não anulado totalmente, e o usuário tem permissão.  
  - **Desabilitado/oculto quando**: o empenho já está anulado/estornado ou em fase que não permite anulação; ou o usuário não tem permissão.

- **`Imprimir` / `PDF`**  
  - **Função**: gera o relatório da Nota de Empenho para impressão ou PDF.  
  - **Visível quando**: o empenho já foi gravado e possui numeração.  
  - **Desabilitado** em rascunhos sem número oficial (conforme configuração).

- **`Histórico`**  
  - **Função**: mostra o histórico de alterações e mudanças de status do empenho.  
  - **Visível quando**: o usuário tem permissão de auditoria/consulta avançada.

- **`Anexos`**  
  - **Função**: permite visualizar ou incluir documentos vinculados ao empenho.  
  - **Visível quando**: o módulo de anexos está ativo e o usuário tem permissão.  
  - **Desabilitado** quando o empenho está encerrado, se houver essa regra.

---

#### 3. Tela de Cadastro/Edição de Empenho

Normalmente organizada em **abas**.

##### 3.1 Aba “Dados Básicos”

###### 3.1.1 Campos e tipos de dados

- **Exercício**: número inteiro (ex.: 2026) – obrigatório.  
- **Número do Empenho**: texto/numérico curto. Em novo registro, pode ser gerado automaticamente; em edição, geralmente somente leitura.  
- **Data de Emissão**: data, padrão a data do dia, obrigatória.  
- **Órgão / Unidade Orçamentária**: lista de seleção (combo/autocomplete), obrigatória.  
- **Unidade Executora** (se aplicável): lista de seleção, obrigatória conforme regra local.  
- **Fornecedor / Favorecido**: busca/autocomplete em cadastro de fornecedores, obrigatório.  
- **CNPJ / CPF**: texto numérico com máscara, preenchido automaticamente ao escolher o fornecedor (somente leitura).  
- **Processo / Nº Processo Administrativo**: texto, obrigatório se a norma exigir.  
- **Modalidade de Licitação**: lista de seleção (Dispensa, Pregão, etc.), pode ser obrigatória.  
- **Tipo de Empenho**: lista de seleção (Ordinário, Global, Estimativo), obrigatória.  
- **Classificações Orçamentárias (Categoria, Grupo, Modalidade de Aplicação, Elemento/ND)**: listas de seleção, obrigatórias.  
- **Programa / Ação / PTRES (ou equivalente)**: lista de seleção/autocomplete, obrigatória.  
- **Fonte de Recurso**: lista de seleção, obrigatória.  
- **Valor do Empenho**: numérico em moeda (R$), obrigatório.  
- **Histórico / Observações**: texto livre, opcional (ou obrigatório, conforme norma).

###### 3.1.2 Botões da aba “Dados Básicos”

- **`Salvar`**  
  - **Função**: grava os dados do empenho (como rascunho ou já empenhado, conforme fluxo).  
  - **Habilitado quando**: campos obrigatórios preenchidos e sem erros de validação.

- **`Salvar e Continuar`** (se existir)  
  - **Função**: salva os dados e permanece na tela para preencher outras abas.  
  - **Mesmas regras** de habilitação do botão `Salvar`.

- **`Cancelar` / `Voltar`**  
  - **Função**: retorna à lista ou fecha a tela.  
  - **Comportamento esperado**: exibir confirmação informando que alterações não salvas serão perdidas.  
  - **Sempre habilitado**, mas pode requerer confirmação.

- **`Editar Aba`** (quando em modo somente leitura)  
  - **Função**: habilita os campos da aba para edição.  
  - **Visível quando**: o empenho está em status que permite edição (por exemplo, rascunho).  
  - **Desabilitado/oculto quando**: o empenho está finalizado (liquidado/pago/anulado).

- **`Salvar Aba`** (quando existir controle por aba)  
  - **Função**: grava apenas as alterações da aba atual e volta a desabilitar os campos.  
  - **Habilitado quando**: houve alteração e as validações foram atendidas.

---

##### 3.2 Aba “Itens / Detalhamento do Empenho”

###### 3.2.1 Campos e tipos de dados

Na grade de itens:

- **Item**: texto ou seleção de catálogo de itens, obrigatório.  
- **Descrição do Item**: texto; pode vir do cadastro.  
- **Unidade de Medida**: lista de seleção (un, kg, m, etc.), obrigatória.  
- **Quantidade**: numérico (decimal), obrigatório.  
- **Valor Unitário**: numérico (moeda), obrigatório.  
- **Valor Total do Item**: numérico (moeda), calculado automaticamente (Quantidade × Valor Unitário).  
- **ND / Subelemento (por item, se usado)**: lista de seleção/texto controlado, obrigatório quando a classificação é por item.

###### 3.2.2 Botões na aba de itens

- **`Adicionar Item`**  
  - **Função**: inclui o item preenchido na lista.  
  - **Habilitado quando**: campos obrigatórios do item estão preenchidos.  
  - **Desabilitado quando**: faltar algum dado obrigatório.

- **`Editar` (por item)**  
  - **Função**: carrega os dados do item selecionado para alteração.  
  - **Visível quando**: existe pelo menos um item cadastrado.  
  - **Desabilitado/oculto quando**: o empenho está em status que não permite mais edição de itens.

- **`Remover` (por item)**  
  - **Função**: exclui o item da lista.  
  - **Visível quando**: o usuário tem permissão de edição.  
  - **Desabilitado/oculto quando**: o empenho está em situação de somente leitura.

---

##### 3.3 Aba “Vinculações” (Contratos, Tributos, etc.)

###### 3.3.1 Campos e tipos de dados

- **Contrato**: busca/autocomplete em cadastro de contratos; ao selecionar, exibe dados do contrato (somente leitura).  
- **Títulos relacionados** (se houver integração): lista ou grade com títulos vinculados.  
- **Tributos**:
  - **Código de Tributo**: lista de seleção (IR, INSS, ISS, etc.).  
  - **Base de Cálculo**: numérico (moeda).  
  - **Alíquota**: numérico (percentual).  
  - **Valor Calculado**: numérico (moeda), geralmente calculado automaticamente.

###### 3.3.2 Botões da aba “Vinculações”

- **`Vincular Contrato` / `Adicionar`**  
  - **Função**: relaciona o empenho a um contrato.  
  - **Habilitado quando**: um contrato foi selecionado.  
  - **Desabilitado** quando o contrato não for encontrado ou o empenho estiver bloqueado.

- **`Vincular Tributo` / `Adicionar Tributo`**  
  - **Função**: inclui um tributo na lista.  
  - **Habilitado quando**: código de tributo e dados mínimos estão preenchidos.  
  - **Desabilitado** quando faltar dados ou o empenho estiver em somente leitura.

- **`Remover Vinculação`**  
  - **Função**: exclui um vínculo (contrato, tributo, título).  
  - **Desabilitado/oculto quando**: o empenho está em situação que não permite alterações.

---

#### 4. Status do Empenho e impacto nos botões

Os status mais comuns são:

- **Rascunho**: empenho ainda não oficializado.  
- **Empenhado**: nota de empenho válida e emitida.  
- **Anulado / Estornado**: empenho cancelado total ou parcialmente.  
- **Liquidado / Pago** (quando integrado com liquidação/pagamento).

##### 4.1 Rascunho

- **Pode**: editar todos os campos, incluir/alterar/remover itens, excluir o empenho.  
- **Botões habilitados**: `Editar`, `Salvar`, `Salvar e Continuar`, `Adicionar Item`, `Remover Item`, `Excluir Empenho`.  
- **Botões normalmente desabilitados/inexistentes**: `Anular`/`Estornar`, `Imprimir` (depende da configuração).

##### 4.2 Empenhado

- **Pode**: consultar e, em alguns casos, ajustar dados não contábeis (ex.: observações).  
- **Restrito**: alteração de valores, ND, órgão, fornecedor normalmente não é permitida.  
- **Botões**:
  - `Visualizar`: habilitado.  
  - `Editar`: pode permitir apenas campos específicos ou estar desabilitado.  
  - `Anular` / `Estornar`: habilitados se houver permissão.  
  - `Imprimir`: habilitado.

##### 4.3 Anulado / Estornado

- **Somente leitura**: todos os campos e itens ficam apenas para consulta.  
- **Botões**:
  - `Visualizar`: habilitado.  
  - `Imprimir`: pode estar habilitado (com indicação de anulado).  
  - `Editar`, `Anular`, `Excluir`, `Adicionar Item`: desabilitados/ocultos.

##### 4.4 Liquidado / Pago

- **Somente leitura parcial ou total**, conforme regra.  
- **Botões**:
  - `Editar` e `Excluir`: desabilitados.  
  - `Visualizar` e `Imprimir`: habilitados.  
  - `Anular`: em geral restrito a fluxos específicos em outros módulos.

---

#### 5. Fluxo resumido de uso pelo usuário

1. Acessar a **tela inicial de Empenhos** e clicar em **`Novo Empenho`**.  
2. Preencher a aba **“Dados Básicos”** e clicar em **`Salvar`** ou **`Salvar e Continuar`**.  
3. Na aba **“Itens / Detalhamento”**, incluir todos os itens necessários e salvar.  
4. Na aba **“Vinculações”**, relacionar contratos, tributos e outros vínculos, se aplicável, e salvar.  
5. Confirmar o empenho (conforme fluxo do sistema) e, se necessário, utilizar o botão **`Imprimir`** para gerar a Nota de Empenho.  
6. Utilizar os botões **`Anular`/`Estornar`**, **`Histórico`** e **`Anexos`** conforme o status do empenho e as permissões do usuário.

