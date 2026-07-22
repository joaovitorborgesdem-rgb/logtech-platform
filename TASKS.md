# LogiSense — Roadmap de Implementação

Plataforma SaaS multi-tenant de inteligência logística. Checklist das fases restantes após o scaffold inicial do monorepo (`apps/api` com NestJS, Prisma 7, docker-compose de dev).

Legenda: `[x]` feito · `[ ]` pendente

---

## 0. Scaffold base
- [x] Monorepo pnpm + turbo (`apps/`, `packages/`)
- [x] `apps/api` NestJS inicial (health check, config/env validation, PrismaModule)
- [x] docker-compose dev (MySQL, Redis, Adminer)
- [x] `apps/web` scaffold Next.js

## 1. Autenticação & Autorização
- [x] Modelagem `User`, `Role` no Prisma (`Permission` granular ainda não modelado)
- [x] Estratégia de auth (JWT access + refresh token)
- [x] Endpoints: registro, login, refresh, logout
- [x] Guards de rota (`JwtAuthGuard`, `RolesGuard`)
- [ ] Recuperação/reset de senha (envio de e-mail)
- [x] Hash de senha (bcrypt) e políticas de força (mínimo 8 caracteres)

## 2. Multi-tenancy
- [x] Modelagem `Tenant`/`Organization` no Prisma
- [x] Estratégia de isolamento (schema-per-tenant vs. tenant_id em linha) — decidir e documentar (`docs/DECISIONS.md`, ADR-001)
- [x] Middleware/interceptor de resolução de tenant (subdomínio, header ou token) (`TenantMiddleware` + `TenantContextInterceptor`, ADR-002)
- [x] Escopo automático de queries por tenant (Prisma middleware ou extension) (`tenant-scoped-prisma.provider.ts`, token `TENANT_SCOPED_PRISMA` — usar nos services de domínio da Fase 3)
- [ ] Convite e onboarding de usuários dentro de um tenant
- [ ] Planos/limites por tenant (se aplicável)

## 3. CRUDs de domínio
- [x] Modelagem de entidades principais (Carrier, Client)
- [x] Endpoints REST (CRUD completo) por entidade (Carrier, Client, FreightQuote)
- [x] Validação de DTOs (class-validator)
- [x] Paginação, filtros e ordenação padronizados (`common/dto/pagination-query.dto.ts`)
- [x] Soft delete / auditoria de exclusão (`deletedAt` + `AuditLog` em cada `remove()`, ver ADR-003)

## 4. Módulo de Frete
- [x] Modelagem de fretes/rotas/cotações (FreightQuote, FreightQuoteOption)
- [x] Cálculo de frete (regras de negócio, tabela de preços) — peso cúbico,
      distância estimada por CEP e valor da carga, por transportadora ativa
      (`FreightCalculationService`, ver ADR-005)
- [x] Integração com serviço de CEP/geolocalização — distância estimada a
      partir da macrorregião do CEP (aproximação, sem geocodificação real;
      ver limitação conhecida na ADR-005)
- [ ] Rastreamento de status do frete (workflow/state machine)
- [ ] Histórico de eventos por frete

## 5. Dashboard
- [x] Endpoints de agregação/métricas (KPIs operacionais) — `GET
      /dashboard/metrics` (total de cotações, contagem por status, preço
      médio, transportadoras/clientes ativos, taxa de erro, série de 7 dias;
      ver ADR-008)
- [x] Cache de métricas (Redis) — `RedisService`, TTL de 30s por tenant
- [x] Frontend: layout do dashboard com widgets/gráficos — `/dashboard`

## 6. Insights / Analytics
- [x] Definição das métricas de negócio a serem calculadas — tendência diária
      (cotações, valor de carga, valor cotado, preço médio) e performance por
      transportadora; métricas por cliente adiadas (sem relação
      `FreightQuote`↔`Client` no schema, ver ADR-009)
- [x] Jobs de agregação periódica (cron via BullMQ) — job repetível diário
      (01:00 UTC) em `DailyMetricsSnapshot`, com endpoint de disparo manual
      para backfill (`POST /insights/aggregate`)
- [x] Endpoints de consulta de insights — `GET /insights/trend`,
      `GET /insights/carriers`
- [x] Exportação de relatórios (CSV/PDF) — `GET /insights/export?format=csv|pdf`

## 7. Integrações externas
- [x] Definir integrações necessárias (ex.: correios, transportadoras, ERPs, gateways de pagamento) — ViaCEP (busca de CEP por localidade) implementada na Fase 3, ver ADR-004; consulta de CNPJ (BrasilAPI) adicionada na Fase 7, ver ADR-010
- [x] Camada de adapters/clients isolada por integração (`src/integrations/viacep/`, `src/integrations/cnpj/`, ambas sobre `src/integrations/common/resilient-http-client.ts`)
- [x] Tratamento de rate limit, retry e circuit breaker — `ResilientHttpClient` genérico (retry com backoff exponencial, rate limiter e circuit breaker por integração), ver ADR-010
- [x] Webhooks de entrada (recebimento de eventos externos) — `POST /webhooks/carriers/:tenantSlug`, autenticado por assinatura HMAC (`Tenant.webhookSecret`), ver ADR-010

