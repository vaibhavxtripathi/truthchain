#!/usr/bin/env bash
set -e
GREEN='\033[0;32m'; CYAN='\033[0;36m'; NC='\033[0m'
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
gh repo create truthchain --public \
  --description "TruthChain — Stake XLM on statements you believe are true. Built on Stellar Soroban." \
  --source "${ROOT}" --remote origin --push
CONTRACT_ID=$(grep VITE_CONTRACT_ID "${ROOT}/frontend/.env" | cut -d= -f2)
XLM_TOKEN=$(grep VITE_XLM_TOKEN "${ROOT}/frontend/.env" | cut -d= -f2)
USER=$(gh api user -q .login)
gh secret set VITE_CONTRACT_ID --body "${CONTRACT_ID}" --repo "${USER}/truthchain"
gh secret set VITE_XLM_TOKEN   --body "${XLM_TOKEN}"   --repo "${USER}/truthchain"
cd "${ROOT}/frontend" && vercel --prod --yes
echo -e "${GREEN}✓ TruthChain published!${NC}"
