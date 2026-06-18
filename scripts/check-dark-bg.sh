#!/usr/bin/env bash
# check-dark-bg.sh
#
# Fails if any file under client/src/ uses a bare dark:bg-gray-9xx Tailwind
# class without an opacity modifier (e.g. /30).  Those bare classes bypass the
# CSS-variable navy theme and cause inconsistent dark-mode backgrounds.
#
# ALLOWED  — opacity-tinted badge contexts:  dark:bg-gray-900/30
# DISALLOWED — solid overrides:              dark:bg-gray-900   dark:bg-gray-950
#
# Run locally:  bash scripts/check-dark-bg.sh
# CI:           .github/workflows/dark-mode-check.yml

set -euo pipefail

SEARCH_DIR="client/src"
# Match dark:bg-gray-9xx NOT immediately followed by /
# Uses Perl-compatible lookahead (-P) available in GNU grep (Linux / GitHub Actions).
PATTERN='dark:bg-gray-9[0-9]{2}(?!/)'

echo "Scanning ${SEARCH_DIR} for bare dark:bg-gray-9xx classes…"

matches=$(grep -rPn "$PATTERN" \
  --include="*.tsx" \
  --include="*.ts" \
  --include="*.css" \
  "$SEARCH_DIR" || true)

if [ -n "$matches" ]; then
  echo ""
  echo "ERROR: Bare dark:bg-gray-9xx class(es) found — these bypass the CSS-variable"
  echo "       navy theme.  Use semantic dark-mode utilities instead:"
  echo "         dark:bg-background  dark:bg-card  dark:bg-muted  dark:bg-sidebar"
  echo "       Opacity-tinted variants like dark:bg-gray-900/30 remain allowed for"
  echo "       badge/chip contexts only."
  echo ""
  echo "$matches"
  echo ""
  exit 1
fi

echo "OK — no bare dark:bg-gray-9xx classes found in ${SEARCH_DIR}/"
