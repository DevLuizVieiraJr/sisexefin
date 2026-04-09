# Regra de Negócios – Pré-Liquidação (e Documento Auxiliar de Liquidação – DAuLiq)

Este documento consolida as regras debatidas para o fluxo de **pré-liquidação** (individual ou em bloco), geração do **DAuLiq** em PDF e vínculo posterior com **NP** e **data de liquidação** do SIAFI, além do papel da **aba Liquidação** do Título de Crédito (TC).

**Última atualização de regras:** alinhamento com [Regras de Negócios - TC - Aba Liquidação.md](./Regras%20de%20Negócios%20-%20TC%20-%20Aba%20Liquidação.md) e [Regras de Negócios - TC - Aba Financeiro.md](./Regras%20de%20Negócios%20-%20TC%20-%20Aba%20Financeiro.md): **LF, PF e OP no TC somente leitura**; **edição na PL**; **unificação de NE idênticas dentro da mesma PL**; **várias LFs por NE** com soma de valores igual ao valor da NE; **status da PL e do TC** coerentes com completude de LF/PF (ver §2.1, §5.1 e §7.1). Mantém-se o núcleo MVP do DAuLiq/NP (§8.15); Storage e detalhes finos de modelo em §8.12.

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
3. A **operação** concentra-se na tela de pré-liquidação; a **aba Liquidação** e a **aba Financeiro** do TC são **informativas** para **LF, PF e OP**, espelhando dados gravados na **PL** (e em `lfpf` quando aplicável).
4. **Integridade e auditoria**: alterações relevantes após fechamento não devem apagar o histórico sem política explícita.

### 2.1 Alinhamento com o módulo TC (fonte cruzada)

Ler em conjunto com:

* [Regras de Negócios - TC - Aba Liquidação.md](./Regras%20de%20Negócios%20-%20TC%20-%20Aba%20Liquidação.md) — NP no TC quando o status exige; exibição somente leitura de LF/PF projetada da PL.
* [Regras de Negócios - TC - Aba Financeiro.md](./Regras%20de%20Negócios%20-%20TC%20-%20Aba%20Financeiro.md) — LF, PF e OP somente leitura no TC.

**Síntese operacional:**

1. Uma **PL** agrega **um ou mais TC** (mesmo credor — §2, itens 1–2).
2. Cada TC traz **uma ou mais NE** (`empenhosVinculados`). Na PL, **NEs com o mesmo identificador** são **unificadas** para efeito de informação de **LF/PF**: uma alteração reflete em **todos os TC** da PL que compartilham essa NE.
3. Por **NE distinta** no âmbito da PL, o utilizador informa **uma ou mais LFs**; cada LF pode ter **valor** parcial; a **soma** dos valores das LFs daquela NE deve **fechar** o valor consolidado da NE na PL (ex.: *x + y = valor da NE*).
4. **LF e PF** são **editados na PL** (e refletidos via coleção **`lfpf`** quando aplicável — importação SIPLAD); as abas **Liquidação** e **Financeiro** do TC apenas **exibem** o espelho.
5. **Transição de status do TC** (após **Liquidado**, com base na projeção da PL):
   * se **alguma** NE do TC ainda **não** tiver LF completa na PL → TC permanece **Liquidado**;
   * se **todas** as NE do TC tiverem LF informadas na PL → TC **Aguardando Financeiro**;
   * se **todas** as LFs (dessas NE, no âmbito do TC) tiverem PF → TC **Para Pagamento**.
6. **Transição de status da PL** (regra de PF nas LFs, no âmbito do lote):
   * **Aguardando Financeiro:** nenhuma LF com PF;
   * **Para Pagamento parcial:** parte das LFs com PF e parte sem;
   * **Para Pagamento:** todas as LFs com PF.

---

## 3. Onde no sistema (arquitetura de telas)

