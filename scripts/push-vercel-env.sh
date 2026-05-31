#!/usr/bin/env bash
# Push every non-empty var in .env.local to Vercel for production + preview.
# Idempotent: removes existing var first, then re-adds. Safe to re-run.
set -euo pipefail

ENV_FILE=".env.local"
[ -f "$ENV_FILE" ] || { echo "$ENV_FILE not found"; exit 1; }

while IFS='=' read -r key value || [ -n "$key" ]; do
  # skip blanks and comments
  [[ -z "$key" || "$key" =~ ^# ]] && continue
  # strip surrounding whitespace + quotes from value
  value=$(echo "$value" | sed -E 's/^[[:space:]]*"?//; s/"?[[:space:]]*$//')
  [ -z "$value" ] && { echo "  ⏭️  $key (empty, skipping)"; continue; }

  for env in production preview development; do
    # remove if exists (ignore failure)
    pnpm dlx vercel env rm "$key" "$env" --yes >/dev/null 2>&1 || true
    # add (stdin)
    printf '%s' "$value" | pnpm dlx vercel env add "$key" "$env" >/dev/null 2>&1
  done
  echo "  ✓ $key (all envs)"
done < "$ENV_FILE"

echo ""
echo "Done. Verify with: pnpm dlx vercel env ls"
