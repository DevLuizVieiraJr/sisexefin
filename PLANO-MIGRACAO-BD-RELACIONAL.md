# Plano de Migração: Firestore → Banco Relacional

**Sistema:** SisExeFin - Sistema de Execução Financeira  
**Data do plano:** 12/03/2026  
**Objetivo:** Reduzir custos operacionais e escalar o uso do sistema migrando de Firestore (NoSQL) para Cloud SQL (relacional).

---

## 1. Contexto e Motivação

### 1.1 Situação Atual
- **Banco:** Firestore (NoSQL, documento)
- **Cobrança:** Por operação (reads, writes, deletes)
- **Limite gratuito:** 50.000 reads/dia

### 1.2 Problema
- Volume de leituras tende a ultrapassar o limite gratuito com múltiplos usuários, telas com muitas coleções e imports CSV
- Exemplo: 3 usuários em Títulos, ~5 cargas/dia, 4 coleções (~10k docs cada) ≈ 150.000+ reads/dia

### 1.3 Solução Proposta
- Migrar para **Cloud SQL** (PostgreSQL ou MySQL)
- Cobrança por instância (fixa mensal), não por operação
- Requer backend (API REST) entre frontend e banco

---

## 2. Estratégia: Sistema Paralelo

Recomenda-se migração com **sistemas em paralelo** para reduzir risco:

| Benefício | Descrição |
|-----------|-----------|
| Produção estável | v1 (Firestore) continua atendendo usuários durante a migração |
| Testes seguros | v2 (Cloud SQL) pode ser validada com usuários reais sem impacto |
| Rollback fácil | Em caso de falhas, basta voltar para v1 |
| Migração gradual | Permite validações incrementais e correções |

### 2.1 Arquitetura Durante a Migração

```
                    ┌─────────────────────┐
                    │   Firebase Auth     │  (mantido em ambas as versões)
                    └──────────┬──────────┘
                               │
          ┌────────────────────┴────────────────────┐
          │                                         │
          ▼                                         ▼
┌─────────────────────┐                 ┌─────────────────────┐
│   SISEXEFIN v1      │                 │   SISEXEFIN v2      │
│   (produção)        │                 │   (paralelo/teste)  │
│                     │                 │                     │
│   HTML/JS →         │                 │   HTML/JS → API →   │
│   Firestore         │                 │   Cloud SQL         │
└─────────────────────┘                 └─────────────────────┘
          │                                         │
          ▼                                         ▼
┌─────────────────────┐                 ┌─────────────────────┐
│   Firestore         │   migração      │   Cloud SQL         │
│   (BD atual)        │   de dados      │   (BD novo)         │
└─────────────────────┘ ──────────────► └─────────────────────┘
```

---

## 3. Etapas Detalhadas

### FASE 0: Planejamento (1–2 semanas)

| # | Etapa | Descrição |
|---|-------|-----------|
| 0.1 | Definir banco alvo | Escolher Cloud SQL PostgreSQL ou MySQL |
| 0.2 | Modelar schema relacional | Mapear coleções Firestore → tabelas (empenhos, titulos, contratos, darf, lfpf, oi, usuarios, perfis, config, auditoria) |
| 0.3 | Escolher host do backend | Cloud Functions, App Engine ou servidor próprio |
| 0.4 | Definir API REST | Listar todos os endpoints necessários para substituir chamadas diretas ao Firestore |
| 0.5 | Definir políticas de backup e rollback | Procedimentos de restauração e retorno à v1 |

**Entregáveis:**
- Documento de schema relacional
- Especificação da API REST
- Cronograma revisado

---

### FASE 1: Infraestrutura (1–2 semanas)

| # | Etapa | Descrição |
|---|-------|-----------|
| 1.1 | Criar instância Cloud SQL | Configurar PostgreSQL/MySQL no Google Cloud |
| 1.2 | Criar schema e tabelas | Executar scripts DDL conforme modelo da Fase 0 |
| 1.3 | Provisionar backend | Deploy de API (Node.js/Express, Cloud Functions, etc.) |
| 1.4 | Configurar autenticação | Integrar Firebase Auth com backend (verificação de token) |
| 1.5 | Configurar CORS, SSL e políticas de segurança | Garantir acesso seguro da aplicação web |

**Entregáveis:**
- Banco relacional criado e acessível
- Backend mínimo respondendo health check

---

### FASE 2: Camada de API (2–3 semanas)

| # | Etapa | Descrição |
|---|-------|-----------|
| 2.1 | CRUD Empenhos | GET, POST, PUT, DELETE com filtros e paginação |
| 2.2 | CRUD Títulos | Incluir empenhosVinculados, tributacoes, histórico |
| 2.3 | CRUD Contratos, DARF, LFxPF, OI | Endpoints por módulo |
| 2.4 | Buscas/autocomplete | Empresa, NE, OI, LF – com limite de resultados |
| 2.5 | Imports CSV | NE, LFxPF, OPxOB – processar e inserir/atualizar |
| 2.6 | Config e Auditoria | Leitura de config, escrita de auditoria |
| 2.7 | Autorização | Validar permissões (empenhos_ler, titulos_inserir, etc.) no backend |

**Entregáveis:**
- API REST documentada (Swagger/OpenAPI)
- Testes unitários e de integração

---

### FASE 3: Migração de Dados (1 semana)

