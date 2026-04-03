# Regra de Negócios – Pré-Liquidação (e Documento Auxiliar de Liquidação – DAuLiq)

Este documento consolida as regras debatidas para o fluxo de **pré-liquidação** (individual ou em bloco), geração do **DAuLiq** em PDF e vínculo posterior com **NP** e **data de liquidação** do SIAFI, além do papel da **aba Liquidação** do Título de Crédito (TC).

**Última atualização de regras:** consolidação com decisões de produto fechadas para implementação (MVP, permissões, cancelamento, DetaCustos, sequência PL, OP/NP, visibilidade ativo/inativo).

---

## 1. Objetivo

Permitir que o usuário:

* Busque TCs **ainda não liquidados** (ou em estado elegível), **do mesmo fornecedor**;
* Monte um **carrinho** com um ou mais TCs;
* Gere o **DAuLiq** em PDF com layout padronizado (espelhando a ideia da PDTC);
* **Salve a associação** com um **código** identificador do lote/pré-liquidação;
* Informe, ao final, o **número da NP** gerada no SIAFI e a **data de liquidação**;
* Deixe em cada TC um **rastro consultável** na aba Liquidação (informativa).

---

## 2. Princípios gerais

1. **Liquidação em bloco** só é permitida para TCs com o **mesmo credor** (mesmo CNPJ/CPF normalizado, somente dígitos).
2. O fluxo de pré-liquidação deve ser **único e padronizado**: serve tanto para **um** TC quanto para **vários** (carrinho).
3. A **operação** concentra-se na tela de pré-liquidação; a **aba Liquidação do TC** tende a ser **informativa** (consulta e rastreabilidade), espelhando dados vindos do lote fechado.
4. **Integridade e auditoria**: alterações relevantes após fechamento não devem apagar o histórico sem política explícita.

---

## 3. Onde no sistema (arquitetura de telas)

| Opção debatida | Decisão recomendada |
|---|---|
|Novo HTML / tela dedicada|**Sim** – tela própria (ex.: lista + carrinho + ações de gerar DAuLiq, salvar lote, informar NP).|
|Tudo dentro do formulário do TC|**Não** como lugar principal do bloco – o TC é centrado em um documento; o bloco é uma entidade de processo.|
| Aba Liquidação do TC | **Informativa** – exibir rastro (código do lote, NP, data, status do lote, link/ação para DAuLiq quando aplicável). |

---

## 4. Modelo de dados (Firebase / Firestore)

### 4.1 Coleção dedicada

**Decisão:** coleção **`preLiquidacoes`** (nome fixo), em vez de armazenar apenas em campos espalhados nos TCs.

**Motivos:**

* O lote é uma entidade com ciclo de vida (rascunho → fechado → cancelado);
* Permite histórico, auditoria e consultas por código;
* Facilita validar “mesmo fornecedor” e “TC não em dois lotes abertos”.

### 4.2 Referência no documento `titulos`

Em cada TC vinculado, manter espelho mínimo para a aba Liquidação e relatórios, por exemplo:

* Identificador do lote (`preLiquidacaoId`, `preLiquidacaoCodigo`);
* NP e data de liquidação (quando fechado);
* Status do lote ou flag de vínculo ativo;
* Eventos no `historico` / `historicoStatus` quando fizer sentido ao produto.

*(Campos exatos ficam para definição na implementação, alinhados à seção 8 — em especial §8.15 MVP.)*

---

## 5. Fluxo operacional (resumo)

1. Usuário acessa a **tela de pré-liquidação**.
2. Filtra por **fornecedor** (e critérios de elegibilidade – ver §8).
3. Adiciona TCs ao **carrinho**; o sistema **impede** incluir fornecedor diferente do primeiro item.
4. O sistema **consolida** dados (valores, empenhos, deduções, datas conforme regras do DAuLiq).
5. Usuário **gera o PDF** do DAuLiq.
6. Usuário **salva** o lote (gera **código** único).
7. Após liquidação no SIAFI, usuário **informa NP** e **data de liquidação** → lote **Fechado**; TCs atualizados conforme política acordada.

