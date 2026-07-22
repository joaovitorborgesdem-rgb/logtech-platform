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

---

## ADR-007: Comunicação em tempo real via WebSocket (Socket.IO)

**Status:** Aceito

### Contexto

A Fase 10 exige notificar o frontend quando uma simulação de frete termina de
processar (transição `PENDING`/`PROCESSING` -> `DONE`/`ERROR`, ver ADR-006),
sem depender de polling.

### Decisão

- `RealtimeGateway` (`@nestjs/websockets` + `@nestjs/platform-socket.io`,
  namespace `/realtime`) expõe um único evento de saída,
  `freight-quote.updated`, com o payload completo da cotação (incluindo
  `options` e `carrier`, mesmo formato de `FreightQuotesService.findOne`).
- **Autenticação da conexão**: o handshake do Socket.IO não passa pelos
  guards HTTP nem pelo `TenantContextInterceptor` (ver ADR-002) — o token de
  acesso é enviado pelo cliente via `handshake.auth.token` (ou querystring
  como fallback) e validado manualmente em `handleConnection` com o mesmo
  `JWT_ACCESS_SECRET` usado por `JwtStrategy`. Conexões sem token válido ou
  com token do tipo `refresh` são desconectadas imediatamente.
- **Isolamento por tenant**: no `handleConnection`, o socket entra numa room
  `tenant:{tenantId}` a partir do `tenantId` do próprio token — nunca há
  broadcast global. `RealtimeGateway.emitFreightQuoteUpdated(tenantId, quote)`
  emite apenas para essa room, então o `FreightQuoteCalculationProcessor`
  (que já tem `tenantId` no payload do job, ver ADR-006) consegue notificar
  o tenant certo mesmo rodando fora do ciclo de vida HTTP.
- **CORS do gateway**: configurado separadamente do `app.enableCors()` (que
  não cobre o transporte do Socket.IO), lendo `CORS_ORIGIN` diretamente de
  `process.env` nos options do decorator `@WebSocketGateway` — os options do
  gateway são avaliados na definição da classe, então não dá para injetar
  `ConfigService` ali; é o mesmo valor usado no bootstrap (`main.ts`).
- **Frontend**: `apps/web/src/lib/realtime-socket.ts` cria uma conexão
  `socket.io-client` para `/realtime` autenticada com o `accessToken` atual.
  A página de simulação de frete (`apps/web/src/app/freight-quotes/new`)
  abre a conexão só depois de criar a cotação, escuta
  `freight-quote.updated` filtrando pelo `id` da cotação criada, atualiza o
  estado local (substituindo o polling que não existia) e desconecta o
  socket ao desmontar/trocar de cotação.

### Rejeitado

Reaproveitar o `TenantContextInterceptor` (`APP_INTERCEPTOR` HTTP) para o
gateway foi descartado — ele usa `context.switchToHttp()`, que não existe em
contexto de WebSocket (`context.switchToWs()`). Implementar a validação do
token diretamente no `handleConnection` do gateway foi mais simples do que
criar um guard/interceptor `Ws`-específico para um único evento de saída.

### Limitação conhecida

Sem heartbeat/reconexão customizados além do padrão do Socket.IO, e sem
autenticação renovada quando o access token expira em uma conexão de longa
duração (o socket permanece conectado; uma nova conexão após expiração exigiria
um novo token). Aceitável para o escopo atual (o usuário fica na página de
simulação por poucos segundos, tempo de vida bem menor que
`JWT_ACCESS_EXPIRES_IN`).

---

## ADR-008: Endpoints de métricas do Dashboard e cache em Redis

**Status:** Aceito

### Contexto

A Fase 5 exige endpoints de agregação/KPIs operacionais para o dashboard e
cache de métricas em Redis (já disponível desde a Fase 9, ver ADR-006).

### Decisão

- `GET /dashboard/metrics` (protegido por `JwtAuthGuard`, escopo por tenant
  via `TENANT_SCOPED_PRISMA`) retorna: total de cotações de frete, contagem
  por status (`PENDING`/`PROCESSING`/`DONE`/`ERROR`), preço médio das opções
  de cotações `DONE`, total de transportadoras ativas, total de clientes,
  taxa de erro e uma série dos últimos 7 dias (cotações criadas por dia) —
  `DashboardService.computeMetrics`.
- **Preço médio via `FreightQuoteOption.aggregate`**: como esse modelo não tem
  `tenantId` direto (ver limitação conhecida da ADR-002), o filtro de tenant é
  aplicado manualmente pela relação (`where: { quote: { tenantId, ... } }`),
  usando o `tenantId` do `AsyncLocalStorage` (`getTenantContext()`).