| Opção debatida | Decisão recomendada |
|---|---|
|Novo HTML / tela dedicada|**Sim** – tela própria (ex.: lista + carrinho + ações de gerar DAuLiq, salvar lote, informar NP).|
|Tudo dentro do formulário do TC|**Não** como lugar principal do bloco – o TC é centrado em um documento; o bloco é uma entidade de processo.|
| Aba Liquidação do TC | **Informativa** – exibir rastro (código do lote, NP, data, status do lote, link/ação para DAuLiq quando aplicável). |

**Lista de pré-liquidações (primeiro ecrã):**

* **Colunas sugeridas (implementadas):** código, estado (badges), fornecedor, **valor total do lote** (soma dos TCs conhecidos no cliente), quantidade de TCs, **data de liquidação** (quando a PL já tem `dataLiquidacao`), **última atualização** (`editado_em`), NP.
* **Ações por linha:**
  * **Visualizar** — abre o editor em **modo somente leitura** (sem alterar carrinho, fornecedor ou ações de fecho/cancelamento; útil para consulta e auditoria). Disponível a quem tem `preliquidacao_ler`.
  * **Editar** — abre o editor com permissões normais de operação (quem tem pelo menos uma permissão operacional além de só leitura: editar, inserir, fechar NP, cancelar, status/inativar, excluir ou admin).
  * **DAuLiq** — gera o PDF **sem abrir o editor** (carrega títulos pelo `tituloIds` do lote; se o lote estiver **cancelado** e `tituloIds` vazio, usa `titulosParticiparamIds` quando existir). Respeita `preliquidacao_gerar_pdf` (e admin). Desativado se não houver IDs de títulos.
* **Filtro:** opção de mostrar pré-liquidações **inativas** (comportamento alinhado a admin / `preliquidacao_status`).

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

### 4.3 Exercício e emissão (PL)

No documento **`preLiquidacoes`**, além do código `PL-#####/AAAA`, o sistema persiste:

* **`anoExercicio`** (number): ano do exercício do lote, alinhado ao ano usado na geração do código (contador `preLiquidacao_{ano}`);
* **`anoEmissao`** (number): mesmo valor no fluxo atual (identificação do exercício da PL no SisExeFin).

---

## 5. Fluxo operacional (resumo)

1. Usuário acessa a **tela de pré-liquidação**.
2. Filtra por **fornecedor** (e critérios de elegibilidade – ver §8).
3. Adiciona TCs ao **carrinho**; o sistema **impede** incluir fornecedor diferente do primeiro item.
4. O sistema **consolida** dados (valores, empenhos, deduções, datas conforme regras do DAuLiq).
5. Usuário **gera o PDF** do DAuLiq (no editor **ou** diretamente na lista — ver §3). Antes da geração, o sistema apresenta um **diálogo** para escolher **PDF completo** (com secção de histórico da PL no documento) ou **sem histórico no PDF** (apenas blocos operacionais; ver §6 e §8.3).
6. Usuário **salva** o lote (gera **código** único). *Nota:* na prática o passo 6 costuma anteceder o 5 na primeira vez; o PDF pode ser regerado em qualquer momento com títulos no lote.
7. Após liquidação no SIAFI, usuário **informa NP** e **data de liquidação** → lote **Fechado**; TCs atualizados conforme política acordada.

**Rascunho e handoff entre usuários:** entre os passos 6 e 7 o lote permanece em **Rascunho** até existir NP. Um utilizador pode **montar e salvar** a PL (com código PL); outro pode, em momento posterior, **efetuar a liquidação no SIAFI** e **registar a NP** no SisExeFin — desde que possua as permissões adequadas (`preliquidacao_fechar_np` ou equivalente combinado com edição da PL).

### 5.1 Fluxo estendido (SIAFI → SIPLAD → SisExeFin → Pré-Liquidação)

Após o fechamento do lote com **NP** (referência ao que foi liquidado no **SIAFI** usando o **DAuLiq**):

