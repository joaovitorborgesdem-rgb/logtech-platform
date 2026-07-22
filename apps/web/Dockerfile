# Build de produção do @logisense/web — roda a partir da RAIZ do monorepo:
#   docker build -f apps/web/Dockerfile -t logisense-web .
# (contexto = raiz, mesmo motivo do apps/api/Dockerfile: precisa do workspace
# pnpm inteiro pra resolver as dependências internas).

FROM node:20-alpine AS base
RUN corepack enable
WORKDIR /app

FROM base AS build
COPY . .
RUN pnpm install --frozen-lockfile
# NEXT_PUBLIC_* são embutidos no bundle client em build time — precisam
# chegar como build args (Railway injeta as env vars do serviço também como
# build args para builds via Dockerfile). Precisam de um default não-vazio:
# sem --build-arg, ARG vira "" (não unset), e "" quebra o `new URL(...)` de
# layout.tsx — o fallback `?? ".../localhost..."` do código só pega
# `undefined`, não string vazia.
ARG NEXT_PUBLIC_API_URL=http://localhost:3000
ARG NEXT_PUBLIC_SITE_URL=http://localhost:3001
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL
RUN pnpm --filter @logisense/web build

FROM base AS runtime
ENV NODE_ENV=production
WORKDIR /app

RUN addgroup -S app && adduser -S app -G app

# `output: standalone` (ver next.config.ts) traça só os arquivos necessários;
# em monorepo pnpm o server.js sai em apps/web dentro da pasta standalone.
# --chown na COPY em vez de `chown -R` depois — ver ADR-017.
COPY --from=build --chown=app:app /app/apps/web/.next/standalone ./
COPY --from=build --chown=app:app /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=app:app /app/apps/web/public ./apps/web/public

USER app

EXPOSE 3000
CMD ["node", "apps/web/server.js"]