- **Cache**: `RedisService` (`apps/api/src/redis/`, `ioredis`, mesmo
  `REDIS_HOST`/`REDIS_PORT` da fila) guarda o JSON serializado das métricas
  em `dashboard:metrics:{tenantId}` por 30 segundos (`CACHE_TTL_SECONDS`). Sem
  invalidação ativa nas mutações (criar frete, transportadora, etc.) — um TTL
  curto foi escolhido por simplicidade, já que o dashboard tolera uma janela
  pequena de desatualização e evitar invalidação espalhada por vários services
  de domínio reduz acoplamento.
- `RedisModule` é `@Global()` (mesmo padrão do `PrismaModule`), então
  `RedisService` fica disponível para qualquer módulo sem reimportação.

### Rejeitado

Invalidação ativa de cache (ex.: publicar um evento a cada mutação de
`FreightQuote`/`Carrier`/`Client` que limpe a chave do tenant) foi descartada
nesta fase por adicionar acoplamento entre módulos de domínio não relacionados
e o dashboard, para um ganho pequeno (30s de latência de atualização é
aceitável para KPIs operacionais).

### Limitação conhecida

A série de 7 dias é calculada buscando `createdAt` de todas as cotações do
período e agrupando em memória (sem `GROUP BY DATE(...)` via SQL raw), o que
é aceitável no volume de dados esperado para o estágio atual do produto mas
não escala indefinidamente — se o volume de cotações por tenant crescer muito,
migrar para uma agregação SQL nativa (raw query com `DATE_FORMAT`) ou uma
tabela de métricas pré-agregada (ligado à Fase 6, jobs de agregação periódica).

---

## ADR-009: Insights/Analytics — métricas de negócio, agregação periódica e exportação

**Status:** Aceito

### Contexto

A Fase 6 exige definir métricas de negócio (além dos KPIs operacionais do
Dashboard, Fase 5/ADR-008), calculá-las via job periódico em vez de sempre ao
vivo, expor endpoints de consulta e permitir exportar relatórios em CSV/PDF.

### Métricas de negócio definidas

1. **Tendência diária** (`DailyMetricsSnapshot`, por tenant): total de
   cotações, cotações `DONE`/`ERROR`, valor total de carga cotado
   (`cargoValue`), valor total das opções `DONE` geradas e preço médio das
   opções `DONE` — a mesma base de dados do Dashboard, mas numa janela maior
   (até 180 dias) via dado pré-agregado em vez de recomputar em memória (ver
   limitação conhecida na ADR-008).
2. **Performance por transportadora** (`GET /insights/carriers`): volume de
   opções geradas, preço médio e prazo médio estimado por `Carrier`,
   ordenado por volume — indicador de que transportadoras são mais
   cotadas/competitivas.
3. **Client não entra nas métricas desta fase**: `FreightQuote` não tem
   relação com `Client` no schema atual (são entidades independentes) —
   inventar essa relação só para viabilizar "top clientes" seria mudança de
   escopo de produto, então insights por cliente ficam de fora até essa
   relação existir de fato.

### Job de agregação periódica

Fila `insights-daily-aggregation` (mesmo padrão de `@nestjs/bullmq` da
Fase 9/ADR-006). Um job **repetível** (`repeat: { pattern: "0 1 * * *" }`,
diariamente às 01:00 UTC) com `jobId` fixo
(`daily-metrics-aggregation`) é registrado uma vez no `onModuleInit` de
`InsightsService` — o `jobId` fixo evita duplicar o agendamento a cada
restart do processo (BullMQ trata `add` com o mesmo `jobId`+`repeat` como
idempotente).

`InsightsAggregationProcessor` roda fora de qualquer contexto de tenant e
**itera todos os tenants** (`prisma.tenant.findMany`), agregando o dia
anterior (UTC) para cada um e fazendo `upsert` em `DailyMetricsSnapshot`
(chave `tenantId_date`). Por isso usa `PrismaService` cru, não
`TENANT_SCOPED_PRISMA` — não há um único tenant por job (diferente do
`FreightQuoteCalculationProcessor`, ADR-006, que reconstrói contexto de um
único tenant via `runWithTenantContext`). **Tenants sem cotações no dia não
geram linha de snapshot** (evita crescimento de tabela proporcional a
tenant × dia sem dado real).

Endpoint `POST /insights/aggregate` (restrito a `OWNER`/`ADMIN` via
`RolesGuard`) enfileira um job avulso com uma data opcional — permite
reprocessar um dia específico manualmente (backfill) sem esperar o cron.

### Endpoints

- `GET /insights/trend?days=30` (1–180, default 30): combina snapshots
  persistidos (`ontem` para trás) com o dia de **hoje calculado ao vivo**
  (`TENANT_SCOPED_PRISMA`, mesmo racional do Dashboard) — o dia corrente
  nunca está desatualizado, mesmo antes do cron rodar.