1. O **SIPLAD** gera **LFs** (Liquidação Financeira) conforme o processo real no órgão; no SisExeFin elas são conhecidas sobretudo via importação para a coleção **`lfpf`** (LF × PF).
2. No **módulo Pré-Liquidação**, o utilizador informa as **LF** (e acompanha **PF**) **no âmbito da PL**, sobre a **lista consolidada de NEs** do lote:
   * **Unificação:** NEs **idênticas** que aparecem em mais de um TC da mesma PL são tratadas como **uma linha lógica** para LF/PF (valores consolidados; edição reflete em todos os TC que partilham essa NE **nessa PL**).
   * **Cardinalidade:** por **NE distinta**, são permitidas **uma ou mais LFs**; cada LF pode ter **valor** parcial; a **soma** dos valores das LFs deve **fechar** o valor consolidado da NE na PL (*x + y = valor da NE*, etc.).
3. As opções de LF para escolha continuam a vir preferencialmente da coleção **`lfpf`** (registos ativos; importação CSV/Excel). **PF** e **situação** da LF atualizam-se quando a importação refresca o `lfpf`.
4. **Edição:** a associação LF/PF por NE é feita **na PL**, não nas abas Liquidação/Financeiro do TC (estas permanecem **somente leitura** — ver [Regras de Negócios - TC - Aba Liquidação.md](./Regras%20de%20Negócios%20-%20TC%20-%20Aba%20Liquidação.md)).
5. **Status da PL** (regra de PF nas LFs, no âmbito do lote):
   * **Aguardando Financeiro:** nenhuma LF com PF;
   * **Para Pagamento parcial:** parte das LFs com PF e parte sem;
   * **Para Pagamento:** todas as LFs com PF.
6. **Status do TC** (`titulos`), após **Liquidado**, alinhado à projeção da PL (detalhe em §2.1):
   * alguma NE do TC **sem** LF completa na PL → TC **Liquidado**;
   * todas as NE do TC com LF → **Aguardando Financeiro**;
   * todas as LFs (dessas NE, no âmbito do TC) com PF → **Para Pagamento**.
7. Após gravar na PL, o sistema **propaga** o espelho para `empenhosVinculados` (e demais campos acordados) em cada TC do lote, para exibição nas abas do TC **sem edição** ali.

---

## 6. Documento Auxiliar de Liquidação (DAuLiq) – estrutura alvo

Conforme documento auxiliar debatido, o PDF do DAuLiq deve seguir **blocos fixos** nesta ordem:

