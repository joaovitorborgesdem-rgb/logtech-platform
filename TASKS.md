# LogiSense — Roadmap de Implementação

Plataforma SaaS multi-tenant de inteligência logística. Checklist das fases restantes após o scaffold inicial do monorepo (`apps/api` com NestJS, Prisma 7, docker-compose de dev).

Legenda: `[x]` feito · `[ ]` pendente

---

## 0. Scaffold base
- [x] Monorepo pnpm + turbo (`apps/`, `packages/`)
- [x] `apps/api` NestJS inicial (health check, config/env validation, PrismaModule)
- [x] docker-compose dev (MySQL, Redis, Adminer)
- [ ] `apps/web` scaffold Next.js

## 1. Autenticação & Autorização
- [ ] Modelagem `User`, `Role`, `Permission` no Prisma
- [ ] Estratégia de auth (JWT access + refresh token)
- [ ] Endpoints: registro, login, refresh, logout
- [ ] Guards de rota (`JwtAuthGuard`, `RolesGuard`)
- [ ] Recuperação/reset de senha (envio de e-mail)
- [ ] Hash de senha (bcrypt/argon2) e políticas de força

## 2. Multi-tenancy
- [ ] Modelagem `Tenant`/`Organization` no Prisma
- [ ] Estratégia de isolamento (schema-per-tenant vs. tenant_id em linha) — decidir e documentar
- [ ] Middleware/interceptor de resolução de tenant (subdomínio, header ou token)
- [ ] Escopo automático de queries por tenant (Prisma middleware ou extension)
- [ ] Convite e onboarding de usuários dentro de um tenant
- [ ] Planos/limites por tenant (se aplicável)

## 3. CRUDs de domínio
- [ ] Modelagem de entidades principais (ex.: transportadoras, veículos, motoristas, clientes, pedidos/cargas)
- [ ] Endpoints REST (CRUD completo) por entidade
- [ ] Validação de DTOs (class-validator)
- [ ] Paginação, filtros e ordenação padronizados
- [ ] Soft delete / auditoria de exclusão

## 4. Módulo de Frete
- [ ] Modelagem de fretes/rotas/cotações
- [ ] Cálculo de frete (regras de negócio, tabela de preços)
- [ ] Integração com serviço de CEP/geolocalização
- [ ] Rastreamento de status do frete (workflow/state machine)
- [ ] Histórico de eventos por frete

## 5. Dashboard
- [ ] Endpoints de agregação/métricas (KPIs operacionais)
- [ ] Cache de métricas (Redis)
- [ ] Frontend: layout do dashboard com widgets/gráficos

## 6. Insights / Analytics
- [ ] Definição das métricas de negócio a serem calculadas
- [ ] Jobs de agregação periódica (ex.: cron via BullMQ)
- [ ] Endpoints de consulta de insights
- [ ] Exportação de relatórios (CSV/PDF)

## 7. Integrações externas
- [ ] Definir integrações necessárias (ex.: correios, transportadoras, ERPs, gateways de pagamento)
- [ ] Camada de adapters/clients isolada por integração
- [ ] Tratamento de rate limit, retry e circuit breaker
- [ ] Webhooks de entrada (recebimento de eventos externos)

## 8. Upload de arquivos
- [ ] Estratégia de storage (S3-compatible / local em dev)
- [ ] Endpoint de upload com validação de tipo/tamanho
- [ ] Geração de URLs assinadas para download
- [ ] Vínculo de arquivos a entidades de domínio (ex.: comprovantes, NF-e)

## 9. Fila assíncrona
- [ ] Setup BullMQ + Redis
- [ ] Definição dos jobs (ex.: envio de e-mail, cálculo de insights, notificações)
- [ ] Dashboard/monitoramento de filas (ex.: Bull Board)
- [ ] Estratégia de retry e dead-letter

## 10. Realtime
- [ ] Setup WebSocket Gateway (NestJS + Socket.IO)
- [ ] Autenticação de conexões realtime (por tenant/usuário)
- [ ] Eventos de negócio em tempo real (ex.: status de frete, notificações)
- [ ] Frontend: client realtime integrado ao dashboard

## 11. Auditoria
- [ ] Modelagem de `AuditLog` (quem, o quê, quando, tenant)
- [ ] Interceptor/middleware de captura automática de mutações
- [ ] Endpoint de consulta de logs de auditoria (admin)

## 12. Observabilidade
- [ ] Logging estruturado (ex.: pino) com correlação de request ID
- [ ] Health checks detalhados (DB, Redis, filas)
- [ ] Métricas (Prometheus) e tracing (OpenTelemetry)
- [ ] Alertas básicos de erro/latência

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
Scaffold do frontend Next.js em `apps/web`.