- `GET /insights/carriers`: ranking ao vivo (`FreightQuoteOption.groupBy` por
  `carrierId`, filtrado pela relação `quote.tenantId` já que
  `FreightQuoteOption` não tem `tenantId` direto — mesma limitação da
  ADR-002).
- `GET /insights/export?format=csv|pdf`: relatório das cotações de frete do
  tenant (até 500 mais recentes — `EXPORT_ROW_LIMIT` — para não gerar
  arquivos arbitrariamente grandes), com o melhor preço entre as opções
  calculadas. CSV é montado manualmente (sem dependência); PDF usa `pdfkit`
  (texto simples, uma linha por cotação — sem layout de tabela elaborado,
  suficiente para o escopo de um relatório tabular).

### Rejeitado

- Agregação incremental por trigger de mutação (recalcular o snapshot do dia
  a cada `FreightQuote` criado) foi descartada pelas mesmas razões da ADR-008
  (acoplamento entre módulos de domínio) — o job diário mais o cálculo ao
  vivo do dia corrente já cobre a necessidade sem esse acoplamento.
- PDF com layout de tabela (colunas alinhadas, cabeçalho repetido por página)
  foi deixado de fora — o formato "uma linha de texto por cotação" atende ao
  requisito de exportação sem justificar uma dependência de layout mais
  pesada nesta fase.

### Limitação conhecida

`DailyMetricsSnapshot` não é populado retroativamente para tenants
criados/ativos antes desta fase — o histórico anterior à primeira execução
do cron (ou a um backfill manual via `POST /insights/aggregate`) simplesmente
não existe, e `GET /insights/trend` retorna zero para esses dias.

---

## ADR-010: Resiliência de integrações externas, segunda integração (CNPJ) e webhooks de entrada

**Status:** Aceito

### Contexto

A ADR-004 (Fase 3) deixou explicitamente para depois "rate limiting, retry e
circuit breaker genéricos para integrações externas... para quando houver uma
segunda integração real". A Fase 7 traz essa segunda integração e fecha os
itens restantes do roadmap: resiliência genérica e webhooks de entrada.

### Cliente HTTP resiliente (`ResilientHttpClient`)

`apps/api/src/integrations/common/`: um `ResilientHttpClient` genérico,
reutilizado por qualquer integração HTTP externa (hoje: ViaCEP e BrasilAPI/CNPJ):

- **Retry com backoff exponencial** (`baseDelayMs * 2^(tentativa-1)`, 3
  tentativas por padrão) apenas para falhas de rede/timeout e respostas 5xx.
  Respostas 4xx **não são retryable** (a requisição está errada — tentar de
  novo não muda o resultado) e não contam como falha do circuito, já que a
  API respondeu normalmente.
- **Rate limiting** (`RateLimiter`): intervalo mínimo entre chamadas por
  integração (`minIntervalMs`, default 100ms) — simples espaçamento
  sequencial, não um token bucket completo, suficiente para não sobrecarregar
  APIs públicas gratuitas.
- **Circuit breaker** (`CircuitBreaker`): abre após N falhas consecutivas
  (default 5) e passa a rejeitar imediatamente sem tentar a rede
  (`ServiceUnavailableException`) até o cooldown (default 30s), quando entra
  em `HALF_OPEN` e permite uma nova tentativa.
- Estado (breaker/limiter) é mantido **em memória, por nome de integração**,
  num singleton por processo — não é compartilhado entre réplicas da API.
  Aceitável nesta fase (sem múltiplas réplicas em produção ainda); se isso
  mudar, o estado precisaria migrar para Redis (já disponível) para ficar
  consistente entre instâncias.
- **`User-Agent` explícito** (`LogiSense/1.0`) em toda requisição — descoberto
  necessário na prática: a BrasilAPI (atrás de proteção anti-bot) retorna 403
  para o `fetch` padrão do Node (undici) sem um `User-Agent` identificável,
  mas aceita normalmente requisições de `curl` ou com um `User-Agent`
  reconhecível. Boa prática padrão para qualquer cliente HTTP server-side,
  não uma tentativa de evasão.

`ViaCepService` foi refatorado para usar `ResilientHttpClient` em vez de
`fetch` direto (contrato externo inalterado: continua lançando
`BadGatewayException` em falha).

### Segunda integração: consulta de CNPJ (BrasilAPI)

`GET /integrations/cnpj/:cnpj` (protegido por `JwtAuthGuard`, mesmo padrão das
demais integrações) consulta `https://brasilapi.com.br/api/cnpj/v1/{cnpj}`
(API pública, sem chave) e devolve razão social, nome fantasia, endereço,
telefone e situação cadastral — útil para pré-preencher o cadastro de
`Carrier`/`Client` a partir do CNPJ (campo `document` já existente). 404 da
BrasilAPI vira `NotFoundException`; outros 4xx viram `BadGatewayException`;
falhas do circuit breaker propagam como `ServiceUnavailableException` (503).
Não há UI no frontend para isso nesta fase — não existe ainda tela de
cadastro de `Carrier`/`Client` no `apps/web` para acoplar o preenchimento
automático (fora do escopo desta fase).