1. **Cabeçalho** – logo, título “Documento Auxiliar de Liquidação”, data/hora de impressão, usuário que gerou.
2. **Dados básicos** – dados comuns (vencimento, ateste, valor do documento, credor) + lista de documentos de origem (TCs) + observação concatenada conforme padrão definido.
3. **Principal com orçamento** – favorecido, conta de contrato (RC), tabela de empenhos. **Consolidação interna:** continua a usar o **núcleo de 12 dígitos** finais do número da NE (e subelemento em 2 dígitos) para agregar e somar quando a mesma combinação aparece em mais de um TC. **Exibição no PDF:** a coluna “Nota de Empenho” deve mostrar o formato legível **`YYYYNE######`** (ex.: `2026NE000194`), obtido a partir do núcleo de 12 dígitos (posições de ano e sequência) ou, quando o texto já contiver o padrão `YYYYNE######`, extrair e normalizar essa parte — em vez de exibir o identificador longo completo ou só o núcleo numérico cru.
4. **Deduções** – agrupamentos por tipo (DDF025, DDF021, DDR001) com regras de listagem e totais conforme especificação (incluindo TC de origem onde aplicável).
5. **Dados de pagamento** – recolhedor, valor líquido (soma TCs − deduções).
6. **DetaCustos** – consolidação das **NE vinculadas em todos os TCs** do lote. **Agrupamento:** quando forem a **mesma NE**, o **mesmo subelemento**, o **mesmo centro de custos** e a **mesma UG beneficiária**, **somar** os valores numa única linha; quando qualquer desses critérios diferir, **exibir linhas distintas** nesta secção. **Cabeçalho da primeira coluna no PDF:** “Nota de Empenho”, com o mesmo formato de exibição **`YYYYNE######`** que no bloco “Principal com orçamento”.
7. **Histórico (opcional no PDF)** — **Duas variantes à escolha do utilizador** no momento da geração:
   * **Completo:** inclui a secção **HISTÓRICO / AUDITORIA (PRÉ-LIQUIDAÇÃO)** com os eventos gravados em `preLiquidacoes.historico` (amostra recente, p.ex. até 45 linhas), alinhada ao §8.8.
   * **Sem histórico no PDF:** o ficheiro **não** inclui essa tabela; o conteúdo operacional (itens 1–6 acima) mantém-se. **Em ambos os casos** o sistema **regista** na PL um evento de auditoria (`historico` + `auditoriaPdf`) indicando a variante gerada (ver §8.3).
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
| **Fechado** | NP e data informadas (equivalente operacional a “lote fechado” no SIAFI); ver §8.5 para correção de NP/data e vínculo com OP. |
| **Liquidada** | Lote com NP (e data) registados; liquidação no SIAFI refletida no SisExeFin; pode coexistir ou suceder **Fechado** conforme enum único na implementação. |
| **Aguardando Financeiro** | No âmbito da PL: **nenhuma LF** com **PF** associada (todas as LFs do lote sem PF). |
| **Para Pagamento parcial** | Parte das LFs com **PF** e parte sem. |
| **Para Pagamento** | **Todas** as LFs do lote com **PF**. |
| **Paga** | Pagamento concluído no processo do órgão (detalhar gatilho e campos na implementação). |
| **Comprovação** | Fase de comprovação documental/pós-pagamento (detalhar na implementação). |
| **Cancelado** | Ação do utilizador com permissão `preliquidacao_cancelar`: vínculo com TCs desfeito; ver §7.4. |
| **Ativo / Inativo (visibilidade)** | **Apenas administrador:** controla se a PL **aparece ou não** nas listagens para utilizadores não-admin (registo mantido; não confundir com cancelamento operacional). |

**Nota:** o código atual pode usar apenas um subconjunto destes valores (`Rascunho`, `Fechado`, etc.). A lista acima é o **alvo de produto** alinhado ao fluxo LF/PF na PL e ao espelho no TC (§2.1). Harmonizar **enum** e **migração** numa entrega dedicada.

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
* **Persistir metadados** no documento `preLiquidacoes` (objeto sugerido `auditoriaPdf`), incluindo no mínimo:
  * `geradoEm` (ISO 8601);
  * `usuario` (email do utilizador que gerou);
  * `nomeArquivoSugerido`;
  * **`variantePdf`:** `completo` ou `sem_historico` — conforme a opção escolhida no diálogo (PDF com ou sem a secção de histórico da PL);
  * quando a geração for iniciada na **lista**, pode gravar-se também `origem: 'lista'` para distinguir do botão no editor.
* **Diálogo obrigatório** antes de cada geração (lista ou editor): o utilizador escolhe **Completo** ou **Sem histórico** (cancelar interrompe sem gerar).
* **Nome do ficheiro descarregado:** o padrão é `DAuLiq_<codigoPL>.pdf`; na variante sem histórico no PDF usa-se sufixo **`_sem-historico`** antes da extensão (ex.: `DAuLiq_PL-00001-2026_sem-historico.pdf`).
* **Histórico da PL (`preLiquidacoes.historico`):** em **todas** as gerações é acrescentado um evento tipo `pdf` com texto que identifica a variante, por exemplo:
  * a partir do editor: `DAuLiq gerado (completo)` ou `DAuLiq gerado (sem histórico no PDF)`;
  * a partir da lista: `DAuLiq gerado (lista, completo)` ou `DAuLiq gerado (lista, sem histórico no PDF)`.

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
* **Ativo / inativo** (visibilidade da PL para não-admins): na implementação atual, chave **`preliquidacao_status`** (inativar / reativar) — tipicamente **admin**; o documento de negócio também referia `preliquidacao_inativar` como sinónimo conceitual.
* **Cancelar** PL (ação operacional §7.4): **`preliquidacao_cancelar`** — utilizador com perfil autorizado (não necessariamente admin).
* **Ações de fluxo:** `preliquidacao_gerar_pdf`, `preliquidacao_fechar_np`, `preliquidacao_associar_lf` (esta última quando a etapa LF estiver disponível).