**Rascunho e handoff entre usuários:** entre os passos 6 e 7 o lote permanece em **Rascunho** até existir NP. Um utilizador pode **montar e salvar** a PL (com código PL); outro pode, em momento posterior, **efetuar a liquidação no SIAFI** e **registar a NP** no SisExeFin — desde que possua as permissões adequadas (`preliquidacao_fechar_np` ou equivalente combinado com edição da PL).

### 5.1 Fluxo estendido (SIAFI → SIPLAD → SisExeFin)

Após o fechamento do lote com **NP** (referência ao que foi liquidado no **SIAFI** usando o **DAuLiq**):

1. O **SIPLAD** passa a expor **uma LF (Liquidação Financeira) por NE** efetivamente liquidada naquele contexto (conforme processo real no órgão).
2. No **SisExeFin**, o usuário deve **associar manualmente** cada **LF** à **NE** correspondente **no âmbito da pré-liquidação** (lista consolidada de NEs do lote — a mesma base usada no bloco “Principal com orçamento” do DAuLiq).
3. As LF disponíveis para escolha vêm da coleção **`lfpf`** (LF × PF), hoje alimentada sobretudo por **importação** (CSV/Excel). Cada registro pode ter `lf`, `pf`, `situacao`, etc.
4. Quando a importação atualizar o **`lfpf`**, o sistema pode **refletir a PF** na linha (se a LF selecionada já tiver PF atendida) — padrão já usado na aba Liquidação do TC (`script-titulos-spa.js`: ao escolher LF, preenche PF a partir do registo `lfpf`).
5. **Status do lote** (documento `preLiquidacoes`) vs **status do TC** (`titulos`), quando a etapa LF/PF estiver implementada:

   * No **lote**, quando nem todas as NEs têm LF/PF conforme regra de “LF atendida”: status da PL **`Para Pagamento Parcial`** (valor literal acordado no Firestore; usar constante no código).
   * Nos **TCs** desse cenário: manter **`Aguardando Financeiro`** (não usar `Para pagamento parcial` no campo `titulos.status` — evita conflito com o fluxo atual do formulário do TC).
   * Quando todas as NEs do lote cumprirem LF + PF: alinhar status do lote e dos TCs ao fluxo já existente (**Para Pagamento** no TC quando aplicável).

---

## 6. Documento Auxiliar de Liquidação (DAuLiq) – estrutura alvo

Conforme documento auxiliar debatido, o PDF do DAuLiq deve seguir **blocos fixos** nesta ordem:

1. **Cabeçalho** – logo, título “Documento Auxiliar de Liquidação”, data/hora de impressão, usuário que gerou.
2. **Dados básicos** – dados comuns (vencimento, ateste, valor do documento, credor) + lista de documentos de origem (TCs) + observação concatenada conforme padrão definido.
3. **Principal com orçamento** – favorecido, conta de contrato (RC), tabela de empenhos (NE com regra de 12 dígitos finais, subelemento 2 dígitos, valor; **somar** se a mesma NE aparecer em mais de um TC).
4. **Deduções** – agrupamentos por tipo (DDF025, DDF021, DDR001) com regras de listagem e totais conforme especificação (incluindo TC de origem onde aplicável).
5. **Dados de pagamento** – recolhedor, valor líquido (soma TCs − deduções).
6. **DetaCustos** – consolidação das **NE vinculadas em todos os TCs** do lote. **Agrupamento:** quando forem a **mesma NE**, o **mesmo subelemento**, o **mesmo centro de custos** e a **mesma UG beneficiária**, **somar** os valores numa única linha; quando qualquer desses critérios diferir, **exibir linhas distintas** nesta secção.
7. **Histórico** – refletir as **informações de auditoria** (trilha gravada no sistema para a PL e eventos relevantes: criação, geração de PDF, alterações de NP, cancelamentos, associações LF, etc.), alinhado aos registos em `historico` / eventos do documento `preLiquidacoes` (e referências aos TCs quando aplicável).
8. **Rodapé** – paginação (padrão alinhado ao da NE/PDTC).