### Webhooks de entrada

`POST /webhooks/carriers/:tenantSlug` recebe eventos de um sistema externo
(simulação de uma transportadora notificando status de entrega). Não passa
por `JwtAuthGuard` — quem chama não tem sessão de usuário — a autenticação é
por **assinatura HMAC-SHA256** do corpo cru da requisição
(`X-Webhook-Signature`), verificada contra `Tenant.webhookSecret` (novo campo,
gerado via `crypto.randomBytes(32)` no registro do tenant, nulo para tenants
criados antes desta fase). `app.rawBody: true` no bootstrap
(`NestFactory.create(AppModule, { rawBody: true })`) expõe `request.rawBody`
para a verificação de assinatura — HMAC precisa dos bytes exatos recebidos,
não do JSON re-serializado. Evento válido é persistido em `AuditLog`
(`EXTERNAL_WEBHOOK_RECEIVED`) com o payload em `metadata` — sem inventar uma
tabela de rastreamento de frete dedicada (isso pertence ao item ainda aberto
"Rastreamento de status do frete" da Fase 4).

### Rejeitado

- Segredo de webhook único e global via env var foi rejeitado em favor de um
  segredo por tenant (`Tenant.webhookSecret`), consistente com o resto do
  projeto tratando isolamento de tenant como requisito de primeira classe
  (ADR-001/002) — cada tenant deve poder ter seu segredo próprio, revogável
  independentemente.
- Layout de PDF elaborado ou uma tabela real de eventos de rastreamento não
  foram construídos aqui — decisão de manter o escopo da Fase 7 restrito a
  resiliência + uma integração real + um endpoint de webhook.

### Limitação conhecida

Estado do circuit breaker/rate limiter não sobrevive a um restart do
processo nem é compartilhado entre réplicas (ver acima). Tenants criados
antes desta migração têm `webhookSecret = null` e não conseguem receber
webhooks até que um fluxo de rotação/geração de segredo seja adicionado (hoje
só existe geração no registro).

---

## ADR-011: Upload de arquivos — storage S3-compatible, upload validado e URLs assinadas

**Status:** Aceito

### Contexto

A Fase 8 exige uma estratégia de storage de arquivos (comprovantes, NF-e
etc. vinculados a entidades de domínio), com validação de tipo/tamanho no
upload e URLs assinadas para download — sem expor o storage diretamente nem
proxiar o download pela API.

### Decisão

- **Storage S3-compatible em qualquer ambiente**: `StorageService`
  (`apps/api/src/storage/`, `@aws-sdk/client-s3` +
  `@aws-sdk/s3-request-presigner`) fala com qualquer storage compatível com a
  API do S3 via `S3_ENDPOINT`/`S3_REGION`/`S3_BUCKET`/credenciais/
  `S3_FORCE_PATH_STYLE`. Em dev, `docker-compose` sobe um **MinIO** local
  (`logistics_minio`, bucket `logisense-uploads` criado manualmente via `mc`
  — não há automação de bootstrap do bucket ainda, ver limitação conhecida).
  Em produção, trocar para AWS S3 real é só configuração (endpoint da AWS,
  credenciais IAM, `S3_FORCE_PATH_STYLE=false`), sem mudança de código.
- **Modelo `Attachment`** (tenant-scoped, ver ADR-002): vínculo polimórfico
  simples via `entityType` (enum `CARRIER | CLIENT | FREIGHT_QUOTE`) +
  `entityId` — cobre "comprovantes, NF-e" vinculados a qualquer uma dessas
  três entidades sem precisar de uma tabela de junção por entidade.
  `AttachmentsService.create` valida que a entidade referenciada existe (e
  pertence ao tenant atual, via `TENANT_SCOPED_PRISMA`) antes de aceitar o
  upload — um `entityId` de outro tenant ou inexistente é rejeitado com 404.
- **Validação de upload**: whitelist de mimetype (`application/pdf`,
  `image/jpeg`, `image/png` — o suficiente para comprovantes/NF-e) e tamanho
  máximo de 10MB, validados no código (não apenas no `fileFilter` do multer,
  para mensagens de erro consistentes com o resto da API). `FileInterceptor`
  usa memory storage (sem `dest`/`storage` configurado — o padrão do multer
  quando nenhum dos dois é passado), então o arquivo nunca toca o disco local
  da API, só existe em memória entre o upload e o `PutObjectCommand`.
- **Chave de storage** inclui o `tenantId` no path
  (`{tenantId}/{entityType}/{entityId}/{uuid}-{nome-sanitizado}`) — isolamento
  por tenant também no nível do object storage, não só na linha do banco.
