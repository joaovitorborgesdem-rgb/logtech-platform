#!/bin/sh
set -e

# Migrações automatizadas no deploy (Fase 15) — `migrate deploy` aplica as
# migrations pendentes sequencialmente contra o banco de produção, sem
# precisar de shadow database (diferente de `migrate dev`, ver ADR-014).
# Roda em todo boot do container; é idempotente (não faz nada se já estiver
# tudo aplicado).
./node_modules/.bin/prisma migrate deploy

exec "$@"