### 8.8 DetaCustos e Histórico (secções 6 e 7 do DAuLiq em PDF)

10. **Conteúdo**

* **DetaCustos:** alinhar ao §6 — agregação por **NE + subelemento + centro de custos + UG beneficiária**; somar valores quando o quadruplo for idêntico; linhas distintas quando diferir; exibição da NE no formato **`YYYYNE######`** no PDF (§6).
* **Histórico no PDF (secção opcional):** quando o utilizador escolher a variante **completa**, a secção reflete **informações de auditoria** da PL (`historico`), em coerência com os registos persistidos — não é obrigatório incluir o dump completo de `historicoStatus` de cada TC; na variante **sem histórico no PDF**, essa secção **não** entra no documento, mas os eventos continuam na coleção Firestore e no `historico` da PL (§8.3).

### 8.9 Observação concatenada (DAuLiq)

11. **Formato quando um TC tem várias NEs**  
**Resposta:** **múltiplas linhas** (uma linha de observação por combinação NE / contexto conforme regra do documento auxiliar).

### 8.10 LF, PF e status após SIAFI

12. **Critério “LF atendida” / tem PF**  
**Resposta:** alinhar com **LF atendida** no processo.

**Decisão recomendada técnica:** usar **`situacao === 'Atendido'`** no registo `lfpf` como critério principal; **`pf` preenchido** como reforço (e para exibição). Se a importação SIPLAD marcar “atendida” só com PF, harmonizar regra na importação para não haver contradição.

13. **NE em vários TCs / várias LF por NE**  
**Resposta (atualizada):** na **mesma PL**, NEs **idênticas** são **unificadas** para informação de LF/PF (uma edição reflete em todos os TC que compartilham essa NE **nessa PL**). Por **NE distinta** na PL, o modelo admite **uma ou mais LFs**, cada uma com **valor** parcial, sendo a **soma** igual ao valor consolidado da NE (*x + y = valor da NE*).

**Decisão de modelo:** persistir na PL uma estrutura por NE unificada (ex.: `itensNe[]` com array `lfs[]`: `{ lf, valorAlocado, pf?, … }`) e propagar espelho para `empenhosVinculados` nos TCs afetados (§9.1).

14. **Status Para pagamento / Parcial (PL e TC)**  
**Resposta (atualizada):** atualizar **`preLiquidacoes`** e os **`titulos`** do lote de forma **coerente** com §2.1 e §5.1:

* **PL — Aguardando Financeiro:** nenhuma LF com PF.  
* **PL — Para Pagamento parcial:** parte das LFs com PF e parte sem.  
* **PL — Para Pagamento:** todas as LFs com PF.  
* **TC:** após **Liquidado**, **Aguardando Financeiro** quando **todas** as NE do TC têm LF na PL; **Liquidado** se **alguma** NE ainda sem LF completa; **Para Pagamento** quando **todas** as LFs relevantes têm PF. Atualização preferencialmente em **lote** (§9.4), sem depender de “abrir e salvar” cada TC.

### 8.11 Síntese das decisões (antigas dúvidas §8.11)