**Regras de cálculo debatidas (resumo):**

* **Data do ateste (bloco):** a **mais antiga** entre os TCs do carrinho.
* **Data de vencimento:** data do ateste (individual ou a mais antiga no bloco) **+ 30 dias**.
* **Valor do documento:** soma dos valores dos TCs no bloco (ou valor do TC se individual).
* **Código do credor:** apenas dígitos do CNPJ/CPF do fornecedor.

---

## 7. Ciclo de vida, edição, recálculo e cancelamento

### 7.1 Estados sugeridos do lote

| Estado | Descrição |
|---|---|
| **Rascunho** | Carrinho editável; pode regerar DAuLiq; sem NP obrigatória no lote. |
| **Fechado** | NP e data informadas; ver §8.5 para correção de NP/data e vínculo com OP. |
| **Cancelado** | Ação do utilizador com permissão `preliquidacao_cancelar`: vínculo com TCs desfeito; ver §7.4. |
| **Ativo / Inativo (visibilidade)** | **Apenas administrador:** controla se a PL **aparece ou não** nas listagens para utilizadores não-admin (registo mantido; não confundir com cancelamento operacional). |

Implementação típica: flag ou estado auxiliar `ativo` no documento `preLiquidacoes`, com permissões `preliquidacao_inativar` / reativação apenas **admin**, conforme §8.7.

### 7.2 Edição e recálculo

* Em **Rascunho**, qualquer alteração relevante (TCs, dados que entram no consolidado) deve disparar **novo cálculo** dos agregados.
* O PDF deve ser tratado como **versão atual** apenas após **nova geração** explícita (não misturar PDF antigo com dados novos sem regerar).

### 7.3 Após Fechado – histórico e alterações

* **Recomendação:** não sobrescrever o lote fechado com **correções estruturais** (trocar composição do carrinho, reabrir consolidação) sem **nova pré-liquidação** ou **versionamento** explícito.
* **Correção de NP / data:** permitida com **motivo obrigatório** e auditoria no TC e na PL — **desde que ainda não exista OP informada/vinculada** ao processo no SisExeFin (ver §8.13). Após OP, a correção de NP fica **bloqueada** até política excecional futura.

### 7.4 Cancelamento da pré-liquidação (ação do utilizador)

**Permissão:** `preliquidacao_cancelar` (não confundir com exclusão física nem com inativar).

**Comportamento:**

1. **Objetivo:** desfazer o **vínculo** entre TCs e a PL. A PL **mantém** o histórico de **quais TCs** integraram o lote (auditoria).
2. **TCs afetados:** repor `titulos.status` para **`Em Liquidação`** (valor literal único no Firestore — ver §8.14). Limpar no TC os campos de vínculo com a PL (`preLiquidacaoId`, `preLiquidacaoCodigo`, etc., conforme implementação) e **limpar `np` / `dataLiquidacao`** nos TCs quando tiverem sido preenchidos por esta PL.
3. **Coleção `np`:** **remover** o identificador do TC de `titulosVinculados` (ou estrutura equivalente) no documento da NP, **e** registar a desvinculação no **histórico do TC** e no **histórico / auditoria da PL** (alinhado à remoção individual de TC do lote).
4. **Com NP já fechada no lote:** **permitido** cancelar, desde que o utilizador tenha a permissão acima. Exigir **confirmação explícita** na UI (risco de divergência com o SIAFI) e **motivo obrigatório**.
5. **Rascunho (sem NP):** desvincular TCs, marcar PL como cancelada; motivo e auditoria obrigatórios.

Em todos os casos: registar **motivo**, **utilizador** e **data/hora**.

---

## 8. Decisões de produto (perguntas e respostas)

Esta secção consolida as **respostas do utilizador** e as **decisões fechadas** para implementação. As antigas dúvidas da §8.11 foram **resolvidas** — ver §8.11 (síntese). Permanecem apenas **tópicos opcionais** em §8.12.

