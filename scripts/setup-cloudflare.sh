#!/usr/bin/env bash
# setup-cloudflare.sh — Provision all Cloudflare resources for arcpedia.
#
# Prerequisites:
#   - CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID set as env vars
#     (or run `npx wrangler login` for interactive auth)
#   - Node.js + pnpm installed (wrangler runs via npx)
#
# Usage:
#   ./scripts/setup-cloudflare.sh
#
# The script is idempotent — safe to re-run. Resources that already exist
# will be skipped. After provisioning, wrangler.toml is updated with the
# actual resource IDs.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
WRANGLER="npx --yes wrangler"
WRANGLER_TOML="$PROJECT_ROOT/wrangler.toml"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

info()  { echo -e "${BLUE}ℹ${NC}  $*"; }
ok()    { echo -e "${GREEN}✓${NC}  $*"; }
warn()  { echo -e "${YELLOW}⚠${NC}  $*"; }
fail()  { echo -e "${RED}✗${NC}  $*"; exit 1; }

extract_kv_id_from_create_output() {
  sed -n 's/.*id = "\([^"]*\)".*/\1/p' | head -n 1
}

lookup_kv_id() {
  local title="$1"
  local output

  output=$($WRANGLER kv namespace list 2>/dev/null) || return 0
  printf '%s' "$output" | node -e '
const title = process.argv[1];
let input = "";
process.stdin.on("data", chunk => { input += chunk; });
process.stdin.on("end", () => {
  const start = input.indexOf("[");
  const end = input.lastIndexOf("]");
  if (start === -1 || end === -1 || end < start) process.exit(0);
  const namespaces = JSON.parse(input.slice(start, end + 1));
  const namespace = namespaces.find(item => item.title === title);
  if (namespace?.id) console.log(namespace.id);
});
' "$title"
}

create_kv_namespace() {
  local title="$1"
  KV_RESULT_ID=""

  info "Creating KV namespace: $title ..."

  local existing_id
  existing_id="$(lookup_kv_id "$title" || true)"
  if [[ -n "$existing_id" ]]; then
    KV_RESULT_ID="$existing_id"
    ok "KV namespace $title already exists: $KV_RESULT_ID"
    echo ""
    return
  fi

  local output
  output=$($WRANGLER kv namespace create "$title" 2>&1) || true
  echo "$output"

  KV_RESULT_ID="$(echo "$output" | extract_kv_id_from_create_output || true)"
  if [[ -n "$KV_RESULT_ID" ]]; then
    ok "KV namespace $title created: $KV_RESULT_ID"
  elif echo "$output" | grep -qi "already exists"; then
    KV_RESULT_ID="$(lookup_kv_id "$title" || true)"
    if [[ -n "$KV_RESULT_ID" ]]; then
      ok "KV namespace $title already exists: $KV_RESULT_ID"
    else
      warn "KV namespace $title already exists, but its ID could not be found."
      info "Run 'npx wrangler kv namespace list' to find the ID."
    fi
  else
    warn "Could not extract KV namespace ID for $title from output."
    info "Run 'npx wrangler kv namespace list' to find the ID."
  fi
  echo ""
}

# ---------- Pre-flight checks ----------

if ! command -v npx &>/dev/null; then
  fail "npx not found. Install Node.js (v18+) first."
fi

# Verify wrangler auth — either token-based or interactive login
if [[ -z "${CLOUDFLARE_API_TOKEN:-}" ]]; then
  warn "CLOUDFLARE_API_TOKEN not set — will rely on 'wrangler login' session."
fi

if [[ -z "${CLOUDFLARE_ACCOUNT_ID:-}" ]]; then
  warn "CLOUDFLARE_ACCOUNT_ID not set — wrangler will prompt or use default account."
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  ARCpedia — Cloudflare Infrastructure Setup"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# ---------- 1. R2 Bucket ----------

info "Creating R2 bucket: arcpedia-raw ..."
if $WRANGLER r2 bucket create arcpedia-raw 2>&1 | tee /tmp/arcpedia-r2.log; then
  ok "R2 bucket 'arcpedia-raw' created."
else
  if grep -qi "already exists\|already been taken" /tmp/arcpedia-r2.log; then
    ok "R2 bucket 'arcpedia-raw' already exists — skipping."
  else
    fail "Failed to create R2 bucket. See output above."
  fi