| # | Etapa | Descrição |
|---|-------|-----------|
| 3.1 | Script de exportação Firestore | Exportar coleções para JSON ou CSV |
| 3.2 | Script de transformação | Mapear campos e relacionamentos |
| 3.3 | Script de importação Cloud SQL | Inserir dados nas tabelas |
| 3.4 | Validação | Comparar contagens e amostras (consistência) |
| 3.5 | Definir data da foto | Data/hora para migração inicial e possíveis reexecuções |

**Entregáveis:**
- Scripts de export/import versionados
- Relatório de validação

---

### FASE 4: Frontend Paralelo (2–4 semanas)

| # | Etapa | Descrição |
|---|-------|-----------|
| 4.1 | Criar cópia do projeto | Nova pasta/branch (ex.: `sisexefin-v2`) |
| 4.2 | Camada de abstração | Substituir chamadas Firestore por fetch à API REST |
| 4.3 | Simular tempo real | Long polling ou WebSocket para atualizações |
| 4.4 | Flag de ambiente | Configurar variável para alternar v1/v2 (Firestore vs API) |
| 4.5 | Adaptar imports CSV | Enviar arquivo para API em vez de processar no cliente |
| 4.6 | Testes em homologação | Usar dados reais (cópia) para validação |

**Entregáveis:**
- Aplicação v2 funcional contra Cloud SQL
- Documentação de deploy e alternância v1/v2

---

### FASE 5: Validação e Pilotagem (2–3 semanas)

| # | Etapa | Descrição |
|---|-------|-----------|
| 5.1 | Grupo piloto | 1–3 usuários usando v2 em paralelo à v1 |
| 5.2 | Comparação de resultados | Conferir dados, relatórios e exports entre v1 e v2 |
| 5.3 | Correções e ajustes | Resolver diferenças e bugs encontrados |
| 5.4 | Documentação de diferenças | Registrar mudanças de comportamento, se houver |

**Entregáveis:**
- Relatório de pilotagem
- Lista de ajustes realizados

---

### FASE 6: Corte e Desligamento (1–2 semanas)

| # | Etapa | Descrição |
|---|-------|-----------|
| 6.1 | Última sincronização | Exportar dados finais do Firestore e importar no Cloud SQL |
| 6.2 | Troca de produção | Apontar domínio/URL para v2 |
| 6.3 | Monitoramento | Acompanhar erros, performance e feedback |
| 6.4 | Firestore somente leitura | Manter v1 acessível (somente leitura) por 30 dias |
| 6.5 | Backup final Firestore | Export completo antes de desativar |
| 6.6 | Desligamento v1 | Remover acesso e, após validação, cancelar recurso Firestore |

**Entregáveis:**
- Procedimento de rollback documentado
- Backup final do Firestore

---

## 4. Cronograma Estimado

| Fase | Duração | Acumulado |
|------|---------|-----------|
| 0. Planejamento | 1–2 semanas | 2 semanas |
| 1. Infraestrutura | 1–2 semanas | 4 semanas |
| 2. Camada de API | 2–3 semanas | 7 semanas |
| 3. Migração de dados | 1 semana | 8 semanas |
| 4. Frontend paralelo | 2–4 semanas | 12 semanas |
| 5. Validação e pilotagem | 2–3 semanas | 15 semanas |
| 6. Corte e desligamento | 1–2 semanas | 17 semanas |

**Total estimado:** 4–5 meses (considerando uma pessoa em tempo integral ou equivalente em esforço distribuído).

---

## 5. Riscos e Mitigações

| Risco | Probabilidade | Impacto | Mitigação |
|-------|---------------|---------|-----------|
| Atraso no cronograma | Média | Médio | Buffer em cada fase; priorização de MVP |
| Incompatibilidade de dados | Baixa | Alto | Validação rigorosa na Fase 3; reexecução de scripts |
| Perda de funcionalidade | Média | Alto | Checklist de features; testes de regressão; piloto com usuários |
| Problemas de performance na API | Média | Médio | Índices no banco; paginação; cache onde fizer sentido |
| Falha no corte | Baixa | Alto | Procedimento de rollback; Firestore mantido em modo leitura |

---

## 6. Alternativa: Otimização no Firestore (Sem Migração)

Antes de migrar, é possível reduzir custos no Firestore:

| Medida | Efeito estimado |
|--------|-----------------|
| Carregamento sob demanda na tela Títulos | Evitar carregar 4 coleções inteiras na abertura |
| Queries limitadas (top 50–100) nos autocompletes | Menos documentos lidos por busca |
| Persistência local (já adotada) | Redução em recarregamentos |
| Assinar apenas coleção da seção ativa em sistema.html (já adotado) | Menos reads ao trocar de seção |

**Decisão:** Avaliar resultado da otimização após 1–2 meses. Se o custo continuar elevado, seguir com o plano de migração.

---

## 7. Referências

- [Cloud SQL - Documentação](https://cloud.google.com/sql/docs)
- [Firestore - Preços](https://firebase.google.com/pricing)
- [MIGRACAO-OTIMIZACAO-FIREBASE.md](./MIGRACAO-OTIMIZACAO-FIREBASE.md) – Otimizações já aplicadas no Firestore

---

## 8. Histórico de Revisões

| Data | Versão | Alteração |
|------|--------|-----------|
| 12/03/2026 | 1.0 | Criação do documento |
