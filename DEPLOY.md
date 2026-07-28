# Deploy (Railway)

## Status atual (2026-07-28)

### ✅ Ambos os ambientes saudáveis, gate de produção corrigido

- Corrigido `apps/api/Dockerfile` (commit `8a8ebe0`): `pnpm deploy --prod`
  podava o `.prisma/client` gerado no `pnpm install` da raiz; o build agora
  copia `prisma/`+`prisma.config.ts` pra dentro de `/app/out` e roda
  `prisma generate` lá, preso à árvore de `node_modules` que o runtime
  realmente usa. Sem isso, `api` quebrava no boot em produção **e** staging
  com `Cannot find module '.prisma/client/default'`.
- Corrigido `apps/api/src/app.module.ts` (commit `7089d99`): a conexão
  Redis do `BullModule.forRootAsync` não passava `REDIS_PASSWORD` (só
  `RedisService` passava) — quebrava com `NOAUTH Authentication required`
  assim que o Redis do ambiente exige senha (todo plugin Redis do Railway
  exige).
- Plugin Redis provisionado em `staging` (faltava — só `production` tinha).
  Nome do serviço saiu com sufixo aleatório (`Redis-KPAS`, não `Redis`
  como em produção), então as env vars do `api` em staging referenciam
  `${{Redis-KPAS.REDISHOST}}` / `${{Redis-KPAS.REDISPORT}}` /
  `${{Redis-KPAS.REDISPASSWORD}}` — **não** copiar o padrão `${{Redis.*}}`
  de produção sem checar o nome real do plugin nesse ambiente antes.
- **Confirmado o risco já documentado abaixo**: produção fez auto-deploy
  do commit `7089d99` via conexão nativa do Railway ao repo GitHub, direto
  no push — sem passar pelo gate de aprovação manual do GitHub Environment
  (o job `deploy-production` correspondente ficou parado em `waiting`
  mesmo com o deploy já no ar). Corrigido: `api` e `web` de **produção**
  foram desconectados do source GitHub (`railway service source
  disconnect`), deixando o `railway up` do CI como único caminho de deploy
  pra produção. `staging` continua conectado ao GitHub (não tem gate, não
  há problema em deployar automaticamente lá).
- `GET /health` verde nos dois ambientes: `api-staging-af8b.up.railway.app`
  e `api-production-4091.up.railway.app`, com `database`, `redis` e as
  duas filas BullMQ (`freight-quote-queue`, `insights-queue`) todos `up`.

## Limitação conhecida: busca de CEP por endereço pode falhar em produção

`GET /integrations/viacep/search` (busca por UF/cidade/logradouro, usada
na tela de simulação de frete) pode retornar `502` intermitentemente **só
em produção** — confirmado em 2026-07-28: o mesmo código funciona normal
em `staging`, o `viacep.com.br` está no ar (responde `200` direto), e
outra integração externa no mesmo container (`GET /integrations/cnpj/:cnpj`,
via BrasilAPI) funciona normal em produção. Ou seja, não é bug de código
nem indisponibilidade geral — é o `viacep.com.br` bloqueando ou limitando
especificamente o IP de saída de produção do Railway, que é compartilhado
entre clientes (tráfego de outro projeto no mesmo pool de IPs pode
"contaminar" a reputação do IP pra todo mundo que sai por ele).

- O circuit breaker (`ResilientHttpClient`, ver ADR-010) já evita
  sobrecarregar o `viacep.com.br` quando isso acontece — abre depois de 5
  falhas consecutivas e só tenta de novo depois de 30s.
- **Não afeta**: o resto do sistema, a busca de CEP direto por código
  (CEP → endereço, que é uma chamada diferente), nem `staging`.
- Comportamento esperado até normalizar sozinho (blocks de IP
  compartilhado costumam ser temporários) — decisão registrada em
  2026-07-28: aguardar em vez de mudar código. Não existe fallback
  simples: a BrasilAPI foi avaliada e só cobre CEP→endereço, não o sentido
  contrário (endereço→CEP) que essa funcionalidade usa.
- Se persistir por muito tempo, as opções são: procurar outro provedor
  público que suporte busca por endereço (sem garantia de não sofrer o
  mesmo bloqueio de IP), ou contratar IP de saída dedicado no Railway
  (decisão de conta/billing, fora do que dá pra resolver via código).

## Status atual (2026-07-26)

### ✅ Validado — pipeline completo funcionando fim a fim

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
  repositório GitHub em **ambos** os ambientes (`staging` e `production`),
  Root Directory `/` e Config-as-code apontando pros `railway.json`
  corretos.
- Plugins MySQL e Redis provisionados por ambiente, env vars de `api`/`web`
  configuradas (ver checklist na seção seguinte).
- `deploy-staging` **passou** no CI (run `29968311203`).
- `deploy-production` **passou** no CI (run `30213980045`, aprovado
  manualmente) — `api` e `web` no ar, healthcheck (`GET /health`) verde.