### 8.1 Elegibilidade dos TCs na busca

1. **Quais status de TC são elegíveis à pré-liquidação?**  
**Resposta:** `Em Liquidação` **e** sem NP (`np` vazio / não informada).
2. **Um TC pode estar em mais de um lote em rascunho?**  
**Resposta:** **Não.** Mostrar o código da pré-liquidação à qual o TC já está associado e exigir que o utilizador remova a associação na outra pré-liquidação antes de prosseguir.

### 8.2 Fechamento com NP

3. **Ao fechar o lote com NP, gravar `np` e `dataLiquidacao` em todos os TCs do carrinho?**  
**Resposta:** **Sim.**
4. **Manter ou ajustar o vínculo com a coleção `np` (`vincularTituloNaNP`) para cada TC?**  
**Resposta:** **Ajustar**, mantendo registo no **histórico** (trilha no TC e/ou no lote).

**Nota de implementação:** continuar a usar o padrão atual de merge na coleção `np` por documento da NP, acrescentando entradas de histórico explícitas (evento “vinculado via pré-liquidação X”, utilizador, data).

### 8.3 PDF e armazenamento

5. **DAuLiq: só download local vs persistir?**

**Primeiro sprint (MVP):**

* **Download imediato** no browser após gerar o PDF (sem obrigatoriedade de Firebase Storage).
* **Persistir metadados** no documento `preLiquidacoes`: data/hora de geração, utilizador, versão do layout (se aplicável), nome do ficheiro sugerido, referência ao consolidado usado.

**Fase posterior:**

* **Persistir o ficheiro** em **Firebase Storage** (ou equivalente), com URL no documento do lote — reimpressão, auditoria e link na aba Liquidação do TC; alinhar regras de segurança ao RBAC.

### 8.4 Código do lote

6. **Formato do código único**  
**Resposta:** `PL-00000/AAAA` (sequencial com ano; ajustar padding `00000` na implementação conforme volume esperado).

**Geração e ordem:** o número sequencial deve respeitar a **ordem atómica no Firestore** — usar **transação** (`runTransaction`) sobre um documento contador (ex.: `contadores/preLiquidacao_{ano}` ou equivalente), incrementando e formatando o código **sem depender** de contador apenas no cliente fora de transação. **Não** é obrigatória Cloud Function no MVP, desde que a transação garanta unicidade.

### 8.5 Imutabilidade após informar NP

7. **O lote fica totalmente imutável ou permite corrigir NP/data?**  
**Resposta original:** “NÃO ENTENDI”.

**Esclarecimento:** a pergunta distingue dois modos:

* **(A) Lote fechado “congelado”:** após NP, não se altera NP nem data no mesmo documento; qualquer correção exige **nova pré-liquidação** ou **nova versão** do lote.
* **(B) Correção controlada:** permite alterar NP e/ou data **com motivo obrigatório**, registo no histórico do lote e dos TCs, sem apagar eventos anteriores.

**Decisão:** adotar **(B) correção restrita de NP/data** (motivo obrigatório + auditoria), **com limite de negócio:** só é permitida **enquanto não houver OP informada/vinculada** no SisExeFin para esses TCs (o fluxo SIAFI gera OP após pagamento autorizado; após assinaturas surge OB — ver §8.13). Alterações estruturais (trocar TCs do carrinho, reabrir consolidação) devem passar por **nova pré-liquidação** ou **versionamento** explícito.

### 8.6 Remoção de TC do lote vs cancelamento do lote inteiro

8. **Quando limpar `np` / `dataLiquidacao` nos TCs?**  
**Resposta:** quando o TC é **removido do lote**; o sistema pede **motivo** e regista no **histórico do TC** e da **pré-liquidação**.

**Complemento (decisão fechada):**