| Tema | Decisão |
|---|---|
| Storage no MVP | Apenas **download** + **metadados**; Storage em fase posterior (§8.3). |
| Coleção `np` ao desvincular | **Remover** o TC de `titulosVinculados` + **histórico** no TC e na PL. |
| NP única no fecho | **Sim** — todos os TC do carrinho partilham a **mesma NP** e **`dataLiquidacao`**. |
| Correção de NP | Permitida com motivo **apenas antes de OP** vinculada no SisExeFin (§8.13); não por “até primeira LF”. |
| Sequência PL | **Transação Firestore** + documento contador (§8.4). |
| Histórico no PDF | **Auditoria** na PL sempre persistida; **no PDF**, opcional — **completo** (tabela de histórico) ou **sem histórico** no documento, à escolha do utilizador (§6 item 7, §8.3). |
| Cancelamento com NP | **Permitido** com permissão, limpeza de NP nos TCs e auditoria (§7.4). |

### 8.12 Tópicos opcionais / futuros

* **Múltiplas LFs por NE** com valores parciais: modelo em `itensNe[].lfs[]` e validação de soma (§8.10 item 13, §9.1); UI na PL (§9.2).
* **Firebase Storage** para PDF: configurar bucket, tamanho máximo e leitura alinhada a `preliquidacao_ler` / `titulos_ler`.
* **Harmonização de enum** de status da PL (`Liquidada`, `Fechado`, etc.) com o código existente (§7.1).

### 8.13 OP, OB e alinhamento com o módulo OP × OB

No **SIAFI**, após autorizações, gera-se **OP** (Ordem de Pagamento); após assinaturas dos agentes, **OB** — associada ao pagamento efetivo. No SisExeFin existe o módulo **OP × OB** (importação CSV, vínculo OP ↔ NP, atualização de OB nas importações), análogo conceitualmente ao **LF × PF**.

**Regra de bloqueio:** a **correção de NP/data** na PL fica **permitida só enquanto não houver OP informada** nos TCs (campo `op` ou regra equivalente ao modelo atual). Após OP vinculada, bloquear edição de NP salvo política excecional futura.

### 8.14 Valor literal do status do TC (`Em Liquidação`)

**Decisão:** o estado elegível à pré-liquidação e o estado de retorno após **cancelamento** da PL usam o texto **`Em Liquidação`** (com acento), **único** valor no Firestore.

**Boa prática de implementação:** definir uma **constante** partilhada no código (ex.: `STATUS_TC_EM_LIQUIDACAO = 'Em Liquidação'`) para buscas, cancelamento e validações — evita variações acidentais (`Em liquidação`, sem acento, etc.).

### 8.15 MVP — primeiro entregável

**Aceite para o primeiro sprint:**

* Tela de **pré-liquidação** com **lista** de PLs (colunas e ações §3); filtro por fornecedor no **editor**; **carrinho** com validações (mesmo credor, status `Em Liquidação`, sem NP, um vínculo ativo de rascunho por TC).
* **Modo Visualizar** (somente leitura) e **Editar** conforme §3; geração **DAuLiq** a partir do **editor** ou da **lista** (§3, §8.3).
* **Gerar DAuLiq** em PDF (**download**); **diálogo** completo vs sem histórico no PDF; persistir **metadados** (`auditoriaPdf`, incluindo `variantePdf`) e evento em `historico` (§8.3).
* Layout do PDF alinhado à **PDTC** (papeleta de referência); **NE** exibida como **`YYYYNE######`** onde aplicável (§6).
* **Salvar** lote em **Rascunho** com código **`PL-#####/AAAA`** (transação + contador).
* **Informar NP + data** (outro utilizador ou o mesmo), fechar lote; propagar **NP** e **`dataLiquidacao`** a **todos** os TCs; vínculo com coleção **`np`** + histórico.
* **Cancelamento** e **remoção de TC** conforme §7.4 e §8.6; permissões §8.7; **inativar** via `preliquidacao_status` (tipicamente admin — visibilidade).