### ⚠️ Lição aprendida: Project Token é escopado ao Environment ID, não ao nome

Um Project Token do Railway fica preso ao **Environment ID** do momento em
que foi gerado, não ao nome do ambiente. Isso mordeu duas vezes nesse
deploy:

- Apagar o **projeto** inteiro e recriar invalida todos os tokens gerados
  nele (óbvio, mas gerou o primeiro `Failed to upload code with status
  code 404 Not Found`).
- Apagar só o **ambiente** `production` (pra recriar do zero, duplicando de
  `staging`) também invalida o token — mesmo o ambiente novo se chamando
  `production` de novo, ele tem um Environment ID diferente. O sintoma aí
  foi mais claro (`Invalid RAILWAY_TOKEN`) do que o 404 do caso anterior.

**Regra prática:** sempre que um projeto ou ambiente Railway for apagado e
recriado (mesmo com o mesmo nome), gerar um Project Token novo pro
ambiente novo e atualizar o secret `RAILWAY_TOKEN` correspondente no GitHub
Environment — nunca assumir que o token antigo continua valendo.

### Checklist de configuração por ambiente (staging e production)

Sem isso, o container até pode subir mas vai falhar no boot, no
healthcheck, ou funcionar com dados/URLs errados:

1. **Plugins MySQL e Redis** — um de cada por ambiente, nunca compartilhados
   entre si nem com dev local.
2. **Env vars do serviço `api`**, por ambiente (Settings > Variables):
   - Obrigatórias (sem elas o boot quebra na validação de config,
     `apps/api/src/config/env.validation.ts`): `DATABASE_URL`,
     `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`.
   - `DATABASE_URL` pode referenciar a variável do plugin MySQL do próprio
     ambiente (`${{MySQL.MYSQL_URL}}`) em vez de um valor fixo.
   - Têm default de **dev** que não serve pra produção (apontam pro Redis
     e MinIO locais) — sobrescrever: `REDIS_HOST` (`${{Redis.REDISHOST}}`),
     `REDIS_PORT` (`${{Redis.REDISPORT}}`), `REDIS_PASSWORD`
     (`${{Redis.REDISPASSWORD}}` — obrigatório, o plugin Redis do Railway
     sempre exige senha), `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`,
     `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_FORCE_PATH_STYLE`,
     `CORS_ORIGIN`.
   - Opcionais, default razoável: `JWT_ACCESS_EXPIRES_IN`,
     `JWT_REFRESH_EXPIRES_IN`, `PORT`, `OTEL_EXPORTER_OTLP_ENDPOINT`,
     `OTEL_SERVICE_NAME`.
   - Decidir e apontar `S3_*` pro storage real de produção (AWS S3 ou outro
     S3-compatible) — o default é o MinIO de dev, que não existe em prod.
   - Login social e MFA (Fase 1, ver ADR-020): `GOOGLE_CLIENT_ID`,
     `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL`, `GITHUB_CLIENT_ID`,
     `GITHUB_CLIENT_SECRET`, `GITHUB_CALLBACK_URL` têm default
     `"not-configured"` (o boot não quebra sem eles, mas `/auth/google` e
     `/auth/github` falham na troca com o provedor) — sobrescrever com as
     credenciais reais de cada ambiente antes de expor os botões de login
     social no `web`. `WEB_URL` (base do frontend, usado no redirect final
     do OAuth) e `MFA_ISSUER` (nome exibido no app autenticador) também têm
     default de dev — sobrescrever `WEB_URL` pro domínio real do `web` em
     cada ambiente.
3. **Env vars do serviço `web`**, por ambiente: `NEXT_PUBLIC_API_URL`,
   `NEXT_PUBLIC_SITE_URL` (apontando pro domínio real de cada ambiente).
4. **Checar deploy duplicado**: os serviços foram conectados direto ao
   repo GitHub no Railway — confirmar se isso não liga também o
   auto-deploy nativo do Railway por push (Settings > Source do serviço).
   Se estiver ligado, o Railway pode tentar buildar/deployar em paralelo
   ao `railway up` disparado pelo `ci.yml`, duplicando o trabalho. Se não
   for intencional, desligar o auto-deploy do Railway e deixar só o CI
   como fonte de deploy.
5. (Opcional, sem bloquear o resto) Domínio próprio — ver seção "Domínio e
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
  `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `REDIS_HOST`/`REDIS_PORT`/
  `REDIS_PASSWORD`, `S3_*`, `CORS_ORIGIN`, etc.). `DATABASE_URL` e
  `REDIS_HOST`/`REDIS_PORT`/`REDIS_PASSWORD` podem referenciar as variáveis
  dos plugins MySQL/Redis do próprio ambiente Railway (`${{MySQL.MYSQL_URL}}`,
  `${{Redis.REDISHOST}}`, `${{Redis.REDISPORT}}`, `${{Redis.REDISPASSWORD}}`)
  em vez de valores fixos.
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
