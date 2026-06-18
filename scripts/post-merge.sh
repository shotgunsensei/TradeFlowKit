#!/bin/bash
set -e

# Keep this fast: skip the slow audit/funding passes. Stdin is closed during
# post-merge, so everything here must be non-interactive.
npm install --no-audit --no-fund --prefer-offline

# Apply any schema changes non-interactively (--force skips confirmation prompts).
npm run db:push -- --force
