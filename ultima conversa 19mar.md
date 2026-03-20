# Business rules and bug analysis for NE editing
_Exported on 19/03/2026 at 23:21:01 BRT from Cursor (2.6.19)_

---

**User**

analise as @Regras de Negócio - Aba Liquidação.md .
crie uma para cada aba do TC, observando esse arquivo como modelo.

um bug: quando clica para editar uma NE vinculada anteriormente, abre o formulario para a edição das informações complementares a NE, verifique o por que, do campo subelemento não apresentar os subelementos vinculados ao empenho. Outro detalhe, é que quando aberto essa edição, não tem a opção de fechar edição ou cancelar edição, tem apenas salvar. o iedal é perguntar se ele tem ser certeza que uqer desistir e que que isso acarretará na perda das informações.
outro bug: quando o usuário abre essa mesmo formulario de edição da NE vinculada, ao mudar de seção ou aba, ela continua aberta. o sistema deve perguntar se deseja salvar a aba antes de migrar para outra aba, pois pode perder as informações. Percebi, que quando o usuário fecha o TC com esse formulário de edição de NE vinculada, ou clicar em outro TC, esse formulário continua aberto com a NE antes editada.

crie as regras de negócios acima e depois analise eses bug. antes de implemnetar tire as duvidas.

---

**Cursor**


Analisando o modelo de regras, mapeando as abas do TC no projeto e localizando o código do formulário de NE vinculada para documentar regras e analisar os bugs.




Criando os documentos de regras por aba (modelo da Liquidação) e um documento que consolida a análise dos bugs e as dúvidas para implementação.




Segue o que foi feito e a análise pedida.

## Documentos criados (modelo da Liquidação)

| Ficheiro | Conteúdo |
|----------|----------|
| [Regras de Negócio - Aba Dados Básicos.md](Regras%20de%20Negócio%20-%20Aba%20Dados%20Básicos.md) | Campos, validações, salvamento com aba 0 ativa, ligação às outras abas |
| [Regras de Negócio - Aba Processamento.md](Regras%20de%20Negócio%20-%20Aba%20Processamento.md) | NE, tributações, **painel de complementação** + **regras de UX** (cancelar, mudança de aba, fechar/trocar TC) |
| [Regras de Negócio - Aba Financeiro.md](Regras%20de%20Negócio%20-%20Aba%20Financeiro.md) | LF só leitura, PF, OP, status |
| [Regras de Negócio - Aba Histórico.md](Regras%20de%20Negócio%20-%20Aba%20Histórico.md) | Tabela auditiva, `historicoStatus` |
| [Análise técnica - Painel NE e navegação TC.md](Análise%20técnica%20-%20Painel%20NE%20e%20navegação%20TC.md) | Causas prováveis no código e **dúvidas antes de implementar** |

A **Aba Liquidação** já estava documentada no ficheiro que usaste como modelo; não a dupliquei.

---

## Análise dos bugs (sem implementar ainda)

### 1) Subelemento ao editar NE já vinculada

Há **duas** pistas fortes no código:

**a) Nome do campo no objeto guardado**  
Ao escolher uma NE na busca, o subelemento vem de `subitem` **ou** `subelemento` da coleção. Ao abrir o painel em modo **edição**, só se usa `v.subelemento`:

```774:775:c:\Users\lucav\OneDrive\Documentos\Projetos\sisexefin\script-titulos-spa.js
        const subEl = document.getElementById('vinculoSubelemento');
        if (subEl) subEl.value = v.subelemento || '';
```

```1030:1031:c:\Users\lucav\OneDrive\Documentos\Projetos\sisexefin\script-titulos-spa.js
                const subEl = document.getElementById('vinculoSubelemento');
                if (subEl) subEl.value = (e.subitem || e.subelemento || '').trim();
```

Se o item em `empenhosVinculados` tiver só `subitem` (dados antigos/import), o campo fica **vazio** na edição.

**b) Controlo é um input readonly**  
No HTML o subelemento está como texto **somente leitura** (o valor ainda pode ser preenchido por JS, mas não há lista de opções):

```239:241:c:\Users\lucav\OneDrive\Documentos\Projetos\sisexefin\titulos.html
                                    <div class="form-group flex-1"><label>ND (Natureza de Despesa):</label><input type="text" id="vinculoND" readonly class="input-readonly" placeholder="Preenchido pela NE"></div>
                                    <div class="form-group flex-1"><label>Subelemento (2 dígitos):</label><input type="text" id="vinculoSubelemento" maxlength="2" pattern="[0-9]*" placeholder="Ex: 01" title="Apenas números, 2 dígitos" readonly></div>
```

Se a regra de negócio for “**mostrar os subelementos ligados ao empenho**” como **várias opções**, o modelo atual **não** implementa isso: seria preciso saber onde isso vive no Firestore (ver dúvidas abaixo).

---

### 2) Sem “Cancelar / desistir” com confirmação

O painel só expõe o fluxo que chama `adicionarEmpenhoNaNota()`; não há ação dedicada a fechar o painel com aviso de perda de dados.

---

### 3) Mudança de aba / fechar TC / outro TC com o painel aberto

O clique nas abas **só** troca o painel visível; não há verificação de edição pendente:

```626:630:c:\Users\lucav\OneDrive\Documentos\Projetos\sisexefin\script-titulos-spa.js
    document.querySelectorAll('.tab-tc').forEach(tab => {
        tab.addEventListener('click', function() {
            if (this.classList.contains('bloqueado')) return;
            ativarTab(parseInt(this.getAttribute('data-tab') || 0));
        });
```

`voltarParaListaTitulos` e `abrirFormularioTitulo` **não** limpam `indiceEmpenhoEditando`, nem escondem `#detalhesVinculoEmpenho`, nem `empenhoTemporarioSelecionado` — daí o painel “grudar” com contexto errado ao sair ou mudar de TC.

```544:547:c:\Users\lucav\OneDrive\Documentos\Projetos\sisexefin\script-titulos-spa.js
    window.voltarParaListaTitulos = function() {
        document.getElementById('tela-formulario-titulos').style.display = 'none';
        document.getElementById('tela-lista-titulos').style.display = 'block';
    };
```

---

## Dúvidas para fechar **antes** de implementar

1. **Subelemento**: deve continuar a ser **um único código de 2 dígitos** por vínculo, ou precisas mesmo de um **select** com **todos** os subelementos da NE? Se for select, onde estão esses dados na coleção `empenhos` (campo único `subitem`, array, outro)?

2. Na **edição** de um vínculo já guardado, o subelemento deve ser **imutável** (como o comentário no código sugere para ND/subelemento) ou **editável**?

3. “Alterações por guardar” no painel: confirmação só quando há **diff** face ao que estava na linha / à NE selecionada, ou **sempre** que o painel estiver aberto?

4. Ao mudar de aba, “guardar antes” significa **Aplicar “Atualizar item”** (memória) ou **gravar o TC no Firestore** (botão global)?

5. Ao fechar o formulário com TC **já persistido** e **sem** alterações noutros campos, queres confirmação **só** se o painel NE estiver “sujo”, ou também alinhar com o comportamento atual do botão Fechar?

Quando responderes a estes pontos, posso propor o desenho concreto (estado `dirty`, interceptores de tab/fechar/`editarTitulo`) e implementar no `script-titulos-spa.js` + `titulos.html`.

