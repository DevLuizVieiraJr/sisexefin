# Migração: Otimização de consumo Firestore

**Data do plano:** 13/03/2026  
**Backup:** `backup-pre-otimizacao-20260313-1558/`  
**Objetivo:** Reduzir leituras do Firestore sem migrar para SPA.

---

## 1. Contexto

O SisExeFin assina 6 coleções ao entrar em `sistema.html`, gerando milhares de reads mesmo quando o usuário usa apenas uma seção (ex.: LFxPF). Cada navegação entre páginas recarrega tudo. O plano gratuito do Firestore tem 50.000 reads/dia.

---

## 2. Mudanças planejadas

### Fase 1: Persistência (cache local)

| Item | Descrição |
|------|-----------|
| **O quê** | Ativar `firebase.firestore().enablePersistence()` |
| **Onde** | `firebase-config.js` ou na inicialização do Firestore em `script.js` |
| **Efeito** | Dados ficam em cache local; ao voltar à página, menos reads (servidos do cache quando possível) |
| **Risco** | Baixo. Em multi-tab pode exigir `enableMultiTabIndexedDbPersistence` se houver conflito |

### Fase 2: Assinar só a coleção da seção ativa

| Item | Descrição |
|------|-----------|
| **O quê** | Em vez de `escutarFirebase()` assinar todas as coleções de uma vez, assinar apenas a coleção correspondente à seção visível (empenhos, lfpf, darf, contratos, titulos). Ao trocar de seção, cancelar o listener anterior e criar o novo. |
| **Onde** | `script.js` – função `escutarFirebase()` e chamadas relacionadas |
| **Efeito** | Se o usuário abre só LF, lê só lfpf (~500 docs em vez de ~3000+) |
| **Risco** | Médio – variáveis `baseEmpenhos`, `baseLfPf` etc. podem ficar vazias até a seção ser aberta; módulos que dependem delas devem tratar isso |

---

## 3. Arquivos a modificar

| Arquivo | Alteração prevista |
|---------|--------------------|
| `firebase-config.js` ou `script.js` | Adicionar `enablePersistence()` após inicializar Firestore |
| `script.js` | Refatorar `escutarFirebase()` para aceitar parâmetro de seção ou ter `escutarColecao(secao)`. Armazenar função de cancelamento (unsubscribe) dos listeners. |
| `script-sistema-init.js` | Após `mostrarSecao()`, chamar a nova função que assina apenas a coleção da seção ativa (e cancela as demais). |
| `script.js` | Na função `mostrarSecao()`, invocar a lógica de troca de listeners ao mudar de seção. |

---

## 4. Dependências entre módulos

Os módulos `script-empenhos.js`, `script-lfpf.js`, `script-contratos.js`, `script-darf.js`, `script-titulos.js` e `script-import.js` usam:

- `baseEmpenhos`, `baseLfPf`, `baseContratos`, `baseDarf`, `baseTitulos`

Essas variáveis são preenchidas por `escutarFirebase()`. Com a mudança:

- Só a base da seção ativa será preenchida.
- Ao abrir uma seção, o listener correspondente será ativado; as outras bases permanecem vazias ou com último valor em cache (se aplicável).
- Os módulos devem tratar `baseX === []` ou `undefined` (ex.: exibir "Carregando..." ou "Nenhum registro").

---

## 5. Ordem de implementação

1. **Persistência** – alterar `firebase-config.js` ou `script.js`.
2. **Refatorar escutarFirebase** – criar `escutarColecaoSecao(idSecao)` que:
   - Cancela listeners ativos de outras coleções;
   - Assina só a coleção da seção atual;
   - Preenche a variável correspondente.
3. **Integrar com mostrarSecao** – ao trocar de seção, chamar `escutarColecaoSecao(novaSecao)`.
4. **Integrar com script-sistema-init** – na inicialização, após decidir a seção, chamar `escutarColecaoSecao(secaoInicial)`.
5. **Validar** – testar cada seção (NE, LF, DARF, Contratos, Títulos, Backup) e importação.

---

## 6. Rollback

Se surgirem problemas, restaurar os arquivos a partir do backup:

```
backup-pre-otimizacao-20260313-1558/
├── firebase-config.js
├── script.js
├── script-sistema-init.js
├── sistema.html
├── script-*.js
├── admin-*.js
└── *.html
```

Copiar de volta para a raiz do projeto os arquivos necessários.

---

## 7. Checklist antes de implementar

- [x] Backup criado em `backup-pre-otimizacao-20260313-1558/`
- [x] Documentação das mudanças (este arquivo)
- [ ] Revisão do plano com o responsável
- [x] Fase 1: Persistência ativada em `firebase-config.js`
- [x] Fase 2: `escutarColecaoSecao()` em `script.js`; `mostrarSecao()` chama escutar coleção da seção ativa

---

## 8. Referências

- [Firestore - Enable persistence](https://firebase.google.com/docs/firestore/manage-data/enable-offline)
- DOC-LFxPF.md (documentação do módulo LFxPF)
- Mapeamento HTML/JS analisado anteriormente
