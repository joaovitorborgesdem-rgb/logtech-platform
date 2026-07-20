# Decisões de arquitetura

## ADR-001: Estratégia de isolamento multi-tenant

**Status:** Aceito

### Contexto

A partir da Fase 2, a plataforma precisa isolar dados entre tenants (clientes
da plataforma). Duas estratégias clássicas foram avaliadas:

1. **Schema-per-tenant**: cada tenant tem seu próprio schema/database, com
   migrações replicadas por schema.
2. **`tenant_id` em linha** (shared database, shared schema): todas as tabelas
   de domínio carregam uma coluna `tenantId`, e todo acesso é filtrado por ela.

### Decisão

Adotamos **`tenant_id` em linha**, com banco e schema compartilhados entre
todos os tenants.

Isso já é o padrão de fato desde a modelagem inicial do Prisma (Fase 0/1):
`User`, `Carrier`, `Client` e `FreightQuote` já possuem `tenantId` obrigatório;
`AuditLog` possui `tenantId` opcional (eventos de sistema não vinculados a um
tenant específico); `RefreshToken` e `FreightQuoteOption` isolam por relação
(via `User`/`FreightQuote`) em vez de coluna direta.

### Justificativa

- **Operacional**: uma única migração Prisma por deploy. Schema-per-tenant
  exigiria rodar (e versionar) migrações N vezes por deploy, uma por tenant,
  o que não escala operacionalmente para um time pequeno.
- **MySQL/MariaDB** (adapter usado no projeto) tem suporte a múltiplos schemas
  mais rudimentar que Postgres (sem `search_path`), tornando schema-per-tenant
  mais custoso de administrar (pool de conexões, backups, migrações).
- **Custo de infraestrutura**: shared schema permite muitos tenants pequenos
  sem custo incremental de conexão/schema por tenant.
- **Trade-off aceito**: isolamento depende de disciplina de código (toda
  query precisa filtrar por `tenantId`). Mitigamos isso com escopo automático
  (ADR-002) em vez de depender de cada desenvolvedor lembrar de filtrar
  manualmente.
- Caso um tenant específico precise de isolamento físico forte no futuro
  (compliance, contrato enterprise), a estratégia não impede migrar esse
  tenant isoladamente para um banco dedicado — decisão adiada até haver essa
  necessidade real.

### Rejeitado

Schema-per-tenant foi rejeitado por aumentar a complexidade operacional
(migrações, conexões, backups) sem benefício claro no estágio atual do
produto (poucos tenants, time pequeno, sem requisito de compliance que exija
isolamento físico).

---

## ADR-002: Resolução de tenant e escopo automático de queries

**Status:** Aceito

### Resolução de tenant (`TenantMiddleware`)

Aplicado globalmente (`apps/api/src/tenant/tenant.middleware.ts`), roda antes
de guards/interceptors e extrai um **hint** de tenant (não autoritativo) a
partir de:

1. Header `X-Tenant-Id` (explícito, usado por proxies/frontends que já sabem
   o tenant antes do login).
2. Subdomínio do `Host` (ex.: `acme.logisense.app` → hint `acme`), para uso
   futuro em branding/rate-limiting de páginas públicas.

Esse hint fica em `req.tenantSlugHint` e **não é usado para autorizar acesso
a dados** — serve apenas como contexto auxiliar (ex.: logging, futuras
páginas públicas por tenant). A fonte autoritativa de tenant para dados é
sempre o `tenantId` embutido no access token JWT, validado por `JwtStrategy`.

### Contexto de requisição (`TenantContextInterceptor`)

Registrado como `APP_INTERCEPTOR` global
(`apps/api/src/tenant/tenant-context.interceptor.ts`). Roda depois dos
guards, então já enxerga `request.user` (populado por `JwtAuthGuard` /
`JwtStrategy`) quando a rota é autenticada. Se houver usuário autenticado,
o restante do pipeline (interceptors seguintes, controller, services) roda
dentro de um `AsyncLocalStorage` (`apps/api/src/tenant/tenant-context.ts`)
contendo `{ tenantId, userId, role }`. Rotas públicas (`register`, `login`,
`refresh`) não têm `request.user`, então rodam sem contexto de tenant — o que
é esperado, pois essas rotas ainda não sabem qual tenant é o alvo (ou operam
sobre o próprio `Tenant`).

### Escopo automático (Prisma Client Extension)

`apps/api/src/prisma/tenant-scoped-prisma.provider.ts` define uma
[client extension](https://www.prisma.io/docs/orm/prisma-client/client-extensions)
(`$extends`) que intercepta todas as operações dos modelos com `tenantId`
direto (`User`, `Carrier`, `Client`, `FreightQuote`, `AuditLog`):

- Em `create`/`createMany`: injeta `tenantId` do contexto atual em `data`.
- Em leituras/updates/deletes (`findMany`, `findFirst`, `findUnique`,
  `update`, `updateMany`, `delete`, `deleteMany`, `count`, `aggregate`,
  `groupBy`): injeta `tenantId` do contexto atual em `where`.
- Se não houver contexto de tenant (fora de uma requisição autenticada, ex.:
  `AuthService` durante login/registro), a query passa **sem modificação** —
  por isso `AuthService` continua filtrando `tenantId` manualmente onde
  necessário (ex.: `findUnique({ tenantId_email })`), já que nesses fluxos o
  tenant ainda não é conhecido pelo contexto da requisição.

Esse cliente com escopo automático fica disponível via o token de injeção
`TENANT_SCOPED_PRISMA` (exportado por `PrismaModule`), que deve ser usado nos
services de domínio (Fase 3 em diante: Carrier, Client, FreightQuote) em vez
do `PrismaService` cru. `PrismaService` cru continua existindo para os casos
que precisam operar fora do tenant atual (o próprio `AuthService`,
verificações de existência de `Tenant`, etc.).

### Limitação conhecida

`RefreshToken` e `FreightQuoteOption` não têm coluna `tenantId` direta (só
via relação). A extension não os escopa automaticamente — o isolamento deles
depende de escopar corretamente a entidade pai (`User`/`FreightQuote`) nos
services que os manipulam. Se isso se tornar um problema real, considerar
desnormalizar `tenantId` para essas tabelas.