- **URLs assinadas para download**: `GET /attachments/:id/download-url`
  retorna uma presigned URL (`GetObjectCommand` + `getSignedUrl`, expiração de
  5 minutos) — o cliente baixa direto do S3/MinIO, a API nunca faz proxy do
  arquivo. Testado ponta a ponta: a URL assinada funciona sem qualquer header
  de autenticação da nossa API (é o próprio storage validando a assinatura).
- **Remoção**: segue o padrão de soft delete + auditoria já usado em
  Carrier/Client/FreightQuote (ADR-003) — a linha de `Attachment` é marcada
  `deletedAt`, um `AuditLog` (`ATTACHMENT_DELETED`) é criado, **e o objeto é
  fisicamente apagado do storage** (diferente do padrão de soft delete do
  banco: manter bytes órfãos no S3 indefinidamente não tem o mesmo valor de
  trilha de auditoria que manter a linha do banco, e tem custo de storage
  real).

### Rejeitado

- Servir o arquivo via proxy da API (`GET /attachments/:id/file` lendo do S3
  e retransmitindo) foi rejeitado — URLs assinadas são o padrão correto para
  isso: menos carga na API, suporta range requests/CDN nativamente no
  storage real, e é exatamente o que "geração de URLs assinadas" pede.
- Fileiras dedicadas por entidade (`CarrierAttachment`, `ClientAttachment`,
  `FreightQuoteAttachment`) foram rejeitadas em favor do modelo polimórfico
  único — menos tabelas, mesma capacidade, e a validação de existência da
  entidade já cobre a integridade que teria vindo de uma FK dedicada.

### Limitação conhecida

Criação do bucket no MinIO é manual (`mc mb`) — não há Terraform/script de
bootstrap nem checagem de existência do bucket na inicialização da API; um
ambiente novo precisa criar o bucket manualmente antes do primeiro upload.
Sem geração de URL assinada para **upload** direto (PUT presignado) — todo
upload passa pela API hoje, o que é aceitável para o tamanho de arquivo
esperado (10MB) mas não escalaria para uploads grandes sem repensar esse
fluxo.

---

## ADR-012: Captura automática de mutações e consulta de auditoria (admin)

**Status:** Aceito

### Contexto

Até a Fase 10, `AuditLog` só era escrito manualmente em pontos específicos
(`CARRIER_DELETED`, `CLIENT_DELETED`, `FREIGHT_QUOTE_DELETED`,
`EXTERNAL_WEBHOOK_RECEIVED`, `ATTACHMENT_DELETED`) — ou seja, **toda
criação e atualização** (`POST`/`PATCH` em Carrier, Client, FreightQuote,
Attachment) não deixava nenhum rastro de auditoria. A Fase 11 pede um
mecanismo automático (não manual) para capturar mutações, e um endpoint de
consulta para admins.

### Captura automática (`MutationAuditInterceptor`)

Interceptor global (`APP_INTERCEPTOR`, `apps/api/src/audit/`) que:

- Age apenas sobre `POST`/`PATCH`/`PUT` — `GET`/`HEAD` nunca são auditados.
- **Ignora deliberadamente `DELETE`**: as remoções já são auditadas
  manualmente pelos services de domínio com metadata mais rica (motivo da
  remoção, entidade específica) — duplicar como `HTTP_MUTATION` genérico só
  acrescentaria ruído. Esse é o único caso em que a captura automática
  convive com auditoria manual em vez de substituí-la.
- **Ignora `/auth` e `/webhooks`**: já têm ações específicas
  (`REGISTER`, `LOGIN_SUCCESS`, `LOGOUT`, `EXTERNAL_WEBHOOK_RECEIVED`).
- Usa uma única ação genérica nova, **`HTTP_MUTATION`**, com o detalhe da
  operação em `metadata` (`method`, `path`, `resource` — primeiro segmento
  do path —, `entityId` — do param de rota `:id` ou do campo `id` da
  resposta). Deliberado: adicionar um novo endpoint/recurso no futuro **não
  exige nenhuma mudança de código nem migração de schema** para ele ficar
  auditado — é exatamente o "automático" que a fase pede. O trade-off é
  perder a riqueza semântica de uma ação dedicada por recurso
  (`CARRIER_CREATED` etc.); se isso for necessário depois, nada impede
  registros manuais adicionais para casos específicos, como já acontece com
  os deletes.
- **Fire-and-forget**: a escrita do `AuditLog` roda depois que a resposta já
  foi resolvida (`tap` + `void this.recordMutation(...)`, com try/catch
  interno que só loga a falha) — uma falha ao gravar auditoria nunca derruba
  nem atrasa a resposta ao usuário. Trade-off aceito: é um log de
  conveniência, não um registro transacional com garantia de escrita.
- Lê `tenantId`/`userId` do mesmo `AsyncLocalStorage` que
  `TenantContextInterceptor` já popula (ADR-002) — sem contexto de tenant
  (rotas públicas), nada é gravado.