| Ação | Efeito |
|---|---|
| **Remover um TC do lote** (lote continua válido) | Limpar no TC `np` / `dataLiquidacao` quando propagados **por esta PL**; **remover** o ID do TC de `titulosVinculados` no documento da NP na coleção `np`; motivo obrigatório; histórico no **TC** e na **PL**. |
| **Cancelar pré-liquidação inteira** | Ver §7.4: **limpar NP** nos TCs, desvincular, atualizar `np`, histórico completo; PL mantém registo dos TCs que participaram. |

### 8.7 Permissões (RBAC)

9. **Permissões**  
**Resposta:** módulo com permissões **individuais** (registar no `admin` / Firestore rules):

* **CRUD habitual:** `preliquidacao_ler`, `preliquidacao_inserir`, `preliquidacao_editar`.
* **Exclusão física (delete):** apenas **`preliquidacao_excluir`** — restrita a **admin**.
* **Ativo / inativo** (visibilidade da PL para não-admins): **`preliquidacao_inativar`** e reativação — apenas **admin** (equivalente a “ativar” pode ser a mesma chave ou `preliquidacao_ativar` conforme convenção do admin).
* **Cancelar** PL (ação operacional §7.4): **`preliquidacao_cancelar`** — utilizador com perfil autorizado (não necessariamente admin).
* **Ações de fluxo:** `preliquidacao_gerar_pdf`, `preliquidacao_fechar_np`, `preliquidacao_associar_lf` (esta última quando a etapa LF estiver disponível).

### 8.8 DetaCustos e Histórico (secções 6 e 7 do DAuLiq em PDF)

10. **Conteúdo**

* **DetaCustos:** alinhar ao §6 — agregação por **NE + subelemento + centro de custos + UG beneficiária**; somar valores quando o quadruplo for idêntico; linhas distintas quando diferir.
* **Histórico (secção 7 do PDF):** refletir **informações de auditoria** (eventos gravados para a PL e impactos nos TCs), em coerência com os registos persistidos — não é obrigatório colar o PDF ao dump completo de `historicoStatus` de cada TC, mas deve ser **fiel à trilha de auditoria** definida no sistema (timestamps, utilizador, tipo de evento, motivos quando houver).

### 8.9 Observação concatenada (DAuLiq)

11. **Formato quando um TC tem várias NEs**  
**Resposta:** **múltiplas linhas** (uma linha de observação por combinação NE / contexto conforme regra do documento auxiliar).

### 8.10 LF, PF e status após SIAFI

12. **Critério “LF atendida” / tem PF**  
**Resposta:** alinhar com **LF atendida** no processo.

**Decisão recomendada técnica:** usar **`situacao === 'Atendido'`** no registo `lfpf` como critério principal; **`pf` preenchido** como reforço (e para exibição). Se a importação SIPLAD marcar “atendida” só com PF, harmonizar regra na importação para não haver contradição.

13. **NE em dois TCs / várias LF**  
**Resposta:** regra habitual **uma LF por NE**; **casos raros com 2 LF**.

**Decisão recomendada:** modelo de dados permitir **N linhas** no consolidado por chave `(NE, subelemento)` ou `(NE, lfEsperada)` quando o utilizador indicar exceção; UI com “adicionar 2.ª LF” só para perfil autorizado ou com justificativa.

14. **Status Para pagamento / Parcial**  
**Resposta:** atualizar **documento `preLiquidacoes`** e **todos** os `titulos` do lote de forma **coerente** com o fluxo existente:

* Quando o lote estiver em cenário **parcial** (LF/PF): no documento da PL usar **`Para Pagamento Parcial`**; em cada TC manter **`Aguardando Financeiro`** (ver §5.1).
* Quando concluído: alinhar a **atualização em lote** de `titulos.status` e `empenhosVinculados` (§9), sem depender de “abrir e salvar” cada TC.

### 8.11 Síntese das decisões (antigas dúvidas §8.11)

