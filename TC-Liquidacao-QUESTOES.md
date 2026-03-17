## Pedido do usuário

Na aba Liquidação (3ª aba), incluir a lista de NE vinculadas na aba anterior (Processamento), como somente leitura, ao lado de cada NE incluir a coluna LF para ser incluída. Para cada NE uma LF deverá ser incluída para finalizar a "Liquidação". Essa aba poderá ser salva sem LF, porém será obrigatória a NP.

## Dúvidas levantadas antes da implementação

1. **Origem/destino da LF na Liquidação**
   - Hoje já existe campo LF por NE em Processamento e também tabela LF/PF em Financeiro.
   - Na visão desejada, essa LF da aba Liquidação:
     - a) Usa o mesmo campo `lf` que já está em `empenhosDaNotaAtual` (mesmo dado, editado em outra aba)?  
     - b) Ou é um campo específico da etapa de liquidação (por exemplo, `lfLiquidacao`), distinto da LF usada depois em Financeiro?

2. **Onde os campos serão editáveis**
   - Dados da NE (NE, ND, valor, Centro de Custos, UG) devem ser somente leitura.
   - Apenas a coluna LF deve ser editável na Liquidação.
   - Pergunta: devemos travar a edição de LF na aba Processamento (para evitar dois pontos de edição) ou a aba Liquidação será apenas uma visão de conferência e a edição oficial continua em Processamento?

3. **Relação entre Liquidação e Financeiro**
   - A aba Financeiro mostra uma tabela com NE / Valor / LF / PF.
   - Papel da aba Financeiro após a mudança:
     - a) Reutilizar os mesmos campos LF/PF já preenchidos em Processamento/Liquidação (consulta ou ajuste fino)?  
     - b) Tornar a Liquidação o local principal de preenchimento da LF, deixando Financeiro mais focada em PF/OP?
   - Se LF passar a ser preenchida oficialmente na Liquidação, faz sentido:
     - Remover ou desativar a coluna LF da aba Processamento?
     - Manter LF em Financeiro apenas para consulta?

4. **Validações na aba Liquidação**
   - Já definido: é permitido salvar sem LF, mas NP é obrigatória.
   - Perguntas complementares:
     - Se alguma NE tiver LF preenchida, devemos obrigar preenchimento da Data de Liquidação?
     - Deve haver aviso ao tentar avançar de status com NEs sem LF?

5. **Status vinculado à conclusão da Liquidação**
   - Status são controlados por `STATUS_ORDEM` em `script-titulos-spa.js`.
   - Quando o usuário preenche NP e, opcionalmente, LFs na Liquidação:
     - Deve existir um botão específico (por exemplo, "Concluir Liquidação") que:
       - Valida NP obrigatória,
       - Opcionalmente valida LF,
       - Atualiza o status (por exemplo, para "Liquidado" ou "Aguardando Financeiro")?
     - Ou, por enquanto, apenas adicionamos layout e salvamento dos campos, sem alterar a lógica de status (deixar fluxo de status para etapa futura)?

6. **Comportamento quando não há NE vinculada**
   - Se o TC não tiver nenhuma NE vinculada na aba Processamento:
     - A aba Liquidação deve mostrar tabela vazia com mensagem "Nenhuma NE vinculada", mas ainda permitir preencher NP?
     - Ou NP só faz sentido se houver pelo menos uma NE vinculada (bloqueando salvar/avançar sem NE)?

