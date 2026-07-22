# Build de produção do @logisense/api — roda a partir da RAIZ do monorepo:
#   docker build -f apps/api/Dockerfile -t logisense-api .
# (contexto = raiz, porque o build precisa do workspace pnpm inteiro pra
# resolver as dependências internas).

FROM node:20-alpine AS base
RUN corepack enable
WORKDIR /app

FROM base AS build
COPY . .
# `prisma generate` (postinstall) carrega prisma.config.ts, que resolve
# DATABASE_URL via env() na hora — mesmo sem conectar de verdade, falha se
# a var não existir (ver ADR-019). Valor nunca é usado pra conectar aqui;
# a URL real chega em runtime via docker-entrypoint.sh.
ENV DATABASE_URL="mysql://build:build@localhost:3306/build"
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @logisense/api build
# `pnpm deploy` é o jeito nativo do pnpm de extrair um workspace de um
# monorepo pra uma pasta autocontida (node_modules podado, sem symlinks
# soltos pro resto do repo) — ver ADR-016.
RUN pnpm --filter @logisense/api deploy --prod /app/out

FROM base AS runtime
ENV NODE_ENV=production
WORKDIR /app

RUN addgroup -S app && adduser -S app -G app

# --chown na COPY em vez de um `chown -R /app` depois: evita um segundo
# passeio recursivo por node_modules inteiro (caro e, neste ambiente de
# build, chegou a levar horas — ver ADR-017).
COPY --from=build --chown=app:app /app/apps/api/dist ./dist
COPY --from=build --chown=app:app /app/out/node_modules ./node_modules
COPY --from=build --chown=app:app /app/apps/api/prisma ./prisma
# prisma.config.ts (não o schema) é onde o datasource.url é resolvido a
# partir de DATABASE_URL (Prisma 7, ver ADR-016) — sem ele no runtime,
# `prisma migrate deploy` no docker-entrypoint.sh não sabe a URL do banco.
COPY --from=build --chown=app:app /app/apps/api/prisma.config.ts ./prisma.config.ts
COPY --from=build --chown=app:app /app/apps/api/package.json ./package.json
COPY --chown=app:app apps/api/docker-entrypoint.sh ./docker-entrypoint.sh

RUN chmod +x ./docker-entrypoint.sh
USER app

EXPOSE 3000
ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "dist/main"]
