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

---

## ADR-003: Soft delete nos CRUDs de domínio

**Status:** Aceito

Carrier, Client e FreightQuote usam soft delete (`deletedAt DateTime?`) em vez
de `DELETE` físico. O endpoint `DELETE` faz `UPDATE ... SET deletedAt = now()`
e grava um `AuditLog` (`CARRIER_DELETED` / `CLIENT_DELETED` /
`FREIGHT_QUOTE_DELETED`) com `userId` de quem removeu. Todas as leituras
(`findAll`, `findFirst`, `update`) filtram `deletedAt: null` explicitamente
nos services — isso **não** é feito pela Prisma client extension de
tenant-scoping (ADR-002), que só cuida de `tenantId`; são responsabilidades
separadas.

**Trade-off aceito**: `Carrier` e `Client` têm `@@unique([tenantId, document])`
no schema. Como o MySQL/MariaDB não suporta índice único parcial (filtrado),
esse índice único continua contando linhas com soft delete — ou seja, não é
possível recriar um registro com o mesmo `document` depois de removê-lo (o
`INSERT` falhará com violação de unicidade). Se isso virar um problema real de
produto, a solução é normalizar `document` para incluir um sufixo/timestamp no
soft delete, ou migrar para hard delete nesses casos específicos.

---

## ADR-004: Integração com ViaCEP (busca de CEP por localidade)

**Status:** Aceito

### Contexto

O formulário de simulação de frete precisa permitir que o usuário encontre o
CEP de origem/destino a partir de UF + cidade + logradouro, quando ele não
sabe o CEP de cor. Essa é uma das integrações externas obrigatórias do
desafio (ver `TASKS.md`, Fase 7).

### Decisão

`GET /integrations/viacep/search?uf=&city=&street=` (protegido por
`JwtAuthGuard`, mesmo padrão dos demais endpoints de domínio) consulta
`https://viacep.com.br/ws/{uf}/{cidade}/{logradouro}/json/` no backend e
repassa a lista de endereços encontrados para o frontend. O frontend nunca
chama a ViaCEP diretamente — sempre via proxy do backend
(`ViaCepService`, `apps/api/src/integrations/viacep/`), o que evita expor a
ViaCEP diretamente ao browser (CORS, rate limit por IP de cliente) e permite
adicionar cache/circuit breaker no futuro sem tocar no frontend.

### Detalhes de implementação

- Usa o `fetch` global do Node (disponível desde o Node 18, sem dependência
  extra) com timeout de 5s via `AbortController`.
- Erros de rede ou resposta não-OK viram `BadGatewayException` (502) — o
  frontend trata isso como "serviço de CEP indisponível, tente novamente".
- Resposta `{ erro: true }` da ViaCEP (quando não há match, ela retorna esse
  objeto em vez de array vazio para buscas por CEP direto — mas para busca
  por endereço ela retorna `[]` quando não há resultado) é tratada como lista
  vazia por segurança, já que a extension não é um array.

### Limitação conhecida (deferida para a Fase 7)

Sem retry ou circuit breaker — uma falha da ViaCEP simplesmente retorna 502
para o usuário tentar de novo. Como isso é usado apenas como conveniência de
preenchimento (o usuário sempre pode digitar o CEP manualmente), o custo de
uma falha isolada é baixo, então não implementamos retry agora. Rate
limiting, retry e circuit breaker genéricos para integrações externas ficam
para quando houver uma segunda integração real (Fase 7 do roadmap).

---

## ADR-005: Cálculo de frete — regras de precificação e estimativa de distância

**Status:** Aceito

### Contexto

A Fase 4 exige gerar `FreightQuoteOption` (preço + prazo) por transportadora
a partir de peso, dimensões, valor da carga e distância entre os CEPs de
origem/destino. Não há orçamento nem integração contratada para geocodificação
real (a ViaCEP, ver ADR-004, não retorna latitude/longitude, apenas endereço e
código IBGE do município).

### Decisão

**Precificação por transportadora** (`Carrier`, novos campos com `@default`
para não quebrar registros existentes): `basePrice`, `pricePerKg`,
`pricePerKm`, `insuranceRate` (percentual sobre `cargoValue`),
`avgSpeedKmPerDay` e `handlingDays` (dias de manuseio antes do transporte
em si). Fórmula (`freight-pricing.util.ts`):

```
pesoCubicoKg = (comprimentoCm * larguraCm * alturaCm) / 6000  // divisor volumétrico padrão rodoviário
pesoTaxavelKg = max(pesoKg, pesoCubicoKg)
preco = basePrice + pricePerKg * pesoTaxavelKg + pricePerKm * distanciaKm + insuranceRate * valorCarga
prazoDias = handlingDays + max(1, ceil(distanciaKm / avgSpeedKmPerDay))
```