### Endpoint de consulta (`GET /audit-logs`)

Restrito a `OWNER`/`ADMIN` (`RolesGuard`, mesmo padrão de `AuthController`).
Paginado (`PaginationQueryDto`) com filtros por `action`, `userId` e
intervalo de datas (`dateFrom`/`dateTo`). Escopo por tenant automático via
`TENANT_SCOPED_PRISMA` (`AuditLog` já era um modelo tenant-scoped desde a
Fase 2) — um admin nunca vê entradas de outro tenant nem entradas de sistema
sem `tenantId` (`null`), que ficam de fora do filtro automático.

### Rejeitado

- Uma `AuditAction` dedicada por recurso e operação (`CARRIER_CREATED`,
  `CARRIER_UPDATED`, `CLIENT_CREATED`, ...) foi rejeitada — exigiria migração
  de schema a cada novo endpoint mutável, o oposto de "captura automática".
- Auditar `DELETE` genericamente também via `HTTP_MUTATION` foi rejeitado
  para não duplicar as entradas específicas já existentes.

### Limitação conhecida

`HTTP_MUTATION` não sabe distinguir semanticamente "criei" de "atualizei" além
do método HTTP na própria `description`/`metadata` — não há um campo
`operation` estruturado. Também não há política de retenção/expurgo de
`AuditLog` (a tabela cresce indefinidamente); fica para quando isso se tornar
um problema real de volume.

## ADR-013: Observabilidade — logging estruturado, health checks, métricas/tracing e alertas

**Status:** Aceito

### Contexto

Até a Fase 11 o único sinal operacional era `console.log`/`Logger` do Nest
sem formato fixo, um `GET /health` raso (sem checar dependências) e nenhuma
métrica ou tracing. A Fase 12 pede quatro coisas: logging estruturado com
correlação de request ID, health checks detalhados, métricas Prometheus +
tracing OpenTelemetry, e alertas básicos.

### Logging estruturado (`LoggingModule`, `nestjs-pino`)

`pino`/`pino-http` via `nestjs-pino` substitui o logger padrão do Nest
(`app.useLogger(app.get(Logger))` em `main.ts`) — qualquer `new Logger(...)`
já existente no código passa a emitir JSON estruturado sem precisar tocar
nesses call sites. `genReqId` reaproveita `X-Request-Id` recebido do
cliente/proxy ou gera um novo (`randomUUID`), devolvido no header de
resposta — permite correlacionar logs de uma mesma requisição entre serviços.
Redação de campos sensíveis (`authorization`, `cookie`, `set-cookie`) via
`redact`. Em dev, `pino-pretty` (single line, colorido); em produção, JSON
puro (`NODE_ENV=production`).

### Health checks detalhados (`GET /health`, `@nestjs/terminus`)

`HealthIndicatorsService` expõe quatro indicadores independentes —
`database` (`SELECT 1` via Prisma), `redis` (`ping`), e as duas filas BullMQ
já existentes desde a Fase 9/10 (`freight-quote-queue`, `insights-queue`,
via `getJobCounts`). Cada indicador captura sua própria exceção e reporta
`down` com a mensagem do erro, em vez de deixar uma dependência fora do ar
derrubar o healthcheck inteiro sem diagnóstico.

### Métricas (`GET /metrics`, `prom-client`) e tracing (OpenTelemetry)

`MetricsRegistry` mantém um único `Registry` por processo: métricas default
do Node (`collectDefaultMetrics` — CPU, memória, event loop lag, GC) mais
`http_requests_total` e `http_request_duration_seconds` (labels `method`,
`route`, `status_code`), populadas por `MetricsMiddleware`.

- **Middleware, não interceptor**: lê `req.route`/`res.statusCode` dentro do
  evento `finish` do response, depois que o Express já terminou de rotear e
  enviar a resposta — garante o status code final real. Um interceptor Nest
  teria o `tap` de erro rodando antes do exception filter global escrever a
  resposta, capturando o status errado em caminhos de erro.
- `GET /metrics` **não tem `JwtAuthGuard`** — é o padrão para scraping do
  Prometheus, que não carrega JWT de usuário. Em produção, o acesso deve ser
  restrito por rede (VPC/firewall), não por autenticação de aplicação.
- Tracing via `@opentelemetry/sdk-node` + `auto-instrumentations-node`
  (`observability/tracing.ts`), importado como a **primeira linha** de
  `main.ts` — precisa rodar antes de qualquer módulo instrumentado (http,
  express, mysql2...) ser carregado. Sem `OTEL_EXPORTER_OTLP_ENDPOINT`
  configurada, os spans só vão para o console (`ConsoleSpanExporter`) — dá
  para confirmar que o tracing está funcionando em dev sem subir um
  collector; em produção, a env var aponta para um collector OTLP real
  (Jaeger, Tempo, Honeycomb, etc.).