fi
echo ""

# ---------- 2. KV Namespaces ----------

KV_CONFIG_ID=""
KV_SEARCH_ID=""

create_kv_namespace "ARCPEDIA_CONFIG"
KV_CONFIG_ID="$KV_RESULT_ID"

create_kv_namespace "ARCPEDIA_SEARCH"
KV_SEARCH_ID="$KV_RESULT_ID"

# ---------- 3. Vectorize Index ----------

info "Creating Vectorize index: arcpedia-embeddings ..."
if $WRANGLER vectorize create arcpedia-embeddings --dimensions 1536 --metric cosine 2>&1 | tee /tmp/arcpedia-vec.log; then
  ok "Vectorize index 'arcpedia-embeddings' created."
else
  if grep -qi "already exists" /tmp/arcpedia-vec.log; then
    ok "Vectorize index 'arcpedia-embeddings' already exists — skipping."
  else
    fail "Failed to create Vectorize index. See output above."
  fi
fi
echo ""

# ---------- 4. Pages Project ----------

info "Creating Pages project: arcpedia ..."
if $WRANGLER pages project create arcpedia --production-branch main 2>&1 | tee /tmp/arcpedia-pages.log; then
  ok "Pages project 'arcpedia' created."
else
  if grep -qi "already exists\|A project with this name already exists" /tmp/arcpedia-pages.log; then
    ok "Pages project 'arcpedia' already exists — skipping."
  else
    fail "Failed to create Pages project. See output above."
  fi
fi
echo ""

# ---------- 5. Update wrangler.toml ----------

info "Updating wrangler.toml with resource IDs ..."

# Use placeholder if we couldn't extract the ID
CONFIG_ID="${KV_CONFIG_ID:-<ARCPEDIA_CONFIG_NAMESPACE_ID>}"
SEARCH_ID="${KV_SEARCH_ID:-<ARCPEDIA_SEARCH_NAMESPACE_ID>}"

cat > "$WRANGLER_TOML" <<EOF
# arcpedia — Cloudflare deployment config
# Generated by scripts/setup-cloudflare.sh
#
# After provisioning, verify IDs match your account:
#   npx wrangler kv namespace list
#   npx wrangler r2 bucket list
#   npx wrangler vectorize list

name = "arcpedia"
compatibility_date = "2025-01-01"
pages_build_output_dir = ".output/public"

# --- R2: Primary storage (wiki markdown files) ---
[[r2_buckets]]
binding = "R2"
bucket_name = "arcpedia-raw"

# --- KV: Config and metadata cache ---
[[kv_namespaces]]
binding = "ARCPEDIA_CONFIG"
id = "$CONFIG_ID"

# --- KV: Search index (BM25 tokens, derived data) ---
[[kv_namespaces]]
binding = "ARCPEDIA_SEARCH"
id = "$SEARCH_ID"

# --- Vectorize: Semantic search embeddings ---
[[vectorize]]
binding = "VECTORIZE"
index_name = "arcpedia-embeddings"
EOF

ok "wrangler.toml written to $WRANGLER_TOML"

if [[ "$CONFIG_ID" == *"<"* ]] || [[ "$SEARCH_ID" == *"<"* ]]; then
  echo ""
  warn "Some KV namespace IDs could not be auto-detected."
  warn "Edit wrangler.toml manually with IDs from:"
  info "  npx wrangler kv namespace list"
fi

# ---------- Summary ----------

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  📋 Provisioning Summary"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "  R2 bucket:       arcpedia-raw"
echo "  KV (config):     ARCPEDIA_CONFIG  → $CONFIG_ID"
echo "  KV (search):     ARCPEDIA_SEARCH  → $SEARCH_ID"
echo "  Vectorize:       arcpedia-embeddings (1536d, cosine)"
echo "  Pages project:   arcpedia"
echo ""
echo "  wrangler.toml:   $WRANGLER_TOML"
echo ""
info "Next steps:"
echo "  1. Verify IDs:   npx wrangler kv namespace list"
echo "  2. Local dev:    npx wrangler dev"
echo "  3. Deploy:       pnpm build && npx wrangler pages deploy .output/public --project-name arcpedia"
echo ""
