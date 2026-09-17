#!/usr/bin/env bash
# Redeploy the customer app to Vercel (https://app-cral.vercel.app).
#
# This is a SECOND, independent deployment of apps/customer - the primary
# one is still cral.co.ke on the VPS (see ~/redeploy.sh there, and
# CLAUDE.md's Vercel section for why this one exists and how it's wired).
# Nothing else moves here: the API stays on the VPS at api.cral.co.ke: this
# script ships a new customer build.
#
# Run from anywhere; it cds to the repo root itself.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/../.."

echo "[1/3] build (VITE_API_URL/VITE_MERCHANT_APP_URL match production)"
VITE_API_URL=https://api.cral.co.ke \
VITE_MERCHANT_APP_URL=https://merchant.cral.co.ke \
  npm run build -w apps/customer

echo "[2/3] carry the SPA rewrite rule into the build output"
# vercel.json in apps/customer/ is the source of truth (committed); this
# copies it into dist/ because Vercel reads project config from the
# directory it's told to deploy, and this script deploys dist/ directly
# via `vercel deploy` rather than letting Vercel build from source - see
# the CLAUDE.md comment on why (npm workspaces + no GitHub integration
# made a source-based Vercel build unreliable to set up).
cp apps/customer/vercel.json apps/customer/dist/vercel.json

echo "[3/3] deploy"
# Needs `vercel login` once per machine (interactive OAuth device flow -
# nothing here can complete that for you). Project link lives only in
# .vercel/project.json inside dist/, which this script writes fresh every
# run because dist/ itself is rebuilt (and gitignored) every time.
mkdir -p apps/customer/dist/.vercel
cat > apps/customer/dist/.vercel/project.json <<'EOF'
{"projectId":"prj_0HewJXaHDpHnRlIBOfc8mWqREsmh","orgId":"team_7B9AQ38eJuRMqEEXN8PSwcBG","projectName":"app-cral"}
EOF

(cd apps/customer/dist && vercel deploy --prod --yes --scope evanswanjaus-projects)

echo "OK - deployed to https://app-cral.vercel.app"