**Etapas posteriores:** associação **LF** no âmbito da PL, atualização em lote de `empenhosVinculados`, reflexo de import **`lfpf`**, Storage do PDF.

---

**Estado do documento:** regras alinhadas à **implementação atual** do módulo (lista, variantes de PDF, visualização); §8.12 permanece para **opcionais** (Storage, múltiplas LFs por NE na UI, harmonização de enums).

## 9. Sistemática de implementação sugerida (LF ↔ NE, LFxPF, espelho no TC)

### 9.1 Fonte de verdade recomendada

| Dado | Onde guardar |
|---|---|
| Metadados do lote, NP, data, código PL, status do lote | Documento `preLiquidacoes` |
| Lista consolidada de **NEs unificadas** do lote + **N LFs** por NE + valores | Array `itensNe[]` (ou equivalente) em `preLiquidacoes`: por NE distinta, armazenar `lfs[]` com `{ lf, valorAlocado, pf?, origemLfpfId?, … }`; chave estável: NE normalizada **+** subelemento quando a unificação exigir distinguir linhas do DetaCustos |
| LF/PF “oficiais” vindos do SIPLAD | Coleção **`lfpf`** (importação) |
| Espelho no TC (abas Liquidação / Financeiro somente leitura) | Projeção em `empenhosVinculados` (estrutura pode evoluir para `lfs[]` espelho ou campo agregado legível; **alinhar** ao enum e à UI) |

**Regra de sincronização:** ao gravar na PL, o sistema **propaga** para **cada** `empenhosVinculados` de **cada** TC do lote que referencie aquela NE (e subelemento, se parte da chave) o **mesmo conjunto** de LF/PF **unificado** na PL. A edição **não** ocorre no formulário do TC.

### 9.2 Etapas de UI na tela de pré-liquidação (abas ou steps)

1. **Montagem** – fornecedor, carrinho de TCs, gerar DAuLiq, salvar rascunho / código.
2. **Fecho SIAFI** – informar NP + data de liquidação (lote `Fechado` neste sentido operacional).
3. **Associação LF** – tabela por **NE unificada** no lote: NE, subelemento (se aplicável), **valor consolidado**, TCs de origem (idProc), lista **“adicionar LF”** com **uma ou mais** linhas por NE (cada linha: LF via `lfpf`, **valor alocado**, PF somente leitura após importação/atendimento), **validação** soma dos valores = valor da NE; **PF** e situação atualizáveis após import `lfpf`.
4. **Acompanhamento** – indicadores: NEs com LF completa; LFs com PF; badges alinhados a **Aguardando Financeiro** / **Para Pagamento parcial** / **Para Pagamento** (§2.1).

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

* Módulo **pré-liquidação** (lista, editor, PDF DAuLiq, NP, Firestore): `preliquidacao.html`, `script-preliquidacao.js`
* Especificação detalhada do layout do DAuLiq: `regras de negócio - Documento auxiliar de liquidação..txt`
* Papeleta (PDTC) – referência de formatação: geração em `script-titulos-spa.js` (`gerarPDFTitulo`)
* Aba Liquidação do TC, NP, LF/PF: `script-titulos-spa.js`, `titulos.html`, e `Regras de Negócios - TC - Aba Liquidação.md`
* Importação e coleção **LFxPF**: `script-import.js`, `script-lfpf.js`, `sistema.html` (secção LF/PF)
* Módulo **OP × OB** (contexto §8.13): alinhar ao código e telas de OP/NP no repositório.

---

*Documento vivo: decisões nas secções 7–8 e §8.15 (MVP); §2.1 e §5.1 alinham PL ↔ TC com [Regras de Negócios - TC - Aba Liquidação.md](./Regras%20de%20Negócios%20-%20TC%20-%20Aba%20Liquidação.md); §3 e §6 refletem a UI e o PDF em produção. Revisar §8.12 antes de Storage e migração de enums.*