**Estimativa de distância a partir do CEP**: como não há geocodificação, a
distância é aproximada por uma matriz fixa de distância (km) entre as 10
macrorregiões postais do Brasil (primeiro dígito do CEP, 0-9), somada a um
ajuste fino proporcional à diferença entre os 5 primeiros dígitos dos CEPs de
origem/destino (até 150 km de variação), para que CEPs diferentes dentro da
mesma região não produzam sempre a mesma distância. Implementado em
`estimateDistanceKm` (`freight-pricing.util.ts`).

**Fluxo em `FreightQuotesService.create`**: a cotação é criada com status
`PROCESSING`, `FreightCalculationService.generateOptions` busca as
transportadoras ativas do tenant (`Carrier.active = true`), cria uma
`FreightQuoteOption` por transportadora e marca a cotação como `DONE`. Se não
houver transportadora ativa, a cotação é marcada `DONE` sem opções (não é
tratado como erro — a ausência de transportadoras cadastradas é uma condição
válida de operação, não uma falha de cálculo). Se o cálculo lançar exceção, a
cotação é marcada `ERROR` e o erro é logado — o endpoint `POST
/freight-quotes` sempre responde 201 com o estado final da cotação, nunca
propaga a falha de cálculo como erro HTTP.

### Rejeitado

Geocodificação real (ex.: Google Maps Distance Matrix, OpenRouteService) foi
adiada por exigir credenciais/custo externo não disponível nesta sessão. A
aproximação por região postal é suficiente para uma precificação plausível e
determinística; se uma integração real for contratada no futuro, basta trocar
a implementação de `estimateDistanceKm` sem alterar o restante do fluxo.

### Limitação conhecida

A Fase 4 processa o cálculo de forma síncrona dentro da requisição HTTP de
criação (`POST /freight-quotes`). A Fase 9 (BullMQ) move esse processamento
para um worker assíncrono — ver ADR-006.

---

## ADR-006: Fila assíncrona para o cálculo de frete (BullMQ + Redis)

**Status:** Aceito

### Contexto

A Fase 9 exige que o cálculo de frete (Fase 4, ADR-005) deixe de bloquear a
requisição HTTP e passe a ser processado em background, usando o Redis já
disponível no docker-compose de dev.

### Decisão

- Fila `freight-quote-calculation` (`@nestjs/bullmq` + `bullmq`, conexão Redis
  via `REDIS_HOST`/`REDIS_PORT`, novas variáveis de ambiente com default
  `localhost:6379`). `BullModule.forRootAsync` registrado uma vez em
  `AppModule` (conexão compartilhada); `BullModule.registerQueue` dentro de
  `FreightQuotesModule`, que também é dono do worker
  (`FreightQuoteCalculationProcessor`) — produtor e consumidor vivem no mesmo
  módulo por serem uma única responsabilidade de domínio.
- `FreightQuotesService.create` agora só cria o `FreightQuote` (status
  `PENDING`, default do schema) e enfileira um job (`calculate-options`) com
  `{ quoteId, tenantId, userId, role }`, retornando imediatamente.
- `FreightQuoteCalculationProcessor.process` roda fora do ciclo de vida HTTP,
  então **reconstrói manualmente o contexto de tenant** (`runWithTenantContext`,
  ver ADR-002) a partir dos campos do job antes de tocar em
  `TENANT_SCOPED_PRISMA` — sem isso, a extension de escopo por tenant não
  filtraria as queries (cai no branch "sem contexto, sem filtro"). Dentro do
  contexto: marca a cotação como `PROCESSING`, busca a cotação por id (agora
  filtrada por `tenantId` automaticamente) e delega a `FreightCalculationService.generateOptions`
  (reaproveitada sem alterações da Fase 4).
- **`attempts: 1` (sem retry automático)**: `generateOptions` não é
  idempotente — ela sempre insere novas `FreightQuoteOption`, então reprocessar
  o mesmo job duplicaria as opções. Falhas viram `ERROR` direto via o listener
  `@OnWorkerEvent("failed")`, que também reconstrói o contexto de tenant a
  partir do payload do job para atualizar o status da cotação certa.

### Rejeitado

Retry com backoff foi rejeitado nesta fase pelo motivo de idempotência acima.
Se retries se tornarem necessários (ex.: falha transitória de conexão com o
banco), a solução correta é tornar `generateOptions` idempotente (upsert por
`quoteId + carrierId`, ou apagar opções existentes antes de recriar) antes de
habilitar `attempts > 1`.

### Limitação conhecida

Sem Bull Board ou dashboard de monitoramento de filas nesta fase (item restante
do roadmap da Fase 9). Sem dead-letter queue explícita — jobs que falham
definitivamente ficam no estado `failed` do Redis (visível via Redis CLI/
Bull Board futuro), mas a cotação já reflete `ERROR` para o usuário via a API.
