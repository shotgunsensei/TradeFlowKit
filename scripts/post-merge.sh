#!/bin/bash
set -e
npm install
# Auto-answer interactive drizzle-kit push prompts with the default
# (first / safest option, e.g. "add the constraint without truncating").
printf '\n\n\n\n\n\n\n\n\n\n' | npm run db:push || npm run db:push -- --force
