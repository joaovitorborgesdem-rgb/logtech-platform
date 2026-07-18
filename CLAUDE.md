# LogiSense — instruções para Claude Code

Plataforma SaaS multi-tenant de inteligência logística. Monorepo pnpm + turbo (`apps/api` NestJS + Prisma 7, `apps/web` Next.js). Ver `TASKS.md` para o roadmap de fases.

## Hooks configurados

### PostToolUse — lint + test automático (`.claude/settings.json`)

Depois de qualquer `Edit`/`Write`/`MultiEdit` em um arquivo sob `apps/*/src/**` ou `apps/*/prisma/**`, o hook `.claude/hooks/post-edit-check.sh` roda automaticamente:

1. `pnpm lint` (turbo, todos os workspaces)
2. Se o lint passar, `pnpm test` (turbo, todos os workspaces)
3. Se ambos passarem, o resultado é devolvido a Claude como contexto adicional pedindo para **sugerir** uma mensagem de commit no estilo já usado no `git log` (resumo curto, imperativo, em inglês — ex.: "Add Carrier and Client Prisma models"). O hook nunca cria o commit sozinho; a sugestão só é feita para o usuário confirmar.
4. Se lint ou test falharem, o hook devolve a saída relevante (últimas ~60 linhas) para Claude corrigir antes de sugerir qualquer commit.

Edições fora dos caminhos de código-fonte (docs, config, etc.) não disparam o hook.