| Tema | Decisão |
|---|---|
| Storage no MVP | Apenas **download** + **metadados**; Storage em fase posterior (§8.3). |
| Coleção `np` ao desvincular | **Remover** o TC de `titulosVinculados` + **histórico** no TC e na PL. |
| NP única no fecho | **Sim** — todos os TC do carrinho partilham a **mesma NP** e **`dataLiquidacao`**. |
| Correção de NP | Permitida com motivo **apenas antes de OP** vinculada no SisExeFin (§8.13); não por “até primeira LF”. |
| Sequência PL | **Transação Firestore** + documento contador (§8.4). |
| Histórico no PDF | **Auditoria** (§6 e §8.8). |
| Cancelamento com NP | **Permitido** com permissão, limpeza de NP nos TCs e auditoria (§7.4). |

### 8.12 Tópicos opcionais / futuros

* **Exceção “2 LF” por NE** no mesmo lote: avaliar **anexo** ou campo **motivo** em `itensNe[]` e perfil autorizado (regra já mencionada em §8.10).
* **Firebase Storage** para PDF: configurar bucket, tamanho máximo e leitura alinhada a `preliquidacao_ler` / `titulos_ler`.

### 8.13 OP, OB e alinhamento com o módulo OP × OB

No **SIAFI**, após autorizações, gera-se **OP** (Ordem de Pagamento); após assinaturas dos agentes, **OB** — associada ao pagamento efetivo. No SisExeFin existe o módulo **OP × OB** (importação CSV, vínculo OP ↔ NP, atualização de OB nas importações), análogo conceitualmente ao **LF × PF**.

**Regra de bloqueio:** a **correção de NP/data** na PL fica **permitida só enquanto não houver OP informada** nos TCs (campo `op` ou regra equivalente ao modelo atual). Após OP vinculada, bloquear edição de NP salvo política excecional futura.

### 8.14 Valor literal do status do TC (`Em Liquidação`)

**Decisão:** o estado elegível à pré-liquidação e o estado de retorno após **cancelamento** da PL usam o texto **`Em Liquidação`** (com acento), **único** valor no Firestore.

**Boa prática de implementação:** definir uma **constante** partilhada no código (ex.: `STATUS_TC_EM_LIQUIDACAO = 'Em Liquidação'`) para buscas, cancelamento e validações — evita variações acidentais (`Em liquidação`, sem acento, etc.).

### 8.15 MVP — primeiro entregável

**Aceite para o primeiro sprint:**

* Tela de **pré-liquidação**; filtro por fornecedor; **carrinho** com validações (mesmo credor, status `Em Liquidação`, sem NP, um vínculo ativo de rascunho por TC).
* **Gerar DAuLiq** em PDF (**download**); persistir **metadados** no documento `preLiquidacoes`.
* **Salvar** lote em **Rascunho** com código **`PL-#####/AAAA`** (transação + contador).
* **Informar NP + data** (outro utilizador ou o mesmo), fechar lote; propagar **NP** e **`dataLiquidacao`** a **todos** os TCs; vínculo com coleção **`np`** + histórico.
* **Cancelamento** e **remoção de TC** conforme §7.4 e §8.6; permissões §8.7; **inativar** só admin (visibilidade).

**Etapas posteriores:** associação **LF** no âmbito da PL, atualização em lote de `empenhosVinculados`, reflexo de import **`lfpf`**, Storage do PDF.

---

**Estado do documento:** regras **fechadas** para iniciar implementação; revisar §8.12 após primeiro sprint e quando Storage / exceção 2 LF forem priorizados.

## 9. Sistemática de implementação sugerida (LF ↔ NE, LFxPF, espelho no TC)

### 9.1 Fonte de verdade recomendada

| Dado | Onde guardar |
|---|---|
| Metadados do lote, NP, data, código PL | Documento `preLiquidacoes` |
| Lista consolidada de NEs do lote + **LF escolhida** | Subcoleção ou array `itensNe[]` dentro de `preLiquidacoes` (chave estável: NE normalizada + subelemento se necessário) |
| LF/PF “oficiais” vindos do SIPLAD | Coleção **`lfpf`** (já existente; importação diária) |
| Continuidade com o ecrã atual do TC | Campos `empenhosVinculados[].lf` e `empenhosVinculados[].pf` em cada `titulos` |

