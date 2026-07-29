# Deploy (Railway)

## ⚠️ Pendências abertas (2026-07-29, pausado para retomar depois)

Duas lacunas confirmadas durante um checklist de verificação pós-deploy
(rate limiting, telas, MFA, OAuth, CEP, insights, leads/clients — todas
essas OK). Nenhuma das duas é regressão de hoje; ambas já existiam antes
desta sessão, só não tinham sido detectadas.

### 1. Upload de anexos QUEBRADO em staging e produção

`POST /attachments` retorna `500` nos dois ambientes — confirmado com uma
tentativa de upload real (tenant descartável + cliente descartável + PDF
pequeno), falha rápida (~700-800ms, consistente com conexão recusada, não
timeout). Nenhum dado órfão ficou para trás: o upload pro S3 acontece
antes de qualquer escrita no banco (`attachments.service.ts`), então a
falha não deixa linha de `Attachment` nem cliente/tenant reais afetados
(os descartáveis usados no teste foram removidos).

**Causa raiz**: nenhum dos dois ambientes tem `S3_*` configurado —
`railway variables --service api --environment production|staging`
não retorna nada pra `S3_*`. Os dois caem no default de dev
(`S3_ENDPOINT=http://localhost:9000`, credenciais do MinIO local), que
não existe dentro do container Railway. Já estava sinalizado como
pendência no checklist mais abaixo ("Decidir e apontar `S3_*` pro storage
real de produção") — nunca foi feito, nem pra produção nem pra staging.
Ver também TASKS.md, Fase 8.

**Decisão do usuário (2026-07-29): usar um MinIO hospedado no Railway**
(via `railway add --image minio/minio:latest`, mesmo padrão já usado pra
`MySQL`/`Redis` nesse projeto — serviço a partir de imagem Docker, não o
marketplace de plugins gerenciados). **Ainda não provisionado** — sessão
pausada nesse ponto a pedido do usuário, antes de eu confirmar como
Railway lida com o comando de start do container MinIO (a imagem oficial
exige argumentos explícitos tipo `server /data --console-address ":9001"`,
e não achei ainda se `railway add --image` permite setar isso
direto ou se precisa de outro passo) e antes de criar o bucket
`logisense-uploads` (o app não cria automaticamente — `storage.service.ts`
assume que já existe, alguém criou manualmente em dev via console/`mc`).

**Retomar por aqui:**
1. Decidir/confirmar o comando de start do container MinIO no Railway.
2. Provisionar MinIO **separado por ambiente** (staging e produção, cada
   um com seu próprio volume — mesmo padrão de "nunca compartilhar banco
   entre ambientes" já usado pra MySQL/Redis).
3. Criar o bucket `logisense-uploads` em cada instância (não é automático).
4. Setar `S3_ENDPOINT`/`S3_ACCESS_KEY_ID`/`S3_SECRET_ACCESS_KEY`/
   `S3_BUCKET`/`S3_FORCE_PATH_STYLE` no serviço `api` de cada ambiente
   (essas são lidas em runtime via `ConfigService`, não build-time como o
   `NEXT_PUBLIC_*` do `web` — não deveria precisar de rebuild, só redeploy
   do `api` pra garantir que pegou, mesma cautela já documentada abaixo
   sobre `railway variables` não recarregar sozinho).
5. Testar upload de verdade (mesmo tenant/cliente descartável, arquivo
   pequeno) nos dois ambientes antes de considerar resolvido.

### 2. Recuperação de senha por e-mail — ainda não implementada

Sem endpoint, sem envio de e-mail. Já rastreado como pendência aberta na
Fase 1 do TASKS.md (nunca chegou a ser implementado, não é uma regressão).
Não investigado a fundo nesta sessão além de confirmar que segue faltando.

## Atualização (2026-07-29) — staging `web` nunca teve `NEXT_PUBLIC_API_URL` configurado

Achado ao verificar o bundle de produção do `web` em staging (comparando
com o de produção, que já tinha o fix a4d46ee corretamente embutido):
`https://web-staging-32c4.up.railway.app` estava servindo JS com a
constante de API base igual a `http://localhost:3000` — o fallback do
código (`process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000"`),
não o valor real. `railway variables --service web --environment staging`
confirmou: `NEXT_PUBLIC_API_URL` e `NEXT_PUBLIC_SITE_URL` **nunca
existiram** nesse serviço/ambiente (produção tinha os dois desde o
deploy inicial, ver checklist mais abaixo). Ou seja, **nenhuma sessão de
navegador real contra o `web` de staging jamais conseguiu falar com o
`api` de staging** — toda chamada `fetch`/`XHR` ia para `localhost:3000`
do próprio cliente, que não existe fora de um ambiente de dev local.
Passou despercebido porque toda verificação anterior em staging neste
histórico usava `curl` direto pro `api`, nunca pelo `web` de fato.

Corrigido: `NEXT_PUBLIC_API_URL=https://api-staging-af8b.up.railway.app`
e `NEXT_PUBLIC_SITE_URL=https://web-staging-32c4.up.railway.app`
setados via `railway variables --set ... --service web --environment
staging --skip-deploys`, seguido de `railway service redeploy --service
web --environment staging --yes` — **obrigatório**, já que essas
variáveis são embutidas em build-time (`ARG` do Dockerfile), não lidas
em runtime; só setar a variável não muda o bundle já buildado (mesma
pegadinha já documentada no checklist "Env vars do serviço `web`" mais
abaixo, dessa vez pego na prática). Verificado após o redeploy: bundle
novo contém `api-staging-af8b.up.railway.app`, não mais `localhost`.

## Atualização (2026-07-28, fechamento) — rate limiting no login + furo no gate de produção

### ✅ Proteção contra brute-force no login, validada ao vivo em staging e produção

- Implementado em `AuthService.login()` (commit `e73a329`): contadores no
  Redis por IP (`auth:login-fail:ip:<ip>`) e por tenant+e-mail
  (`auth:login-fail:email:<tenantSlug>:<email>`), 5 tentativas falhas
  permitidas, bloqueio `429` por 15 minutos (`LOGIN_LOCKOUT_SECONDS = 900`)
  em qualquer uma das duas dimensões — checado antes de qualquer query no
  banco. Contadores são limpos no login bem-sucedido.
- `main.ts` agora chama `app.set("trust proxy", 1)` (via
  `NestFactory.create<NestExpressApplication>`) — sem isso `req.ip` sempre
  resolveria pro IP do proxy do Railway, não do cliente real, inutilizando
  o rate limit por IP em staging/produção.
- Validado ao vivo nos dois ambientes com tenant descartável (criado e
  removido depois): 5 tentativas erradas retornam `401`, a 6ª em diante
  retorna `429` — inclusive a senha *correta* é rejeitada enquanto
  bloqueado (sem brecha pra driblar o limite). Não testado por brute-force
  contra a conta real de produção, pra não arriscar bloquear a conta usada
  na demonstração — a cobertura em produção foi confirmada pelo mesmo
  build já validado em staging, mais um smoke test completo do fluxo de
  login (registro → login → `/auth/me` → refresh) com conta descartável.
- Fora de escopo deliberadamente: `/auth/mfa/verify` e `/auth/register`
  ainda não têm rate limit.

### ⚠️ Gate de aprovação manual da produção tinha um furo: `can_admins_bypass`

- O Environment `production` do GitHub sempre teve `required_reviewers`
  configurado, mas também tinha `can_admins_bypass: true` — como o dono do
  repo é ao mesmo tempo admin e o reviewer configurado, todo push feito por
  ele pulava a aprovação automaticamente. Ficou evidente quando o push do
  commit `e73a329` disparou `deploy-production` e foi direto pro ar em
  produção sem pausar, mesmo com o gate "configurado" (o comentário em
  `ci.yml` que descreve o gate estava desatualizado com a realidade).
- Corrigido: `can_admins_bypass` setado pra `false` via `gh api -X PUT
  repos/.../environments/production` — precisa mandar o payload completo
  (`reviewers`, `prevent_self_review`, `deployment_branch_policy`) numa
  única PUT, já que a API substitui a config inteira do Environment; e
  `deployment_branch_policy: null` tem que ser `null` de JSON de verdade
  (via `--input`), não a string `"null"`. A partir de agora
  `deploy-production` pausa mesmo pra aprovação manual em todo push na
  `main`, inclusive os do dono do repo.
- Havia duas execuções de `deploy-production` presas em `waiting` há dias,
  de commits bem antigos (`1a1c9d5`, 11 commits atrás; `a0b4c62`, 20
  commits atrás). Canceladas em vez de aprovadas — aprovar teria feito
  deploy de código velho por cima do que já está no ar, revertendo várias
  correções já em produção.

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

## Limitação conhecida (RESOLVIDA em 2026-07-29): busca de CEP por endereço podia falhar em produção

**Atualização 2026-07-29**: confirmado normalizado — `GET
/integrations/viacep/search` respondeu `200` de forma consistente em
produção em 5 verificações seguidas (com resultados reais do ViaCEP),
igual a `staging`. Bate com a expectativa registrada abaixo de que
blocks de IP compartilhado costumam ser temporários; não foi feita
nenhuma mudança de código ou infraestrutura para isso — só normalizou
sozinho. Descrição original do problema mantida abaixo para referência,
caso volte a acontecer.

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
