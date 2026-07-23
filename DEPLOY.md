# Deploy (Railway)

## Status atual (2026-07-23)

### ✅ Feito

- Dockerfiles de produção (`apps/api/Dockerfile`, `apps/web/Dockerfile`),
  `docker-entrypoint.sh`, `railway.json` de cada app — mergeados em `main`
  (commit `2690f84`).
- Pipeline CI/CD (`.github/workflows/ci.yml`): `build-and-test` →
  `deploy-staging` → `deploy-production`.
- GitHub Environments `staging` e `production` criados; `production` com
  required reviewer configurado (gate manual).
- `RAILWAY_TOKEN` configurado nos dois Environments — **Project Token**
  (gerado dentro do projeto Railway, escopado a cada ambiente), não Account
  Token. Um token diferente por ambiente.
- Projeto Railway criado, com os serviços `api` e `web` conectados ao
  repositório GitHub, Root Directory `/` e Config-as-code apontando pros
  `railway.json` corretos.
- `deploy-staging` **passou** no CI (run `29968311203`).
- `deploy-production` dispara e fica `waiting`, pendente da aprovação
  manual do required reviewer — comportamento esperado, não é falha.

### ⏳ Pendente (direto no painel do Railway)

Sem isso, o container até pode subir mas vai falhar no boot ou funcionar
com dados/URLs errados — **não aprove o `deploy-production` pendente antes
de terminar esta lista para o ambiente `production`**:

1. **Plugins MySQL e Redis** — provisionar um de cada por ambiente
   (`staging` e `production`), nunca compartilhados entre si nem com dev
   local.
2. **Env vars do serviço `api`**, por ambiente (Settings > Variables):
   - Obrigatórias (sem elas o boot quebra na validação de config,
     `apps/api/src/config/env.validation.ts`): `DATABASE_URL`,
     `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`.
   - `DATABASE_URL` pode referenciar a variável do plugin MySQL do próprio
     ambiente (`${{MySQL.DATABASE_URL}}`) em vez de um valor fixo.
   - Têm default de **dev** que não serve pra produção (apontam pro Redis
     e MinIO locais) — sobrescrever: `REDIS_HOST`/`REDIS_PORT`/`REDIS_DB`
     (referenciar plugin Redis do ambiente), `S3_ENDPOINT`, `S3_REGION`,
     `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`,
     `S3_FORCE_PATH_STYLE`, `CORS_ORIGIN`.
   - Opcionais, default razoável: `JWT_ACCESS_EXPIRES_IN`,
     `JWT_REFRESH_EXPIRES_IN`, `PORT`, `OTEL_EXPORTER_OTLP_ENDPOINT`,
     `OTEL_SERVICE_NAME`.
   - Decidir e apontar `S3_*` pro storage real de produção (AWS S3 ou outro
     S3-compatible) — o default é o MinIO de dev, que não existe em prod.
3. **Env vars do serviço `web`**, por ambiente: `NEXT_PUBLIC_API_URL`,
   `NEXT_PUBLIC_SITE_URL` (apontando pro domínio real de cada ambiente).
4. **Checar deploy duplicado**: os serviços foram conectados direto ao
   repo GitHub no Railway — confirmar se isso não liga também o
   auto-deploy nativo do Railway por push (Settings > Source do serviço).
   Se estiver ligado, o Railway pode tentar buildar/deployar em paralelo
   ao `railway up` disparado pelo `ci.yml`, duplicando o trabalho. Se não
   for intencional, desligar o auto-deploy do Railway e deixar só o CI
   como fonte de deploy.
5. Só depois de 1–4 prontos para `production`: aprovar o job
   `deploy-production` pendente no GitHub (Environment `production`).
6. (Opcional, sem bloquear o resto) Domínio próprio — ver seção "Domínio e
   TLS" abaixo.

---

Dois serviços Railway no mesmo projeto, cada um construído a partir do seu
Dockerfile com **Root Directory = `/` (raiz do monorepo)** — o build precisa
do workspace pnpm inteiro para resolver as dependências internas. Configure
em cada serviço, na aba Settings:

| Serviço | Config Path              | Root Directory |
|---------|---------------------------|-----------------|
| api     | `apps/api/railway.json`   | `/`             |
| web     | `apps/web/railway.json`   | `/`             |

Os `railway.json` de cada app já apontam para o Dockerfile correto
(`build.dockerfilePath`) e definem healthcheck (`GET /health` na api,
`GET /` na web) e política de restart.

## Ambientes

Use o recurso nativo de **Environments** do Railway: `staging` e
`production`, dentro do mesmo projeto. Cada ambiente tem suas próprias
instâncias de MySQL e Redis (plugins Railway) e suas próprias env vars —
nada de banco de staging compartilhado com produção.

O pipeline (`.github/workflows/ci.yml`) reflete isso: depois que
`build-and-test` passa, `deploy-staging` publica automaticamente em push na
`main`; `deploy-production` roda em seguida mas fica **pendente de aprovação
manual** (GitHub Environment `production` com required reviewers — configurar
em Settings > Environments do repo). Esse é o gate staging -> produção.

## Segredos

- Nunca commitados. `.env`, `.env.local`, `.env.*.local` estão no
  `.gitignore` (raiz e `apps/web/.gitignore`); só `.env.example` fica
  versionado como referência de quais variáveis existem.
- Runtime (api): configurar como env vars do serviço Railway, por ambiente —
  ver `apps/api/.env.example` para a lista (`DATABASE_URL`,
  `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `REDIS_HOST`/`REDIS_PORT`,
  `S3_*`, `CORS_ORIGIN`, etc.). `DATABASE_URL` e `REDIS_HOST`/`REDIS_PORT`
  podem referenciar as variáveis dos plugins MySQL/Redis do próprio ambiente
  Railway (`${{MySQL.DATABASE_URL}}` etc.) em vez de valores fixos.
- Build-time (web): `NEXT_PUBLIC_API_URL` e `NEXT_PUBLIC_SITE_URL` são
  embutidos no bundle client durante `next build` — precisam existir tanto
  como env var do serviço quanto chegar como `ARG` no build (o Dockerfile já
  declara os `ARG`; o Railway injeta as env vars do serviço automaticamente
  como build args em builds via Dockerfile). Os `ARG` têm default de
  `localhost` só para o build nunca quebrar por falta de valor — configurar
  as env vars reais no serviço `web` no Railway é obrigatório, senão o
  deploy sobe servindo link de `localhost` no sitemap/OG/chamadas à api.
- CI/CD: `RAILWAY_TOKEN` é um secret por GitHub Environment (`staging` e
  `production`), cada um um Project Token do Railway *escopado ao ambiente
  correspondente* — nunca o mesmo token nos dois, senão o gate de aprovação
  manual da produção perde o sentido.

## Migrações

`apps/api/docker-entrypoint.sh` roda `prisma migrate deploy` a cada boot do
container, antes do `node dist/main`. É idempotente — não faz nada se já
estiver tudo aplicado — então não precisa de step manual nem de job
separado no pipeline.

## Domínio e TLS

Railway provisiona subdomínio `*.up.railway.app` com TLS automático para
cada serviço. Para domínio próprio: aba Settings > Networking > Custom
Domain em cada serviço, apontando um `CNAME` para o domínio gerado; Railway
emite e renova o certificado TLS automaticamente (Let's Encrypt). Configurar
`CORS_ORIGIN` (api) e `NEXT_PUBLIC_API_URL`/`NEXT_PUBLIC_SITE_URL` (web) com
os domínios finais depois de cadastrados.