**Regra de sincronização:** ao gravar a associação LF → NE na pré-liquidação, o sistema **propaga** o mesmo `lf` (e `pf` se já existir no `lfpf`) para **cada** entrada de `empenhosVinculados` de **cada** TC do lote que referencie aquela NE (e subelemento, se for parte da chave). Assim a **aba Liquidação** do TC continua coerente sem duplicar lógica só na PL.

### 9.2 Etapas de UI na tela de pré-liquidação (abas ou steps)

1. **Montagem** – fornecedor, carrinho de TCs, gerar DAuLiq, salvar rascunho / código.
2. **Fecho SIAFI** – informar NP + data de liquidação (lote `Fechado` neste sentido operacional).
3. **Associação LF** – tabela: colunas sugeridas — NE (12 dígitos visíveis + chave completa se necessário), subelemento, valor consolidado no lote, TCs de origem (idProc), **select de LF** (filtrado a partir de `lfpf` ativos), **PF** (read-only, preenchido ao escolher LF ou após importação), situação da LF.
4. **Acompanhamento** – indicador global: X de Y NEs com LF; X de Y com PF; badge **Parcial** / **Para pagamento**.

Botão **“Guardar associações LF”** executa: validações + escrita em `preLiquidacoes` + batch update nos `titulos` afetados.

### 9.3 Atualização diária (import `lfpf`)

* Mantém-se o fluxo atual de importação (`script-import.js` / módulo LF-PF).
* A tela de pré-liquidação deve **ouvir** `lfpf` (como `titulos` já faz) para **atualizar PF e situação** nas linhas sem o usuário reabrir cada TC.
* Opcional: após import, função `recalcularStatusLote(preLiquidacaoId)` que atualiza `statusPagamentoLote` e, se política aprovada, espelha em `titulos.status`.

### 9.4 Convergência com a lógica atual do TC

No código atual, o avanço para **Aguardando Financeiro** / **Para Pagamento** ocorre no **salvamento do formulário** do TC quando todas as linhas têm LF e, no segundo caso, PF (`script-titulos-spa.js`).

Para pré-liquidação, definir uma das políticas:

* **A)** Propagar LF/PF nos TCs e **pedir “Sincronizar status”** ou abrir cada TC e salvar (frágil).
* **B)** Ao concluir associações no lote, disparar **atualização em lote** nos documentos `titulos` (campos `empenhosVinculados` + opcionalmente `status`) numa **Cloud Function** ou transação cliente — **recomendado** para UX.

### 9.5 Diagrama do fluxo do utilizador (resumo)

```mermaid
flowchart LR
  PL[Pré-liquidação SisExeFin]
  PDF[DAuLiq PDF]
  SIAFI[SIAFI liquidação]
  NP[NP + data no lote]
  SIPLAD[SIPLAD gera LF]
  IMP[Import lfpf]
  ASSOC[Associar LF às NE do lote]
  PG[Para pagamento / Parcial]

  PL --> PDF
  PDF --> SIAFI
  SIAFI --> NP
  NP --> SIPLAD
  SIPLAD --> IMP
  IMP --> ASSOC
  ASSOC --> PG
```

---

## 10. Referências no repositório

* Especificação detalhada do layout do DAuLiq: `regras de negócio - Documento auxiliar de liquidação..txt`
* Papeleta (PDTC) – referência de formatação: geração em `script-titulos-spa.js` (`gerarPDFTitulo`)
* Aba Liquidação do TC, NP, LF/PF: `script-titulos-spa.js`, `titulos.html`, e `Regras de Negócio - Aba Liquidação.md`
* Importação e coleção **LFxPF**: `script-import.js`, `script-lfpf.js`, `sistema.html` (secção LF/PF)
* Módulo **OP × OB** (contexto §8.13): alinhar ao código e telas de OP/NP no repositório.

---

*Documento vivo: decisões consolidadas nas secções 7–8 e §8.15 (MVP). Revisar §8.12 (opcionais) antes de Storage e exceções 2 LF.*

