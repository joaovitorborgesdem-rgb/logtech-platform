# Deploy (Railway)

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