### Alertas básicos (`docker/prometheus/`)

Um container Prometheus novo no `docker-compose.yml` (`host.docker.internal`
para alcançar a API rodando fora do Docker) faz scrape de `/metrics` a cada
15s e avalia três regras (`alerts.yml`): `ApiDown` (scrape falhando por mais
de 1 minuto), `HighErrorRate` (>5% de respostas 5xx em 5 minutos) e
`HighLatencyP95` (p95 de latência HTTP acima de 1s em 5 minutos). Não há
Alertmanager configurado — as regras aparecem como firing no Prometheus, mas
não há roteamento para Slack/PagerDuty/e-mail; isso fica para quando houver
um canal real de on-call.

### Rejeitado

- Métricas de negócio customizadas (ex.: cotações de frete calculadas por
  minuto) foram deixadas de fora — a Fase 12 pede a infraestrutura de
  observabilidade, não métricas de domínio específicas; nada impede
  registrar novos `Counter`/`Histogram` no mesmo `MetricsRegistry` depois.
- Interceptor para captura de métricas HTTP foi rejeitado em favor de
  middleware, pelo motivo de status code descrito acima.

### Limitação conhecida

Sem Alertmanager, os alertas do Prometheus não notificam ninguém
ativamente — precisam ser observados manualmente em
`http://localhost:9090/alerts`. Tracing também não tem um collector real
configurado por padrão (só console em dev); falta uma stack tipo Jaeger ou
Tempo para inspecionar spans exportados via OTLP.

## ADR-014: Estratégia de testes — integração/e2e contra banco real, Vitest no frontend, cobertura no CI

**Status:** Aceito

### Contexto

Até a Fase 12, `apps/api` já tinha uma suíte de testes unitários robusta
(160+ specs), mas 100% baseada em mocks de Prisma — nenhum teste exercitava
a stack HTTP completa contra um banco real, e em particular não havia
nenhuma verificação de que `TENANT_SCOPED_PRISMA` (ADR-002/005) realmente
impede um tenant de ver dados de outro fora de testes unitários isolados do
extension em si. `apps/web` não tinha nenhum framework de teste. Não havia
CI. A Fase 13 pede as 5 coisas.

### Banco de teste dedicado (não testcontainers)

`logisense_test_db` foi criado no mesmo container `logistics_mysql` já
usado para dev (`docker/mysql-init/01-create-test-db.sql`, montado em
`docker-entrypoint-initdb.d` para volumes novos; criado manualmente uma vez
no volume já existente). Preferido a testcontainers para não adicionar uma
dependência nova nem pagar o custo de subir um container por run — o
trade-off aceito é que os testes de integração/e2e exigem os containers
Docker já rodando localmente (mesma premissa de `pnpm dev`).

`apps/api/scripts/prepare-test-db.ts` roda antes de `test:integration`/
`test:e2e` (`pnpm exec prisma migrate deploy` — não precisa de shadow
database, diferente de `migrate dev`) e é o único lugar que sabe como
apontar para o banco de teste: `apps/api/test/support/load-test-env.ts`
carrega `.env.test.local` (gitignored via `.env.*.local`, com
`.env.test.example` committed como template) **antes** de qualquer import
do `AppModule` — como `PrismaService` lê `process.env.DATABASE_URL`
diretamente no construtor (Fase 0, não via `ConfigService`), e dotenv não
sobrescreve uma env var já setada, isso garante que o `ConfigModule.forRoot`
(que carrega `.env` de dev) nunca pisa no valor de teste já carregado.

### Redis isolado por `REDIS_DB` (lição aprendida durante a implementação)

Primeira versão dos testes e2e de frete apontava para o mesmo Redis (db 0)
usado pelo `pnpm dev` local. Rodar a suíte várias vezes no mesmo dia deixou
dezenas de jobs BullMQ órfãos acumulados na fila `freight-quote-calculation`
(referenciando `FreightQuote`s que o `resetDatabase()` de um run seguinte já
tinha apagado) — o worker processava esses jobs órfãos primeiro, e o job do
teste atual só era pego depois do timeout de 15s do polling. Corrigido
adicionando `REDIS_DB` (opcional, default `0`) em `env.validation.ts`,
`RedisService` e `BullModule.forRootAsync` (`app.module.ts`); `.env.test.*`
usa `REDIS_DB=1`, isolado do Redis de dev. `prepare-test-db.ts` também dá um
`FLUSHDB` nesse db isolado antes de cada run, para começar sempre limpo.

### `resetDatabase`: `DELETE FROM`, não `TRUNCATE`