## 8. Upload de arquivos
- [x] Estratégia de storage (S3-compatible / local em dev) — MinIO via
      docker-compose em dev, `StorageService` sobre `@aws-sdk/client-s3`
      (troca para AWS S3 real só por configuração, ver ADR-011)
- [x] Endpoint de upload com validação de tipo/tamanho — `POST /attachments`
      (whitelist de mimetype, limite de 10MB)
- [x] Geração de URLs assinadas para download — `GET /attachments/:id/download-url`
      (presigned URL, 5 min de expiração, testado ponta a ponta)
- [x] Vínculo de arquivos a entidades de domínio (ex.: comprovantes, NF-e) —
      modelo `Attachment` polimórfico (`entityType` + `entityId`, cobre
      Carrier/Client/FreightQuote)

## 9. Fila assíncrona
- [x] Setup BullMQ + Redis (`@nestjs/bullmq`, `REDIS_HOST`/`REDIS_PORT`, ver ADR-006)
- [x] Definição dos jobs — `freight-quote-calculation` processa o cálculo de
      frete (Fase 4) em background: `PENDING` -> `PROCESSING` -> `DONE`/`ERROR`
      (`FreightQuoteCalculationProcessor`)
- [ ] Dashboard/monitoramento de filas (ex.: Bull Board)
- [ ] Estratégia de retry e dead-letter — decidido não usar retry automático
      nesta fase por falta de idempotência em `generateOptions` (ver
      limitação conhecida na ADR-006)

## 10. Realtime
- [x] Setup WebSocket Gateway (NestJS + Socket.IO) — `RealtimeGateway`,
      namespace `/realtime` (ver ADR-007)
- [x] Autenticação de conexões realtime (por tenant/usuário) — token de
      acesso JWT validado no handshake, socket entra na room `tenant:{tenantId}`
- [x] Eventos de negócio em tempo real — `freight-quote.updated` emitido pelo
      `FreightQuoteCalculationProcessor` quando a simulação sai de
      `PENDING`/`PROCESSING` para `DONE`/`ERROR`
- [x] Frontend: client realtime — `apps/web/src/lib/realtime-socket.ts` e a
      página de simulação de frete atualizam o resultado sem polling (ainda
      não há dashboard nesta fase, ver Fase 5)

## 11. Auditoria
- [x] Modelagem de `AuditLog` (quem, o quê, quando, tenant)
- [x] Interceptor/middleware de captura automática de mutações —
      `MutationAuditInterceptor` (global, `POST`/`PATCH`/`PUT` →
      `HTTP_MUTATION`; `DELETE` continua auditado manualmente com metadata
      mais rica; ver ADR-012)
- [x] Endpoint de consulta de logs de auditoria (admin) — `GET /audit-logs`
      (paginado, filtros por action/userId/data, restrito a OWNER/ADMIN)

## 12. Observabilidade
- [x] Logging estruturado (ex.: pino) com correlação de request ID —
      `nestjs-pino` (`LoggingModule`), `genReqId` reaproveita `X-Request-Id`
      recebido ou gera um novo; devolvido no header de resposta e propagado
      a todo `Logger` do Nest (ver ADR-013)
- [x] Health checks detalhados (DB, Redis, filas) — `GET /health`
      (`@nestjs/terminus`): `database` (`SELECT 1`), `redis` (`ping`),
      `freight-quote-queue` e `insights-queue` (`getJobCounts`)
- [x] Métricas (Prometheus) e tracing (OpenTelemetry) — `GET /metrics`
      (`prom-client`: métricas default do processo + `http_requests_total` /
      `http_request_duration_seconds` via `MetricsMiddleware`); tracing OTel
      (`NodeSDK` + auto-instrumentations) exporta para OTLP se
      `OTEL_EXPORTER_OTLP_ENDPOINT` estiver setada, senão console (dev)
- [x] Alertas básicos de erro/latência — `docker/prometheus/alerts.yml`:
      `ApiDown` (scrape falhando), `HighErrorRate` (>5% 5xx em 5m),
      `HighLatencyP95` (p95 > 1s em 5m)

## 13. Testes
- [ ] Testes unitários (services, use cases)
- [ ] Testes de integração (controllers + Prisma via DB de teste)
- [ ] Testes e2e (fluxos críticos: auth, multi-tenancy, frete)
- [ ] Testes de frontend (componentes + fluxos principais)
- [ ] Cobertura mínima definida em CI

## 14. Landing page
- [ ] Estrutura de marketing (Next.js, rota pública separada da app autenticada)
- [ ] Seções: hero, features, pricing, CTA, footer
- [ ] SEO básico (meta tags, sitemap, OG)
- [ ] Formulário de contato/lead

## 15. Deploy
- [ ] Dockerfiles de produção (api e web)
- [ ] Pipeline CI/CD (lint, test, build, deploy)
- [ ] Configuração de ambientes (staging/produção)
- [ ] Gerenciamento de segredos
- [ ] Migrações Prisma automatizadas no deploy
- [ ] Domínio, TLS e infraestrutura (definir provedor)

---

## Próximo passo imediato
Implementar Fase 1 (autenticação): JWT + refresh token, hash de senha, endpoints e guards.
