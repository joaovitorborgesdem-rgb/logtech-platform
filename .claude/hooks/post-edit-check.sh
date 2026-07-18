#!/usr/bin/env bash
# PostToolUse hook (Edit|Write|MultiEdit): runs lint+test after edits that
# touch backend/frontend source or Prisma schema files, and feeds the
# result back to Claude so it can suggest (not create) a commit.
set -uo pipefail

payload="$(cat)"
file_path="$(printf '%s' "$payload" | jq -r '.tool_input.file_path // empty')"

[ -z "$file_path" ] && exit 0

case "$file_path" in
  apps/*/src/*|apps/*/prisma/*|*/apps/*/src/*|*/apps/*/prisma/*) ;;
  *) exit 0 ;;
esac

repo_root="$(git rev-parse --show-toplevel 2>/dev/null)" || exit 0
cd "$repo_root" || exit 0

lint_output="$(pnpm lint 2>&1)"
lint_status=$?
if [ "$lint_status" -ne 0 ]; then
  ctx="Lint failed after editing ${file_path}. Fix the issues below before committing:

$(printf '%s' "$lint_output" | tail -n 60)"
  jq -n --arg ctx "$ctx" '{hookSpecificOutput:{hookEventName:"PostToolUse",additionalContext:$ctx}}'
  exit 0
fi

test_output="$(pnpm test 2>&1)"
test_status=$?
if [ "$test_status" -ne 0 ]; then
  ctx="Tests failed after editing ${file_path} (lint passed). Fix the failures below before committing:

$(printf '%s' "$test_output" | tail -n 60)"
  jq -n --arg ctx "$ctx" '{hookSpecificOutput:{hookEventName:"PostToolUse",additionalContext:$ctx}}'
  exit 0
fi

ctx="Lint and tests passed after editing ${file_path}. Suggest a commit message to the user now, following this repo's existing git log style (short imperative English summary, e.g. 'Add Carrier and Client Prisma models'). Do not create the commit yourself unless the user confirms."
jq -n --arg ctx "$ctx" '{hookSpecificOutput:{hookEventName:"PostToolUse",additionalContext:$ctx}}'
exit 0