`apps/api/test/support/reset-database.ts` limpa todas as tabelas (nomes =
nomes dos models, sem `@@map` no schema) num `beforeEach` de cada spec de
integração/e2e, com `SET FOREIGN_KEY_CHECKS=0` para não precisar respeitar
ordem de dependência — dentro de um `$transaction` de callback único, porque
`SET FOREIGN_KEY_CHECKS` é uma variável de sessão e, sem fixar uma única
conexão do pool do driver adapter para toda a operação, cada
`$executeRawUnsafe` pode cair numa conexão diferente e o flag não vale para
o delete seguinte (erro observado: `Cannot truncate a table referenced in a
foreign key constraint`). A primeira versão usava `TRUNCATE TABLE`, que
neste MySQL local levava ~1.4s por tabela (DDL, commit implícito) — 10
tabelas estourava o timeout da transação interativa. Trocado por
`DELETE FROM` nas mesmas tabelas: ~0.2s no total, sem nenhuma mudança de
comportamento relevante (nenhuma tabela usa auto-increment; os IDs são
`cuid()`).

### Bootstrap de teste precisa de `enableShutdownHooks()`

`apps/api/test/support/test-app.ts` (`createTestApp()`) espelha o
`main.ts`: mesmo `ValidationPipe`, e crucialmente `app.enableShutdownHooks()`
antes de `app.init()` — sem isso, `app.close()` não dispara
`onApplicationShutdown` nos providers, as conexões BullMQ/ioredis ficam
abertas, e o processo do Jest nunca termina sozinho no fim da suíte (só
detectado porque o comando ficou "pendurado" com CPU zero por horas até ser
morto manualmente). `--forceExit` nos scripts `test:integration`/`test:e2e`
é uma rede de segurança adicional, não o fix principal.

### Corte integração vs. e2e

Testes de **integração** (`test/integration/`) cobrem CRUD + validação +
isolamento de tenant por módulo (Carriers, Clients) — um por recurso.
Testes de **e2e** (`test/e2e/`) cobrem jornadas que atravessam mais de uma
requisição/módulo: `auth` (register→login→rota protegida→refresh→logout),
`multi-tenancy` (isolamento através de múltiplos recursos na mesma jornada)
e `freight-quotes` (fila BullMQ + worker reais, sem nenhum mock — o único
teste que não usa `TENANT_SCOPED_PRISMA` só via HTTP síncrono).

### Frontend: Vitest + Testing Library

Seguido o guia oficial do Next 16
(`node_modules/next/dist/docs/01-app/02-guides/testing/vitest.md`):
`vite-tsconfig-paths` em vez de alias manual no `vitest.config.ts`, para
respeitar o `@/*` do `tsconfig.json` sem duplicar configuração.
`@testing-library/react` não faz cleanup automático entre testes no Vitest
sem `test.globals: true` (que não usamos) — `vitest.setup.ts` registra
`afterEach(() => cleanup())` manualmente; sem isso, o segundo teste de um
mesmo arquivo via múltiplos `render()` falha com "multiple elements found"
por acúmulo de DOM entre testes. `apps/web/src/app/login/page.tsx` ganhou
`htmlFor`/`id` nos pares label/input (não existiam) — mudança mínima que
também é uma correção de acessibilidade genuína, feita para permitir
`getByLabelText` nos testes em vez de queries frágeis por placeholder.

### Cobertura mínima no CI

70% (`branches`/`functions`/`lines`/`statements`) só no `apps/api`, via
`coverageThreshold` no bloco `"jest"` do `package.json`, com
`collectCoverageFrom` excluindo `*.module.ts`, `*.dto.ts`, `*.constants.ts`
e `main.ts` — wiring puro que não agrega sinal ao forçar teste. `apps/web`
roda cobertura no CI só para reporte, sem threshold que quebre o build
(decisão explícita do usuário, revisitar quando o time crescer).
`.github/workflows/ci.yml`: um job único com serviços `mysql:8.0` e
`redis:7-alpine`, rodando lint → unit+coverage → integration → e2e →
frontend → build, nessa ordem (falha rápido primeiro).

### Rejeitado

- Testcontainers para o banco de teste — dependência nova + custo de subir
  container por run, sem necessidade dado que o Docker Compose do projeto já
  é uma premissa de ambiente local.
- `TRUNCATE` para reset de banco entre testes — DDL lento neste ambiente;
  `DELETE FROM` dentro de uma transação com FK checks desligados resolve sem
  esse custo.
- Cobertura mínima também no `apps/web` — adiado por decisão do usuário.

### Limitação conhecida

Os testes de integração/e2e exigem os containers Docker locais (ou os
serviços equivalentes no CI) rodando — não há fallback in-memory. O reset
de banco (`resetDatabase`) e o flush de Redis (`REDIS_DB` isolado) cobrem
o essencial, mas não há paralelização real entre arquivos de teste
(`--runInBand`): a suíte de integração/e2e é sequencial por design, o que é
aceitável no tamanho atual mas pode precisar de revisão se o número de specs
crescer muito.
